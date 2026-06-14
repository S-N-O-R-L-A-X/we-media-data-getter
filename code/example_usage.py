#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Playwright贴吧爬虫使用示例
展示如何使用TiebaScraperPlaywright类
"""

import asyncio
from tieba_scraper_playwright import TiebaScraperPlaywright


async def example_basic():
    """基本使用示例"""
    print("="*60)
    print("示例1：基本使用")
    print("="*60)
    
    # 替换为实际的贴吧用户主页URL
    user_url = "https://tieba.baidu.com/home/main?id=你的用户ID"
    
    # 创建爬虫实例
    scraper = TiebaScraperPlaywright(user_url, headless=True)
    
    # 执行爬取
    await scraper.scrape()
    
    # 显示结果
    scraper.display_table()
    
    # 保存到CSV
    scraper.save_to_csv('example_output.csv')
    
    # 保存到Excel
    scraper.save_to_excel('example_output.xlsx')


async def example_with_browser_visible():
    """显示浏览器窗口的示例"""
    print("="*60)
    print("示例2：显示浏览器窗口（调试用）")
    print("="*60)
    
    user_url = "https://tieba.baidu.com/home/main?id=你的用户ID"
    
    # headless=False 会显示浏览器窗口
    scraper = TiebaScraperPlaywright(user_url, headless=False)
    
    await scraper.scrape()
    scraper.display_table()


async def example_with_error_handling():
    """带错误处理的示例"""
    print("="*60)
    print("示例3：带错误处理")
    print("="*60)
    
    user_url = "https://tieba.baidu.com/home/main?id=你的用户ID"
    
    try:
        scraper = TiebaScraperPlaywright(user_url, headless=True)
        
        posts_data = await scraper.scrape()
        
        if posts_data:
            print(f"\n成功抓取 {len(posts_data)} 个帖子")
            scraper.display_table()
            
            # 计算统计信息
            total_plays = sum(post['play_count'] for post in posts_data)
            total_likes = sum(post['like_count'] for post in posts_data)
            total_comments = sum(post['comment_count'] for post in posts_data)
            
            print(f"\n统计摘要:")
            print(f"总播放量: {total_plays:,}")
            print(f"总点赞数: {total_likes:,}")
            print(f"总评论数: {total_comments:,}")
            
            # 找出播放量最高的帖子
            max_play_post = max(posts_data, key=lambda x: x['play_count'])
            print(f"\n播放量最高的帖子:")
            print(f"  标题: {max_play_post['title'][:50]}...")
            print(f"  播放量: {max_play_post['play_count']:,}")
            print(f"  链接: {max_play_post['url']}")
            
        else:
            print("未能抓取到任何帖子数据")
            
    except Exception as e:
        print(f"发生错误: {e}")
        import traceback
        traceback.print_exc()


async def example_custom_settings():
    """自定义设置的示例"""
    print("="*60)
    print("示例4：自定义设置")
    print("="*60)
    
    user_url = "https://tieba.baidu.com/home/main?id=你的用户ID"
    
    scraper = TiebaScraperPlaywright(user_url, headless=True)
    
    # 可以在这里修改一些设置
    # 例如：修改延迟时间、帖子数量限制等
    
    # 执行爬取
    await scraper.scrape()
    
    # 只保存为CSV，不显示表格
    scraper.save_to_csv('custom_output.csv')
    
    print("数据已保存到 custom_output.csv")


def main():
    """主函数"""
    print("="*60)
    print("Playwright贴吧爬虫使用示例")
    print("="*60)
    print()
    
    print("使用前请确保：")
    print("1. 已安装依赖：pip install playwright openpyxl")
    print("2. 已安装浏览器：playwright install chromium")
    print("3. 已修改示例中的URL为实际的贴吧用户主页")
    print()
    
    print("可用示例：")
    print("1. example_basic() - 基本使用")
    print("2. example_with_browser_visible() - 显示浏览器窗口")
    print("3. example_with_error_handling() - 带错误处理")
    print("4. example_custom_settings() - 自定义设置")
    print()
    
    # 取消注释你想运行的示例
    
    # asyncio.run(example_basic())
    # asyncio.run(example_with_browser_visible())
    # asyncio.run(example_with_error_handling())
    # asyncio.run(example_custom_settings())
    
    print("\n请取消注释你想运行的示例，然后重新运行脚本")
    print("修改URL为实际的贴吧用户主页URL")


if __name__ == '__main__':
    main()