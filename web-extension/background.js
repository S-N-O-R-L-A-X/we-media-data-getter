// ============================================
// 百度贴吧 & 抖音视频数据提取器 - Background Service Worker
// ============================================

console.log('[Extractor] Background service worker started');

// 当前提取状态
let currentExtractionState = {
    isRunning: false,
    platform: '',
    currentPage: 0,
    totalPages: 0,
    totalItems: 0,
    lastUpdate: null,
    error: null
};

// 保存状态到 storage，以便 popup 重新打开时恢复
function saveStateToStorage(state) {
    chrome.storage.local.set({
        extractionState: state
    }).catch(console.error);
}

// Manifest V3 需要返回 true 以支持异步响应
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Extractor] Received message:', message);

    switch (message.action) {
        case 'extractionProgress':
            // 提取进度更新 - 保存状态到 storage 供 popup 打开时恢复
            currentExtractionState = {
                isRunning: message.isRunning,
                platform: message.platform || 'unknown',
                currentPage: message.currentPage || 0,
                totalPages: message.total || 0,
                totalItems: message.totalItems || 0,
                lastUpdate: new Date().toISOString(),
                error: message.error || null
            };
            saveStateToStorage(currentExtractionState);
            
            console.log(`[Extractor] 进度更新: isRunning=${message.isRunning}, page=${message.currentPage}, total=${message.totalItems}`);
            sendResponse({ success: true });
            return true;

        case 'showNotification':
            console.log('[Extractor] Notification:', message.message);
            sendResponse({ success: true });
            return true;

        case 'updateExtractedData':
            updateExtractionStats('tieba', message.count, message.total);
            sendResponse({ success: true });
            return true;

        case 'updateDouyinData':
            updateExtractionStats('douyin', message.count, message.total);
            sendResponse({ success: true });
            return true;

        case 'extractionStarted':
            recordExtractionStart('tieba', message.totalPages);
            sendResponse({ success: true });
            return true;

        case 'douyinExtractionStarted':
            recordExtractionStart('douyin', message.totalPages);
            sendResponse({ success: true });
            return true;

        case 'extractionComplete':
            recordExtractionComplete('tieba', message.totalCount);
            sendResponse({ success: true });
            return true;

        case 'douyinExtractionComplete':
            recordExtractionComplete('douyin', message.totalCount);
            sendResponse({ success: true });
            return true;

        case 'clearData':
            chrome.storage.local.remove(['tiebaData_batch', 'douyinData_batch', 'extractionState'])
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

        default:
            console.warn('[Extractor] Unknown action:', message.action);
            sendResponse({ success: false, error: 'Unknown action' });
            return true;
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
    lastUpdate: null,
    platform: 'tieba'
};

function updateExtractionStats(platform, countAdded, newTotal) {
    extractionStats.currentTotal = newTotal;
    extractionStats.platform = platform;
    extractionStats.lastUpdate = new Date().toISOString();
    console.log(`[Extractor] Stats updated (${platform}):`, extractionStats);
}

// 记录抓取开始
function recordExtractionStart(platform, totalPages) {
    console.log(`[Extractor] ${platform} Extraction started, target pages:`, totalPages);
}

// 记录抓取完成
function recordExtractionComplete(platform, totalCount) {
    console.log(`[Extractor] ${platform} Extraction completed, total items:`, totalCount);
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
        const url = tab.url;
        
        // 检查是否是贴吧或抖音页面
        if (url.startsWith('https://tieba.baidu.com/home/creative/work') || 
            url.includes('creator.douyin.com/creator-micro/content/manage')) {
            console.log('[Extractor] Tab updated, url:', url);
            
            // 注入 content script
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content-script.js']
            }).catch(err => {
                console.error('[Extractor] Failed to inject script:', err);
            });
        }
    }
});

// 扩展安装或更新时打开欢迎页面
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('[Extractor] Extension installed');
        chrome.tabs.create({ url: 'welcome.html' });
    } else if (details.reason === 'update') {
        console.log('[Extractor] Extension updated to version', details.version);
    }
});

console.log('[Extractor] Background service worker initialized');