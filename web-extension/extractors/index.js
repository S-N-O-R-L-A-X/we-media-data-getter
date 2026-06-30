// ============================================
// Extractor Modules - 提取器模块管理
// ============================================

// Import all extractor modules (browser environment)
import { BaseExtractor } from './base-extractor.js';
import { TiebaExtractor } from './tieba-extractor.js';
import { DouyinExtractor } from './douyin-extractor.js';
import { ExtractorFactory } from './extractor-factory.js';

// Create and register extractors
const factory = new ExtractorFactory();
factory.register(new TiebaExtractor());
factory.register(new DouyinExtractor());

// Export for use in content-script.js
export { 
    BaseExtractor, 
    TiebaExtractor, 
    DouyinExtractor, 
    ExtractorFactory, 
    factory as default 
};
