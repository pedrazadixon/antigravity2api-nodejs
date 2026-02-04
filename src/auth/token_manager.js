import axios from 'axios';
import { log } from '../utils/logger.js';
import { generateSessionId, generateProjectId, generateTokenId } from '../utils/idGenerator.js';
import config, { getConfigJson } from '../config/config.js';
import { OAUTH_CONFIG } from '../constants/oauth.js';
import { buildAxiosRequestConfig } from '../utils/httpClient.js';
import {
  DEFAULT_REQUEST_COUNT_PER_TOKEN,
  TOKEN_REFRESH_BUFFER
} from '../constants/index.js';
import TokenStore from './token_store.js';
import { TokenError } from '../utils/errors.js';
import quotaManager from './quota_manager.js';
import tokenCooldownManager from './token_cooldown_manager.js';

// Rotation strategy enumeration
const RotationStrategy = {
  ROUND_ROBIN: 'round_robin',           // Balanced load: switch on each request
  QUOTA_EXHAUSTED: 'quota_exhausted',   // Switch only when quota exhausted
  REQUEST_COUNT: 'request_count'        // Switch after custom request count
};

/**
 * Token Manager
 * Responsible for token storage, rotation, refresh, and other functions
 */
class TokenManager {
  /**
   * @param {string} filePath - Token data file path
   */
  constructor(filePath) {
    this.store = new TokenStore(filePath);
    /** @type {Array<Object>} */
    this.tokens = [];
    /** @type {number} */
    this.currentIndex = 0;

    // Rotation strategy related - use atomic operations to avoid locks
    /** @type {string} */
    this.rotationStrategy = RotationStrategy.ROUND_ROBIN;
    /** @type {number} */
    this.requestCountPerToken = DEFAULT_REQUEST_COUNT_PER_TOKEN;
    /** @type {Map<string, number>} */
    this.tokenRequestCounts = new Map();

    // Available token index cache for quota exhausted strategy (optimized for large-scale account scenarios)
    /** @type {number[]} */
    this.availableQuotaTokenIndices = [];
    /** @type {number} */
    this.currentQuotaIndex = 0;

    /** @type {Promise<void>|null} */
    this._initPromise = null;
  }

  async _initialize() {
    try {
      log.info('Initializing token manager...');
      const tokenArray = await this.store.readAll();

      this.tokens = tokenArray.filter(token => token.enable !== false).map(token => ({
        ...token,
        sessionId: generateSessionId()
      }));

      this.currentIndex = 0;
      this.tokenRequestCounts.clear();
      this._rebuildAvailableQuotaTokens();

      // Load rotation strategy configuration
      this.loadRotationConfig();

      if (this.tokens.length === 0) {
        log.warn('⚠ No available accounts, please add using one of the following methods:');
        log.warn('  Method 1: Run npm run login command to login');
        log.warn('  Method 2: Access frontend management page to add accounts');
      } else {
        log.info(`Successfully loaded ${this.tokens.length} available tokens`);
        if (this.rotationStrategy === RotationStrategy.REQUEST_COUNT) {
          log.info(`Rotation strategy: ${this.rotationStrategy}, switch after ${this.requestCountPerToken} requests per token`);
        } else {
          log.info(`Rotation strategy: ${this.rotationStrategy}`);
        }

        // Concurrently refresh all expired tokens
        await this._refreshExpiredTokensConcurrently();
      }
    } catch (error) {
      log.error('Token initialization failed:', error.message);
      this.tokens = [];
    }
  }

