// ============================================
// 百度贴吧视频数据提取器 - Content Script
// 此脚本在百度贴吧页面中运行
// ============================================

const TiebaExtractor = (function() {
    'use strict';

    // 配置选项
    const config = {
        cutoffDate: new Date('2026-05-25'),
        maxPages: 42,
        autoPageDelay: 3000, // 自动翻页前的延迟（毫秒）
        waitForPageLoadTimeout: 15000 // 等待页面加载的最大超时时间（毫秒）
    };

    // 全局数据存储
    let allData = [];
    let currentPage = 1;
    let isRunning = false;

    // 解析日期字符串
    function parseDate(dateStr) {
        if (!dateStr) return null;
        try {
            const date = new Date(dateStr.replace(' ', 'T'));
            return isNaN(date.getTime()) ? null : date;
        } catch (e) {
            return null;
        }
    }

    // 从 Unix 时间戳（秒）转换为日期字符串 YYYY-MM-DD
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

    // 检查时间戳是否符合条件（大于等于 cutoffTimestamp）
    function isValidTimestamp(timestamp) {
        if (!timestamp) return false;
        const cutoffTs = Math.floor(config.cutoffDate.getTime() / 1000);
        return timestamp >= cutoffTs;
    }

    // === 通过 API 获取数据（推荐方法，不依赖 Vue）===
    async function fetchDataFromAPI(pageNumber = 1) {
        console.log(`[TiebaExtractor] 正在通过 API 获取第 ${pageNumber} 页数据...`);

        try {
            // 构建带分页和每页数据数量的 URL
            const url = new URL('https://tieba.baidu.com/mo/q/work/list');
            url.searchParams.set('type', "all");
            url.searchParams.set('pn', pageNumber);
            url.searchParams.set('rn', 10); // 设置每页数据条数
            
            const response = await fetch(url.toString());
            const result = await response.json();

            if (result.no !== 0) {
                console.error('[TiebaExtractor] API 请求失败:', result.error);
                return { works: [], error: result.error };
            }

            const works = result.data?.works || [];
            console.log(`[TiebaExtractor] ✅ API 返回了 ${works.length} 条数据（第 ${pageNumber} 页）`);

            // 转换数据格式
            const parsedData = works.map(work => ({
                date: timestampToDate(work.publish_time),
                url: `https://tieba.baidu.com/p/${work.thread_id}`,
                title: decodeURIComponent(work.title),
                playCount: work.play_count || 0,
                agreeCount: work.agree_count || 0,
                commentCount: work.comment_count || 0,
                collectCount: work.collect_count || 0,
                shareCount: work.share_count || 0,
                raw: work // 原始数据，方便调试
            }));

            return { works: parsedData, error: null };
        } catch (error) {
            console.error('[TiebaExtractor] API 请求错误:', error);
            return { works: [], error: error.message };
        }
    }

    // 从当前页面提取数据（使用 API，替代 Vue 解析）
    function extractCurrentPageData() {
        const results = [];
        const items = document.querySelectorAll('.thread-cont');

        console.log(`[TiebaExtractor] 找到 ${items.length} 个 .thread-cont 元素`);

        items.forEach((el, index) => {
            try {
                const props = el.__vue__?.$props;

                if (!props) {
                    console.warn(`[TiebaExtractor] 第 ${index + 1} 个元素没有 Vue Props`);
                    return;
                }

                const forumEl = el.querySelector('.forum');
                const spans = forumEl?.querySelectorAll('span') || [];
                const dateStr = spans.length >= 2 ? (spans[1].textContent || '').trim() : '';

                const item = {
                    date: dateStr,
                    url: 'https://tieba.baidu.com/p/' + props.threadId,
                    title: props.title || '',
                    playCount: parseInt(props.playCount) || 0,
                    agreeCount: parseInt(props.agreeCount) || 0,
                    commentCount: parseInt(props.commentCount) || 0,
                    collectCount: parseInt(props.collectCount) || 0,
                    replyCount: parseInt(props.replyCount) || 0,
                    shareCount: el.getAttribute('share-count') || '0'
                };

                results.push(item);
            } catch (e) {
                console.error(`[TiebaExtractor] 提取第 ${index + 1} 条数据失败:`, e);
            }
        });

        return results;
    }

    // 筛选符合日期的数据
    function filterByDate(data) {
        return data.filter(item => {
            if (!item.date) return false;
            const itemDate = parseDate(item.date);
            return itemDate && itemDate >= config.cutoffDate;
        });
    }

    // 导出为 CSV（支持从 storage 加载完整数据）
    async function exportToCSV() {
        // 先从 storage 加载所有数据（如果存在）
        let dataToExport = [];
        
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['tiebaData_batch'], (result) => {
                    resolve(result);
                });
            });
            
            // 优先使用 storage 中的数据（可能是持久化的完整数据）
            if (result.tiebaData_batch && result.tiebaData_batch.length > 0) {
                console.log(`[TiebaExtractor] 从 storage 加载了 ${result.tiebaData_batch.length} 条数据进行导出`);
                dataToExport = result.tiebaData_batch.reverse(); 
            } else if (allData.length > 0) {
                console.log(`[TiebaExtractor] 从内存中使用 ${allData.length} 条数据进行导出`);
                dataToExport = allData.reverse();
            }
        } catch (error) {
            console.error('[TiebaExtractor] 从 storage 加载数据失败:', error);
            // 如果 loading 失败，回退到使用内存数据
            dataToExport = allData;
        }
        
        if (dataToExport.length === 0) {
            return { success: false, message: '暂无数据可导出！' };
        }

        // 构建 CSV
        let csv = '\uFEFF' + '发布日期，视频标题，视频链接，浏览数，点赞数，评论数，收藏数，分享数\n';
        dataToExport.forEach(item => {
            csv += `"${item.date}","${(item.title || '').replace(/"/g, '""')}","${item.url}",${item.playCount},${item.agreeCount},${item.commentCount},${item.collectCount},${item.shareCount}\n`;
        });

        // 触发下载
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
        
        // 发送到背景服务 worker
        chrome.runtime.sendMessage({
            action: 'showNotification',
            message: `成功导出 ${dataToExport.length} 条数据！`
        }).catch(console.error);

        return { success: true, count: dataToExport.length };
    }

    // 立即从 API 提取数据
    async function extractFromAPI() {
        console.log('[TiebaExtractor] 正在从 API 提取数据...');

        const apiResult = await fetchDataFromAPI();

        if (apiResult.error || apiResult.works.length === 0) {
            const errorMsg = apiResult.error || '未找到任何数据项';
            console.error('[TiebaExtractor]', errorMsg);
            
            chrome.runtime.sendMessage({
                action: 'showNotification',
                message: errorMsg,
                type: 'error'
            }).catch(console.error);
            
            return { success: false, message: errorMsg };
        }

        // 筛选符合日期的数据
        const filtered = apiResult.works.filter(item => isValidTimestamp(item.raw?.publish_time));
        allData = allData.concat(filtered);

        console.log(`[TiebaExtractor] 📊 本次提取：${apiResult.works.length} 条，符合条件：${filtered.length} 条`);
        console.log(`[TiebaExtractor] 💾 累计数据：${allData.length} 条`);

        // 发送更新到 popup
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

    // 立即提取当前页（保留用于兼容性）
    function extractNow() {
        // 默认使用 API 方式
        return extractFromAPI();
    }

    // 点击下一页按钮
    function clickNextPage() {
        const allPageSpans = Array.from(document.querySelectorAll('.tbv-pagination-wrap span'));

        // 找下一个页码按钮
        const nextPageSpan = allPageSpans.find(el => el.textContent.trim() == String(currentPage + 1));

        if (!nextPageSpan) {
            // 尝试查找是否有 "下一页" 或 ">" 按钮
            const nextButton = allPageSpans.find(el =>
                el.textContent.includes('下一页') ||
                el.textContent.includes('>') ||
                el.textContent.includes('Next')
            );
            if (nextButton) {
                console.log('[TiebaExtractor] 使用"下一页"按钮');
                nextButton.click();
                return true;
            }
            return false;
        } else {
            console.log(`[TiebaExtractor] 👉 正在点击第 ${currentPage + 1} 页...`);
            nextPageSpan.click();
            return true;
        }
    }

    // 检查是否到达最后一页
    function checkIsLastPage() {
        const currentPageSpan = Array.from(document.querySelectorAll('.tbv-pagination-wrap span')).find(el => {
            const text = el.textContent.trim();
            return text === String(currentPage) || text.match(/^\d+$/)?.[0] === String(currentPage);
        });
        return currentPageSpan && (
            currentPageSpan.className?.includes('cur') ||
            currentPageSpan.className?.includes('current') ||
            currentPageSpan?.getAttribute('class')?.includes('current')
        );
    }

    // 等待页面加载完成
    async function waitForPageLoad(prevItemCount) {
        const startTime = Date.now();
        const prevItemCountRef = prevItemCount;

        while (Date.now() - startTime < config.waitForPageLoadTimeout) {
            await new Promise(r => setTimeout(r, 500));

            const newData = extractCurrentPageData();

            if (newData.length !== prevItemCountRef && newData.length > 0) {
                console.log(`[TiebaExtractor] ✅ 检测到新页面（${newData.length} 条数据 vs 原 ${prevItemCountRef} 条）`);
                return true;
            }

            if (checkIsLastPage()) {
                console.log('[TiebaExtractor] 🏁 确认已在最后一页');
                return 'last-page';
            }
        }

        console.log('[TiebaExtractor] ⚠️ 页面似乎没有变化，可能已到达最后一页或卡住');
        return 'timeout';
    }

    // 通过 API 获取指定页的数据（已废弃，统一使用 fetchDataFromAPI）
    async function fetchDataFromAPIWithPage(pageNumber) {
        // 为保持向后兼容，调用主 API 函数
        console.warn('[TiebaExtractor] fetchDataFromAPIWithPage 已废弃，请使用 fetchDataFromAPI');
        return fetchDataFromAPI(pageNumber);
    }

    // 通过 API 方式自动提取（支持自动翻页）
    async function startAutoExtraction() {
        if (isRunning) {
            const error = '正在进行抓取，请稍后再试';
            console.error('[TiebaExtractor]', error);
            chrome.runtime.sendMessage({
                action: 'showNotification',
                message: error,
                type: 'error'
            }).catch(console.error);
            return { success: false, message: error };
        }

        isRunning = true;
        allData = [];
        currentPage = 1;

        console.log('[TiebaExtractor] 🚀 开始自动抓取（使用 API 翻页）...');

        // 通知背景页面抓取开始
        chrome.runtime.sendMessage({
            action: 'extractionStarted',
            totalPages: config.maxPages
        }).catch(console.error);

        try {
            const maxPages = config.maxPages;
            let page = 1;
            console.log(`maxpages: ${maxPages}`);
            while (page <= maxPages && isRunning) {
                console.log(`\n[TiebaExtractor] === 正在获取第 ${page} 页数据 ===`);

                // 通过 API 获取当前页数据
                const apiResult = await fetchDataFromAPIWithPage(page);

                if (apiResult.error || apiResult.works.length === 0) {
                    if (apiResult.error) {
                        console.error('[TiebaExtractor]', apiResult.error);
                    }
                    // API 返回错误或空数据时停止
                    break;
                }

                console.log(apiResult.works);
                // 计算新增数据（排除重复 URL）
                const existingUrls = new Set(allData.map(item => item.url));
                const newWorks = apiResult.works.filter(work => !existingUrls.has(work.url));
                
                if (newWorks.length > 0) {
                    // 筛选符合日期的数据 - 使用 Unix 时间戳直接比较（更准确）
                    const filtered = newWorks.filter(item => {
                        if (!item.raw?.publish_time) return false;
                        return isValidTimestamp(item.raw.publish_time);
                    });
                    
                    // 检查是否还有有效数据 - 如果本页没有符合条件的，说明已经超过截止日期的范围
                    // 由于数据是按最新在前排序的，后面页面肯定也都是旧数据
                    if (filtered.length === 0) {
                        console.log(`[TiebaExtractor] ⏹️ 第 ${page} 页已无符合截止日期的数据，停止抓取`);
                        
                        // 保存已有的数据
                        try {
                            const batchKey = 'tiebaData_batch';
                            await chrome.storage.local.set({ [batchKey]: allData });
                            console.log(`[TiebaExtractor] ✅ 数据已保存到本地存储 (${allData.length} 条)`);
                        } catch (storageError) {
                            console.error('[TiebaExtractor] 保存数据失败:', storageError);
                        }
                        
                        isRunning = false;
                        return { 
                            success: true, 
                            totalCount: allData.length,
                            message: `在第 ${page} 页检测到已超过截止日期的数据，停止抓取`
                        };
                    }
                    
                    console.log(`[TiebaExtractor] 📊 第 ${page} 页符合条件的有 ${filtered.length} 条`);
                    allData = allData.concat(filtered);
                    
                    // 每获取一页后发送更新
                    chrome.runtime.sendMessage({
                        action: 'updateExtractedData',
                        count: filtered.length,
                        total: allData.length
                    }).catch(console.error);
                    
                    // 调试信息：显示本页最后一条数据的日期
                    const lastItemInPage = newWorks[newWorks.length - 1];
                    if (lastItemInPage?.raw?.publish_time) {
                        const lastDateStr = timestampToDate(lastItemInPage.raw.publish_time);
                        console.log(`[TiebaExtractor] 第 ${page} 页最后一条数据日期：${lastDateStr}`);
                    }
                } else {
                    console.log(`[TiebaExtractor] △ 第 ${page} 页没有新数据`);
                }

                
                page++;
            }

            // 按日期降序排序
            allData.sort((a, b) => b.date.localeCompare(a.date));

            // 分批保存数据到 storage (避免配额超限)
            try {
                // 将大数据拆分成多个小条目保存
                const batchKey = 'tiebaData_batch';
                await chrome.storage.local.set({ [batchKey]: allData });
                console.log(`[TiebaExtractor] ✅ 数据已保存到本地存储 (${allData.length} 条)`);
            } catch (storageError) {
                console.error('[TiebaExtractor] 保存数据失败:', storageError);
                // 如果 local 存储也超限，只保存前 100 条
                if (allData.length > 100) {
                    await chrome.storage.local.set({ [batchKey]: allData.slice(0, 100) });
                    console.log(`[TiebaExtractor] ⚠️ 数据被截断为前 100 条`);
                }
            }

            // 通知背景页面
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

    // 停止抓取
    function stopExtraction() {
        isRunning = false;
        console.log('[TiebaExtractor] ⏹️ 抓取已停止');

        chrome.runtime.sendMessage({
            action: 'showNotification',
            message: '抓取已停止',
            type: 'info'
        }).catch(console.error);

        return { success: true, message: '抓取已停止' };
    }

    // 清理函数
    function cleanup() {
        console.log('[TiebaExtractor] 🧹 提取器已卸载');
    }

    // 获取所有数据
    function getAllData() {
        return allData;
    }

    // 清空数据
    function clearData() {
        allData = [];
        console.log('[TiebaExtractor] 🗑️ 数据已清空');
        return { success: true };
    }

    // 获取状态信息
    function getStatus() {
        return {
            isRunning: isRunning,
            currentPage: currentPage,
            totalExtracted: allData.length
        };
    }

    // 设置配置
    function setConfig(newConfig) {
        Object.assign(config, newConfig);
        console.log('[TiebaExtractor] 配置已更新:', config);
        return { success: true, config: config };
    }

    // 暴露公共 API
    return {
        extractNow,
        startAutoExtraction,
        stopExtraction,
        exportToCSV,
        getAllData,
        clearData,
        getStatus,
        setConfig
    };
})();

// ============================================
// 消息监听 - 处理来自 popup/background 的消息
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[TiebaExtractor] Content Script received message:', message);
    
    switch (message.action) {
        case 'extractNow':
            const extractResult = TiebaExtractor.extractNow();
            sendResponse(extractResult);
            break;
            
        case 'startAutoExtraction':
            const pages = message.pages || 42;
            const autoResult = TiebaExtractor.startAutoExtraction(pages);
            // Promise 需要返回 true 以保持通道打开
            autoResult.then(result => {
                sendResponse(result);
            }).catch(err => {
                sendResponse({ success: false, error: err.message });
            });
            return true;
            
        case 'stopExtraction':
            const stopResult = TiebaExtractor.stopExtraction();
            sendResponse(stopResult);
            break;
            
        case 'exportToCSV':
            // exportToCSV 现在是异步函数，需要等待 Promise 完成
            TiebaExtractor.exportToCSV().then(result => {
                sendResponse(result);
            }).catch(err => {
                sendResponse({ success: false, error: err.message });
            });
            return true; // 保持通道打开以支持异步响应
            
        case 'clearData':
            const clearResult = TiebaExtractor.clearData();
            sendResponse(clearResult);
            break;
            
        case 'getStatus':
            const status = TiebaExtractor.getStatus();
            sendResponse(status);
            break;
            
        default:
            console.warn('[TiebaExtractor] Unknown action:', message.action);
            sendResponse({ success: false, error: 'Unknown action' });
    }
});

// 暴露到全局供控制台调用
window.tiebaExtractor = TiebaExtractor;

// 日志消息
console.log('[TiebaExtractor] === 百度贴吧视频数据提取器已加载 ===');
