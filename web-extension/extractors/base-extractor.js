// ============================================
// Extractor Base Class - 提取器基类
// ============================================

/**
 * Abstract base class for all platform extractors
 * 所有平台提取器的抽象基类
 */
class BaseExtractor {
    constructor(config) {
        this.config = config;
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
     * @param {number} timestamp
     * @returns {boolean}
     */

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
