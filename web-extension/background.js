// ============================================
// Background Service Worker
// ============================================

importScripts(
    'extractors/base-extractor.js',
    'extractors/tieba-extractor.js',
    'extractors/douyin-extractor.js',
    'extractors/xiaohongshu-extractor.js',
    'extractors/shipinhao-extractor.js',
    'extractors/extractor-factory.js'
);

console.log('[Background] Service Worker started');

const allExtractors = factory.getAllExtractors();
console.log('[Background] Available extractors:', allExtractors.map(e => e.getPlatformName()).join(', '));

// 保存状态到 storage，以便 popup 重新打开时恢复
function saveStateToStorage(state) {
    chrome.storage.local.set({
        extractionState: state
    }).catch(console.error);
}

let currentExtractionState = {
    isRunning: false,
    platform: '',
    currentPage: 0,
    totalPages: 0,
    totalItems: 0,
    lastUpdate: null,
    error: null
};

// 监听来自 content script 和 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Background] Received message:', message);

    switch (message.action) {
        case 'extractionProgress':
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
            console.log(`[Background] Progress updated: isRunning=${message.isRunning}, page=${message.currentPage}, total=${message.totalItems}`);
            sendResponse({ success: true });
            return true;

        case 'showNotification':
            console.log('[Background] Notification:', message.message);
            sendResponse({ success: true });
            return true;

        case 'updateExtractedData':
            console.log(`[Background] Updated extracted data: ${message.count} items, total ${message.total}`);
            sendResponse({ success: true });
            return true;

        case 'clearData':
            chrome.storage.local.remove(['tiebadata_batch', 'douyindata_batch', 'xiaohongshuData_batch', 'shipinhaoData_batch', 'extractionState'])
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

        default:
            console.warn('[Background] Unknown action:', message.action);
            sendResponse({ success: false, error: 'Unknown action' });
            return true;
    }
});

// 扩展安装或更新时打开欢迎页面
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('[Background] Extension installed');
        chrome.tabs.create({ url: 'welcome.html' });
    } else if (details.reason === 'update') {
        console.log('[Background] Extension updated to version', details.version);
    }
});

console.log('[Background] Service Worker initialized');