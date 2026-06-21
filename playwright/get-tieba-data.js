// 这是一个可以在任意网页控制台中直接运行的脚本
// 使用方法：在百度贴吧视频列表页面的浏览器控制台 (F12 -> Console) 中粘贴并运行此代码

// url https://tieba.baidu.com/home/creative/work

(function() {
    'use strict';
    
    console.log('=== 百度贴吧视频数据提取器已加载 ===');
    
    // 配置选项
    const config = {
        cutoffDate: new Date('2026-05-25'),
        maxPages: 42
    };
    
    // 全局数据存储
    let allData = [];
    let currentPage = 1;
    let isRunning = false;
    let intervalId = null;
    
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
        
        console.log(`找到 ${items.length} 个 .thread-cont 元素`);
        
        items.forEach((el, index) => {
            try {
                const props = el.__vue__?.$props;
                
                if (!props) {
                    console.warn(`第 ${index + 1} 个元素没有 Vue Props`);
                    return;
                }
                
                const forumEl = el.querySelector('.forum');
                const spans = forumEl?.querySelectorAll('span') || [];
                const dateStr = spans.length >= 2 ? (spans[1].textContent || '').trim() : '';
                
                const item = {
                    date: dateStr,
                    url: 'https://tieba.baidu.com/p/' + props.threadId,
                    playCount: props.playCount || 0,
                    agreeCount: props.agreeCount || 0,
                    collectCount: props.collectCount || 0,
                    shareCount: el.getAttribute('share-count') || '0'
                };
                
                results.push(item);
            } catch (e) {
                console.error(`提取第 ${index + 1} 条数据失败：`, e);
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
            alert('暂无数据可导出！');
            return;
        }
        
        // 按日期降序排序
        allData.sort((a, b) => b.date.localeCompare(a.date));
        
        // 构建 CSV
        let csv = '\uFEFF' + '发布日期，视频链接，浏览数，点赞数，收藏数，分享数\n';
        allData.forEach(item => {
            csv += `${item.date},${item.url},${item.playCount},${item.agreeCount},${item.collectCount},${item.shareCount}\n`;
        });
        
        // 下载文件
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
        
        console.log(`✅ 已导出 ${allData.length} 条数据到 CSV 文件`);
        alert(`成功导出 ${allData.length} 条数据！`);
    }
    
    // 立即提取当前页
    function extractNow() {
        console.log('正在提取当前页数据...');
        const pageData = extractCurrentPageData();
        
        if (pageData.length === 0) {
            alert('未找到任何数据项，请确认是否在正确的贴吧列表页面');
            return;
        }
        
        const filtered = filterByDate(pageData);
        allData = allData.concat(filtered);
        
        console.log(`📊 本次提取：${pageData.length} 条，符合条件：${filtered.length} 条`);
        console.log(`💾 累计数据：${allData.length} 条`);
        alert(`提取完成！\n本次：${pageData.length} 条\n符合日期条件：${filtered.length} 条\n总计：${allData.length} 条`);
    }
    
    // 自动遍历多页
    async function startAutoExtraction(pages = null) {
        if (isRunning) {
            alert('正在进行抓取，请稍后再试');
            return;
        }
        
        const totalPages = pages || config.maxPages;
        isRunning = true;
        allData = [];
        
        console.log('🚀 开始自动抓取...');
        console.log(`目标页数：${totalPages}`);
        
        for (currentPage = 1; currentPage <= totalPages && isRunning; currentPage++) {
            console.log(`\n========== 正在处理第 ${currentPage} 页 ========== \n`);
            
            const pageData = extractCurrentPageData();
            
            if (pageData.length === 0) {
                console.log('⚠️ 未找到数据项，停止抓取');
                break;
            }
            
            const filtered = filterByDate(pageData);
            allData = allData.concat(filtered);
            
            console.log(`✅ 第 ${currentPage} 页：${pageData.length} 条，符合条件：${filtered.length} 条`);
            console.log(`📊 累计：${allData.length} 条\n`);
            
            // 检查是否还有下一页
            const nextBtn = document.querySelector('.tbv-pagination-wrap span');
            if (!nextBtn) {
                console.log('🏁 已达到最后一页');
                break;
            }
            
            // 如果还需要继续，点击下一页
            if (currentPage < totalPages) {
                console.log(`⏳ 等待 3 秒后切换到第 ${currentPage + 1} 页...`);
                await new Promise(r => setTimeout(r, 3000));
                
                // 模拟点击下一页按钮（可能需要调整选择器）
                const nextPageSpan = Array.from(document.querySelectorAll('.tbv-pagination-wrap span'))
                    .find(el => el.textContent.trim() == String(currentPage + 1));
                
                if (nextPageSpan) {
                    nextPageSpan.click();
                    console.log(`👉 已点击第 ${currentPage + 1} 页`);
                    
                    // 等待页面加载
                    await new Promise(r => setTimeout(r, 4000));
                } else {
                    console.log('⚠️ 找不到下一页按钮');
                    break;
                }
            }
        }
        
        isRunning = false;
        console.log('\n========== 抓取完成 ==========');
        console.log(`📦 总共提取 ${allData.length} 条符合日期条件的数据`);
        alert(`抓取完成！\n共提取 ${allData.length} 条数据\n点击"导出 CSV"保存结果`);
    }
    
    // 停止抓取
    function stopExtraction() {
        isRunning = false;
        console.log('⏹️ 抓取已停止');
        alert('抓取已停止');
    }
    
    // 清理函数
    function cleanup() {
        clearInterval(intervalId);
        console.log('🧹 提取器已卸载');
    }
    
    // 暴露到全局供调用
    window.tiebaExtractor = {
        extractNow,
        startAutoExtraction,
        stopExtraction,
        exportToCSV,
        getAllData: () => allData,
        clearData: () => { allData = []; console.log('🗑️ 数据已清空'); }
    };
    
    // 添加快捷命令
    console.log('\n可用命令:');
    console.log('  tiebaExtractor.extractNow()      - 提取当前页数据');
    console.log('  tiebaExtractor.startAutoExtraction(n) - 自动抓取 n 页 (默认 42 页)');
    console.log('  tiebaExporter.stopExtraction()     - 停止抓取');
    console.log('  tiebaExtractor.exportCSV()         - 导出 CSV 文件');
    console.log('  tiebaExtractor.clearData()         - 清空数据');
    console.log('  tiebaExtractor.getAllData()        - 获取所有数据');
    console.log('');
    
})();