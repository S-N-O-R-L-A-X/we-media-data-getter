#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试重定向问题 - 修复编码版本
"""

import urllib.request
import urllib.parse
import urllib.error
import sys
import io

# 设置标准输出编码为UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 读取Cookie
with open('cookie.txt', 'r', encoding='utf-8') as f:
    cookie = f.read().strip()

print(f"Cookie长度: {len(cookie)}")

# 测试URL
test_url = "https://tieba.baidu.com/home/main?id=tb.1.bb867dca.2uEpHNfJgVjgQ6kWzwJ-kg&fr=personalize_page"

# 创建重定向处理器
class RedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self):
        self.redirect_count = 0
        self.max_redirects = 10
        
    def http_error_302(self, req, fp, code, msg, headers):
        self.redirect_count += 1
        print(f"重定向 #{self.redirect_count}: {headers.get('Location', '未知')}")
        
        if self.redirect_count > self.max_redirects:
            raise urllib.error.HTTPError(req.get_full_url(), code, msg, headers, fp)
            
        return urllib.request.HTTPRedirectHandler.http_error_302(self, req, fp, code, msg, headers)

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
    # 创建自定义opener
    redirect_handler = RedirectHandler()
    opener = urllib.request.build_opener(redirect_handler)
    
    req = urllib.request.Request(test_url, headers=headers)
    print("发送请求...")
    
    response = opener.open(req, timeout=10)
    
    print(f"\n[OK] 请求成功!")
    print(f"最终URL: {response.geturl()}")
    print(f"状态码: {response.status}")
    print(f"重定向次数: {redirect_handler.redirect_count}")
    
    content = response.read()
    print(f"内容长度: {len(content)} 字节")
    
    # 尝试解码
    try:
        html = content.decode('utf-8')
        print(f"[OK] UTF-8解码成功")
    except:
        try:
            html = content.decode('gbk')
            print(f"[OK] GBK解码成功")
        except:
            html = content.decode('utf-8', errors='ignore')
            print(f"[WARNING] 解码有问题，使用ignore模式")
    
    # 检查是否包含帖子链接
    import re
    post_links = re.findall(r'href=["\']([^"\']*?/p/\d{6,}[^"\']*)["\']', html)
    print(f"\n找到 {len(post_links)} 个帖子链接")
    
    if len(post_links) > 0:
        print(f"[SUCCESS] Cookie有效！成功获取到帖子链接")
        print(f"前3个链接:")
        for i, link in enumerate(post_links[:3], 1):
            full_url = urllib.parse.urljoin('https://tieba.baidu.com', link)
            print(f"  {i}. {full_url}")
    else:
        print(f"[WARNING] 没有找到帖子链接")
        # 保存HTML用于调试
        with open('debug.html', 'w', encoding='utf-8', errors='ignore') as f:
            f.write(html[:5000])  # 只保存前5000字符
        print(f"已保存HTML前5000字符到 debug.html")
        
except urllib.error.HTTPError as e:
    print(f"[ERROR] HTTP错误: {e.code} {e.reason}")
except urllib.error.URLError as e:
    print(f"[ERROR] 网络错误: {e.reason}")
except Exception as e:
    print(f"[ERROR] 错误: {e}")
    import traceback
    traceback.print_exc()

print("\n测试完成")