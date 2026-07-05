// ============================================
// Douyin (TikTok China) Extractor - 抖音提取器
// ============================================

class DouyinExtractor extends BaseExtractor {
    constructor() {
        super({ 
            apiUrl: 'https://creator.douyin.com/janus/douyin/creator/pc/work_list',
            pageSize: 12
        });
    }

    getPlatformName() { return 'Douyin'; }

    matchesUrl(url) {
        return url.includes('creator.douyin.com/creator-micro/content/manage');
    }

    timestampToDateStr(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    async fetchDataFromAPI(cursor = 0, pageSize = this.config.pageSize) {
        try {
            const url = new URL(this.config.apiUrl);
            url.searchParams.set('status', '0');
            url.searchParams.set('count', pageSize.toString());
            url.searchParams.set('max_cursor', cursor.toString());
            url.searchParams.set('scene', 'star_atlas');
            url.searchParams.set('device_platform', 'web');
            url.searchParams.set('aid', '1128');
            url.searchParams.set('channel', 'channel_pc_web');
            url.searchParams.set('work_type', '9');

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': navigator.userAgent
                },
                credentials: 'include'
            });

            const result = await response.json();

            if (result.status_code !== undefined && result.status_code !== 0) {
                return { tasks: [], has_more: false, cursor: 0, error: `Status code: ${result.status_code}` };
            }

            let tasks = [];
            if (result.aweme_list && Array.isArray(result.aweme_list) && result.aweme_list.length > 0) {
                tasks = this.extractFromAwemeList(result.aweme_list);
            } else if (result.items && Array.isArray(result.items) && result.items.length > 0) {
                tasks = this.extractFromItems(result.items);
            }

