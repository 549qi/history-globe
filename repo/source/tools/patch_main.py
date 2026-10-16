# -*- coding: utf-8 -*-
"""
【2026-10-15 · 主程序手术 patch_main.py】
A. YEAR_LIST 增加 220 / 280 节点（配合 fix_data.py 新增的年份包）
B. NAMES 修正：Han→东汉；Jin→晋朝（原误标「金」）；补 Great Jin/Western Jin/Jinhan
C. 三国条目错字与时代错误修正（曹魏/蜀汉/孙吴）
D. 台湾历代管理机构可点标签系统（TW_AGENCIES）
E. 重嵌新版 __BIN__ 数据
每个替换都断言唯一锚点，失败即停。
"""
import io, json, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PATH = 'main.html'
s = io.open(PATH, encoding='utf-8').read()
orig_len = len(s)

def rep(old, new, tag, expect=1):
    global s
    n = s.count(old)
    if n != expect:
        sys.exit('锚点失败 [%s]：期望 %d 处，实际 %d 处' % (tag, expect, n))
    s = s.replace(old, new)
    print('OK', tag)

# ---------- A. YEAR_LIST ----------
rep('const YEAR_LIST = [50, 100, 150, 200, 250, 300,',
    'const YEAR_LIST = [50, 100, 150, 200, 220, 250, 280, 300,',
    'A: YEAR_LIST +220/280')

# ---------- B. NAMES ----------
rep('"Han":{"cn":"汉人","desc":"汉朝的官方族称，后演变为对中原居民的泛称"}',
    '"Han":{"cn":"东汉","desc":"25至220年刘秀重建的汉朝，定都洛阳，史称东汉；末年群雄并起，终至三国鼎立"}',
    'B1: Han→东汉')
rep('"Jin":{"cn":"金","desc":"女真族建立的金朝，1115至1234年，与南宋南北对峙"}',
    '"Jin":{"cn":"晋朝","desc":"265年司马炎代魏建晋，280年灭吴一统；316年西晋亡，317年司马睿于建康重建，史称东晋"},'
    '"Great Jin":{"cn":"金朝","desc":"女真族建立的金朝，1115至1234年，与南宋南北对峙"},'
    '"Western Jin":{"cn":"西晋","desc":"265年司马炎代魏所建，280年灭吴一统天下，316年亡于匈奴汉赵"},'
    '"Jinhan":{"cn":"辰韩","desc":"公元前2世纪至4世纪朝鲜半岛南部的三韩部落联盟之一"}',
    'B2: Jin→晋朝 + 补三条')

# ---------- C. 三国条目 ----------
rep('曹操（ posthumous 武皇帝，未称帝）', '曹操（魏武帝·追尊）', 'C1: 曹魏rulers')
rep('《谶记》《古 certifications》等影响一时', '《谶记》等古谶书影响一时', 'C2: 蜀汉customs')
rep('"世族 dominance ugh"', '"世族领兵制"', 'C3: 孙吴institutions')
rep('建安文学为后世宗法，三曹与建安七子开创慷慨悲凉的建安风骨；玄学兴起（何晏、王弼倡「贵无」），奠定魏晋玄学传统；龙门石窟始凿于北魏，佛教大规模传入中原。书法以钟繇、卫铄为宗，影响隋唐楷书。',
    '建安文学为后世宗法，三曹与建安七子开创慷慨悲凉的建安风骨；正始年间玄学兴起，何晏、王弼倡「贵无」，开魏晋玄学之先。书法以钟繇为宗，其楷书影响及于隋唐。',
    'C4: 曹魏culture（龙门石窟为北魏事，删）')
rep('蜀学承汉代经学，谯周、许劭辈注经立说。佛教首次大规模传入并建寺立塔（成都、大邑）。绘画以张僧繇为名，山水画与人物画渐兴。',
    '蜀学承汉代经学传统，谯周精研经史、著《古史考》，为蜀地学术代表。诸葛亮治蜀立法清明，《出师表》传为千古名篇。蜀锦织造冠绝一时，成都因此别称锦官城。',
    'C5: 蜀汉culture（张僧繇为南朝梁人，改）')
