// Token Management: Create, Read, Update, Delete, enable/disable

let cachedTokens = [];
let currentFilter = localStorage.getItem('tokenFilter') || 'all'; // 'all', 'enabled', 'disabled'
let skipAnimation = false; // Whether to skip animation

// Mobile operation area manual collapse/expand
let actionBarCollapsed = localStorage.getItem('actionBarCollapsed') === 'true';

// Store event listener references for easy cleanup
const eventListenerRegistry = new WeakMap();

// Register event listeners (for easy cleanup later)
function registerEventListener(element, event, handler, options) {
    if (!element) return;
    element.addEventListener(event, handler, options);

    if (!eventListenerRegistry.has(element)) {
        eventListenerRegistry.set(element, []);
    }
    eventListenerRegistry.get(element).push({ event, handler, options });
}

// Clean up all registered event listeners on an element
function cleanupEventListeners(element) {
    if (!element || !eventListenerRegistry.has(element)) return;

    const listeners = eventListenerRegistry.get(element);
    for (const { event, handler, options } of listeners) {
        element.removeEventListener(event, handler, options);
    }
    eventListenerRegistry.delete(element);
}

// Check if projectId is randomly generated (old format: adjective-noun-random)
function isRandomProjectId(projectId) {
    if (!projectId) return true;
    // Random format match: word-word-alphanumeric (e.g., useful-fuze-abc12)
    const randomPattern = /^[a-z]+-[a-z]+-[a-z0-9]{5}$/;
    return randomPattern.test(projectId);
}

