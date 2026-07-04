// ============================================
// 视频数据提取器 - Popup Script（支持贴吧和抖音）
// ============================================

// 监听来自 background/content-script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Popup] Received message:', message);
    
    if (message.action === 'extractionProgress') {
        const totalCountEl = document.getElementById('totalCount');
        const extractionStatusEl = document.getElementById('extractionStatus');
        const startAutoBtn = document.getElementById('startAutoBtn');
        const exportCsvBtn = document.getElementById('exportCsvBtn');
        const messageBox = document.getElementById('messageBox');
        
        // 更新 UI 状态
        if (totalCountEl) totalCountEl.textContent = message.totalItems || message.total || '0';
        
        if (extractionStatusEl) {
            extractionStatusEl.textContent = message.isRunning ? '抓取中...' : '空闲';
            extractionStatusEl.className = `status-badge ${message.isRunning ? 'running' : 'idle'}`;
        }
        
        if (startAutoBtn) startAutoBtn.disabled = message.isRunning;
        if (exportCsvBtn) exportCsvBtn.disabled = message.isRunning;
        
        // 显示消息
        if (messageBox) {
            if (!message.isRunning && message.success) {
                messageBox.textContent = `✅ 抓取完成！共提取 ${message.totalItems || 0} 条数据`;
                messageBox.className = 'message-box success';
                setTimeout(() => {
                    if (messageBox) {
                        messageBox.textContent = '';
                        messageBox.className = 'message-box';
                    }
                }, 3000);
            } else if (!message.isRunning && !message.success) {
                messageBox.textContent = '❌ ' + (message.error || '抓取失败');
                messageBox.className = 'message-box error';
                setTimeout(() => {
                    if (messageBox) {
                        messageBox.textContent = '';
                        messageBox.className = 'message-box';
                    }
                }, 3000);
            }
        }
    }
    
    sendResponse({ success: true });
    return true;
});