rep('玄学于江南鼎盛（王弼、嵇康）。葛洪著《抱朴子》，炼丹与医药并行。陶弘景《本草经集注》为药物学集大成。佛教南传，山中建寺，道教亦兴。',
    '中原士风随南渡士人播于江东，韦昭、阚泽等整理经史，韦昭《国语注》传世。康僧会自交趾北上建业译经建寺，为江南佛寺之始。造船与航海发达，230年卫温、诸葛直率船队浮海至夷洲，留下大陆与台湾通航的最早文献记录。',
    'C6: 孙吴culture（葛洪东晋、陶弘景南朝，改）')

# ---------- D. 台湾管理机构标签 ----------
AGENCY_DATA = '''
/* ================= 台湾历代管理机构标签（2026-10-15）=================
   台澎地区历代治理机构：不是独立势力，而是贴在版图上的「机构标签」。
   台湾岛的多边形已并入对应王朝势力（见年份包），点击版图仍整体抬升；
   这些标签只是地理位置上的可点注记，点击弹出机构的来历/职责/意义。 */
const TW_AGENCIES = [
  { id:'ph_yuan', name:'澎湖巡检司（元）', lon:119.62, lat:23.57, from:1281, to:1368,
    dynasty:'元朝', span:'约1281年（至元十八年）置 — 元末',
    seat:'澎湖列岛（隶江浙等处行中书省泉州路）',
    origin:'宋元之际澎湖已有汉人渔民居留。元廷为经略东南海疆，于至元年间在澎湖设巡检司，是中原王朝在台澎地区设立的第一个常设行政机构。',
    duty:'掌管澎湖列岛户籍、治安与海防巡查，兼理渔课；商船渔民经澎湖往来台湾海峡者，皆在其管辖之下。',
    meaning:'标志着中央政权对台澎地区的管辖走向制度化，为后世明清在台澎设治开了先河。' },
  { id:'ph_ming', name:'澎湖巡检司（明）', lon:119.62, lat:23.57, from:1563, to:1622,
    dynasty:'明朝', span:'1563年（嘉靖四十二年）复设 — 1622年',
    seat:'澎湖列岛（隶福建泉州府）',
    origin:'明初曾沿元制设澎湖巡检司，洪武年间徙民废司；嘉靖间倭患日亟，1563年复设，以固海防。',
    duty:'专司海防巡查、缉捕倭寇海盗，管理入籍渔户，哨守台湾海峡要冲。',
    meaning:'明代经略台澎海疆的直接见证；1622年荷兰人占据澎湖后裁撤，1624年明军收复澎湖、荷人退往台湾南部。' },
  { id:'tungning', name:'承天府（明郑）', lon:120.20, lat:23.00, from:1661, to:1683,
    dynasty:'明郑（郑氏政权）', span:'1661年 — 1683年',
    seat:'承天府（今台南），下辖天兴、万年二县',
    origin:'1661年郑成功驱逐荷兰人、收复台湾，设承天府为全台行政中心，奉明正朔；郑经嗣位后改称东宁。',
    duty:'统理全台民政、屯垦与市易，行保甲、设学校、课农桑，建立起完整的郡县式治理。',
    meaning:'台湾历史上第一个汉人政权建制，奠定了台湾汉人社会的制度与文化基础。' },
  { id:'tw_fu', name:'台湾府（清）', lon:120.20, lat:23.00, from:1684, to:1885,
    dynasty:'清朝', span:'1684年（康熙二十三年）— 1885年',
    seat:'台湾府城（今台南），初辖台湾、凤山、诸罗三县，后陆续增设',
    origin:'1683年施琅平台，康熙决意留台，次年设台湾府，隶属福建省，台湾正式纳入清朝版图与郡县体系。',
    duty:'统辖全台民政、司法与财税，管理番界与屯垦，后期兼理通商口岸事务。',
    meaning:'台湾自此与内地行同样的府县制度，二百年间移民垦殖、市镇兴起，社会日渐内地化。' },
  { id:'tw_prov', name:'台湾省（清）', lon:120.90, lat:24.15, from:1885, to:1895,
    dynasty:'清朝', span:'1885年（光绪十一年）— 1895年',
    seat:'省会驻台湾府（后规划移驻台中），首任巡抚刘铭传',
    origin:'中法战争后清廷痛感台湾海防之重，1885年下诏台湾建省，脱离福建单列一行省。',
    duty:'总揽全台军政民政；刘铭传任内修筑铁路、架设电报、开办新式学堂与机器局，推行清赋与番政改革。',
    meaning:'台湾成为中国最年轻行省，近代化建设一度领先全国；1895年《马关条约》割让予日本。' },
];
function findAgencyAt(lon, lat){
  if(typeof camera === 'undefined' || !camera) return null;
  if(camera.position.length() > 2.6) return null;   /* 拉远时不抢点击，避免误触 */
  const cosLat = Math.cos(lat * Math.PI / 180);
  let best = null, bd = 1.6 * 1.6;
  for(const ag of TW_AGENCIES){
    if(curYear < ag.from || curYear > ag.to) continue;
    const dx = (ag.lon - lon) * cosLat, dy = ag.lat - lat;
    const d2 = dx * dx + dy * dy;
    if(d2 < bd){ bd = d2; best = ag; }
  }
  return best;
}
'''
rep('/* ================= 年份 & 势力判定 ================= */',
    AGENCY_DATA + '\n/* ================= 年份 & 势力判定 ================= */',
    'D1: TW_AGENCIES 数据 + findAgencyAt')

