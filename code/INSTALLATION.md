# Playwright贴吧爬虫安装指南

## 前提条件

1. Python 3.7 或更高版本
2. 稳定的网络连接

## 安装步骤

### 1. 安装Python依赖

由于网络问题，请根据你的网络环境选择合适的安装方式：

#### 方式A：使用官方源（推荐，网络好时使用）
```bash
cd code
pip install -r requirements.txt
```

#### 方式B：使用清华镜像源（国内用户推荐）
```bash
cd code
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

#### 方式C：使用阿里云镜像源
```bash
cd code
pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/
```

#### 方式D：逐个安装（网络不稳定时使用）
```bash
cd code
pip install playwright -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install openpyxl -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 2. 安装Playwright浏览器

安装完Python依赖后，需要安装Playwright的浏览器：

```bash
playwright install chromium
```

如果上述命令失败，可以尝试：

```bash
python -m playwright install chromium
```

#### 使用国内镜像加速

如果下载速度慢，可以设置环境变量使用镜像：

```bash
# Windows CMD
set PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/
playwright install chromium

# Windows PowerShell
$env:PLAYWRIGHT_DOWNLOAD_HOST="https://npmmirror.com/mirrors/playwright/"
playwright install chromium

# Linux/Mac
export PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/
playwright install chromium
```

### 3. 验证安装

运行以下命令验证安装是否成功：

```bash
python -c "import playwright; print('Playwright安装成功')"
```

如果成功，会显示：`Playwright安装成功`

## 常见安装问题

### 问题1：SSL证书验证失败

**错误信息：**
```
SSLError: EOF occurred in violation of protocol
```

**解决方案：**

1. 检查网络连接
2. 尝试不同的镜像源
3. 如果使用公司网络，可能需要配置代理

### 问题2：权限错误

**错误信息：**
```
Permission denied
```

**解决方案：**

Windows（管理员权限运行CMD）：
```bash
# 右键点击CMD，选择"以管理员身份运行"
pip install -r requirements.txt
```

Linux/Mac：
```bash
sudo pip install -r requirements.txt
```

### 问题3：浏览器下载失败

**错误信息：**
```
Failed to download browser
```

**解决方案：**

1. 使用镜像源下载
2. 手动下载浏览器并解压到指定目录
3. 检查防火墙设置

### 问题4：依赖冲突

**错误信息：**
```
ERROR: pip's dependency resolver does not currently take into account...
```

**解决方案：**

```bash
# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 在虚拟环境中安装
pip install -r requirements.txt
```

## 使用方法

安装完成后，使用方法如下：

### 基本使用

```bash
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=用户ID"
```

### 显示浏览器窗口（调试用）

```bash
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=用户ID" --headless
```

### 指定输出文件

```bash
# 导出为CSV
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=用户ID" --output-csv my_data.csv

# 导出为Excel
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=用户ID" --output-excel my_data.xlsx

# 同时导出两种格式
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=用户ID" --output-csv my_data.csv --output-excel my_data.xlsx
```

### 不显示表格

```bash
python tieba_scraper_playwright.py "https://tieba.baidu.com/home/main?id=用户ID" --no-display
```

## 输出示例

### 控制台输出

```
==================================================
贴吧帖子数据爬虫 (Playwright版本)
==================================================
用户主页: https://tieba.baidu.com/home/main?id=xxxxx
浏览器模式: 无头模式
==================================================
浏览器已启动
正在访问用户主页: https://tieba.baidu.com/home/main?id=xxxxx
找到 15 个帖子链接
  1. https://tieba.baidu.com/p/123456789
  2. https://tieba.baidu.com/p/987654321
  ...

开始抓取 15 个帖子的数据...

[1/15]
  正在访问: https://tieba.baidu.com/p/123456789
    标题: 这是一个测试帖子...
    播放量: 1000, 点赞数: 50, 评论数: 20

...

====================================================================================================================
贴吧帖子数据统计表
====================================================================================================================
帖子标题                                      帖子链接                                      播放量     点赞数     评论数
这是一个测试帖子                               https://tieba.baidu.com/p/123456789      1000      50        20
另一个帖子                                     https://tieba.baidu.com/p/987654321      500       30        10
...
====================================================================================================================

统计信息:
总帖子数: 15
总播放量: 12,345
总点赞数: 678
总评论数: 345
平均播放量: 823
平均点赞数: 45
平均评论数: 23

数据已保存到: tieba_posts_playwright.csv
浏览器已关闭
```

### CSV文件格式

```csv
帖子标题,帖子链接,播放量,点赞数,评论数
这是一个测试帖子,https://tieba.baidu.com/p/123456789,1000,50,20
另一个帖子,https://tieba.baidu.com/p/987654321,500,30,10
...
```

## 卸载

如果需要卸载：

```bash
pip uninstall playwright openpyxl
```

删除浏览器文件：

```bash
playwright uninstall chromium
```

## 技术支持

如果遇到问题：

1. 检查Python版本：`python --version`（需要 >= 3.7）
2. 检查pip版本：`pip --version`（建议升级到最新版）
3. 尝试使用虚拟环境
4. 查看详细错误信息，搜索解决方案
5. 参考Playwright官方文档：https://playwright.dev/python/

## 相关文档

- [使用说明](PLAYWRIGHT_USAGE.md)
- [快速开始](QUICK_START.md)
- [项目README](README.md)