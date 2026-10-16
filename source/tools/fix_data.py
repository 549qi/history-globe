# -*- coding: utf-8 -*-
"""
【2026-10-15 · 台湾版图 + 三国节点数据手术】
1. 台湾岛多边形（取自 1450 包 34 点本岛轮廓）并入各年份对应的王朝势力，
   删除台湾 bbox 内的 Unknown/Taiwan/Taiwanese Tribes 等占位势力；
2. 1400 年包：中国主体势力 Great Khanate → Ming Dynasty（1400 为明建文二年，
   数据源误标），并补台湾；
3. 新增 220 节点（=250 包副本，三国开始）与 280 节点（=300 包副本，西晋灭吴一统），
   解决 220~249 年地图仍显示「汉」的问题；
4. 1650 保持现状（荷兰据台为史实），1750 清已含台湾不重复处理。
写回 out/hist/data/__BIN__.js 后自验。
"""
import json, struct, sys, io, base64, copy
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PATH = 'out/hist/data/__BIN__.js'
s = open(PATH, encoding='utf-8').read()
head, tail = s[:s.index('{')], s[s.rindex('}')+1:]
BIN = json.loads(s[s.index('{'):s.rindex('}')+1])

TW_BBOX = (119.5, 122.5, 21.5, 25.5)   # lon0 lon1 lat0 lat1

def parse(raw):
    assert raw[:4] == b'EMPR'
    year, nfeat = struct.unpack_from('<ii', raw, 4)
    off = 12
    feats = []
    for _ in range(nfeat):
        nl = struct.unpack_from('<H', raw, off)[0]; off += 2
        name = raw[off:off+nl].decode('utf-8'); off += nl
        area, = struct.unpack_from('<f', raw, off); off += 4
        cx, cy = struct.unpack_from('<HH', raw, off); off += 4
        npoly, = struct.unpack_from('<H', raw, off); off += 2
        polys = []
        for _ in range(npoly):
            nr, = struct.unpack_from('<H', raw, off); off += 2
            rings = []
            for _ in range(nr):
                npt, = struct.unpack_from('<H', raw, off); off += 2
                pts = []
                ax = ay = 0
                for _ in range(npt):
                    dx, dy = struct.unpack_from('<hh', raw, off); off += 4
                    ax += dx; ay += dy
                    pts.append((ax, ay))          # 保持整数坐标（×100）
                rings.append(pts)
            polys.append(rings)
        feats.append({'name': name, 'area': area, 'cx': cx, 'cy': cy, 'polys': polys})
    return year, feats

def encode(year, feats):
    out = io.BytesIO()
    out.write(b'EMPR')
    out.write(struct.pack('<ii', year, len(feats)))
    for f in feats:
        nb = f['name'].encode('utf-8')
        out.write(struct.pack('<H', len(nb))); out.write(nb)
        out.write(struct.pack('<f', f['area']))
        out.write(struct.pack('<HH', f['cx'], f['cy']))
        out.write(struct.pack('<H', len(f['polys'])))
        for rings in f['polys']:
            out.write(struct.pack('<H', len(rings)))
            for pts in rings:
                out.write(struct.pack('<H', len(pts)))
                ax = ay = 0
                for x, y in pts:
                    out.write(struct.pack('<hh', x - ax, y - ay))
                    ax, ay = x, y
    return out.getvalue()

