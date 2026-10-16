# -*- coding: utf-8 -*-
"""代码壳/数据包拆分 v2：
巨型 module 块（第 9–143 行）重构为：
  module#1 = 库解码/导入头部（含顶层 await）+ 末尾置 __libsReady__
  数据语句 → data/__X__.js（defer 经典脚本，按原顺序执行）
  块内零散语句 → data/_frag_N.js（defer，保持相对顺序）
执行序保证：helpers(解析期内联) → module#1 开始(遇 await 让出) → data/frags 依序
→ module#1 await 落定后置 libsReady → 后续模块轮询 libsReady 才动 THREE。
"""
import os, re, sys

WORK = os.path.dirname(os.path.abspath(__file__))

KEYS = [
    '__RELIEF_URL__', '__DISP_URL__', '__NORMAL_URL__', '__BG_URL__', '__SKY_URL__',
    '__BIN__', '__MYTHS__', '__RELATIONS__', '__EVENTS__', '__CONCEPTS__',
    '__TERRAINS__', '__SEAS__', '__HIRES__', '__HIRES_URLS__', '__COAST_B64__',
    '__TILES__', '__TILE_B64__', '__HIRES2__', '__HIRES2_B64__', '__RELIEF_SHADER__',
    '__DEEP__', '__MYTH_SYS__', '__RIVERS__', '__TERRAIN_B64__', '__SEAFLOOR__',
]
KEYSET = set(KEYS)
RE_DATA = re.compile(r'^globalThis\.(__[A-Z0-9_]+__)\s*=\s*')

HELPERS = ('<script>globalThis.__b=(s)=>{const t=atob(s);const a=new Uint8Array(t.length);'
           'for(let i=0;i<t.length;i++)a[i]=t.charCodeAt(i);return a;};'
           'globalThis.__mk=(b,t)=>URL.createObjectURL(new Blob([b],{type:t}));</script>')

VARIANTS = [('bare', 'v_bare.html'), ('hist', 'v_hist.html'), ('full', 'v_full.html')]

only = sys.argv[1] if len(sys.argv) > 1 else None

for name, src in VARIANTS:
    if only and name != only:
        continue
    outdir = os.path.join(WORK, 'out', name)
    datadir = os.path.join(outdir, 'data')
    os.makedirs(datadir, exist_ok=True)
    found = {}
    frags = []
    frag_buf = []
    state = 'copy'          # copy -> head（module#1 头部缓冲）-> tail（数据/碎片）
    head_buf = []
    src_path = os.path.join(WORK, src)
    dst_path = os.path.join(outdir, 'program.html')

    def flush_frag(fout):
        global frag_buf
        body = ''.join(frag_buf)
        frag_buf = []
        if not body.strip():
            return
        fn = '_frag_%d.js' % (len(frags) + 1)
        with open(os.path.join(datadir, fn), 'w', encoding='utf-8', newline='') as fd:
            fd.write(body)
        frags.append(fn)
        fout.write('<script src="data/%s" defer></script>\n' % fn)

    with open(src_path, 'r', encoding='utf-8') as fin, \
         open(dst_path, 'w', encoding='utf-8', newline='') as fout:
        it = iter(fin)
        for line in it:
            if state == 'copy':
                if line.strip() == '<script type="module">' and not found and not frags and state != 'done':
                    state = 'head'
                    head_buf = [line]
                else:
                    fout.write(line)
                continue
            m = RE_DATA.match(line)
            is_data = m and m.group(1) in KEYSET
            if state == 'head':
                if is_data:
                    # 关闭 module#1：库头部 + await 落定后的就绪旗标
                    for hl in head_buf:
                        fout.write(hl)
                    fout.write('globalThis.__libsReady__ = true;\n</script>\n')
                    fout.write(HELPERS + '\n')
                    state = 'tail'
                else:
                    assert line.strip() != '</script>', 'module#1 头部提前闭合'
                    head_buf.append(line)
                    continue
            if state == 'tail' and not is_data:
                if '__libsReady__' in line:
                    continue  # 原位置的就绪旗标由 module#1 尾部接管
                if line.strip() == '</script>':
                    flush_frag(fout)
                    state = 'copy'
                    continue  # 块已被 module#1 闭合，原生闭合标签丢弃
                frag_buf.append(line)
                continue
            if is_data:
                key = m.group(1)
                assert key not in found, '重复注入点 ' + key
                parts = [line]
                while not parts[-1].rstrip('\r\n').endswith(';'):
                    parts.append(next(it))
                    assert len(parts) < 10000, key + ' 语句过长未闭合'
                blob = ''.join(parts)
                assert '</script' not in blob.lower(), key + ' 含 </script'
                with open(os.path.join(datadir, key + '.js'), 'w', encoding='utf-8', newline='') as fd:
                    fd.write(blob)
                if state == 'tail':
                    flush_frag(fout)
                fout.write('<script src="data/%s.js" defer></script>\n' % key)
                found[key] = len(blob)
                continue
            fout.write(line)

    missing = [k for k in KEYS if k not in found]
    print('=== %s: 数据块 %d 个 %.1f MB，碎片 %d 个，壳 %.1f MB' % (
        name, len(found), sum(found.values()) / 1048576, len(frags),
        os.path.getsize(dst_path) / 1048576))
    if missing:
        print('  !! 未找到:', missing)
print('拆分完成')
