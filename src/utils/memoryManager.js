/**
 * Lightweight scheduled memory cleaner
 * - No longer based on memory usage/threshold judgment (avoids frequent scans and GC jitter)
 * - Only triggers cleanup callbacks for each module at time intervals (object pool trimming, cache cleanup, etc.)
 * @module utils/memoryManager
 */

import logger from './logger.js';

// Maximum object pool size (fixed value, no longer changes dynamically with "pressure")
const POOL_SIZES = { chunk: 30, toolCall: 15, lineBuffer: 5 };

class MemoryManager {
  constructor() {
    /** @type {Set<Function>} */
    this.cleanupCallbacks = new Set();
    /** @type {NodeJS.Timeout|null} */
    this.timer = null;
    /** @type {number} */
    this.cleanupIntervalMs = 30 * 60 * 1000;
    this.isShuttingDown = false;
  }

  /**
   * Start scheduled cleanup
   * @param {number} cleanupIntervalMs - Cleanup interval (milliseconds)
   */
  start(cleanupIntervalMs = 30 * 60 * 1000) {
    if (this.timer) return;
    this.setCleanupInterval(cleanupIntervalMs);
    this.isShuttingDown = false;
    logger.info(`Memory cleaner started (interval: ${Math.round(this.cleanupIntervalMs / 1000)}s)`);
  }

  /**
   * Dynamically adjust cleanup interval (hot update)
   * @param {number} cleanupIntervalMs
   */
  setCleanupInterval(cleanupIntervalMs) {
    if (Number.isFinite(cleanupIntervalMs) && cleanupIntervalMs > 0) {
      this.cleanupIntervalMs = Math.floor(cleanupIntervalMs);
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.timer = setInterval(() => {
      if (!this.isShuttingDown) this.cleanup('timer');
    }, this.cleanupIntervalMs);

    this.timer.unref?.();
  }

  /**
   * Stop scheduled cleanup
   */
  stop() {
    this.isShuttingDown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.cleanupCallbacks.clear();
    logger.info('Memory cleaner stopped');
  }

  /**
   * Register cleanup callback
   * @param {(reason: string) => void} callback
   */
  registerCleanup(callback) {
    this.cleanupCallbacks.add(callback);
  }

  /**
   * Unregister cleanup callback
   * @param {Function} callback
   */
  unregisterCleanup(callback) {
    this.cleanupCallbacks.delete(callback);
  }

  /**
   * Trigger cleanup once
   * @param {string} reason
   */
  cleanup(reason = 'manual') {
    for (const callback of this.cleanupCallbacks) {
      try {
        callback(reason);
      } catch (error) {
        logger.error('Cleanup callback execution failed:', error.message);
      }
    }
  }

  /**
   * Get object pool size configuration
   */
  getPoolSizes() {
    return POOL_SIZES;
  }
}

const memoryManager = new MemoryManager();
export default memoryManager;

// Unified wrapper: register object pool trimming (executed when scheduled cleanup is triggered)
export function registerMemoryPoolCleanup(pool, getMaxSize) {
  memoryManager.registerCleanup(() => {
    const maxSize = getMaxSize();
    while (pool.length > maxSize) pool.pop();
  });
}
