#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简单测试脚本 - 验证Cookie是否有效
"""

import urllib.request
import urllib.parse
import urllib.error

# 读取Cookie
with open('cookie.txt', 'r', encoding='utf-8') as f:
    cookie = f.read().strip()

print(f"Cookie长度: {len(cookie)}")
print(f"Cookie前50字符: {cookie[:50]}...")

# 测试URL
test_url = "https://tieba.baidu.com/home/main?id=tb.1.bb867dca.2uEpHNfJgVjgQ6kWzwJ-kg&fr=personalize_page"

# 设置请求头
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Connection': 'keep-alive',
    'Cookie': cookie
}

print(f"\n正在测试URL: {test_url}")

try:
    req = urllib.request.Request(test_url, headers=headers)
    print("发送请求...")
    
    with urllib.request.urlopen(req, timeout=10) as response:
        print(f"✓ 请求成功!")
        print(f"状态码: {response.status}")
        print(f"响应头: {response.headers}")
        
        content = response.read()
        print(f"内容长度: {len(content)} 字节")
        
        # 尝试解码
        try:
            html = content.decode('utf-8')
            print(f"✓ UTF-8解码成功")
        except:
            try:
                html = content.decode('gbk')
                print(f"✓ GBK解码成功")
            except:
                html = content.decode('utf-8', errors='ignore')
                print(f"⚠ 解码有问题，使用ignore模式")
        
        # 检查是否包含帖子链接
        import re
        post_links = re.findall(r'href=["\']([^"\']*?/p/\d{6,}[^"\']*)["\']', html)
        print(f"\n找到 {len(post_links)} 个帖子链接")
        
        if len(post_links) > 0:
            print(f"✓ Cookie有效！成功获取到帖子链接")
            print(f"前5个链接:")
            for i, link in enumerate(post_links[:5], 1):
                full_url = urllib.parse.urljoin('https://tieba.baidu.com', link)
                print(f"  {i}. {full_url}")
        else:
            print(f"⚠ 没有找到帖子链接，可能页面结构变化或Cookie无效")
            
except urllib.error.HTTPError as e:
    print(f"✗ HTTP错误: {e.code} {e.reason}")
    if e.code == 403:
        print("  Cookie可能无效或过期")
        
except urllib.error.URLError as e:
    print(f"✗ 网络错误: {e.reason}")
    
except Exception as e:
    print(f"✗ 错误: {e}")
    import traceback
    traceback.print_exc()

print("\n测试完成")