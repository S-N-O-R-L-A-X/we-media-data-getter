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

    // 从当前页面提取数据
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

    // 导出为 CSV
    function exportToCSV() {
        if (allData.length === 0) {
            return { success: false, message: '暂无数据可导出！' };
        }

        // 按日期降序排序
        allData.sort((a, b) => b.date.localeCompare(a.date));

        // 构建 CSV
        let csv = '\uFEFF' + '发布日期，视频标题，视频链接，浏览数，点赞数，收藏数，回复数，分享数\n';
        allData.forEach(item => {
            csv += `"${item.date}","${(item.title || '').replace(/"/g, '""')}","${item.url}",${item.playCount},${item.agreeCount},${item.collectCount},${item.replyCount},${item.shareCount}\n`;
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

        console.log(`[TiebaExtractor] ✅ 已导出 ${allData.length} 条数据到 CSV 文件`);
        
        // 发送到背景服务 worker
        chrome.runtime.sendMessage({
            action: 'showNotification',
            message: `成功导出 ${allData.length} 条数据！`
        }).catch(console.error);

        return { success: true, count: allData.length };
    }

    // 立即提取当前页
    function extractNow() {
        console.log('[TiebaExtractor] 正在提取当前页数据...');
        const pageData = extractCurrentPageData();

        if (pageData.length === 0) {
            const errorMsg = '未找到任何数据项，请确认是否在正确的贴吧列表页面 (https://tieba.baidu.com/home/creative/work)';
            console.error('[TiebaExtractor]', errorMsg);
            
            chrome.runtime.sendMessage({
                action: 'showNotification',
                message: errorMsg,
                type: 'error'
            }).catch(console.error);
            
            return { success: false, message: errorMsg };
        }

        const filtered = filterByDate(pageData);
        allData = allData.concat(filtered);

        console.log(`[TiebaExtractor] 📊 本次提取：${pageData.length} 条，符合条件：${filtered.length} 条`);
        console.log(`[TiebaExtractor] 💾 累计数据：${allData.length} 条`);

        // 发送更新到 popup
        chrome.runtime.sendMessage({
            action: 'updateExtractedData',
            count: filtered.length,
            total: allData.length
        }).catch(console.error);

        return {
            success: true,
            current: pageData.length,
            filtered: filtered.length,
            total: allData.length
        };
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

    // 自动遍历多页
    async function startAutoExtraction(pages = null) {
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

        const totalPages = pages || config.maxPages;
        isRunning = true;
        allData = [];
        currentPage = 1;

        console.log('[TiebaExtractor] 🚀 开始自动抓取...');
        console.log(`[TiebaExtractor] 目标页数：${totalPages}`);

        // 通知背景页面抓取开始
        chrome.runtime.sendMessage({
            action: 'extractionStarted',
            totalPages: totalPages
        }).catch(console.error);

        for (currentPage = 1; currentPage <= totalPages && isRunning; currentPage++) {
            console.log(`\n[TiebaExtractor] ========== 正在处理第 ${currentPage} 页 ========== \n`);

            const pageData = extractCurrentPageData();

            if (pageData.length === 0) {
                console.log('[TiebaExtractor] ⚠️ 未找到数据项，停止抓取');
                break;
            }

            // 先检查本页第一条数据的日期
            let isFirstItemUnderCutoff = false;
            if (pageData.length > 0) {
                const firstItem = pageData[0];
                const firstItemDate = parseDate(firstItem.date);
                if (firstItemDate && firstItemDate < config.cutoffDate) {
                    isFirstItemUnderCutoff = true;
                }
            }

            const filtered = filterByDate(pageData);
            allData = allData.concat(filtered);

            console.log(`[TiebaExtractor] ✅ 第 ${currentPage} 页：${pageData.length} 条，符合条件：${filtered.length} 条`);
            console.log(`[TiebaExtractor] 📊 累计：${allData.length} 条\n`);

            // 如果本页第一条数据已低于 cutoffDate，说明已经抓完所有符合条件的数据
            if (isFirstItemUnderCutoff) {
                console.log('[TiebaExtractor] 🏁 已抓取到 cutoffDate 之前的数据，停止抓取');
                isRunning = false;

                // 通知完成
                chrome.runtime.sendMessage({
                    action: 'extractionComplete',
                    totalCount: allData.length
                }).catch(console.error);

                return { success: true, totalCount: allData.length };
            }

            const prevItemCount = pageData.length;

            // 如果还需要继续，点击下一页
            if (currentPage < totalPages) {
                console.log(`[TiebaExtractor] ⏳ 等待 ${config.autoPageDelay / 1000} 秒后切换到第 ${currentPage + 1} 页...`);
                await new Promise(r => setTimeout(r, config.autoPageDelay));

                if (!clickNextPage()) {
                    console.log('[TiebaExtractor] ⚠️ 找不到下一页按钮，可能已在最后一页');
                    isRunning = false;
                    break;
                }

                // 等待页面加载
                const result = await waitForPageLoad(prevItemCount);
                if (result === 'last-page' || result === 'timeout') {
                    isRunning = false;
                    break;
                }

                currentPage++;
            }
        }

        isRunning = false;

        console.log('\n[TiebaExtractor] ========== 抓取完成 ==========');
        console.log(`[TiebaExtractor] 📦 总共提取 ${allData.length} 条符合日期条件的数据`);

        // 保存到 storage
        chrome.storage.sync.set({ tiebaData: allData })
            .then(() => {
                console.log('[TiebaExtractor] ✅ 数据已保存到本地存储');
            })
            .catch(console.error);

        // 通知背景页面
        chrome.runtime.sendMessage({
            action: 'extractionComplete',
            totalCount: allData.length
        }).catch(console.error);

        return { success: true, totalCount: allData.length };
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
            const exportResult = TiebaExtractor.exportToCSV();
            sendResponse(exportResult);
            break;
            
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
console.log('[TiebaExtractor] 可用命令:');
console.log('[TiebaExtractor]   tiebaExtractor.extractNow()      - 提取当前页数据');
console.log('[TiebaExtractor]   tiebaExtractor.startAutoExtraction(n) - 自动抓取 n 页 (默认 42 页)');
console.log('[TiebaExtractor]   tiebaExtractor.stopExtraction()     - 停止抓取');
console.log('[TiebaExtractor]   tiebaExtractor.exportToCSV()        - 导出 CSV 文件');
console.log('[TiebaExtractor]   tiebaExtractor.clearData()          - 清空数据');
console.log('[TiebaExtractor]   tiebaExtractor.getAllData()         - 获取所有数据');
console.log('[TiebaExtractor]   tiebaExtractor.getStatus()          - 获取状态信息');
console.log('[TiebaExtractor]   tiebaExtractor.setConfig(cfg)       - 设置配置');
console.log('');