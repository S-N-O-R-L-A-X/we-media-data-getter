# 贴吧数据爬虫 (Playwright版本) 使用说明

## 简介

这是一个使用Playwright浏览器自动化工具的贴吧数据爬虫，可以抓取贴吧用户主页的帖子链接、播放量、点赞数和评论数，并以表格形式展示或导出为CSV/Excel文件。

## 安装依赖

### 1. 安装Python依赖

```bash
pip install -r requirements.txt
```

### 2. 安装Playwright浏览器

```bash
playwright install chromium
```

如果遇到问题，可以尝试：

```bash
python -m playwright install chromium
```

## 基本使用

### 运行方式

```bash
python tieba_scraper_playwright.py <用户主页URL>
```

### 示例

```bash
# 基本使用
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=xxxxx"

# 显示浏览器窗口（调试用）
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=xxxxx" --headless

# 指定输出文件名
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=xxxxx" --output-csv my_posts.csv

# 导出为Excel文件
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=xxxxx" --output-excel my_posts.xlsx

# 不显示表格
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=xxxxx" --no-display

# 组合使用
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=xxxxx" --headless --output-csv results.csv --output-excel results.xlsx
```

## 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `url` | 贴吧用户主页URL（必填） | - |
| `--headless` | 显示浏览器窗口 | 不显示 |
| `--output-csv`, `-c` | 输出CSV文件名 | tieba_posts_playwright.csv |
| `--output-excel`, `-e` | 输出Excel文件名 | 无 |
| `--no-display` | 不显示表格 | 显示 |

## 输出说明

### 控制台输出

脚本会在控制台显示：

1. 找到的帖子链接列表
2. 每个帖子的爬取进度
3. 每个帖子的标题、播放量、点赞数、评论数
4. 最终的统计表格
5. 统计信息（总数、平均值等）

### 文件输出

- **CSV文件**: 包含所有帖子数据的CSV格式文件
- **Excel文件**: 包含所有帖子数据的Excel格式文件（需要openpyxl库）

### 表格格式

| 帖子标题 | 帖子链接 | 播放量 | 点赞数 | 评论数 |
|---------|---------|--------|--------|--------|
| 帖子1标题 | https://tieba.baidu.com/p/123456 | 1000 | 50 | 20 |
| 帖子2标题 | https://tieba.baidu.com/p/789012 | 500 | 30 | 10 |

## 功能特点

### 1. 自动化浏览器
- 使用真实的Chromium浏览器访问页面
- 模拟真实用户行为，降低被封风险
- 支持JavaScript渲染的动态页面

### 2. 智能数据提取
- 多种选择器策略确保数据提取成功
- JavaScript正则表达式匹配播放量、点赞数、评论数
- 自动去重和验证数据

### 3. 延迟控制
- 自动添加延迟，避免请求过快
- 保护账号，降低被封风险

### 4. 错误处理
- 超时保护机制
- 详细的错误日志
- 优雅的失败处理

## 与Cookie版本的区别

| 特性 | Playwright版本 | Cookie版本 |
|------|---------------|-----------|
| 反爬虫能力 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 速度 | 较慢 | 较快 |
| 资源占用 | 较高 | 较低 |
| 配置难度 | 简单 | 需要Cookie |
| 稳定性 | 高 | 中等 |

## 常见问题

### 1. 如何获取用户主页URL？

访问贴吧，进入某用户的个人主页，复制浏览器地址栏的URL。

格式通常是：`https://tieba.baidu.com/home/main?id=用户ID`

### 2. 为什么找不到帖子链接？

可能原因：
- 用户主页需要登录才能查看
- 页面结构发生变化
- 网络连接问题

解决方案：
- 使用 `--headless` 参数显示浏览器窗口，查看实际页面内容
- 检查URL是否正确
- 尝试使用Cookie版本的爬虫

### 3. 播放量/点赞数/评论数为0？

可能原因：
- 帖子确实没有这些数据（如纯文本帖子）
- 页面结构发生变化，正则表达式不匹配
- 数据加载较慢，未等完全加载就提取了

解决方案：
- 显示浏览器窗口，查看页面实际内容
- 检查页面加载是否完成
- 可以增加延迟时间

### 4. 如何查看页面内容？

使用 `--headless` 参数显示浏览器窗口：

```bash
python tieba_scraper_playwright.py "URL" --headless
```

### 5. 速度太慢怎么办？

- 减少抓取的帖子数量（修改代码中的 `post_links[:20]`）
- 减少延迟时间（修改代码中的 `await asyncio.sleep(2)`）

### 6. Playwright安装失败？

尝试以下方法：

```bash
# 使用国内镜像
export PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/
playwright install chromium

# 或手动下载
python -m playwright install --with-deps chromium
```

## 注意事项

1. **请勿频繁运行**：避免对贴吧服务器造成压力
2. **遵守网站规则**：仅用于个人学习和研究，不要用于商业用途
3. **尊重隐私**：不要抓取和传播他人隐私信息
4. **合理使用**：建议每次运行间隔不少于10分钟

## 技术支持

如有问题，请检查：
1. Python版本 >= 3.7
2. 依赖是否正确安装
3. Playwright浏览器是否正确安装
4. 网络连接是否正常

## 更新日志

### v1.0.0 (2024)
- 初始版本
- 支持基本的帖子数据抓取
- 支持CSV和Excel导出
- 支持表格显示