            return { tasks, has_more: result.has_more || false, cursor: result.max_cursor || 0, error: null };
        } catch (error) {
            return { tasks: [], has_more: false, cursor: 0, error: error.message };
        }
    }

    extractFromAwemeList(awemeList) {
        const filteredList = this.config.filterBlocked
            ? awemeList.filter(item => !this.isItemBlocked(item))
            : awemeList;
        return filteredList.map(item => ({
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
        const filteredList = this.config.filterBlocked
            ? items.filter(item => !this.isItemBlocked(item))
            : items;
        return filteredList.map(item => ({
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

    parsePlayCount(text) {
        if (!text) return 0;
        text = text.replace(/\s+/g, '');
        const match = text.match(/^([\d.]+)([万千+]?)$/);
        if (!match) {
            const numMatch = text.match(/^([\d.]+)/);
            return numMatch ? parseFloat(numMatch[1]) || 0 : 0;
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

    extractVideoId(url) {
        if (!url) return null;
        const match = url.match(/\/video\/(\d+)/);
        return match ? match[1] : null;
    }

    extractDataFromDOM() {
        console.log('[DouyinExtractor] 尝试从 DOM 中提取数据...');
        const results = [];
        const taskItems = document.querySelectorAll('[class*="task-card"], [class*="video-item"], .task-item, .video-card');
        console.log(`[DouyinExtractor] 找到 ${taskItems.length} 个任务/视频元素`);
        taskItems.forEach((el, index) => {
            try {
                const titleEl = el.querySelector('[class*="title"], [class*="name"], .title, .name');
                const title = titleEl ? titleEl.textContent.trim() : '';
                const viewsEl = el.querySelector('[class*="view"], [class*="play"], .views, .play-count');
                const playCount = viewsEl ? this.parsePlayCount(viewsEl.textContent.trim()) : 0;
                const likesEl = el.querySelector('[class*="like"], [class*="digg"], .likes, .digg-count');
                const likeCount = likesEl ? this.parsePlayCount(likesEl.textContent.trim()) : 0;
                const commentsEl = el.querySelector('[class*="comment"], .comment-count');
                const commentCount = commentsEl ? this.parsePlayCount(commentsEl.textContent.trim()) : 0;
                const sharesEl = el.querySelector('[class*="share"], .share-count');
                const shareCount = sharesEl ? this.parsePlayCount(sharesEl.textContent.trim()) : 0;
                const linkEl = el.querySelector('a[href*="/video/"]');
                const url = linkEl ? linkEl.href : '';
                const timeEl = el.querySelector('[class*="time"], [class*="date"], .publish-time');
                const publishTime = timeEl ? timeEl.textContent.trim() : '';
                if (title || playCount > 0) {
                    results.push({
                        title, playCount, likeCount, commentCount, shareCount,
                        url, publishTime,
                        videoId: this.extractVideoId(url),
                        createTimestamp: 0,
                        raw: el
                    });
                }
            } catch (e) {
                console.error(`[DouyinExtractor] DOM 提取第 ${index + 1} 条失败:`, e);
            }
        });
        console.log(`[DouyinExtractor] DOM 提取到 ${results.length} 条有效数据`);
        return results;
    }

    async extractCurrentPage() {
        await this.loadConfig();
        console.log('[DouyinExtractor] Extracting current page...');

        try {
            const apiResult = await this.fetchDataFromAPI(0, 30);
            if (apiResult.tasks && apiResult.tasks.length > 0) {
                const existingUrls = new Set(this.allData.map(item => item.url));
                const newData = apiResult.tasks.filter(item => !existingUrls.has(item.url));
                const filtered = newData.filter(item => this.isValidTimestamp(item.createTimestamp));
                this.allData.push(...filtered);
                this.notifyProgress(true, this.currentPage, this.config.maxPages, filtered.length, this.allData.length);
                return { success: true, total: this.allData.length };
            }
        } catch (error) {
            console.error('[DouyinExtractor] API 提取失败，尝试 DOM 提取:', error);
        }

        const domData = this.extractDataFromDOM();
        if (domData.length > 0) {
            const existingUrls = new Set(this.allData.map(item => item.url));
            const newData = domData.filter(item => !existingUrls.has(item.url));
            if (newData.length > 0) {
                this.allData.push(...newData);
                this.notifyProgress(true, this.currentPage, this.config.maxPages, newData.length, this.allData.length);
                return { success: true, count: newData.length, total: this.allData.length };
            }
        }
        return { success: false, message: '未能从页面提取到数据' };
    }

    checkCutoffDate() {
        if (this.allData.length === 0) return false;
        const sortedData = [...this.allData].sort((a, b) => b.createTimestamp - a.createTimestamp);
        for (let i = 0; i < sortedData.length; i++) {
            if (!this.isValidTimestamp(sortedData[i].createTimestamp)) {
                if (i >= 3) {
                    console.log(`[DouyinExtractor] ⚠️ 第 ${i + 1} 条数据 (${sortedData[i].title}) 超过截止日期，停止抓取`);
                    return true;
                } else if (i < 3) {
                    console.log(`[DouyinExtractor] ℹ️ 前三项中检测到过期数据：${sortedData[i].title}`);
                }
            }
        }
        return false;
    }

    async startAutoExtraction(maxPages = this.config.maxPages, cutoffDate) {
        if (this.isRunning) return { success: false, message: 'Already running' };
        await this.loadConfig({ cutoffDate });
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
                if (validWorks.length > 0) {
                    this.allData.push(...validWorks);
                }

                this.notifyProgress(true, pageCount + 1, maxPages, validWorks.length, this.allData.length);

                if (validWorks.length === 0 || this.checkCutoffDate()) {
                    await this.saveDataToStorage();
                    this.isRunning = false;
                    this.notifyProgress(false, pageCount + 1, maxPages, 0, this.allData.length);
                    console.log('[DouyinExtractor] Reached cutoff date, stopping');
                    return { success: true, totalCount: this.allData.length };
                }

                if ((pageCount + 1) % 5 === 0) await this.saveDataToStorage();
                cursor = apiResult.cursor || (cursor + this.config.pageSize);
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
        let csv = '\uFEFF"发布日期","视频链接","播放量","点赞","评论","收藏","分享"\n';
        for (const item of data) {
            csv += `"${item.publishTime}","${item.url}",${item.playCount},${item.likeCount},${item.commentCount},${item.collectCount},${item.shareCount}\n`;
        }
        return csv;
    }

    async exportToCSV() {
        let dataToExport = [];
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['douyinData_batch'], (r) => resolve(r));
            });
            if (result.douyinData_batch && result.douyinData_batch.length > 0) {
                dataToExport = result.douyinData_batch.reverse();
            } else if (this.allData.length > 0) {
                dataToExport = this.allData.reverse();
            }
        } catch (error) {
            console.error('[DouyinExtractor] 从 storage 加载数据失败:', error);
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
        a.download = `douyin_videos_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log('[DouyinExtractor] ✅ 已导出 ' + dataToExport.length + ' 条数据到 CSV 文件');
        
        chrome.runtime.sendMessage({
            action: 'showNotification',
            message: `成功导出 ${dataToExport.length} 条数据！`
        }).catch(console.error);

        return { success: true, count: dataToExport.length };
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.DouyinExtractor = DouyinExtractor;
}