  /**
   * Concurrently refresh all expired tokens
   * @private
   */
  async _refreshExpiredTokensConcurrently() {
    const expiredTokens = this.tokens.filter(token => this.isExpired(token));
    if (expiredTokens.length === 0) {
      return;
    }

    // Get salt for generating tokenId
    const salt = await this.store.getSalt();
    const tokenIds = expiredTokens.map(token => generateTokenId(token.refresh_token, salt));

    log.info(`Batch refreshing ${tokenIds.length} tokens: ${tokenIds.join(', ')}`);
    const startTime = Date.now();

    const results = await Promise.allSettled(
      expiredTokens.map(token => this._refreshTokenSafe(token))
    );

    let successCount = 0;
    let failCount = 0;
    const tokensToDisable = [];
    const failedTokenIds = [];

    results.forEach((result, index) => {
      const token = expiredTokens[index];
      const tokenId = tokenIds[index];
      if (result.status === 'fulfilled') {
        if (result.value === 'success') {
          successCount++;
        } else if (result.value === 'disable') {
          tokensToDisable.push(token);
          failCount++;
          failedTokenIds.push(tokenId);
        }
      } else {
        failCount++;
        failedTokenIds.push(tokenId);
      }
    });

    // Batch disable failed tokens
    for (const token of tokensToDisable) {
      this.disableToken(token);
    }

    const elapsed = Date.now() - startTime;
    if (failCount > 0) {
      log.warn(`Refresh completed: success ${successCount}, failed ${failCount} (${failedTokenIds.join(', ')}), elapsed ${elapsed}ms`);
    } else {
      log.info(`Refresh completed: success ${successCount}, elapsed ${elapsed}ms`);
    }
  }

  /**
   * Safely refresh a single token (does not throw exceptions)
   * @param {Object} token - Token object
   * @returns {Promise<'success'|'disable'|'skip'>} Refresh result
   * @private
   */
  async _refreshTokenSafe(token) {
    try {
      // Use silent mode during concurrent refresh to avoid duplicate logging
      await this.refreshToken(token, true);
      return 'success';
    } catch (error) {
      if (error.statusCode === 403 || error.statusCode === 400) {
        return 'disable';
      }
      throw error;
    }
  }

  async _ensureInitialized() {
    if (!this._initPromise) {
      this._initPromise = this._initialize();
    }
    return this._initPromise;
  }

  // Load rotation strategy configuration
  loadRotationConfig() {
    try {
      const jsonConfig = getConfigJson();
      if (jsonConfig.rotation) {
        this.rotationStrategy = jsonConfig.rotation.strategy || RotationStrategy.ROUND_ROBIN;
        this.requestCountPerToken = jsonConfig.rotation.requestCount || 10;
      }
    } catch (error) {
      log.warn('Failed to load rotation config, using default values:', error.message);
    }
  }

  // Update rotation strategy (hot reload)
  updateRotationConfig(strategy, requestCount) {
    if (strategy && Object.values(RotationStrategy).includes(strategy)) {
      this.rotationStrategy = strategy;
    }
    if (requestCount && requestCount > 0) {
      this.requestCountPerToken = requestCount;
    }
    // Reset counters
    this.tokenRequestCounts.clear();
    if (this.rotationStrategy === RotationStrategy.REQUEST_COUNT) {
      log.info(`Rotation strategy updated: ${this.rotationStrategy}, switch after ${this.requestCountPerToken} requests per token`);
    } else {
      log.info(`Rotation strategy updated: ${this.rotationStrategy}`);
    }
  }

  // Rebuild available token list for quota exhausted strategy
  _rebuildAvailableQuotaTokens() {
    this.availableQuotaTokenIndices = [];
    this.tokens.forEach((token, index) => {
      if (token.enable !== false && token.hasQuota !== false) {
        this.availableQuotaTokenIndices.push(index);
      }
    });

    if (this.availableQuotaTokenIndices.length === 0) {
      this.currentQuotaIndex = 0;
    } else {
      this.currentQuotaIndex = this.currentQuotaIndex % this.availableQuotaTokenIndices.length;
    }
  }

  // Remove specified index from available list for quota exhausted strategy
  _removeQuotaIndex(tokenIndex) {
    const pos = this.availableQuotaTokenIndices.indexOf(tokenIndex);
    if (pos !== -1) {
      this.availableQuotaTokenIndices.splice(pos, 1);
      if (this.currentQuotaIndex >= this.availableQuotaTokenIndices.length) {
        this.currentQuotaIndex = 0;
      }
    }
  }

  async fetchProjectId(token) {
    // Step 1: Try loadCodeAssist
    try {
      const projectId = await this._tryLoadCodeAssist(token);
      if (projectId) return projectId;
      log.warn('[fetchProjectId] loadCodeAssist did not return projectId, falling back to onboardUser');
    } catch (err) {
      log.warn(`[fetchProjectId] loadCodeAssist failed: ${err.message}, falling back to onboardUser`);
    }

    // Step 2: Fallback to onboardUser
    try {
      const projectId = await this._tryOnboardUser(token);
      if (projectId) return projectId;
      log.error('[fetchProjectId] Both loadCodeAssist and onboardUser failed to get projectId');
      return undefined;
    } catch (err) {
      log.error(`[fetchProjectId] onboardUser failed: ${err.message}`);
      return undefined;
    }
  }

