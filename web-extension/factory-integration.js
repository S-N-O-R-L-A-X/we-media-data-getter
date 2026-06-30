// ============================================
// Factory Integration - 工厂模式集成脚本
// ============================================
// 
// This file demonstrates how to use the factory pattern for multi-platform extractors.
// To integrate into existing content-script.js:
// 
// 1. Include extractor files:
//    <script src="extractors/base-extractor.js"></script>
//    <script src="extractors/tieba-extractor.js"></script>
//    <script src="extractors/douyin-extractor.js"></script>
//
// 2. Initialize and use extractors as shown below

// Create extractor instances
const tiebaExtractor = new TiebaExtractor();
const douyinExtractor = new DouyinExtractor();

// List of all available extractors (easy to extend)
const extractors = [tiebaExtractor, douyinExtractor];

/**
 * Find the matching extractor for current URL
 */
function findMatchingExtractor(url) {
    return extractors.find(extractor => extractor.matchesUrl(url));
}

/**
 * Get platform name from message
 */
function getTargetPlatform(message) {
    if (message.platform) {
        const platform = message.platform.toLowerCase();
        if (['tieba', 'douyin'].includes(platform)) return platform;
    }
    // Auto-detect based on current URL
    const url = window.location.href;
    if (url.includes('creator.douyin.com')) return 'douyin';
    if (url.startsWith('https://tieba.baidu.com/home/creative/work')) return 'tieba';
    return null;
}

/**
 * Handle incoming messages using factory pattern
 */
function handleMessage(message) {
    console.log('[ContentScript] Received message:', message);
    
    const currentUrl = window.location.href;
    const matchedExtractor = findMatchingExtractor(currentUrl);
    const targetPlatform = getTargetPlatform(message);
    
    // If specific platform requested, use that extractor
    const extractorToUse = targetPlatform 
        ? extractors.find(e => e.getPlatformName().toLowerCase() === targetPlatform)
        : matchedExtractor;
    
    if (!extractorToUse) {
        console.warn('[ContentScript] No extractor found for this page');
        return { success: false, error: 'No suitable extractor found' };
    }
    
    switch (message.action) {
        case 'startAutoExtraction':
            console.log('[ContentScript] Starting auto extraction via', extractorToUse.getPlatformName());
            return extractorToUse.startAutoExtraction(message.pages || 50);
            
        case 'stopExtraction':
            console.log('[ContentScript] Stopping extraction via', extractorToUse.getPlatformName());
            return extractorToUse.stopExtraction();
            
        case 'exportToCSV':
            console.log('[ContentScript] Exporting CSV via', extractorToUse.getPlatformName());
            return extractorToUse.exportToCSV();
            
        case 'extractNow':
            console.log('[ContentScript] Extracting current page via', extractorToUse.getPlatformName());
            return extractorToUse.extractCurrentPage();
            
        case 'clearData':
            console.log('[ContentScript] Clearing data via', extractorToUse.getPlatformName());
            return extractorToUse.clearData();
            
        default:
            console.warn('[ContentScript] Unknown action:', message.action);
            return { success: false, error: 'Unknown action' };
    }
}

// Add platform detection logging
console.log('[ContentScript] Current URL:', currentUrl);
console.log('[ContentScript] Matched extractor:', matchedExtractor?.getPlatformName() || 'None');

// Export for external use
window.extractorFactory = {
    extractors,
    findMatchingExtractor,
    getTargetPlatform,
    handleMessage
};

console.log('[ContentScript] Factory integration loaded. Available platforms:', 
    extractors.map(e => e.getPlatformName()).join(', '));