// Manually fetch Project ID (from API)
async function fetchProjectId(event, tokenId) {
    event.stopPropagation(); // Prevent triggering parent element click event

    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳';

    try {
        const response = await authFetch(`/admin/tokens/${encodeURIComponent(tokenId)}/fetch-project-id`, {
            method: 'POST'
        });

        const data = await response.json();
        if (data.success) {
            showToast(`Project ID fetched successfully: ${data.projectId}`, 'success');
            loadTokens(); // Refresh list
        } else {
            showToast(`Failed to fetch: ${data.message || 'Unknown error'}`, 'error');
            btn.disabled = false;
            btn.textContent = '🔍';
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Failed to fetch: ${error.message}`, 'error');
        }
        btn.disabled = false;
        btn.textContent = '🔍';
    }
}

// Batch fetch Project IDs for all tokens
async function batchFetchProjectIds() {
    if (!cachedTokens || cachedTokens.length === 0) {
        showToast('No available tokens', 'warning');
        return;
    }

    // Only fetch enabled tokens
    const enabledTokens = cachedTokens.filter(t => t.enable);
    if (enabledTokens.length === 0) {
        showToast('No enabled tokens', 'warning');
        return;
    }

    showLoading(`Batch fetching Project IDs (0/${enabledTokens.length})...`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < enabledTokens.length; i++) {
        const token = enabledTokens[i];
        updateLoadingText(`Batch fetching Project IDs (${i + 1}/${enabledTokens.length})...`);

        try {
            const response = await authFetch(`/admin/tokens/${encodeURIComponent(token.id)}/fetch-project-id`, {
                method: 'POST'
            });
            const data = await response.json();
            if (data.success) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            failCount++;
        }

        // Prevent requests from being too fast, wait 500ms between requests
        if (i < enabledTokens.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    hideLoading();
    showToast(`Batch fetch completed: ${successCount} succeeded, ${failCount} failed`, successCount > 0 ? 'success' : 'error');
    loadTokens(); // Refresh list
}

// Update loading text
function updateLoadingText(text) {
    const loadingText = document.querySelector('.loading-overlay .loading-text');
    if (loadingText) {
        loadingText.textContent = text;
    }
}

// Export tokens (requires password verification)
async function exportTokens() {
    const password = await showPasswordPrompt('Please enter admin password to export tokens');
    if (!password) return;

    showLoading('Exporting...');
    try {
        const response = await authFetch('/admin/tokens/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();
        hideLoading();

        if (data.success) {
            // Create download
            const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tokens-export-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Export successful', 'success');
        } else {
            // Show specific error message for password error or other errors
            if (response.status === 403) {
                showToast('Incorrect password, please try again', 'error');
            } else {
                showToast(data.message || 'Export failed', 'error');
            }
        }
    } catch (error) {
        hideLoading();
        showToast('Export failed: ' + error.message, 'error');
    }
}

// Import tokens (requires password verification) - open drag upload modal
async function importTokens() {
    showImportUploadModal();
}

// Current import mode: 'file' | 'json' | 'manual'
let currentImportTab = 'file';

// Store import modal event handler references
let importModalHandlers = null;

// Display import upload modal (supports drag, manual JSON input, and manual token entry)
function showImportUploadModal() {
    const modal = document.createElement('div');
    modal.className = 'modal form-modal';
    modal.id = 'importUploadModal';
    modal.innerHTML = `
        <div class="modal-content modal-lg">
            <div class="modal-title">📥 Add/Import Tokens</div>
            
            <!-- Import method tab switching -->
            <div class="import-tabs">
                <button class="import-tab active" data-tab="file" onclick="switchImportTab('file')">📁 File Upload</button>
                <button class="import-tab" data-tab="json" onclick="switchImportTab('json')">📝 JSON Import</button>
                <button class="import-tab" data-tab="manual" onclick="switchImportTab('manual')">✏️ Manual Entry</button>
            </div>
            
            <!-- File upload area -->
            <div class="import-tab-content" id="importTabFile">
                <div class="import-dropzone" id="importDropzone">
                    <div class="dropzone-icon">📁</div>
                    <div class="dropzone-text">Drag files here</div>
                    <div class="dropzone-hint">Or click to select file</div>
                    <input type="file" id="importFileInput" accept=".json" style="display: none;">
                </div>
                <div class="import-file-info hidden" id="importFileInfo">
                    <div class="file-info-icon">📄</div>
                    <div class="file-info-details">
                        <div class="file-info-name" id="importFileName">-</div>
                        <div class="file-info-meta" id="importFileMeta">-</div>
                    </div>
                    <button class="btn btn-xs btn-secondary" onclick="clearImportFile()">✕</button>
                </div>
            </div>
            
            <!-- Manual JSON input area -->
            <div class="import-tab-content hidden" id="importTabJson">
                <div class="form-group">
                    <label>📝 Paste JSON content</label>
                    <textarea id="importJsonInput" rows="8" placeholder='{"tokens": [...], "exportTime": "..."}'></textarea>
                </div>
                <div class="import-json-actions">
                    <button class="btn btn-sm btn-info" onclick="parseImportJson()">🔍 Parse JSON</button>
                    <span class="import-json-status" id="importJsonStatus"></span>
                </div>
            </div>
            
            <!-- Manual token entry area -->
            <div class="import-tab-content hidden" id="importTabManual">
                <div class="form-group">
                    <label>🔑 Access Token <span style="color: var(--danger);">*</span></label>
                    <input type="text" id="manualAccessToken" placeholder="Access Token (required)" autocomplete="off">
                </div>
                <div class="form-group">
                    <label>🔄 Refresh Token <span style="color: var(--danger);">*</span></label>
                    <input type="text" id="manualRefreshToken" placeholder="Refresh Token (required)" autocomplete="off">
                </div>
                <div class="form-group">
                    <label>📁 Project ID</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" id="manualProjectId" placeholder="Project ID (optional, leave blank for auto-fetch)" style="flex: 1;" autocomplete="off">
                        <button class="btn btn-sm btn-info" id="fetchProjectIdBtn" onclick="fetchProjectIdForManual()" style="white-space: nowrap;">🔍 Auto-fetch</button>
                    </div>
                    <p style="font-size: 0.75rem; color: var(--text-light); margin-top: 0.25rem;">💡 Can fill manually or click "Auto-fetch" after entering tokens</p>
                </div>
                <div class="form-group">
                    <label>⏱️ Expiration (seconds)</label>
                    <input type="number" id="manualExpiresIn" placeholder="Expiration (seconds)" value="3599" autocomplete="off">
                </div>
                <p style="font-size: 0.8rem; color: var(--text-light); margin-bottom: 0.5rem;">💡 Default expiration is 3599 seconds (~1 hour), manual entry does not require password verification</p>
            </div>
            
            <!-- Import mode (only shown for file upload and JSON import) -->
            <div class="form-group" id="importModeGroup">
                <label>Import mode</label>
                <select id="importMode">
                    <option value="merge">Merge (keep existing, add new)</option>
                    <option value="replace">Replace (clear existing, import new)</option>
                </select>
            </div>
            
            <!-- Password verification (only shown for file upload and JSON import) -->
            <div class="form-group" id="importPasswordGroup">
                <label>🔐 Admin password</label>
                <input type="password" id="importPassword" placeholder="Please enter admin password to verify">
            </div>
            
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeImportModal()">Cancel</button>
                <button class="btn btn-success" id="confirmImportBtn" onclick="confirmImportFromModal()" disabled>✅ Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Initialize current tab
    currentImportTab = 'file';

    // Bind events (save references for cleanup)
    const dropzone = document.getElementById('importDropzone');
    const fileInput = document.getElementById('importFileInput');
    const manualAccessToken = document.getElementById('manualAccessToken');
    const manualRefreshToken = document.getElementById('manualRefreshToken');

    // Generic binding: dropzone + backdrop click close
    const cleanupDropzone = (typeof wireJsonFileDropzone === 'function')
        ? wireJsonFileDropzone({
            dropzone,
            fileInput,
            onFile: (file) => handleImportFile(file),
            onError: (message) => showToast(message, 'warning')
        })
        : null;
    const cleanupBackdrop = (typeof wireModalBackdropClose === 'function')
        ? wireModalBackdropClose(modal, closeImportModal)
        : null;

    // Create event handlers
    const handlers = {
        updateManualBtnState: () => {
            if (currentImportTab === 'manual') {
                const confirmBtn = document.getElementById('confirmImportBtn');
                confirmBtn.disabled = !manualAccessToken.value.trim() || !manualRefreshToken.value.trim();
            }
        }
    };

    // Save handler references
    importModalHandlers = {
        modal,
        dropzone,
        fileInput,
        manualAccessToken,
        manualRefreshToken,
        handlers,
        cleanup: () => {
            try { cleanupDropzone && cleanupDropzone(); } catch { /* ignore */ }
            try { cleanupBackdrop && cleanupBackdrop(); } catch { /* ignore */ }
        }
    };

    // Bind events (manual entry mode still keeps existing logic)
    manualAccessToken.addEventListener('input', handlers.updateManualBtnState);
    manualRefreshToken.addEventListener('input', handlers.updateManualBtnState);
}

// Switch import method tabs
function switchImportTab(tab) {
    currentImportTab = tab;

    // Update tab status
    document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.import-tab[data-tab="${tab}"]`).classList.add('active');

    // Toggle content visibility
    document.getElementById('importTabFile').classList.toggle('hidden', tab !== 'file');
    document.getElementById('importTabJson').classList.toggle('hidden', tab !== 'json');
    document.getElementById('importTabManual').classList.toggle('hidden', tab !== 'manual');

    // Toggle import mode and password input visibility
    const importModeGroup = document.getElementById('importModeGroup');
    const importPasswordGroup = document.getElementById('importPasswordGroup');
    const confirmBtn = document.getElementById('confirmImportBtn');

    if (tab === 'manual') {
        // Manual entry mode: hide import mode and password
        importModeGroup.classList.add('hidden');
        importPasswordGroup.classList.add('hidden');
        // Update button status
        const accessToken = document.getElementById('manualAccessToken').value.trim();
        const refreshToken = document.getElementById('manualRefreshToken').value.trim();
        confirmBtn.disabled = !accessToken || !refreshToken;
        confirmBtn.textContent = '✅ Add';
    } else {
        // File upload or JSON import mode: show import mode and password
        importModeGroup.classList.remove('hidden');
        importPasswordGroup.classList.remove('hidden');
        confirmBtn.textContent = '✅ Confirm import';

        // Clear previous data
        if (tab === 'file') {
            // When switching to file upload, clear JSON input and manual input
            document.getElementById('importJsonInput').value = '';
            document.getElementById('importJsonStatus').textContent = '';
            document.getElementById('manualAccessToken').value = '';
            document.getElementById('manualRefreshToken').value = '';
            document.getElementById('manualExpiresIn').value = '3599';
            // Button status determined by file selection
            confirmBtn.disabled = !pendingImportData;
        } else if (tab === 'json') {
            // When switching to JSON input, clear file selection and manual input
            clearImportFile();
            document.getElementById('manualAccessToken').value = '';
            document.getElementById('manualRefreshToken').value = '';
            document.getElementById('manualExpiresIn').value = '3599';
            // Button status determined by JSON parse
            confirmBtn.disabled = !pendingImportData;
        }
    }
}

// Smart field search (case-insensitive, contains match)
function findFieldByKeyword(obj, keyword) {
    if (!obj || typeof obj !== 'object') return undefined;
    const lowerKeyword = keyword.toLowerCase();
    for (const key of Object.keys(obj)) {
        if (key.toLowerCase().includes(lowerKeyword)) {
            return obj[key];
        }
    }
    return undefined;
}

// Smart parse single Token object
function smartParseToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'object') return null;

    // Required fields: contains 'refresh' is refresh_token, contains 'project' is projectId
    const refresh_token = findFieldByKeyword(rawToken, 'refresh');
    const projectId = findFieldByKeyword(rawToken, 'project');

    // Must contain both fields
    if (!refresh_token || !projectId) return null;

    // Build standardized token object
    const token = { refresh_token, projectId };

    // Optional fields auto-fetch
    const access_token = findFieldByKeyword(rawToken, 'access');
    const email = findFieldByKeyword(rawToken, 'email') || findFieldByKeyword(rawToken, 'mail');
    const expires_in = findFieldByKeyword(rawToken, 'expire');
    const enable = findFieldByKeyword(rawToken, 'enable');
    const timestamp = findFieldByKeyword(rawToken, 'time') || findFieldByKeyword(rawToken, 'stamp');
    const hasQuota = findFieldByKeyword(rawToken, 'quota');

    if (access_token) token.access_token = access_token;
    if (email) token.email = email;
    if (expires_in !== undefined) token.expires_in = parseInt(expires_in) || 3599;
    if (enable !== undefined) token.enable = enable === true || enable === 'true' || enable === 1;
    if (timestamp) token.timestamp = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
    if (hasQuota !== undefined) token.hasQuota = hasQuota === true || hasQuota === 'true' || hasQuota === 1;

    return token;
}

// Smart parse import data (supports multiple formats)
function smartParseImportData(jsonText) {
    let data;
    let cleanText = jsonText.trim();

    // Preprocess: remove trailing commas (common JSON format error)
    cleanText = cleanText.replace(/,(\s*[}\]])/g, '$1');

    try {
        data = JSON.parse(cleanText);
    } catch (e) {
        // Try to handle multiple JSON objects (user may have pasted multiple objects without array wrapping)
        try {
            // Try to wrap multiple objects into array
            // Match }{ or }\n{ cases, replace with },{
            const arrayText = '[' + cleanText.replace(/\}\s*\{/g, '},{') + ']';
            data = JSON.parse(arrayText);
        } catch (e2) {
            return { success: false, message: `JSON parse error: ${e.message}` };
        }
    }

    // Identify data structure: array or array within object
    let tokensArray = [];
    if (Array.isArray(data)) {
        tokensArray = data;
    } else if (typeof data === 'object' && data !== null) {
        // Find any field containing array
        for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) {
                tokensArray = data[key];
                break;
            }
        }
        // If array not found, try to parse as single token
        if (tokensArray.length === 0) {
            const single = smartParseToken(data);
            if (single) tokensArray = [data];
        }
    }

    if (tokensArray.length === 0) {
        return { success: false, message: 'No valid data found, please ensure it contains refresh_token and projectId' };
    }

    // Parse each token
    const validTokens = [];
    let invalidCount = 0;
    for (const raw of tokensArray) {
        const parsed = smartParseToken(raw);
        if (parsed) {
            validTokens.push(parsed);
        } else {
            invalidCount++;
        }
    }

    if (validTokens.length === 0) {
        return { success: false, message: `All ${tokensArray.length} records missing required fields (refresh_token and projectId)` };
    }

    const message = invalidCount > 0
        ? `Parse successful: ${validTokens.length} valid, ${invalidCount} invalid`
        : `Parse successful: ${validTokens.length} Tokens`;

    return { success: true, tokens: validTokens, message };
}

// Parse manually entered JSON
function parseImportJson() {
    const jsonInput = document.getElementById('importJsonInput');
    const statusEl = document.getElementById('importJsonStatus');
    const confirmBtn = document.getElementById('confirmImportBtn');

    const jsonText = jsonInput.value.trim();
    if (!jsonText) {
        statusEl.textContent = '❌ Please enter JSON content';
        statusEl.className = 'import-json-status error';
        pendingImportData = null;
        confirmBtn.disabled = true;
        return;
    }

    const result = smartParseImportData(jsonText);

    if (result.success) {
        // Save pending import data (convert to standard format)
        pendingImportData = { tokens: result.tokens };
        statusEl.textContent = `✅ ${result.message}`;
        statusEl.className = 'import-json-status success';
        confirmBtn.disabled = false;
    } else {
        statusEl.textContent = `❌ ${result.message}`;
        statusEl.className = 'import-json-status error';
        pendingImportData = null;
        confirmBtn.disabled = true;
    }
}

// Current pending import data
let pendingImportData = null;

// Handle import file (using smart parsing)
async function handleImportFile(file) {
    try {
        const text = await file.text();
        const result = smartParseImportData(text);

        if (!result.success) {
            showToast(result.message, 'error');
            return;
        }

        // Save pending import data (convert to standard format)
        pendingImportData = { tokens: result.tokens };

        // Update UI to display file info
        const dropzone = document.getElementById('importDropzone');
        const fileInfo = document.getElementById('importFileInfo');
        const fileName = document.getElementById('importFileName');
        const fileMeta = document.getElementById('importFileMeta');
        const confirmBtn = document.getElementById('confirmImportBtn');

        dropzone.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        fileName.textContent = file.name;
        fileMeta.textContent = result.message;
        confirmBtn.disabled = false;

    } catch (error) {
        showToast('Read file failed: ' + error.message, 'error');
    }
}

// Clear selected file
function clearImportFile() {
    pendingImportData = null;

    const dropzone = document.getElementById('importDropzone');
    const fileInfo = document.getElementById('importFileInfo');
    const fileInput = document.getElementById('importFileInput');
    const confirmBtn = document.getElementById('confirmImportBtn');

    dropzone.classList.remove('hidden');
    fileInfo.classList.add('hidden');
    fileInput.value = '';
    confirmBtn.disabled = true;
}

// Close import modal
function closeImportModal() {
    // Clean up event listeners
    if (importModalHandlers) {
        const { manualAccessToken, manualRefreshToken, handlers, cleanup } = importModalHandlers;

        // New mode: unified cleanup (dropzone/backdrop, etc.)
        if (typeof cleanup === 'function') {
            try { cleanup(); } catch { /* ignore */ }
        } else {
            // Old mode compatibility (keep in case external changes cause cleanup not to be injected)
            const { modal, dropzone, fileInput } = importModalHandlers;
            if (dropzone && handlers) {
                if (handlers.dropzoneClick) dropzone.removeEventListener('click', handlers.dropzoneClick);
                if (handlers.dragover) dropzone.removeEventListener('dragover', handlers.dragover);
                if (handlers.dragleave) dropzone.removeEventListener('dragleave', handlers.dragleave);
                if (handlers.drop) dropzone.removeEventListener('drop', handlers.drop);
            }
            if (fileInput && handlers?.fileChange) {
                fileInput.removeEventListener('change', handlers.fileChange);
            }
            if (modal && handlers?.modalClick) {
                modal.removeEventListener('click', handlers.modalClick);
            }
        }

        // Manual entry mode event listener unbinding
        if (manualAccessToken && handlers?.updateManualBtnState) {
            manualAccessToken.removeEventListener('input', handlers.updateManualBtnState);
        }
        if (manualRefreshToken && handlers?.updateManualBtnState) {
            manualRefreshToken.removeEventListener('input', handlers.updateManualBtnState);
        }

        importModalHandlers = null;
    }

    const modal = document.getElementById('importUploadModal');
    if (modal) {
        modal.remove();
    }
    pendingImportData = null;
}

// Confirm import/add from modal
async function confirmImportFromModal() {
    // Manual entry mode
    if (currentImportTab === 'manual') {
        const accessToken = document.getElementById('manualAccessToken').value.trim();
        const refreshToken = document.getElementById('manualRefreshToken').value.trim();
        const projectId = document.getElementById('manualProjectId').value.trim();
        const expiresIn = parseInt(document.getElementById('manualExpiresIn').value) || 3599;

        if (!accessToken || !refreshToken) {
            showToast('Please fill in complete token information', 'warning');
            return;
        }

        showLoading('Adding token...');
        try {
            const tokenData = { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn };
            if (projectId) {
                tokenData.projectId = projectId;
            }
            const response = await authFetch('/admin/tokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tokenData)
            });

            const data = await response.json();
            hideLoading();

            if (data.success) {
                closeImportModal();
                showToast('Token added successfully', 'success');
                loadTokens();
            } else {
                showToast(data.message || 'Add failed', 'error');
            }
        } catch (error) {
            hideLoading();
            showToast('Add failed: ' + error.message, 'error');
        }
        return;
    }

    // File upload or JSON import mode
    if (!pendingImportData) {
        showToast('Please select file or parse JSON first', 'warning');
        return;
    }

    const mode = document.getElementById('importMode').value;
    const password = document.getElementById('importPassword').value;

    if (!password) {
        showToast('Please enter admin password', 'warning');
        return;
    }

    showLoading('Importing...');
    try {
        const response = await authFetch('/admin/tokens/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, data: pendingImportData, mode })
        });

        const data = await response.json();
        hideLoading();

        if (data.success) {
            closeImportModal();
            showToast(data.message, 'success');
            loadTokens();
        } else {
            // Show specific error message when password is wrong
            if (response.status === 403) {
                showToast('Incorrect password, please try again', 'error');
            } else {
                showToast(data.message || 'Import failed', 'error');
            }
        }
    } catch (error) {
        hideLoading();
        showToast('Import failed: ' + error.message, 'error');
    }
}

// Password input prompt
function showPasswordPrompt(message) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal form-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-title">🔐 Password verification</div>
                <p>${message}</p>
                <div class="form-group">
                    <input type="password" id="promptPassword" placeholder="Please enter password">
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="promptCancelBtn">Cancel</button>
                    <button class="btn btn-success" id="promptConfirmBtn">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const passwordInput = document.getElementById('promptPassword');
        const confirmBtn = document.getElementById('promptConfirmBtn');
        const cancelBtn = document.getElementById('promptCancelBtn');

        // Cleanup function
        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            passwordInput.removeEventListener('keydown', handleKeydown);
            modal.removeEventListener('click', handleModalClick);
            modal.remove();
        };

        const handleConfirm = () => {
            const password = passwordInput.value;
            cleanup();
            resolve(password || null);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                handleConfirm();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        };

        const handleModalClick = (e) => {
            if (e.target === modal) {
                cleanup();
                resolve(null);
            }
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        passwordInput.addEventListener('keydown', handleKeydown);
        modal.addEventListener('click', handleModalClick);

        passwordInput.focus();
    });
}

// Manual toggle action bar display/hide (exposed to global)
window.toggleActionBar = function () {
    const actionBar = document.getElementById('actionBar');
    const toggleBtn = document.getElementById('actionToggleBtn');

    if (!actionBar || !toggleBtn) return;

    actionBarCollapsed = !actionBarCollapsed;
    localStorage.setItem('actionBarCollapsed', actionBarCollapsed);

    if (actionBarCollapsed) {
        actionBar.classList.add('collapsed');
        toggleBtn.classList.add('collapsed');
        toggleBtn.title = 'Expand action buttons';
    } else {
        actionBar.classList.remove('collapsed');
        toggleBtn.classList.remove('collapsed');
        toggleBtn.title = 'Collapse action buttons';
    }
}

// Initialize action bar state (restore saved collapse/expand state)
function initActionBarState() {
    const actionBar = document.getElementById('actionBar');
    const toggleBtn = document.getElementById('actionToggleBtn');

    if (!actionBar || !toggleBtn) return;

    // Restore saved state
    if (actionBarCollapsed) {
        actionBar.classList.add('collapsed');
        toggleBtn.classList.add('collapsed');
        toggleBtn.title = 'Expand action buttons';
    }
}

// Initialize after page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initActionBarState);
} else {
    initActionBarState();
}

// Initialize filter state
function initFilterState() {
    const savedFilter = localStorage.getItem('tokenFilter') || 'all';
    currentFilter = savedFilter;
    updateFilterButtonState(savedFilter);
}

// Update filter button state
function updateFilterButtonState(filter) {
    document.querySelectorAll('.stat-item').forEach(item => {
        item.classList.remove('active');
    });
    const filterMap = { 'all': 'totalTokens', 'enabled': 'enabledTokens', 'disabled': 'disabledTokens' };
    const activeElement = document.getElementById(filterMap[filter]);
    if (activeElement) {
        activeElement.closest('.stat-item').classList.add('active');
    }
}

// Filter tokens
function filterTokens(filter) {
    currentFilter = filter;
    localStorage.setItem('tokenFilter', filter); // Persist filter state

    updateFilterButtonState(filter);

    // Re-render
    renderTokens(cachedTokens);
}

async function loadTokens() {
    try {
        const response = await authFetch('/admin/tokens');

        const data = await response.json();
        if (data.success) {
            renderTokens(data.data);
        } else {
            showToast('Load failed: ' + (data.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showToast('Failed to load tokens: ' + error.message, 'error');
    }
}

// Set of tokens being refreshed (using tokenId)
const refreshingTokens = new Set();

// Limit refreshingTokens set size to prevent memory leaks
function cleanupRefreshingTokens() {
    // If set is too large, clear it (normally there shouldn't be many tokens refreshing at the same time)
    if (refreshingTokens.size > 100) {
        refreshingTokens.clear();
    }
}

function renderTokens(tokens) {
    // Only update cache on first load
    if (tokens !== cachedTokens) {
        cachedTokens = tokens;
    }

    document.getElementById('totalTokens').textContent = tokens.length;
    document.getElementById('enabledTokens').textContent = tokens.filter(t => t.enable).length;
    document.getElementById('disabledTokens').textContent = tokens.filter(t => !t.enable).length;

    // Filter by condition
    let filteredTokens = tokens;
    if (currentFilter === 'enabled') {
        filteredTokens = tokens.filter(t => t.enable);
    } else if (currentFilter === 'disabled') {
        filteredTokens = tokens.filter(t => !t.enable);
    }

    const tokenList = document.getElementById('tokenList');
    if (filteredTokens.length === 0) {
        const emptyText = currentFilter === 'all' ? 'No tokens' :
            currentFilter === 'enabled' ? 'No enabled tokens' : 'No disabled tokens';
        const emptyHint = currentFilter === 'all' ? 'Click OAuth button above to add token' : 'Click "Total" above to view all';
        tokenList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <div class="empty-state-text">${emptyText}</div>
                <div class="empty-state-hint">${emptyHint}</div>
            </div>
        `;
        return;
    }

    tokenList.innerHTML = filteredTokens.map((token, index) => {
        // Use safe tokenId to replace refresh_token
        const tokenId = token.id;
        const isRefreshing = refreshingTokens.has(tokenId);
        const cardId = tokenId.substring(0, 8);

        // Calculate sequence number in original list (based on addition order)
        const originalIndex = cachedTokens.findIndex(t => t.id === token.id);
        const tokenNumber = originalIndex + 1;

        // Escape all user data to prevent XSS
        const safeTokenId = escapeJs(tokenId);
        const safeProjectId = escapeHtml(token.projectId || '');
        const safeEmail = escapeHtml(token.email || '');
        const safeProjectIdJs = escapeJs(token.projectId || '');
        const safeEmailJs = escapeJs(token.email || '');

        return `
        <div class="token-card ${!token.enable ? 'disabled' : ''} ${isRefreshing ? 'refreshing' : ''} ${skipAnimation ? 'no-animation' : ''}" id="card-${escapeHtml(cardId)}">
            <div class="token-header">
                <div class="token-header-left">
                    <span class="status ${token.enable ? 'enabled' : 'disabled'}">
                        ${token.enable ? '✅ Enabled' : '❌ Disabled'}
                    </span>
                    <button class="btn-icon token-refresh-btn ${isRefreshing ? 'loading' : ''}" id="refresh-btn-${escapeHtml(cardId)}" onclick="manualRefreshToken('${safeTokenId}')" title="Refresh token" ${isRefreshing ? 'disabled' : ''}>🔄</button>
                </div>
                <div class="token-header-right">
                    <button class="btn-icon" onclick="showTokenDetail('${safeTokenId}')" title="Edit">✏️</button>
                    <span class="token-id">#${tokenNumber}</span>
                </div>
            </div>
            <div class="token-info">
                <div class="info-row editable sensitive-row" onclick="editField(event, '${safeTokenId}', 'projectId', '${safeProjectIdJs}')" title="Click to edit">
                    <span class="info-label">📦</span>
                    <span class="info-value sensitive-info">${safeProjectId || 'Click to set'}</span>
                    <span class="info-edit-icon">✏️</span>
                    <button class="btn btn-xs btn-info fetch-project-btn" onclick="fetchProjectId(event, '${safeTokenId}')" title="Fetch Project ID from API">🔍</button>
                </div>
                <div class="info-row editable sensitive-row" onclick="editField(event, '${safeTokenId}', 'email', '${safeEmailJs}')" title="Click to edit">
                    <span class="info-label">📧</span>
                    <span class="info-value sensitive-info">${safeEmail || 'Click to set'}</span>
                    <span class="info-edit-icon">✏️</span>
                </div>
            </div>
            <div class="token-id-row" title="Token ID: ${escapeHtml(tokenId)}">
                <span class="token-id-label">🔑</span>
                <span class="token-id-value">${escapeHtml(tokenId.length > 24 ? tokenId.substring(0, 12) + '...' + tokenId.substring(tokenId.length - 8) : tokenId)}</span>
            </div>
            <div class="token-quota-inline" id="quota-inline-${escapeHtml(cardId)}">
                <div class="quota-inline-header" onclick="toggleQuotaExpand('${escapeJs(cardId)}', '${safeTokenId}')">
                    <span class="quota-inline-summary" id="quota-summary-${escapeHtml(cardId)}">📊 Loading...</span>
                    <span class="quota-inline-toggle" id="quota-toggle-${escapeHtml(cardId)}">▼</span>
                </div>
                <div class="quota-inline-detail hidden" id="quota-detail-${escapeHtml(cardId)}"></div>
            </div>
            <div class="token-actions">
                <button class="btn btn-info btn-xs" onclick="showQuotaModal('${safeTokenId}')" title="View quota">📊 Details</button>
                <button class="btn ${token.enable ? 'btn-warning' : 'btn-success'} btn-xs" onclick="toggleToken('${safeTokenId}', ${!token.enable})" title="${token.enable ? 'Disable' : 'Enable'}">
                    ${token.enable ? '⏸️ Disable' : '▶️ Enable'}
                </button>
                <button class="btn btn-danger btn-xs" onclick="deleteToken('${safeTokenId}')" title="Delete">🗑️ Delete</button>
            </div>
        </div>
    `}).join('');

    filteredTokens.forEach(token => {
        loadTokenQuotaSummary(token.id);
    });

    updateSensitiveInfoDisplay();

    // Reset animation skip flag
    skipAnimation = false;
}

// Manual refresh token (using tokenId)
async function manualRefreshToken(tokenId) {
    if (refreshingTokens.has(tokenId)) {
        showToast('This token is currently being refreshed', 'warning');
        return;
    }
    await autoRefreshToken(tokenId);
}

// Refresh specified token (manually triggered, using tokenId)
async function autoRefreshToken(tokenId) {
    if (refreshingTokens.has(tokenId)) return;

    refreshingTokens.add(tokenId);
    const cardId = tokenId.substring(0, 8);

    // Update UI to show refreshing status
    const card = document.getElementById(`card-${cardId}`);
    const refreshBtn = document.getElementById(`refresh-btn-${cardId}`);
    if (card) {
        card.classList.remove('refresh-failed');
        card.classList.add('refreshing');
    }
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.classList.add('loading');
        refreshBtn.textContent = '🔄';
    }

    try {
        const response = await authFetch(`/admin/tokens/${encodeURIComponent(tokenId)}/refresh`, {
            method: 'POST'
        });

        const data = await response.json();
        if (data.success) {
            showToast('Token auto-refreshed successfully', 'success');
            // Reload list after successful refresh
            refreshingTokens.delete(tokenId);
            if (card) card.classList.remove('refreshing');
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('loading');
                refreshBtn.textContent = '🔄';
            }
            loadTokens();
        } else {
            showToast(`Token refresh failed: ${data.message || 'Unknown error'}`, 'error');
            refreshingTokens.delete(tokenId);
            // Update UI to show refresh failed
            if (card) {
                card.classList.remove('refreshing');
                card.classList.add('refresh-failed');
            }
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('loading');
                refreshBtn.textContent = '🔄';
            }
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showToast(`Token refresh failed: ${error.message}`, 'error');
        }
        refreshingTokens.delete(tokenId);
        // Update UI to show refresh failed
        if (card) {
            card.classList.remove('refreshing');
            card.classList.add('refresh-failed');
        }
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.classList.remove('loading');
            refreshBtn.textContent = '🔄';
        }
    }
}