  /**
   * Try to get projectId via loadCodeAssist
   * @param {Object} token - Token object
   * @returns {Promise<string|null>} projectId or null
   * @private
   */
  async _tryLoadCodeAssist(token) {
    const apiHost = config.api.host;
    const requestUrl = `https://${apiHost}/v1internal:loadCodeAssist`;
    const requestBody = {
      metadata: {
        ideType: 'ANTIGRAVITY',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI'
      }
    };

    log.info(`[loadCodeAssist] Request: ${requestUrl}`);
    const response = await axios(buildAxiosRequestConfig({
      method: 'POST',
      url: requestUrl,
      headers: {
        'Host': apiHost,
        'User-Agent': config.api.userAgent,
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip'
      },
      data: JSON.stringify(requestBody)
    }));

    const data = response.data;
    // log.info(`[loadCodeAssist] Response: ${JSON.stringify(data)}`); // Response might be large, not printing

    // Check if currentTier exists (indicates user is activated)
    if (data?.currentTier) {
      log.info('[loadCodeAssist] User is activated');
      const projectId = data.cloudaicompanionProject;
      if (projectId) {
        log.info(`[loadCodeAssist] Successfully retrieved projectId: ${projectId}`);
        return projectId;
      }
      log.warn('[loadCodeAssist] No projectId in response');
      return null;
    }

    log.info('[loadCodeAssist] User not activated (no currentTier)');
    return null;
  }

