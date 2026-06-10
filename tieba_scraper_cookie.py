#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
贴吧帖子数据爬虫 (Cookie版本)
支持使用Cookie来绕过反爬虫限制
抓取用户主页的帖子链接、播放量、点赞数和评论数
"""

import urllib.request
import urllib.parse
import urllib.error
import re
import time
import csv
import argparse


class TiebaScraperCookie:
    def __init__(self, user_url, cookie=None):
        self.user_url = user_url
        self.cookie = cookie
        self.posts_data = []
        # 完整的浏览器请求头
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
        }
        
        # 如果提供了Cookie，添加到请求头
        if self.cookie:
            self.headers['Cookie'] = self.cookie
    
    def fetch_page(self, url):
        """获取网页内容"""
        try:
            req = urllib.request.Request(url, headers=self.headers)
            # 添加随机的延迟
            import random
            time.sleep(random.uniform(1.0, 3.0))
            
            with urllib.request.urlopen(req, timeout=20) as response:
                # 处理gzip压缩
                if response.info().get('Content-Encoding') == 'gzip':
                    import gzip
                    content = gzip.decompress(response.read())
                else:
                    content = response.read()
                
                # 尝试不同的编码
                for encoding in ['utf-8', 'gbk', 'gb2312']:
                    try:
                        return content.decode(encoding)
                    except UnicodeDecodeError:
                        continue
                return content.decode('utf-8', errors='ignore')
                
        except urllib.error.HTTPError as e:
            if e.code == 403:
                print(f"访问被拒绝 (403)，可能需要Cookie或等待后重试")
                print("请参考 USAGE_GUIDE.md 了解如何获取Cookie")
            elif e.code == 404:
                print(f"页面不存在 (404): {url}")
            else:
                print(f"HTTP错误 {e.code}: {e.reason}")
            return None
        except urllib.error.URLError as e:
            print(f"网络错误: {e.reason}")
            return None
        except Exception as e:
            print(f"获取页面失败 {url}: {e}")
            return None
    
    def get_user_posts(self):
        """获取用户主页的所有帖子链接"""
        try:
            print(f"正在访问用户主页: {self.user_url}")
            html_content = self.fetch_page(self.user_url)
            if not html_content:
                return []
            
            # 使用正则表达式提取帖子链接
            post_links = []
            # 匹配贴吧帖子链接格式 /p/数字
            pattern = r'href=["\']([^"\']*?/p/\d{6,}[^"\']*)["\']'
            matches = re.findall(pattern, html_content)
            
            for match in matches:
                # 过滤掉一些无效的链接
                if 'javascript:' not in match and '#' not in match:
                    full_url = urllib.parse.urljoin('https://tieba.baidu.com', match)
                    if full_url not in post_links:
                        post_links.append(full_url)
            
            # 去重并限制数量
            post_links = list(dict.fromkeys(post_links))
            print(f"找到 {len(post_links)} 个帖子链接")
            
            return post_links[:20]  # 限制最多20个帖子
            
        except Exception as e:
            print(f"获取用户帖子失败: {e}")
            return []
    
    def get_post_stats(self, post_url):
        """获取单个帖子的统计数据"""
        try:
            html_content = self.fetch_page(post_url)
            if not html_content:
                return {
                    'title': "获取失败",
                    'url': post_url,
                    'play_count': 0,
                    'like_count': 0,
                    'comment_count': 0
                }
            
            # 提取帖子标题 - 尝试多种可能的格式
            title_patterns = [
                r'<h1[^>]*class=["\']core_title[^"\']*["\'][^>]*>(.*?)</h1>',
                r'<h1[^>]*>(.*?)</h1>',
                r'<title[^>]*>(.*?)</title>'
            ]
            
            title = "未知标题"
            for pattern in title_patterns:
                title_match = re.search(pattern, html_content, re.DOTALL)
                if title_match:
                    title = title_match.group(1).strip()
                    # 清理HTML标签和多余空格
                    title = re.sub(r'<[^>]+>', '', title)
                    title = re.sub(r'\s+', ' ', title).strip()
                    break
            
            # 提取播放量
            play_count = 0
            play_patterns = [
                r'播放[：:]\s*(\d+[\d,]*)',
                r'play[：:]\s*(\d+[\d,]*)',
                r'(\d+[\d,]*)\s*次播放',
                r'播放数[：:]\s*(\d+[\d,]*)'
            ]
            for pattern in play_patterns:
                match = re.search(pattern, html_content, re.IGNORECASE)
                if match:
                    play_count = int(match.group(1).replace(',', ''))
                    break
            
            # 提取点赞数
            like_count = 0
            like_patterns = [
                r'点赞[：:]\s*(\d+[\d,]*)',
                r'like[：:]\s*(\d+[\d,]*)',
                r'(\d+[\d,]*)\s*赞',
                r'赞[：:]\s*(\d+[\d,]*)',
                r'thumb[：:]\s*(\d+[\d,]*)'
            ]
            for pattern in like_patterns:
                match = re.search(pattern, html_content, re.IGNORECASE)
                if match:
                    like_count = int(match.group(1).replace(',', ''))
                    break
            
            # 提取评论数
            comment_count = 0
            comment_patterns = [
                r'评论[：:]\s*(\d+[\d,]*)',
                r'reply[：:]\s*(\d+[\d,]*)',
                r'(\d+[\d,]*)\s*条?评论',
                r'回复[：:]\s*(\d+[\d,]*)',
                r'楼[层][：:]\s*(\d+[\d,]*)'
            ]
            for pattern in comment_patterns:
                match = re.search(pattern, html_content, re.IGNORECASE)
                if match:
                    comment_count = int(match.group(1).replace(',', ''))
                    break
            
            return {
                'title': title,
                'url': post_url,
                'play_count': play_count,
                'like_count': like_count,
                'comment_count': comment_count
            }
            
        except Exception as e:
            print(f"获取帖子 {post_url} 数据失败: {e}")
            return {
                'title': "获取失败",
                'url': post_url,
                'play_count': 0,
                'like_count': 0,
                'comment_count': 0
            }
    
    def scrape(self):
        """执行爬取任务"""
        post_links = self.get_user_posts()
        
        if not post_links:
            print("\n未能获取到帖子链接，可能原因：")
            print("1. 贴吧反爬虫限制 - 尝试添加Cookie")
            print("2. 用户主页需要登录才能访问")
            print("3. 页面结构发生变化")
            print("4. 网络连接问题")
            return self.posts_data
        
        print("\n开始抓取帖子数据...")
        for i, link in enumerate(post_links, 1):
            print(f"\n[{i}/{len(post_links)}] 正在抓取: {link}")
            post_data = self.get_post_stats(link)
            self.posts_data.append(post_data)
            print(f"  标题: {post_data['title']}")
            print(f"  播放量: {post_data['play_count']}")
            print(f"  点赞数: {post_data['like_count']}")
            print(f"  评论数: {post_data['comment_count']}")
        
        return self.posts_data
    
    def save_to_csv(self, filename='tieba_posts.csv'):
        """保存数据到CSV文件"""
        if not self.posts_data:
            print("没有数据可保存")
            return
        
        try:
            with open(filename, 'w', newline='', encoding='utf-8-sig') as csvfile:
                fieldnames = ['帖子标题', '帖子链接', '播放量', '点赞数', '评论数']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                
                writer.writeheader()
                for post in self.posts_data:
                    writer.writerow({
                        '帖子标题': post['title'],
                        '帖子链接': post['url'],
                        '播放量': post['play_count'],
                        '点赞数': post['like_count'],
                        '评论数': post['comment_count']
                    })
            
            print(f"\n数据已保存到: {filename}")
        except Exception as e:
            print(f"保存文件失败: {e}")
    
    def display_table(self):
        """以表格形式显示数据"""
        if not self.posts_data:
            print("没有数据可显示")
            return
        
        print("\n" + "="*100)
        print("贴吧帖子数据统计表")
        print("="*100)
        
        # 计算列宽
        max_title_len = max(len('帖子标题'), max(len(post['title']) for post in self.posts_data))
        max_url_len = max(len('帖子链接'), max(len(post['url']) for post in self.posts_data))
        
        # 限制列宽
        max_title_len = min(max_title_len, 40)
        max_url_len = min(max_url_len, 50)
        
        # 表头
        header = f"{'帖子标题':<{max_title_len}}  {'帖子链接':<{max_url_len}}  {'播放量':<8}  {'点赞数':<8}  {'评论数':<8}"
        print(header)
        print("-" * len(header))
        
        # 数据行
        for post in self.posts_data:
            title = post['title'][:max_title_len]
            url = post['url'][:max_url_len]
            row = f"{title:<{max_title_len}}  {url:<{max_url_len}}  {post['play_count']:<8}  {post['like_count']:<8}  {post['comment_count']:<8}"
            print(row)
        
        print("="*100)


def main():
    parser = argparse.ArgumentParser(description='贴吧帖子数据爬虫 (Cookie版本)')
    parser.add_argument('url', help='贴吧用户主页URL')
    parser.add_argument('--cookie', '-c', help='贴吧Cookie字符串')
    parser.add_argument('--cookie-file', '-f', help='包含Cookie的文件路径')
    parser.add_argument('--output', '-o', help='输出CSV文件名', default='tieba_posts.csv')
    parser.add_argument('--no-save', action='store_true', help='不保存到文件')
    
    args = parser.parse_args()
    
    # 获取Cookie
    cookie = None
    if args.cookie:
        cookie = args.cookie
    elif args.cookie_file:
        try:
            with open(args.cookie_file, 'r', encoding='utf-8') as f:
                cookie = f.read().strip()
        except Exception as e:
            print(f"读取Cookie文件失败: {e}")
    
    if not cookie:
        print("警告: 未提供Cookie，可能会遇到403错误")
        print("建议使用 --cookie 或 --cookie-file 参数提供Cookie")
        print("获取Cookie方法请参考 USAGE_GUIDE.md\n")
    
    scraper = TiebaScraperCookie(args.url, cookie)
    scraper.scrape()
    scraper.display_table()
    
    if not args.no_save:
        scraper.save_to_csv(args.output)


if __name__ == '__main__':
    main()