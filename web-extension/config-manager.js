// ============================================
// Config Manager - 全局配置管理器
// ============================================

/**
 * 全局配置管理器 - 用于管理所有 extractors 共享的配置项
 */
class ConfigManager {
    // 默认配置（不提供默认日期，让 extractor 自己决定是否过滤）
    static DEFAULT_CONFIG = {
        cutoffDate: null,                                // 不设置默认日期
        maxPages: 50,                                    // 最大抓取页数
        autoPageDelay: 3000,                             // 自动翻页延迟 (毫秒)
        waitForPageLoadTimeout: 15000,                   // 页面加载等待超时 (毫秒)
        enableNotifications: true,                       // 启用通知
        exportFormat: 'csv',                             // 导出格式
        includeRawData: false,                           // 是否包含原始数据
        filterBlocked: false                             // 是否过滤被屏蔽/删除的视频
    };

    // 配置键名
    static STORAGE_KEY = 'globalConfig';
    
    // 缓存的配置 - 用于同步访问（由 async get() 填充）
    static _cachedConfig = null;

    /**
     * 获取当前配置（异步）
     * @param {Object} keys - 要获取的配置键列表，如果为 null 则获取全部
     * @returns {Promise<Object>} 配置对象
     */
    static async get(keys = null) {
        return new Promise((resolve, reject) => {
            const query = keys ? { [this.STORAGE_KEY]: keys } : this.STORAGE_KEY;
            chrome.storage.local.get(query, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    const storedConfig = result[this.STORAGE_KEY] || {};
                    // 合并默认配置
                    const mergedConfig = { ...this.DEFAULT_CONFIG, ...storedConfig };
                    // 缓存配置供同步访问
                    this._cachedConfig = mergedConfig;
                    resolve(mergedConfig);
                }
            });
        });
    }
    
    /**
     * 获取当前配置（同步）- 使用缓存或默认配置
     * @returns {Object} 配置对象
     */
    static getSync() {
        if (this._cachedConfig) {
            return { ...this._cachedConfig };
        }
        // 如果没有缓存，返回默认配置的副本
        return { ...this.DEFAULT_CONFIG };
    }

    /**
     * 获取单个配置项
     * @param {string} key - 配置键名
     * @returns {Promise<any>} 配置值
     */
    static async getOne(key) {
        const config = await this.get([key]);
        return config[key];
    }

    /**
     * 保存配置
     * @param {Object} config - 要保存的配置对象
     * @returns {Promise<void>}
     */
    static async save(config) {
        return new Promise((resolve, reject) => {
            const existingConfig = this.getDefaultWithTimestamp();
            
            // 合并新配置
            const mergedConfig = {
                ...existingConfig,
                ...config,
                lastModified: new Date().toISOString()
            };
            
            chrome.storage.local.set({ [this.STORAGE_KEY]: mergedConfig }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    console.log('[ConfigManager] ✅ 配置已保存');
                    resolve();
                }
            });
        });
    }

    /**
     * 更新单个配置项
     * @param {string} key - 配置键名
     * @param {any} value - 配置值
     * @returns {Promise<void>}
     */
    static async updateOne(key, value) {
        const config = {};
        config[key] = value;
        await this.save(config);
    }

    /**
     * 重置为默认配置
     * @returns {Promise<void>}
     */
    static async resetToDefault() {
        return new Promise((resolve, reject) => {
            const defaultConfig = this.getDefaultWithTimestamp();
            chrome.storage.local.set({ [this.STORAGE_KEY]: defaultConfig }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    console.log('[ConfigManager] ✅ 配置已重置为默认值');
                    resolve();
                }
            });
        });
    }

    /**
     * 获取带有时间戳的默认配置
     * @private
     * @returns {Object}
     */
    static getDefaultWithTimestamp() {
        return {
            ...this.DEFAULT_CONFIG,
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };
    }

    /**
     * 监听配置变化
     * @param {Function} callback - 配置变化时的回调函数
     */
    static onChanged(callback) {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes[this.STORAGE_KEY]) {
                const newConfig = changes[this.STORAGE_KEY].newValue;
                callback(newConfig);
            }
        });
    }

    /**
     * 从 ISO 日期字符串解析截止日期
     * @param {string} isoString - ISO 格式的日期字符串
     * @returns {Date|null}
     */
    static parseCutoffDate(isoString) {
        if (!isoString) return null;
        try {
            return new Date(isoString);
        } catch (e) {
            console.error('[ConfigManager] 解析截止日期失败:', e);
            return null;
        }
    }

    /**
     * 验证配置
     * @param {Object} config - 要验证的配置对象
     * @returns {{valid: boolean, errors: Array}}
     */
    static validate(config) {
        const errors = [];

        // 验证截止日期
        if (config.cutoffDate) {
            const cutoffDate = new Date(config.cutoffDate);
            if (isNaN(cutoffDate.getTime())) {
                errors.push('无效的截止日期格式');
            }
        }

        // 验证最大页数
        if (config.maxPages !== undefined) {
            const pages = parseInt(config.maxPages, 10);
            if (isNaN(pages) || pages < 1 || pages > 1000) {
                errors.push('最大页数必须在 1-1000 之间');
            }
        }

        // 验证延迟时间
        if (config.autoPageDelay !== undefined) {
            const delay = parseInt(config.autoPageDelay, 10);
            if (isNaN(delay) || delay < 100 || delay > 60000) {
                errors.push('翻页延迟必须在 100-60000 毫秒之间');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// 添加一个全局函数，用于在 content-script 加载时立即获取配置
window.__loadGlobalConfig = async function() {
    if (typeof ConfigManager !== 'undefined') {
        try {
            await ConfigManager.get();
            console.log('[ConfigLoader] Global config loaded:', ConfigManager.getSync());
        } catch (e) {
            console.error('[ConfigLoader] Failed to load config:', e);
        }
    }
};

// 导出到全局作用域
if (typeof window !== 'undefined') {
    window.ConfigManager = ConfigManager;
}
