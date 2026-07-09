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
    const extractors = {
        TiebaExtractor: globalThis.TiebaExtractor,
        DouyinExtractor: globalThis.DouyinExtractor,
        XiaohongshuExtractor: globalThis.XiaohongshuExtractor,
        ShipinhaoExtractor: globalThis.ShipinhaoExtractor,
        KuaishouExtractor: globalThis.KuaishouExtractor,
    };
    for (const [name, Extractor] of Object.entries(extractors)) {
        if (typeof Extractor === 'function') {
            instance.register(new Extractor());
        } else {
            console.warn(`[ExtractorFactory] ${name} not found, skipping registration`);
        }
    }

    // Expose globally for both content script (window) and service worker (globalThis)
    if (typeof globalThis !== 'undefined') {
        globalThis.ExtractorFactory = ExtractorFactory;
        globalThis.factory = instance;
    }
}