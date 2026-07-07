// ============================================
// Xiaohongshu (RED) Extractor - 小红书提取器 (DOM版)
// ============================================

class XiaohongshuExtractor extends BaseExtractor {
    constructor() {
        super({
            apiUrl: '',
            pageSize: 10
        });
    }

    getPlatformName() { return 'Xiaohongshu'; }

    matchesUrl(url) {
        return url.includes('creator.xiaohongshu.com');
    }

    timestampToDateStr(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    parsePublishTimeToTimestamp(timeStr) {
        if (!timeStr) return 0;
        const date = new Date(timeStr);
        return Math.floor(date.getTime() / 1000);
    }

    parseCount(text) {
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

    extractDuration(text) {
        if (!text) return 0;
        const parts = text.split(':');
        if (parts.length === 2) {
            return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        }
        return 0;
    }

    extractNoteId(el) {
        const impression = el.getAttribute('data-impression');
        if (impression) {
            try {
                const data = JSON.parse(impression);
                return data.noteTarget?.value?.noteId || '';
            } catch (e) {}
        }
        return '';
    }

    async waitForNotes(timeout = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const cards = document.querySelectorAll('.note-card, [class*="note-card"], [class*="noteCard"], [data-impression]');
            if (cards.length > 0) return true;
            await new Promise(r => setTimeout(r, 300));
        }
        return false;
    }

    extractDataFromDOM() {
        console.log('[XiaohongshuExtractor] Extracting data from DOM...');
        const results = [];

        const selectors = ['.note-card', '[class*="note-card"]', '[class*="noteCard"]', '[class*="post-card"]', '[data-impression]'];
        let noteCards = [];
        for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
                noteCards = els;
                console.log(`[XiaohongshuExtractor] Found ${els.length} elements via selector: "${sel}"`);
                break;
            }
        }

        noteCards.forEach((el) => {
            try {
                const noteId = this.extractNoteId(el);

                const titleEl = el.querySelector('.note-card__title') || el.querySelector('[class*="title"]');
                const title = titleEl ? titleEl.textContent.trim() : '';

                const timeEl = el.querySelector('.note-card__time') || el.querySelector('[class*="time"]');
                const publishTime = timeEl ? timeEl.textContent.trim() : '';
                const createTimestamp = this.parsePublishTimeToTimestamp(publishTime);

                const statEls = el.querySelectorAll('.note-card__stat, [class*="stat"]');
                const stats = [];
                statEls.forEach(s => {
                    const span = s.querySelector('span');
                    const text = span ? span.textContent.trim() : s.textContent.trim();
                    stats.push(this.parseCount(text));
                });

                const viewCount = stats[0] || 0;
                const commentCount = stats[1] || 0;
                const likeCount = stats[2] || 0;
                const collectCount = stats[3] || 0;
                const shareCount = stats[4] || 0;

                const playTimeEl = el.querySelector('.play_time') || el.querySelector('[class*="play_time"]');
                const noteType = playTimeEl ? 'video' : 'image';
                const duration = playTimeEl ? this.extractDuration(playTimeEl.textContent.trim()) : 0;

                const url = noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : '';

                if (title || noteId) {
                    results.push({
                        title,
                        viewCount,
                        likeCount,
                        commentCount,
                        collectCount,
                        shareCount,
                        url,
                        noteId,
                        noteType,
                        duration,
                        publishTime,
                        createTimestamp,
                        permissionCode: 0,
                        permissionMsg: '',
                        raw: el
                    });
                }
            } catch (e) {
                console.error('[XiaohongshuExtractor] DOM extraction error:', e);
            }
        });

        if (results.length === 0) {
            console.log('[XiaohongshuExtractor] No notes found via selectors, trying generic extraction...');
            const allCards = document.querySelectorAll('[class*="card"]');
            console.log(`[XiaohongshuExtractor] Found ${allCards.length} generic card elements`);
        }

