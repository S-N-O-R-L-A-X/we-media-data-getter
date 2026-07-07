// ============================================
// Extractor Factory - 提取器工厂
// ============================================

class ExtractorFactory {
    constructor() {
        this.extractors = [];
    }

    register(extractor) {
        if (extractor instanceof BaseExtractor) {
            this.extractors.push(extractor);
        } else {
            console.warn('Only instances of BaseExtractor can be registered');
        }
    }

    getAllExtractors() {
        return this.extractors;
    }

    getExtractorByUrl(url) {
        return this.extractors.find(ex => ex.matchesUrl(url));
    }
}

// Create factory instance (singleton, guard against re-injection)
if (!globalThis.__factoryLoaded) {
    globalThis.__factoryLoaded = true;
    const instance = new ExtractorFactory();
    instance.register(new TiebaExtractor());
    instance.register(new DouyinExtractor());
    instance.register(new XiaohongshuExtractor());

    // Expose globally for both content script (window) and service worker (globalThis)
    if (typeof globalThis !== 'undefined') {
        globalThis.ExtractorFactory = ExtractorFactory;
        globalThis.factory = instance;
    }
}