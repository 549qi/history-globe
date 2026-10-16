# -*- coding: utf-8 -*-
"""生成三个封包变体：
v_bare.html —— 纯净版：__V3_BUILTIN_SOURCES__ 置空
v_hist.html —— 历史版：只保留三个历史资料模块
v_full.html —— 完整版：六个模块全保留（即当前 main.html）
"""
import io, shutil

KEYS = ['music', 'pet', 'cn-history-plus', 'world-polity-plus', 'myth-age-plus', 'map-forge']
HIST = {'cn-history-plus', 'world-polity-plus', 'myth-age-plus'}

src = io.open('main.html', 'r', encoding='utf-8', newline='').read()

def variant(keep, out):
    s = src
    for key in KEYS:
        if key in keep:
            continue
        mark = "  '%s': " % key
        i0 = s.find(mark)
        assert i0 >= 0, key
        i1 = s.find('\n', i0)
        assert i1 > i0, key
        s = s[:i0] + s[i1 + 1:]
    # 若一个键都不剩，对象保持合法空字面量
    assert 'globalThis.__V3_BUILTIN_SOURCES__ = {' in s
    io.open(out, 'w', encoding='utf-8', newline='').write(s)
    print(out, len(s), 'chars, keys kept:', sorted(keep) if keep else '(无)')

variant(set(), 'v_bare.html')
variant(HIST, 'v_hist.html')
shutil.copyfile('main.html', 'v_full.html')
print('v_full.html 直接复制 main.html')
