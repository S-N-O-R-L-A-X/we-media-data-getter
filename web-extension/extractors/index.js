// ============================================
// Extractor Modules - 提取器模块管理
// ============================================

import { BaseExtractor } from './base-extractor.js';
import { TiebaExtractor } from './tieba-extractor.js';
import { DouyinExtractor } from './douyin-extractor.js';
import { ExtractorFactory, factory } from './extractor-factory.js';

// Export all for use in other modules
export { 
    BaseExtractor, 
    TiebaExtractor, 
    DouyinExtractor, 
    ExtractorFactory, 
    factory 
};