def poly_area(pts):
    a = 0
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[(i+1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0 / 10000.0   # 回到度²量级

def in_tw_bbox(polys):
    for rings in polys:
        for x, y in [p for ring in rings for p in ring]:
            lon, lat = x / 100.0, y / 100.0
            if not (TW_BBOX[0] <= lon <= TW_BBOX[1] and TW_BBOX[2] <= lat <= TW_BBOX[3]):
                return False
    return True

# ---- 取 1450 的 34 点台湾多边形 ----
_, f1450 = parse(base64.b64decode(BIN['1450']))
tw_poly = None
for f in f1450:
    if f['name'] == 'Taiwan':
        for rings in f['polys']:
            pts = rings[0]
            if len(pts) == 34:
                tw_poly = copy.deepcopy(rings)
if not tw_poly:
    sys.exit('未找到 1450 的 34 点台湾多边形')
TW_AREA = poly_area(tw_poly[0])
print('台湾多边形 OK，面积（度²）≈ %.2f' % TW_AREA)

# ---- 年份 → 目标王朝名（1400 特殊：改名） ----
MERGE = {
    1200: 'Song Empire', 1400: 'Ming Dynasty', 1250: 'Southern Song',
    1300: 'Great Khanate', 1350: 'Yuan Dynasty',
    1450: 'Ming Dynasty', 1492: 'Ming Empire', 1500: 'Ming Chinese Empire',
    1530: 'Ming Chinese Empire', 1550: 'Ming Dynasty', 1600: 'Ming Chinese Empire',
    1700: 'Manchu Empire', 1715: 'Manchu Empire',
    1783: 'Qing Empire', 1800: 'Qing Empire', 1815: 'Manchu Empire',
}
SKIP = {1650, 1750}

report = []
newBIN = dict(BIN)

for ykey in list(newBIN.keys()):
    y = int(ykey)
    year, feats = parse(base64.b64decode(newBIN[ykey]))
    changed = False

    if y == 1400:
        for f in feats:
            if f['name'] == 'Great Khanate':
                f['name'] = 'Ming Dynasty'
                changed = True
                report.append('1400: Great Khanate → Ming Dynasty')

    if y in MERGE:
        target = MERGE[y]
        # 1) 删除台湾 bbox 内势力
        kept, removed = [], []
        for f in feats:
            if f['polys'] and in_tw_bbox(f['polys']):
                removed.append(f['name'])
            else:
                kept.append(f)
        # 2) 找目标势力并追加台湾
        hit = None
        for f in kept:
            if f['name'] == target:
                hit = f; break
        if hit is None:
            # 目标势力不存在：用台湾多边形新建
            xs = [p[0] for p in tw_poly[0]]; ys = [p[1] for p in tw_poly[0]]
            hit = {'name': target, 'area': TW_AREA,
                   'cx': int(sum(xs)/len(xs)) & 0xFFFF, 'cy': int(sum(ys)/len(ys)) & 0xFFFF,
                   'polys': []}
            kept.append(hit)
            report.append('%d: 新建势力 %s' % (y, target))
        hit['polys'].append(copy.deepcopy(tw_poly))
        hit['area'] += TW_AREA
        feats = kept
        changed = True
        report.append('%d: 删 %s；台湾 → %s' % (y, '、'.join(sorted(set(removed))) or '无', target))

    if changed:
        newBIN[ykey] = base64.b64encode(encode(y, feats)).decode('ascii')

# ---- 新增 220 / 280 节点 ----
newBIN['220'] = newBIN['250']
newBIN['280'] = newBIN['300']
report.append('新增节点 220（=250 三国）、280（=300 西晋一统）')

out = head + json.dumps(newBIN, ensure_ascii=False, separators=(',', ':')) + tail
open(PATH, 'w', encoding='utf-8').write(out)
print('已写回 %s（%d 键）' % (PATH, len(newBIN)))
for r in report: print(' -', r)

# ================= 自验 =================
print('\n== 自验 ==')
def pip(pt, ring):
    x, y = pt; inside = False; j = len(ring)-1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj-xi)*(y-yi)/(yj-yi)+xi:
            inside = not inside
        j = i
    return inside

def who(y, lon, lat):
    _, feats = parse(base64.b64decode(newBIN[str(y)]))
    pt = (int(lon*100), int(lat*100))
    hits = []
    for f in feats:
        for rings in f['polys']:
            if pip(pt, rings[0]) and not any(pip(pt, h) for h in rings[1:]):
                hits.append(f['name']); break
    return hits

ok = True
for y, expect in [(1200,'Song Empire'),(1250,'Southern Song'),(1300,'Great Khanate'),
                  (1350,'Yuan Dynasty'),(1400,'Ming Dynasty'),(1450,'Ming Dynasty'),
                  (1492,'Ming Empire'),(1500,'Ming Chinese Empire'),(1530,'Ming Chinese Empire'),
                  (1550,'Ming Dynasty'),(1600,'Ming Chinese Empire'),(1700,'Manchu Empire'),
                  (1715,'Manchu Empire'),(1750,'Qing Dynasty'),(1783,'Qing Empire'),
                  (1800,'Qing Empire'),(1815,'Manchu Empire')]:
    got = who(y, 120.9, 23.7)
    good = expect in got
    ok = ok and good
    print('  %d 台湾中心 => %s %s' % (y, got, '✓' if good else '✗ 期望 ' + expect))
# 1650 应保持荷兰
print('  1650 台湾中心 =>', who(1650, 120.9, 23.7), '（应含 Dutch Formosa 或 Unknown）')
# 三国点
for y, pt, exp in [(220, (112.5,34.6), 'Cao Wei'), (220, (104.1,30.7), 'Shu Han'),
                   (220, (118.8,32.1), 'Eastern Wu'), (280, (118.8,32.1), 'Jin')]:
    got = who(y, *pt)
    good = exp in got
    ok = ok and good
    print('  %d %s => %s %s' % (y, pt, got, '✓' if good else '✗'))
print('自验', '全部通过' if ok else '存在失败！')
