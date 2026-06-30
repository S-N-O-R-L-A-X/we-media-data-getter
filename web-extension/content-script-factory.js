// ============================================
// Factory Pattern Integration - Content Script
// ============================================

if (window.__extractorLoaded) {
    console.log('[ContentScript-Factory] Skip duplicate injection');
} else {
    window.__extractorLoaded = true;
    console.log('[ContentScript-Factory] === Multi-platform Extractor System Loaded ===');

    // Create extractor instances
    const tiebaExtractor = new TiebaExtractor();
    const douyinExtractor = new DouyinExtractor();
    
    // Future platforms can be added here:
    // const xhsExtractor = new XiaohongshuExtractor();
    // const ksExtractor = new KuaishouExtractor();
    
    const allExtractors = [tiebaExtractor, douyinExtractor];
    
    function findMatchingExtractor(url) {
        return allExtractors.find(extractor => extractor.matchesUrl(url));
    }
    
    function getExtractorByPlatform(platformName) {
        const platform = platformName.toLowerCase();
        return allExtractors.find(extractor => 
            extractor.getPlatformName().toLowerCase() === platform
        ) || null;
    }
    
    // Unified message handler
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[ContentScript-Factory] Received:', message.action);
        
        let extractor = message.platform 
            ? getExtractorByPlatform(message.platform)
            : findMatchingExtractor(window.location.href);
        
        if (!extractor) {
            sendResponse({ success: false, error: 'No suitable extractor' });
            return true;
        }
        
        switch (message.action) {
            case 'startAutoExtraction':
                handleStartAutoExtraction(message, extractor, sendResponse);
                break;
            case 'stopExtraction':
                sendResponse(extractor.stopExtraction());
                break;
            case 'exportToCSV':
                handleExportToCSV(extractor, sendResponse);
                break;
            case 'extractNow':
                handleExtractCurrentPage(extractor, sendResponse);
                break;
            case 'clearData':
                sendResponse(extractor.clearData());
                break;
            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
        return true;
    });
    
    function handleStartAutoExtraction(msg, extractor, sendResponse) {
        extractor.startAutoExtraction(msg.pages || 50).catch(err => {
            console.error('Extraction failed:', err);
        });
        sendResponse({ success: true, message: 'Started' });
        return true;
    }
    
    function handleExportToCSV(extractor, sendResponse) {
        extractor.exportToCSV()
            .then(r => sendResponse(r))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    
    function handleExtractCurrentPage(extractor, sendResponse) {
        extractor.extractCurrentPage()
            .then(r => sendResponse(r))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    
    // Expose for debugging
    window.extractorFactory = { extractors: allExtractors, findMatchingExtractor };
    console.log('[ContentScript-Factory] Platforms:', allExtractors.map(e => e.getPlatformName()).join(', '));
}
