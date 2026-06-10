# 贴吧帖子数据爬虫

一个用于抓取贴吧用户主页帖子数据的Python脚本，可以提取帖子链接、播放量、点赞数和评论数，并以表格形式展示结果。

## 版本说明

本仓库提供两个版本的脚本：

1. **tieba_scraper_simple.py** (推荐) - 简化版，使用Python标准库，无需安装额外依赖
2. **tieba_scraper.py** - 完整版，功能更强大，但需要安装第三方依赖包

## 功能特点

- 自动抓取贴吧用户主页的所有帖子链接
- 提取每个帖子的播放量、点赞数和评论数
- 以表格形式在终端展示结果
- 支持导出数据到CSV文件
- 完善的错误处理和请求延迟机制

## 安装依赖

### 简化版 (tieba_scraper_simple.py)
**无需安装任何依赖包**，直接使用即可。

### 完整版 (tieba_scraper.py)
首先确保你已安装Python 3.7或更高版本，然后安装所需的依赖包：

```bash
pip install -r requirements.txt
```

或者单独安装：

```bash
pip install requests beautifulsoup4 pandas lxml
```

## 使用方法

### 简化版 (推荐)

```bash
python tieba_scraper_simple.py <贴吧用户主页URL>
```

**重要提示**：如果URL包含`&`等特殊字符，请使用引号包裹整个URL：

```bash
python tieba_scraper_simple.py "https://tieba.baidu.com/home/main?id=xxxx&fr=personalize_page"
```

**示例：**

```bash
python tieba_scraper_simple.py "https://tieba.baidu.com/home/main?un=用户名"

# 自定义输出文件名
python tieba_scraper_simple.py "https://tieba.baidu.com/home/main?un=用户名" -o my_posts.csv

# 仅在终端显示，不保存文件
python tieba_scraper_simple.py "https://tieba.baidu.com/home/main?un=用户名" --no-save
```

**详细使用说明请参考** [USAGE_GUIDE.md](USAGE_GUIDE.md)

### 完整版

```bash
python tieba_scraper.py <贴吧用户主页URL>
```

**可用选项：**

- `-o, --output`: 指定输出CSV文件名（默认：tieba_posts.csv）
- `--no-save`: 不保存到文件，仅在终端显示

## 输出格式

### 终端输出

脚本会在终端以表格形式显示结果：

```
====================================================================================================
贴吧帖子数据统计表
====================================================================================================
帖子标题                     帖子链接                               播放量  点赞数  评论数
这是一个测试帖子             https://tieba.baidu.com/p/1234567890     1000   50     20
另一个帖子                   https://tieba.baidu.com/p/0987654321     500    30     10
====================================================================================================
```

### CSV输出

CSV文件包含以下列：
- 帖子标题
- 帖子链接
- 播放量
- 点赞数
- 评论数

## 注意事项

1. **请求频率**：脚本内置了1秒的延迟，避免请求过快被贴吧限制
2. **数据准确性**：贴吧页面结构可能会变化，如果数据提取不准确，可能需要更新选择器
3. **播放量**：仅对视频帖子有效，普通帖子播放量会显示为0
4. **用户主页URL**：确保提供的是正确的贴吧用户主页链接

## 常见问题

### Q: 为什么某些数据提取不准确？

A: 贴吧可能会更新页面结构，导致CSS选择器失效。如果遇到这种情况，需要检查页面源码并更新脚本中的选择器。

### Q: 脚本运行很慢怎么办？

A: 可以修改`get_post_stats`方法中的`time.sleep(1)`来调整延迟时间，但要注意不要设置得太低，以免被贴吧限制。

### Q: 如何获取贴吧用户主页URL？

A: 在贴吧中搜索用户名，点击用户头像进入其主页，复制浏览器地址栏中的URL即可。

## 技术细节

### 简化版
- 使用Python标准库`urllib`进行HTTP请求
- 使用正则表达式进行HTML解析和数据提取
- 使用标准库`csv`模块导出数据
- 无需任何第三方依赖

### 完整版
- 使用`requests`库进行HTTP请求
- 使用`BeautifulSoup`进行HTML解析
- 使用`pandas`进行数据处理和表格展示
- 使用正则表达式提取数字数据
- 支持UTF-8编码，正确处理中文内容

## 许可证

MIT License

## 免责声明

本脚本仅供学习和研究使用。使用时请遵守贴吧的使用条款和相关法律法规，不要用于商业用途或恶意爬取。