// ============================================
// 百度贴吧 & 抖音视频数据提取器 - Content Script
// ============================================

// ============================================
// 百度贴吧视频数据提取器
// ============================================

const TiebaExtractor = (function() {
    'use strict';

    const config = {
        cutoffDate: new Date('2026-05-25'),
        maxPages: 42,
        autoPageDelay: 3000,
        waitForPageLoadTimeout: 15000
    };

    let allData = [];
    let currentPage = 1;
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
        const cutoffTs = Math.floor(config.cutoffDate.getTime() / 1000);
        return timestamp >= cutoffTs;
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

            const parsedData = works.map(work => ({
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

    async function startAutoExtraction() {
        if (isRunning) {
            const error = '正在进行抓取，请稍后再试';
            console.error('[TiebaExtractor]', error);
            return { success: false, message: error };
        }

        isRunning = true;
        allData = [];
        currentPage = 1;

        console.log('[TiebaExtractor] 🚀 开始自动抓取...');

        chrome.runtime.sendMessage({
            action: 'extractionStarted',
            totalPages: config.maxPages
        }).catch(console.error);

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
                        return { 
                            success: true, 
                            totalCount: allData.length,
                            message: `在第 ${page} 页检测到已超过截止日期的数据，停止抓取`
                        };
                    }
                    
                    console.log(`[TiebaExtractor] 📊 第 ${page} 页符合条件的有 ${filtered.length} 条`);
                    allData = allData.concat(filtered);
                    
                    chrome.runtime.sendMessage({
                        action: 'updateExtractedData',
                        count: filtered.length,
                        total: allData.length
                    }).catch(console.error);
                } else {
                    console.log(`[TiebaExtractor] △ 第 ${page} 页没有新数据`);
                }

                page++;
            }

            allData.sort((a, b) => b.date.localeCompare(a.date));
            await saveDataToStorage();

            chrome.runtime.sendMessage({
                action: 'extractionComplete',
                totalCount: allData.length
            }).catch(console.error);

            isRunning = false;
            console.log(`[TiebaExtractor] 🎉 自动抓取完成！共提取 ${allData.length} 条数据`);
            return { success: true, totalCount: allData.length };
        } catch (error) {
            console.error('[TiebaExtractor] 抓取失败:', error);
            isRunning = false;
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
    
    const config = {
        apiUrl: 'https://creator.douyin.com/creator-micro-service/clue/task/get_own_task_list_v2',
        maxPages: 50,
        pageSize: 30
    };
    
    let allData = [];
    let currentPage = 1;
    let isRunning = false;
    
    /**
     * 从抖音创作者平台 API 获取作品列表
     */
    async function fetchWorkList(cursor = 0, count = 30) {
        console.log(`[DouyinExtractor] 正在从 API 获取作品列表，cursor=${cursor}, count=${count}`);
        
        try {
            const url = new URL('https://creator.douyin.com/creator-micro-service/clue/task/get_own_task_list_v2');
            url.searchParams.set('status', '0');
            url.searchParams.set('count', count.toString());
            url.searchParams.set('max_cursor', cursor.toString());
            url.searchParams.set('scene', 'star_atlas');
            url.searchParams.set('device_platform', 'web');
            url.searchParams.set('aid', '1128');
            url.searchParams.set('channel', 'channel_pc_web');
            url.searchParams.set('work_type', '9');
            
            const response = await fetch(url.toString(), {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.data && result.data.task_list) {
                const tasks = result.data.task_list;
                console.log(`[DouyinExtractor] ✅ API 返回了 ${tasks.length} 条作品数据`);
                
                return {
                    tasks: tasks,
                    has_more: result.data.has_more || false,
                    cursor: result.data.max_cursor || 0,
                    total: result.data.total || 0
                };
            } else {
                console.warn('[DouyinExtractor] API 返回数据格式异常:', result);
                return { tasks: [], has_more: false, cursor: 0, total: 0 };
            }
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
        
        let csv = '\uFEFF' + '作品名称，播放数，点赞数，评论数，分享数，视频链接，发布时间\n';
        dataToExport.forEach(item => {
            const title = (item.title || '').replace(/"/g, '""');
            const url = item.url || '';
            const publishTime = item.publishTime || '';
            csv += `"${title}",${item.playCount},${item.likeCount || 0},${item.commentCount || 0},${item.shareCount || 0},"${url}","${publishTime}"\n`;
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
        console.log('[DouyinExtractor] 正在提取当前页面数据...');
        
        try {
            const result = await fetchWorkList(0, 30);
            
            if (result.tasks && result.tasks.length > 0) {
                const extractedData = result.tasks.map(task => ({
                    title: task.video?.title || task.title || '未命名作品',
                    playCount: task.video_stats?.total_play_count || 0,
                    likeCount: task.video_stats?.digg_count || 0,
                    commentCount: task.video_stats?.comment_count || 0,
                    shareCount: task.video_stats?.share_count || 0,
                    url: `https://www.douyin.com/video/${task.aweme_id}`,
                    publishTime: task.publish_time || '',
                    videoId: task.aweme_id,
                    raw: task
                }));
                
                // 去重
                const existingUrls = new Set(allData.map(item => item.url));
                const newData = extractedData.filter(item => !existingUrls.has(item.url));
                
                allData = allData.concat(newData);
                
                console.log(`[DouyinExtractor] 📊 本次提取：${newData.length} 条数据，累计 ${allData.length} 条`);
                
                chrome.runtime.sendMessage({
                    action: 'updateDouyinData',
                    count: newData.length,
                    total: allData.length
                }).catch(console.error);
                
                await saveDataToStorage();
                
                return {
                    success: true,
                    count: newData.length,
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
    
    /**
     * 开始自动抓取
     */
    async function startAutoExtraction() {
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
        
        try {
            const maxPages = config.maxPages;
            let cursor = 0;
            let pageCount = 0;
            
            while (pageCount < maxPages && isRunning) {
                console.log(`\n[DouyinExtractor] === 正在获取第 ${pageCount + 1} 页数据 (cursor: ${cursor}) ===`);
                
                const result = await fetchWorkList(cursor, config.pageSize);
                
                if (result.error || !result.tasks || result.tasks.length === 0) {
                    if (result.error) {
                        console.error('[DouyinExtractor]', result.error);
                    }
                    break;
                }
                
                const extractedData = result.tasks.map(task => ({
                    title: task.video?.title || task.title || '未命名作品',
                    playCount: task.video_stats?.total_play_count || 0,
                    likeCount: task.video_stats?.digg_count || 0,
                    commentCount: task.video_stats?.comment_count || 0,
                    shareCount: task.video_stats?.share_count || 0,
                    url: `https://www.douyin.com/video/${task.aweme_id}`,
                    publishTime: task.publish_time || '',
                    videoId: task.aweme_id,
                    raw: task
                }));
                
                const existingUrls = new Set(allData.map(item => item.url));
                const newWorks = extractedData.filter(work => !existingUrls.has(work.url));
                
                if (newWorks.length > 0) {
                    allData = allData.concat(newWorks);
                    
                    console.log(`[DouyinExtractor] 📊 第 ${pageCount + 1} 页：新增 ${newWorks.length} 条数据，累计 ${allData.length} 条`);
                    
                    chrome.runtime.sendMessage({
                        action: 'updateDouyinData',
                        count: newWorks.length,
                        total: allData.length
                    }).catch(console.error);
                    
                    if ((pageCount + 1) % 5 === 0) {
                        await saveDataToStorage();
                    }
                } else {
                    console.log(`[DouyinExtractor] △ 第 ${pageCount + 1} 页没有新数据`);
                }
                
                cursor = result.cursor || (cursor + config.pageSize);
                pageCount++;
                
                if (isRunning) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            await saveDataToStorage();
            
            isRunning = false;
            
            console.log(`[DouyinExtractor] 🎉 自动抓取完成！共提取 ${allData.length} 条数据`);
            
            chrome.runtime.sendMessage({
                action: 'douyinExtractionComplete',
                totalCount: allData.length
            }).catch(console.error);
            
            return { success: true, totalCount: allData.length };
        } catch (error) {
            console.error('[DouyinExtractor] 抓取失败:', error);
            isRunning = false;
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
    const isTiebaPage = currentUrl.startsWith('https://tieba.baidu.com/home/creative/work');
    const isDouyinPage = currentUrl.includes('creator.douyin.com/janus/douyin/creator/pc/work_list');
    
    switch (message.action) {
        case 'startAutoExtraction':
            if (isDouyinPage) {
                const pages = message.pages || 42;
                const autoResult = DouyinExtractor.startAutoExtraction(pages);
                autoResult.then(result => {
                    sendResponse(result);
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
                return true;
            } else if (isTiebaPage) {
                const pages = message.pages || 42;
                const autoResult = TiebaExtractor.startAutoExtraction(pages);
                autoResult.then(result => {
                    sendResponse(result);
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
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
            break;
            
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
            break;
            
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
            break;
            
        case 'clearData':
            if (isDouyinPage) {
                const clearResult = DouyinExtractor.clearData();
                sendResponse(clearResult);
            } else if (isTiebaPage) {
                const clearResult = TiebaExtractor.clearData();
                sendResponse(clearResult);
            }
            break;
            
        default:
            console.warn('[ContentScript] Unknown action:', message.action);
            sendResponse({ success: false, error: 'Unknown action' });
    }
});

// 暴露到全局供控制台调用
window.tiebaExtractor = TiebaExtractor;
window.douyinExtractor = DouyinExtractor;

console.log('[ContentScript] === 百度贴吧 & 抖音视频数据提取器已加载 ===');