// ============================================
// Kuaishou (Kwai) Extractor - 快手提取器
// ============================================

class KuaishouExtractor extends BaseExtractor {
    constructor() {
        super({});
        this._nsSig3 = null;
    }

    getPlatformName() {
        return 'Kuaishou';
    }

    matchesUrl(url) {
        return url.startsWith('https://cp.kuaishou.com/article/manage/video');
    }

    timestampToDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    _readCapturedData() {
        const el = document.getElementById('__kwai_d');
        if (el && el.textContent) {
            console.log('[KuaishouExtractor] Found captured data div, length:', el.textContent.length);
            try {
                return JSON.parse(el.textContent);
            } catch (e) {
                console.warn('[KuaishouExtractor] Failed to parse captured data:', e.message.substring(0, 100));
            }
        } else {
            console.log('[KuaishouExtractor] Captured data div not found or empty');
        }
        return null;
    }

    async fetchNSig3() {
        if (this._nsSig3) return this._nsSig3;

        try {
            const s = document.documentElement.getAttribute('data-kwai-s');
            if (s) { this._nsSig3 = s; console.log('[KuaishouExtractor] Got NS_sig3 from DOM attr'); return s; }
            console.log('[KuaishouExtractor] data-kwai-s attr not found');
        } catch (e) {}

        try {
            const entries = performance.getEntriesByType('resource');
            for (const e of entries) {
                if (e.name.indexOf('/rest/cp/works/v2/video/pc/photo/list') >= 0) {
                    const u = new URL(e.name);
                    const s = u.searchParams.get('__NS_sig3');
                    if (s) { this._nsSig3 = s; return s; }
                }
            }
        } catch (e) {}

        try {
            const scripts = document.querySelectorAll('script');
            for (const s of scripts) {
                const t = s.textContent || '';
                const m = t.match(/__NS_sig3\s*[=:]\s*['"]([^'"]+)['"]/);
                if (m) { this._nsSig3 = m[1]; return this._nsSig3; }
            }
            const meta = document.querySelector('meta[name="__NS_sig3"]');
            if (meta) {
                this._nsSig3 = meta.getAttribute('content');
                return this._nsSig3;
            }
        } catch (e) {
            console.warn('[KuaishouExtractor] Failed to extract __NS_sig3:', e);
        }
        return null;
    }

    _parseApiResult(result) {
        if (!result) {
            console.warn('[KuaishouExtractor] No result to parse');
            return { works: [], error: 'Empty response', nextCursor: null, total: 0 };
        }
        if (result.result !== 1) {
            console.warn('[KuaishouExtractor] API error:', result.result, result.message);
            return { works: [], error: result.message || 'API error', nextCursor: null, total: 0 };
        }
        const list = result.data?.list || [];
        console.log('[KuaishouExtractor] Parsing result, list length:', list.length);

        const filteredRaw = this.config.filterBlocked
            ? list.filter(w => !this.isItemBlocked(w))
            : list;

        const parsedData = filteredRaw.map(item => ({
            date: this.timestampToDate(item.uploadTime),
            url: `https://cp.kuaishou.com/article/manage/video?workId=${item.workId}`,
            title: item.title || '',
            playCount: item.playCount || 0,
            agreeCount: item.likeCount || 0,
            commentCount: item.commentCount || 0,
            collectCount: 0,
            shareCount: 0,
            durationSecond: item.durationSecond || 0,
            uploadTime: item.uploadTime,
            raw: item
        }));

        return {
            works: parsedData,
            error: null,
            nextCursor: result.data?.nextCursor || null,
            total: result.data?.total || 0
        };
    }

