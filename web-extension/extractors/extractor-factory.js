// ============================================
// Extractor Factory - 提取器工厂
// ============================================

/**
 * Factory class for managing all platform extractors
 * 管理所有平台提取器的工厂类
 */
class ExtractorFactory {
    constructor() {
        this.extractors = new Map();
        this.registeredPlatforms = [];
    }

    /**
     * Register an extractor instance
     * @param {BaseExtractor} extractor 
     */
    register(extractor) {
        const platformName = extractor.getPlatformName().toLowerCase();
        
        if (this.extractors.has(platformName)) {
            console.warn(`[ExtractorFactory] Platform "${platformName}" already registered`);
        } else {
            this.extractors.set(platformName, extractor);
            this.registeredPlatforms.push(platformName);
            console.log(`[ExtractorFactory] Registered extractor for platform: ${platformName}`);
        }
    }

    /**
     * Get extractor by platform name
     * @param {string} platformName 
     * @returns {BaseExtractor|null}
     */
    getExtractor(platformName) {
        return this.extractors.get(platformName.toLowerCase()) || null;
    }

    /**
     * Find matching extractor for current URL
     * @param {string} url 
     * @returns {BaseExtractor|null}
     */
    findExtractorForUrl(url) {
        for (const extractor of this.extractors.values()) {
            if (extractor.matchesUrl(url)) {
                return extractor;
            }
        }
        return null;
    }

    /**
     * Get all registered platforms
     * @returns {Array<string>}
     */
    getAllPlatforms() {
        return [...this.registeredPlatforms];
    }

    /**
     * Check if a specific platform is supported
     * @param {string} platformName 
     * @returns {boolean}
     */
    isPlatformSupported(platformName) {
        return this.extractors.has(platformName.toLowerCase());
    }
}

// Export to global scope
if (typeof window !== 'undefined') {
    window.ExtractorFactory = ExtractorFactory;
}
