// ============================================
// Shipinhao (WeChat Channels) Extractor - 视频号提取器
// ============================================

class ShipinhaoExtractor extends BaseExtractor {
    constructor() {
        super({});
    }

    getPlatformName() {
        return 'Shipinhao';
    }

    matchesUrl(url) {
        return url.startsWith('https://channels.weixin.qq.com/micro/content/post/list') ||
               url.startsWith('https://channels.weixin.qq.com/platform/post/list');
    }

    timestampToDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    getCookie(name) {
        const match = document.cookie.match(new RegExp('(?:^| )' + name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : '';
    }

    async fetchDataFromAPI(pageNumber = 1, rawKeyBuff = '') {
        try {
            const currentUrl = window.location.href;
            const urlObj = new URL(currentUrl);
            const aid = urlObj.searchParams.get('_aid') || '';
            const rid = urlObj.searchParams.get('_rid') || '';
            const pageUrl = urlObj.searchParams.get('_pageUrl') || currentUrl.replace('/platform/', '/micro/content/');

            const apiUrl = new URL('https://channels.weixin.qq.com/micro/content/cgi-bin/mmfinderassistant-bin/post/post_list');
            if (aid) apiUrl.searchParams.set('_aid', aid);
            if (rid) apiUrl.searchParams.set('_rid', rid);
            apiUrl.searchParams.set('_pageUrl', pageUrl);

            const fingerprintId = this.getCookie('finger-print-device-id') || '';
            const wechatUin = this.getCookie('wxuin') || this.getCookie('wechat_uin') || '';
            let logFinderId = '';
            try { logFinderId = localStorage.getItem('_log_finder_id') || ''; } catch (e) {}
            if (!logFinderId) {
                try { logFinderId = sessionStorage.getItem('_log_finder_id') || ''; } catch (e) {}
            }

            const headers = { 'Content-Type': 'application/json' };
            if (fingerprintId) headers['finger-print-device-id'] = fingerprintId;
            if (wechatUin) headers['x-wechat-uin'] = wechatUin;

            const body = {
                pageSize: 20,
                currentPage: pageNumber,
                userpageType: 11,
                stickyOrder: true,
                timestamp: String(Date.now()),
                _log_finder_uin: '',
                _log_finder_id: logFinderId,
                rawKeyBuff: rawKeyBuff || '',
                pluginSessionId: null,
                scene: 7,
                reqScene: 7
            };

            const response = await fetch(apiUrl.toString(), {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (result.errCode !== 0) return { items: [], error: `errCode=${result.errCode}: ${result.errMsg}`, rawKeyBuff: '', continueFlag: false, totalCount: 0 };

            const items = result.data?.list || [];
            const newRawKeyBuff = result.data?.rawKeyBuff || '';
            const continueFlag = result.data?.continueFlag || false;

            const filteredRaw = this.config.filterBlocked
                ? items.filter(item => !this.isItemBlocked(item))
                : items;

            const parsedData = filteredRaw.map(item => {
                const shortTitle = item.desc?.shortTitle?.[0]?.shortTitle || '';
                const description = item.desc?.description || '';
                return {
                    date: this.timestampToDate(item.createTime),
                    url: `${window.location.origin}${window.location.pathname}?objectId=${encodeURIComponent(item.objectId || item.exportId || '')}`,
                    title: shortTitle || description.split('\n')[0] || '',
                    readCount: item.readCount || 0,
                    likeCount: item.likeCount || 0,
                    commentCount: item.commentCount || 0,
                    favCount: item.favCount || 0,
                    forwardCount: item.forwardCount || 0,
                    raw: item
                };
            });

            return { items: parsedData, error: null, rawKeyBuff: newRawKeyBuff, continueFlag, totalCount: result.data?.totalCount || 0 };
        } catch (error) {
            return { items: [], error: error.message, rawKeyBuff: '', continueFlag: false, totalCount: 0 };
        }
    }

    async extractCurrentPage() {
        await this.loadConfig();
        console.log('[ShipinhaoExtractor] Extracting current page...');
        const apiResult = await this.fetchDataFromAPI(this.currentPage, '');
        if (apiResult.error || !apiResult.items.length) {
            return { success: false, message: apiResult.error || 'No data' };
        }
        const filtered = apiResult.items.filter(item => this.isValidTimestamp(item.raw?.createTime));
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
            let rawKeyBuff = '';
            for (let page = 1; page <= maxPages && this.isRunning; page++) {
                const apiResult = await this.fetchDataFromAPI(page, rawKeyBuff);
                if (apiResult.error || !apiResult.items.length) break;

                const existingUrls = new Set(this.allData.map(item => item.url));
                const newItems = apiResult.items.filter(w => !existingUrls.has(w.url));

                if (!newItems.length) {
                    console.log('[ShipinhaoExtractor] No new data on page ' + page);
                    break;
                }

                const filtered = newItems.filter(w => this.isValidTimestamp(w.raw?.createTime));
                this.allData.push(...filtered);
                this.notifyProgress(true, page, maxPages, filtered.length, this.allData.length);

                if (newItems.some(w => !this.isValidTimestamp(w.raw?.createTime))) {
                    await this.saveDataToStorage();
                    this.isRunning = false;
                    this.notifyProgress(false, page, maxPages, 0, this.allData.length);
                    return { success: true, totalCount: this.allData.length };
                }

                if (!apiResult.continueFlag) {
                    console.log('[ShipinhaoExtractor] No more pages (continueFlag=false)');
                    break;
                }

                rawKeyBuff = apiResult.rawKeyBuff;

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
        let csv = '\uFEFF"发布日期","视频链接","标题","播放量","点赞","评论","收藏","转发"\n';
        for (const item of data) {
            const escapedTitle = (item.title || '').replace(/"/g, '""');
            csv += `"${item.date}","${item.url}","${escapedTitle}",${item.readCount},${item.likeCount},${item.commentCount},${item.favCount},${item.forwardCount}\n`;
        }
        return csv;
    }

    async exportToCSV() {
        let dataToExport = [];
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['shipinhaoData_batch'], (r) => resolve(r));
            });
            if (result.shipinhaoData_batch && result.shipinhaoData_batch.length > 0) {
                dataToExport = result.shipinhaoData_batch.reverse();
            } else if (this.allData.length > 0) {
                dataToExport = this.allData.reverse();
            }
        } catch (error) {
            console.error('[ShipinhaoExtractor] 从 storage 加载数据失败:', error);
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
        a.download = `shipinhao_videos_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log('[ShipinhaoExtractor] ✅ 已导出 ' + dataToExport.length + ' 条数据到 CSV 文件');

        chrome.runtime.sendMessage({
            action: 'showNotification',
            message: `成功导出 ${dataToExport.length} 条数据！`
        }).catch(console.error);

        return { success: true, count: dataToExport.length };
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.ShipinhaoExtractor = ShipinhaoExtractor;
}
