// IP blocking management

async function loadBlockedIPs() {
  try {
    const response = await authFetch('/admin/blocked-ips');
    
    if (!response.ok) throw new Error('Failed to fetch blocked IP list');
    
    const data = await response.json();
    renderBlockedIPs(data.data);
  } catch (error) {
    console.error('Failed to load blocked IP list:', error);
    showToast('Failed to load blocked IP list', 'error');
  }
}

function renderBlockedIPs(blockedIPs) {
  const container = document.getElementById('blockedIPsList');
  
  if (!blockedIPs || blockedIPs.length === 0) {
    container.innerHTML = '<div class="empty-state-small">No blocked IPs</div>';
    return;
  }
  
  container.innerHTML = blockedIPs.map(item => {
    const isPermanent = item.permanent;
    const expiresAt = item.expiresAt ? new Date(item.expiresAt).toLocaleString('zh-CN') : '';
    const tempBlockCount = item.tempBlockCount || 0;
    
    return `
      <div class="blocked-ip-item ${isPermanent ? 'permanent' : 'temporary'}">
        <div class="blocked-ip-header">
          <span class="blocked-ip-address">${item.ip}</span>
          <span class="blocked-ip-type ${isPermanent ? 'permanent' : 'temporary'}">
            ${isPermanent ? 'Permanent Block' : 'Temporary Block'}
          </span>
        </div>
        <div class="blocked-ip-info">
          ${!isPermanent && expiresAt ? `<div>⏰ Unblock Time: ${expiresAt}</div>` : ''}
          <div>🔢 Total Blocks: ${tempBlockCount} times</div>
        </div>
        <div class="blocked-ip-actions">
          <button class="btn btn-sm btn-warning" onclick="unblockIP('${item.ip}')">
            🔓 Unblock
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function unblockIP(ip) {
  if (!confirm(`Are you sure you want to unblock ${ip}?`)) return;
  
  try {
    const response = await authFetch('/admin/unblock-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(data.message || 'IP unblocked successfully', 'success');
      loadBlockedIPs();
    } else {
      showToast(data.message || 'Failed to unblock IP', 'error');
    }
  } catch (error) {
    console.error('Failed to unblock IP:', error);
    showToast('Failed to unblock IP', 'error');
  }
}

// Whitelist management
async function loadWhitelistIPs() {
  try {
    const response = await authFetch('/admin/security-config');
    const data = await response.json();
    
    if (data.success) {
      // 更新临时列表
      tempWhitelistIPs = [...(data.data.whitelist.ips || [])];
      renderWhitelistIPs(tempWhitelistIPs);
      
      // 更新封禁开关状态
      const checkbox = document.getElementById('blockingEnabled');
      if (checkbox) checkbox.checked = data.data.blocking.enabled;
    }
  } catch (error) {
    console.error('Failed to load whitelist:', error);
  }
}

function renderWhitelistIPs(ips) {
  const container = document.getElementById('whitelistIPsList');
  
  if (!ips || ips.length === 0) {
    container.innerHTML = '<div class="empty-state-small">No whitelist IPs</div>';
    return;
  }
  
  container.innerHTML = ips.map(ip => `
    <div class="whitelist-ip-tag">
      <span>${ip}</span>
      <button onclick="removeWhitelistIP('${ip}')" title="Remove">✕</button>
    </div>
  `).join('');
}

// Temporary storage of whitelist IP list (unsaved state)
let tempWhitelistIPs = [];

function addWhitelistIP() {
  const input = document.getElementById('whitelistIPInput');
  const ip = input.value.trim();
  
  if (!ip) {
    showToast('Please enter an IP address', 'warning');
    return;
  }
  
  // Simple IP format validation
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  if (!ipPattern.test(ip)) {
    showToast('Invalid IP address format', 'warning');
    return;
  }
  
  // Check if already exists
  if (tempWhitelistIPs.includes(ip)) {
    showToast('This IP is already in the whitelist', 'warning');
    return;
  }
  
  // Add to temporary list
  tempWhitelistIPs.push(ip);
  input.value = '';
  
  // Update display
  renderWhitelistIPs(tempWhitelistIPs);
  //showToast('Added, please click the Save Config button to save', 'info');
}

function removeWhitelistIP(ip) {
  // Remove from temporary list
  tempWhitelistIPs = tempWhitelistIPs.filter(item => item !== ip);
  
  // Update display
  renderWhitelistIPs(tempWhitelistIPs);
  //showToast('Removed, please click the Save Config button to save', 'info');
}
