async (page) => {
  const allData = [];
  let currentPage = 1;
  const maxPages = 42;
  const cutoffDate = new Date('2026-05-25');
  
  while (currentPage <= maxPages) {
    console.log(`Starting page ${currentPage}...`);
    await page.waitForTimeout(2000);
    
    // Extract data from current page
    const pageData = await page.evaluate(() => {
      const items = document.querySelectorAll('.thread-cont');
      const results = [];
      
      items.forEach(function(el) {
        try {
          const props = el.__vue__ && el.__vue__.$props;
          if (!props) return;
          
          const forumEl = el.querySelector('.forum');
          const spans = forumEl ? forumEl.querySelectorAll('span') : [];
          let dateStr = '';
          if (spans.length >= 2) {
            dateStr = (spans[1].textContent || '').trim();
          }
          
          const url = 'https://tieba.baidu.com/p/' + props.threadId;
          
          results.push({
            date: dateStr,
            url: url,
            playCount: props.playCount || 0,
            agreeCount: props.agreeCount || 0,
            collectCount: props.collectCount || 0,
            shareCount: el.getAttribute('share-count') || '0'
          });
        } catch(e) {}
      });
      
      return results;
    });
    
    // Filter by date and add to results
    for (const item of pageData) {
      if (item.date) {
        const itemDate = new Date(item.date.replace(' ', 'T'));
        if (itemDate >= cutoffDate) {
          allData.push(item);
        }
      }
    }
    
    console.log(`Page ${currentPage}: got ${pageData.length} items, ${allData.length} total after filtering`);
    
    if (currentPage >= maxPages) break;
    
    // Get all pagination items - they are SPAN elements within .tbv-pagination-wrap
    const pages = await page.$$eval('.tbv-pagination-wrap span', elems => 
      elems.map((e, i) => ({index: i, text: e.textContent?.trim(), class: e.className}))
    );
    
    console.log(`All pages on current view: ${JSON.stringify(pages)}`);
    
    // Find the button with the exact page number
    const nextPageNum = currentPage + 1;
    const targetIndex = pages.findIndex(p => p.text == String(nextPageNum));
    
    console.log(`Looking for page ${nextPageNum}, found at index: ${targetIndex}`);
    
    if (targetIndex >= 0) {
      // Click the button directly via evaluate
      await page.evaluate((idx) => {
        const buttons = document.querySelectorAll('.tbv-pagination-wrap span');
        if (buttons[idx]) {
          buttons[idx].click();
        }
      }, targetIndex);
      
      console.log(`Clicked page ${nextPageNum} at index ${targetIndex}`);
    } else {
      console.log(`Could not find page ${nextPageNum} in pagination`);
      break;
    }
    
    currentPage++;
  }
  
  // Sort by date descending
  allData.sort(function(a, b) { return b.date.localeCompare(a.date); });
  
  // Build CSV with proper encoding (BOM for Excel compatibility)
  let csv = '\uFEFF' + '发布日期，视频链接，浏览数，点赞数，收藏数，分享数\n';
  for (const item of allData) {
    csv += `${item.date},${item.url},${item.playCount},${item.agreeCount},${item.collectCount},${item.shareCount}\n`;
  }
  
  // Save via evaluation
  await page.evaluate((csvContent) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tieba_videos_after_0525.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }, csv);
  
  return `Extracted ${allData.length} records total, CSV should be downloading...`;
}