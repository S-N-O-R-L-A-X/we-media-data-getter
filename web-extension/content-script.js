// ============================================
// Content Script - 使用全局注入的 Extractor 类
// ============================================

if (window.__extractorLoaded) {
    console.log('[ContentScript] 跳过重复注入');
} else {
    window.__extractorLoaded = true;
    console.log('[ContentScript] === 多平台数据提取系统已加载 ===');

    // ============================================
    // ConfigManager - 配置管理器（内嵌以支持独立 extractor）
    // ============================================
    if (typeof window.ConfigManager === 'undefined') {
        class ConfigManager {
            static DEFAULT_CONFIG = {
                cutoffDate: null,
                maxPages: 50,
                autoPageDelay: 3000,
                waitForPageLoadTimeout: 15000,
                enableNotifications: true,
                exportFormat: 'csv',
                includeRawData: false,
                filterBlocked: false
            };
            
            static STORAGE_KEY = 'globalConfig';
            static _cachedConfig = null;
            
            static async get(keys = null) {
                return new Promise((resolve, reject) => {
                    const query = keys ? { [this.STORAGE_KEY]: keys } : this.STORAGE_KEY;
                    chrome.storage.local.get(query, (result) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            const storedConfig = result[this.STORAGE_KEY] || {};
                            const mergedConfig = { ...this.DEFAULT_CONFIG, ...storedConfig };
                            this._cachedConfig = mergedConfig;
                            resolve(mergedConfig);
                        }
                    });
                });
            }
            
            static getSync() {
                if (this._cachedConfig) {
                    return { ...this._cachedConfig };
                }
                return { ...this.DEFAULT_CONFIG };
            }
        }
        window.ConfigManager = ConfigManager;
    }

    // 加载配置
    (async () => {
        try {
            await window.ConfigManager.get();
            console.log('[ContentScript] 配置加载成功:', window.ConfigManager.getSync());
        } catch (e) {
            console.error('[ContentScript] 配置加载失败:', e);
        }
    })();

    // ============================================
    // 初始化 Extractor（类由前置注入的脚本提供）
    // ============================================
    const allExtractors = factory.getAllExtractors();
    console.log('[ContentScript] Extractors 初始化完成:', allExtractors.map(e => e.getPlatformName()).join(', '));

    // ============================================
    // 消息监听器 - 处理来自 popup/background 的请求
    // ============================================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[ContentScript] 收到消息:', message.action);

        const currentUrl = window.location.href;
        
        const matchedExtractor = message.platform 
            ? allExtractors.find(ex => ex.getPlatformName().toLowerCase() === message.platform.toLowerCase())
            : allExtractors.find(ex => ex.matchesUrl(currentUrl));
        
        if (!matchedExtractor) {
            console.warn(`[ContentScript] 未找到匹配的数据提取器 - URL: ${currentUrl}`);
            sendResponse({ success: false, error: 'No matching extractor found' });
            return true;
        }

        console.log(`[ContentScript] 使用提取器：${matchedExtractor.getPlatformName()}`);

        (async () => {
            try {
                let response;
                switch (message.action) {
                    case 'ping':
                        response = { success: true };
                        break;
                    case 'extractNow':
                        response = await matchedExtractor.extractCurrentPage();
                        break;
                    case 'startAutoExtraction':
                        response = await matchedExtractor.startAutoExtraction(message.pages || matchedExtractor.config.maxPages);
                        break;
                    case 'stopExtraction':
                        response = matchedExtractor.stopExtraction();
                        break;
                    case 'exportToCSV':
                        response = await matchedExtractor.exportToCSV();
                        break;
                    case 'clearData':
                        response = matchedExtractor.clearData();
                        break;
                    case 'getAllData':
                        response = { data: matchedExtractor.getAllData() };
                        break;
                    default:
                        response = { success: false, error: 'Unknown action' };
                }
                sendResponse(response);
            } catch (error) {
                console.error(`[${matchedExtractor.getPlatformName()}] 错误:`, error);
                sendResponse({ success: false, error: error.message });
            }
        })();

        return true;
    });

    window.ExtractorFactory = factory;
    window.allExtractors = allExtractors;
    
    console.log('[ContentScript] 消息监听器初始化完成');
}