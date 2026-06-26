// ============================================
// 视频数据提取器 - Popup Script（支持贴吧和抖音）
// ============================================

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
        messageBox.textContent = message;
        messageBox.className = `message-box ${type}`;
        
        setTimeout(() => {
            messageBox.textContent = '';
            messageBox.className = 'message-box';
        }, 3000);
    }
    
    // 检查是否是抖音页面
    function isDouyinPage() {
        return window.location.href.includes('creator.douyin.com/janus/douyin/creator/pc/work_list');
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
            chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                if (!tabs || tabs.length === 0) {
                    reject(new Error('No active tab found'));
                    return;
                }
                
                const tab = tabs[0];
                
                try {
                    chrome.tabs.sendMessage(tab.id, { action, ...data }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
    
    // 更新 UI 状态
    function updateUI(isRunning, currentPage, total) {
        currentPageEl.textContent = currentPage || '--';
        totalCountEl.textContent = total || '0';
        
        if (isRunning) {
            extractionStatusEl.textContent = '抓取中...';
            extractionStatusEl.className = 'status-badge running';
            startAutoBtn.disabled = true;
            exportCsvBtn.disabled = true;
        } else {
            extractionStatusEl.textContent = '空闲';
            extractionStatusEl.className = 'status-badge idle';
            startAutoBtn.disabled = false;
            
            if (total > 0) {
                exportCsvBtn.disabled = false;
            } else {
                exportCsvBtn.disabled = true;
            }
        }
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
            
            if (!url.includes('janus/douyin/creator/pc/work_list')) {
                showMessage('❌ 请在抖音创作者服务中心工作列表页面使用此功能', 'error');
                startAutoBtn.style.display = 'none';
                exportCsvBtn.style.display = 'none';
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
            startAutoBtn.style.display = 'none';
            exportCsvBtn.style.display = 'none';
            return;
        }
        
        // 更新按钮文本
        if (currentPlatform === 'douyin') {
            startAutoBtn.innerHTML = '🚀 开始自动抓取<br><small>(抖音视频数据)</small>';
            exportCsvBtn.innerHTML = '📁 导出抖音视频 CSV';
        } else {
            startAutoBtn.innerHTML = '🚀 开始自动抓取<br><small>(百度贴吧数据)</small>';
            exportCsvBtn.innerHTML = '📁 导出贴吧数据 CSV';
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
    startAutoBtn.addEventListener('click', startAutoExtraction);
    exportCsvBtn.addEventListener('click', exportCSV);
    clearDataBtn.addEventListener('click', clearData);
    
    // 监听背景页面的数据更新
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'updateDouyinData' && currentPlatform === 'douyin') {
            updateUI(false, 0, message.total);
        } else if (message.action === 'updateExtractedData' && currentPlatform === 'tieba') {
            updateUI(false, 0, message.total);
        }
        sendResponse({ success: true });
    });
    
    // 初始化
    init();
});