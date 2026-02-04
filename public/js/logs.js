// 日志管理模块

// 日志状态
let logsState = {
    logs: [],
    total: 0,
    currentLevel: 'all',
    searchKeyword: '',
    offset: 0,
    limit: 100,
    maxLogs: 500, // 最大保留日志条数，防止内存无限增长
    autoRefresh: false,
    autoRefreshTimer: null,
    stats: { total: 0, info: 0, warn: 0, error: 0, request: 0, debug: 0 },
    // WebSocket 相关
    ws: null,
    wsConnected: false,
    wsReconnectTimer: null
};

// 加载日志
async function loadLogs(append = false) {
    try {
        if (!append) {
            logsState.offset = 0;
        }

        const params = new URLSearchParams({
            level: logsState.currentLevel,
            search: logsState.searchKeyword,
            limit: logsState.limit,
            offset: logsState.offset
        });

        const response = await fetch(`/admin/logs?${params}`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('获取日志失败');
        }

        const data = await response.json();
        if (data.success) {
            if (append) {
                logsState.logs = [...logsState.logs, ...data.data.logs];
            } else {
                logsState.logs = data.data.logs;
            }

            // 限制日志数量，防止内存无限增长
            if (logsState.logs.length > logsState.maxLogs) {
                logsState.logs = logsState.logs.slice(-logsState.maxLogs);
            }

            logsState.total = data.data.total;
            renderLogs();
        }
    } catch (error) {
        console.error('加载日志失败:', error);
        showToast('加载日志失败: ' + error.message, 'error');
    }
}