    async fetchDataFromAPI(cursor = null) {
        if (!cursor) {
            const captured = this._readCapturedData();
            if (captured) {
                console.log('[KuaishouExtractor] Using captured API data');
                const parsed = this._parseApiResult(captured);
                console.log('[KuaishouExtractor] Captured data parsed, works:', parsed.works.length);
                return parsed;
            }
            console.log('[KuaishouExtractor] No captured data, falling back to direct API call');
        }

        try {
            const url = new URL('https://cp.kuaishou.com/rest/cp/works/v2/video/pc/photo/list');
            if (cursor) {
                url.searchParams.set('pcursor', cursor);
            }
            const nsSig3 = await this.fetchNSig3();
            if (nsSig3) {
                url.searchParams.set('__NS_sig3', nsSig3);
                console.log('[KuaishouExtractor] Making API call WITH sig3:', nsSig3.substring(0, 20) + '...');
            } else {
                console.log('[KuaishouExtractor] Making API call WITHOUT sig3');
            }

            const response = await fetch(url.toString(), {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': window.location.href,
                    'Origin': window.location.origin
                }
            });
            const result = await response.json();
            console.log('[KuaishouExtractor] API response result:', result.result);
            return this._parseApiResult(result);
        } catch (error) {
            console.warn('[KuaishouExtractor] API call error:', error.message);
            return { works: [], error: error.message, nextCursor: null, total: 0 };
        }
    }

    async extractCurrentPage() {
        await this.loadConfig();
        console.log('[KuaishouExtractor] Extracting current page...');
        const apiResult = await this.fetchDataFromAPI(null);
        if (apiResult.error || !apiResult.works.length) {
            console.log('[KuaishouExtractor] extract result:', apiResult.error || 'No data');
            return { success: false, message: apiResult.error || 'No data' };
        }
        const filtered = apiResult.works.filter(item => this.isValidTimestamp(item.uploadTime / 1000));
        this.allData.push(...filtered);
        console.log('[KuaishouExtractor] extracted works:', filtered.length, 'total:', this.allData.length);
        this.notifyProgress(true, this.currentPage, this.config.maxPages, filtered.length, this.allData.length);
        return { success: true, total: this.allData.length };
    }

    async startAutoExtraction(maxPages = this.config.maxPages, cutoffDate) {
        if (this.isRunning) return { success: false, message: 'Already running' };
        await this.loadConfig({ cutoffDate });
        this.isRunning = true;
        this.allData = [];
        let currentCursor = null;
        let pageCount = 0;
        this.notifyProgress(true, 1, maxPages, 0, 0);

        try {
            for (let page = 1; page <= maxPages && this.isRunning; page++) {
                pageCount = page;
                const apiResult = await this.fetchDataFromAPI(currentCursor);
                if (apiResult.error || !apiResult.works.length) break;

                const existingUrls = new Set(this.allData.map(item => item.url));
                const newWorks = apiResult.works.filter(w => !existingUrls.has(w.url));

                if (!newWorks.length) {
                    console.log('[KuaishouExtractor] No new data on page ' + page);
                    break;
                }

                const filtered = newWorks.filter(w => this.isValidTimestamp(w.uploadTime / 1000));
                this.allData.push(...filtered);
                this.notifyProgress(true, page, maxPages, filtered.length, this.allData.length);

                if (newWorks.some(w => !this.isValidTimestamp(w.uploadTime / 1000))) {
                    this.allData.sort((a, b) => b.date.localeCompare(a.date));
                    await this.saveDataToStorage();
                    this.isRunning = false;
                    this.notifyProgress(false, page, maxPages, 0, this.allData.length);
                    return { success: true, totalCount: this.allData.length };
                }

                currentCursor = apiResult.nextCursor;
                if (!currentCursor) break;

                if (page % 5 === 0) {
                    this.allData.sort((a, b) => b.date.localeCompare(a.date));
                    await this.saveDataToStorage();
                }
            }

            this.allData.sort((a, b) => b.date.localeCompare(a.date));
            await this.saveDataToStorage();
            this.isRunning = false;
            this.notifyProgress(false, pageCount, maxPages, 0, this.allData.length);
            return { success: true, totalCount: this.allData.length };
        } catch (error) {
            this.isRunning = false;
            this.notifyProgress(false, pageCount, maxPages, 0, this.allData.length, error.message);
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
                chrome.storage.local.get(['kuaishouData_batch'], (r) => resolve(r));
            });
            if (result.kuaishouData_batch && result.kuaishouData_batch.length > 0) {
                dataToExport = result.kuaishouData_batch.reverse();
            } else if (this.allData.length > 0) {
                dataToExport = this.allData.reverse();
            }
        } catch (error) {
            console.error('[KuaishouExtractor] 从 storage 加载数据失败:', error);
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
        a.download = `kuaishou_videos_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log('[KuaishouExtractor] ✅ 已导出 ' + dataToExport.length + ' 条数据到 CSV 文件');

        chrome.runtime.sendMessage({
            action: 'showNotification',
            message: `成功导出 ${dataToExport.length} 条数据！`
        }).catch(console.error);

        return { success: true, count: dataToExport.length };
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.KuaishouExtractor = KuaishouExtractor;
}