# D2: 标签绘制函数（插到 lblSignature 前）
DRAW_FN = '''
/* 台湾机构标签：走与普通标签相同的位图缓存 + 精灵管线，颜色用赭金以区别于势力名 */
function drawAgencyLabels(W, H, deg2px, boxes, inkRef){
  if(!polityLayerOn) return;
  const camD = camera.position.length();
  if(camD > 2.6) return;                 /* 全景不标，避免与势力名叠字 */
  for(const ag of TW_AGENCIES){
    if(curYear < ag.from || curYear > ag.to) continue;
    const p = lonLatToScreen(ag.lon, ag.lat, _sp,
      Math.min(LBL_R_POLITY, terraRadius(ag.lon, ag.lat) + BORDER_LIFT));
    if(!p) continue;
    if(p.x < -60 || p.x > W + 60 || p.y < -30 || p.y > H + 30) continue;
    const fs = Math.max(9.5, Math.min(12.5, 10 + (2.6 - camD) * 1.5));
    const w = __labelTextW(ag.name, 'polity', fs);
    const box = [p.x - w/2 - 2, p.y - fs * 0.65, p.x + w/2 + 2, p.y + fs * 0.65];
    let clash = false;
    for(const b of boxes){
      if(box[0] < b[2]-1 && box[2] > b[0]+1 && box[1] < b[3]-1 && box[3] > b[1]+1){ clash = true; break; }
    }
    if(clash) continue;
    boxes.push(box);
    inkRef.n += (box[2]-box[0]) * (box[3]-box[1]);
    if(inkRef.n > inkRef.max) break;
    const spr = __labelBitmap(ag.name, 'polity', fs,
      { w: Math.max(3, fs * 0.30), c: 'rgba(255,250,238,0.95)' },
      { w: 1.2,                    c: 'rgba(84,52,10,0.55)' },
      'rgba(146,84,14,0.97)');
    __lblDraw(spr, p.x, p.y);
  }
}

function lblSignature(){'''
rep('function lblSignature(){', DRAW_FN, 'D2: drawAgencyLabels 函数')

# D3: 在 drawScreenLabels 里调用（河流之后）
rep("drawRiverLabels(W, H, deg2px, lblBoxes, { n:0, max:inkAll * 0.12 });",
    "drawRiverLabels(W, H, deg2px, lblBoxes, { n:0, max:inkAll * 0.12 });\n  drawAgencyLabels(W, H, deg2px, lblBoxes, { n:0, max:inkAll * 0.06 });",
    'D3: drawScreenLabels 调用')

# D4: 点击 —— 机构优先于势力
OLD_CLICK = """  const __hitF = findPolityAt(hit.lon, hit.lat);
  if(__hitF){ selectByName(nameCN(__hitF.n), __hitF.n); }
  else if(curYear < 50){
    const nf = nearestPreFeatureAt(hit.lon, hit.lat, 9);
    if(nf){ selectByName(nameCN(nf.n), nf.n); }
    else { const sp = sphereAt(hit.lon, hit.lat); if(sp) selectByName(sp.cn, ''); }
  }"""