document.addEventListener('DOMContentLoaded', async () => {
    // DOM 元素引用
    const totalCountEl = document.getElementById('totalCount');
    const extractionStatusEl = document.getElementById('extractionStatus');
    
    const startAutoBtn = document.getElementById('startAutoBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const clearDataBtn = document.getElementById('clearDataBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    
    const pageTitle = document.getElementById('pageTitle');
    
    const messageBox = document.getElementById('messageBox');
    
    // 当前平台类型
    let currentPlatform = 'tieba'; // 'tieba' 或 'douyin'
    
    // 设置模态框元素
    let settingsModal = null;
    let cutoffDateInput = null;
    let maxPagesInput = null;
    let autoPageDelayInput = null;
    let waitForPageLoadTimeoutInput = null;
    let enableNotificationsCheckbox = null;
    let filterBlockedCheckbox = null;
    let exportFormatSelect = null;
    let saveSettingsBtn = null;
    let resetSettingsBtn = null;
    let closeSettingsBtn = null;

    // 显示消息
    function showMessage(message, type = 'info') {
        if (!messageBox) return;
        messageBox.textContent = message;
        messageBox.className = `message-box ${type}`;
        
        setTimeout(() => {
            if (messageBox) {
                messageBox.textContent = '';
                messageBox.className = 'message-box';
            }
        }, 3000);
    }
    
    // 检查是否是抖音页面
    function isDouyinPage() {
        return window.location.href.includes('creator.douyin.com/creator-micro/content/manage');
    }
    
    // 检查是否是贴吧页面
    function isTiebaPage() {
        return window.location.href.startsWith('https://tieba.baidu.com/home/creative/work');
    }
    
    // 获取当前活动标签页
    async function getActiveTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    }
    
    // 注入 content script 到当前标签页
    async function injectContentScript(tabId) {
        return new Promise((resolve, reject) => {
            chrome.scripting.executeScript({
                target: { tabId },
                files: ['content-script.js']
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    // 发送消息到 content script（带注入回退）
    async function sendMessageToContent(action, data = {}) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
            throw new Error('No active tab found');
        }
        
        const tab = tabs[0];
        if (!tab.id) {
            throw new Error('Tab has no ID');
        }
        
        // 尝试发送消息，如果失败则注入 content script 后重试一次
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(tab.id, { action, ...data }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response || { success: true });
                        }
                    });
                    
                    // 设置超时
                    setTimeout(() => reject(new Error('Request timeout')), 10000);
                });
                return response; // 成功则返回
            } catch (error) {
                const msg = error.message || '';
                // 如果是因为 content script 不存在，注入后重试一次
                if (attempt === 0 && msg.includes('Receiving end does not exist')) {
                    console.log('[Popup] Content script not found, injecting...');
                    await injectContentScript(tab.id);
                    // 等待 content script 初始化
                    await new Promise(r => setTimeout(r, 500));
                    continue; // 重试
                }
                throw error; // 其他错误直接抛出
            }
        }
    }
    
    // 更新 UI 状态
    function updateUI(isRunning, currentPage, total) {
        if (totalCountEl) totalCountEl.textContent = total || '0';
        
        if (extractionStatusEl) {
            extractionStatusEl.textContent = isRunning ? '抓取中...' : '空闲';
            extractionStatusEl.className = `status-badge ${isRunning ? 'running' : 'idle'}`;
        }
        
        if (startAutoBtn) startAutoBtn.disabled = isRunning;
        if (exportCsvBtn) exportCsvBtn.disabled = isRunning || (total <= 0);
    }
    
    // ====================
    // 设置相关功能
    // ====================
    
    // 打开设置模态框
    async function openSettings() {
        if (!settingsModal) return;
        
        settingsModal.classList.remove('hidden');
        
        // 从 storage 加载当前配置
        const config = await ConfigManager.get();
        
        // 填充表单
        if (cutoffDateInput) {
            if (config.cutoffDate) {
                const cutoffDate = new Date(config.cutoffDate);
                cutoffDateInput.value = cutoffDate.toISOString().split('T')[0];
            } else {
                cutoffDateInput.value = '';
            }
        }
        
        if (maxPagesInput) maxPagesInput.value = config.maxPages;
        if (autoPageDelayInput) autoPageDelayInput.value = config.autoPageDelay;
        if (waitForPageLoadTimeoutInput) waitForPageLoadTimeoutInput.value = config.waitForPageLoadTimeout;
        if (enableNotificationsCheckbox) enableNotificationsCheckbox.checked = config.enableNotifications;
        if (filterBlockedCheckbox) filterBlockedCheckbox.checked = config.filterBlocked || false;
        if (exportFormatSelect) exportFormatSelect.value = config.exportFormat;
    }
    
    // 关闭设置模态框
    function closeSettings() {
        if (settingsModal) {
            settingsModal.classList.add('hidden');
        }
    }
    
    // 保存设置
    async function saveSettings() {
        try {
            const cutoffDateStr = cutoffDateInput?.value;
            if (!cutoffDateStr) {
                showMessage('⚠️ 请选择截止日期', 'warning');
                return;
            }
            
            // 将截止日期设置为当天的 23:59:59，确保包含截止日期的全天数据
            const cutoffDateObj = new Date(cutoffDateStr);
            // 设置为当天最后一秒 (23:59:59)
            cutoffDateObj.setHours(23, 59, 59, 999);
            const config = {
                cutoffDate: cutoffDateObj.toISOString(),
                maxPages: parseInt(maxPagesInput?.value, 10),
                autoPageDelay: parseInt(autoPageDelayInput?.value, 10),
                waitForPageLoadTimeout: parseInt(waitForPageLoadTimeoutInput?.value, 10),
                enableNotifications: enableNotificationsCheckbox?.checked ?? true,
                filterBlocked: filterBlockedCheckbox?.checked ?? false,
                exportFormat: exportFormatSelect?.value || 'csv'
            };
            
            // 验证配置
            const validation = ConfigManager.validate(config);
            if (!validation.valid) {
                showMessage('⚠️ ' + validation.errors.join(', '), 'warning');
                return;
            }
            
            // 保存配置
            await ConfigManager.save(config);
            
            closeSettings();
            showMessage('✅ 设置已保存', 'success');
        } catch (error) {
            console.error('Save settings error:', error);
            showMessage('❌ 保存失败：' + error.message, 'error');
        }
    }
    
    // 重置设置为默认值
    async function resetSettings() {
        if (!confirm('确定要重置为默认设置吗？')) {
            return;
        }
        
        try {
            await ConfigManager.resetToDefault();
            
            // 刷新表单
            await openSettings();
            
            showMessage('✅ 已重置为默认设置', 'success');
        } catch (error) {
            console.error('Reset settings error:', error);
            showMessage('❌ 重置失败：' + error.message, 'error');
        }
    }
    
    // 初始化设置功能
    function initSettings() {
        settingsModal = document.getElementById('settingsModal');
        cutoffDateInput = document.getElementById('cutoffDate');
        maxPagesInput = document.getElementById('maxPages');
        autoPageDelayInput = document.getElementById('autoPageDelay');
        waitForPageLoadTimeoutInput = document.getElementById('waitForPageLoadTimeout');
        enableNotificationsCheckbox = document.getElementById('enableNotifications');
        filterBlockedCheckbox = document.getElementById('filterBlocked');
        exportFormatSelect = document.getElementById('exportFormat');
        saveSettingsBtn = document.getElementById('saveSettingsBtn');
        resetSettingsBtn = document.getElementById('resetSettingsBtn');
        closeSettingsBtn = document.getElementById('closeSettingsBtn');
        
        // 绑定事件
        if (settingsBtn) {
            settingsBtn.addEventListener('click', openSettings);
        }
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', closeSettings);
        }
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', saveSettings);
        }
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', resetSettings);
        }
        
        // 点击模态框外部关闭
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    closeSettings();
                }
            });
        }
        
        // ESC 键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !settingsModal.classList.contains('hidden')) {
                closeSettings();
            }
        });
    }
    
    // 初始化页面标题和检查是否在正确的页面
    async function init() {
        const tab = await getActiveTab();
        const url = tab?.url || '';
        
        // 设置页面标题
        if (url.includes('creator.douyin.com')) {
            currentPlatform = 'douyin';
            if (pageTitle) {
                pageTitle.textContent = '📊 抖音视频数据提取器';
            }
            
            if (!url.includes('creator.douyin.com/creator-micro/content/manage')) {
                showMessage('❌ 请在抖音创作者服务中心工作列表页面使用此功能', 'error');
                if (startAutoBtn) startAutoBtn.style.display = 'none';
                if (exportCsvBtn) exportCsvBtn.style.display = 'none';
                return;
            }
        } else if (url.startsWith('https://tieba.baidu.com/home/creative/work')) {
            currentPlatform = 'tieba';
            if (pageTitle) {
                pageTitle.textContent = '📊 百度贴吧数据提取器';
            }
        } else {
            // 不在任何支持的页面
            showMessage(`⚠️ 请打开抖音创作者服务平台或百度贴吧创作页面`, 'warning');
            if (startAutoBtn) startAutoBtn.style.display = 'none';
            if (exportCsvBtn) exportCsvBtn.style.display = 'none';
            return;
        }
        
        // 更新按钮文本
        if (currentPlatform === 'douyin') {
            if (startAutoBtn) startAutoBtn.innerHTML = '🚀 开始自动抓取<br><small>(抖音视频数据)</small>';
            if (exportCsvBtn) exportCsvBtn.innerHTML = '📁 导出抖音视频 CSV';
        } else {
            if (startAutoBtn) startAutoBtn.innerHTML = '🚀 开始自动抓取<br><small>(百度贴吧数据)</small>';
            if (exportCsvBtn) exportCsvBtn.innerHTML = '📁 导出贴吧数据 CSV';
        }
        
        // 更新 UI 状态
        updateUI(false, null, 0);
    }
    
    // 提取当前页
    async function extractCurrentPage() {
        try {
            const response = await sendMessageToContent('extractNow');
            if (response && response.success) {
                updateUI(
                    response.isRunning,
                    response.currentPage,
                    response.total
                );
                showMessage(`✅ 已提取 ${response.count} 条数据，累计 ${response.total} 条`, 'success');
            } else {
                showMessage('❌ 提取失败，请确认页面是否正确', 'error');
            }
        } catch (error) {
            console.error('Extract error:', error);
            showMessage('❌ 错误：' + error.message, 'error');
        }
    }
    
    // 开始自动抓取
    async function startAutoExtraction() {
        try {
            // 从全局配置获取最大页数
            const config = await ConfigManager.get(['maxPages']);
            const pages = config.maxPages || 42;
            
            const response = await sendMessageToContent('startAutoExtraction', { pages: pages });
            if (response && response.success) {
                updateUI(true, 0, 0);
                showMessage(`✅ 自动抓取已开始`, 'success');
            } else {
                showMessage('❌ 启动失败：' + (response?.error || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('Start auto error:', error);
            showMessage('❌ 错误：' + error.message, 'error');
        }
    }
    
    // 停止抓取
    async function stopExtraction() {
        try {
            const response = await sendMessageToContent('stopExtraction');
            if (response && response.success) {
                updateUI(false, 0, 0);
                showMessage('⏹️ 抓取已停止', 'info');
            }
        } catch (error) {
            console.error('Stop error:', error);
            showMessage('❌ 错误：' + error.message, 'error');
        }
    }
    
    // 导出 CSV
    async function exportCSV() {
        try {
            const response = await sendMessageToContent('exportToCSV');
            if (response && response.success) {
                showMessage(`✅ 已导出 ${response.count} 条数据`, 'success');
            } else {
                showMessage(response?.message || '❌ 导出失败', 'error');
            }
        } catch (error) {
            console.error('Export error:', error);
            showMessage('❌ 错误：' + error.message, 'error');
        }
    }
    
    // 清空数据
    async function clearData() {
        if (!confirm('确定要清空所有数据吗？')) {
            return;
        }
        
        try {
            await sendMessageToContent('clearData');
            updateUI(false, 0, 0);
            showMessage('🗑️ 数据已清空', 'info');
            
            // 也通知 background 脚本
            chrome.runtime.sendMessage({ action: 'clearData' });
        } catch (error) {
            console.error('Clear error:', error);
            showMessage('❌ 错误：' + error.message, 'error');
        }
    }
    
    // 绑定事件
    if (startAutoBtn) startAutoBtn.addEventListener('click', startAutoExtraction);
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCSV);
    if (clearDataBtn) clearDataBtn.addEventListener('click', clearData);
    
    // 初始化设置功能
    initSettings();
    
    // 从 storage 恢复提取状态
    async function restoreExtractionState() {
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['extractionState'], (result) => {
                    resolve(result);
                });
            });
            
            if (result.extractionState && result.extractionState.isRunning) {
                const state = result.extractionState;
                updateUI(true, state.currentPage, state.totalItems);
                showMessage(`⏳ 检测到正在进行的抓取任务 (${state.platform})`, 'info');
                
                // 如果 10 分钟后状态未更新，自动清除
                if (state.lastUpdate) {
                    const lastUpdate = new Date(state.lastUpdate);
                    const now = new Date();
                    const diffMinutes = (now - lastUpdate) / 60000;
                    
                    if (diffMinutes > 10) {
                        // 清除过期的状态
                        chrome.storage.local.remove(['extractionState']);
                        updateUI(false, 0, 0);
                    }
                }
            }
        } catch (error) {
            console.error('[Popup] 恢复状态失败:', error);
        }
    }
    
    // 初始化
    restoreExtractionState();
    init();
});