  /**
   * Try to get projectId via onboardUser (long-running operation, requires polling)
   * @param {Object} token - Token object
   * @returns {Promise<string|null>} projectId or null
   * @private
   */
  async _tryOnboardUser(token) {
    const apiHost = config.api.host;
    const requestUrl = `https://${apiHost}/v1internal:onboardUser`;

    // First get user's tier information
    const tierId = await this._getOnboardTier(token);
    if (!tierId) {
      log.error('[onboardUser] Unable to determine user tier');
      return null;
    }

    log.info(`[onboardUser] User tier: ${tierId}`);

    const requestBody = {
      tierId: tierId,
      metadata: {
        ideType: 'ANTIGRAVITY',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI'
      }
    };

    log.info(`[onboardUser] Request: ${requestUrl}`);

    // onboardUser is a long-running operation, requires polling
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      log.info(`[onboardUser] Polling attempt ${attempt}/${maxAttempts}`);

      const response = await axios(buildAxiosRequestConfig({
        method: 'POST',
        url: requestUrl,
        headers: {
          'Host': apiHost,
          'User-Agent': config.api.userAgent,
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip'
        },
        data: JSON.stringify(requestBody),
        timeout: 30000
      }));

      const data = response.data;
      // log.info(`[onboardUser] Response: ${JSON.stringify(data)}`); // Response might be large, not printing

      // Check if long-running operation is complete
      if (data?.done) {
        log.info('[onboardUser] Operation completed');
        const responseData = data.response || {};
        const projectObj = responseData.cloudaicompanionProject;

        let projectId = null;
        if (typeof projectObj === 'object' && projectObj !== null) {
          projectId = projectObj.id;
        } else if (typeof projectObj === 'string') {
          projectId = projectObj;
        }

        if (projectId) {
          log.info(`[onboardUser] Successfully retrieved projectId: ${projectId}`);
          return projectId;
        }
        log.warn('[onboardUser] Operation completed but no projectId in response');
        return null;
      }

      log.info('[onboardUser] Operation in progress, waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    log.error('[onboardUser] Timeout: operation did not complete within 10 seconds');
    return null;
  }

  /**
   * Get the tier that user should register from loadCodeAssist response
   * @param {Object} token - Token object
   * @returns {Promise<string|null>} tier_id or null
   * @private
   */
  async _getOnboardTier(token) {
    const apiHost = config.api.host;
    const requestUrl = `https://${apiHost}/v1internal:loadCodeAssist`;
    const requestBody = {
      metadata: {
        ideType: 'ANTIGRAVITY',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI'
      }
    };

    log.info(`[_getOnboardTier] Request: ${requestUrl}`);

    try {
      const response = await axios(buildAxiosRequestConfig({
        method: 'POST',
        url: requestUrl,
        headers: {
          'Host': apiHost,
          'User-Agent': config.api.userAgent,
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip'
        },
        data: JSON.stringify(requestBody),
        timeout: 30000
      }));

      const data = response.data;
      // log.info(`[_getOnboardTier] Response: ${JSON.stringify(data)}`); // Response might be large, not printing

      // Find default tier
      const allowedTiers = data?.allowedTiers || [];
      for (const tier of allowedTiers) {
        if (tier.isDefault) {
          log.info(`[_getOnboardTier] Found default tier: ${tier.id}`);
          return tier.id;
        }
      }

      // If no default tier, use LEGACY as fallback
      log.warn('[_getOnboardTier] No default tier found, using LEGACY');
      return 'LEGACY';
    } catch (err) {
      log.error(`[_getOnboardTier] Failed to get tier: ${err.message}`);
      return null;
    }
  }

  /**
   * Get and update projectId by tokenId
   * @param {string} tokenId - Safe token ID
   * @returns {Promise<Object>} Result containing projectId
   */
  async fetchProjectIdForToken(tokenId) {
    const tokenData = await this.findTokenById(tokenId);
    if (!tokenData) {
      throw new TokenError('Token does not exist', null, 404);
    }

    // Ensure token is not expired
    if (this.isExpired(tokenData)) {
      await this.refreshToken(tokenData);
    }

    const projectId = await this.fetchProjectId(tokenData);
    if (!projectId) {
      throw new TokenError('Unable to get projectId, account may not be eligible', null, 400);
    }

    // Update and save
    tokenData.projectId = projectId;
    tokenData.hasQuota = true;
    this.saveToFile(tokenData);

    // Synchronously update token in memory
    const memoryToken = this.tokens.find(t => t.refresh_token === tokenData.refresh_token);
    if (memoryToken) {
      memoryToken.projectId = projectId;
      memoryToken.hasQuota = true;
    }

    return { projectId };
  }

  /**
   * Check if token is expired
   * @param {Object} token - Token object
   * @returns {boolean} Whether expired
   */
  isExpired(token) {
    if (!token.timestamp || !token.expires_in) return true;
    const expiresAt = token.timestamp + (token.expires_in * 1000);
    return Date.now() >= expiresAt - TOKEN_REFRESH_BUFFER;
  }

  async refreshToken(token, silent = false) {
    // Get tokenId for logging
    const salt = await this.store.getSalt();
    const tokenId = generateTokenId(token.refresh_token, salt);
    if (!silent) {
      log.info(`Refreshing token: ${tokenId}`);
    }

    const body = new URLSearchParams({
      client_id: OAUTH_CONFIG.CLIENT_ID,
      client_secret: OAUTH_CONFIG.CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token
    });

    try {
      const response = await axios(buildAxiosRequestConfig({
        method: 'POST',
        url: OAUTH_CONFIG.TOKEN_URL,
        headers: {
          'Host': 'oauth2.googleapis.com',
          'User-Agent': 'Go-http-client/1.1',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept-Encoding': 'gzip'
        },
        data: body.toString()
      }));

      token.access_token = response.data.access_token;
      token.expires_in = response.data.expires_in;
      token.timestamp = Date.now();
      this.saveToFile(token);
      return token;
    } catch (error) {
      const statusCode = error.response?.status;
      const rawBody = error.response?.data;
      const message = typeof rawBody === 'string' ? rawBody : (rawBody?.error?.message || error.message || 'Token refresh failed');
      throw new TokenError(message, tokenId, statusCode || 500);
    }
  }

  saveToFile(tokenToUpdate = null) {
    // Maintain consistency with old synchronous interface, use async write internally
    this.store.mergeActiveTokens(this.tokens, tokenToUpdate).catch((error) => {
      log.error('Failed to save account configuration file:', error.message);
    });
  }

  disableToken(token) {
    log.warn(`Disabling token ...${token.access_token.slice(-8)}`)
    token.enable = false;
    this.saveToFile();
    // Clean up request count for this token (avoid memory leak)
    this.tokenRequestCounts.delete(token.refresh_token);
    this.tokens = this.tokens.filter(t => t.refresh_token !== token.refresh_token);
    this.currentIndex = this.currentIndex % Math.max(this.tokens.length, 1);
    // Rebuild available list for quota exhausted strategy when tokens structure changes
    this._rebuildAvailableQuotaTokens();
  }

  // Atomic operation: get and increment request count
  incrementRequestCount(tokenKey) {
    const current = this.tokenRequestCounts.get(tokenKey) || 0;
    const newCount = current + 1;
    this.tokenRequestCounts.set(tokenKey, newCount);
    return newCount;
  }

  // Atomic operation: reset request count
  resetRequestCount(tokenKey) {
    this.tokenRequestCounts.set(tokenKey, 0);
  }


  // Mark token quota as exhausted
  markQuotaExhausted(token) {
    token.hasQuota = false;
    this.saveToFile(token);
    log.warn(`...${token.access_token.slice(-8)}: Quota exhausted, marked as no quota`);

    if (this.rotationStrategy === RotationStrategy.QUOTA_EXHAUSTED) {
      const tokenIndex = this.tokens.findIndex(t => t.refresh_token === token.refresh_token);
      if (tokenIndex !== -1) {
        this._removeQuotaIndex(tokenIndex);
      }
      this.currentIndex = (this.currentIndex + 1) % Math.max(this.tokens.length, 1);
    }
  }

  // Restore token quota (used after quota reset)
  restoreQuota(token) {
    token.hasQuota = true;
    this.saveToFile(token);
    log.info(`...${token.access_token.slice(-8)}: Quota restored`);
  }

  /**
   * Record a request (for quota estimation)
   * @param {Object} token - Token object
   * @param {string} modelId - Model ID used
   */
  async recordRequest(token, modelId) {
    if (!token || !modelId) return;

    try {
      const salt = await this.store.getSalt();
      const tokenId = generateTokenId(token.refresh_token, salt);
      quotaManager.recordRequest(tokenId, modelId);
    } catch (error) {
      // Recording failure does not affect request
      log.warn('Failed to record request count:', error.message);
    }
  }

  /**
   * Prepare a single token (refresh + get projectId)
   * @param {Object} token - Token object
   * @returns {Promise<'ready'|'skip'|'disable'>} Processing result
   * @private
   */
  async _prepareToken(token) {
    // Refresh expired token
    if (this.isExpired(token)) {
      await this.refreshToken(token);
    }

    // Get projectId
    if (!token.projectId) {
      if (config.skipProjectIdFetch) {
        token.projectId = generateProjectId();
        this.saveToFile(token);
        log.info(`...${token.access_token.slice(-8)}: Using randomly generated projectId: ${token.projectId}`);
      } else {
        const projectId = await this.fetchProjectId(token);
        if (projectId === undefined) {
          log.warn(`...${token.access_token.slice(-8)}: Not eligible to get projectId, disabling account`);
          return 'disable';
        }
        token.projectId = projectId;
        this.saveToFile(token);
      }
    }

    return 'ready';
  }

  /**
   * Handle errors during token preparation
   * @param {Error} error - Error object
   * @param {Object} token - Token object
   * @returns {'disable'|'skip'} Processing result
   * @private
   */
  _handleTokenError(error, token) {
    const suffix = token.access_token?.slice(-8) || 'unknown';
    if (error.statusCode === 403 || error.statusCode === 400) {
      log.warn(`...${suffix}: Token is invalid or error, account automatically disabled`);
      return 'disable';
    }
    log.error(`...${suffix} Operation failed:`, error.message);
    return 'skip';
  }

  /**
   * Reset quota status for all tokens
   * @private
   */
  _resetAllQuotas() {
    log.warn('All token quotas exhausted, resetting quota status');
    this.tokens.forEach(t => {
      t.hasQuota = true;
    });
    this.saveToFile();
    this._rebuildAvailableQuotaTokens();
  }

  /**
   * Check if all tokens are unavailable for specified model (quota is 0 or in cooldown)
   * @param {string} modelId - Model ID
   * @returns {boolean} true = all tokens are unavailable for this model
   * @private
   */
  _checkAllTokensExhaustedForModel(modelId) {
    if (!modelId || this.tokens.length === 0) return false;

    for (const token of this.tokens) {
      if (this._canUseTokenForModel(token, modelId)) {
        return false; // At least one token is available
      }
    }
    return true; // All tokens are unavailable
  }

  /**
   * Check if token has quota for specified model
   * @param {Object} token - Token object
   * @param {string} modelId - Model ID
   * @returns {boolean} true = has quota or no data, false = quota is 0
   * @private
   */
  _hasQuotaForModel(token, modelId) {
    if (!token || !modelId) return true;

    try {
      const salt = this.store._salt; // Get salt synchronously
      if (!salt) return true; // No salt, assume has quota

      const tokenId = generateTokenId(token.refresh_token, salt);
      return quotaManager.hasQuotaForModel(tokenId, modelId);
    } catch (error) {
      // Assume has quota on error
      return true;
    }
  }

  /**
   * Check if token is in cooldown for specified model
   * @param {Object} token - Token object
   * @param {string} modelId - Model ID
   * @returns {boolean} true = available (not in cooldown), false = in cooldown
   * @private
   */
  _isTokenAvailableForModel(token, modelId) {
    if (!token || !modelId) return true;

    try {
      const salt = this.store._salt;
      if (!salt) return true;

      const tokenId = generateTokenId(token.refresh_token, salt);
      return tokenCooldownManager.isAvailable(tokenId, modelId);
    } catch (error) {
      return true;
    }
  }

  /**
   * Check if token is available for specified model (both has quota and not in cooldown)
   * @param {Object} token - Token object
   * @param {string} modelId - Model ID
   * @returns {boolean} true = available, false = unavailable
   * @private
   */
  _canUseTokenForModel(token, modelId) {
    if (!token || !modelId) return true;

    // Check cooldown status first (more strict restriction)
    if (!this._isTokenAvailableForModel(token, modelId)) {
      return false;
    }

    // Then check quota
    return this._hasQuotaForModel(token, modelId);
  }

  /**
   * Get an available token
   * @param {string} [modelId] - Optional, requested model ID, used to check quota for this model
   * @returns {Promise<Object|null>} token object
   */
  async getToken(modelId = null) {
    await this._ensureInitialized();
    if (this.tokens.length === 0) return null;

    // Separate high-performance handling for quota exhausted strategy
    if (this.rotationStrategy === RotationStrategy.QUOTA_EXHAUSTED) {
      return this._getTokenForQuotaExhaustedStrategy(modelId);
    }

    return this._getTokenForDefaultStrategy(modelId);
  }

  /**
   * Token retrieval for quota exhausted strategy
   * @param {string} [modelId] - Requested model ID
   * @private
   */
  async _getTokenForQuotaExhaustedStrategy(modelId = null) {
    // If no available tokens currently, try to reset quota
    if (this.availableQuotaTokenIndices.length === 0) {
      this._resetAllQuotas();
    }

    const totalAvailable = this.availableQuotaTokenIndices.length;
    if (totalAvailable === 0) {
      return null;
    }

    // If modelId is provided, first check if all tokens have 0 quota for this model
    let allTokensExhausted = false;
    if (modelId) {
      allTokensExhausted = this._checkAllTokensExhaustedForModel(modelId);
    }

    const startIndex = this.currentQuotaIndex % totalAvailable;

    for (let i = 0; i < totalAvailable; i++) {
      const listIndex = (startIndex + i) % totalAvailable;
      const tokenIndex = this.availableQuotaTokenIndices[listIndex];
      const token = this.tokens[tokenIndex];

      // If modelId is provided and not all tokens are exhausted, check if this token is available for this model
      if (modelId && !allTokensExhausted) {
        if (!this._canUseTokenForModel(token, modelId)) {
          // This token is unavailable for this model (quota is 0 or in cooldown), skip
          continue;
        }
      }

      try {
        const result = await this._prepareToken(token);
        if (result === 'disable') {
          this.disableToken(token);
          this._rebuildAvailableQuotaTokens();
          if (this.tokens.length === 0 || this.availableQuotaTokenIndices.length === 0) {
            return null;
          }
          continue;
        }

        this.currentIndex = tokenIndex;
        this.currentQuotaIndex = listIndex;
        return token;
      } catch (error) {
        const action = this._handleTokenError(error, token);
        if (action === 'disable') {
          this.disableToken(token);
          this._rebuildAvailableQuotaTokens();
          if (this.tokens.length === 0 || this.availableQuotaTokenIndices.length === 0) {
            return null;
          }
        }
        // skip: continue trying next token
      }
    }

    // All available tokens are unavailable, reset quota status
    this._resetAllQuotas();
    return this.tokens[0] || null;
  }

  /**
   * Token retrieval for default strategy (round_robin / request_count)
   * @param {string} [modelId] - Requested model ID
   * @private
   */
  async _getTokenForDefaultStrategy(modelId = null) {
    const totalTokens = this.tokens.length;
    const startIndex = this.currentIndex;

    // If modelId is provided, first check if all tokens have 0 quota for this model
    let allTokensExhausted = false;
    if (modelId) {
      allTokensExhausted = this._checkAllTokensExhaustedForModel(modelId);
    }

    for (let i = 0; i < totalTokens; i++) {
      const index = (startIndex + i) % totalTokens;
      const token = this.tokens[index];

      // If modelId is provided and not all tokens are exhausted, check if this token is available for this model
      if (modelId && !allTokensExhausted) {
        if (!this._canUseTokenForModel(token, modelId)) {
          // This token is unavailable for this model (quota is 0 or in cooldown), skip
          continue;
        }
      }

      try {
        const result = await this._prepareToken(token);
        if (result === 'disable') {
          this.disableToken(token);
          if (this.tokens.length === 0) return null;
          continue;
        }

        // Update current index
        this.currentIndex = index;

        // Decide whether to switch based on strategy (only round_robin strategy switches each time)
        if (this.rotationStrategy === RotationStrategy.ROUND_ROBIN) {
          this.currentIndex = (this.currentIndex + 1) % this.tokens.length;
        } else if (this.rotationStrategy === RotationStrategy.REQUEST_COUNT) {
          // Custom count strategy: request count is handled in recordRequest, only handle switching logic here
          const tokenKey = token.refresh_token;
          const count = this.tokenRequestCounts.get(tokenKey) || 0;
          if (count >= this.requestCountPerToken) {
            this.resetRequestCount(tokenKey);
            this.currentIndex = (this.currentIndex + 1) % this.tokens.length;
          }
        }

        return token;
      } catch (error) {
        const action = this._handleTokenError(error, token);
        if (action === 'disable') {
          this.disableToken(token);
          if (this.tokens.length === 0) return null;
        }
        // skip: continue trying next token
      }
    }

    return null;
  }

  disableCurrentToken(token) {
    const found = this.tokens.find(t => t.access_token === token.access_token);
    if (found) {
      this.disableToken(found);
    }
  }

  // API management methods
  async reload() {
    this._initPromise = this._initialize();
    await this._initPromise;
    log.info('Tokens hot reloaded');
  }

  async addToken(tokenData) {
    try {
      const allTokens = await this.store.readAll();

      const newToken = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in || 3599,
        timestamp: tokenData.timestamp || Date.now(),
        enable: tokenData.enable !== undefined ? tokenData.enable : true
      };

      if (tokenData.projectId) {
        newToken.projectId = tokenData.projectId;
      }
      if (tokenData.email) {
        newToken.email = tokenData.email;
      }
      if (tokenData.hasQuota !== undefined) {
        newToken.hasQuota = tokenData.hasQuota;
      }

      allTokens.push(newToken);
      await this.store.writeAll(allTokens);

      await this.reload();
      return { success: true, message: 'Token added successfully' };
    } catch (error) {
      log.error('Failed to add token:', error.message);
      return { success: false, message: error.message };
    }
  }

