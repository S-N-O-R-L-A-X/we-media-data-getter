// ============================================
// 视频数据提取器 - Popup Script（支持贴吧和抖音）
// ============================================

// 监听来自 background/content-script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Popup] Received message:', message);
    
    if (message.action === 'extractionProgress') {
        const currentPageEl = document.getElementById('currentPage');
        const totalCountEl = document.getElementById('totalCount');
        const extractionStatusEl = document.getElementById('extractionStatus');
        const startAutoBtn = document.getElementById('startAutoBtn');
        const exportCsvBtn = document.getElementById('exportCsvBtn');
        const messageBox = document.getElementById('messageBox');
        
        // 更新 UI 状态
        if (currentPageEl) currentPageEl.textContent = message.currentPage || '--';
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
    const currentPageEl = document.getElementById('currentPage');
    const totalCountEl = document.getElementById('totalCount');
    const extractionStatusEl = document.getElementById('extractionStatus');
    
    const startAutoBtn = document.getElementById('startAutoBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const clearDataBtn = document.getElementById('clearDataBtn');
    
    const pageTitle = document.getElementById('pageTitle');
    
    const messageBox = document.getElementById('messageBox');
    
    // 当前平台类型
    let currentPlatform = 'tieba'; // 'tieba' 或 'douyin'

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
    
    // 发送消息到 content script
    function sendMessageToContent(action, data = {}) {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs || tabs.length === 0) {
                    reject(new Error('No active tab found'));
                    return;
                }
                
                const tab = tabs[0];
                if (!tab.id) {
                    reject(new Error('Tab has no ID'));
                    return;
                }
                
                // 使用带回调的 sendMessage
                chrome.tabs.sendMessage(tab.id, { action, ...data }, (response) => {
                    // 检查是否有运行时错误（如没有 listener）
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message;
                        console.error('[Popup] Message error:', errorMsg);
                        reject(new Error(errorMsg));
                    } else if (response && response.success !== undefined) {
                        // 成功收到响应
                        resolve(response);
                    } else {
                        // 收到了响应但没有 success 字段
                        resolve(response || { success: true });
                    }
                });
                
                // 设置超时处理
                setTimeout(() => {
                    reject(new Error('Request timeout'));
                }, 10000);
            });
        });
    }
    
    // 更新 UI 状态
    function updateUI(isRunning, currentPage, total) {
        if (currentPageEl) currentPageEl.textContent = currentPage || '--';
        if (totalCountEl) totalCountEl.textContent = total || '0';
        
        if (extractionStatusEl) {
            extractionStatusEl.textContent = isRunning ? '抓取中...' : '空闲';
            extractionStatusEl.className = `status-badge ${isRunning ? 'running' : 'idle'}`;
        }
        
        if (startAutoBtn) startAutoBtn.disabled = isRunning;
        if (exportCsvBtn) exportCsvBtn.disabled = isRunning || (total <= 0);
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
            const response = await sendMessageToContent('startAutoExtraction', { pages: 42 });
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
                
                // 如果10分钟后状态未更新，自动清除
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