// 加载日志统计
async function loadLogStats() {
    try {
        const response = await fetch('/admin/logs/stats', {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('获取日志统计失败');
        }

        const data = await response.json();
        if (data.success) {
            logsState.stats = data.data;
            renderLogStats();
        }
    } catch (error) {
        console.error('加载日志统计失败:', error);
    }
}

// 清空日志
async function clearLogs() {
    if (!confirm('确定要清空所有日志吗？此操作不可恢复。')) {
        return;
    }

    try {
        const response = await fetch('/admin/logs', {
            method: 'DELETE',
            credentials: 'include'
        });

        const data = await response.json();
        if (data.success) {
            showToast('日志已清空', 'success');
            logsState.logs = [];
            logsState.total = 0;
            logsState.stats = { total: 0, info: 0, warn: 0, error: 0, request: 0, debug: 0 };
            renderLogs();
            renderLogStats();
        } else {
            showToast(data.message || '清空日志失败', 'error');
        }
    } catch (error) {
        console.error('清空日志失败:', error);
        showToast('清空日志失败: ' + error.message, 'error');
    }
}

// 筛选日志级别
function filterLogLevel(level) {
    logsState.currentLevel = level;
    logsState.offset = 0;

    // 更新统计项的激活状态
    renderLogStats();

    loadLogs();
}

// 搜索日志
function searchLogs(keyword) {
    logsState.searchKeyword = keyword;
    logsState.offset = 0;
    loadLogs();
}

// 加载更多日志
function loadMoreLogs() {
    logsState.offset += logsState.limit;
    loadLogs(true);
}

// 切换自动刷新
function toggleAutoRefresh() {
    logsState.autoRefresh = !logsState.autoRefresh;
    const btn = document.getElementById('autoRefreshBtn');

    if (logsState.autoRefresh) {
        btn.classList.add('active');
        btn.innerHTML = '⏸️ 停止刷新';
        logsState.autoRefreshTimer = setInterval(() => {
            loadLogs();
            loadLogStats();
        }, 3000);
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '🔄 自动刷新';
        if (logsState.autoRefreshTimer) {
            clearInterval(logsState.autoRefreshTimer);
            logsState.autoRefreshTimer = null;
        }
    }
}

// 渲染日志统计
function renderLogStats() {
    const statsContainer = document.getElementById('logStats');
    if (!statsContainer) return;

    const currentLevel = logsState.currentLevel;

    statsContainer.innerHTML = `
        <div class="log-stat-item clickable ${currentLevel === 'all' ? 'active' : ''}" onclick="filterLogLevel('all')">
            <span class="log-stat-num">${logsState.stats.total}</span>
            <span class="log-stat-label">All</span>
        </div>
        <div class="log-stat-item info clickable ${currentLevel === 'info' ? 'active' : ''}" onclick="filterLogLevel('info')">
            <span class="log-stat-num">${logsState.stats.info}</span>
            <span class="log-stat-label">Information</span>
        </div>
        <div class="log-stat-item debug clickable ${currentLevel === 'debug' ? 'active' : ''}" onclick="filterLogLevel('debug')">
            <span class="log-stat-num">${logsState.stats.debug}</span>
            <span class="log-stat-label">Debug</span>
        </div>
        <div class="log-stat-item warn clickable ${currentLevel === 'warn' ? 'active' : ''}" onclick="filterLogLevel('warn')">
            <span class="log-stat-num">${logsState.stats.warn}</span>
            <span class="log-stat-label">Warning</span>
        </div>
        <div class="log-stat-item error clickable ${currentLevel === 'error' ? 'active' : ''}" onclick="filterLogLevel('error')">
            <span class="log-stat-num">${logsState.stats.error}</span>
            <span class="log-stat-label">Error</span>
        </div>
        <div class="log-stat-item request clickable ${currentLevel === 'request' ? 'active' : ''}" onclick="filterLogLevel('request')">
            <span class="log-stat-num">${logsState.stats.request}</span>
            <span class="log-stat-label">Request</span>
        </div>
    `;
}

// 判断是否为分隔符行（只包含重复的特殊字符）
function isSeparatorLine(message) {
    if (!message || typeof message !== 'string') return false;
    // 去掉首尾空格后，判断是否只由重复的 = ─ ═ - * 等符号组成
    const trimmed = message.trim();
    if (trimmed.length < 3) return false;
    // 匹配只包含分隔符字符的行
    return /^[═─=\-*_~]+$/.test(trimmed);
}

// 复制日志内容
function copyLogContent(index, buttonElement) {
    // 从排序后的日志中获取原始消息
    const filteredLogs = logsState.logs.filter(log => !isSeparatorLine(log.message));
    const sortedLogs = [...filteredLogs].reverse();
    const log = sortedLogs[index];

    if (!log) {
        showToast('Copy failed: log does not exist', 'error');
        return;
    }

    const plainText = log.message;

    navigator.clipboard.writeText(plainText).then(() => {
        // 显示复制成功反馈
        if (buttonElement) {
            const originalText = buttonElement.innerHTML;
            buttonElement.innerHTML = '✓';
            buttonElement.classList.add('copied');
            setTimeout(() => {
                buttonElement.innerHTML = originalText;
                buttonElement.classList.remove('copied');
            }, 1500);
        }
        showToast('Copied to clipboard', 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Copy failed', 'error');
    });
}

// 渲染日志列表
function renderLogs() {
    const container = document.getElementById('logList');
    if (!container) return;

    // 过滤掉分隔符行
    const filteredLogs = logsState.logs.filter(log => !isSeparatorLine(log.message));

    if (filteredLogs.length === 0) {
        container.innerHTML = `
            <div class="log-empty">
                <div class="log-empty-icon">📋</div>
                <div class="log-empty-text">暂无日志</div>
            </div>
        `;
        return;
    }

    // 日志按时间正序显示（旧的在上面，新的在下面）
    // logsState.logs 已经是倒序的（最新在前），需要反转
    const sortedLogs = [...filteredLogs].reverse();

    const logsHtml = sortedLogs.map((log, index) => {
        const levelClass = log.level;
        const levelIcon = {
            info: 'ℹ️',
            warn: '⚠️',
            error: '❌',
            request: '🌐',
            debug: '🔍'
        }[log.level] || '📝';

        const time = new Date(log.timestamp).toLocaleString('zh-CN', {
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // 高亮搜索关键词
        let message = escapeHtml(log.message);
        if (logsState.searchKeyword) {
            const regex = new RegExp(`(${escapeRegExp(logsState.searchKeyword)})`, 'gi');
            message = message.replace(regex, '<mark>$1</mark>');
        }

        return `
            <div class="log-item ${levelClass}" data-log-index="${index}">
                <div class="log-item-header">
                    <span class="log-level-icon">${levelIcon}</span>
                    <span class="log-level-tag ${levelClass}">${log.level.toUpperCase()}</span>
                    <span class="log-time">${time}</span>
                    <button class="log-copy-btn" onclick="copyLogContent(${index}, this)" title="Copy log content">
                        📋
                    </button>
                </div>
                <div class="log-message">${message}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = logsHtml;

    // 滚动到底部（显示最新日志）
    container.scrollTop = container.scrollHeight;

    // 更新加载更多按钮状态
    const loadMoreBtn = document.getElementById('loadMoreLogsBtn');
    if (loadMoreBtn) {
        const hasMore = logsState.logs.length < logsState.total;
        loadMoreBtn.style.display = hasMore ? 'block' : 'none';
        loadMoreBtn.textContent = `加载更多 (${logsState.logs.length}/${logsState.total})`;
    }
}

// HTML 转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 正则转义
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 导出日志
function exportLogs() {
    if (logsState.logs.length === 0) {
        showToast('没有日志可导出', 'warning');
        return;
    }

    const content = logsState.logs.map(log => {
        const time = new Date(log.timestamp).toLocaleString('zh-CN', { hour12: false });
        return `[${time}] [${log.level.toUpperCase()}] ${log.message}`;
    }).join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('日志已导出', 'success');
}

// 连接 WebSocket
function connectLogWebSocket() {
    if (logsState.ws && logsState.ws.readyState === WebSocket.OPEN) {
        return; // 已连接
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/logs`;

    try {
        logsState.ws = new WebSocket(wsUrl);

        logsState.ws.onopen = () => {
            logsState.wsConnected = true;
            console.log('WebSocket 日志连接已建立');
            updateWsStatus(true);
        };

        logsState.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWsMessage(data);
            } catch (e) {
                console.error('解析 WebSocket 消息失败:', e);
            }
        };

        logsState.ws.onclose = () => {
            logsState.wsConnected = false;
            console.log('WebSocket 日志连接已断开');
            updateWsStatus(false);
            // 5秒后重连
            if (!logsState.wsReconnectTimer) {
                logsState.wsReconnectTimer = setTimeout(() => {
                    logsState.wsReconnectTimer = null;
                    connectLogWebSocket();
                }, 5000);
            }
        };

        logsState.ws.onerror = (error) => {
            console.error('WebSocket 错误:', error);
            logsState.wsConnected = false;
            updateWsStatus(false);
            // 回退到 HTTP 加载
            loadLogs();
        };
    } catch (e) {
        console.error('创建 WebSocket 失败:', e);
        // 回退到 HTTP 加载
        loadLogs();
    }
}

// 处理 WebSocket 消息
function handleWsMessage(data) {
    switch (data.type) {
        case 'history':
            // 接收历史日志
            logsState.logs = data.logs.reverse(); // 转为最新在前
            logsState.total = data.logs.length;
            updateStats();
            renderLogs();
            break;

        case 'log':
            // 接收新日志
            addNewLog(data.log);
            break;

        case 'clear':
            // 日志被清空
            logsState.logs = [];
            logsState.total = 0;
            logsState.stats = { total: 0, info: 0, warn: 0, error: 0, request: 0, debug: 0 };
            renderLogs();
            renderLogStats();
            break;
    }
}

// 添加新日志
function addNewLog(log) {
    // 插入到开头（最新的在前）
    logsState.logs.unshift(log);
    logsState.total++;

    // 限制数量
    if (logsState.logs.length > logsState.maxLogs) {
        logsState.logs.pop();
    }

    // 更新统计
    if (!isSeparatorLine(log.message)) {
        logsState.stats.total++;
        if (logsState.stats[log.level] !== undefined) {
            logsState.stats[log.level]++;
        }
        renderLogStats();
    }

    // 检查是否匹配当前筛选条件
    if (logsState.currentLevel !== 'all' && log.level !== logsState.currentLevel) {
        return; // 不匹配筛选条件，不添加到显示
    }

    if (logsState.searchKeyword && !log.message.toLowerCase().includes(logsState.searchKeyword.toLowerCase())) {
        return; // 不匹配搜索关键词
    }

    // 追加到 DOM
    appendLogToDOM(log);
}

// 追加单条日志到 DOM（增量渲染）
function appendLogToDOM(log) {
    const container = document.getElementById('logList');
    if (!container) return;

    // 检查是否有空状态提示，移除它
    const emptyState = container.querySelector('.log-empty');
    if (emptyState) {
        emptyState.remove();
    }

    const levelClass = log.level;
    const levelIcon = {
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
        request: '🌐',
        debug: '🔍'
    }[log.level] || '📝';

    const time = new Date(log.timestamp).toLocaleString('zh-CN', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    let message = escapeHtml(log.message);
    if (logsState.searchKeyword) {
        const regex = new RegExp(`(${escapeRegExp(logsState.searchKeyword)})`, 'gi');
        message = message.replace(regex, '<mark>$1</mark>');
    }

    const logElement = document.createElement('div');
    logElement.className = `log-item ${levelClass}`;
    logElement.innerHTML = `
        <div class="log-item-header">
            <span class="log-level-icon">${levelIcon}</span>
            <span class="log-level-tag ${levelClass}">${log.level.toUpperCase()}</span>
            <span class="log-time">${time}</span>
        </div>
        <div class="log-message">${message}</div>
    `;

    // 追加到底部
    container.appendChild(logElement);

    // 滚动到底部
    container.scrollTop = container.scrollHeight;
}

// 更新统计
function updateStats() {
    const stats = { total: 0, info: 0, warn: 0, error: 0, request: 0, debug: 0 };
    for (const log of logsState.logs) {
        if (isSeparatorLine(log.message)) continue;
        stats.total++;
        if (stats[log.level] !== undefined) {
            stats[log.level]++;
        }
    }
    logsState.stats = stats;
    renderLogStats();
}

// 更新 WebSocket 连接状态显示
function updateWsStatus(connected) {
    const btn = document.getElementById('autoRefreshBtn');
    if (btn) {
        if (connected) {
            btn.innerHTML = '🟢 Real-time push notifications';
            btn.classList.add('active');
            btn.disabled = true;
        } else {
            btn.innerHTML = '🔴 Disconnected';
            btn.classList.remove('active');
            btn.disabled = false;
        }
    }
}

// 断开 WebSocket
function disconnectLogWebSocket() {
    if (logsState.wsReconnectTimer) {
        clearTimeout(logsState.wsReconnectTimer);
        logsState.wsReconnectTimer = null;
    }

    if (logsState.ws) {
        logsState.ws.close();
        logsState.ws = null;
    }
    logsState.wsConnected = false;
}

// 初始化日志页面
function initLogsPage() {
    // 优先使用 WebSocket 实时推送
    connectLogWebSocket();
    // 加载统计（始终需要）
    loadLogStats();
}

// 清理日志页面（切换离开时）
function cleanupLogsPage() {
    // 断开 WebSocket
    disconnectLogWebSocket();

    if (logsState.autoRefreshTimer) {
        clearInterval(logsState.autoRefreshTimer);
        logsState.autoRefreshTimer = null;
    }
    logsState.autoRefresh = false;

    // 清空日志数据释放内存
    logsState.logs = [];
    logsState.total = 0;
    logsState.offset = 0;

    // 清空 DOM 内容
    const container = document.getElementById('logList');
    if (container) {
        container.innerHTML = '';
    }
}