  async updateToken(refreshToken, updates) {
    try {
      const allTokens = await this.store.readAll();

      const index = allTokens.findIndex(t => t.refresh_token === refreshToken);
      if (index === -1) {
        return { success: false, message: 'Token does not exist' };
      }

      allTokens[index] = { ...allTokens[index], ...updates };
      await this.store.writeAll(allTokens);

      await this.reload();
      return { success: true, message: 'Token updated successfully' };
    } catch (error) {
      log.error('Failed to update token:', error.message);
      return { success: false, message: error.message };
    }
  }

  async deleteToken(refreshToken) {
    try {
      const allTokens = await this.store.readAll();

      const filteredTokens = allTokens.filter(t => t.refresh_token !== refreshToken);
      if (filteredTokens.length === allTokens.length) {
        return { success: false, message: 'Token does not exist' };
      }

      await this.store.writeAll(filteredTokens);

      await this.reload();
      return { success: true, message: 'Token deleted successfully' };
    } catch (error) {
      log.error('Failed to delete token:', error.message);
      return { success: false, message: error.message };
    }
  }

  async getTokenList() {
    try {
      const allTokens = await this.store.readAll();
      const salt = await this.store.getSalt();

      return allTokens.map(token => ({
        // Use safe tokenId instead of full refresh_token
        id: generateTokenId(token.refresh_token, salt),
        expires_in: token.expires_in,
        timestamp: token.timestamp,
        enable: token.enable !== false,
        projectId: token.projectId || null,
        email: token.email || null,
        hasQuota: token.hasQuota !== false
      }));
    } catch (error) {
      log.error('Failed to get token list:', error.message);
      return [];
    }
  }