NEW_CLICK = """  const __hitAg = findAgencyAt(hit.lon, hit.lat);
  if(__hitAg){ if(globalThis.__openAgency) globalThis.__openAgency(__hitAg); }
  else {
  const __hitF = findPolityAt(hit.lon, hit.lat);
  if(__hitF){ selectByName(nameCN(__hitF.n), __hitF.n); }
  else if(curYear < 50){
    const nf = nearestPreFeatureAt(hit.lon, hit.lat, 9);
    if(nf){ selectByName(nameCN(nf.n), nf.n); }
    else { const sp = sphereAt(hit.lon, hit.lat); if(sp) selectByName(sp.cn, ''); }
  }
  }"""
rep(OLD_CLICK, NEW_CLICK, 'D4: 点击优先机构')

# D5: 悬停 —— 机构名
OLD_HOVER = """  let label = '';
  const __hvF = findPolityAt(hit.lon, hit.lat);
  if(__hvF){ label = nameCN(__hvF.n); }
  else if(curYear < 50){
    const nf = nearestPreFeatureAt(hit.lon, hit.lat, 9);
    if(nf) label = nameCN(nf.n);
    else { const sp = sphereAt(hit.lon, hit.lat); if(sp) label = sp.cn; }
  }"""
NEW_HOVER = """  let label = '';
  const __hvAg = findAgencyAt(hit.lon, hit.lat);
  if(__hvAg){ label = __hvAg.name; }
  else {
  const __hvF = findPolityAt(hit.lon, hit.lat);
  if(__hvF){ label = nameCN(__hvF.n); }
  else if(curYear < 50){
    const nf = nearestPreFeatureAt(hit.lon, hit.lat, 9);
    if(nf) label = nameCN(nf.n);
    else { const sp = sphereAt(hit.lon, hit.lat); if(sp) label = sp.cn; }
  }
  }"""
rep(OLD_HOVER, NEW_HOVER, 'D5: 悬停显示机构名')

# D6: 侧栏面板 openAgency（插在 openPolity 前，同闭包可用 push/esc/kwLink 等）
OPEN_AG = """  function openAgency(ag){
    push({ t:'agency', name: ag.name });
    let h = '<div class="sec"><h4>' + esc(ag.name) + '</h4>' +
      '<p style="color:var(--ink-faint)">' + esc(ag.dynasty) + ' · ' + esc(ag.span) + '</p></div>';
    const rows = [['驻地', ag.seat], ['来历', ag.origin], ['职责', ag.duty], ['意义', ag.meaning]];
    for(const [t, v] of rows){
      if(v) h += '<div class="sec"><h4>' + t + '</h4><p>' + kwLink(esc(v)) + '</p></div>';
    }
    h += '<div class="sec"><p style="color:var(--ink-faint);font-size:12px">' +
      '台湾岛的版图已并入对应朝代，点击该朝代版图即可整体查看；此标签为治理机构注记，不是独立势力。</p></div>';
    detailEl.innerHTML = h;
    wireBack(); wireKw(); setSide(true);
  }
  globalThis.__openAgency = openAgency;

  function openPolity(name){ push({ t:'polity', name: name }); selectByName(name, ''); }"""
rep("  function openPolity(name){ push({ t:'polity', name: name }); selectByName(name, ''); }",
    OPEN_AG, 'D6: openAgency 面板')

# ---------- E. 重嵌 __BIN__ ----------
bin_src = io.open('out/hist/data/__BIN__.js', encoding='utf-8').read()
anchor = 'globalThis.__BIN__ = '
i = s.find(anchor)
if i < 0: sys.exit('找不到 __BIN__ 注入点')
j = s.find('\n', i)
old_line = s[i:j]
if len(old_line) < 1000000: sys.exit('__BIN__ 行异常短：%d' % len(old_line))
s = s[:i] + bin_src.rstrip('\n') + s[j:]
print('OK E: 重嵌 __BIN__（新行 %d MB，旧行 %d MB）' % (len(bin_src)//1048576, len(old_line)//1048576))

io.open(PATH, 'w', encoding='utf-8').write(s)
print('\n全部完成，%d → %d 字节' % (orig_len, len(s)))
