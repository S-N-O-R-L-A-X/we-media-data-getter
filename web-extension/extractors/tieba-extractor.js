// ============================================
// Tieba (Baidu Tieba) Extractor - 百度贴吧提取器
// ============================================

/**
 * Baidu Tieba video data extractor
 */
class TiebaExtractor extends BaseExtractor {
    constructor() {
        super({
            cutoffDate: new Date('2026-05-25'),
            maxPages: 42,
            autoPageDelay: 3000,
            waitForPageLoadTimeout: 15000
        });
    }

    getPlatformName() {
        return 'Tieba';
    }

    matchesUrl(url) {
        return url.startsWith('https://tieba.baidu.com/home/creative/work');
    }

    /**
     * Convert timestamp to date string
     */
    timestampToDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    async fetchDataFromAPI(pageNumber = 1) {
        console.log('[TiebaExtractor] Fetching page ' + pageNumber);
        try {
            const url = new URL('https://tieba.baidu.com/mo/q/work/list');
            url.searchParams.set('type', "all");
            url.searchParams.set('pn', pageNumber);
            url.searchParams.set('rn', 10);
            const response = await fetch(url.toString());
            const result = await response.json();
            if (result.no !== 0) return { works: [], error: result.error };
            const works = result.data?.works || [];
            const parsedData = works.map(work => ({
                date: this.timestampToDate(work.publish_time),
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
            return { works: [], error: error.message };
        }
    }

    async extractCurrentPage() {
        console.log('[TiebaExtractor] Extracting current page...');
        const apiResult = await this.fetchDataFromAPI(this.currentPage);
        if (apiResult.error || !apiResult.works.length) {
            return { success: false, message: apiResult.error || 'No data' };
        }
        const filtered = apiResult.works.filter(item => this.isValidTimestamp(item.raw?.publish_time));
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
            for (let page = 1; page <= maxPages && this.isRunning; page++) {
                const apiResult = await this.fetchDataFromAPI(page);
                if (apiResult.error || !apiResult.works.length) break;
                
                const existingUrls = new Set(this.allData.map(item => item.url));
                const newWorks = apiResult.works.filter(w => !existingUrls.has(w.url));
                
                if (!newWorks.length) {
                    console.log('[TiebaExtractor] No new data on page ' + page);
                    break;
                }
                
                const filtered = newWorks.filter(w => this.isValidTimestamp(w.raw?.publish_time));
                this.allData.push(...filtered);
                this.notifyProgress(true, page, maxPages, filtered.length, this.allData.length);
                
                // Check cutoff
                if (newWorks.some(w => !this.isValidTimestamp(w.raw?.publish_time))) {
                    await this.saveDataToStorage();
                    this.isRunning = false;
                    this.notifyProgress(false, page, maxPages, 0, this.allData.length);
                    return { success: true, totalCount: this.allData.length };
                }
                
                if (page % 5 === 0) await this.saveDataToStorage();
            }
            
            this.allData.sort((a, b) => b.date.localeCompare(a.date));
            await this.saveDataToStorage();
            this.isRunning = false;
            this.notifyProgress(false, maxPages, maxPages, 0, this.allData.length);
            return { success: true, totalCount: this.allData.length };
        } catch (error) {
            this.isRunning = false;
            this.notifyProgress(false, this.currentPage, maxPages, 0, this.allData.length, error.message);
            return { success: false, error: error.message };
        }
    }

    generateCSV(data) {
        let csv = '\uFEFF"发布日期","视频标题","视频链接","浏览数","点赞数","评论数","收藏数","分享数"\n';
        for (const item of data) {
            csv += `"${item.date}","${(item.title || '').replace(/"/g, '""')}","${item.url}",${item.playCount},${item.agreeCount},${item.commentCount},${item.collectCount},${item.shareCount}\n`;
        }
        return csv;
    }
}

if (typeof window !== 'undefined') {
    window.TiebaExtractor = TiebaExtractor;
}