  /**
   * Find complete token object by tokenId
   * @param {string} tokenId - Safe token ID
   * @returns {Promise<Object|null>} token object or null
   */
  async findTokenById(tokenId) {
    try {
      const allTokens = await this.store.readAll();
      const salt = await this.store.getSalt();

      return allTokens.find(token =>
        generateTokenId(token.refresh_token, salt) === tokenId
      ) || null;
    } catch (error) {
      log.error('Failed to find token:', error.message);
      return null;
    }
  }

  /**
   * Update token by tokenId
   * @param {string} tokenId - Safe token ID
   * @param {Object} updates - Update content
   * @returns {Promise<Object>} Operation result
   */
  async updateTokenById(tokenId, updates) {
    try {
      const allTokens = await this.store.readAll();
      const salt = await this.store.getSalt();

      const index = allTokens.findIndex(token =>
        generateTokenId(token.refresh_token, salt) === tokenId
      );

      if (index === -1) {
        return { success: false, message: 'Token does not exist' };
      }

      allTokens[index] = { ...allTokens[index], ...updates };
      await this.store.writeAll(allTokens);

      await this.reload();
      return { success: true, message: 'Token updated successfully' };
    } catch (error) {
      log.error('Failed to update token:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Delete token by tokenId
   * @param {string} tokenId - Safe token ID
   * @returns {Promise<Object>} Operation result
   */
  async deleteTokenById(tokenId) {
    try {
      const allTokens = await this.store.readAll();
      const salt = await this.store.getSalt();

      const filteredTokens = allTokens.filter(token =>
        generateTokenId(token.refresh_token, salt) !== tokenId
      );

      if (filteredTokens.length === allTokens.length) {
        return { success: false, message: 'Token does not exist' };
      }

      await this.store.writeAll(filteredTokens);

      await this.reload();
      return { success: true, message: 'Token deleted successfully' };
    } catch (error) {
      log.error('Failed to delete token:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Refresh token by tokenId
   * @param {string} tokenId - Safe token ID
   * @returns {Promise<Object>} Refreshed token information (without sensitive data)
   */
  async refreshTokenById(tokenId) {
    const tokenData = await this.findTokenById(tokenId);
    if (!tokenData) {
      throw new TokenError('Token does not exist', null, 404);
    }

    const refreshedToken = await this.refreshToken(tokenData);
    return {
      expires_in: refreshedToken.expires_in,
      timestamp: refreshedToken.timestamp
    };
  }

  /**
   * Get salt value (for frontend validation and other scenarios)
   * @returns {Promise<string>} Salt value
   */
  async getSalt() {
    return this.store.getSalt();
  }

  /**
   * Get tokenId from token object
   * @param {Object} token - Token object
   * @returns {string|null} tokenId, returns null if unable to generate
   */
  getTokenId(token) {
    if (!token?.refresh_token) return null;
    try {
      const salt = this.store._salt;
      if (!salt) return null;
      return generateTokenId(token.refresh_token, salt);
    } catch (error) {
      return null;
    }
  }

  // Get current rotation configuration
  getRotationConfig() {
    return {
      strategy: this.rotationStrategy,
      requestCount: this.requestCountPerToken,
      currentIndex: this.currentIndex,
      tokenCounts: Object.fromEntries(this.tokenRequestCounts)
    };
  }
}

// Export strategy enumeration
export { RotationStrategy };

const tokenManager = new TokenManager();
export default tokenManager;
