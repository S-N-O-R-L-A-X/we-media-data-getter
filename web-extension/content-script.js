// ============================================
// 百度贴吧 & 抖音视频数据提取器 - Content Script
// ============================================

// 内联 ConfigManager 核心功能（确保在所有 extractor 之前可用）
if (typeof ConfigManager === 'undefined') {
    const _ConfigManager = {
        DEFAULT_CONFIG: {
            cutoffDate: null,
            maxPages: 50,
            autoPageDelay: 3000,
            waitForPageLoadTimeout: 15000,
            enableNotifications: true,
            exportFormat: 'csv',
            includeRawData: false,
            filterBlocked: false
        },
        STORAGE_KEY: 'globalConfig',
        _cachedConfig: null,
        
        getSync: function() {
            if (this._cachedConfig) {
                return { ...this._cachedConfig };
            }
            return { ...this.DEFAULT_CONFIG };
        },
        
        async get(keys = null) {
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
    };
    
    if (typeof window !== 'undefined') {
        window.ConfigManager = _ConfigManager;
    }
}

// 防止重复注入
if (window.__extractorLoaded) {
    console.log('[ContentScript] 跳过重复注入');
} else {
    window.__extractorLoaded = true;
    
    // 初始化配置缓存
    (async () => {
        if (window.ConfigManager) {
            try {
                await window.ConfigManager.get();
                console.log('[ConfigLoader] Global config loaded:', window.ConfigManager.getSync());
            } catch (e) {
                console.error('[ConfigLoader] Failed to load config:', e);
            }
        }
    })();

// 加载 filterBlocked 配置
let _filterBlocked = false;
(async () => {
    if (typeof ConfigManager !== 'undefined') {
        try {
            const config = await ConfigManager.get();
            _filterBlocked = config.filterBlocked || false;
        } catch (e) {
            console.error('[ContentScript] 加载 filterBlocked 配置失败:', e);
        }
    }
})();

/**
 * 判断视频是否被屏蔽或删除（独立函数，供内联提取器使用）
 */
function isItemBlocked(item) {
    if (!_filterBlocked) return false;
    
    // Tieba-specific: work_status (最关键的判断条件)
    // work_status: 2=审核中，3=已发布（正常）；4=已删除，5=违规删除（需要过滤）
    if (item.work_status === 4 || item.work_status === 5) return true;
    
    // 通用删除标志
    if (item.is_delete === 1 || item.is_delete === true) return true;
    if (item.is_del === 1 || item.is_del === true) return true;
    if (item.del_flag === 1 || item.del_flag === true) return true;
    
    // 状态码判断
    if (item.status === 2 || item.status === 3 || item.status === 4 || item.status === -1) return true;
    if (item.aweme_status === 4 || item.aweme_status === 5) return true;
    
    // 嵌套状态对象 (Douyin)
    if (item.status && typeof item.status === 'object') {
        if (item.status.is_delete === 1 || item.status.is_delete === true) return true;
    }
        
    return false;
}

// ============================================
// 百度贴吧视频数据提取器
// ============================================

const TiebaExtractor = (function() {
    'use strict';

    // 初始配置（默认值）
    let config = {
        cutoffDate: null,
        maxPages: 42,
        autoPageDelay: 3000,
        waitForPageLoadTimeout: 15000
    };
    
    // 从 ConfigManager 加载最新配置（异步读取 storage）
    async function loadConfig() {
        if (typeof ConfigManager !== 'undefined') {
            try {
                // 使用 async get() 确保获取最新存储的配置
                const globalConfig = await ConfigManager.get();
                if (globalConfig.cutoffDate) {
                    try {
                        config.cutoffDate = new Date(globalConfig.cutoffDate);
                    } catch (e) {
                        console.error('[TiebaExtractor] 解析 cutoffDate 失败:', e);
                        config.cutoffDate = null;
                    }
                } else {
                    config.cutoffDate = null;
                }
                config.maxPages = globalConfig.maxPages || config.maxPages;
                _filterBlocked = globalConfig.filterBlocked || false;
                console.log('[TiebaExtractor] ✅ 配置已加载:', config);
            } catch (e) {
                console.error('[TiebaExtractor] 加载配置失败:', e);
            }
        }
    }

    let allData = [];
    let currentPage = 1;
    let totalPagesProcessed = 0;
    let isRunning = false;

    function parseDate(dateStr) {
        if (!dateStr) return null;
        try {
            const date = new Date(dateStr.replace(' ', 'T'));
            return isNaN(date.getTime()) ? null : date;
        } catch (e) {
            return null;
        }
    }

    function timestampToDate(timestamp) {
        if (!timestamp) return '';
        try {
            const date = new Date(timestamp * 1000);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        } catch (e) {
            console.error('[TiebaExtractor] 时间戳转换失败:', e);
            return '';
        }
    }

    function isValidTimestamp(timestamp) {
        if (!timestamp) return false;
        // 如果没有设置截止日期，则不过滤（返回 true 保留所有数据）
        if (!config.cutoffDate) return true;
        
        // 获取截止日期的日期部分（去掉时分秒），确保"当天"的数据不被误过滤
        const cutoffStartOfDay = new Date(config.cutoffDate);
        cutoffStartOfDay.setHours(0, 0, 0, 0);
        
        // 获取当前数据的日期部分
        const dataDate = new Date(timestamp * 1000);
        dataDate.setHours(0, 0, 0, 0);
        
        // 比较日期（包含当天）
        return dataDate >= cutoffStartOfDay;
    }

    async function fetchDataFromAPI(pageNumber = 1) {
        console.log(`[TiebaExtractor] 正在通过 API 获取第 ${pageNumber} 页数据...`);

        try {
            const url = new URL('https://tieba.baidu.com/mo/q/work/list');
            url.searchParams.set('type', "all");
            url.searchParams.set('pn', pageNumber);
            url.searchParams.set('rn', 10);
            
            const response = await fetch(url.toString());
            const result = await response.json();

            if (result.no !== 0) {
                console.error('[TiebaExtractor] API 请求失败:', result.error);
                return { works: [], error: result.error };
            }

            const works = result.data?.works || [];
            console.log(`[TiebaExtractor] ✅ API 返回了 ${works.length} 条数据（第 ${pageNumber} 页）`);
            
            // 调试：打印第一条数据的字段，帮助识别屏蔽/删除的标识
            if (_filterBlocked && works.length > 0 && pageNumber === 1) {
                console.group('[TiebaExtractor] 🔍 Debug - 第一条原始数据字段:');
                Object.keys(works[0]).forEach(key => {
                    console.log(`  ${key}:`, works[0][key]);
                });
                console.groupEnd();
            }

            // 过滤被屏蔽/删除的视频（Tieba 专用增强）
            const filteredRaw = _filterBlocked
                ? works.filter(work => {
                    const blocked = isItemBlocked(work);
                    if (blocked) {
                        console.log(`[TiebaExtractor] 🔒 过滤: ${work.title || '无标题'} (status=${work.status}, audit_status=${work.audit_status}, is_delete=${work.is_delete})`);
                    }
                    return !blocked;
                })
                : works;
            if (_filterBlocked && works.length !== filteredRaw.length) {
                console.log(`[TiebaExtractor] 已过滤 ${works.length - filteredRaw.length} 条被屏蔽/删除的视频`);
            }

            const parsedData = filteredRaw.map(work => ({
                date: timestampToDate(work.publish_time),
                url: `https://tieba.baidu.com/p/${work.thread_id}`,
                title: decodeURIComponent(work.title),
                playCount: work.play_count || 0,
                agreeCount: work.agree_count || 0,
                commentCount: work.comment_count || 0,
                collectCount: work.collect_count || 0,
                shareCount: work.share_count || 0,
                raw: work
            }));

            return { works: parsedData, error: null };
        } catch (error) {
            console.error('[TiebaExtractor] API 请求错误:', error);
            return { works: [], error: error.message };
        }
    }

    async function extractCurrentPage() {
        // 每次提取前重新加载配置，确保使用最新截止日期
        await loadConfig();
        console.log('[TiebaExtractor] 正在提取当前页面数据...');

        const apiResult = await fetchDataFromAPI(currentPage);

        if (apiResult.error || apiResult.works.length === 0) {
            const errorMsg = apiResult.error || '未找到任何数据项';
            console.error('[TiebaExtractor]', errorMsg);
            return { success: false, message: errorMsg };
        }

        const filtered = apiResult.works.filter(item => isValidTimestamp(item.raw?.publish_time));
        allData = allData.concat(filtered);

        console.log(`[TiebaExtractor] 📊 本次提取：${apiResult.works.length} 条，符合条件：${filtered.length} 条`);
        console.log(`[TiebaExtractor] 💾 累计数据：${allData.length} 条`);

        chrome.runtime.sendMessage({
            action: 'updateExtractedData',
            count: filtered.length,
            total: allData.length
        }).catch(console.error);

        return {
            success: true,
            current: apiResult.works.length,
            filtered: filtered.length,
            total: allData.length
        };
    }

    // 发送进度通知给 popup（通过 runtime 广播）
    function notifyProgress(isRunning, page, total, count, totalItems, error) {
        chrome.runtime.sendMessage({
            action: 'extractionProgress',
            isRunning: isRunning,
            currentPage: page,
            total: total,
            count: count,
            totalItems: totalItems,
            success: !error,
            error: error
        }).catch(console.error);
    }

    async function startAutoExtraction() {
        // 开始抓取前重新加载配置，确保使用最新截止日期
        await loadConfig();
        
        if (isRunning) {
            const error = '正在进行抓取，请稍后再试';
            console.error('[TiebaExtractor]', error);
            return { success: false, message: error };
        }

        isRunning = true;
        allData = [];
        currentPage = 1;
        totalPagesProcessed = 0;

        console.log('[TiebaExtractor] 🚀 开始自动抓取...');

        // 立即通知进度开始
        notifyProgress(true, 1, config.maxPages, 0, 0);

        try {
            const maxPages = config.maxPages;
            let page = 1;

            while (page <= maxPages && isRunning) {
                console.log(`\n[TiebaExtractor] === 正在获取第 ${page} 页数据 ===`);

                const apiResult = await fetchDataFromAPI(page);

                if (apiResult.error || apiResult.works.length === 0) {
                    break;
                }

                const existingUrls = new Set(allData.map(item => item.url));
                const newWorks = apiResult.works.filter(work => !existingUrls.has(work.url));
                
                if (newWorks.length > 0) {
                    const filtered = newWorks.filter(item => {
                        if (!item.raw?.publish_time) return false;
                        return isValidTimestamp(item.raw.publish_time);
                    });
                    
                    if (filtered.length === 0) {
                        console.log(`[TiebaExtractor] ⏹️ 第 ${page} 页已无符合截止日期的数据，停止抓取`);
                        await saveDataToStorage();
                        isRunning = false;
                        
                        notifyProgress(false, page, maxPages, 0, allData.length);
                        
                        return { 
                            success: true, 
                            totalCount: allData.length,
                            message: `在第 ${page} 页检测到已超过截止日期的数据，停止抓取`
                        };
                    }
                    
                    totalPagesProcessed = page;
                    console.log(`[TiebaExtractor] 📊 第 ${page} 页符合条件的有 ${filtered.length} 条`);
                    allData = allData.concat(filtered);
                    
                    chrome.runtime.sendMessage({
                        action: 'updateExtractedData',
                        count: filtered.length,
                        total: allData.length
                    }).catch(console.error);
                    
                    // 通知进度更新
                    notifyProgress(true, page + 1, maxPages, filtered.length, allData.length);
                } else {
                    console.log(`[TiebaExtractor] △ 第 ${page} 页没有新数据`);
                }

                page++;
            }

            allData.sort((a, b) => b.date.localeCompare(a.date));
            await saveDataToStorage();

            // 通知完成
            notifyProgress(false, totalPagesProcessed + 1, maxPages, 0, allData.length);

            isRunning = false;
            console.log(`[TiebaExtractor] 🎉 自动抓取完成！共提取 ${allData.length} 条数据`);
            return { success: true, totalCount: allData.length };
        } catch (error) {
            console.error('[TiebaExtractor] 抓取失败:', error);
            isRunning = false;
            
            // 通知失败
            notifyProgress(false, totalPagesProcessed + 1, config.maxPages, 0, allData.length, error.message);
            
            return { success: false, error: error.message };
        }
    }

    async function saveDataToStorage() {
        try {
            const batchKey = 'tiebaData_batch';
            await chrome.storage.local.set({ [batchKey]: allData });
            console.log(`[TiebaExtractor] ✅ 数据已保存到本地存储 (${allData.length} 条)`);
        } catch (error) {
            console.error('[TiebaExtractor] 保存数据失败:', error);
            if (allData.length > 100) {
                await chrome.storage.local.set({ [batchKey]: allData.slice(0, 100) });
            }
        }
    }

    async function exportToCSV() {
        let dataToExport = [];
        
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['tiebaData_batch'], (result) => {
                    resolve(result);
                });
            });
            
            if (result.tiebaData_batch && result.tiebaData_batch.length > 0) {
                dataToExport = result.tiebaData_batch.reverse();
            } else if (allData.length > 0) {
                dataToExport = allData.reverse();
            }
        } catch (error) {
            console.error('[TiebaExtractor] 从 storage 加载数据失败:', error);
            dataToExport = allData;
        }
        
        if (dataToExport.length === 0) {
            return { success: false, message: '暂无数据可导出！' };
        }

        let csv = '\uFEFF' + '发布日期，视频标题，视频链接，浏览数，点赞数，评论数，收藏数，分享数\n';
        dataToExport.forEach(item => {
            csv += `"${item.date}","${(item.title || '').replace(/"/g, '""')}","${item.url}",${item.playCount},${item.agreeCount},${item.commentCount},${item.collectCount},${item.shareCount}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tieba_videos_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log(`[TiebaExtractor] ✅ 已导出 ${dataToExport.length} 条数据到 CSV 文件`);
        
        chrome.runtime.sendMessage({
            action: 'showNotification',
            message: `成功导出 ${dataToExport.length} 条数据！`
        }).catch(console.error);

        return { success: true, count: dataToExport.length };
    }

    function stopExtraction() {
        isRunning = false;
        console.log('[TiebaExtractor] ⏹️ 抓取已停止');
        return { success: true, message: '抓取已停止' };
    }

    function clearData() {
        allData = [];
        console.log('[TiebaExtractor] 🗑️ 数据已清空');
        return { success: true };
    }

    function getAllData() {
        return allData;
    }

    return {
        startAutoExtraction,
        stopExtraction,
        exportToCSV,
        extractCurrentPage,
        getAllData,
        clearData
    };
})();

// ============================================
// 抖音创作者服务平台视频数据提取器
// ============================================

const DouyinExtractor = (function() {
    'use strict';
    
    // 初始配置（默认值）
    let config = {
        // 用户提供的正确 API 端点
        apiUrl: 'https://creator.douyin.com/janus/douyin/creator/pc/work_list',
        maxPages: 50,
        pageSize: 12,
        cutoffDate: null
    };
    
    // 从 ConfigManager 加载最新配置（异步读取 storage）
    async function loadConfig() {
        if (typeof ConfigManager !== 'undefined') {
            try {
                // 使用 async get() 确保获取最新存储的配置
                const globalConfig = await ConfigManager.get();
                if (globalConfig.cutoffDate) {
                    try {
                        config.cutoffDate = new Date(globalConfig.cutoffDate);
                    } catch (e) {
                        console.error('[DouyinExtractor] 解析 cutoffDate 失败:', e);
                        config.cutoffDate = null;
                    }
                } else {
                    config.cutoffDate = null;
                }
                config.maxPages = globalConfig.maxPages || config.maxPages;
                _filterBlocked = globalConfig.filterBlocked || false;
                console.log('[DouyinExtractor] ✅ 配置已加载:', config);
            } catch (e) {
                console.error('[DouyinExtractor] 加载配置失败:', e);
            }
        }
    }
    
    let allData = [];
    let currentPage = 1;
    let isRunning = false;
    
    /**
     * 判断时间戳是否在截止日期之后（包含截止日期当天）
     */
    function isValidTimestamp(timestamp) {
        if (!timestamp) return false;
        // 如果没有设置截止日期，则不过滤（返回 true 保留所有数据）
        if (!config.cutoffDate) return true;
        
        // 获取截止日期的日期部分（去掉时分秒），确保"当天"的数据不被误过滤
        const cutoffStartOfDay = new Date(config.cutoffDate);
        cutoffStartOfDay.setHours(0, 0, 0, 0);
        
        // 获取当前数据的日期部分
        const dataDate = new Date(timestamp * 1000);
        dataDate.setHours(0, 0, 0, 0);
        
        // 比较日期（包含当天）
        return dataDate >= cutoffStartOfDay;
    }
    
    /**
     * 检查是否需要停止抓取：前三项都要检查，第四项及以后只要有一条过期就停止
     */
    function checkCutoffDate() {
        if (allData.length === 0) return false;
        
        // 按发布时间倒序排序
        const sortedData = [...allData].sort((a, b) => b.createTimestamp - a.createTimestamp);
        
        // 检查所有数据中是否有任何一条超过截止日期
        for (let i = 0; i < sortedData.length; i++) {
            if (!isValidTimestamp(sortedData[i].createTimestamp)) {
                // 如果是前四项中有过期数据，或者第四项后有任意过期数据
                if (i >= 3) {
                    console.log(`[DouyinExtractor] ⚠️ 检测到第 ${i + 1} 条数据 (${sortedData[i].title}) 超过截止日期，停止抓取`);
                    return true;
                } else if (i < 3) {
                    // 前三项也要检查，但前三项本身不决定是否停止，只有当后面有过期数据时才停止
                    console.log(`[DouyinExtractor] ℹ️ 前三项中检测到过期数据：${sortedData[i].title}`);
                }
            }
        }
        
        return false;
    }
    
    /**
     * 解析播放量文本（如"1.2 万”、"10 万+"等）
     */
    function parsePlayCount(text) {
        if (!text) return 0;
        text = text.replace(/\s+/g, '');
        const match = text.match(/^([\d.]+)([万千+]?)$/);
        
        if (!match) {
            const numMatch = text.match(/^([\d.]+)/);
            if (numMatch) {
                return parseFloat(numMatch[1]) || 0;
            }
            return 0;
        }
        
        const num = parseFloat(match[1]);
        const unit = match[2];
        
        switch (unit) {
            case '万': return num * 10000;
            case '千': return num * 1000;
            case '+': return Math.floor(num * 10000);
            default: return num;
        }
    }
    
    /**
     * 时间戳转日期字符串
     */
    function timestampToDateStr(timestamp) {
        if (!timestamp) return '';
        try {
            const date = new Date(timestamp * 1000);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}`;
        } catch (e) {
            console.error('[DouyinExtractor] 时间戳转换失败:', e);
            return '';
        }
    }
    
    /**
     * 从 aweme_list（详细数据）提取作品信息
     */
    function extractFromAwemeList(awemeList) {
        // 过滤被屏蔽/删除的视频
        const filteredList = _filterBlocked
            ? awemeList.filter(item => !isItemBlocked(item))
            : awemeList;
        if (_filterBlocked && awemeList.length !== filteredList.length) {
            console.log(`[DouyinExtractor] 已过滤 ${awemeList.length - filteredList.length} 条被屏蔽/删除的视频`);
        }
        return filteredList.map(item => {
            const statistics = item.statistics || {};
            const author = item.author || {};
            const video = item.video || {};
            
            return {
                title: item.caption || item.desc || item.item_title || '',
                // 将播放/收藏数等转换为数字
                playCount: parseInt(statistics.play_count, 10) || 0,
                likeCount: parseInt(statistics.digg_count, 10) || 0,
                commentCount: parseInt(statistics.comment_count, 10) || 0,
                collectCount: parseInt(statistics.collect_count, 10) || 0,
                shareCount: parseInt(statistics.forward_count, 10) || 0,
                url: `https://www.douyin.com/video/${item.aweme_id}`,
                videoId: item.aweme_id,
                authorName: author.nickname || '',
                authorId: author.uid || '',
                // 时长（毫秒），转为秒
                duration: item.duration ? Math.round(item.duration / 1000) : 0,
                // 封面图
                coverUrl: (video.cover && video.cover.url_list && video.cover.url_list.length > 0)
                    ? video.cover.url_list[0] : '',
                publishTime: timestampToDateStr(item.create_time),
                createTimestamp: item.create_time || 0,
                // 审核状态：true=已审核，false=未审核
                reviewed: !!(item.status && item.status.reviewed),
                // 合集信息
                mixName: (item.mix_info && item.mix_info.mix_name) || '',
                // 置顶状态
                isPinned: !!item.is_pinned,
                // 来源类型
                itemType: item.aweme_type || 0,
                raw: item
            };
        });
    }
    
    /**
     * 从 items（简要数据 + metrics）提取作品信息
     */
    function extractFromItems(items) {
        // 过滤被屏蔽/删除的视频
        const filteredList = _filterBlocked
            ? items.filter(item => !isItemBlocked(item))
            : items;
        if (_filterBlocked && items.length !== filteredList.length) {
            console.log(`[DouyinExtractor] 已过滤 ${items.length - filteredList.length} 条被屏蔽/删除的视频`);
        }
        return filteredList.map(item => {
            const metrics = item.metrics || {};
            const cover = item.cover || {};
            
            return {
                title: item.description || item.item_title || '',
                playCount: parseInt(metrics.view_count, 10) || 0,
                likeCount: parseInt(metrics.like_count, 10) || 0,
                commentCount: parseInt(metrics.comment_count, 10) || 0,
                collectCount: parseInt(metrics.favorite_count, 10) || 0,
                shareCount: parseInt(metrics.share_count, 10) || 0,
                url: `https://www.douyin.com/video/${item.id}`,
                videoId: item.id,
                authorName: '',  // items 可能不包含作者信息
                authorId: '',
                duration: 0,
                coverUrl: (cover.uri && cover.url_list && cover.url_list.length > 0)
                    ? cover.url_list[0] : '',
                publishTime: timestampToDateStr(item.create_time),
                createTimestamp: item.create_time || 0,
                reviewed: !!(item.review && item.review.status === 2),
                mixName: '',
                isPinned: false,
                itemType: item.type || 0,
                raw: item
            };
        });
    }
    
    /**
     * 从抖音创作者平台 API 获取作品列表
     * 适配实际返回的 aweme_list / items 结构
     */
    async function fetchWorkList(cursor = 0, count = 30) {
        console.log(`[DouyinExtractor] 正在从 API 获取作品列表，cursor=${cursor}, count=${count}`);
        
        try {
            // 使用用户提供的 API 端点
            const url = new URL(config.apiUrl);
            url.searchParams.set('status', '0');
            url.searchParams.set('count', count.toString());
            url.searchParams.set('max_cursor', cursor.toString());
            // 移除 min_cursor（API 不需要）
            url.searchParams.set('scene', 'star_atlas');
            // device_platform 设置为 web 以适应 PC 浏览器
            url.searchParams.set('device_platform', 'web');
            url.searchParams.set('aid', '1128');
            url.searchParams.set('channel', 'channel_pc_web');
            // work_type 表示视频内容类型
            url.searchParams.set('work_type', '9');
            
            // 打印调试信息
            console.log('[DouyinExtractor] 正在发起 API 请求:', url.toString());
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': navigator.userAgent
                },
                credentials: 'include'  // 关键：包含 Cookie 进行身份验证
            });
            
            console.log('[DouyinExtractor] API 响应状态:', response.status, response.statusText);
            
            // 尝试读取响应文本以便调试
            let responseText;
            try {
                responseText = await response.clone().text();
            } catch (e) {
                responseText = '[无法读取响应体]';
            }
            console.log('[DouyinExtractor] API 响应文本长度:', responseText?.length || 0);
            
            if (!response.ok) {
                const errorText = responseText ? responseText.substring(0, 300) : '无法读取错误信息';
                console.error('[DouyinExtractor] API 请求失败:', response.status, errorText);
                throw new Error(`HTTP error! status: ${response.status}, text: ${errorText}`);
            }
            
            let result;
            try {
                result = await response.json();
            } catch (e) {
                console.error('[DouyinExtractor] JSON 解析失败，响应不是有效的 JSON:', e);
                console.error('[DouyinExtractor] 原始响应前 500 字符:', responseText.substring(0, 500));
                return { tasks: [], has_more: false, cursor: 0, total: 0, error: 'API 响应不是有效的 JSON，可能是 HTML 页面（请检查是否已登录抖音创作者平台）' };
            }
            
            // 打印完整的 API 响应以便调试 - 无论如何都执行
            console.group('[DouyinExtractor] API 原始响应');
            console.log('所有键名:', Object.keys(result));
            console.log('status_code:', result.status_code);
            console.log('total:', result.total);
            console.log('has_more:', result.has_more);
            console.log('cursor:', result.max_cursor || result.cursor);
            if (result.aweme_list && Array.isArray(result.aweme_list)) {
                console.log('⚠️ aweme_list 存在！长度:', result.aweme_list.length);
            }
            if (result.items && Array.isArray(result.items)) {
                console.log('⚠️ items 存在！长度:', result.items.length);
            }
            if (result.data && result.data.task_list && Array.isArray(result.data.task_list)) {
                console.log('⚠️ data.task_list 存在！长度:', result.data.task_list.length);
            }
            // 打印前几个数据项的结构示例
            if (result.aweme_list && result.aweme_list.length > 0) {
                console.log('示例数据 (第一个 aweme):', JSON.stringify(result.aweme_list[0], null, 2).substring(0, 800));
            } else if (result.items && result.items.length > 0) {
                console.log('示例数据 (第一个 item):', JSON.stringify(result.items[0], null, 2).substring(0, 800));
            } else if (result.data && result.data.task_list && result.data.task_list.length > 0) {
                console.log('示例数据 (第一个 task):', JSON.stringify(result.data.task_list[0], null, 2).substring(0, 800));
            }
            console.groupEnd();
            
            // 检查 status_code
            if (result.status_code !== undefined && result.status_code !== 0) {
                console.error('[DouyinExtractor] API 返回错误状态码:', result.status_code);
                console.error('[DouyinExtractor] 错误信息:', result.message || result.msg || '无');
                return { tasks: [], has_more: false, cursor: 0, total: 0, error: `status_code: ${result.status_code}` };
            }
            
            // 优先使用 aweme_list（最详细的数据）
            if (result.aweme_list && Array.isArray(result.aweme_list) && result.aweme_list.length > 0) {
                const tasks = extractFromAwemeList(result.aweme_list);
                console.log(`[DouyinExtractor] ✅ aweme_list 返回了 ${tasks.length} 条详细作品数据`);
                
                return {
                    tasks: tasks,
                    has_more: result.has_more || false,
                    cursor: result.max_cursor || 0,
                    total: result.total || tasks.length
                };
            }
            
            // 备选：使用 items（带 metrics 的简要数据）
            if (result.items && result.items.length > 0) {
                const tasks = extractFromItems(result.items);
                console.log(`[DouyinExtractor] ✅ items 返回了 ${tasks.length} 条作品数据（含 metrics）`);
                
                return {
                    tasks: tasks,
                    has_more: result.has_more || false,
                    cursor: result.max_cursor || 0,
                    total: result.total || tasks.length
                };
            }
            
            // 兼容旧格式：result.data.task_list
            if (result.data && result.data.task_list) {
                const tasks = result.data.task_list.map(task => ({
                    title: task.video?.title || task.title || '',
                    playCount: parseInt(task.video_stats?.total_play_count, 10) || 0,
                    likeCount: parseInt(task.video_stats?.digg_count, 10) || 0,
                    commentCount: parseInt(task.video_stats?.comment_count, 10) || 0,
                    collectCount: 0,
                    shareCount: parseInt(task.video_stats?.share_count, 10) || 0,
                    url: `https://www.douyin.com/video/${task.aweme_id}`,
                    videoId: task.aweme_id,
                    authorName: '',
                    authorId: '',
                    duration: 0,
                    coverUrl: '',
                    publishTime: timestampToDateStr(task.publish_time),
                    createTimestamp: task.publish_time || 0,
                    reviewed: false,
                    mixName: '',
                    isPinned: false,
                    itemType: 0,
                    raw: task
                }));
                
                console.log(`[DouyinExtractor] ✅ task_list 格式返回了 ${tasks.length} 条作品数据`);
                
                return {
                    tasks: tasks,
                    has_more: result.data.has_more || false,
                    cursor: result.data.max_cursor || 0,
                    total: result.data.total || tasks.length
                };
            }
            
            console.warn('[DouyinExtractor] API 返回数据格式异常，可用的键:', Object.keys(result));
            console.warn('[DouyinExtractor] result 内容预览:', JSON.stringify(result, null, 2).substring(0, 500));
            return { tasks: [], has_more: false, cursor: 0, total: 0 };
        } catch (error) {
            console.error('[DouyinExtractor] API 请求错误:', error);
            return { tasks: [], has_more: false, cursor: 0, total: 0, error: error.message };
        }
    }
    
    /**
     * 从 DOM 中提取数据（备用方案）
     */
    function extractDataFromDOM() {
        console.log('[DouyinExtractor] 尝试从 DOM 中提取数据...');
        
        const results = [];
        const taskItems = document.querySelectorAll('[class*="task-card"], [class*="video-item"], .task-item, .video-card');
        
        console.log(`[DouyinExtractor] 找到 ${taskItems.length} 个任务/视频元素`);
        
        taskItems.forEach((el, index) => {
            try {
                const vueProps = el.__vue__?.$props || {};
                const titleEl = el.querySelector('[class*="title"], [class*="name"], .title, .name');
                const title = titleEl ? titleEl.textContent.trim() : (vueProps.title || '') || '';
                
                const viewsEl = el.querySelector('[class*="view"], [class*="play"], .views, .play-count');
                const playText = viewsEl ? viewsEl.textContent.trim() : '';
                const playCount = parsePlayCount(playText);
                
                const likesEl = el.querySelector('[class*="like"], [class*="digg"], .likes, .digg-count');
                const likeText = likesEl ? likesEl.textContent.trim() : '';
                const likeCount = parsePlayCount(likeText);
                
                const commentsEl = el.querySelector('[class*="comment"], .comment-count');
                const commentText = commentsEl ? commentsEl.textContent.trim() : '';
                const commentCount = parsePlayCount(commentText);
                
                const sharesEl = el.querySelector('[class*="share"], .share-count');
                const shareText = sharesEl ? sharesEl.textContent.trim() : '';
                const shareCount = parsePlayCount(shareText);
                
                const linkEl = el.querySelector('a[href*="/video/"]');
                const url = linkEl ? linkEl.href : '';
                
                const timeEl = el.querySelector('[class*="time"], [class*="date"], .publish-time');
                const publishTime = timeEl ? timeEl.textContent.trim() : '';
                
                if (title || playCount > 0) {
                    results.push({
                        title: title,
                        playCount: playCount,
                        likeCount: likeCount || 0,
                        commentCount: commentCount || 0,
                        shareCount: shareCount || 0,
                        url: url,
                        publishTime: publishTime,
                        videoId: extractVideoId(url),
                        raw: el
                    });
                }
            } catch (e) {
                console.error(`[DouyinExtractor] 提取第 ${index + 1} 条数据失败:`, e);
            }
        });
        
        console.log(`[DouyinExtractor] 从 DOM 中提取到 ${results.length} 条有效数据`);
        return results;
    }
    
    /**
     * 解析播放数量文本（如"1.2 万”、"10 万+"等）
     */
    function parsePlayCount(text) {
        if (!text) return 0;
        text = text.replace(/\s+/g, '');
        const match = text.match(/^([\d.]+)([万千+]?)$/);
        
        if (!match) {
            const numMatch = text.match(/^([\d.]+)/);
            if (numMatch) {
                return parseFloat(numMatch[1]) || 0;
            }
            return 0;
        }
        
        const num = parseFloat(match[1]);
        const unit = match[2];
        
        switch (unit) {
            case '万': return num * 10000;
            case '千': return num * 1000;
            case '+': return Math.floor(num * 10000);
            default: return num;
        }
    }
    
    /**
     * 从 URL 中提取视频 ID
     */
    function extractVideoId(url) {
        if (!url) return null;
        const match = url.match(/\/video\/(\d+)/);
        if (match && match[1]) {
            return match[1];
        }
        const shortMatch = url.match(/s\/(\w+)/);
        if (shortMatch && shortMatch[1]) {
            return shortMatch[1];
        }
        return null;
    }
    
    /**
     * 导出数据为 CSV
     */
    async function exportToCSV() {
        let dataToExport = [];
        
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['douyinData_batch'], (result) => {
                    resolve(result);
                });
            });
            
            if (result.douyinData_batch && result.douyinData_batch.length > 0) {
                dataToExport = result.douyinData_batch;
            } else if (allData.length > 0) {
                dataToExport = allData;
            }
        } catch (error) {
            console.error('[DouyinExtractor] 从 storage 加载数据失败:', error);
            dataToExport = allData;
        }
        
        if (dataToExport.length === 0) {
            return { success: false, message: '暂无数据可导出！' };
        }
        
        let csv = '\uFEFF' + '发布日期，视频链接，播放量，点赞，评论，收藏，转发\n';
        dataToExport.forEach(item => {
            const title = (item.title || '').replace(/"/g, '""');
            const url = item.url || '';
            const publishTime = item.publishTime || '';
            const fullDate = item.publishTime || '';
            const publishDate = fullDate.split(' ')[0] || '';
            csv += `\"${publishDate}\",\"${url}\",${item.playCount || 0},${item.likeCount || 0},${item.commentCount || 0},${item.collectCount || 0},${item.shareCount || 0}\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `douyin_videos_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        console.log(`[DouyinExtractor] ✅ 已导出 ${dataToExport.length} 条数据到 CSV 文件`);
        
        chrome.runtime.sendMessage({
            action: 'showNotification',
            message: `成功导出 ${dataToExport.length} 条抖音视频数据！`
        }).catch(console.error);
        
        return { success: true, count: dataToExport.length };
    }
    
    /**
     * 从当前页面提取数据
     */
    async function extractCurrentPage() {
        // 每次提取前重新加载配置，确保使用最新截止日期
        await loadConfig();
        console.log('[DouyinExtractor] 正在提取当前页面数据...');
        
        try {
            const result = await fetchWorkList(0, 30);
            
            if (result.tasks && result.tasks.length > 0) {
                // result.tasks 已由 fetchWorkList 统一格式化为标准化字段
                const extractedData = result.tasks;
                
                // 去重
                const existingUrls = new Set(allData.map(item => item.url));
                const newData = extractedData.filter(item => !existingUrls.has(item.url));
                
                // 按截止日期过滤
                const filtered = newData.filter(item => isValidTimestamp(item.createTimestamp));
                
                if (filtered.length > 0) {
                    allData = allData.concat(filtered);
                    
                    console.log(`[DouyinExtractor] 📊 本次提取：${newData.length} 条，符合条件：${filtered.length} 条，累计 ${allData.length} 条`);
                    
                    chrome.runtime.sendMessage({
                        action: 'updateDouyinData',
                        count: filtered.length,
                        total: allData.length
                    }).catch(console.error);
                    
                    await saveDataToStorage();
                } else {
                    console.log(`[DouyinExtractor] ⏹️ 所有 ${newData.length} 条数据均超过截止日期，无新增`);
                }
                
                return {
                    success: true,
                    count: filtered.length,
                    total: allData.length
                };
            }
        } catch (error) {
            console.error('[DouyinExtractor] API 提取失败，尝试 DOM 提取:', error);
        }
        
        const domData = extractDataFromDOM();
        
        if (domData.length > 0) {
            const existingUrls = new Set(allData.map(item => item.url));
            const newData = domData.filter(item => !existingUrls.has(item.url));
            
            if (newData.length > 0) {
                allData = allData.concat(newData);
                
                console.log(`[DouyinExtractor] 📊 DOM 提取：${newData.length} 条新数据，累计 ${allData.length} 条`);
                
                chrome.runtime.sendMessage({
                    action: 'updateDouyinData',
                    count: newData.length,
                    total: allData.length
                }).catch(console.error);
                
                return {
                    success: true,
                    count: newData.length,
                    total: allData.length
                };
            }
        }
        
        return { success: false, message: '未能从页面提取到数据' };
    }
    
    async function saveDataToStorage() {
        try {
            const batchKey = 'douyinData_batch';
            await chrome.storage.local.set({ [batchKey]: allData });
            console.log(`[DouyinExtractor] ✅ 数据已保存到本地存储 (${allData.length} 条)`);
        } catch (error) {
            console.error('[DouyinExtractor] 保存数据失败:', error);
            if (allData.length > 100) {
                await chrome.storage.local.set({ ['douyinData_batch']: allData.slice(0, 100) });
            }
        }
    }
    
    // 发送进度通知给 popup（通过 runtime 广播）
    function notifyProgress(isRunning, page, total, count, totalItems, error) {
        chrome.runtime.sendMessage({
            action: 'extractionProgress',
            isRunning: isRunning,
            currentPage: page,
            total: total,
            count: count,
            totalItems: totalItems,
            success: !error,
            error: error
        }).catch(console.error);
    }
    
    /**
     * 开始自动抓取
     */
    async function startAutoExtraction() {
        // 开始抓取前重新加载配置，确保使用最新截止日期
        await loadConfig();
        
        if (isRunning) {
            const error = '正在进行抓取，请稍后再试';
            console.error('[DouyinExtractor]', error);
            return { success: false, message: error };
        }
        
        isRunning = true;
        allData = [];
        currentPage = 1;
        
        console.log('[DouyinExtractor] 🚀 开始自动抓取抖音视频数据...');
        
        chrome.runtime.sendMessage({
            action: 'douyinExtractionStarted',
            totalPages: config.maxPages
        }).catch(console.error);
        
        // 通知进度开始
        notifyProgress(true, 1, config.maxPages, 0, 0);
        
        try {
            const maxPages = config.maxPages;
            let cursor = 0;
            let pageCount = 0;
            
            while (pageCount < maxPages && isRunning) {
                console.log(`\n[DouyinExtractor] === 正在获取第 ${pageCount + 1} 页数据 (cursor: ${cursor}) ===`);
                
                // 在每次 API 调用前检查 isRunning 状态
                if (!isRunning) {
                    console.log('[DouyinExtractor] 抓取已被停止');
                    break;
                }
                
                const result = await fetchWorkList(cursor, config.pageSize);
                
                // API 调用后再次检查 isRunning 状态
                if (!isRunning) {
                    console.log('[DouyinExtractor] 抓取已被停止');
                    break;
                }
                
                if (result.error || !result.tasks || result.tasks.length === 0) {
                    if (result.error) {
                        console.error('[DouyinExtractor]', result.error);
                    }
                    console.log('[DouyinExtractor] ⏹ API 返回错误或空数据，停止抓取');
                    break;
                }
                
                // result.tasks 已由 fetchWorkList 统一格式化为标准化字段，直接使用
                const extractedData = result.tasks;
                
                const existingUrls = new Set(allData.map(item => item.url));
                const newWorks = extractedData.filter(work => !existingUrls.has(work.url));
                
                if (newWorks.length > 0) {
                    // 过滤出符合截止日期的数据
                    const validWorks = [];
                    for (const work of newWorks) {
                        if (isValidTimestamp(work.createTimestamp)) {
                            validWorks.push(work);
                        }
                    }
                    
                    if (validWorks.length > 0) {
                        allData = allData.concat(validWorks);
                        
                        console.log(`[DouyinExtractor] 📊 第 ${pageCount + 1} 页：新增 ${validWorks.length} 条数据，累计 ${allData.length} 条`);
                        
                        chrome.runtime.sendMessage({
                            action: 'updateDouyinData',
                            count: validWorks.length,
                            total: allData.length
                        }).catch(console.error);
                        
                        // 通知进度更新
                        notifyProgress(true, pageCount + 2, maxPages, validWorks.length, allData.length);
                        
                        // 检查是否满足停止条件：第四项及以后有过期数据
                        const shouldStop = checkCutoffDate();
                        if (shouldStop) {
                            console.log('[DouyinExtractor] ⏹️ 检测到超过截止日期的数据，停止抓取');
                            await saveDataToStorage();
                            isRunning = false;
                            
                            notifyProgress(false, pageCount + 1, maxPages, 0, allData.length);
                            
                            return { 
                                success: true, 
                                totalCount: allData.length,
                                message: `在第 ${pageCount + 1} 页检测到已超过截止日期的数据，停止抓取`
                            };
                        }
                        
                        if ((pageCount + 1) % 5 === 0) {
                            await saveDataToStorage();
                        }
                    } else {
                        // 如果这一页所有数据都过期了
                        console.log(`[DouyinExtractor] ⏹️ 第 ${pageCount + 1} 页已无符合截止日期的数据，停止抓取`);
                        await saveDataToStorage();
                        isRunning = false;
                        
                        notifyProgress(false, pageCount + 1, maxPages, 0, allData.length);
                        
                        return { 
                            success: true, 
                            totalCount: allData.length,
                            message: `在第 ${pageCount + 1} 页检测到已超过截止日期的数据，停止抓取`
                        };
                    }
                } else {
                    console.log(`[DouyinExtractor] △ 第 ${pageCount + 1} 页没有新数据`);
                    break;
                }
                
                cursor = result.cursor || (cursor + config.pageSize);
                pageCount++;
                
                // 只有在运行时且未达到最大页数时才等待
                if (isRunning && pageCount < maxPages) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            await saveDataToStorage();
            
            isRunning = false;
            
            console.log(`[DouyinExtractor] 🎉 自动抓取完成！共提取 ${allData.length} 条数据`);
            
            // 通知完成
            notifyProgress(false, pageCount + 1, maxPages, 0, allData.length);
            
            chrome.runtime.sendMessage({
                action: 'douyinExtractionComplete',
                totalCount: allData.length
            }).catch(console.error);
            
            return { success: true, totalCount: allData.length };
        } catch (error) {
            console.error('[DouyinExtractor] 抓取失败:', error);
            isRunning = false;
            
            // 通知失败
            notifyProgress(false, pageCount + 1, config.maxPages, 0, allData.length, error.message);
            
            return { success: false, error: error.message };
        }
    }
    
    function stopExtraction() {
        isRunning = false;
        console.log('[DouyinExtractor] ⏹️ 抓取已停止');
        return { success: true, message: '抓取已停止' };
    }
    
    function clearData() {
        allData = [];
        console.log('[DouyinExtractor] 🗑️ 数据已清空');
        return { success: true };
    }
    
    function getAllData() {
        return allData;
    }
    
    return {
        startAutoExtraction,
        stopExtraction,
        exportToCSV,
        extractCurrentPage,
        getAllData,
        clearData
    };
})();

// ============================================
// 消息监听 - 处理来自 popup/background 的消息
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[ContentScript] Received message:', message);
    
    // 检查当前页面类型并分发到对应的提取器
    const currentUrl = window.location.href;
    
    // 抖音创作者服务平台工作列表页面
    const isDouyinPage = currentUrl.includes('creator.douyin.com/creator-micro/content/manage');
    
    // 百度贴吧创作页面
    const isTiebaPage = currentUrl.startsWith('https://tieba.baidu.com/home/creative/work');
    
    console.log('[ContentScript] 当前 URL:', currentUrl);
    console.log('[ContentScript] isDouyinPage:', isDouyinPage, 'isTiebaPage:', isTiebaPage);
    
    switch (message.action) {
        case 'startAutoExtraction':
            console.log('[ContentScript] startAutoExtraction 请求已收到，正在立即响应...');
            if (isDouyinPage) {
                const pages = message.pages || 42;
                try {
                    // 立即启动异步抓取（不等待完成，进度通过 extractionProgress 消息通知）
                    DouyinExtractor.startAutoExtraction(pages).catch(err => {
                        console.error('[ContentScript] 自动抓取失败:', err);
                    });
                    // 立即响应 popup，告知已成功启动
                    sendResponse({ success: true, message: '自动抓取已启动' });
                } catch (err) {
                    console.error('[ContentScript] 启动自动抓取失败:', err);
                    sendResponse({ success: false, error: err.message });
                }
                return true;
            } else if (isTiebaPage) {
                try {
                    const pages = message.pages || 42;
                    // 立即启动异步抓取（不等待完成，进度通过 extractionProgress 消息通知）
                    TiebaExtractor.startAutoExtraction(pages).catch(err => {
                        console.error('[ContentScript] 自动抓取失败:', err);
                    });
                    // 立即响应 popup，告知已成功启动
                    sendResponse({ success: true, message: '自动抓取已启动' });
                } catch (err) {
                    console.error('[ContentScript] 启动自动抓取失败:', err);
                    sendResponse({ success: false, error: err.message });
                }
                return true;
            } else {
                console.warn('[ContentScript] startAutoExtraction: 不在支持的页面上');
                sendResponse({ 
                    success: false, 
                    error: '当前页面不支持自动抓取，请在抖音创作者服务中心或百度贴吧创作页面使用'
                });
                return true;
            }
            break;
            
        case 'stopExtraction':
            if (isDouyinPage) {
                const stopResult = DouyinExtractor.stopExtraction();
                sendResponse(stopResult);
            } else if (isTiebaPage) {
                const stopResult = TiebaExtractor.stopExtraction();
                sendResponse(stopResult);
            }
            return true;
            
        case 'exportToCSV':
            if (isDouyinPage) {
                DouyinExtractor.exportToCSV().then(result => {
                    sendResponse(result);
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
                return true;
            } else if (isTiebaPage) {
                TiebaExtractor.exportToCSV().then(result => {
                    sendResponse(result);
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
                return true;
            }
            return true;
            
        case 'extractNow':
            if (isDouyinPage) {
                DouyinExtractor.extractCurrentPage().then(result => {
                    sendResponse(result);
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
                return true;
            } else if (isTiebaPage) {
                TiebaExtractor.extractCurrentPage().then(result => {
                    sendResponse(result);
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
                return true;
            }
            return true;
            
        case 'clearData':
            if (isDouyinPage) {
                const clearResult = DouyinExtractor.clearData();
                sendResponse(clearResult);
            } else if (isTiebaPage) {
                const clearResult = TiebaExtractor.clearData();
                sendResponse(clearResult);
            }
            return true;
            
        default:
            console.warn('[ContentScript] Unknown action:', message.action);
            sendResponse({ success: false, error: 'Unknown action' });
            return true;
    }
});

// 暴露到全局供控制台调用
window.tiebaExtractor = TiebaExtractor;
window.douyinExtractor = DouyinExtractor;

console.log('[ContentScript] === 百度贴吧 & 抖音视频数据提取器已加载 ===');
}