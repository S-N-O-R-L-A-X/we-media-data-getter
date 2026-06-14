#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
贴吧帖子数据爬虫 (Playwright版本)
使用Playwright浏览器自动化工具抓取用户主页的帖子链接、播放量、点赞数和评论数
"""

import asyncio
import pandas as pd
import argparse
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
import re
from datetime import datetime


class TiebaScraperPlaywright:
    def __init__(self, user_url, headless=True):
        self.user_url = user_url
        self.headless = headless
        self.posts_data = []
        self.browser = None
        self.page = None
        
    async def start_browser(self):
        """启动Playwright浏览器"""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=self.headless)
        self.page = await self.browser.new_page()
        
        # 设置视口大小
        await self.page.set_viewport_size({"width": 1920, "height": 1080})
        
        # 设置用户代理
        await self.page.set_extra_http_headers({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        
        print("浏览器已启动")
    
    async def close_browser(self):
        """关闭浏览器"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        print("浏览器已关闭")
    
    async def get_user_posts(self):
        """获取用户主页的所有帖子链接"""
        try:
            print(f"正在访问用户主页: {self.user_url}")
            
            # 访问用户主页
            await self.page.goto(self.user_url, wait_until="networkidle", timeout=30000)
            
            # 等待页面加载
            await asyncio.sleep(3)
            
            # 截图保存（调试用）
            # await self.page.screenshot(path="user_page.png", full_page=True)
            
            # 获取所有帖子链接
            post_links = []
            
            # 方法1: 通过CSS选择器获取帖子链接
            selectors = [
                'a[href*="/p/"]',
                '.threadlist_lz a[href*="/p/"]',
                'a.j_th_tit[href*="/p/"]',
                '.l_post a[href*="/p/"]'
            ]
            
            for selector in selectors:
                try:
                    elements = await self.page.query_selector_all(selector)
                    for element in elements:
                        href = await element.get_attribute('href')
                        if href and '/p/' in href and len(href) > 10:
                            full_url = href if href.startswith('http') else f'https://tieba.baidu.com{href}'
                            if full_url not in post_links:
                                post_links.append(full_url)
                except Exception as e:
                    print(f"使用选择器 {selector} 获取链接失败: {e}")
                    continue
            
            # 方法2: 通过JavaScript获取所有链接
            if not post_links:
                print("尝试使用JavaScript获取链接...")
                links = await self.page.evaluate('''
                    () => {
                        const links = [];
                        const allLinks = document.querySelectorAll('a[href*="/p/"]');
                        allLinks.forEach(link => {
                            const href = link.getAttribute('href');
                            if (href && /\\/p\\/\\d{6,}/.test(href)) {
                                const fullUrl = href.startsWith('http') ? href : 'https://tieba.baidu.com' + href;
                                if (!links.includes(fullUrl)) {
                                    links.push(fullUrl);
                                }
                            }
                        });
                        return links;
                    }
                ''')
                post_links = links
            
            # 去重
            post_links = list(dict.fromkeys(post_links))
            print(f"找到 {len(post_links)} 个帖子链接")
            
            # 显示找到的链接
            for i, link in enumerate(post_links[:5], 1):
                print(f"  {i}. {link}")
            if len(post_links) > 5:
                print(f"  ... 还有 {len(post_links) - 5} 个链接")
            
            return post_links[:20]  # 限制最多20个帖子
            
        except PlaywrightTimeoutError:
            print("页面加载超时，可能网络连接问题或页面结构变化")
            return []
        except Exception as e:
            print(f"获取用户帖子失败: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    async def get_post_stats(self, post_url):
        """获取单个帖子的统计数据"""
        try:
            print(f"  正在访问: {post_url}")
            
            await self.page.goto(post_url, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(2)
            
            # 获取页面内容用于调试
            page_content = await self.page.content()
            
            # 提取帖子标题
            title = await self.page.evaluate('''
                () => {
                    // 尝试多种方式获取标题
                    const selectors = [
                        'h1.core_title',
                        'h1.core_title_txt',
                        'h1',
                        '.core_title',
                        'title'
                    ];
                    
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            return element.textContent.trim();
                        }
                    }
                    return '未知标题';
                }
            ''')
            
            # 清理标题
            title = re.sub(r'\s+', ' ', title).strip()
            if '百度贴吧' in title:
                title = title.replace('百度贴吧', '').strip()
            
            # 提取播放量
            play_count = await self.page.evaluate('''
                () => {
                    const text = document.body.innerText;
                    
                    // 尝试多种播放量匹配模式
                    const patterns = [
                        /播放[：:]\s*([\d,]+)/,
                        /play[：:]\s*([\d,]+)/i,
                        /([\d,]+)\s*次播放/,
                        /播放数[：:]\s*([\d,]+)/,
                        /video.*播放.*?(\d+)/i
                    ];
                    
                    for (const pattern of patterns) {
                        const match = text.match(pattern);
                        if (match) {
                            return parseInt(match[1].replace(/,/g, ''));
                        }
                    }
                    return 0;
                }
            ''')
            
            # 提取点赞数
            like_count = await self.page.evaluate('''
                () => {
                    const text = document.body.innerText;
                    
                    // 尝试多种点赞数匹配模式
                    const patterns = [
                        /点赞[：:]\s*([\d,]+)/,
                        /like[：:]\s*([\d,]+)/i,
                        /([\d,]+)\s*赞/,
                        /赞[：:]\s*([\d,]+)/,
                        /thumb[：:]\s*([\d,]+)/i,
                        /agree[：:]\s*([\d,]+)/i,
                        /(\d+)\s*个赞/,
                        /(\d+)\s*人赞同/
                    ];
                    
                    for (const pattern of patterns) {
                        const match = text.match(pattern);
                        if (match) {
                            return parseInt(match[1].replace(/,/g, ''));
                        }
                    }
                    return 0;
                }
            ''')
            
            # 提取评论数
            comment_count = await self.page.evaluate('''
                () => {
                    const text = document.body.innerText;
                    
                    // 尝试多种评论数匹配模式
                    const patterns = [
                        /评论[：:]\s*([\d,]+)/,
                        /reply[：:]\s*([\d,]+)/i,
                        /([\d,]+)\s*条评论/,
                        /([\d,]+)\s*条?评论/,
                        /回复[：:]\s*([\d,]+)/,
                        /楼[层][：:]\s*([\d,]+)/,
                        /(\d+)\s*楼/,
                        /(\d+)\s*条回复/
                    ];
                    
                    for (const pattern of patterns) {
                        const match = text.match(pattern);
                        if (match) {
                            return parseInt(match[1].replace(/,/g, ''));
                        }
                    }
                    return 0;
                }
            ''')
            
            print(f"    标题: {title[:30]}...")
            print(f"    播放量: {play_count}, 点赞数: {like_count}, 评论数: {comment_count}")
            
            return {
                'title': title,
                'url': post_url,
                'play_count': play_count,
                'like_count': like_count,
                'comment_count': comment_count
            }
            
        except PlaywrightTimeoutError:
            print(f"    访问超时: {post_url}")
            return {
                'title': "访问超时",
                'url': post_url,
                'play_count': 0,
                'like_count': 0,
                'comment_count': 0
            }
        except Exception as e:
            print(f"    获取帖子数据失败: {e}")
            return {
                'title': "获取失败",
                'url': post_url,
                'play_count': 0,
                'like_count': 0,
                'comment_count': 0
            }
    
    async def scrape(self):
        """执行爬取任务"""
        try:
            await self.start_browser()
            
            post_links = await self.get_user_posts()
            
            if not post_links:
                print("\n未能获取到帖子链接")
                return self.posts_data
            
            print(f"\n开始抓取 {len(post_links)} 个帖子的数据...")
            
            for i, link in enumerate(post_links, 1):
                print(f"\n[{i}/{len(post_links)}]")
                post_data = await self.get_post_stats(link)
                self.posts_data.append(post_data)
                
                # 添加延迟，避免被封
                if i < len(post_links):
                    await asyncio.sleep(2)
            
            return self.posts_data
            
        except Exception as e:
            print(f"爬取过程中出错: {e}")
            import traceback
            traceback.print_exc()
            return self.posts_data
        finally:
            await self.close_browser()
    
    def save_to_csv(self, filename='tieba_posts_playwright.csv'):
        """保存数据到CSV文件"""
        if not self.posts_data:
            print("没有数据可保存")
            return
        
        try:
            # 使用pandas保存CSV
            df = pd.DataFrame(self.posts_data)
            df.columns = ['帖子标题', '帖子链接', '播放量', '点赞数', '评论数']
            df.to_csv(filename, index=False, encoding='utf-8-sig')
            print(f"\n数据已保存到: {filename}")
        except Exception as e:
            print(f"保存文件失败: {e}")
    
    def save_to_excel(self, filename='tieba_posts_playwright.xlsx'):
        """保存数据到Excel文件"""
        if not self.posts_data:
            print("没有数据可保存")
            return
        
        try:
            df = pd.DataFrame(self.posts_data)
            df.columns = ['帖子标题', '帖子链接', '播放量', '点赞数', '评论数']
            df.to_excel(filename, index=False, engine='openpyxl')
            print(f"\n数据已保存到: {filename}")
        except Exception as e:
            print(f"保存Excel文件失败: {e}")
    
    def display_table(self):
        """以表格形式显示数据"""
        if not self.posts_data:
            print("没有数据可显示")
            return
        
        print("\n" + "="*120)
        print("贴吧帖子数据统计表")
        print("="*120)
        
        # 使用pandas显示表格
        df = pd.DataFrame(self.posts_data)
        df.columns = ['帖子标题', '帖子链接', '播放量', '点赞数', '评论数']
        
        # 设置显示选项
        pd.set_option('display.max_columns', None)
        pd.set_option('display.width', 120)
        pd.set_option('display.max_colwidth', 50)
        
        print(df.to_string(index=False))
        print("="*120)
        
        # 显示统计信息
        print("\n统计信息:")
        print(f"总帖子数: {len(self.posts_data)}")
        print(f"总播放量: {sum(post['play_count'] for post in self.posts_data):,}")
        print(f"总点赞数: {sum(post['like_count'] for post in self.posts_data):,}")
        print(f"总评论数: {sum(post['comment_count'] for post in self.posts_data):,}")
        print(f"平均播放量: {sum(post['play_count'] for post in self.posts_data) / len(self.posts_data):.0f}")
        print(f"平均点赞数: {sum(post['like_count'] for post in self.posts_data) / len(self.posts_data):.0f}")
        print(f"平均评论数: {sum(post['comment_count'] for post in self.posts_data) / len(self.posts_data):.0f}")


async def main_async(url, headless=True, output_csv=None, output_excel=None, no_display=False):
    """异步主函数"""
    scraper = TiebaScraperPlaywright(url, headless=headless)
    
    # 执行爬取
    await scraper.scrape()
    
    # 显示表格
    if not no_display:
        scraper.display_table()
    
    # 保存文件
    if output_csv:
        scraper.save_to_csv(output_csv)
    if output_excel:
        scraper.save_to_excel(output_excel)


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='贴吧帖子数据爬虫 (Playwright版本)')
    parser.add_argument('url', help='贴吧用户主页URL')
    parser.add_argument('--headless', action='store_false', dest='show_browser',
                        help='显示浏览器窗口（默认不显示）')
    parser.add_argument('--output-csv', '-c', help='输出CSV文件名', default='tieba_posts_playwright.csv')
    parser.add_argument('--output-excel', '-e', help='输出Excel文件名')
    parser.add_argument('--no-display', action='store_true', help='不显示表格')
    
    args = parser.parse_args()
    
    print("="*50)
    print("贴吧帖子数据爬虫 (Playwright版本)")
    print("="*50)
    print(f"用户主页: {args.url}")
    print(f"浏览器模式: {'显示窗口' if args.show_browser else '无头模式'}")
    print("="*50)
    
    # 运行异步主函数
    asyncio.run(main_async(
        url=args.url,
        headless=not args.show_browser,
        output_csv=args.output_csv,
        output_excel=args.output_excel,
        no_display=args.no_display
    ))


if __name__ == '__main__':
    main()