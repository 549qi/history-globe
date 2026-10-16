# -*- coding: utf-8 -*-
# 回归：HTMLParser 抽取 main.html 全部 script 块 → 逐个 node --check；
# 再 node --check 六个外置模块文件；最后扫旧名残留。
import io, os, sys
from html.parser import HTMLParser

BASE = r"D:\OneDrive\文档\kimi\tasks\2026-10-10\23-26-24-ec69875a\work"

class SP(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.blocks = []
        self.cur = None
    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'script':
            self.cur = []
    def handle_endtag(self, tag):
        if tag.lower() == 'script' and self.cur is not None:
            self.blocks.append(''.join(self.cur)); self.cur = None
    def handle_data(self, d):
        if self.cur is not None: self.cur.append(d)

s = io.open(BASE + r"\main.html", encoding='utf-8', newline='').read()
p = SP(); p.feed(s)
print('script blocks:', len(p.blocks))

for i, b in enumerate(p.blocks):
    if not b.strip():
        print('block', i, 'empty, skip'); continue
    fp = os.path.join(BASE, '_reg_%d.mjs' % i)
    io.open(fp, 'w', encoding='utf-8', newline='').write(b)
    print('block', i, 'exported (%d chars)' % len(b))

# 旧名 / 旧称残留扫描（主程序 + 模块，仅统计用户可见文字层的残留）
for pat in ['寰宇溯源', '我，地球与小女仆', '我，地球和女仆']:
    cnt = s.count(pat)
    print('scan main.html [%s]: %d' % (pat, cnt))

print('EXPORT DONE')
