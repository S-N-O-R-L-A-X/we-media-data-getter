// ============================================
// Extractor Base Class - 提取器基类
// ============================================

class BaseExtractor {
    constructor(userConfig = {}) {
        // 默认配置（作为后备）
        this.defaultConfig = {
            cutoffDate: null,
            maxPages: 50,
            autoPageDelay: 3000,
            waitForPageLoadTimeout: 15000,
            enableNotifications: true,
            exportFormat: 'csv',
            includeRawData: false,
            filterBlocked: false
        };
        
        // 从 ConfigManager 获取全局配置
        let globalConfig = {};
        if (typeof window !== 'undefined' && window.ConfigManager) {
            globalConfig = window.ConfigManager.getSync();
        }
        
        // 优先级：用户配置 > ConfigManager 全局配置 > 默认配置
        this.config = {
            ...this.defaultConfig,
            ...globalConfig,
            ...userConfig
        };
        
        this.allData = [];
        this.currentPage = 1;
        this.isRunning = false;
    }

    /**
     * Check if current URL matches this extractor
     * @param {string} url - Current page URL
     * @returns {boolean}
     */
    matchesUrl(url) {
        throw new Error('matchesUrl() must be implemented by subclass');
    }

    /**
     * Get platform name
     * @returns {string}
     */
    getPlatformName() {
        throw new Error('getPlatformName() must be implemented by subclass');
    }

    /**
     * Validate if timestamp meets cutoff date criteria
     * @param {number} timestamp - Unix timestamp in seconds
     * @returns {boolean} - true if valid (on or after cutoff date)
     */
    isValidTimestamp(timestamp) {
        if (!timestamp) return false;
        if (!this.config.cutoffDate) return true;
        
        const cutoff = this.config.cutoffDate instanceof Date 
            ? this.config.cutoffDate 
            : new Date(this.config.cutoffDate);
        const cutoffStartOfDay = new Date(cutoff);
        cutoffStartOfDay.setHours(0, 0, 0, 0);
        
        const dataDate = new Date(timestamp * 1000);
        dataDate.setHours(0, 0, 0, 0);
        
        return dataDate >= cutoffStartOfDay;
    }

    /**
     * Check if an item is blocked or deleted
     * @param {Object} item - Raw API response item
     * @returns {boolean}
     */
    isItemBlocked(item) {
        if (!this.config.filterBlocked) return false;
        
        if (item.work_status === 4 || item.work_status === 5) return true;
        if (item.is_delete === 1 || item.is_delete === true) return true;
        if (item.is_del === 1 || item.is_del === true) return true;
        if (item.del_flag === 1 || item.del_flag === true) return true;
        if (item.status === 2 || item.status === 3 || item.status === 4 || item.status === -1) return true;
        if (item.aweme_status === 4 || item.aweme_status === 5) return true;
        
        if (item.status && typeof item.status === 'object') {
            if (item.status.is_delete === 1 || item.status.is_delete === true) return true;
        }
        
        return false;
    }

    async loadConfig(overrides = {}) {
        const cm = typeof ConfigManager !== 'undefined' ? ConfigManager : (typeof window !== 'undefined' ? window.ConfigManager : null);
        if (cm) {
            try {
                const globalConfig = await cm.get();
                if (globalConfig.cutoffDate) {
                    try {
                        this.config.cutoffDate = new Date(globalConfig.cutoffDate);
                    } catch (e) {
                        this.config.cutoffDate = null;
                    }
                } else {
                    this.config.cutoffDate = null;
                }
                this.config.maxPages = globalConfig.maxPages || this.config.maxPages;
                this.config.filterBlocked = globalConfig.filterBlocked || false;
                if ('cutoffDate' in overrides && overrides.cutoffDate !== undefined) {
                    this.config.cutoffDate = overrides.cutoffDate
                        ? (overrides.cutoffDate instanceof Date ? overrides.cutoffDate : new Date(overrides.cutoffDate))
                        : null;
                }
                console.log(`[${this.getPlatformName()}] ✅ 配置已加载:`, { cutoffDate: this.config.cutoffDate, maxPages: this.config.maxPages, filterBlocked: this.config.filterBlocked });
            } catch (e) {
                console.error(`[${this.getPlatformName()}] 加载配置失败:`, e);
            }
        }
    }

    getStorageKey() {
        return `${this.getPlatformName().charAt(0).toLowerCase()}${this.getPlatformName().slice(1)}Data_batch`;
    }

    stopExtraction() {
        this.isRunning = false;
        console.log(`[${this.getPlatformName()}] ⏹️ 抓取已停止`);
        return { success: true, message: '抓取已停止' };
    }

    clearData() {
        this.allData = [];
        console.log(`[${this.getPlatformName()}] 🗑️ 数据已清空`);
        return { success: true };
    }

    getAllData() {
        return this.allData;
    }

    async saveDataToStorage() {
        try {
            const batchKey = this.getStorageKey();
            await chrome.storage.local.set({ [batchKey]: this.allData });
            console.log(`[${this.getPlatformName()}] ✅ 数据已保存 (${this.allData.length} 条)`);
        } catch (error) {
            console.error(`[${this.getPlatformName()}] 保存失败:`, error);
            if (this.allData.length > 100) {
                try {
                    await chrome.storage.local.set({ [this.getStorageKey()]: this.allData.slice(0, 100) });
                } catch (e) {
                    console.error(`[${this.getPlatformName()}] 回退保存也失败:`, e);
                }
            }
        }
    }

    notifyProgress(isRunning, currentPage, totalPages, count, totalItems, error = null) {
        chrome.runtime.sendMessage({
            action: 'extractionProgress',
            isRunning, currentPage, total: totalPages, count, totalItems,
            success: !error, error
        }).catch(console.error);
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.BaseExtractor = BaseExtractor;
}