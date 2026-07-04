// ============================================
// Extractor Base Class - 提取器基类
// ============================================

/**
 * Abstract base class for all platform extractors
 * 所有平台提取器的抽象基类
 */
class BaseExtractor {
    constructor(userConfig = {}) {
        // 默认配置（作为后备）
        this.defaultConfig = {
            cutoffDate: null,  // 不使用硬编码的默认值，直接从 ConfigManager 获取
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
        if (typeof ConfigManager !== 'undefined') {
            globalConfig = ConfigManager.getSync();
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
     * Fetch data from API for a specific page
     * @param {number} pageNumber
     * @returns {Promise<{data: Array, error: string|null}>}
     */
    async fetchDataFromAPI(pageNumber) {
        throw new Error('fetchDataFromAPI() must be implemented by subclass');
    }

    /**
     * Validate if timestamp meets cutoff date criteria
     * @param {number} timestamp - Unix timestamp in seconds
     * @returns {boolean} - true if valid (on or after cutoff date)
     */
    isValidTimestamp(timestamp) {
        if (!timestamp || !this.config.cutoffDate) return true;
        
        // 将截止日期解析为本地日期（忽略时分秒），只比较日期部分
        const cutoff = this.config.cutoffDate instanceof Date 
            ? this.config.cutoffDate 
            : new Date(this.config.cutoffDate);
            
        // 获取截止日期的本地日期字符串 (YYYY-MM-DD)
        const cutoffYear = cutoff.getFullYear();
        const cutoffMonth = String(cutoff.getMonth() + 1).padStart(2, '0');
        const cutoffDay = String(cutoff.getDate()).padStart(2, '0');
        const cutoffDateStr = `${cutoffYear}-${cutoffMonth}-${cutoffDay}`;
        
        // 将时间戳转换为本地日期字符串进行比较
        const timestampDate = new Date(timestamp * 1000);
        const year = timestampDate.getFullYear();
        const month = String(timestampDate.getMonth() + 1).padStart(2, '0');
        const day = String(timestampDate.getDate()).padStart(2, '0');
        const timestampDateStr = `${year}-${month}-${day}`;
        
        // 按字符串比较日期 (YYYY-MM-DD 格式可以直接按字典序比较)
        return timestampDateStr >= cutoffDateStr;
    }

    /**
     * Check if an item is blocked or deleted
     * @param {Object} item - Raw API response item
     * @returns {boolean} - true if item is blocked/deleted (should be filtered out)
     */
    isItemBlocked(item) {
        if (!this.config.filterBlocked) return false;
        
        // Tieba-specific: work_status
        // work_status: 2=审核中，3=已发布（正常）；4=已删除，5=违规删除（需要过滤）
        if (item.work_status === 4 || item.work_status === 5) return true;
        
        // Common blocked/deleted indicators across platforms
        if (item.is_delete === 1 || item.is_delete === true) return true;
        if (item.is_del === 1 || item.is_del === true) return true;
        if (item.del_flag === 1 || item.del_flag === true) return true;
        
        // Status codes
        if (item.status === 4 || item.status === -1) return true;
        if (item.aweme_status === 4 || item.aweme_status === 5) return true;
        
        // Nested status object (Douyin aweme_list format)
        if (item.status && typeof item.status === 'object') {
            if (item.status.is_delete === 1 || item.status.is_delete === true) return true;
        }
        
        return false;
    }

    /**
     * Extract data from current page only
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async extractCurrentPage() {
        throw new Error('extractCurrentPage() must be implemented by subclass');
    }

    /**
     * Start automatic extraction with pagination
     * @param {number} maxPages - Maximum pages to fetch
     * @returns {Promise<{success: boolean, totalCount: number}>}
     */
    async startAutoExtraction(maxPages = 50) {
        throw new Error('startAutoExtraction() must be implemented by subclass');
    }

    /**
     * Stop current extraction
     * @returns {{success: boolean, message: string}}
     */
    stopExtraction() {
        this.isRunning = false;
        console.log(`[${this.getPlatformName()}] ⏹️ 抓取已停止`);
        return { success: true, message: '抓取已停止' };
    }

    /**
     * Clear all collected data
     * @returns {{success: boolean}}
     */
    clearData() {
        this.allData = [];
        console.log(`[${this.getPlatformName()}] 🗑️ 数据已清空`);
        return { success: true };
    }

    /**
     * Get all collected data
     * @returns {Array}
     */
    getAllData() {
        return this.allData;
    }

    /**
     * Export data to CSV file
     * @returns {Promise<{success: boolean, count: number}>}
     */
    async exportToCSV() {
        let dataToExport = [];
        
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get([`${this.getPlatformName().toLowerCase()}Data_batch`], (result) => {
                    resolve(result);
                });
            });
            
            if (result[`${this.getPlatformName().toLowerCase()}Data_batch`] && 
                result[`${this.getPlatformName().toLowerCase()}Data_batch`].length > 0) {
                dataToExport = result[`${this.getPlatformName().toLowerCase()}Data_batch`].reverse();
            } else if (this.allData.length > 0) {
                dataToExport = this.allData.reverse();
            }
        } catch (error) {
            console.error(`[${this.getPlatformName()}] 从 storage 加载数据失败:`, error);
            dataToExport = this.allData;
        }
        
        if (dataToExport.length === 0) {
            return { success: false, message: '暂无数据可导出！' };
        }

        // Generate CSV content - subclasses can override column headers
        const csv = this.generateCSV(dataToExport);
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.getPlatformName().toLowerCase()}_videos_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        console.log(`[${this.getPlatformName()}] ✅ 已导出 ${dataToExport.length} 条数据到 CSV 文件`);
        
        chrome.runtime.sendMessage({
            action: 'showNotification',
            message: `成功导出 ${dataToExport.length} 条数据！`
        }).catch(console.error);
        
        return { success: true, count: dataToExport.length };
    }

    /**
     * Generate CSV content from data
     * @protected
     * @param {Array} data 
     * @returns {string}
     */
    generateCSV(data) {
        // Default implementation - subclasses can override
        return '\uFEFF'; // UTF-8 BOM
    }

    /**
     * Save data to local storage
     * @protected
     */
    async saveDataToStorage() {
        try {
            const batchKey = `${this.getPlatformName().toLowerCase()}Data_batch`;
            await chrome.storage.local.set({ [batchKey]: this.allData });
            console.log(`[${this.getPlatformName()}] ✅ 数据已保存到本地存储 (${this.allData.length} 条)`);
        } catch (error) {
            console.error(`[${this.getPlatformName()}] 保存数据失败:`, error);
            if (this.allData.length > 100) {
                await chrome.storage.local.set({ [batchKey]: this.allData.slice(0, 100) });
            }
        }
    }

    /**
     * Send progress notification
     * @protected
     * @param {boolean} isRunning 
     * @param {number} currentPage 
     * @param {number} totalPages 
     * @param {number} count 
     * @param {number} totalItems 
     * @param {string|null} error 
     */
    notifyProgress(isRunning, currentPage, totalPages, count, totalItems, error = null) {
        chrome.runtime.sendMessage({
            action: 'extractionProgress',
            isRunning: isRunning,
            currentPage: currentPage,
            total: totalPages,
            count: count,
            totalItems: totalItems,
            success: !error,
            error: error
        }).catch(console.error);
    }
}

// Export to global scope
if (typeof window !== 'undefined') {
    window.BaseExtractor = BaseExtractor;
}
