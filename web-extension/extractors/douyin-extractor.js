// ============================================
// Douyin (TikTok China) Extractor - 抖音提取器
// ============================================

class DouyinExtractor extends BaseExtractor {
    constructor() {
        // 不设置任何默认值，直接从 ConfigManager 获取
        super({
            apiUrl: 'https://creator.douyin.com/janus/douyin/creator/pc/work_list'
        });
    }

    getPlatformName() { return 'Douyin'; }

    matchesUrl(url) {
        return url.includes('creator.douyin.com/creator-micro/content/manage');
    }

    timestampToDateStr(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    async fetchDataFromAPI(pageOrCursor = 1) {
        console.log('[DouyinExtractor] Fetching data...');
        try {
            const cookies = await this.getCookies();
            const url = this.config.apiUrl + '?page=' + pageOrCursor + '&page_size=' + this.config.pageSize;
            const response = await fetch(url, {
                headers: {
                    'Cookie': cookies,
                    'Content-Type': 'application/json'
                }
            });
            const result = await response.json();
            
            if (result.status_code !== 0) {
                return { tasks: [], has_more: false, cursor: 0, error: 'Status code: ' + result.status_code };
            }
            
            let tasks = [];
            if (result.aweme_list?.length) {
                tasks = this.extractFromAwemeList(result.aweme_list);
            } else if (result.items?.length) {
                tasks = this.extractFromItems(result.items);
            }
            
            return { tasks, has_more: !!result.has_more, cursor: result.cursor || 0, error: null };
        } catch (error) {
            return { tasks: [], has_more: false, cursor: 0, error: error.message };
        }
    }

    getCookies() {
        return new Promise((resolve) => {
            chrome.cookies.getAll({ domain: 'douyin.com' }, (cookies) => {
                resolve(cookies.map(c => c.name + '=' + c.value).join('; '));
            });
        });
    }

    extractFromAwemeList(awemeList) {
        return awemeList.map(item => ({
            title: item.caption || item.desc || '',
            playCount: parseInt(item.statistics?.play_count, 10) || 0,
            likeCount: parseInt(item.statistics?.digg_count, 10) || 0,
            commentCount: parseInt(item.statistics?.comment_count, 10) || 0,
            collectCount: parseInt(item.statistics?.collect_count, 10) || 0,
            shareCount: parseInt(item.statistics?.forward_count, 10) || 0,
            url: `https://www.douyin.com/video/${item.aweme_id}`,
            videoId: item.aweme_id,
            authorName: item.author?.nickname || '',
            authorId: item.author?.uid || '',
            duration: item.duration ? Math.round(item.duration / 1000) : 0,
            coverUrl: (item.video?.cover?.url_list?.[0]) || '',
            publishTime: this.timestampToDateStr(item.create_time),
            createTimestamp: item.create_time || 0,
            reviewed: !!(item.status?.reviewed),
            mixName: item.mix_info?.mix_name || '',
            isPinned: !!item.is_pinned,
            raw: item
        }));
    }

    extractFromItems(items) {
        return items.map(item => ({
            title: item.description || item.item_title || '',
            playCount: parseInt(item.metrics?.view_count, 10) || 0,
            likeCount: parseInt(item.metrics?.like_count, 10) || 0,
            commentCount: parseInt(item.metrics?.comment_count, 10) || 0,
            collectCount: parseInt(item.metrics?.favorite_count, 10) || 0,
            shareCount: parseInt(item.metrics?.share_count, 10) || 0,
            url: `https://www.douyin.com/video/${item.id}`,
            videoId: item.id,
            authorName: '',
            authorId: '',
            duration: 0,
            coverUrl: (item.cover?.url_list?.[0]) || '',
            publishTime: this.timestampToDateStr(item.create_time),
            createTimestamp: item.create_time || 0,
            reviewed: !!(item.review?.status === 2),
            mixName: '',
            isPinned: false,
            raw: item
        }));
    }

    checkCutoffDate() {
        if (!this.allData.length) return false;
        const sortedData = [...this.allData].sort((a, b) => b.createTimestamp - a.createTimestamp);
        for (let i = 3; i < sortedData.length; i++) {
            if (!this.isValidTimestamp(sortedData[i].createTimestamp)) return true;
        }
        return false;
    }

    async extractCurrentPage() {
        console.log('[DouyinExtractor] Extracting current page...');
        const apiResult = await this.fetchDataFromAPI(this.currentPage);
        if (apiResult.error || !apiResult.tasks.length) {
            return { success: false, message: apiResult.error || 'No data' };
        }
        const filtered = apiResult.tasks.filter(item => this.isValidTimestamp(item.createTimestamp));
        this.allData.push(...filtered);
        this.notifyProgress(true, this.currentPage, this.config.maxPages, filtered.length, this.allData.length);
        return { success: true, total: this.allData.length };
    }

    async startAutoExtraction(maxPages = this.config.maxPages) {
        if (this.isRunning) return { success: false, message: 'Already running' };
        this.isRunning = true;
        this.allData = [];
        this.currentPage = 1;
        this.notifyProgress(true, 1, maxPages, 0, 0);
        
        try {
            let cursor = 0;
            let pageCount = 0;
            
            while (pageCount < maxPages && this.isRunning) {
                const apiResult = await this.fetchDataFromAPI(cursor);
                
                if (apiResult.error || !apiResult.tasks.length) break;
                
                const existingUrls = new Set(this.allData.map(item => item.url));
                const newWorks = apiResult.tasks.filter(w => !existingUrls.has(w.url));
                
                if (!newWorks.length) {
                    console.log('[DouyinExtractor] No new data');
                    break;
                }
                
                const validWorks = newWorks.filter(w => this.isValidTimestamp(w.createTimestamp));
                this.allData.push(...validWorks);
                this.notifyProgress(true, pageCount + 1, maxPages, validWorks.length, this.allData.length);
                
                if (this.checkCutoffDate()) {
                    await this.saveDataToStorage();
                    this.isRunning = false;
                    this.notifyProgress(false, pageCount + 1, maxPages, 0, this.allData.length);
                    return { success: true, totalCount: this.allData.length };
                }
                
                if ((pageCount + 1) % 5 === 0) await this.saveDataToStorage();
                cursor += this.config.pageSize;
                pageCount++;
            }
            
            await this.saveDataToStorage();
            this.isRunning = false;
            this.notifyProgress(false, pageCount, maxPages, 0, this.allData.length);
            return { success: true, totalCount: this.allData.length };
        } catch (error) {
            this.isRunning = false;
            this.notifyProgress(false, this.currentPage, maxPages, 0, this.allData.length, error.message);
            return { success: false, error: error.message };
        }
    }

    generateCSV(data) {
        let csv = '\uFEFF"标题","播放数","点赞数","评论数","收藏数","分享数","作者","视频链接","发布时间"\n';
        for (const item of data) {
            csv += `"${(item.title || '').replace(/"/g, '""')}",${item.playCount},${item.likeCount},${item.commentCount},${item.collectCount},${item.shareCount},"${(item.authorName || '').replace(/"/g, '""')}",\"${item.url}\",\"${item.publishTime}\"\n`;
        }
        return csv;
    }
}

if (typeof window !== 'undefined') {
    window.DouyinExtractor = DouyinExtractor;
}