// showManualModal has been merged into showImportUploadModal
function showManualModal() {
    // Open import dialog and switch to manual entry tab
    showImportUploadModal();
    // Delay switching tabs to ensure DOM is rendered
    setTimeout(() => switchImportTab('manual'), 0);
}

function editField(event, tokenId, field, currentValue) {
    event.stopPropagation();
    const row = event.currentTarget;
    const valueSpan = row.querySelector('.info-value');

    if (row.querySelector('input')) return;

    const fieldLabels = { projectId: 'Project ID', email: 'Email' };

    const input = document.createElement('input');
    input.type = field === 'email' ? 'email' : 'text';
    input.value = currentValue;
    input.className = 'inline-edit-input';
    input.placeholder = `Enter ${fieldLabels[field]}`;

    valueSpan.style.display = 'none';
    row.insertBefore(input, valueSpan.nextSibling);
    input.focus();
    input.select();

    const save = async () => {
        const newValue = input.value.trim();
        input.disabled = true;

        try {
            const response = await authFetch(`/admin/tokens/${encodeURIComponent(tokenId)}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ [field]: newValue })
            });

            const data = await response.json();
            if (data.success) {
                showToast('Saved successfully', 'success');
                loadTokens();
            } else {
                showToast(data.message || 'Failed to save', 'error');
                cancel();
            }
        } catch (error) {
            showToast('Failed to save', 'error');
            cancel();
        }
    };

    const cancel = () => {
        input.remove();
        valueSpan.style.display = '';
    };

    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (document.activeElement !== input) {
                if (input.value.trim() !== currentValue) {
                    save();
                } else {
                    cancel();
                }
            }
        }, 100);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            save();
        } else if (e.key === 'Escape') {
            cancel();
        }
    });
}

function showTokenDetail(tokenId) {
    const token = cachedTokens.find(t => t.id === tokenId);
    if (!token) {
        showToast('Token does not exist', 'error');
        return;
    }

    // Escape all user data to prevent XSS attacks
    const safeTokenId = escapeJs(tokenId);
    const safeProjectId = escapeHtml(token.projectId || '');
    const safeEmail = escapeHtml(token.email || '');
    const updatedAtStr = escapeHtml(token.timestamp ? new Date(token.timestamp).toLocaleString('en-US') : 'Unknown');

    const modal = document.createElement('div');
    modal.className = 'modal form-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">📝 Token details</div>
            <div class="form-group compact">
                <label>🔑 Token ID</label>
                <div class="token-display">${escapeHtml(tokenId)}</div>
            </div>
            <div class="form-group compact">
                <label>📦 Project ID</label>
                <input type="text" id="editProjectId" value="${safeProjectId}" placeholder="Project ID">
            </div>
            <div class="form-group compact">
                <label>📧 Email</label>
                <input type="email" id="editEmail" value="${safeEmail}" placeholder="Account Email">
            </div>
            <div class="form-group compact">
                <label>🕒 Last Updated</label>
                <input type="text" value="${updatedAtStr}" readonly style="background: var(--bg); cursor: not-allowed;">
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-success" onclick="saveTokenDetail('${safeTokenId}')">💾 Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

async function saveTokenDetail(tokenId) {
    const projectId = document.getElementById('editProjectId').value.trim();
    const email = document.getElementById('editEmail').value.trim();

    showLoading('Saving...');
    try {
        const response = await authFetch(`/admin/tokens/${encodeURIComponent(tokenId)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ projectId, email })
        });

        const data = await response.json();
        hideLoading();
        if (data.success) {
            document.querySelector('.form-modal').remove();
            showToast('Save successful', 'success');
            loadTokens();
        } else {
            showToast(data.message || 'Save failed', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Save failed: ' + error.message, 'error');
    }
}

async function toggleToken(tokenId, enable) {
    const action = enable ? 'Enable' : 'Disable';
    const confirmed = await showConfirm(`Are you sure to ${action} this token?`, `${action} confirmation`);
    if (!confirmed) return;

    showLoading(`${action}ing...`);
    try {
        const response = await authFetch(`/admin/tokens/${encodeURIComponent(tokenId)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enable })
        });

        const data = await response.json();
        hideLoading();
        if (data.success) {
            showToast(`${action}ed`, 'success');
            skipAnimation = true; // Skip animation
            loadTokens();
        } else {
            showToast(data.message || 'Operation failed', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Operation failed: ' + error.message, 'error');
    }
}

async function deleteToken(tokenId) {
    const confirmed = await showConfirm('Cannot be recovered after deletion, are you sure to delete?', '⚠️ Delete confirmation');
    if (!confirmed) return;

    showLoading('Deleting...');
    try {
        const response = await authFetch(`/admin/tokens/${encodeURIComponent(tokenId)}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        hideLoading();
        if (data.success) {
            showToast('Deleted', 'success');
            loadTokens();
        } else {
            showToast(data.message || 'Delete failed', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Delete failed: ' + error.message, 'error');
    }
}

// Auto-fetch Project ID in manual form
async function fetchProjectIdForManual() {
    const accessToken = document.getElementById('manualAccessToken').value.trim();
    const refreshToken = document.getElementById('manualRefreshToken').value.trim();

    if (!accessToken || !refreshToken) {
        showToast('Please fill in Access Token and Refresh Token first', 'warning');
        return;
    }

    const btn = document.getElementById('fetchProjectIdBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Fetching...';

    try {
        // First add token (temporarily), then fetch Project ID
        const addResponse = await authFetch('/admin/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: 3599
            })
        });

        const addData = await addResponse.json();
        if (!addData.success) {
            throw new Error(addData.message || 'Failed to add token');
        }

        const tokenId = addData.tokenId;

        // Fetch Project ID
        const fetchResponse = await authFetch(`/admin/tokens/${encodeURIComponent(tokenId)}/fetch-project-id`, {
            method: 'POST'
        });

        const fetchData = await fetchResponse.json();

        if (fetchData.success && fetchData.projectId) {
            document.getElementById('manualProjectId').value = fetchData.projectId;
            showToast(`Fetch successful: ${fetchData.projectId}`, 'success');

            // Delete temporarily added token (because user hasn't confirmed yet)
            await authFetch(`/admin/tokens/${encodeURIComponent(tokenId)}`, {
                method: 'DELETE'
            });
        } else {
            // Delete temporary token
            await authFetch(`/admin/tokens/${encodeURIComponent(tokenId)}`, {
                method: 'DELETE'
            });
            throw new Error(fetchData.message || 'This account cannot fetch Project ID');
        }
    } catch (error) {
        showToast('Fetch failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}
