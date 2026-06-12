#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试不同的URL格式
"""

import urllib.request
import urllib.parse
import urllib.error
import sys
import io
import re

# 设置标准输出编码为UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 读取Cookie
with open('cookie.txt', 'r', encoding='utf-8') as f:
    cookie = f.read().strip()

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Connection': 'keep-alive',
    'Cookie': cookie
}

# 测试不同的URL格式
test_urls = [
    "https://tieba.baidu.com/home/main?id=tb.1.bb867dca.2uEpHNfJgVjgQ6kWzwJ-kg",
    "https://tieba.baidu.com/home/main?id=tb.1.bb867dca.2uEpHNfJgVjgQ6kWzwJ-kg&fr=personalize_page",
    "https://tieba.baidu.com/home/main?un=test_user",  # 通用格式示例
    "https://tieba.baidu.com/home/main?ie=utf-8&id=tb.1.bb867dca.2uEpHNfJgVjgQ6kWzwJ-kg"
]

for i, test_url in enumerate(test_urls, 1):
    print(f"\n{'='*60}")
    print(f"测试URL #{i}: {test_url}")
    print(f"{'='*60}")
    
    try:
        req = urllib.request.Request(test_url, headers=headers)
        
        with urllib.request.urlopen(req, timeout=10) as response:
            final_url = response.geturl()
            status = response.status
            content = response.read()
            
            print(f"状态码: {status}")
            print(f"最终URL: {final_url}")
            print(f"内容长度: {len(content)} 字节")
            
            # 解码
            try:
                html = content.decode('utf-8')
            except:
                html = content.decode('gbk')
            
            # 检查页面标题
            title_match = re.search(r'<title>(.*?)</title>', html)
            title = title_match.group(1) if title_match else "未知"
            print(f"页面标题: {title}")
            
            # 查找不同格式的帖子链接
            post_patterns = [
                r'href=["\']([^"\']*?/p/\d+[^"\']*)["\']',  # 标准格式
                r'href=["\']([^"\']*?tieba\.baidu\.com/p/\d+[^"\']*)["\']',  # 完整URL
                r'/p/(\d{6,})',  # 只是ID
            ]
            
            total_links = set()
            for pattern in post_patterns:
                matches = re.findall(pattern, html)
                if isinstance(matches[0], tuple) if matches else False:
                    matches = [m[0] for m in matches]
                
                for match in matches:
                    if isinstance(match, str) and '/p/' in match:
                        full_url = urllib.parse.urljoin('https://tieba.baidu.com', match)
                        total_links.add(full_url)
            
            print(f"找到 {len(total_links)} 个帖子链接")
            
            if len(total_links) > 0:
                print(f"前3个链接:")
                for j, link in enumerate(list(total_links)[:3], 1):
                    print(f"  {j}. {link}")
                print("[SUCCESS] 这个URL格式有效!")
                break
            else:
                print("[WARNING] 没有找到帖子链接")
                
    except Exception as e:
        print(f"[ERROR] {e}")

print(f"\n{'='*60}")
print("测试完成")
print(f"{'='*60}")