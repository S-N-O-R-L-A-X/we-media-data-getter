// ============================================
// 百度贴吧视频数据提取器 - Background Service Worker
// ============================================

console.log('[TiebaExtractor] Background service worker started');

// Manifest V3 需要返回 true 以支持异步响应
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[TiebaExtractor] Received message:', message);

    switch (message.action) {
        case 'showNotification':
            // 使用 chrome.action.openPopup() 显示通知而不是 chrome.notifications
            console.log('[TiebaExtractor] Notification:', message.message);
            sendResponse({ success: true });
            return true; // 保持消息通道打开以支持异步响应
            break;

        case 'updateExtractedData':
            // 更新提取数据统计
            updateExtractionStats(message.count, message.total);
            sendResponse({ success: true });
            break;

        case 'extractionStarted':
            // 记录抓取开始
            recordExtractionStart(message.totalPages);
            sendResponse({ success: true });
            break;

        case 'extractionComplete':
            // 记录抓取完成
            recordExtractionComplete(message.totalCount);
            sendResponse({ success: true });
            break;

        case 'saveData':
            // 保存数据到 storage.local (避免 sync 配额限制)
            chrome.storage.local.set({ tiebaData: message.data })
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true; // 异步响应

        case 'getData':
            // 获取已保存的数据
            chrome.storage.local.get(['tiebaData'])
                .then(result => sendResponse({ data: result.tiebaData || [] }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true; // 异步响应

        case 'clearData':
            // 清空数据
            chrome.storage.local.remove('tiebaData')
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true; // 异步响应

        default:
            console.warn('[TiebaExtractor] Unknown action:', message.action);
            sendResponse({ success: false, error: 'Unknown action' });
    }
});

// Manifest V3 中使用 chrome.action.setBadgeText 替代通知
function updateBadge(text) {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: '#4a90d9' });
}

// 更新提取统计
let extractionStats = {
    currentTotal: 0,
    lastUpdate: null
};

function updateExtractionStats(countAdded, newTotal) {
    extractionStats.currentTotal = newTotal;
    extractionStats.lastUpdate = new Date().toISOString();
    console.log('[TiebaExtractor] Stats updated:', extractionStats);
}

// 记录抓取开始
function recordExtractionStart(totalPages) {
    console.log('[TiebaExtractor] Extraction started, target pages:', totalPages);
}

// 记录抓取完成
function recordExtractionComplete(totalCount) {
    console.log('[TiebaExtractor] Extraction completed, total items:', totalCount);
}

// 初始化扩展图标状态
function updateExtensionIcon(isRunning) {
    if (isRunning) {
        chrome.action.setIcon({
            path: {
                16: 'icons/icon-16-running.png',
                48: 'icons/icon-48-running.png',
                128: 'icons/icon-128-running.png'
            }
        });
    } else {
        chrome.action.setIcon({
            path: {
                16: 'icons/icon-16.png',
                48: 'icons/icon-48.png',
                128: 'icons/icon-128.png'
            }
        });
    }
}

// 监听标签页更新，自动注入脚本
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        if (tab.url.startsWith('https://tieba.baidu.com/home/creative/work')) {
            // 检查是否已经注入了脚本
            chrome.tabs.get(tabId, (tabDetails) => {
                if (tabDetails) {
                    console.log('[TiebaExtractor] Tab updated, url:', tab.url);
                }
            });
        }
    }
});

// 扩展安装或更新时打开欢迎页面
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('[TiebaExtractor] Extension installed');
        chrome.tabs.create({ url: 'welcome.html' });
    } else if (details.reason === 'update') {
        console.log('[TiebaExtractor] Extension updated to version', details.version);
    }
});

console.log('[TiebaExtractor] Background service worker initialized');