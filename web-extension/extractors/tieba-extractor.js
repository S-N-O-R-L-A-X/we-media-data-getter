// ============================================
// Tieba (Baidu Tieba) Extractor - 百度贴吧提取器
// ============================================

class TiebaExtractor extends BaseExtractor {
    constructor() {
        super({});
    }

    getPlatformName() {
        return 'Tieba';
    }

    matchesUrl(url) {
        return url.startsWith('https://tieba.baidu.com/home/creative/work');
    }

    timestampToDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    async fetchDataFromAPI(pageNumber = 1) {
        try {
            const url = new URL('https://tieba.baidu.com/mo/q/work/list');
            url.searchParams.set('type', 'all');
            url.searchParams.set('pn', pageNumber);
            url.searchParams.set('rn', 10);
            const response = await fetch(url.toString());
            const result = await response.json();
            if (result.no !== 0) return { works: [], error: result.error };
            const works = result.data?.works || [];
            
            const filteredRaw = this.config.filterBlocked 
                ? works.filter(w => !this.isItemBlocked(w))
                : works;
            
            const parsedData = filteredRaw.map(work => ({
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
        await this.loadConfig();
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

    async startAutoExtraction(maxPages = this.config.maxPages, cutoffDate) {
        if (this.isRunning) return { success: false, message: 'Already running' };
        await this.loadConfig({ cutoffDate });
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
        let csv = '\uFEFF"发布日期","视频链接","播放量","点赞","评论","收藏","分享"\n';
        for (const item of data) {
            csv += `"${item.date}","${item.url}",${item.playCount},${item.agreeCount},${item.commentCount},${item.collectCount},${item.shareCount}\n`;
        }
        return csv;
    }

    async exportToCSV() {
        let dataToExport = [];
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['tiebaData_batch'], (r) => resolve(r));
            });
            if (result.tiebaData_batch && result.tiebaData_batch.length > 0) {
                dataToExport = result.tiebaData_batch.reverse();
            } else if (this.allData.length > 0) {
                dataToExport = this.allData.reverse();
            }
        } catch (error) {
            console.error('[TiebaExtractor] 从 storage 加载数据失败:', error);
            dataToExport = this.allData;
        }

        if (dataToExport.length === 0) {
            return { success: false, message: '暂无数据可导出！' };
        }

        const csv = this.generateCSV(dataToExport);
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

        console.log('[TiebaExtractor] ✅ 已导出 ' + dataToExport.length + ' 条数据到 CSV 文件');
        
        chrome.runtime.sendMessage({
            action: 'showNotification',
            message: `成功导出 ${dataToExport.length} 条数据！`
        }).catch(console.error);

        return { success: true, count: dataToExport.length };
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.TiebaExtractor = TiebaExtractor;
}