        console.log(`[XiaohongshuExtractor] Extracted ${results.length} notes from DOM`);
        return results;
    }

    async waitForNewContent(timeout = 8000) {
        const existingCount = document.querySelectorAll('.note-card').length;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            await new Promise(r => setTimeout(r, 500));
            const currentCount = document.querySelectorAll('.note-card').length;
            if (currentCount > existingCount) return true;
        }
        return false;
    }

    async clickNextPage() {
        const pagination = document.querySelector('.d-pagination');
        if (pagination) {
            const nextBtn = pagination.querySelector('.d-pagination__next');
            if (nextBtn && !nextBtn.classList.contains('d-pagination__next--disabled')) {
                nextBtn.click();
                console.log('[XiaohongshuExtractor] Clicked next page button');
                return true;
            }
        }

        const nextBtn = document.querySelector('[class*="pagination"] [class*="next"]:not([class*="disabled"])');
        if (nextBtn) {
            nextBtn.click();
            console.log('[XiaohongshuExtractor] Clicked next button (fallback)');
            return true;
        }

        const allBtns = document.querySelectorAll('button, [role="button"], .d-pagination__item');
        for (const btn of allBtns) {
            if (btn.textContent.includes('下一页') || btn.getAttribute('aria-label') === 'next') {
                if (!btn.disabled && !btn.classList.contains('d-pagination__item--disabled')) {
                    btn.click();
                    console.log('[XiaohongshuExtractor] Clicked next page by text');
                    return true;
                }
            }
        }

        return false;
    }

    async scrollToBottom() {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 1500));
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 1000));
    }

    async extractCurrentPage() {
        await this.loadConfig();
        console.log('[XiaohongshuExtractor] Extracting current page...');

        const notes = this.extractDataFromDOM();
        if (notes.length > 0) {
            const existingIds = new Set(this.allData.map(item => item.noteId));
            const newData = notes.filter(item => !existingIds.has(item.noteId));
            const filtered = newData.filter(item => this.isValidTimestamp(item.createTimestamp));
            this.allData.push(...filtered);
            this.notifyProgress(true, this.currentPage, this.config.maxPages, filtered.length, this.allData.length);
            return { success: true, total: this.allData.length, count: filtered.length };
        }

        return { success: false, message: '未能从页面提取到数据' };
    }

    checkCutoffDate() {
        if (this.allData.length === 0) return false;
        const sortedData = [...this.allData].sort((a, b) => b.createTimestamp - a.createTimestamp);
        for (let i = 0; i < sortedData.length; i++) {
            if (!this.isValidTimestamp(sortedData[i].createTimestamp)) {
                if (i >= 3) {
                    console.log(`[XiaohongshuExtractor] 第 ${i + 1} 条数据 (${sortedData[i].title}) 超过截止日期，停止抓取`);
                    return true;
                } else if (i < 3) {
                    console.log(`[XiaohongshuExtractor] 前三项中检测到过期数据：${sortedData[i].title}`);
                }
            }
        }
        return false;
    }

    async startAutoExtraction(maxPages = this.config.maxPages, cutoffDate) {
        if (this.isRunning) return { success: false, message: 'Already running' };
        console.log('[XiaohongshuExtractor] startAutoExtraction called with maxPages:', maxPages);
        await this.loadConfig({ cutoffDate });
        console.log('[XiaohongshuExtractor] Config loaded');
        this.isRunning = true;
        this.allData = [];
        this.currentPage = 1;
        this.notifyProgress(true, 1, maxPages, 0, 0);

        try {
            let pageCount = 0;

            while (pageCount < maxPages && this.isRunning) {
                console.log(`[XiaohongshuExtractor] Page ${pageCount + 1} extraction starting...`);
                if (pageCount === 0) {
                    const hasNotes = await this.waitForNotes();
                    console.log(`[XiaohongshuExtractor] waitForNotes: ${hasNotes}`);
                }
                const notes = this.extractDataFromDOM();

                if (!notes.length && pageCount > 0) break;

                const existingIds = new Set(this.allData.map(item => item.noteId));
                const newNotes = notes.filter(n => !existingIds.has(n.noteId));

                if (!newNotes.length && pageCount > 0) {
                    console.log('[XiaohongshuExtractor] No new data');
                    break;
                }

                const validNotes = newNotes.filter(n => this.isValidTimestamp(n.createTimestamp));
                if (validNotes.length > 0) {
                    this.allData.push(...validNotes);
                }

                this.notifyProgress(true, pageCount + 1, maxPages, validNotes.length, this.allData.length);

                if (validNotes.length === 0 || this.checkCutoffDate()) {
                    await this.saveDataToStorage();
                    this.isRunning = false;
                    this.notifyProgress(false, pageCount + 1, maxPages, 0, this.allData.length);
                    console.log('[XiaohongshuExtractor] Reached cutoff date, stopping');
                    return { success: true, totalCount: this.allData.length };
                }

                if ((pageCount + 1) % 5 === 0) await this.saveDataToStorage();
                pageCount++;
                this.currentPage = pageCount;

                const clicked = await this.clickNextPage();
                if (!clicked) {
                    await this.scrollToBottom();
                    await new Promise(r => setTimeout(r, 2000));
                    const afterScroll = document.querySelectorAll('.note-card').length;
                    if (afterScroll <= notes.length) {
                        console.log('[XiaohongshuExtractor] No more pages');
                        break;
                    }
                } else {
                    const loaded = await this.waitForNewContent();
                    if (!loaded) {
                        console.log('[XiaohongshuExtractor] New content did not load');
                        break;
                    }
                }
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
            csv += `"${item.publishTime}","${item.url}",${item.viewCount},${item.likeCount},${item.commentCount},${item.collectCount},${item.shareCount}\n`;
        }
        return csv;
    }

    async exportToCSV() {
        let dataToExport = [];
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['xiaohongshuData_batch'], (r) => resolve(r));
            });
            if (result.xiaohongshuData_batch && result.xiaohongshuData_batch.length > 0) {
                dataToExport = result.xiaohongshuData_batch.reverse();
            } else if (this.allData.length > 0) {
                dataToExport = this.allData.reverse();
            }
        } catch (error) {
            console.error('[XiaohongshuExtractor] 从 storage 加载数据失败:', error);
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
        a.download = `xiaohongshu_notes_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log('[XiaohongshuExtractor] 已导出 ' + dataToExport.length + ' 条数据到 CSV 文件');

        chrome.runtime.sendMessage({
            action: 'showNotification',
            message: `成功导出 ${dataToExport.length} 条数据！`
        }).catch(console.error);

        return { success: true, count: dataToExport.length };
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.XiaohongshuExtractor = XiaohongshuExtractor;
}
