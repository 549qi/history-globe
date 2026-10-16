# -*- coding: utf-8 -*-
"""reembed_all: 把六个模块文件全部回嵌主程序 __V3_BUILTIN_SOURCES__（逐键替换整行）并 roundtrip 校验。"""
import io, sys, json

KEYS = [
    ('music', 'music.js'),
    ('pet', 'pet.js'),
    ('cn-history-plus', 'cn.js'),
    ('world-polity-plus', 'wpp.js'),
    ('myth-age-plus', 'myth.js'),
    ('map-forge', 'mapforge.js'),
]

src = io.open('main.html', 'r', encoding='utf-8', newline='').read()

for key, fn in KEYS:
    body = io.open(fn, 'r', encoding='utf-8', newline='').read()
    mark = "  '%s': " % key
    i0 = src.find(mark)
    if i0 < 0:
        print('FAIL: 键缺失 %s' % key); sys.exit(1)
    i1 = src.find('\n', i0)
    if i1 < 0:
        print('FAIL: 行尾 %s' % key); sys.exit(1)
    line = src[i0:i1]
    tail = ',' if line.rstrip().endswith(',') else ''
    payload = json.dumps(body, ensure_ascii=False).replace('<', '\\u003c')
    src = src[:i0] + mark + payload + tail + src[i1:]
    print('  %-18s <- %-12s (%d chars)%s' % (key, fn, len(body), tail))

io.open('main.html', 'w', encoding='utf-8', newline='').write(src)

# roundtrip 校验
chk = io.open('main.html', 'r', encoding='utf-8', newline='').read()
ok = True
for key, fn in KEYS:
    mark = "  '%s': " % key
    j0 = chk.find(mark)
    if j0 < 0:
        print('FAIL roundtrip: 键缺失 %s' % key); ok = False; continue
    j1 = chk.find('\n', j0)
    payload = chk[j0 + len(mark):j1].rstrip()
    if payload.endswith(','): payload = payload[:-1]
    body = io.open(fn, 'r', encoding='utf-8', newline='').read()
    same = json.loads(payload) == body
    print('  roundtrip %-18s %s' % (key, 'OK' if same else 'MISMATCH'))
    if not same: ok = False
if not ok:
    sys.exit(1)
print('reembed_all 完成')
