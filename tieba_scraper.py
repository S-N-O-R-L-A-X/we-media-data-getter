#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
贴吧帖子数据爬虫
抓取用户主页的帖子链接、播放量、点赞数和评论数
"""

import requests
from bs4 import BeautifulSoup
import pandas as pd
import re
import time
from urllib.parse import urljoin, urlparse
import argparse


class TiebaScraper:
    def __init__(self, user_url):
        self.user_url = user_url
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.posts_data = []
    
    def get_user_posts(self):
        """获取用户主页的所有帖子链接"""
        try:
            print(f"正在访问用户主页: {self.user_url}")
            response = self.session.get(self.user_url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 获取帖子链接
            post_links = []
            # 贴吧用户主页的帖子链接通常在特定的class中
            link_elements = soup.find_all('a', href=re.compile(r'/p/\d+'))
            
            for link in link_elements:
                href = link.get('href')
                if href and '/p/' in href:
                    full_url = urljoin('https://tieba.baidu.com', href)
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
            
            response = self.session.get(post_url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 提取帖子标题
            title_element = soup.find('h1', class_='core_title')
            if not title_element:
                title_element = soup.find('h1')
            title = title_element.get_text().strip() if title_element else "未知标题"
            
            # 提取播放量（针对视频帖子）
            play_count = 0
            # 贴吧视频帖子的播放量可能在特定位置
            play_elements = soup.find_all(text=re.compile(r'播放|play', re.I))
            for elem in play_elements:
                parent = elem.parent if hasattr(elem, 'parent') else None
                if parent:
                    match = re.search(r'(\d+[\d,]*)', str(parent))
                    if match:
                        play_count = int(match.group(1).replace(',', ''))
                        break
            
            # 提取点赞数
            like_count = 0
            like_elements = soup.find_all(class_=re.compile(r'like|dianzan|up', re.I))
            for elem in like_elements:
                text = elem.get_text()
                match = re.search(r'(\d+[\d,]*)', text)
                if match:
                    like_count = int(match.group(1).replace(',', ''))
                    break
            
            # 提取评论数
            comment_count = 0
            comment_elements = soup.find_all(class_=re.compile(r'comment|reply|lzl|reply_num', re.I))
            for elem in comment_elements:
                text = elem.get_text()
                match = re.search(r'(\d+[\d,]*)', text)
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
        
        df = pd.DataFrame(self.posts_data)
        df.columns = ['帖子标题', '帖子链接', '播放量', '点赞数', '评论数']
        df.to_csv(filename, index=False, encoding='utf-8-sig')
        print(f"\n数据已保存到: {filename}")
    
    def display_table(self):
        """以表格形式显示数据"""
        if not self.posts_data:
            print("没有数据可显示")
            return
        
        df = pd.DataFrame(self.posts_data)
        df.columns = ['帖子标题', '帖子链接', '播放量', '点赞数', '评论数']
        print("\n" + "="*100)
        print("贴吧帖子数据统计表")
        print("="*100)
        print(df.to_string(index=False))
        print("="*100)


def main():
    parser = argparse.ArgumentParser(description='贴吧帖子数据爬虫')
    parser.add_argument('url', help='贴吧用户主页URL')
    parser.add_argument('--output', '-o', help='输出CSV文件名', default='tieba_posts.csv')
    parser.add_argument('--no-save', action='store_true', help='不保存到文件')
    
    args = parser.parse_args()
    
    scraper = TiebaScraper(args.url)
    scraper.scrape()
    scraper.display_table()
    
    if not args.no_save:
        scraper.save_to_csv(args.output)


if __name__ == '__main__':
    main()