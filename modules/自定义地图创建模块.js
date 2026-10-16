/* ===================== 00_head.js ===================== */
/* ==========================================================================
 * 《我，地图和小女仆》自定义模块 —— 自定义地图创建模块（MapForge）
 * id: map-forge
 * --------------------------------------------------------------------------
 * 作用：在宿主程序内新增一套「其他地图」系统。用户可创建与地球地图同类型的
 *      空白球体地图，用工具包（三支笔 / 势力笔 / 地形画笔 / 建模系统 / 标签）
 *      自由创作陆海、势力、地形与建模，并接入模块自建资料库与搜索。
 *
 * 与本程序的关系：平行世界。新地图的全部数据带 mapforge: 前缀独立存储，
 *      绝不与宿主地球资料库混写；不依赖 __V3DATA。
 *
 * 装载方式：随主程序内置、默认装配（设置 › 功能模块 里可卸下/再装上）；
 *      独立 .js 文件仅作源码备份与二次开发用，改动它不会影响程序内的内置副本。
 * ========================================================================== */

const __HOST = globalThis.__V3HOST;
if (!__HOST || !__HOST.U) {
  throw new Error('本模块需要在《我，地图和小女仆》宿主程序中装载（未找到 __V3HOST 运行时）。'
    + '请打开程序的「设置 › 功能模块」，把本文件拖进 ＋ 装配区。');
}

const MF_ID = 'map-forge';

/* ---------------------------------------------------------------- 常量 ---- */
const CFG = {
  /* 相机：与宿主地球地图保持一致（PerspectiveCamera(36,1,0.02,400)） */
  FOV: 36, NEAR: 0.02, FAR: 400,
  R: 1,                       // 球半径（世界单位），1 = 6371km
  KM_PER_R: 6371,             // 一个世界单位对应的公里数
  MAX_DIST: 26,               // 缩小上限：与宿主 controls.maxDistance 一致
  PX_PER_CM: 37.795,          // 96dpi 下 1cm 的 CSS 像素数
  KM_PER_CM: 1,               // ★ 放大上限指标：屏幕上 1cm 对应实际 1km
  /* 由上面两项推导的最小相机距离（到球心）：d ≈ 1 + H/156360，运行时按窗口高算 */
  /* 栅格分辨率（度/格）选项；0.02 是极限档（约 1.6 亿格，内存压力巨大，对话框里有警示） */
  GRID_RES: [0.5, 0.25, 0.1, 0.05, 0.02],
  GRID_RES_DEF: 0.25,
  /* 渲染球面网格分段（lon x lat）；越高越精细，GPU 压力越大 */
  SEG: [[512, 256], [768, 384], [1024, 512], [1536, 768]],
  SEG_DEF: 2,
  REGION: { 0: { n: '未定', c: '#efe7d2' }, 1: { n: '陆地', c: '#8fae66' }, 2: { n: '海洋', c: '#5b86b8' }, 3: { n: '其他', c: '#9a9a94' } },
  /* 内置地形调色板：name / color / 高度语义（米）/ 适用域 */
  TERRAIN_DEF: [
    { id: 't_plain', name: '平原', color: '#a8c47a', h: 60, kind: 'land' },
    { id: 't_grass', name: '草原', color: '#8fae66', h: 80, kind: 'land' },
    { id: 't_forest', name: '森林', color: '#4f7a45', h: 120, kind: 'land' },
    { id: 't_hill', name: '丘陵', color: '#9c8a5a', h: 320, kind: 'land' },
    { id: 't_mount', name: '山地', color: '#8a6a45', h: 900, kind: 'land' },
    { id: 't_alpine', name: '高山', color: '#6f5a48', h: 1800, kind: 'land' },
    { id: 't_peak', name: '雪峰', color: '#e8eef2', h: 3200, kind: 'land' },
    { id: 't_desert', name: '沙漠', color: '#d9bd7a', h: 100, kind: 'land' },
    { id: 't_swamp', name: '沼泽', color: '#6f8a72', h: 30, kind: 'land' },
    { id: 't_lake', name: '湖泊', color: '#6fa8c9', h: 20, kind: 'land' },
    { id: 't_shallow', name: '浅海', color: '#7fb2d6', h: -60, kind: 'sea' },
    { id: 't_sea', name: '海洋', color: '#4d7fb0', h: -400, kind: 'sea' },
    { id: 't_deep', name: '深海', color: '#2f5b86', h: -1500, kind: 'sea' },
    { id: 't_trench', name: '海沟', color: '#1d3a5c', h: -3000, kind: 'sea' },
    { id: 't_reef', name: '珊瑚礁', color: '#8fd0d6', h: -30, kind: 'sea' }
  ],
  /* 势力自动配色板（互不接近） */
  POLITY_COLORS: ['#c9813f', '#6a8fbf', '#8f6a9c', '#7ba05b', '#c05f5f', '#4f9a9a',
    '#b58f3c', '#7d6fb0', '#a05f80', '#5f8f7d', '#c07a4f', '#6f7f9c'],
  LABEL_TYPES: [{ v: 'place', n: '地名' }, { v: 'water', n: '水域名' }, { v: 'mount', n: '山名' }, { v: 'polity', n: '势力名' }, { v: 'town', n: '城镇名' }],
  SCHEMA: 1,
  MAGIC: 'MFMAP1',
  /* gzip 包的文件头魔数：8 字节 ASCII，紧跟其后是 gzip 数据；扩展名仍是 .mfmap */
  MAGIC_GZ: 'MFMAPGZ1',
  /* 版本快照：每张地图最多保留 10 份，最短间隔 60 秒自动拍一次 */
  MAX_SNAP: 10,
  SNAP_MS: 60000,
  /* 星空：银河带的补星数量（沿银道面聚集的暗弱背景星）与疏散星团个数 */
  MW_STARS: 5200,
  STAR_CLUSTERS: 3,
  /* 建模网格吸附的可选步长 */
  MODEL_SNAPS: [0, 0.5, 0.25, 0.1, 0.05]
};

/* ------------------------------------------------------------------ CSS --- */
const MF_CSS = `
.mf-bookmark{
  position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:24;
  display:flex;align-items:center;gap:6px;cursor:pointer;pointer-events:auto;
  padding:14px 9px;border:1px solid var(--rule,#c9b892);border-left:none;
  border-radius:0 10px 10px 0;background:var(--paper,#f6efdd);color:var(--ink,#3a2a16);
  font-size:13px;line-height:1.15;letter-spacing:.14em;writing-mode:vertical-rl;
  box-shadow:2px 2px 10px rgba(60,40,15,.22);user-select:none;transition:transform .18s,padding .18s;
}
.mf-bookmark:hover{transform:translateY(-50%) translateX(3px);padding-right:13px}
.mf-bookmark .mf-bm-ico{font-size:15px;writing-mode:horizontal-tb}
.mf-root{position:fixed;inset:0;z-index:80;background:#05070d;color:var(--ink,#3a2a16);font-size:13px}
.mf-root *{box-sizing:border-box}
.mf-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}
.mf-lblcv{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3}

/* ---- 顶部条 ---- */
.mf-top{position:absolute;left:0;right:0;top:0;height:52px;z-index:12;display:flex;align-items:center;
  gap:10px;padding:0 12px;background:linear-gradient(180deg,rgba(246,239,221,.96),rgba(246,239,221,.86));
  border-bottom:1px solid var(--rule,#c9b892);pointer-events:auto}
.mf-era-btn{display:flex;align-items:center;gap:6px;padding:5px 12px;border:1px solid var(--rule,#c9b892);
  border-radius:999px;background:rgba(255,255,255,.5);cursor:pointer;white-space:nowrap;font-size:13px}
.mf-era-btn:hover{background:#fff}
.mf-tl{flex:1;display:flex;align-items:center;gap:6px;overflow-x:auto;padding:4px 0;min-width:60px}
.mf-tl::-webkit-scrollbar{height:5px}
.mf-tl::-webkit-scrollbar-thumb{background:var(--rule,#c9b892);border-radius:3px}
.mf-era-chip{padding:4px 11px;border:1px solid var(--rule,#c9b892);border-radius:999px;background:rgba(255,255,255,.55);
  cursor:pointer;white-space:nowrap;font-size:12px;position:relative}
.mf-era-chip.on{background:var(--ink,#3a2a16);color:var(--paper,#f6efdd);border-color:var(--ink,#3a2a16)}
.mf-era-chip .x{margin-left:5px;opacity:.5}
.mf-era-chip .x:hover{opacity:1;color:#c0402f}
.mf-era-chip.dragging{opacity:.45}
.mf-era-chip.dragover{outline:2px dashed var(--ink,#3a2a16);outline-offset:2px}
.mf-tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:10px}
.mf-tpl-card{border:1px solid var(--rule,#c9b892);border-radius:10px;padding:8px;cursor:pointer;background:rgba(255,255,255,.5);
  display:flex;flex-direction:column;gap:5px;text-align:center}
.mf-tpl-card:hover{background:#fff;border-color:var(--ink,#3a2a16)}
.mf-tpl-card .ic{font-size:24px}
.mf-tpl-card .nm{font-size:13px;font-weight:600;word-break:break-all}
.mf-tpl-card .sb{font-size:11px;color:var(--ink-faint,#8a7a5e)}
.mf-tpl-card img{width:100%;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--rule,#c9b892);background:#0b1020}
.mf-tpl-card.fresh{border-style:dashed;justify-content:center}
.mf-tl-add,.mf-icon-btn{width:26px;height:26px;flex:none;display:flex;align-items:center;justify-content:center;
  border:1px dashed var(--rule,#c9b892);border-radius:50%;cursor:pointer;background:rgba(255,255,255,.5);font-size:15px}
.mf-icon-btn{border-style:solid;font-size:14px}
.mf-icon-btn:hover,.mf-tl-add:hover{background:#fff}
.mf-search{position:relative;width:210px;flex:none}
.mf-search input{width:100%;padding:5px 9px;border:1px solid var(--rule,#c9b892);border-radius:6px;
  background:rgba(255,255,255,.7);font-size:12px;color:var(--ink,#3a2a16);outline:none}
.mf-sres{position:absolute;top:30px;left:0;right:0;max-height:320px;overflow:auto;background:var(--paper,#f6efdd);
  border:1px solid var(--rule,#c9b892);border-radius:7px;box-shadow:0 8px 22px rgba(60,40,15,.25);z-index:30;display:none}
.mf-sres.on{display:block}
.mf-sitem{padding:7px 9px;border-bottom:1px solid rgba(201,184,146,.4);cursor:pointer;font-size:12px}
.mf-sitem:hover{background:rgba(201,184,146,.28)}
.mf-sitem .t{font-weight:600}
.mf-sitem .d{color:var(--ink-faint,#8a7a5e);font-size:11px;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mf-sitem .tag{display:inline-block;font-size:10px;padding:0 5px;border:1px solid var(--rule,#c9b892);
  border-radius:4px;margin-right:4px;color:var(--ink-faint,#8a7a5e)}

/* ---- 左侧竖按钮 ---- */
.mf-left{position:absolute;left:10px;top:64px;z-index:12;display:flex;flex-direction:column;gap:8px;pointer-events:auto}
.mf-left .mf-icon-btn{width:38px;height:38px;font-size:17px;background:var(--paper,#f6efdd);border-radius:9px;
  box-shadow:0 2px 8px rgba(60,40,15,.22)}
.mf-left .mf-icon-btn.on{background:var(--ink,#3a2a16);color:var(--paper,#f6efdd)}
.mf-dock{display:none;flex-direction:column;gap:6px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--rule,#c9b892)}
.mf-dock .mf-icon-btn{width:34px;height:34px;font-size:15px;background:var(--paper,#f6efdd);border-radius:8px}
.mf-dock .mf-icon-btn.on{background:var(--ink,#3a2a16);color:var(--paper,#f6efdd);box-shadow:0 0 0 2px #c9813f}
.mf-pbar{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:14;display:none;align-items:center;gap:8px;
  background:var(--paper,#f6efdd);border:1px solid var(--rule,#c9b892);border-radius:9px;padding:6px 10px;
  box-shadow:0 6px 20px rgba(20,12,4,.35);font-size:12.5px;color:var(--ink,#3a2a16);pointer-events:auto}
.mf-fbar{position:absolute;z-index:13;display:none;gap:4px;background:var(--paper,#f6efdd);border:1px solid var(--rule,#c9b892);border-radius:9px;padding:4px;box-shadow:0 3px 12px rgba(0,0,0,.28);pointer-events:auto}
.mf-fbtn{cursor:pointer;padding:3px 8px;border-radius:6px;border:1px solid var(--rule,#c9b892);font-size:13px;user-select:none;background:#fff}
.mf-fbtn:hover{background:rgba(0,0,0,.07)}

/* ---- 右侧缩放滑条 ---- */
.mf-zoom{position:absolute;right:12px;top:50%;transform:translateY(-50%);z-index:12;pointer-events:auto;
  display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 6px;border-radius:12px;
  background:var(--paper,#f6efdd);border:1px solid var(--rule,#c9b892);box-shadow:0 2px 10px rgba(60,40,15,.25)}
.mf-zoom input[type=range]{writing-mode:bt-lr;-webkit-appearance:slider-vertical;width:22px;height:190px}
.mf-zoom .mf-zi{font-size:15px;cursor:pointer;user-select:none}
.mf-zoom .mf-zt{font-size:10px;color:var(--ink-faint,#8a7a5e);letter-spacing:.04em}

/* ---- 工具包面板 ---- */
.mf-panel{position:absolute;left:56px;top:64px;width:246px;max-height:calc(100vh - 140px);overflow:auto;z-index:12;
  background:var(--paper,#f6efdd);border:1px solid var(--rule,#c9b892);border-radius:11px;
  box-shadow:0 6px 20px rgba(60,40,15,.28);pointer-events:auto;display:none}
.mf-panel.on{display:block}
.mf-panel::-webkit-scrollbar{width:6px}
.mf-panel::-webkit-scrollbar-thumb{background:var(--rule,#c9b892);border-radius:3px}
.mf-ph{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;font-weight:600;
  border-bottom:1px solid var(--rule,#c9b892);background:rgba(201,184,146,.2);border-radius:11px 11px 0 0}
.mf-tabs{display:flex;border-bottom:1px solid var(--rule,#c9b892)}
.mf-tab{flex:1;text-align:center;padding:6px 0;cursor:pointer;font-size:12px;color:var(--ink-faint,#8a7a5e)}
.mf-tab.on{color:var(--ink,#3a2a16);font-weight:600;background:rgba(255,255,255,.6);box-shadow:inset 0 -2px 0 var(--ink,#3a2a16)}
.mf-sec{padding:8px 10px;border-bottom:1px solid rgba(201,184,146,.45)}
.mf-sec-t{font-size:11px;color:var(--ink-faint,#8a7a5e);letter-spacing:.08em;margin-bottom:6px}
.mf-tools{display:flex;flex-wrap:wrap;gap:6px}
.mf-tool{position:relative;display:flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid var(--rule,#c9b892);
  border-radius:7px;background:rgba(255,255,255,.55);cursor:pointer;font-size:12px;user-select:none}
.mf-tool:hover{background:#fff}
.mf-tool.on{border-color:var(--ink,#3a2a16);box-shadow:0 0 0 2px rgba(58,42,22,.28);background:#fff}
.mf-tool .sw{width:11px;height:11px;border-radius:3px;border:1px solid rgba(0,0,0,.25);flex:none}
.mf-row{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px}
.mf-row label{color:var(--ink-faint,#8a7a5e);flex:none}
.mf-sel,.mf-inp{padding:3px 5px;border:1px solid var(--rule,#c9b892);border-radius:5px;background:#fff;
  font-size:12px;color:var(--ink,#3a2a16);outline:none;min-width:0}
.mf-inp{flex:1}
.mf-btn{padding:5px 10px;border:1px solid var(--rule,#c9b892);border-radius:6px;background:rgba(255,255,255,.6);
  cursor:pointer;font-size:12px;color:var(--ink,#3a2a16)}
.mf-btn:hover{background:#fff}
.mf-btn.pri{background:var(--ink,#3a2a16);color:var(--paper,#f6efdd);border-color:var(--ink,#3a2a16)}
.mf-btn.dgr{color:#a33; border-color:#c9a0a0}
.mf-btn:disabled{opacity:.45;cursor:default}
.mf-note{font-size:11px;color:var(--ink-faint,#8a7a5e);line-height:1.6}
.mf-slider{width:100%}
.mf-brush-val{font-size:11px;color:var(--ink-faint,#8a7a5e);text-align:right}

/* ---- 势力目录 ---- */
.mf-plist{max-height:210px;overflow:auto;margin-top:4px}
.mf-pitem{display:flex;align-items:center;gap:6px;padding:5px 6px;border:1px solid transparent;border-radius:6px;
  cursor:pointer;font-size:12px}
.mf-pitem:hover{background:rgba(201,184,146,.25)}
.mf-pitem.sel{border-color:var(--ink,#3a2a16);background:rgba(255,255,255,.7)}
.mf-pitem.ghost{opacity:.55}
.mf-pitem .sw{width:12px;height:12px;border-radius:3px;border:1px solid rgba(0,0,0,.25);flex:none}
.mf-pitem .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ---- 通用浮层 / 模态 ---- */
.mf-modal{position:fixed;inset:0;z-index:90;background:rgba(20,14,6,.5);display:flex;align-items:center;
  justify-content:center;pointer-events:auto}
.mf-modal.hidden{display:none}
.mf-dialog{background:var(--paper,#f6efdd);border:1px solid var(--rule,#c9b892);border-radius:12px;
  box-shadow:0 18px 50px rgba(0,0,0,.4);max-width:92vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden}
.mf-dh{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;font-weight:600;
  border-bottom:1px solid var(--rule,#c9b892);background:rgba(201,184,146,.22)}
.mf-db{padding:12px;overflow:auto;font-size:13px}
.mf-df{padding:9px 12px;border-top:1px solid var(--rule,#c9b892);display:flex;justify-content:flex-end;gap:8px}
.mf-x{cursor:pointer;opacity:.6;font-size:16px;line-height:1}
.mf-x:hover{opacity:1}

/* ---- 地图目录 ---- */
.mf-cat{width:min(680px,92vw);max-height:86vh}
.mf-cat-grid{display:flex;flex-direction:column;gap:8px}
.mf-cat-row{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--rule,#c9b892);
  border-radius:9px;background:rgba(255,255,255,.55);cursor:pointer}
.mf-cat-row:hover{background:#fff;border-color:var(--ink,#3a2a16)}
.mf-cat-row.earth{background:rgba(201,184,146,.3);font-weight:600}
.mf-cat-row.add{border-style:dashed;justify-content:center;min-height:78px;font-size:28px;color:var(--ink-faint,#8a7a5e);
  flex-direction:column;gap:2px}
.mf-cat-row.add .cap{font-size:12px;letter-spacing:.06em}
.mf-cat-row.add.over{border-color:var(--ink,#3a2a16);background:rgba(201,184,146,.35)}
.mf-thumb{width:74px;height:48px;flex:none;border:1px solid var(--rule,#c9b892);border-radius:6px;object-fit:cover;background:#0b1020}
.mf-cat-meta{flex:1;min-width:0}
.mf-cat-meta .nm{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-cat-meta .sb{font-size:11px;color:var(--ink-faint,#8a7a5e);margin-top:2px}
.mf-cat-act{display:flex;gap:5px;flex:none}

/* ---- 势力简介浮窗 ---- */
.mf-prof{position:absolute;right:14px;top:64px;width:330px;max-height:calc(100vh - 150px);z-index:13;
  background:var(--paper,#f6efdd);border:1px solid var(--rule,#c9b892);border-radius:11px;
  box-shadow:0 8px 24px rgba(60,40,15,.3);display:none;flex-direction:column;pointer-events:auto}
.mf-prof.on{display:flex}
.mf-prof-h{display:flex;align-items:center;gap:7px;padding:9px 11px;border-bottom:1px solid var(--rule,#c9b892);
  background:rgba(201,184,146,.22);border-radius:11px 11px 0 0;font-weight:600}
.mf-prof-b{padding:9px 11px;overflow:auto;flex:1}
.mf-fld{border:1px solid rgba(201,184,146,.75);border-radius:7px;background:rgba(255,255,255,.5);margin-bottom:7px;
  padding:6px 8px;cursor:grab}
.mf-fld.drag{opacity:.4}
.mf-fld.over{border-color:var(--ink,#3a2a16);box-shadow:0 0 0 2px rgba(58,42,22,.2)}
.mf-fld-t{font-size:11px;color:var(--ink-faint,#8a7a5e);letter-spacing:.06em;display:flex;justify-content:space-between;align-items:center}
.mf-fld-v{font-size:12.5px;line-height:1.65;margin-top:3px;white-space:pre-wrap;min-height:18px;outline:none}
.mf-fld-v[contenteditable=true]:focus{background:#fff;border-radius:4px;box-shadow:0 0 0 2px rgba(58,42,22,.15)}
.mf-kws{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
.mf-kw{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;font-size:11.5px;
  border:1px solid rgba(0,0,0,.18);cursor:pointer;max-width:100%}
.mf-kw .dot{width:7px;height:7px;border-radius:50%;flex:none}
.mf-add{display:flex;align-items:center;justify-content:center;gap:4px;padding:7px;border:1px dashed var(--rule,#c9b892);
  border-radius:7px;cursor:pointer;color:var(--ink-faint,#8a7a5e);font-size:12px;margin-bottom:7px}
.mf-add:hover{background:rgba(201,184,146,.25);color:var(--ink,#3a2a16)}
.mf-del{border:1px dashed #c08a8a;border-radius:7px;background:rgba(192,138,138,.12);padding:7px;margin-top:2px;
  min-height:46px;display:flex;flex-wrap:wrap;gap:5px;align-content:flex-start}
.mf-del.over{background:rgba(192,138,138,.3);border-color:#a33}
.mf-del .cap{width:100%;font-size:11px;color:#a55;letter-spacing:.06em}
.mf-del .chip{padding:2px 7px;border:1px solid #c08a8a;border-radius:5px;font-size:11px;background:rgba(255,255,255,.6)}

/* ---- 右键菜单 ---- */
.mf-menu{position:fixed;z-index:120;min-width:132px;background:var(--paper,#f6efdd);border:1px solid var(--rule,#c9b892);
  border-radius:8px;box-shadow:0 8px 22px rgba(60,40,15,.32);padding:4px;display:none;pointer-events:auto}
.mf-menu.on{display:block}
.mf-mi{padding:6px 9px;border-radius:5px;cursor:pointer;font-size:12.5px;white-space:nowrap;display:flex;gap:7px;align-items:center}
.mf-mi:hover{background:rgba(201,184,146,.4)}
.mf-mi.dgr{color:#a33}
.mf-mi-sep{height:1px;background:rgba(201,184,146,.7);margin:3px 2px}

/* ---- 资料库 ---- */
.mf-lib{width:min(880px,94vw);height:min(640px,88vh)}
.mf-lib-b{display:flex;flex:1;min-height:0}
.mf-lib-l{width:270px;border-right:1px solid var(--rule,#c9b892);overflow:auto;padding:8px}
.mf-lib-r{flex:1;display:flex;flex-direction:column;min-width:0;padding:8px}
.mf-lib-i{padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12.5px;display:flex;gap:6px;align-items:center}
.mf-lib-i:hover{background:rgba(201,184,146,.28)}
.mf-lib-i.on{background:var(--ink,#3a2a16);color:var(--paper,#f6efdd)}
.mf-lib-i .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-ta{flex:1;width:100%;min-height:180px;resize:none;padding:8px;border:1px solid var(--rule,#c9b892);border-radius:7px;
  background:#fff;color:var(--ink,#3a2a16);font-size:13px;line-height:1.7;outline:none;font-family:inherit}
.mf-stat{border-top:1px solid var(--rule,#c9b892);padding:6px 12px;font-size:11.5px;color:var(--ink-faint,#8a7a5e);
  display:flex;gap:14px;justify-content:flex-end}

/* ---- 建模系统 ---- */
.mf-mod{width:100vw;height:100vh;max-width:none;max-height:none;border-radius:0;
  display:flex;flex-direction:column;overflow:hidden}
/* 建模窗全屏时：body 不滚动，滚动只发生在左右侧栏；画布吃满中间剩余空间 */
.mf-mod .mf-db{flex:1;min-height:0;padding:0;overflow:hidden;display:flex}
.mf-mod-b{display:flex;flex:1;min-height:0}
.mf-mod-l{width:232px;border-right:1px solid var(--rule,#c9b892);overflow:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
.mf-mod-c{flex:1;position:relative;min-width:0;min-height:0;background:#0d1220}
.mf-modesw{display:inline-flex;margin-left:10px;border:1px solid var(--rule,#c9b892);border-radius:6px;overflow:hidden;vertical-align:-2px;background:rgba(255,255,255,.55)}
.mf-modesw .ms{padding:2px 12px;font-size:12px;cursor:pointer;opacity:.75;user-select:none}
.mf-modesw .ms.on{background:#2f5c8a;color:#fff;opacity:1}
.mf-mod-r.mf-dim{pointer-events:none;opacity:.42;filter:saturate(.5)}
.mf-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;max-height:56vh;overflow:auto;padding:2px}
.mf-pcard{border:1px solid var(--rule,#c9b892);border-radius:8px;padding:6px;text-align:center;cursor:pointer;background:rgba(255,255,255,.5);transition:border-color .15s}
.mf-pcard:hover{border-color:#2f5c8a;box-shadow:0 2px 8px rgba(47,92,138,.28)}
.mf-pcard img{width:100%;height:76px;object-fit:contain}
.mf-pcard .nm{font-size:12px;margin-top:4px}
.mf-pcard-empty{height:76px;line-height:76px;opacity:.4}
.mf-deploy-panel{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;background:var(--paper,#f6efdd);border:1px solid var(--rule,#c9b892);border-radius:10px;padding:10px 14px;box-shadow:0 6px 24px rgba(0,0,0,.35);width:400px;font-size:12px;color:var(--ink,#3a2a16)}
.mf-deploy-panel .dp-t{font-weight:bold;font-size:13px;margin-bottom:2px}
.mf-deploy-panel .dp-modes{display:flex;gap:4px;margin:6px 0}
.mf-deploy-panel .dp-m{padding:2px 10px;border:1px solid var(--rule,#c9b892);border-radius:5px;cursor:pointer;opacity:.7;background:rgba(255,255,255,.5)}
.mf-deploy-panel .dp-m.on{background:#2f5c8a;color:#fff;opacity:1;border-color:#2f5c8a}
.mf-deploy-panel .dp-row{display:flex;align-items:center;gap:8px;margin:3px 0}
.mf-deploy-panel .dp-row label{width:36px;flex:none}
.mf-deploy-panel .dp-row input[type=range]{flex:1}
.mf-deploy-panel .dp-row .dp-v{width:44px;text-align:right;opacity:.75;flex:none}
.mf-deploy-panel .dp-hint{opacity:.65;margin-top:6px;line-height:1.6}
.mf-mod-r{width:238px;border-left:1px solid var(--rule,#c9b892);overflow:auto;padding:8px}
.mf-mcard{border:1px solid var(--rule,#c9b892);border-radius:7px;overflow:hidden;cursor:pointer;background:rgba(255,255,255,.5)}
.mf-mcard.on{border-color:var(--ink,#3a2a16);box-shadow:0 0 0 2px rgba(58,42,22,.2)}
.mf-mcard canvas,.mf-mcard img{display:block;width:100%;height:70px;object-fit:cover;background:#0d1220}
.mf-mcard .nm{padding:3px 6px;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-mod-cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}/* ⚠ canvas 是替换元素：只写 inset:0 不会拉伸，会停在默认的 300×150 —— 必须显式 width/height:100% */

/* ---- 提示条 / 底部操作提示 ---- */
.mf-hint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:12;padding:6px 14px;
  border-radius:999px;background:rgba(246,239,221,.92);border:1px solid var(--rule,#c9b892);
  font-size:12px;color:var(--ink,#3a2a16);pointer-events:none;white-space:nowrap;
  box-shadow:0 3px 12px rgba(60,40,15,.25);display:none}
.mf-hint.on{display:block}
.mf-spin{display:inline-block;width:12px;height:12px;border:2px solid var(--rule,#c9b892);border-top-color:var(--ink,#3a2a16);
  border-radius:50%;animation:mfspin .8s linear infinite;vertical-align:-1px}
@keyframes mfspin{to{transform:rotate(360deg)}}

/* ---- 历史快照面板 ---- */
.mf-snap-wrap{display:flex;flex-direction:column}
.mf-snap-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.mf-snap-card{border:1px solid var(--rule,#c9b892);border-radius:10px;padding:8px;background:rgba(255,255,255,.5);
  display:flex;flex-direction:column;gap:4px}
.mf-snap-card:hover{background:#fff}
.mf-snap-thumb{width:100%;height:76px;border-radius:7px;overflow:hidden;border:1px solid var(--rule,#c9b892);background:#0b1020}
.mf-snap-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.mf-snap-nm{font-size:12.5px;font-weight:600;word-break:break-all}
.mf-snap-sb{font-size:11px;color:var(--ink-faint,#8a7a5e)}
.mf-snap-act{display:flex;gap:6px;margin-top:2px}
.mf-snap-act .mf-btn{flex:1;text-align:center}
.mf-snap-act .mf-btn:last-child{flex:0 0 34px}

/* ---- 勾选行（导出对话框等） ---- */
.mf-chk{display:flex;align-items:flex-start;gap:7px;font-size:12.5px;line-height:1.5;cursor:pointer}
.mf-chk input{margin:2px 0 0;flex:0 0 auto}

/* ---- 搜索结果里的人物图 ---- */
.mf-sitem{display:flex;gap:9px;align-items:flex-start}
.mf-sitem .tx{flex:1;min-width:0}
.mf-sitem .av{width:46px;height:46px;border-radius:7px;object-fit:cover;flex:none;
  border:1px solid var(--rule,#c9b892);background:#0b1020}

/* ---- 资料条目：图片集 / 评论集 ---- */
.mf-pfp{width:46px;height:46px;flex:none;border-radius:7px;overflow:hidden;border:1px solid var(--rule,#c9b892);background:#0b1020}
.mf-pfp img{width:100%;height:100%;object-fit:cover;display:block}
.mf-img-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(124px,1fr));gap:10px;margin-top:8px}
.mf-img-card{position:relative;border:1px solid var(--rule,#c9b892);border-radius:9px;padding:5px;background:rgba(255,255,255,.45);cursor:pointer}
.mf-img-card:hover{background:#fff;box-shadow:0 3px 10px rgba(60,40,15,.18)}
.mf-img-card.cover{border-color:var(--ink,#3a2a16);box-shadow:0 0 0 2px rgba(58,42,22,.18)}
.mf-img-ph{width:100%;height:88px;border-radius:6px;overflow:hidden;background:#0b1020;display:flex;align-items:center;justify-content:center;font-size:22px}
.mf-img-ph img{width:100%;height:100%;object-fit:cover;display:block}
.mf-img-nm{font-size:11px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-img-x{position:absolute;right:-6px;top:-6px;width:19px;height:19px;border-radius:50%;background:var(--paper,#f6efdd);
  border:1px solid var(--rule,#c9b892);display:flex;align-items:center;justify-content:center;font-size:11px;opacity:0;transition:opacity .14s}
.mf-img-card:hover .mf-img-x{opacity:1}
.mf-img-x:hover{background:#fff}
.mf-img-badge{position:absolute;left:-4px;top:-6px;font-size:10px;padding:1px 5px;border-radius:999px;
  background:var(--ink,#3a2a16);color:var(--paper,#f6efdd)}
.mf-img-card.add{border-style:dashed;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:2px;color:var(--ink-faint,#8a7a5e);min-height:110px;font-size:11.5px}
.mf-img-card.add .plus{font-size:22px;line-height:1}
.mf-img-card.add:hover{color:var(--ink,#3a2a16)}
.mf-cmt-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.mf-cmt-item{border:1px solid var(--rule,#c9b892);border-radius:8px;padding:6px 8px;background:rgba(255,255,255,.45)}
.mf-cmt-h{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--ink-faint,#8a7a5e)}
.mf-cmt-h .who{font-weight:600;color:var(--ink,#3a2a16)}
.mf-cmt-ops{margin-left:auto;display:flex;gap:6px}
.mf-x-b{cursor:pointer;opacity:.55}
.mf-x-b:hover{opacity:1}
.mf-cmt-v{font-size:12.5px;line-height:1.65;white-space:pre-wrap;margin-top:3px}

/* ---- 白色主题覆盖（KiMi3）：模块界面从羊皮纸换成干净的白色 ---- */
.mf-root,.mf-bookmark,.mf-modal .mf-dialog,.mf-menu,.mf-panel,.mf-prof,.mf-pbar,.mf-fbar,.mf-zoom,.mf-sres{
  --paper:#ffffff;--rule:#d9dee5;--ink:#2b3038;--ink-faint:#7a828e}
.mf-bookmark{background:#ffffff;border-color:#d9dee5;color:#2b3038;box-shadow:2px 2px 10px rgba(30,40,55,.16)}
.mf-top{background:linear-gradient(180deg,rgba(255,255,255,.97),rgba(255,255,255,.88));border-bottom-color:#d9dee5}
.mf-era-btn{border-color:#d9dee5;background:#f5f7f9}
.mf-era-btn:hover{background:#fff}
.mf-era-chip{border-color:#d9dee5;background:#f5f7f9}
.mf-era-chip.on{background:#2b3038;color:#fff;border-color:#2b3038}
.mf-tl::-webkit-scrollbar-thumb{background:#d9dee5}
.mf-tpl-card{border-color:#d9dee5;background:#f7f9fb}
.mf-tpl-card:hover{background:#fff;border-color:#2b3038}
.mf-tl-add,.mf-icon-btn{border-color:#d9dee5;background:#f5f7f9}
.mf-icon-btn:hover,.mf-tl-add:hover{background:#fff}
.mf-search input{border-color:#d9dee5;background:#fff;color:#2b3038}
.mf-sres{background:#fff;border-color:#d9dee5;box-shadow:0 8px 22px rgba(30,40,55,.16)}
.mf-sitem{border-bottom-color:#edf0f4}
.mf-sitem:hover{background:#f0f4f8}
.mf-left .mf-icon-btn{background:#fff;box-shadow:0 2px 8px rgba(30,40,55,.16)}
.mf-left .mf-icon-btn.on{background:#2b3038;color:#fff}
.mf-dock{border-top-color:#d9dee5}
.mf-dock .mf-icon-btn{background:#fff}
.mf-dock .mf-icon-btn.on{background:#2b3038;color:#fff;box-shadow:0 0 0 2px #2f6fb2}
.mf-pbar{background:#fff;border-color:#d9dee5;box-shadow:0 6px 20px rgba(20,26,36,.22);color:#2b3038}
.mf-fbar{background:#fff;border-color:#d9dee5}
.mf-fbtn{border-color:#d9dee5;background:#f5f7f9}
.mf-fbtn:hover{background:#e9edf2}
.mf-zoom{background:#fff;border-color:#d9dee5;box-shadow:0 2px 10px rgba(30,40,55,.16)}
.mf-panel{background:#fff;border-color:#d9dee5;box-shadow:0 6px 20px rgba(30,40,55,.18)}
.mf-panel::-webkit-scrollbar-thumb{background:#d9dee5}
.mf-ph{border-bottom-color:#d9dee5;background:#f1f4f7}
.mf-tabs{border-bottom-color:#d9dee5}
.mf-tab{color:#7a828e}
.mf-tab.on{color:#2b3038;background:#fff;box-shadow:inset 0 -2px 0 #2b3038}
.mf-sec{border-bottom-color:#eceff3}
.mf-sec-t{color:#7a828e}
.mf-tool{border-color:#d9dee5;background:#f6f8fa}
.mf-tool:hover{background:#fff}
.mf-tool.on{border-color:#2b3038;box-shadow:0 0 0 2px rgba(43,48,56,.18);background:#fff}
.mf-row label{color:#7a828e}
.mf-sel,.mf-inp{border-color:#d9dee5;background:#fff;color:#2b3038}
.mf-btn{border-color:#d9dee5;background:#f3f5f7;color:#2b3038}
.mf-btn:hover{background:#fff}
.mf-btn.pri{background:#2b3038;color:#fff;border-color:#2b3038}
.mf-note{color:#7a828e}
.mf-pitem:hover{background:#f0f4f8}
.mf-pitem.sel{border-color:#2b3038;background:#fff}
.mf-dialog{background:#fff;border-color:#d9dee5}
.mf-dh{border-bottom-color:#d9dee5;background:#f1f4f7}
.mf-df{border-top-color:#d9dee5}
.mf-cat-row{border-color:#d9dee5;background:#f7f9fb}
.mf-cat-row:hover{background:#fff;border-color:#2b3038}
.mf-cat-row.earth{background:#eef3f9}
.mf-cat-row.add{color:#7a828e}
.mf-cat-row.add.over{border-color:#2b3038;background:#eef3f9}
.mf-prof{background:#fff;border-color:#d9dee5;box-shadow:0 8px 24px rgba(30,40,55,.2)}
.mf-prof-h{border-bottom-color:#d9dee5;background:#f1f4f7}
.mf-fld{border-color:#dde2e9;background:#fafbfc}
.mf-fld.over{border-color:#2b3038;box-shadow:0 0 0 2px rgba(43,48,56,.14)}
.mf-fld-t{color:#7a828e}
.mf-add{border-color:#d9dee5;color:#7a828e}
.mf-add:hover{background:#f0f4f8;color:#2b3038}
.mf-menu{background:#fff;border-color:#d9dee5;box-shadow:0 8px 22px rgba(30,40,55,.2)}
.mf-mi:hover{background:#eef2f6}
.mf-mi-sep{background:#e6eaef}
.mf-lib-l{border-right-color:#d9dee5}
.mf-lib-i:hover{background:#eef2f6}
.mf-lib-i.on{background:#2b3038;color:#fff}
.mf-ta{border-color:#d9dee5;background:#fff;color:#2b3038}
.mf-stat{border-top-color:#d9dee5;color:#7a828e}
.mf-mod-l{border-right-color:#d9dee5}
.mf-mod-r{border-left-color:#d9dee5}
.mf-mcard{border-color:#d9dee5;background:#f7f9fb}
.mf-mcard.on{border-color:#2b3038;box-shadow:0 0 0 2px rgba(43,48,56,.14)}
.mf-hint{background:rgba(255,255,255,.94);border-color:#d9dee5;color:#2b3038;box-shadow:0 3px 12px rgba(30,40,55,.16)}
.mf-spin{border-color:#d9dee5;border-top-color:#2b3038}
.mf-snap-card{border-color:#d9dee5;background:#f7f9fb}
.mf-snap-card:hover{background:#fff}
.mf-img-card{border-color:#d9dee5;background:#fafbfc}
.mf-img-card:hover{background:#fff;box-shadow:0 3px 10px rgba(30,40,55,.14)}
.mf-img-card.cover{border-color:#2b3038;box-shadow:0 0 0 2px rgba(43,48,56,.14)}
.mf-img-x{background:#fff;border-color:#d9dee5}
.mf-img-badge{background:#2b3038;color:#fff}
.mf-img-card.add{color:#7a828e}
.mf-img-card.add:hover{color:#2b3038}
.mf-cmt-item{border-color:#d9dee5;background:#fafbfc}
.mf-cmt-h{color:#7a828e}
.mf-cmt-h .who{color:#2b3038}
`;

function mfInjectCSS() {
  if (document.getElementById('v3-mod-css-' + MF_ID)) return;
  const st = document.createElement('style');
  st.id = 'v3-mod-css-' + MF_ID;
  st.dataset.mod = MF_ID;
  st.textContent = MF_CSS;
  (document.head || document.documentElement).appendChild(st);
}
function mfRemoveCSS(force) {
  if (!force && document.querySelector('.v3-card[data-id="' + MF_ID + '"]')) return;
  const st = document.getElementById('v3-mod-css-' + MF_ID);
  if (st && st.parentNode) st.parentNode.removeChild(st);
}

/* ===================== 10_util.js ===================== */
/* ==========================================================================
 * 工具层：DOM / 颜色 / 菜单 / 对话框 / 拖拽
 * 全部使用 .mf-* 自有前缀，不触碰宿主 DOM，不重定义 .v3-* 类名
 * ========================================================================== */

/* 自建节点登记处：清理函数逐个移除，保证「卸下后无残留」 */
const MF_DOM = [];

function mfNode(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
/* ---- 线条图标库：无色单色（currentColor 随按钮态变色），stroke 风格统一 ---- */
function mfIcon(name) {
  const P = {
    tool: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h12M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    map: '<path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3.5V8h-4.5"/>',
    globe: '<circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="3.5" ry="8"/><path d="M4.2 12h15.6"/>',
    save: '<path d="M5 3h12l4 4v14H5z"/><path d="M8 3v5h7V3"/><path d="M8.5 21v-7h7v7"/>',
    history: '<path d="M4 12a8 8 0 1 1 2.3 5.7"/><path d="M4 18.5V14h4.5"/><path d="M12 8v4l3 2"/>',
    grid: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
    planet: '<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10" ry="3.2" transform="rotate(-18 12 12)"/>',
    cube: '<path d="M12 3l7 4v10l-7 4-7-4V7l7-4z"/><path d="M12 11v10M12 11 5 7M12 11l7-4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    land: '<path d="M3.5 19 9 7l4 6.5 3-4 4.5 9.5z"/><path d="M3 21h18"/>',
    sea: '<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
    other: '<rect x="5" y="5" width="14" height="14" rx="1.5" stroke-dasharray="3.2 3"/>',
    erase: '<path d="M14 5l5 5-8 8H7l-2-2z"/><path d="M12 7l5 5"/><path d="M4 20h16"/>',
    flag: '<path d="M6 21V4"/><path d="M6 4.5c4-2 8 2 12 0v8c-4 2-8-2-12 0"/>',
    town: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    water: '<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>',
    inst: '<path d="M12 3l6 3.5v7L12 17l-6-3.5v-7z"/><path d="M12 10v4M9.2 8.4l2.8 1.5 2.8-1.5"/><path d="M7.5 21h9"/>',
    tag: '<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
    space: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
    paint: '<path d="M18 4l2 2-8.5 8.5-2-2z"/><path d="M9.5 12.5c-3 1-5 3-5 6 2.2.3 5-.8 6-4"/>',
    lasso: '<path d="M12 4.5c5 0 8.5 3 8.5 7s-3.5 8-8.5 8-8.5-4-8.5-8 3.5-7 8.5-7z" stroke-dasharray="3 2.6"/>',
    line: '<path d="M5.5 18.5 18.5 5.5"/><circle cx="5" cy="19" r="1.7"/><circle cx="19" cy="5" r="1.7"/>',
    tune: '<path d="M4 20l1-4.2L16 4.9l3.1 3.1L8.1 19z"/><path d="M14.2 6.7l3.1 3.1"/>',
    poly: '<path d="M4 18 9 8l4 6 3-4 4 8"/>'
  };
  return '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="display:block">' + (P[name] || '') + '</svg>';
}
function mfMount(parent, node) { parent.appendChild(node); MF_DOM.push(node); return node; }
function mfDrop(node) {
  if (!node) return;
  if (node.parentNode) node.parentNode.removeChild(node);
  const i = MF_DOM.indexOf(node);
  if (i >= 0) MF_DOM.splice(i, 1);
}

let _uidSeed = Date.now() % 100000;
function uid(p) { _uidSeed++; return (p || 'm') + '_' + _uidSeed.toString(36) + Math.floor(Math.random() * 1296).toString(36); }
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(h) {
  h = String(h || '').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h || '000000', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const f = (v) => ('0' + clamp(Math.round(v), 0, 255).toString(16)).slice(-2);
  return '#' + f(r) + f(g) + f(b);
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
function lum(h) { const c = hexToRgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts), p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function fmtDist(km) {
  if (km >= 1000) return (km / 1000).toFixed(km >= 10000 ? 0 : 1) + ' km×10³';
  if (km >= 1) return km.toFixed(1) + ' km';
  return Math.round(km * 1000) + ' m';
}

/* ------------------------------------------------------- 右键菜单（单例） -- */
let _menuEl = null, _menuOff = null;
function mfCloseMenu() {
  if (_menuOff) { try { _menuOff(); } catch (e) { } _menuOff = null; }
  if (_menuEl) { mfDrop(_menuEl); _menuEl = null; }
}
/* 以某个元素为锚点弹菜单（取它的左下角） */
function mfMenuAtEl(el, items) {
  const r = el.getBoundingClientRect();
  mfMenu(r.left, r.bottom + 4, items);
}
function mfMenu(x, y, items) {
  mfCloseMenu();
  const m = mfNode('div', 'mf-menu');
  m.style.left = Math.min(x, innerWidth - 150) + 'px';
  m.style.top = Math.min(y, innerHeight - 40 - items.length * 30) + 'px';
  (items || []).forEach((it) => {
    if (!it) return;
    if (it.sep) { m.appendChild(mfNode('div', 'mf-mi-sep')); return; }
    const b = mfNode('div', 'mf-mi' + (it.dgr ? ' dgr' : ''), '<span>' + esc(it.icon || '') + '</span><span>' + esc(it.label) + '</span>');
    b.addEventListener('click', (e) => { e.stopPropagation(); mfCloseMenu(); try { it.fn && it.fn(); } catch (err) { console.error(err); } });
    m.appendChild(b);
  });
  mfMount(document.body, m);
  m.classList.add('on');
  _menuEl = m;
  const onDown = (e) => { if (!m.contains(e.target)) mfCloseMenu(); };
  const onKey = (e) => { if (e.key === 'Escape') mfCloseMenu(); };
  /* 延迟绑定，避免「打开菜单的那次点击」立刻把它关掉 */
  const t = setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
  _menuOff = function () {
    clearTimeout(t);
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
  };
  return m;
}

/* ------------------------------------------------------------ 模态对话框 -- */
function mfDialog(opt) {
  const mask = mfNode('div', 'mf-modal');
  const box = mfNode('div', 'mf-dialog' + (opt.cls ? ' ' + opt.cls : ''));
  if (opt.width) box.style.width = opt.width;
  const head = mfNode('div', 'mf-dh', '<span>' + esc(opt.title || '') + '</span>');
  const x = mfNode('span', 'mf-x', '✕');
  head.appendChild(x);
  const body = mfNode('div', 'mf-db');
  if (typeof opt.body === 'string') body.innerHTML = opt.body;
  else if (opt.body) body.appendChild(opt.body);
  box.appendChild(head); box.appendChild(body);
  let foot = null;
  if (opt.buttons && opt.buttons.length) {
    foot = mfNode('div', 'mf-df');
    opt.buttons.forEach((b) => {
      const btn = mfNode('button', 'mf-btn' + (b.pri ? ' pri' : '') + (b.dgr ? ' dgr' : ''), esc(b.label));
      btn.addEventListener('click', () => { if (!b.keep) close(); b.fn && b.fn(close); });
      foot.appendChild(btn);
    });
    box.appendChild(foot);
  }
  mask.appendChild(box);
  mfMount(document.body, mask);
  function close() {
    mfDrop(mask);
    opt.onClose && opt.onClose();
  }
  x.addEventListener('click', close);
  mask.addEventListener('pointerdown', (e) => { if (e.target === mask && opt.maskClose !== false) close(); });
  if (opt.body instanceof HTMLElement) opt.body.__mfDialog = close;
  return { el: mask, box: box, body: body, foot: foot, close: close };
}

/* 通用「确认 + 每次询问勾选」小窗口：setKey 对应的偏好为 false 时直接放行。
 * 对话框下方常驻一行小字勾选「以后每次都问我」，取消勾选后同类操作不再打扰
 * （可在模块设置里改回）。适合部署、批量生成等「值得问一句但不必每次都问」的场合。 */
function mfConfirmOpt(o) {
  if (o.setKey && mfPrefGet(o.setKey, true) === false) { o.onYes && o.onYes(); return; }
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', '', esc(o.msg || '确认执行？')));
  const row = mfNode('label');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:12px;font-size:12px;opacity:.75;cursor:pointer';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = true;
  cb.title = '取消勾选后，同类操作将直接执行，不再弹这个窗口（可在模块设置里改回）';
  row.appendChild(cb);
  row.appendChild(document.createTextNode(o.askLabel || '以后每次都问我'));
  wrap.appendChild(row);
  mfDialog({
    title: o.title || '确认', width: '360px', body: wrap,
    buttons: [
      { label: o.okLabel || '确认', pri: true, fn: () => { if (o.setKey) mfPrefSet(o.setKey, cb.checked); o.onYes && o.onYes(); } },
      { label: o.noLabel || '再想想', fn: function () { } }
    ]
  });
}
function mfConfirm(msg, onYes, opt) {
  opt = opt || {};
  return mfDialog({
    title: opt.title || '确认',
    width: '340px',
    body: '<div style="line-height:1.8">' + esc(msg) + '</div>',
    buttons: [
      { label: '取消', fn: function () { } },
      { label: opt.okLabel || '确定', pri: true, dgr: !!opt.dgr, fn: function () { onYes && onYes(); } }
    ]
  });
}
function mfPrompt(label, def, onOk, opt) {
  opt = opt || {};
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', '', '<div style="margin-bottom:8px">' + esc(label) + '</div>'));
  const inp = mfNode('input', 'mf-inp');
  inp.value = def || '';
  inp.style.cssText = 'width:100%;padding:6px 8px';
  wrap.appendChild(inp);
  const d = mfDialog({
    title: opt.title || '输入',
    width: '340px',
    body: wrap,
    buttons: [
      { label: '取消', fn: function () { } },
      {
        label: '确定', pri: true, fn: function () {
          const v = inp.value.trim();
          if (!v && opt.required !== false) return;
          onOk && onOk(v || def || '');
        }
      }
    ]
  });
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { d.foot.querySelectorAll('.mf-btn')[1].click(); } });
  return d;
}

/* --------------------------------------------------------------- 下载 ----- */
function mfDownload(name, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  mfDownloadBlob(name, blob);
}
function mfDownloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
}
/* 字符串 → UTF-8 字节。⚠ 必须做真正的 UTF-8 编码：
 * 用 charCodeAt & 255 会把中文等多字节字符砍成单字节乱码，
 * gzip 包看着完全正常（压缩/解压都成功），但解出来的 JSON 是坏的 —— 排查起来很坑 */
function mfBytesUTF8(str) {
  const s = String(str), out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) { out.push(c); continue; }
    if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); continue; }
    /* 代理对 → 一个码点（4 字节） */
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const c2 = s.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        i++;
        const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        continue;
      }
    }
    out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}
function mfBytes(str) {
  try { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str); } catch (e) { }
  return mfBytesUTF8(str);
}
function mfStr(u8) {
  try { if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8); } catch (e) { }
  return decodeURIComponent(escape(String.fromCharCode.apply(null, u8)));
}
/* gzip：用浏览器原生 CompressionStream，不支持的环境返回 null（调用方自动回退） */
async function mfGzip(u8) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) { return null; }
}
async function mfGunzip(u8) {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) { return null; }
}
/* magic(8字节ASCII) + gzip 数据 → 一个 ArrayBuffer 的二进制 .mfmap 包 */
function mfPackGz(gz) {
  const head = mfBytes(CFG.MAGIC_GZ);
  const out = new Uint8Array(head.length + gz.length);
  out.set(head, 0); out.set(gz, head.length);
  return out;
}
function mfHasGzMagic(u8) {
  const head = mfBytes(CFG.MAGIC_GZ);
  if (u8.length < head.length) return false;
  for (let i = 0; i < head.length; i++) if (u8[i] !== head[i]) return false;
  return true;
}

/* 编辑器偏好：只存小数据（开关、习惯），读写都走 ctx.settings */
function mfPrefGet(k, def) {
  try {
    const v = CTXREF && CTXREF.settings ? CTXREF.settings.get(k) : undefined;
    return (v === undefined || v === null) ? def : v;
  } catch (e) { return def; }
}
function mfPrefSet(k, v) {
  try { if (CTXREF && CTXREF.settings) CTXREF.settings.set(k, v); } catch (e) { }
}

/* 勾选行：<label><input type=checkbox> 文字</label>（导出对话框等处用） */
function mfCheckRow(label, def, hint) {
  const lab = mfNode('label', 'mf-chk');
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = !!def;
  lab.appendChild(cb);
  lab.appendChild(mfNode('span', '', esc(label)));
  const wrap = mfNode('div');
  wrap.appendChild(lab);
  if (hint) { const h = mfNode('div', 'mf-note', esc(hint)); h.style.marginTop = '2px'; wrap.appendChild(h); }
  return { el: wrap, get: function () { return cb.checked; }, set: function (v) { cb.checked = !!v; } };
}

/* --------------------------------------------------- 可拖动换位（列表） --- */
/* onDrop(fromIndex, toIndex)。handle: 可选选择器，指定只有按住它才触发拖动 */
function mfDragSort(container, itemSel, onDrop, opt) {
  opt = opt || {};
  let dragEl = null, fromIdx = -1, ph = null;
  function idxOf(el) { return Array.prototype.indexOf.call(container.querySelectorAll(itemSel), el); }
  function onDown(e) {
    if (e.button !== 0) return;
    const it = e.target.closest ? e.target.closest(itemSel) : null;
    if (!it || !container.contains(it)) return;
    if (opt.handle && !(e.target.closest && e.target.closest(opt.handle))) return;
    if (opt.ignore && e.target.closest && e.target.closest(opt.ignore)) return;
    if (opt.canDrag && !opt.canDrag(it)) return;
    dragEl = it; fromIdx = idxOf(it);
    ph = mfNode('div');
    ph.style.cssText = 'height:' + it.offsetHeight + 'px;border:1px dashed var(--rule,#c9b892);border-radius:7px;margin-bottom:' +
      (getComputedStyle(it).marginBottom || '0px');
    e.preventDefault();
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }
  function onMove(e) {
    if (!dragEl) return;
    dragEl.classList.add('drag');
    const items = Array.prototype.slice.call(container.querySelectorAll(itemSel));
    let target = null;
    for (const it of items) {
      if (it === dragEl) continue;
      const r = it.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.top + r.height / 2) { target = it; break; }
      if (e.clientY > r.top + r.height / 2 && e.clientY <= r.bottom) { target = it.nextSibling; break; }
    }
    if (target === dragEl.nextSibling) target = null;
    if (target && target !== ph) container.insertBefore(ph, target);
    else if (!target && container.lastChild !== ph && container.lastChild !== dragEl) container.appendChild(ph);
  }
  function onUp() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (!dragEl) return;
    dragEl.classList.remove('drag');
    if (ph && ph.parentNode) {
      const toIdx = Array.prototype.indexOf.call(container.querySelectorAll(itemSel), ph) - (fromIdx >= 0 ? 0 : 0);
      container.insertBefore(dragEl, ph);
      ph.remove();
      let real = idxOf(dragEl);
      if (real !== fromIdx && real >= 0 && fromIdx >= 0) onDrop(fromIdx, real);
    }
    ph = null; dragEl = null; fromIdx = -1;
  }
  container.addEventListener('pointerdown', onDown);
  return function off() {
    container.removeEventListener('pointerdown', onDown);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };
}

/* ------------------------------------------- 内容可编辑（失焦即保存） ----- */
function mfEditable(el, getText, setText, opt) {
  opt = opt || {};
  function begin() {
    if (el.getAttribute('contenteditable') === 'true') return;
    el.setAttribute('contenteditable', 'true');
    el.textContent = getText();
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    el.style.cursor = 'text';
  }
  function end(save) {
    if (el.getAttribute('contenteditable') !== 'true') return;
    const v = el.textContent;
    el.removeAttribute('contenteditable');
    el.style.cursor = '';
    if (save) setText(v);
    else el.textContent = getText();
    opt.onChange && opt.onChange();
  }
  el.addEventListener('click', (e) => { e.stopPropagation(); begin(); });
  el.addEventListener('blur', () => end(true));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); end(false); }
  });
  return { begin: begin, end: end };
}

/* ===================== 20_data.js ===================== */
/* ==========================================================================
 * 数据层：球面栅格 · 行程编码 · 地图包 · 持久化（ctx.store / IndexedDB）
 * 栅格按经纬度离散：index = y * w + x，y=0 在北极（lat=90），x=0 在 lon=-180
 * ========================================================================== */

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

function MFGrid(res) {
  this.res = res;
  this.w = Math.round(360 / res);
  this.h = Math.round(180 / res);
  const n = this.w * this.h;
  this.region = new Uint8Array(n);   // 0 未定 / 1 陆地 / 2 海洋 / 3 其他
  this.terrain = new Uint8Array(n);  // 0 无 / 1..255 地形序号（+1 存，0 表示无）
  this.polity = new Uint16Array(n);  // 0 无 / 1..65535 势力序号
  this.water = new Uint8Array(n);    // 0 无 / 1 水域（湖泊笔涂出的范围，供一键生成水面建模）
}
MFGrid.prototype.idx = function (x, y) { return y * this.w + x; };
MFGrid.prototype.xOf = function (lon) {
  let x = Math.floor((lon + 180) / this.res); if (x < 0) x = 0; if (x >= this.w) x = this.w - 1; return x;
};
MFGrid.prototype.yOf = function (lat) {
  let y = Math.floor((90 - lat) / this.res); if (y < 0) y = 0; if (y >= this.h) y = this.h - 1; return y;
};
MFGrid.prototype.lonOfX = function (x) { return -180 + (x + 0.5) * this.res; };
MFGrid.prototype.latOfY = function (y) { return 90 - (y + 0.5) * this.res; };
/* 圆形笔刷：以 (lon,lat) 为心、角距 rad 为半径，对命中的格子回调 fn(i, x, y) */
MFGrid.prototype.stamp = function (lon, lat, rad, fn) {
  /* 笔刷中心/候选格都只用来算角距（点积），镜像反射是保距变换，
   * 所以这里 z 取 +sin 还是 −sin 结果一样；与球面几何保持一致只为免后人困惑 */
  const cx = Math.cos(lat * D2R), sx = Math.sin(lat * D2R);
  const px = cx * Math.cos(lon * D2R), py = sx, pz = -cx * Math.sin(lon * D2R);
  const cosR = Math.cos(rad);
  const dLat = rad * R2D;
  const y0 = this.yOf(lat + dLat), y1 = this.yOf(lat - dLat);
  const cosLat = Math.max(0.02, Math.abs(cx));
  const dLon = Math.min(180, dLat / cosLat);
  for (let y = y0; y <= y1; y++) {
    const la = this.latOfY(y);
    const cy = Math.sin(la * D2R), cr = Math.cos(la * D2R);
    /* 经度范围：逐行精确收缩，避免高纬度画出扇形 */
    let x0, x1;
    const denom = cr * cx;
    if (denom > 1e-9) {
      const cosDL = (cosR - cy * py) / denom;
      if (cosDL <= -1) { x0 = 0; x1 = this.w - 1; }
      else { const dl = Math.acos(clamp(cosDL, -1, 1)) * R2D; x0 = this.xOf(lon - dl); x1 = this.xOf(lon + dl); }
    } else { x0 = 0; x1 = this.w - 1; }
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    for (let x = x0; x <= x1; x++) {
      const lo = this.lonOfX(x);
      const vx = cr * Math.cos(lo * D2R), vy = cy, vz = -cr * Math.sin(lo * D2R);
      if (vx * px + vy * py + vz * pz >= cosR) fn(y * this.w + x, x, y);
    }
  }
  /* 高纬度笔刷跨过极点时：把极点附近整圈补上 */
  if (lat + dLat >= 90) { for (let x = 0; x < this.w; x++) fn(0 * this.w + x, x, 0); }
  if (lat - dLat <= -90) { for (let x = 0; x < this.w; x++) fn((this.h - 1) * this.w + x, x, this.h - 1); }
};
/* 方形笔刷（KiMi3）：经纬网格上的「方印」——纬差与按纬度折减后的经差都不超过 rad。
   画直线海岸、方块城池、规整势力范围时比圆头顺手。 */
MFGrid.prototype.stampSquare = function (lon, lat, rad, fn) {
  const dLat = rad * R2D;
  const cosLat = Math.max(0.05, Math.abs(Math.cos(lat * D2R)));
  const dLon = Math.min(180, dLat / cosLat);
  const y0 = this.yOf(lat + dLat), y1 = this.yOf(lat - dLat);
  for (let y = y0; y <= y1; y++) {
    const la = this.latOfY(y);
    if (Math.abs(la - lat) > dLat) continue;
    const x0 = this.xOf(lon - dLon), x1 = this.xOf(lon + dLon);
    for (let x = x0; x <= x1; x++) fn(y * this.w + x, x, y);
  }
  if (lat + dLat >= 90) { for (let x = 0; x < this.w; x++) fn(x, x, 0); }
  if (lat - dLat <= -90) { for (let x = 0; x < this.w; x++) fn((this.h - 1) * this.w + x, x, this.h - 1); }
};
/* 笔刷形状分发：作画统一走这里 */
function mfStampGrid(g, lon, lat, rad, fn) {
  if (ED.brushShape === 'square') g.stampSquare(lon, lat, rad, fn);
  else g.stamp(lon, lat, rad, fn);
}
MFGrid.prototype.clone = function () {
  const g = new MFGrid(this.res);
  g.region.set(this.region); g.terrain.set(this.terrain); g.polity.set(this.polity);
  return g;
};

/* ------------------------------------------------------------ 行程编码 ---- */
/* 打包：[value(bytesPerValue)][count:uint32 LE] ... → base64 */
function mfRLE(arr, bytesPerValue) {
  const out = [];
  const n = arr.length;
  if (!n) return '';
  let cur = arr[0], cnt = 1;
  for (let i = 1; i < n; i++) {
    const v = arr[i];
    if (v === cur && cnt < 0xffffffff) { cnt++; continue; }
    out.push(cur, cnt); cur = v; cnt = 1;
  }
  out.push(cur, cnt);
  const pairs = out.length / 2;
  const buf = new Uint8Array(pairs * (bytesPerValue + 4));
  const dv = new DataView(buf.buffer);
  for (let p = 0; p < pairs; p++) {
    const v = out[p * 2], c = out[p * 2 + 1];
    const off = p * (bytesPerValue + 4);
    if (bytesPerValue === 1) dv.setUint8(off, v);
    else dv.setUint16(off, v, true);
    dv.setUint32(off + bytesPerValue, c, true);
  }
  return mfB64(buf);
}
function mfUnRLE(str, bytesPerValue, expectLen, Ctor) {
  const buf = mfUnB64(str);
  const step = bytesPerValue + 4;
  const pairs = Math.floor(buf.length / step);
  const out = new Ctor(expectLen);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.length);
  let pos = 0;
  for (let p = 0; p < pairs; p++) {
    const off = p * step;
    const v = bytesPerValue === 1 ? dv.getUint8(off) : dv.getUint16(off, true);
    const c = dv.getUint32(off + bytesPerValue, true);
    for (let k = 0; k < c && pos < expectLen; k++) out[pos++] = v;
    if (pos >= expectLen) break;
  }
  return out;
}
function mfB64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}
function mfUnB64(str) {
  const bin = atob(str || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* -------------------------------------------------------------- 地图包 ---- */
/* 数据模型
 *   pack（地图文件 = S.pack）
 *     ├ meta        地图名 / id / 栅格精度
 *     ├ worlds[]    每个「时代」就是一颗独立星球（S.map = worlds[cur]）
 *     ├ library     资料库（跨时代共享，搜索可跨时代命中）
 *     └ cur         当前时代下标
 *   world（时代 / 星球）
 *     grid / polities / terrains / models / instances / labels / height
 * world.meta 是 pack.meta 的别名，所以既有代码里的 S.map.meta.name 仍表示地图名。
 */
function mfNewWorld(res, name) {
  res = res || CFG.GRID_RES_DEF;
  return {
    id: uid('w'), name: name || '当前时代',
    grid: new MFGrid(res),
    polities: [],
    terrains: CFG.TERRAIN_DEF.map((t) => ({ id: t.id, name: t.name, color: t.color, h: t.h, kind: t.kind })),
    models: [],
    instances: [],
    labels: [],
    towns: [],
    height: null,
    heightScale: 1,
    astro: { radiusKm: 6371, density: 5514 },
    spaces: [],
    thumb: ''
  };
}

function mfNewMap(name, res) {
  res = res || CFG.GRID_RES_DEF;
  const now = Date.now();
  const pack = {
    magic: CFG.MAGIC,
    schemaVersion: CFG.SCHEMA,
    meta: { id: uid('map'), name: name || '未命名地图', createdAt: now, modifiedAt: now, gridRes: res },
    worlds: [],
    cur: 0,
    library: [],
    thumb: ''
  };
  pack.worlds.push(mfNewWorld(res, '当前时代'));
  return mfLinkWorlds(pack);
}

function mfLinkWorlds(pack) {
  pack.worlds = pack.worlds || [];
  if (!pack.worlds.length) pack.worlds.push(mfNewWorld(pack.meta && pack.meta.gridRes, '当前时代'));
  pack.worlds.forEach((w) => { w.meta = pack.meta; });
  if (!(pack.cur >= 0) || pack.cur >= pack.worlds.length) pack.cur = 0;
  return pack;
}

/* 深拷贝一个时代（用于「使用时代模板」时把模板铺成新的星球） */
function mfCloneWorld(w, name) {
  const o = mfDeserializeWorld(mfSerializeWorld(w));
  o.id = uid('w');
  o.name = name || w.name;
  o.thumb = '';
  return o;
}

function mfSerializeWorld(w) {
  const g = w.grid;
  return {
    id: w.id, name: w.name,
    grid: {
      res: g.res, w: g.w, h: g.h,
      region: mfRLE(g.region, 1),
      terrain: mfRLE(g.terrain, 1),
      polity: mfRLE(g.polity, 2),
      water: mfRLE(g.water || new Uint8Array(g.w * g.h), 1)
    },
    height: w.height ? mfB64(new Uint8Array(new Float32Array(w.height).buffer)) : '',
    heightScale: w.heightScale == null ? 1 : w.heightScale,
    shape: mfShapeSerialize(w),
    polities: JSON.parse(JSON.stringify(w.polities || [])),
    terrains: JSON.parse(JSON.stringify(w.terrains || [])),
    models: (w.models || []).map((x) => ({
      id: x.id, name: x.name, cat: x.cat || '', abs: x.abs ? 1 : 0,
      verts: mfB64(new Uint8Array(new Float32Array(x.verts).buffer)),
      colors: mfB64(new Uint8Array(new Float32Array(x.colors).buffer)),
      faces: mfB64(new Uint8Array(new Uint32Array(x.faces).buffer)),
      groups: x.groups ? JSON.parse(JSON.stringify(x.groups)) : [],
      anims: (x.anims || []).map((a) => ({
        name: a.name, dur: a.dur || 2,
        frames: (a.frames || []).map((f) => mfB64(new Uint8Array(new Float32Array(f).buffer)))
      }))
    })),
    astro: w.astro ? { radiusKm: w.astro.radiusKm, density: w.astro.density } : null,
    spaces: (w.spaces || []).map((sp) => ({
      id: sp.id, name: sp.name, lon: sp.lon, lat: sp.lat, radKm: sp.radKm,
      type: sp.type || 'room', cellM: sp.cellM || 0,
      cells: (sp.cells || []).map((c) => ({ x: c.x | 0, y: c.y | 0, z: c.z | 0 })),
      geom: sp.geom ? {
        verts: mfB64(new Uint8Array(new Float32Array(sp.geom.verts).buffer)),
        colors: mfB64(new Uint8Array(new Float32Array(sp.geom.colors).buffer)),
        faces: mfB64(new Uint8Array(new Uint32Array(sp.geom.faces).buffer))
      } : null
    })),
    instances: JSON.parse(JSON.stringify(w.instances || [])),
    labels: JSON.parse(JSON.stringify(w.labels || [])),
    towns: JSON.parse(JSON.stringify(w.towns || [])),
    thumb: w.thumb || ''
  };
}

function mfDeserializeWorld(o) {
  if (!o || !o.grid || !o.grid.res) throw new Error('时代数据缺少栅格');
  const g = new MFGrid(o.grid.res);
  const n = g.w * g.h;
  if (o.grid.w !== g.w || o.grid.h !== g.h) throw new Error('栅格尺寸与分辨率不一致');
  g.region = mfUnRLE(o.grid.region, 1, n, Uint8Array);
  g.terrain = mfUnRLE(o.grid.terrain || '', 1, n, Uint8Array);
  g.polity = mfUnRLE(o.grid.polity || '', 2, n, Uint16Array);
  g.water = mfUnRLE(o.grid.water || '', 1, n, Uint8Array);
  const w = {
    id: o.id || uid('w'), name: o.name || '未命名时代',
    grid: g,
    polities: o.polities || [],
    terrains: (o.terrains && o.terrains.length) ? o.terrains : CFG.TERRAIN_DEF.map((t) => ({ id: t.id, name: t.name, color: t.color, h: t.h, kind: t.kind })),
    models: (o.models || []).map((x) => ({
      id: x.id, name: x.name, cat: x.cat || '', abs: !!x.abs,
      verts: new Float32Array(mfUnB64(x.verts).buffer),
      colors: new Float32Array(mfUnB64(x.colors).buffer),
      faces: new Uint32Array(mfUnB64(x.faces).buffer),
      groups: x.groups || [],
      anims: (x.anims || []).map((a) => ({
        name: a.name, dur: a.dur || 2,
        frames: (a.frames || []).map((f) => new Float32Array(mfUnB64(f).buffer))
      }))
    })),
    instances: o.instances || [],
    labels: o.labels || [],
    towns: o.towns || [],
    height: null,
    heightScale: o.heightScale == null ? 1 : o.heightScale,
    shape: null, shapeData: o.shape || null,
    astro: (o.astro && o.astro.radiusKm) ? { radiusKm: o.astro.radiusKm, density: o.astro.density || 5514 } : { radiusKm: 6371, density: 5514 },
    spaces: (o.spaces || []).map((sp) => ({
      id: sp.id || uid('sp'), name: sp.name || '未命名空间',
      lon: sp.lon || 0, lat: sp.lat || 0, radKm: sp.radKm || 5,
      type: sp.type || 'room', cellM: sp.cellM || 0,
      cells: (sp.cells && sp.cells.length ? sp.cells : [{ x: 0, y: 0, z: 0 }]).map((c) => ({ x: c.x | 0, y: c.y | 0, z: c.z | 0 })),
      geom: sp.geom ? {
        verts: new Float32Array(mfUnB64(sp.geom.verts).buffer),
        colors: new Float32Array(mfUnB64(sp.geom.colors).buffer),
        faces: new Uint32Array(mfUnB64(sp.geom.faces).buffer)
      } : null
    })),
    thumb: o.thumb || ''
  };
  if (o.height) {
    const b = mfUnB64(o.height);
    if (b.length === n * 4) w.height = new Float32Array(b.buffer);
  }
  return w;
}

function mfSerialize(pack) {
  mfLinkWorlds(pack);
  return {
    magic: CFG.MAGIC, schemaVersion: CFG.SCHEMA,
    meta: Object.assign({}, pack.meta, { gridRes: pack.worlds[0].grid.res }),
    worlds: pack.worlds.map(mfSerializeWorld),
    cur: pack.cur || 0,
    library: JSON.parse(JSON.stringify(pack.library)),
    thumb: pack.thumb || ''
  };
}

function mfDeserialize(o) {
  if (!o || o.magic !== CFG.MAGIC) throw new Error('不是有效的 .mfmap 文件（文件头不匹配）');
  let pack;
  if (o.worlds && o.worlds.length) {
    pack = {
      magic: CFG.MAGIC, schemaVersion: o.schemaVersion || CFG.SCHEMA,
      meta: Object.assign({ id: uid('map'), name: '导入的地图', createdAt: Date.now(), modifiedAt: Date.now() }, o.meta || {}),
      worlds: o.worlds.map(mfDeserializeWorld),
      cur: o.cur || 0,
      library: o.library || [],
      thumb: o.thumb || ''
    };
  } else if (o.grid) {
    /* 兼容旧版单世界地图包 */
    const w = mfDeserializeWorld(o);
    w.name = '当前时代';
    pack = {
      magic: CFG.MAGIC, schemaVersion: o.schemaVersion || 1,
      meta: Object.assign({ id: uid('map'), name: '导入的地图', createdAt: Date.now(), modifiedAt: Date.now() }, o.meta || {}),
      worlds: [w], cur: 0,
      library: o.library || [],
      thumb: o.thumb || ''
    };
  } else throw new Error('地图包缺少栅格数据');
  return mfLinkWorlds(pack);
}

/* ---------------------------------------------------------- 时代模板 ------ */
/* 模板全局保存（跨地图可用）：{id,name,thumb,createdAt,world:序列化后的时代} */
const K_TPL = 'mapforge:templates';
async function mfLoadTemplates() {
  try { const v = await ST.get(K_TPL); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
async function mfSaveTemplates(list) { try { await ST.put(K_TPL, list); } catch (e) { console.warn(e); } }
async function mfTemplateAdd(world, name, thumb) {
  const list = await mfLoadTemplates();
  const t = { id: uid('t'), name: name || world.name || '未命名模板', thumb: thumb || '', createdAt: Date.now(), world: mfSerializeWorld(world) };
  list.push(t);
  await mfSaveTemplates(list);
  return t;
}
async function mfTemplateDel(id) {
  let list = await mfLoadTemplates();
  list = list.filter((x) => x.id !== id);
  await mfSaveTemplates(list);
}
/* 模板 → 可编辑的时代对象 */
function mfTemplateToWorld(t, name) {
  const w = mfDeserializeWorld(t.world);
  w.id = uid('w'); w.name = name || t.name; w.thumb = '';
  return w;
}

/* ---------------------------------------------------------- 版本快照 ------ */
/* 防误删势力 / 误填充 / 误删时代的安全网：每张地图最多 CFG.MAX_SNAP 份快照。
 * 存的是完整序列化数据（去掉缩略图，省空间），回滚＝反序列化出一份 pack。
 * 一条快照 = { id, t, label, thumb, data } ，键：mapforge:snap:<地图id> */
const K_SNAP = (mapId) => 'mapforge:snap:' + mapId;
async function mfSnapList(mapId) {
  try { const v = await ST.get(K_SNAP(mapId)); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
async function mfSnapWrite(mapId, list) {
  try { await ST.put(K_SNAP(mapId), list); } catch (e) { console.warn(e); }
}
/* 去掉缩略图后再存：缩略图是 dataURL，往往是包里体积最大的单项 */
function mfStripThumb(o) {
  if (!o) return o;
  const c = JSON.parse(JSON.stringify(o));
  c.thumb = '';
  (c.worlds || []).forEach((w) => { w.thumb = ''; });
  return c;
}
async function mfSnapPush(pack, label) {
  if (!pack || !pack.meta || !ST) return null;
  try {
    const list = await mfSnapList(pack.meta.id);
    const snap = {
      id: uid('s'), t: Date.now(), label: label || '',
      thumb: pack.thumb || '', eras: (pack.worlds || []).length,
      data: mfStripThumb(mfSerialize(pack))
    };
    list.push(snap);
    while (list.length > CFG.MAX_SNAP) list.shift();   // 超出就挤掉最旧的
    await mfSnapWrite(pack.meta.id, list);
    return snap;
  } catch (e) { console.warn(e); return null; }
}
/* 回滚：先把「当前的我」也留一份快照，避免滚过去就回不来 */
async function mfSnapRestore(pack, snapId) {
  if (!pack || !pack.meta || !ST) throw new Error('当前没有打开的地图');
  const list = await mfSnapList(pack.meta.id);
  const hit = list.filter((s) => s.id === snapId)[0];
  if (!hit) throw new Error('找不到这个快照');
  const backupLabel = '回滚前自动备份';
  await mfSnapPush(pack, backupLabel);
  const fresh = mfDeserialize(hit.data);
  /* 保持同一张地图的身份：id / 名称 / 创建时间不变，只换内容 */
  fresh.meta.id = pack.meta.id;
  fresh.meta.name = pack.meta.name;
  fresh.meta.createdAt = pack.meta.createdAt;
  fresh.thumb = hit.thumb || '';
  return mfLinkWorlds(fresh);
}
async function mfSnapDel(mapId, snapId) {
  let list = await mfSnapList(mapId);
  list = list.filter((s) => s.id !== snapId);
  await mfSnapWrite(mapId, list);
}
async function mfSnapClear(mapId) { await mfSnapWrite(mapId, []); }

/* ------------------------------------------------------------ 持久化 ------ */
/* 运行时由 init 注入：ST = ctx.store（IndexedDB），KEY 前缀统一 mapforge: */
let ST = null, CTXREF = null;
const K_INDEX = 'mapforge:index';

async function mfSaveIndex(list) { try { await ST.put(K_INDEX, list); } catch (e) { console.warn(e); } }
async function mfLoadIndex() {
  try { const v = await ST.get(K_INDEX); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
async function mfSaveMap(m) {
  const t0 = Date.now();
  m.meta.modifiedAt = t0;
  try { await ST.put('mapforge:map:' + m.meta.id, mfSerialize(m)); }
  catch (e) { console.warn(e); throw new Error('保存失败：' + (e && e.message || e)); }
  let idx = await mfLoadIndex();
  const i = idx.findIndex((x) => x.id === m.meta.id);
  const rec = {
    id: m.meta.id, name: m.meta.name, modifiedAt: t0, createdAt: m.meta.createdAt,
    thumb: m.thumb || '', eras: (m.worlds || []).length
  };
  if (i >= 0) idx[i] = rec; else idx.push(rec);
  await mfSaveIndex(idx);
  return t0;
}
async function mfLoadMap(id) {
  const o = await ST.get('mapforge:map:' + id);
  if (!o) throw new Error('找不到地图 ' + id);
  return mfDeserialize(o);
}
async function mfDelMap(id) {
  try { await ST.del('mapforge:map:' + id); } catch (e) { }
  try { await mfSnapClear(id); } catch (e) { }   /* 连带清掉快照，不留孤儿数据 */
  let idx = await mfLoadIndex();
  idx = idx.filter((x) => x.id !== id);
  await mfSaveIndex(idx);
}

/* ------------------------------------------------------- 资料条目工具 ---- */
/* 势力栏目与资料库是「同一份数据的两个视图」：这里把势力栏目映射成条目视图
 * 注意：资料库在 pack 上（跨时代共享），势力栏目分散在 pack.worlds 各时代里 */
function mfLibOf(m) {
  if (m && m.worlds) { m.library = m.library || []; return m.library; }   // pack
  if (S.pack) { S.pack.library = S.pack.library || []; return S.pack.library; }  // world → 找到它的 pack
  m.library = m.library || [];
  return m.library;
}
/* 迭代一张地图包里的所有时代（若传进来的是单个时代，就只迭代它自己） */
function mfWorldsOf(m) {
  if (m && m.worlds && m.worlds.length) return m.worlds;
  return [m];
}
function mfLibEntries(pack) {
  const out = [];
  const lib = mfLibOf(pack);
  lib.forEach((e) => out.push({
    key: 'lib:' + e.id, kind: 'lib', title: e.title || '未命名条目',
    body: e.body || '', get: () => e.body || '', set: (v) => { e.body = v; }, entry: e
  }));
  mfWorldsOf(pack).forEach((wd) => {
    (wd.polities || []).forEach((p) => {
      (p.fields || []).forEach((f) => {
        if (f.kind === 'text') {
          out.push({
            key: 'pf:' + p.id + ':' + f.id, kind: 'field', polityId: p.id, polityName: p.name,
            eraId: wd.id, eraName: wd.name,
            title: p.name + ' · ' + (f.title || '未命名栏目'),
            body: f.text || '', get: () => f.text || '', set: (v) => { f.text = v; }, field: f
          });
        } else {
          (f.links || []).forEach((kw) => {
            out.push({
              key: 'kw:' + p.id + ':' + f.id + ':' + kw.id, kind: 'keyword', polityId: p.id, polityName: p.name,
              eraId: wd.id, eraName: wd.name,
              title: (kw.label || '未命名关键词'), body: mfKeywordBody(pack, kw),
              get: () => mfKeywordBody(pack, kw), set: (v) => mfKeywordSetBody(pack, kw, v),
              field: f, kw: kw
            });
          });
        }
      });
    });
  });
  return out;
}
/* 关键词链接指向的资料条目：没有就自动建一个 */
function mfKeywordEntry(m, kw) {
  const lib = mfLibOf(m);
  let e = lib.find((x) => x.id === kw.entryId);
  if (!e) { e = { id: uid('e'), title: kw.label || '未命名关键词', body: '' }; lib.push(e); kw.entryId = e.id; }
  return e;
}
function mfKeywordBody(m, kw) { return mfKeywordEntry(m, kw).body || ''; }
function mfKeywordSetBody(m, kw, v) { mfKeywordEntry(m, kw).body = v; }
/* 只看不建：渲染搜索结果 / 标签头像时用，避免为了取数据凭空多出一条空条目 */
function mfEntryOfKw(m, kw) {
  if (!kw) return null;
  const lib = mfLibOf(m);
  return lib.filter((x) => x.id === kw.entryId)[0] || null;
}

/* 统计：资料栏目数 / 关键词数 / 字数 / 图片数 / 评论数（跨全部时代） */
function mfLibStats(pack) {
  let fields = 0, kws = 0, chars = 0, imgs = 0, cmts = 0;
  /* 同一条资料可能被多个关键词引用，去重后再累加，否则重复计一遍 */
  const seen = Object.create(null);
  function touch(e) {
    if (!e || seen[e.id]) return false;
    seen[e.id] = 1;
    imgs += mfEntryImgs(e).length;
    cmts += mfEntryCmts(e).length;
    return true;
  }
  mfLibOf(pack).forEach((e) => {
    fields++; chars += (e.body || '').length + (e.title || '').length;
    touch(e);
  });
  mfWorldsOf(pack).forEach((wd) => (wd.polities || []).forEach((p) => (p.fields || []).forEach((f) => {
    fields++;
    if (f.kind === 'text') chars += (f.text || '').length;
    else (f.links || []).forEach((kw) => {
      kws++;
      const en = mfEntryOfKw(pack, kw);
      if (touch(en)) chars += (en.body || '').length;
    });
  })));
  return { fields: fields, kws: kws, chars: chars, imgs: imgs, cmts: cmts };
}

/* ------------------------------------------------- 跨时代定位（给搜索用） -- */
/* 某个势力 / 标签 / 地形属于哪个时代：搜索命中后要先切到那个时代再跳转 */
function mfWorldOfPolity(pid) {
  const pk = S.pack; if (!pk || !pid) return null;
  for (let i = 0; i < pk.worlds.length; i++) {
    const p = (pk.worlds[i].polities || []).find((x) => x.id === pid);
    if (p) return { index: i, world: pk.worlds[i], polity: p };
  }
  return null;
}
/* 跨时代找势力（资料库与搜索用：某条资料可能属于别的时代） */
function mfFindPolityAny(id) {
  const inCur = (S.map && S.map.polities) ? S.map.polities.find((x) => x.id === id) : null;
  if (inCur) return inCur;
  const hit = mfWorldOfPolity(id);
  return hit ? hit.polity : null;
}
function mfWorldOfLabel(l) {
  const pk = S.pack; if (!pk || !l) return null;
  for (let i = 0; i < pk.worlds.length; i++) {
    if ((pk.worlds[i].labels || []).indexOf(l) >= 0) return { index: i, world: pk.worlds[i] };
  }
  return null;
}
function mfWorldOfTerrain(t) {
  const pk = S.pack; if (!pk || !t) return null;
  for (let i = 0; i < pk.worlds.length; i++) {
    if ((pk.worlds[i].terrains || []).indexOf(t) >= 0) return { index: i, world: pk.worlds[i], terrainIndex: pk.worlds[i].terrains.indexOf(t) };
  }
  return null;
}

/* 默认势力简介栏目（除名字外全部空白） */
function mfDefaultFields() {
  return [
    { id: uid('f'), kind: 'text', title: '首领', text: '' },
    { id: uid('f'), kind: 'text', title: '名人', text: '' },
    { id: uid('f'), kind: 'text', title: '疆域', text: '' },
    { id: uid('f'), kind: 'text', title: '简介', text: '' }
  ];
}

/* ===================== 30_scene.js ===================== */
/* ==========================================================================
 * 场景层：three.js 场景（复用宿主同一实例）+ 星空 + 空白球 + 拾取
 * 相机参数与宿主地球地图保持一致：PerspectiveCamera(36,1,0.02,400)
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * MfMiniOrbit：极简轨道控制器（OrbitControls 备用实现）
 * 背景：2026-10-13 实测宿主只暴露 __threeNS__（three.js 完整命名空间），
 *       __OrbitControls__ 键存在但值为 undefined，故内置本兜底实现。
 * 覆盖模块实际用到的 API：旋转/滚轮缩放/平移、damping、autoRotate、
 * min/maxDistance、min/maxPolarAngle、mouseButtons/touches 映射、
 * update()/dispose()；相机被外部直接改位时下一帧自动同步球坐标。
 * 动作编号对齐 THREE.MOUSE：ROTATE=0 / DOLLY=1 / PAN=2（-1 表示禁用）。
 * ------------------------------------------------------------------------ */
function MfMiniOrbit(camera, dom) {
  const self = this;
  this.object = camera; this.dom = dom;
  this.target = new THREE.Vector3();
  this.enabled = true;
  this.enableDamping = false; this.dampingFactor = 0.08;
  this.rotateSpeed = 1.0; this.zoomSpeed = 1.0;
  this.enablePan = true; this.panSpeed = 1.0; this.screenSpacePanning = true;
  this.autoRotate = false; this.autoRotateSpeed = 2.0;
  this.minDistance = 0.02; this.maxDistance = 400;
  this.minPolarAngle = 0; this.maxPolarAngle = Math.PI;
  this.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
  this.touches = { ONE: 0, TWO: 2 };

  let dTheta = 0, dPhi = 0, scale = 1, pinchDist = 0;
  const panOff = new THREE.Vector3();
  const pointers = new Map();
  const _p = new THREE.Vector3(), _u = new THREE.Vector3();

  function act(btn) {
    const b = self.mouseButtons || {};
    const v = btn === 0 ? b.LEFT : btn === 1 ? b.MIDDLE : b.RIGHT;
    return (v === 0 || v === 1 || v === 2) ? v : -1;
  }
  function pan(dx, dy) {
    if (!self.enablePan) return;
    const dist = self.object.position.distanceTo(self.target);
    const h = 2 * dist * Math.tan((self.object.fov || 40) * Math.PI / 360);
    const w = h * (self.object.aspect || 1);
    _p.setFromMatrixColumn(self.object.matrix, 0)
      .multiplyScalar(-dx * self.panSpeed * w / Math.max(1, dom.clientWidth));
    panOff.add(_p);
    _u.setFromMatrixColumn(self.object.matrix, 1)
      .multiplyScalar(dy * self.panSpeed * h / Math.max(1, dom.clientHeight));
    panOff.add(_u);
  }
  function onDown(e) {
    if (!self.enabled) return;
    try { dom.setPointerCapture && dom.setPointerCapture(e.pointerId); } catch (err) { }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, t: e.pointerType });
    if (pointers.size === 2) {
      const p = Array.from(pointers.values());
      pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
  }
  function onMove(e) {
    const pt = pointers.get(e.pointerId);
    if (!pt) return;
    const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
    pt.x = e.clientX; pt.y = e.clientY;
    if (!self.enabled) return;
    if (pointers.size === 1) {
      const a = pt.t === 'touch'
        ? (self.touches.ONE === 1 ? 2 : self.touches.ONE === 0 ? 0 : -1)
        : act(pt.b);
      if (a === 0) {
        dTheta -= (2 * Math.PI * dx / Math.max(1, dom.clientHeight)) * self.rotateSpeed;
        dPhi -= (2 * Math.PI * dy / Math.max(1, dom.clientHeight)) * self.rotateSpeed;
      } else if (a === 1) {
        scale *= Math.pow(0.95, self.zoomSpeed * (dy > 0 ? -1 : 1));
      } else if (a === 2) {
        pan(dx, dy);
      }
    } else if (pointers.size === 2) {
      const p = Array.from(pointers.values());
      const nd = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinchDist > 0 && nd > 0) scale *= Math.pow(pinchDist / nd, self.zoomSpeed);
      pinchDist = nd;
      if (self.touches.TWO === 1 || self.touches.TWO === 2) pan(dx * 0.5, dy * 0.5);
    }
  }
  function onUp(e) { pointers.delete(e.pointerId); pinchDist = 0; }
  function onWheel(e) {
    if (!self.enabled) return;
    e.preventDefault();
    scale *= Math.pow(0.95, self.zoomSpeed * (e.deltaY < 0 ? 1 : -1));
  }
  function onCtx(e) { e.preventDefault(); }

  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);
  dom.addEventListener('wheel', onWheel, { passive: false });
  dom.addEventListener('contextmenu', onCtx);

  this.update = function () {
    if (self.autoRotate && pointers.size === 0) {
      dTheta -= (2 * Math.PI / 3600) * self.autoRotateSpeed; /* 2.0 ≈ 30 秒/圈 */
    }
    _u.subVectors(self.object.position, self.target);
    let r = _u.length();
    let theta = Math.atan2(_u.x, _u.z);
    let phi = Math.acos(clamp(_u.y / Math.max(1e-9, r), -1, 1));
    theta += dTheta; phi += dPhi; r *= scale;
    phi = clamp(phi, self.minPolarAngle, self.maxPolarAngle);
    r = clamp(r, self.minDistance, self.maxDistance);
    self.target.add(panOff);
    const sinPhi = Math.sin(phi) * r;
    self.object.position.set(
      self.target.x + sinPhi * Math.sin(theta),
      self.target.y + Math.cos(phi) * r,
      self.target.z + sinPhi * Math.cos(theta)
    );
    self.object.lookAt(self.target);
    if (self.enableDamping) {
      const k = 1 - self.dampingFactor;
      dTheta *= k; dPhi *= k; panOff.multiplyScalar(k);
      scale = 1 + (scale - 1) * k;
    } else {
      dTheta = 0; dPhi = 0; panOff.set(0, 0, 0); scale = 1;
    }
    return true;
  };
  this.dispose = function () {
    dom.removeEventListener('pointerdown', onDown);
    dom.removeEventListener('pointermove', onMove);
    dom.removeEventListener('pointerup', onUp);
    dom.removeEventListener('pointercancel', onUp);
    dom.removeEventListener('wheel', onWheel);
    dom.removeEventListener('contextmenu', onCtx);
    pointers.clear();
  };
}

let THREE = null, OrbitControls = null;
function mfEnsureThree() {
  if (THREE && OrbitControls) return true;
  /* 2026-10-13 实测：宿主挂的是 __threeNS__（__three__/__THREE__ 为空占位） */
  THREE = globalThis.__threeNS__ || globalThis.__three__ || globalThis.__THREE__ || null;
  /* __OrbitControls__ 实测为 undefined：用内置 MfMiniOrbit 兜底，双保险 */
  OrbitControls = globalThis.__OrbitControls__ || MfMiniOrbit;
  return !!(THREE && OrbitControls && THREE.WebGLRenderer);
}

/* 场景运行期对象 */
const S = {
  ok: false, scene: null, camera: null, renderer: null, controls: null,
  sphere: null, geo: null, mat: null, stars: null, canvas: null, gridDecal: null,
  pack: null,               // 当前地图包（含全部时代 + 资料库）
  map: null,                // 当前时代（= S.pack.worlds[S.pack.cur]）
  segIdx: CFG.SEG_DEF,
  dirtyColor: false, dirtyPos: false,
  dirtyContour: false      // 平滑边界需要重抽（扫全栅格，别每帧做）
};

/* 相机最小距离：由「屏幕上 1cm = 实际 10km」反推 */
const MF_TANHALF = 2 * Math.tan(CFG.FOV / 2 * D2R);   // 0.6494
function mfMinDist() {
  const H = (S.canvas && S.canvas.clientHeight) || innerHeight || 800;
  const kmView = CFG.KM_PER_CM * H / CFG.PX_PER_CM;   // 屏幕高对应的地面公里数
  return CFG.R + (kmView / CFG.KM_PER_R) / MF_TANHALF;
}
/* 当前视野：屏幕 1cm 对应的公里数（给滑条读数用） */
function mfKmPerCm() {
  if (!S.camera) return 0;
  const d = S.camera.position.length();
  const H = (S.canvas && S.canvas.clientHeight) || innerHeight || 800;
  return (MF_TANHALF * Math.max(1e-4, d - CFG.R)) * CFG.KM_PER_R / (H / CFG.PX_PER_CM);
}

/* 经纬网格纹理：透明底 + 白色细网格线（漂浮层贴图）。缓存一份，全场景共用 */
let _gridTex = null;
function mfGridTexture() {
  if (_gridTex) return _gridTex;
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);   /* 透明底：只留网格线，贴漂浮层用 */
  g.lineWidth = 2;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = (lon + 180) / 360 * c.width;
    g.strokeStyle = (lon === 0) ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.16)';
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = (90 - lat) / 180 * c.height;
    g.strokeStyle = (lat === 0) ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.16)';
    g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  _gridTex = t;
  return t;
}

/* 方案 2.3：经纬网格线贴图是「可选开关」 */
function mfGridWanted() {
  try { return CTXREF && CTXREF.settings ? CTXREF.settings.get('showGrid') !== false : true; }
  catch (e) { return true; }
}
function mfSyncGridTexture() {
  if (!THREE) return;
  if (S.gridDecal) S.gridDecal.visible = mfGridWanted();
  if (UI.gridBtn) UI.gridBtn.classList.toggle('on', mfGridWanted());
}

/* ============================================================== 星空 ======
 * 真实星空靠三件事立住，缺一件看着就假：
 *   ① 星等分布——暗星数量是亮星的几百倍（累积 N(<m) ∝ 10^(0.6m)）。
 *      所以按星等切成 8 层抽样，每层一个固定点尺寸：最亮那层十几颗，
 *      最暗那层四千多颗。层越小就越密，这才撑得起「随机但真实」的密度
 *   ② 银河带——沿一个大圆（银道面）星点明显聚集，其余天区稀疏。
 *      只在球面上撒均匀随机点的话密度处处相等，一眼就看出是假的
 *   ③ 色温——肉眼可见星以黄白为主，掺少量蓝白与橙红，绝不能一片纯白
 * 各层半径从 152 到 235 拉开，相机推拉时近层微动、远层几乎不动＝轻微视差
 * ------------------------------------------------------------------------ */
const MF_STAR_LAYERS = [
  { m0: -1.8, m1: 1.0, n: 14,   size: 3.8,  R: 235 },
  { m0: 1.0,  m1: 2.6, n: 60,   size: 3.0,  R: 228 },
  { m0: 2.6,  m1: 3.6, n: 155,  size: 2.5,  R: 218 },
  { m0: 3.6,  m1: 4.5, n: 430,  size: 2.0,  R: 206 },
  { m0: 4.5,  m1: 5.2, n: 920,  size: 1.65, R: 194 },
  { m0: 5.2,  m1: 5.9, n: 1850, size: 1.4,  R: 180 },
  { m0: 5.9,  m1: 6.6, n: 3100, size: 1.25, R: 166 },
  { m0: 6.6,  m1: 7.5, n: 4300, size: 1.15, R: 152 }
];

/* B−V 色指数 → RGB（黑体色温的简化查表，区间内线性插值） */
const MF_BV = [
  [-0.40, 0.53, 0.67, 1.00], [-0.15, 0.59, 0.73, 1.00], [0.10, 0.73, 0.81, 1.00],
  [0.32, 0.90, 0.93, 1.00], [0.58, 1.00, 0.98, 0.93], [0.82, 1.00, 0.90, 0.74],
  [1.10, 1.00, 0.79, 0.57], [1.45, 1.00, 0.67, 0.43], [1.85, 1.00, 0.56, 0.34]
];
function mfBVtoRGB(bv) {
  const t = MF_BV;
  if (bv <= t[0][0]) return [t[0][1], t[0][2], t[0][3]];
  for (let i = 1; i < t.length; i++) {
    if (bv <= t[i][0]) {
      const a = t[i - 1], b = t[i], k = (bv - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
    }
  }
  const z = t[t.length - 1];
  return [z[1], z[2], z[3]];
}
/* 抽一个色指数：黄白为主（F/G 型），两边各掺一部分蓝白与橙红 */
function mfStarBV() {
  const r = Math.random();
  if (r < 0.12) return -0.32 + Math.random() * 0.46;                      /* O/B/A 型蓝白 */
  if (r < 0.74) return 0.16 + (Math.random() + Math.random() - 1) * 0.72; /* F/G 型黄白主群 */
  return 1.02 + (Math.random() + Math.random() - 1) * 0.72;               /* K/M 型橙红 */
}
/* 标准正态（Box–Muller），银河带的银纬要按高斯散开 */
function mfGauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/* 星等 → 视亮度。真实跨度上百倍，显示器放不下；
 * 这里把 2.2 个星等压成一半，既留住层次又不会让暗星全黑 */
function mfMagAlpha(m) {
  /* 下限 0.11：加性混合下 alpha 太低、点尺寸又 <1px 时会二次衰减，
   * 成片看只剩噪点感；抬到 0.11 才是"满天星"而不是"背景噪点" */
  return clamp(Math.pow(2.512, -(m - 1.0) / 2.2), 0.11, 1);
}

function mfBuildStars() {
  const grp = new THREE.Group();

  /* 银道面：一个法向 + 面内两个正交基（决定银河带斜跨天球的角度） */
  const nv = (function () {
    const v = [-0.38, 0.86, 0.34], L = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / L, v[1] / L, v[2] / L];
  })();
  const seed = Math.abs(nv[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  const ds = seed[0] * nv[0] + seed[1] * nv[1] + seed[2] * nv[2];
  const U = (function () {
    const t = [seed[0] - ds * nv[0], seed[1] - ds * nv[1], seed[2] - ds * nv[2]];
    const L = Math.hypot(t[0], t[1], t[2]);
    return [t[0] / L, t[1] / L, t[2] / L];
  })();
  const V = [nv[1] * U[2] - nv[2] * U[1], nv[2] * U[0] - nv[0] * U[2], nv[0] * U[1] - nv[1] * U[0]];

  /* 球面均匀方向 */
  function dirUniform(out) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    out[0] = r * Math.cos(th); out[1] = u; out[2] = r * Math.sin(th);
  }
  /* 银河方向：银经均匀，银纬按高斯散开（75% 落在薄盘 σ≈8.5°，其余在更厚的晕里） */
  function dirGalactic(out) {
    const l = Math.random() * Math.PI * 2;
    const b = clamp(mfGauss() * (Math.random() < 0.25 ? 24 : 8.5), -89, 89) * D2R;
    const cb = Math.cos(b), sb = Math.sin(b), cl = Math.cos(l), sl = Math.sin(l);
    out[0] = cb * cl * U[0] + cb * sl * V[0] + sb * nv[0];
    out[1] = cb * cl * U[1] + cb * sl * V[1] + sb * nv[1];
    out[2] = cb * cl * U[2] + cb * sl * V[2] + sb * nv[2];
  }
  /* 星等抽样：区间内不能直接均匀随机——要按 N ∝ 10^(0.6m) 做 CDF 反演 */
  function magIn(m0, m1) {
    const a = Math.pow(10, 0.6 * m0), b = Math.pow(10, 0.6 * m1);
    return Math.log10(a + Math.random() * (b - a)) / 0.6;
  }

  const bags = MF_STAR_LAYERS.map(() => []);
  function push(dx, dy, dz, mag) {
    let li = MF_STAR_LAYERS.length - 1;
    for (let k = 0; k < MF_STAR_LAYERS.length; k++) {
      const L = MF_STAR_LAYERS[k];
      if (mag >= L.m0 && mag < L.m1) { li = k; break; }
    }
    const a = mfMagAlpha(mag), c = mfBVtoRGB(mfStarBV());
    bags[li].push(dx, dy, dz, c[0] * a, c[1] * a, c[2] * a);
  }

  const d = [0, 0, 0];
  /* ① 全天均匀底场 */
  MF_STAR_LAYERS.forEach((L) => {
    for (let i = 0; i < L.n; i++) { dirUniform(d); push(d[0], d[1], d[2], magIn(L.m0, L.m1)); }
  });
  /* ② 银河带：全是 5.4～7.5 等的暗弱背景星，堆出那条雾一样的白带 */
  for (let i = 0; i < CFG.MW_STARS; i++) {
    dirGalactic(d);
    push(d[0], d[1], d[2], 5.4 + Math.random() * 2.1);
  }
  /* ③ 疏散星团：一小块天区里密集挤几十颗（肉眼能看出的那种小星团） */
  for (let c = 0; c < CFG.STAR_CLUSTERS; c++) {
    dirUniform(d);
    const cx = d[0], cy = d[1], cz = d[2];
    /* 切平面正交基 A、B */
    let ax = -cy, ay = cx, az = 0;
    let AL = Math.hypot(ax, ay, az);
    if (AL < 1e-6) { ax = 1; ay = 0; az = 0; AL = 1; }
    ax /= AL; ay /= AL; az /= AL;
    const bx = cy * az - cz * ay, by = cz * ax - cx * az, bz = cx * ay - cy * ax;
    const CN = 22 + Math.floor(Math.random() * 22), spread = 1.1 + Math.random() * 1.4;
    for (let i = 0; i < CN; i++) {
      const ang = Math.abs(mfGauss()) * spread * 0.55 * D2R;   /* 中心密、边缘疏 */
      const th = Math.random() * Math.PI * 2, t = Math.tan(ang);
      const cq = Math.cos(th), sq = Math.sin(th);
      let ox = cx + t * (cq * ax + sq * bx);
      let oy = cy + t * (cq * ay + sq * by);
      let oz = cz + t * (cq * az + sq * bz);
      const OL = Math.hypot(ox, oy, oz) || 1;
      push(ox / OL, oy / OL, oz / OL, 4.6 + Math.random() * 2.4);
    }
  }

  bags.forEach((bag, li) => {
    const nS = bag.length / 6;
    if (!nS) return;
    const pos = new Float32Array(nS * 3), col = new Float32Array(nS * 3);
    const R = MF_STAR_LAYERS[li].R;
    for (let i = 0; i < nS; i++) {
      pos[i * 3] = bag[i * 6] * R; pos[i * 3 + 1] = bag[i * 6 + 1] * R; pos[i * 3 + 2] = bag[i * 6 + 2] * R;
      col[i * 3] = bag[i * 6 + 3]; col[i * 3 + 1] = bag[i * 6 + 4]; col[i * 3 + 2] = bag[i * 6 + 5];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: MF_STAR_LAYERS[li].size, sizeAttenuation: false, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    grp.add(p);
  });
  grp.renderOrder = -1;
  return grp;
}

function mfSceneCreate(hostEl) {
  if (!mfEnsureThree()) return false;
  const cv = mfNode('canvas', 'mf-cv');
  hostEl.appendChild(cv);
  MF_DOM.push(cv);
  S.canvas = cv;

  /* 显卡打盹守卫：上下文丢了拦住默认行为，醒了原地重建，不必整页刷新 */
  cv.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (CTXREF) CTXREF.toast('显卡打了个盹，正在唤醒它……', 3000);
  }, false);
  cv.addEventListener('webglcontextrestored', () => {
    try { mfSceneRecover(); if (CTXREF) CTXREF.toast('显卡醒了，地图完好如初', 2600, 'ok'); }
    catch (e) { console.warn(e); }
  }, false);

  let renderer;
  try {
    /* preserveDrawingBuffer：让 toDataURL 能拿到画面（地图缩略图要用） */
    renderer = new THREE.WebGLRenderer({
      canvas: cv, antialias: true, alpha: false,
      preserveDrawingBuffer: true, powerPreference: 'high-performance'
    });
  } catch (e) {
    throw new Error('WebGL 初始化失败：' + (e && e.message || e));
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
  renderer.setClearColor(0x05070d, 1);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  S.renderer = renderer;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CFG.FOV, 1, CFG.NEAR, CFG.FAR);
  camera.position.set(0.6, 0.9, 2.4);
  S.scene = scene; S.camera = camera;

  scene.add(new THREE.AmbientLight(0xffffff, 0.92));
  const sun = new THREE.DirectionalLight(0xfff6e2, 0.85);
  sun.position.set(5, 3.2, 4.5);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 0.28);
  rim.position.set(-4, -2, -5);
  scene.add(rim);

  S.stars = mfBuildStars();
  scene.add(S.stars);

  mfBuildSphere();

  const controls = new OrbitControls(camera, cv);
  controls.rotateSpeed = 0.72;
  controls.zoomSpeed = 1.0;
  controls.enablePan = true;
  controls.panSpeed = 0.6;
  controls.screenSpacePanning = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = mfMinDist();
  controls.maxDistance = CFG.MAX_DIST;
  controls.minPolarAngle = -0.35;
  controls.maxPolarAngle = Math.PI + 0.35;
  controls.target.set(0, 0, 0);
  S.controls = controls;
  mfSyncControls();

  S.ok = true;
  mfSceneResize();
  return true;
}

function mfBuildSphere() {
  if (S.sphere) {
    S.scene.remove(S.sphere);
    S.geo.dispose(); S.mat.dispose();
    if (S.gridDecal) { S.gridDecal.geometry.dispose(); S.gridDecal.material.dispose(); S.gridDecal = null; }
    S.sphere = null;
  }
  const seg = CFG.SEG[S.segIdx] || CFG.SEG[CFG.SEG_DEF];
  const geo = new THREE.SphereGeometry(CFG.R, seg[0], seg[1]);
  const n = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.86, metalness: 0.0, flatShading: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  S.scene.add(mesh);
  S.geo = geo; S.mat = mat; S.sphere = mesh;
  /* 经纬网格：漂浮在球面上方的一薄层透明膜。画笔颜色、地形起伏、建模都在它下面，
   * 不受它遮挡；它自身不响应灯光，恒亮白线，像一层悬浮的坐标网 */
  const dgeo = new THREE.SphereGeometry(CFG.R * 1.0022, 72, 48);
  const dmat = new THREE.MeshBasicMaterial({ map: mfGridTexture(), transparent: true, depthWrite: false });
  const decal = new THREE.Mesh(dgeo, dmat);
  decal.frustumCulled = false;
  decal.visible = mfGridWanted();
  mesh.add(decal);
  S.gridDecal = decal;
  S.dirtyColor = true;
}

/* 鼠标/触摸的按键分工：
 *   浏览态（未选工具）：左键拖动＝旋转（与地球地图一致）
 *   编辑态（选中了笔）：左键＝作画，右键拖动＝旋转球体
 *   ⚠ 不这样区分的话，作画时球体会跟着一起转，笔画会飘、画完的内容还会被转出视野 */
/* 设置项：是否把「左键作画 / 右键旋转」对调（左撇子 & 习惯左手转球的人） */
function mfMouseSwap() {
  try { return !!(CTXREF && CTXREF.settings && CTXREF.settings.get('swapLR') === true); }
  catch (e) { return false; }
}
function mfSyncControls() {
  if (!S.controls || !THREE) return;
  /* 选中了笔、或选中了一个建模实例时，左键都归编辑器，不能再去转球 */
  const busy = ED.edit && (!!ED.selInst || !!ED.reshape || (!!ED.tool && ED.tool !== 'model'));
  const swap = mfMouseSwap();
  const R = THREE.MOUSE.ROTATE, D = THREE.MOUSE.DOLLY, P = THREE.MOUSE.PAN;
  const T_ROT = THREE.TOUCH.ROTATE, T_DP = THREE.TOUCH.DOLLY_PAN;
  if (busy) {
    if (!swap) {                       /* 默认：左键作画 · 右键旋转 */
      S.controls.mouseButtons = { LEFT: null, MIDDLE: D, RIGHT: R };
      S.controls.touches = { ONE: null, TWO: T_DP };
    } else {                           /* 互换：左键旋转 · 右键作画 */
      S.controls.mouseButtons = { LEFT: R, MIDDLE: D, RIGHT: null };
      S.controls.touches = { ONE: T_ROT, TWO: T_DP };
    }
  } else {
    S.controls.mouseButtons = { LEFT: R, MIDDLE: D, RIGHT: P };
    S.controls.touches = { ONE: T_ROT, TWO: T_DP };
  }
  S.controls.enablePan = !busy;
}

function mfSceneResize() {
  if (!S.ok || !S.canvas) return;
  const w = S.canvas.clientWidth || innerWidth, h = S.canvas.clientHeight || innerHeight;
  S.camera.aspect = w / Math.max(1, h);
  S.camera.updateProjectionMatrix();
  S.renderer.setSize(w, h, false);
  if (S.controls) S.controls.minDistance = mfMinDist();
}

/* ---------------------------------------------------- 顶点着色（核心） ---- */
/* 优先级：地形色 > 势力色（半透明叠加 + 边境暗线） > 陆海区域色 */
let _colCache = null;
function mfRefreshColors() {
  if (!S.ok || !S.map || !S.geo) return;
  const geo = S.geo, col = geo.attributes.color, uv = geo.attributes.uv, pos = geo.attributes.position;
  const n = pos.count;
  const g = S.map.grid;
  const terrains = S.map.terrainColor || null;
  const polities = S.map.polities;
  /* seq → 势力 的映射（⚠ 不能直接用 polities[seq-1]：删除势力后数组会错位） */
  const seqMap = new Map();
  for (let i = 0; i < polities.length; i++) seqMap.set(polities[i].seq, polities[i]);
  /* 预解势力颜色：按 seq 存，键为 seq */
  const pcol = new Map();
  for (let i = 0; i < polities.length; i++) {
    const c = hexToRgb(polities[i].color);
    pcol.set(polities[i].seq, [c, [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55]]);
  }
  /* 预解区域色 */
  const rcol = [hexToRgb(CFG.REGION[0].c), hexToRgb(CFG.REGION[1].c), hexToRgb(CFG.REGION[2].c), hexToRgb(CFG.REGION[3].c)];
  /* 预解地形色 */
  const tcol = [null];
  for (let i = 0; i < S.map.terrains.length; i++) tcol.push(hexToRgb(S.map.terrains[i].color));

  const arr = col.array;
  const uArr = uv.array, pArr = pos.array;
  const w = g.w, h = g.h;
  for (let i = 0; i < n; i++) {
    const u = uArr[i * 2], v = uArr[i * 2 + 1];
    let lon = u * 360 - 180, lat = v * 180 - 90;
    if (lon >= 180) lon = 179.9999;
    let x = g.xOf(lon), y = g.yOf(lat);
    const ci = y * w + x;
    let r, gg, b;
    const tid = g.terrain[ci];
    if (tid && tcol[tid]) { const c = tcol[tid]; r = c[0]; gg = c[1]; b = c[2]; }
    else { const c = rcol[g.region[ci] || 0]; r = c[0]; gg = c[1]; b = c[2]; }
    /* 水域叠加：湖泊笔涂出的范围（优先级高于陆海与地形色） */
    if (g.water && g.water[ci]) {
      r = r + (111 - r) * 0.78; gg = gg + (168 - gg) * 0.78; b = b + (201 - b) * 0.78;
    }
    /* 沙滩过渡：陆地格子只要有一边挨着海，就染上一层沙色——海岸线从此有了呼吸。
       （涂过地形的格子尊重作者意愿，不染） */
    if ((g.region[ci] || 0) === 1 && !tid) {
      const bxr = x + 1 < w ? ci + 1 : ci - (w - 1);
      const bxl = x > 0 ? ci - 1 : ci + (w - 1);
      const byd = y + 1 < h ? ci + w : ci;
      const byu = y > 0 ? ci - w : ci;
      if (g.region[bxr] === 2 || g.region[bxl] === 2 || g.region[byd] === 2 || g.region[byu] === 2) {
        r = r + (226 - r) * 0.52; gg = gg + (205 - gg) * 0.52; b = b + (155 - b) * 0.52;
      }
    }
    /* 势力叠加（每个时代是独立星球，不再需要时代过滤） */
    const pid = g.polity[ci];
    {
      const ent = pcol.get(pid);
      if (ent) {
        const pc = ent[0], pd = ent[1];
        /* 边境检测：右/下邻居不同势力 → 暗线 */
        let border = false;
        const nx = x + 1 < w ? ci + 1 : ci - (w - 1);
        const ny = y + 1 < h ? ci + w : ci;
        if (g.polity[nx] !== pid || g.polity[ny] !== pid) border = true;
        const t = border ? 0.82 : 0.42;
        const src = border ? pd : pc;
        r = r + (src[0] - r) * t; gg = gg + (src[1] - gg) * t; b = b + (src[2] - b) * t;
      }
    }
    /* 高度明暗：让地形有立体感 */
    if (S.map.height) {
      const hv = S.map.height[ci];
      if (hv) {
        const sh = clamp(1 + hv * 0.00055, 0.72, 1.28);
        r *= sh; gg *= sh; b *= sh;
      }
    }
    /* 涂抹预览：这批格子先上半透浅色，确认后才以全色示人 */
    if (_pvCells && _pvCells.has(ci)) { r += (255 - r) * 0.45; gg += (255 - gg) * 0.45; b += (255 - b) * 0.45; }
    arr[i * 3] = r / 255; arr[i * 3 + 1] = gg / 255; arr[i * 3 + 2] = b / 255;
  }
  col.needsUpdate = true;
  S.dirtyColor = false;
}

/* ------------------------------------------------------------ 重塑星球 ----
 * 直接捏球体本身：在每个渲染顶点上记录径向偏移（S.map.shape，Float32Array，
 * 单位＝球半径的倍数，0.01 ≈ 64km）。地形高度场叠在塑形之上：
 * mfApplyHeight 里先乘塑形、再乘地形高度。
 * 序列化用稀疏（索引 + 量化偏移），标准球形一个字节都不存。 */
function mfShapeOf(w) {
  if (!w || !S.geo) return null;
  const n = S.geo.attributes.position.count;
  if (w.shape instanceof Float32Array && w.shape.length === n) return w.shape;
  /* 序列化来的稀疏数据 → 展开；分段档位对不上（球面网格精度被改过）就放弃并提示一次 */
  const sd = w.shapeData;
  w.shape = null;
  if (sd && sd.idx && sd.idx.length) {
    if ((sd.n || 0) === n) {
      const a = new Float32Array(n);
      for (let i = 0; i < sd.idx.length; i++) a[sd.idx[i]] = sd.off[i] / 8192;
      w.shape = a;
    } else if (!w._shapeWarned) {
      w._shapeWarned = true;
      if (CTXREF) CTXREF.toast('这颗星球的塑形数据与当前球面分段不一致，塑形未应用（把「球面网格精度」调回创作时的档位即可恢复）', 4600);
    }
  }
  return w.shape;
}
function mfShapeEnsure(w) {
  const a = mfShapeOf(w);
  if (a) return a;
  if (!S.geo) return null;
  w.shape = new Float32Array(S.geo.attributes.position.count);
  return w.shape;
}
function mfShapeSerialize(w) {
  const a = (w.shape instanceof Float32Array) ? w.shape : null;
  if (!a) return w.shapeData || null;      /* 本会话没展开过：原样透传 */
  const idx = [], off = [];
  for (let i = 0; i < a.length; i++) {
    const q = Math.round(a[i] * 8192);
    if (q !== 0) { idx.push(i); off.push(clamp(q, -4915, 9830)); }
  }
  if (!idx.length) return null;
  return { n: a.length, idx: idx, off: off };
}

let _shapeST = null;   /* 进行中的塑形笔画：稀疏撤销记账 */
function mfShapeStrokeBegin(hit, radOverride) {
  if (!S.map || !S.geo) return;
  if (!geoBaseReady()) return;
  _shapeST = { seen: new Set(), idx: [], old: [] };
  ED.painting = true;
  mfShapeApply(hit, radOverride);
}
function geoBaseReady() {
  if (S.geo && S.geo.userData.basePos) return true;
  if (S.geo) { S.geo.userData.basePos = new Float32Array(S.geo.attributes.position.array); return true; }
  return false;
}
function mfShapeApply(hit, radOverride) {
  if (!_shapeST || !S.geo || !S.map) return;
  const arr = mfShapeEnsure(S.map); if (!arr) return;
  const geo = S.geo, pos = geo.attributes.position, uv = geo.attributes.uv;
  const bp = geo.userData.basePos;
  const n = pos.count;
  const seg = CFG.SEG[S.segIdx] || CFG.SEG[CFG.SEG_DEF];
  const wS = seg[0], hS = seg[1], cols = wS + 1;
  const rad = radOverride || mfPixelToRad(ED.brushPx, hit.lon, hit.lat);
  const cosR = Math.cos(rad);
  const nx = hit.point.x, ny = hit.point.y, nz = hit.point.z;
  /* 顶点窗口：命中点经纬 ± 笔刷角半径（经向按 1/cos(纬) 补偿） */
  const dRow = Math.max(1, Math.ceil(rad / Math.PI * hS)) + 1;
  const dCol = Math.max(1, Math.ceil(rad / (2 * Math.PI) * wS / Math.max(0.18, Math.cos(hit.lat * D2R)))) + 1;
  const cy = Math.round((90 - hit.lat) / 180 * hS);
  const cx = Math.round((hit.lon + 180) / 360 * wS);
  const y0 = Math.max(0, cy - dRow), y1 = Math.min(hS, cy + dRow);
  const x0 = Math.max(0, cx - dCol), x1 = Math.min(wS, cx + dCol);
  const tool = ED.reshapeTool || 'raise';
  const str = ED.reshapeStr == null ? 0.012 : ED.reshapeStr;
  const g = S.map.grid, H = S.map.height;
  const HS = (S.map.heightScale == null ? 1 : S.map.heightScale) * 0.00016;
  const uArr = uv.array, pArr = pos.array;
  const touched = [];
  const rec = (i) => {
    if (!_shapeST.seen.has(i)) { _shapeST.seen.add(i); _shapeST.idx.push(i); _shapeST.old.push(arr[i]); }
  };
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const i = iy * cols + ix;
      if (i >= n) continue;
      const bx = bp[i * 3], by = bp[i * 3 + 1], bz = bp[i * 3 + 2];
      const bl = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      const dot = (bx * nx + by * ny + bz * nz) / bl;
      if (dot <= cosR) continue;
      let f = (dot - cosR) / (1 - cosR);
      f = f * f * (3 - 2 * f);
      rec(i);
      if (tool === 'raise') arr[i] = clamp(arr[i] + str * f, -0.6, 1.2);
      else if (tool === 'push') arr[i] = clamp(arr[i] - str * f, -0.6, 1.2);
      else {
        const iL = ix > 0 ? i - 1 : i, iR = ix < wS ? i + 1 : i;
        const iU = iy > 0 ? i - cols : i, iD = iy < hS ? i + cols : i;
        const avg = (arr[iL] + arr[iR] + arr[iU] + arr[iD]) * 0.25;
        arr[i] = arr[i] + (avg - arr[i]) * Math.min(1, f * 0.6);
      }
      touched.push(i);
      /* 接缝列（lon=±180 是两份重合顶点）：只改一半会撕开细缝，配对顶点拉齐 */
      if (ix === 0 || ix === wS) {
        const j = iy * cols + (ix === 0 ? wS : 0);
        rec(j); arr[j] = arr[i]; touched.push(j);
      }
    }
  }
  /* 极点行：整行是同一个空间点的副本，统一成平均值，否则极尖开花 */
  const poleRows = {};
  for (let k = 0; k < touched.length; k++) {
    const iy = (touched[k] / cols) | 0;
    if (iy === 0) poleRows[0] = 1; else if (iy === hS) poleRows[hS] = 1;
  }
  for (const ry in poleRows) {
    const row = +ry;
    let sum = 0;
    for (let ix = 0; ix < wS; ix++) sum += arr[row * cols + ix];
    const mean = sum / wS;
    for (let ix = 0; ix <= wS; ix++) {
      const i = row * cols + ix;
      rec(i); arr[i] = mean; touched.push(i);
    }
  }
  /* 只把碰过的顶点写回位置；整球重烘 + 法线留给松手那一刻 */
  for (let k = 0; k < touched.length; k++) {
    const i = touched[k];
    const u = uArr[i * 2], v = uArr[i * 2 + 1];
    let lon = u * 360 - 180;
    const lat = v * 180 - 90;
    if (lon >= 180) lon = 179.9999;
    const hv = H ? (H[g.yOf(lat) * g.w + g.xOf(lon)] || 0) : 0;
    const sc = (1 + arr[i]) * (1 + hv * HS);
    pArr[i * 3] = bp[i * 3] * sc; pArr[i * 3 + 1] = bp[i * 3 + 1] * sc; pArr[i * 3 + 2] = bp[i * 3 + 2] * sc;
  }
  pos.needsUpdate = true;
}
function mfShapeStrokeEnd() {
  if (!_shapeST) return;
  const st = _shapeST; _shapeST = null;
  const idx = st.idx.slice(), old = st.old.slice();
  const cur = [];
  if (S.map && S.map.shape) { for (let k = 0; k < idx.length; k++) cur.push(S.map.shape[idx[k]]); }
  mfApplyHeight();           /* 全量重烘 + 法线，收束这一笔 */
  if (!idx.length) return;
  mfPushFnUndo(
    () => { const a = mfShapeOf(S.map); if (!a) return; for (let k = 0; k < idx.length; k++) a[idx[k]] = old[k]; mfApplyHeight(); },
    () => { const a = mfShapeOf(S.map); if (!a) return; for (let k = 0; k < idx.length; k++) a[idx[k]] = cur[k]; mfApplyHeight(); },
    '重塑星球', true
  );
  mfTouch();
}
function mfShapeScaleAll(f) {
  const a = mfShapeOf(S.map);
  if (!a) { if (CTXREF) CTXREF.toast('还没有任何塑形起伏可缩放', 2200); return; }
  let any = false;
  for (let i = 0; i < a.length; i++) if (a[i] !== 0) { any = true; break; }
  if (!any) { if (CTXREF) CTXREF.toast('星球还是标准球形，先捏出一点起伏再缩放', 2600); return; }
  const prev = new Float32Array(a);
  for (let i = 0; i < a.length; i++) a[i] = clamp(a[i] * f, -0.6, 1.2);
  const post = new Float32Array(a);
  mfApplyHeight();
  mfPushFnUndo(
    () => { const b = mfShapeOf(S.map); if (b) { b.set(prev); mfApplyHeight(); } },
    () => { const b = mfShapeOf(S.map); if (b) { b.set(post); mfApplyHeight(); } },
    '整体缩放塑形', true
  );
  mfTouch();
}
function mfShapeReset() {
  const a = mfShapeOf(S.map);
  if (!a) { if (CTXREF) CTXREF.toast('已经是标准球形', 1800); return; }
  let any = false;
  for (let i = 0; i < a.length; i++) if (a[i] !== 0) { any = true; break; }
  if (!any) { if (CTXREF) CTXREF.toast('已经是标准球形', 1800); return; }
  mfConfirm('把整颗星球恢复成标准球形？全部塑形起伏都会清空（可用 Ctrl+Z 撤销）。', () => {
    const prev = new Float32Array(a);
    a.fill(0);
    mfApplyHeight();
    mfPushFnUndo(
      () => { const b = mfShapeOf(S.map); if (b) { b.set(prev); mfApplyHeight(); } },
      () => { const b = mfShapeOf(S.map); if (b) { b.fill(0); mfApplyHeight(); } },
      '重置星球形状', true
    );
    mfTouch(); mfBuildPanel();
  }, { dgr: true, okLabel: '重置', title: '重置星球形状' });
}

/* 把高度场烘进几何（地形建模后调用） */
function mfApplyHeight() {
  if (!S.ok || !S.geo) return;
  const geo = S.geo, pos = geo.attributes.position, uv = geo.attributes.uv;
  const base = geo.userData.basePos;
  if (!base) {
    geo.userData.basePos = new Float32Array(pos.array);
  }
  const bp = geo.userData.basePos;
  const arr = pos.array, uArr = uv.array;
  const g = S.map.grid, H = S.map.height;
  const HS = (S.map.heightScale == null ? 1 : S.map.heightScale) * 0.00016;  // 米 → 世界单位
  const shp = mfShapeOf(S.map);        /* 重塑星球的径向塑形（先于地形高度） */
  const n = pos.count;
  for (let i = 0; i < n; i++) {
    const so = shp ? shp[i] : 0;
    if (!H) {
      const s0 = 1 + so;
      arr[i * 3] = bp[i * 3] * s0; arr[i * 3 + 1] = bp[i * 3 + 1] * s0; arr[i * 3 + 2] = bp[i * 3 + 2] * s0; continue;
    }
    const u = uArr[i * 2], v = uArr[i * 2 + 1];
    const lon = u * 360 - 180, lat = v * 180 - 90;
    const hv = H[g.yOf(lat) * g.w + g.xOf(lon)] || 0;
    const s = (1 + so) * (1 + hv * HS);
    arr[i * 3] = bp[i * 3] * s; arr[i * 3 + 1] = bp[i * 3 + 1] * s; arr[i * 3 + 2] = bp[i * 3 + 2] * s;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  S.dirtyPos = false;
  S.dirtyContour = true;        /* 地表起伏变了，描边也要跟着抬起/落下 */
}

/* ------------------------------------------------------------ 拾取 -------- */
const _ray = { o: null, d: null };
function mfPick(clientX, clientY) {
  if (!S.ok || !S.sphere) return null;
  const rect = S.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, S.camera);
  const hits = rc.intersectObject(S.sphere, false);
  if (!hits.length) return null;
  const p = hits[0].point.clone().normalize();
  const lat = Math.asin(clamp(p.y, -1, 1)) * R2D;
  let lon = Math.atan2(p.z, -p.x) * R2D - 180;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return { lon: lon, lat: lat, point: p, dist: hits[0].distance };
}
/* 屏幕像素 → 球心角（笔刷半径）：与相机距离、入射角有关 */
function mfPixelToRad(px, lon, lat) {
  if (!S.camera) return 0.01;
  const d = S.camera.position.length();
  const H = (S.canvas && S.canvas.clientHeight) || innerHeight || 800;
  const perPx = MF_TANHALF * d / H;                 // 球心平面处每像素的世界长度
  const cosInc = clamp((d * d - 1 + (d - 1) * (d - 1)) / (2 * d * (d - 1)) || 0, 0.25, 1);
  return clamp(perPx * px / cosInc / CFG.R, 0.0008, Math.PI * 0.5);
}

/* ------------------------------------------------------------ 渲染帧 ------ */
let _mfErrT = 0;

/* 性能自适应：帧率连续低迷就逐级减负，宽裕了再逐级穿回好衣服 */
let _perfLvl = 0;                       /* 0 全副武装 … 3 轻装上阵 */
let _fpsAcc = 0, _fpsN = 0, _fpsGoodWin = 0;
const PERF_PR = [1.25, 1.0, 0.85, 0.72];    /* 各级像素比上限 */
function mfPerfMode() {
  try { return CTXREF && CTXREF.settings ? (CTXREF.settings.get('perfMode') || 'auto') : 'auto'; }
  catch (e) { return 'auto'; }
}
function mfPerfApply(lvl) {
  _perfLvl = lvl;
  if (S.renderer) S.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, PERF_PR[lvl]));
  if (S.stars) {
    const kids = S.stars.children;
    for (let i = 0; i < kids.length; i++) {
      kids[i].visible = lvl < 2 ? true : (lvl === 2 ? i % 2 === 0 : i % 4 === 0);
    }
  }
  if (S.ok) mfSceneResize();
}
/* 帧率采样：2 秒一个窗口，低迷降级、连续五个窗口宽裕才回升（防抖） */
function mfPerfFeed(dt) {
  if (!(dt > 0)) return;
  _fpsAcc += dt; _fpsN++;
  if (_fpsAcc < 2) return;
  const fps = _fpsN / _fpsAcc;
  _fpsAcc = 0; _fpsN = 0;
  const mode = mfPerfMode();
  if (mode === 'quality') { if (_perfLvl !== 0) mfPerfApply(0); return; }
  if (mode === 'smooth') { if (_perfLvl !== 2) mfPerfApply(2); return; }
  if (fps < 28 && _perfLvl < 3) { mfPerfApply(_perfLvl + 1); _fpsGoodWin = 0; }
  else if (fps > 52 && _perfLvl > 0) {
    _fpsGoodWin++;
    if (_fpsGoodWin >= 5) { _fpsGoodWin = 0; mfPerfApply(_perfLvl - 1); }
  } else _fpsGoodWin = 0;
}
/* 形变动画推进：地图上登记过的动画实例按帧插值（dt 单位：秒） */
function mfAnimTick(dt) {
  const L = S.animMeshes;
  if (!L || !L.length) return;
  for (let i = 0; i < L.length; i++) {
    const it = L[i], a = it.anim;
    if (!a || !a.frames || a.frames.length < 2) continue;
    const dur = a.dur || 2, segT = dur / a.frames.length;
    it.t = (it.t + dt) % dur;
    const ft = it.t / segT;
    const i0 = Math.floor(ft) % a.frames.length, i1 = (i0 + 1) % a.frames.length;
    const k = ft - Math.floor(ft);
    const A = a.frames[i0], B = a.frames[i1];
    const arr = it.geo.attributes.position.array;
    const n = Math.min(arr.length, A.length, B.length);
    for (let j = 0; j < n; j++) arr[j] = A[j] + (B[j] - A[j]) * k;
    it.geo.attributes.position.needsUpdate = true;
  }
}

function mfRenderFrame(dt) {
  if (!S.ok) return;
  /* KiMi3：每一步独立兜底、先清脏标记再执行——任何一步抛错都不会恶化成
     「每帧重试同一件坏事」的假死；错误日志两秒最多一条，保住画面 */
  const step = function (fn) {
    try { fn(); } catch (e) {
      const now = Date.now();
      if (now - _mfErrT > 2000) { _mfErrT = now; console.error('[map-forge] 渲染帧出错', e); }
    }
  };
  step(function () { if (S.controls) S.controls.update(); });
  if (S.dirtyColor) { S.dirtyColor = false; step(mfRefreshColors); }
  if (S.dirtyPos) { S.dirtyPos = false; step(mfApplyHeight); }
  step(function () { mfRebuildContours(); });
  step(function () { mfAnimTick(dt); });
  step(function () { if (S.stars && S.camera) S.stars.position.set(0, 0, 0); });
  step(function () { S.renderer.render(S.scene, S.camera); });
  step(function () { mfDrawLabels(); });
  step(function () { mfPerfFeed(dt); });
}

/* 缩略图：离屏渲染一张小图（用于地图目录） */
function mfSnapshot(w, h) {
  if (!S.ok) return '';
  try {
    S.renderer.render(S.scene, S.camera);
    return S.renderer.domElement.toDataURL('image/jpeg', 0.72);
  } catch (e) { return ''; }
}

function mfSceneDispose() {
  S.ok = false;
  if (S.controls) { try { S.controls.dispose && S.controls.dispose(); } catch (e) { } S.controls = null; }
  if (S.geo) { try { S.geo.dispose(); } catch (e) { } }
  if (S.mat) {
    try { if (S.mat.map) S.mat.map.dispose(); S.mat.dispose(); } catch (e) { }
  }
  if (S.stars) {
    try {
      S.stars.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    } catch (e) { }
  }
  if (S.renderer) { try { S.renderer.dispose(); S.renderer.forceContextLoss(); } catch (e) { } S.renderer = null; }
  mfContourClear();
  if (CT.grp && S.scene) { try { S.scene.remove(CT.grp); } catch (e) { } CT.grp = null; }
  S.scene = null; S.camera = null; S.sphere = null; S.geo = null; S.mat = null; S.stars = null; S.canvas = null;
}

/* 显卡打盹后的复苏术：上下文恢复时原地重建场景（数据都在内存里，画布只是重新上彩） */
function mfSceneRecover() {
  const host = UI.root;
  if (!host) return;
  if (S.canvas && S.canvas.parentNode) { try { S.canvas.parentNode.removeChild(S.canvas); } catch (e) { } }
  try { mfSceneDispose(); } catch (e) { }
  if (!mfSceneCreate(host)) return;
  host.insertBefore(S.canvas, UI.top || host.firstChild);
  mfBindCanvas();
  mfBindLabelMenu();
  mfSceneResize();
  mfRefreshColors();
  mfApplyHeight();
  if (S.pack) { try { mfRebuildInstances(); mfRefreshEraBar(); mfBuildPanel(); } catch (e) { } }
}

/* 相机飞行到某经纬度。
 * ⚠ 球面参数化必须和 mfPick 严格互逆，否则「定位到势力」会飞到镜像经度上 */
function mfGoto(lon, lat, dist) {
  if (!S.ok) return;
  const d = dist || Math.max(mfMinDist() * 1.6, S.camera.position.length() * 0.55);
  const p = new Float32Array(3);
  mfSphVec(lon, lat, d, p, 0);
  S.camera.position.set(p[0], p[1], p[2]);
  if (S.controls) { S.controls.target.set(0, 0, 0); S.controls.update(); }
  /* ⚠ 立刻刷新世界矩阵：不然紧接着做射线拾取会用上一帧的旧矩阵，飞过去却点空 */
  S.camera.updateMatrixWorld(true);
}

/* ===================== 32_contour.js ===================== */
/* ------------------------------------------------- 32_contour.js ----------- */
/* 手绘风平滑边界
 *
 * 方案 2.6：「显示时从栅格提取边界、做平滑（marching squares + 贝塞尔拟合），
 *           呈现为手绘风格的闭合区域」
 * 方案 2.7：「势力区域…… 边境 1px 细线」
 *
 * 链路：① 逐格比对抽出单位边界段（等价 marching squares 的等值线段，只发右/下
 *      两个方向保证不重复）→ ② 端点哈希把线段串成折线 → ③ Douglas–Peucker 简化
 *      → ④ Catmull-Rom 转三次贝塞尔采样 → ⑤ 贴到球面略上方描 1px 线。
 *
 * ⚠ 别在每一帧重建：抽边要扫全栅格（默认 0.25° 是 104 万格），
 *   所以用 S.dirtyContour 脏标记 + 「正在作画就先藏起来」来节流。 */

const CT = { grp: null, segs: 0, lines: 0, ms: 0, skipped: false };

/* 单帧最多允许扫的格数：再大就放弃描边（0.1° 精修档会到 648 万格） */
const CT_MAX_CELLS = 4.2e6;

function mfContourEnabled() {
  if (_perfLvl >= 3) return false;      /* 轻装上阵时，平滑边界先歇一会儿 */
  try { return CTXREF && CTXREF.settings ? CTXREF.settings.get('smoothEdge') !== false : true; }
  catch (e) { return true; }
}

/* 球面参数化：与 mfPick 的反解严格互逆
 *   lat = asin(y)          ⇒ y = sin(lat)·r
 *   lon = atan2(z, −x)−180 ⇒ x = cos(lat)·cos(lon)·r ，z = −cos(lat)·sin(lon)·r */
function mfSphVec(lon, lat, r, out, o) {
  const cl = Math.cos(lat * D2R);
  out[o] = Math.cos(lon * D2R) * cl * r;
  out[o + 1] = Math.sin(lat * D2R) * r;
  out[o + 2] = -Math.sin(lon * D2R) * cl * r;
}

/* ---------------------------------------------------- ① 抽出单位边界段 ---- */
/* 只发「右邻不同 → 竖边」「下邻不同 → 横边」，每条边界恰好被发一次。
 * 段坐标用格线整数：x∈[0,w]、y∈[0,h]；格线 (x,y) 对应经纬度 (−180+x·res, 90−y·res)。 */
function mfEdgeSegments(val, w, h) {
  const segs = [], sv = [];
  for (let y = 0; y < h; y++) {
    const row = y * w, yn = y + 1;
    const rowN = yn < h ? (yn * w) : -1;
    for (let x = 0; x < w; x++) {
      const v = val[row + x];
      const xr = x + 1 >= w ? 0 : x + 1;
      const vr = val[row + xr];
      /* 右邻（经度环绕）。只发右/下两个方向，保证每条边界恰好发一次。
       * ⚠ 千万不要「本格为 0 就跳过」：陆地的左边界只能由它左边那个
       *   海洋格来发，跳过就把整条左边界漏掉了（会碎成几十段）。
       *   判据是「两边不同 且 至少一边非 0」。 */
      if (v !== vr && (v || vr)) { segs.push(x + 1, y, x + 1, yn); sv.push(v || vr); }
      /* 下邻。最后一行不发：y=h 那条格线是南极「一个点」，
       * 发出来只会得到一堆退化线段（1440 条全挤在同一点上） */
      if (rowN >= 0) {
        const vd = val[rowN + x];
        if (v !== vd && (v || vd)) { segs.push(x, yn, x + 1, yn); sv.push(v || vd); }
      }
    }
  }
  return { segs: segs, sv: sv };
}

/* -------------------------------------------------------- ② 串成折线 ------ */
/* 端点 key = y*(w+2)+x。跨 ±180 的段不强行接（x=w 与 x=0 是同一条子午线，
 * 断开画成两条开放折线，视觉上仍然连续）。 */
function mfChainPolys(segs, sv, w) {
  const W = w + 2, N = segs.length / 4;
  if (!N) return [];
  const map = new Map();
  for (let i = 0; i < N; i++) {
    const k1 = segs[i * 4 + 1] * W + segs[i * 4];
    const k2 = segs[i * 4 + 3] * W + segs[i * 4 + 2];
    let a = map.get(k1); if (!a) map.set(k1, a = []); a.push(i);
    let b = map.get(k2); if (!b) map.set(k2, b = []); b.push(i);
  }
  const used = new Uint8Array(N);
  const out = [];

  function walk(si, startKey) {
    const pts = [startKey];
    let cur = startKey, s = si;
    used[s] = 1;
    for (;;) {
      const k1 = segs[s * 4 + 1] * W + segs[s * 4];
      const k2 = segs[s * 4 + 3] * W + segs[s * 4 + 2];
      const nx = (cur === k1) ? k2 : k1;
      pts.push(nx); cur = nx;
      const cand = map.get(cur);
      let nxt = -1;
      if (cand) for (let j = 0; j < cand.length; j++) if (!used[cand[j]]) { nxt = cand[j]; break; }
      if (nxt < 0) break;
      used[nxt] = 1; s = nxt;
    }
    return pts;
  }

  /* 先走开放端（度=1 的点），这样一条开放折线不会被从中间掐成两截 */
  const ends = [];
  map.forEach((list, k) => { if (list.length === 1) ends.push(k); });
  for (let i = 0; i < ends.length; i++) {
    const k = ends[i], s = map.get(k)[0];
    if (used[s]) continue;
    const pts = walk(s, k);
    if (pts.length >= 2) out.push({ pts: pts, v: sv[s], closed: false });
  }
  /* 剩下的都是闭合环 */
  for (let i = 0; i < N; i++) {
    if (used[i]) continue;
    const pts = walk(i, segs[i * 4 + 1] * W + segs[i * 4]);
    if (pts.length >= 3) out.push({ pts: pts, v: sv[i], closed: pts[0] === pts[pts.length - 1] });
  }
  return out;
}

/* -------------------------------------------- ③ Douglas–Peucker 简化 ------ */
/* 距离在 (lon·cos(lat0), lat) 平面里量，避免高纬度把东西向压扁 */
function mfDP(pts, eps) {
  const m = pts.length / 2;
  if (m < 3) return pts;
  let la = 0;
  for (let i = 0; i < m; i++) la += pts[i * 2 + 1];
  const cw = Math.max(0.05, Math.cos((la / m) * D2R));
  const keep = new Uint8Array(m);
  keep[0] = 1; keep[m - 1] = 1;
  const stack = [0, m - 1];
  while (stack.length) {
    const b = stack.pop(), a = stack.pop();
    if (b - a < 2) continue;
    const ax = pts[a * 2] * cw, ay = pts[a * 2 + 1];
    const bx = pts[b * 2] * cw, by = pts[b * 2 + 1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let best = -1, bd = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 2] * cw - ax, py = pts[i * 2 + 1] - ay;
      let d;
      if (L2 < 1e-12) { d = px * px + py * py; }
      else {
        let t = (px * dx + py * dy) / L2;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const qx = px - t * dx, qy = py - t * dy;
        d = qx * qx + qy * qy;
      }
      if (d > bd) { bd = d; best = i; }
    }
    if (bd > eps * eps) { keep[best] = 1; stack.push(a, best, best, b); }
  }
  const out = [];
  for (let i = 0; i < m; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

/* --------------------------------- ④ Catmull-Rom → 三次贝塞尔采样 -------- */
/* 对每段 (P1→P2)，控制点 C1 = P1 + (P2−P0)/6、C2 = P2 − (P3−P1)/6，
 * 这就是把 Catmull-Rom 样条写成标准三次贝塞尔；再按 per 份采样展开。 */
function mfBezierSample(pts, closed, per) {
  const m = pts.length / 2;
  if (m < 3) return pts;
  const gi = (i) => { const j = i % m; return j < 0 ? j + m : j; };
  const gx = (i) => pts[gi(i) * 2], gy = (i) => pts[gi(i) * 2 + 1];
  const out = [pts[0], pts[1]];
  const last = closed ? m : m - 1;
  for (let i = 0; i < last; i++) {
    const p1x = gx(i), p1y = gy(i), p2x = gx(i + 1), p2y = gy(i + 1);
    const p0x = closed ? gx(i - 1) : (i === 0 ? p1x : gx(i - 1));
    const p0y = closed ? gy(i - 1) : (i === 0 ? p1y : gy(i - 1));
    const p3x = closed ? gx(i + 2) : (i + 2 >= m ? p2x : gx(i + 2));
    const p3y = closed ? gy(i + 2) : (i + 2 >= m ? p2y : gy(i + 2));
    const c1x = p1x + (p2x - p0x) / 6, c1y = p1y + (p2y - p0y) / 6;
    const c2x = p2x - (p3x - p1x) / 6, c2y = p2y - (p3y - p1y) / 6;
    for (let k = 1; k <= per; k++) {
      const t = k / per, s = 1 - t;
      const A = s * s * s, B = 3 * s * s * t, C2 = 3 * s * t * t, D3 = t * t * t;
      out.push(A * p1x + B * c1x + C2 * c2x + D3 * p2x, A * p1y + B * c1y + C2 * c2y + D3 * p2y);
    }
  }
  return out;
}

/* --------------------------------------------- ⑤ 描到球面（1px 细线） ---- */
const CT_REGION_COLOR = [0x000000, 0x4a3a20, 0x24405e, 0x3f3f42];
const CT_LIFT = 0.0018;                 /* 抬离地表，避免与球面 z-fighting */

function mfContourClear() {
  if (!CT.grp) return;
  for (let i = CT.grp.children.length - 1; i >= 0; i--) {
    const c = CT.grp.children[i];
    CT.grp.remove(c);
    try { if (c.geometry) c.geometry.dispose(); } catch (e) { }
    try { if (c.material) c.material.dispose(); } catch (e) { }
  }
  CT.lines = 0;
}

function mfRebuildContours(force) {
  if (!S.ok || !S.scene || !S.map || !THREE) return;
  if (!CT.grp) {
    CT.grp = new THREE.Group();
    S.scene.add(CT.grp);
  }
  const on = mfContourEnabled();
  CT.grp.visible = on && !ED.painting;
  if (!on) { mfContourClear(); return; }
  if (!force && !S.dirtyContour) return;
  /* KiMi3：拖动「起伏」滑条这类连续脏场景，最多每 180ms 重建一次，不再每帧全栅格扫描 */
  const __ctNow = Date.now();
  if (!force && CT.lastT && (__ctNow - CT.lastT) < 180) return;
  CT.lastT = __ctNow;

  const t0 = (performance && performance.now) ? performance.now() : Date.now();
  mfContourClear();
  CT.segs = 0; CT.skipped = false;
  S.dirtyContour = false;

  const g = S.map.grid, w = g.w, h = g.h, res = g.res;
  if (w * h > CT_MAX_CELLS) { CT.skipped = true; return; }

  const H = S.map.height;
  const HS = (S.map.heightScale == null ? 1 : S.map.heightScale) * 0.00016;

  function build(val, isPolity) {
    const ex = mfEdgeSegments(val, w, h);
    CT.segs += ex.segs.length / 4;
    const polys = mfChainPolys(ex.segs, ex.sv, w);
    const eps = Math.max(res * 0.45, 0.02);
    for (let i = 0; i < polys.length; i++) {
      const P = polys[i];
      const flat = new Array(P.pts.length * 2);
      for (let j = 0; j < P.pts.length; j++) {
        const k = P.pts[j];
        const x = k % (w + 2), y = (k - x) / (w + 2);
        flat[j * 2] = -180 + x * res;
        flat[j * 2 + 1] = 90 - y * res;
      }
      const sm = mfBezierSample(mfDP(flat, eps), P.closed, 3);
      const m = sm.length / 2;
      if (m < 2) continue;
      const pos = new Float32Array(m * 3);
      for (let j = 0; j < m; j++) {
        const lon = clamp(sm[j * 2], -180, 180), lat = clamp(sm[j * 2 + 1], -90, 90);
        const hv = H ? (H[g.yOf(lat) * w + g.xOf(lon)] || 0) : 0;
        mfSphVec(lon, lat, CFG.R * (1 + hv * HS) + CFG.R * CT_LIFT, pos, j * 3);
      }
      let col;
      if (isPolity) {
        let p = null;
        for (let q = 0; q < (S.map.polities || []).length; q++) if (S.map.polities[q].seq === P.v) { p = S.map.polities[q]; break; }
        const c = p ? hexToRgb(p.color) : [140, 90, 50];
        col = new THREE.Color(c[0] * 0.42, c[1] * 0.42, c[2] * 0.42);
      } else {
        col = new THREE.Color(CT_REGION_COLOR[P.v] || CT_REGION_COLOR[1]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({
        color: col, transparent: true, opacity: isPolity ? 0.92 : 0.7, depthWrite: false
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.renderOrder = 3;
      CT.grp.add(line);
      CT.lines++;
    }
  }

  build(g.region, false);
  build(g.polity, true);
  void h;
  CT.ms = Math.round(((performance && performance.now) ? performance.now() : Date.now()) - t0);
}

/* ===================== 40_ui.js ===================== */
/* ==========================================================================
 * 外壳层：书签按钮 · 地图目录 · 编辑器界面（顶部时代轴/搜索 · 左侧按钮 · 右侧缩放）
 * ========================================================================== */

/* 编辑器运行期状态 */
const ED = {
  visible: false, edit: false, tool: null,
  brushPx: 14, brushShape: 'round', fillKind: 1, terrainIdx: 0,
  reshape: false, reshapeTool: 'raise', reshapeStr: 0.012,
  selPolity: null,
  /* 建模实例：selInst＝当前选中的实例 id，dragInst＝正在拖动的实例 id，
   * dragFrom＝拖动起点的经纬（整段拖动只入一次撤销） */
  selInst: null, dragInst: null, dragFrom: null,
  undo: [], redo: [],
  labelMode: false, modelMode: false,
  painting: false, panning: false,
  lastSave: 0, saveTimer: 0
};

const UI = { bm: null, root: null, top: null, left: null, panel: null, zoom: null, prof: null, hint: null, lbl: null, tl: null, tlAdd: null, sres: null, sinp: null, gridBtn: null };

function mfHintText(t) {
  if (!UI.hint) return;
  if (!t) { UI.hint.classList.remove('on'); return; }
  UI.hint.textContent = t;
  UI.hint.classList.add('on');
}

/* ------------------------------------------------------------ 书签按钮 ---- */
function mfBuildBookmark() {
  if (UI.bm) return;
  const b = mfNode('div', 'mf-bookmark',
    '<span class="mf-bm-ico">图</span><span>其他地图</span>');
  b.title = '打开其他地图（自定义地图创建模块）';
  b.addEventListener('click', (e) => { e.stopPropagation(); mfOpenCatalog(); });
  mfMount(document.body, b);
  UI.bm = b;
}

/* ------------------------------------------------------------ 编辑器骨架 -- */
function mfBuildRoot() {
  if (UI.root) return;
  const root = mfNode('div', 'mf-root');
  root.style.display = 'none';
  mfMount(document.body, root);
  UI.root = root;

  /* 顶部条 */
  const top = mfNode('div', 'mf-top');
  const eraBtn = mfNode('div', 'mf-era-btn', '<span>代</span><span>时代</span>');
  eraBtn.title = '时代（每个时代是一颗独立星球）：右键加号可「创建新时代」或「使用时代模板」';
  eraBtn.addEventListener('click', (e) => {
    const r = eraBtn.getBoundingClientRect();
    mfEraAddMenu(r.left, r.bottom + 4);
  });
  const tl = mfNode('div', 'mf-tl');
  const tlAdd = mfNode('div', 'mf-tl-add', '＋');
  tlAdd.title = '左键：创建新时代（空白星球）　右键：创建新时代 / 使用时代模板';
  tlAdd.addEventListener('click', () => mfEraAdd());
  tlAdd.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    mfEraAddMenu(e.clientX, e.clientY);
  });
  const search = mfNode('div', 'mf-search');
  const sinp = mfNode('input');
  sinp.placeholder = '搜索资料 / 势力 / 关键词…';
  const sres = mfNode('div', 'mf-sres');
  search.appendChild(sinp); search.appendChild(sres);
  top.appendChild(eraBtn); top.appendChild(tl); top.appendChild(tlAdd); top.appendChild(search);
  root.appendChild(top);
  UI.top = top; UI.tl = tl; UI.tlAdd = tlAdd; UI.sinp = sinp; UI.sres = sres;

  sinp.addEventListener('input', () => mfSearchRun(sinp.value));
  sinp.addEventListener('focus', () => { if (sinp.value) mfSearchRun(sinp.value); });
  sinp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { sinp.value = ''; mfSearchClose(); sinp.blur(); } });
  /* 搜索框外点击关闭结果：登记解绑；重复进入编辑器时先摘掉上一个，避免累积 */
  if (UI._sresOff) { try { UI._sresOff(); } catch (e) { } UI._sresOff = null; }
  UI._sresOff = mfOn(document, 'pointerdown', (e) => {
    if (UI.sres && !search.contains(e.target)) mfSearchClose();
  });

  /* 左侧按钮 */
  const left = mfNode('div', 'mf-left');
  const bTool = mfNode('div', 'mf-icon-btn', mfIcon('tool'));
  bTool.title = '工具包（开启/关闭编辑功能）';
  bTool.addEventListener('click', () => mfToggleEdit());
  const bCat = mfNode('div', 'mf-icon-btn', mfIcon('map'));
  bCat.title = '地图目录';
  bCat.addEventListener('click', () => mfOpenCatalog());
  const bRefresh = mfNode('div', 'mf-icon-btn', mfIcon('refresh'));
  bRefresh.title = '刷新画面（重建显示，不动你的数据）';
  bRefresh.addEventListener('click', () => {
    S.dirtyColor = true; S.dirtyPos = true; S.dirtyContour = true;
    try { mfRebuildContours(true); } catch (e) { void e; }
    try { mfRebuildSpaceMarks(); } catch (e) { void e; }
    if (CTXREF) CTXREF.toast('画面已重新整理', 1600, 'ok');
  });
  const bHome = mfNode('div', 'mf-icon-btn', mfIcon('globe'));
  bHome.title = '返回地球地图（主程序界面）';
  bHome.addEventListener('click', () => mfCloseEditor());
  const bSave = mfNode('div', 'mf-icon-btn', mfIcon('save'));
  bSave.title = '保存当前地图';
  bSave.addEventListener('click', () => mfSaveNow());
  const bSnap = mfNode('div', 'mf-icon-btn', mfIcon('history'));
  bSnap.title = '历史快照（误删了就用它滚回来）';
  bSnap.addEventListener('click', () => mfSnapDialog());
  const bGrid = mfNode('div', 'mf-icon-btn' + (mfGridWanted() ? ' on' : ''), mfIcon('grid'));
  bGrid.title = '经纬线：显示 / 隐藏（漂浮在球面上方的一薄层白色网格，不挡画笔与建模）';
  bGrid.addEventListener('click', () => {
    const v = !mfGridWanted();
    try { if (CTXREF) CTXREF.settings.set('showGrid', v); } catch (e) { }
    mfSyncGridTexture();
    if (CTXREF) CTXREF.toast(v ? '经纬线已显示' : '经纬线已隐藏', 1400, 'ok');
  });
  UI.gridBtn = bGrid;
  const bPlanet = mfNode('div', 'mf-icon-btn', mfIcon('planet'));
  bPlanet.title = '星球编辑：增删星球（时代）、调整大小与密度、管理空间、捏星球形状';
  bPlanet.addEventListener('click', () => mfPlanetEditor());
  const bModGo = mfNode('div', 'mf-icon-btn', mfIcon('cube'));
  bModGo.title = '建模系统（一键直达，不必先开工具包）';
  bModGo.addEventListener('click', () => mfOpenModeling());
  const bUndo = mfNode('div', 'mf-icon-btn', mfIcon('undo'));
  bUndo.title = '撤销 (Ctrl+Z)';
  bUndo.addEventListener('click', () => mfUndo());
  const bRedo = mfNode('div', 'mf-icon-btn', mfIcon('redo'));
  bRedo.title = '重做 (Ctrl+Y)';
  bRedo.addEventListener('click', () => mfRedo());
  left.appendChild(bTool); left.appendChild(bCat);
  left.appendChild(bRefresh); left.appendChild(bGrid);
  left.appendChild(bPlanet); left.appendChild(bModGo);
  left.appendChild(bUndo);
  left.appendChild(bRedo); left.appendChild(bSnap); left.appendChild(bSave); left.appendChild(bHome);
  root.appendChild(left);
  UI.left = left; UI.bTool = bTool;

  /* 竖排图标工具条：工具包开启后出现，全部作画工具一键直达（右键调参） */
  const dock = mfNode('div', 'mf-dock');
  left.appendChild(dock);
  UI.dock = dock;

  /* 工具包面板 */
  const panel = mfNode('div', 'mf-panel');
  root.appendChild(panel);
  UI.panel = panel;

  /* 右侧缩放滑条 */
  const zoom = mfNode('div', 'mf-zoom');
  const zIn = mfNode('div', 'mf-zi', '＋');
  const zOut = mfNode('div', 'mf-zi', '－');
  const zr = mfNode('input');
  zr.type = 'range'; zr.min = '0'; zr.max = '1000'; zr.value = '620';
  zr.className = 'mf-slider';
  const zt = mfNode('div', 'mf-zt', '—');
  zoom.appendChild(zIn); zoom.appendChild(zr); zoom.appendChild(zOut); zoom.appendChild(zt);
  zoom.style.display = 'none';
  root.appendChild(zoom);
  UI.zoom = zoom; UI.zr = zr; UI.zt = zt;
  zIn.addEventListener('click', () => mfZoomBy(0.82));
  zOut.addEventListener('click', () => mfZoomBy(1.22));
  zr.addEventListener('input', () => mfZoomFromSlider(+zr.value));

  /* 势力简介浮窗 */
  const prof = mfNode('div', 'mf-prof');
  root.appendChild(prof);
  UI.prof = prof;

  /* 标签绘制层 */
  const lbl = mfNode('canvas', 'mf-lblcv');
  root.appendChild(lbl);
  UI.lbl = lbl;

  /* 底部提示 */
  const hint = mfNode('div', 'mf-hint');
  root.appendChild(hint);
  UI.hint = hint;
}

/* ------------------------------------------------------------ 缩放控制 ---- */
function mfZoomFromSlider(v) {
  if (!S.ok) return;
  const lo = Math.log(mfMinDist()), hi = Math.log(CFG.MAX_DIST);
  const d = Math.exp(lo + (hi - lo) * (v / 1000));
  const dir = new THREE.Vector3().subVectors(S.camera.position, S.controls.target).normalize();
  S.camera.position.copy(S.controls.target).addScaledVector(dir, clamp(d, mfMinDist(), CFG.MAX_DIST));
  S.controls.update();
  mfZoomReadout();
}
function mfZoomBy(f) {
  if (!S.ok) return;
  const d = clamp(S.camera.position.distanceTo(S.controls.target) * f, mfMinDist(), CFG.MAX_DIST);
  const dir = new THREE.Vector3().subVectors(S.camera.position, S.controls.target).normalize();
  S.camera.position.copy(S.controls.target).addScaledVector(dir, d);
  S.controls.update();
  mfZoomReadout();
}
function mfZoomReadout() {
  if (!S.ok) return;
  const d = S.camera.position.distanceTo(S.controls.target);
  const lo = Math.log(mfMinDist()), hi = Math.log(CFG.MAX_DIST);
  UI.zr.value = String(Math.round((Math.log(clamp(d, mfMinDist(), CFG.MAX_DIST)) - lo) / (hi - lo) * 1000));
  const km = mfKmPerCm();
  UI.zt.textContent = '1cm≈' + (km >= 100 ? Math.round(km) : km.toFixed(1)) + 'km';
}

/* ------------------------------------------------------------ 开关编辑态 -- */
function mfToggleEdit(force) {
  ED.edit = (force == null) ? !ED.edit : !!force;
  UI.bTool.classList.toggle('on', ED.edit);
  UI.panel.classList.toggle('on', ED.edit);
  UI.zoom.style.display = ED.edit ? '' : 'none';
  if (ED.edit) {
    mfBuildPanel();
    mfZoomReadout();
    mfHintText(mfMouseSwap()
      ? '左键拖动＝旋转球体　右键＝使用工具作画　Esc＝退出工具'
      : '左键＝使用工具作画　右键拖动＝旋转球体　Esc＝退出工具');
    mfGuide('editor');
  } else {
    ED.tool = null;
    mfCloseProfile();
    mfHintText('');
  }
  /* KiMi3：关掉工具包后必须把左键旋转还给用户——原来漏了这一步，
     controls 里 LEFT 还是空的，球怎么拖都不动，只能退回地球地图 */
  mfSyncControls();
}

/* ------------------------------------------------------------ 打开 / 关闭 -- */
function mfCloseEditor() {
  mfSessionClear();
  ED.visible = false;
  if (UI.root) UI.root.style.display = 'none';
  mfCloseProfile();
  mfHintText('');
}

async function mfOpenMapById(id) {
  try {
    const m = await mfLoadMap(id);
    mfOpenMap(m);
  } catch (e) {
    if (CTXREF) CTXREF.toast('打开地图失败：' + (e && e.message || e), 3600, 'err');
  }
}

/* 会话旗：打开地图就插旗，好好道别才拔旗；下次启动看到旗子还在＝上次没能好好道别 */
const K_SESSION = 'mapforge:session';
function mfSessionMark() {
  if (!ST || !S.pack) return;
  try { ST.put(K_SESSION, { id: S.pack.meta.id, name: S.pack.meta.name, t: Date.now() }); } catch (e) { }
}
function mfSessionClear() {
  if (!ST) return;
  try { ST.del(K_SESSION); } catch (e) { }
}

function mfOpenMap(pack) {
  ED.visible = true;
  mfLinkWorlds(pack);
  S.pack = pack;
  S.map = pack.worlds[pack.cur];
  mfSessionMark();
  ED.selPolity = null;
  ED.undo.length = 0; ED.redo.length = 0;
  if (!UI.root) mfBuildRoot();
  UI.root.style.display = '';
  if (!S.ok) {
    const ok = mfSceneCreate(UI.root);
    if (!ok) {
      if (CTXREF) CTXREF.toast('无法创建 3D 场景（未找到 three.js 运行时）', 4200, 'err');
      UI.root.style.display = 'none'; ED.visible = false;
      return;
    }
    UI.root.insertBefore(S.canvas, UI.top);
    mfBindCanvas();
    mfBindLabelMenu();
  }
  mfSceneResize();
  mfRebuildInstances();
  mfRefreshEraBar();
  mfBuildPanel();
  mfRefreshColors();
  mfApplyHeight();          /* 有高度就挤出，没有就还原成原球 */
  mfZoomReadout();
  if (!ED.edit) mfHintText('左键拖动＝旋转　滚轮＝缩放　点左侧「具」开启工具包');
  if (CTXREF) CTXREF.settings.set('lastMap', pack.meta.id);
}

/* ------------------------------------------------------------ 地图目录 ---- */
async function mfOpenCatalog() {
  const idx = await mfLoadIndex();
  const wrap = mfNode('div', 'mf-cat-grid');

  /* 第一行：地球地图 */
  const earth = mfNode('div', 'mf-cat-row earth',
    '<div class="mf-thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px">球</div>' +
    '<div class="mf-cat-meta"><div class="nm">地球地图</div><div class="sb">返回主程序界面（原版世界历史地图）</div></div>');
  earth.addEventListener('click', () => { d.close(); mfCloseEditor(); });
  wrap.appendChild(earth);

  /* 中间：已有地图 */
  idx.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
  idx.forEach((rec) => {
    const row = mfNode('div', 'mf-cat-row');
    const th = mfNode('img', 'mf-thumb');
    th.src = rec.thumb || '';
    if (!rec.thumb) th.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:20px';
    if (!rec.thumb) th.textContent = '图';
    const meta = mfNode('div', 'mf-cat-meta',
      '<div class="nm">' + esc(rec.name) + '</div><div class="sb">修改于 ' + fmtTime(rec.modifiedAt)
      + (rec.eras ? ' · ' + rec.eras + ' 个时代' : '') + '</div>');
    row.appendChild(th); row.appendChild(meta);
    const acts = mfNode('div', 'mf-cat-act');
    const bExp = mfNode('div', 'mf-icon-btn', '⤓');
    bExp.title = '导出这张地图（.mfmap）';
    bExp.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const m = await mfLoadMap(rec.id);
        mfExportDialog(m);
      } catch (err) { if (CTXREF) CTXREF.toast('准备导出失败：' + err.message, 3600, 'err'); }
    });
    const bRen = mfNode('div', 'mf-icon-btn', '✎');
    bRen.title = '重命名';
    bRen.addEventListener('click', (e) => {
      e.stopPropagation();
      mfPrompt('地图名称', rec.name, async (v) => {
        rec.name = v; await mfSaveIndex(idx); d.close(); mfOpenCatalog();
      }, { title: '重命名地图' });
    });
    const bDel = mfNode('div', 'mf-icon-btn', '✕');
    bDel.title = '删除';
    bDel.addEventListener('click', (e) => {
      e.stopPropagation();
      mfConfirm('确定删除「' + rec.name + '」？建议先导出备份，删除不可恢复。', async () => {
        await mfDelMap(rec.id);
        d.close(); mfOpenCatalog();
        if (CTXREF) CTXREF.toast('已删除：' + rec.name, 2400, 'ok');
      }, { dgr: true, okLabel: '删除', title: '删除地图' });
    });
    acts.appendChild(bExp); acts.appendChild(bRen); acts.appendChild(bDel);
    row.appendChild(acts);
    row.addEventListener('click', () => { d.close(); mfOpenMapById(rec.id); });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      mfMenu(e.clientX, e.clientY, [
        { icon: '▸', label: '打开', fn: () => { d.close(); mfOpenMapById(rec.id); } },
        { icon: '⤓', label: '导出', fn: async () => { const m = await mfLoadMap(rec.id); mfExportDialog(m); } },
        { icon: '✎', label: '重命名', fn: () => mfPrompt('地图名称', rec.name, async (v) => { rec.name = v; await mfSaveIndex(idx); d.close(); mfOpenCatalog(); }) },
        { icon: '⧉', label: '复制副本', fn: async () => { await mfDupMap(rec.id); d.close(); mfOpenCatalog(); } },
        { sep: true },
        { icon: '✕', label: '删除', dgr: true, fn: () => mfConfirm('删除「' + rec.name + '」？不可恢复。', async () => { await mfDelMap(rec.id); d.close(); mfOpenCatalog(); }, { dgr: true, okLabel: '删除' }) }
      ]);
    });
    wrap.appendChild(row);
  });

  /* 最后：加号 */
  const add = mfNode('div', 'mf-cat-row add', '<div>＋</div><div class="cap">创建新地图（或把 .mfmap 拖到这里导入）</div>');
  add.addEventListener('click', () => { d.close(); mfNewMapDialog(); });
  add.addEventListener('dragover', (e) => { e.preventDefault(); add.classList.add('over'); });
  add.addEventListener('dragleave', () => add.classList.remove('over'));
  add.addEventListener('drop', async (e) => {
    e.preventDefault(); add.classList.remove('over');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    await mfImportFile(f);
    d.close();
  });
  wrap.appendChild(add);

  const d = mfDialog({ title: '地图目录', cls: 'mf-cat', body: wrap, width: 'min(680px,92vw)' });
}

/* 新建地图对话框 */
/* 方案 2.2：新建对话框里的默认名要带序号「未命名地图N」 */
async function mfNextMapName() {
  let idx = [];
  try { idx = await mfLoadIndex(); } catch (e) { idx = []; }
  let n = 1;
  const used = new Set(idx.map((r) => r.name || ''));
  while (used.has('未命名地图' + n)) n++;
  return n === 1 ? '未命名地图' : ('未命名地图' + n);
}

async function mfNewMapDialog() {
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', '', '<div style="margin-bottom:8px">地图名称</div>'));
  const inp = mfNode('input', 'mf-inp');
  inp.value = await mfNextMapName();
  inp.style.cssText = 'width:100%;padding:6px 8px';
  wrap.appendChild(inp);
  wrap.appendChild(mfNode('div', '', '<div style="margin:10px 0 6px">栅格精度（度/格，越小越精细、越占内存）</div>'));
  const sel = mfNode('select', 'mf-sel');
  sel.style.cssText = 'width:100%;padding:5px';
  CFG.GRID_RES.forEach((r) => {
    const o = document.createElement('option');
    o.value = String(r);
    o.textContent = r + '°（约 ' + Math.round(r * 111) + 'km/格，' + Math.round(360 / r) + '×' + Math.round(180 / r) + '）';
    if (r === CFG.GRID_RES_DEF) o.selected = true;
    sel.appendChild(o);
  });
  wrap.appendChild(sel);
  const warn = mfNode('div', 'mf-note', '⚠ 极限精度警示：0.02° 约 1.6 亿格（18000×9000），占用内存可达 800MB 以上，低配设备可能明显卡顿。只在确定要做发丝级细节时再选它。');
  warn.style.cssText = 'margin-top:8px;color:#b3402f;display:none';
  wrap.appendChild(warn);
  sel.addEventListener('change', () => { warn.style.display = (parseFloat(sel.value) <= 0.02 ? '' : 'none'); });
  const tip = mfNode('div', 'mf-note', '提示：创作初期建议用 0.5° 或 0.25°，精修细节时再换 0.1° 或 0.05°。精度创建后不可更改。');
  tip.style.marginTop = '8px';
  wrap.appendChild(tip);

  const d = mfDialog({
    title: '创建新地图', width: '380px', body: wrap,
    buttons: [
      { label: '取消', fn: function () { } },
      {
        label: '创建', pri: true, fn: async function () {
          const pack = mfNewMap(inp.value.trim() || '未命名地图', parseFloat(sel.value));
          await mfSaveMap(pack);
          if (CTXREF) CTXREF.settings.set('lastMap', pack.meta.id);
          mfOpenMap(pack);
          if (CTXREF) CTXREF.toast('已创建「' + pack.meta.name + '」，点左侧「具」开启工具包', 3200, 'ok');
        }
      }
    ]
  });
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
}

/* 复制副本：整包另存一张新地图（地图包 id 换掉，内容完全一致） */
async function mfDupMap(id) {
  try {
    const src = await mfLoadMap(id);
    const copy = mfDeserialize(mfSerialize(src));
    copy.meta.id = uid('map');
    copy.meta.name = (src.meta.name || '未命名地图') + ' 副本';
    copy.meta.createdAt = Date.now();
    await mfSaveMap(copy);
    if (CTXREF) CTXREF.toast('已复制为「' + copy.meta.name + '」', 2800, 'ok');
    return copy;
  } catch (e) {
    if (CTXREF) CTXREF.toast('复制失败：' + (e && e.message || e), 3600, 'err');
    return null;
  }
}

/* 真正的导入逻辑：输入字节，输出 pack（出错就抛，由调用方决定怎么提示）
 * 普通 JSON 与 gzip 包按文件头自动识别 */
/* 作品信息卡：导入一张带署名的地图时先亮个相——封面、作者与作者的话 */
function mfCardSplash(pack) {
  const wrap = mfNode('div');
  wrap.style.cssText = 'text-align:center';
  if (pack.thumb) {
    const img = mfNode('img');
    img.src = pack.thumb;
    img.style.cssText = 'max-width:100%;border-radius:8px;border:1px solid rgba(160,132,80,.4);margin-bottom:10px';
    wrap.appendChild(img);
  }
  wrap.appendChild(mfNode('div', '', '<b style="font-size:16px">' + esc(pack.meta.name || '未命名地图') + '</b>'));
  if (pack.meta.author) wrap.appendChild(mfNode('div', 'mf-note', '作者：' + esc(pack.meta.author)));
  if (pack.meta.desc) {
    const d = mfNode('div', '');
    d.style.cssText = 'margin-top:8px;line-height:1.8;text-align:left;white-space:pre-wrap';
    d.textContent = pack.meta.desc;
    wrap.appendChild(d);
  }
  mfDialog({ title: '一张新地图到了', width: '400px', body: wrap, buttons: [{ label: '启程', pri: true, fn: function () { } }] });
}

async function mfImportBytes(u8, fallbackName) {
  let txt;
  if (mfHasGzMagic(u8)) {
    const raw = await mfGunzip(u8.subarray(CFG.MAGIC_GZ.length));
    if (!raw) throw new Error('当前浏览器不支持解压 gzip 地图包');
    txt = mfStr(raw);
  } else {
    txt = mfStr(u8);
  }
  let o;
  try { o = JSON.parse(txt); }
  catch (e) { throw new Error('文件内容不是有效的地图数据（JSON 解析失败）'); }
  const pack = mfDeserialize(o);
  const rawName = (fallbackName || '').replace(/\.mfmap$/i, '');
  if (!pack.meta.name) pack.meta.name = rawName || '导入的地图';
  pack.meta.id = uid('map');           // 换 id，避免覆盖已有地图
  await mfSaveMap(pack);
  if (CTXREF) CTXREF.toast('已导入「' + pack.meta.name + '」' + (pack.meta.author ? '（作者：' + pack.meta.author + '）' : ''), 3000, 'ok');
  mfOpenMap(pack);
  if (pack.meta.author || pack.meta.desc) mfCardSplash(pack);
  return pack;
}

/* 拖放到地图上 / 加号上 → 走上面的导入逻辑 */
async function mfImportFile(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    return await mfImportBytes(buf, file.name);
  } catch (e) {
    if (CTXREF) CTXREF.toast('导入失败：' + (e && e.message || e), 4200, 'err');
    return null;
  }
}

/* 导出对话框：文件名 + 是否 gzip 压缩 + 是否内嵌封面 */
function mfExportDialog(pack) {
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', '', '<div style="margin-bottom:8px">文件名</div>'));
  const inp = mfNode('input', 'mf-inp');
  inp.value = pack.meta.name || 'map';
  inp.style.cssText = 'width:100%;padding:6px 8px';
  wrap.appendChild(inp);
  /* 作品信息卡：署名与寄语随地图远行 */
  wrap.appendChild(mfNode('div', '', '<div style="margin:10px 0 6px">作者署名（会随地图文件一起传给收件人）</div>'));
  const aInp = mfNode('input', 'mf-inp');
  aInp.value = pack.meta.author || (CTXREF && CTXREF.user ? CTXREF.user() : '') || '';
  aInp.placeholder = '留下你的名字，让作品记得它的造物主';
  aInp.style.cssText = 'width:100%;padding:6px 8px';
  wrap.appendChild(aInp);
  wrap.appendChild(mfNode('div', '', '<div style="margin:10px 0 6px">作者的话（可不写）</div>'));
  const dInp = mfNode('textarea', 'mf-inp');
  dInp.value = pack.meta.desc || '';
  dInp.placeholder = '给打开这张地图的人捎句话——这片天地从何而来、藏着什么彩蛋……';
  dInp.style.cssText = 'width:100%;padding:6px 8px;min-height:64px;resize:vertical';
  wrap.appendChild(dInp);
  const gzDefault = mfPrefGet('gzExport', true);
  const rows = mfNode('div');
  rows.style.cssText = 'margin-top:12px;display:flex;flex-direction:column;gap:9px';
  const cbGz = mfCheckRow('用 gzip 压缩（体积小很多，扩展名仍是 .mfmap）', gzDefault, '不支持压缩的环境会自动退回普通 JSON，不影响使用');
  const cbTh = mfCheckRow('内嵌封面缩略图（地图目录里能直接看到预览）', true, '');
  rows.appendChild(cbGz.el); rows.appendChild(cbTh.el);
  wrap.appendChild(rows);
  const tip = mfNode('div', 'mf-note', '');
  tip.style.marginTop = '10px';
  wrap.appendChild(tip);

  const d = mfDialog({
    title: '导出地图', width: '420px', body: wrap,
    buttons: [
      { label: '取消', fn: function () { } },
      {
        label: '⤓ 导出', pri: true, fn: async function () {
          mfPrefSet('gzExport', cbGz.get());
          tip.textContent = '打包中…';
          await mfExportMap(pack, { name: inp.value.trim() || 'map', gz: cbGz.get(), thumb: cbTh.get(), author: aInp.value.trim(), desc: dInp.value.trim() });
          d.close();
        }
      }
    ]
  });
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
  return d;
}

/* opt: { name, gz, thumb } —— gz 为真时输出「魔数 + gzip」二进制包 */
function mfExportMap(pack, opt) {
  opt = opt || {};
  return (async function () {
    try {
      if (opt.thumb !== false && pack.thumb === '' && S.ok && S.pack === pack) pack.thumb = mfSnapshot();
      /* 作品信息卡：写进 pack.meta，序列化时随包远行，下次导出也还在 */
      if (opt.author !== undefined) pack.meta.author = opt.author;
      if (opt.desc !== undefined) pack.meta.desc = opt.desc;
      pack.meta.exportedAt = Date.now();
      const o = mfSerialize(pack);
      if (opt.thumb === false) o.thumb = '';
      const name = opt.name || pack.meta.name || 'map';
      if (opt.gz) {
        if (CTXREF && opt.quiet !== true) CTXREF.toast('打包中…', 1500);
        const gz = await mfGzip(mfBytes(JSON.stringify(o)));
        if (gz) {
          mfDownloadBlob(name + '.mfmap', new Blob([mfPackGz(gz)], { type: 'application/octet-stream' }));
          if (CTXREF) CTXREF.toast('已导出（gzip）：' + name + '.mfmap', 3200, 'ok');
          return { ok: true, gz: true };
        }
        if (CTXREF) CTXREF.toast('当前环境不支持压缩，已按普通格式导出', 3200);
      }
      mfDownload(name + '.mfmap', JSON.stringify(o));
      if (CTXREF) CTXREF.toast('已导出：' + name + '.mfmap', 3000, 'ok');
      return { ok: true, gz: false };
    } catch (e) {
      if (CTXREF) CTXREF.toast('导出失败：' + (e && e.message || e), 3600, 'err');
      return { ok: false };
    }
  })();
}

/* 保存（含防抖自动保存） */
async function mfSaveNow(silent) {
  if (!S.pack) return;
  try {
    /* KiMi3：自动保存不再每次都拍缩略图（toDataURL 要整幅重渲染+回读，很贵）——
       手动保存必拍；自动保存最多 5 分钟补拍一张 */
    if (S.ok && ED.visible && (!silent || Date.now() - (ED.lastThumb || 0) > 300000)) {
      S.pack.thumb = mfSnapshot(); ED.lastThumb = Date.now();
    }
    await mfSaveMap(S.pack);
    mfSessionMark();
    ED.lastSave = Date.now();
    if (!silent && CTXREF) CTXREF.toast('已保存「' + S.pack.meta.name + '」', 1800, 'ok');
  } catch (e) {
    if (CTXREF) CTXREF.toast('保存失败：' + (e && e.message || e), 3600, 'err');
  }
}
function mfTouch() {   // 数据被改动后调用：标脏 + 触发自动保存
  if (!S.pack) return;
  S.dirtyColor = true;
  S.dirtyContour = true;   /* 陆海/势力层可能变了，平滑边界要重抽 */
  if (ED.saveTimer) clearTimeout(ED.saveTimer);
  ED.saveTimer = setTimeout(() => { ED.saveTimer = 0; mfSaveNow(true); }, 20000);
  /* 定时快照：距上一份超过 CFG.SNAP_MS 才拍一张，连续作画时不会刷屏 */
  if (!ED.snapTimer) {
    ED.snapTimer = setTimeout(() => {
      ED.snapTimer = 0;
      if (!S.pack) return;
      const now = Date.now();
      if (now - (ED.lastSnap || 0) < CFG.SNAP_MS) return;
      ED.lastSnap = now;
      mfSnapPush(S.pack, '自动快照');
    }, CFG.SNAP_MS);
  }
}

/* ==========================================================================
 * 历史快照面板：列出这张地图最近 10 份快照，可回滚 / 手动建档 / 删除
 * ========================================================================== */
async function mfSnapDialog() {
  if (!S.pack) { if (CTXREF) CTXREF.toast('当前没有打开的地图', 2400); return; }
  const pk = S.pack;
  let list = await mfSnapList(pk.meta.id);
  const wrap = mfNode('div', 'mf-snap-wrap');
  const tip = mfNode('div', 'mf-note',
    '最近 ' + CFG.MAX_SNAP + ' 份状态留档：定时自动拍、以及「一键填充 / 删除势力 / 删除时代」前各拍一张。'
    + '回滚时会自动把<b>当前状态</b>也存成一份新快照，所以随时能再滚回来。');
  wrap.appendChild(tip);

  const bar = mfNode('div', 'mf-row');
  bar.style.cssText = 'margin:10px 0;gap:8px';
  const bNew = mfNode('div', 'mf-btn pri', '＋ 立即建立快照');
  const bClr = mfNode('div', 'mf-btn dgr', '清空全部快照');
  bar.appendChild(bNew); bar.appendChild(bClr);
  wrap.appendChild(bar);

  const grid = mfNode('div', 'mf-snap-grid');
  wrap.appendChild(grid);

  function render() {
    grid.innerHTML = '';
    if (!list.length) {
      grid.appendChild(mfNode('div', 'mf-note', '还没有快照。继续编辑一会儿会自动留档，也可以点上面的「立即建立快照」。'));
      return;
    }
    /* 新的在上 */
    list.slice().reverse().forEach((s) => {
      const card = mfNode('div', 'mf-snap-card');
      const img = mfNode('div', 'mf-snap-thumb');
      if (s.thumb) { const i = mfNode('img'); i.src = s.thumb; img.appendChild(i); }
      else { img.textContent = '图'; img.style.cssText += ';display:flex;align-items:center;justify-content:center;font-size:20px'; }
      card.appendChild(img);
      card.appendChild(mfNode('div', 'mf-snap-nm', esc(pk.meta.name || '') + (s.label ? ' · ' + esc(s.label) : '')));
      card.appendChild(mfNode('div', 'mf-snap-sb', fmtTime(s.t) + ' · ' + (s.eras || 1) + ' 个时代'));
      const acts = mfNode('div', 'mf-snap-act');
      const bR = mfNode('div', 'mf-btn pri', '↺ 恢复');
      const bD = mfNode('div', 'mf-btn', '✕');
      acts.appendChild(bR); acts.appendChild(bD);
      card.appendChild(acts);
      bR.addEventListener('click', () => {
        mfConfirm('回到 ' + fmtTime(s.t) + (s.label ? '（' + esc(s.label) + '）' : '') + ' 的状态？'
          + '当前进度会先自动存成一份新快照。', async () => {
            try {
              const fresh = await mfSnapRestore(pk, s.id);
              d.close();
              mfOpenMap(fresh);
              await mfSaveNow(true);
              if (CTXREF) CTXREF.toast('已回滚到 ' + fmtTime(s.t) + ' 的状态', 3200, 'ok');
            } catch (e) { if (CTXREF) CTXREF.toast('回滚失败：' + (e && e.message || e), 3600, 'err'); }
          }, { title: '回滚到这个快照', okLabel: '回滚' });
      });
      bD.addEventListener('click', async () => {
        await mfSnapDel(pk.meta.id, s.id);
        list = await mfSnapList(pk.meta.id);
        render();
      });
      grid.appendChild(card);
    });
  }
  render();

  const d = mfDialog({ title: '历史快照 · ' + (pk.meta.name || ''), cls: 'mf-snap', body: wrap, width: 'min(660px,92vw)' });
  bNew.addEventListener('click', async () => {
    await mfSnapPush(pk, '手动建档');
    list = await mfSnapList(pk.meta.id);
    render();
    if (CTXREF) CTXREF.toast('已建立快照', 2000, 'ok');
  });
  bClr.addEventListener('click', () => {
    mfConfirm('清空这张地图的全部快照？之后就无法回滚了。', async () => {
      await mfSnapClear(pk.meta.id);
      list = []; render();
    }, { dgr: true, okLabel: '清空', title: '清空快照' });
  });
  return d;
}

/* ===================== 50_tools.js ===================== */
/* ==========================================================================
 * 工具层①：工具包面板 · 三支笔 / 橡皮擦 / 填充 · 笔画引擎 · 撤销栈
 * ========================================================================== */

/* 需要显式解绑的 window/document 监听：清理时逐个解绑，保证无残留 */
const MF_OFFS = [];
function mfOn(target, type, fn, opt) {
  target.addEventListener(type, fn, opt);
  const off = function () { try { target.removeEventListener(type, fn, opt); } catch (e) { } };
  MF_OFFS.push(off);
  return off;
}

/* 作画用鼠标哪个键：默认左键；设置里勾了「左右键互换」就用右键 */
function mfPaintBtn() { return mfMouseSwap() ? 2 : 0; }

/* ------------------------------------------------------------ 撤销栈 ------ */
function mfPushUndo(e) {
  ED.undo.push(e);
  /* KiMi3：地形建模这类 big 条目闭包里各挂着一整张高度场（约 4MB），
     堆满 80 步就是几百兆——大条目最多留 3 步，超出丢弃最旧的 */
  if (e.big) {
    let seen = 0;
    for (let i = ED.undo.length - 1; i >= 0; i--) {
      if (ED.undo[i].big) { seen++; if (seen > 3) ED.undo.splice(i, 1); }
    }
  }
  if (ED.undo.length > 80) ED.undo.shift();
  ED.redo.length = 0;
}
function mfPushCellUndo(layer, idxArr, oldArr, val) {
  if (!idxArr.length) return;
  mfPushUndo({ k: 'cells', layer: layer, idx: idxArr, old: oldArr, val: val });
}
function mfUndo() {
  const e = ED.undo.pop();
  if (!e) { if (CTXREF) CTXREF.toast('没有可撤销的操作', 1500); return; }
  mfApplyEntry(e, false);
  ED.redo.push(e);
}
function mfRedo() {
  const e = ED.redo.pop();
  if (!e) { if (CTXREF) CTXREF.toast('没有可重做的操作', 1500); return; }
  mfApplyEntry(e, true);
  ED.undo.push(e);
}
function mfApplyEntry(e, forward) {
  if (e.k === 'cells') {
    const g = S.map.grid;
    const arr = g[e.layer];
    if (forward) { for (let i = 0; i < e.idx.length; i++) arr[e.idx[i]] = e.val; }
    else { for (let i = 0; i < e.idx.length; i++) arr[e.idx[i]] = e.old[i]; }
    S.dirtyColor = true; mfTouch();
    if (e.layer === 'polity') mfRenderPolityList();
  } else if (e.k === 'fn') {
    try { (forward ? e.redo : e.undo)(); } catch (err) { console.error(err); }
  }
}
/* 结构性操作：undo/redo 由闭包给出 */
function mfPushFnUndo(undoFn, redoFn, label, big) {
  mfPushUndo({ k: 'fn', undo: undoFn, redo: redoFn, label: label || '', big: !!big });
}

/* ------------------------------------------------------------ 笔画引擎 ---- */
let _stroke = null;
function mfSlerpLL(lon1, lat1, lon2, lat2, t) {
  const a1 = lon1 * D2R, d1 = lat1 * D2R, a2 = lon2 * D2R, d2 = lat2 * D2R;
  const c1 = Math.cos(d1), c2 = Math.cos(d2);
  const v1 = [c1 * Math.cos(a1), Math.sin(d1), c1 * Math.sin(a1)];
  const v2 = [c2 * Math.cos(a2), Math.sin(d2), c2 * Math.sin(a2)];
  let dot = clamp(v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2], -1, 1);
  const om = Math.acos(dot);
  if (om < 1e-6) return { lon: lon2, lat: lat2 };
  const s = Math.sin(om);
  const f1 = Math.sin((1 - t) * om) / s, f2 = Math.sin(t * om) / s;
  const x = v1[0] * f1 + v2[0] * f2, y = v1[1] * f1 + v2[1] * f2, z = v1[2] * f1 + v2[2] * f2;
  return { lon: Math.atan2(z, x) * R2D, lat: Math.asin(clamp(y, -1, 1)) * R2D };
}
function mfAngDist(lon1, lat1, lon2, lat2) {
  const a1 = lon1 * D2R, d1 = lat1 * D2R, a2 = lon2 * D2R, d2 = lat2 * D2R;
  const c1 = Math.cos(d1), c2 = Math.cos(d2);
  const dot = c1 * Math.cos(a1) * c2 * Math.cos(a2) + Math.sin(d1) * Math.sin(d2) + c1 * Math.sin(a1) * c2 * Math.sin(a2);
  return Math.acos(clamp(dot, -1, 1));
}

function mfStrokeBegin(lon, lat) {
  const t = mfCurToolSpec();
  if (!t) return;
  if (_preview && _preview.kind !== 'paint') {
    if (CTXREF) CTXREF.toast('先「✓ 确认」或「✕ 取消」当前的圈地预览，再开新笔画', 2600);
    return;
  }
  if (t.kind === 'polity') {
    if (!ED.selPolity) {
      const p = mfCreatePolity();
      ED.selPolity = p.id;
      mfRenderPolityList();
    }
  }
  /* multi：仅「全部」橡皮使用，四层分开记录（否则撤销时会把地形值写进区域层） */
  _stroke = {
    spec: t, idx: [], old: [], last: { lon: lon, lat: lat },
    path: [{ lon: lon, lat: lat }], px: ED.brushPx,
    multi: [{ idx: [], old: [] }, { idx: [], old: [] }, { idx: [], old: [] }, { idx: [], old: [] }]
  };
  mfStampAt(lon, lat);
}
function mfStrokeTo(lon, lat) {
  if (!_stroke) return;
  const st = _stroke;
  const rad = mfPixelToRad(ED.brushPx, lon, lat);
  const dist = mfAngDist(st.last.lon, st.last.lat, lon, lat);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1e-4, rad * 0.35)));
  for (let i = 1; i <= steps; i++) {
    const p = mfSlerpLL(st.last.lon, st.last.lat, lon, lat, i / steps);
    mfStampAt(p.lon, p.lat);
    if (st.spec.kind === 'river') st.path.push(p);   /* 河流成带要用完整折线 */
  }
  st.last = { lon: lon, lat: lat };
}
function mfStrokeEnd() {
  if (!_stroke) return;
  const st = _stroke;
  _stroke = null;
  /* 城镇笔：笔迹扫过的格子交给撒城算法，栅格本身一个字节都没动 */
  if (st.spec.kind === 'town') { mfTownsSpawn(st.idx); return; }
  /* 河流笔：沿笔迹折线自动生成水面条带建模 */
  if (st.spec.kind === 'river') { mfRiverBuild(st.path, st.px); return; }
  /* 「全部」橡皮：四层分别恢复 / 清零 */
  if (st.spec.extra === 'all') {
    const L = ['region', 'terrain', 'polity', 'water'];
    const packs = [];
    for (let q = 0; q < 4; q++) {
      const m = st.multi[q];
      if (!m.idx.length) continue;
      packs.push({
        layer: L[q], idx: Int32Array.from(m.idx),
        old: L[q] === 'polity' ? Uint16Array.from(m.old) : Uint8Array.from(m.old)
      });
    }
    if (packs.length) {
      const apply = (mode) => {
        for (const p of packs) {
          const arr = S.map.grid[p.layer];
          for (let i = 0; i < p.idx.length; i++) arr[p.idx[i]] = (mode === 'undo') ? p.old[i] : 0;
        }
        S.dirtyColor = true; mfTouch(); mfRenderPolityList();
      };
      mfPushFnUndo(() => apply('undo'), () => apply('redo'), '擦除（全部）');
    }
    S.dirtyColor = true; mfTouch(); mfRenderPolityList();
    return;
  }
  if (!st.idx.length) return;
  /* 涂抹预览：格子已写入数据层（拖笔时的即时反馈），但先以半透浅色示人；
   * 撤销入栈推迟到「✓ 确认」，「✕ 取消」则整批还原 */
  mfPaintPreviewMerge(st);
  S.dirtyColor = true;
  mfTouch();
  if (st.spec.kind === 'polity') mfRenderPolityList();
}

/* 当前工具 → {layer, val, kind} */
function mfCurToolSpec() {
  const t = ED.tool;
  if (!t || !S.map) return null;
  if (t === 'land') return { layer: 'region', val: 1, kind: 'region' };
  if (t === 'sea') return { layer: 'region', val: 2, kind: 'region' };
  if (t === 'other') return { layer: 'region', val: 3, kind: 'region' };
  if (t === 'erase') {
    const L = ED.eraseLayer || 'region';
    if (L === 'all') return { layer: 'region', val: 0, kind: 'region', extra: 'all' };
    if (L === 'polity') return { layer: 'polity', val: 0, kind: 'polity' };
    if (L === 'terrain') return { layer: 'terrain', val: 0, kind: 'terrain' };
    return { layer: 'region', val: 0, kind: 'region' };
  }
  if (t === 'polity') {
    const p = mfPolityById(ED.selPolity);
    return { layer: 'polity', val: p ? p.seq : 1, kind: 'polity' };
  }
  if (t === 'town') return { layer: null, val: 0, kind: 'town' };   /* 城镇笔：只记笔迹不改格子 */
  if (t === 'water') {
    return (ED.waterKind || 'lake') === 'river'
      ? { layer: null, val: 0, kind: 'river' }                     /* 河流：记笔迹折线，松手成带 */
      : { layer: 'water', val: 1, kind: 'lake' };                  /* 湖泊：涂水域层，一键成面 */
  }
  if (t.indexOf('terrain:') === 0) {
    const ti = parseInt(t.slice(8), 10);
    return { layer: 'terrain', val: ti + 1, kind: 'terrain' };
  }
  return null;
}

/* 一次圆形盖章：写入并记录旧值 */
function mfStampAt(lon, lat) {
  const st = _stroke;
  if (!st || !S.map) return;
  const g = S.map.grid;
  const spec = st.spec;
  const rad = mfPixelToRad(ED.brushPx, lon, lat);
  const all = spec.extra === 'all';
  const LAYERS = ['region', 'terrain', 'polity', 'water'];
  mfStampGrid(g, lon, lat, rad, function (i) {
    if (all) {
      /* 「全部」橡皮：连地形、势力与水域一起清空（四层分开记录旧值） */
      for (let q = 0; q < 4; q++) {
        const arr = g[LAYERS[q]];
        const ov = arr[i];
        if (ov === 0) continue;
        const rec = st.multi[q];
        rec.idx.push(i); rec.old.push(ov);
        arr[i] = 0;
      }
      return;
    }
    if (spec.kind === 'town' || spec.kind === 'river') { st.idx.push(i); return; }   /* 只记笔迹，松手统一处理 */
    const arr = g[spec.layer];
    const ov = arr[i];
    if (ov === spec.val) return;
    st.idx.push(i); st.old.push(ov);
    arr[i] = spec.val;
  });
  S.dirtyColor = true;
}

/* ------------------------------------------------------------ 填充按钮 ---- */
/* ⚠ 填充是不可逆的大范围改动（撤销栈救不回来时就靠快照），动手前先留一份 */
function mfFillUnclaimed() {
  if (!S.map) return;
  mfSnapPush(S.pack, '一键填充前');
  const g = S.map.grid, kind = ED.fillKind;
  const idx = [], old = [];
  const n = g.region.length;
  for (let i = 0; i < n; i++) {
    if (g.region[i] === 0) { idx.push(i); old.push(0); g.region[i] = kind; }
  }
  if (!idx.length) { if (CTXREF) CTXREF.toast('没有未圈定的区域可填充', 2200); return; }
  mfPushCellUndo('region', Int32Array.from(idx), Uint8Array.from(old), kind);
  S.dirtyColor = true; mfTouch();
  if (CTXREF) CTXREF.toast('已把 ' + idx.length + ' 格未圈定区域填充为「' + CFG.REGION[kind].n + '」', 2600, 'ok');
}

/* ------------------------------------------------------------ 地形填充 ----
 * 油漆桶：从点击格向四周漫延，遇到「地形不同」或「海陆不同」的格子就停下——
 * 也就是用别的地形画笔（或海岸线）围一个封闭图形，点内部即可整块填色 */
function mfTerrainBucket(lon, lat) {
  if (!S.map) return;
  const t = S.map.terrains[ED.terrainIdx];
  if (!t) { if (CTXREF) CTXREF.toast('先在上面选一支地形画笔', 2200); return; }
  const g = S.map.grid, w = g.w, h = g.h, n = w * h;
  const start = g.yOf(lat) * w + g.xOf(lon);
  const srcT = g.terrain[start], srcR = g.region[start];
  const tv = ED.terrainIdx + 1;
  if (srcT === tv) { if (CTXREF) CTXREF.toast('这里已经是「' + t.name + '」了', 2000); return; }
  const seen = new Uint8Array(n);
  const q = new Int32Array(n);
  let qh = 0, qt = 0;
  q[qt++] = start; seen[start] = 1;
  const idx = [], old = [];
  while (qh < qt) {
    const i = q[qh++];
    idx.push(i); old.push(g.terrain[i]);
    const x = i % w, y = (i - x) / w;
    /* 四邻（经度方向环绕）；逐邻居内联，避免百万格上的数组分配 */
    let j;
    if (y > 0) { j = i - w; if (!seen[j] && g.terrain[j] === srcT && g.region[j] === srcR) { seen[j] = 1; q[qt++] = j; } }
    if (y < h - 1) { j = i + w; if (!seen[j] && g.terrain[j] === srcT && g.region[j] === srcR) { seen[j] = 1; q[qt++] = j; } }
    j = y * w + (x > 0 ? x - 1 : w - 1); if (!seen[j] && g.terrain[j] === srcT && g.region[j] === srcR) { seen[j] = 1; q[qt++] = j; }
    j = y * w + (x < w - 1 ? x + 1 : 0); if (!seen[j] && g.terrain[j] === srcT && g.region[j] === srcR) { seen[j] = 1; q[qt++] = j; }
  }
  if (!idx.length) return;
  for (let k = 0; k < idx.length; k++) g.terrain[idx[k]] = tv;
  mfPushCellUndo('terrain', Int32Array.from(idx), Uint8Array.from(old), tv);
  S.dirtyColor = true; mfTouch(); mfMaybeShowTerrainBuild();
  if (CTXREF) CTXREF.toast('已填充「' + t.name + '」：' + idx.length + ' 格（边界＝另一种地形或海陆交界）', 2600, 'ok');
}

/* ------------------------------------------------------------ 圈地模式 ----
 * 与涂抹并列的第二种作画方式：左键连点成多边形，双击 / 回点起点闭合，
 * 内部栅格填为当前笔类型（三支笔 / 势力笔 / 地形画笔 / 橡皮都支持）；Esc 取消 */
let _lasso = null;
function mfLassoStart(lon, lat) {
  const spec = mfCurToolSpec();
  if (!spec) return;
  if (spec.kind === 'polity' && !ED.selPolity) {
    const p = mfCreatePolity();
    ED.selPolity = p.id;
    mfRenderPolityList();
  }
  _lasso = { pts: [{ lon: lon, lat: lat }], cur: null };
  mfDrawLabels();
}
function mfLassoAdd(lon, lat) {
  if (!_lasso) return;
  /* 图形圈地（圆/椭圆/矩形/平行四边形）：点够数就自动生成多边形并闭合 */
  const __shape = ED.lassoShape || 'free';
  if (__shape !== 'free' && __shape !== 'curve') {
    _lasso.pts.push({ lon: lon, lat: lat });
    const need = __shape === 'para' ? 3 : 2;
    if (_lasso.pts.length >= need) {
      _lasso.pts = mfShapePoly(__shape, _lasso.pts.slice(0, need));
      mfLassoClose();
      return;
    }
    mfDrawLabels();
    return;
  }
  const last = _lasso.pts[_lasso.pts.length - 1];
  if (mfAngDist(last.lon, last.lat, lon, lat) < 0.002) return;   /* 双击的第一次 down 去重 */
  if (_lasso.pts.length >= 3) {
    const p0 = _lasso.pts[0];
    if (mfAngDist(p0.lon, p0.lat, lon, lat) < 0.01) { mfLassoClose(); return; }   /* 回点起点＝闭合 */
  }
  _lasso.pts.push({ lon: lon, lat: lat });
  mfDrawLabels();
}
function mfLassoCancel(silent) {
  if (!_lasso) return;
  _lasso = null;
  _adj = null; ED.lassoAdjust = false;
  _preview = null; ED.lassoPreview = false;
  mfDrawLabels();
  mfPreviewBarRefresh();
  if (!silent && CTXREF) CTXREF.toast('已取消圈地', 1600);
}
function mfLassoPreviewConfirm() {
  if (!_preview || _preview.kind !== 'lasso' || !_lasso) return;
  const pts = _lasso.pts.slice(), spec = _preview.spec;
  _lasso = null; _adj = null; ED.lassoAdjust = false; ED.lassoPreview = false;
  _preview = null;
  mfDrawLabels(); mfPreviewBarRefresh();
  mfLassoApply(pts, spec);
  mfHintForTool();
}
function mfLassoPreviewCancel() {
  if (!_preview || _preview.kind !== 'lasso') return;
  _lasso = null; _adj = null; ED.lassoAdjust = false; ED.lassoPreview = false;
  _preview = null;
  mfDrawLabels(); mfPreviewBarRefresh(); mfHintForTool();
  if (CTXREF) CTXREF.toast('已取消这次圈地', 1600);
}
function mfLassoClose() {
  if (!_lasso) return;
  let pts = _lasso.pts.slice();
  /* 平滑曲线：闭合前按档位做几轮 Chaikin 磨角（端点不动） */
  if ((ED.lassoShape || 'free') === 'curve') {
    const pass = ED.curvePass == null ? 2 : ED.curvePass;
    for (let p = 0; p < pass; p++) pts = mfChaikin(pts);
  }
  if (pts.length < 3 || !S.map) { _lasso = null; _adj = null; ED.lassoAdjust = false; mfDrawLabels(); return; }
  const spec = mfCurToolSpec();
  if (!spec) { _lasso = null; _adj = null; ED.lassoAdjust = false; mfDrawLabels(); return; }
  /* 闭合不直接上色，进预览：线条留在球面上，可微调、可确认、可取消 */
  _lasso.pts = pts; _lasso.cur = null; _lasso.curLL = null;
  _adj = null; ED.lassoAdjust = false;
  ED.lassoPreview = true;
  _preview = { kind: 'lasso', spec: spec };
  mfDrawLabels(); mfPreviewBarRefresh(); mfHintForTool();
  if (CTXREF) CTXREF.toast('圈地预览：满意点「✓ 确认上色」，想改线条点「✏ 微调线条」', 3400);
}
/* 预览确认后：把圈定范围真正写入数据层 */
function mfLassoApply(pts, spec) {
  if (!S.map || !spec) return;
  const g = S.map.grid;
  /* 经度解卷：以首点为基准摊到连续区间，跨 180° 经线也不会断成两半 */
  const base = pts[0].lon;
  const unw = (lo) => { let d = lo - base; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  const P = pts.map((p) => ({ x: unw(p.lon), y: p.lat }));
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  P.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      if (((P[i].y > y) !== (P[j].y > y)) && (x < (P[j].x - P[i].x) * (y - P[i].y) / (P[j].y - P[i].y) + P[i].x)) c = !c;
    }
    return c;
  };
  /* 目标层：普通笔一层；「全部」橡皮三层一起清（各记一条撤销，连按 Ctrl+Z 逐层回退） */
  const targets = (spec.extra === 'all')
    ? [{ layer: 'region', val: 0 }, { layer: 'terrain', val: 0 }, { layer: 'polity', val: 0 }]
    : [{ layer: spec.layer, val: spec.val }];
  const touched = targets.map(() => ({ idx: [], old: [] }));
  const seen = new Set();
  const put = (i) => {
    if (seen.has(i)) return;
    seen.add(i);
    targets.forEach((t, q) => {
      const arr = g[t.layer], ov = arr[i];
      if (ov === t.val) return;
      touched[q].idx.push(i); touched[q].old.push(ov); arr[i] = t.val;
    });
  };
  /* ① 面填：格子中心落在多边形内 */
  for (let gy = 0; gy < g.h; gy++) {
    const lat = g.latOfY(gy);
    if (lat < y0 - g.res || lat > y1 + g.res) continue;
    for (let gx = 0; gx < g.w; gx++) {
      const x = unw(g.lonOfX(gx));
      if (x < x0 - g.res * 2 || x > x1 + g.res * 2) continue;
      if (inside(x, lat)) put(gy * g.w + gx);
    }
  }
  /* ② 边扫：沿多边形边走一遍小印章，吃掉压线格，轮廓更顺滑 */
  const rad = Math.max(1e-4, g.res * 0.7 * D2R);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dist = mfAngDist(a.lon, a.lat, b.lon, b.lat);
    const steps = Math.max(1, Math.ceil(dist / (rad * 0.6)));
    for (let s = 0; s <= steps; s++) {
      const p = mfSlerpLL(a.lon, a.lat, b.lon, b.lat, s / steps);
      mfStampGrid(g, p.lon, p.lat, rad, put);
    }
  }
  if (!seen.size) { if (CTXREF) CTXREF.toast('圈定范围内没有需要改动的格子', 2000); return; }
  targets.forEach((t, q) => {
    if (!touched[q].idx.length) return;
    mfPushCellUndo(t.layer, Int32Array.from(touched[q].idx),
      t.layer === 'polity' ? Uint16Array.from(touched[q].old) : Uint8Array.from(touched[q].old), t.val);
  });
  S.dirtyColor = true; S.dirtyContour = true; mfTouch(); mfRenderPolityList(); mfMaybeShowTerrainBuild();
  if (CTXREF) CTXREF.toast('圈地完成：改动 ' + seen.size + ' 格', 2200, 'ok');
}

/* ------------------------------------------------------------ 直线模式 ----
 * 两点连线作画：第一次左键定起点，移动时虚线预览，第二次左键沿球面大圆
 * 拉一条直笔道（复用笔画引擎：撤销 / 多层橡皮 / 河流成带全部照常）；Esc 取消 */
let _line = null;
let _adj = null;   /* 圈地微调状态：{a,b＝选段端点下标, drag＝拖动中} */
let _preview = null;   /* 作画预览：{kind:'lasso',spec} 或 {kind:'paint', layers:Map(layer→{val,cells:Map})} */
let _pvCells = null;   /* 涂抹预览涉及的格子集合（渲染半透浅色用） */
let _pvErase = false;  /* 预览中按住 Alt 拖动的擦除状态 */
function mfLineCancel(silent) {
  if (!_line) return;
  _line = null;
  mfDrawLabels();
  if (!silent && CTXREF) CTXREF.toast('已取消直线', 1500);
}
function mfLineCommit(lon2, lat2) {
  if (!_line || !S.map) { _line = null; return; }
  const a = _line.a;
  _line = null;
  mfDrawLabels();
  if (mfAngDist(a.lon, a.lat, lon2, lat2) < 1e-4) return;   /* 原地连点不算 */
  mfStrokeBegin(a.lon, a.lat);
  if (!_stroke) return;
  const rad = mfPixelToRad(ED.brushPx, lon2, lat2);
  const dist = mfAngDist(a.lon, a.lat, lon2, lat2);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1e-4, rad * 0.35)));
  for (let i = 1; i <= steps; i++) {
    const p = mfSlerpLL(a.lon, a.lat, lon2, lat2, i / steps);
    mfStampAt(p.lon, p.lat);
    if (_stroke && _stroke.spec.kind === 'river') _stroke.path.push(p);
  }
  mfStrokeEnd();
}

/* ------------------------------------------------------------ 圈地图形 ----
 * 右键「圈地」按钮选图形：折线(默认) / 平滑曲线 / 圆 / 椭圆 / 矩形 / 平行四边形 */
/* 圈地图形清单（图标 + 名称），工具条与地形页共用 */
function mfLassoShapeList() {
  return [['free', '✏', '折线（逐点连线）'], ['curve', '〰', '平滑曲线'], ['circle', '○', '圆'],
  ['ellipse', '⬭', '椭圆'], ['square', '▢', '矩形'], ['para', '▱', '平行四边形']];
}
/* 微调开关的公共逻辑：圈地至少两个点才能开 */
function mfLassoAdjustToggle() {
  if (!_lasso || _lasso.pts.length < 2) {
    if (CTXREF) CTXREF.toast('先用圈地在球面上点出至少两个点，再开微调', 2600);
    return;
  }
  ED.lassoAdjust = !ED.lassoAdjust;
  if (!ED.lassoAdjust) _adj = null;
  ED.adjMode = ED.adjMode || 'sel';
  mfBuildPanel(); mfHintForTool();
}
/* 微调模式右键切换（选段 ⇄ 修改），工具条与地形页共用 */
function mfLassoAdjModeCycle() {
  ED.adjMode = (ED.adjMode === 'mod') ? 'sel' : 'mod';
  if (CTXREF) CTXREF.toast('微调模式：' + (ED.adjMode === 'mod' ? '修改（拉动/删除所选段）' : '选段（沿线条点两个端点选一段）'), 2600);
  mfHintForTool();
}
function mfLassoShapeMenu(x, y) {
  const cur = ED.lassoShape || 'free';
  const mk = (id, icon, label, tip) => ({
    icon: icon, label: label + (cur === id ? ' ✓' : ''), title: tip || '',
    fn: () => {
      ED.lassoShape = id;
      mfLassoCancel(true);
      if (CTXREF) CTXREF.toast('圈地图形：' + label, 2200);
      mfBuildPanel(); mfHintForTool();
    }
  });
  mfMenu(x, y, [
    mk('free', '✏', '折线（默认）', '逐点连线，双击或回点起点闭合'),
    mk('curve', '〰', '平滑曲线', '逐点连线，闭合时自动磨圆棱角'),
    { icon: '≋', label: '曲线平滑度：' + (ED.curvePass == null ? 2 : ED.curvePass) + ' 档（点我 +1，0-4 循环）',
      fn: () => { ED.curvePass = ((ED.curvePass == null ? 2 : ED.curvePass) + 1) % 5; } },
    { sep: true },
    mk('circle', '○', '圆', '第一点＝圆心，第二点＝边缘'),
    mk('ellipse', '⬭', '椭圆', '第一点、第二点＝外接框的两个对角'),
    mk('square', '▢', '正方形 / 矩形', '第一点、第二点＝两个对角'),
    mk('para', '▱', '平行四边形', '第一、二点＝一条边，第三点往旁拉歪斜')
  ]);
}
/* 由 2~3 个定义点生成图形多边形（经纬度点列，供圈地闭合填充） */
function mfShapePoly(shape, pts) {
  const out = [];
  if (shape === 'circle') {
    const c = pts[0], e = pts[1];
    const r = mfAngDist(c.lon, c.lat, e.lon, e.lat);
    if (r < 1e-5) return pts.slice();
    const d1 = c.lat * D2R, a1 = c.lon * D2R;
    const sd = Math.sin(d1), cd = Math.cos(d1), sr = Math.sin(r), cr = Math.cos(r);
    for (let k = 0; k < 64; k++) {
      const th = k / 64 * Math.PI * 2;
      const lat2 = Math.asin(clamp(sd * cr + cd * sr * Math.cos(th), -1, 1));
      const lon2 = a1 + Math.atan2(Math.sin(th) * sr * cd, cr - sd * Math.sin(lat2));
      out.push({ lon: ((lon2 * R2D) + 540) % 360 - 180, lat: lat2 * R2D });
    }
    return out;
  }
  const a = pts[0], b = pts[1];
  if (shape === 'ellipse') {
    const cx = (a.lon + b.lon) / 2, cy = (a.lat + b.lat) / 2;
    const rx = Math.abs(b.lon - a.lon) / 2, ry = Math.abs(b.lat - a.lat) / 2;
    for (let i = 0; i < 64; i++) {
      const t = i / 64 * Math.PI * 2;
      out.push({ lon: cx + rx * Math.cos(t), lat: clamp(cy + ry * Math.sin(t), -89, 89) });
    }
    return out;
  }
  if (shape === 'square') {
    const cs = [[a.lon, a.lat], [b.lon, a.lat], [b.lon, b.lat], [a.lon, b.lat]];
    for (let i = 0; i < 4; i++) {
      const c2 = cs[(i + 1) % 4];
      for (let j = 0; j < 8; j++) {
        const t = j / 8;
        out.push({ lon: cs[i][0] + (c2[0] - cs[i][0]) * t, lat: cs[i][1] + (c2[1] - cs[i][1]) * t });
      }
    }
    return out;
  }
  if (shape === 'para' && pts.length >= 3) {
    const c = pts[2];
    const cs = [[a.lon, a.lat], [b.lon, b.lat], [b.lon + (c.lon - a.lon), b.lat + (c.lat - a.lat)], [c.lon, c.lat]];
    for (let i = 0; i < 4; i++) {
      const c2 = cs[(i + 1) % 4];
      for (let j = 0; j < 8; j++) {
        const t = j / 8;
        out.push({ lon: cs[i][0] + (c2[0] - cs[i][0]) * t, lat: cs[i][1] + (c2[1] - cs[i][1]) * t });
      }
    }
    return out;
  }
  return pts.slice();
}
/* Chaikin 磨角：每轮把每条边换成 1/4 与 3/4 处的两个点，端点保持不动 */
function mfChaikin(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push({ lon: a.lon * 0.75 + b.lon * 0.25, lat: a.lat * 0.75 + b.lat * 0.25 });
    out.push({ lon: a.lon * 0.25 + b.lon * 0.75, lat: a.lat * 0.25 + b.lat * 0.75 });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/* ------------------------------------------------------------ 圈地微调 ----
 * 选段模式：沿线条先后点两个端点，选中其间一段（白点标出）
 * 修改模式：左键拉动所选段（未选段则拉最近的点），Delete 删除所选段 */
function mfNearestLassoIdx(lon, lat) {
  let best = -1, bd = 1e9;
  _lasso.pts.forEach((p, i) => {
    const d = mfAngDist(p.lon, p.lat, lon, lat);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function mfAdjustSelIdx() {
  if (!_adj || _adj.a == null || _adj.a < 0) return [];
  if (_adj.b == null || _adj.b < 0 || _adj.b === _adj.a) return [_adj.a];
  const lo = Math.min(_adj.a, _adj.b), hi = Math.max(_adj.a, _adj.b);
  const out = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}
function mfAdjustDown(lon, lat) {
  if (!_lasso) return;
  if (!_adj) _adj = { a: -1, b: -1, drag: null };
  const i = mfNearestLassoIdx(lon, lat);
  if (i < 0) return;
  if ((ED.adjMode || 'sel') === 'sel') {
    if (_adj.a < 0 || _adj.b >= 0) { _adj.a = i; _adj.b = -1; }
    else _adj.b = i;
    mfDrawLabels();
    return;
  }
  _adj.drag = { last: { lon: lon, lat: lat } };
  ED.painting = true;
}
function mfAdjustDrag(lon, lat) {
  const dg = _adj && _adj.drag;
  if (!dg || !_lasso) return;
  const dl = lon - dg.last.lon, dt = lat - dg.last.lat;
  dg.last = { lon: lon, lat: lat };
  const sel = mfAdjustSelIdx();
  if (!sel.length) return;
  sel.forEach((i) => {
    if (!_lasso.pts[i]) return;
    _lasso.pts[i].lon += dl;
    _lasso.pts[i].lat = clamp(_lasso.pts[i].lat + dt, -89, 89);
  });
}

/* ------------------------------------------------------- 画布交互绑定 ---- */
function mfBindCanvas() {
  if (!S.canvas || S.canvas.__mfBound) return;
  S.canvas.__mfBound = true;

  S.canvas.addEventListener('contextmenu', (e) => {
    /* 空间标记：任何状态下右键都弹管理菜单 */
    const spHit = mfPickSpace(e.clientX, e.clientY);
    if (spHit) { e.preventDefault(); mfSpaceMenu(spHit, e.clientX, e.clientY); return; }
    if (ED.labelMode && ED.tool === 'label') { e.preventDefault(); mfLabelAddAt(e.clientX, e.clientY); return; }
    /* 圈地微调中：右键＝切换 选段/修改 两种模式 */
    if (ED.lassoAdjust && _lasso) {
      e.preventDefault(); e.stopPropagation();
      ED.adjMode = (ED.adjMode === 'mod') ? 'sel' : 'mod';
      if (CTXREF) CTXREF.toast(ED.adjMode === 'mod'
        ? '修改模式：左键拉动选中的线条段（未选段则拉动最近的点）；Delete＝删除选中段'
        : '选段模式：沿圈地线条先后点两个端点，选中其间一段', 3000);
      mfHintForTool();
      return;
    }
    if (ED.painting) { e.preventDefault(); return; }
    if (!ED.edit) return;                    // 浏览态保留浏览器菜单也不合适：统一屏蔽
    e.preventDefault();
  });

  S.canvas.addEventListener('pointerdown', (e) => {
    if (!ED.visible) return;
    if (ED.deploy) return;   /* 部署预览期间，画布交互归预览全权处理 */
    /* ▣ 建模实例：左键点选实例，按住拖动＝换位；点空白＝取消选中 */
    if (e.button === mfPaintBtn() && ED.edit && ED.tool === 'model' && S.map) {
      const iid = mfPickInst(e.clientX, e.clientY);
      if (iid) {
        const ins0 = mfFindInst(iid);
        ED.selInst = iid; ED.dragInst = iid;
        ED.dragFrom = ins0 ? { lon: ins0.lon, lat: ins0.lat } : null;
      } else {
        ED.selInst = null;
      }
      mfRebuildInstances(); mfBuildPanel();
      if (iid) e.preventDefault();
      return;
    }
    /* ● 重塑星球：左键＝塑形笔刷（开启时优先于一切作画工具） */
    if (e.button === mfPaintBtn() && ED.edit && ED.reshape && S.map) {
      const hitS = mfPick(e.clientX, e.clientY);
      if (hitS) { e.preventDefault(); mfShapeStrokeBegin(hitS); }
      return;
    }
    /* ◎ 空间笔：左键＝以点中处为圆心圈定空间 */
    if (e.button === mfPaintBtn() && ED.edit && ED.tool === 'space' && S.map) {
      const hitSp = mfPick(e.clientX, e.clientY);
      if (hitSp) { e.preventDefault(); mfSpaceCreateAt(hitSp); }
      return;
    }
    /* 作画用哪个键由设置决定（默认左键，勾了「互换」就用右键） */
    if (e.button === mfPaintBtn() && ED.edit && ED.tool && ED.tool !== 'label' && ED.tool !== 'model' && ED.tool !== 'space') {
      const hit = mfPick(e.clientX, e.clientY);
      if (hit) {
        e.preventDefault();
        /* 圈地微调中：左键归微调器（选段 / 拉动），不再加新点 */
        if (ED.lassoAdjust && _lasso) { mfAdjustDown(hit.lon, hit.lat); return; }
        /* 地形油漆桶：点封闭区域内部整块填色 */
        if (ED.tool === 'tfill') {
          if (_preview) { if (CTXREF) CTXREF.toast('先「✓ 确认」或「✕ 取消」当前预览，再用油漆桶', 2400); return; }
          mfTerrainBucket(hit.lon, hit.lat); return;
        }
        if (ED.drawMode === 'line') {
          if (!_line) {
            _line = { a: { lon: hit.lon, lat: hit.lat }, cur: null };
            mfDrawLabels();
            if (CTXREF) CTXREF.toast('直线起点已定，再点一下落笔成线（Esc 取消）', 2200);
          } else {
            mfLineCommit(hit.lon, hit.lat);
          }
          return;
        }
        if (ED.drawMode === 'lasso') {
          if (ED.lassoPreview) return;                            /* 预览中：交给微调器与预览条 */
          if (e.detail >= 2) { mfLassoClose(); return; }         /* 双击＝闭合进预览 */
          if (!_lasso) mfLassoStart(hit.lon, hit.lat); else mfLassoAdd(hit.lon, hit.lat);
          return;
        }
        /* 涂抹预览中：按住 Alt 拖动＝把多涂的部分从这一批里擦回去 */
        if (_preview && _preview.kind === 'paint' && e.altKey) {
          ED.painting = true; _pvErase = true;
          mfPaintPreviewEraseAt(hit.lon, hit.lat);
          return;
        }
        ED.painting = true;
        mfStrokeBegin(hit.lon, hit.lat);
        return;
      }
    }
    /* 编辑态且未选中工具：左键点势力 → 打开简介 */
    if (e.button === 0 && ED.tool === null) {
      const hit = mfPick(e.clientX, e.clientY);
      if (hit) {
        const pid = S.map.grid.polity[S.map.grid.yOf(hit.lat) * S.map.grid.w + S.map.grid.xOf(hit.lon)];
        if (pid) { const p = mfPolityBySeq(pid); if (p) mfOpenProfile(p.id); }
      }
    }
  });

  mfOn(window, 'pointermove', (e) => {
    /* 圈地预览的随光标虚线端点（标签画布每帧重绘，这里只记账） */
    if (_lasso && S.canvas) {
      const r = S.canvas.getBoundingClientRect();
      _lasso.cur = { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    if (_line && S.canvas) {
      const r2 = S.canvas.getBoundingClientRect();
      _line.cur = { x: e.clientX - r2.left, y: e.clientY - r2.top };
    }
    /* 圈地微调：修改模式下的段拖动 */
    if (_adj && _adj.drag && _lasso) {
      const hitA = mfPick(e.clientX, e.clientY);
      if (hitA) mfAdjustDrag(hitA.lon, hitA.lat);
      return;
    }
    /* 图形圈地预览需要光标的经纬度（不止屏幕像素） */
    if (_lasso && (ED.lassoShape === 'circle' || ED.lassoShape === 'ellipse' || ED.lassoShape === 'square' || ED.lassoShape === 'para')) {
      const hitL = mfPick(e.clientX, e.clientY);
      _lasso.curLL = hitL ? { lon: hitL.lon, lat: hitL.lat } : null;
    }
    /* 拖动实例换位：逐帧只挪那一个 mesh，不整体重建（重建太重，会卡） */
    if (ED.dragInst && S.map) {
      const ins = mfFindInst(ED.dragInst);
      const hit = mfPick(e.clientX, e.clientY);
      if (ins && hit) { ins.lon = hit.lon; ins.lat = hit.lat; mfApplyInstTransform(ins); }
      return;
    }
    if (_pvErase) {
      const hitE = mfPick(e.clientX, e.clientY);
      if (hitE) mfPaintPreviewEraseAt(hitE.lon, hitE.lat);
      return;
    }
    if (_shapeST) {
      const hitS2 = mfPick(e.clientX, e.clientY);
      if (hitS2) mfShapeApply(hitS2);
      return;
    }
    if (!ED.painting) return;
    const hit = mfPick(e.clientX, e.clientY);
    if (hit) mfStrokeTo(hit.lon, hit.lat);
  });
  mfOn(window, 'pointerup', () => {
    if (_adj && _adj.drag) { _adj.drag = null; ED.painting = false; return; }
    /* 一整段拖动结束后才入一次撤销栈 */
    if (ED.dragInst) {
      const ins = mfFindInst(ED.dragInst), from = ED.dragFrom;
      ED.dragInst = null; ED.dragFrom = null;
      if (ins && from && (Math.abs(ins.lon - from.lon) > 1e-6 || Math.abs(ins.lat - from.lat) > 1e-6)) {
        const to = { lon: ins.lon, lat: ins.lat };
        mfPushFnUndo(
          () => { const q = mfFindInst(ins.id); if (q) { q.lon = from.lon; q.lat = from.lat; mfApplyInstTransform(q); mfTownSyncInst(q); } },
          () => { const q = mfFindInst(ins.id); if (q) { q.lon = to.lon; q.lat = to.lat; mfApplyInstTransform(q); mfTownSyncInst(q); } },
          '移动建模实例'
        );
        mfTownSyncInst(ins);          /* 城镇实例被拖走：记录与标签跟着走 */
        mfTouch();
      }
      return;
    }
    if (_shapeST) { ED.painting = false; mfShapeStrokeEnd(); return; }
    if (!ED.painting) return;
    ED.painting = false;
    _pvErase = false;
    mfStrokeEnd();
  });

  /* 建模拖放：拖到球面空地＝新放实例；拖到已有实例上＝替换/并排/取消三选 */
  S.canvas.addEventListener('dragover', (e) => { e.preventDefault(); });
  S.canvas.addEventListener('drop', async (e) => {
    e.preventDefault();
    const mid = e.dataTransfer && e.dataTransfer.getData('text/mf-model');
    if (!mid) return;
    const hit = mfPick(e.clientX, e.clientY);
    if (!hit) { if (CTXREF) CTXREF.toast('请把建模拖到球面上', 2200); return; }
    /* 落点压没压着已有实例？ */
    let tgtId = null;
    try { tgtId = mfPickInst(e.clientX, e.clientY); } catch (err) { }
    const tgt = tgtId ? mfFindInst(tgtId) : null;
    if (!tgt) { mfDeployPreview(mid, { lon: hit.lon, lat: hit.lat }); return; }   /* 落进预览，调好了再确认 */
    const srcNew = mfModelById(mid), srcOld = mfModelById(tgt.modelId);
    const ga = mfCatGroup(srcOld && srcOld.cat), gb = mfCatGroup(srcNew && srcNew.cat);
    const same = ga === gb && ga !== 'user';
    const wrap = mfNode('div');
    wrap.appendChild(mfNode('div', 'mf-note',
      '落点上已有一个' + (srcOld ? '「' + esc(srcOld.name) + '」' : '') + '实例。'
      + (same ? '同属「' + ga + '」类，可直接置换：' : '两者分类不同（' + ga + ' → ' + gb + '），置换请确认：')));
    mfDialog({
      title: '替换建模实例？', width: '380px', body: wrap,
      buttons: [
        {
          label: '⇄ 置换实例建模', pri: true, fn: () => {
            const old = tgt.modelId;
            tgt.modelId = mid;
            mfPushFnUndo(
              () => { tgt.modelId = old; mfRebuildInstances(); mfTouch(); },
              () => { tgt.modelId = mid; mfRebuildInstances(); mfTouch(); },
              '置换实例建模'
            );
            mfRebuildInstances(); mfTouch();
            if (CTXREF) CTXREF.toast('已置换为「' + (srcNew ? srcNew.name : mid) + '」（位置/旋转/缩放保留）', 2400, 'ok');
          }
        },
        { label: '⧉ 并排新放一个', fn: () => mfPlaceInstance(mid, hit.lon, hit.lat) },
        { label: '取消', fn: () => { } }
      ]
    });
  });

  mfOn(window, 'resize', () => { if (ED.visible) { mfSceneResize(); mfZoomReadout(); } });
  mfOn(window, 'keydown', (e) => {
    if (!ED.visible) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.getAttribute && e.target.getAttribute('contenteditable') === 'true')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? mfRedo() : mfUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); mfRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); mfSaveNow(); return; }
    if (e.key === '?') { e.preventDefault(); mfHelpDialog(); return; }
    if (ED.edit && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const dk = '1234567890'.indexOf(e.key);
      if (dk >= 0) {
        const dt = ['land', 'sea', 'other', 'erase', 'polity', 'town', 'water', 'model', 'label', 'space'][dk];
        ED.tool = (ED.tool === dt) ? null : dt;
        mfDockRefresh(); mfBuildPanel(); mfHintForTool();
        return;
      }
    }
    if (e.key === 'Delete' && ED.lassoAdjust && _adj && _lasso) {
      const selD = mfAdjustSelIdx();
      if (selD.length && _lasso.pts.length - selD.length >= 3) {
        selD.slice().sort((x, y) => y - x).forEach((i) => _lasso.pts.splice(i, 1));
        _adj.a = -1; _adj.b = -1;
        mfDrawLabels();
        if (CTXREF) CTXREF.toast('已删除选中的 ' + selD.length + ' 个点', 1800, 'ok');
      } else if (selD.length) {
        if (CTXREF) CTXREF.toast('至少保留 3 个点才能围成区域', 2200);
      }
      return;
    }
    if (e.key === 'Escape') {
      if (ED.lassoAdjust) { ED.lassoAdjust = false; _adj = null; mfBuildPanel(); mfHintForTool(); return; }
      if (_line) { mfLineCancel(); return; }
      if (_lasso) { mfLassoCancel(); return; }
      ED.reshape = false; ED.tool = null; mfSyncControls(); mfBuildPanel(); mfCloseProfile();
    }
  });
}

/* --------------------------------------------------------- 工具包面板 ---- */
let _panelTab = 0;
function mfBuildPanel() {
  if (!UI.panel || !S.map) return;
  const p = UI.panel;
  p.innerHTML = '';
  const tabs = mfNode('div', 'mf-tabs');
  const t0 = mfNode('div', 'mf-tab' + (_panelTab === 0 ? ' on' : ''), '地图编辑');
  const t1 = mfNode('div', 'mf-tab' + (_panelTab === 1 ? ' on' : ''), '地形编辑');
  t0.addEventListener('click', () => { _panelTab = 0; mfBuildPanel(); });
  t1.addEventListener('click', () => { _panelTab = 1; mfBuildPanel(); });
  tabs.appendChild(t0); tabs.appendChild(t1);
  p.appendChild(tabs);
  const body = mfNode('div');
  p.appendChild(body);
  if (_panelTab === 0) mfPanelMap(body); else mfPanelTerrain(body);
  mfDockRefresh();
  mfFloatBarBuild();
  mfSyncControls();     /* 选中笔以后，左键作图、右键旋转 */
}

/* ------------------------------------------------------------ 图标工具条 ---
 * 全部作画工具的竖排直达栏（挂在左侧按钮栏下方）；与面板里的工具按钮同源，
 * 选谁都是改 ED.tool，两边自动同步 */
/* --------------------------------------------------------- 触屏长按 ---- */
/* 触屏长按 = 右键：没有鼠标的手指，也该能唤出菜单。
 * 按住 550ms 且位移小于 12px 才触发——涂抹作画会移动，不会误触。 */
function mfTouchLongPress() {
  if (mfTouchLongPress._done) return;
  mfTouchLongPress._done = true;
  let lpT = 0, lpX = 0, lpY = 0, lpTarget = null;
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch') return;
    lpTarget = e.target; lpX = e.clientX; lpY = e.clientY;
    clearTimeout(lpT);
    lpT = setTimeout(function () {
      const tg = lpTarget;
      lpTarget = null;
      if (!tg) return;
      try {
        tg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: lpX, clientY: lpY, button: 2 }));
      } catch (err) { }
    }, 550);
  }, { passive: true });
  const cancel = function (e) {
    if (e.pointerType && e.pointerType !== 'touch') return;
    if (e.type === 'pointermove' && Math.abs(e.clientX - lpX) < 12 && Math.abs(e.clientY - lpY) < 12) return;
    clearTimeout(lpT); lpTarget = null;
  };
  document.addEventListener('pointermove', cancel, { passive: true });
  document.addEventListener('pointerup', cancel, { passive: true });
  document.addEventListener('pointercancel', cancel, { passive: true });
}

/* --------------------------------------------------------- 新手引导 ---- */
const MF_GUIDES = {
  editor: [
    '欢迎来到地图编辑台。左边这一排是您的笔：陆地、海洋、势力、城镇……按数字键 1 到 0 也能选，手的记性比眼睛好。',
    '画错了不要慌：Ctrl + Z 撤销，Ctrl + Shift + Z 重做。每一笔都记着呢。',
    'Ctrl + S 立即保存。就算忘了按，后台也有自动保存和快照兜底——图丢不了，公约担保。',
    '按 ? 键能唤出全部快捷键。就这些，去玩吧。'
  ],
  model: [
    '欢迎来到建模台。左栏挑一块预制件或导入模型放上台面，右栏是工具：B 涂色，S 雕塑，F 面、E 边、X 顶点。',
    '涂色和雕塑都是按住左键在模型上抹。整笔只记一步撤销，放心大胆地抹。',
    '按 Esc 随时退回查看模式——查看模式下怎么转都不会改动模型，适合截图。',
    'Ctrl + Z 撤销，按 ? 看全部快捷键。台面交给您了。'
  ]
};
const K_GUIDE = 'mapforge:guided:';
let _guideEl = null;
function mfGuide(scene) {
  try {
    if (!ST) return;
    ST.get(K_GUIDE + scene).then(function (v) { if (!v) mfGuideShow(scene); }).catch(function () { });
  } catch (e) { }
}
function mfGuideShow(scene) {
  const steps = MF_GUIDES[scene];
  if (!steps || !steps.length) return;
  if (_guideEl) { try { _guideEl.remove(); } catch (e) { } _guideEl = null; }
  let i = 0;
  const el = mfNode('div');
  el.style.cssText = 'position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:99999;' +
    'background:#fffdf4;border:1px solid #b89b62;border-radius:10px;box-shadow:0 8px 28px rgba(40,25,5,.38);' +
    'padding:12px 16px;max-width:430px;font-size:13px;line-height:1.75;color:#43351c';
  const cnt = mfNode('div');
  cnt.style.cssText = 'font-size:11px;opacity:.6;margin-bottom:3px';
  const txt = mfNode('div');
  const row = mfNode('div');
  row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px';
  const bSkip = mfNode('div', 'mf-btn', '跳过');
  const bNext = mfNode('div', 'mf-btn pri', '下一条');
  bSkip.style.cssText = 'padding:2px 12px;font-size:12px';
  bNext.style.cssText = 'padding:2px 12px;font-size:12px';
  row.appendChild(bSkip); row.appendChild(bNext);
  el.appendChild(cnt); el.appendChild(txt); el.appendChild(row);
  const done = function () {
    try { ST.set(K_GUIDE + scene, 1); } catch (e) { }
    try { el.remove(); } catch (e) { }
    if (_guideEl === el) _guideEl = null;
  };
  const show = function () {
    cnt.textContent = '初次见面 · ' + (i + 1) + ' / ' + steps.length;
    txt.textContent = steps[i];
    bNext.textContent = (i === steps.length - 1) ? '去玩吧' : '下一条';
  };
  bSkip.addEventListener('click', done);
  bNext.addEventListener('click', function () {
    if (i >= steps.length - 1) { done(); return; }
    i++; show();
  });
  document.body.appendChild(el);
  _guideEl = el;
  show();
}

/* --------------------------------------------------------- 帮助面板 ---- */
function mfHelpDialog() {
  const wrap = mfNode('div');
  wrap.style.cssText = 'font-size:13px;line-height:1.9;max-height:62vh;overflow:auto;padding-right:6px';
  const sec = function (t) {
    const h = mfNode('div', '', t);
    h.style.cssText = 'font-weight:700;margin:10px 0 3px;border-bottom:1px dashed rgba(120,90,40,.35);padding-bottom:2px';
    return h;
  };
  const row = function (k, d) {
    const r = mfNode('div');
    r.style.cssText = 'display:flex;gap:10px;align-items:baseline;margin:2px 0';
    const kk = mfNode('span', '', k);
    kk.style.cssText = 'flex:0 0 118px;font-family:monospace;font-size:12px;background:rgba(0,0,0,.07);border:1px solid rgba(0,0,0,.12);border-radius:4px;padding:0 6px;text-align:center';
    const dd = mfNode('span', '', d);
    dd.style.flex = '1';
    r.appendChild(kk); r.appendChild(dd);
    return r;
  };
  wrap.appendChild(sec('地图编辑台（打开工具包后）'));
  wrap.appendChild(row('1 ~ 0', '依次选用：陆地 / 海洋 / 其他 / 橡皮 / 势力 / 城镇 / 水域 / 建模实例 / 标签 / 空间笔'));
  wrap.appendChild(row('Ctrl + Z', '撤销上一步（画错了不要慌）'));
  wrap.appendChild(row('Ctrl + Shift + Z', '重做（撤销错了也不要慌）'));
  wrap.appendChild(row('Ctrl + S', '立即保存这张图'));
  wrap.appendChild(row('Delete', '圈地微调时：删除选中的点'));
  wrap.appendChild(row('Esc', '层层退出：先退微调，再退画线，最后收起工具'));
  wrap.appendChild(sec('建模台'));
  wrap.appendChild(row('V', '查看模式（只管转着看，绝不误改模型）'));
  wrap.appendChild(row('B', '涂色'));
  wrap.appendChild(row('S', '雕塑'));
  wrap.appendChild(row('F / E / X', '面 / 边 / 顶点模式'));
  wrap.appendChild(row('T', '挤出'));
  wrap.appendChild(row('R', '框选'));
  wrap.appendChild(row('A', '全选（按当前的选择类型）'));
  wrap.appendChild(row('Delete', '删除选中的部分'));
  wrap.appendChild(row('Ctrl + Z / Y', '撤销 / 重做'));
  wrap.appendChild(row('Esc', '退回查看模式'));
  wrap.appendChild(sec('到处都能用'));
  wrap.appendChild(row('?', '打开本面板（就是你现在按的这个）'));
  const nt = mfNode('div', 'mf-note', '公约附记：快捷键不是规矩，是捷径。记不住就点按钮，按钮永远在原地等你。');
  nt.style.marginTop = '10px';
  wrap.appendChild(nt);
  mfDialog({ title: '快捷键一览', width: 'min(560px,92vw)', body: wrap, buttons: [{ label: '记下了', pri: true, fn: function () { } }] });
}

function mfDockRefresh() {
  if (!UI.dock) return;
  const d = UI.dock;
  d.innerHTML = '';
  if (!ED.edit) { d.style.display = 'none'; return; }
  d.style.display = 'flex';
  const tools = [
    ['land', 'land', '陆地板笔'], ['sea', 'sea', '海洋板笔'], ['other', 'other', '其他区域笔'],
    ['erase', 'erase', '橡皮擦'], ['polity', 'flag', '势力笔'], ['town', 'town', '城镇笔'],
    ['water', 'water', '水域笔'], ['model', 'inst', '建模实例'], ['label', 'tag', '标签'],
    ['space', 'space', '空间笔']
  ];
  tools.forEach((t) => {
    const b = mfNode('div', 'mf-icon-btn' + (ED.tool === t[0] ? ' on' : ''), mfIcon(t[1]));
    b.title = t[2] + '（左键选用 / 右键调笔刷）';
    b.addEventListener('click', () => { ED.tool = (ED.tool === t[0]) ? null : t[0]; mfBuildPanel(); mfHintForTool(); });
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (t[0] === 'town') { mfTownBrushMenu(e.clientX, e.clientY); return; }
      mfBrushMenu(e.clientX, e.clientY);
    });
    d.appendChild(b);
  });
  /* 作画模式：涂抹 → 圈地 → 直线 循环切换 */
  const dmNames = { paint: '涂抹', lasso: '圈地', line: '直线' };
  const dmIcons = { paint: 'paint', lasso: 'lasso', line: 'line' };
  const dm = mfNode('div', 'mf-icon-btn' + ((ED.drawMode && ED.drawMode !== 'paint') ? ' on' : ''), mfIcon(dmIcons[ED.drawMode || 'paint']));
  dm.title = '作画模式：' + (dmNames[ED.drawMode || 'paint']) + '（点我切换下一种）';
  dm.addEventListener('click', () => {
    const order = ['paint', 'lasso', 'line'];
    const cur = order.indexOf(ED.drawMode || 'paint');
    ED.drawMode = order[(cur + 1) % order.length];
    if (ED.drawMode !== 'lasso') mfLassoCancel(true);
    if (ED.drawMode !== 'line') mfLineCancel(true);
    mfBuildPanel(); mfHintForTool();
  });
  dm.title = '作画模式：' + (dmNames[ED.drawMode || 'paint']) + '（左键＝切换下一种；右键＝圈地图形菜单）';
  dm.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); mfLassoShapeMenu(e.clientX, e.clientY); });
  d.appendChild(dm);
  /* 圈地激活时：图形小按钮排 + 微调开关，全部摆出来，不用记右键 */
  if ((ED.drawMode || 'paint') === 'lasso') {
    mfLassoShapeList().forEach((s) => {
      const sb = mfNode('div', 'mf-icon-btn' + ((ED.lassoShape || 'free') === s[0] ? ' on' : ''), s[0] === 'free' ? mfIcon('poly') : s[1]);
      sb.title = '圈地图形：' + s[2];
      sb.addEventListener('click', () => {
        ED.lassoShape = s[0]; mfLassoCancel(true);
        if (CTXREF) CTXREF.toast('圈地图形：' + s[2], 2000);
        mfBuildPanel(); mfHintForTool();
      });
      d.appendChild(sb);
    });
    const adj = mfNode('div', 'mf-icon-btn' + (ED.lassoAdjust ? ' on' : ''), mfIcon('tune'));
    adj.title = '微调圈地线条：左键＝开关微调；右键＝切换「选段 / 修改」';
    adj.addEventListener('click', () => mfLassoAdjustToggle());
    adj.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); mfLassoAdjModeCycle(); });
    d.appendChild(adj);
  }
  /* 帮助：快捷键一览 */
  const hb = mfNode('div', 'mf-icon-btn', '?');
  hb.title = '快捷键一览（按 ? 也能打开）';
  hb.style.cssText = 'font-weight:700';
  hb.addEventListener('click', () => mfHelpDialog());
  d.appendChild(hb);
}

/* ------------------------------------------------------------ 实例浮动条 ---
 * 选中实例时贴着它浮出：旋转/缩放/换同类建模/删除，不用回面板找滑条 */
/* ------------------------------------------------------------ 作画预览条 ----
 * 圈地/涂抹后的「未定稿」状态条：确认才落色，取消即还原 */
function mfPreviewBarRefresh() {
  if (!UI.root) return;
  if (!UI.pbar) { UI.pbar = mfNode('div', 'mf-pbar'); UI.root.appendChild(UI.pbar); }
  const bar = UI.pbar;
  bar.innerHTML = '';
  if (!_preview) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const mk = (txt, tip, fn, pri) => {
    const b = mfNode('div', 'mf-fbtn', txt);
    b.title = tip || '';
    if (pri) b.style.cssText = 'background:#2f6fb2;color:#ffffff;border-color:#2f6fb2';
    b.addEventListener('click', fn);
    bar.appendChild(b);
  };
  if (_preview.kind === 'lasso') {
    bar.appendChild(mfNode('span', '', '圈地预览：'));
    mk(ED.lassoAdjust ? '✏ 微调中…（右键球面切选段/修改）' : '✏ 微调线条',
      '开关线条微调：选段模式沿线条点两个端点选中一段；修改模式拉动该段，Delete 删除',
      () => { mfLassoAdjustToggle(); mfPreviewBarRefresh(); });
    mk('✓ 确认上色', '按当前线条把圈定范围正式写进地图', () => mfLassoPreviewConfirm(), true);
    mk('✕ 取消', '放弃这次圈地（Esc 同效）', () => mfLassoPreviewCancel());
  } else {
    bar.appendChild(mfNode('span', '', '涂抹预览（浅色未定稿）：'));
    mk('✓ 确认', '这一笔正式生效（整笔算一步撤销）', () => mfPaintPreviewConfirm(), true);
    mk('✕ 取消', '整批撤销这一笔，格子恢复原样', () => mfPaintPreviewCancel());
    const tip = mfNode('span', '', '可继续涂抹增补；按住 Alt 拖动＝擦除多涂的');
    tip.style.cssText = 'opacity:.7;font-size:11.5px';
    bar.appendChild(tip);
  }
}

/* 一笔涂抹并入预览批次：每格只认最早的旧值（擦了重涂也不会丢原始值） */
function mfPaintPreviewMerge(st) {
  if (!_preview) _preview = { kind: 'paint', layers: new Map() };
  let L = _preview.layers.get(st.spec.layer);
  if (!L) { L = { val: st.spec.val, cells: new Map() }; _preview.layers.set(st.spec.layer, L); }
  for (let i = 0; i < st.idx.length; i++) {
    if (!L.cells.has(st.idx[i])) L.cells.set(st.idx[i], st.old[i]);
  }
  mfPreviewCellsSync();
  mfPreviewBarRefresh();
  mfHintForTool();
}
function mfPreviewCellsSync() {
  _pvCells = null;
  if (_preview && _preview.kind === 'paint') {
    _pvCells = new Set();
    _preview.layers.forEach((L) => L.cells.forEach((v, k) => _pvCells.add(k)));
  }
}
function mfPaintPreviewConfirm() {
  if (!_preview || _preview.kind !== 'paint' || !S.map) return;
  _preview.layers.forEach((L, layer) => {
    if (!L.cells.size) return;
    const idx = [], old = [];
    L.cells.forEach((v, k) => { idx.push(k); old.push(v); });
    mfPushCellUndo(layer, Int32Array.from(idx),
      layer === 'polity' ? Uint16Array.from(old) : Uint8Array.from(old), L.val);
  });
  const wasTerrain = _preview.layers.has('terrain');
  _preview = null; mfPreviewCellsSync(); mfPreviewBarRefresh();
  S.dirtyColor = true; mfTouch();
  if (wasTerrain) mfMaybeShowTerrainBuild();
  if (CTXREF) CTXREF.toast('这一笔已落色定稿', 1800, 'ok');
  mfHintForTool();
}
function mfPaintPreviewCancel() {
  if (S.map && _preview && _preview.kind === 'paint') {
    const g = S.map.grid;
    _preview.layers.forEach((L, layer) => {
      const arr = g[layer];
      if (arr) L.cells.forEach((v, k) => { arr[k] = v; });
    });
  }
  _preview = null; mfPreviewCellsSync(); mfPreviewBarRefresh();
  if (S.map) { S.dirtyColor = true; S.dirtyContour = true; mfTouch(); mfRenderPolityList(); }
  if (CTXREF) CTXREF.toast('已取消这一笔，格子恢复原样', 1800);
  mfHintForTool();
}
/* 预览中的擦除：把多涂的格子从批次里剔掉并当场恢复原值 */
function mfPaintPreviewEraseAt(lon, lat) {
  if (!_preview || _preview.kind !== 'paint' || !S.map) return;
  const g = S.map.grid;
  const rad = mfPixelToRad(ED.brushPx, lon, lat);
  let n = 0;
  mfStampGrid(g, lon, lat, rad, (i) => {
    _preview.layers.forEach((L, layer) => {
      if (L.cells.has(i)) { g[layer][i] = L.cells.get(i); L.cells.delete(i); n++; }
    });
  });
  if (n) {
    S.dirtyColor = true; mfPreviewCellsSync(); mfTouch();
    let left = 0;
    _preview.layers.forEach((L) => { left += L.cells.size; });
    if (!left) { _preview = null; mfPreviewCellsSync(); mfPreviewBarRefresh(); mfHintForTool(); }
  }
}

function mfFloatBarBuild() {
  if (!UI.root) return;
  if (!UI.fbar) {
    UI.fbar = mfNode('div', 'mf-fbar');
    UI.root.appendChild(UI.fbar);
  }
  const bar = UI.fbar;
  bar.innerHTML = '';
  const ins = (ED.tool === 'model' && ED.selInst) ? mfFindInst(ED.selInst) : null;
  if (!ins) { bar.style.display = 'none'; return; }
  const mk = (txt, title, fn) => {
    const b = mfNode('div', 'mf-fbtn', txt);
    b.title = title;
    b.addEventListener('click', fn);
    bar.appendChild(b);
  };
  mk('↺', '左旋 15°', () => { ins.rot = ((ins.rot || 0) - 15 + 360) % 360; mfApplyInstTransform(ins); mfTouch(); });
  mk('↻', '右旋 15°', () => { ins.rot = ((ins.rot || 0) + 15) % 360; mfApplyInstTransform(ins); mfTouch(); });
  mk('＋', '放大', () => { ins.scale = clamp((ins.scale == null ? 1 : ins.scale) * 1.15, 0.1, 8); mfApplyInstTransform(ins); mfTouch(); });
  mk('－', '缩小', () => { ins.scale = clamp((ins.scale == null ? 1 : ins.scale) / 1.15, 0.1, 8); mfApplyInstTransform(ins); mfTouch(); });
  mk('↻', '更换建模（列出同类全部建模）', (e) => {
    const cur = mfModelById(ins.modelId);
    const grp = mfCatGroup(cur && cur.cat);
    const items = [];
    (S.map.models || []).filter((m) => mfCatGroup(m.cat) === grp).forEach((m) => {
      items.push({
        icon: '·', label: m.name, fn: () => {
          const old = ins.modelId;
          ins.modelId = m.id;
          mfPushFnUndo(() => { ins.modelId = old; mfRebuildInstances(); }, () => { ins.modelId = m.id; mfRebuildInstances(); }, '更换实例建模');
          mfRebuildInstances(); mfTouch();
        }
      });
    });
    MF_BUILTINS.filter((d2) => mfCatGroup(d2.cat) === grp).forEach((d2) => {
      items.push({
        icon: '★', label: d2.name + '〔内置〕', fn: () => {
          const old = ins.modelId;
          const nid = 'builtin:' + d2.id;
          ins.modelId = nid;
          mfPushFnUndo(() => { ins.modelId = old; mfRebuildInstances(); }, () => { ins.modelId = nid; mfRebuildInstances(); }, '更换实例建模');
          mfRebuildInstances(); mfTouch();
        }
      });
    });
    if (!items.length) items.push({ icon: '·', label: '（同类目录为空）', fn: () => { } });
    mfMenu(e.clientX, e.clientY, items);
  });
  mk('✕', '删除这个实例', () => mfDeleteInstance(ins.id));
  bar.style.display = 'flex';
}
/* 每帧跟随：把浮动条贴到实例的屏幕投影上（背面隐藏，转回正面自动复现） */
function mfFloatBarTick(w, h) {
  const bar = UI.fbar;
  if (!bar || !bar.children.length) return;
  const ins = (ED.tool === 'model' && ED.selInst) ? mfFindInst(ED.selInst) : null;
  if (!ins || !S.camera) { bar.style.display = 'none'; return; }
  const la = ins.lat * D2R, lo = ins.lon * D2R, cl = Math.cos(la);
  const v = new THREE.Vector3(cl * Math.cos(lo), Math.sin(la), -cl * Math.sin(lo));
  const toCam = new THREE.Vector3().subVectors(S.camera.position, v);
  if (toCam.dot(v) <= 0.02) { bar.style.display = 'none'; return; }
  v.multiplyScalar(1.03).project(S.camera);
  if (v.z > 1) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.style.left = ((v.x * 0.5 + 0.5) * w + 16) + 'px';
  bar.style.top = ((-v.y * 0.5 + 0.5) * h - 22) + 'px';
}

function mfToolBtn(label, sw, tool, title) {
  const b = mfNode('div', 'mf-tool' + (ED.tool === tool ? ' on' : ''));
  if (sw) { const s = mfNode('span', 'sw'); s.style.background = sw; b.appendChild(s); }
  b.appendChild(mfNode('span', '', esc(label)));
  if (title) b.title = title;
  b.addEventListener('click', () => {
    ED.tool = (ED.tool === tool) ? null : tool;
    mfBuildPanel();
    mfHintForTool();
  });
  b.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (tool === 'town') { mfTownBrushMenu(e.clientX, e.clientY); return; }
    mfBrushMenu(e.clientX, e.clientY);
  });
  return b;
}

/* 城镇笔右键：笔刷粗细 + 撒城间距 */
function mfTownBrushMenu(x, y) {
  mfMenu(x, y, [
    { icon: '◎', label: '笔刷粗细…', fn: () => mfBrushDialog() },
    { sep: true },
    { icon: '镇', label: '间距 密 (0.4°)', fn: () => { ED.townGap = 0.4; if (CTXREF) CTXREF.toast('城镇间距：密（0.4°）', 1800, 'ok'); } },
    { icon: '镇', label: '间距 中 (0.8°)', fn: () => { ED.townGap = 0.8; if (CTXREF) CTXREF.toast('城镇间距：中（0.8°）', 1800, 'ok'); } },
    { icon: '镇', label: '间距 疏 (1.5°)', fn: () => { ED.townGap = 1.5; if (CTXREF) CTXREF.toast('城镇间距：疏（1.5°）', 1800, 'ok'); } },
    { icon: '镇', label: '间距 极疏 (3°)', fn: () => { ED.townGap = 3; if (CTXREF) CTXREF.toast('城镇间距：极疏（3°）', 1800, 'ok'); } }
  ]);
}

function mfHintForTool() {
  if (ED.reshape) { mfHintText('重塑星球中：左键按住抹动＝塑形（▲ 拉起 / ▽ 压低 / ∿ 抹平），半径用面板的「笔刷」滑条，Esc 退出'); return; }
  const t = ED.tool;
  if (!t) { mfHintText('左键拖动＝旋转　滚轮＝缩放　点左侧「具」里的工具开始创作'); return; }
  if (ED.lassoPreview) { mfHintText('圈地预览中：下方预览条上 ✏ 微调线条 ｜ ✓ 确认上色 ｜ ✕ 取消（Esc 同效）'); return; }
  if (_preview && _preview.kind === 'paint') { mfHintText('涂抹预览中：继续涂抹＝增补，Alt＋拖动＝擦除多涂的，✓ 确认 ｜ ✕ 取消'); return; }
  if (ED.drawMode === 'lasso' && t !== 'label' && t !== 'model') {
    mfHintText('⬠ 圈地：左键连点成多边形 → 双击或回点起点闭合填充；Esc 取消');
    return;
  }
  if (ED.drawMode === 'line' && t !== 'label' && t !== 'model') {
    mfHintText('╱ 直线：左键点起点 → 移动看预览 → 再点终点，沿球面拉一条笔直笔道；Esc 取消');
    return;
  }
  if (ED.lassoAdjust && _lasso) {
    mfHintText('✏ 微调圈地：' + ((ED.adjMode || 'sel') === 'sel'
      ? '选段模式——沿线条先后点两个端点，选中其间一段（白点标出）'
      : '修改模式——左键拉动所选段；Delete 删除所选段') + '；右键球面切换模式，Esc 退出微调');
    return;
  }
  if (t === 'tfill') {
    mfHintText('◎ 地形填充：左键点一块封闭区域的内部，整块填成当前地形画笔（边界＝另一种地形或海陆交界）；Esc 退出');
    return;
  }
  const map = {
    land: '陆地板笔：左键在球面上涂抹圈定陆地（右键工具可调粗细）',
    sea: '海洋板笔：左键涂抹圈定海洋',
    other: '其他区域笔：左键涂抹圈定其他区域',
    erase: '橡皮擦：左键擦除（可在下方选择擦哪一层）',
    polity: '势力笔：左键涂抹圈定势力疆域；画完在下方目录里编辑资料',
    town: '城镇笔：左键涂抹圈聚落带，松手自动撒城镇；单击＝精放一座；右键工具调间距',
    water: '水域笔：湖泊＝涂面后点「一键生成」；河流＝画线松手自动成带（模式在面板里切）',
    model: '建模实例：左键点实例选中，按住拖动＝换位；选中后可用下方的旋转/缩放/抬升',
    label: '标签：右键球面任意处为其命名；右键已有标签可改名/移动/删除',
    space: '空间笔：左键点球面，以该点为圆心圈定一块空间（里世界）；右键蓝色标记管理已有空间'
  };
  mfHintText(map[t] || ('地形画笔：左键涂抹「' + (S.map.terrains[ED.terrainIdx] || {}).name + '」'));
}

function mfBrushMenu(x, y) {
  mfMenu(x, y, [
    {
      icon: '◎', label: '笔刷粗细…', fn: () => {
        mfBrushDialog();
      }
    },
    { sep: true },
    { icon: '·', label: '细 (6px)', fn: () => { ED.brushPx = 6; mfBuildPanel(); } },
    { icon: '●', label: '中 (14px)', fn: () => { ED.brushPx = 14; mfBuildPanel(); } },
    { icon: '⬤', label: '粗 (30px)', fn: () => { ED.brushPx = 30; mfBuildPanel(); } },
    { icon: '⬛', label: '极粗 (60px)', fn: () => { ED.brushPx = 60; mfBuildPanel(); } },
    { icon: '▲', label: '巨幅 (120px)', fn: () => { ED.brushPx = 120; mfBuildPanel(); } },
    { sep: true },
    { icon: '○', label: '圆形笔头', fn: () => { ED.brushShape = 'round'; mfBuildPanel(); } },
    { icon: '■', label: '方形笔头（方印）', fn: () => { ED.brushShape = 'square'; mfBuildPanel(); } }
  ]);
}
function mfBrushDialog() {
  const wrap = mfNode('div');
  const row = mfNode('div', 'mf-row');
  const r = mfNode('input', 'mf-inp');
  r.type = 'range'; r.min = '1'; r.max = '160'; r.step = '1'; r.value = String(ED.brushPx);
  const v = mfNode('span', '', ED.brushPx + 'px');
  row.appendChild(r); row.appendChild(v);
  wrap.appendChild(mfNode('div', 'mf-note', '笔刷半径按屏幕像素计：缩小时一笔覆盖大范围，放大后自动变精细。'));
  wrap.appendChild(row);
  r.addEventListener('input', () => { ED.brushPx = +r.value; v.textContent = ED.brushPx + 'px'; });
  /* KiMi3：笔头形状（圆形 / 方形） */
  const srow = mfNode('div', 'mf-row');
  const bRound = mfNode('div', 'mf-btn' + (ED.brushShape !== 'square' ? ' pri' : ''), '○ 圆形笔头');
  const bSquare = mfNode('div', 'mf-btn' + (ED.brushShape === 'square' ? ' pri' : ''), '■ 方形笔头');
  bRound.style.flex = '1'; bSquare.style.flex = '1';
  bRound.addEventListener('click', () => { ED.brushShape = 'round'; bRound.classList.add('pri'); bSquare.classList.remove('pri'); });
  bSquare.addEventListener('click', () => { ED.brushShape = 'square'; bSquare.classList.add('pri'); bRound.classList.remove('pri'); });
  srow.appendChild(bRound); srow.appendChild(bSquare);
  wrap.appendChild(srow);
  mfDialog({ title: '笔刷粗细与形状', width: '320px', body: wrap, buttons: [{ label: '完成', pri: true, fn: function () { mfBuildPanel(); } }] });
}

/* --------------------------------------------------- 面板①：地图编辑 ---- */
function mfPanelMap(body) {
  /* 笔的选择统一在左侧竖排工具条（陆/海/他/擦/镇/水/势/模/签），面板只保留工具条上没有的功能 */
  let sec = mfNode('div', 'mf-sec');
  sec.appendChild(mfNode('div', 'mf-sec-t', '地图编辑'));

  /* 水域子模式：湖泊（涂面）/ 河流（画线）；选中水域笔时可见 */
  if (ED.tool === 'water') {
    const wr = mfNode('div', 'mf-row');
    wr.appendChild(mfNode('label', '', '模式'));
    [['lake', '湖泊·涂面'], ['river', '河流·画线']].forEach((o) => {
      const b = mfNode('div', 'mf-btn' + ((ED.waterKind || 'lake') === o[0] ? ' pri' : ''), o[1]);
      b.style.flex = '1';
      b.addEventListener('click', () => { ED.waterKind = o[0]; mfBuildPanel(); mfHintForTool(); });
      wr.appendChild(b);
    });
    sec.appendChild(wr);
    if ((ED.waterKind || 'lake') === 'lake') {
      let hasWater = false;
      const wa = S.map.grid.water;
      for (let i = 0; i < wa.length; i++) if (wa[i]) { hasWater = true; break; }
      if (hasWater) {
        const wb = mfNode('div', 'mf-btn pri', '≈ 一键生成湖泊水面建模');
        wb.title = '把涂过的水域范围生成一片贴合球面的水面建模（进建模目录 › 水域，可再编辑/导出）';
        wb.addEventListener('click', () => mfLakeBuild());
        sec.appendChild(wb);
      } else {
        sec.appendChild(mfNode('div', 'mf-note', '先用湖泊模式在地图上涂一片水域，这里会出现「一键生成湖泊水面建模」。'));
      }
    } else {
      sec.appendChild(mfNode('div', 'mf-note', '河流模式：像画线一样画出河道，松手立即生成水面条带（宽度＝笔刷）。'));
    }
  }

  /* 橡皮擦作用层 */
  const er = mfNode('div', 'mf-row');
  er.appendChild(mfNode('label', '', '橡皮擦：'));
  const es = mfNode('select', 'mf-sel');
  [['region', '区域'], ['polity', '势力'], ['terrain', '地形'], ['all', '全部']].forEach((o) => {
    const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1];
    if ((ED.eraseLayer || 'region') === o[0]) op.selected = true;
    es.appendChild(op);
  });
  es.addEventListener('change', () => { ED.eraseLayer = es.value; });
  er.appendChild(es);
  sec.appendChild(er);

  /* 作画模式已统一收进左侧工具条（涂/圈/直），此处不再重复放按钮 */
  sec.appendChild(mfNode('div', 'mf-note', '作画模式在左侧工具条切换：涂＝涂抹 / 圈＝圈地 / 直＝直线。圈地状态下，工具条会多出图形小按钮（折线/曲线/圆/椭圆/矩形/平行四边形）和「✏」微调开关。'));

  /* 填充 */
  const fr = mfNode('div', 'mf-row');
  const fb = mfNode('div', 'mf-btn pri', '⛾ 填充');
  fb.title = '把所有未被三支笔圈定的区域填充为选定类型（动手前自动留一份历史快照）';
  fb.addEventListener('click', () => mfConfirmOpt({
    setKey: 'askFill',
    title: '一键填充',
    msg: '把图上所有还没圈定的空白区域一次性填满？动手前会自动留一份历史快照，反悔了可以从左侧「史」滚回来。',
    okLabel: '填充',
    askLabel: '每次填充前都问我',
    onYes: () => mfFillUnclaimed()
  }));
  const fs = mfNode('select', 'mf-sel');
  [1, 2, 3].forEach((k) => {
    const op = document.createElement('option'); op.value = String(k); op.textContent = CFG.REGION[k].n;
    if (ED.fillKind === k) op.selected = true;
    fs.appendChild(op);
  });
  fs.addEventListener('change', () => { ED.fillKind = +fs.value; });
  fr.appendChild(fb); fr.appendChild(fs);
  sec.appendChild(fr);

  /* 一键地图建模：和「地形编辑」页的一键地形建模是同一个功能，放这里省得翻页 */
  if (mfTerrainPainted()) {
    const mb = mfNode('div', 'mf-btn pri', '▲ 一键地图建模');
    mb.style.width = '100%';
    mb.title = '按地形画笔的高度值自动把地形挤出成山（同「地形编辑」页的建模按钮）';
    mb.addEventListener('click', () => mfTerrainBuildDialog());
    sec.appendChild(mb);
  }

  /* 笔刷粗细 */
  const br = mfNode('div', 'mf-row');
  br.appendChild(mfNode('label', '', '笔刷'));
  const brs = mfNode('input', 'mf-inp');
  brs.type = 'range'; brs.min = '1'; brs.max = '160'; brs.value = String(ED.brushPx);
  brs.addEventListener('input', () => { ED.brushPx = +brs.value; brv.textContent = ED.brushPx + 'px'; });
  const brv = mfNode('span', '', ED.brushPx + 'px');
  brv.style.flex = 'none';
  br.appendChild(brs); br.appendChild(brv);
  sec.appendChild(br);
  body.appendChild(sec);

  /* 势力笔 */
  sec = mfNode('div', 'mf-sec');
  sec.appendChild(mfNode('div', 'mf-sec-t', '势力笔'));
  const t2 = mfNode('div', 'mf-tools');
  t2.appendChild(mfToolBtn('势力笔', ED.selPolity ? (mfPolityById(ED.selPolity) || {}).color : '#c9813f', 'polity'));
  const nb = mfNode('div', 'mf-btn', '＋ 新势力');
  nb.title = '结束当前势力的绘制，开始圈定下一个新势力';
  nb.addEventListener('click', () => { ED.selPolity = null; mfBuildPanel(); if (CTXREF) CTXREF.toast('下一个笔画将创建新势力', 2000); });
  t2.appendChild(nb);
  sec.appendChild(t2);
  sec.appendChild(mfNode('div', 'mf-note',
    '选中势力笔后：左键涂抹即圈定疆域。当前正在画：<b>' +
    esc(ED.selPolity ? ((mfPolityById(ED.selPolity) || {}).name || '—') : '（新势力）') + '</b>'));
  sec.appendChild(mfNode('div', 'mf-sec-t', '已创建的势力目录（右键栏目＝更多操作）'));
  const plist = mfNode('div', 'mf-plist');
  sec.appendChild(plist);
  body.appendChild(sec);
  mfRenderPolityList(plist);

  /* 建模实例：选中后可旋转 / 缩放 / 抬升 / 删除 / 拖回建模界面改副本 */
  sec = mfNode('div', 'mf-sec');
  sec.appendChild(mfNode('div', 'mf-sec-t', '▣ 建模实例'));
  const mt = mfNode('div', 'mf-tools');
  const nb2 = mfNode('div', 'mf-btn', '▣ 建模系统');
  nb2.title = '打开自由建模场景（可从目录里拖建模到球面）';
  nb2.addEventListener('click', () => mfOpenModeling());
  mt.appendChild(nb2);
  sec.appendChild(mt);

  const ins = mfInstList();
  if (!ins.length) {
    sec.appendChild(mfNode('div', 'mf-note',
      '还没有放置任何建模。去「▣ 建模系统」里做一个，保存后把目录里的建模拖到球面上即可放置实例。'));
  } else {
    const pick = mfNode('div', 'mf-row');
    const ps = mfNode('select', 'mf-sel');
    ins.forEach((x, i) => {
      const mm = mfInstModelOf(x);
      const op = document.createElement('option');
      op.value = x.id;
      op.textContent = (mm ? mm.name : '（建模已删除）') + ' #' + (i + 1);
      if (ED.selInst === x.id) op.selected = true;
      ps.appendChild(op);
    });
    ps.addEventListener('change', () => { ED.selInst = ps.value; mfRebuildInstances(); mfBuildPanel(); });
    pick.appendChild(ps);
    sec.appendChild(pick);

    const cur = mfFindInst(ED.selInst);
    if (!cur) {
      sec.appendChild(mfNode('div', 'mf-note', '从上面的下拉里选一个实例，或在球面上左键点它。'));
    } else {
      const cm = mfInstModelOf(cur);
      sec.appendChild(mfNode('div', 'mf-note', '正在编辑：<b>' + esc(cm ? cm.name : '（建模已删除）') + '</b>'));
      const slRow = (t, key, min, max, step, unit) => {
        const r = mfNode('div', 'mf-row');
        r.appendChild(mfNode('label', '', t));
        const s = mfNode('input', 'mf-inp');
        s.type = 'range'; s.min = String(min); s.max = String(max); s.step = String(step);
        s.value = String(cur[key] == null ? 0 : cur[key]);
        const v = mfNode('span', '', (cur[key] == null ? 0 : cur[key]) + (unit || ''));
        v.style.flex = 'none';
        /* 拖动滑条时实时预览，松手才写一次撤销 */
        s.addEventListener('input', () => {
          const val = +s.value;
          cur[key] = val; v.textContent = val + (unit || '');
          mfApplyInstTransform(cur);
        });
        s.addEventListener('change', () => { mfTouch(); });
        r.appendChild(s); r.appendChild(v);
        sec.appendChild(r);
        return s;
      };
      slRow('旋转', 'rot', 0, 360, 1, '°');
      slRow('缩放', 'scale', 0.1, 8, 0.05, '×');
      slRow('抬升', 'elev', -0.03, 0.2, 0.002, '');

      const act = mfNode('div', 'mf-row');
      const bEd = mfNode('div', 'mf-btn', '✎ 编辑副本');
      bEd.title = '把这个实例用到的建模复制一份到建模界面修改；回存时可选「保存（覆盖目录原件）」或「另存」';
      bEd.addEventListener('click', () => mfOpenModeling(cur.modelId));
      const bDel = mfNode('div', 'mf-btn', '✕ 删除');
      bDel.addEventListener('click', () => mfDeleteInstance(cur.id));
      const bCp = mfNode('div', 'mf-btn', '⧉ 原位复制');
      bCp.addEventListener('click', () => { mfPlaceInstance(cur.modelId, cur.lon, cur.lat); });
      act.appendChild(bEd); act.appendChild(bCp); act.appendChild(bDel);
      sec.appendChild(act);
      sec.appendChild(mfNode('div', 'mf-note', '提示：在球面上按住实例拖动即可换个位置。'));
    }
  }
  body.appendChild(sec);

  /* 已创建城镇目录：定位 / 重命名（与标签同步）/ 换建模 / 删除（三件套同灭） */
  sec = mfNode('div', 'mf-sec');
  sec.appendChild(mfNode('div', 'mf-sec-t', '已创建城镇（' + ((S.map.towns || []).length) + '）'));
  const tlist = mfNode('div');
  tlist.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:190px;overflow:auto';
  (S.map.towns || []).forEach((t) => {
    const row = mfNode('div', 'mf-row');
    row.style.cssText = 'gap:4px';
    const nm = mfNode('div', 'mf-btn', '镇 ' + esc(t.name));
    nm.style.cssText = 'flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    nm.title = '点击定位到这座城镇';
    nm.addEventListener('click', () => mfGoto(t.lon, t.lat));
    const bRen = mfNode('div', 'mf-btn', '✎');
    bRen.title = '重命名（与地图标签双向同步）';
    bRen.addEventListener('click', () => mfPrompt('城镇名称', t.name, (v) => { if (v) { mfTownRename(t, v); mfBuildPanel(); } }, { title: '重命名城镇' }));
    const bMod = mfNode('div', 'mf-btn', '↻');
    bMod.title = '更换建模（三套内置城镇建模）';
    bMod.addEventListener('click', (e) => mfMenu(e.clientX, e.clientY, [
      { icon: '村', label: '村落·茅屋群', fn: () => mfTownSetModel(t, 'builtin:town1') },
      { icon: '镇', label: '城镇·坡顶街', fn: () => mfTownSetModel(t, 'builtin:town2') },
      { icon: '城', label: '城市·塔楼群', fn: () => mfTownSetModel(t, 'builtin:town3') }
    ]));
    const bDel = mfNode('div', 'mf-btn', '✕');
    bDel.title = '删除这座城镇（记录＋建模实例＋标签一起删）';
    bDel.addEventListener('click', () => mfConfirm('删除城镇「' + t.name + '」？地图上的建模实例与标签会一起删除。', () => {
      const tp = mfTownTriple(t);
      mfTownDrop(tp);
      mfPushFnUndo(
        () => { mfTownBack(tp); mfRebuildInstances(); if (UI.panel) mfBuildPanel(); },
        () => { mfTownDrop(tp); mfRebuildInstances(); if (UI.panel) mfBuildPanel(); },
        '删除城镇'
      );
      mfRebuildInstances(); mfTouch(); mfBuildPanel();
    }, { dgr: true, okLabel: '删除' }));
    row.appendChild(nm); row.appendChild(bRen); row.appendChild(bMod); row.appendChild(bDel);
    tlist.appendChild(row);
  });
  if (!(S.map.towns || []).length) {
    tlist.appendChild(mfNode('div', 'mf-note', '还没有城镇：选左侧「镇」笔在陆地上涂一块聚落带，松手自动生成。'));
  }
  sec.appendChild(tlist);
  body.appendChild(sec);

  /* 星球编辑：增删星球 / 大小密度 / 空间 / 捏形状的总入口。
     塑形笔刷由星球编辑界面开启；开启期间这里仍显示塑形参数，方便边捏边调 */
  sec = mfNode('div', 'mf-sec');
  sec.appendChild(mfNode('div', 'mf-sec-t', '星球编辑'));
  const rsB = mfNode('div', 'mf-btn' + (ED.reshape ? ' pri' : ''), '◐ 星球编辑' + (ED.reshape ? '（塑形中）' : ''));
  rsB.style.width = '100%';
  rsB.title = '打开星球编辑：管理星球（时代）、调整大小与密度、圈定空间、捏星球形状';
  rsB.addEventListener('click', () => mfPlanetEditor());
  sec.appendChild(rsB);
  if (ED.reshape) {
    const rsOff = mfNode('div', 'mf-btn', '结束塑形');
    rsOff.style.width = '100%';
    rsOff.title = '收起塑形笔刷，恢复普通编辑';
    rsOff.addEventListener('click', () => { ED.reshape = false; mfSyncControls(); mfBuildPanel(); mfHintForTool(); });
    sec.appendChild(rsOff);
  }
  if (ED.reshape) {
    const rt = mfNode('div', 'mf-tools');
    [['raise', '▲ 拉起', '把地表向外鼓起：山丘、高原、尖峰'],
     ['push', '▽ 压低', '把地表向内压：盆地、海沟、峡谷'],
     ['smooth', '∿ 抹平', '抹掉棱角，让起伏圆滑过渡']].forEach((t) => {
      const b = mfNode('div', 'mf-tool' + ((ED.reshapeTool || 'raise') === t[0] ? ' on' : ''), t[1]);
      b.title = t[2];
      b.addEventListener('click', () => { ED.reshapeTool = t[0]; mfBuildPanel(); });
      rt.appendChild(b);
    });
    sec.appendChild(rt);
    const rsRow = mfNode('div', 'mf-row');
    const rsL = mfNode('label', '', '力度 ？');
    rsL.title = '每一笔抹动抬起 / 压下的幅度：0.01 ≈ 64km（一个球半径＝6371km）';
    rsL.style.cursor = 'help';
    rsRow.appendChild(rsL);
    const rsS = mfNode('input', 'mf-inp');
    rsS.type = 'range'; rsS.min = '0.002'; rsS.max = '0.06'; rsS.step = '0.002';
    rsS.value = String(ED.reshapeStr == null ? 0.012 : ED.reshapeStr);
    rsS.addEventListener('input', () => { ED.reshapeStr = +rsS.value; });
    rsRow.appendChild(rsS);
    sec.appendChild(rsRow);
    sec.appendChild(mfNode('div', 'mf-note', '半径用上面「笔刷」滑条。塑形写在球面顶点上（比栅格细得多），随地图保存；Ctrl+Z 撤销每一笔。'));
    const sclRow = mfNode('div', 'mf-row');
    const sclL = mfNode('label', '', '整体缩放 ？');
    sclL.title = '把已有的全部塑形起伏乘一个倍数：>1 更夸张，<1 更平缓，1 不变。点「应用」生效';
    sclL.style.cursor = 'help';
    sclRow.appendChild(sclL);
    const sclS = mfNode('input', 'mf-inp');
    sclS.type = 'range'; sclS.min = '0.2'; sclS.max = '3'; sclS.step = '0.05'; sclS.value = '1';
    const sclB = mfNode('div', 'mf-btn', '应用');
    sclB.addEventListener('click', () => {
      const f = +sclS.value;
      if (Math.abs(f - 1) > 1e-6) mfShapeScaleAll(f);
      sclS.value = '1';
    });
    sclRow.appendChild(sclS); sclRow.appendChild(sclB);
    sec.appendChild(sclRow);
    const rstB = mfNode('div', 'mf-btn dgr', '重置成标准球形');
    rstB.style.width = '100%';
    rstB.title = '清空全部塑形起伏，恢复成正球体（可用 Ctrl+Z 撤销）';
    rstB.addEventListener('click', () => mfConfirmOpt({
      setKey: 'askShapeReset',
      title: '重置星球形状',
      msg: '把这颗星球捏过的所有起伏都抹平、恢复成标准球形？（万一后悔了，Ctrl+Z 还能把它捏回来）',
      okLabel: '恢复成球形',
      askLabel: '每次重置前都问我',
      onYes: () => mfShapeReset()
    }));
    sec.appendChild(rstB);
  }
  body.appendChild(sec);

  /* 撤销 */
  sec = mfNode('div', 'mf-sec');
  const ur = mfNode('div', 'mf-row');
  const ub = mfNode('div', 'mf-btn', '↩ 撤销');
  ub.addEventListener('click', () => mfUndo());
  const rb = mfNode('div', 'mf-btn', '↪ 重做');
  rb.addEventListener('click', () => mfRedo());
  ur.appendChild(ub); ur.appendChild(rb);
  sec.appendChild(ur);
  sec.appendChild(mfNode('div', 'mf-note', '快捷键：Ctrl+Z 撤销 · Ctrl+Y 重做 · Ctrl+S 保存 · Esc 退出当前工具'));
  body.appendChild(sec);
}

/* ===================== 60_polity.js ===================== */
/* ==========================================================================
 * 势力系统：势力笔创建 · 势力目录 · 简介栏目编辑（文字条目 / 链接关键词）
 * ========================================================================== */

function mfPolityById(id) {
  if (!S.map) return null;
  return S.map.polities.find((p) => p.id === id) || null;
}
function mfPolityBySeq(seq) {
  if (!S.map) return null;
  return S.map.polities.find((p) => p.seq === seq) || null;
}
function mfNextSeq() {
  let mx = 0;
  S.map.polities.forEach((p) => { if (p.seq > mx) mx = p.seq; });
  return mx + 1;
}
function mfCreatePolity(name) {
  const m = S.map;
  let n = m.polities.length + 1, nm = name || ('未命名势力' + (n > 1 ? String(n) : ''));
  while (m.polities.some((p) => p.name === nm)) { n++; nm = (name || '未命名势力') + n; }
  const p = {
    id: uid('p'), name: nm, seq: mfNextSeq(),
    color: CFG.POLITY_COLORS[(n - 1) % CFG.POLITY_COLORS.length],
    fields: mfDefaultFields(), trash: [], eraFrom: '', eraTo: ''
  };
  m.polities.push(p);
  mfPushFnUndo(
    function () { const i = m.polities.indexOf(p); if (i >= 0) m.polities.splice(i, 1); mfRenderPolityList(); },
    function () { m.polities.push(p); mfRenderPolityList(); },
    '创建势力'
  );
  mfTouch();
  return p;
}

/* --------------------------------------------------------- 势力目录 ------ */
function mfRenderPolityList(box) {
  box = box || (UI.panel ? UI.panel.querySelector('.mf-plist') : null);
  if (!box || !S.map) return;
  box.innerHTML = '';
  if (!S.map.polities.length) {
    box.appendChild(mfNode('div', 'mf-note', '还没有势力。选「势力笔」在球面上圈一块地，就会自动生成。'));
    return;
  }
  S.map.polities.forEach((p) => {
    const it = mfNode('div', 'mf-pitem' + (ED.selPolity === p.id ? ' sel' : ''));
    const sw = mfNode('span', 'sw'); sw.style.background = p.color;
    it.appendChild(sw);
    it.appendChild(mfNode('span', 'nm', esc(p.name)));
    const cnt = mfNode('span', '', String((p.fields || []).length));
    cnt.style.cssText = 'font-size:10px;color:var(--ink-faint,#8a7a5e)';
    it.appendChild(cnt);
    it.addEventListener('click', () => {
      ED.selPolity = p.id;
      if (ED.tool !== 'polity') ED.tool = 'polity';
      mfBuildPanel(); mfOpenProfile(p.id);
    });
    it.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      mfPolityMenu(e.clientX, e.clientY, p);
    });
    box.appendChild(it);
  });
}

function mfPolityMenu(x, y, p) {
  mfMenu(x, y, [
    { icon: '✎', label: '重命名', fn: () => mfRenamePolity(p) },
    { icon: '◐', label: '更换颜色', fn: () => mfPickColor(p.color, (c) => { p.color = c; S.dirtyColor = true; mfTouch(); mfRenderPolityList(); }) },
    { icon: '文', label: '编辑资料', fn: () => mfEditPolityDialog(p) },
    { icon: '图', label: '在地图上定位', fn: () => mfLocatePolity(p) },
    { sep: true },
    { icon: '⧉', label: '复制一个新势力（同样资料）', fn: () => mfClonePolity(p) },
    { icon: '✕', label: '删除势力', dgr: true, fn: () => mfDeletePolity(p) }
  ]);
}

/* 势力右键菜单里的「编辑资料」：两个按钮 —— 编辑势力界面 / 资料库编写 */
function mfEditPolityDialog(p) {
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', 'mf-note', '势力「' + esc(p.name) + '」的资料编辑入口：'));
  const r1 = mfNode('div', 'mf-row');
  const b1 = mfNode('div', 'mf-btn pri', '编辑势力界面');
  b1.style.flex = '1';
  b1.addEventListener('click', () => { d.close(); mfOpenProfile(p.id, true); });
  r1.appendChild(b1);
  wrap.appendChild(r1);
  wrap.appendChild(mfNode('div', 'mf-note', '打开该势力的简介界面：可增删栏目、拖动换位、把栏目拖入删除区。开启后点地图上的势力区域即可直接编辑。'));
  const r2 = mfNode('div', 'mf-row');
  const b2 = mfNode('div', 'mf-btn', '资料库编写');
  b2.style.flex = '1';
  b2.addEventListener('click', () => { d.close(); mfOpenLibrary(null, p.id); });
  r2.appendChild(b2);
  wrap.appendChild(r2);
  wrap.appendChild(mfNode('div', 'mf-note', '打开资料库总界面：平铺全部资料栏目与关键词链接，可增删改。这里的修改与势力界面互为同一份数据。'));
  const d = mfDialog({ title: '编辑资料', width: '360px', body: wrap, buttons: [{ label: '关闭', fn: function () { } }] });
}

function mfRenamePolity(p) {
  mfPrompt('势力名称', p.name, (v) => {
    const old = p.name; p.name = v;
    mfPushFnUndo(() => { p.name = old; mfRenderPolityList(); mfRenderProfile(); }, () => { p.name = v; mfRenderPolityList(); mfRenderProfile(); }, '重命名势力');
    /* 势力名标签联动 */
    (S.map.labels || []).forEach((l) => { if (l.polityId === p.id && l.type === 'polity') l.text = v; });
    mfRenderPolityList(); mfRenderProfile(); mfTouch();
  }, { title: '重命名势力' });
}
function mfLocatePolity(p) {
  const g = S.map.grid;
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < g.polity.length; i++) {
    if (g.polity[i] === p.seq) { const y = Math.floor(i / g.w), x = i - y * g.w; sx += g.lonOfX(x); sy += g.latOfY(y); n++; }
    if (n > 40000) break;
  }
  if (!n) { if (CTXREF) CTXREF.toast('该势力还没有疆域', 2200); return; }
  mfGoto(sx / n, sy / n, 1.6);
  mfOpenProfile(p.id);
}
function mfClonePolity(p) {
  const q = mfCreatePolity(p.name + ' 副本');
  q.color = p.color;
  q.fields = JSON.parse(JSON.stringify(p.fields || []));
  q.fields.forEach((f) => { f.id = uid('f'); (f.links || []).forEach((k) => { k.id = uid('k'); }); });
  mfRenderPolityList();
  if (CTXREF) CTXREF.toast('已复制为「' + q.name + '」（疆域需重新用势力笔圈定）', 3000, 'ok');
}
function mfDeletePolity(p) {
  mfConfirm('删除势力「' + p.name + '」？疆域与资料一并移除（可用 Ctrl+Z 撤销，也可用左侧「史」历史快照回滚）。', () => {
    mfSnapPush(S.pack, '删除势力「' + p.name + '」前');
    const g = S.map.grid, idx = [], old = [];
    for (let i = 0; i < g.polity.length; i++) if (g.polity[i] === p.seq) { idx.push(i); old.push(p.seq); g.polity[i] = 0; }
    const arr = S.map.polities, at = arr.indexOf(p);
    arr.splice(at, 1);
    mfPushFnUndo(
      function () { arr.splice(at, 0, p); for (let i = 0; i < idx.length; i++) g.polity[idx[i]] = p.seq; S.dirtyColor = true; mfRenderPolityList(); },
      function () { const k = arr.indexOf(p); if (k >= 0) arr.splice(k, 1); for (let i = 0; i < idx.length; i++) g.polity[idx[i]] = 0; S.dirtyColor = true; mfRenderPolityList(); },
      '删除势力'
    );
    if (ED.selPolity === p.id) ED.selPolity = null;
    S.dirtyColor = true;
    mfRenderPolityList(); mfCloseProfile(); mfTouch();
  }, { dgr: true, okLabel: '删除', title: '删除势力' });
}

/* 取色器 */
function mfPickColor(def, cb) {
  const wrap = mfNode('div');
  const inp = document.createElement('input');
  inp.type = 'color'; inp.value = def || '#c9813f';
  inp.style.cssText = 'width:70px;height:34px;padding:0;border:1px solid var(--rule,#c9b892);border-radius:6px;background:#fff';
  wrap.appendChild(inp);
  const pres = mfNode('div', 'mf-row');
  pres.style.flexWrap = 'wrap';
  CFG.POLITY_COLORS.forEach((c) => {
    const s = mfNode('span', 'sw');
    s.style.cssText = 'width:20px;height:20px;border-radius:4px;cursor:pointer;border:1px solid rgba(0,0,0,.25);background:' + c;
    s.addEventListener('click', () => { inp.value = c; });
    pres.appendChild(s);
  });
  wrap.appendChild(pres);
  mfDialog({
    title: '选择颜色', width: '300px', body: wrap,
    buttons: [{ label: '取消', fn: function () { } }, { label: '确定', pri: true, fn: function () { cb(inp.value); } }]
  });
}

/* ------------------------------------------------------- 势力简介浮窗 ---- */
function mfOpenProfile(pid, forceEdit) {
  const p = mfPolityById(pid);
  if (!p) return;
  ED.selPolity = pid;
  UI.prof.classList.add('on');
  UI.prof.dataset.pid = pid;
  mfRenderProfile();
  /* 告诉女仆：主人在看这位——她若有话想说，会说一句 */
  try {
    if (CTXREF && CTXREF.events && __HOST.EV && __HOST.EV.POLITY) {
      CTXREF.events.emit(__HOST.EV.POLITY, { name: p.name || '' });
    }
  } catch (e) { }
}
function mfCloseProfile() {
  if (UI.prof) { UI.prof.classList.remove('on'); UI.prof.innerHTML = ''; }
}
function mfRenderProfile() {
  const box = UI.prof;
  if (!box || !box.classList.contains('on')) return;
  const p = mfPolityById(box.dataset.pid);
  if (!p) { mfCloseProfile(); return; }
  box.innerHTML = '';

  const h = mfNode('div', 'mf-prof-h');
  const sw = mfNode('span', 'sw');
  sw.style.cssText = 'width:13px;height:13px;border-radius:3px;border:1px solid rgba(0,0,0,.25);background:' + p.color;
  sw.style.cursor = 'pointer';
  sw.title = '更换颜色';
  sw.addEventListener('click', () => mfPickColor(p.color, (c) => { p.color = c; S.dirtyColor = true; mfTouch(); mfRenderProfile(); mfRenderPolityList(); }));
  h.appendChild(sw);
  const nm = mfNode('span', '', esc(p.name));
  nm.style.cssText = 'flex:1;cursor:text';
  h.appendChild(nm);
  const mb = mfNode('span', 'mf-x', '☰');
  mb.title = '更多操作';
  mb.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = mb.getBoundingClientRect();
    mfPolityMenu(r.left - 100, r.bottom + 4, p);
  });
  const xb = mfNode('span', 'mf-x', '✕');
  xb.addEventListener('click', () => mfCloseProfile());
  h.appendChild(mb); h.appendChild(xb);
  box.appendChild(h);
  mfEditable(nm, () => p.name, (v) => {
    const old = p.name; p.name = v || old;
    (S.map.labels || []).forEach((l) => { if (l.polityId === p.id && l.type === 'polity') l.text = p.name; });
    mfRenderPolityList(); mfTouch();
  }, { onChange: () => mfRenderPolityList() });

  const b = mfNode('div', 'mf-prof-b');
  box.appendChild(b);

  /* 栏目列表 */
  (p.fields || []).forEach((f) => b.appendChild(mfFieldEl(p, f)));
  /* 加号：左键＝文字条目；右键＝选类型 */
  const add = mfNode('div', 'mf-add', '<span>＋</span><span>添加栏目</span>');
  add.addEventListener('click', () => mfAddField(p, 'text'));
  add.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    mfMenu(e.clientX, e.clientY, [
      { icon: '文', label: '创建文字条目栏目', fn: () => mfAddField(p, 'text') },
      { icon: '链', label: '创建链接关键词栏目', fn: () => mfAddField(p, 'link') }
    ]);
  });
  b.appendChild(add);

  /* 删除区域：保留最近 5 条被删栏目，可拖回恢复 */
  const dz = mfNode('div', 'mf-del');
  dz.appendChild(mfNode('div', 'cap', '删除区域（拖栏目到这里删除，保留最近 5 条，可拖回）'));
  (p.trash || []).forEach((t, ti) => {
    const chip = mfNode('div', 'chip', esc(mfFieldTitle(t)));
    chip.draggable = false;
    chip.title = '拖回上方列表可恢复';
    chip.addEventListener('pointerdown', (e) => mfStartTrashDrag(e, p, ti));
    dz.appendChild(chip);
  });
  b.appendChild(dz);

  mfAttachFieldDrag(b, dz, p);
}

function mfFieldTitle(f) { return f.title || (f.kind === 'link' ? '关键词栏目' : '未命名栏目'); }

function mfFieldEl(p, f) {
  const el = mfNode('div', 'mf-fld');
  const t = mfNode('div', 'mf-fld-t');
  const nm = mfNode('span', '', esc(mfFieldTitle(f)) + (f.kind === 'link' ? ' 链' : ''));
  nm.style.cursor = 'text';
  t.appendChild(nm);
  const x = mfNode('span', 'mf-x', '✕');
  x.title = '删除（或拖到下方删除区）';
  x.addEventListener('click', (e) => { e.stopPropagation(); mfRemoveField(p, f); });
  t.appendChild(x);
  el.appendChild(t);
  mfEditable(nm, () => f.title || '', (v) => { f.title = v; mfRenderProfile(); }, { onChange: () => mfTouch() });

  if (f.kind === 'text') {
    const v = mfNode('div', 'mf-fld-v', esc(f.text || ''));
    if (!f.text) { v.style.color = 'var(--ink-faint,#8a7a5e)'; v.textContent = '（点击填写内容）'; }
    el.appendChild(v);
    mfEditable(v, () => f.text || '', (s) => {
      const old = f.text || ''; f.text = s;
      mfPushFnUndo(() => { f.text = old; mfRenderProfile(); }, () => { f.text = s; mfRenderProfile(); }, '编辑栏目');
      mfTouch();
    }, { onChange: () => mfRenderProfile() });
  } else {
    const kws = mfNode('div', 'mf-kws');
    (f.links || []).forEach((kw) => {
      const k = mfNode('div', 'mf-kw');
      k.style.background = (kw.color || '#c9813f') + '33';
      k.style.borderColor = (kw.color || '#c9813f') + '88';
      const dot = mfNode('span', 'dot'); dot.style.background = kw.color || '#c9813f';
      k.appendChild(dot);
      k.appendChild(mfNode('span', '', esc(kw.label || '未命名')));
      k.title = '左键＝打开该关键词的资料界面　右键＝重命名 / 换色 / 图片集 / 评论集';
      mfKeywordAvatar(k, mfEntryOfKw(S.pack, kw));     /* 有人物图就直接显示在标签上 */
      k.addEventListener('click', (e) => { e.stopPropagation(); mfOpenKeyword(kw); });
      k.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        const ent = mfKeywordEntry(S.pack, kw);
        const info = mfEntryInfo(ent);
        mfMenu(e.clientX, e.clientY, [
          { icon: '✎', label: '重命名', fn: () => mfPrompt('关键词名称', kw.label, (v) => { const o = kw.label; kw.label = v; mfKeywordEntry(S.pack, kw).title = v; mfRenderProfile(); mfTouch(); }) },
          { icon: '◐', label: '更换标签颜色', fn: () => mfPickColor(kw.color || '#c9813f', (c) => { kw.color = c; mfRenderProfile(); mfTouch(); }) },
          { sep: true },
          { icon: '图', label: '插入图片', fn: () => mfPickFiles(async (files) => { const n = await mfInsertImages(ent, files); if (n) mfRenderProfile(); }, 'image/*') },
          { icon: '集', label: '打开图片集' + (info.imgs ? '（' + info.imgs + '）' : ''), fn: () => mfImgDialog(ent, kw.label, () => mfRenderProfile()) },
          { icon: '言', label: '插入评论', fn: () => mfCommentAdd(ent, () => mfRenderProfile()) },
          { icon: '评', label: '打开评论集' + (info.cmts ? '（' + info.cmts + '）' : ''), fn: () => mfCmtDialog(ent, kw.label, () => mfRenderProfile()) },
          { sep: true },
          {
            icon: '✕', label: '删除关键词', dgr: true, fn: () => {
              const arr = f.links, at = arr.indexOf(kw); arr.splice(at, 1);
              mfPushFnUndo(() => arr.splice(at, 0, kw), () => { const k2 = arr.indexOf(kw); if (k2 >= 0) arr.splice(k2, 1); }, '删除关键词');
              mfRenderProfile(); mfTouch();
            }
          }
        ]);
      });
      kws.appendChild(k);
    });
    const ka = mfNode('div', 'mf-kw');
    ka.style.cssText = 'border-style:dashed;color:var(--ink-faint,#8a7a5e)';
    ka.textContent = '＋ 关键词';
    ka.addEventListener('click', (e) => {
      e.stopPropagation();
      mfPrompt('关键词名称', '新关键词', (v) => {
        f.links = f.links || [];
        const kw = { id: uid('k'), label: v, color: CFG.POLITY_COLORS[f.links.length % CFG.POLITY_COLORS.length], entryId: null };
        f.links.push(kw);
        mfKeywordEntry(S.pack, kw);
        mfPushFnUndo(() => { const k2 = f.links.indexOf(kw); if (k2 >= 0) f.links.splice(k2, 1); mfRenderProfile(); }, () => { f.links.push(kw); mfRenderProfile(); }, '新增关键词');
        mfRenderProfile(); mfTouch();
      }, { title: '新增链接关键词' });
    });
    kws.appendChild(ka);
    el.appendChild(kws);
  }
  return el;
}

function mfAddField(p, kind) {
  const f = { id: uid('f'), kind: kind, title: kind === 'link' ? '关键词栏目' : '新栏目', text: '', links: kind === 'link' ? [] : undefined };
  p.fields = p.fields || [];
  p.fields.push(f);
  mfPushFnUndo(
    () => { const i = p.fields.indexOf(f); if (i >= 0) p.fields.splice(i, 1); mfRenderProfile(); },
    () => { p.fields.push(f); mfRenderProfile(); },
    '新增栏目'
  );
  mfRenderProfile(); mfTouch();
}
function mfRemoveField(p, f) {
  const arr = p.fields, at = arr.indexOf(f);
  if (at < 0) return;
  p.trash = p.trash || [];
  p.trash.unshift(JSON.parse(JSON.stringify(f)));
  if (p.trash.length > 5) p.trash.length = 5;
  arr.splice(at, 1);
  mfPushFnUndo(
    function () {
      arr.splice(at, 0, f);
      const k = p.trash.findIndex((t) => t.__id === f.id); if (k >= 0) p.trash.splice(k, 1);
      mfRenderProfile();
    },
    function () {
      const k = arr.indexOf(f); if (k >= 0) arr.splice(k, 1);
      p.trash.unshift(JSON.parse(JSON.stringify(f))); if (p.trash.length > 5) p.trash.length = 5;
      mfRenderProfile();
    },
    '删除栏目'
  );
  mfRenderProfile(); mfTouch();
}

/* 栏目拖动：换位 / 拖入删除区 */
function mfStartTrashDrag(e, p, ti) {
  e.preventDefault();
  const chip = e.currentTarget;
  const ghost = mfNode('div', 'chip');
  ghost.textContent = chip.textContent;
  ghost.style.cssText = 'position:fixed;z-index:200;pointer-events:none;opacity:.9;background:#fff';
  mfMount(document.body, ghost);
  function mv(ev) { ghost.style.left = (ev.clientX + 8) + 'px'; ghost.style.top = (ev.clientY + 8) + 'px'; }
  function up(ev) {
    document.removeEventListener('pointermove', mv);
    document.removeEventListener('pointerup', up);
    mfDrop(ghost);
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    const list = UI.prof.querySelector('.mf-prof-b');
    if (target && list && list.contains(target)) {
      const t = p.trash[ti]; if (!t) return;
      const f = JSON.parse(JSON.stringify(t)); f.id = uid('f');
      (f.links || []).forEach((k) => { k.id = uid('k'); });
      p.trash.splice(ti, 1);
      /* 插入到释放位置附近：默认放到末尾 */
      p.fields.push(f);
      mfPushFnUndo(
        () => { const i = p.fields.indexOf(f); if (i >= 0) p.fields.splice(i, 1); p.trash.splice(ti, 0, t); mfRenderProfile(); },
        () => { const i = p.trash.indexOf(t); if (i >= 0) p.trash.splice(i, 1); p.fields.push(f); mfRenderProfile(); },
        '恢复栏目'
      );
      mfRenderProfile(); mfTouch();
      if (CTXREF) CTXREF.toast('已恢复栏目「' + mfFieldTitle(f) + '」', 2000, 'ok');
    }
  }
  document.addEventListener('pointermove', mv);
  document.addEventListener('pointerup', up);
}

function mfAttachFieldDrag(list, delZone, p) {
  let dragEl = null, ph = null, moved = false;
  function down(e) {
    if (e.button !== 0) return;
    const fld = e.target.closest ? e.target.closest('.mf-fld') : null;
    if (!fld || !list.contains(fld)) return;
    if (!(e.target.closest && e.target.closest('.mf-fld-t'))) return;   // 只有抓标题行才拖
    if (e.target.closest('.mf-x')) return;
    dragEl = fld; moved = false;
    ph = mfNode('div');
    ph.style.cssText = 'height:' + fld.offsetHeight + 'px;border:1px dashed var(--ink,#3a2a16);border-radius:7px;margin-bottom:7px';
    e.preventDefault();
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', up);
  }
  function mv(e) {
    if (!dragEl) return;
    moved = true;
    dragEl.classList.add('drag');
    /* 悬停删除区？ */
    if (delZone) {
      const r = delZone.getBoundingClientRect();
      const inDel = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      delZone.classList.toggle('over', inDel);
    }
    const items = Array.prototype.slice.call(list.querySelectorAll('.mf-fld'));
    let target = null;
    for (const it of items) {
      if (it === dragEl) continue;
      const rr = it.getBoundingClientRect();
      if (e.clientY >= rr.top && e.clientY <= rr.top + rr.height / 2) { target = it; break; }
      if (e.clientY > rr.top + rr.height / 2 && e.clientY <= rr.bottom) { target = it.nextSibling; break; }
    }
    if (target && target !== ph && target !== dragEl.nextSibling) list.insertBefore(ph, target);
  }
  function up(e) {
    document.removeEventListener('pointermove', mv);
    document.removeEventListener('pointerup', up);
    if (!dragEl) return;
    dragEl.classList.remove('drag');
    if (delZone) {
      const r = delZone.getBoundingClientRect();
      const inDel = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      delZone.classList.remove('over');
      if (inDel) {
        const arr = p.fields;
        const oldIdx = Array.prototype.indexOf.call(list.querySelectorAll('.mf-fld'), dragEl);
        const f = arr[oldIdx];
        if (ph && ph.parentNode) ph.remove();
        dragEl = null;
        if (f) mfRemoveField(p, f);
        return;
      }
    }
    if (ph && ph.parentNode) {
      const items = Array.prototype.slice.call(list.querySelectorAll('.mf-fld'));
      const from = items.indexOf(dragEl);
      list.insertBefore(dragEl, ph);
      ph.remove();
      const to = Array.prototype.indexOf.call(list.querySelectorAll('.mf-fld'), dragEl);
      if (from >= 0 && to >= 0 && from !== to) {
        const arr = p.fields;
        const a = arr[from];
        arr.splice(from, 1); arr.splice(to, 0, a);
        mfPushFnUndo(
          function () { const x = arr[to]; arr.splice(to, 1); arr.splice(from, 0, x); mfRenderProfile(); },
          function () { const x = arr[from]; arr.splice(from, 1); arr.splice(to, 0, x); mfRenderProfile(); },
          '栏目换位'
        );
        mfTouch();
      }
    }
    dragEl = null;
  }
  list.addEventListener('pointerdown', down);
}

/* 打开关键词链接对应的资料界面 */
function mfOpenKeyword(kw) {
  const e = mfKeywordEntry(S.pack, kw);
  mfOpenLibrary(e.id);
}

/* ===================== 65_media.js ===================== */
/* ==========================================================================
 * 资料条目的图片集 / 评论集（关键词链接右键 → 四项选择）
 * 图片挂在资料条目上：entry.imgs = [{id,name,data,t}]，**第一张就是「人物图」**
 * 评论挂在资料条目上：entry.cmts = [{id,from,text,t}]
 * 插入时统一压到最长边 760px 的 JPEG（白底），避免 dataURL 把地图包撑爆
 * ========================================================================== */

/* 惰性初始化：老地图包里没有这两个字段也能直接升级出来 */
function mfEntryImgs(e) {
  if (!e) return [];
  if (!Array.isArray(e.imgs)) e.imgs = [];
  return e.imgs;
}
function mfEntryCmts(e) {
  if (!e) return [];
  if (!Array.isArray(e.cmts)) e.cmts = [];
  return e.cmts;
}
/* 人物图 = 图像列表的第一张 */
function mfPortrait(e) {
  const im = mfEntryImgs(e);
  return im.length ? (im[0].data || '') : '';
}
function mfEntryInfo(e) {
  return { imgs: mfEntryImgs(e).length, cmts: mfEntryCmts(e).length };
}

/* ------------------------------------------------------- 图片文件读取 ---- */
function mfReadImageFile(file, maxSide, q) {
  return new Promise(function (resolve, reject) {
    if (!file || (file.type && file.type.indexOf('image/') !== 0)) { reject(new Error('不是图片文件')); return; }
    const fr = new FileReader();
    fr.onerror = function () { reject(new Error('读取图片失败')); };
    fr.onload = function () {
      const img = new Image();
      img.onerror = function () { reject(new Error('这个图片无法显示')); };
      img.onload = function () {
        try {
          let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          const m = Math.max(w, h) || 1;
          if (m > maxSide) { const s = maxSide / m; w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s)); }
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const g = cv.getContext('2d');
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);   /* 白底：透明 PNG 转 JPEG 不会发黑 */
          g.drawImage(img, 0, 0, w, h);
          resolve({ name: String(file.name || '图片').replace(/\.[^.]+$/, ''), data: cv.toDataURL('image/jpeg', q || 0.78) });
        } catch (err) { reject(err); }
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

async function mfInsertImages(entry, files, opt) {
  opt = opt || {};
  const imgs = mfEntryImgs(entry);
  let ok = 0, bad = 0;
  const list = Array.prototype.slice.call(files || []);
  for (let i = 0; i < list.length; i++) {
    try {
      const o = await mfReadImageFile(list[i], opt.maxSide || 760, opt.q || 0.78);
      imgs.push({ id: uid('img'), name: o.name, data: o.data, t: Date.now() });
      ok++;
    } catch (e) { bad++; }
  }
  if (ok) {
    mfTouch();
    if (CTXREF) {
      CTXREF.toast('已插入 ' + ok + ' 张图片' + (mfEntryImgs(entry)[0] ? '，第一张已自动成为人物图' : '')
        + (bad ? '（' + bad + ' 个文件不是可用图片）' : ''), 2800, 'ok');
    }
  } else if (CTXREF) CTXREF.toast('没有可用的图片文件', 2400);
  return ok;
}

/* 选文件：用 mfMount 登记，模块卸下时会被清掉，不留悬挂 input */
function mfPickFiles(cb, accept, multiple) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept || 'image/*';
  if (multiple !== false) inp.multiple = true;
  inp.style.display = 'none';
  mfMount(document.body, inp);
  inp.addEventListener('change', function () {
    const fs = inp.files;
    cb && cb(fs);
    setTimeout(function () { try { mfDrop(inp); } catch (e) { } }, 300);
  });
  inp.click();
}

/* 带多行输入的对话框（给「插入评论」用，单行 prompt 不够写） */
function mfTextDialog(title, def, onOk, opt) {
  opt = opt || {};
  const wrap = mfNode('div');
  if (opt.from !== undefined) {
    wrap.appendChild(mfNode('div', '', '<div style="margin-bottom:6px">署名 / 来源（可留空）</div>'));
    const fi = mfNode('input', 'mf-inp');
    fi.value = opt.from || '';
    fi.style.cssText = 'width:100%;padding:6px 8px;margin-bottom:10px';
    wrap.appendChild(fi);
    opt.__fromEl = fi;
  }
  wrap.appendChild(mfNode('div', '', '<div style="margin-bottom:6px">' + esc(opt.label || '内容') + '</div>'));
  const ta = mfNode('textarea', 'mf-ta');
  ta.value = def || '';
  ta.style.minHeight = '150px';
  wrap.appendChild(ta);
  const d = mfDialog({
    title: title, width: 'min(540px,92vw)', body: wrap,
    buttons: [
      { label: '取消', fn: function () { } },
      {
        label: opt.okLabel || '确定', pri: true, fn: function () {
          if (onOk) onOk(ta.value, opt.__fromEl ? opt.__fromEl.value : '');
        }
      }
    ]
  });
  setTimeout(function () { ta.focus(); }, 30);
  return d;
}

/* ------------------------------------------------------- 图片集编辑器 ---- */
/* 增删改序都能做：点卡片看大图，右键改顺序/重命名/删除，第一张即人物图 */
function mfImgDialog(entry, title, onChange) {
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', 'mf-note',
    '<b>第一张 = 人物图</b>，会显示在顶部搜索的结果里。点卡片看大图，右键卡片可调整顺序 / 重命名 / 删除。'
    + '插入的图片会压到最长边 760px，避免地图包变得过大。'));
  const grid = mfNode('div', 'mf-img-grid');
  wrap.appendChild(grid);
  const bar = mfNode('div', 'mf-row');
  bar.style.cssText = 'margin-top:12px;gap:8px';
  const bAdd = mfNode('div', 'mf-btn pri', '＋ 插入图片');
  const bTop = mfNode('div', 'mf-btn', '⭐ 把某张设为人物图');
  const bClr = mfNode('div', 'mf-btn dgr', '清空');
  bar.appendChild(bAdd); bar.appendChild(bTop); bar.appendChild(bClr);
  wrap.appendChild(bar);

  function done() { if (onChange) onChange(); }

  function render() {
    grid.innerHTML = '';
    const imgs = mfEntryImgs(entry);
    imgs.forEach(function (im, i) {
      const card = mfNode('div', 'mf-img-card' + (i === 0 ? ' cover' : ''));
      const ph = mfNode('div', 'mf-img-ph');
      const imEl = mfNode('img');
      imEl.src = im.data; imEl.alt = im.name || '';
      if (!im.data) ph.textContent = '图';
      else ph.appendChild(imEl);
      card.appendChild(ph);
      if (i === 0) card.appendChild(mfNode('div', 'mf-img-badge', '人物图'));
      const xx = mfNode('div', 'mf-img-x', '✕');
      xx.title = '删除这张图';
      xx.addEventListener('click', function (e) {
        e.stopPropagation();
        mfConfirm('删除这张图片？', function () { imgs.splice(i, 1); mfTouch(); render(); done(); }, { dgr: true, okLabel: '删除' });
      });
      card.appendChild(xx);
      card.appendChild(mfNode('div', 'mf-img-nm', (i + 1) + '. ' + esc(im.name || '图片')));
      card.addEventListener('click', function () { mfImgPreview(imgs, i); });
      card.addEventListener('contextmenu', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        mfMenu(ev.clientX, ev.clientY, [
          {
            icon: '⭐', label: '设为人物图（移到第一张）', fn: function () {
              if (i === 0) { if (CTXREF) CTXREF.toast('它已经是第一张了', 1800); return; }
              const o = imgs.splice(i, 1)[0]; imgs.unshift(o);
              mfTouch(); render(); done();
              if (CTXREF) CTXREF.toast('已设为人物图', 2200, 'ok');
            }
          },
          { icon: '✏', label: '重命名', fn: function () { mfPrompt('图片名称', im.name || '', function (v) { im.name = v; mfTouch(); render(); }); } },
          { sep: true },
          {
            icon: '⬅', label: '前移', fn: function () {
              if (i <= 0) return;
              imgs.splice(i, 1); imgs.splice(i - 1, 0, im); mfTouch(); render(); done();
            }
          },
          {
            icon: '→', label: '后移', fn: function () {
              if (i >= imgs.length - 1) return;
              imgs.splice(i, 1); imgs.splice(i + 1, 0, im); mfTouch(); render(); done();
            }
          },
          { sep: true },
          {
            icon: '✕', label: '删除', dgr: true, fn: function () {
              mfConfirm('删除这张图片？', function () { imgs.splice(i, 1); mfTouch(); render(); done(); }, { dgr: true, okLabel: '删除' });
            }
          }
        ]);
      });
      grid.appendChild(card);
    });
    const add = mfNode('div', 'mf-img-card add');
    add.appendChild(mfNode('div', 'plus', '＋'));
    add.appendChild(mfNode('div', '', '插入图片'));
    add.title = '插入图片（可一次选多张）';
    add.addEventListener('click', function () { doAdd(); });
    grid.appendChild(add);
  }

  function doAdd() {
    mfPickFiles(async function (files) {
      const n = await mfInsertImages(entry, files);
      if (n) { render(); done(); }
    }, 'image/*');
  }
  render();

  bAdd.addEventListener('click', doAdd);
  bTop.addEventListener('click', function () {
    const imgs = mfEntryImgs(entry);
    if (imgs.length < 2) { if (CTXREF) CTXREF.toast('至少要两张图片才能换人物图', 2400); return; }
    const items = [{ icon: '✕', label: '取消', fn: function () { } }];
    imgs.forEach(function (im, i) {
      items.push({
        icon: '图', label: (i + 1) + '. ' + (im.name || '图片'), fn: function () {
          const o = imgs.splice(i, 1)[0]; imgs.unshift(o);
          mfTouch(); render(); done();
          if (CTXREF) CTXREF.toast('已设为人物图', 2200, 'ok');
        }
      });
    });
    const r = bTop.getBoundingClientRect();
    mfMenu(r.left, r.bottom + 4, items);
  });
  bClr.addEventListener('click', function () {
    mfConfirm('清空这个条目的全部图片？人物图也会一并消失。', function () {
      mfEntryImgs(entry).length = 0; mfTouch(); render(); done();
    }, { dgr: true, okLabel: '清空', title: '清空图片集' });
  });

  return mfDialog({ title: '图片集 · ' + (title || entry.title || ''), cls: 'mf-imglib', body: wrap, width: 'min(720px,94vw)' });
}

/* 大图预览（可左右翻） */
function mfImgPreview(imgs, idx) {
  let i = idx;
  const wrap = mfNode('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px';
  const box = mfNode('div');
  box.style.cssText = 'width:100%;max-height:62vh;overflow:auto;background:#0b1020;border-radius:8px;text-align:center';
  const im = mfNode('img');
  im.style.cssText = 'max-width:100%;max-height:60vh;object-fit:contain';
  box.appendChild(im);
  wrap.appendChild(box);
  const cap = mfNode('div', 'mf-note', '');
  wrap.appendChild(cap);
  function show() {
    const it = imgs[i];
    if (!it) return;
    im.src = it.data || '';
    cap.textContent = (i + 1) + ' / ' + imgs.length + '　' + (it.name || '');
  }
  show();
  const d = mfDialog({
    title: '查看图片', width: 'min(760px,94vw)', body: wrap,
    buttons: [
      { label: '← 上一张', keep: imgs.length > 1, fn: function () { i = (i - 1 + imgs.length) % imgs.length; show(); } },
      { label: '下一张 →', keep: imgs.length > 1, fn: function () { i = (i + 1) % imgs.length; show(); } },
      { label: '关闭', pri: true, fn: function () { } }
    ]
  });
  return d;
}

/* ------------------------------------------------------- 评论集编辑器 ---- */
function mfCommentAdd(entry, onDone) {
  mfTextDialog('插入评论', '', function (txt, from) {
    const t = String(txt || '').trim();
    if (!t) { if (CTXREF) CTXREF.toast('评论为空，没有写入', 2200); return; }
    mfEntryCmts(entry).push({ id: uid('cm'), from: from || '', text: t, t: Date.now() });
    mfTouch();
    if (CTXREF) CTXREF.toast('已插入评论', 2000, 'ok');
    if (onDone) onDone();
  }, { from: '', label: '评论内容', okLabel: '插入' });
}

function mfCmtDialog(entry, title, onChange) {
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', 'mf-note', '评论按添加顺序排列，可编辑 / 上下移 / 删除。写到资料条目里，会跟着地图一起存盘与导出。'));
  const list = mfNode('div', 'mf-cmt-list');
  wrap.appendChild(list);
  const bar = mfNode('div', 'mf-row');
  bar.style.cssText = 'margin-top:12px;gap:8px';
  const bAdd = mfNode('div', 'mf-btn pri', '＋ 插入评论');
  const bClr = mfNode('div', 'mf-btn dgr', '清空');
  bar.appendChild(bAdd); bar.appendChild(bClr);
  wrap.appendChild(bar);

  function done() { if (onChange) onChange(); }
  function render() {
    list.innerHTML = '';
    const cmts = mfEntryCmts(entry);
    if (!cmts.length) {
      list.appendChild(mfNode('div', 'mf-note', '还没有评论。点下面的「＋ 插入评论」写第一条。'));
      return;
    }
    cmts.forEach(function (c, i) {
      const it = mfNode('div', 'mf-cmt-item');
      const head = mfNode('div', 'mf-cmt-h');
      head.appendChild(mfNode('span', 'who', esc(c.from || '匿名')));
      head.appendChild(mfNode('span', 'tm', fmtTime(c.t)));
      const ops = mfNode('div', 'mf-cmt-ops');
      const bE = mfNode('span', 'mf-x-b', '✏');
      bE.title = '编辑';
      bE.addEventListener('click', function (e) {
        e.stopPropagation();
        mfTextDialog('编辑评论', c.text || '', function (txt, from) {
          c.text = String(txt || '').trim(); c.from = from || ''; c.t = Date.now();
          mfTouch(); render(); done();
        }, { from: c.from || '', label: '评论内容', okLabel: '保存' });
      });
      const bU = mfNode('span', 'mf-x-b', '⬆');
      bU.title = '上移';
      bU.addEventListener('click', function (e) {
        e.stopPropagation();
        if (i > 0) { cmts.splice(i, 1); cmts.splice(i - 1, 0, c); mfTouch(); render(); done(); }
      });
      const bD = mfNode('span', 'mf-x-b', '⬇');
      bD.title = '下移';
      bD.addEventListener('click', function (e) {
        e.stopPropagation();
        if (i < cmts.length - 1) { cmts.splice(i, 1); cmts.splice(i + 1, 0, c); mfTouch(); render(); done(); }
      });
      const bX = mfNode('span', 'mf-x-b', '✕');
      bX.title = '删除';
      bX.addEventListener('click', function (e) {
        e.stopPropagation();
        mfConfirm('删除这条评论？', function () { cmts.splice(i, 1); mfTouch(); render(); done(); }, { dgr: true, okLabel: '删除' });
      });
      ops.appendChild(bE); ops.appendChild(bU); ops.appendChild(bD); ops.appendChild(bX);
      head.appendChild(ops);
      it.appendChild(head);
      const body = mfNode('div', 'mf-cmt-v', esc(c.text || '（空白评论）'));
      if (!c.text) body.style.color = 'var(--ink-faint,#8a7a5e)';
      it.appendChild(body);
      list.appendChild(it);
    });
  }
  render();
  bAdd.addEventListener('click', function () { mfCommentAdd(entry, function () { render(); done(); }); });
  bClr.addEventListener('click', function () {
    mfConfirm('清空这个条目的全部评论？', function () { mfEntryCmts(entry).length = 0; mfTouch(); render(); done(); },
      { dgr: true, okLabel: '清空', title: '清空评论集' });
  });
  return mfDialog({ title: '评论集 · ' + (title || entry.title || ''), cls: 'mf-cmtlib', body: wrap, width: 'min(620px,94vw)' });
}

/* --------------------------------------- 关键词 / 条目右键的四项选择 ---- */
/* 关键词标签上直接显示人物图（把左侧小圆点换成头像） */
function mfKeywordAvatar(chip, entry) {
  if (!chip || !entry) return;
  const p = mfPortrait(entry);
  const dot = chip.querySelector('.dot');
  if (!p || !dot) return;
  dot.style.width = '15px'; dot.style.height = '15px';
  dot.style.backgroundImage = 'url("' + p + '")';
  dot.style.backgroundSize = 'cover';
  dot.style.backgroundPosition = 'center';
  dot.style.boxShadow = '0 0 0 1px ' + (getComputedStyle(dot).backgroundColor || '#fff');
}
/* mfMenu 的四个项：插入图片 / 打开图片集 / 插入评论 / 打开评论集 */
function mfEntryMediaMenu(entry, x, y, onChange) {
  const info = mfEntryInfo(entry);
  mfMenu(x, y, [
    { icon: '图', label: '插入图片', fn: function () { mfPickFiles(async function (files) { const n = await mfInsertImages(entry, files); if (n && onChange) onChange(); }, 'image/*'); } },
    { icon: '集', label: '打开图片集' + (info.imgs ? '（' + info.imgs + '）' : ''), fn: function () { mfImgDialog(entry, entry.title, onChange); } },
    { icon: '言', label: '插入评论', fn: function () { mfCommentAdd(entry, onChange); } },
    { icon: '评', label: '打开评论集' + (info.cmts ? '（' + info.cmts + '）' : ''), fn: function () { mfCmtDialog(entry, entry.title, onChange); } }
  ]);
}

/* ===================== 70_terrain.js ===================== */
/* ==========================================================================
 * 地形编辑：地形画笔（内置调色板 + 自定义画笔）· 一键地形建模
 * ========================================================================== */

function mfPanelTerrain(body) {
  /* ---- 地形画笔 ---- */
  let sec = mfNode('div', 'mf-sec');
  sec.appendChild(mfNode('div', 'mf-sec-t', '地形画笔（右键画笔＝粗细 / 编辑）'));
  const grid = mfNode('div', 'mf-tools');
  S.map.terrains.forEach((t, i) => {
    const b = mfNode('div', 'mf-tool' + (ED.tool === ('terrain:' + i) ? ' on' : ''));
    const sw = mfNode('span', 'sw'); sw.style.background = t.color;
    b.appendChild(sw);
    b.appendChild(mfNode('span', '', esc(t.name)));
    b.title = t.name + ' · ' + t.h + 'm（' + (t.kind === 'sea' ? '海洋地形' : '陆地地形') + '）';
    b.addEventListener('click', () => {
      ED.terrainIdx = i; ED.tool = 'terrain:' + i;
      mfBuildPanel(); mfHintForTool();
    });
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      mfMenu(e.clientX, e.clientY, [
        { icon: '◎', label: '调整粗细…', fn: () => mfBrushDialog() },
        { sep: true },
        { icon: '✎', label: '重命名', fn: () => mfPrompt('地形名称', t.name, (v) => { t.name = v; S.dirtyColor = true; mfBuildPanel(); mfTouch(); }) },
        { icon: '◐', label: '更换颜色', fn: () => mfPickColor(t.color, (c) => { t.color = c; S.dirtyColor = true; mfBuildPanel(); mfTouch(); }) },
        { icon: '▲', label: '高度值（米）', fn: () => mfPrompt('高度值（米，海洋为负）', String(t.h), (v) => { const n = parseFloat(v); if (!isNaN(n)) { t.h = n; mfBuildPanel(); mfTouch(); } }) },
        { sep: true },
        {
          icon: '✕', label: '删除画笔', dgr: true, fn: () => {
            if (S.map.terrains.length <= 1) { if (CTXREF) CTXREF.toast('至少保留一支画笔', 2000); return; }
            mfConfirm('删除地形画笔「' + t.name + '」？已画在地图上的该地形会变成无色。', () => {
              const g = S.map.grid, idx = [], old = [], tv = i + 1;
              for (let k = 0; k < g.terrain.length; k++) if (g.terrain[k] === tv) { idx.push(k); old.push(tv); g.terrain[k] = 0; }
              const rem = S.map.terrains[i], at = i;
              S.map.terrains.splice(i, 1);
              mfPushFnUndo(
                function () { S.map.terrains.splice(at, 0, rem); for (let k = 0; k < idx.length; k++) g.terrain[idx[k]] = tv; S.dirtyColor = true; mfBuildPanel(); },
                function () { const k2 = S.map.terrains.indexOf(rem); if (k2 >= 0) S.map.terrains.splice(k2, 1); for (let k = 0; k < idx.length; k++) g.terrain[idx[k]] = 0; S.dirtyColor = true; mfBuildPanel(); },
                '删除地形画笔'
              );
              S.dirtyColor = true; mfBuildPanel(); mfTouch();
            }, { dgr: true, okLabel: '删除' });
          }
        }
      ]);
    });
    grid.appendChild(b);
  });
  const addB = mfNode('div', 'mf-tool');
  addB.appendChild(mfNode('span', '', '＋ 自定义'));
  addB.addEventListener('click', () => mfNewTerrainDialog());
  grid.appendChild(addB);
  sec.appendChild(grid);

  const br = mfNode('div', 'mf-row');
  br.appendChild(mfNode('label', '', '笔刷'));
  const brs = mfNode('input', 'mf-inp');
  brs.type = 'range'; brs.min = '1'; brs.max = '160'; brs.value = String(ED.brushPx);
  const brv = mfNode('span', '', ED.brushPx + 'px');
  brv.style.flex = 'none';
  brs.addEventListener('input', () => { ED.brushPx = +brs.value; brv.textContent = ED.brushPx + 'px'; });
  br.appendChild(brs); br.appendChild(brv);
  sec.appendChild(br);
  sec.appendChild(mfNode('div', 'mf-note', '地形色优先级高于陆/海默认色，可以直接盖在海洋上。'));

  /* 作画模式已统一收进左侧工具条（涂/圈/直），圈地的图形与微调也在工具条上，此处不再重复 */
  sec.appendChild(mfNode('div', 'mf-note', '作画模式在左侧工具条切换：涂＝涂抹 / 圈＝圈地 / 直＝直线。圈地状态下，工具条会多出图形小按钮和「✏」微调开关（右键球面可切「选段/修改」）。'));

  /* 地形填充：点封闭区域内部，整块填成当前画笔的地形 */
  const tfB = mfNode('div', 'mf-btn' + (ED.tool === 'tfill' ? ' pri' : ''), '◎ 地形填充（先选好上面的地形画笔）');
  tfB.style.width = '100%';
  tfB.addEventListener('click', () => {
    ED.tool = (ED.tool === 'tfill') ? null : 'tfill';
    mfBuildPanel(); mfHintForTool();
  });
  sec.appendChild(tfB);
  body.appendChild(sec);

  /* ---- 一键地形建模 ---- */
  sec = mfNode('div', 'mf-sec');
  sec.appendChild(mfNode('div', 'mf-sec-t', '地形建模'));
  const hasT = mfTerrainPainted();
  if (hasT) {
    const b = mfNode('div', 'mf-btn pri', '▲ 一键地形建模');
    b.style.width = '100%';
    b.addEventListener('click', () => mfTerrainBuildDialog());
    sec.appendChild(b);
    sec.appendChild(mfNode('div', 'mf-note', '按画笔的「高度值」自动生成高度场：块心最高、向边缘收分，再做平滑与轻度侵蚀。'));
    if (S.map.height) {
      const rr = mfNode('div', 'mf-row');
      const lbH = mfNode('label', '', '起伏 ？');
      lbH.title = '整体抬高或压低全部地形的高度倍数：1 ＝原样，拉大更陡峭，拉小更平缓（只改高矮，不改形状）';
      lbH.style.cursor = 'help';
      rr.appendChild(lbH);
      const hs = mfNode('input', 'mf-inp');
      hs.type = 'range'; hs.min = '0.1'; hs.max = '3'; hs.step = '0.05';
      hs.value = String(S.map.heightScale == null ? 1 : S.map.heightScale);
      hs.addEventListener('input', () => {
        S.map.heightScale = +hs.value;
        S.dirtyPos = true; S.dirtyColor = true;
        if (S.controls) S.controls.minDistance = 1 + 0.06 * (S.map.heightScale || 1);
      });
      rr.appendChild(hs);
      sec.appendChild(rr);
      sec.appendChild(mfNode('div', 'mf-note', '起伏＝整张地图高度的总开关：往左山变矮直到贴回球面，往右山变高更夸张。只改显示，不动数据。'));
      const r2 = mfNode('div', 'mf-row');
      const bOff = mfNode('div', 'mf-btn', '清除建模');
      bOff.addEventListener('click', () => {
        const bak = S.map.height;
        S.map.height = null; S.dirtyPos = true; S.dirtyColor = true;
        if (S.controls) S.controls.minDistance = mfMinDist();
        mfPushFnUndo(() => { S.map.height = bak; S.dirtyPos = true; S.dirtyColor = true; mfBuildPanel(); }, () => { S.map.height = null; S.dirtyPos = true; S.dirtyColor = true; mfBuildPanel(); }, '清除地形建模', true);
        mfBuildPanel(); mfTouch();
      });
      const bExp = mfNode('div', 'mf-btn', '导出高度场');
      bExp.addEventListener('click', () => mfExportHeight());
      r2.appendChild(bOff); r2.appendChild(bExp);
      sec.appendChild(r2);
    }
  } else {
    sec.appendChild(mfNode('div', 'mf-note', '先用地形画笔在地图上涂几笔，这里就会出现「一键地形建模」。'));
  }
  body.appendChild(sec);

  /* ---- 建模系统 ---- */
  sec = mfNode('div', 'mf-sec');
  sec.appendChild(mfNode('div', 'mf-sec-t', '建模系统'));
  const r3 = mfNode('div', 'mf-row');
  const bMod = mfNode('div', 'mf-btn pri', '▣ 建模系统');
  bMod.style.flex = '1';
  bMod.addEventListener('click', () => mfOpenModeling());
  r3.appendChild(bMod);
  sec.appendChild(r3);
  sec.appendChild(mfNode('div', 'mf-note',
    '建模目录里已有 ' + (S.map.models || []).length + ' 个建模、地图上已放置 ' + (S.map.instances || []).length +
    ' 个实例。开启后可选中地图上的实例拖回建模界面修改。'));
  const sw = mfNode('div', 'mf-row');
  sw.appendChild(mfNode('label', '', '选中地图建模'));
  const cb = mfNode('input');
  cb.type = 'checkbox'; cb.checked = !!ED.modelMode;
  cb.addEventListener('change', () => { ED.modelMode = cb.checked; ED.tool = cb.checked ? 'model' : null; mfBuildPanel(); });
  sw.appendChild(cb);
  sec.appendChild(sw);
  if ((S.map.instances || []).length) {
    const bClr = mfNode('div', 'mf-btn dgr', '清空所有实例');
    bClr.style.marginTop = '6px';
    bClr.addEventListener('click', () => mfConfirm('清空地图上放置的全部建模实例？（建模目录里的原件保留）', () => {
      const bak = S.map.instances.slice();
      S.map.instances.length = 0; mfRebuildInstances();
      mfPushFnUndo(() => { S.map.instances = bak; mfRebuildInstances(); }, () => { S.map.instances.length = 0; mfRebuildInstances(); }, '清空实例');
      mfBuildPanel(); mfTouch();
    }, { dgr: true, okLabel: '清空' }));
    sec.appendChild(bClr);
  }
  body.appendChild(sec);

  /* ---- 标签系统 ---- */
  sec = mfNode('div', 'mf-sec');
  sec.appendChild(mfNode('div', 'mf-sec-t', '地形命名标签'));
  const r4 = mfNode('div', 'mf-row');
  const sw2 = mfNode('div', 'mf-btn', '签 标签开关：' + (ED.labelMode ? '开' : '关'));
  sw2.style.flex = '1';
  sw2.addEventListener('click', () => {
    ED.labelMode = !ED.labelMode;
    ED.tool = ED.labelMode ? 'label' : null;
    mfBuildPanel();
    if (CTXREF) CTXREF.toast(ED.labelMode ? '标签模式：右键球面＝新建地名；右键已有标签＝改名/移动/删除' : '已关闭标签模式', 3000);
  });
  r4.appendChild(sw2);
  sec.appendChild(r4);
  sec.appendChild(mfNode('div', 'mf-note', '已有 ' + (S.map.labels || []).length + ' 个标签。若标签是「势力名」且绑定了势力，改名会同步修改势力资料。'));
  body.appendChild(sec);
}

/* 是否画过地形 */
function mfTerrainPainted() {
  if (!S.map) return false;
  const g = S.map.grid;
  for (let i = 0; i < g.terrain.length; i += 37) if (g.terrain[i]) return true;
  return false;
}
function mfMaybeShowTerrainBuild() { if (mfTerrainPainted() && _panelTab === 1) mfBuildPanel(); }

function mfNewTerrainDialog() {
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', 'mf-note', '创建一支自己的地形画笔（可指定颜色与高度语义，供一键地形建模使用）'));
  const r1 = mfNode('div', 'mf-row');
  r1.appendChild(mfNode('label', '', '地形名'));
  const iName = mfNode('input', 'mf-inp'); iName.value = '新地形';
  r1.appendChild(iName);
  wrap.appendChild(r1);
  const r2 = mfNode('div', 'mf-row');
  r2.appendChild(mfNode('label', '', '颜色'));
  const iCol = document.createElement('input');
  iCol.type = 'color'; iCol.value = '#9c8a5a';
  iCol.style.cssText = 'width:56px;height:26px;padding:0;border:1px solid var(--rule,#c9b892);border-radius:5px;background:#fff';
  r2.appendChild(iCol);
  const iKind = mfNode('select', 'mf-sel');
  [['land', '陆地地形'], ['sea', '海洋地形']].forEach((o) => {
    const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; iKind.appendChild(op);
  });
  r2.appendChild(iKind);
  wrap.appendChild(r2);
  const r3 = mfNode('div', 'mf-row');
  r3.appendChild(mfNode('label', '', '高度值'));
  const iH = mfNode('input', 'mf-inp'); iH.type = 'number'; iH.value = '200'; iH.step = '10';
  r3.appendChild(iH);
  r3.appendChild(mfNode('span', '', '米'));
  wrap.appendChild(r3);
  wrap.appendChild(mfNode('div', 'mf-note', '海洋地形请填负值（如 -800）。高度值只影响建模，不影响平面颜色。'));

  mfDialog({
    title: '自定义地形画笔', width: '360px', body: wrap,
    buttons: [{
      label: '创建', pri: true, fn: function () {
        S.map.terrains.push({
          id: uid('t'), name: iName.value.trim() || '新地形', color: iCol.value,
          h: parseFloat(iH.value) || 0, kind: iKind.value
        });
        ED.terrainIdx = S.map.terrains.length - 1;
        ED.tool = 'terrain:' + ED.terrainIdx;
        mfBuildPanel(); mfTouch();
      }
    }, { label: '取消', fn: function () { } }]
  });
}

/* ------------------------------------------------- 一键地形建模算法 ----- */
/* ① 目标高度场 → ② 距离变换（块心高、边缘收分）→ ③ 平滑 → ④ 轻度侵蚀 → ⑤ 写入 */
function mfBuildHeightField(opt, prog) {
  opt = opt || {};
  /* KiMi3：全程分片让出主线程（每 64 行一次），百万格网格也不会把页面冻到
     被浏览器判死；侵蚀循环内联邻居坐标，不再逐格分配临时数组（原来一百万格
     x 6 遍 ≈ 六百万次小数组分配，GC 风暴足以掀翻整个标签页） */
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  const note = (t) => { try { if (prog) prog(t); } catch (e) { } };
  return (async () => {
    const g = S.map.grid, w = g.w, h = g.h, n = w * h;
    const terr = S.map.terrains;
    note('读取地形高度…');
    const target = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const tv = g.terrain[i];
      if (!tv) continue;
      const t = terr[tv - 1];
      target[i] = t ? t.h : 0;
      if ((i & 0x3FFFF) === 0x3FFFF) await yieldNow();
    }
    /* ② chamfer 距离变换：到最近「非地形」格子的距离 */
    note('距离变换（1/2）…');
    const dist = new Float32Array(n);
    const D1 = 1, D2 = 1.4142;
    for (let i = 0; i < n; i++) dist[i] = g.terrain[i] ? 1e9 : 0;
    for (let y = 0; y < h; y++) {
      if ((y & 63) === 0) await yieldNow();
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = dist[i];
        if (v === 0) continue;
        const xm = x > 0 ? x - 1 : w - 1, ym = y > 0 ? y - 1 : y;
        if (x > 0) v = Math.min(v, dist[i - 1] + D1);
        if (y > 0) v = Math.min(v, dist[i - w] + D1);
        if (x > 0 && y > 0) v = Math.min(v, dist[ym * w + xm] + D2);
        if (x < w - 1 && y > 0) v = Math.min(v, dist[ym * w + x + 1] + D2);
        dist[i] = v;
      }
    }
    note('距离变换（2/2）…');
    for (let y = h - 1; y >= 0; y--) {
      if ((y & 63) === 0) await yieldNow();
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        let v = dist[i];
        if (v === 0) continue;
        const xp = x < w - 1 ? x + 1 : 0, yp = y < h - 1 ? y + 1 : y;
        if (x < w - 1) v = Math.min(v, dist[i + 1] + D1);
        if (y < h - 1) v = Math.min(v, dist[i + w] + D1);
        if (x < w - 1 && y < h - 1) v = Math.min(v, dist[yp * w + xp] + D2);
        if (x > 0 && y < h - 1) v = Math.min(v, dist[yp * w + x - 1] + D2);
        dist[i] = v;
      }
    }
    /* 收分：块内越深越高，边缘归零（与相邻地形平滑衔接） */
    note('山体收分…');
    const R = opt.ramp || 6;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (!g.terrain[i]) { out[i] = 0; continue; }
      const d = dist[i];
      let f = clamp(d / R, 0, 1);
      f = f * f * (3 - 2 * f);                       // smoothstep：边缘平缓、内部饱满
      out[i] = target[i] * f;
      if ((i & 0x3FFFF) === 0x3FFFF) await yieldNow();
    }
    /* ③ 平滑：separable box blur（经度方向环绕） */
    const passes = opt.smooth == null ? 2 : opt.smooth;
    let a = out, b = new Float32Array(n);
    for (let p = 0; p < passes; p++) {
      note('平滑（' + (p + 1) + '/' + passes + '）…');
      for (let y = 0; y < h; y++) {
        if ((y & 63) === 0) await yieldNow();
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const xm = x > 0 ? x - 1 : w - 1, xp = x < w - 1 ? x + 1 : 0;
          b[row + x] = (a[row + xm] + a[row + x] * 2 + a[row + xp]) * 0.25;
        }
      }
      for (let x = 0; x < w; x++) {
        if ((x & 63) === 0) await yieldNow();
        for (let y = 0; y < h; y++) {
          const ym = y > 0 ? y - 1 : 0, yp = y < h - 1 ? y + 1 : h - 1;
          a[y * w + x] = (b[ym * w + x] + b[y * w + x] * 2 + b[yp * w + x]) * 0.25;
        }
      }
    }
    /* ④ 轻度热侵蚀：削掉突兀的台阶（邻居坐标内联，零临时分配） */
    const iters = opt.erosion == null ? 6 : opt.erosion;
    const talus = opt.talus || 26;    // 米
    for (let k = 0; k < iters; k++) {
      note('侵蚀塑形（' + (k + 1) + '/' + iters + '）…');
      for (let y = 1; y < h - 1; y++) {
        if ((y & 63) === 0) await yieldNow();
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const i = row + x;
          const hHere = a[i];
          if (!hHere) continue;
          let maxD = 0, to = -1, d;
          d = hHere - a[i - w]; if (d > maxD) { maxD = d; to = i - w; }
          d = hHere - a[i + w]; if (d > maxD) { maxD = d; to = i + w; }
          d = hHere - a[row + (x > 0 ? x - 1 : w - 1)]; if (d > maxD) { maxD = d; to = row + (x > 0 ? x - 1 : w - 1); }
          d = hHere - a[row + (x < w - 1 ? x + 1 : 0)]; if (d > maxD) { maxD = d; to = row + (x < w - 1 ? x + 1 : 0); }
          if (to >= 0 && maxD > talus) {
            const mv = (maxD - talus) * 0.22;
            a[i] -= mv; a[to] += mv;
          }
        }
      }
    }
    return a;
  })();
}

function mfTerrainBuildDialog() {
  const wrap = mfNode('div');
  /* 说明条：加底色加大，确保一眼能看见 */
  const note = (t) => {
    const n = mfNode('div', 'mf-note', t);
    n.style.cssText = 'font-size:12.5px;color:#5c4620;background:rgba(142,107,50,.10);border:1px solid rgba(142,107,50,.25);border-radius:6px;padding:6px 9px;margin:3px 0';
    return n;
  };
  wrap.appendChild(note('根据地形画笔的「高度值」自动建模：每块地形的中心最高、向边缘逐渐降低，再把棱角磨圆，最后模拟风雨冲刷出自然的山脊。下面三个滑条分别控制这三件事的强度。'));
  const r1 = mfNode('div', 'mf-row');
  const lb1 = mfNode('label', '', '收分宽度 ？');
  lb1.title = '山体边缘过渡带的宽窄：调小，山像石柱一样陡；调大，坡像丘陵一样缓。单位是格子数';
  lb1.style.cursor = 'help';
  r1.appendChild(lb1);
  const s1 = mfNode('input', 'mf-inp'); s1.type = 'range'; s1.min = '2'; s1.max = '20'; s1.step = '1'; s1.value = '6';
  const v1 = mfNode('span', '', '6 格'); v1.style.flex = 'none';
  s1.addEventListener('input', () => { v1.textContent = s1.value + ' 格'; });
  r1.appendChild(s1); r1.appendChild(v1);
  wrap.appendChild(r1);
  wrap.appendChild(note('收分宽度＝山体边缘过渡带的宽窄：调小，山像石柱一样陡；调大，坡像丘陵一样缓。单位是格子数。'));
  const r2 = mfNode('div', 'mf-row');
  const lb2 = mfNode('label', '', '平滑 ？');
  lb2.title = '把棱角磨圆的次数：0 遍保留方块台阶感，遍数越多山越圆润';
  lb2.style.cursor = 'help';
  r2.appendChild(lb2);
  const s2 = mfNode('input', 'mf-inp'); s2.type = 'range'; s2.min = '0'; s2.max = '6'; s2.step = '1'; s2.value = '2';
  const v2 = mfNode('span', '', '2 遍'); v2.style.flex = 'none';
  s2.addEventListener('input', () => { v2.textContent = s2.value + ' 遍'; });
  r2.appendChild(s2); r2.appendChild(v2);
  wrap.appendChild(r2);
  wrap.appendChild(note('平滑＝把棱角磨圆的次数：0 遍会保留方块一样的台阶感，遍数越多山越圆润。'));
  const r3 = mfNode('div', 'mf-row');
  const lb3 = mfNode('label', '', '侵蚀 ？');
  lb3.title = '模拟风吹雨淋把尖峰磨矮的次数：越多山脊越自然，但计算越久';
  lb3.style.cursor = 'help';
  r3.appendChild(lb3);
  const s3 = mfNode('input', 'mf-inp'); s3.type = 'range'; s3.min = '0'; s3.max = '20'; s3.step = '1'; s3.value = '6';
  const v3 = mfNode('span', '', '6 遍'); v3.style.flex = 'none';
  s3.addEventListener('input', () => { v3.textContent = s3.value + ' 遍'; });
  r3.appendChild(s3); r3.appendChild(v3);
  wrap.appendChild(r3);
  wrap.appendChild(note('侵蚀＝模拟风吹雨淋把尖峰磨矮的次数：越多山脊越自然，但计算越久。'));
  wrap.appendChild(note('小提示：建模时底部会实时显示进度（距离变换→收分→平滑→侵蚀），期间可以正常拖动页面。建好后不满意，可以点「撤销」或在「地形编辑」页用「起伏」滑条整体调高调低。'));

  const d = mfDialog({
    title: '一键地形建模（不懂的词把鼠标放上去看看）', width: '430px', body: wrap,
    buttons: [{
      label: '开始建模', pri: true, fn: function () {
        d.close();
        const t0 = performance.now();
        if (CTXREF) CTXREF.toast('正在生成地形…', 1500);
        setTimeout(async () => {
          try {
            const __cells = S.map.grid.w * S.map.grid.h;
            if (__cells > 4.2e6) {
              if (CTXREF) CTXREF.toast('这张地图的网格太细（约 '
                + Math.round(__cells / 1e4) + ' 万格），一键建模带不动——请在创建地图时选粗一点的网格档位',
                4600, 'err');
              return;
            }
            const H = await mfBuildHeightField({ ramp: +s1.value, smooth: +s2.value, erosion: +s3.value },
              function (t) { mfHintText('▲ 正在建模：' + t); });
            const old = S.map.height;
            S.map.height = H;
            S.map.heightScale = S.map.heightScale == null ? 1 : S.map.heightScale;
            S.dirtyPos = true; S.dirtyColor = true;
            if (S.controls) S.controls.minDistance = 1 + 0.06 * (S.map.heightScale || 1);
            mfPushFnUndo(
              function () { S.map.height = old; S.dirtyPos = true; S.dirtyColor = true; if (S.controls) S.controls.minDistance = mfMinDist(); mfBuildPanel(); },
              function () { S.map.height = H; S.dirtyPos = true; S.dirtyColor = true; if (S.controls) S.controls.minDistance = 1 + 0.06 * (S.map.heightScale || 1); mfBuildPanel(); },
              '地形建模', true
            );
            mfBuildPanel(); mfTouch();
            mfHintForTool();
            if (CTXREF) CTXREF.toast('地形建模完成（' + Math.round(performance.now() - t0) + 'ms）', 2800, 'ok');
          } catch (e) {
            mfHintForTool();
            if (CTXREF) CTXREF.toast('建模失败：' + (e && e.message || e), 3600, 'err');
          }
        }, 30);
      }
    }, { label: '取消', fn: function () { } }]
  });
}

function mfExportHeight() {
  if (!S.map || !S.map.height) return;
  const g = S.map.grid;
  /* 导出为灰度 PNG（16 位精度压到 8 位，够用且体积小） */
  const c = document.createElement('canvas');
  c.width = g.w; c.height = g.h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(g.w, g.h);
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < S.map.height.length; i++) { const v = S.map.height[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const rg = Math.max(1, mx - mn);
  for (let i = 0; i < S.map.height.length; i++) {
    const v = Math.round((S.map.height[i] - mn) / rg * 255);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = (S.map.meta.name || 'map') + '-heightmap.png';
  document.body.appendChild(a); a.click(); a.remove();
  if (CTXREF) CTXREF.toast('已导出高度图（' + g.w + '×' + g.h + '，' + Math.round(mn) + '~' + Math.round(mx) + 'm）', 3000, 'ok');
}

/* ===================== 80_model.js ===================== */
/* ==========================================================================
 * 建模系统：独立建模场景 · 面选择/涂色/挤出/细分/对称 · 建模目录 · 地图实例
 * 建模数据 = verts(Float32 xyz) + colors(Float32 rgb) + faces(Uint32 索引)
 * ========================================================================== */

const MO = {
  open: false, scene: null, camera: null, renderer: null, controls: null, canvas: null,
  mesh: null, geo: null, mat: null, model: null, baseId: null,
  mode: 'paint', color: '#c9813f', extrude: 0.12, sym: true,
  sel: [], selKind: 'face',       // selKind: face / edge / vert
  snap: 0,                        // 网格吸附步长，0 = 关闭
  drag: null, painting: false,    // 拖动顶点 ｜ 按住连续涂色
  /* 雕塑笔刷：工具（raise拉起/push推平/smooth平滑）· 半径 · 强度 · 按住中 */
  sculptTool: 'raise', sculptR: 0.22, sculptS: 0.05, sculpting: false,
  paintR: 0, paintVert: false, selMask: false, regionDrag: null, _sculptAllow: null,
  v2l: null, adj: null, lrep: null, lcount: 0, _needNorm: false,
  dirty: false, undo: [], redo: [], dlg: null
};

function mfGeom() {
  return { verts: [], colors: [], faces: [] };
}
function mfMakeBox() {
  const g = mfGeom(), s = 0.5;
  const P = [[-s, -s, -s], [s, -s, -s], [s, -s, s], [-s, -s, s], [-s, s, -s], [s, s, -s], [s, s, s], [-s, s, s]];
  P.forEach(() => g.colors.push(0.76, 0.72, 0.62));
  P.forEach((p) => g.verts.push(p[0], p[1], p[2]));
  const F = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1],
  [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
  F.forEach((f) => g.faces.push(f[0], f[1], f[2]));
  return g;
}
function mfMakeSphere(R, NS, NR) {
  const g = mfGeom();
  R = R || 0.5; NS = Math.max(4, Math.round(NS || 16)); NR = Math.max(3, Math.round(NR || 12));
  for (let y = 0; y <= NR; y++) {
    const v = y / NR, th = v * Math.PI;
    for (let x = 0; x <= NS; x++) {
      const u = x / NS, ph = u * Math.PI * 2;
      g.verts.push(R * Math.sin(th) * Math.cos(ph), R * Math.cos(th), R * Math.sin(th) * Math.sin(ph));
      g.colors.push(0.76, 0.72, 0.62);
    }
  }
  for (let y = 0; y < NR; y++) {
    for (let x = 0; x < NS; x++) {
      const a = y * (NS + 1) + x, b = a + NS + 1;
      g.faces.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return g;
}
function mfMakeCone(R, H, NR) {
  const g = mfGeom();
  NR = Math.max(3, Math.round(NR || 24)); R = R || 0.5; H = H || 1.0;
  for (let i = 0; i < NR; i++) {
    const a = i / NR * Math.PI * 2;
    g.verts.push(R * Math.cos(a), -H / 2, R * Math.sin(a));
    g.colors.push(0.76, 0.72, 0.62);
  }
  g.verts.push(0, H / 2, 0); g.colors.push(0.76, 0.72, 0.62);
  for (let i = 0; i < NR; i++) g.faces.push(i, (i + 1) % NR, NR);
  g.verts.push(0, -H / 2, 0); g.colors.push(0.76, 0.72, 0.62);
  for (let i = 0; i < NR; i++) g.faces.push(NR + 1, (i + 1) % NR, i);
  return g;
}
function mfMakeCylinder(R, H, NR) {
  const g = mfGeom();
  NR = Math.max(3, Math.round(NR || 24)); R = R || 0.42; H = H || 0.9;
  for (let i = 0; i < NR; i++) {
    const a = i / NR * Math.PI * 2;
    g.verts.push(R * Math.cos(a), -H / 2, R * Math.sin(a)); g.colors.push(0.76, 0.72, 0.62);
  }
  for (let i = 0; i < NR; i++) {
    const a = i / NR * Math.PI * 2;
    g.verts.push(R * Math.cos(a), H / 2, R * Math.sin(a)); g.colors.push(0.76, 0.72, 0.62);
  }
  for (let i = 0; i < NR; i++) {
    const j = (i + 1) % NR;
    g.faces.push(i, j, NR + j, i, NR + j, NR + i);
  }
  g.verts.push(0, H / 2, 0); g.colors.push(0.76, 0.72, 0.62);
  g.verts.push(0, -H / 2, 0); g.colors.push(0.76, 0.72, 0.62);
  const ct = 2 * NR, cb = 2 * NR + 1;
  for (let i = 0; i < NR; i++) { const j = (i + 1) % NR; g.faces.push(NR + i, NR + j, ct); g.faces.push(cb, j, i); }
  return g;
}
/* 圆台：顶半径 RT、底半径 RB（RT=0 就退化成圆锥） */
function mfMakeFrustum(RT, RB, H, NR) {
  const g = mfGeom();
  NR = Math.max(3, Math.round(NR || 24));
  RT = RT == null ? 0.3 : RT; RB = RB == null ? 0.5 : RB; H = H || 0.8;
  for (let i = 0; i < NR; i++) {
    const a = i / NR * Math.PI * 2;
    g.verts.push(RB * Math.cos(a), -H / 2, RB * Math.sin(a)); g.colors.push(0.76, 0.72, 0.62);
  }
  for (let i = 0; i < NR; i++) {
    const a = i / NR * Math.PI * 2;
    g.verts.push(RT * Math.cos(a), H / 2, RT * Math.sin(a)); g.colors.push(0.76, 0.72, 0.62);
  }
  for (let i = 0; i < NR; i++) {
    const j = (i + 1) % NR;
    g.faces.push(i, j, NR + j, i, NR + j, NR + i);
  }
  g.verts.push(0, H / 2, 0); g.colors.push(0.76, 0.72, 0.62);
  g.verts.push(0, -H / 2, 0); g.colors.push(0.76, 0.72, 0.62);
  const ct = 2 * NR, cb = 2 * NR + 1;
  for (let i = 0; i < NR; i++) { const j = (i + 1) % NR; g.faces.push(NR + i, NR + j, ct); g.faces.push(cb, j, i); }
  return g;
}
/* 圆环：环半径 R、管半径 r */
function mfMakeTorus(R, r, NS, NT) {
  const g = mfGeom();
  R = R || 0.5; r = r || 0.16;
  NS = Math.max(6, Math.round(NS || 28)); NT = Math.max(4, Math.round(NT || 14));
  for (let j = 0; j < NS; j++) {
    const th = j / NS * Math.PI * 2;
    for (let i = 0; i < NT; i++) {
      const ph = i / NT * Math.PI * 2;
      const rr = R + r * Math.cos(ph);
      g.verts.push(rr * Math.cos(th), r * Math.sin(ph), rr * Math.sin(th));
      g.colors.push(0.76, 0.72, 0.62);
    }
  }
  for (let j = 0; j < NS; j++) {
    const j2 = (j + 1) % NS;
    for (let i = 0; i < NT; i++) {
      const i2 = (i + 1) % NT;
      const a = j * NT + i, b = j * NT + i2, c = j2 * NT + i2, d = j2 * NT + i;
      g.faces.push(a, b, c, a, c, d);
    }
  }
  return g;
}
/* 半球罩：上半球 + 底盖（做穹顶、帐顶、山包） */
function mfMakeDome(R, NS, NR) {
  const g = mfGeom();
  NS = Math.max(4, Math.round(NS || 16)); NR = Math.max(2, Math.round(NR || 8)); R = R || 0.5;
  g.verts.push(0, R, 0); g.colors.push(0.76, 0.72, 0.62);   /* 顶端点 idx 0 */
  for (let j = 1; j <= NR; j++) {
    const ph = j / NR * Math.PI / 2;
    for (let i = 0; i < NS; i++) {
      const th = i / NS * Math.PI * 2;
      g.verts.push(R * Math.sin(ph) * Math.cos(th), R * Math.cos(ph), R * Math.sin(ph) * Math.sin(th));
      g.colors.push(0.76, 0.72, 0.62);
    }
  }
  for (let i = 0; i < NS; i++) g.faces.push(0, 1 + (i + 1) % NS, 1 + i);   /* 顶扇 */
  for (let j = 0; j < NR - 1; j++) {
    const ra = 1 + j * NS, rb = 1 + (j + 1) * NS;
    for (let i = 0; i < NS; i++) {
      const i2 = (i + 1) % NS;
      g.faces.push(ra + i, rb + i2, rb + i, ra + i, ra + i2, rb + i2);
    }
  }
  const cb = 1 + NR * NS;
  g.verts.push(0, 0, 0); g.colors.push(0.76, 0.72, 0.62);
  const last = 1 + (NR - 1) * NS;
  for (let i = 0; i < NS; i++) g.faces.push(cb, last + i, last + (i + 1) % NS);
  return g;
}
function mfMakePlane(w, d) {
  const g = mfGeom(), s = (w || 1) / 2, s2 = ((d || w) || 1) / 2;
  [[-s, 0, -s2], [s, 0, -s2], [s, 0, s2], [-s, 0, s2]].forEach((p) => { g.verts.push(p[0], p[1], p[2]); g.colors.push(0.76, 0.72, 0.62); });
  g.faces.push(0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2);
  return g;
}

/* ===================== 内置通用建模库（40 件 · 程序化生成） ================
 * 15 种地形 ×2~3 + 城镇 ×6。全部用基础件（盒/柱/球）拼成，数据格式与手工建模
 * 完全一致 → 可直接进建模系统编辑。实例经 'builtin:' 前缀引用，不占地图包体积；
 * 编辑内置件时自动分叉成「我的建模」，公共库原件永不被改。 */

/* 单位盒顶点表（±0.5） */
const MF_P_BOX = {
  vs: [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5],
  fs: [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]
};
/* 圆台/圆柱（rt=顶半径，rb=底半径，高 1，半径值直接烘进顶点） */
function mfPrimCyl(rt, rb, seg) {
  const vs = [], fs = [];
  for (let i = 0; i < seg; i++) {
    const a = i / seg * Math.PI * 2;
    vs.push(Math.cos(a) * rt, 0.5, Math.sin(a) * rt);
  }
  for (let i = 0; i < seg; i++) {
    const a = i / seg * Math.PI * 2;
    vs.push(Math.cos(a) * rb, -0.5, Math.sin(a) * rb);
  }
  vs.push(0, 0.5, 0, 0, -0.5, 0);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    fs.push(i, 2 * seg, j);
    fs.push(seg + j, 2 * seg + 1, seg + i);
    fs.push(i, seg + i, seg + j, i, seg + j, j);
  }
  return { vs: vs, fs: fs };
}
/* 低模球（半径 1） */
function mfPrimSph(ns, nr) {
  const vs = [], fs = [];
  for (let y = 0; y <= nr; y++) {
    const th = y / nr * Math.PI;
    for (let x = 0; x <= ns; x++) {
      const ph = x / ns * Math.PI * 2;
      vs.push(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    }
  }
  for (let y = 0; y < nr; y++) {
    for (let x = 0; x < ns; x++) {
      const a = y * (ns + 1) + x, b = a + ns + 1;
      fs.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { vs: vs, fs: fs };
}
/* 变换核心：缩放 → 绕Y转 → 平移，附纯色 */
function mfPAdd(g, vs, fs, c, x, y, z, sx, sy, sz, ry) {
  const base = g.verts.length / 3;
  const cs = Math.cos(ry || 0), sn = Math.sin(ry || 0);
  for (let i = 0; i < vs.length; i += 3) {
    const px = vs[i] * (sx || 1), py = vs[i + 1] * (sy || 1), pz = vs[i + 2] * (sz || 1);
    g.verts.push(px * cs + pz * sn + (x || 0), py + (y || 0), -px * sn + pz * cs + (z || 0));
    g.colors.push(c[0], c[1], c[2]);
  }
  for (let i = 0; i < fs.length; i++) g.faces.push(fs[i] + base);
}
function mfPBox(g, sx, sy, sz, x, y, z, c, ry) { mfPAdd(g, MF_P_BOX.vs, MF_P_BOX.fs, c, x, y, z, sx, sy, sz, ry); }
function mfPCyl(g, rt, rb, h, x, y, z, c, seg, ry) { const p = mfPrimCyl(rt, rb, seg || 8); mfPAdd(g, p.vs, p.fs, c, x, y, z, 1, h, 1, ry); }
function mfPSph(g, r, x, y, z, c, sx, sy, sz) { const p = mfPrimSph(8, 5); mfPAdd(g, p.vs, p.fs, c, x, y, z, r * (sx || 1), r * (sy || 1), r * (sz || 1)); }
function mfCol(hex) { const v = hexToRgb(hex); return [v[0] / 255, v[1] / 255, v[2] / 255]; }
/* 小房子：方墙 + 四棱锥屋顶（seg=4 的圆台转 45° 与墙对齐） */
function mfPHouse(g, x, z, w, h, d, wall, roof, ry) {
  mfPBox(g, w, h, d, x, h / 2, z, wall, ry);
  mfPCyl(g, 0.02, Math.max(w, d) * 0.74, h * 0.55, x, h + h * 0.27, z, roof, 4, (ry || 0) + Math.PI / 4);
}
/* 针叶树 / 阔叶树 */
function mfPTree(g, x, z, s, trunk, leaf) {
  mfPCyl(g, 0.03 * s, 0.05 * s, 0.32 * s, x, 0.16 * s, z, trunk, 6);
  mfPCyl(g, 0.02 * s, 0.26 * s, 0.5 * s, x, 0.5 * s, z, leaf, 8);
  mfPCyl(g, 0.015 * s, 0.17 * s, 0.36 * s, x, 0.82 * s, z, leaf, 8);
}
function mfPTree2(g, x, z, s, trunk, leaf) {
  mfPCyl(g, 0.035 * s, 0.055 * s, 0.34 * s, x, 0.17 * s, z, trunk, 6);
  mfPSph(g, 0.3 * s, x, 0.56 * s, z, leaf);
}
/* 塔楼（城市积木） */
function mfPTower(g, x, z, w, h, wall, roof) {
  mfPBox(g, w, h, w, x, h / 2, z, wall);
  mfPCyl(g, 0.02, w * 0.62, h * 0.18, x, h + h * 0.09, z, roof, 4, Math.PI / 4);
  mfPBox(g, w * 0.2, h * 0.12, 0.02, x, h * 0.55, z + w / 2 + 0.005, mfCol('#3a4a66'));
}

const MF_BUILTINS = [
  /* ---- 平原 ---- */
  {
    id: 't_plain_1', name: '平原·草丘群', cat: 'terrain:平原', make: () => {
      const g = mfGeom(), c = mfCol('#8fae66');
      mfPSph(g, 0.34, -0.25, 0, -0.1, c, 1, 0.32, 1);
      mfPSph(g, 0.28, 0.22, 0, 0.18, mfCol('#9ab872'), 1, 0.3, 1);
      mfPSph(g, 0.2, 0.05, 0, -0.3, c, 1, 0.35, 1);
      return g;
    }
  },
  {
    id: 't_plain_2', name: '平原·农田块', cat: 'terrain:平原', make: () => {
      const g = mfGeom();
      mfPBox(g, 0.5, 0.05, 0.34, -0.18, 0.025, 0, mfCol('#c9b45a'));
      mfPBox(g, 0.5, 0.05, 0.34, 0.34, 0.025, 0, mfCol('#a8c47a'));
      mfPBox(g, 0.04, 0.09, 0.72, 0.08, 0.045, 0, mfCol('#8a6a45'));
      return g;
    }
  },
  /* ---- 草原 ---- */
  {
    id: 't_grass_1', name: '草原·草丛', cat: 'terrain:草原', make: () => {
      const g = mfGeom(), c = mfCol('#7ba05b'), c2 = mfCol('#8fae66');
      mfPCyl(g, 0.01, 0.09, 0.22, -0.25, 0.11, -0.12, c, 6);
      mfPCyl(g, 0.01, 0.11, 0.3, 0.1, 0.15, 0.05, c2, 6);
      mfPCyl(g, 0.01, 0.08, 0.2, 0.3, 0.1, -0.2, c, 6);
      mfPCyl(g, 0.01, 0.09, 0.26, -0.05, 0.13, 0.28, c2, 6);
      mfPCyl(g, 0.01, 0.07, 0.18, -0.35, 0.09, 0.22, c, 6);
      return g;
    }
  },
  {
    id: 't_grass_2', name: '草原·灌木丛', cat: 'terrain:草原', make: () => {
      const g = mfGeom();
      mfPSph(g, 0.24, -0.18, 0.14, 0.05, mfCol('#6f8a4f'), 1, 0.8, 1);
      mfPSph(g, 0.19, 0.22, 0.11, -0.15, mfCol('#7ba05b'), 1, 0.8, 1);
      return g;
    }
  },
  /* ---- 森林 ---- */
  {
    id: 't_forest_1', name: '森林·针叶林', cat: 'terrain:森林', make: () => {
      const g = mfGeom(), t = mfCol('#5a4a3a'), l = mfCol('#3f6338');
      mfPTree(g, -0.28, -0.1, 1, t, l);
      mfPTree(g, 0.22, 0.18, 0.85, t, mfCol('#466e3e'));
      mfPTree(g, 0.02, -0.32, 0.7, t, l);
      return g;
    }
  },
  {
    id: 't_forest_2', name: '森林·阔叶林', cat: 'terrain:森林', make: () => {
      const g = mfGeom(), t = mfCol('#6a5238');
      mfPTree2(g, -0.22, 0.1, 1, t, mfCol('#4f7a45'));
      mfPTree2(g, 0.28, -0.15, 0.8, t, mfCol('#5a854c'));
      return g;
    }
  },
  /* ---- 丘陵 ---- */
  {
    id: 't_hill_1', name: '丘陵·碎石丘', cat: 'terrain:丘陵', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.06, 0.3, 0.26, -0.22, 0.13, 0.05, mfCol('#8a7a5a'), 7);
      mfPCyl(g, 0.04, 0.22, 0.2, 0.2, 0.1, -0.15, mfCol('#9c8a5a'), 6);
      mfPCyl(g, 0.03, 0.14, 0.13, 0.05, 0.065, 0.28, mfCol('#7a6c4e'), 6);
      return g;
    }
  },
  {
    id: 't_hill_2', name: '丘陵·草坡', cat: 'terrain:丘陵', make: () => {
      const g = mfGeom();
      mfPSph(g, 0.4, -0.15, 0, 0.05, mfCol('#8f9a5f'), 1, 0.38, 1);
      mfPSph(g, 0.3, 0.3, 0, -0.2, mfCol('#9c8a5a'), 1, 0.32, 1);
      return g;
    }
  },
  /* ---- 山地 ---- */
  {
    id: 't_mount_1', name: '山地·尖峰岩', cat: 'terrain:山地', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.02, 0.32, 0.85, -0.15, 0.42, 0, mfCol('#7a6248'), 7);
      mfPCyl(g, 0.02, 0.24, 0.6, 0.25, 0.3, -0.2, mfCol('#8a6a45'), 6);
      return g;
    }
  },
  {
    id: 't_mount_2', name: '山地·台地', cat: 'terrain:山地', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.34, 0.42, 0.4, -0.1, 0.2, 0.05, mfCol('#8a6a45'), 8);
      mfPCyl(g, 0.22, 0.28, 0.25, 0.25, 0.125, -0.25, mfCol('#93714c'), 7);
      return g;
    }
  },
  /* ---- 高山 ---- */
  {
    id: 't_alpine_1', name: '高山·雪脊峰', cat: 'terrain:高山', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.02, 0.4, 1.1, -0.1, 0.55, 0, mfCol('#6f5a48'), 7);
      mfPCyl(g, 0.015, 0.14, 0.34, -0.1, 0.95, 0, mfCol('#e8eef2'), 7);
      mfPCyl(g, 0.02, 0.28, 0.7, 0.35, 0.35, -0.25, mfCol('#65503f'), 6);
      return g;
    }
  },
  {
    id: 't_alpine_2', name: '高山·冰川舌', cat: 'terrain:高山', make: () => {
      const g = mfGeom();
      mfPSph(g, 0.45, -0.05, 0.02, 0, mfCol('#cfe0e8'), 1, 0.22, 0.7);
      mfPSph(g, 0.3, 0.3, 0.02, 0.25, mfCol('#e8eef2'), 1, 0.2, 0.8);
      return g;
    }
  },
  /* ---- 雪峰 ---- */
  {
    id: 't_peak_1', name: '雪峰·冰峰', cat: 'terrain:雪峰', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.02, 0.36, 1.0, -0.1, 0.5, 0, mfCol('#e8eef2'), 7);
      mfPCyl(g, 0.02, 0.24, 0.62, 0.3, 0.31, -0.22, mfCol('#dfe8ee'), 6);
      return g;
    }
  },
  {
    id: 't_peak_2', name: '雪峰·雪檐', cat: 'terrain:雪峰', make: () => {
      const g = mfGeom();
      mfPSph(g, 0.42, -0.15, 0.05, 0, mfCol('#eef4f8'), 1, 0.25, 0.8);
      mfPSph(g, 0.3, 0.3, 0.04, -0.2, mfCol('#e2ecf2'), 1, 0.22, 0.9);
      return g;
    }
  },
  /* ---- 沙漠 ---- */
  {
    id: 't_desert_1', name: '沙漠·沙丘', cat: 'terrain:沙漠', make: () => {
      const g = mfGeom();
      mfPSph(g, 0.45, -0.2, 0, 0.05, mfCol('#d9bd7a'), 1, 0.25, 0.7);
      mfPSph(g, 0.35, 0.3, 0, -0.2, mfCol('#e0c78a'), 1, 0.22, 0.8);
      return g;
    }
  },
  {
    id: 't_desert_2', name: '沙漠·枯树', cat: 'terrain:沙漠', make: () => {
      const g = mfGeom(), c = mfCol('#8a6f4f');
      mfPCyl(g, 0.03, 0.05, 0.4, 0, 0.2, 0, c, 6);
      mfPBox(g, 0.3, 0.04, 0.05, 0.14, 0.34, 0, c, 0.5);
      mfPBox(g, 0.22, 0.035, 0.05, -0.12, 0.42, 0.05, c, -0.7);
      return g;
    }
  },
  /* ---- 沼泽 ---- */
  {
    id: 't_swamp_1', name: '沼泽·芦苇丛', cat: 'terrain:沼泽', make: () => {
      const g = mfGeom(), c = mfCol('#7f9a6a'), c2 = mfCol('#6f8a72');
      [[-0.25, -0.1, 0.4], [-0.1, 0.15, 0.5], [0.08, -0.05, 0.44], [0.22, 0.2, 0.36], [0.3, -0.18, 0.42], [-0.32, 0.25, 0.34]].forEach((p, i) => {
        mfPCyl(g, 0.012, 0.018, p[2], p[0], p[2] / 2, p[1], i % 2 ? c : c2, 5);
      });
      return g;
    }
  },
  {
    id: 't_swamp_2', name: '沼泽·枯木', cat: 'terrain:沼泽', make: () => {
      const g = mfGeom(), c = mfCol('#5f5244');
      mfPBox(g, 0.55, 0.09, 0.11, 0, 0.12, 0, c, 0.4);
      mfPCyl(g, 0.035, 0.05, 0.26, -0.2, 0.13, 0.12, c, 6);
      return g;
    }
  },
  /* ---- 湖泊 ---- */
  {
    id: 't_lake_1', name: '湖泊·荷叶群', cat: 'terrain:湖泊', make: () => {
      const g = mfGeom(), c = mfCol('#4f7a45');
      mfPCyl(g, 0.14, 0.14, 0.02, -0.2, 0.01, 0.05, c, 8);
      mfPCyl(g, 0.1, 0.1, 0.02, 0.15, 0.01, -0.12, mfCol('#5a854c'), 8);
      mfPCyl(g, 0.08, 0.08, 0.02, 0.05, 0.01, 0.22, c, 8);
      mfPSph(g, 0.06, 0.15, 0.05, -0.12, mfCol('#e0a0b8'), 1, 0.7, 1);
      return g;
    }
  },
  {
    id: 't_lake_2', name: '湖泊·湖心岛', cat: 'terrain:湖泊', make: () => {
      const g = mfGeom();
      mfPSph(g, 0.32, 0, 0, 0, mfCol('#d9c48a'), 1, 0.22, 1);
      mfPTree2(g, 0.05, -0.05, 0.7, mfCol('#6a5238'), mfCol('#4f7a45'));
      return g;
    }
  },
  /* ---- 浅海 ---- */
  {
    id: 't_shallow_1', name: '浅海·珊瑚丛', cat: 'terrain:浅海', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.03, 0.09, 0.22, -0.18, 0.11, 0.05, mfCol('#e08a6a'), 6);
      mfPCyl(g, 0.025, 0.07, 0.17, 0.1, 0.085, -0.1, mfCol('#d97a9a'), 6);
      mfPCyl(g, 0.02, 0.06, 0.13, 0.02, 0.065, 0.18, mfCol('#e0a05a'), 5);
      return g;
    }
  },
  {
    id: 't_shallow_2', name: '浅海·礁岩', cat: 'terrain:浅海', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.04, 0.2, 0.3, -0.15, 0.15, 0, mfCol('#7a8a92'), 7);
      mfPCyl(g, 0.03, 0.15, 0.22, 0.2, 0.11, -0.15, mfCol('#6a7a84'), 6);
      return g;
    }
  },
  /* ---- 海洋 ---- */
  {
    id: 't_sea_1', name: '海洋·浪脊', cat: 'terrain:海洋', make: () => {
      const g = mfGeom(), c = mfCol('#cfe4f0');
      mfPBox(g, 0.5, 0.04, 0.08, -0.1, 0.02, -0.15, c, 0.15);
      mfPBox(g, 0.42, 0.035, 0.07, 0.15, 0.018, 0.05, mfCol('#dfeef6'), -0.1);
      mfPBox(g, 0.34, 0.03, 0.06, -0.05, 0.015, 0.25, c, 0.2);
      return g;
    }
  },
  {
    id: 't_sea_2', name: '海洋·浮冰', cat: 'terrain:海洋', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.26, 0.3, 0.08, -0.15, 0.02, 0, mfCol('#e8f0f4'), 7);
      mfPCyl(g, 0.16, 0.19, 0.07, 0.25, 0.018, 0.18, mfCol('#dfeaf0'), 6);
      return g;
    }
  },
  /* ---- 深海 ---- */
  {
    id: 't_deep_1', name: '深海·暗礁', cat: 'terrain:深海', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.03, 0.22, 0.34, -0.12, 0.17, 0.05, mfCol('#2f4a66'), 7);
      mfPCyl(g, 0.02, 0.16, 0.26, 0.2, 0.13, -0.15, mfCol('#26405a'), 6);
      return g;
    }
  },
  {
    id: 't_deep_2', name: '深海·热泉烟囱', cat: 'terrain:深海', make: () => {
      const g = mfGeom(), c = mfCol('#3a3a42');
      mfPCyl(g, 0.05, 0.1, 0.4, -0.15, 0.2, 0.05, c, 6);
      mfPCyl(g, 0.04, 0.08, 0.3, 0.1, 0.15, -0.12, mfCol('#46464e'), 6);
      mfPCyl(g, 0.035, 0.06, 0.22, 0.25, 0.11, 0.15, c, 5);
      return g;
    }
  },
  /* ---- 海沟 ---- */
  {
    id: 't_trench_1', name: '海沟·沟壁岩', cat: 'terrain:海沟', make: () => {
      const g = mfGeom();
      mfPBox(g, 0.5, 0.5, 0.14, -0.2, 0.25, 0, mfCol('#1d3a5c'), 0.2);
      mfPBox(g, 0.4, 0.38, 0.12, 0.25, 0.19, -0.12, mfCol('#24344e'), -0.15);
      return g;
    }
  },
  {
    id: 't_trench_2', name: '海沟·深渊烟囱', cat: 'terrain:海沟', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.05, 0.12, 0.55, -0.1, 0.275, 0, mfCol('#2a2a32'), 6);
      mfPCyl(g, 0.04, 0.09, 0.4, 0.2, 0.2, -0.15, mfCol('#34343c'), 6);
      return g;
    }
  },
  /* ---- 珊瑚礁 ---- */
  {
    id: 't_reef_1', name: '珊瑚礁·脑珊瑚', cat: 'terrain:珊瑚礁', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.2, 0.24, 0.1, -0.1, 0.05, 0, mfCol('#b87a4a'), 8);
      mfPSph(g, 0.22, -0.1, 0.12, 0, mfCol('#e0a05a'), 1, 0.75, 1);
      mfPSph(g, 0.14, 0.2, 0.08, -0.15, mfCol('#d9934f'), 1, 0.7, 1);
      return g;
    }
  },
  {
    id: 't_reef_2', name: '珊瑚礁·鹿角珊瑚', cat: 'terrain:珊瑚礁', make: () => {
      const g = mfGeom(), c = mfCol('#e08a8a'), c2 = mfCol('#d97a7a');
      mfPCyl(g, 0.03, 0.05, 0.26, -0.12, 0.13, 0, c, 5);
      mfPCyl(g, 0.02, 0.04, 0.2, -0.02, 0.24, 0.02, c, 5);
      mfPCyl(g, 0.025, 0.045, 0.22, 0.14, 0.11, -0.1, c2, 5);
      mfPCyl(g, 0.018, 0.035, 0.16, 0.22, 0.2, -0.06, c2, 5);
      return g;
    }
  },
  /* ---- 城镇 ×3 ---- */
  {
    id: 'town1', name: '村落·茅屋群', cat: 'town', make: () => {
      const g = mfGeom();
      mfPHouse(g, -0.28, -0.08, 0.3, 0.22, 0.26, mfCol('#c9b089'), mfCol('#8a6a45'), 0.2);
      mfPHouse(g, 0.24, 0.14, 0.26, 0.2, 0.24, mfCol('#cbb28f'), mfCol('#7d5f3f'), -0.3);
      mfPHouse(g, 0.02, -0.34, 0.24, 0.18, 0.22, mfCol('#c4ad88'), mfCol('#93714c'), 0.1);
      mfPCyl(g, 0.08, 0.09, 0.1, 0.02, 0.05, 0.28, mfCol('#9a9a94'), 7);   /* 水井 */
      mfPCyl(g, 0.02, 0.12, 0.14, 0.34, 0.07, -0.24, mfCol('#c9b45a'), 7); /* 干草垛 */
      mfPTree(g, -0.4, 0.24, 0.6, mfCol('#6b4a30'), mfCol('#4f7a45'));     /* 村口小树 */
      return g;
    }
  },
  {
    id: 'town2', name: '城镇·坡顶街', cat: 'town', make: () => {
      const g = mfGeom();
      mfPHouse(g, -0.3, -0.1, 0.3, 0.3, 0.26, mfCol('#d0b894'), mfCol('#8a5a3f'), 0.1);
      mfPHouse(g, 0.12, -0.24, 0.28, 0.34, 0.26, mfCol('#d6c09c'), mfCol('#7d4f38'), -0.15);
      mfPHouse(g, 0.3, 0.16, 0.26, 0.26, 0.24, mfCol('#c9b089'), mfCol('#8a6a45'), 0.35);
      mfPHouse(g, -0.12, 0.24, 0.26, 0.28, 0.24, mfCol('#cbb28f'), mfCol('#93714c'), -0.05);
      mfPCyl(g, 0.02, 0.02, 0.3, -0.28, 0.45, -0.08, mfCol('#5a4a3a'), 5); /* 烟囱 */
      mfPCyl(g, 0.02, 0.02, 0.26, 0.2, 0.4, 0.18, mfCol('#5a4a3a'), 5);    /* 烟囱② */
      mfPBox(g, 0.34, 0.02, 0.3, 0, 0.01, 0, mfCol('#a8a094'));            /* 石板广场 */
      mfPTree2(g, 0.42, -0.3, 0.7, mfCol('#6b4a30'), mfCol('#5c8a4f'));    /* 街口阔叶树 */
      return g;
    }
  },
  {
    id: 'town3', name: '城市·塔楼群', cat: 'town', make: () => {
      const g = mfGeom();
      mfPTower(g, -0.24, -0.12, 0.22, 0.7, mfCol('#b8c4d0'), mfCol('#5a6a8a'));
      mfPTower(g, 0.14, -0.2, 0.2, 0.55, mfCol('#c4ccd4'), mfCol('#4f5f7d'));
      mfPTower(g, 0.05, 0.22, 0.24, 0.85, mfCol('#aebccb'), mfCol('#66759a'));
      mfPTower(g, -0.3, 0.24, 0.18, 0.5, mfCol('#c0c9d4'), mfCol('#5a6a8a'));
      mfPCyl(g, 0.008, 0.008, 0.18, 0.05, 0.99, 0.22, mfCol('#8a94a0'), 5); /* 主塔天线 */
      mfPBox(g, 0.8, 0.03, 0.8, 0, 0.015, 0, mfCol('#9a9488'));            /* 广场地面 */
      mfPTree2(g, 0.32, 0.3, 0.55, mfCol('#6b4a30'), mfCol('#5c8a4f'));    /* 广场绿化 */
      mfPTree2(g, -0.34, -0.32, 0.5, mfCol('#6b4a30'), mfCol('#5c8a4f'));
      return g;
    }
  },
  /* ---- 聚落扩充 ×3 ---- */
  {
    id: 'town4', name: '小镇·广场集市', cat: 'town', make: () => {
      const g = mfGeom();
      mfPHouse(g, -0.32, -0.3, 0.26, 0.24, 0.24, mfCol('#d0b894'), mfCol('#8a5a3f'), 0.1);
      mfPHouse(g, 0.32, -0.3, 0.26, 0.22, 0.24, mfCol('#c9b089'), mfCol('#7d5f3f'), -0.1);
      mfPHouse(g, -0.32, 0.3, 0.26, 0.26, 0.24, mfCol('#cbb28f'), mfCol('#93714c'), -0.2);
      mfPHouse(g, 0.32, 0.3, 0.26, 0.2, 0.24, mfCol('#d6c09c'), mfCol('#8a6a45'), 0.25);
      /* 两个集市摊棚：台面 + 条纹棚顶 */
      mfPBox(g, 0.16, 0.1, 0.12, -0.08, 0.05, 0.02, mfCol('#9a7a55'));
      mfPCyl(g, 0.02, 0.13, 0.1, -0.08, 0.15, 0.02, mfCol('#c95a4a'), 4, Math.PI / 4);
      mfPBox(g, 0.16, 0.1, 0.12, 0.1, 0.05, -0.04, mfCol('#9a7a55'));
      mfPCyl(g, 0.02, 0.13, 0.1, 0.1, 0.15, -0.04, mfCol('#4a7ac9'), 4, Math.PI / 4);
      mfPCyl(g, 0.07, 0.08, 0.09, 0, 0.045, 0.3, mfCol('#9a9a94'), 7);      /* 井 */
      return g;
    }
  },
  {
    id: 'town5', name: '城堡·要塞', cat: 'town', make: () => {
      const g = mfGeom(), stone = mfCol('#a8a49a'), roof = mfCol('#7d4f38');
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * 0.34, z = Math.sin(a) * 0.34;
        mfPCyl(g, 0.08, 0.09, 0.5, x, 0.25, z, stone, 10);
        mfPCyl(g, 0.02, 0.12, 0.16, x, 0.58, z, roof, 10);
      }
      mfPBox(g, 0.52, 0.28, 0.07, 0, 0.14, 0.3, stone);
      mfPBox(g, 0.52, 0.28, 0.07, 0, 0.14, -0.3, stone);
      mfPBox(g, 0.07, 0.28, 0.52, 0.3, 0.14, 0, stone);
      mfPBox(g, 0.07, 0.28, 0.52, -0.3, 0.14, 0, stone);
      mfPBox(g, 0.26, 0.36, 0.24, 0, 0.18, 0, mfCol('#b0aca0'));            /* 主楼 */
      mfPCyl(g, 0.02, 0.22, 0.16, 0, 0.44, 0, roof, 4, Math.PI / 4);        /* 主楼尖顶 */
      return g;
    }
  },
  {
    id: 'town6', name: '都市·高楼群', cat: 'town', make: () => {
      const g = mfGeom(), glass = mfCol('#7fb2d6');
      /* 三座收分高楼 */
      const towers = [[-0.26, -0.14, 0.9, mfCol('#b8c4d0')], [0.14, 0.1, 1.1, mfCol('#aebccb')], [0.3, -0.24, 0.7, mfCol('#c4ccd4')]];
      towers.forEach((t) => {
        const x = t[0], z = t[1], h = t[2], c = t[3];
        mfPBox(g, 0.2, h, 0.2, x, h / 2, z, c);
        mfPBox(g, 0.15, h * 0.3, 0.15, x, h + h * 0.15, z, c);
        mfPBox(g, 0.16, 0.05, 0.012, x, h * 0.5, z + 0.1, glass);           /* 窗带 */
        mfPBox(g, 0.16, 0.05, 0.012, x, h * 0.75, z + 0.1, glass);
      });
      mfPCyl(g, 0.008, 0.008, 0.2, 0.14, 1.1 + 0.33 + 0.1, 0.1, mfCol('#8a94a0'), 5); /* 天线 */
      mfPHouse(g, -0.05, 0.34, 0.2, 0.16, 0.18, mfCol('#d0b894'), mfCol('#8a5a3f'), 0.1);
      mfPHouse(g, -0.38, 0.3, 0.18, 0.14, 0.16, mfCol('#c9b089'), mfCol('#7d5f3f'), -0.15);
      mfPBox(g, 0.85, 0.025, 0.85, 0, 0.012, 0, mfCol('#9a9488'));          /* 地面 */
      return g;
    }
  },
  /* ---- 地形第三变体 ×4 ---- */
  {
    id: 't_hill_3', name: '丘陵·巨石阵', cat: 'terrain:丘陵', make: () => {
      const g = mfGeom(), c = mfCol('#8a8478');
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2;
        mfPBox(g, 0.07, 0.3 - k * 0.02, 0.05, Math.cos(a) * 0.24, (0.3 - k * 0.02) / 2, Math.sin(a) * 0.24, c, a);
      }
      mfPSph(g, 0.1, 0, 0.04, 0, mfCol('#9a948a'), 1, 0.5, 1);
      return g;
    }
  },
  {
    id: 't_forest_3', name: '森林·巨杉', cat: 'terrain:森林', make: () => {
      const g = mfGeom();
      mfPTree(g, 0, 0, 1.5, mfCol('#5f4128'), mfCol('#3d6a38'));
      mfPTree(g, 0.4, 0.22, 0.7, mfCol('#6b4a30'), mfCol('#4f7a45'));
      mfPTree(g, -0.38, 0.26, 0.6, mfCol('#6b4a30'), mfCol('#4f7a45'));
      return g;
    }
  },
  {
    id: 't_desert_3', name: '沙漠·绿洲', cat: 'terrain:沙漠', make: () => {
      const g = mfGeom();
      mfPCyl(g, 0.3, 0.34, 0.04, 0, 0.02, 0, mfCol('#d9bd7a'), 14);        /* 沙地 */
      mfPCyl(g, 0.18, 0.2, 0.05, -0.05, 0.03, 0.02, mfCol('#4d9ab0'), 12); /* 水潭 */
      /* 两棵棕榈：斜不了就矮壮些，叶冠压扁 */
      mfPCyl(g, 0.03, 0.045, 0.34, 0.2, 0.17, -0.12, mfCol('#8a6a45'), 6);
      mfPSph(g, 0.16, 0.2, 0.38, -0.12, mfCol('#3f7a3a'), 1.4, 0.35, 1.4);
      mfPCyl(g, 0.025, 0.04, 0.28, -0.3, 0.14, 0.18, mfCol('#8a6a45'), 6);
      mfPSph(g, 0.13, -0.3, 0.31, 0.18, mfCol('#478a42'), 1.4, 0.35, 1.4);
      return g;
    }
  },
  {
    id: 't_reef_3', name: '珊瑚礁·管珊瑚群', cat: 'terrain:珊瑚礁', make: () => {
      const g = mfGeom();
      const cs = [mfCol('#e88a8a'), mfCol('#e8a06a'), mfCol('#d67ab0')];
      const xy = [[0, 0, 0.3], [0.14, 0.1, 0.22], [-0.12, 0.12, 0.26], [0.08, -0.14, 0.18], [-0.14, -0.08, 0.2], [0.02, 0.2, 0.16]];
      for (let k = 0; k < xy.length; k++) {
        mfPCyl(g, 0.025, 0.04, xy[k][2], xy[k][0], xy[k][2] / 2, xy[k][1], cs[k % 3], 6);
      }
      return g;
    }
  }
];
const MF_BUILTIN_CACHE = {};
/* 取内置件（带缓存；返回的对象是共享只读原件，要改请先 mfModelClone） */
function mfBuiltinModel(bid) {
  if (MF_BUILTIN_CACHE[bid]) return MF_BUILTIN_CACHE[bid];
  for (let i = 0; i < MF_BUILTINS.length; i++) {
    if (MF_BUILTINS[i].id !== bid) continue;
    const d = MF_BUILTINS[i];
    const m = mfGeomToModel(d.make(), d.name);
    m.id = 'builtin:' + bid;
    m.cat = d.cat;
    m.builtin = true;
    MF_BUILTIN_CACHE[bid] = m;
    return m;
  }
  return null;
}
/* 统一建模查询：先查内置引用，再查当前时代目录 */
function mfModelById(mid) {
  if (!mid) return null;
  if (mid.indexOf('builtin:') === 0) return mfBuiltinModel(mid.slice(8));
  const arr = (S.map && S.map.models) || [];
  for (let i = 0; i < arr.length; i++) if (arr[i].id === mid) return arr[i];
  return null;
}
/* 分类归组：town / water / terrain / user（筛选条与「同类替换」共用这套口径） */
function mfCatGroup(cat) {
  if (!cat) return 'user';
  if (cat === 'town' || cat === 'water') return cat;
  if (cat.indexOf('terrain:') === 0) return 'terrain';
  if (cat === 'prim' || cat === 'build' || cat === 'craft' || cat === 'wild') return cat;
  return 'user';
}

/* 索引几何 → 每面独立三顶点（非索引化）。
 * 为什么必须做：顶点跨面共享时，给一个面涂色会把颜色渗进相邻面（串色）；
 * 展开后每个面独占自己的三个顶点，涂色严格限定在面内。
 * 顶点拖动不受影响——mfSamePosVerts 本来就按坐标把重合顶点整组联动。 */
function mfModelUnshare(m) {
  const nf = (m.faces ? m.faces.length : 0) / 3;
  if (!nf || !m.verts || !m.verts.length) return m;
  const v = new Float32Array(nf * 9), c = new Float32Array(nf * 9), f = new Uint32Array(nf * 3);
  for (let i = 0; i < nf; i++) {
    for (let k = 0; k < 3; k++) {
      const vi = m.faces[i * 3 + k], ni = i * 3 + k;
      v[ni * 3] = m.verts[vi * 3]; v[ni * 3 + 1] = m.verts[vi * 3 + 1]; v[ni * 3 + 2] = m.verts[vi * 3 + 2];
      c[ni * 3] = m.colors[vi * 3]; c[ni * 3 + 1] = m.colors[vi * 3 + 1]; c[ni * 3 + 2] = m.colors[vi * 3 + 2];
      f[ni] = ni;
    }
  }
  m.verts = v; m.colors = c; m.faces = f;
  return m;
}

function mfGeomToModel(g, name) {
  const m = {
    id: uid('md'), name: name || '未命名建模',
    verts: new Float32Array(g.verts), colors: new Float32Array(g.colors), faces: new Uint32Array(g.faces),
    thumb: ''
  };
  return mfModelUnshare(m);
}
function mfModelClone(m, name) {
  const c = {
    id: uid('md'), name: name || (m.name + ' 副本'),
    verts: new Float32Array(m.verts), colors: new Float32Array(m.colors), faces: new Uint32Array(m.faces),
    thumb: ''
  };
  if (m.cat) c.cat = m.cat;
  if (m.groups && m.groups.length) c.groups = JSON.parse(JSON.stringify(m.groups));
  if (m.anims && m.anims.length) {
    c.anims = m.anims.map((a) => ({ name: a.name, dur: a.dur || 2, frames: (a.frames || []).map((f) => new Float32Array(f)) }));
  }
  return mfModelUnshare(c);
}

/* --------------------------------------------------------- 建模窗口 ------ */
/* 建模目录：左键 → 独立的小预览窗，模型缓慢自转，可拖动查看 */
function mfViewModelPreview(m) {
  if (!mfEnsureThree()) { if (CTXREF) CTXREF.toast('未找到 three.js 运行时', 3000, 'err'); return; }
  const wrap = mfNode('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  const cv = mfNode('canvas');
  cv.style.cssText = 'width:100%;height:360px;border-radius:8px;background:#0d1220;display:block;cursor:grab';
  wrap.appendChild(cv);
  const nv = (m.verts ? m.verts.length : 0) / 3, nf = (m.faces ? m.faces.length : 0) / 3;
  wrap.appendChild(mfNode('div', 'mf-note',
    '顶点 <b>' + nv + '</b> · 三角面 <b>' + nf + '</b>　左键拖动＝转视角　滚轮＝缩放'));

  const st = { scene: null, camera: null, renderer: null, controls: null, raf: 0, alive: true };
  const d = mfDialog({
    title: '预览 · ' + (m.name || '建模'), body: wrap, width: 'min(600px,92vw)',
    buttons: [
      { label: '✎ 编辑这个建模', fn: function () { d.close(); mfOpenModeling(m.id); } },
      { label: '关闭', pri: true, fn: function () { } }
    ],
    onClose: function () {
      st.alive = false;
      if (st.raf) cancelAnimationFrame(st.raf);
      /* KiMi3：ro 不断开会一直拽着 st 闭包 → renderer → GL 上下文，全链路泄漏 */
      try { if (st.ro) st.ro.disconnect(); } catch (e) { }
      try { if (st.controls) st.controls.dispose(); } catch (e) { }
      try { if (st.mesh) { st.mesh.geometry.dispose(); st.mesh.material.dispose(); } } catch (e) { }
      /* dispose() 只还 GPU 资源，上下文本身还在；forceContextLoss 当场归还 */
      try { if (st.renderer) { st.renderer.dispose(); st.renderer.forceContextLoss(); } } catch (e) { }
    }
  });
  /* 对话框要先挂到文档里才量得到宽高，所以延一帧再建场景 */
  setTimeout(() => {
    if (!st.alive) return;
    const w0 = cv.clientWidth || 520, h0 = cv.clientHeight || 360;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1220);
    const camera = new THREE.PerspectiveCamera(40, w0 / Math.max(1, h0), 0.01, 100);
    camera.position.set(1.7, 1.2, 1.9);
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(w0, h0, false);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const l1 = new THREE.DirectionalLight(0xffffff, 0.9); l1.position.set(3, 4, 5); scene.add(l1);
    const l2 = new THREE.DirectionalLight(0xaac4ff, 0.35); l2.position.set(-4, -2, -3); scene.add(l2);
    const mesh = new THREE.Mesh(mfModelGeometry(m), new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide
    }));
    /* 归一化尺度：不管当初做多大，预览里都是同样大小，一眼能看清 */
    mesh.geometry.computeBoundingSphere();
    const rr = (mesh.geometry.boundingSphere && mesh.geometry.boundingSphere.radius) || 0;
    if (rr > 1e-6) mesh.scale.setScalar(1 / rr);
    scene.add(mesh);
    const controls = new OrbitControls(camera, cv);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.autoRotate = true; controls.autoRotateSpeed = 1.6;
    st.scene = scene; st.camera = camera; st.renderer = renderer; st.controls = controls; st.mesh = mesh;
    const ro = new ResizeObserver(() => {
      if (!st.alive) return;
      const ww = cv.clientWidth, hh = cv.clientHeight || 360;
      if (!ww) return;
      camera.aspect = ww / Math.max(1, hh); camera.updateProjectionMatrix();
      renderer.setSize(ww, hh, false);
    });
    st.ro = ro;
    ro.observe(cv);
    MF_OFFS.push(() => { try { ro.disconnect(); } catch (e) { } });
    (function loop() {
      if (!st.alive) return;
      st.raf = requestAnimationFrame(loop);
      try { st.controls.update(); st.renderer.render(st.scene, st.camera); } catch (e) { st.alive = false; }
    })();
  }, 30);
}

/* 建模数据 → three 几何（预览与实例都用它，避免两处重复写同一种拼装） */
function mfModelGeometry(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.verts), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.colors), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(m.faces), 1));
  if (m.verts && m.verts.length) g.computeVertexNormals();
  return g;
}

/* 建模台模式切换（按钮与快捷键共用这一套，保证状态同步） */
function mfModelSetMode(m) {
  if (!MO.open) return;
  MO.mode = m; MO.drag = null; MO.painting = false;
  if (MO.controls) MO.controls.mouseButtons.LEFT = (m === 'view') ? THREE.MOUSE.ROTATE : null;
  if (MO.toolRefresh) MO.toolRefresh();
  if (MO.statRefresh) MO.statRefresh();
}
/* 建模台快捷键：整个模块只绑一次（MO._keyBound），靠 MO.open 守卫，关窗即沉睡 */
function mfModelOnKey(e) {
  if (!MO.open) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.target && e.target.getAttribute && e.target.getAttribute('contenteditable') === 'true') return;
  const k = (e.key || '').toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) mfModelRedo(); else mfModelUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); mfModelRedo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Delete') {
    if (MO.sel && MO.sel.length) { e.preventDefault(); mfModelDeleteSel(); if (MO.statRefresh) MO.statRefresh(); }
    return;
  }
  if (e.key === 'Escape') { mfModelSetMode('view'); return; }
  if (e.key === '?') { e.preventDefault(); mfHelpDialog(); return; }
  const mk = { v: 'view', b: 'paint', s: 'sculpt', f: 'face', e: 'edge', x: 'vert', t: 'extrude', r: 'region' };
  if (mk[k]) { e.preventDefault(); mfModelSetMode(mk[k]); return; }
  if (k === 'a') {
    e.preventDefault();
    mfModelSelectAll(MO.selKind || 'face');
    mfModelRebuild();
    if (MO.statRefresh) MO.statRefresh();
  }
}

function mfOpenModeling(loadModelId) {
  /* 【2026-10-15 彻查修复】开窗幂等：纯打开调用撞上已开着的建模窗，就不再叠第二层 */
  if (!loadModelId) {
    const existing = document.querySelector('.mf-dialog.mf-mod');
    if (existing && existing.offsetWidth > 0) {
      try {
        existing.style.transition = 'box-shadow .18s ease';
        existing.style.boxShadow = '0 0 0 3px rgba(120,170,255,.85)';
        setTimeout(() => { try { existing.style.boxShadow = ''; } catch (e) { void e; } }, 420);
      } catch (e) { void e; }
      if (CTXREF && CTXREF.toast) CTXREF.toast('建模系统已经开着了', 1800);
      return;
    }
  }
  if (!mfEnsureThree()) { if (CTXREF) CTXREF.toast('未找到 three.js 运行时，无法打开建模系统', 3600, 'err'); return; }
  if (!S.map) { if (CTXREF) CTXREF.toast('请先打开一张地图', 2400); return; }
  /* 空间编辑模式：{spaceId} 调用 → 台上模型绑定空间几何副本，保存时写回空间 */
  let spaceCtx = null;
  if (loadModelId && typeof loadModelId === 'object' && loadModelId.spaceId) {
    spaceCtx = (S.map.spaces || []).find((x) => x.id === loadModelId.spaceId) || null;
    if (!spaceCtx) { if (CTXREF) CTXREF.toast('这个空间已经不在了', 2400); return; }
    loadModelId = null;
  }
  const wrap = mfNode('div', 'mf-mod-b');
  const left = mfNode('div', 'mf-mod-l');
  const mid = mfNode('div', 'mf-mod-c');
  const right = mfNode('div', 'mf-mod-r');
  wrap.appendChild(left); wrap.appendChild(mid); wrap.appendChild(right);

  const cv = mfNode('canvas', 'mf-mod-cv');
  mid.appendChild(cv);

  /* 场景 */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1220);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  camera.position.set(1.6, 1.1, 1.9);
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  cv.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (CTXREF) CTXREF.toast('建模台这边显卡打了个盹，醒来自动重摆台面', 3000);
  }, false);
  cv.addEventListener('webglcontextrestored', () => {
    try { mfModelRebuild(); } catch (e) { console.warn(e); }
  }, false);
  const amb = new THREE.AmbientLight(0xffffff, 0.85); scene.add(amb);
  const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(3, 4, 5); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xaac4ff, 0.35); d2.position.set(-4, -2, -3); scene.add(d2);
  MO.amb = amb; MO.key = d1; MO.rim = d2;
  const grid = new THREE.GridHelper(4, 20, 0x3a4a66, 0x24314a);
  scene.add(grid);
  MO.grid = grid;
  const controls = new OrbitControls(camera, cv);
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  MO.scene = scene; MO.camera = camera; MO.renderer = renderer; MO.controls = controls; MO.canvas = cv;

  /* 载入建模：内置件走「编辑即分叉」（副本进台、baseId 置空，保存时落成用户建模） */
  let model = null;
  if (loadModelId) {
    if (loadModelId.indexOf('builtin:') === 0) {
      const src0 = mfModelById(loadModelId);
      if (src0) {
        model = mfModelClone(src0, src0.name + ' 改');
        model.cat = src0.cat || '';
        MO.baseId = null;
      }
    } else {
      const src = (S.map.models || []).find((m) => m.id === loadModelId);
      if (src) { model = mfModelClone(src, src.name); MO.baseId = src.id; }
    }
  }
  if (spaceCtx) {
    model = spaceCtx.geom
      ? mfGeomToModel({ verts: spaceCtx.geom.verts, colors: spaceCtx.geom.colors, faces: spaceCtx.geom.faces }, spaceCtx.name)
      : mfGeomToModel(mfGeom(), spaceCtx.name);
    MO.baseId = null;
  }
  if (!model) {
    const cur = (S.map.models || [])[0];
    model = cur ? mfModelClone(cur, cur.name) : mfGeomToModel(mfGeom(), '未命名建模');
    MO.baseId = cur ? cur.id : null;
  }
  MO.model = model; MO.sel = []; MO.undo = []; MO.redo = [];
  MO.spaceId = spaceCtx ? spaceCtx.id : null;
  mfModelRebuild();

  /* 左侧：建模目录 */
  const catT = mfNode('div', 'mf-sec-t', '建模目录（右键＝操作）');
  left.appendChild(catT);
  const cat = mfNode('div');
  cat.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  left.appendChild(cat);
  const addRow = mfNode('div', 'mf-row');
  const bNew = mfNode('div', 'mf-btn', '＋ 新建');
  bNew.title = '打开基础体图鉴：看得见形状地挑预制体——左键直接上台，右键先调尺寸';
  bNew.style.flex = '1';
  bNew.addEventListener('click', () => mfPrimGallery());
  const bImp = mfNode('div', 'mf-btn', '⇱');
  bImp.title = '导入建模文件：.mfmodel（本程序格式）/ .obj / .stl / .glb（其他建模软件导出的通用格式都能进，也可以直接把文件拖进左栏）';
  bImp.addEventListener('click', () => mfImportModel());
  const bMerge = mfNode('div', 'mf-btn', '⇥');
  bMerge.title = '并入目录建模：把建模目录里已有的一件整个拼进当前台上的模型（目录原件保留）';
  bMerge.addEventListener('click', () => {
    const items = (S.map.models || []).map((mm) => ({
      icon: '▣', label: mm.name, fn: () => mfModelMergeInto(mm)
    }));
    if (!items.length) { if (CTXREF) CTXREF.toast('建模目录还是空的', 2200); return; }
    mfMenuAtEl(bMerge, items);
  });
  addRow.appendChild(bNew); addRow.appendChild(bImp); addRow.appendChild(bMerge);
  left.appendChild(addRow);
  left.appendChild(mfNode('div', 'mf-note', '点「＋新建」打开基础体图鉴：35 种预制体，看得见形状地挑，悬停有用途说明。'));
  left.addEventListener('dragover', (e) => e.preventDefault());
  left.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) await mfImportModelFile(f);
  });

  function mfRenderCat() {
    cat.innerHTML = '';
    /* 分类筛选条：全部 / 基础 / 营造 / 器物 / 造物 / 城镇 / 水域 / 地形 / 我的 */
    const flt = MO.catFlt || 'all';
    const chips = mfNode('div', 'mf-row');
    chips.style.cssText = 'flex-wrap:wrap;gap:4px;margin-bottom:2px';
    [['all', '全部'], ['prim', '基础'], ['build', '营造'], ['craft', '器物'], ['wild', '造物'],
    ['town', '城镇'], ['water', '水域'], ['terrain', '地形'], ['user', '我的']].forEach((o) => {
      const b = mfNode('div', 'mf-btn' + (flt === o[0] ? ' pri' : ''), o[1]);
      b.style.cssText = 'padding:2px 8px;font-size:12px';
      b.addEventListener('click', () => { MO.catFlt = o[0]; mfRenderCat(); });
      chips.appendChild(b);
    });
    cat.appendChild(chips);

    /* 卡片工厂：我的建模与内置件共用外观；内置件不可改原件（编辑＝自动分叉副本） */
    const mkCard = (m, isB) => {
      const card = mfNode('div', 'mf-mcard' + (!isB && MO.baseId === m.id ? ' on' : ''));
      const _turl = m.thumb || (isB ? mfModelThumbURL(m) : '');
      if (_turl) { const im = document.createElement('img'); im.src = _turl; card.appendChild(im); }
      else { const cc = document.createElement('canvas'); cc.width = 120; cc.height = 70; card.appendChild(cc); }
      const nm = mfNode('div', 'nm', esc(m.name));
      if (isB) { const bd = mfNode('span', '', ' 〔内置〕'); bd.style.cssText = 'opacity:.6;font-size:11px'; nm.appendChild(bd); }
      card.appendChild(nm);
      card.draggable = true;
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/mf-model', m.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      /* 左键＝3D 旋转预览（只读）；要编辑走右键菜单 */
      card.addEventListener('click', () => mfViewModelPreview(m));
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (isB) {
          mfMenu(e.clientX, e.clientY, [
            { icon: '◉', label: '查看（只读 3D 预览）', fn: () => mfViewModelPreview(m) },
            { icon: '✎', label: '编辑（自动存为我的副本）', fn: () => { MO.model = mfModelClone(m, m.name + ' 改'); MO.model.cat = m.cat || ''; MO.baseId = null; MO.sel = []; _scaleBase = null; if (MO.nameIn) MO.nameIn.value = MO.model.name; mfModelRebuild(); mfRenderCat(); } },
            { icon: '◎', label: '使用（放到地图）', fn: () => mfUseModelOnMap(m.id) },
            { icon: '⤓', label: '导出 .mfmodel', fn: () => mfExportModel(m) },
            { icon: '⌾', label: '导出 OBJ（通用格式）', fn: () => mfExportModelOBJ(m) },
            { icon: '⌾', label: '导出 STL（3D 打印通用，不带颜色）', fn: () => mfExportModelSTL(m) },
            { icon: '⌾', label: '导出 GLB（现代 3D 通用）', fn: () => mfExportModelGLB(m) }
          ]);
          return;
        }
        mfMenu(e.clientX, e.clientY, [
          { icon: '◉', label: '查看（只读 3D 预览）', fn: () => mfViewModelPreview(m) },
          { icon: '✎', label: '编辑（载入建模台）', fn: () => { MO.model = mfModelClone(m, m.name); MO.baseId = m.id; MO.sel = []; _scaleBase = null; if (MO.nameIn) MO.nameIn.value = m.name; mfModelRebuild(); mfRenderCat(); } },
          { icon: '◎', label: '使用（放到地图）', fn: () => mfUseModelOnMap(m.id) },
          { icon: '⤓', label: '导出 .mfmodel', fn: () => mfExportModel(m) },
          { icon: '⌾', label: '导出 OBJ（通用格式）', fn: () => mfExportModelOBJ(m) },
          { icon: '⌾', label: '导出 STL（3D 打印通用，不带颜色）', fn: () => mfExportModelSTL(m) },
          { icon: '⌾', label: '导出 GLB（现代 3D 通用）', fn: () => mfExportModelGLB(m) },
          { icon: '✎', label: '重命名', fn: () => mfPrompt('建模名称', m.name, (v) => { m.name = v; mfRenderCat(); mfTouch(); }) },
          {
            icon: '✕', label: '删除', dgr: true, fn: () => mfConfirm('删除建模「' + m.name + '」？地图上的实例不受影响。', () => {
              const arr = S.map.models, at = arr.indexOf(m); arr.splice(at, 1);
              mfRenderCat(); mfRebuildWaters(); mfTouch();
              if (CTXREF) CTXREF.toast('已删除建模', 2000, 'ok');
            }, { dgr: true, okLabel: '删除' })
          }
        ]);
      });
      return card;
    };

    /* 我的建模 */
    const mine = (S.map.models || []).filter((m) => flt === 'all' || mfCatGroup(m.cat) === flt);
    mine.forEach((m) => cat.appendChild(mkCard(m, false)));
    /* 内置通用建模库（基础栏目内按图鉴小节再细分） */
    const bins = MF_BUILTINS.filter((d) => flt === 'all' || mfCatGroup(d.cat) === flt);
    if (bins.length) {
      cat.appendChild(mfNode('div', 'mf-sec-t', '内置通用建模（' + bins.length + ' 件 · 可直接拖放，编辑自动存副本）'));
      let lastSub = '';
      bins.forEach((d) => {
        if (flt === 'prim' && d.sub && d.sub !== lastSub) {
          lastSub = d.sub;
          const sh = mfNode('div', 'mf-sec-t', '· ' + d.sub + ' ·');
          sh.style.cssText = 'opacity:.65;font-size:11px;margin-top:4px';
          cat.appendChild(sh);
        }
        cat.appendChild(mkCard(mfBuiltinModel(d.id), true));
      });
    }
    if (!mine.length && flt === 'user') cat.appendChild(mfNode('div', 'mf-note', '还没有建模。点「＋新建」起一个基础体，编辑后保存。'));
  }
  mfRenderCat();

  /* 右侧：工具 */
  function sec(t) { const s = mfNode('div', 'mf-sec'); s.appendChild(mfNode('div', 'mf-sec-t', t)); right.appendChild(s); return s; }

  /* ---- 空间布局（仅空间编辑模式）：类型/单元尺寸 + 场景里六向「＋」堆格 ---- */
  let spNavSync = null;
  let mfSpaceFramesBuild = null;
  let mfSpaceCamFit = null;
  if (spaceCtx) {
    const SP = spaceCtx;
    mfSpaceCells(SP);
    MO.selCell = 0;
    const sSec = sec('空间布局 · 单元格');
    /* 类型 */
    const tpRow = mfNode('div', 'mf-row');
    const tpLb = mfNode('label', '', '空间类型 ？');
    tpLb.title = '类型决定默认单元尺寸；换类型会把单元边长改回该类型的默认值（格子数量不变）';
    tpLb.style.cursor = 'help';
    tpRow.appendChild(tpLb);
    const tpSel = mfNode('select', 'mf-sel');
    tpSel.style.flex = '1';
    MF_SPACE_TYPES.forEach((t) => {
      const op = document.createElement('option');
      op.value = t.id; op.textContent = t.name + '（' + t.cellM + 'm/格）'; op.title = t.tip;
      if (mfSpaceType(SP.type).id === t.id) op.selected = true;
      tpSel.appendChild(op);
    });
    tpRow.appendChild(tpSel); sSec.appendChild(tpRow);
    /* 单元边长 */
    const cmRow = mfNode('div', 'mf-row');
    const cmLb = mfNode('label', '', '单元边长 m ？');
    cmLb.title = '每个立方体单元的边长（米）。改小＝更精细，改大＝更宏大；已有格子一起缩放，上不封顶';
    cmLb.style.cursor = 'help';
    cmRow.appendChild(cmLb);
    const cmI = mfNode('input', 'mf-inp');
    cmI.type = 'number'; cmI.min = '1'; cmI.max = '500'; cmI.step = '1'; cmI.value = String(mfSpaceCellM(SP)); cmI.style.flex = '1';
    cmRow.appendChild(cmI); sSec.appendChild(cmRow);
    /* 格子导航与拆除 */
    const navRow = mfNode('div', 'mf-row');
    const bPrev = mfNode('div', 'mf-btn', '◀');
    bPrev.title = '选中上一格';
    const navInfo = mfNode('span', '', '');
    navInfo.style.cssText = 'flex:1;text-align:center;font-size:12px;opacity:.8';
    const bNext = mfNode('div', 'mf-btn', '▶');
    bNext.title = '选中下一格';
    const bDelC = mfNode('div', 'mf-btn dgr', '拆此格');
    bDelC.title = '拆除选中的单元格（最后一格不能拆；格里的搭建物不受影响，只是没了框架）';
    navRow.appendChild(bPrev); navRow.appendChild(navInfo); navRow.appendChild(bNext); navRow.appendChild(bDelC);
    sSec.appendChild(navRow);
    sSec.appendChild(mfNode('div', 'mf-note',
      '场景里黄框＝当前选中的格子，蓝框＝其他格子；点黄框六个面上的绿色「＋」就在那个方向堆一格（上下左右前后都行）。搭建照常使用下面的全部建模工具。'));

    spNavSync = function () {
      const cells = mfSpaceCells(SP);
      if (MO.selCell >= cells.length) MO.selCell = cells.length - 1;
      if (MO.selCell < 0) MO.selCell = 0;
      navInfo.textContent = '第 ' + (MO.selCell + 1) + ' / ' + cells.length + ' 格 · ' + mfSpaceCellM(SP) + 'm';
    };
    tpSel.addEventListener('change', () => {
      SP.type = tpSel.value; SP.cellM = mfSpaceType(SP.type).cellM;
      cmI.value = String(SP.cellM);
      if (mfSpaceFramesBuild) mfSpaceFramesBuild();
      if (mfSpaceCamFit) mfSpaceCamFit();
      mfTouch();
    });
    cmI.addEventListener('change', () => {
      SP.cellM = clamp(+cmI.value || mfSpaceType(SP.type).cellM, 1, 500);
      cmI.value = String(SP.cellM);
      if (mfSpaceFramesBuild) mfSpaceFramesBuild();
      if (mfSpaceCamFit) mfSpaceCamFit();
      mfTouch();
    });
    bPrev.addEventListener('click', () => { MO.selCell = (MO.selCell - 1 + mfSpaceCells(SP).length) % mfSpaceCells(SP).length; if (mfSpaceFramesBuild) mfSpaceFramesBuild(); });
    bNext.addEventListener('click', () => { MO.selCell = (MO.selCell + 1) % mfSpaceCells(SP).length; if (mfSpaceFramesBuild) mfSpaceFramesBuild(); });
    bDelC.addEventListener('click', () => {
      const cells = mfSpaceCells(SP);
      if (cells.length <= 1) { if (CTXREF) CTXREF.toast('最后一格拆不得——总得给这片天地留个种子', 2400); return; }
      cells.splice(MO.selCell, 1);
      if (mfSpaceFramesBuild) mfSpaceFramesBuild();
      mfTouch();
    });

    /* 场景框架：每格一圈线框（选中黄、其余蓝），选中格六个面中心各一颗绿色「＋」 */
    const spRay = new THREE.Raycaster();
    /* 相机就位：拉到能看全所有格子的位置（空间大老远的，镜头可不能还贴在原点） */
    mfSpaceCamFit = function () {
      const cells = mfSpaceCells(SP);
      if (!cells.length) return;
      const m = mfSpaceCellM(SP);
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
      cells.forEach((c) => {
        x0 = Math.min(x0, c.x * m); y0 = Math.min(y0, c.y * m); z0 = Math.min(z0, c.z * m);
        x1 = Math.max(x1, (c.x + 1) * m); y1 = Math.max(y1, (c.y + 1) * m); z1 = Math.max(z1, (c.z + 1) * m);
      });
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
      const dim = Math.max(x1 - x0, y1 - y0, z1 - z0, m);
      camera.near = Math.max(0.01, dim * 0.002);   /* near 随尺度抬一抬，大空间里深度缓冲才不会打架 */
      camera.far = Math.max(100, dim * 20);
      camera.updateProjectionMatrix();
      if (grid) grid.scale.setScalar(Math.max(1, dim / 4));
      controls.target.set(cx, cy, cz);
      camera.position.set(cx + dim * 1.1, cy + dim * 0.8, cz + dim * 1.3);
      controls.update();
    };
    mfSpaceFramesBuild = function () {
      if (MO.spGrp) {
        scene.remove(MO.spGrp);
        MO.spGrp.traverse((o) => {
          try { if (o.geometry) o.geometry.dispose(); } catch (e) { }
          try { if (o.material) o.material.dispose(); } catch (e) { }
        });
        MO.spGrp = null;
      }
      const grp = new THREE.Group();
      const cells = mfSpaceCells(SP);
      const m = mfSpaceCellM(SP);
      if (MO.selCell >= cells.length) MO.selCell = cells.length - 1;
      cells.forEach((c, i) => {
        const sel = i === MO.selCell;
        const bx = new THREE.BoxGeometry(m, m, m);
        const ln = new THREE.LineSegments(new THREE.EdgesGeometry(bx),
          new THREE.LineBasicMaterial({ color: sel ? 0xffd970 : 0x4a90c2, transparent: true, opacity: sel ? 0.95 : 0.45 }));
        bx.dispose();
        ln.position.set((c.x + 0.5) * m, (c.y + 0.5) * m, (c.z + 0.5) * m);
        grp.add(ln);
      });
      const cc = cells[MO.selCell];
      if (cc) {
        [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach((dir) => {
          const tx = cc.x + dir[0], ty = cc.y + dir[1], tz = cc.z + dir[2];
          if (cells.some((c2) => c2.x === tx && c2.y === ty && c2.z === tz)) return;  /* 那里已经有格了 */
          const px = (cc.x + 0.5 + dir[0] * 0.5) * m, py = (cc.y + 0.5 + dir[1] * 0.5) * m, pz = (cc.z + 0.5 + dir[2] * 0.5) * m;
          const pm = new THREE.Mesh(new THREE.BoxGeometry(m * 0.14, m * 0.14, m * 0.14),
            new THREE.MeshBasicMaterial({ color: 0x66d98a, transparent: true, opacity: 0.4, depthWrite: false }));
          pm.position.set(px, py, pz);
          pm.userData.dir = dir;
          pm.title = '在这个方向堆一格';
          grp.add(pm);
          /* 面上两道白杠，让加号名副其实 */
          [0, 1, 2].filter((ai) => !dir[ai]).forEach((ai) => {
            const dims = [m * 0.02, m * 0.02, m * 0.02]; dims[ai] = m * 0.08;
            const bar = new THREE.Mesh(new THREE.BoxGeometry(dims[0], dims[1], dims[2]),
              new THREE.MeshBasicMaterial({ color: 0xd8ffd8, transparent: true, opacity: 0.9, depthWrite: false }));
            bar.position.set(px + dir[0] * m * 0.075, py + dir[1] * m * 0.075, pz + dir[2] * m * 0.075);
            grp.add(bar);
          });
        });
      }
      MO.spGrp = grp;
      scene.add(grp);
      spNavSync();
    };
    /* 点加号＝堆格（捕获阶段拦下，免得同时触发涂色/选面） */
    cv.addEventListener('pointerdown', (e) => {
      if (!MO.spGrp || e.button !== 0) return;
      const pluses = MO.spGrp.children.filter((o) => o.userData && o.userData.dir);
      if (!pluses.length) return;
      const r = cv.getBoundingClientRect();
      spRay.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
      const hit = spRay.intersectObjects(pluses, false)[0];
      if (!hit) return;
      e.stopImmediatePropagation(); e.preventDefault();
      if (MO.mode === 'view') { if (CTXREF) CTXREF.toast('观察模式只看不搭——点顶部「✎ 编辑」再来堆格', 2400); return; }
      const dir = hit.object.userData.dir;
      const cc = mfSpaceCells(SP)[MO.selCell];
      SP.cells.push({ x: cc.x + dir[0], y: cc.y + dir[1], z: cc.z + dir[2] });
      MO.selCell = SP.cells.length - 1;
      mfSpaceFramesBuild();
      mfTouch();
      if (CTXREF) CTXREF.toast('已在那边堆上一格（共 ' + SP.cells.length + ' 格）', 2000, 'ok');
    }, true);
    mfSpaceFramesBuild();
    mfSpaceCamFit();
  }
  let s1 = sec('编辑模式');
  const modes = mfNode('div', 'mf-tools');
  [['paint', '◐ 涂色', '涂色：左键在模型上按住拖动上色（范围/逐顶点可在下方调）'],
  ['sculpt', '◠ 雕塑', '雕塑：像捏泥一样拉起、推平、抹平表面'],
  ['face', '▨ 面', '面模式：左键点选三角面，选中后可拖动、改长宽、复制、删除'],
  ['edge', '╱ 边', '边模式：左键点选一条边，可拖动或改长度'],
  ['vert', '✦ 顶点', '顶点模式：左键点选一个顶点，拖动它精修形状'],
  ['extrude', '⤒ 挤出', '挤出：点一个面，沿法线拉出厚度（做墙、柱、屋檐）'],
  ['view', '◉ 查看', '查看：左键拖动旋转模型、滚轮缩放，不会改动模型'],
  ['region', '⬚ 框选', '框选：左键拖出方框，框住的面整片选中（随后自动切回面模式）']].forEach((m) => {
    const b = mfNode('div', 'mf-tool' + (MO.mode === m[0] ? ' on' : ''), esc(m[1]));
    b.title = m[2] || '';
    b.addEventListener('click', () => {
      MO.mode = m[0]; MO.drag = null; MO.painting = false;
      if (MO.controls) MO.controls.mouseButtons.LEFT = (m[0] === 'view') ? THREE.MOUSE.ROTATE : null;
      mfToolRefresh(); mfStatRefresh();
    });
    b.dataset.mode = m[0];
    modes.appendChild(b);
  });
  s1.appendChild(modes);
  const cRow = mfNode('div', 'mf-row');
  cRow.appendChild(mfNode('label', '', '颜色'));
  const cIn = document.createElement('input');
  cIn.type = 'color'; cIn.value = MO.color;
  cIn.style.cssText = 'flex:1;height:26px;padding:0;border:1px solid var(--rule,#c9b892);border-radius:5px;background:#fff';
  cIn.addEventListener('input', () => { MO.color = cIn.value; });
  cRow.appendChild(cIn);
  s1.appendChild(cRow);
  /* 调色盘：常用色直接点，不必每次开系统取色器 */
  const pal = mfNode('div');
  pal.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-top:4px';
  ['#3a2a16', '#6d5426', '#8e6b32', '#b99d68', '#e6d5ae', '#f6efdd', '#ffffff', '#222222',
  '#7a4a2b', '#a06a3b', '#c98f4e', '#e0b36a', '#8a2f2b', '#c0543c', '#e08a5a', '#f2c894',
  '#2f4d2a', '#4a7a3f', '#7aa85a', '#b5cf8e', '#1f3a5c', '#2f5c8a', '#5a8ab5', '#9ec4e0',
  '#4a2a5c', '#7a4a8a', '#a56ab5', '#d0a0dc', '#8a8a8a', '#b5b5b5', '#5c5c5c', '#e8e0d0'].forEach((hx) => {
    const sw = mfNode('div');
    sw.style.cssText = 'height:16px;border-radius:3px;border:1px solid rgba(60,40,15,.4);cursor:pointer;background:' + hx;
    sw.title = '取色 ' + hx;
    sw.addEventListener('click', () => { MO.color = hx; cIn.value = hx; });
    pal.appendChild(sw);
  });
  s1.appendChild(pal);

  /* 网格吸附：拖动顶点时把坐标对齐到步长；0 = 不吸附 */
  const snRow = mfNode('div', 'mf-row');
  snRow.appendChild(mfNode('label', '', '吸附'));
  const snSel = mfNode('select', 'mf-sel');
  snSel.title = '网格吸附：拖动顶点时坐标自动对齐到这个步长；关＝自由拖动';
  [['0', '关'], ['0.5', '0.5'], ['0.25', '0.25'], ['0.1', '0.1'], ['0.05', '0.05']].forEach((o) => {
    const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1];
    if (String(MO.snap) === o[0]) op.selected = true;
    snSel.appendChild(op);
  });
  snSel.addEventListener('change', () => { MO.snap = +snSel.value; mfGridSnap(MO.snap); });
  snRow.appendChild(snSel);
  s1.appendChild(snRow);
  /* 涂色笔刷：范围半径 + 逐顶点 + 限定选中 */
  const prRow = mfNode('div', 'mf-row');
  const prL = mfNode('label', '', '涂色范围 ？');
  prL.title = '涂色笔刷的半径：0 ＝只涂点中的那一面；调大可一次涂一片（配合「逐顶点涂色」能画出渐变边缘）';
  prL.style.cursor = 'help';
  prRow.appendChild(prL);
  const prSl = mfNode('input', 'mf-inp');
  prSl.type = 'range'; prSl.min = '0'; prSl.max = '0.5'; prSl.step = '0.01'; prSl.value = String(MO.paintR);
  prSl.addEventListener('input', () => { MO.paintR = +prSl.value; });
  prRow.appendChild(prSl);
  s1.appendChild(prRow);
  const pcRow = mfNode('div', 'mf-row');
  pcRow.style.cssText = 'gap:10px;font-size:12px;flex-wrap:wrap';
  const mkCb = (label, tip, get, set) => {
    const lb = mfNode('label', '', '');
    lb.style.cssText = 'display:inline-flex;align-items:center;gap:4px;cursor:help';
    lb.title = tip;
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = get();
    c.addEventListener('change', () => set(c.checked));
    lb.appendChild(c); lb.appendChild(document.createTextNode(label));
    return lb;
  };
  pcRow.appendChild(mkCb('逐顶点涂色', '默认按整面涂色；勾选后只染笔刷半径内的顶点，颜色过渡更细腻', () => MO.paintVert, (v) => { MO.paintVert = v; }));
  pcRow.appendChild(mkCb('限定选中范围', '勾选后，涂色和雕塑只作用于当前选中的面（先用「面」或「框选」选好范围）', () => MO.selMask, (v) => { MO.selMask = v; }));
  s1.appendChild(pcRow);
  const statN = mfNode('div', 'mf-note', '');
  s1.appendChild(statN);

  /* 雕塑笔刷参数：三个子工具 + 半径 + 强度（仅「雕塑」模式下生效） */
  let sSc = sec('雕塑笔刷');
  const scTools = mfNode('div', 'mf-tools');
  [['raise', '▲ 拉起', '沿表面鼓出，堆出山脊、穹顶'], ['push', '■ 推平', '把凸起压向切面，削出平台、梯田'], ['smooth', '∿ 平滑', '抹掉棱角，让表面圆润过渡']].forEach((t) => {
    const b = mfNode('div', 'mf-tool' + (MO.sculptTool === t[0] ? ' on' : ''), esc(t[1]));
    b.title = t[2] || '';
    b.addEventListener('click', () => {
      MO.sculptTool = t[0];
      scTools.querySelectorAll('.mf-tool').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      mfStatRefresh();
    });
    scTools.appendChild(b);
  });
  sSc.appendChild(scTools);
  const srRow = mfNode('div', 'mf-row');
  const srL = mfNode('label', '', '半径 ？');
  srL.title = '雕塑笔刷的涂抹半径：调大一次抹一大片，调小抠细节';
  srL.style.cursor = 'help';
  srRow.appendChild(srL);
  const srSl = mfNode('input', 'mf-inp');
  srSl.type = 'range'; srSl.min = '0.05'; srSl.max = '0.8'; srSl.step = '0.01'; srSl.value = String(MO.sculptR);
  srSl.addEventListener('input', () => { MO.sculptR = +srSl.value; mfStatRefresh(); });
  srRow.appendChild(srSl);
  sSc.appendChild(srRow);
  const ssRow = mfNode('div', 'mf-row');
  const ssL = mfNode('label', '', '强度 ？');
  ssL.title = '每抹一下改变多少：调小轻轻推，调大狠狠捏';
  ssL.style.cursor = 'help';
  ssRow.appendChild(ssL);
  const ssSl = mfNode('input', 'mf-inp');
  ssSl.type = 'range'; ssSl.min = '0.01'; ssSl.max = '0.2'; ssSl.step = '0.005'; ssSl.value = String(MO.sculptS);
  ssSl.addEventListener('input', () => { MO.sculptS = +ssSl.value; });
  ssRow.appendChild(ssSl);
  sSc.appendChild(ssRow);
  sSc.appendChild(mfNode('div', 'mf-note', '用法：编辑模式选「◠ 雕塑」，左键在模型上按住抹动。拉起＝沿表面鼓出，推平＝压向切面，平滑＝去棱角。'));

  let s2 = sec('面操作');
  const eRow = mfNode('div', 'mf-row');
  eRow.appendChild(mfNode('label', '', '挤出'));
  const eSl = mfNode('input', 'mf-inp');
  eSl.type = 'range'; eSl.min = '-0.5'; eSl.max = '0.5'; eSl.step = '0.01'; eSl.value = String(MO.extrude);
  eSl.title = '挤出厚度：正值向外鼓、负值向内凹';
  eSl.addEventListener('input', () => { MO.extrude = +eSl.value; });
  eRow.appendChild(eSl);
  s2.appendChild(eRow);
  const bRow = mfNode('div', 'mf-row');
  const bEx = mfNode('div', 'mf-btn', '执行挤出');
  bEx.title = '把选中的面沿法线拉出厚度（厚度用上面的滑条调）';
  bEx.addEventListener('click', () => mfModelExtrude());
  const bSub = mfNode('div', 'mf-btn', '细分');
  bSub.title = '每个三角面切成 4 个：面数变多，雕塑涂色更细腻（面太多会变卡，适度即可）';
  bSub.addEventListener('click', () => mfModelSubdivide());
  bRow.appendChild(bEx); bRow.appendChild(bSub);
  s2.appendChild(bRow);
  const sRow = mfNode('div', 'mf-row');
  sRow.appendChild(mfNode('label', '', '对称(X)'));
  const sCb = document.createElement('input');
  sCb.type = 'checkbox'; sCb.checked = MO.sym;
  sCb.title = '对称编辑：改动 X 轴一侧时，另一侧自动镜像（涂色、拖动都生效）';
  sCb.addEventListener('change', () => { MO.sym = sCb.checked; });
  sRow.appendChild(sCb);
  s2.appendChild(sRow);
  s2.appendChild(mfNode('div', 'mf-note', '提示：右键拖动＝旋转视角，滚轮＝缩放，左键＝涂色/选面。'));

  let s3 = sec('整体变换');
  const scRow = mfNode('div', 'mf-row');
  scRow.appendChild(mfNode('label', '', '缩放'));
  const scSl = mfNode('input', 'mf-inp');
  scSl.type = 'range'; scSl.min = '0.2'; scSl.max = '3'; scSl.step = '0.05'; scSl.value = '1';
  scSl.addEventListener('input', () => mfModelScale(+scSl.value, true));
  scRow.appendChild(scSl);
  s3.appendChild(scRow);
  const rRow = mfNode('div', 'mf-row');
  [['↺Y', 'y'], ['↺X', 'x'], ['↺Z', 'z']].forEach((r) => {
    const b = mfNode('div', 'mf-btn', r[0]);
    b.addEventListener('click', () => mfModelRotate(r[1]));
    rRow.appendChild(b);
  });
  s3.appendChild(rRow);

  /* ------- 选择与结构：面向精修的一组结构操作（全部支持撤销） ------- */
  let s5 = sec('选择与结构');
  const selRow = mfNode('div', 'mf-row');
  const bAll = mfNode('div', 'mf-btn', '全选');
  bAll.addEventListener('click', () => {
    const k = MO.mode === 'vert' ? 'vert' : (MO.mode === 'edge' ? 'edge' : 'face');
    mfModelSelectAll(k); mfStatRefresh();
  });
  const bInv = mfNode('div', 'mf-btn', '反选');
  bInv.addEventListener('click', () => { mfModelInvertSel(); mfStatRefresh(); });
  const bClr = mfNode('div', 'mf-btn', '清空');
  bClr.addEventListener('click', () => { MO.sel = []; mfModelRebuild(); mfStatRefresh(); });
  selRow.appendChild(bAll); selRow.appendChild(bInv); selRow.appendChild(bClr);
  s5.appendChild(selRow);
  const stRow1 = mfNode('div', 'mf-row');
  stRow1.style.cssText = 'flex-wrap:wrap;gap:4px';
  [['⧉ 复制选中', () => { mfModelCopySel(); mfStatRefresh(); }, '复制选中的面，副本自动选中，可直接拖动或用「数值变换」精确移走'],
  ['✕ 删除选中', () => { mfModelDeleteSel(); mfStatRefresh(); }, '删除选中的面（边/顶点模式下删除触及选中点的面）'],
  ['◈ 内插面', () => { mfModelInset(); mfStatRefresh(); }, '选中面向内缩出新面，四周自动补壁（做窗框、凹槽）'],
  ['链 焊接顶点', () => { mfModelWeld(0.001); mfStatRefresh(); }, '把间距极小的顶点合并：合拢裂缝、清理导入模型的重复点'],
  ['⇄ 翻转法线', () => { mfModelFlipNormals(); mfStatRefresh(); }, '翻转面的朝向：面发黑或从某角度看不见时点它（选中面则只翻选中的）'],
  ['◧ 镜像复制X', () => { mfModelMirrorCopyX(); mfStatRefresh(); }, '整个模型在 X 轴另一侧镜像复制一份：对称物件只建一半即可']].forEach((o) => {
    const b = mfNode('div', 'mf-btn', o[0]);
    b.style.cssText = 'padding:3px 8px;font-size:12px';
    b.title = o[2] || '';
    b.addEventListener('click', o[1]);
    stRow1.appendChild(b);
  });
  s5.appendChild(stRow1);
  s5.appendChild(mfNode('div', 'mf-note', '内插面＝选中面内缩出新面（做窗框、凹槽）；焊接＝合拢顶点裂缝；镜像复制＝对称物件只建一半，一键补齐。'));

  /* ------- 数值变换：输入确切数值，移动/旋转/缩放选中部分（不选=整体） ------- */
  let s6 = sec('数值变换（无选中＝整体）');
  const mkNum = (def, step) => {
    const i = mfNode('input', 'mf-inp');
    i.type = 'number'; i.step = String(step || 0.1); i.value = String(def);
    i.style.cssText = 'width:52px;flex:0 0 auto';
    return i;
  };
  const mvRow = mfNode('div', 'mf-row');
  mvRow.appendChild(mfNode('label', '', '移动'));
  const mx = mkNum(0), my = mkNum(0), mz = mkNum(0);
  [mx, my, mz].forEach((i) => mvRow.appendChild(i));
  const bMv = mfNode('div', 'mf-btn', '应用');
  bMv.addEventListener('click', () => mfModelTransform('move', { dx: +mx.value || 0, dy: +my.value || 0, dz: +mz.value || 0 }));
  mvRow.appendChild(bMv);
  s6.appendChild(mvRow);
  const rtRow = mfNode('div', 'mf-row');
  rtRow.appendChild(mfNode('label', '', '旋转'));
  const axSel = mfNode('select', 'mf-sel');
  [['x', 'X'], ['y', 'Y'], ['z', 'Z']].forEach((o) => { const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1] + ' 轴'; axSel.appendChild(op); });
  axSel.value = 'y';
  rtRow.appendChild(axSel);
  const ang = mkNum(45, 5);
  rtRow.appendChild(ang);
  rtRow.appendChild(mfNode('label', '', '°'));
  const bRt = mfNode('div', 'mf-btn', '应用');
  bRt.addEventListener('click', () => mfModelTransform('rotate', { axis: axSel.value, ang: +ang.value || 0 }));
  rtRow.appendChild(bRt);
  s6.appendChild(rtRow);
  const ssRow2 = mfNode('div', 'mf-row');
  ssRow2.appendChild(mfNode('label', '', '缩放'));
  const sx = mkNum(1), sy = mkNum(1), sz = mkNum(1);
  [sx, sy, sz].forEach((i) => ssRow2.appendChild(i));
  const bSs = mfNode('div', 'mf-btn', '应用');
  bSs.addEventListener('click', () => mfModelTransform('scale', { sx: +sx.value || 1, sy: +sy.value || 1, sz: +sz.value || 1 }));
  ssRow2.appendChild(bSs);
  s6.appendChild(ssRow2);
  s6.appendChild(mfNode('div', 'mf-note', '三栏即 X/Y/Z。旋转、缩放绕「选中部分的中心」进行；什么都不选时作用于整个模型。'));

  /* ------- 选中部分调整：边改长度、面改长宽（先读取再改，心中有数） ------- */
  let s65 = sec('选中部分调整');
  const elRow = mfNode('div', 'mf-row');
  const elL = mfNode('label', '', '边长 ？');
  elL.title = '把选中的边调整到指定长度（边的中点不动，两端对称伸缩；可多选统一调）';
  elL.style.cursor = 'help';
  elRow.appendChild(elL);
  const elIn = mkNum(0.5, 0.05);
  elRow.appendChild(elIn);
  const bElRead = mfNode('div', 'mf-btn', '读取');
  bElRead.title = '读出当前选中边的长度，填到输入框';
  bElRead.addEventListener('click', () => {
    const v = mfModelEdgeLenCur();
    if (v == null) { if (CTXREF) CTXREF.toast('先在「边」模式选中一条边', 2400); return; }
    elIn.value = v.toFixed(3);
  });
  const bElAp = mfNode('div', 'mf-btn', '应用');
  bElAp.title = '把选中的边（可多选）统一调整到输入的长度';
  bElAp.addEventListener('click', () => mfModelEdgeSetLength(+elIn.value || 0));
  elRow.appendChild(bElRead); elRow.appendChild(bElAp);
  s65.appendChild(elRow);
  const fdRow = mfNode('div', 'mf-row');
  const fdL = mfNode('label', '', '面长宽 ？');
  fdL.title = '把选中面片在它自己的平面里调整到指定长×宽（沿第一条边的方向为长，厚度方向不动）';
  fdL.style.cursor = 'help';
  fdRow.appendChild(fdL);
  const fwIn = mkNum(0.5, 0.05), fhIn = mkNum(0.5, 0.05);
  fdRow.appendChild(fwIn); fdRow.appendChild(fhIn);
  const bFdRead = mfNode('div', 'mf-btn', '读取');
  bFdRead.title = '读出当前选中面片的长和宽';
  bFdRead.addEventListener('click', () => {
    const v = mfModelFaceDimsCur();
    if (!v) { if (CTXREF) CTXREF.toast('先在「面」模式选中面', 2400); return; }
    fwIn.value = v[0].toFixed(3); fhIn.value = v[1].toFixed(3);
  });
  const bFdAp = mfNode('div', 'mf-btn', '应用');
  bFdAp.title = '把选中的面片缩放到输入的长×宽';
  bFdAp.addEventListener('click', () => mfModelFaceSetDims(+fwIn.value || 0, +fhIn.value || 0));
  fdRow.appendChild(bFdRead); fdRow.appendChild(bFdAp);
  s65.appendChild(fdRow);
  s65.appendChild(mfNode('div', 'mf-note', '边长、面长宽都要先选中对应的部分再「读取/应用」；要改整个模型的大小，用上面「数值变换」的缩放。'));

  /* ------- 显示与视角 ------- */
  let s7 = sec('显示与视角');
  const vwRow = mfNode('div', 'mf-row');
  vwRow.style.cssText = 'flex-wrap:wrap;gap:4px';
  [['前', 'front'], ['顶', 'top'], ['右', 'right'], ['复位', 'reset']].forEach((o) => {
    const b = mfNode('div', 'mf-btn', o[0]);
    b.style.cssText = 'padding:3px 10px;font-size:12px';
    b.addEventListener('click', () => mfModelViewPreset(o[1]));
    vwRow.appendChild(b);
  });
  s7.appendChild(vwRow);
  const dspRow = mfNode('div', 'mf-row');
  dspRow.style.cssText = 'flex-wrap:wrap;gap:4px';
  const bWire = mfNode('div', 'mf-btn', '▦ 线框');
  bWire.style.cssText = 'padding:3px 8px;font-size:12px';
  bWire.addEventListener('click', () => {
    if (!MO.mat) return;
    MO.mat.wireframe = !MO.mat.wireframe;
    bWire.classList.toggle('on', MO.mat.wireframe);
  });
  const bFlat = mfNode('div', 'mf-btn', '◪ 平直着色');
  bFlat.style.cssText = 'padding:3px 8px;font-size:12px';
  bFlat.addEventListener('click', () => {
    if (!MO.mat) return;
    MO.mat.flatShading = !MO.mat.flatShading;
    MO.mat.needsUpdate = true;
    bFlat.classList.toggle('on', !!MO.mat.flatShading);
  });
  dspRow.appendChild(bWire); dspRow.appendChild(bFlat);
  s7.appendChild(dspRow);
  s7.appendChild(mfNode('div', 'mf-note', '线框便于检查布线；平直着色让棱角分明（只是显示方式，不影响建模文件本身）。'));

  /* ------- 材质：外观手感（写进建模台材质，不改变顶点色数据） ------- */
  let sMat = sec('材质');
  const matP = MO.matPrefs || (MO.matPrefs = { rough: 0.75, metal: 0.05, doubleSide: true });
  const mkSl = (label, tip, min, max, step, get, set) => {
    const rw = mfNode('div', 'mf-row');
    const lb = mfNode('label', '', label + ' ？');
    lb.title = tip; lb.style.cursor = 'help';
    rw.appendChild(lb);
    const sl = mfNode('input', 'mf-inp');
    sl.type = 'range'; sl.min = String(min); sl.max = String(max); sl.step = String(step); sl.value = String(get());
    sl.addEventListener('input', () => set(+sl.value));
    rw.appendChild(sl);
    return rw;
  };
  sMat.appendChild(mkSl('粗糙度', '表面有多哑光：0＝镜面般光滑，1＝完全哑光（陶土、岩石）', 0, 1, 0.01,
    () => matP.rough, (v) => { matP.rough = v; if (MO.mat) MO.mat.roughness = v; }));
  sMat.appendChild(mkSl('金属度', '表面像不像金属：0＝非金属（木头、岩石），1＝纯金属（明显映出灯光）', 0, 1, 0.01,
    () => matP.metal, (v) => { matP.metal = v; if (MO.mat) MO.mat.metalness = v; }));
  const dsRow = mfNode('div', 'mf-row');
  dsRow.appendChild(mkCb('双面渲染', '面的正反两面都画出来。薄片建模（墙、旗帜、树叶）要开；封闭实心模型关掉略省性能',
    () => matP.doubleSide,
    (v) => { matP.doubleSide = v; if (MO.mat) { MO.mat.side = v ? THREE.DoubleSide : THREE.FrontSide; MO.mat.needsUpdate = true; } }));
  sMat.appendChild(dsRow);

  /* ------- 灯光：只影响预览与导出画面，不写进建模文件 ------- */
  let sLight = sec('灯光');
  sLight.appendChild(mkSl('环境光', '整体平光：越大越亮堂、阴影越淡', 0, 2, 0.05,
    () => (MO.amb ? MO.amb.intensity : 0.85), (v) => { if (MO.amb) MO.amb.intensity = v; }));
  sLight.appendChild(mkSl('主光强度', '主光（太阳光）的强弱：越大明暗对比越强、立体感越明显', 0, 2, 0.05,
    () => (MO.key ? MO.key.intensity : 0.9), (v) => { if (MO.key) MO.key.intensity = v; }));
  sLight.appendChild(mkSl('主光方位', '主光绕模型打转的角度：转一转，找到最好看的受光方向', 0, 360, 1,
    () => (MO.lightAng == null ? 37 : MO.lightAng), (v) => {
      MO.lightAng = v;
      if (MO.key) { const a = v * Math.PI / 180; MO.key.position.set(Math.cos(a) * 5.8, 4, Math.sin(a) * 5.8); }
    }));
  sLight.appendChild(mfNode('div', 'mf-note', '灯光只影响这里的预览和导出的图片 / 视频，不会写进建模文件本身。'));

  /* ------- 渲染输出与展示 ------- */
  let sOut = sec('渲染输出');
  const arRow = mfNode('div', 'mf-row');
  const bRot = mfNode('div', 'mf-btn' + (MO.autoRot ? ' pri' : ''), '↻ 自动旋转：' + (MO.autoRot ? '开' : '关'));
  bRot.style.flex = '1';
  bRot.title = '模型原地匀速自转（约 9 秒一圈），方便全方位展示；不影响编辑，再点一下停下';
  bRot.addEventListener('click', () => {
    MO.autoRot = !MO.autoRot;
    bRot.textContent = '↻ 自动旋转：' + (MO.autoRot ? '开' : '关');
    bRot.classList.toggle('pri', !!MO.autoRot);
  });
  arRow.appendChild(bRot);
  sOut.appendChild(arRow);
  const outRow = mfNode('div', 'mf-row');
  outRow.style.cssText = 'flex-wrap:wrap;gap:4px';
  const bPng = mfNode('div', 'mf-btn', '▦ 导出 PNG 截图');
  bPng.title = '把当前视角渲染成一张 PNG 下载：背景透明，可直接叠到地图或海报上';
  bPng.addEventListener('click', () => {
    if (!MO.renderer || !MO.scene || !MO.camera) return;
    const oldBg = MO.scene.background;
    MO.scene.background = null;
    MO.renderer.setClearColor(0x000000, 0);
    MO.renderer.render(MO.scene, MO.camera);
    MO.canvas.toBlob((b) => {
      if (b) mfDownloadBlob(((MO.model && MO.model.name) || '建模') + '.png', b);
      MO.scene.background = oldBg;
      MO.renderer.setClearColor(0x000000, 1);
      MO.renderer.render(MO.scene, MO.camera);
    }, 'image/png');
    if (CTXREF) CTXREF.toast('正在导出透明底 PNG…', 1800);
  });
  const bWebm = mfNode('div', 'mf-btn', '◉ 录制旋转视频');
  bWebm.title = '自动旋转并录制 8 秒 WebM 视频（接近一整圈），录完自动下载';
  bWebm.addEventListener('click', () => {
    if (MO._rec) { if (CTXREF) CTXREF.toast('还在录制中，请稍等…', 1800); return; }
    if (!MO.canvas.captureStream || typeof MediaRecorder === 'undefined') {
      if (CTXREF) CTXREF.toast('当前环境不支持视频录制', 2400); return;
    }
    MO.autoRot = true;
    bRot.textContent = '↻ 自动旋转：开'; bRot.classList.add('pri');
    const rec = new MediaRecorder(MO.canvas.captureStream(30));
    const chunks = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onstop = () => {
      MO._rec = null;
      bWebm.textContent = '◉ 录制旋转视频';
      const blob = new Blob(chunks, { type: 'video/webm' });
      mfDownloadBlob(((MO.model && MO.model.name) || '建模') + '.webm', blob);
      if (CTXREF) CTXREF.toast('视频已导出（WebM 格式）', 2400, 'ok');
    };
    MO._rec = rec;
    bWebm.textContent = '● 录制中…';
    rec.start();
    if (CTXREF) CTXREF.toast('录制中：8 秒，模型自动旋转…', 2400);
    setTimeout(() => { try { rec.stop(); } catch (e) { void e; } }, 8000);
  });
  outRow.appendChild(bPng); outRow.appendChild(bWebm);
  sOut.appendChild(outRow);
  sOut.appendChild(mfNode('div', 'mf-note', '导出的只是「画面」。建模文件本身用左栏目录右键菜单里的「导出 .mfmodel / OBJ / STL / GLB」——后三种是通用格式，Blender、3D 打印软件都能接着用。'));

  /* 顶点组：把一批顶点起名字存起来，一点重新选中——换装、局部涂色、分工修改都用它 */
  const sGrp = sec('顶点组');
  const grpList = mfNode('div');
  sGrp.appendChild(grpList);
  const grpNote = mfNode('div', 'mf-note', '先用点选模式选中一批顶点，再点下方按钮成组；点组名＝重新选中整组。导出 OBJ 时组会写成 g 块，Blender 里认。');
  sGrp.appendChild(grpNote);
  const bGrpAdd = mfNode('div', 'mf-btn', '＋ 把当前选中的顶点存成组');
  bGrpAdd.style.width = '100%';
  bGrpAdd.addEventListener('click', () => {
    if (MO.selKind !== 'vert' || !MO.sel.length) {
      if (CTXREF) CTXREF.toast('先在「编辑模式」里切到点选，选中一批顶点再成组', 3000);
      return;
    }
    mfPrompt('组名', '组' + (((MO.model.groups || []).length) + 1), (v) => {
      MO.model.groups = MO.model.groups || [];
      MO.model.groups.push({ id: uid('g'), name: v || '未命名组', vts: MO.sel.slice().sort((a, b) => a - b) });
      renderGrp();
    }, { title: '新建顶点组' });
  });
  sGrp.appendChild(bGrpAdd);
  function renderGrp() {
    grpList.innerHTML = '';
    const gs = MO.model.groups || [];
    if (!gs.length) { grpList.appendChild(mfNode('div', 'mf-note', '还没有顶点组。')); return; }
    gs.forEach((g) => {
      const row = mfNode('div', 'mf-row');
      row.style.cssText = 'gap:6px;margin-bottom:4px';
      const nm = mfNode('div', 'mf-btn', esc(g.name) + '（' + g.vts.length + ' 点）');
      nm.style.cssText = 'flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      nm.title = '点击＝选中整组顶点';
      nm.addEventListener('click', () => {
        MO.selKind = 'vert'; MO.sel = g.vts.slice();
        mfModelRebuild(); mfStatRefresh();
      });
      const bR = mfNode('div', 'mf-icon-btn', '✎');
      bR.title = '重命名组';
      bR.addEventListener('click', () => mfPrompt('组名', g.name, (v) => { g.name = v || g.name; renderGrp(); }, { title: '重命名顶点组' }));
      const bD = mfNode('div', 'mf-icon-btn', '✕');
      bD.title = '删除组（顶点本身不受影响）';
      bD.addEventListener('click', () => {
        MO.model.groups.splice(MO.model.groups.indexOf(g), 1); renderGrp();
      });
      row.appendChild(nm); row.appendChild(bR); row.appendChild(bD);
      grpList.appendChild(row);
    });
  }
  renderGrp();

  /* 形变动画：把模型的不同形状拍成关键帧，播放时在帧间平滑插值（morph）。
     保存后，地图上这件建模的所有实例都会循环播放。 */
  const sAn = sec('形变动画 ？');
  sAn.title = '给模型拍几张「形状快照」，播放时模型在各快照间平滑变形：飘动的旗、开合的门、呼吸的灯笼';
  const anList = mfNode('div');
  sAn.appendChild(anList);
  const anRow = mfNode('div', 'mf-row');
  const bFrame = mfNode('div', 'mf-btn', '＋ 拍关键帧');
  bFrame.style.flex = '1';
  bFrame.title = '把模型当前形状拍成一帧（先捏好形状再拍）';
  bFrame.addEventListener('click', () => {
    const m = MO.model;
    m.anims = m.anims || [];
    if (!m.anims.length) m.anims.push({ name: '默认动画', dur: 2, frames: [] });
    const a = m.anims[0];
    if (a.frames.length && a.frames[0].length !== m.verts.length) {
      if (CTXREF) CTXREF.toast('顶点数量和已有帧不一致（拍帧后又增删过顶点）：请先删掉旧帧重拍', 3600);
      return;
    }
    a.frames.push(new Float32Array(m.verts));
    renderAnim();
    if (CTXREF) CTXREF.toast('已拍下第 ' + a.frames.length + ' 帧', 1600, 'ok');
  });
  const bPlay = mfNode('div', 'mf-btn', '▶ 预览');
  bPlay.style.flex = '1';
  bPlay.addEventListener('click', () => {
    const a = MO.model.anims && MO.model.anims[0];
    if (!a || a.frames.length < 2) { if (CTXREF) CTXREF.toast('至少拍两帧才能播放', 2200); return; }
    if (MO.playAnim) { mfAnimStopPreview(); bPlay.textContent = '▶ 预览'; }
    else { MO.playAnim = { t: 0 }; bPlay.textContent = '⏸ 停止'; }
  });
  anRow.appendChild(bFrame); anRow.appendChild(bPlay);
  sAn.appendChild(anRow);
  function renderAnim() {
    anList.innerHTML = '';
    const a = MO.model.anims && MO.model.anims[0];
    if (!a || !a.frames.length) { anList.appendChild(mfNode('div', 'mf-note', '还没有关键帧。捏好一个形状就拍一帧，两帧起播。')); return; }
    const durRow = mfNode('div', 'mf-row');
    const durL = mfNode('label', '', '一轮秒数 ？');
    durL.title = '完整播完一轮（全部帧）需要多少秒，越短动得越快';
    durL.style.cursor = 'help';
    durRow.appendChild(durL);
    const durI = mfNode('input', 'mf-inp');
    durI.type = 'number'; durI.min = '0.2'; durI.step = '0.2'; durI.value = String(a.dur || 2);
    durI.style.flex = '1';
    durI.addEventListener('change', () => { a.dur = Math.max(0.2, +durI.value || 2); });
    durRow.appendChild(durI);
    anList.appendChild(durRow);
    a.frames.forEach((fr, fi) => {
      const row = mfNode('div', 'mf-row');
      row.style.cssText = 'gap:6px;margin-bottom:4px';
      const bA = mfNode('div', 'mf-btn', '帧 ' + (fi + 1));
      bA.style.flex = '1';
      bA.title = '把模型恢复成这一帧的形状（可撤销）';
      bA.addEventListener('click', () => {
        if (fr.length !== MO.model.verts.length) { if (CTXREF) CTXREF.toast('这一帧与当前顶点数不一致，无法套用', 2600); return; }
        mfModelPushUndo();
        MO.model.verts.set(fr);
        mfModelRebuild();
      });
      const bD = mfNode('div', 'mf-icon-btn', '✕');
      bD.title = '删除这一帧';
      bD.addEventListener('click', () => { a.frames.splice(fi, 1); renderAnim(); });
      row.appendChild(bA); row.appendChild(bD);
      anList.appendChild(row);
    });
    anList.appendChild(mfNode('div', 'mf-note', '保存后，地图上这件建模的实例会自动循环播放这段形变。'));
  }
  renderAnim();

  let s4 = sec('保存');
  const nmRow = mfNode('div', 'mf-row');
  const nmIn = mfNode('input', 'mf-inp'); nmIn.value = MO.model.name;
  nmRow.appendChild(nmIn);
  s4.appendChild(nmRow);
  const svRow = mfNode('div', 'mf-row');
  const bSv = mfNode('div', 'mf-btn pri', '保存');
  bSv.addEventListener('click', () => mfModelSave(false));
  const bSa = mfNode('div', 'mf-btn', '另存');
  bSa.addEventListener('click', () => mfModelSave(true));
  svRow.appendChild(bSv); svRow.appendChild(bSa);
  s4.appendChild(svRow);
  const unRow = mfNode('div', 'mf-row');
  const bUn = mfNode('div', 'mf-btn', '↩');
  bUn.addEventListener('click', () => mfModelUndo());
  const bRe = mfNode('div', 'mf-btn', '↪');
  bRe.addEventListener('click', () => mfModelRedo());
  unRow.appendChild(bUn); unRow.appendChild(bRe);
  s4.appendChild(unRow);

  function mfToolRefresh() {
    right.querySelectorAll('.mf-tool[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === MO.mode));
    /* 与顶部「编辑/观察」开关同步：右栏直接点「◉查看」也算进入观察态 */
    if (MO.modeSw) {
      const vw = MO.mode === 'view';
      MO.modeSw.e.classList.toggle('on', !vw); MO.modeSw.v.classList.toggle('on', vw);
      right.classList.toggle('mf-dim', vw);
    }
  }
  /* 选中状态栏：告诉用户现在选了什么、下一步能干什么 */
  function mfStatRefresh() {
    if (!statN) return;
    const kn = { face: '面', edge: '边', vert: '顶点' }[MO.selKind] || '面';
    if (MO.sel && MO.sel.length) {
      statN.innerHTML = '已选中 <b>' + MO.sel.length + '</b> 个' + kn +
        '：按住左键拖动即可改变形状' + (MO.snap > 0 ? '（吸附 ' + MO.snap + '）' : '');
    } else if (MO.mode === 'paint') {
      statN.textContent = '涂色：左键在模型上按住涂抹（可连续拖动涂一整片）';
    } else if (MO.mode === 'sculpt') {
      const tn = { raise: '拉起', push: '推平', smooth: '平滑' }[MO.sculptTool] || '拉起';
      statN.textContent = '雕塑·' + tn + '：左键在模型上按住抹动（半径 ' + MO.sculptR.toFixed(2) + '，整笔一步撤销）';
    } else if (MO.mode === 'view') {
      statN.textContent = '查看：左键拖动＝旋转模型　滚轮＝缩放（点其他工具回到编辑）';
    } else if (MO.mode === 'region') {
      statN.textContent = '框选：按住左键拖出方框，框住的面会整片选中';
    } else {
      statN.textContent = '键鼠：左键选中并拖动　右键拖动＝旋转视角　滚轮＝缩放';
    }
  }
  MO.renderCat = mfRenderCat;
  MO.nameIn = nmIn;
  MO.statRefresh = mfStatRefresh;
  MO.toolRefresh = mfToolRefresh;

  /* 交互：左键涂色 / 选中并拖动；拖动要在 window 上收 move+up，
   * 否则鼠标划出画布边界就断手 */
  const _rayScratch = new THREE.Vector2();
  function mfRayAt(cx, cy) {
    const r = cv.getBoundingClientRect();
    _rayScratch.set(((cx - r.left) / Math.max(1, r.width)) * 2 - 1, -((cy - r.top) / Math.max(1, r.height)) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(_rayScratch, MO.camera);
    return rc;
  }
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !MO.mesh || !MO.model) return;
    if (MO.mode === 'view') return;                    /* 查看模式：左键让给视角旋转 */
    if (MO.mode === 'region') {                        /* 框选：拖出橡皮筋矩形 */
      const host = cv.parentElement, hr = host.getBoundingClientRect();
      const bd = document.createElement('div');
      bd.style.cssText = 'position:absolute;border:1px dashed #ffd97a;background:rgba(255,217,122,.14);z-index:6;pointer-events:none';
      host.appendChild(bd);
      MO.regionDrag = { x0: e.clientX, y0: e.clientY, div: bd, hr: hr };
      return;
    }
    const hit = mfRayAt(e.clientX, e.clientY).intersectObject(MO.mesh, false);
    if (!hit.length) { MO.sel = []; MO.drag = null; mfModelRebuild(); mfStatRefresh(); return; }
    const fi = hit[0].faceIndex;
    /* ⚠ 命中点是世界坐标，模型本身没做变换所以等于局部坐标；
     *   但一旦以后给 mesh 加了变换就必须转，这里显式转一次省得埋雷 */
    const lp = MO.mesh.worldToLocal(hit[0].point.clone());
    if (MO.mode === 'paint') { MO.painting = true; mfModelPaint(fi, false, lp); return; }
    if (MO.mode === 'sculpt') {
      MO.sculpting = true;
      MO._sculptAllow = mfSculptAllowSet(); /* 勾选「限定选中范围」时只雕选中的面 */
      mfModelPushUndo();                    /* 整笔雕塑只入一次撤销栈 */
      mfSculptApply({ point: lp, face: hit[0].face });
      return;
    }
    if (MO.mode === 'extrude') { MO.selKind = 'face'; MO.sel = [fi]; mfModelExtrude(); mfStatRefresh(); return; }
    if (MO.mode === 'face') { MO.selKind = 'face'; MO.sel = [fi]; }
    else if (MO.mode === 'edge') { MO.selKind = 'edge'; MO.sel = [mfNearestEdgeOnFace(MO.model, fi, lp)]; }
    else { MO.selKind = 'vert'; MO.sel = [mfNearestVertOnFace(MO.model, fi, lp)]; }
    mfModelRebuild();
    mfDragBegin(lp);
    mfStatRefresh();
  });
  /* window 级监听只挂一次（模块生命周期内复用），反复开关建模窗口不再累积；
   * 处理函数内部本就有 MO.open 守卫，窗口关着时直接空转返回 */
  if (!MO._winBound) {
    MO._winBound = true;
    mfOn(window, 'pointermove', (e) => {
      if (!MO.open || !MO.mesh) return;
      if (MO.regionDrag) {                           /* 框选橡皮筋 */
        const rd = MO.regionDrag;
        rd.div.style.left = (Math.min(rd.x0, e.clientX) - rd.hr.left) + 'px';
        rd.div.style.top = (Math.min(rd.y0, e.clientY) - rd.hr.top) + 'px';
        rd.div.style.width = Math.abs(e.clientX - rd.x0) + 'px';
        rd.div.style.height = Math.abs(e.clientY - rd.y0) + 'px';
        return;
      }
      if (MO.drag) { mfDragTo(mfRayAt(e.clientX, e.clientY)); return; }
      if (MO.sculpting && MO.mode === 'sculpt') {
        const hit = mfRayAt(e.clientX, e.clientY).intersectObject(MO.mesh, false);
        if (hit.length) mfSculptApply({ point: MO.mesh.worldToLocal(hit[0].point.clone()), face: hit[0].face });
        return;
      }
      if (MO.painting && MO.mode === 'paint') {
        const hit = mfRayAt(e.clientX, e.clientY).intersectObject(MO.mesh, false);
        if (hit.length) mfModelPaint(hit[0].faceIndex, true, MO.mesh.worldToLocal(hit[0].point.clone()));   /* 连续涂：整笔只记一步撤销 */
      }
    });
    mfOn(window, 'pointerup', () => {
      if (!MO.open) return;
      MO.painting = false;
      if (MO.regionDrag) {                           /* 框选落槌：矩形内的面整片选中 */
        const rd = MO.regionDrag;
        const picked = mfRegionPick(rd.x0, rd.y0, e.clientX, e.clientY);
        try { rd.div.remove(); } catch (err) { }
        MO.regionDrag = null;
        MO.mode = 'face'; MO.selKind = 'face'; MO.sel = picked;
        if (MO.controls) MO.controls.mouseButtons.LEFT = null;
        mfModelRebuild();
        if (MO.toolRefresh) MO.toolRefresh();
        if (MO.statRefresh) MO.statRefresh();
        if (CTXREF) CTXREF.toast('框选完成：选中 ' + picked.length + ' 个面，可拖动 / 涂色 / 复制 / 删除', 2800, 'ok');
      }
      if (MO.sculpting) { MO.sculpting = false; mfSculptFinish(); }
      mfDragEnd();
    });
  }

  const d = mfDialog({
    title: spaceCtx ? ('空间编辑 —— ' + spaceCtx.name + '（1 单位 ≈ 1 米，建房间学校都够细）') : '建模系统', cls: 'mf-mod', body: wrap, width: '100vw',
    buttons: [{ label: '关闭', fn: function () { } }],
    onClose: function () {
      MO.open = false;
      try { if (MO.ro) { MO.ro.disconnect(); MO.ro = null; } } catch (e) { }
      try { if (MO.controls) MO.controls.dispose(); } catch (e) { }
      try { if (MO.geo) MO.geo.dispose(); } catch (e) { }
      try { if (MO.mat) MO.mat.dispose(); } catch (e) { }
      try { if (MO.renderer) { MO.renderer.dispose(); MO.renderer.forceContextLoss(); } } catch (e) { }
      try {
        if (MO.spGrp) {
          MO.spGrp.traverse((o) => {
            try { if (o.geometry) o.geometry.dispose(); } catch (e) { }
            try { if (o.material) o.material.dispose(); } catch (e) { }
          });
          MO.spGrp = null;
        }
      } catch (e) { }
      MO.scene = null; MO.camera = null; MO.renderer = null; MO.controls = null; MO.mesh = null; MO.geo = null; MO.dlg = null;
    }
  });
  MO.dlg = d; MO.open = true;
  /* 顶部「✎编辑 / ◉观察」开关：观察态下右栏工具沉睡，左键只管转着看，绝不误改模型 */
  try {
    const dh = d.box.querySelector('.mf-dh');
    if (dh) {
      const sw = mfNode('span', 'mf-modesw');
      const msE = mfNode('span', 'ms' + (MO.mode === 'view' ? '' : ' on'), '✎ 编辑');
      const msV = mfNode('span', 'ms' + (MO.mode === 'view' ? ' on' : ''), '◉ 观察');
      msE.title = '编辑模式：右栏工具全部可用，可以改动模型';
      msV.title = '观察模式：只管转着看、截图、导出，右栏工具沉睡，绝不会误改模型';
      sw.appendChild(msE); sw.appendChild(msV);
      dh.insertBefore(sw, dh.querySelector('.mf-x'));
      const kh = mfNode('span', 'ms', '?');
      kh.title = '快捷键一览（按 ? 也能打开）';
      kh.style.cssText = 'cursor:pointer;margin-left:6px';
      kh.addEventListener('click', () => mfHelpDialog());
      dh.insertBefore(kh, dh.querySelector('.mf-x'));
      MO.modeSw = { e: msE, v: msV };
      MO.applyViewLock = (lock) => {
        if (lock) {
          if (MO.mode && MO.mode !== 'view') MO.prevMode = MO.mode;
          MO.mode = 'view'; MO.drag = null; MO.painting = false;
          if (MO.controls) MO.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        } else {
          MO.mode = MO.prevMode || 'face';
          if (MO.controls) MO.controls.mouseButtons.LEFT = null;
        }
        right.classList.toggle('mf-dim', lock);
        msE.classList.toggle('on', !lock); msV.classList.toggle('on', lock);
        if (MO.toolRefresh) MO.toolRefresh();
        if (MO.statRefresh) MO.statRefresh();
      };
      msE.addEventListener('click', () => MO.applyViewLock(false));
      msV.addEventListener('click', () => MO.applyViewLock(true));
      if (MO.mode === 'view') right.classList.add('mf-dim');
    }
  } catch (e) { }
  setTimeout(() => mfModelResize(), 40);
  const ro = new ResizeObserver(() => mfModelResize());
  ro.observe(mid);
  MO.ro = ro;
  MF_OFFS.push(() => { try { ro.disconnect(); } catch (e) { } });   /* 卸载兜底；正常关窗走 onClose */
  if (!MO._keyBound) { MO._keyBound = true; mfOn(window, 'keydown', mfModelOnKey); }
  mfGuide('model');
  mfStatRefresh();
  mfModelLoop();
}

/* ------------------------------------------------ 几何拾取（顶点/边/面）-- */
/* 点到线段的距离平方，用来在命中面上挑最近的那条边 */
function mfSegDist2(m, a, b, p) {
  const ax = m.verts[a * 3], ay = m.verts[a * 3 + 1], az = m.verts[a * 3 + 2];
  const bx = m.verts[b * 3], by = m.verts[b * 3 + 1], bz = m.verts[b * 3 + 2];
  const vx = bx - ax, vy = by - ay, vz = bz - az;
  const px = p.x - ax, py = p.y - ay, pz = p.z - az;
  const L2 = vx * vx + vy * vy + vz * vz;
  let t = L2 > 0 ? (px * vx + py * vy + pz * vz) / L2 : 0;
  t = clamp(t, 0, 1);
  const dx = px - vx * t, dy = py - vy * t, dz = pz - vz * t;
  return dx * dx + dy * dy + dz * dz;
}
/* 命中面上离光标最近的那个顶点 */
function mfNearestVertOnFace(m, fi, p) {
  let best = -1, bd = Infinity;
  for (let k = 0; k < 3; k++) {
    const vi = m.faces[fi * 3 + k];
    const dx = m.verts[vi * 3] - p.x, dy = m.verts[vi * 3 + 1] - p.y, dz = m.verts[vi * 3 + 2] - p.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) { bd = d; best = vi; }
  }
  return best;
}
/* 命中面上离光标最近的那条边 → [顶点i, 顶点j] */
function mfNearestEdgeOnFace(m, fi, p) {
  const tri = [m.faces[fi * 3], m.faces[fi * 3 + 1], m.faces[fi * 3 + 2]];
  let best = null, bd = Infinity;
  for (let k = 0; k < 3; k++) {
    const a = tri[k], b = tri[(k + 1) % 3];
    const d = mfSegDist2(m, a, b, p);
    if (d < bd) { bd = d; best = [a, b]; }
  }
  return best;
}
/* 与 vi 坐标重合的全部顶点。
 * ⚠ 几何里同一个空间点常被多个面各存一份索引（挤出后尤其多），
 *   只动其中一份会把模型撕开，所以必须整组一起动 */
function mfSamePosVerts(m, vi) {
  const x = m.verts[vi * 3], y = m.verts[vi * 3 + 1], z = m.verts[vi * 3 + 2];
  const out = [], eps = 1e-4, nv = m.verts.length / 3;
  for (let i = 0; i < nv; i++) {
    if (Math.abs(m.verts[i * 3] - x) < eps &&
      Math.abs(m.verts[i * 3 + 1] - y) < eps &&
      Math.abs(m.verts[i * 3 + 2] - z) < eps) out.push(i);
  }
  return out;
}
/* X 轴镜像的那一组顶点（对称编辑用） */
function mfMirrorVertGroup(m, list) {
  const out = [], nv = m.verts.length / 3, eps = 1e-4;
  list.forEach((vi) => {
    const mx = -m.verts[vi * 3], my = m.verts[vi * 3 + 1], mz = m.verts[vi * 3 + 2];
    if (Math.abs(mx - m.verts[vi * 3]) < eps) return;      // 正好在对称面上，不重复对称
    for (let i = 0; i < nv; i++) {
      if (Math.abs(m.verts[i * 3] - mx) < eps &&
        Math.abs(m.verts[i * 3 + 1] - my) < eps &&
        Math.abs(m.verts[i * 3 + 2] - mz) < eps) { out.push(i); break; }
    }
  });
  return out;
}

/* 选中高亮：面＝白色描边，边＝琥珀色，顶点＝青色小十字 */
function mfModelSelOverlay(m) {
  if (!MO.mesh || !MO.sel || !MO.sel.length) return;
  const seg = [];
  const line = (a, b) => {
    seg.push(m.verts[a * 3], m.verts[a * 3 + 1], m.verts[a * 3 + 2],
      m.verts[b * 3], m.verts[b * 3 + 1], m.verts[b * 3 + 2]);
  };
  const COL = { face: 0xffffff, edge: 0xffcf6a, vert: 0x74e0ff };
  if (MO.selKind === 'face') {
    MO.sel.forEach((fi) => {
      const a = m.faces[fi * 3], b = m.faces[fi * 3 + 1], c = m.faces[fi * 3 + 2];
      line(a, b); line(b, c); line(c, a);
    });
  } else if (MO.selKind === 'edge') {
    MO.sel.forEach((e) => line(e[0], e[1]));
  } else {
    const r = 0.05;
    MO.sel.forEach((vi) => {
      const x = m.verts[vi * 3], y = m.verts[vi * 3 + 1], z = m.verts[vi * 3 + 2];
      seg.push(x - r, y, z, x + r, y, z);
      seg.push(x, y - r, z, x, y + r, z);
      seg.push(x, y, z - r, x, y, z + r);
    });
  }
  if (!seg.length) return;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3));
  const lm = new THREE.LineBasicMaterial({ color: COL[MO.selKind] || 0xffffff });
  MO.mesh.add(new THREE.LineSegments(lg, lm));
}

/* --------------------------------------------------- 拖动顶点/边/面 ------ */
/* 把选中的顶点组登记为一个拖动任务：记录每个涉及顶点的原始坐标，
 * 并记录一个「过光标点、垂直于视线」的平面——拖动就在这个平面里发生 */
function mfDragBegin(hitPoint) {
  const m = MO.model;
  let picked = [];
  if (MO.selKind === 'face') {
    MO.sel.forEach((fi) => {
      const a = m.faces[fi * 3], b = m.faces[fi * 3 + 1], c = m.faces[fi * 3 + 2];
      [a, b, c].forEach((vi) => picked.push.apply(picked, mfSamePosVerts(m, vi)));
    });
  } else if (MO.selKind === 'edge') {
    MO.sel.forEach((e) => { e.forEach((vi) => picked.push.apply(picked, mfSamePosVerts(m, vi))); });
  } else {
    MO.sel.forEach((vi) => picked.push.apply(picked, mfSamePosVerts(m, vi)));
  }
  picked = Array.from(new Set(picked));
  if (!picked.length) return;
  mfModelPushUndo();
  const items = picked.map((vi) => ({ vi: vi, x: m.verts[vi * 3], y: m.verts[vi * 3 + 1], z: m.verts[vi * 3 + 2], mx: false }));
  /* 对称：镜像端的顶点数量必须一致才动，否则会把模型拉歪 */
  if (MO.sym) {
    let mir = Array.from(new Set(mfMirrorVertGroup(m, picked)));
    if (mir.length === picked.length) {
      mir.forEach((vi, i) => items.push({
        vi: vi, x: m.verts[vi * 3], y: m.verts[vi * 3 + 1], z: m.verts[vi * 3 + 2],
        mx: true, sync: items[i].vi
      }));
    }
  }
  MO.drag = {
    items: items,
    origin: hitPoint.clone(),
    normal: MO.camera.getWorldDirection(new THREE.Vector3()).negate(),
    moved: false
  };
}
function mfDragTo(hitRay) {
  const dg = MO.drag;
  if (!dg || !MO.model) return;
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dg.normal, dg.origin);
  const p = new THREE.Vector3();
  if (!hitRay.ray.intersectPlane(plane, p)) return;
  const dx = p.x - dg.origin.x, dy = p.y - dg.origin.y, dz = p.z - dg.origin.z;
  const m = MO.model, S = MO.snap;
  dg.items.forEach((it) => {
    let nx = it.x + (it.mx ? -dx : dx), ny = it.y + dy, nz = it.z + dz;
    if (S > 0) { nx = Math.round(nx / S) * S; ny = Math.round(ny / S) * S; nz = Math.round(nz / S) * S; }
    m.verts[it.vi * 3] = nx; m.verts[it.vi * 3 + 1] = ny; m.verts[it.vi * 3 + 2] = nz;
  });
  dg.moved = true;
  mfModelRebuild();
}
function mfDragEnd() {
  if (!MO.drag) return;
  MO.drag = null;
  MO.dirty = true;
}

/* 网格吸附步长变化时，把地面参考网格换成同样的疏密，肉眼才对得上 */
function mfGridSnap(step) {
  if (!MO.scene || !MO.grid) return;
  MO.scene.remove(MO.grid);
  try { MO.grid.geometry.dispose(); MO.grid.material.dispose(); } catch (e) { }
  const size = 4;
  const div = step > 0 ? Math.max(4, Math.round(size / step)) : 20;
  const ng = new THREE.GridHelper(size, div, 0x3a4a66, 0x24314a);
  MO.scene.add(ng);
  MO.grid = ng;
}

function mfModelResize() {
  if (!MO.canvas || !MO.renderer) return;
  const pe = MO.canvas.parentElement;
  const w = (pe && pe.clientWidth) || MO.canvas.clientWidth || 600;
  const h = (pe && pe.clientHeight) || MO.canvas.clientHeight || 400;
  MO.camera.aspect = w / Math.max(1, h);
  MO.camera.updateProjectionMatrix();
  MO.renderer.setSize(w, h, false);
}

/* 重建建模网格 */
function mfModelRebuild() {
  if (!MO.scene || !MO.model) return;
  if (MO.mesh) { MO.scene.remove(MO.mesh); MO.geo.dispose(); MO.mat.dispose(); MO.mesh = null; MO.geo = null; MO.mat = null; }
  const m = MO.model;
  /* 空白建模一个顶点都没有：没有东西可显示，也不挂 raycast 目标，省得后续处处判空 */
  if (!m.verts || !m.verts.length) return;
  const mp = MO.matPrefs || (MO.matPrefs = { rough: 0.75, metal: 0.05, doubleSide: true });
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: mp.rough, metalness: mp.metal, side: mp.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.verts, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  g.setIndex(new THREE.BufferAttribute(m.faces, 1));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  MO.scene.add(mesh);
  MO.geo = g; MO.mat = mat; MO.mesh = mesh;
  mfSculptPrep();            /* 雕塑用的逻辑顶点归并/邻接表随几何一起刷新 */
  mfModelSelOverlay(m);
}

let _moRaf = 0;
/* 停止形变预览并把模型恢复成本来形状 */
function mfAnimStopPreview() {
  if (!MO.playAnim) return;
  MO.playAnim = null;
  if (MO.mesh && MO.model) {
    const arr = MO.mesh.geometry.attributes.position.array;
    if (arr.length === MO.model.verts.length) {
      arr.set(MO.model.verts);
      MO.mesh.geometry.attributes.position.needsUpdate = true;
      MO.mesh.geometry.computeVertexNormals();
    }
  }
}

function mfModelLoop() {
  if (!MO.open) { _moRaf = 0; return; }
  _moRaf = requestAnimationFrame(mfModelLoop);
  try {
    if (MO.playAnim && MO.mesh && MO.model && MO.model.anims && MO.model.anims[0]) {
      const a = MO.model.anims[0];
      if (a.frames.length >= 2) {
        MO.playAnim.t += 0.016;
        const dur = a.dur || 2, segT = dur / a.frames.length;
        const ft = (MO.playAnim.t % dur) / segT;
        const i0 = Math.floor(ft) % a.frames.length, i1 = (i0 + 1) % a.frames.length;
        const k = ft - Math.floor(ft);
        const A = a.frames[i0], B = a.frames[i1];
        const arr = MO.mesh.geometry.attributes.position.array;
        if (A.length === arr.length && B.length === arr.length) {
          for (let j = 0; j < arr.length; j++) arr[j] = A[j] + (B[j] - A[j]) * k;
          MO.mesh.geometry.attributes.position.needsUpdate = true;
          MO.mesh.geometry.computeVertexNormals();
        }
      }
    }
    if (MO.autoRot && MO.mesh) MO.mesh.rotation.y += 0.011;
    if (MO.controls) MO.controls.update();
    if (MO.renderer && MO.scene && MO.camera) MO.renderer.render(MO.scene, MO.camera);
  } catch (e) { MO.open = false; console.error(e); }
}

function mfModelSnapshot() {
  return { verts: new Float32Array(MO.model.verts), colors: new Float32Array(MO.model.colors), faces: new Uint32Array(MO.model.faces) };
}
function mfModelRestore(s) {
  MO.model.verts = s.verts; MO.model.colors = s.colors; MO.model.faces = s.faces;
  mfModelRebuild();
}
function mfModelPushUndo() {
  MO.undo.push({ s: mfModelSnapshot(), sel: MO.sel.slice() });
  if (MO.undo.length > 40) MO.undo.shift();
  MO.redo.length = 0;
}
function mfModelUndo() {
  const e = MO.undo.pop(); if (!e) return;
  MO.redo.push({ s: mfModelSnapshot(), sel: MO.sel.slice() });
  mfModelRestore(e.s); MO.sel = e.sel;
}
function mfModelRedo() {
  const e = MO.redo.pop(); if (!e) return;
  MO.undo.push({ s: mfModelSnapshot(), sel: MO.sel.slice() });
  mfModelRestore(e.s); MO.sel = e.sel;
}

/* 对称：找出 X 轴镜像的面对 */
function mfMirrorFaces(fi) {
  const m = MO.model, out = [];
  const c = mfFaceCenter(m, fi);
  const tx = -c[0];
  for (let i = 0; i < m.faces.length / 3; i++) {
    if (i === fi) continue;
    const cc = mfFaceCenter(m, i);
    if (Math.abs(cc[0] - tx) < 1e-3 && Math.abs(cc[1] - c[1]) < 1e-3 && Math.abs(cc[2] - c[2]) < 1e-3) out.push(i);
  }
  return out;
}
function mfFaceCenter(m, fi) {
  const a = m.faces[fi * 3], b = m.faces[fi * 3 + 1], cc = m.faces[fi * 3 + 2];
  return [(m.verts[a * 3] + m.verts[b * 3] + m.verts[cc * 3]) / 3,
  (m.verts[a * 3 + 1] + m.verts[b * 3 + 1] + m.verts[cc * 3 + 1]) / 3,
  (m.verts[a * 3 + 2] + m.verts[b * 3 + 2] + m.verts[cc * 3 + 2]) / 3];
}

/* 选中面集合（勾选「限定选中范围」且当前选的是面时生效），null＝不限 */
function mfSelFaceSet() {
  if (!MO.selMask || MO.selKind !== 'face' || !MO.sel.length) return null;
  return new Set(MO.sel);
}
/* 雕塑的允许范围：选中面涉及的全部逻辑顶点；null＝不限 */
function mfSculptAllowSet() {
  const mask = mfSelFaceSet();
  if (!mask || !MO.v2l) return null;
  const m = MO.model, out = new Set();
  mask.forEach((f) => {
    for (let k = 0; k < 3; k++) {
      const vi = m.faces[f * 3 + k];
      if (vi != null && vi < MO.v2l.length) out.add(MO.v2l[vi]);
    }
  });
  return out;
}
/* 涂色：默认涂点中的面（对称开启时连带镜像面）；
 * 「涂色范围」>0 时按笔刷半径涂一片；「逐顶点」时只染半径内的顶点，过渡更细腻；
 * 「限定选中范围」时只作用于当前选中的面 */
function mfModelPaint(fi, cont, lp) {
  const m = MO.model;
  if (m.verts.length > 240000) { if (CTXREF) CTXREF.toast('模型太复杂，无法继续涂色', 2400, 'err'); return; }
  /* cont = 同一次按住拖动里后续的那一笔：整笔只入一次撤销栈，
   * 否则抹一下就是几十步，Ctrl+Z 按到手酸 */
  if (!cont) mfModelPushUndo();
  const c = hexToRgb(MO.color);
  const mask = mfSelFaceSet();
  const R = MO.paintR > 0 ? MO.paintR : (MO.paintVert ? 0.05 : 0);
  const dye = (vi) => { m.colors[vi * 3] = c[0] / 255; m.colors[vi * 3 + 1] = c[1] / 255; m.colors[vi * 3 + 2] = c[2] / 255; };
  if (lp && R > 0) {
    const R2 = R * R;
    if (MO.paintVert) {
      let allow = null;
      if (mask) { allow = new Set(); mask.forEach((f) => { for (let k = 0; k < 3; k++) allow.add(m.faces[f * 3 + k]); }); }
      const nv = m.verts.length / 3;
      for (let i = 0; i < nv; i++) {
        if (allow && !allow.has(i)) continue;
        const dx = m.verts[i * 3] - lp.x, dy = m.verts[i * 3 + 1] - lp.y, dz = m.verts[i * 3 + 2] - lp.z;
        if (dx * dx + dy * dy + dz * dz <= R2) dye(i);
      }
    } else {
      const nf = m.faces.length / 3;
      for (let f = 0; f < nf; f++) {
        if (mask && !mask.has(f)) continue;
        const ce = mfFaceCenter(m, f);
        const dx = ce[0] - lp.x, dy = ce[1] - lp.y, dz = ce[2] - lp.z;
        if (dx * dx + dy * dy + dz * dz > R2) continue;
        for (let k = 0; k < 3; k++) dye(m.faces[f * 3 + k]);
      }
    }
  } else {
    const list = [fi];
    if (MO.sym) list.push.apply(list, mfMirrorFaces(fi));
    list.forEach((f) => {
      if (f == null || f * 3 + 2 >= m.faces.length) return;
      if (mask && !mask.has(f)) return;
      for (let k = 0; k < 3; k++) dye(m.faces[f * 3 + k]);
    });
  }
  /* 增量上色：几何缓冲还是同一份（顶点/面未增减）时只提交颜色属性，
   * 不再每笔都销毁重建 BufferGeometry——连续涂抹从 O(全模型) 降到 O(1) */
  const ga = MO.geo && MO.geo.attributes.color;
  if (MO.mesh && ga && ga.array === m.colors) {
    ga.needsUpdate = true;
  } else {
    mfModelRebuild();
  }
}

/* ------------------------------------------------ 雕塑笔刷：拉起/推平/平滑 -
 * 非索引化之后每个面各存一份顶点，雕塑必须先按坐标把渲染顶点归并成
 * 「逻辑顶点」整组联动（否则一动就把模型撕开）；邻接表供平滑笔刷用 */
function mfSculptPrep() {
  const m = MO.model;
  MO.v2l = null; MO.adj = null; MO.lrep = null; MO.lcount = 0;
  if (!m || !m.verts || !m.verts.length) return;
  const nv = m.verts.length / 3;
  const idx = new Map(), v2l = new Uint32Array(nv), adj = [], lrep = [];
  for (let i = 0; i < nv; i++) {
    const k = m.verts[i * 3].toFixed(4) + ',' + m.verts[i * 3 + 1].toFixed(4) + ',' + m.verts[i * 3 + 2].toFixed(4);
    let li = idx.get(k);
    if (li == null) { li = adj.length; idx.set(k, li); adj.push(new Set()); lrep.push(i); }
    v2l[i] = li;
  }
  for (let f = 0; f < m.faces.length / 3; f++) {
    const a = v2l[m.faces[f * 3]], b = v2l[m.faces[f * 3 + 1]], c = v2l[m.faces[f * 3 + 2]];
    adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
  }
  MO.v2l = v2l; MO.adj = adj; MO.lrep = lrep; MO.lcount = adj.length;
}

/* 在命中点施加一笔雕塑。hit = { point:局部坐标点, face:命中面（取法线） } */
function mfSculptApply(hit) {
  const m = MO.model;
  if (!m || !MO.v2l || !hit || !hit.face) return;
  const nv = m.verts.length / 3;
  if (nv > 120000) { if (CTXREF) CTXREF.toast('模型太大，雕塑带不动了（顶点 > 12 万）', 2400, 'err'); return; }
  const p = hit.point, n = hit.face.normal;
  const R = Math.max(0.02, MO.sculptR), R2 = R * R, S = MO.sculptS;
  const moved = new Map();            /* 逻辑顶点 → 新坐标 */
  for (let i = 0; i < nv; i++) {
    const dx = m.verts[i * 3] - p.x, dy = m.verts[i * 3 + 1] - p.y, dz = m.verts[i * 3 + 2] - p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > R2) continue;
    const li = MO.v2l[i];
    if (moved.has(li)) continue;
    if (MO._sculptAllow && !MO._sculptAllow.has(li)) continue;   /* 限定选中范围 */
    const t = 1 - d2 / R2, w = t * t;   /* 衰减：中心 1 → 边缘 0，二阶平滑 */
    let x = m.verts[i * 3], y = m.verts[i * 3 + 1], z = m.verts[i * 3 + 2];
    if (MO.sculptTool === 'raise') {
      x += n.x * S * w; y += n.y * S * w; z += n.z * S * w;
    } else if (MO.sculptTool === 'push') {
      /* 推平：向「过命中点、以命中面法线为法向」的平面投影 */
      const d = (x - p.x) * n.x + (y - p.y) * n.y + (z - p.z) * n.z;
      const k = Math.min(1, S * 6) * w;
      x -= n.x * d * k; y -= n.y * d * k; z -= n.z * d * k;
    } else {
      /* 平滑：拉普拉斯——向邻点均值靠拢，去棱角 */
      const nb = MO.adj[li];
      if (!nb || !nb.size) continue;
      let ax = 0, ay = 0, az = 0;
      nb.forEach((lj) => {
        const r = MO.lrep[lj] * 3;
        ax += m.verts[r]; ay += m.verts[r + 1]; az += m.verts[r + 2];
      });
      const inv = 1 / nb.size, k = Math.min(1, S * 10) * w;
      x += (ax * inv - x) * k; y += (ay * inv - y) * k; z += (az * inv - z) * k;
    }
    moved.set(li, [x, y, z]);
  }
  if (!moved.size) return;
  for (let i = 0; i < nv; i++) {
    const mv = moved.get(MO.v2l[i]);
    if (!mv) continue;
    m.verts[i * 3] = mv[0]; m.verts[i * 3 + 1] = mv[1]; m.verts[i * 3 + 2] = mv[2];
  }
  /* 增量提交：位置缓冲同一份就只刷新，法线按规模即时/延后重算 */
  const gp = MO.geo && MO.geo.attributes.position;
  if (MO.mesh && gp && gp.array === m.verts) {
    gp.needsUpdate = true;
    if (m.faces.length / 3 < 20000) MO.geo.computeVertexNormals(); else MO._needNorm = true;
  } else {
    mfModelRebuild();
  }
}
/* 抬笔收尾：大模型延迟到这一刻才重算法线（拖一笔算一次，不每帧算） */
function mfSculptFinish() {
  if (MO._needNorm && MO.geo) { try { MO.geo.computeVertexNormals(); } catch (e) { } }
  MO._needNorm = false;
  MO._sculptAllow = null;
}

/* 挤出：面顶点复制后沿法线移动，并补三个侧面 */
function mfModelExtrude() {
  const m = MO.model;
  if (!MO.sel.length) { if (CTXREF) CTXREF.toast('先选一个面（切到「选面」模式左键点一下）', 2600); return; }
  mfModelPushUndo();
  const c = hexToRgb(MO.color);
  let faces = Array.from(m.faces);
  let verts = Array.from(m.verts);
  let colors = Array.from(m.colors);
  MO.sel.forEach((fi) => {
    if (fi * 3 + 2 >= faces.length) return;
    const a = faces[fi * 3], b = faces[fi * 3 + 1], cc = faces[fi * 3 + 2];
    const p = (vi) => [verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2]];
    const A = p(a), B = p(b), C = p(cc);
    const n = mfNormal(A, B, C);
    const d = MO.extrude;
    const na = verts.length / 3;
    [A, B, C].forEach((P) => {
      verts.push(P[0] + n[0] * d, P[1] + n[1] * d, P[2] + n[2] * d);
      colors.push(c[0] / 255, c[1] / 255, c[2] / 255);
    });
    const nb = na + 1, nc = na + 2;
    /* 顶面改用新顶点 */
    faces[fi * 3] = na; faces[fi * 3 + 1] = nb; faces[fi * 3 + 2] = nc;
    /* 三个侧面 */
    faces.push(a, b, nb, a, nb, na);
    faces.push(b, cc, nc, b, nc, nb);
    faces.push(cc, a, na, cc, na, nc);
  });
  m.verts = new Float32Array(verts); m.colors = new Float32Array(colors); m.faces = new Uint32Array(faces);
  MO.sel = [];
  mfModelRebuild();
}
function mfNormal(A, B, C) {
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const L = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / L, n[1] / L, n[2] / L];
}
/* 细分：每个三角形 → 4 个 */
function mfModelSubdivide() {
  const m = MO.model;
  const nf = m.faces.length / 3;
  if (nf * 4 > 90000) { if (CTXREF) CTXREF.toast('面数过多，无法再细分', 2400, 'err'); return; }
  mfModelPushUndo();
  const verts = Array.from(m.verts), colors = Array.from(m.colors);
  const faces = [];
  const midCache = new Map();
  function mid(i, j) {
    const k = i < j ? i + '_' + j : j + '_' + i;
    if (midCache.has(k)) return midCache.get(k);
    const vi = verts.length / 3;
    verts.push((m.verts[i * 3] + m.verts[j * 3]) / 2, (m.verts[i * 3 + 1] + m.verts[j * 3 + 1]) / 2, (m.verts[i * 3 + 2] + m.verts[j * 3 + 2]) / 2);
    colors.push((m.colors[i * 3] + m.colors[j * 3]) / 2, (m.colors[i * 3 + 1] + m.colors[j * 3 + 1]) / 2, (m.colors[i * 3 + 2] + m.colors[j * 3 + 2]) / 2);
    midCache.set(k, vi);
    return vi;
  }
  for (let f = 0; f < nf; f++) {
    const a = m.faces[f * 3], b = m.faces[f * 3 + 1], c = m.faces[f * 3 + 2];
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    faces.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  m.verts = new Float32Array(verts); m.colors = new Float32Array(colors); m.faces = new Uint32Array(faces);
  mfModelRebuild();
}
let _scaleBase = null;
function mfModelScale(v, rel) {
  const m = MO.model;
  if (rel) {
    if (!_scaleBase) _scaleBase = new Float32Array(m.verts);
    const out = new Float32Array(_scaleBase.length);
    for (let i = 0; i < _scaleBase.length; i++) out[i] = _scaleBase[i] * v;
    m.verts = out;
  } else {
    const out = new Float32Array(m.verts.length);
    for (let i = 0; i < m.verts.length; i++) out[i] = m.verts[i] * v;
    m.verts = out;
    _scaleBase = null;
  }
  mfModelRebuild();
}
function mfModelRotate(axis) {
  const m = MO.model, a = Math.PI / 8;
  const c = Math.cos(a), s = Math.sin(a);
  const v = m.verts;
  for (let i = 0; i < v.length; i += 3) {
    let x = v[i], y = v[i + 1], z = v[i + 2];
    if (axis === 'y') { v[i] = x * c + z * s; v[i + 2] = -x * s + z * c; }
    else if (axis === 'x') { v[i + 1] = y * c - z * s; v[i + 2] = y * s + z * c; }
    else { v[i] = x * c - y * s; v[i + 1] = x * s + y * c; }
  }
  mfModelRebuild();
}
/* ---------------- 选择与结构操作（专业编辑扩展） ---------------- */
/* 去重边表：每个面三条边，顶点对排序后去重 */
function mfModelAllEdges(m) {
  const seen = new Set(), out = [];
  for (let f = 0; f < m.faces.length; f += 3) {
    for (let k = 0; k < 3; k++) {
      const a = m.faces[f + k], b = m.faces[f + (k + 1) % 3];
      const key = a < b ? a + '_' + b : b + '_' + a;
      if (seen.has(key)) continue;
      seen.add(key); out.push([a, b]);
    }
  }
  return out;
}
function mfModelSelectAll(kind) {
  const m = MO.model; if (!m) return;
  MO.selKind = kind;
  if (kind === 'face') { MO.sel = []; for (let i = 0; i < m.faces.length / 3; i++) MO.sel.push(i); }
  else if (kind === 'edge') MO.sel = mfModelAllEdges(m);
  else { MO.sel = []; for (let i = 0; i < m.verts.length / 3; i++) MO.sel.push(i); }
  mfModelRebuild();
}
function mfModelInvertSel() {
  const m = MO.model; if (!m) return;
  if (MO.selKind === 'edge') {
    const all = mfModelAllEdges(m);
    const cur = new Set(MO.sel.map((e) => Math.min(e[0], e[1]) + '_' + Math.max(e[0], e[1])));
    MO.sel = all.filter((e) => !cur.has(Math.min(e[0], e[1]) + '_' + Math.max(e[0], e[1])));
  } else if (MO.selKind === 'vert') {
    const cur = new Set(MO.sel), nv = m.verts.length / 3; MO.sel = [];
    for (let i = 0; i < nv; i++) if (!cur.has(i)) MO.sel.push(i);
  } else {
    const cur = new Set(MO.sel), nf = m.faces.length / 3; MO.sel = [];
    for (let i = 0; i < nf; i++) if (!cur.has(i)) MO.sel.push(i);
  }
  mfModelRebuild();
}
/* 删除：面模式删选中面；边/顶点模式删所有触及选中顶点的面（顶点本体保留，免得误伤邻面） */
function mfModelDeleteSel() {
  const m = MO.model;
  if (!m || !MO.sel.length) { if (CTXREF) CTXREF.toast('先在面/边/顶点模式下选中要删除的部分', 2600); return; }
  mfModelPushUndo();
  const kill = new Set();
  if (MO.selKind === 'face') MO.sel.forEach((fi) => kill.add(fi));
  else {
    const vs = new Set();
    if (MO.selKind === 'edge') MO.sel.forEach((e) => { vs.add(e[0]); vs.add(e[1]); });
    else MO.sel.forEach((vi) => vs.add(vi));
    for (let f = 0; f < m.faces.length / 3; f++) {
      if (vs.has(m.faces[f * 3]) || vs.has(m.faces[f * 3 + 1]) || vs.has(m.faces[f * 3 + 2])) kill.add(f);
    }
  }
  if (!kill.size) return;
  const faces = [];
  for (let f = 0; f < m.faces.length / 3; f++) if (!kill.has(f)) faces.push(m.faces[f * 3], m.faces[f * 3 + 1], m.faces[f * 3 + 2]);
  m.faces = new Uint32Array(faces);
  MO.sel = [];
  mfModelRebuild();
}
/* 焊接：间距小于 eps 的顶点合并为一个，顺带清掉塌陷成线的面（修裂缝、合并导入模型的重复顶点） */
function mfModelWeld(eps) {
  const m = MO.model; if (!m) return;
  eps = eps || 0.001;
  mfModelPushUndo();
  const nv = m.verts.length / 3, map = new Map(), remap = new Uint32Array(nv);
  const verts = [], colors = [];
  for (let i = 0; i < nv; i++) {
    const key = Math.round(m.verts[i * 3] / eps) + '_' + Math.round(m.verts[i * 3 + 1] / eps) + '_' + Math.round(m.verts[i * 3 + 2] / eps);
    let ni = map.get(key);
    if (ni == null) {
      ni = verts.length / 3; map.set(key, ni);
      verts.push(m.verts[i * 3], m.verts[i * 3 + 1], m.verts[i * 3 + 2]);
      colors.push(m.colors[i * 3], m.colors[i * 3 + 1], m.colors[i * 3 + 2]);
    }
    remap[i] = ni;
  }
  const faces = [];
  for (let f = 0; f < m.faces.length; f += 3) {
    const a = remap[m.faces[f]], b = remap[m.faces[f + 1]], c = remap[m.faces[f + 2]];
    if (a === b || b === c || a === c) continue;
    faces.push(a, b, c);
  }
  m.verts = new Float32Array(verts); m.colors = new Float32Array(colors); m.faces = new Uint32Array(faces);
  MO.sel = [];
  mfModelRebuild();
  if (CTXREF) CTXREF.toast('焊接完成：' + nv + ' → ' + (verts.length / 3) + ' 顶点', 2400, 'ok');
}
/* 翻转法线：翻面朝向。选中了面就翻选中的，否则翻整个模型 */
function mfModelFlipNormals() {
  const m = MO.model; if (!m) return;
  mfModelPushUndo();
  const list = (MO.selKind === 'face' && MO.sel.length) ? MO.sel : null;
  const nf = m.faces.length / 3;
  for (let f = 0; f < nf; f++) {
    if (list && list.indexOf(f) < 0) continue;
    const t = m.faces[f * 3 + 1]; m.faces[f * 3 + 1] = m.faces[f * 3 + 2]; m.faces[f * 3 + 2] = t;
  }
  mfModelRebuild();
}
/* 镜像复制 X：整个模型在 X 轴另一侧复制一份（朝向翻转）。对称物件只建一半，一键补齐 */
function mfModelMirrorCopyX() {
  const m = MO.model; if (!m) return;
  mfModelPushUndo();
  const nv = m.verts.length / 3, base = nv;
  const verts = Array.from(m.verts), colors = Array.from(m.colors), faces = Array.from(m.faces);
  for (let i = 0; i < nv; i++) {
    verts.push(-m.verts[i * 3], m.verts[i * 3 + 1], m.verts[i * 3 + 2]);
    colors.push(m.colors[i * 3], m.colors[i * 3 + 1], m.colors[i * 3 + 2]);
  }
  for (let f = 0; f < m.faces.length; f += 3) {
    faces.push(base + m.faces[f], base + m.faces[f + 2], base + m.faces[f + 1]);
  }
  m.verts = new Float32Array(verts); m.colors = new Float32Array(colors); m.faces = new Uint32Array(faces);
  mfModelRebuild();
}
/* 内插面：选中面向质心内缩生成新面，四周自动补壁（做窗框、凹槽、屋檐的第一步） */
function mfModelInset(k) {
  const m = MO.model;
  if (MO.selKind !== 'face' || !MO.sel.length) { if (CTXREF) CTXREF.toast('先在「面」模式下选中要内插的面', 2600); return; }
  k = k || 0.35;
  mfModelPushUndo();
  const verts = Array.from(m.verts), colors = Array.from(m.colors), faces = Array.from(m.faces);
  MO.sel.forEach((fi) => {
    if (fi * 3 + 2 >= faces.length) return;
    const a = faces[fi * 3], b = faces[fi * 3 + 1], cc = faces[fi * 3 + 2];
    const c = mfFaceCenter({ verts: m.verts, faces: faces }, fi);
    const na = verts.length / 3;
    [a, b, cc].forEach((vi) => {
      verts.push(m.verts[vi * 3] + (c[0] - m.verts[vi * 3]) * k,
        m.verts[vi * 3 + 1] + (c[1] - m.verts[vi * 3 + 1]) * k,
        m.verts[vi * 3 + 2] + (c[2] - m.verts[vi * 3 + 2]) * k);
      colors.push(m.colors[vi * 3], m.colors[vi * 3 + 1], m.colors[vi * 3 + 2]);
    });
    const nb = na + 1, nc = na + 2;
    faces[fi * 3] = na; faces[fi * 3 + 1] = nb; faces[fi * 3 + 2] = nc;
    faces.push(a, b, nb, a, nb, na);
    faces.push(b, cc, nc, b, nc, nb);
    faces.push(cc, a, na, cc, na, nc);
  });
  m.verts = new Float32Array(verts); m.colors = new Float32Array(colors); m.faces = new Uint32Array(faces);
  MO.sel = [];
  mfModelRebuild();
}

/* 数值变换目标顶点：无选中＝整个模型；有选中＝选中面/边/顶点涉及的顶点（含同坐标伴生点，防撕裂） */
function mfModelTargetVerts() {
  const m = MO.model, out = new Set();
  if (!MO.sel.length) { for (let i = 0; i < m.verts.length / 3; i++) out.add(i); return Array.from(out); }
  const addGroup = (vi) => mfSamePosVerts(m, vi).forEach((g) => out.add(g));
  if (MO.selKind === 'face') MO.sel.forEach((fi) => { if (fi * 3 + 2 < m.faces.length) { for (let k = 0; k < 3; k++) addGroup(m.faces[fi * 3 + k]); } });
  else if (MO.selKind === 'edge') MO.sel.forEach((e) => { addGroup(e[0]); addGroup(e[1]); });
  else MO.sel.forEach((vi) => addGroup(vi));
  return Array.from(out);
}
/* 数值变换：move=平移；rotate=绕所选中心按轴转 ang 度；scale=绕中心非均匀缩放 */
function mfModelTransform(kind, opt) {
  const m = MO.model; if (!m) return;
  const vs = mfModelTargetVerts();
  if (!vs.length) return;
  mfModelPushUndo();
  let cx = 0, cy = 0, cz = 0;
  vs.forEach((vi) => { cx += m.verts[vi * 3]; cy += m.verts[vi * 3 + 1]; cz += m.verts[vi * 3 + 2]; });
  const n = vs.length; cx /= n; cy /= n; cz /= n;
  if (kind === 'move') {
    vs.forEach((vi) => { m.verts[vi * 3] += opt.dx; m.verts[vi * 3 + 1] += opt.dy; m.verts[vi * 3 + 2] += opt.dz; });
  } else if (kind === 'rotate') {
    const a = (opt.ang || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    vs.forEach((vi) => {
      const x = m.verts[vi * 3] - cx, y = m.verts[vi * 3 + 1] - cy, z = m.verts[vi * 3 + 2] - cz;
      if (opt.axis === 'y') { m.verts[vi * 3] = cx + x * c + z * s; m.verts[vi * 3 + 2] = cz - x * s + z * c; }
      else if (opt.axis === 'x') { m.verts[vi * 3 + 1] = cy + y * c - z * s; m.verts[vi * 3 + 2] = cz + y * s + z * c; }
      else { m.verts[vi * 3] = cx + x * c - y * s; m.verts[vi * 3 + 1] = cy + x * s + y * c; }
    });
  } else if (kind === 'scale') {
    vs.forEach((vi) => {
      m.verts[vi * 3] = cx + (m.verts[vi * 3] - cx) * opt.sx;
      m.verts[vi * 3 + 1] = cy + (m.verts[vi * 3 + 1] - cy) * opt.sy;
      m.verts[vi * 3 + 2] = cz + (m.verts[vi * 3 + 2] - cz) * opt.sz;
    });
  }
  _scaleBase = null;
  mfModelRebuild();
}
/* 视角预设：前 / 顶 / 右 / 复位 */
function mfModelViewPreset(name) {
  if (!MO.camera || !MO.controls) return;
  const d = 2.6;
  if (name === 'front') MO.camera.position.set(0, 0.4, d);
  else if (name === 'top') MO.camera.position.set(0, d, 0.001);
  else if (name === 'right') MO.camera.position.set(d, 0.4, 0);
  else MO.camera.position.set(1.6, 1.1, 1.9);
  MO.controls.target.set(0, 0, 0);
  MO.controls.update();
}

/* 框选：把每个面的中心投到屏幕，落在矩形里的面全部选中 */
function mfRegionPick(x0, y0, x1, y1) {
  const m = MO.model;
  if (!m || !MO.camera || !MO.canvas) return [];
  const r = MO.canvas.getBoundingClientRect();
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const v = new THREE.Vector3(), out = [];
  const nf = m.faces.length / 3;
  for (let f = 0; f < nf; f++) {
    const a = m.faces[f * 3], b = m.faces[f * 3 + 1], c = m.faces[f * 3 + 2];
    v.set((m.verts[a * 3] + m.verts[b * 3] + m.verts[c * 3]) / 3,
      (m.verts[a * 3 + 1] + m.verts[b * 3 + 1] + m.verts[c * 3 + 1]) / 3,
      (m.verts[a * 3 + 2] + m.verts[b * 3 + 2] + m.verts[c * 3 + 2]) / 3);
    v.project(MO.camera);
    if (v.z > 1) continue;                       /* 在相机背后 */
    const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
    if (sx >= xa && sx <= xb && sy >= ya && sy <= yb) out.push(f);
  }
  return out;
}

/* 复制选中面：复制涉及的顶点与面，沿法线微微抬起，副本自动选中便于拖走 */
function mfModelCopySel() {
  const m = MO.model;
  if (MO.selKind !== 'face' || !MO.sel.length) { if (CTXREF) CTXREF.toast('先在「面」模式或「⬚ 框选」里选中要复制的部分', 2600); return; }
  mfModelPushUndo();
  const vset = new Set();
  MO.sel.forEach((fi) => { if (fi * 3 + 2 < m.faces.length) { for (let k = 0; k < 3; k++) vset.add(m.faces[fi * 3 + k]); } });
  if (!vset.size) return;
  const f0 = MO.sel[0];
  const p = (vi) => [m.verts[vi * 3], m.verts[vi * 3 + 1], m.verts[vi * 3 + 2]];
  const n = mfNormal(p(m.faces[f0 * 3]), p(m.faces[f0 * 3 + 1]), p(m.faces[f0 * 3 + 2]));
  const off = 0.06;
  const verts = Array.from(m.verts), colors = Array.from(m.colors), faces = Array.from(m.faces);
  const remap = new Map();
  vset.forEach((vi) => {
    const ni = verts.length / 3;
    remap.set(vi, ni);
    verts.push(m.verts[vi * 3] + n[0] * off, m.verts[vi * 3 + 1] + n[1] * off, m.verts[vi * 3 + 2] + n[2] * off);
    colors.push(m.colors[vi * 3], m.colors[vi * 3 + 1], m.colors[vi * 3 + 2]);
  });
  const newSel = [];
  MO.sel.forEach((fi) => {
    if (fi * 3 + 2 >= m.faces.length) return;
    faces.push(remap.get(m.faces[fi * 3]), remap.get(m.faces[fi * 3 + 1]), remap.get(m.faces[fi * 3 + 2]));
    newSel.push(faces.length / 3 - 1);
  });
  m.verts = new Float32Array(verts); m.colors = new Float32Array(colors); m.faces = new Uint32Array(faces);
  MO.sel = newSel;
  mfModelRebuild();
  if (CTXREF) CTXREF.toast('已复制并选中副本：直接拖动，或用「数值变换」精确移动', 2800, 'ok');
}

/* 选中边的当前长度（取第一条） */
function mfModelEdgeLenCur() {
  const m = MO.model;
  if (MO.selKind !== 'edge' || !MO.sel.length) return null;
  const e = MO.sel[0];
  const dx = m.verts[e[0] * 3] - m.verts[e[1] * 3],
    dy = m.verts[e[0] * 3 + 1] - m.verts[e[1] * 3 + 1],
    dz = m.verts[e[0] * 3 + 2] - m.verts[e[1] * 3 + 2];
  return Math.hypot(dx, dy, dz);
}
/* 把选中的边统一调到指定长度：中点不动，两端对称伸缩（同坐标伴生点一起动，防撕裂） */
function mfModelEdgeSetLength(L) {
  const m = MO.model;
  if (MO.selKind !== 'edge' || !MO.sel.length) { if (CTXREF) CTXREF.toast('先在「边」模式选中要调整的边', 2400); return; }
  if (!(L > 0)) { if (CTXREF) CTXREF.toast('长度要大于 0', 2000, 'err'); return; }
  mfModelPushUndo();
  MO.sel.forEach((e) => {
    const a = e[0], b = e[1];
    const ax = m.verts[a * 3], ay = m.verts[a * 3 + 1], az = m.verts[a * 3 + 2];
    const dx = m.verts[b * 3] - ax, dy = m.verts[b * 3 + 1] - ay, dz = m.verts[b * 3 + 2] - az;
    const cur = Math.hypot(dx, dy, dz);
    if (cur < 1e-9) return;
    const mx = ax + dx / 2, my = ay + dy / 2, mz = az + dz / 2, k = L / 2 / cur;
    const nax = mx - dx * k, nay = my - dy * k, naz = mz - dz * k;
    const nbx = mx + dx * k, nby = my + dy * k, nbz = mz + dz * k;
    mfSamePosVerts(m, a).forEach((vi) => { m.verts[vi * 3] = nax; m.verts[vi * 3 + 1] = nay; m.verts[vi * 3 + 2] = naz; });
    mfSamePosVerts(m, b).forEach((vi) => { m.verts[vi * 3] = nbx; m.verts[vi * 3 + 1] = nby; m.verts[vi * 3 + 2] = nbz; });
  });
  _scaleBase = null;
  mfModelRebuild();
}

/* 选中面的局部坐标架：质心 + 沿第一条边的「长」方向 + 面内垂直的「宽」方向 */
function mfModelFaceFrame() {
  const m = MO.model;
  if (MO.selKind !== 'face' || !MO.sel.length) return null;
  const f0 = MO.sel[0];
  if (f0 * 3 + 2 >= m.faces.length) return null;
  const p = (vi) => [m.verts[vi * 3], m.verts[vi * 3 + 1], m.verts[vi * 3 + 2]];
  const A = p(m.faces[f0 * 3]), B = p(m.faces[f0 * 3 + 1]), C3 = p(m.faces[f0 * 3 + 2]);
  const n = mfNormal(A, B, C3);
  let e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const L = Math.hypot(e1[0], e1[1], e1[2]);
  if (L < 1e-9) e1 = [1, 0, 0]; else e1 = [e1[0] / L, e1[1] / L, e1[2] / L];
  const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
  const vset = new Set();
  MO.sel.forEach((fi) => { if (fi * 3 + 2 < m.faces.length) { for (let k = 0; k < 3; k++) vset.add(m.faces[fi * 3 + k]); } });
  const groups = new Set();
  vset.forEach((vi) => mfSamePosVerts(m, vi).forEach((g) => groups.add(g)));
  const verts = Array.from(groups);
  if (!verts.length) return null;
  let cx = 0, cy = 0, cz = 0;
  verts.forEach((vi) => { cx += m.verts[vi * 3]; cy += m.verts[vi * 3 + 1]; cz += m.verts[vi * 3 + 2]; });
  const nv = verts.length; cx /= nv; cy /= nv; cz /= nv;
  let w0 = 0, h0 = 0;
  verts.forEach((vi) => {
    const dx = m.verts[vi * 3] - cx, dy = m.verts[vi * 3 + 1] - cy, dz = m.verts[vi * 3 + 2] - cz;
    w0 = Math.max(w0, Math.abs(dx * e1[0] + dy * e1[1] + dz * e1[2]));
    h0 = Math.max(h0, Math.abs(dx * e2[0] + dy * e2[1] + dz * e2[2]));
  });
  return { C: [cx, cy, cz], e1: e1, e2: e2, n: n, verts: verts, w0: w0 * 2, h0: h0 * 2 };
}
function mfModelFaceDimsCur() {
  const fr = mfModelFaceFrame();
  return fr ? [fr.w0, fr.h0] : null;
}
/* 把选中面片在它自己的平面里调到指定长宽（厚度方向不动） */
function mfModelFaceSetDims(w, h) {
  const m = MO.model;
  const fr = mfModelFaceFrame();
  if (!fr) { if (CTXREF) CTXREF.toast('先在「面」模式选中要调整的面', 2400); return; }
  const sx = (w > 0 && fr.w0 > 1e-9) ? w / fr.w0 : 1;
  const sy = (h > 0 && fr.h0 > 1e-9) ? h / fr.h0 : 1;
  mfModelPushUndo();
  fr.verts.forEach((vi) => {
    const dx = m.verts[vi * 3] - fr.C[0], dy = m.verts[vi * 3 + 1] - fr.C[1], dz = m.verts[vi * 3 + 2] - fr.C[2];
    const u = (dx * fr.e1[0] + dy * fr.e1[1] + dz * fr.e1[2]) * sx;
    const v = (dx * fr.e2[0] + dy * fr.e2[1] + dz * fr.e2[2]) * sy;
    const t = dx * fr.n[0] + dy * fr.n[1] + dz * fr.n[2];
    m.verts[vi * 3] = fr.C[0] + fr.e1[0] * u + fr.e2[0] * v + fr.n[0] * t;
    m.verts[vi * 3 + 1] = fr.C[1] + fr.e1[1] * u + fr.e2[1] * v + fr.n[1] * t;
    m.verts[vi * 3 + 2] = fr.C[2] + fr.e1[2] * u + fr.e2[2] * v + fr.n[2] * t;
  });
  _scaleBase = null;
  mfModelRebuild();
}

/* ---------------- 可调尺寸的基础件 ---------------- */
function mfMakeCuboid(w, h, d) {
  const g = mfGeom();
  const x = (w || 0.6) / 2, y = (h || 0.6) / 2, z = (d || 0.6) / 2;
  const P = [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
  P.forEach((p) => { g.verts.push(p[0], p[1], p[2]); g.colors.push(0.76, 0.72, 0.62); });
  const F = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1],
  [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
  F.forEach((f) => g.faces.push(f[0], f[1], f[2]));
  return g;
}
function mfMakePrism(n, r, h) {
  n = Math.max(3, Math.round(n || 6)); r = r || 0.45; h = h || 0.8;
  const g = mfGeom();
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.verts.push(r * Math.cos(a), -h / 2, r * Math.sin(a)); g.colors.push(0.76, 0.72, 0.62); }
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.verts.push(r * Math.cos(a), h / 2, r * Math.sin(a)); g.colors.push(0.76, 0.72, 0.62); }
  for (let i = 1; i < n - 1; i++) g.faces.push(0, i + 1, i);
  for (let i = 1; i < n - 1; i++) g.faces.push(n, n + i, n + i + 1);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; g.faces.push(i, j, n + j, i, n + j, n + i); }
  return g;
}
function mfMakePyramid(n, r, h) {
  n = Math.max(3, Math.round(n || 4)); r = r || 0.5; h = h || 0.9;
  const g = mfGeom();
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.verts.push(r * Math.cos(a), -h / 2, r * Math.sin(a)); g.colors.push(0.76, 0.72, 0.62); }
  g.verts.push(0, h / 2, 0); g.colors.push(0.76, 0.72, 0.62);
  for (let i = 1; i < n - 1; i++) g.faces.push(0, i + 1, i);
  for (let i = 0; i < n; i++) g.faces.push(i, (i + 1) % n, n);
  return g;
}
/* 基础件参数对话框：输入尺寸后生成；生成后仍可用「数值变换」继续调 */
/* ---- 几何拼装器：把一个几何体平移/缩放/绕Y旋转/染色后并入另一个 ---- */
function mfGeomAdd(dst, part, dx, dy, dz, sx, sy, sz, tint, ry) {
  const base = dst.verts.length / 3;
  sx = sx == null ? 1 : sx; sy = sy == null ? sx : sy; sz = sz == null ? sx : sz;
  const c = ry ? Math.cos(ry) : 1, s = ry ? Math.sin(ry) : 0;
  for (let i = 0; i < part.verts.length; i += 3) {
    const x = part.verts[i] * sx, y = part.verts[i + 1] * sy, z = part.verts[i + 2] * sz;
    dst.verts.push(x * c - z * s + (dx || 0), y + (dy || 0), x * s + z * c + (dz || 0));
  }
  for (let i = 0; i < part.colors.length; i += 3) {
    if (tint) dst.colors.push(tint[0], tint[1], tint[2]);
    else dst.colors.push(part.colors[i], part.colors[i + 1], part.colors[i + 2]);
  }
  for (let i = 0; i < part.faces.length; i++) dst.faces.push(base + part.faces[i]);
  return dst;
}
/* 圆管：空心圆柱——只有外壁内壁和上下环面，没有底盖（烟囱、隧道、井圈） */
function mfMakeTube(R, RI, H, NR) {
  const g = mfGeom();
  NR = Math.max(3, Math.round(NR || 24));
  R = R || 0.4; RI = RI == null ? R * 0.78 : RI; H = H || 0.9;
  for (let i = 0; i < NR; i++) { const a = i / NR * Math.PI * 2; g.verts.push(R * Math.cos(a), -H / 2, R * Math.sin(a)); g.colors.push(0.76, 0.72, 0.62); }
  for (let i = 0; i < NR; i++) { const a = i / NR * Math.PI * 2; g.verts.push(R * Math.cos(a), H / 2, R * Math.sin(a)); g.colors.push(0.76, 0.72, 0.62); }
  for (let i = 0; i < NR; i++) { const a = i / NR * Math.PI * 2; g.verts.push(RI * Math.cos(a), -H / 2, RI * Math.sin(a)); g.colors.push(0.62, 0.58, 0.5); }
  for (let i = 0; i < NR; i++) { const a = i / NR * Math.PI * 2; g.verts.push(RI * Math.cos(a), H / 2, RI * Math.sin(a)); g.colors.push(0.62, 0.58, 0.5); }
  for (let i = 0; i < NR; i++) {
    const j = (i + 1) % NR;
    g.faces.push(i, j, NR + j, i, NR + j, NR + i);                          /* 外壁 */
    g.faces.push(2 * NR + i, 3 * NR + j, 2 * NR + j, 2 * NR + i, 3 * NR + i, 3 * NR + j);  /* 内壁（反向） */
    g.faces.push(NR + i, NR + j, 3 * NR + j, NR + i, 3 * NR + j, 3 * NR + i);              /* 顶环 */
    g.faces.push(i, 2 * NR + j, j, i, 2 * NR + i, 2 * NR + j);                            /* 底环 */
  }
  return g;
}
/* 弧管：圆管沿弧线弯一段（arc 弧度，π＝半圆拱门） */
function mfMakeArcTube(R, r, arc, NS, NT) {
  const g = mfGeom();
  R = R || 0.5; r = r || 0.12; arc = arc || Math.PI;
  NS = Math.max(4, Math.round(NS || 20)); NT = Math.max(4, Math.round(NT || 10));
  for (let j = 0; j <= NS; j++) {
    const th = j / NS * arc, cx = R * Math.cos(th), cy = R * Math.sin(th);
    for (let i = 0; i < NT; i++) {
      const ph = i / NT * Math.PI * 2;
      g.verts.push(cx + r * Math.cos(ph) * Math.cos(th), cy + r * Math.cos(ph) * Math.sin(th), r * Math.sin(ph));
      g.colors.push(0.76, 0.72, 0.62);
    }
  }
  for (let j = 0; j < NS; j++) {
    for (let i = 0; i < NT; i++) {
      const i2 = (i + 1) % NT;
      const a = j * NT + i, b = j * NT + i2, c2 = (j + 1) * NT + i2, d2 = (j + 1) * NT + i;
      g.faces.push(a, b, c2, a, c2, d2);
    }
  }
  return g;
}
/* 旋转体（lathe）：给一条自下而上的轮廓线 [[半径,高度]…]，绕 Y 轴旋出碗/瓶/碟 */
function mfMakeLathe(pts, NS) {
  const g = mfGeom();
  NS = Math.max(6, Math.round(NS || 24));
  const NP = pts.length;
  for (let j = 0; j < NP; j++)
    for (let i = 0; i < NS; i++) {
      const a = i / NS * Math.PI * 2;
      g.verts.push(pts[j][0] * Math.cos(a), pts[j][1], pts[j][0] * Math.sin(a));
      g.colors.push(0.76, 0.72, 0.62);
    }
  for (let j = 0; j < NP - 1; j++)
    for (let i = 0; i < NS; i++) {
      const i2 = (i + 1) % NS;
      const a = j * NS + i, b = j * NS + i2, c2 = (j + 1) * NS + i2, d2 = (j + 1) * NS + i;
      g.faces.push(a, d2, c2, a, c2, b);
    }
  if (pts[0][0] > 0.001) {
    const c0 = g.verts.length / 3;
    g.verts.push(0, pts[0][1], 0); g.colors.push(0.76, 0.72, 0.62);
    for (let i = 0; i < NS; i++) g.faces.push(c0, (i + 1) % NS, i);
  }
  if (pts[NP - 1][0] > 0.001) {
    const c1 = g.verts.length / 3;
    g.verts.push(0, pts[NP - 1][1], 0); g.colors.push(0.76, 0.72, 0.62);
    const last = (NP - 1) * NS;
    for (let i = 0; i < NS; i++) g.faces.push(c1, last + i, last + (i + 1) % NS);
  }
  return g;
}
/* 胶囊：两头半圆的柱子 */
function mfMakeCapsule(R, H) {
  R = R || 0.24; H = H == null ? 0.4 : H;
  const pts = [], seg = 6;
  for (let k = 0; k <= seg; k++) { const a = -Math.PI / 2 + k / seg * Math.PI / 2; pts.push([Math.max(0.001, R * Math.cos(a)), -H / 2 + R * Math.sin(a)]); }
  pts.push([R, H / 2]);
  for (let k = 1; k <= seg; k++) { const a = k / seg * Math.PI / 2; pts.push([Math.max(0.001, R * Math.cos(a)), H / 2 + R * Math.sin(a)]); }
  return mfMakeLathe(pts, 20);
}
/* 楔体：直角斜坡（屋顶坡面、斜坡、滑坡体） */
function mfMakeWedge(w, h, d) {
  const g = mfGeom();
  const x = (w || 0.8) / 2, y = (h || 0.5) / 2, z = (d || 0.6) / 2;
  const P = [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [-x, y, -z], [-x, y, z]];
  P.forEach((p) => { g.verts.push(p[0], p[1], p[2]); g.colors.push(0.76, 0.72, 0.62); });
  [[0, 2, 1], [0, 3, 2], [1, 2, 5], [1, 5, 4], [0, 4, 5], [0, 5, 3], [0, 1, 4], [2, 3, 5]]
    .forEach((f) => g.faces.push(f[0], f[1], f[2]));
  return g;
}
/* 星形柱：2N 点交替半径的棱柱（N=5 薄片是星星，N=8 厚片是齿轮） */
function mfMakeStarPrism(N, R, r, H) {
  const g = mfGeom();
  N = Math.max(3, Math.round(N || 5)); R = R || 0.55; r = r || R * 0.45; H = H || 0.1;
  for (let ring = 0; ring < 2; ring++)
    for (let i = 0; i < 2 * N; i++) {
      const a = i / (2 * N) * Math.PI * 2, rr = (i % 2 === 0) ? R : r;
      g.verts.push(rr * Math.cos(a), (ring ? 1 : -1) * H / 2, rr * Math.sin(a));
      g.colors.push(0.76, 0.72, 0.62);
    }
  const ct = g.verts.length / 3; g.verts.push(0, H / 2, 0); g.colors.push(0.76, 0.72, 0.62);
  const cb = g.verts.length / 3; g.verts.push(0, -H / 2, 0); g.colors.push(0.76, 0.72, 0.62);
  for (let i = 0; i < 2 * N; i++) {
    const j = (i + 1) % (2 * N);
    g.faces.push(i, j, 2 * N + j, i, 2 * N + j, 2 * N + i);   /* 侧壁 */
    g.faces.push(ct, 2 * N + i, 2 * N + j);                    /* 顶面扇 */
    g.faces.push(cb, j, i);                                    /* 底面扇 */
  }
  return g;
}
/* 阶梯：n 级台阶 */
function mfMakeStairs(n, w, sh, sd) {
  n = Math.max(2, Math.round(n || 5)); w = w || 0.8; sh = sh || 0.09; sd = sd || 0.16;
  const g = mfGeom();
  for (let k = 0; k < n; k++)
    mfGeomAdd(g, mfMakeCuboid(w, sh * (k + 1), sd), 0, sh * (k + 1) / 2, (n - 1) * sd / 2 - k * sd);
  return g;
}
/* 椭球：竖向压扁的球 */
function mfMakeEllipsoid(R, YK) {
  const g = mfMakeSphere(R || 0.5, 16, 12), k = YK == null ? 0.62 : YK;
  for (let i = 0; i < g.verts.length; i += 3) g.verts[i + 1] *= k;
  return g;
}
/* ===================== 基础体图鉴（看得见形状地挑预制体） =====================
 * dlg 字段：[标题, 参数栏, 生成函数]，右键卡片时弹出参数对话框 */
const MF_PRIMS = [
  /* ---- 基础形 ---- */
  { id: 'blank', cat: '基础形', name: '空白', tip: '一无所有，从第一个面开始捏', mk: () => mfGeom() },
  { id: 'plane', cat: '基础形', name: '平面', tip: '地面、纸、水面薄片', mk: () => mfMakePlane(), dlg: ['平面', [['w', '长', 1.0], ['d', '宽', 1.0]], (p) => mfMakePlane(p.w, p.d)] },
  { id: 'cube', cat: '基础形', name: '正方体', tip: '骰子、箱子、石块', mk: () => mfMakeCuboid(0.6, 0.6, 0.6) },
  { id: 'cuboid', cat: '基础形', name: '长方体', tip: '墙、楼、箱——万物起点', mk: () => mfMakeCuboid(0.9, 0.5, 0.6), dlg: ['长方体', [['w', '长', 0.9], ['h', '高', 0.5], ['d', '宽', 0.6]], (p) => mfMakeCuboid(p.w, p.h, p.d)] },
  { id: 'wall', cat: '基础形', name: '墙板（薄）', tip: '隔墙、屏风、甲板、招牌', mk: () => mfMakeCuboid(1.0, 0.7, 0.08), dlg: ['墙板', [['w', '长', 1.0], ['h', '高', 0.7], ['d', '厚', 0.08]], (p) => mfMakeCuboid(p.w, p.h, p.d)] },
  { id: 'sphere', cat: '基础形', name: '球体', tip: '星球、果子、卵石', mk: () => mfMakeSphere(0.5, 16, 12), dlg: ['球体', [['r', '半径', 0.5], ['ns', '经向分段（越大越圆）', 16, 4], ['nr', '纬向分段', 12, 3]], (p) => mfMakeSphere(p.r, p.ns, p.nr)] },
  { id: 'dome', cat: '基础形', name: '半球罩', tip: '穹顶、帐篷顶、小山包', mk: () => mfMakeDome(0.5, 16, 8), dlg: ['半球罩', [['r', '半径', 0.5], ['ns', '经向分段', 16, 4], ['nr', '纬向分段', 8, 2]], (p) => mfMakeDome(p.r, p.ns, p.nr)] },
  { id: 'elli', cat: '基础形', name: '椭球', tip: '压扁的球：巨石、软垫、飞碟胚子', mk: () => mfMakeEllipsoid(0.5, 0.62), dlg: ['椭球', [['r', '半径', 0.5], ['k', '压扁程度（越小越扁）', 0.62]], (p) => mfMakeEllipsoid(p.r, p.k)] },
  /* ---- 管环与曲面 ---- */
  { id: 'tube', cat: '管环与曲面', name: '圆管（空心）', tip: '只有外壁的空心筒：烟囱、隧道口、井圈、望远镜', mk: () => mfMakeTube(0.4, 0.31, 0.9, 24), dlg: ['圆管', [['R', '外半径', 0.4], ['RI', '内半径', 0.31], ['h', '高', 0.9], ['n', '分段', 24, 3]], (p) => mfMakeTube(p.R, p.RI, p.h, p.n)] },
  { id: 'torus', cat: '管环与曲面', name: '圆环', tip: '戒指、轮胎、甜甜圈、城门环', mk: () => mfMakeTorus(0.5, 0.16, 28, 14), dlg: ['圆环', [['R', '环半径', 0.5], ['r', '管半径', 0.16], ['ns', '主分段', 28, 6], ['nt', '管分段', 14, 4]], (p) => mfMakeTorus(p.R, p.r, p.ns, p.nt)] },
  { id: 'arch', cat: '管环与曲面', name: '拱门（半环）', tip: '门洞、桥洞、彩虹、凯旋门', mk: () => mfMakeArcTube(0.5, 0.12, Math.PI, 20, 10), dlg: ['拱门', [['R', '拱半径', 0.5], ['r', '拱条粗细', 0.12], ['ns', '弧度分段', 20, 4]], (p) => mfMakeArcTube(p.R, p.r, Math.PI, p.ns, 10)] },
  { id: 'frustum', cat: '管环与曲面', name: '圆台', tip: '上细下粗：塔基、灯罩、火山口', mk: () => mfMakeFrustum(0.3, 0.5, 0.8, 24), dlg: ['圆台', [['rt', '顶半径', 0.3], ['rb', '底半径', 0.5], ['h', '高', 0.8], ['n', '分段', 24, 3]], (p) => mfMakeFrustum(p.rt, p.rb, p.h, p.n)] },
  { id: 'bowl', cat: '管环与曲面', name: '碗', tip: '碗、盆、陨石坑、露天剧场', mk: () => mfMakeLathe([[0.06, 0], [0.3, 0.02], [0.42, 0.1], [0.5, 0.26], [0.52, 0.4]], 24) },
  { id: 'vase', cat: '管环与曲面', name: '花瓶', tip: '瓶瓶罐罐，旋转成型的腰身', mk: () => mfMakeLathe([[0.02, 0], [0.28, 0], [0.34, 0.06], [0.3, 0.18], [0.18, 0.34], [0.14, 0.5], [0.2, 0.62], [0.24, 0.68]], 24) },
  { id: 'capsule', cat: '管环与曲面', name: '胶囊', tip: '两头圆的柱子：飞船舱、潜艇、药丸', mk: () => mfMakeCapsule(0.24, 0.4), dlg: ['胶囊', [['r', '半径', 0.24], ['h', '直筒段长', 0.4]], (p) => mfMakeCapsule(p.r, p.h)] },
  { id: 'ufo', cat: '管环与曲面', name: '飞碟', tip: '碟形天体，也可以倒过来当斗笠', mk: () => mfMakeLathe([[0.02, -0.1], [0.5, -0.06], [0.58, 0], [0.5, 0.06], [0.3, 0.1], [0.2, 0.18], [0.02, 0.2]], 28) },
  /* ---- 尖棱与星 ---- */
  { id: 'cone', cat: '尖棱与星', name: '圆锥', tip: '山、尖顶、雪糕筒', mk: () => mfMakeCone(0.5, 1.0, 24), dlg: ['圆锥', [['r', '半径', 0.5], ['h', '高', 1.0], ['n', '分段（越大越圆）', 24, 3]], (p) => mfMakeCone(p.r, p.h, p.n)] },
  { id: 'cyl', cat: '尖棱与星', name: '圆柱', tip: '柱子、树干、塔身、蛋糕', mk: () => mfMakeCylinder(0.42, 0.9, 24), dlg: ['圆柱', [['r', '半径', 0.42], ['h', '高', 0.9], ['n', '分段（越大越圆）', 24, 3]], (p) => mfMakeCylinder(p.r, p.h, p.n)] },
  { id: 'pri3', cat: '尖棱与星', name: '三棱柱', tip: '三棱镜、屋顶桁架胚', mk: () => mfMakePrism(3, 0.5, 0.7) },
  { id: 'pri5', cat: '尖棱与星', name: '五棱柱', tip: '五边柱，碉楼角楼', mk: () => mfMakePrism(5, 0.45, 0.8) },
  { id: 'pri6', cat: '尖棱与星', name: '六棱柱', tip: '铅笔、螺栓头、蜂巢格', mk: () => mfMakePrism(6, 0.45, 0.8), dlg: ['棱柱', [['n', '边数', 6, 3], ['r', '半径', 0.45], ['h', '高', 0.8]], (p) => mfMakePrism(p.n, p.r, p.h)] },
  { id: 'pri8', cat: '尖棱与星', name: '八棱柱', tip: '接近圆的棱柱：亭子、塔', mk: () => mfMakePrism(8, 0.45, 0.8) },
  { id: 'pyr4', cat: '尖棱与星', name: '四棱锥', tip: '金字塔，千古一锥', mk: () => mfMakePyramid(4, 0.5, 0.9) },
  { id: 'pyr6', cat: '尖棱与星', name: '六棱锥', tip: '亭子尖顶、六角塔刹', mk: () => mfMakePyramid(6, 0.5, 0.9), dlg: ['棱锥', [['n', '边数', 6, 3], ['r', '半径', 0.5], ['h', '高', 0.9]], (p) => mfMakePyramid(p.n, p.r, p.h)] },
  { id: 'wedge', cat: '尖棱与星', name: '楔体（斜坡）', tip: '斜坡、屋顶坡面、滑坡体', mk: () => mfMakeWedge(0.8, 0.5, 0.6), dlg: ['楔体', [['w', '宽', 0.8], ['h', '高', 0.5], ['d', '深', 0.6]], (p) => mfMakeWedge(p.w, p.h, p.d)] },
  { id: 'gear', cat: '尖棱与星', name: '星形柱（齿轮）', tip: '齿轮、星形勋章座、锯轮', mk: () => mfMakeStarPrism(8, 0.5, 0.38, 0.2), dlg: ['星形柱', [['n', '角数', 8, 3], ['R', '外半径', 0.5], ['r', '内半径', 0.38], ['h', '厚', 0.2]], (p) => mfMakeStarPrism(p.n, p.R, p.r, p.h)] },
  { id: 'star', cat: '尖棱与星', name: '五角星', tip: '星星薄片：装饰、勋章、树顶星', mk: () => mfMakeStarPrism(5, 0.55, 0.23, 0.08) },
  /* ---- 组合造型 ---- */
  { id: 'stairs', cat: '组合造型', name: '阶梯', tip: '楼梯、看台、梯田、金字塔台阶', mk: () => mfMakeStairs(5, 0.8, 0.09, 0.16), dlg: ['阶梯', [['n', '级数', 5, 2], ['w', '宽', 0.8], ['sh', '级高', 0.09], ['sd', '级深', 0.16]], (p) => mfMakeStairs(p.n, p.w, p.sh, p.sd)] },
  { id: 'house', cat: '组合造型', name: '小屋', tip: '方身尖顶带门，一间现成的小房子', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeCuboid(0.8, 0.5, 0.7), 0, 0.25, 0); mfGeomAdd(g, mfMakePyramid(4, 0.66, 0.35), 0, 0.675, 0, 1, 1, 1, [0.62, 0.3, 0.22], Math.PI / 4); mfGeomAdd(g, mfMakeCuboid(0.16, 0.26, 0.04), 0, 0.13, 0.36, 1, 1, 1, [0.3, 0.2, 0.12]); return g; } },
  { id: 'column', cat: '组合造型', name: '罗马柱', tip: '带顶底座的石柱，殿堂标配', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeCylinder(0.14, 0.7, 16), 0, 0.35, 0); mfGeomAdd(g, mfMakeCuboid(0.4, 0.06, 0.4), 0, 0.73, 0); mfGeomAdd(g, mfMakeCuboid(0.36, 0.06, 0.36), 0, -0.02, 0); return g; } },
  { id: 'mushroom', cat: '组合造型', name: '蘑菇', tip: '白柄红伞，森林的味道', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeCylinder(0.09, 0.28, 12), 0, 0.14, 0, 1, 1, 1, [0.92, 0.9, 0.84]); mfGeomAdd(g, mfMakeDome(0.26, 16, 6), 0, 0.26, 0, 1, 1, 1, [0.72, 0.24, 0.18]); return g; } },
  { id: 'tree', cat: '组合造型', name: '圆锥树', tip: '棕干绿冠，一棵标致的小树', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeCylinder(0.06, 0.2, 10), 0, 0.1, 0, 1, 1, 1, [0.4, 0.28, 0.16]); mfGeomAdd(g, mfMakeCone(0.32, 0.55, 16), 0, 0.5, 0, 1, 1, 1, [0.24, 0.44, 0.22]); return g; } },
  { id: 'obelisk', cat: '组合造型', name: '方尖碑', tip: '纪念碑、石碑、里程碑', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeFrustum(0.09, 0.14, 0.7, 4), 0, 0.35, 0, 1, 1, 1, null, Math.PI / 4); mfGeomAdd(g, mfMakePyramid(4, 0.1, 0.12), 0, 0.76, 0, 1, 1, 1, null, Math.PI / 4); return g; } },
  { id: 'cross', cat: '组合造型', name: '十字柱', tip: '十字交叉的立柱：风车轴、路标杆', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeCuboid(0.16, 0.9, 0.16), 0, 0.45, 0); mfGeomAdd(g, mfMakeCuboid(0.5, 0.14, 0.14), 0, 0.62, 0); mfGeomAdd(g, mfMakeCuboid(0.14, 0.14, 0.5), 0, 0.62, 0); return g; } },
  { id: 'rampart', cat: '组合造型', name: '城墙段', tip: '带垛口的一段城墙，接龙即成万里长城', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeCuboid(1.0, 0.5, 0.24), 0, 0.25, 0); for (let k = 0; k < 4; k++) mfGeomAdd(g, mfMakeCuboid(0.12, 0.12, 0.24), -0.36 + k * 0.24, 0.56, 0); return g; } }
,
  /* ---- 自然造物 ---- */
  { id: 'hill', cat: '自然造物', name: '山丘', tip: '圆润的绿丘，丘陵地带的主角', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeLathe([[0.02, 0], [0.55, 0.02], [0.48, 0.1], [0.34, 0.2], [0.18, 0.28], [0.02, 0.32]], 20), 0, 0, 0, 1, 1, 1, [0.42, 0.5, 0.28]); return g; }, dlg: ['山丘', [['r', '半径', 0.55], ['h', '高', 0.32]], (p) => { const g = mfGeom(); mfGeomAdd(g, mfMakeLathe([[0.02, 0], [p.r, p.h * 0.06], [p.r * 0.87, p.h * 0.3], [p.r * 0.62, p.h * 0.62], [p.r * 0.33, p.h * 0.88], [0.02, p.h]], 20), 0, 0, 0, 1, 1, 1, [0.42, 0.5, 0.28]); return g; }] },
  { id: 'volcano', cat: '自然造物', name: '火山', tip: '带火山口的锥形山，口里还亮着岩浆', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeLathe([[0.02, 0], [0.56, 0.02], [0.44, 0.28], [0.3, 0.5], [0.22, 0.58], [0.25, 0.52], [0.13, 0.47], [0.02, 0.45]], 22), 0, 0, 0, 1, 1, 1, [0.42, 0.34, 0.3]); mfGeomAdd(g, mfMakeCylinder(0.12, 0.02, 18), 0, 0.46, 0, 1, 1, 1, [0.92, 0.42, 0.14]); return g; } },
  { id: 'snowpeak', cat: '自然造物', name: '雪山峰', tip: '灰岩山体戴一顶雪帽子', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeCone(0.5, 0.9, 18), 0, 0.45, 0, 1, 1, 1, [0.5, 0.5, 0.55]); mfGeomAdd(g, mfMakeCone(0.23, 0.42, 18), 0, 0.69, 0, 1, 1, 1, [0.93, 0.95, 0.97]); return g; }, dlg: ['雪山峰', [['r', '底半径', 0.5], ['h', '总高', 0.9]], (p) => { const g = mfGeom(); mfGeomAdd(g, mfMakeCone(p.r, p.h, 18), 0, p.h / 2, 0, 1, 1, 1, [0.5, 0.5, 0.55]); mfGeomAdd(g, mfMakeCone(p.r * 0.46, p.h * 0.47, 18), 0, p.h * 0.765, 0, 1, 1, 1, [0.93, 0.95, 0.97]); return g; }] },
  { id: 'oak', cat: '自然造物', name: '阔叶树', tip: '圆滚滚的树冠，路边最常见的那种树', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeCylinder(0.05, 0.3, 10), 0, 0.15, 0, 1, 1, 1, [0.4, 0.29, 0.17]); mfGeomAdd(g, mfMakeSphere(0.3, 14, 10), 0, 0.55, 0, 1, 1, 1, [0.3, 0.52, 0.26]); return g; } },
  { id: 'pine', cat: '自然造物', name: '松树', tip: '两层塔状树冠，山里常客', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeCylinder(0.045, 0.22, 8), 0, 0.11, 0, 1, 1, 1, [0.38, 0.27, 0.16]); mfGeomAdd(g, mfMakeCone(0.26, 0.34, 14), 0, 0.38, 0, 1, 1, 1, [0.2, 0.4, 0.22]); mfGeomAdd(g, mfMakeCone(0.18, 0.26, 14), 0, 0.6, 0, 1, 1, 1, [0.24, 0.46, 0.25]); return g; } },
  { id: 'palm', cat: '自然造物', name: '伞盖棕榈', tip: '海边度假风：细干撑开一圈大叶', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeFrustum(0.035, 0.06, 0.55, 10), 0, 0.275, 0, 1, 1, 1, [0.55, 0.42, 0.28]); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; mfGeomAdd(g, mfMakeEllipsoid(0.22, 1), Math.cos(a) * 0.17, 0.58, Math.sin(a) * 0.17, 1, 0.16, 0.45, [0.25, 0.5, 0.3], a); } return g; } },
  { id: 'coral', cat: '自然造物', name: '珊瑚丛', tip: '粉橙色的枝杈一丛丛，浅海烟火', mk: () => { const g = mfGeom(); const cs = [[0.95, 0.55, 0.55], [0.95, 0.65, 0.4], [0.9, 0.5, 0.62]]; const xy = [[0, 0, 0.34], [0.12, 0.08, 0.26], [-0.11, 0.1, 0.29], [0.05, -0.13, 0.22], [-0.09, -0.09, 0.24]]; for (let k = 0; k < xy.length; k++) { const p = xy[k]; mfGeomAdd(g, mfMakeFrustum(0.02, 0.05, p[2], 8), p[0], p[2] / 2, p[1], 1, 1, 1, cs[k % 3]); mfGeomAdd(g, mfMakeSphere(0.03, 8, 6), p[0], p[2] + 0.01, p[1], 1, 1, 1, cs[(k + 1) % 3]); } return g; } },
  { id: 'rocks', cat: '自然造物', name: '礁石群', tip: '海岸边错落的黑灰礁石', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeEllipsoid(0.26, 0.8), 0, 0.12, 0, 1, 1, 0.8, [0.4, 0.4, 0.42]); mfGeomAdd(g, mfMakeEllipsoid(0.18, 0.9), 0.28, 0.08, 0.14, 1, 1, 0.9, [0.46, 0.45, 0.46]); mfGeomAdd(g, mfMakeEllipsoid(0.14, 0.75), -0.25, 0.06, 0.16, 1, 1, 0.8, [0.36, 0.36, 0.38]); return g; } },
  { id: 'cloud', cat: '自然造物', name: '云朵', tip: '一朵胖云，挂到空中或做成云海', mk: () => { const g = mfGeom(); const c = [0.94, 0.95, 0.98]; mfGeomAdd(g, mfMakeEllipsoid(0.3, 0.7), 0, 0.2, 0, 1, 1, 0.8, c); mfGeomAdd(g, mfMakeEllipsoid(0.22, 0.7), 0.3, 0.18, 0.06, 1, 1, 0.8, c); mfGeomAdd(g, mfMakeEllipsoid(0.2, 0.7), -0.28, 0.17, -0.04, 1, 1, 0.8, c); mfGeomAdd(g, mfMakeEllipsoid(0.16, 0.7), 0.08, 0.32, 0, 1, 1, 0.75, c); return g; } },
  { id: 'boulder', cat: '自然造物', name: '巨石', tip: '一块敦实的大石头，阵法与荒野标配', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeEllipsoid(0.3, 0.85), 0, 0.2, 0, 1, 1, 0.85, [0.55, 0.54, 0.5]); return g; } },
  /* ---- 建筑与楼阁 ---- */
  { id: 'tower2', cat: '建筑与楼阁', name: '高楼', tip: '三节收分的摩天楼，带天线与窗带', mk: () => { const g = mfGeom(); const wall = [0.62, 0.68, 0.75], glass = [0.75, 0.85, 0.92]; mfGeomAdd(g, mfMakeCuboid(0.4, 0.9, 0.4), 0, 0.45, 0, 1, 1, 1, wall); mfGeomAdd(g, mfMakeCuboid(0.32, 0.4, 0.32), 0, 1.1, 0, 1, 1, 1, wall); mfGeomAdd(g, mfMakeCuboid(0.24, 0.24, 0.24), 0, 1.42, 0, 1, 1, 1, wall); mfGeomAdd(g, mfMakeCylinder(0.015, 0.24, 6), 0, 1.66, 0, 1, 1, 1, [0.5, 0.5, 0.55]); for (let k = 0; k < 4; k++) mfGeomAdd(g, mfMakeCuboid(0.34, 0.045, 0.012), 0, 0.24 + k * 0.2, 0.2, 1, 1, 1, glass); return g; } },
  { id: 'watchtower', cat: '建筑与楼阁', name: '瞭望塔', tip: '木架高台加小屋顶，边塞与营地之眼', mk: () => { const g = mfGeom(); const wood = [0.5, 0.38, 0.24]; mfGeomAdd(g, mfMakeFrustum(0.16, 0.26, 0.62, 4), 0, 0.31, 0, 1, 1, 1, wood, Math.PI / 4); mfGeomAdd(g, mfMakeCuboid(0.42, 0.22, 0.42), 0, 0.73, 0, 1, 1, 1, [0.58, 0.46, 0.3]); mfGeomAdd(g, mfMakePyramid(4, 0.36, 0.2), 0, 0.95, 0, 1, 1, 1, [0.42, 0.28, 0.2], Math.PI / 4); return g; } },
  { id: 'pavilion', cat: '建筑与楼阁', name: '中式亭', tip: '四柱八角，青瓦小金顶', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeCuboid(0.62, 0.08, 0.62), 0, 0.04, 0, 1, 1, 1, [0.72, 0.7, 0.64]); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; mfGeomAdd(g, mfMakeCylinder(0.03, 0.4, 8), Math.cos(a) * 0.21, 0.28, Math.sin(a) * 0.21, 1, 1, 1, [0.55, 0.2, 0.16]); } mfGeomAdd(g, mfMakePyramid(8, 0.44, 0.26), 0, 0.61, 0, 1, 1, 1, [0.3, 0.45, 0.42]); mfGeomAdd(g, mfMakeSphere(0.045, 10, 8), 0, 0.77, 0, 1, 1, 1, [0.85, 0.68, 0.3]); return g; } },
  { id: 'castle', cat: '建筑与楼阁', name: '城堡', tip: '四角塔楼加围墙，一方小要塞', mk: () => { const g = mfGeom(); const stone = [0.68, 0.66, 0.6], roof = [0.5, 0.3, 0.25]; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const x = Math.cos(a) * 0.34, z = Math.sin(a) * 0.34; mfGeomAdd(g, mfMakeCylinder(0.09, 0.55, 12), x, 0.275, z, 1, 1, 1, stone); mfGeomAdd(g, mfMakeCone(0.12, 0.18, 12), x, 0.64, z, 1, 1, 1, roof); } mfGeomAdd(g, mfMakeCuboid(0.5, 0.3, 0.08), 0, 0.15, 0.3, 1, 1, 1, stone); mfGeomAdd(g, mfMakeCuboid(0.5, 0.3, 0.08), 0, 0.15, -0.3, 1, 1, 1, stone); mfGeomAdd(g, mfMakeCuboid(0.08, 0.3, 0.5), 0.3, 0.15, 0, 1, 1, 1, stone); mfGeomAdd(g, mfMakeCuboid(0.08, 0.3, 0.5), -0.3, 0.15, 0, 1, 1, 1, stone); mfGeomAdd(g, mfMakeCuboid(0.3, 0.34, 0.26), 0, 0.17, 0, 1, 1, 1, [0.62, 0.6, 0.55]); mfGeomAdd(g, mfMakePyramid(4, 0.26, 0.18), 0, 0.43, 0, 1, 1, 1, roof, Math.PI / 4); return g; } },
  { id: 'tent', cat: '建筑与楼阁', name: '帐篷', tip: '帆布尖顶小帐，营地与旅途的家', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakePyramid(4, 0.4, 0.42), 0, 0.21, 0, 1, 1, 1, [0.72, 0.6, 0.42], Math.PI / 4); mfGeomAdd(g, mfMakeCylinder(0.015, 0.1, 6), 0, 0.45, 0, 1, 1, 1, [0.4, 0.3, 0.2]); return g; } },
  { id: 'lighthouse', cat: '建筑与楼阁', name: '灯塔', tip: '白身红灯室，为夜航的人留一盏光', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeFrustum(0.11, 0.17, 0.75, 16), 0, 0.375, 0, 1, 1, 1, [0.9, 0.88, 0.82]); mfGeomAdd(g, mfMakeCylinder(0.14, 0.05, 16), 0, 0.32, 0, 1, 1, 1, [0.75, 0.3, 0.25]); mfGeomAdd(g, mfMakeCylinder(0.14, 0.05, 16), 0, 0.58, 0, 1, 1, 1, [0.75, 0.3, 0.25]); mfGeomAdd(g, mfMakeCylinder(0.09, 0.12, 12), 0, 0.81, 0, 1, 1, 1, [1.0, 0.9, 0.5]); mfGeomAdd(g, mfMakeDome(0.1, 12, 6), 0, 0.87, 0, 1, 1, 1, [0.5, 0.3, 0.28]); return g; } },
  { id: 'bridge', cat: '建筑与楼阁', name: '石拱桥', tip: '一弯石拱跨两岸，桥头各一根望柱', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeArcTube(0.42, 0.1, Math.PI, 20, 8), 0, 0.02, 0, 1, 0.9, 1.5, [0.66, 0.64, 0.58]); mfGeomAdd(g, mfMakeCuboid(0.07, 0.3, 0.07), -0.42, 0.15, 0, 1, 1, 1, [0.6, 0.58, 0.52]); mfGeomAdd(g, mfMakeCuboid(0.07, 0.3, 0.07), 0.42, 0.15, 0, 1, 1, 1, [0.6, 0.58, 0.52]); return g; } },
  { id: 'sailboat', cat: '建筑与楼阁', name: '帆船', tip: '木壳小船扬一面白帆', mk: () => { const g = mfGeom(); mfGeomAdd(g, mfMakeLathe([[0.04, 0], [0.2, 0.02], [0.26, 0.08], [0.28, 0.14]], 18), 0, 0, 0, 1.7, 0.8, 0.62, [0.48, 0.34, 0.2]); mfGeomAdd(g, mfMakeCylinder(0.018, 0.55, 8), 0, 0.38, 0, 1, 1, 1, [0.42, 0.32, 0.2]); mfGeomAdd(g, mfMakeCuboid(0.02, 0.38, 0.3), 0, 0.42, 0.02, 1, 1, 1, [0.93, 0.9, 0.82]); return g; } },
  /* ---- 聚落小镇 ---- */
  { id: 'hamlet', cat: '聚落小镇', name: '村庄·茅屋', tip: '三座茅草圆屋围着一口井', mk: () => { const g = mfGeom(); const wall = [0.78, 0.68, 0.5], thatch = [0.62, 0.5, 0.3]; const pos = [[-0.22, -0.1], [0.2, 0.16], [0.05, -0.3]]; for (let k = 0; k < 3; k++) { mfGeomAdd(g, mfMakeCylinder(0.15, 0.17, 12), pos[k][0], 0.085, pos[k][1], 1, 1, 1, wall); mfGeomAdd(g, mfMakeCone(0.2, 0.18, 12), pos[k][0], 0.26, pos[k][1], 1, 1, 1, thatch); } mfGeomAdd(g, mfMakeCylinder(0.07, 0.08, 10), 0.02, 0.04, 0.05, 1, 1, 1, [0.6, 0.6, 0.58]); return g; } },
  { id: 'township', cat: '聚落小镇', name: '小镇·十字街', tip: '四间小屋一口井一棵树，热气腾腾的小镇中心', mk: () => { const g = mfGeom(); const walls = [[0.8, 0.7, 0.55], [0.76, 0.64, 0.5], [0.82, 0.72, 0.58], [0.74, 0.66, 0.52]], roof = [0.55, 0.32, 0.24]; const pos = [[-0.28, -0.24], [0.26, -0.22], [0.28, 0.26], [-0.26, 0.26]]; for (let k = 0; k < 4; k++) { mfGeomAdd(g, mfMakeCuboid(0.26, 0.2, 0.22), pos[k][0], 0.1, pos[k][1], 1, 1, 1, walls[k]); mfGeomAdd(g, mfMakePyramid(4, 0.22, 0.14), pos[k][0], 0.27, pos[k][1], 1, 1, 1, roof, Math.PI / 4); } mfGeomAdd(g, mfMakeCylinder(0.06, 0.07, 10), 0, 0.035, 0, 1, 1, 1, [0.62, 0.62, 0.6]); mfGeomAdd(g, mfMakeCylinder(0.03, 0.14, 8), 0.0, 0.07, -0.42, 1, 1, 1, [0.4, 0.29, 0.17]); mfGeomAdd(g, mfMakeCone(0.12, 0.2, 10), 0, 0.24, -0.42, 1, 1, 1, [0.28, 0.48, 0.25]); return g; } },
  { id: 'harbor', cat: '聚落小镇', name: '港口小镇', tip: '两间渔屋一座小灯塔，门前一条木栈桥', mk: () => { const g = mfGeom(); const roof = [0.5, 0.32, 0.26]; mfGeomAdd(g, mfMakeCuboid(0.24, 0.18, 0.2), -0.2, 0.09, -0.14, 1, 1, 1, [0.78, 0.7, 0.56]); mfGeomAdd(g, mfMakePyramid(4, 0.2, 0.13), -0.2, 0.245, -0.14, 1, 1, 1, roof, Math.PI / 4); mfGeomAdd(g, mfMakeCuboid(0.22, 0.16, 0.2), 0.12, 0.08, -0.2, 1, 1, 1, [0.74, 0.66, 0.52]); mfGeomAdd(g, mfMakePyramid(4, 0.18, 0.12), 0.12, 0.22, -0.2, 1, 1, 1, roof, Math.PI / 4); mfGeomAdd(g, mfMakeFrustum(0.06, 0.09, 0.4, 12), 0.32, 0.2, 0.14, 1, 1, 1, [0.9, 0.88, 0.82]); mfGeomAdd(g, mfMakeCylinder(0.05, 0.07, 10), 0.32, 0.44, 0.14, 1, 1, 1, [1.0, 0.88, 0.5]); mfGeomAdd(g, mfMakeDome(0.055, 10, 5), 0.32, 0.475, 0.14, 1, 1, 1, [0.5, 0.3, 0.28]); mfGeomAdd(g, mfMakeCuboid(0.5, 0.04, 0.16), 0, 0.02, 0.32, 1, 1, 1, [0.52, 0.4, 0.26]); return g; } },
  { id: 'camp', cat: '聚落小镇', name: '营地', tip: '三顶帐篷围着一堆篝火', mk: () => { const g = mfGeom(); const canvas = [0.72, 0.6, 0.42]; const pos = [[-0.24, -0.12, 0.3], [0.24, -0.1, -0.4], [0.02, 0.28, 0.9]]; for (let k = 0; k < 3; k++) mfGeomAdd(g, mfMakePyramid(4, 0.18, 0.2), pos[k][0], 0.1, pos[k][1], 1, 1, 1, canvas, Math.PI / 4 + pos[k][2]); mfGeomAdd(g, mfMakeCylinder(0.02, 0.16, 6), 0, 0.03, 0, 1, 1, 1, [0.35, 0.26, 0.16], 0.6); mfGeomAdd(g, mfMakeCylinder(0.02, 0.16, 6), 0, 0.03, 0, 1, 1, 1, [0.35, 0.26, 0.16], -0.6); mfGeomAdd(g, mfMakeCone(0.05, 0.12, 8), 0, 0.1, 0, 1, 1, 1, [0.95, 0.55, 0.2]); return g; } }
];

/* ---- 预制形全体进目录：与图鉴共用同一份 mk()，卡片/拖放/编辑分叉全走现成机制 ---- */
MF_PRIMS.forEach((p) => {
  if (p.id === 'blank') return;   /* 「空白」留在图鉴里当起点，不占目录 */
  MF_BUILTINS.push({ id: 'prim_' + p.id, name: p.name, cat: 'prim', sub: p.cat, make: function () { return p.mk(); } });
});

/* XY 平面内旋转的薄片（风车叶片、水车桨板、枯枝、螺旋桨专用——mfPAdd 只会绕 Y 转） */
function mfPBlade(g, len, w, t, x, y, z, ang, c) {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const vs = MF_P_BOX.vs, fs = MF_P_BOX.fs;
  const base = g.verts.length / 3;
  for (let i = 0; i < vs.length; i += 3) {
    const px = vs[i] * len, py = vs[i + 1] * w, pz = vs[i + 2] * t;
    g.verts.push(px * cs - py * sn + x, px * sn + py * cs + y, pz + z);
    g.colors.push(c[0], c[1], c[2]);
  }
  for (let i = 0; i < fs.length; i++) g.faces.push(fs[i] + base);
}

/* ============================================================
 * 追加内置建模：营造（建筑奇观）/ 器物（家具交通）/ 造物（自然细节）
 * 全部用 mfP* 拼装器现拼，纯色烘焙进顶点；编辑＝自动分叉副本。
 * ========================================================== */
const MF_EXTRA = [
  /* ================= 营造 ================= */
  {
    id: 'b_gate', name: '城门楼', cat: 'build', make: () => {
      const g = mfGeom(), stone = mfCol('#9a8f7a'), roof = mfCol('#5a6a4a'), wood = mfCol('#7a5a3a');
      mfPCyl(g, 0.14, 0.17, 0.5, -0.3, 0.25, 0, stone, 8);
      mfPCyl(g, 0.14, 0.17, 0.5, 0.3, 0.25, 0, stone, 8);
      mfPBox(g, 0.34, 0.3, 0.16, 0, 0.35, 0, stone);
      mfPBox(g, 0.88, 0.06, 0.2, 0, 0.53, 0, wood);
      mfGeomAdd(g, mfMakePyramid(4, 0.34, 0.2), 0, 0.66, 0, 1, 1, 1, roof);
      mfGeomAdd(g, mfMakePyramid(4, 0.19, 0.13), -0.3, 0.565, 0, 1, 1, 1, roof);
      mfGeomAdd(g, mfMakePyramid(4, 0.19, 0.13), 0.3, 0.565, 0, 1, 1, 1, roof);
      return g;
    }
  },
  {
    id: 'b_beacon', name: '烽火台', cat: 'build', make: () => {
      const g = mfGeom(), earth = mfCol('#a88a5e'), dark = mfCol('#8a6d45');
      mfPBox(g, 0.56, 0.18, 0.56, 0, 0.09, 0, dark);
      mfPBox(g, 0.44, 0.18, 0.44, 0, 0.26, 0, earth);
      mfPBox(g, 0.34, 0.18, 0.34, 0, 0.43, 0, dark);
      mfPBox(g, 0.26, 0.1, 0.26, 0, 0.56, 0, earth);
      mfPCyl(g, 0.09, 0.11, 0.07, 0, 0.645, 0, mfCol('#6a5a48'), 8);
      mfGeomAdd(g, mfMakeCone(0.055, 0.15, 8), 0, 0.75, 0, 1, 1, 1, mfCol('#e07830'));
      mfGeomAdd(g, mfMakeCone(0.03, 0.09, 8), 0, 0.77, 0, 1, 1, 1, mfCol('#f2c860'));
      return g;
    }
  },
  {
    id: 'b_pagoda', name: '佛塔·五重', cat: 'build', make: () => {
      const g = mfGeom(), wall = mfCol('#c8b088'), eave = mfCol('#6a4a3a'), gold = mfCol('#d8b050');
      let y = 0;
      for (let i = 0; i < 5; i++) {
        const w = 0.4 - i * 0.055;
        mfPCyl(g, w * 0.62, w * 0.66, 0.13, 0, y + 0.065, 0, wall, 6);
        y += 0.13;
        mfPCyl(g, w * 0.08, w * 0.92, 0.06, 0, y + 0.03, 0, eave, 6);
        y += 0.06;
      }
      mfPCyl(g, 0.02, 0.05, 0.1, 0, y + 0.05, 0, gold, 8);
      mfPSph(g, 0.035, 0, y + 0.13, 0, gold);
      return g;
    }
  },
  {
    id: 'b_church', name: '教堂', cat: 'build', make: () => {
      const g = mfGeom(), wall = mfCol('#d8cfc0'), roof = mfCol('#7a4a3a'), dark = mfCol('#8a8078'), gold = mfCol('#d8b050');
      mfPBox(g, 0.6, 0.28, 0.3, 0, 0.14, 0, wall);
      mfGeomAdd(g, mfMakePyramid(4, 0.32, 0.18), 0, 0.37, 0, 1.35, 1, 0.72, roof, Math.PI / 4);
      mfPBox(g, 0.16, 0.52, 0.16, -0.18, 0.26, 0.2, wall);
      mfGeomAdd(g, mfMakePyramid(4, 0.14, 0.22), -0.18, 0.63, 0.2, 1, 1, 1, dark);
      mfPBox(g, 0.025, 0.09, 0.025, -0.18, 0.79, 0.2, gold);
      mfPBox(g, 0.07, 0.025, 0.025, -0.18, 0.79, 0.2, gold);
      mfPBox(g, 0.1, 0.16, 0.03, 0.12, 0.08, 0.16, mfCol('#5a4a38'));
      return g;
    }
  },
  {
    id: 'b_mosque', name: '穹顶寺', cat: 'build', make: () => {
      const g = mfGeom(), wall = mfCol('#e0d8c8'), dome = mfCol('#5a8ab5'), tower = mfCol('#d0c4a8');
      mfPBox(g, 0.5, 0.22, 0.5, 0, 0.11, 0, wall);
      mfPSph(g, 0.24, 0, 0.24, 0, dome, 1, 0.85, 1);
      mfPCyl(g, 0.035, 0.045, 0.5, -0.32, 0.25, -0.32, tower, 8);
      mfPCyl(g, 0.035, 0.045, 0.5, 0.32, 0.25, -0.32, tower, 8);
      mfGeomAdd(g, mfMakeCone(0.05, 0.12, 8), -0.32, 0.56, -0.32, 1, 1, 1, dome);
      mfGeomAdd(g, mfMakeCone(0.05, 0.12, 8), 0.32, 0.56, -0.32, 1, 1, 1, dome);
      mfPSph(g, 0.022, 0, 0.47, 0, mfCol('#e8c860'));
      return g;
    }
  },
  {
    id: 'b_torii', name: '鸟居', cat: 'build', make: () => {
      const g = mfGeom(), red = mfCol('#c04030'), dark = mfCol('#5a3028');
      mfPCyl(g, 0.035, 0.045, 0.5, -0.2, 0.25, 0, red, 8);
      mfPCyl(g, 0.035, 0.045, 0.5, 0.2, 0.25, 0, red, 8);
      mfPBox(g, 0.6, 0.05, 0.07, 0, 0.53, 0, red);
      mfPBox(g, 0.66, 0.04, 0.09, 0, 0.585, 0, dark);
      mfPBox(g, 0.46, 0.04, 0.06, 0, 0.4, 0, red);
      return g;
    }
  },
  {
    id: 'b_paifang', name: '牌坊', cat: 'build', make: () => {
      const g = mfGeom(), stone = mfCol('#c8c0b0'), roof = mfCol('#4a5a48');
      [-0.3, -0.1, 0.1, 0.3].forEach((x) => mfPBox(g, 0.05, 0.5, 0.05, x, 0.25, 0, stone));
      mfPBox(g, 0.72, 0.05, 0.07, 0, 0.47, 0, stone);
      mfPBox(g, 0.72, 0.04, 0.06, 0, 0.37, 0, stone);
      mfGeomAdd(g, mfMakePyramid(4, 0.13, 0.08), -0.2, 0.54, 0, 1.5, 1, 0.55, roof);
      mfGeomAdd(g, mfMakePyramid(4, 0.13, 0.08), 0.2, 0.54, 0, 1.5, 1, 0.55, roof);
      mfGeomAdd(g, mfMakePyramid(4, 0.15, 0.1), 0, 0.6, 0, 1.4, 1, 0.55, roof);
      return g;
    }
  },
  {
    id: 'b_windmill', name: '风车磨坊', cat: 'build', make: () => {
      const g = mfGeom(), stone = mfCol('#b8a88e'), wood = mfCol('#8a6a45'), roof = mfCol('#6a4a3a'), sail = mfCol('#e0d0b0');
      mfPCyl(g, 0.16, 0.24, 0.55, 0, 0.275, 0, stone, 10);
      mfGeomAdd(g, mfMakeCone(0.2, 0.18, 10), 0, 0.64, 0, 1, 1, 1, roof);
      mfPBox(g, 0.06, 0.06, 0.12, 0, 0.55, 0.14, wood);
      mfPBlade(g, 0.62, 0.045, 0.02, 0, 0.55, 0.2, Math.PI / 4, wood);
      mfPBlade(g, 0.62, 0.045, 0.02, 0, 0.55, 0.2, Math.PI / 4 + Math.PI / 2, wood);
      mfPBox(g, 0.13, 0.17, 0.015, 0.21, 0.55 + 0.21, 0.21, sail);
      mfPBox(g, 0.13, 0.17, 0.015, -0.21, 0.55 - 0.21, 0.21, sail);
      mfPBox(g, 0.17, 0.13, 0.015, -0.21, 0.55 + 0.21, 0.21, sail);
      mfPBox(g, 0.17, 0.13, 0.015, 0.21, 0.55 - 0.21, 0.21, sail);
      return g;
    }
  },
  {
    id: 'b_pyramid', name: '大金字塔', cat: 'build', make: () => {
      const g = mfGeom(), sand = mfCol('#d8c084'), dark = mfCol('#8a7450');
      mfGeomAdd(g, mfMakePyramid(4, 0.55, 0.5), 0, 0.25, 0, 1, 1, 1, sand, Math.PI / 4);
      mfGeomAdd(g, mfMakePyramid(4, 0.18, 0.14), 0.42, 0.07, 0.35, 1, 1, 1, mfCol('#c8b078'), Math.PI / 4);
      mfPBox(g, 0.1, 0.09, 0.06, 0, 0.045, 0.395, dark);
      return g;
    }
  },
  {
    id: 'b_colonnade', name: '柱廊神庙', cat: 'build', make: () => {
      const g = mfGeom(), marble = mfCol('#e8e2d4'), shade = mfCol('#c8bfae');
      mfPBox(g, 0.8, 0.08, 0.5, 0, 0.04, 0, shade);
      for (let i = 0; i < 5; i++) {
        mfPCyl(g, 0.035, 0.042, 0.34, -0.3 + i * 0.15, 0.25, 0.18, marble, 8);
        mfPCyl(g, 0.035, 0.042, 0.34, -0.3 + i * 0.15, 0.25, -0.18, marble, 8);
      }
      mfPBox(g, 0.8, 0.07, 0.5, 0, 0.455, 0, marble);
      mfGeomAdd(g, mfMakePyramid(4, 0.42, 0.15), 0, 0.565, 0, 1.4, 1, 0.88, shade, Math.PI / 4);
      return g;
    }
  },
  {
    id: 'b_well', name: '井亭', cat: 'build', make: () => {
      const g = mfGeom(), stone = mfCol('#9a9488'), wood = mfCol('#8a6a45'), roof = mfCol('#5a6a4a');
      mfPCyl(g, 0.16, 0.17, 0.14, 0, 0.07, 0, stone, 10);
      mfPCyl(g, 0.13, 0.13, 0.02, 0, 0.15, 0, mfCol('#2a3a4a'), 10);
      [-0.13, 0.13].forEach((x) => { [-0.13, 0.13].forEach((z) => mfPBox(g, 0.03, 0.34, 0.03, x, 0.31, z, wood)); });
      mfPBox(g, 0.34, 0.03, 0.34, 0, 0.49, 0, wood);
      mfGeomAdd(g, mfMakePyramid(4, 0.3, 0.14), 0, 0.575, 0, 1, 1, 1, roof, Math.PI / 4);
      return g;
    }
  },
  /* ================= 器物 ================= */
  {
    id: 'c_table', name: '方桌', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#8a6a45'), dark = mfCol('#6d5435');
      mfPBox(g, 0.5, 0.04, 0.34, 0, 0.26, 0, wood);
      [-0.21, 0.21].forEach((x) => { [-0.13, 0.13].forEach((z) => mfPBox(g, 0.04, 0.24, 0.04, x, 0.12, z, dark)); });
      return g;
    }
  },
  {
    id: 'c_chair', name: '靠背椅', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#9a7a50'), dark = mfCol('#6d5435');
      mfPBox(g, 0.24, 0.03, 0.24, 0, 0.14, 0, wood);
      [-0.09, 0.09].forEach((x) => { [-0.09, 0.09].forEach((z) => mfPBox(g, 0.03, 0.14, 0.03, x, 0.07, z, dark)); });
      mfPBox(g, 0.24, 0.26, 0.03, 0, 0.28, -0.105, wood);
      mfPBox(g, 0.24, 0.03, 0.03, 0, 0.42, -0.105, dark);
      return g;
    }
  },
  {
    id: 'c_bed', name: '木床', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#7a5a3a'), cloth = mfCol('#e0dcd0'), pillow = mfCol('#f2eee2'), quilt = mfCol('#a05a4a');
      mfPBox(g, 0.44, 0.09, 0.7, 0, 0.1, 0, wood);
      mfPBox(g, 0.4, 0.06, 0.62, 0, 0.17, 0.02, cloth);
      mfPBox(g, 0.4, 0.04, 0.34, 0, 0.2, 0.14, quilt);
      mfPBox(g, 0.18, 0.05, 0.12, 0, 0.22, -0.2, pillow);
      mfPBox(g, 0.44, 0.26, 0.04, 0, 0.18, -0.35, wood);
      return g;
    }
  },
  {
    id: 'c_shelf', name: '书架', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#8a6a45'), dark = mfCol('#6d5435');
      mfPBox(g, 0.04, 0.6, 0.22, -0.2, 0.3, 0, wood);
      mfPBox(g, 0.04, 0.6, 0.22, 0.2, 0.3, 0, wood);
      mfPBox(g, 0.44, 0.03, 0.22, 0, 0.585, 0, dark);
      mfPBox(g, 0.44, 0.03, 0.22, 0, 0.015, 0, dark);
      const bookC = ['#a04a3a', '#4a6a8a', '#5a7a4a', '#c8a040', '#7a5a8a', '#b06840'];
      for (let r = 0; r < 2; r++) {
        const y = 0.2 + r * 0.19;
        mfPBox(g, 0.4, 0.025, 0.2, 0, y - 0.075, 0, wood);
        for (let i = 0; i < 6; i++) {
          mfPBox(g, 0.045, 0.13 + (i % 3) * 0.015, 0.14, -0.15 + i * 0.06, y, 0, mfCol(bookC[(i + r * 3) % 6]));
        }
      }
      return g;
    }
  },
  {
    id: 'c_cabinet', name: '立柜', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#7a5a3a'), dark = mfCol('#5d4528'), gold = mfCol('#c8a040');
      mfPBox(g, 0.4, 0.5, 0.24, 0, 0.27, 0, wood);
      mfPBox(g, 0.44, 0.04, 0.28, 0, 0.54, 0, dark);
      mfPBox(g, 0.44, 0.04, 0.28, 0, 0.02, 0, dark);
      mfPBox(g, 0.175, 0.42, 0.02, -0.095, 0.27, 0.125, dark);
      mfPBox(g, 0.175, 0.42, 0.02, 0.095, 0.27, 0.125, dark);
      mfPSph(g, 0.018, -0.03, 0.27, 0.14, gold);
      mfPSph(g, 0.018, 0.03, 0.27, 0.14, gold);
      return g;
    }
  },
  {
    id: 'c_door', name: '门扇（带框）', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#8a6a45'), frame = mfCol('#6d5435'), gold = mfCol('#c8a040');
      mfPBox(g, 0.04, 0.52, 0.06, -0.15, 0.26, 0, frame);
      mfPBox(g, 0.04, 0.52, 0.06, 0.15, 0.26, 0, frame);
      mfPBox(g, 0.34, 0.04, 0.06, 0, 0.52, 0, frame);
      mfPBox(g, 0.26, 0.48, 0.025, 0, 0.24, 0, wood);
      mfPSph(g, 0.02, 0.09, 0.24, 0.03, gold);
      return g;
    }
  },
  {
    id: 'c_window', name: '十字窗框', cat: 'craft', make: () => {
      const g = mfGeom(), frame = mfCol('#6d5435'), glass = mfCol('#bfd8e0');
      mfPBox(g, 0.34, 0.04, 0.05, 0, 0.38, 0, frame);
      mfPBox(g, 0.34, 0.04, 0.05, 0, 0.02, 0, frame);
      mfPBox(g, 0.04, 0.4, 0.05, -0.15, 0.2, 0, frame);
      mfPBox(g, 0.04, 0.4, 0.05, 0.15, 0.2, 0, frame);
      mfPBox(g, 0.3, 0.025, 0.03, 0, 0.2, 0, frame);
      mfPBox(g, 0.025, 0.36, 0.03, 0, 0.2, 0, frame);
      mfPBox(g, 0.29, 0.35, 0.012, 0, 0.2, -0.01, glass);
      return g;
    }
  },
  {
    id: 'c_lamp', name: '街灯', cat: 'craft', make: () => {
      const g = mfGeom(), iron = mfCol('#3a3f46'), glow = mfCol('#ffd890');
      mfPCyl(g, 0.05, 0.07, 0.05, 0, 0.025, 0, iron, 8);
      mfPCyl(g, 0.02, 0.025, 0.55, 0, 0.3, 0, iron, 8);
      mfPBox(g, 0.12, 0.03, 0.12, 0, 0.6, 0, iron);
      mfPSph(g, 0.05, 0, 0.56, 0, glow);
      mfGeomAdd(g, mfMakePyramid(4, 0.09, 0.06), 0, 0.66, 0, 1, 1, 1, iron);
      return g;
    }
  },
  {
    id: 'c_campfire', name: '篝火堆', cat: 'craft', make: () => {
      const g = mfGeom(), stone = mfCol('#7a7a72'), wood = mfCol('#5d4528');
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        mfPSph(g, 0.045, Math.cos(a) * 0.17, 0.03, Math.sin(a) * 0.17, stone, 1, 0.7, 1);
      }
      mfPBlade(g, 0.24, 0.035, 0.035, 0, 0.1, 0.04, 1.1, wood);
      mfPBlade(g, 0.24, 0.035, 0.035, 0, 0.1, -0.04, Math.PI - 1.1, wood);
      mfPCyl(g, 0.025, 0.03, 0.22, 0, 0.1, 0, wood, 6);
      mfGeomAdd(g, mfMakeCone(0.09, 0.2, 8), 0, 0.16, 0, 1, 1, 1, mfCol('#e07830'));
      mfGeomAdd(g, mfMakeCone(0.05, 0.13, 8), 0, 0.18, 0, 1, 1, 1, mfCol('#f2c860'));
      return g;
    }
  },
  {
    id: 'c_fence', name: '栅栏段', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#9a7a50');
      mfPBox(g, 0.05, 0.32, 0.05, -0.26, 0.16, 0, wood);
      mfPBox(g, 0.05, 0.32, 0.05, 0.26, 0.16, 0, wood);
      mfPBox(g, 0.56, 0.035, 0.03, 0, 0.24, 0, wood);
      mfPBox(g, 0.56, 0.035, 0.03, 0, 0.11, 0, wood);
      return g;
    }
  },
  {
    id: 'c_ladder', name: '木梯', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#9a7a50'), dark = mfCol('#6d5435');
      mfPBlade(g, 0.66, 0.04, 0.03, -0.11, 0.3, 0, Math.PI / 2 - 0.22, wood);
      mfPBlade(g, 0.66, 0.04, 0.03, 0.11, 0.3, 0, Math.PI / 2 - 0.22, wood);
      for (let i = 0; i < 5; i++) mfPBox(g, 0.22, 0.025, 0.025, 0, 0.07 + i * 0.115, 0.055 - i * 0.026, dark);
      return g;
    }
  },
  {
    id: 'c_stall', name: '市集摊位', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#8a6a45'), cloth = mfCol('#c0543c'), goods = mfCol('#c8a040'), goods2 = mfCol('#7aa85a');
      mfPBox(g, 0.5, 0.06, 0.3, 0, 0.22, 0, wood);
      [-0.22, 0.22].forEach((x) => { [-0.12, 0.12].forEach((z) => mfPBox(g, 0.035, 0.2, 0.035, x, 0.1, z, wood)); });
      [-0.22, 0.22].forEach((x) => mfPBox(g, 0.03, 0.42, 0.03, x, 0.36, -0.13, wood));
      mfPBox(g, 0.56, 0.025, 0.4, 0, 0.58, -0.02, cloth);
      mfPBox(g, 0.1, 0.08, 0.1, -0.12, 0.29, 0.03, goods);
      mfPBox(g, 0.09, 0.07, 0.09, 0.05, 0.285, 0.02, goods2);
      mfPSph(g, 0.05, 0.17, 0.29, 0.04, mfCol('#c0543c'), 1, 0.8, 1);
      return g;
    }
  },
  {
    id: 'c_sign', name: '招牌杆', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#6d5435'), board = mfCol('#c8b088');
      mfPCyl(g, 0.025, 0.035, 0.55, 0, 0.275, 0, wood, 8);
      mfPBox(g, 0.3, 0.03, 0.03, 0.12, 0.52, 0, wood);
      mfPBox(g, 0.02, 0.05, 0.02, 0.05, 0.48, 0, wood);
      mfPBox(g, 0.02, 0.05, 0.02, 0.23, 0.48, 0, wood);
      mfPBox(g, 0.24, 0.14, 0.02, 0.14, 0.39, 0, board);
      return g;
    }
  },
  {
    id: 'c_carriage', name: '马车', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#7a4a2b'), dark = mfCol('#4a3a28'), roof = mfCol('#a04a3a');
      mfPBox(g, 0.34, 0.2, 0.26, 0, 0.24, -0.05, wood);
      mfGeomAdd(g, mfMakeDome(0.17, 10, 5), 0, 0.34, -0.05, 1, 0.6, 0.8, roof);
      [-0.15, 0.15].forEach((x) => {
        mfPSph(g, 0.09, x, 0.09, -0.16, dark, 0.32, 1, 1);
        mfPSph(g, 0.11, x, 0.11, 0.12, dark, 0.32, 1, 1);
      });
      mfPBox(g, 0.03, 0.03, 0.3, -0.06, 0.12, 0.3, wood);
      mfPBox(g, 0.03, 0.03, 0.3, 0.06, 0.12, 0.3, wood);
      return g;
    }
  },
  {
    id: 'c_canoe', name: '独木舟', cat: 'craft', make: () => {
      const g = mfGeom(), wood = mfCol('#6d4a2a'), dark = mfCol('#3a2a18');
      mfPSph(g, 0.15, 0, 0.07, 0, wood, 2.6, 0.5, 0.62);
      mfPSph(g, 0.13, 0, 0.1, 0, dark, 2.3, 0.38, 0.5);
      mfPBlade(g, 0.4, 0.05, 0.02, 0.1, 0.12, 0.1, 0.5, wood);
      return g;
    }
  },
  {
    id: 'c_balloon', name: '热气球', cat: 'craft', make: () => {
      const g = mfGeom(), red = mfCol('#c0543c'), gold = mfCol('#e0b36a'), wicker = mfCol('#8a6a45');
      mfPSph(g, 0.24, 0, 0.48, 0, red);
      mfPSph(g, 0.245, 0, 0.52, 0, gold, 1, 0.35, 1);
      mfPBox(g, 0.14, 0.1, 0.14, 0, 0.09, 0, wicker);
      [-0.05, 0.05].forEach((x) => { [-0.05, 0.05].forEach((z) => mfPBox(g, 0.012, 0.2, 0.012, x, 0.24, z, wicker)); });
      return g;
    }
  },
  {
    id: 'c_airship', name: '小飞艇', cat: 'craft', make: () => {
      const g = mfGeom(), hull = mfCol('#b8c0c8'), cabin = mfCol('#6d5435'), fin = mfCol('#8a4a3a');
      mfPSph(g, 0.2, 0, 0.36, 0, hull, 2.2, 1, 1);
      mfPBox(g, 0.2, 0.08, 0.1, 0, 0.17, 0, cabin);
      mfPBlade(g, 0.16, 0.1, 0.02, -0.42, 0.36, 0, Math.PI / 2, fin);
      mfPBlade(g, 0.14, 0.09, 0.02, -0.4, 0.42, 0, 0.35, fin);
      mfPBlade(g, 0.14, 0.09, 0.02, -0.4, 0.3, 0, -0.35, fin);
      [-0.1, 0.1].forEach((x) => mfPBox(g, 0.012, 0.08, 0.012, x, 0.26, 0, cabin));
      return g;
    }
  },
  /* ================= 造物 ================= */
  {
    id: 'w_cactus', name: '仙人掌', cat: 'wild', make: () => {
      const g = mfGeom(), green = mfCol('#5a8a4a'), dark = mfCol('#4a7a3f');
      mfPCyl(g, 0.055, 0.065, 0.42, 0, 0.21, 0, green, 8);
      mfPSph(g, 0.055, 0, 0.42, 0, green, 1, 0.6, 1);
      mfPBox(g, 0.09, 0.05, 0.05, -0.09, 0.24, 0, dark);
      mfPCyl(g, 0.035, 0.04, 0.14, -0.14, 0.32, 0, dark, 8);
      mfPBox(g, 0.08, 0.045, 0.045, 0.08, 0.17, 0, dark);
      mfPCyl(g, 0.032, 0.037, 0.11, 0.125, 0.24, 0, dark, 8);
      mfPSph(g, 0.02, 0, 0.47, 0, mfCol('#e08ab5'));
      return g;
    }
  },
  {
    id: 'w_deadtree', name: '枯树', cat: 'wild', make: () => {
      const g = mfGeom(), bark = mfCol('#6a5a48'), dark = mfCol('#544838');
      mfPCyl(g, 0.03, 0.055, 0.4, 0, 0.2, 0, bark, 7);
      mfPBlade(g, 0.24, 0.02, 0.02, 0.08, 0.42, 0, 0.6, dark);
      mfPBlade(g, 0.2, 0.018, 0.018, -0.07, 0.38, 0, Math.PI - 0.7, dark);
      mfPBlade(g, 0.16, 0.014, 0.014, 0.02, 0.5, 0, 1.35, bark);
      mfPBlade(g, 0.12, 0.012, 0.012, 0.14, 0.5, 0, 0.2, dark);
      return g;
    }
  },
  {
    id: 'w_reeds', name: '芦苇丛', cat: 'wild', make: () => {
      const g = mfGeom(), green = mfCol('#7a9a5a'), tip = mfCol('#b09a68');
      const pos = [[0, 0, 0.42], [0.09, 0.05, 0.36], [-0.08, 0.07, 0.45], [0.05, -0.09, 0.32], [-0.1, -0.06, 0.38], [0.13, -0.03, 0.28]];
      pos.forEach((p) => {
        mfPCyl(g, 0.008, 0.012, p[2], p[0], p[2] / 2, p[1], green, 5);
        mfPCyl(g, 0.016, 0.012, 0.07, p[0], p[2] + 0.03, p[1], tip, 5);
      });
      return g;
    }
  },
  {
    id: 'w_crystal', name: '冰晶簇', cat: 'wild', make: () => {
      const g = mfGeom(), ice = mfCol('#a8d8e8'), ice2 = mfCol('#7ab8d8'), base = mfCol('#8a9498');
      mfPSph(g, 0.16, 0, 0.02, 0, base, 1, 0.35, 1);
      mfGeomAdd(g, mfMakeCone(0.09, 0.42, 6), 0, 0.24, 0, 1, 1, 1, ice);
      mfGeomAdd(g, mfMakeCone(0.07, 0.3, 6), 0.14, 0.16, 0.06, 1, 1, 1, ice2);
      mfGeomAdd(g, mfMakeCone(0.055, 0.22, 6), -0.12, 0.12, -0.05, 1, 1, 1, ice);
      return g;
    }
  },
  {
    id: 'w_shroomring', name: '蘑菇圈', cat: 'wild', make: () => {
      const g = mfGeom(), stem = mfCol('#e0d8c8'), cap = mfCol('#c0543c'), cap2 = mfCol('#e08a5a');
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2, x = Math.cos(a) * 0.18, z = Math.sin(a) * 0.18;
        const h = 0.08 + (i % 3) * 0.02;
        mfPCyl(g, 0.018, 0.024, h, x, h / 2, z, stem, 6);
        mfPSph(g, 0.045, x, h + 0.01, z, i % 2 ? cap : cap2, 1, 0.55, 1);
      }
      return g;
    }
  },
  {
    id: 'w_cairn', name: '叠石堆', cat: 'wild', make: () => {
      const g = mfGeom(), s1 = mfCol('#8a8a82'), s2 = mfCol('#7a7a74'), s3 = mfCol('#9a9a90');
      mfPSph(g, 0.14, 0, 0.06, 0, s1, 1, 0.5, 0.85);
      mfPSph(g, 0.1, 0.02, 0.14, 0.01, s2, 1, 0.55, 0.9);
      mfPSph(g, 0.065, -0.01, 0.21, -0.01, s3, 1, 0.6, 1);
      return g;
    }
  }
];
MF_EXTRA.forEach((d) => MF_BUILTINS.push(d));
/* 图鉴缩略图：一个小渲染器轮流渲染每个基础体 → dataURL 缓存复用 */
const _primThumbCache = new Map();
let _primThumbR = null;
function mfPrimThumbURL(p) {
  if (_primThumbCache.has(p.id)) return _primThumbCache.get(p.id);
  let url = '';
  try {
    if (!_primThumbR) {
      const cv = document.createElement('canvas'); cv.width = 132; cv.height = 92;
      const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(38, 132 / 92, 0.01, 50);
      cam.position.set(1.5, 1.05, 1.7); cam.lookAt(0, 0, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(3, 4, 5); scene.add(d1);
      const d2 = new THREE.DirectionalLight(0xaac4ff, 0.4); d2.position.set(-4, -2, -3); scene.add(d2);
      _primThumbR = { renderer: renderer, scene: scene, cam: cam, cv: cv, mesh: null };
    }
    const T = _primThumbR;
    if (T.mesh) { T.scene.remove(T.mesh); T.mesh.geometry.dispose(); T.mesh.material.dispose(); T.mesh = null; }
    const gg = p.mk();
    if (gg.verts.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(gg.verts), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(gg.colors), 3));
      geo.setIndex(gg.faces.slice ? gg.faces.slice() : gg.faces);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
      T.scene.add(mesh); T.mesh = mesh;
      T.renderer.render(T.scene, T.cam);
      url = T.cv.toDataURL('image/png');
    }
  } catch (e) { url = ''; }
  _primThumbCache.set(p.id, url);
  return url;
}
/* 目录卡片缩略图：与图鉴共用一台小渲染器；按包围盒归一化，大小件都能全身入镜 */
function mfModelThumbURL(m) {
  if (!m) return '';
  const key = 'md:' + m.id;
  if (_primThumbCache.has(key)) return _primThumbCache.get(key);
  let url = '';
  try {
    if (!_primThumbR) {
      const cv = document.createElement('canvas'); cv.width = 132; cv.height = 92;
      const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(38, 132 / 92, 0.01, 50);
      cam.position.set(1.5, 1.05, 1.7); cam.lookAt(0, 0, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(3, 4, 5); scene.add(d1);
      const d2 = new THREE.DirectionalLight(0xaac4ff, 0.4); d2.position.set(-4, -2, -3); scene.add(d2);
      _primThumbR = { renderer: renderer, scene: scene, cam: cam, cv: cv, mesh: null };
    }
    const T = _primThumbR;
    if (T.mesh) { T.scene.remove(T.mesh); T.mesh.geometry.dispose(); T.mesh.material.dispose(); T.mesh = null; }
    if (m.verts.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.verts), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.colors), 3));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(m.faces), 1));
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const md = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z, 1e-6);
      const k = 1.05 / md;
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
      mesh.scale.set(k, k, k);
      mesh.position.set(-(bb.min.x + bb.max.x) / 2 * k, -(bb.min.y + bb.max.y) / 2 * k, -(bb.min.z + bb.max.z) / 2 * k);
      T.scene.add(mesh); T.mesh = mesh;
      T.renderer.render(T.scene, T.cam);
      url = T.cv.toDataURL('image/png');
    }
  } catch (e) { url = ''; console.warn('[mf] 目录缩略图渲染失败：', e && e.message || e); }
  _primThumbCache.set(key, url);
  return url;
}
function mfPrimGallery() {
  if (!mfEnsureThree()) { if (CTXREF) CTXREF.toast('未找到 three.js 运行时', 3000, 'err'); return; }
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', 'mf-note', '左键＝直接放上建模台　右键＝先调尺寸再上台　鼠标悬停卡片＝看看它适合做什么。'));
  const grid = mfNode('div', 'mf-pgrid');
  let d = null, lastCat = '';
  MF_PRIMS.forEach((p) => {
    if (p.cat && p.cat !== lastCat) {
      lastCat = p.cat;
      const gh = mfNode('div', 'mf-sec-t', p.cat);
      gh.style.gridColumn = '1 / -1';
      grid.appendChild(gh);
    }
    const card = mfNode('div', 'mf-pcard');
    const url = mfPrimThumbURL(p);
    if (url) { const im = document.createElement('img'); im.src = url; im.alt = p.name; card.appendChild(im); }
    else card.appendChild(mfNode('div', 'mf-pcard-empty', p.id === 'blank' ? '（空无一物）' : '·'));
    card.appendChild(mfNode('div', 'nm', p.name));
    card.title = p.name + (p.tip ? ' —— ' + p.tip : '') + '\n左键：直接放上建模台' + (p.dlg ? '\n右键：先调尺寸再上台' : '');
    card.addEventListener('click', () => { if (d) d.close(); mfLoadGeom(p.mk(), p.name); });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!p.dlg) { if (CTXREF) CTXREF.toast('「' + p.name + '」没有可调尺寸，左键直接上台即可', 2200); return; }
      if (d) d.close();
      mfPrimDialog(p.dlg[0], p.dlg[1], (pr) => mfLoadGeom(p.dlg[2](pr), p.name));
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  d = mfDialog({ title: '基础体图鉴 —— 挑个顺手的开始', body: wrap, width: '680px', buttons: [{ label: '关闭', fn: function () { } }] });
}
function mfPrimDialog(title, fields, cb) {
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', 'mf-note', '设好尺寸再生成。生成后选中它，右侧「数值变换」「选中部分调整」都可以继续改大小。'));
  const ins = {};
  fields.forEach((f) => {
    const row = mfNode('div', 'mf-row');
    row.appendChild(mfNode('label', '', f[1]));
    const i = mfNode('input', 'mf-inp');
    i.type = 'number'; i.step = '0.05'; i.value = String(f[2]);
    if (f[3] != null) i.min = String(f[3]);
    row.appendChild(i);
    wrap.appendChild(row);
    ins[f[0]] = i;
  });
  const d = mfDialog({
    title: '新建 · ' + title, width: '300px', body: wrap,
    buttons: [{
      label: '生成', pri: true, fn: function () {
        const p = {};
        fields.forEach((f) => { p[f[0]] = +ins[f[0]].value || f[2]; });
        d.close(); cb(p);
      }
    }, { label: '取消', fn: function () { } }]
  });
}

/* 把另一件建模整个并入当前台上的模型（顶点/颜色/面追加，面索引整体偏移） */
function mfModelMergeInto(src) {
  if (!src || !MO.model || !src.verts || !src.verts.length) {
    if (CTXREF) CTXREF.toast('那件建模是空的，没什么可并入', 2200);
    return;
  }
  mfModelPushUndo();
  const m = MO.model;
  const off = m.verts.length / 3;
  const nv = new Float32Array(m.verts.length + src.verts.length);
  nv.set(m.verts); nv.set(src.verts, m.verts.length);
  const nc = new Float32Array(m.colors.length + src.colors.length);
  nc.set(m.colors); nc.set(src.colors, m.colors.length);
  const nf = new Uint32Array(m.faces.length + src.faces.length);
  nf.set(m.faces);
  for (let i = 0; i < src.faces.length; i++) nf[m.faces.length + i] = src.faces[i] + off;
  m.verts = nv; m.colors = nc; m.faces = nf;
  mfModelRebuild(); mfStatRefresh();
  if (CTXREF) CTXREF.toast('已并入「' + src.name + '」（Ctrl+Z 可撤回）', 2400, 'ok');
}

function mfLoadGeom(g, name) {
  MO.model = mfGeomToModel(g, name);
  MO.baseId = null; MO.sel = []; MO.selKind = 'face'; MO.drag = null; _scaleBase = null;
  mfModelRebuild();
  if (MO.nameIn) MO.nameIn.value = name;
  if (MO.renderCat) MO.renderCat();
}

function mfModelSave(asNew) {
  const m = MO.model;
  let name = (MO.nameIn && MO.nameIn.value.trim()) || m.name;
  m.name = name;
  /* 缩略图 */
  try {
    if (MO.renderer && MO.scene && MO.camera) {
      MO.renderer.render(MO.scene, MO.camera);
      m.thumb = MO.renderer.domElement.toDataURL('image/jpeg', 0.6);
    }
  } catch (e) { }
  /* 空间编辑：不写进建模目录，直接写回空间几何 */
  if (MO.spaceId) {
    const sp = (S.map.spaces || []).find((x) => x.id === MO.spaceId);
    if (sp) {
      sp.geom = {
        verts: new Float32Array(m.verts),
        colors: new Float32Array(m.colors),
        faces: new Uint32Array(m.faces)
      };
      sp.name = name;
      mfTouch();
      if (CTXREF) CTXREF.toast('空间「' + name + '」已保存：右键球面上的蓝色标记可以走进去', 2800, 'ok');
    }
    return;
  }
  S.map.models = S.map.models || [];
  if (asNew || !MO.baseId) {
    const nm = mfGeomToModel({ verts: Array.from(m.verts), colors: Array.from(m.colors), faces: Array.from(m.faces) }, name);
    nm.thumb = m.thumb;
    nm.cat = m.cat || '';                 /* 分类跟着建模走：编辑内置件分叉后仍属原类 */
    if (m.groups && m.groups.length) nm.groups = JSON.parse(JSON.stringify(m.groups));
    if (m.anims && m.anims.length) nm.anims = m.anims;
    S.map.models.push(nm);
    MO.baseId = nm.id;
    m.id = nm.id;
  } else {
    const tgt = S.map.models.find((x) => x.id === MO.baseId);
    if (tgt) {
      tgt.name = name;
      tgt.verts = new Float32Array(m.verts); tgt.colors = new Float32Array(m.colors); tgt.faces = new Uint32Array(m.faces);
      tgt.thumb = m.thumb;
      if (m.cat) tgt.cat = m.cat;
      tgt.groups = m.groups && m.groups.length ? JSON.parse(JSON.stringify(m.groups)) : [];
      tgt.anims = m.anims && m.anims.length ? m.anims : [];
    } else {
      S.map.models.push(mfModelClone(m, name));
    }
  }
  if (MO.renderCat) MO.renderCat();
  mfRebuildWaters();            /* 在水域建模上动过刀的话，球面那片水也要跟着变 */
  mfTouch();
  if (CTXREF) CTXREF.toast('已保存建模「' + name + '」', 2400, 'ok');
}

function mfExportModel(m) {
  const o = {
    magic: 'MFMODEL1', name: m.name,
    verts: mfB64(new Uint8Array(new Float32Array(m.verts).buffer)),
    colors: mfB64(new Uint8Array(new Float32Array(m.colors).buffer)),
    faces: mfB64(new Uint8Array(new Uint32Array(m.faces).buffer))
  };
  mfDownload((m.name || 'model') + '.mfmodel', JSON.stringify(o));
}
/* ------------------------------------------------ OBJ 标准格式互通 ----
 * 导出：v x y z r g b（末尾三列顶点色是广泛认可的 OBJ 扩展写法，Blender 4.x、
 * MeshLab 都能读）；f 用 1 起始索引。任何建模软件都能打开，别人做好的模型
 * 导出 OBJ 后也能直接拖进来用。 */
function mfModelToOBJ(m) {
  const fx = (n) => { const s = (+n).toFixed(5); return s.replace(/\.?0+$/, '') || '0'; };
  const L = [];
  L.push('# ' + (m.name || 'model'));
  L.push('# exported by 我，地图和小女仆 · 自定义地图创建模块');
  const v = m.verts, c = m.colors, f = m.faces;
  for (let i = 0, n = v.length / 3; i < n; i++) {
    L.push('v ' + fx(v[i * 3]) + ' ' + fx(v[i * 3 + 1]) + ' ' + fx(v[i * 3 + 2])
      + ' ' + fx(c ? c[i * 3] : 0.8) + ' ' + fx(c ? c[i * 3 + 1] : 0.8) + ' ' + fx(c ? c[i * 3 + 2] : 0.8));
  }
  /* 顶点组 → OBJ 的 g 块：按「面的三个顶点都在组内」归类，其余面进 default */
  const grps = (m.groups || []).filter((g) => g.vts && g.vts.length);
  if (grps.length) {
    const sets = grps.map((g) => new Set(g.vts));
    const assigned = new Array(f.length / 3).fill(-1);
    for (let fi = 0; fi < f.length / 3; fi++) {
      for (let gi = 0; gi < sets.length; gi++) {
        if (sets[gi].has(f[fi * 3]) && sets[gi].has(f[fi * 3 + 1]) && sets[gi].has(f[fi * 3 + 2])) { assigned[fi] = gi; break; }
      }
    }
    const emit = (gi, gname) => {
      L.push('g ' + gname);
      for (let fi = 0; fi < f.length / 3; fi++) {
        if (assigned[fi] !== gi) continue;
        L.push('f ' + (f[fi * 3] + 1) + ' ' + (f[fi * 3 + 1] + 1) + ' ' + (f[fi * 3 + 2] + 1));
      }
    };
    grps.forEach((g, gi) => emit(gi, (g.name || ('group' + gi)).replace(/\s+/g, '_')));
    emit(-1, 'default');
  } else {
    for (let i = 0; i < f.length; i += 3) L.push('f ' + (f[i] + 1) + ' ' + (f[i + 1] + 1) + ' ' + (f[i + 2] + 1));
  }
  return L.join('\n') + '\n';
}
function mfExportModelOBJ(m) {
  mfDownload((m.name || 'model') + '.obj', mfModelToOBJ(m));
  if (CTXREF) CTXREF.toast('已导出 OBJ——这是通用格式，Blender / 3D 打印软件都能打开', 3200, 'ok');
}
/* OBJ 文本 → 建模。支持 v/vt/vn 复合索引与负索引；四边形等多边形按扇形三角化 */
function mfOBJToModel(text, name) {
  const verts = [], colors = [], faces = [];
  const lines = String(text).split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const ln = lines[li].trim();
    if (!ln || ln[0] === '#') continue;
    const p = ln.split(/\s+/);
    if (p[0] === 'v' && p.length >= 4) {
      verts.push(parseFloat(p[1]) || 0, parseFloat(p[2]) || 0, parseFloat(p[3]) || 0);
      if (p.length >= 7) colors.push(clamp(parseFloat(p[4]) || 0.8, 0, 1), clamp(parseFloat(p[5]) || 0.8, 0, 1), clamp(parseFloat(p[6]) || 0.8, 0, 1));
      else colors.push(0.8, 0.8, 0.8);
    } else if (p[0] === 'f' && p.length >= 4) {
      const idx = p.slice(1).map((t) => {
        let i = parseInt(t.split('/')[0], 10);
        if (isNaN(i)) return -1;
        if (i < 0) i = verts.length / 3 + i; else i = i - 1;
        return i;
      }).filter((i) => i >= 0);
      for (let k = 1; k + 1 < idx.length; k++) faces.push(idx[0], idx[k], idx[k + 1]);
    }
  }
  if (!verts.length || !faces.length) throw new Error('OBJ 里没有可用的顶点或面');
  return { id: uid('md'), name: name || '导入的OBJ', verts: new Float32Array(verts), colors: new Float32Array(colors), faces: new Uint32Array(faces), thumb: '' };
}
/* ------------------------------------------------ STL 标准格式互通 ----
 * 二进制 STL：80 字节头 + uint32 面数 + 每面 50 字节（法线 12 + 三顶点 36 + 属性 2）。
 * 3D 打印与工业软件的最低公约数；不带颜色，导入时给默认色。 */
function mfModelToSTL(m) {
  const v = m.verts, f = m.faces, n = f.length / 3;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const hd = new TextEncoder().encode(('STL: ' + (m.name || 'model')).slice(0, 79));
  new Uint8Array(buf, 0, hd.length).set(hd);
  dv.setUint32(80, n, true);
  for (let i = 0; i < n; i++) {
    const a = f[i * 3] * 3, b = f[i * 3 + 1] * 3, c = f[i * 3 + 2] * 3;
    const ax = v[a], ay = v[a + 1], az = v[a + 2];
    const ux = v[b] - ax, uy = v[b + 1] - ay, uz = v[b + 2] - az;
    const wx = v[c] - ax, wy = v[c + 1] - ay, wz = v[c + 2] - az;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const o = 84 + i * 50;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    dv.setFloat32(o + 12, v[a], true); dv.setFloat32(o + 16, v[a + 1], true); dv.setFloat32(o + 20, v[a + 2], true);
    dv.setFloat32(o + 24, v[b], true); dv.setFloat32(o + 28, v[b + 1], true); dv.setFloat32(o + 32, v[b + 2], true);
    dv.setFloat32(o + 36, v[c], true); dv.setFloat32(o + 40, v[c + 1], true); dv.setFloat32(o + 44, v[c + 2], true);
    dv.setUint16(o + 48, 0, true);
  }
  return new Blob([buf], { type: 'model/stl' });
}
function mfExportModelSTL(m) {
  mfDownloadBlob((m.name || 'model') + '.stl', mfModelToSTL(m));
  if (CTXREF) CTXREF.toast('已导出 STL——3D 打印切片软件与工业 CAD 通用（此格式不带颜色）', 3200, 'ok');
}
/* STL（文本或二进制）→ 建模：顶点按坐标去重，免得同一个点存几千份 */
function mfSTLToModel(buf, name) {
  const verts = [], faces = [], vmap = new Map();
  const pushV = (x, y, z) => {
    const k = x.toFixed(5) + ',' + y.toFixed(5) + ',' + z.toFixed(5);
    let i = vmap.get(k);
    if (i === undefined) { i = verts.length / 3; verts.push(x, y, z); vmap.set(k, i); }
    return i;
  };
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(512, buf.byteLength)));
  if (/^\s*solid/i.test(head) && /facet/i.test(head)) {
    const txt = new TextDecoder().decode(buf);
    const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    let mt; const tri = [];
    while ((mt = re.exec(txt))) {
      tri.push(pushV(+mt[1], +mt[2], +mt[3]));
      if (tri.length === 3) { faces.push(tri[0], tri[1], tri[2]); tri.length = 0; }
    }
  } else {
    if (buf.byteLength < 84) throw new Error('STL 文件太小，不像有效文件');
    const dv = new DataView(buf);
    const n = dv.getUint32(80, true);
    if (84 + n * 50 > buf.byteLength) throw new Error('STL 面数与文件大小对不上，文件可能损坏');
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      const a = pushV(dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true));
      const b = pushV(dv.getFloat32(o + 12, true), dv.getFloat32(o + 16, true), dv.getFloat32(o + 20, true));
      const c = pushV(dv.getFloat32(o + 24, true), dv.getFloat32(o + 28, true), dv.getFloat32(o + 32, true));
      faces.push(a, b, c);
    }
  }
  if (!verts.length || !faces.length) throw new Error('STL 里没有可用的三角面');
  const colors = new Float32Array(verts.length).fill(0.8);
  return { id: uid('md'), name: name || '导入的STL', verts: new Float32Array(verts), colors: colors, faces: new Uint32Array(faces), thumb: '' };
}
/* ------------------------------------------------ glTF/GLB 标准格式互通 ----
 * GLB 是 glTF 2.0 的二进制单文件形态：Blender、Windows 3D 查看器、网页 three.js
 * 全都直接读。导出带顶点色；导入合并所有 mesh 的三角 primitive（忽略节点变换）。 */
function mfModelToGLB(m) {
  const v = m.verts, f = m.faces, nv = v.length / 3;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) {
    const x = v[i * 3 + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x;
  }
  let col = (m.colors && m.colors.length === v.length) ? m.colors : null;
  if (!col) { col = new Float32Array(v.length); col.fill(0.8); }
  const idx = (f instanceof Uint32Array) ? f : new Uint32Array(f);
  const binLen = v.byteLength + col.byteLength + idx.byteLength;
  const bin = new Uint8Array(binLen);
  bin.set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), 0);
  bin.set(new Uint8Array(col.buffer, col.byteOffset, col.byteLength), v.byteLength);
  bin.set(new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength), v.byteLength + col.byteLength);
  const json = {
    asset: { version: '2.0', generator: '我，地图和小女仆 · 自定义地图创建模块' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: m.name || 'model' }],
    meshes: [{ name: m.name || 'model', primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: mn, max: mx },
      { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: idx.length, type: 'SCALAR' }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: v.byteLength },
      { buffer: 0, byteOffset: v.byteLength, byteLength: col.byteLength },
      { buffer: 0, byteOffset: v.byteLength + col.byteLength, byteLength: idx.byteLength }
    ],
    buffers: [{ byteLength: binLen }]
  };
  let js = JSON.stringify(json);
  while (js.length % 4) js += ' ';
  const jb = new TextEncoder().encode(js);
  const binPad = (4 - (binLen % 4)) % 4;
  const total = 12 + 8 + jb.length + 8 + binLen + binPad;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4E4F534A, true);
  u8.set(jb, 20);
  const p = 20 + jb.length;
  dv.setUint32(p, binLen + binPad, true); dv.setUint32(p + 4, 0x004E4942, true);
  u8.set(bin, p + 8);
  return new Blob([out], { type: 'model/gltf-binary' });
}
function mfExportModelGLB(m) {
  mfDownloadBlob((m.name || 'model') + '.glb', mfModelToGLB(m));
  if (CTXREF) CTXREF.toast('已导出 GLB——Blender / Windows 3D 查看器 / 网页 three.js 都能直接打开', 3200, 'ok');
}
async function mfGLBToModel(f, name) {
  let json = null, bin = null;
  if (/\.glb$/i.test(f.name || '')) {
    const buf = await f.arrayBuffer();
    const dv = new DataView(buf);
    if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546C67) throw new Error('不是有效的 GLB 文件');
    let p = 12;
    while (p + 8 <= buf.byteLength) {
      const len = dv.getUint32(p, true), typ = dv.getUint32(p + 4, true);
      const chunk = buf.slice(p + 8, p + 8 + len);
      if (typ === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (typ === 0x004E4942) bin = chunk;
      p += 8 + len;
    }
    if (!json || !bin) throw new Error('GLB 里缺 JSON 块或数据块');
  } else {
    json = JSON.parse(await f.text());
    const b0 = json.buffers && json.buffers[0];
    if (b0 && b0.uri && b0.uri.indexOf('data:') === 0) {
      const u = mfUnB64(b0.uri.slice(b0.uri.indexOf(',') + 1));
      bin = u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
    } else throw new Error('.gltf 引用了外部文件（非内嵌 data: URI），请导出为 .glb 单文件再导入');
  }
  const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const readAcc = (ai) => {
    const a = json.accessors[ai];
    const bv = json.bufferViews[a.bufferView || 0] || {};
    const T = CT[a.componentType], n = NC[a.type] || 1;
    if (!T) throw new Error('不支持的数值类型 ' + a.componentType);
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const stride = bv.byteStride;
    if (stride && stride !== n * T.BYTES_PER_ELEMENT) {
      const out = new T(a.count * n);
      const u8 = new Uint8Array(bin, base, stride * (a.count - 1) + n * T.BYTES_PER_ELEMENT);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++)
        out[i * n + k] = new T(u8.buffer, u8.byteOffset + i * stride + k * T.BYTES_PER_ELEMENT, 1)[0];
      return { arr: out, n: n, comp: a.componentType, norm: !!a.normalized };
    }
    return { arr: new T(bin, base, a.count * n), n: n, comp: a.componentType, norm: !!a.normalized };
  };
  const verts = [], colors = [], faces = [];
  let prims = 0;
  (json.meshes || []).forEach((me) => (me.primitives || []).forEach((pr) => {
    if (pr.mode !== undefined && pr.mode !== 4) return;   /* 只收三角网格 */
    if (pr.attributes.POSITION === undefined) return;
    const pos = readAcc(pr.attributes.POSITION);
    if (pos.comp !== 5126) return;                        /* 量化压缩的位置先不收 */
    const base0 = verts.length / 3, nv = pos.arr.length / 3;
    for (let i = 0; i < pos.arr.length; i++) verts.push(pos.arr[i]);
    let ca = null;
    if (pr.attributes.COLOR_0 !== undefined) {
      try { ca = readAcc(pr.attributes.COLOR_0); } catch (e) { ca = null; }
    }
    const scale = ca && ca.norm ? (ca.comp === 5121 ? 255 : 65535) : 1;
    for (let i = 0; i < nv; i++) {
      if (ca) colors.push(ca.arr[i * ca.n] / scale, ca.arr[i * ca.n + 1] / scale, ca.arr[i * ca.n + 2] / scale);
      else colors.push(0.8, 0.8, 0.8);
    }
    if (pr.indices !== undefined) {
      const ia = readAcc(pr.indices).arr;
      for (let i = 0; i + 2 < ia.length; i += 3) faces.push(base0 + ia[i], base0 + ia[i + 1], base0 + ia[i + 2]);
    } else {
      for (let i = 0; i + 2 < nv; i += 3) faces.push(base0 + i, base0 + i + 1, base0 + i + 2);
    }
    prims++;
  }));
  if (!prims || !verts.length || !faces.length) throw new Error('这个 glTF/GLB 里没有可用的三角网格（可能只有曲线或点云）');
  return { id: uid('md'), name: name || '导入的GLB', verts: new Float32Array(verts), colors: new Float32Array(colors), faces: new Uint32Array(faces), thumb: '' };
}
function mfImportModel() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.mfmodel,.json,.obj,.stl,.glb,.gltf';
  inp.addEventListener('change', async () => { if (inp.files && inp.files[0]) await mfImportModelFile(inp.files[0]); });
  inp.click();
}
async function mfImportModelFile(f) {
  /* 四个格式共用一套「落库 → 上台」流程 */
  const adopt = (mo, msg) => {
    S.map.models = S.map.models || [];
    S.map.models.push(mo);
    MO.model = mfModelClone(mo, mo.name); MO.baseId = mo.id; MO.sel = [];
    mfModelRebuild();
    if (MO.renderCat) MO.renderCat();
    if (MO.nameIn) MO.nameIn.value = mo.name;
    mfTouch();
    if (CTXREF) CTXREF.toast(msg, 3000, 'ok');
  };
  try {
    const fname = f.name || '';
    if (/\.obj$/i.test(fname)) {
      const mo = mfOBJToModel(await f.text(), fname.replace(/\.obj$/i, ''));
      adopt(mo, '已导入 OBJ 建模「' + mo.name + '」（' + (mo.faces.length / 3) + ' 个面）');
      return;
    }
    if (/\.stl$/i.test(fname)) {
      const mo = mfSTLToModel(await f.arrayBuffer(), fname.replace(/\.stl$/i, ''));
      adopt(mo, '已导入 STL 建模「' + mo.name + '」（' + (mo.faces.length / 3) + ' 个面；STL 不带颜色，已给默认色）');
      return;
    }
    if (/\.(glb|gltf)$/i.test(fname)) {
      const mo = await mfGLBToModel(f, fname.replace(/\.(glb|gltf)$/i, ''));
      adopt(mo, '已导入 glTF/GLB 建模「' + mo.name + '」（' + (mo.faces.length / 3) + ' 个面）');
      return;
    }
    const o = JSON.parse(await f.text());
    if (o.magic !== 'MFMODEL1') throw new Error('不是有效的 .mfmodel 文件');
    const m = {
      id: uid('md'), name: o.name || fname.replace(/\.mfmodel$/i, ''),
      verts: new Float32Array(mfUnB64(o.verts).buffer),
      colors: new Float32Array(mfUnB64(o.colors).buffer),
      faces: new Uint32Array(mfUnB64(o.faces).buffer), thumb: ''
    };
    adopt(m, '已导入建模「' + m.name + '」');
  } catch (e) {
    if (CTXREF) CTXREF.toast('导入失败：' + (e && e.message || e), 3600, 'err');
  }
}

/* --------------------------------------------------- 地图上的建模实例 ---- */
let _instGroup = null;
function mfInstList() { return (S.map && S.map.instances) || []; }
function mfFindInst(id) { return mfInstList().find((x) => x.id === id) || null; }
function mfInstModelOf(ins) { return mfModelById(ins.modelId); }

/* 射线拾取地图上的建模实例（只打实例组，不打球面） */
function mfPickInst(clientX, clientY) {
  if (!S.ok || !_instGroup || !_instGroup.children.length) return null;
  const rect = S.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
    -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, S.camera);
  const hits = rc.intersectObjects(_instGroup.children, false);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && !o.userData.instId) o = o.parent;
  return o ? o.userData.instId : null;
}

/* 选中实例的高亮框：只给当前选中那一个加，面数再多的模型也不至于拖慢整体 */
function mfInstHighlight(mesh, on) {
  try {
    const old = mesh.getObjectByName('__mfSelBox');
    if (old) { mesh.remove(old); old.geometry.dispose(); old.material.dispose(); }
  } catch (e) { }
  if (!on) return;
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.25, 1.25, 1.25)),
    new THREE.LineBasicMaterial({ color: 0xfff0b8 })
  );
  box.name = '__mfSelBox';
  mesh.add(box);
}

function mfDeleteInstance(id) {
  const ins = mfFindInst(id);
  if (!ins) return;
  mfConfirm('删除这个建模实例？目录里的原始建模不受影响。', () => {
    /* 注意：mfConfirm 的红色危险态按钮要显式传 dgr，不传是普通「确定」样式 */
    const arr = mfInstList(), at = arr.indexOf(ins);
    mfPushFnUndo(
      () => { if (at >= 0 && at <= arr.length) arr.splice(at, 0, ins); ED.selInst = ins.id; mfRebuildInstances(); mfBuildPanel(); },
      () => { const i = arr.indexOf(ins); if (i >= 0) arr.splice(i, 1); ED.selInst = null; mfRebuildInstances(); mfBuildPanel(); },
      '删除建模实例'
    );
    arr.splice(at, 1);
    if (ED.selInst === id) ED.selInst = null;
    mfRebuildInstances(); mfBuildPanel(); mfTouch();
    if (CTXREF) CTXREF.toast('已删除建模实例', 2000, 'ok');
  }, { okLabel: '删除', dgr: true });
}

function mfRebuildInstances() {
  if (!S.scene) return;
  if (_instGroup) {
    S.scene.remove(_instGroup);
    _instGroup.traverse((o) => {
      try { if (o.geometry) o.geometry.dispose(); } catch (e) { }
      /* KiMi3：材质也要释放——每次重建都给每个实例 new 一张材质，
         不释放的话 GPU 显存只进不出，用久了浏览器就会崩 */
      try {
        const m = o.material;
        if (m) { if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m.dispose(); }
      } catch (e) { }
    });
  }
  _instGroup = new THREE.Group();
  S.scene.add(_instGroup);
  S.animMeshes = [];
  if (!S.map || !S.map.instances) return;
  const cache = new Map();
  S.map.instances.forEach((ins) => {
    const src = mfModelById(ins.modelId);
    if (!src) return;
    /* 带形变动画的模型：每个实例一份几何副本（共享几何会被动画带得一起扭） */
    const anim = (src.anims && src.anims.length && src.anims[0].frames && src.anims[0].frames.length > 1) ? src.anims[0] : null;
    let geo = cache.get(src.id);
    if (!geo) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(src.verts, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(src.colors, 3));
      geo.setIndex(new THREE.BufferAttribute(src.faces, 1));
      geo.computeVertexNormals();
      cache.set(src.id, geo);
    }
    if (anim) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(src.verts), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(src.colors), 3));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(src.faces), 1));
      geo.computeVertexNormals();
      S.animMeshes.push({ geo: geo, anim: anim, t: Math.random() * (anim.dur || 2) });
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mfPlaceInstanceMesh(mesh, ins);
    mesh.userData.instId = ins.id;
    _instGroup.add(mesh);
    if (ED.selInst === ins.id) mfInstHighlight(mesh, true);
  });
}
/* 只更新实例列表中不存在的选中项 */
function mfApplyInstTransform(ins) {
  if (!_instGroup || !ins) return;
  for (let i = 0; i < _instGroup.children.length; i++) {
    const o = _instGroup.children[i];
    if (o.userData.instId === ins.id) { mfPlaceInstanceMesh(o, ins); break; }
  }
}
function mfPlaceInstanceMesh(mesh, ins) {
  const la = ins.lat * D2R, lo = ins.lon * D2R;
  const cl = Math.cos(la);
  /* ⚠ z 必须是 −cos(lat)·sin(lon)：和 SphereGeometry 的 uv 约定一致。
   * 写成 +sin 的话，建模会被摆到镜像经度上（看着「明明放在陆地上却跑到海里去」） */
  const n = new THREE.Vector3(cl * Math.cos(lo), Math.sin(la), -cl * Math.sin(lo));
  const g = S.map.grid;
  let elev = 0;
  if (S.map.height) {
    const hv = S.map.height[g.yOf(ins.lat) * g.w + g.xOf(ins.lon)] || 0;
    elev = hv * 0.00016 * (S.map.heightScale == null ? 1 : S.map.heightScale);
  }
  const r = 1 + elev + (ins.elev || 0);
  mesh.position.copy(n).multiplyScalar(r);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  mesh.rotateY((ins.rot || 0) * D2R);
  const sc = (ins.scale == null ? 1 : ins.scale) * 0.02;
  mesh.scale.set(sc, sc, sc);
}
function mfPlaceInstance(modelId, lon, lat, opt) {
  opt = opt || {};
  S.map.instances = S.map.instances || [];
  const ins = {
    id: uid('i'), modelId: modelId, lon: lon, lat: lat,
    rot: Math.round(opt.rot || 0) % 360,
    scale: opt.scale == null ? 1 : +(+opt.scale).toFixed(2),
    elev: opt.elev ? +(+opt.elev).toFixed(4) : 0
  };
  S.map.instances.push(ins);
  mfPushFnUndo(
    () => { const i = S.map.instances.indexOf(ins); if (i >= 0) S.map.instances.splice(i, 1); mfRebuildInstances(); },
    () => { S.map.instances.push(ins); mfRebuildInstances(); },
    '放置建模'
  );
  mfRebuildInstances(); mfTouch();
  if (CTXREF) CTXREF.toast('已放置建模实例（目录里的原件仍在）', 2200, 'ok');
}
/* ===================== 部署预览（幽灵态 + 调整 + 确认） =====================
 * 半透明淡色 + 虚线描边的「幽灵」跟着鼠标贴在球面上；右键轮换调整项
 * （位置→缩放→旋转→抬升），左键拖动微调当前项，面板滑条同步；
 * 左键短击＝确认部署（首次弹确认窗，可勾选以后不再问）；Esc＝取消。 */
function mfGhostBuild(modelId) {
  const m = mfModelById(modelId);
  if (!m || !m.verts || !m.verts.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.verts), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.colors), 3));
  geo.setIndex(new THREE.BufferAttribute(m.faces instanceof Uint32Array ? new Uint32Array(m.faces) : new Uint32Array(m.faces), 1));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide
  }));
  /* 面数不多的模型加一圈虚线描边，「预览中」的感觉更强；大模型跳过免得卡 */
  if (m.faces.length / 3 <= 6000) {
    try {
      const ln = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 24),
        new THREE.LineDashedMaterial({ color: 0xffe9a8, dashSize: 0.05, gapSize: 0.035, transparent: true, opacity: 0.9 })
      );
      ln.computeLineDistances();
      mesh.add(ln);
    } catch (e) { }
  }
  return mesh;
}
function mfDeployEnd(placed) {
  const dp = ED.deploy; if (!dp) return;
  ED.deploy = null;
  try {
    S.scene.remove(dp.ghost);
    dp.ghost.traverse((o) => {
      try { if (o.geometry) o.geometry.dispose(); } catch (e) { }
      try { const m = o.material; if (m) { if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m.dispose(); } } catch (e) { }
    });
  } catch (e) { }
  if (S.controls && dp.ctlBak) { S.controls.enableRotate = dp.ctlBak.rotate; S.controls.enablePan = dp.ctlBak.pan; }
  else if (S.controls) { S.controls.enableRotate = true; S.controls.enablePan = true; }
  try { dp.unbind && dp.unbind(); } catch (e) { }
  try { dp.panel && dp.panel.remove(); } catch (e) { }
  if (!placed && CTXREF) CTXREF.toast('已取消部署，建模完好无损地躺在目录里', 2000);
}
function mfDeployConfirm() {
  const dp = ED.deploy; if (!dp) return;
  mfConfirmOpt({
    setKey: 'askDeploy',
    title: '确认部署',
    msg: '是否确认部署模型「' + dp.name + '」？',
    okLabel: '确认部署',
    noLabel: '再想想',
    askLabel: '每次部署都要确认（取消勾选后，以后点一下就放）',
    onYes: () => {
      mfPlaceInstance(dp.modelId, dp.lon, dp.lat, { rot: dp.rot, scale: dp.scale, elev: dp.elev });
      mfDeployEnd(true);
    }
  });
}
function mfDeployPreview(modelId, init) {
  if (!ED.visible) { if (CTXREF) CTXREF.toast('先打开一张地图，再把建模放上去', 2800); return; }
  if (ED.deploy) mfDeployEnd(false);
  const m = mfModelById(modelId);
  if (!m) { if (CTXREF) CTXREF.toast('找不到这个建模', 2400); return; }
  const ghost = mfGhostBuild(modelId);
  if (!ghost) { if (CTXREF) CTXREF.toast('这个建模是空的，没什么可放的', 2400); return; }
  const dp = ED.deploy = {
    modelId: modelId, name: m.name || '建模',
    lon: init && init.lon != null ? init.lon : 0,
    lat: init && init.lat != null ? init.lat : 0,
    rot: 0, scale: 1, elev: 0, mode: 'move',
    ghost: ghost, dragging: false, downXY: null, downT: 0
  };
  S.scene.add(ghost);
  ghost.visible = !!init;                       /* 无初始点时等第一次鼠标移动再现身 */
  /* 预览期间只锁旋转/平移（免得幽灵飘走），滚轮缩放放行——想拉近看清楚再部署 */
  if (S.controls) {
    dp.ctlBak = { rotate: S.controls.enableRotate, pan: S.controls.enablePan };
    S.controls.enableRotate = false; S.controls.enablePan = false;
  }
  const refresh = () => {
    ghost.visible = true;
    mfPlaceInstanceMesh(ghost, { lon: dp.lon, lat: dp.lat, rot: dp.rot, scale: dp.scale, elev: dp.elev });
  };
  dp.refresh = refresh;
  if (init) refresh();

  /* ---- 浮动调整面板 ---- */
  const panel = mfNode('div', 'mf-deploy-panel');
  const t = mfNode('div', 'dp-t', '部署预览 —— ' + dp.name);
  panel.appendChild(t);
  const modesRow = mfNode('div', 'dp-modes');
  const MODES = [['move', '位置'], ['scale', '缩放'], ['rot', '旋转'], ['elev', '抬升']];
  const chips = {};
  MODES.forEach((mo) => {
    const c = mfNode('div', 'dp-m' + (dp.mode === mo[0] ? ' on' : ''), mo[1]);
    c.title = '点我切换调整项（在球面上点右键也能轮换）';
    c.addEventListener('click', () => { dp.mode = mo[0]; syncChips(); });
    chips[mo[0]] = c; modesRow.appendChild(c);
  });
  panel.appendChild(modesRow);
  function syncChips() { MODES.forEach((mo) => chips[mo[0]].classList.toggle('on', dp.mode === mo[0])); }
  const mkSlider = (label, min, max, step, get, set, fmt) => {
    const row = mfNode('div', 'dp-row');
    row.appendChild(mfNode('label', '', label));
    const s = document.createElement('input');
    s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = String(get());
    const v = mfNode('span', 'dp-v', fmt(get()));
    s.addEventListener('input', () => { set(+s.value); v.textContent = fmt(get()); refresh(); });
    row.appendChild(s); row.appendChild(v);
    panel.appendChild(row);
    return { s: s, v: v, fmt: fmt };
  };
  const slS = mkSlider('缩放', '0.1', '6', '0.05', () => dp.scale, (x) => { dp.scale = clamp(x, 0.1, 6); }, (x) => '×' + x.toFixed(2));
  const slR = mkSlider('旋转', '0', '360', '1', () => dp.rot, (x) => { dp.rot = ((x % 360) + 360) % 360; }, (x) => Math.round(x) + '°');
  const slE = mkSlider('抬升', '-0.05', '0.3', '0.005', () => dp.elev, (x) => { dp.elev = clamp(x, -0.05, 0.3); }, (x) => x.toFixed(3));
  const syncSliders = () => {
    slS.s.value = String(dp.scale); slS.v.textContent = slS.fmt(dp.scale);
    slR.s.value = String(dp.rot); slR.v.textContent = slR.fmt(dp.rot);
    slE.s.value = String(dp.elev); slE.v.textContent = slE.fmt(dp.elev);
  };
  panel.appendChild(mfNode('div', 'dp-hint',
    '移动鼠标＝选位置　滚轮＝拉近拉远　左键短击＝确认部署　左键按住拖＝微调当前项　右键＝轮换调整项　Esc＝取消'));
  const btnRow = mfNode('div', 'mf-row');
  btnRow.style.marginTop = '6px';
  const bOk = mfNode('div', 'mf-btn pri', '确认部署'); bOk.style.flex = '1';
  bOk.addEventListener('click', () => mfDeployConfirm());
  const bNo = mfNode('div', 'mf-btn', '取消');
  bNo.addEventListener('click', () => mfDeployEnd(false));
  btnRow.appendChild(bOk); btnRow.appendChild(bNo);
  panel.appendChild(btnRow);
  document.body.appendChild(panel);
  dp.panel = panel;

  /* ---- 画布事件 ---- */
  const onMove = (e) => {
    if (!ED.deploy) return;
    if (dp.dragging && dp.downXY) {
      const dx = e.clientX - dp.downXY.x, dy = e.clientY - dp.downXY.y;
      dp.downXY = { x: e.clientX, y: e.clientY };
      if (dp.mode === 'scale') dp.scale = clamp(dp.scale + dx * 0.012, 0.1, 6);
      else if (dp.mode === 'rot') dp.rot = ((dp.rot + dx * 0.6) % 360 + 360) % 360;
      else if (dp.mode === 'elev') dp.elev = clamp(dp.elev - dy * 0.0012, -0.05, 0.3);
      else { const h = mfPick(e.clientX, e.clientY); if (h) { dp.lon = h.lon; dp.lat = h.lat; } }
      syncSliders(); refresh();
      return;
    }
    if (dp.mode === 'move') {
      const h = mfPick(e.clientX, e.clientY);
      if (h) { dp.lon = h.lon; dp.lat = h.lat; refresh(); }
    }
  };
  const onDown = (e) => {
    if (!ED.deploy || e.button !== 0) return;
    dp.dragging = true; dp.downXY = { x: e.clientX, y: e.clientY }; dp.downT = Date.now();
    e.preventDefault();
  };
  const onUp = (e) => {
    if (!ED.deploy || e.button !== 0) return;
    dp.dragging = false;
    const moved = dp.downXY ? Math.hypot(e.clientX - dp.downXY.x, e.clientY - dp.downXY.y) : 99;
    const dt = Date.now() - dp.downT;
    dp.downXY = null;
    /* 短击（几乎没动、按得不久）才算确认；拖动只是调整 */
    if (moved < 5 && dt < 350 && ghost.visible) mfDeployConfirm();
  };
  const onCtx = (e) => {
    if (!ED.deploy) return;
    e.preventDefault(); e.stopPropagation();
    const order = ['move', 'scale', 'rot', 'elev'];
    dp.mode = order[(order.indexOf(dp.mode) + 1) % order.length];
    syncChips();
    const nm = { move: '位置（左键拖动＝挪动）', scale: '缩放（左键左右拖）', rot: '旋转（左键左右拖）', elev: '抬升（左键上下拖）' }[dp.mode];
    if (CTXREF) CTXREF.toast('当前调整项：' + nm, 1400);
  };
  const onKey = (e) => { if (ED.deploy && e.key === 'Escape') mfDeployEnd(false); };
  S.canvas.addEventListener('pointermove', onMove);
  S.canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  S.canvas.addEventListener('contextmenu', onCtx);
  window.addEventListener('keydown', onKey);
  dp.unbind = () => {
    S.canvas.removeEventListener('pointermove', onMove);
    S.canvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    S.canvas.removeEventListener('contextmenu', onCtx);
    window.removeEventListener('keydown', onKey);
  };
  if (CTXREF) CTXREF.toast('部署预览：移动鼠标选位置，左键点＝确认，右键＝换调整项，Esc＝取消', 3600);
}
function mfUseModelOnMap(modelId) {
  if (!ED.visible) { if (CTXREF) CTXREF.toast('先打开一张地图，再把建模放上去', 2800); return; }
  /* 从建模系统（全屏对话框）里点「使用」时先收起对话框，不然球面被挡着点不到 */
  try { if (MO.open && MO.dlg) MO.dlg.close(); } catch (e) { }
  mfDeployPreview(modelId);
}

/* ===================== 城镇系统 =============================================
 * 城镇笔涂出的聚落带，松手自动撒城镇（避海 + 最小间距 + 一笔上限 24 座）。
 * 城镇 = 记录 + 建模实例 + 标签「三件套」：同生同灭，改名/拖移三处同步。
 * 建模默认随机取内置三套（村落/城镇/城市），可在目录里换。 */

function mfTownTriple(t) {
  return {
    t: t,
    ins: (S.map.instances || []).find((x) => x.id === t.instId) || null,
    l: (S.map.labels || []).find((x) => x.id === t.labelId) || null
  };
}
function mfTownCreate(lon, lat, name) {
  S.map.towns = S.map.towns || [];
  S.map.labels = S.map.labels || [];
  S.map.instances = S.map.instances || [];
  const t = {
    id: uid('t'), name: name || ('未命名城镇' + (S.map.towns.length + 1)),
    lon: lon, lat: lat,
    modelId: 'builtin:town' + (1 + ((Math.random() * 3) | 0))
  };
  const ins = { id: uid('i'), modelId: t.modelId, lon: lon, lat: lat, rot: (Math.random() * 360) | 0, scale: 0.9, elev: 0 };
  S.map.instances.push(ins);
  t.instId = ins.id;
  const l = { id: uid('l'), text: t.name, lon: lon, lat: lat, type: 'town', polityId: null, size: 12 };
  S.map.labels.push(l);
  t.labelId = l.id;
  S.map.towns.push(t);
  return { t: t, ins: ins, l: l };
}
/* 三件套同灭 / 同还（撤销由调用方包） */
function mfTownDrop(tp) {
  let arr = S.map.towns, i = arr.indexOf(tp.t); if (i >= 0) arr.splice(i, 1);
  arr = S.map.instances; i = arr.indexOf(tp.ins); if (i >= 0) arr.splice(i, 1);
  arr = S.map.labels; i = arr.indexOf(tp.l); if (i >= 0) arr.splice(i, 1);
}
function mfTownBack(tp) {
  if (S.map.towns.indexOf(tp.t) < 0) S.map.towns.push(tp.t);
  if (S.map.instances.indexOf(tp.ins) < 0) S.map.instances.push(tp.ins);
  if (S.map.labels.indexOf(tp.l) < 0) S.map.labels.push(tp.l);
}
function mfTownRename(t, v) {
  const tp = mfTownTriple(t);
  const oldT = t.name, oldL = tp.l ? tp.l.text : oldT;
  t.name = v; if (tp.l) tp.l.text = v;
  mfPushFnUndo(
    () => { t.name = oldT; if (tp.l) tp.l.text = oldL; if (UI.panel) mfBuildPanel(); mfTouch(); },
    () => { t.name = v; if (tp.l) tp.l.text = v; if (UI.panel) mfBuildPanel(); mfTouch(); },
    '重命名城镇'
  );
  mfTouch();
}
function mfTownSetModel(t, mid) {
  const tp = mfTownTriple(t);
  const old = t.modelId;
  t.modelId = mid;
  if (tp.ins) tp.ins.modelId = mid;
  mfPushFnUndo(
    () => { t.modelId = old; if (tp.ins) tp.ins.modelId = old; mfRebuildInstances(); mfTouch(); },
    () => { t.modelId = mid; if (tp.ins) tp.ins.modelId = mid; mfRebuildInstances(); mfTouch(); },
    '更换城镇建模'
  );
  mfRebuildInstances(); mfTouch();
}
/* 实例被「建模实例」工具拖走时，城镇记录与标签跟着走（不单独记撤销） */
function mfTownSyncInst(ins) {
  if (!ins || !S.map || !S.map.towns) return;
  const t = S.map.towns.find((x) => x.instId === ins.id);
  if (!t) return;
  t.lon = ins.lon; t.lat = ins.lat;
  const l = (S.map.labels || []).find((x) => x.id === t.labelId);
  if (l) { l.lon = ins.lon; l.lat = ins.lat; }
}
/* 城镇笔一笔试撒：cells = 笔迹扫过的栅格索引 */
function mfTownsSpawn(cells) {
  if (!S.map || !cells.length) return;
  const g = S.map.grid;
  S.map.towns = S.map.towns || [];
  const spacing = ED.townGap || 0.8;                       /* 最小间距（度） */
  const cand = [], seen = new Set();
  cells.forEach((i) => {
    if (seen.has(i)) return; seen.add(i);
    if (g.region[i] === 2) return;                         /* 海洋里不长城镇 */
    const y = Math.floor(i / g.w), x = i - y * g.w;
    cand.push({ lon: g.lonOfX(x), lat: g.latOfY(y) });
  });
  for (let i = cand.length - 1; i > 0; i--) {              /* 洗牌后按间距筛，分布更自然 */
    const j = (Math.random() * (i + 1)) | 0, tmp = cand[i]; cand[i] = cand[j]; cand[j] = tmp;
  }
  const made = [];
  const tooClose = (lon, lat) => {
    for (let i = 0; i < S.map.towns.length; i++) {
      const t = S.map.towns[i];
      if (mfAngDist(t.lon, t.lat, lon, lat) * R2D < spacing) return true;
    }
    for (let i = 0; i < made.length; i++) {
      const t = made[i].t;
      if (mfAngDist(t.lon, t.lat, lon, lat) * R2D < spacing) return true;
    }
    return false;
  };
  for (let i = 0; i < cand.length && made.length < 24; i++) {
    if (tooClose(cand[i].lon, cand[i].lat)) continue;
    made.push(mfTownCreate(cand[i].lon, cand[i].lat, null));
  }
  if (!made.length) {
    if (CTXREF) CTXREF.toast('这片撒不下新城镇（离已有城镇太近，或全是海洋）', 2400);
    return;
  }
  mfPushFnUndo(
    () => { made.forEach((tp) => mfTownDrop(tp)); mfRebuildInstances(); if (UI.panel) mfBuildPanel(); },
    () => { made.forEach((tp) => mfTownBack(tp)); mfRebuildInstances(); if (UI.panel) mfBuildPanel(); },
    '生成城镇 ×' + made.length
  );
  mfRebuildInstances(); mfTouch(); if (UI.panel) mfBuildPanel();
  if (CTXREF) CTXREF.toast('已生成 ' + made.length + ' 座城镇（间距过密处已自动稀疏）', 2600, 'ok');
}

/* ===================== 水域系统 =============================================
 * 湖泊：水域层涂面 →「一键生成」把水面拼成建模；河流：笔迹折线松手自动成带。
 * 生成物 = cat:'water' + abs:true 的建模：进建模目录、可再编辑/导出，
 * 但渲染走「绝对坐标通道」（直接贴球面，不经实例摆放——它是地貌不是摆件）。 */

/* 经纬度 + 半径 → 球面点（与全局 uv/实例约定一致：z = −cos(lat)·sin(lon)） */
function mfSpherePt(lon, lat, r) {
  const la = lat * D2R, lo = lon * D2R, cl = Math.cos(la);
  return [cl * Math.cos(lo) * r, Math.sin(la) * r, -cl * Math.sin(lo) * r];
}
/* 水域格的地表抬升（与实例摆放同一套高度口径） */
function mfWaterElev(g, ci) {
  const H = S.map.height;
  if (!H) return 0;
  return Math.max(0, (H[ci] || 0)) * 0.00016 * (S.map.heightScale == null ? 1 : S.map.heightScale);
}
/* 绝对坐标建模 → 当前时代目录 + 渲染 */
function mfWaterModelAdd(geom, name) {
  const m = mfGeomToModel(geom, name);
  m.cat = 'water';
  m.abs = true;
  S.map.models = S.map.models || [];
  S.map.models.push(m);
  mfPushFnUndo(
    () => { const i = S.map.models.indexOf(m); if (i >= 0) S.map.models.splice(i, 1); mfRebuildWaters(); if (MO.renderCat) MO.renderCat(); },
    () => { if (S.map.models.indexOf(m) < 0) S.map.models.push(m); mfRebuildWaters(); if (MO.renderCat) MO.renderCat(); },
    '生成水域建模'
  );
  mfRebuildWaters(); mfTouch();
  if (CTXREF) CTXREF.toast('已生成「' + name + '」（建模目录 › 水域 里可再编辑/导出）', 3000, 'ok');
  return m;
}
/* 一键生成湖泊水面：水域层每格一块贴合球面的水板 */
function mfLakeBuild() {
  if (!S.map) return;
  const g = S.map.grid;
  const geom = mfGeom();
  const col = mfCol('#5b96c4');
  let cells = 0;
  for (let ci = 0; ci < g.water.length; ci++) {
    if (!g.water[ci]) continue;
    cells++;
    if (cells > 60000) { if (CTXREF) CTXREF.toast('水域范围太大（>6 万格），先分几片生成', 3000, 'err'); return; }
    const y = Math.floor(ci / g.w), x = ci - y * g.w;
    const lon0 = g.lonOfX(x) - g.res / 2, lat0 = g.latOfY(y) + g.res / 2;
    const r = 1.004 + mfWaterElev(g, ci);
    const base = geom.verts.length / 3;
    [[lon0, lat0], [lon0 + g.res, lat0], [lon0 + g.res, lat0 - g.res], [lon0, lat0 - g.res]].forEach((p) => {
      const w = mfSpherePt(p[0], p[1], r);
      geom.verts.push(w[0], w[1], w[2]);
      geom.colors.push(col[0], col[1], col[2]);
    });
    geom.faces.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  if (!cells) { if (CTXREF) CTXREF.toast('还没涂水域：用「水 水域」笔的湖泊模式先涂一片', 2800); return; }
  const n = (S.map.models || []).filter((x) => mfCatGroup(x.cat) === 'water').length + 1;
  mfWaterModelAdd(geom, '湖泊水面 ' + n);
  if (UI.panel) mfBuildPanel();
}
/* 河流：笔迹折线 → 沿路径的等宽水面条带（宽度＝笔刷） */
function mfRiverBuild(path, brushPx) {
  if (!S.map) return;
  if (!path || path.length < 2) { if (CTXREF) CTXREF.toast('河流太短，画长一点再松手', 2200); return; }
  const g = S.map.grid;
  const mid = path[(path.length / 2) | 0];
  const halfW = Math.max(0.0015, mfPixelToRad(brushPx, mid.lon, mid.lat) * 0.6);
  const geom = mfGeom();
  const col = mfCol('#5b96c4');
  const c = Math.cos(halfW), s = Math.sin(halfW);
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const a = mfSpherePt(path[Math.max(0, i - 1)].lon, path[Math.max(0, i - 1)].lat, 1);
    const b = mfSpherePt(path[Math.min(path.length - 1, i + 1)].lon, path[Math.min(path.length - 1, i + 1)].lat, 1);
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const u = mfSpherePt(p.lon, p.lat, 1);
    /* 岸法向 = 球面方向 × 切线 */
    let nx = u[1] * tz - u[2] * ty, ny = u[2] * tx - u[0] * tz, nz = u[0] * ty - u[1] * tx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const ci = g.yOf(p.lat) * g.w + g.xOf(p.lon);
    const rOut = 1.004 + mfWaterElev(g, ci);
    geom.verts.push(
      (u[0] * c + nx * s) * rOut, (u[1] * c + ny * s) * rOut, (u[2] * c + nz * s) * rOut,
      (u[0] * c - nx * s) * rOut, (u[1] * c - ny * s) * rOut, (u[2] * c - nz * s) * rOut
    );
    geom.colors.push(col[0], col[1], col[2], col[0], col[1], col[2]);
    if (i > 0) {
      const b0 = (i - 1) * 2;
      geom.faces.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2);
    }
  }
  const n = (S.map.models || []).filter((x) => mfCatGroup(x.cat) === 'water').length + 1;
  mfWaterModelAdd(geom, '河流水面 ' + n);
}
/* 绝对坐标渲染通道：与实例组平行的第二个网格组 */
let _waterGroup = null;
function mfRebuildWaters() {
  if (!S.scene) return;
  if (_waterGroup) {
    S.scene.remove(_waterGroup);
    _waterGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    _waterGroup = null;
  }
  _waterGroup = new THREE.Group();
  S.scene.add(_waterGroup);
  if (!S.map) return;
  (S.map.models || []).forEach((m) => {
    if (!m.abs || !m.verts || !m.verts.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.verts, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(m.faces, 1));
    geo.computeVertexNormals();
    _waterGroup.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide
    })));
  });
}

/* ===================== 90_label_era.js ===================== */
/* ==========================================================================
 * 标签系统（地名 / 水域名 / 山名 / 势力名）
 * + 时代轴：每个「时代」是一颗独立星球（各自的陆地/势力/地形/建模/标签）
 *   默认第一个时代叫「当前时代」；点加号创建新星球，可套用「时代模板」
 * ========================================================================== */

let _dragEra = -1;

function mfRefreshEraBar() {
  if (!UI.tl || !S.pack) return;
  UI.tl.innerHTML = '';
  S.pack.worlds.forEach((w, i) => {
    const nm = w.name || '未命名时代';
    const c = mfNode('div', 'mf-era-chip' + (S.pack.cur === i ? ' on' : ''), esc(nm));
    c.title = nm + '\n左键：切换到这个时代（独立星球）\n右键：重命名 / 更换位置 / 保存为时代模板\n拖动：更换位置';
    c.draggable = true;
    c.addEventListener('click', () => mfUseEra(i));
    c.addEventListener('contextmenu', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      mfMenu(ev.clientX, ev.clientY, [
        { icon: '✎', label: '重命名', fn: () => mfEraRename(i) },
        { icon: '⇄', label: '更换位置', fn: () => mfEraMoveDialog(i) },
        { icon: '◇', label: '把这个时代保存为时代模板', fn: () => mfEraSaveTemplate(S.pack.worlds[i]) },
        { sep: true },
        { icon: '✕', label: '删除这个时代', dgr: true, fn: () => mfEraDelete(i) }
      ]);
    });
    /* 拖动换位 */
    c.addEventListener('dragstart', (ev) => {
      _dragEra = i; c.classList.add('dragging');
      try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(i)); } catch (e) { }
    });
    c.addEventListener('dragend', () => { _dragEra = -1; c.classList.remove('dragging'); mfRefreshEraBar(); });
    c.addEventListener('dragover', (ev) => { ev.preventDefault(); c.classList.add('dragover'); });
    c.addEventListener('dragleave', () => c.classList.remove('dragover'));
    c.addEventListener('drop', (ev) => {
      ev.preventDefault(); c.classList.remove('dragover');
      const from = (_dragEra >= 0) ? _dragEra : parseInt((ev.dataTransfer || {}).getData ? ev.dataTransfer.getData('text/plain') : '', 10);
      if (isNaN(from) || from === i) return;
      mfEraMoveTo(from, i);
    });
    const x = mfNode('span', 'x', '✕');
    x.title = '删除这个时代';
    x.addEventListener('click', (ev) => { ev.stopPropagation(); mfEraDelete(i); });
    c.appendChild(x);
    UI.tl.appendChild(c);
  });
  if (UI.tlAdd) UI.tlAdd.style.display = '';
}

/* --------------------------------------------------------- 空间系统 ------
 * 空间＝球面上圈出的一小块「里世界」：圆心经纬 + 半径（km），内部是独立的
 * 高精度建模场景（复用整个建模系统），建好后可第一人称进入。
 * 球面标记＝贴地圆圈（LineLoop）+ 圆心光柱；右键标记弹出管理菜单。 */
function mfSpaceSurfR(lon, lat) {
  /* 地表半径：基础球 × 塑形 × 地形高度，再抬高一点点防穿插 */
  const R = CFG.R;
  let s0 = 0;
  const shp = mfShapeOf(S.map);
  if (shp && S.geo && S.geo.parameters) {
    const ws = S.geo.parameters.widthSegments, hs = S.geo.parameters.heightSegments;
    const u = (lon + 180) / 360, v = (lat + 90) / 180;
    let ix = Math.round(u * ws) % ws; if (ix < 0) ix += ws;
    let iy = Math.round((1 - v) * hs); iy = clamp(iy, 0, hs);
    const vi = iy * (ws + 1) + ix;
    if (vi >= 0 && vi < shp.length) s0 = shp[vi] || 0;
  }
  let hv = 0;
  if (S.map.height) {
    const g = S.map.grid;
    hv = S.map.height[g.yOf(lat) * g.w + g.xOf(lon)] || 0;
  }
  const HS = (S.map.heightScale == null ? 1 : S.map.heightScale) * 0.00016;
  return R * (1 + s0) * (1 + hv * HS) * 1.004;
}

function mfSpaceMarkBuild(sp) {
  /* 圆圈：沿球面小圆采样 72 点，逐点贴地表 */
  const _c3 = mfSpherePt(sp.lon, sp.lat, 1);
  const C = new THREE.Vector3(_c3[0], _c3[1], _c3[2]);
  const up = Math.abs(C.y) < 0.94 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(up, C).normalize();
  const v = new THREE.Vector3().crossVectors(C, u).normalize();
  const rho = clamp(sp.radKm / mfAstroOf(S.map).radiusKm, 0.002, 0.5);
  const pts = [];
  const P = new THREE.Vector3();
  for (let i = 0; i < 72; i++) {
    const t = i / 72 * Math.PI * 2;
    P.copy(C).multiplyScalar(Math.cos(rho))
      .addScaledVector(u, Math.sin(rho) * Math.cos(t))
      .addScaledVector(v, Math.sin(rho) * Math.sin(t))
      .normalize();
    const lon = Math.atan2(-P.z, P.x) * 180 / Math.PI;
    const lat = Math.asin(clamp(P.y, -1, 1)) * 180 / Math.PI;
    pts.push(P.clone().multiplyScalar(mfSpaceSurfR(lon, lat)));
  }
  const cg = new THREE.BufferGeometry().setFromPoints(pts);
  const circle = new THREE.LineLoop(cg, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.95 }));
  circle.userData.spId = sp.id;
  /* 圆心光柱：细圆柱，微微发光感（加法混合） */
  const rr = mfSpaceSurfR(sp.lon, sp.lat);
  const bg = new THREE.CylinderGeometry(CFG.R * 0.004, CFG.R * 0.004, CFG.R * 0.06, 8);
  const beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.85 }));
  beam.position.copy(C).multiplyScalar(rr + CFG.R * 0.024);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), C);
  beam.userData.spId = sp.id;
  return [circle, beam];
}

function mfRebuildSpaceMarks() {
  if (!S.scene) return;
  if (S.spaceMarks) {
    S.spaceMarks.children.forEach((m) => { try { m.geometry.dispose(); m.material.dispose(); } catch (e) { } });
    S.scene.remove(S.spaceMarks);
    S.spaceMarks = null;
  }
  if (!S.map || !(S.map.spaces || []).length) return;
  const grp = new THREE.Group();
  S.map.spaces.forEach((sp) => {
    mfSpaceMarkBuild(sp).forEach((m) => grp.add(m));
  });
  S.scene.add(grp);
  S.spaceMarks = grp;
}

function mfPickSpace(clientX, clientY) {
  if (!S.spaceMarks || !S.camera) return null;
  const rect = S.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, S.camera);
  ray.params.Line = { threshold: CFG.R * 0.01 };
  const hits = ray.intersectObjects(S.spaceMarks.children, false);
  if (!hits.length) return null;
  const id = hits[0].object.userData.spId;
  return (S.map.spaces || []).find((x) => x.id === id) || null;
}

/* 空间类型预设：不同类型＝不同的起手单元尺寸。空间由若干立方体单元堆成，
 * 编辑界面里选中格的六个面上会出现「＋」，点一下就在那个方向堆一格，上不封顶 */
const MF_SPACE_TYPES = [
  { id: 'room', name: '房间', cellM: 8, tip: '一间屋子：客厅、书房、小铺子' },
  { id: 'hall', name: '大厅 / 庭院', cellM: 16, tip: '大堂、院落、礼堂——比房间敞亮' },
  { id: 'school', name: '学校', cellM: 24, tip: '教学楼加操场的尺度，起手两格并排' },
  { id: 'block', name: '街区', cellM: 40, tip: '一条街的起步格，往外堆就是城区' },
  { id: 'city', name: '城市', cellM: 80, tip: '一格装得下一座小城，六个方向随便堆' }
];
function mfSpaceType(t) { return MF_SPACE_TYPES.filter((x) => x.id === t)[0] || MF_SPACE_TYPES[0]; }
function mfSpaceCells(sp) { if (!sp.cells || !sp.cells.length) sp.cells = [{ x: 0, y: 0, z: 0 }]; return sp.cells; }
function mfSpaceCellM(sp) { return sp.cellM || mfSpaceType(sp.type).cellM; }

function mfSpaceCreateAt(hit) {
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', 'mf-note',
    '以刚才点中的位置为圆心，圈一块「里世界」。半径决定圈多大（地球上 5km 大约是一个小镇）；'
    + '里面的空间用建模系统搭建，精度到厘米，建好后能第一人称走进去。'));
  const nmR = mfNode('div', 'mf-row');
  nmR.appendChild(mfNode('label', '', '名字'));
  const nm = mfNode('input', 'mf-inp'); nm.value = '未命名空间'; nm.style.flex = '1';
  nmR.appendChild(nm); wrap.appendChild(nmR);
  const tpR = mfNode('div', 'mf-row');
  const tpL = mfNode('label', '', '空间类型 ？');
  tpL.title = '不同类型的起手单元尺寸不同：房间 8m 一格、城市 80m 一格；建成后可在「编辑空间」里往六个方向无限堆格扩建';
  tpL.style.cursor = 'help';
  tpR.appendChild(tpL);
  const tp = mfNode('select', 'mf-sel');
  tp.style.flex = '1';
  MF_SPACE_TYPES.forEach((t) => {
    const op = document.createElement('option');
    op.value = t.id; op.textContent = t.name + '（' + t.cellM + 'm/格）'; op.title = t.tip;
    tp.appendChild(op);
  });
  tpR.appendChild(tp); wrap.appendChild(tpR);
  const rdR = mfNode('div', 'mf-row');
  const rdL = mfNode('label', '', '半径 km ？');
  rdL.title = '空间在球面上的圈半径（km）。只影响标记圈大小与入口位置，里面的可用面积远大于此——里世界嘛';
  rdL.style.cursor = 'help';
  rdR.appendChild(rdL);
  const rd = mfNode('input', 'mf-inp'); rd.type = 'number'; rd.value = '5'; rd.min = '0.1'; rd.step = '0.5'; rd.style.flex = '1';
  rdR.appendChild(rd); wrap.appendChild(rdR);
  mfDialog({
    title: '圈定空间', width: '380px', body: wrap,
    buttons: [
      { label: '取消', fn: function () { } },
      {
        label: '圈定', pri: true, fn: function () {
          const ty = mfSpaceType(tp.value);
          const sp = {
            id: uid('sp'), name: nm.value || '未命名空间',
            lon: hit.lon, lat: hit.lat,
            radKm: clamp(+rd.value || 5, 0.1, 20000), geom: null,
            type: ty.id, cellM: ty.cellM,
            cells: ty.id === 'school' ? [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] : [{ x: 0, y: 0, z: 0 }]
          };
          S.map.spaces = S.map.spaces || [];
          S.map.spaces.push(sp);
          mfPushFnUndo(
            () => { const i = S.map.spaces.indexOf(sp); if (i >= 0) S.map.spaces.splice(i, 1); mfRebuildSpaceMarks(); },
            () => { if (S.map.spaces.indexOf(sp) < 0) S.map.spaces.push(sp); mfRebuildSpaceMarks(); },
            '圈定空间', false);
          mfRebuildSpaceMarks(); mfTouch();
          if (CTXREF) CTXREF.toast('空间「' + sp.name + '」已圈定：右键蓝色标记可进入 / 编辑', 3200, 'ok');
        }
      }
    ]
  });
  setTimeout(() => { try { nm.focus(); nm.select(); } catch (e) { } }, 30);
}

function mfSpaceMenu(sp, x, y) {
  mfMenu(x, y, [
    { icon: '◉', label: '进入查看（第一人称）', fn: () => mfSpaceView(sp) },
    { icon: '✎', label: '编辑空间（建模）', fn: () => mfSpaceEdit(sp) },
    { sep: true },
    { icon: '◎', label: '转动视角到这里', fn: () => mfGoto(sp.lon, sp.lat, 1.6) },
    { icon: '✎', label: '重命名', fn: () => mfPrompt('空间名称', sp.name, (v) => { sp.name = v || sp.name; mfTouch(); }, { title: '重命名空间' }) },
    {
      icon: '✕', label: '删除空间', fn: () => mfConfirm('删除空间「' + sp.name + '」？里面的搭建会一起消失。', () => {
        const arr = S.map.spaces, i = arr.indexOf(sp);
        const at = i; if (i >= 0) arr.splice(i, 1);
        mfPushFnUndo(
          () => { arr.splice(at, 0, sp); mfRebuildSpaceMarks(); },
          () => { const j = arr.indexOf(sp); if (j >= 0) arr.splice(j, 1); mfRebuildSpaceMarks(); },
          '删除空间', false);
        mfRebuildSpaceMarks(); mfTouch();
      }, { dgr: true, okLabel: '删除', title: '删除空间' })
    }
  ]);
}

/* 编辑空间：把球面空间的内部几何放上建模台（保存时写回空间，不进建模目录） */
function mfSpaceEdit(sp) {
  if (!sp) return;
  mfOpenModeling({ spaceId: sp.id });
}

/* --------------------------------------------------- 空间：第一人称查看 ---
 * 点击进入，鼠标控制视线，WASD 走动（Shift 加速）。无碰撞——
 * 这是给「看看搭得怎么样」用的漫游，不是物理仿真。1 单位 ≈ 1 米，视点高 1.7。 */
const SPV = { open: false, dlg: null, renderer: null, ro: null, raf: 0, keys: null, yaw: 0, pitch: 0, cam: null };
function mfSpaceView(sp) {
  if (!mfEnsureThree()) { if (CTXREF) CTXREF.toast('未找到 three.js 运行时', 3200, 'err'); return; }
  if (!sp || !sp.geom || !sp.geom.faces || !sp.geom.faces.length) {
    if (CTXREF) CTXREF.toast('「' + (sp ? sp.name : '') + '」里面还是空的：先用「编辑空间」搭点什么吧', 3200);
    return;
  }
  if (SPV.open && SPV.dlg) { try { SPV.dlg.close(); } catch (e) { } }

  const wrap = mfNode('div', 'mf-mod-c');
  wrap.style.flex = '1';
  const cv = mfNode('canvas', 'mf-mod-cv');
  wrap.appendChild(cv);
  const cross = mfNode('div', '', '＋');
  cross.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,.75);font-size:18px;pointer-events:none;text-shadow:0 1px 3px #000';
  wrap.appendChild(cross);
  const hint = mfNode('div', '', '点击画面锁定视角 · 鼠标＝看 · W A S D＝走 · Shift＝快走 · L＝昼夜 · Esc＝松开鼠标');
  hint.style.cssText = 'position:absolute;left:50%;bottom:10px;transform:translateX(-50%);color:#c8d4ee;font-size:12px;background:rgba(10,16,28,.55);padding:4px 12px;border-radius:8px;pointer-events:none';
  wrap.appendChild(hint);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e18);
  const camera = new THREE.PerspectiveCamera(66, 1, 0.05, 2000);
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const ambL = new THREE.AmbientLight(0xffffff, 0.7); scene.add(ambL);
  const d1 = new THREE.DirectionalLight(0xffffff, 0.85); d1.position.set(5, 8, 3); scene.add(d1);
  /* 昼夜循环：白昼 → 黄昏 → 夜晚（L 键或右上角小按钮） */
  const SPV_LIGHTS = [
    { n: '昼', amb: [0xffffff, 0.7], dir: [0xffffff, 0.85], bg: 0x0a0e18 },
    { n: '昏', amb: [0xffd9b0, 0.45], dir: [0xffa060, 0.6], bg: 0x16101e },
    { n: '夜', amb: [0x8098c8, 0.2], dir: [0x9fb8ff, 0.28], bg: 0x04060c }
  ];
  let spvLightIdx = 0;
  const lightBtn = mfNode('div', '', '昼');
  lightBtn.style.cssText = 'position:absolute;right:12px;top:10px;z-index:5;color:#dfe8ff;font-size:13px;' +
    'background:rgba(10,16,28,.55);padding:4px 12px;border-radius:8px;cursor:pointer;user-select:none;-webkit-user-select:none';
  lightBtn.title = '昼夜切换（也可以按 L 键）';
  const mfSpvLightCycle = function () {
    spvLightIdx = (spvLightIdx + 1) % SPV_LIGHTS.length;
    const L = SPV_LIGHTS[spvLightIdx];
    ambL.color.setHex(L.amb[0]); ambL.intensity = L.amb[1];
    d1.color.setHex(L.dir[0]); d1.intensity = L.dir[1];
    scene.background = new THREE.Color(L.bg);
    lightBtn.textContent = L.n;
  };
  lightBtn.addEventListener('click', function () { mfSpvLightCycle(); });
  wrap.appendChild(lightBtn);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sp.geom.verts), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sp.geom.colors), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(sp.geom.faces), 1));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }));
  scene.add(mesh);
  /* 出生点与漫游范围：以空间单元格为准（没有格子信息就退回几何包围盒） */
  const span = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z, 2);
  const cells = mfSpaceCells(sp), cm = mfSpaceCellM(sp);
  let cx0 = Infinity, cx1 = -Infinity, cy0 = Infinity, cy1 = -Infinity, cz0 = Infinity, cz1 = -Infinity;
  cells.forEach((c) => {
    if (c.x < cx0) cx0 = c.x; if (c.x > cx1) cx1 = c.x;
    if (c.y < cy0) cy0 = c.y; if (c.y > cy1) cy1 = c.y;
    if (c.z < cz0) cz0 = c.z; if (c.z > cz1) cz1 = c.z;
  });
  SPV.bounds = {
    x0: cx0 * cm - 0.4, x1: (cx1 + 1) * cm + 0.4,
    y0: cy0 * cm + 0.4, y1: (cy1 + 1) * cm + 1.6,
    z0: cz0 * cm - 0.4, z1: (cz1 + 1) * cm + 0.4
  };
  SPV.speed = clamp(cm * 0.5, 4.2, 24);
  camera.position.set((SPV.bounds.x0 + SPV.bounds.x1) / 2, cy0 * cm + 1.7, SPV.bounds.z1 - Math.max(1.2, cm * 0.15));
  SPV.yaw = Math.PI; SPV.pitch = 0;
  SPV.cam = camera; SPV.renderer = renderer;

  cv.addEventListener('click', () => {
    if (SPV.open && cv.requestPointerLock) { try { cv.requestPointerLock(); } catch (e) { } }
  });
  const onMouse = (e) => {
    if (document.pointerLockElement !== cv) return;
    SPV.yaw -= (e.movementX || 0) * 0.0023;
    SPV.pitch = clamp(SPV.pitch - (e.movementY || 0) * 0.0023, -1.45, 1.45);
  };
  /* 触屏漫步：单指拖动转身（指针锁是鼠标的专利，手指走这条） */
  let spvTouch = null;
  cv.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') spvTouch = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'touch' || !spvTouch || !SPV.open) return;
    SPV.yaw -= (e.clientX - spvTouch.x) * 0.006;
    SPV.pitch = clamp(SPV.pitch - (e.clientY - spvTouch.y) * 0.006, -1.45, 1.45);
    spvTouch = { x: e.clientX, y: e.clientY };
  });
  const spvTouchEnd = function (e) { if (e.pointerType === 'touch') spvTouch = null; };
  cv.addEventListener('pointerup', spvTouchEnd);
  cv.addEventListener('pointercancel', spvTouchEnd);
  const keys = {};
  const onKey = (e, dn) => {
    keys[e.code] = dn;
    if (dn && e.code === 'KeyL') { mfSpvLightCycle(); e.preventDefault(); return; }
    if (dn && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
  };
  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  document.addEventListener('mousemove', onMouse);
  document.addEventListener('keydown', kd);
  document.addEventListener('keyup', ku);
  SPV.keys = keys;

  /* 触屏漫步踏板：没有键盘的手指，踩这个走路 */
  if (navigator.maxTouchPoints > 0) {
    const pedal = mfNode('div');
    pedal.style.cssText = 'position:absolute;bottom:46px;left:50%;transform:translateX(-50%);display:flex;gap:16px;z-index:5';
    const mkPedal = function (label, code) {
      const b = mfNode('div', '', label);
      b.style.cssText = 'width:64px;height:64px;border-radius:50%;background:rgba(20,30,52,.62);border:1px solid rgba(150,180,240,.55);' +
        'color:#dfe8ff;font-size:14px;display:flex;align-items:center;justify-content:center;touch-action:none;user-select:none;-webkit-user-select:none';
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); keys[code] = true; });
      const off = function () { keys[code] = false; };
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
      return b;
    };
    pedal.appendChild(mkPedal('后退', 'KeyS'));
    pedal.appendChild(mkPedal('前进', 'KeyW'));
    wrap.appendChild(pedal);
    hint.textContent = '单指拖动＝转身 · 踩踏板＝走路';
  }

  const d = mfDialog({
    title: '走进「' + sp.name + '」', cls: 'mf-mod', body: wrap, width: '100vw',
    buttons: [{ label: '回到地图', fn: function () { } }],
    onClose: function () {
      SPV.open = false;
      if (SPV.raf) { cancelAnimationFrame(SPV.raf); SPV.raf = 0; }
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
      document.removeEventListener('mousemove', onMouse);
      document.removeEventListener('keydown', kd);
      document.removeEventListener('keyup', ku);
      try { if (SPV.ro) { SPV.ro.disconnect(); SPV.ro = null; } } catch (e) { }
      try { geo.dispose(); mesh.material.dispose(); } catch (e) { }
      try { if (SPV.renderer) { SPV.renderer.dispose(); SPV.renderer.forceContextLoss(); } } catch (e) { }
      SPV.renderer = null; SPV.cam = null; SPV.dlg = null; SPV.bounds = null;
    }
  });
  SPV.dlg = d; SPV.open = true;

  const ro = new ResizeObserver(() => {
    if (!SPV.open) return;
    const ww = wrap.clientWidth, hh = wrap.clientHeight;
    if (!ww || !hh) return;
    camera.aspect = ww / hh; camera.updateProjectionMatrix();
    renderer.setSize(ww, hh, false);
  });
  ro.observe(wrap); SPV.ro = ro;
  MF_OFFS.push(() => { try { ro.disconnect(); } catch (e) { } });
  setTimeout(() => {
    if (!SPV.open || !renderer) return;
    const ww = wrap.clientWidth, hh = wrap.clientHeight;
    if (!ww || !hh) return;
    camera.aspect = ww / hh; camera.updateProjectionMatrix();
    renderer.setSize(ww, hh, false);
  }, 60);

  let lastT = 0;
  (function loop(t) {
    if (!SPV.open) return;
    SPV.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, ((t || 0) - lastT) / 1000 || 0.016); lastT = t || 0;
    try {
      camera.rotation.order = 'YXZ';
      camera.rotation.y = SPV.yaw; camera.rotation.x = SPV.pitch;
      const sp0 = ((keys.ShiftLeft || keys.ShiftRight) ? 3 : 1) * (SPV.speed || 4.2);
      const fw = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      const sd = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      if (fw || sd) {
        const sy = Math.sin(SPV.yaw), cy = Math.cos(SPV.yaw);
        camera.position.x += (-sy * fw + cy * sd) * sp0 * dt;
        camera.position.z += (-cy * fw - sy * sd) * sp0 * dt;
      }
      if (keys.Space) camera.position.y += sp0 * dt * 0.6;
      if (keys.KeyC) camera.position.y -= sp0 * dt * 0.6;
      /* 圈在空间的单元格范围内，别一脚迈出世界之外 */
      if (SPV.bounds) {
        camera.position.x = clamp(camera.position.x, SPV.bounds.x0, SPV.bounds.x1);
        camera.position.y = clamp(camera.position.y, SPV.bounds.y0, SPV.bounds.y1);
        camera.position.z = clamp(camera.position.z, SPV.bounds.z0, SPV.bounds.z1);
      }
      renderer.render(scene, camera);
    } catch (e) { SPV.open = false; }
  })();
}

/* --------------------------------------------------------- 星球编辑 ------
 * 每个时代就是一颗独立星球。这里把它们一字排开：增删、改名、调大小与密度、
 * 圈定空间、捏形状。预览球用低分段 SphereGeometry 独立着色（mfColorWorldToGeo），
 * 不动主场景的 S.geo；塑形数据是主球顶点级的，预览球段数对不上，故预览不叠塑形。 */
const PLN = { open: false, dlg: null, scene: null, camera: null, renderer: null, ro: null,
  group: null, meshes: [], sel: -1, raf: 0, drag: null, builtLen: -1, starPts: null, ring: null, side: null, view: null,
  tool: 'view', brushDeg: 4, sculpting: false, hint: null, spLen: -1 };

/* 与 mfRefreshColors 同源的配色逻辑，但全部参数化：给任意一颗星球的几何着色 */
function mfColorWorldToGeo(world, geo) {
  if (!world || !world.grid || !geo) return;
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  if (!uv) return;
  let col = geo.attributes.color;
  if (!col) {
    col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('color', col);
  }
  const g = world.grid;
  const polities = world.polities || [];
  const pcol = new Map();
  for (let i = 0; i < polities.length; i++) {
    const c = hexToRgb(polities[i].color);
    pcol.set(polities[i].seq, [c, [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55]]);
  }
  const rcol = [hexToRgb(CFG.REGION[0].c), hexToRgb(CFG.REGION[1].c), hexToRgb(CFG.REGION[2].c), hexToRgb(CFG.REGION[3].c)];
  const tcol = [null];
  for (let i = 0; i < (world.terrains || []).length; i++) tcol.push(hexToRgb(world.terrains[i].color));
  const arr = col.array, uArr = uv.array;
  const w = g.w, h = g.h, n = pos.count;
  for (let i = 0; i < n; i++) {
    const u = uArr[i * 2], v = uArr[i * 2 + 1];
    let lon = u * 360 - 180, lat = v * 180 - 90;
    if (lon >= 180) lon = 179.9999;
    const x = g.xOf(lon), y = g.yOf(lat);
    const ci = y * w + x;
    let r, gg, b;
    if (ci < 0 || ci >= g.terrain.length) { arr[i * 3] = 0.8; arr[i * 3 + 1] = 0.8; arr[i * 3 + 2] = 0.8; continue; }
    const tid = g.terrain[ci];
    if (tid && tcol[tid]) { const c = tcol[tid]; r = c[0]; gg = c[1]; b = c[2]; }
    else { const c = rcol[g.region[ci] || 0]; r = c[0]; gg = c[1]; b = c[2]; }
    if (g.water && g.water[ci]) {
      r = r + (111 - r) * 0.78; gg = gg + (168 - gg) * 0.78; b = b + (201 - b) * 0.78;
    }
    const pid = g.polity[ci];
    const ent = pcol.get(pid);
    if (ent) {
      const pc = ent[0], pd = ent[1];
      let border = false;
      const nx = x + 1 < w ? ci + 1 : ci - (w - 1);
      const ny = y + 1 < h ? ci + w : ci;
      if (g.polity[nx] !== pid || g.polity[ny] !== pid) border = true;
      const t = border ? 0.82 : 0.42;
      const src = border ? pd : pc;
      r = r + (src[0] - r) * t; gg = gg + (src[1] - gg) * t; b = b + (src[2] - b) * t;
    }
    if (world.height) {
      const hv = world.height[ci];
      if (hv) { const sh = clamp(1 + hv * 0.00055, 0.72, 1.28); r *= sh; gg *= sh; b *= sh; }
    }
    arr[i * 3] = r / 255; arr[i * 3 + 1] = gg / 255; arr[i * 3 + 2] = b / 255;
  }
  col.needsUpdate = true;
}

/* 预览球顶点重算：把塑形场（主球顶点索引）与地形高度采样到预览球的低分段网格上 */
function mfPlanetGeoUpdateMesh(mesh, world) {
  const geo = mesh.geometry;
  if (!geo.userData.basePos) geo.userData.basePos = new Float32Array(geo.attributes.position.array);
  const bp = geo.userData.basePos, pos = geo.attributes.position, uv = geo.attributes.uv;
  const arr = pos.array, uArr = uv.array, n = pos.count;
  const shp = mfShapeOf(world);
  const seg = CFG.SEG[S.segIdx] || CFG.SEG[CFG.SEG_DEF];
  const wS = seg[0], hS = seg[1], cols = wS + 1;
  const g = world.grid, H = world.height;
  const HS = (world.heightScale == null ? 1 : world.heightScale) * 0.00016;
  for (let i = 0; i < n; i++) {
    const lon = uArr[i * 2] * 360 - 180, lat = uArr[i * 2 + 1] * 180 - 90;
    let s0 = 0;
    if (shp) {
      let ix = Math.round((lon + 180) / 360 * wS) % wS; if (ix < 0) ix += wS;
      let iy = clamp(Math.round((90 - lat) / 180 * hS), 0, hS);
      const vi = iy * cols + ix;
      if (vi >= 0 && vi < shp.length) s0 = shp[vi] || 0;
    }
    let hv = 0;
    if (H) hv = H[g.yOf(lat) * g.w + g.xOf(lon)] || 0;
    const sc = (1 + s0) * (1 + hv * HS);
    arr[i * 3] = bp[i * 3] * sc; arr[i * 3 + 1] = bp[i * 3 + 1] * sc; arr[i * 3 + 2] = bp[i * 3 + 2] * sc;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/* 预览球上的命中点 → 经纬度（在星球局部坐标系里反解，与 SphereGeometry 的 uv 约定一致） */
function mfPlanetHitLonLat(mesh, worldPoint) {
  const lp = mesh.worldToLocal(worldPoint.clone()).normalize();
  const lat = Math.asin(clamp(lp.y, -1, 1)) * R2D;
  let lon = Math.atan2(lp.z, -lp.x) * R2D - 180;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return { lon: lon, lat: lat, point: lp };
}

/* 星球物理参数：半径 + 密度是输入，质量 / 表面重力 / 逃逸速度是算出来的展示值 */
function mfAstroOf(w) {
  if (!w.astro || !w.astro.radiusKm) w.astro = { radiusKm: 6371, density: 5514 };
  return w.astro;
}
function mfAstroStats(w) {
  const a = mfAstroOf(w);
  const r = a.radiusKm * 1000, rho = a.density || 5514, G = 6.674e-11;
  const M = rho * 4 / 3 * Math.PI * r * r * r;
  const gv = G * M / (r * r);
  const ve = Math.sqrt(2 * G * M / r);
  return { M: M, g: gv, ve: ve };
}
function mfFmtSci(v, unit) {
  if (!isFinite(v)) return '—';
  const e = Math.floor(Math.log10(Math.abs(v) || 1));
  const m = v / Math.pow(10, e);
  return m.toFixed(2) + '×10^' + e + ' ' + unit;
}

function mfPlanetEditor() {
  if (!mfEnsureThree()) { if (CTXREF) CTXREF.toast('未找到 three.js 运行时，无法打开星球编辑', 3600, 'err'); return; }
  if (!S.pack) { if (CTXREF) CTXREF.toast('请先打开一张地图', 2400); return; }
  if (PLN.open && PLN.dlg) { try { PLN.dlg.close(); } catch (e) { } }

  const wrap = mfNode('div', 'mf-mod-b');
  const view = mfNode('div', 'mf-mod-c');
  const right = mfNode('div', 'mf-mod-r');
  right.style.width = '272px';
  wrap.appendChild(view); wrap.appendChild(right);
  PLN.view = view; PLN.side = right;

  const cv = mfNode('canvas', 'mf-mod-cv');
  view.appendChild(cv);
  const hint = mfNode('div', '', '拖动＝转动选中的星球 · 点击＝选中 · 星球的大小差异就是真实的半径比例');
  PLN.hint = hint;
  hint.style.cssText = 'position:absolute;left:10px;bottom:8px;color:#8fa2c8;font-size:11.5px;pointer-events:none;text-shadow:0 1px 3px #000';
  view.appendChild(hint);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b16);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 600);
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.0); d1.position.set(4, 3, 6); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0x8fb0ff, 0.3); d2.position.set(-5, -2, -4); scene.add(d2);
  /* 星空点缀：几百个随机方向的远点 */
  const sn = 500, sp = new Float32Array(sn * 3);
  for (let i = 0; i < sn; i++) {
    const t = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), rr = 120 + Math.random() * 200;
    sp[i * 3] = rr * Math.sin(ph) * Math.cos(t); sp[i * 3 + 1] = rr * Math.cos(ph); sp[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(t);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcdd8f0, size: 0.9, sizeAttenuation: true }));
  scene.add(stars); PLN.starPts = stars;
  const group = new THREE.Group(); scene.add(group);
  PLN.scene = scene; PLN.camera = camera; PLN.renderer = renderer; PLN.group = group;

  /* 选中光环：白线框球套在选中星球外 */
  const ring = new THREE.Mesh(new THREE.SphereGeometry(1.05, 28, 18),
    new THREE.MeshBasicMaterial({ wireframe: true, color: 0xffffff, transparent: true, opacity: 0.28 }));
  ring.visible = false; scene.add(ring); PLN.ring = ring;

  function rv(w) { return clamp(mfAstroOf(w).radiusKm / 6371, 0.18, 4); }

  function buildPlanets() {
    while (group.children.length) {
      const m = group.children.pop();
      group.remove(m);
      try { m.geometry.dispose(); m.material.dispose(); } catch (e) { }
    }
    PLN.meshes = [];
    const ws = S.pack.worlds;
    let x = 0, maxR = 0;
    const gap = 0.55;
    for (let i = 0; i < ws.length; i++) maxR = Math.max(maxR, rv(ws[i]));
    let total = 0;
    for (let i = 0; i < ws.length; i++) total += rv(ws[i]) * 2;
    total += gap * (ws.length - 1);
    x = -total / 2;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i], r = rv(w);
      const geo = new THREE.SphereGeometry(r, 72, 48);
      try { mfColorWorldToGeo(w, geo); } catch (e) {
        console.error('[map-forge] 星球预览着色失败（第 ' + (i + 1) + ' 颗）', e);
      }
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + r, 0, 0);
      mesh.userData.idx = i;
      mfPlanetGeoUpdateMesh(mesh, w);
      group.add(mesh);
      PLN.meshes.push(mesh);
      x += r * 2 + gap;
    }
    /* 相机取景：吃下整排星球 */
    const dist = Math.max(total / 2 / Math.tan(camera.fov * Math.PI / 360), maxR * 1.4) * 1.18 + 0.6;
    camera.position.set(0, maxR * 0.55, dist);
    camera.lookAt(0, 0, 0);
    PLN.builtLen = ws.length;
    if (PLN.sel >= ws.length) PLN.sel = ws.length - 1;
    syncRing();
  }

  function syncRing() {
    const m = PLN.meshes[PLN.sel];
    if (!m) { ring.visible = false; return; }
    ring.visible = true;
    ring.position.copy(m.position);
    const r = m.geometry.parameters ? m.geometry.parameters.radius : 1;
    ring.scale.set(r, r, r);
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickPlanet(e) {
    const rect = cv.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(group.children, false);
    return hits.length ? hits[0] : null;
  }
  /* 编辑非当前星球前，先把主场景切到那个时代（塑形场与撤销栈都挂在当前时代上） */
  function ensureCurrent(idx) {
    if (idx !== S.pack.cur) {
      mfUseEra(idx);
      if (CTXREF) CTXREF.toast('已切换到「' + S.pack.worlds[idx].name + '」，改动都落在这颗星球上', 2600);
    }
  }
  cv.addEventListener('pointerdown', (e) => {
    try { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); } catch (err) { }
    const hit = pickPlanet(e);
    if (PLN.tool === 'space') {
      if (!hit) return;
      PLN.sel = hit.object.userData.idx; syncRing();
      ensureCurrent(PLN.sel);
      mfSpaceCreateAt(mfPlanetHitLonLat(hit.object, hit.point));
      return;
    }
    if (PLN.tool === 'raise' || PLN.tool === 'push' || PLN.tool === 'smooth') {
      if (!hit) return;
      PLN.sel = hit.object.userData.idx; syncRing();
      ensureCurrent(PLN.sel);
      ED.reshapeTool = PLN.tool;
      PLN.sculpting = true;
      mfShapeStrokeBegin(mfPlanetHitLonLat(hit.object, hit.point), PLN.brushDeg * D2R);
      return;
    }
    PLN.drag = { x: e.clientX, y: e.clientY, moved: 0 };
  });
  cv.addEventListener('pointermove', (e) => {
    if (PLN.sculpting) {
      const hit = pickPlanet(e);
      if (hit && hit.object.userData.idx === PLN.sel) {
        mfShapeApply(mfPlanetHitLonLat(hit.object, hit.point), PLN.brushDeg * D2R);
        mfPlanetGeoUpdateMesh(hit.object, S.map);
      }
      return;
    }
    const d = PLN.drag; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
    const m = PLN.meshes[PLN.sel];
    if (m) {
      m.rotation.y += dx * 0.006;
      m.rotation.x = clamp(m.rotation.x + dy * 0.004, -1.2, 1.2);
    } else {
      group.rotation.y += dx * 0.004;
    }
  });
  cv.addEventListener('pointerup', (e) => {
    if (PLN.sculpting) { PLN.sculpting = false; ED.painting = false; mfShapeStrokeEnd(); return; }
    const d = PLN.drag; PLN.drag = null;
    if (!d || d.moved > 6) return;
    const hit = pickPlanet(e);
    if (hit) {
      PLN.sel = hit.object.userData.idx;
      syncRing(); renderSide();
    }
  });

  function statTxt(w) {
    const st = mfAstroStats(w);
    return '质量 ≈ ' + mfFmtSci(st.M, 'kg') + '　·　表面重力 ≈ ' + st.g.toFixed(2) + ' m/s²（地球 9.8）　·　逃逸速度 ≈ ' + (st.ve / 1000).toFixed(1) + ' km/s（地球 11.2）';
  }

  function renderSide() {
    try { renderSideMain(); } catch (err) {
      right.innerHTML = '';
      const em = mfNode('div', 'mf-note', '侧栏渲染出错：' + (err && err.message || err) + '（请把这句话反馈给柯星）');
      em.style.color = '#b33';
      right.appendChild(em);
      console.error('[map-forge] 星球编辑侧栏', err);
    }
  }
  function renderSideMain() {
    right.innerHTML = '';
    const ws = S.pack.worlds;
    const i = PLN.sel, w = ws[i];
    if (!w) { right.appendChild(mfNode('div', 'mf-note', '点一颗星球开始。')); return; }
    right.appendChild(mfNode('div', 'mf-sec-t', '星球 ' + (i + 1) + ' / ' + ws.length + (i === S.pack.cur ? '（当前）' : '')));

    const nmR = mfNode('div', 'mf-row');
    nmR.appendChild(mfNode('label', '', '名字'));
    const nm = mfNode('input', 'mf-inp'); nm.value = w.name; nm.style.flex = '1';
    nm.addEventListener('change', () => {
      w.name = nm.value || w.name;
      mfRefreshEraBar(); mfTouch();
    });
    nmR.appendChild(nm); right.appendChild(nmR);

    const a = mfAstroOf(w);
    function numRow(label, val, title, fn) {
      const row = mfNode('div', 'mf-row');
      const lb = mfNode('label', '', label + ' ？');
      lb.title = title; lb.style.cursor = 'help';
      row.appendChild(lb);
      const inp = mfNode('input', 'mf-inp');
      inp.type = 'number'; inp.value = String(val); inp.style.flex = '1'; inp.min = '1';
      inp.addEventListener('change', () => {
        const v = +inp.value;
        if (!(v > 0)) { inp.value = String(val); return; }
        fn(v); mfTouch(); buildPlanets(); stats.textContent = statTxt(w);
      });
      row.appendChild(inp);
      right.appendChild(row);
      return inp;
    }
    numRow('半径 km', a.radiusKm, '星球半径（地球 6371km）。只改比例与物理参数，地图内容不拉伸', (v) => { a.radiusKm = v; });
    numRow('密度 kg/m³', a.density, '平均密度（地球 5514，木星 1326，白矮星以亿吨计——悠着点）', (v) => { a.density = v; });
    const stats = mfNode('div', 'mf-note', statTxt(w));
    stats.title = '由半径和密度算出：质量＝密度×体积；重力＝GM/r²；逃逸速度＝√(2GM/r)。只是展示，不影响画法';
    stats.style.cursor = 'help';
    right.appendChild(stats);

    const bGo = mfNode('div', 'mf-btn pri', '进入这颗星球');
    bGo.style.width = '100%';
    bGo.title = '切换当前编辑的时代到这颗星球，并回到地图界面';
    bGo.addEventListener('click', () => {
      if (i !== S.pack.cur) mfUseEra(i);
      if (PLN.dlg) PLN.dlg.close();
    });
    right.appendChild(bGo);

    /* 工具区：直接在左边的星球上用，不用跳回主地图 */
    const tlT = mfNode('div', 'mf-sec-t', '工具（点选后在左侧星球表面直接用）');
    tlT.style.marginTop = '10px';
    right.appendChild(tlT);
    const tlRow = mfNode('div', 'mf-tools');
    [['view', '◉ 查看', '拖动＝转动星球，点击＝选中'],
     ['raise', '▲ 拉起', '塑形：在星球表面抹出山丘高原（可撤销）'],
     ['push', '▽ 压低', '塑形：压出盆地海沟'],
     ['smooth', '∿ 抹平', '塑形：抹掉棱角让起伏圆滑'],
     ['space', '◎ 圈空间', '在星球表面点一下，以该点为圆心圈一块空间']].forEach((t) => {
      const b = mfNode('div', 'mf-tool' + (PLN.tool === t[0] ? ' on' : ''), t[1]);
      b.title = t[2];
      b.addEventListener('click', () => {
        PLN.tool = t[0];
        if (PLN.hint) PLN.hint.textContent = t[2];
        renderSide();
      });
      tlRow.appendChild(b);
    });
    right.appendChild(tlRow);
    if (PLN.tool === 'raise' || PLN.tool === 'push' || PLN.tool === 'smooth') {
      const brRow = mfNode('div', 'mf-row');
      const brL = mfNode('label', '', '笔刷 ？');
      brL.title = '塑形笔刷的角半径（度）：4° 大约是地球上 440km 的一抹';
      brL.style.cursor = 'help';
      brRow.appendChild(brL);
      const brS = mfNode('input', 'mf-inp');
      brS.type = 'range'; brS.min = '1'; brS.max = '20'; brS.step = '0.5';
      brS.value = String(PLN.brushDeg);
      brS.addEventListener('input', () => { PLN.brushDeg = +brS.value; });
      brRow.appendChild(brS);
      right.appendChild(brRow);
      const stRow = mfNode('div', 'mf-row');
      const stL = mfNode('label', '', '力度 ？');
      stL.title = '每一笔抹动抬起 / 压下的幅度：0.01 ≈ 64km（一个球半径＝6371km）';
      stL.style.cursor = 'help';
      stRow.appendChild(stL);
      const stS = mfNode('input', 'mf-inp');
      stS.type = 'range'; stS.min = '0.002'; stS.max = '0.06'; stS.step = '0.002';
      stS.value = String(ED.reshapeStr == null ? 0.012 : ED.reshapeStr);
      stS.addEventListener('input', () => { ED.reshapeStr = +stS.value; });
      stRow.appendChild(stS);
      right.appendChild(stRow);
      right.appendChild(mfNode('div', 'mf-note', '塑形写在星球的顶点上，随地图保存；Ctrl+Z 撤销（回到地图界面后）。'));
    }

    const bNew = mfNode('div', 'mf-btn', '＋ 新增星球（时代）');
    bNew.style.width = '100%';
    bNew.title = '新建一颗空白星球，或继承当前星球的内容接着改';
    bNew.addEventListener('click', () => {
      if (PLN.dlg) PLN.dlg.close();
      mfEraAdd();
    });
    right.appendChild(bNew);

    const bDel = mfNode('div', 'mf-btn dgr', '删除这颗星球');
    bDel.style.width = '100%';
    bDel.title = '删除这颗星球（时代）及其全部内容，删除前自动存快照';
    bDel.addEventListener('click', () => mfEraDelete(i));
    right.appendChild(bDel);

    /* 空间区（圈定工具在 patch50；列表与操作在这里渲染） */
    const spT = mfNode('div', 'mf-sec-t', '这颗星球上的空间');
    spT.style.marginTop = '12px';
    right.appendChild(spT);
    const spBox = mfNode('div');
    right.appendChild(spBox);
    mfPlanetSpacesRender(spBox, w);
    right.appendChild(mfNode('div', 'mf-note',
      '空间是球面上圈出的一小块「里世界」：里面用建模系统自由搭建（精度到厘米），建好后可以第一人称走进去。回到地图界面，用左侧「具」→ 工具包里的「空」笔圈定新空间。'));
  }

  const d = mfDialog({
    title: '星球编辑 —— 每个时代都是一颗星球', cls: 'mf-mod', body: wrap, width: '100vw',
    buttons: [{ label: '回到地图', fn: function () { } }],
    onClose: function () {
      PLN.open = false;
      if (PLN.raf) { cancelAnimationFrame(PLN.raf); PLN.raf = 0; }
      try { if (PLN.ro) { PLN.ro.disconnect(); PLN.ro = null; } } catch (e) { }
      try {
        PLN.meshes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
        if (PLN.ring) { PLN.ring.geometry.dispose(); PLN.ring.material.dispose(); }
        if (PLN.starPts) { PLN.starPts.geometry.dispose(); PLN.starPts.material.dispose(); }
      } catch (e) { }
      try { if (PLN.renderer) { PLN.renderer.dispose(); PLN.renderer.forceContextLoss(); } } catch (e) { }
      PLN.scene = null; PLN.camera = null; PLN.renderer = null; PLN.group = null;
      PLN.meshes = []; PLN.sel = -1; PLN.dlg = null; PLN.ring = null; PLN.starPts = null;
    }
  });
  PLN.dlg = d; PLN.open = true;
  PLN.sel = S.pack.cur;
  try { buildPlanets(); } catch (e) {
    console.error('[map-forge] 星球编辑初始化失败', e);
    if (CTXREF) CTXREF.toast('星球预览初始化出错：' + (e && e.message || e), 5000, 'err');
  }
  try { renderSide(); } catch (e) {
    console.error('[map-forge] 星球编辑面板渲染失败', e);
    right.innerHTML = '';
    right.appendChild(mfNode('div', 'mf-note', '面板渲染出错：' + (e && e.message || e) + '。请把这句话截图发给开发者。'));
  }

  const ro = new ResizeObserver(() => {
    if (!PLN.open) return;
    const ww = view.clientWidth, hh = view.clientHeight;
    if (!ww || !hh) return;
    camera.aspect = ww / hh; camera.updateProjectionMatrix();
    renderer.setSize(ww, hh, false);
  });
  ro.observe(view); PLN.ro = ro;
  MF_OFFS.push(() => { try { ro.disconnect(); } catch (e) { } });
  setTimeout(() => {
    if (!PLN.open) return;
    const ww = view.clientWidth, hh = view.clientHeight;
    if (!ww || !hh) return;
    camera.aspect = ww / hh; camera.updateProjectionMatrix();
    renderer.setSize(ww, hh, false);
  }, 60);

  let lastT = 0;
  (function loop(t) {
    if (!PLN.open) return;
    PLN.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, ((t || 0) - lastT) / 1000 || 0.016); lastT = t || 0;
    try {
      if (!PLN.drag) {
        for (let i = 0; i < PLN.meshes.length; i++) PLN.meshes[i].rotation.y += dt * 0.12;
      }
      /* 星球被增删（时代栏操作 / 删除确认框异步）时自动重建列表 */
      if (S.pack && S.pack.worlds.length !== PLN.builtLen) { buildPlanets(); renderSide(); }
      /* 空间被圈定 / 删除后刷新侧栏列表 */
      const spn = S.map ? (S.map.spaces || []).length : 0;
      if (spn !== PLN.spLen) { PLN.spLen = spn; renderSide(); }
      renderer.render(scene, camera);
    } catch (e) { PLN.open = false; }
  })();
}

/* 空间列表渲染：patch50/51 会替换为带「进入 / 编辑」按钮的完整版 */
function mfPlanetSpacesRender(box, w) {
  box.innerHTML = '';
  const spaces = w.spaces || [];
  if (!spaces.length) {
    box.appendChild(mfNode('div', 'mf-note', '还没有空间。'));
    return;
  }
  spaces.forEach((sp) => {
    const row = mfNode('div', 'mf-row');
    row.style.cssText = 'gap:6px;margin-bottom:4px';
    const nm = mfNode('div', '', esc(sp.name));
    nm.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    nm.title = sp.name + '（' + mfSpaceType(sp.type).name + ' · ' + mfSpaceCells(sp).length + ' 格 × ' + mfSpaceCellM(sp) + 'm · 标记半径 ' + sp.radKm + 'km）';
    row.appendChild(nm);
    const bIn = mfNode('div', 'mf-icon-btn', '◉');
    bIn.title = '进入查看（第一人称走进去）';
    bIn.addEventListener('click', () => { if (PLN.dlg) PLN.dlg.close(); mfSpaceView(sp); });
    const bEd = mfNode('div', 'mf-icon-btn', '▣');
    bEd.title = '编辑空间（用建模系统搭建内部）';
    bEd.addEventListener('click', () => { if (PLN.dlg) PLN.dlg.close(); mfSpaceEdit(sp); });
    row.appendChild(bIn); row.appendChild(bEd);
    const bRen = mfNode('div', 'mf-icon-btn', '✎');
    bRen.title = '重命名空间';
    bRen.addEventListener('click', () => mfPrompt('空间名称', sp.name, (v) => {
      sp.name = v || sp.name; mfTouch(); mfPlanetSpacesRender(box, w);
    }, { title: '重命名空间' }));
    const bDel = mfNode('div', 'mf-icon-btn', '✕');
    bDel.title = '删除空间（里面的搭建会一起消失）';
    bDel.addEventListener('click', () => mfConfirm('删除空间「' + sp.name + '」？里面的搭建会一起消失。', () => {
      w.spaces.splice(w.spaces.indexOf(sp), 1);
      mfTouch(); mfPlanetSpacesRender(box, w);
    }, { dgr: true, okLabel: '删除', title: '删除空间' }));
    row.appendChild(bRen); row.appendChild(bDel);
    box.appendChild(row);
  });
}

/* --------------------------------------------------------- 时代切换 ------ */
function mfUseEra(i) {
  const pk = S.pack; if (!pk || i == null) return;
  if (i === pk.cur) return;
  if (i < 0 || i >= pk.worlds.length) return;
  pk.cur = i;
  mfApplyEra();
  if (CTXREF) CTXREF.toast('已切换到「' + pk.worlds[i].name + '」', 2200, 'ok');
}

/* 把 S.pack.cur 指向的时代接进场景与界面 */
function mfApplyEra() {
  const pk = S.pack; if (!pk) return;
  S.map = pk.worlds[pk.cur];
  ED.selPolity = null; ED.tool = null;
  ED.undo.length = 0; ED.redo.length = 0;
  mfLassoCancel(true);               /* 换星球时圈到一半的多边形作废 */
  mfLineCancel(true);                /* 画到一半的直线同样作废 */
  mfCloseProfile();
  mfRebuildInstances();
  mfRebuildWaters();
  mfRebuildSpaceMarks();
  mfRefreshEraBar();
  mfBuildPanel();
  mfRefreshColors();
  mfApplyHeight();          /* 新星球无高度场 → 自动还原成标准球体 */
  mfZoomReadout();
  mfTouch();
}

function mfEraRename(i) {
  const w = S.pack.worlds[i]; if (!w) return;
  mfPrompt('时代名称', w.name, (v) => {
    w.name = v || w.name;
    mfRefreshEraBar(); mfTouch();
  }, { title: '重命名时代' });
}

function mfEraMoveTo(from, to) {
  const pk = S.pack; if (!pk) return;
  if (from === to || from < 0 || to < 0 || from >= pk.worlds.length || to >= pk.worlds.length) return;
  const curId = pk.worlds[pk.cur].id;
  const w = pk.worlds.splice(from, 1)[0];
  pk.worlds.splice(to, 0, w);
  pk.cur = Math.max(0, pk.worlds.findIndex((x) => x.id === curId));
  mfRefreshEraBar(); mfTouch();
}

/* 「更换位置」对话框：↑↓ 即时调整，也可直接拖动顶部按钮 */
function mfEraMoveDialog(i) {
  const pk = S.pack; if (!pk) return;
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', 'mf-note', '调整「' + esc(pk.worlds[i].name) + '」在时代栏中的位置（也可以直接拖动顶部按钮换位）。'));
  const list = mfNode('div');
  wrap.appendChild(list);
  function render() {
    list.innerHTML = '';
    pk.worlds.forEach((w, k) => {
      const row = mfNode('div', 'mf-row');
      row.style.cssText = 'gap:6px;margin-bottom:4px' + (k === i ? ';outline:1px dashed var(--rule,#c9b892);border-radius:6px;padding:3px' : '');
      const nm = mfNode('div', '', esc((k + 1) + '. ' + w.name));
      nm.style.flex = '1';
      row.appendChild(nm);
      const up = mfNode('div', 'mf-btn', '↑');
      up.style.cssText = 'padding:2px 8px';
      up.addEventListener('click', () => { if (i > 0) { mfEraMoveTo(i, i - 1); i--; render(); } });
      const dn = mfNode('div', 'mf-btn', '↓');
      dn.style.cssText = 'padding:2px 8px';
      dn.addEventListener('click', () => { if (i < pk.worlds.length - 1) { mfEraMoveTo(i, i + 1); i++; render(); } });
      row.appendChild(up); row.appendChild(dn);
      list.appendChild(row);
    });
  }
  render();
  mfDialog({ title: '更换位置', width: '360px', body: wrap, buttons: [{ label: '完成', pri: true }] });
}

function mfEraDelete(i) {
  const pk = S.pack; if (!pk) return;
  if (pk.worlds.length <= 1) { if (CTXREF) CTXREF.toast('至少要保留一个时代', 2400); return; }
  const w = pk.worlds[i];
  mfConfirm('删除时代「' + w.name + '」？这颗星球上的陆地、势力、地形与标签都会一起消失。'
    + '删除前会自动存一份快照，可在左侧「史」历史快照里滚回来。', () => {
    mfSnapPush(pk, '删除时代「' + w.name + '」前');
    pk.worlds.splice(i, 1);
    if (pk.cur >= pk.worlds.length) pk.cur = pk.worlds.length - 1;
    S.map = pk.worlds[pk.cur];
    ED.undo.length = 0; ED.redo.length = 0;
    mfCloseProfile();
    mfRebuildInstances(); mfRefreshEraBar(); mfBuildPanel();
    S.dirtyColor = true; mfRefreshColors(); mfApplyHeight(); mfTouch();
    if (CTXREF) CTXREF.toast('已删除时代「' + w.name + '」', 2400);
  }, { dgr: true, okLabel: '删除', title: '删除时代' });
}

/* --------------------------------------------------------- 新建时代 ------ */
function mfEraAdd() {
  if (!S.pack) return;
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', 'mf-note',
    '新时代可以是空白星球，也可以以当前时代为底子接着改——继承出来的是<b>副本</b>，改新不影响旧。'
    + '（做架空历史选「继承」，做另一个世界选「空白」）'));
  const inp = mfNode('input', 'mf-inp');
  inp.value = '新时代';
  inp.style.cssText = 'width:100%;margin:8px 0 2px';
  wrap.appendChild(inp);
  mfDialog({
    title: '创建新时代', width: '400px', body: wrap,
    buttons: [
      { label: '○ 空白星球', fn: () => mfEraCreateBlank(inp.value || '新时代') },
      { label: '▲ 继承陆海与地形', fn: () => mfEraInherit(inp.value || '新时代', 'geo') },
      { label: '● 继承全部内容', pri: true, fn: () => mfEraInherit(inp.value || '新时代', 'all') }
    ]
  });
  setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { } }, 30);
}

/* 以当前时代为底创建副本：geo＝只带陆海+地形（含高度场），all＝势力/标签/建模/实例全带 */
function mfEraInherit(name, scope) {
  const pk = S.pack; if (!pk || !S.map) return;
  const w = mfCloneWorld(S.map, name || '新时代');
  if (scope === 'geo') {
    w.polities = [];
    w.labels = [];
    w.models = [];
    w.instances = [];
    w.towns = [];
    w.grid.polity.fill(0);
  }
  pk.worlds.push(w);
  pk.cur = pk.worlds.length - 1;
  mfApplyEra();
  if (CTXREF) CTXREF.toast(scope === 'geo'
    ? '已继承陆海与地形，创建「' + w.name + '」（势力/标签/建模未带入）'
    : '已继承全部内容，创建「' + w.name + '」', 2800, 'ok');
}

function mfEraCreateBlank(name) {
  const pk = S.pack; if (!pk) return;
  const w = mfNewWorld(pk.meta.gridRes || CFG.GRID_RES_DEF, name);
  w.meta = pk.meta;
  pk.worlds.push(w);
  pk.cur = pk.worlds.length - 1;
  mfApplyEra();
  if (CTXREF) CTXREF.toast('已创建空白星球「' + w.name + '」', 2600, 'ok');
}

/* 右键加号：创建新时代（空白/继承）/ 使用时代模板 */
function mfEraAddMenu(x, y) {
  if (!S.pack) return;
  mfMenu(x, y, [
    { icon: '＋', label: '创建新时代（空白 / 继承当前）…', fn: () => mfEraAdd() },
    { icon: '◇', label: '使用时代模板…', fn: () => mfEraTemplateDialog() }
  ]);
}

async function mfEraTemplateDialog() {
  if (!S.pack) return;
  const list = await mfLoadTemplates();
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', 'mf-note', '选一个已保存的时代模板作为新世界的起点；也可以全部重新开始建造一颗空白星球。'));
  const grid = mfNode('div', 'mf-tpl-grid');
  wrap.appendChild(grid);
  if (!list.length) {
    grid.appendChild(mfNode('div', 'mf-note', '还没有保存过时代模板。在顶部时代按钮上右键 →「把这个时代保存为时代模板」即可保存。'));
  }
  list.forEach((t) => {
    const card = mfNode('div', 'mf-tpl-card');
    if (t.thumb) { const im = document.createElement('img'); im.src = t.thumb; card.appendChild(im); }
    else card.appendChild(mfNode('div', 'ic', '✦'));
    card.appendChild(mfNode('div', 'nm', esc(t.name)));
    card.appendChild(mfNode('div', 'sb', '保存于 ' + fmtTime(t.createdAt)));
    card.addEventListener('click', () => { d.close(); mfEraFromTemplate(t); });
    card.addEventListener('contextmenu', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      mfMenu(ev.clientX, ev.clientY, [
        { icon: '✎', label: '重命名模板', fn: () => mfPrompt('模板名称', t.name, async (v) => { t.name = v || t.name; await mfSaveTemplates(list); if (CTXREF) CTXREF.toast('已重命名模板', 1800, 'ok'); }) },
        { icon: '✕', label: '删除模板', dgr: true, fn: () => mfConfirm('删除时代模板「' + t.name + '」？', async () => { await mfTemplateDel(t.id); d.close(); mfEraTemplateDialog(); }, { dgr: true, okLabel: '删除' }) }
      ]);
    });
    grid.appendChild(card);
  });
  const fresh = mfNode('div', 'mf-tpl-card fresh',
    '<div class="ic">✦</div><div class="nm">全部重新开始建造</div><div class="sb">创建一颗全新的空白星球</div>');
  fresh.addEventListener('click', () => { d.close(); mfEraAdd(); });
  grid.appendChild(fresh);
  const d = mfDialog({ title: '选择时代模板', width: 'min(640px,92vw)', body: wrap, buttons: [{ label: '取消' }] });
}

function mfEraFromTemplate(t) {
  if (!S.pack) return;
  mfPrompt('时代名称', t.name, (v) => {
    const w = mfTemplateToWorld(t, v || t.name);
    w.meta = S.pack.meta;
    S.pack.worlds.push(w);
    S.pack.cur = S.pack.worlds.length - 1;
    mfApplyEra();
    if (CTXREF) CTXREF.toast('已按模板「' + t.name + '」创建「' + w.name + '」', 2800, 'ok');
  }, { title: '使用时代模板' });
}

async function mfEraSaveTemplate(w) {
  if (!w) return;
  mfPrompt('模板名称', (w.name || '时代') + ' 模板', async (v) => {
    const thumb = (S.ok && S.map === w) ? mfSnapshot() : (w.thumb || '');
    await mfTemplateAdd(w, v, thumb);
    if (CTXREF) CTXREF.toast('已把「' + w.name + '」保存为时代模板', 2600, 'ok');
  }, { title: '保存为时代模板' });
}

/* ------------------------------------------------------------- 标签 ------ */
function mfLabelAddAt(clientX, clientY) {
  const hit = mfPick(clientX, clientY);
  if (!hit) return;
  mfMenu(clientX, clientY, [
    { icon: '◎', label: '在此新建地名', fn: () => mfLabelCreate(hit.lon, hit.lat, 'place') },
    { icon: '≈', label: '新建水域名', fn: () => mfLabelCreate(hit.lon, hit.lat, 'water') },
    { icon: '▲', label: '新建山名', fn: () => mfLabelCreate(hit.lon, hit.lat, 'mount') },
    { icon: '势', label: '新建势力名…', fn: () => mfLabelPolity(hit.lon, hit.lat) }
  ]);
}
function mfLabelCreate(lon, lat, type, text, polityId) {
  mfPrompt(CFG.LABEL_TYPES.find((t) => t.v === type).n + '名称', text || '新地名', (v) => {
    S.map.labels = S.map.labels || [];
    const l = { id: uid('l'), text: v, lon: lon, lat: lat, type: type || 'place', polityId: polityId || null, size: 13 };
    S.map.labels.push(l);
    mfPushFnUndo(
      () => { const i = S.map.labels.indexOf(l); if (i >= 0) S.map.labels.splice(i, 1); },
      () => { S.map.labels.push(l); },
      '新建标签'
    );
    mfTouch();
  }, { title: '命名' });
}
function mfLabelPolity(lon, lat) {
  const ps = S.map.polities || [];
  if (!ps.length) { if (CTXREF) CTXREF.toast('还没有势力，先用势力笔圈一个', 2600); return; }
  const wrap = mfNode('div');
  wrap.appendChild(mfNode('div', 'mf-note', '选择要标注的势力（标注后改名会双向同步）：'));
  ps.forEach((p) => {
    const r = mfNode('div', 'mf-row');
    const b = mfNode('div', 'mf-btn', esc(p.name));
    b.style.flex = '1';
    b.addEventListener('click', () => {
      d.close();
      S.map.labels = S.map.labels || [];
      const l = { id: uid('l'), text: p.name, lon: lon, lat: lat, type: 'polity', polityId: p.id, size: 14 };
      S.map.labels.push(l);
      mfTouch();
    });
    r.appendChild(b); wrap.appendChild(r);
  });
  const d = mfDialog({ title: '标注势力名', width: '320px', body: wrap, buttons: [{ label: '取消', fn: function () { } }] });
}

/* 每帧绘制标签（屏幕空间，缩放任意倍率都锐利） */
function mfDrawLabels() {
  if (!UI.lbl || !S.map || !S.camera) return;
  const cv = UI.lbl;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);
  /* 圈地预览：已点折线 + 顶点小圆点 + 末点到光标的虚线；首点加白圈提示「回点闭合」 */
  if (_lasso && _lasso.pts.length && S.camera) {
    const cam0 = S.camera;
    const prj = (lon, lat) => {
      const la = lat * D2R, lo = lon * D2R, cl = Math.cos(la);
      const v = new THREE.Vector3(cl * Math.cos(lo), Math.sin(la), -cl * Math.sin(lo));
      const toCam = new THREE.Vector3().subVectors(cam0.position, v);
      if (toCam.dot(v) <= 0.02) return null;              /* 背面剔除：与标签同一套约定 */
      v.multiplyScalar(1.002).project(cam0);
      if (v.z > 1) return null;
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    };
    /* 图形圈地：把「已点的点＋光标点」即时算成完整图形来预览 */
    let __pts = _lasso.pts, __closed = false;
    const __shape = ED.lassoShape || 'free';
    if (__shape !== 'free' && __shape !== 'curve' && _lasso.curLL) {
      const __need = __shape === 'para' ? 3 : 2;
      if (_lasso.pts.length + 1 >= __need) {
        __pts = mfShapePoly(__shape, _lasso.pts.concat([_lasso.curLL]).slice(0, __need));
        __closed = true;
      }
    }
    const scr = __pts.map((p) => prj(p.lon, p.lat));
    g.save();
    g.strokeStyle = '#c9813f'; g.fillStyle = '#c9813f'; g.lineWidth = 2;
    /* 预览态：圈定范围铺一层半透明填充，示意「将要上色」的区域 */
    if (ED.lassoPreview && scr.length > 2) {
      g.beginPath();
      let started = false;
      scr.forEach((p) => { if (!p) return; if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y); });
      if (started) { g.closePath(); g.fillStyle = 'rgba(201,129,63,.22)'; g.fill(); g.fillStyle = '#c9813f'; }
    }
    for (let i = 1; i < scr.length; i++) {
      if (!scr[i - 1] || !scr[i]) continue;
      g.beginPath(); g.moveTo(scr[i - 1].x, scr[i - 1].y); g.lineTo(scr[i].x, scr[i].y); g.stroke();
    }
    if (__closed && scr.length > 2 && scr[0] && scr[scr.length - 1]) {
      g.beginPath(); g.moveTo(scr[scr.length - 1].x, scr[scr.length - 1].y); g.lineTo(scr[0].x, scr[0].y); g.stroke();
    }
    if (_lasso.cur && scr[scr.length - 1]) {
      g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(scr[scr.length - 1].x, scr[scr.length - 1].y); g.lineTo(_lasso.cur.x, _lasso.cur.y); g.stroke();
      g.setLineDash([]);
    }
    scr.forEach((p, i) => {
      if (!p) return;
      g.beginPath(); g.arc(p.x, p.y, i === 0 ? 4.5 : 3, 0, Math.PI * 2); g.fill();
      if (i === 0 && scr.length >= 3) {
        g.beginPath(); g.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
        g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke();
        g.strokeStyle = '#c9813f'; g.lineWidth = 2;
      }
    });
    /* 微调模式：把选中的那段线条标成白点 */
    if (ED.lassoAdjust && _adj && _adj.a >= 0 && !__closed) {
      g.fillStyle = '#fff';
      mfAdjustSelIdx().forEach((si) => {
        const pp = scr[si]; if (!pp) return;
        g.beginPath(); g.arc(pp.x, pp.y, 4.2, 0, Math.PI * 2); g.fill();
      });
    }
    g.restore();
  }
  /* 直线模式预览：起点小圆 + 到光标的虚线 */
  if (_line && _line.a && S.camera) {
    const cam1 = S.camera;
    const la = _line.a.lat * D2R, lo = _line.a.lon * D2R, cl = Math.cos(la);
    const v = new THREE.Vector3(cl * Math.cos(lo), Math.sin(la), -cl * Math.sin(lo));
    const toCam = new THREE.Vector3().subVectors(cam1.position, v);
    if (toCam.dot(v) > 0.02) {
      v.multiplyScalar(1.002).project(cam1);
      if (v.z <= 1) {
        const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
        g.save();
        g.strokeStyle = '#c9813f'; g.fillStyle = '#c9813f'; g.lineWidth = 2;
        if (_line.cur) {
          g.setLineDash([6, 5]);
          g.beginPath(); g.moveTo(sx, sy); g.lineTo(_line.cur.x, _line.cur.y); g.stroke();
          g.setLineDash([]);
        }
        g.beginPath(); g.arc(sx, sy, 4.5, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(sx, sy, 7, 0, Math.PI * 2);
        g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke();
        g.restore();
      }
    }
  }
  const labels = S.map.labels || [];
  if (!labels.length) return;
  const cam = S.camera;
  const v = new THREE.Vector3();
  const items = [];
  labels.forEach((l) => {
    const la = l.lat * D2R, lo = l.lon * D2R, cl = Math.cos(la);
    /* z = −cos(lat)·sin(lon)：与 SphereGeometry 的 uv 约定一致，写反标签会跑到镜像经度 */
    v.set(cl * Math.cos(lo), Math.sin(la), -cl * Math.sin(lo));
    /* 背面剔除 */
    const toCam = new THREE.Vector3().subVectors(cam.position, v.clone().multiplyScalar(1));
    if (toCam.dot(v) <= 0.02) return;
    v.multiplyScalar(1.001).project(cam);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    if (x < -60 || x > w + 60 || y < -30 || y > h + 30) return;
    /* 距离决定字号：与地球地图同款，近大远小 */
    const dist = cam.position.length();
    const fs = clamp((l.size || 13) * (1.9 / Math.max(1.02, dist)), 8, 26);
    items.push({ x: x, y: y, t: l.text, fs: fs, l: l, type: l.type });
  });
  /* 简单避让：按 y 排序，重叠就下移 */
  items.sort((a, b) => a.y - b.y);
  const used = [];
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  items.forEach((it) => {
    g.font = '600 ' + it.fs.toFixed(1) + 'px "Noto Serif SC","Songti SC",serif';
    const tw = g.measureText(it.t).width;
    let yy = it.y;
    for (let k = 0; k < 12; k++) {
      let clash = false;
      for (const u of used) {
        if (Math.abs(u.y - yy) < it.fs * 1.15 && Math.abs(u.x - it.x) < (u.w + tw) / 2 + 6) { clash = true; break; }
      }
      if (!clash) break;
      yy += it.fs * 1.2;
    }
    used.push({ x: it.x, y: yy, w: tw });
    g.lineWidth = Math.max(2, it.fs * 0.28);
    g.strokeStyle = 'rgba(8,10,18,.82)';
    g.strokeText(it.t, it.x, yy);
    g.fillStyle = it.type === 'polity' ? '#ffe9b8' : (it.type === 'water' ? '#bcd9f2' : (it.type === 'town' ? '#ffd9a0' : '#f6efdd'));
    g.fillText(it.t, it.x, yy);
  });
  mfFloatBarTick(w, h);          /* 实例浮动条每帧跟随投影 */
}

/* 标签命中测试（屏幕坐标） */
function mfLabelAt(clientX, clientY) {
  if (!S.map || !S.camera || !UI.lbl) return null;
  const rect = UI.lbl.getBoundingClientRect();
  const x = clientX - rect.left, y = clientY - rect.top;
  const w = UI.lbl.clientWidth, h = UI.lbl.clientHeight;
  const v = new THREE.Vector3();
  let best = null, bd = 1e9;
  (S.map.labels || []).forEach((l) => {
    const la = l.lat * D2R, lo = l.lon * D2R, cl = Math.cos(la);
    v.set(cl * Math.cos(lo), Math.sin(la), -cl * Math.sin(lo));
    const toCam = new THREE.Vector3().subVectors(S.camera.position, v.clone());
    if (toCam.dot(v) <= 0.02) return;
    v.multiplyScalar(1.001).project(S.camera);
    const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
    const d = Math.hypot(sx - x, sy - y);
    if (d < 22 && d < bd) { bd = d; best = l; }
  });
  return best;
}

/* 标签右键菜单：重命名 / 改变位置（拖动）/ 删除 / 改类型 */
function mfBindLabelMenu() {
  if (!S.canvas || S.canvas.__mfLabelBound) return;
  S.canvas.__mfLabelBound = true;
  S.canvas.addEventListener('contextmenu', (e) => {
    if (!ED.labelMode || ED.tool !== 'label') return;
    e.preventDefault();
    const l = mfLabelAt(e.clientX, e.clientY);
    if (l) {
      mfMenu(e.clientX, e.clientY, [
        { icon: '✎', label: '重命名', fn: () => mfLabelRename(l) },
        { icon: '↔', label: '改变位置（拖动放置）', fn: () => mfLabelMove(l) },
        { icon: '字', label: '字号', fn: () => mfPrompt('字号（8~26）', String(l.size || 13), (v) => { const n = parseFloat(v); if (!isNaN(n)) { l.size = clamp(n, 8, 26); mfTouch(); } }) },
        { sep: true },
        {
          icon: '⇄', label: '改类型', fn: () => mfMenu(e.clientX, e.clientY + 60, CFG.LABEL_TYPES.map((t) => ({
            icon: '·', label: t.n, fn: () => { l.type = t.v; if (t.v !== 'polity') l.polityId = null; mfTouch(); }
          })))
        },
        {
          icon: '✕', label: '删除标签', dgr: true, fn: () => {
            /* 城镇标签＝城镇三件套之一：删它等于删整座城镇 */
            const twn = (S.map.towns || []).find((x) => x.labelId === l.id);
            if (twn) {
              const tp = mfTownTriple(twn);
              mfTownDrop(tp);
              mfPushFnUndo(
                () => { mfTownBack(tp); mfRebuildInstances(); },
                () => { mfTownDrop(tp); mfRebuildInstances(); },
                '删除城镇'
              );
              mfRebuildInstances(); mfTouch();
              return;
            }
            const arr = S.map.labels, at = arr.indexOf(l); arr.splice(at, 1);
            mfPushFnUndo(() => arr.splice(at, 0, l), () => { const k = arr.indexOf(l); if (k >= 0) arr.splice(k, 1); }, '删除标签');
            mfTouch();
          }
        }
      ]);
    } else {
      mfLabelAddAt(e.clientX, e.clientY);
    }
  });
  /* 拖动已有标签换位置 */
  let dragL = null;
  S.canvas.addEventListener('pointerdown', (e) => {
    if (!ED.labelMode || ED.tool !== 'label') return;
    const l = mfLabelAt(e.clientX, e.clientY);
    if (!l) return;
    dragL = l;
    e.preventDefault();
    const mv = (ev) => {
      const hit = mfPick(ev.clientX, ev.clientY);
      if (hit && dragL) { dragL.lon = hit.lon; dragL.lat = hit.lat; }
    };
    const up = () => {
      document.removeEventListener('pointermove', mv);
      document.removeEventListener('pointerup', up);
      if (dragL) { mfTouch(); if (CTXREF) CTXREF.toast('已移动标签「' + dragL.text + '」', 1600); }
      dragL = null;
    };
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', up);
  });
}

function mfLabelRename(l) {
  mfPrompt('标签名称', l.text, (v) => {
    const old = l.text; l.text = v;
    /* 势力名标签 ↔ 势力资料双向同步 */
    if (l.type === 'polity' && l.polityId) {
      const p = mfPolityById(l.polityId);
      if (p) p.name = v;
    }
    /* 城镇名标签 ↔ 城镇记录双向同步 */
    let twn = null;
    if (l.type === 'town') {
      twn = (S.map.towns || []).find((x) => x.labelId === l.id) || null;
      if (twn) twn.name = v;
    }
    const oldT = twn ? old : null;
    mfPushFnUndo(() => { l.text = old; if (twn) twn.name = oldT; mfRenderPolityList(); if (UI.panel) mfBuildPanel(); },
      () => { l.text = v; if (twn) twn.name = v; mfRenderPolityList(); if (UI.panel) mfBuildPanel(); }, '重命名标签');
    mfRenderPolityList(); mfTouch();
  }, { title: '重命名标签' });
}
function mfLabelMove(l) {
  if (CTXREF) CTXREF.toast('按住标签拖动即可改变位置', 2400);
}

/* ===================== 95_lib_search.js ===================== */
/* ==========================================================================
 * 资料库总编辑界面 + 搜索（模块自建资料库，独立于宿主地球资料库）
 * 势力界面与资料库是同一份数据的两个视图：这里改，势力简介里立刻可见（反之亦然）
 * ========================================================================== */

function mfOpenLibrary(entryId, polityId) {
  if (!S.pack) return;
  const wrap = mfNode('div', 'mf-lib-b');
  const left = mfNode('div', 'mf-lib-l');
  const right = mfNode('div', 'mf-lib-r');
  wrap.appendChild(left); wrap.appendChild(right);

  const head = mfNode('div', 'mf-row');
  head.style.marginBottom = '6px';
  const bNew = mfNode('div', 'mf-btn pri', '＋ 新资料条目');
  bNew.addEventListener('click', () => {
    const e = { id: uid('e'), title: '未命名条目', body: '' };
    S.pack.library.push(e);
    mfPushFnUndo(
      () => { const i = S.pack.library.indexOf(e); if (i >= 0) S.pack.library.splice(i, 1); refresh(); },
      () => { S.pack.library.push(e); refresh(); },
      '新增条目'
    );
    refresh(e.id);
  });
  head.appendChild(bNew);
  const bNewKw = mfNode('div', 'mf-btn', '＋ 新关键词栏目');
  bNewKw.addEventListener('click', () => {
    const ps = S.map.polities || [];
    if (!ps.length) { if (CTXREF) CTXREF.toast('还没有势力。关键词栏目挂在势力下，先圈一个势力。', 3200); return; }
    mfPrompt('关键词名称', '新关键词', (v) => {
      /* 挂到第一个势力（或当前指定势力）下 */
      const p = (polityId && mfPolityById(polityId)) || ps[0];
      p.fields = p.fields || [];
      let f = p.fields.find((x) => x.kind === 'link');
      if (!f) { f = { id: uid('f'), kind: 'link', title: '关键词', text: '', links: [] }; p.fields.push(f); }
      const kw = { id: uid('k'), label: v, color: CFG.POLITY_COLORS[(f.links.length) % CFG.POLITY_COLORS.length], entryId: null };
      f.links.push(kw);
      const e = mfKeywordEntry(S.pack, kw);
      e.title = v;
      mfPushFnUndo(
        () => { const i = f.links.indexOf(kw); if (i >= 0) f.links.splice(i, 1); refresh(); },
        () => { f.links.push(kw); refresh(); },
        '新增关键词'
      );
      refresh('kw:' + p.id + ':' + f.id + ':' + kw.id);
    }, { title: '新增链接关键词' });
  });
  head.appendChild(bNewKw);
  left.appendChild(head);
  const list = mfNode('div');
  left.appendChild(list);

  const tRow = mfNode('div', 'mf-row');
  tRow.appendChild(mfNode('label', '', '标题'));
  const tIn = mfNode('input', 'mf-inp');
  tRow.appendChild(tIn);
  right.appendChild(tRow);

  /* 人物图 + 图片集 / 评论集入口（势力栏目没有独立资料条目，这两项不适用） */
  const mRow = mfNode('div', 'mf-row');
  mRow.style.cssText = 'gap:6px;flex-wrap:wrap;margin:0 0 6px';
  const pfpBox = mfNode('div', 'mf-pfp');
  const bImgIns = mfNode('div', 'mf-btn', '图 插入图片');
  const bImg = mfNode('div', 'mf-btn', '集 图片集');
  const bCmtIns = mfNode('div', 'mf-btn', '言 插入评论');
  const bCmt = mfNode('div', 'mf-btn', '评 评论集');
  mRow.appendChild(pfpBox); mRow.appendChild(bImgIns); mRow.appendChild(bImg);
  mRow.appendChild(bCmtIns); mRow.appendChild(bCmt);
  right.appendChild(mRow);

  /* 当前选中条目对应的资料条目对象（势力栏目返回 null） */
  function curEntry() {
    if (!cur) return null;
    if (cur.kind === 'lib') return cur.entry;
    if (cur.kind === 'keyword') return mfKeywordEntry(S.pack, cur.kw);
    return null;
  }
  function updMediaRow() {
    const en = curEntry();
    if (!en) { mRow.style.display = 'none'; return; }
    mRow.style.display = '';
    const info = mfEntryInfo(en);
    const p = mfPortrait(en);
    pfpBox.innerHTML = p ? '<img src="' + p + '" alt="人物图">' : '';
    pfpBox.title = p ? '人物图（图片集第一张）' : '还没有图片';
    bImg.textContent = '集 图片集（' + info.imgs + '）';
    bCmt.textContent = '评 评论集（' + info.cmts + '）';
  }
  const afterMedia = () => { updMediaRow(); refresh(); };
  bImgIns.addEventListener('click', () => {
    const en = curEntry(); if (!en) return;
    mfPickFiles(async (files) => { if (await mfInsertImages(en, files)) afterMedia(); }, 'image/*');
  });
  bCmtIns.addEventListener('click', () => { const en = curEntry(); if (en) mfCommentAdd(en, afterMedia); });
  bImg.addEventListener('click', () => { const en = curEntry(); if (en) mfImgDialog(en, cur ? cur.title : '', afterMedia); });
  bCmt.addEventListener('click', () => { const en = curEntry(); if (en) mfCmtDialog(en, cur ? cur.title : '', afterMedia); });

  const ta = mfNode('textarea', 'mf-ta');
  right.appendChild(ta);
  const rRow = mfNode('div', 'mf-row');
  const bDel = mfNode('div', 'mf-btn dgr', '删除此条目');
  bDel.addEventListener('click', () => {
    if (!cur) return;
    mfConfirm('删除「' + cur.title + '」？' + (cur.kind === 'lib' ? '' : '（这是势力栏目，删除后势力简介里也会消失）'), () => {
      mfDeleteEntry(cur);
      refresh();
    }, { dgr: true, okLabel: '删除' });
  });
  const bGo = mfNode('div', 'mf-btn', '定位到所属位置');
  bGo.addEventListener('click', () => {
    if (!cur || !cur.polityId) return;
    const hit = mfWorldOfPolity(cur.polityId);
    if (!hit) return;
    mfUseEra(hit.index);
    setTimeout(() => { mfLocatePolity(hit.polity); }, 40);
    d.close();
  });
  rRow.appendChild(bDel); rRow.appendChild(bGo);
  right.appendChild(rRow);

  const stat = mfNode('div', 'mf-stat');
  const dlgBody = mfNode('div');
  dlgBody.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0';
  dlgBody.appendChild(wrap);
  dlgBody.appendChild(stat);

  let cur = null;
  function refresh(focusKey) {
    const entries = mfLibEntries(S.pack);
    list.innerHTML = '';
    /* 按势力分组标题 */
    let lastP = null;
    entries.forEach((e) => {
      if (e.polityId !== lastP) {
        lastP = e.polityId;
        const cap = mfNode('div', 'mf-sec-t', e.polityId ? ('势力 · ' + esc(e.polityName || '')) : '独立资料条目');
        cap.style.margin = '8px 0 4px';
        list.appendChild(cap);
      }
      const it = mfNode('div', 'mf-lib-i' + (cur && cur.key === e.key ? ' on' : ''));
      const icon = e.kind === 'keyword' ? '链' : (e.kind === 'field' ? '文' : '页');
      it.appendChild(mfNode('span', '', icon));
      it.appendChild(mfNode('span', 'nm', esc(e.title)));
      it.addEventListener('click', () => { select(e); });
      list.appendChild(it);
    });
    if (!entries.length) list.appendChild(mfNode('div', 'mf-note', '还没有资料。点「＋ 新资料条目」开始写。'));
    const s = mfLibStats(S.pack);
    stat.innerHTML = '<span>资料栏目 ' + s.fields + '</span><span>关键词 ' + s.kws + '</span><span>字数 ' + s.chars + '</span>'
      + '<span>图片 ' + s.imgs + '</span><span>评论 ' + s.cmts + '</span>';
    if (focusKey) {
      const t = entries.find((e) => e.key === focusKey);
      if (t) select(t);
    }
    if (cur) {
      const again = entries.find((e) => e.key === cur.key);
      if (again) { cur = again; } else { cur = null; tIn.value = ''; ta.value = ''; }
    }
  }
  function select(e) {
    flush();
    cur = e;
    tIn.value = e.title;
    ta.value = e.get();
    updMediaRow();
    refresh();
  }
  function flush() {
    if (!cur) return;
    cur.set(ta.value);
    if (cur.kind === 'lib') cur.entry.body = ta.value;
    if (cur.kind !== 'field' && cur.kind !== 'keyword') { if (cur.entry) cur.entry.title = tIn.value; }
    else { /* 势力栏目的标题由栏目名控制 */ }
    mfTouch();
  }
  tIn.addEventListener('input', () => {
    if (!cur) return;
    if (cur.kind === 'lib') { cur.entry.title = tIn.value; cur.title = tIn.value; }
    else if (cur.kind === 'keyword') { cur.kw.label = tIn.value; if (cur.kw.entryId) { const en = S.pack.library.find((x) => x.id === cur.kw.entryId); if (en) en.title = tIn.value; } cur.title = tIn.value; }
    else if (cur.kind === 'field') { cur.field.title = tIn.value; cur.title = tIn.value; }
    mfTouch();
  });
  ta.addEventListener('input', () => { flushDebounced(); });
  let ft = 0;
  function flushDebounced() { if (ft) clearTimeout(ft); ft = setTimeout(() => { ft = 0; flush(); refresh(); }, 400); }

  refresh(entryId ? 'lib:' + entryId : null);
  if (!cur && entryId) {
    const e = mfLibEntries(S.pack).find((x) => x.key === ('lib:' + entryId) || x.key.indexOf(':' + entryId) >= 0);
    if (e) select(e);
  }

  const d = mfDialog({
    title: '资料库编写', cls: 'mf-lib', body: dlgBody, width: 'min(880px,94vw)',
    buttons: [{ label: '关闭', fn: function () { flush(); mfRenderProfile(); } }]
  });
  mfOpenLibraryDlg = d;
  return d;
}
let mfOpenLibraryDlg = null;

function mfDeleteEntry(e) {
  if (e.kind === 'lib') {
    const arr = S.pack.library, at = arr.indexOf(e.entry); if (at >= 0) arr.splice(at, 1);
  } else if (e.kind === 'field') {
    const p = mfFindPolityAny(e.polityId); if (!p) return;
    const at = p.fields.indexOf(e.field); if (at >= 0) p.fields.splice(at, 1);
  } else if (e.kind === 'keyword') {
    const p = mfFindPolityAny(e.polityId); if (!p) return;
    const at = e.field.links.indexOf(e.kw); if (at >= 0) e.field.links.splice(at, 1);
  }
  mfTouch();
}

/* ------------------------------------------------------------- 搜索 ------ */
const MF_SEARCH_ICON = { polity: '势', field: '文', keyword: '链', lib: '页', label: '◎', terrain: '▲' };

function mfSearchRun(q) {
  if (!UI.sres || !S.pack) return;
  q = (q || '').trim().toLowerCase();
  if (!q) { mfSearchClose(); return; }
  const pk = S.pack, out = [];
  const multi = pk.worlds.length > 1;
  const eraTag = (wd) => multi ? '　（' + wd.name + '）' : '';
  /* 势力名（跨全部时代） */
  pk.worlds.forEach((wd, wi) => {
    (wd.polities || []).forEach((p) => {
      if ((p.name || '').toLowerCase().indexOf(q) < 0) return;
      out.push({
        kind: 'polity', title: p.name, desc: '势力 · ' + (p.fields || []).length + ' 个栏目' + eraTag(wd),
        go: () => {
          mfSearchClose();
          mfUseEra(wi);                       /* 命中别的时代就先切过去 */
          const pp = mfPolityById(p.id);
          if (pp) { mfLocatePolity(pp); mfOpenProfile(p.id); }
          else mfGoto(0, 0, 2.2);
        }
      });
    });
  });
  /* 资料条目（含势力栏目与关键词） */
  mfLibEntries(pk).forEach((e) => {
    const ent = e.kind === 'lib' ? e.entry : (e.kind === 'keyword' ? mfEntryOfKw(pk, e.kw) : null);
    const info = ent ? mfEntryInfo(ent) : { imgs: 0, cmts: 0 };
    const cmt = ent ? mfEntryCmts(ent).filter((c) => ((c.text || '') + ' ' + (c.from || '')).toLowerCase().indexOf(q) >= 0)[0] : null;
    const inT = (e.title || '').toLowerCase().indexOf(q) >= 0;
    const inB = (e.body || '').toLowerCase().indexOf(q) >= 0;
    if (!inT && !inB && !cmt) return;
    let snip = inB ? mfSnippet(e.body, q) : ((e.body || '').slice(0, 60) || (cmt ? '评论：' + mfSnippet(cmt.text, q) : ''));
    if (info.imgs || info.cmts) snip += '　图' + info.imgs + '　言' + info.cmts;
    out.push({
      kind: e.kind, title: e.title, thumb: ent ? mfPortrait(ent) : '', desc: snip + (e.eraName ? eraTag({ name: e.eraName }) : ''),
      go: () => {
        mfSearchClose();
        if (e.kind === 'keyword') { mfOpenLibrary(mfKeywordEntry(pk, e.kw).id); return; }   /* 关键词：直接打开资料界面 */
        if (e.kind === 'lib') { mfOpenLibrary(e.entry.id); return; }
        /* 势力栏目：切到它所在的时代 → 打开势力简介 */
        const hit = mfWorldOfPolity(e.polityId);
        if (hit) {
          mfUseEra(hit.index);
          setTimeout(() => {
            const p = mfPolityById(e.polityId);
            if (p) { mfLocatePolity(p); mfOpenProfile(p.id); }
          }, 40);
        }
      }
    });
  });
  /* 标签（跨全部时代） */
  pk.worlds.forEach((wd, wi) => {
    (wd.labels || []).forEach((l) => {
      if ((l.text || '').toLowerCase().indexOf(q) < 0) return;
      out.push({
        kind: 'label', title: l.text,
        desc: '地图标签 · ' + ((CFG.LABEL_TYPES.find((t) => t.v === l.type) || {}).n || '') + eraTag(wd),
        go: () => { mfSearchClose(); mfUseEra(wi); mfGoto(l.lon, l.lat, 1.5); }
      });
    });
  });
  /* 地形画笔（跨全部时代） */
  pk.worlds.forEach((wd, wi) => {
    (wd.terrains || []).forEach((t, i) => {
      if ((t.name || '').toLowerCase().indexOf(q) < 0) return;
      out.push({
        kind: 'terrain', title: t.name, desc: '地形画笔 · ' + t.h + 'm' + eraTag(wd),
        go: () => { mfSearchClose(); mfUseEra(wi); ED.terrainIdx = i; ED.tool = 'terrain:' + i; mfToggleEdit(true); _panelTab = 1; mfBuildPanel(); }
      });
    });
  });

  UI.sres.innerHTML = '';
  if (!out.length) {
    UI.sres.appendChild(mfNode('div', 'mf-sitem', '<div class="t">没有找到「' + esc(q) + '」</div>'));
    UI.sres.classList.add('on');
    return;
  }
  out.slice(0, 40).forEach((r) => {
    const it = mfNode('div', 'mf-sitem');
    /* 有人物图时把它作为头像贴在结果左边（插进去的第一张图就是人物图） */
    it.innerHTML = (r.thumb ? '<img class="av" src="' + r.thumb + '" alt="">' : '') +
      '<div class="tx"><div class="t">' + esc(MF_SEARCH_ICON[r.kind] || '·') + ' ' + esc(r.title) + '</div>' +
      '<div class="d"><span class="tag">' + esc(r.kind) + '</span>' + esc(r.desc || '') + '</div></div>';
    it.addEventListener('click', () => r.go());
    UI.sres.appendChild(it);
  });
  UI.sres.classList.add('on');
}
function mfSnippet(body, q) {
  const i = (body || '').toLowerCase().indexOf(q);
  if (i < 0) return (body || '').slice(0, 70);
  const s = Math.max(0, i - 24);
  return (s > 0 ? '…' : '') + body.slice(s, s + 90).replace(/\n/g, ' ');
}
function mfSearchClose() { if (UI.sres) UI.sres.classList.remove('on'); }

/* ===================== 99_main.js ===================== */
/* ==========================================================================
 * 模块出口：settingsSchema / init / update / dispose
 * ========================================================================== */

function mfCardRender() {
  mfInjectCSS();
  const box = mfNode('div');
  box.innerHTML = '<div class="mf-note" style="margin-bottom:6px">自定义地图创建模块：在地球地图左缘加一个「其他地图」书签，'
    + '可创建与地球地图同类型的空白球体地图并自由创作。</div>';
  const r = mfNode('div', 'mf-row');
  const b1 = mfNode('div', 'mf-btn pri', '▸ 打开地图目录');
  b1.style.flex = '1';
  const b2 = mfNode('div', 'mf-btn', '＋ 新建地图');
  b2.style.flex = '1';
  b1.addEventListener('click', () => {
    if (!ST) { if (globalThis.__V3HOST) globalThis.__V3HOST.toast('请先打开模块开关（装配后才会初始化）', 2600); return; }
    mfOpenCatalog();
  });
  b2.addEventListener('click', () => {
    if (!ST) { if (globalThis.__V3HOST) globalThis.__V3HOST.toast('请先打开模块开关（装配后才会初始化）', 2600); return; }
    mfNewMapDialog();
  });
  r.appendChild(b1); r.appendChild(b2);
  box.appendChild(r);
  const cnt = mfNode('div', 'mf-note', '地图数量：读取中…');
  box.appendChild(cnt);
  if (ST) {
    mfLoadIndex().then((idx) => {
      cnt.textContent = '已有地图 ' + idx.length + ' 张' + (idx.length ? '（最近：' + idx.slice(0, 3).map((x) => x.name).join('、') + '）' : '');
    }).catch(() => { cnt.textContent = '地图数量：—'; });
  } else {
    cnt.textContent = '装配后即可查看已有地图';
  }
  return function cleanup() { };
}

const MF_MODULE = {
  id: 'map-forge',
  name: '自定义地图创建模块',
  icon: '图',
  version: '1.1.0',
  minHost: 3,
  author: '',
  description: '在地球地图左缘新增「其他地图」书签：创建与地球地图同类型的空白 3D 球体地图，用三支笔、势力笔、地形画笔、建模系统与命名标签自由创作，并接入模块自建资料库与搜索。顶部时代栏里，每个时代都是一颗独立星球，可套用「时代模板」快速起手。',

  /* 契约预留位：调试/回归测试钩子，init 时装配（替代旧的 globalThis.__MF_DBG__） */
  _debug: null,

  settingsSchema: [
    { type: 'toggle', key: 'enabled', label: '启用', default: true, hint: '打开后，地球地图主界面左缘出现「其他地图」书签按钮' },
    {
      type: 'info',
      text: '用法：点书签 → 地图目录 → 点「＋」创建新地图（或把 .mfmap 拖到加号上导入）。进入地图后点左侧「具」开启工具包：'
        + '<b>三支笔</b>圈定陆地/海洋/其他区域，<b>势力笔</b>圈定势力并编辑资料，<b>地形画笔</b>画地形后可一键建模，'
        + '<b>建模系统</b>做自由建模并拖到地图上放置，<b>标签</b>为地形命名。<br>'
        + '<b>时代</b>：顶部时代栏默认有「当前时代」，点右侧 <b>＋</b> 直接创建一颗新的空白星球，'
        + '<b>右键 ＋</b> 可用「使用时代模板」按已保存的模板起手；右键某个时代可<b>重命名</b>、<b>更换位置</b>或<b>保存为时代模板</b>。'
        + '每个时代都是彼此独立的一颗星球，左键点时代按钮即可切换。<br>'
        + '<b>历史快照</b>：编辑过程中会自动留档（最近 10 份），误填充 / 误删势力 / 误删时代后可用地图界面左侧的「史」一键滚回来。<br>'
        + '<b>人物图与评论</b>：在势力简介里右键关键词链接（也可在资料库界面操作）→ 插入图片 / 打开图片集 / 插入评论 / 打开评论集；'
        + '图片集的<b>第一张</b>会自动成为人物图，顶部搜索该人物时直接显示在结果里。'
    },
    { type: 'toggle', key: 'askDeploy', label: '部署建模前都问一句', default: true, hint: '开着：每次把建模放上球面前都弹确认；关掉：预览里点一下就放' },
    { type: 'toggle', key: 'askFill', label: '一键填充前都问一句', default: true, hint: '开着：点「填充」前先弹确认；关掉：直接填（仍会先留历史快照）' },
    { type: 'toggle', key: 'askShapeReset', label: '重置星球形状前都问一句', default: true, hint: '开着：点「重置成标准球形」前先弹确认；关掉：直接抹平（Ctrl+Z 可撤销）' },
    { type: 'group', label: '显示与性能' },
    {
      type: 'select', key: 'perfMode', label: '性能模式', default: 'auto',
      hint: '自动：掉帧时自己降画质、流畅后再升回来；画质优先：怎么卡都不降；流畅优先：一开始就轻装上阵',
      options: [
        { value: 'auto', label: '自动（推荐）' },
        { value: 'quality', label: '画质优先' },
        { value: 'smooth', label: '流畅优先' }
      ]
    },
    {
      type: 'select', key: 'seg', label: '球面网格精度', default: '2',
      hint: '球面渲染网格分段，越高边界越锐利、GPU 压力越大',
      options: [
        { value: '0', label: '低（512×256，最流畅）' },
        { value: '1', label: '中（768×384）' },
        { value: '2', label: '高（1024×512，推荐）' },
        { value: '3', label: '极高（1536×768，边界最锐利）' }
      ]
    },
    { type: 'toggle', key: 'autoRestore', label: '启动时自动打开上次地图', default: false, hint: '打开程序后直接进入上次编辑的地图（默认关闭，先留在地球地图）' },
    { type: 'group', label: '编辑习惯' },
    {
      type: 'toggle', key: 'swapLR', label: '编辑态左右键互换', default: false,
      hint: '默认：选中笔后左键作画、右键旋转球体。勾上后反过来（左键旋转、右键作画）——习惯左手转球的人适用'
    },
    {
      type: 'toggle', key: 'showGrid', label: '显示经纬网格线', default: true,
      hint: '漂浮在球面上方的一薄层白色经纬网格（15° 一道，赤道与本初子午线略亮），画笔与建模都压在它下面。编辑器左侧「网」按钮可快速开关'
    },
    {
      type: 'toggle', key: 'smoothEdge', label: '手绘风平滑边界', default: true,
      hint: '把栅格的锯齿边界抽成等值线、做贝塞尔拟合后描在球面上（陆海闭合区域 + 势力 1px 边境）。格子极多时会自动跳过以保证流畅'
    },
    {
      type: 'toggle', key: 'gzExport', label: '导出时用 gzip 压缩', default: true,
      hint: '勾选后 .mfmap 体积通常能小很多（二进制 gzip 包，扩展名不变，导入时自动识别）。当前环境不支持压缩会自动退回普通 JSON'
    },
    { type: 'group', label: '数据与维护' },
    {
      type: 'button', key: 'doSnapshot', text: '历史快照（回滚）',
      action: function () { if (S.pack) mfSnapDialog(); else if (globalThis.__V3HOST) globalThis.__V3HOST.toast('先打开一张地图，才能看它的历史快照', 2600); }
    },
    {
      type: 'button', key: 'doOpen', text: '打开地图目录', kind: 'pri',
      action: function () { if (!ST) return; mfOpenCatalog(); }
    },
    {
      type: 'button', key: 'doNew', text: '＋ 新建一张地图',
      action: function () { if (!ST) return; mfNewMapDialog(); }
    },
    {
      type: 'button', key: 'doExport', text: '⤓ 导出当前地图（.mfmap）',
      action: function () { if (S.pack) mfExportDialog(S.pack); else if (globalThis.__V3HOST) globalThis.__V3HOST.toast('当前没有打开的地图', 2400); }
    },
    {
      type: 'button', key: 'doSave', text: '保存当前地图',
      action: function () { if (S.pack) mfSaveNow(); else if (globalThis.__V3HOST) globalThis.__V3HOST.toast('当前没有打开的地图', 2400); }
    },
    {
      type: 'button', key: 'doTpl', text: '管理时代模板',
      action: function () { if (S.pack) mfEraTemplateDialog(); else if (globalThis.__V3HOST) globalThis.__V3HOST.toast('先打开一张地图，再管理时代模板', 2600); }
    },
    {
      type: 'button', key: 'doWipe', text: '清空本模块全部地图数据', kind: 'dgr',
      action: function () {
        mfConfirm('确定清空本模块保存在浏览器里的<b>全部地图</b>？建议先逐张导出备份，此操作不可恢复。', async () => {
          try {
            const idx = await mfLoadIndex();
            for (const r of idx) await mfDelMap(r.id);
            await mfSaveIndex([]);
            if (globalThis.__V3HOST) globalThis.__V3HOST.toast('已清空全部地图数据', 3000, 'ok');
          } catch (e) { if (globalThis.__V3HOST) globalThis.__V3HOST.toast('清空失败：' + e.message, 3600, 'err'); }
        }, { dgr: true, okLabel: '清空全部', title: '清空全部地图数据' });
      }
    },
    { type: 'custom', key: '__card', render: function () { return mfCardRender(); } }
  ],

  init(ctx) {
    CTXREF = ctx;
    ST = ctx.store;
    let gen = 0;
    gen++;
    const later = (fn, ms) => { const g = gen; return setTimeout(() => { if (g === gen) fn(); }, ms); };
    const enabled = () => ctx.settings.get('enabled') !== false;
    const hooks = [];

    S.segIdx = clamp(parseInt(ctx.settings.get('seg') ?? '2', 10) || 2, 0, CFG.SEG.length - 1);

    /* 触屏：长按唤出右键菜单 */
    mfTouchLongPress();

    /* 记性看门狗：内存快装满时自动掸灰（裁撤销栈、清缩略图缓存），并温声提醒保存 */
    const myGen = gen;
    let lastWoof = 0;
    const memWatch = setInterval(() => {
      if (myGen !== gen) { clearInterval(memWatch); return; }
      try {
        const pm = performance.memory;
        if (!pm || !pm.jsHeapSizeLimit) return;
        if (pm.usedJSHeapSize / pm.jsHeapSizeLimit < 0.82) return;
        if (ED.undo.length > 12) ED.undo.splice(0, ED.undo.length - 12);
        if (ED.redo.length) ED.redo.length = 0;
        if (MO.undo && MO.undo.length > 12) MO.undo.splice(0, MO.undo.length - 12);
        if (MO.redo && MO.redo.length) MO.redo.length = 0;
        if (_primThumbCache.size > 60) {
          const keys = Array.from(_primThumbCache.keys());
          for (let i = 0; i < keys.length - 40; i++) _primThumbCache.delete(keys[i]);
        }
        const now = Date.now();
        if (now - lastWoof > 300000) {
          lastWoof = now;
          ctx.toast('记性快装满了，帮您掸了掸灰——手里有没保存的地图的话，存一下更安心', 4600);
        }
      } catch (e) { }
    }, 30000);

    /* 临别急存：页面被收走的那一刻，能救一笔是一笔 */
    window.addEventListener('pagehide', () => {
      if (myGen !== gen) return;
      try { if (S.pack && ED.visible) mfSaveNow(true); } catch (e) { }
    });

    /* 启动时拾旗：上次没能好好道别的话，温声问一句要不要回去看看 */
    later(async () => {
      if (!enabled() || !ST) return;
      try {
        const ses = await ST.get(K_SESSION);
        if (!ses || !ses.id) return;
        const idx = await mfLoadIndex();
        const rec = idx.find((x) => x.id === ses.id);
        if (!rec) { mfSessionClear(); return; }   /* 地图都不在了，旗子拔掉 */
        mfDialog({
          title: '小女仆的发现',
          body: '<div style="line-height:1.9">上次离别有些匆忙，「<b>' + esc(rec.name) + '</b>」的门没来得及好好关上。<br>'
            + '别担心——它已被自动收好到最后一刻的模样。要现在去看看它吗？</div>',
          buttons: [
            { label: '去看看', pri: true, fn: () => { mfOpenMapById(ses.id); } },
            { label: '先不了', fn: () => { } }
          ],
          onClose: () => { mfSessionClear(); }
        });
      } catch (e) { }
    }, 2600);

    /* 调试钩子：挂到模块对象的 _debug 字段（契约预留位），不再写裸全局。
     * 自动化测试经 宿主模块表[map-forge]._debug 访问。
     * 注意宿主 register 时会 normalize 复制一份 def，init 是以 def.init(ctx) 调用的，
     * 所以除了写 MF_MODULE（源码原件），还要写 this（注册表里的那份），两边都挂上 */
    const MF_DBG = {
      S: S, ED: ED, CFG: CFG, MO: MO,
      ser: (w) => mfSerializeWorld(w),
      des: (o) => mfDeserializeWorld(o),
      un: (s, bp, n) => (bp === 1 ? mfUnRLE(s, 1, n, Uint8Array) : mfUnRLE(s, 2, n, Uint16Array)),
      tpl: () => mfLoadTemplates(),
      tplAdd: (w, n, t) => mfTemplateAdd(w, n, t),
      tplToWorld: (t, n) => mfTemplateToWorld(t, n),
      fromTpl: (t) => mfEraFromTemplate(t),
      useEra: (i) => mfUseEra(i),
      worlds: () => (S.pack ? S.pack.worlds.map((w) => ({ name: w.name, id: w.id })) : null),
      curName: () => (S.map ? S.map.name : null),
      camDist: () => (S.camera ? S.camera.position.length() : null),
      repaint: () => { mfRefreshColors(); mfApplyHeight(); S.renderer.render(S.scene, S.camera); },
      vert: () => {
        const c = S.geo.attributes.color.array;
        let n = 0;
        for (let i = 0; i < c.length; i += 3) if (c[i + 1] > c[i + 2] + 0.02 && c[i + 1] >= c[i]) n++;
        return { greenVerts: n, total: c.length / 3 };
      },
      cam: () => ({ pos: S.camera.position.toArray(), target: S.controls.target.toArray(), sceneKids: S.scene.children.length, sphereInScene: S.scene.children.indexOf(S.sphere) }),
      put: (k, v) => ST.put(k, v),
      get: (k) => ST.get(k),
      /* 快照（回滚）/ 副本 / 左右键 / gzip 导出 —— 回归测试用 */
      snapPush: (lb) => mfSnapPush(S.pack, lb),
      snapList: () => (S.pack ? mfSnapList(S.pack.meta.id) : null),
      snapRestore: (id) => mfSnapRestore(S.pack, id),
      swapNow: () => mfMouseSwap(),
      paintBtn: () => mfPaintBtn(),
      exportPack: (opt) => mfExportMap(S.pack, opt || {}),
      dup: (id) => mfDupMap(id),
      open: (p) => mfOpenMap(p),
      setPref: (k, v) => mfPrefSet(k, v),
      openLib: (entryId) => mfOpenLibrary(entryId),
      openProf: (polId) => mfOpenProfile(polId),
      /* ---- 平滑边界（回归测试用） ---- */
      contour: () => {
        let pts = 0, maxPts = 0;
        if (CT.grp) CT.grp.children.forEach((l) => {
          const c = l.geometry.attributes.position.count;
          pts += c; if (c > maxPts) maxPts = c;
        });
        return {
          on: mfContourEnabled(),
          lines: CT.grp ? CT.grp.children.length : 0,
          visible: CT.grp ? CT.grp.visible : false,
          segs: CT.segs, ms: CT.ms, skipped: CT.skipped, pts: pts, maxPts: maxPts
        };
      },
      /* 让「平滑边界」立刻重算（不等渲染帧的脏标记） */
      contourForce: () => { S.dirtyContour = true; mfRebuildContours(true); },
      /* 描边线的世界坐标采样（测试里投影到屏幕，核对是否真的贴着陆地） */
      contourSample: (k) => {
        if (!CT.grp) return [];
        const out = [];
        CT.grp.children.forEach((l) => {
          const p = l.geometry.attributes.position;
          const step = Math.max(1, Math.floor(p.count / 40));
          for (let i = 0; i < p.count; i += step) out.push([p.getX(i), p.getY(i), p.getZ(i)]);
        });
        return k ? out.slice(0, k) : out;
      },
      /* 直接在栅格上盖一块陆地（测试用，绕开鼠标作画的不确定性） */
      stampLand: (lon, lat, rad) => {
        const g = S.map.grid;
        g.stamp(lon, lat, rad * D2R, (i) => { g.region[i] = 1; });
        S.dirtyColor = true; S.dirtyContour = true;
        mfRefreshColors(); mfApplyHeight(); mfRebuildContours(true);
        S.renderer.render(S.scene, S.camera);
        let n = 0; for (let i = 0; i < g.region.length; i++) if (g.region[i] === 1) n++;
        return n;
      },
      /* 球面参数化 ↔ 经纬度是否互逆（抓「定位到势力飞到镜像经度」这类 bug） */
      gotoCheck: (lon, lat) => {
        mfGoto(lon, lat);
        const cv = S.canvas.getBoundingClientRect();
        const hit = mfPick(cv.left + cv.width / 2, cv.top + cv.height / 2);
        return hit ? { lon: +hit.lon.toFixed(2), lat: +hit.lat.toFixed(2) } : null;
      },
      /* ---- 星空（回归测试用） ---- */
      starCount: () => {
        let n = 0;
        if (S.stars) S.stars.traverse((o) => { if (o.isPoints) n += o.geometry.attributes.position.count; });
        return n;
      },
      /* 银河带 vs 银极方向的密度比（按球面面积归一化）。
       * 纯均匀随机 ≈ 1.0；真星空就靠这条断言判断是否真的做出了银河聚集 */
      starContrast: () => {
        if (!S.stars) return 0;
        const v = [-0.38, 0.86, 0.34], L = Math.hypot(v[0], v[1], v[2]);
        const nx = v[0] / L, ny = v[1] / L, nz = v[2] / L;
        let near = 0, far = 0;
        S.stars.traverse((o) => {
          if (!o.isPoints) return;
          const p = o.geometry.attributes.position.array, n = p.length / 3;
          for (let i = 0; i < n; i++) {
            const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
            const len = Math.hypot(x, y, z) || 1;
            const lat = Math.asin(clamp(Math.abs((x * nx + y * ny + z * nz) / len), -1, 1)) * R2D;
            if (lat < 15) near++; else if (lat > 60) far++;
          }
        });
        /* 面积权重：±15° 球带 ∝ 2·sin15°；|b|>60° 的两块球冠 ∝ 2·(1−sin60°) */
        const aNear = 2 * Math.sin(15 * D2R), aFar = 2 * (1 - Math.sin(60 * D2R));
        return (near / aNear) / Math.max(1, far / aFar);
      },
      /* ---- 建模系统（回归测试用） ---- */
      openModel: (id) => mfOpenModeling(id),
      modelInfo: () => ({
        open: MO.open, hasMesh: !!MO.mesh, mode: MO.mode, snap: MO.snap,
        selKind: MO.selKind, sel: MO.sel ? MO.sel.length : 0,
        verts: MO.model ? MO.model.verts.length / 3 : -1,
        faces: MO.model ? MO.model.faces.length / 3 : -1,
        first: MO.model && MO.model.verts.length ? [MO.model.verts[0], MO.model.verts[1], MO.model.verts[2]] : null,
        undo: MO.undo.length
      }),
      setMode: (m) => { MO.mode = m; },
      setSnap: (s) => { MO.snap = s; mfGridSnap(s); },
      /* 几何指纹：所有顶点坐标绝对值之和。拖动后这个值必然变，
       * 比只盯某一个顶点可靠（光标命中的不一定是 0 号顶点） */
      modelSig: () => {
        if (!MO.model || !MO.model.verts.length) return 0;
        let s = 0;
        for (let i = 0; i < MO.model.verts.length; i++) s += Math.abs(MO.model.verts[i]);
        return s;
      },
      /* 全部顶点是否都落在 step 的网格上（验证吸附有没有真的生效） */
      gridCheck: (st) => {
        if (!MO.model || !st) return true;
        for (let i = 0; i < MO.model.verts.length; i++) {
          const q = MO.model.verts[i] / st;
          if (Math.abs(q - Math.round(q)) > 1e-4) return false;
        }
        return true;
      },
      /* ---- 地图上的建模实例（回归测试用） ---- */
      models: () => (S.map && S.map.models ? S.map.models.map((m) => ({ id: m.id, name: m.name })) : []),
      instPlace: (modelId, lon, lat) => mfPlaceInstance(modelId, lon, lat),
      instInfo: () => mfInstList().map((x) => ({ id: x.id, lon: x.lon, lat: x.lat, rot: x.rot, scale: x.scale })),
      instCount: () => mfInstList().length,
      selInst: () => ED.selInst,
      pickInstAt: (x, y) => mfPickInst(x, y),
      goto: (lon, lat, dist) => mfGoto(lon, lat, dist),
      /* 关键词资料：图片集 / 评论集 / 人物图（回归测试用） */
      addKw: (nm) => {
        /* 优先挂在当前时代的第一个势力下：势力简介只渲染当前星球上的势力 */
        let pol = ((S.map && S.map.polities) || []).filter((x) => x)[0] || null;
        if (!pol) { for (const w of S.pack.worlds) { if ((w.polities || []).length) { pol = w.polities[0]; break; } } }
        if (!pol) return null;
        pol.fields = pol.fields || [];
        let f = pol.fields.filter((x) => x.kind === 'link')[0];
        if (!f) { f = { id: uid('f'), kind: 'link', title: '关键词', text: '', links: [] }; pol.fields.push(f); }
        const kw = { id: uid('k'), label: nm, color: CFG.POLITY_COLORS[0], entryId: null };
        f.links = f.links || []; f.links.push(kw);
        const e = mfKeywordEntry(S.pack, kw); e.title = nm;
        mfTouch();
        let wIdx = 0;
        S.pack.worlds.forEach((w, i) => { if ((w.polities || []).indexOf(pol) >= 0) wIdx = i; });
        return { polId: pol.id, fieldId: f.id, kwId: kw.id, entryId: e.id, wIdx: wIdx };
      },
      entryOf: (id) => S.pack.library.filter((x) => x.id === id)[0] || null,
      entryInfo: (id) => mfEntryInfo(S.pack.library.filter((x) => x.id === id)[0]),
      portrait: (id) => mfPortrait(S.pack.library.filter((x) => x.id === id)[0]),
      libStats: () => mfLibStats(S.pack),
      insImg: async (entryId, b64) => {
        const e = S.pack.library.filter((x) => x.id === entryId)[0];
        if (!e) return 0;
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const file = new File([u8], 'test.png', { type: 'image/png' });
        return mfInsertImages(e, [file]);
      },
      insCmt: (entryId, text, from) => {
        const e = S.pack.library.filter((x) => x.id === entryId)[0];
        if (!e) return false;
        mfEntryCmts(e).push({ id: uid('cm'), from: from || '', text: text || '', t: Date.now() });
        mfTouch();
        return true;
      },
      impBytes: (b64) => {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return mfImportBytes(u8, 'hook.mfmap');
      },
      landCount: () => {
        if (!S.map) return -1;
        let n = 0; const g = S.map.grid;
        for (let i = 0; i < g.region.length; i++) if (g.region[i] === 1) n++;
        return n;
      }
    };
    MF_MODULE._debug = MF_DBG;
    try { if (typeof this === 'object' && this && this !== MF_MODULE) this._debug = MF_DBG; } catch (e) { }

    mfInjectCSS();

    /* three.js 能力探测：拿不到就只在点击时给友好提示，不算事故 */
    const threeOK = mfEnsureThree();
    if (!threeOK) {
      ctx.log('未检测到宿主的 three.js 运行时（__threeNS__）；'
        + '书签仍会出现，但打开地图前需要宿主提供 three.js。');
    }

    function mountUI() {
      if (!enabled()) return;
      mfBuildBookmark();
      if (!threeOK) {
        later(() => ctx.toast('未检测到 three.js 运行时，3D 地图场景可能无法打开（模块其余功能不受影响）', 5200, 'err'), 1200);
      }
    }
    function unmountUI() {
      mfCloseEditor();
      if (UI.bm) { mfDrop(UI.bm); UI.bm = null; }
    }

    mountUI();
    hooks.push(ctx.settings.onChange('enabled', (v) => {
      if (v === false) unmountUI(); else mountUI();
    }));
    hooks.push(ctx.settings.onChange('swapLR', () => {
      mfSyncControls();
      if (ED.edit) mfHintText(mfMouseSwap()
        ? '左键拖动＝旋转球体　右键＝使用工具作画　Esc＝退出工具'
        : '左键＝使用工具作画　右键拖动＝旋转球体　Esc＝退出工具');
    }));
    hooks.push(ctx.settings.onChange('showGrid', () => { if (S.ok) mfSyncGridTexture(); }));
    hooks.push(ctx.settings.onChange('smoothEdge', () => {
      if (S.ok) { S.dirtyContour = true; mfRebuildContours(true); }
    }));
    hooks.push(ctx.settings.onChange('seg', (v) => {
      const i = clamp(parseInt(v, 10) || 2, 0, CFG.SEG.length - 1);
      if (i !== S.segIdx) {
        S.segIdx = i;
        if (S.ok) { mfBuildSphere(); mfRefreshColors(); if (S.map && S.map.height) mfApplyHeight(); }
      }
    }));

    /* 启动恢复上次地图 */
    if (ctx.settings.get('autoRestore') === true) {
      const last = ctx.settings.get('lastMap');
      if (last) later(() => { mfOpenMapById(last); }, 900);
    }

    /* 首次装配的引导提示 */
    later(() => {
      if (!threeOK) return;
      ctx.toast('「其他地图」书签已在地球地图左缘，点它开始创作新地图', 4200, 'ok');
    }, 1500);

    return function dispose() {
      gen++;                              // 排队中的 later() 全部作废
      try { clearTimeout(ED.saveTimer); clearTimeout(ED.snapTimer); } catch (e) { }
      ED.saveTimer = 0; ED.snapTimer = 0;
      hooks.forEach((off) => { try { off(); } catch (e) { } });
      hooks.length = 0;
      /* window / document 上挂的监听 */
      MF_OFFS.forEach((off) => { try { off(); } catch (e) { } });
      MF_OFFS.length = 0;
      try { mfCloseMenu(); } catch (e) { }
      try { if (MO.dlg && MO.dlg.close) MO.dlg.close(); } catch (e) { }
      try { mfSceneDispose(); } catch (e) { }
      /* 自建 DOM：逐个移除 */
      MF_DOM.slice().forEach((n) => { try { mfDrop(n); } catch (e) { } });
      MF_DOM.length = 0;
      UI.bm = null; UI.root = null; UI.panel = null; UI.prof = null; UI.top = null; UI.tl = null;
      UI.zoom = null; UI.hint = null; UI.lbl = null; UI.sres = null; UI.sinp = null; UI.sinp = null;
      S.map = null; S.pack = null; ED.visible = false; ED.edit = false; ED.tool = null;
      try { mfRemoveCSS(false); } catch (e) { }
      ST = null; CTXREF = null;
    };
  },

  update(dt) {
    if (!ED.visible || !S.ok) return;
    mfRenderFrame(dt);
  },

  dispose() { }
};

export default MF_MODULE;
