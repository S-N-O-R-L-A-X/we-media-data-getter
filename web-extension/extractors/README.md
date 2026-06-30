# Extractor Modules - 提取器模块

使用工厂模式管理多平台数据提取器。

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────┐
│         ExtractorFactory                    │
│  (Central registry for all extractors)      │
└──────────────┬──────────────────────────────┘
               │
       ┌───────┼───────┬──────────┐
       │       │       │          │
       ▼       ▼       ▼          ▼
   Base    Tieba   Douyin   Xiaohongshu*
   Class  (XXX)   (XXX)     (Future)
```

## 📁 文件结构

```
web-extension/
├── extractors/
│   ├── base-extractor.js        # Abstract base class
│   ├── tieba-extractor.js       # Baidu Tieba extractor
│   ├── douyin-extractor.js      # Douyin extractor  
│   ├── factory.js               # Factory class
│   ├── README.md                # This file
│   └── index.js                 # Module exports
└── content-script.js            # Main content script
```

## 🔧 实现一个新平台提取器

### Step 1: 创建新提取器类

创建 `web-extension/extractors/new-platform-extractor.js`:

```javascript
class NewPlatformExtractor extends BaseExtractor {
    constructor() {
        super({
            cutoffDate: new Date('2026-05-25'),
            maxPages: 50,
            // platform-specific config...
        });
    }

    getPlatformName() {
        return 'NewPlatform';
    }

    matchesUrl(url) {
        return url.includes('newplatform.com');
    }

    async fetchDataFromAPI(pageNumber = 1) {
        // Implement your API fetch logic here
        return { data: [], error: null };
    }

    generateCSV(data) {
        let csv = '\uFEFF"Column1","Column2"\n';
        for (const item of data) {
            csv += `"${item.field1}","${item.field2}"\n`;
        }
        return csv;
    }
}

if (typeof window !== 'undefined') {
    window.NewPlatformExtractor = NewPlatformExtractor;
}
```

### Step 2: 注册到工厂

在 `content-script.js` 中添加：

```javascript
// Import and instantiate
import { NewPlatformExtractor } from './extractors/new-platform-extractor.js';

// Register with factory
const newPlatformExtractor = new NewPlatformExtractor();
extractors.push(newPlatformExtractor);
```

## 🎯 主要特性

### BaseExtractor 提供的方法：

| 方法 | 说明 | 子类需实现 |
|------|------|-----------|
| `getPlatformName()` | 获取平台名称 | ✓ |
| `matchesUrl(url)` | URL 匹配判断 | ✓ |
| `fetchDataFromAPI(page)` | API 数据获取 | ✓ |
| `generateCSV(data)` | CSV 生成 | ✗ (可选) |
| `extractCurrentPage()` | 提取当前页 | ✓ |
| `startAutoExtraction(pages)` | 自动抓取所有页 | ✓ |
| `stopExtraction()` | 停止抓取 | ✗ |
| `clearData()` | 清空数据 | ✗ |
| `getAllData()` | 获取全部数据 | ✗ |
| `exportToCSV()` | 导出 CSV | ✗ |
| `isValidTimestamp(ts)` | 时间戳验证 | ✗ |
| `saveDataToStorage()` | 保存本地存储 | ✗ |
| `notifyProgress(...)` | 进度通知 | ✗ |

### ExtractorFactory 功能：

```javascript
const factory = new ExtractorFactory();

// Register extractor
factory.register(new TiebaExtractor());

// Get by platform name
const extractor = factory.getExtractor('tieba');

// Find matching extractor for current URL
const matched = factory.findExtractorForUrl(url);

// List all registered platforms
const platforms = factory.getAllPlatforms();
```

## 🚀 扩展支持的新平台列表

已支持：
- ✅ **Tieba** (百度贴吧)
- ✅ **Douyin** (抖音)

计划中：
- ⏳ **Xiaohongshu** (小红书)
- ⏳ **Kuaishou** (快手)  
- ⏳ **WeChat Channels** (视频号)
- ⏳ **Bilibili** (哔哩哔哩)

## 💡 使用示例

### 从 Popup 启动自动抓取：

```javascript
chrome.runtime.sendMessage({
    action: 'startAutoExtraction',
    pages: 50,
    platform: 'douyin'  // optional, auto-detect if omitted
}, response => {
    console.log('Extraction started:', response);
});
```

### 手动提取当前页：

```javascript
chrome.runtime.sendMessage({
    action: 'extractNow'
}, response => {
    console.log('Extracted:', response);
});
```

### 导出 CSV：

```javascript
chrome.runtime.sendMessage({
    action: 'exportToCSV'
}, response => {
    console.log('Exported:', response);
});
```

### 停止抓取：

```javascript
chrome.runtime.sendMessage({
    action: 'stopExtraction'
});
```

## 🔄 迁移指南

从旧版 Content Script 迁移到工厂模式：

**Before (Old):**
```javascript
const TiebaExtractor = (function() { /* ... */ })();
const DouyinExtractor = (function() { /* ... */ })();

// In message handler
if (isTiebaPage) {
    TiebaExtractor.startAutoExtraction();
} else if (isDouyinPage) {
    DouyinExtractor.startAutoExtraction();
}
```

**After (Factory Pattern):**
```javascript
const tiebaExtractor = new TiebaExtractor();
const douyinExtractor = new DouyinExtractor();
const extractors = [tiebaExtractor, douyinExtractor];

// In message handler
function handleMessage(message) {
    const extractor = findMatchingExtractor(window.location.href);
    return extractor.startAutoExtraction(message.pages);
}
```

优势：
- ✨ 添加新平台只需继承基类并注册
- 🎯 统一接口，简化消息分发逻辑
- 📦 代码更清晰，易于维护
- 🔧 便于单元测试和 mock
