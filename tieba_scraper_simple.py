#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
贴吧帖子数据爬虫 (简化版)
仅使用Python标准库，无需安装额外依赖包
抓取用户主页的帖子链接、播放量、点赞数和评论数
"""

import urllib.request
import urllib.parse
import urllib.error
import re
import time
import csv
import argparse
from html.parser import HTMLParser


class SimpleHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.current_url = None
        self.in_title = False
        self.title = ""
        self.text_content = []
        self.current_tag = None
        self.current_attrs = None
        
    def handle_starttag(self, tag, attrs):
        self.current_tag = tag
        self.current_attrs = dict(attrs)
        
        if tag == 'a':
            href = dict(attrs).get('href', '')
            if '/p/' in href:
                full_url = urllib.parse.urljoin('https://tieba.baidu.com', href)
                if full_url not in self.links:
                    self.links.append(full_url)
        
        if tag == 'h1' or 'title' in dict(attrs).get('class', '').lower():
            self.in_title = True
            
    def handle_endtag(self, tag):
        if tag == 'h1':
            self.in_title = False
        self.current_tag = None
        self.current_attrs = None
        
    def handle_data(self, data):
        if self.in_title:
            self.title += data.strip()
        self.text_content.append(data)
        
    def get_text(self):
        return ' '.join(self.text_content)
    
    def reset_content(self):
        self.links = []
        self.title = ""
        self.text_content = []
        self.in_title = False


class TiebaScraperSimple:
    def __init__(self, user_url):
        self.user_url = user_url
        self.posts_data = []
        # 模拟浏览器请求头，添加更多反爬虫措施
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0'
        }
    
    def fetch_page(self, url):
        """获取网页内容"""
        try:
            req = urllib.request.Request(url, headers=self.headers)
            # 添加随机的延迟，避免请求过快
            import random
            time.sleep(random.uniform(0.5, 2.0))
            
            with urllib.request.urlopen(req, timeout=15) as response:
                content = response.read()
                # 尝试不同的编码
                try:
                    return content.decode('utf-8')
                except UnicodeDecodeError:
                    try:
                        return content.decode('gbk')
                    except UnicodeDecodeError:
                        return content.decode('utf-8', errors='ignore')
        except urllib.error.HTTPError as e:
            if e.code == 403:
                print(f"访问被拒绝 (403)，可能是反爬虫机制，尝试稍后重试")
            else:
                print(f"HTTP错误 {e.code}: {e.reason}")
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
            pattern = r'href=["\']([^"\']*/p/\d+[^"\']*)["\']'
            matches = re.findall(pattern, html_content)
            
            for match in matches:
                full_url = urllib.parse.urljoin('https://tieba.baidu.com', match)
                if full_url not in post_links:
                    post_links.append(full_url)
            
            print(f"找到 {len(post_links)} 个帖子链接")
            return post_links
            
        except Exception as e:
            print(f"获取用户帖子失败: {e}")
            return []
    
    def get_post_stats(self, post_url):
        """获取单个帖子的统计数据"""
        try:
            # 添加延迟避免请求过快
            time.sleep(1)
            
            html_content = self.fetch_page(post_url)
            if not html_content:
                return {
                    'title': "获取失败",
                    'url': post_url,
                    'play_count': 0,
                    'like_count': 0,
                    'comment_count': 0
                }
            
            # 提取帖子标题
            title_match = re.search(r'<h1[^>]*class=["\']core_title["\'][^>]*>(.*?)</h1>', html_content, re.DOTALL)
            if not title_match:
                title_match = re.search(r'<h1[^>]*>(.*?)</h1>', html_content, re.DOTALL)
            title = title_match.group(1).strip() if title_match else "未知标题"
            # 清理HTML标签
            title = re.sub(r'<[^>]+>', '', title)
            
            # 提取播放量
            play_count = 0
            play_patterns = [
                r'播放[：:]\s*(\d+[\d,]*)',
                r'play[：:]\s*(\d+[\d,]*)',
                r'(\d+[\d,]*)\s*次播放'
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
                r'(\d+[\d,]*)\s*赞'
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
                r'(\d+[\d,]*)\s*条?评论'
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
        
        # 限制列宽以避免表格过宽
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
    parser = argparse.ArgumentParser(description='贴吧帖子数据爬虫 (简化版)')
    parser.add_argument('url', help='贴吧用户主页URL')
    parser.add_argument('--output', '-o', help='输出CSV文件名', default='tieba_posts.csv')
    parser.add_argument('--no-save', action='store_true', help='不保存到文件')
    
    args = parser.parse_args()
    
    scraper = TiebaScraperSimple(args.url)
    scraper.scrape()
    scraper.display_table()
    
    if not args.no_save:
        scraper.save_to_csv(args.output)


if __name__ == '__main__':
    main()