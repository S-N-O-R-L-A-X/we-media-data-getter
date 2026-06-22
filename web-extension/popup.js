// ============================================
// 百度贴吧视频数据提取器 - Popup Script
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // DOM 元素引用
    const currentPageEl = document.getElementById('currentPage');
    const totalCountEl = document.getElementById('totalCount');
    const extractionStatusEl = document.getElementById('extractionStatus');
    
    const extractBtn = document.getElementById('extractBtn');
    const startAutoBtn = document.getElementById('startAutoBtn');
    const stopAutoBtn = document.getElementById('stopAutoBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const clearDataBtn = document.getElementById('clearDataBtn');
    
    const pageCountInput = document.getElementById('pageCount');
    const cutoffDateInput = document.getElementById('cutoffDate');
    const maxPagesInput = document.getElementById('maxPages');
    const pageDelayInput = document.getElementById('pageDelay');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    
    const messageBox = document.getElementById('messageBox');

    // 显示消息
    function showMessage(message, type = 'info') {
        messageBox.textContent = message;
        messageBox.className = `message-box ${type}`;
        
        setTimeout(() => {
            messageBox.textContent = '';
            messageBox.className = 'message-box';
        }, 3000);
    }

    // 获取当前活动标签页
    async function getActiveTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    }

    // 检查是否在正确的页面
    function isInCorrectPage(url) {
        return url && url.startsWith('https://tieba.baidu.com/home/creative/work');
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
            extractBtn.disabled = true;
            startAutoBtn.disabled = true;
            stopAutoBtn.disabled = false;
            exportCsvBtn.disabled = true;
        } else {
            extractionStatusEl.textContent = '空闲';
            extractionStatusEl.className = 'status-badge idle';
            extractBtn.disabled = false;
            startAutoBtn.disabled = false;
            stopAutoBtn.disabled = true;
            
            if (total > 0) {
                exportCsvBtn.disabled = false;
            } else {
                exportCsvBtn.disabled = true;
            }
        }
    }

    // 加载设置
    async function loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get({
                cutoffDate: '2026-05-25',
                maxPages: 42,
                pageDelay: 3
            }, (settings) => {
                cutoffDateInput.value = settings.cutoffDate;
                maxPagesInput.value = settings.maxPages;
                pageDelayInput.value = settings.pageDelay;
                resolve(settings);
            });
        });
    }

    // 保存设置
    async function saveSettings() {
        await chrome.storage.sync.set({
            cutoffDate: cutoffDateInput.value,
            maxPages: parseInt(maxPagesInput.value),
            pageDelay: parseInt(pageDelayInput.value)
        });
        showMessage('✅ 设置已保存', 'success');
    }

    // 提取当前页
    async function extractCurrentPage() {
        const tab = await getActiveTab();
        
        if (!isInCorrectPage(tab.url)) {
            showMessage('❌ 请在百度贴吧创作页面 (https://tieba.baidu.com/home/creative/work) 使用此功能', 'error');
            return;
        }

        try {
            const response = await sendMessageToContent('extractNow');
            if (response && response.success) {
                updateUI(
                    response.isRunning,
                    response.currentPage,
                    response.total
                );
                showMessage(`✅ 已提取 ${response.filtered} 条数据，累计 ${response.total} 条`, 'success');
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
        const tab = await getActiveTab();
        
        if (!isInCorrectPage(tab.url)) {
            showMessage('❌ 请在百度贴吧创作页面 (https://tieba.baidu.com/home/creative/work) 使用此功能', 'error');
            return;
        }

        const pages = parseInt(pageCountInput.value) || 42;
        
        try {
            const response = await sendMessageToContent('startAutoExtraction', { pages });
            if (response && response.success) {
                updateUI(response.isRunning, response.currentPage, response.totalCount);
                showMessage(`✅ 自动抓取已开始，目标页数：${pages}`, 'success');
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
        const tab = await getActiveTab();
        
        if (!isInCorrectPage(tab.url)) {
            showMessage('❌ 请在百度贴吧创作页面 (https://tieba.baidu.com/home/creative/work) 使用此功能', 'error');
            return;
        }

        try {
            const response = await sendMessageToContent('exportToCSV');
            if (response && response.success) {
                showMessage(`✅ 已导出 ${response.count} 条数据`, 'success');
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

    // 加载页面时的初始化
    async function init() {
        // 加载设置
        await loadSettings();
        
        // 更新按钮状态
        updateUI(false, null, 0);
    }

    // 绑定事件
    extractBtn.addEventListener('click', extractCurrentPage);
    startAutoBtn.addEventListener('click', startAutoExtraction);
    stopAutoBtn.addEventListener('click', stopExtraction);
    exportCsvBtn.addEventListener('click', exportCSV);
    clearDataBtn.addEventListener('click', clearData);
    saveSettingsBtn.addEventListener('click', saveSettings);

    // 初始化
    init();
});