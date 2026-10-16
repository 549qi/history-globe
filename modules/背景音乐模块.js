/* ==========================================================================
 *  《我，地图和小女仆》内置模块① —— 自定义背景音乐（独立模块文件）
 *  ------------------------------------------------------------------------
 *  安装：打开程序「设置 › 功能模块」，把本文件拖进 ＋ 装配区（或点「从 .js 文件导入」）。
 *  卸载：拨动模块卡片右上角的开关即卸下；「编辑当前已装配模块」里可管理。
 *  功能：导入音频 → 波形上截取循环片段（过零点吸附）→ 多轨混音循环；
 *        每轨可标年代区间，跨越年代自动等功率交叉淡化。
 *  本文件即程序内置music模块的同一份源码 —— 「内置」与「导入」只是源码来源不同。
 * ========================================================================== */

/* ==========================================================================
 *  ◈ 宿主运行时接入（模块装载的第一行）
 *  本模块设计为在《我，地图和小女仆》宿主程序中装载：打开「设置 › 功能模块」，
 *  把本 .js 文件拖进 ＋ 装配区即可。宿主在装配任何模块之前，会把公共运行时
 *  挂到 globalThis.__V3HOST，模块从这里按需取用。
 *    U        DOM/存储/数值小工具（U.el / U.clamp / U.esc / U.idb …）
 *    Settings 全局设置（只用于读跨模块总控，如 sound.enabled；自己的设置走 ctx.settings）
 *    toast    顶部提示条        Events 事件总线       EV 事件名常量
 *    APP      主程序只读句柄    UI 设置面板           Modules 模块管理器
 * ========================================================================== */
const __HOST = globalThis.__V3HOST;
if (!__HOST || !__HOST.U) {
  throw new Error('本模块需要在《我，地图和小女仆》宿主程序中装载（未找到 __V3HOST 运行时）。'
    + '请打开程序的「设置 › 功能模块」，把本文件拖进 ＋ 装配区。');
}
const U = __HOST.U;
const Settings = __HOST.Settings;
const toast = __HOST.toast;
const Events = __HOST.Events;
const EV = __HOST.EV;
const APP = __HOST.APP;
const UI = __HOST.UI;
const Modules = __HOST.Modules;


/* ==========================================================================
 *  ◈ 模块自带样式
 *  装配时注入 <head>（带 data-mod 标记），卸下时整块移除 —— 卸载无残留。
 *  与宿主共享的基座样式（按钮/卡片/折叠组…）不在此列，由宿主提供。
 * ========================================================================== */
const MOD_CSS = [
'.v3-wave{width:100%;height:78px;display:block;border:1px solid var(--rule,#c9b892);border-radius:5px;',
'  background:#fdfaf2;cursor:crosshair;touch-action:none}',
'.v3-trk{border:1px solid rgba(160,132,80,.45);border-radius:6px;padding:7px 9px;margin:7px 0;',
'  background:rgba(255,255,255,.42)}',
'.v3-trk.playing{border-color:#a8802e;box-shadow:0 0 0 2px rgba(168,128,46,.16)}',
'.v3-trk-h{display:flex;align-items:center;gap:8px}',
'.v3-trk-n{flex:1 1 auto;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
].join('\n');
function injectModCSS() {
  if (document.getElementById('v3-mod-css-music')) return;
  const st = document.createElement('style');
  st.id = 'v3-mod-css-music';
  st.dataset.mod = 'music';
  st.textContent = MOD_CSS;
  (document.head || document.documentElement).appendChild(st);
}
function removeModCSS(force) {
  /* 设置卡片还在页面上就先留着（未装配时也能先改设置，卡片得有样式）；
     卡片被销毁时宿主会调用它登记的清理函数，那时 force=true 再收。 */
  if (!force && document.querySelector('.v3-card[data-id="music"]')) return;
  const st = document.getElementById('v3-mod-css-music');
  if (st && st.parentNode) st.parentNode.removeChild(st);
}

/* ==========================================================================
 *  我，地图和小女仆 · V3 —— 内置模块①：自定义背景音乐
 *  --------------------------------------------------------------------------
 *  需求对照：
 *   · 导入音频文件            → 文件选择 / 拖拽 → decodeAudioData
 *   · 自行截取其中一段作循环    → 波形 Canvas + 起止双滑块，循环点吸附过零点
 *   · 设置音量大小            → 每轨 GainNode + 总音量 MasterGain
 *   · 同时有多少音乐一起播放    → 「最多同时播放」设置项；超限时最老的轨道淡出
 *   · 额外的年代联动           → 每轨可标注年代区间，跨区间时等功率交叉淡化
 *
 *  技术选型：Web Audio API（不用 <audio>）。多轨混音 + 无缝循环是它的主场。
 *     AudioContext ─┬─ Track A: BufferSource → GainNode ─┐
 *                   ├─ Track B: BufferSource → GainNode ─┼→ MasterGain → 输出
 *                   └─ …                                 ┘
 * ========================================================================== */

const MusicModule = (function () {

  /* ---------- 运行时状态（不进设置存档，重新装模块即清空） ---------- */
  let AC = null;                    // AudioContext 单例
  let master = null;                // MasterGain
  let ctxRef = null;
  const buffers = new Map();        // trackId -> AudioBuffer
  const live = new Map();           // trackId -> { src, gain, bornAt }
  let uiRoot = null;                // 当前设置卡片容器（用于局部重绘）
  let selected = null;              // 正在编辑的轨道 id
  let previewing = null;            // 试听用的临时播放器
  let editorCleanup = null;         // 波形编辑器挂在 window 上的监听的解绑函数
  let modMounted = false;           // 是否处于装配状态（决定卡片销毁时要不要收走样式）
  /* 【修】所有 setTimeout 都登记在册，模块卸下时统一作废。
     否则「改循环段后 240ms 重启轨道」「加载完音频重绘面板」这类延迟任务
     会在模块已经卸下之后才执行 —— 卸下了还会响 / 还会去动已经不存在的面板。 */
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(function () {
      timers.delete(id);
      try { fn(); } catch (e) { console.warn('[音乐] 延迟任务异常', e); }
    }, ms);
    timers.add(id);
    return id;
  }
  function clearTimers() {
    timers.forEach(function (id) { clearTimeout(id); });
    timers.clear();
  }

  /* ---------- 波形编辑器的全局监听：重绘 / 卸下前必须先摘掉 ----------
     编辑器把 pointermove / pointerup 挂在 window 上（拖到画布外面也要跟手），
     而设置卡片每次重绘都会整块重建 —— 不摘就是「重绘一次多一套监听」，
     页面上会留下一堆只认旧画布的幽灵处理器。 */
  function teardownEditor() {
    if (!editorCleanup) return;
    try { editorCleanup(); } catch (e) { console.warn('[音乐] 波形编辑器解绑失败', e); }
    editorCleanup = null;
  }

  /* ---------- 音频上下文 ---------- */
  function ac() {
    if (!AC) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) { toast('这个浏览器不支持 Web Audio', 3000, 'err'); return null; }
      AC = new C();
      master = AC.createGain();
      master.gain.value = masterVolume();
      master.connect(AC.destination);
    }
    if (AC.state === 'suspended') AC.resume().catch(function () {});
    return AC;
  }
  function masterVolume() {
    const on = Settings.get('sound.enabled', true);
    const g = ctxRef ? Number(ctxRef.settings.get('volume', 0.7)) : 0.7;
    const m = Number(Settings.get('sound.master', 0.7));
    return on ? U.clamp(g, 0, 1) * U.clamp(m, 0, 1) : 0;
  }
  function refreshMaster() {
    if (master && AC) master.gain.setTargetAtTime(masterVolume(), AC.currentTime, 0.08);
  }

  /* ---------- 轨道元数据（存设置里） ---------- */
  function tracks() {
    const a = Settings.get('mod.music.tracks', []);
    return Array.isArray(a) ? a : [];
  }
  function saveTracks(a) { Settings.set('mod.music.tracks', a); }
  function track(id) { return tracks().filter(function (t) { return t.id === id; })[0] || null; }
  function patchTrack(id, patch) {
    const a = tracks();
    const i = a.findIndex(function (t) { return t.id === id; });
    if (i < 0) return;
    a[i] = Object.assign({}, a[i], patch);
    saveTracks(a);
  }

  /* ---------- 播放 ---------- */
  function startTrack(t, fade) {
    if (live.has(t.id)) return;
    const buf = buffers.get(t.id);
    if (!buf) return;
    const a = ac(); if (!a) return;
    /* 同时播放上限：超出时把最早起来的淡出 */
    const max = Math.max(1, Number(ctxRef.settings.get('maxTracks', 3)) || 3);
    while (live.size >= max) {
      let oldest = null;
      live.forEach(function (v, k) { if (!oldest || v.bornAt < oldest.bornAt) oldest = { id: k, bornAt: v.bornAt }; });
      if (!oldest) break;
      stopTrack(oldest.id, Math.max(0.3, fade || 0.6));
    }
    const g = a.createGain();
    g.gain.value = 0;
    g.connect(master);
    const s = a.createBufferSource();
    s.buffer = buf;
    const sr = buf.sampleRate;
    const st = U.clamp(t.loopStart | 0, 0, buf.length - 2);
    const en = U.clamp(t.loopEnd | 0, st + 64, buf.length);
    if (en - st > sr * 0.08) {
      s.loop = true;
      s.loopStart = st / sr;
      s.loopEnd = en / sr;
    }
    s.connect(g);
    const dur = (fade == null ? 0.35 : fade);
    try { s.start(0, st / sr); } catch (e) { console.warn('[音乐] 启动失败', e); return; }
    g.gain.setValueAtTime(0, a.currentTime);
    g.gain.linearRampToValueAtTime(U.clamp(Number(t.gain == null ? 0.8 : t.gain), 0, 1), a.currentTime + dur);
    live.set(t.id, { src: s, gain: g, bornAt: performance.now() });
    s.onended = function () { if (live.get(t.id) && live.get(t.id).src === s) live.delete(t.id); };
    renderPanel();
  }
  function stopTrack(id, fade) {
    const p = live.get(id);
    if (!p || !AC) return;
    live.delete(id);
    const f = Math.max(0.08, fade == null ? 0.5 : fade);
    try {
      p.gain.gain.cancelScheduledValues(AC.currentTime);
      p.gain.gain.setTargetAtTime(0, AC.currentTime, f / 3);
      p.src.stop(AC.currentTime + f + 0.08);
    } catch (e) {}
    renderPanel();
  }
  function stopAll() { Array.from(live.keys()).forEach(function (id) { stopTrack(id, 0.35); }); }
  function stopPreview() {
    if (!previewing) return;
    try {
      previewing.gain.gain.setTargetAtTime(0, AC.currentTime, 0.04);
      previewing.src.stop(AC.currentTime + 0.2);
    } catch (e) {}
    previewing = null;
  }
  function preview(t) {
    const buf = buffers.get(t.id);
    if (!buf) { toast('先把音频重新载入一次（文件没在本机缓存里）', 3200, 'err'); return; }
    stopPreview();
    const a = ac(); if (!a) return;
    const g = a.createGain(); g.gain.value = 0; g.connect(master);
    const s = a.createBufferSource();
    s.buffer = buf;
    const sr = buf.sampleRate;
    const st = U.clamp(t.loopStart | 0, 0, buf.length - 2);
    const en = U.clamp(t.loopEnd | 0, st + 64, buf.length);
    s.loop = false;
    s.connect(g);
    s.start(0, st / sr, (en - st) / sr);
    g.gain.linearRampToValueAtTime(U.clamp(Number(t.gain == null ? 0.8 : t.gain), 0, 1) * 0.9, a.currentTime + 0.12);
    previewing = { src: s, gain: g };
    later(function () { if (previewing && previewing.src === s) previewing = null; }, ((en - st) / sr) * 1000 + 400);
  }

  /* ---------- 波形：峰值 + 过零点吸附 ---------- */
  function peaks(buf, n) {
    const ch = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(ch.length / n));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = 0;
      const a = i * step, b = Math.min(ch.length, a + step);
      for (let j = a; j < b; j += 3) { const v = ch[j] < 0 ? -ch[j] : ch[j]; if (v > m) m = v; }
      out[i] = m;
    }
    return out;
  }
  function snapZero(buf, idx) {
    /* 循环点落在过零点附近才不会「咔哒」一声 */
    const ch = buf.getChannelData(0);
    const span = Math.min(600, Math.floor(buf.sampleRate * 0.012));
    let best = idx, bestV = Infinity;
    const a = Math.max(0, idx - span), b = Math.min(ch.length - 1, idx + span);
    for (let i = a; i <= b; i++) {
      const v = Math.abs(ch[i]);
      if (v < bestV) { bestV = v; best = i; }
    }
    return best;
  }

  /* ---------- 载入文件 ---------- */
  async function addFile(file) {
    if (!file) return null;
    if (!/^audio\//.test(file.type) && !/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(file.name)) {
      toast('这不是音频文件：' + file.name, 3000, 'err'); return null;
    }
    const a = ac(); if (!a) return null;
    toast('正在解码 ' + file.name + ' …', 2000);
    let ab;
    try { ab = await file.arrayBuffer(); }
    catch (e) { toast('读文件失败：' + e.message, 3200, 'err'); return null; }
    let buf;
    try { buf = await a.decodeAudioData(ab.slice(0)); }
    catch (e) { toast('解码失败（浏览器不认这个编码）：' + file.name, 3600, 'err'); return null; }
    const id = 'trk' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    buffers.set(id, buf);
    try { await U.idb.put('m:' + id, ab.slice(0)); } catch (e) { console.warn('[音乐] 音频落库失败', e); }
    const t = {
      id: id, name: file.name.replace(/\.[^.]+$/, ''), bytes: ab.byteLength,
      dur: buf.duration, gain: 0.8, loopStart: 0, loopEnd: buf.length,
      era: [null, null], on: false
    };
    const arr = tracks(); arr.push(t); saveTracks(arr);
    selected = id;
    toast('已加入曲库：' + t.name + '（' + fmtTime(buf.duration) + '）', 2600, 'ok');
    renderPanel();
    return t;
  }
  async function reloadBuffers() {
    const ts = tracks();
    for (let i = 0; i < ts.length; i++) {
      if (buffers.has(ts[i].id)) continue;
      try {
        const ab = await U.idb.get('m:' + ts[i].id);
        if (ab && AC) {
          const buf = await AC.decodeAudioData(ab.slice ? ab.slice(0) : ab);
          buffers.set(ts[i].id, buf);
        }
      } catch (e) { console.warn('[音乐] 恢复音频失败 ' + ts[i].id, e); }
    }
  }
  function removeTrack(id) {
    stopTrack(id, 0.2);
    const arr = tracks().filter(function (t) { return t.id !== id; });
    saveTracks(arr);
    buffers.delete(id);
    U.idb.del('m:' + id).catch(function () {});
    if (selected === id) selected = null;
    renderPanel();
  }
  function fmtTime(s) {
    s = Math.max(0, s || 0);
    const m = Math.floor(s / 60), r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
  }

  /* ---------- 图形界面（画在模块的设置卡片里） ---------- */
  function panelHost() { return uiRoot; }
  function renderPanel() {
    teardownEditor();                 // 先摘掉上一次编辑器挂的全局监听，再重建
    const host = panelHost();
    if (!host || !host.isConnected) return;
    const scrollTop = (function () {
      const sc = host.closest ? host.closest('.v3-body') : null;
      return sc ? sc.scrollTop : 0;
    })();
    host.innerHTML = '';
    buildPanel(host);
    const sc = host.closest ? host.closest('.v3-body') : null;
    if (sc) sc.scrollTop = scrollTop;
  }

  function buildPanel(host) {
    const ts = tracks();

    /* 导入区 */
    const drop = U.el('div', 'v3-drop', '把音频文件拖到这里 · 或点一下选择文件<br>'
      + '<span style="font-size:10px">mp3 / wav / ogg / m4a / flac，全部离线解码，不上传</span>');
    drop.addEventListener('click', pickFile);
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('hot'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('hot'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('hot');
      const fs = e.dataTransfer && e.dataTransfer.files;
      if (fs) for (let i = 0; i < fs.length; i++) addFile(fs[i]);
    });
    host.appendChild(drop);

    const bar = U.el('div');
    bar.style.cssText = 'display:flex;gap:8px;margin:8px 0 2px;flex-wrap:wrap';
    const bStop = U.el('button', 'v3-btn', '全部停止');
    bStop.onclick = function () { stopAll(); };
    const bRestore = U.el('button', 'v3-btn', '重新载入本地缓存音频');
    bRestore.onclick = function () { reloadBuffers().then(function () { toast('已重新载入', 1600, 'ok'); renderPanel(); }); };
    bar.appendChild(bStop); bar.appendChild(bRestore);
    host.appendChild(bar);

    if (!ts.length) {
      host.appendChild(U.el('div', 'v3-note', '曲库是空的。导入一首试试 —— 载入后可以拖波形上的两个滑块截取要循环的那一段。'));
      return;
    }

    /* 曲目列表 */
    ts.forEach(function (t) {
      const isOn = live.has(t.id);
      const card = U.el('div', 'v3-trk' + (isOn ? ' playing' : ''));
      const h = U.el('div', 'v3-trk-h');
      h.appendChild(U.el('span', 'v3-mini', isOn ? '❚❚' : '▶')).addEventListener('click', function () {
        if (live.has(t.id)) stopTrack(t.id); else startTrack(t);
      });
      const nm = U.el('div', 'v3-trk-n');
      nm.innerHTML = '<b>' + U.esc(t.name) + '</b> <span style="color:#8a7a5e;font-size:10.5px">'
        + (buffers.has(t.id) ? '' : '（音频缓存已过期，点上面「重新载入」）') + '</span>';
      nm.style.cursor = 'pointer';
      nm.onclick = function () { selected = (selected === t.id ? null : t.id); renderPanel(); };
      h.appendChild(nm);
      const bP = U.el('button', 'v3-mini', '♪'); bP.title = '试听截取片段';
      bP.onclick = function () { preview(t); };
      const bD = U.el('button', 'v3-mini', '✕'); bD.title = '删除';
      bD.onclick = function () { removeTrack(t.id); };
      h.appendChild(bP); h.appendChild(bD);
      card.appendChild(h);

      /* 每轨音量 */
      const vr = U.el('div', 'v3-row');
      vr.appendChild(U.el('div', 'v3-lb', '<b>本轨音量</b><i>截取片段 ' + fmtTime((t.loopEnd - t.loopStart) / (buffers.get(t.id) ? buffers.get(t.id).sampleRate : 44100))
        + ' / 全长 ' + fmtTime(t.dur) + '</i>'));
      const vc = U.el('div', 'v3-ctl');
      const vrng = U.el('input'); vrng.type = 'range'; vrng.min = 0; vrng.max = 1; vrng.step = 0.02; vrng.value = t.gain;
      const vval = U.el('span', 'v3-val', Number(t.gain).toFixed(2));
      vrng.oninput = function () {
        patchTrack(t.id, { gain: parseFloat(vrng.value) });
        vval.textContent = Number(vrng.value).toFixed(2);
        const p = live.get(t.id);
        if (p && AC) p.gain.gain.setTargetAtTime(U.clamp(parseFloat(vrng.value), 0, 1), AC.currentTime, 0.06);
      };
      vc.appendChild(vrng); vc.appendChild(vval);
      vr.appendChild(vc);
      card.appendChild(vr);

      /* 年代区间 */
      const er = U.el('div', 'v3-row');
      er.appendChild(U.el('div', 'v3-lb', '<b>年代区间</b><i>留空 = 常驻播放；填了就在跨进这个区间时自动淡入</i>'));
      const ec = U.el('div', 'v3-ctl');
      const i1 = U.el('input'); i1.type = 'number'; i1.placeholder = '起'; i1.style.width = '64px';
      i1.value = (t.era && t.era[0] != null) ? t.era[0] : '';
      const i2 = U.el('input'); i2.type = 'number'; i2.placeholder = '止'; i2.style.width = '64px';
      i2.value = (t.era && t.era[1] != null) ? t.era[1] : '';
      function commitEra() {
        const a = i1.value === '' ? null : parseInt(i1.value, 10);
        const b = i2.value === '' ? null : parseInt(i2.value, 10);
        patchTrack(t.id, { era: [isNaN(a) ? null : a, isNaN(b) ? null : b] });
      }
      i1.onchange = commitEra; i2.onchange = commitEra;
      ec.appendChild(i1); ec.appendChild(U.el('span', 'v3-val', '~')); ec.appendChild(i2);
      er.appendChild(ec);
      card.appendChild(er);

      /* 展开：波形编辑器 */
      if (selected === t.id) {
        const buf = buffers.get(t.id);
        if (buf) card.appendChild(waveEditor(t, buf));
        else card.appendChild(U.el('div', 'v3-note', '音频不在内存里 —— 点上面「重新载入本地缓存音频」后即可编辑波形。'));
      }
      host.appendChild(card);
    });
  }

  function waveEditor(t, buf) {
    const wrap = U.el('div');
    wrap.style.marginTop = '8px';
    const cv = U.el('canvas', 'v3-wave');
    cv.width = 760; cv.height = 156;
    wrap.appendChild(cv);
    const info = U.el('div', 'v3-kv');
    wrap.appendChild(info);
    const tip = U.el('div', 'v3-note', '拖动波形上的两个圆点选择循环片段（松手时自动吸附到最近的过零点，循环接缝不会有咔哒声）。');
    wrap.appendChild(tip);

    const N = 380;
    const pk = peaks(buf, N);
    let s0 = U.clamp(t.loopStart | 0, 0, buf.length);
    let s1 = U.clamp(t.loopEnd | 0, 1, buf.length);
    /* 【修】以前这里是 `let drag = 0;` —— 0 既表示「正在拖起点手柄」又表示「没在拖」，
       于是 ①鼠标只是滑过页面也会被当成拖起点（选区乱跳）；
       ②松手时 up() 的 `if (!drag) return` 直接把起点手柄的改动丢掉，永远存不下来。
       现在用 null 明确表示「没在拖」。 */
    let drag = null;

    function redraw() {
      const g = cv.getContext('2d');
      const W = cv.width, H = cv.height, mid = H * 0.5;
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#fdfaf2'; g.fillRect(0, 0, W, H);
      /* 选中区域底色 */
      const x0 = (s0 / buf.length) * W, x1 = (s1 / buf.length) * W;
      g.fillStyle = 'rgba(168,128,46,.16)';
      g.fillRect(x0, 0, Math.max(1, x1 - x0), H);
      /* 波形 */
      g.fillStyle = '#8a6a2e';
      for (let i = 0; i < N; i++) {
        const x = (i / N) * W;
        const h = Math.max(1, pk[i] * H * 0.46);
        g.fillRect(x, mid - h, W / N - 0.5, h * 2);
      }
      /* 中线 */
      g.strokeStyle = 'rgba(120,96,56,.35)'; g.beginPath(); g.moveTo(0, mid); g.lineTo(W, mid); g.stroke();
      /* 把手 */
      [[x0, '#2f6f4f'], [x1, '#a33224']].forEach(function (p) {
        g.fillStyle = p[1];
        g.beginPath(); g.arc(p[0], mid, 7, 0, 6.2832); g.fill();
        g.strokeStyle = '#fffdf6'; g.lineWidth = 2; g.stroke();
      });
      info.innerHTML = '<span>截取区间</span><b>' + fmtTime(s0 / buf.sampleRate) + ' → ' + fmtTime(s1 / buf.sampleRate)
        + '（' + fmtTime((s1 - s0) / buf.sampleRate) + '）</b>';
    }
    /* 【修】画布还没布局出来时（卡片没展开 / 折叠组收着），getBoundingClientRect 宽度是 0，
       以前会算出 NaN 并原样写进设置（存档里出现 null 的 loopEnd）。
       现在这种情况直接当作「这次交互不算」。 */
    function pos(e) {
      const r = cv.getBoundingClientRect();
      if (!r.width) return null;
      const x = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width * buf.length;
      const i = Math.round(x);
      if (!isFinite(i)) return null;
      return U.clamp(i, 0, buf.length);
    }
    function pick(e) {
      const p = pos(e);
      if (p === null) return;
      drag = Math.abs(p - s0) <= Math.abs(p - s1) ? 0 : 1;
      /* 按住之后把指针「扣」在画布上：拖到窗口外面也不会丢 pointerup */
      try { if (e.pointerId != null && cv.setPointerCapture) cv.setPointerCapture(e.pointerId); } catch (err) {}
      move(e);
    }
    function move(e) {
      if (drag === null) return;                 // 没按下：鼠标滑过页面不该动选区
      if (e.buttons === 0) { up(e); return; }    // 已经在窗口外松了手：按松手处理
      const p = pos(e);
      if (p === null) return;
      e.preventDefault();
      if (drag === 0) s0 = Math.min(p, s1 - 64);
      else s1 = Math.max(p, s0 + 64);
      redraw();
    }
    function up(e) {
      if (drag === null) return;
      drag = null;
      s0 = snapZero(buf, s0); s1 = snapZero(buf, s1);
      if (!isFinite(s0) || !isFinite(s1)) { redraw(); return; }   // 兜底：绝不把 NaN 写进设置
      if (s1 <= s0) s1 = Math.min(buf.length, s0 + buf.sampleRate * 0.5);
      patchTrack(t.id, { loopStart: s0, loopEnd: s1 });
      redraw();
      /* 正在播的轨道实时套用新循环段 */
      if (live.has(t.id)) { stopTrack(t.id, 0.2); later(function () { startTrack(track(t.id)); }, 240); }
    }
    function detach() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    }
    cv.addEventListener('pointerdown', pick);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    redraw();
    /* 容器销毁后移除全局监听，避免泄漏：自己记账（teardownEditor），
       同时按宿主约定登记 __v3cleanup（新版宿主会在重绘/卸下前调用它） */
    editorCleanup = detach;
    wrap.__v3cleanup = detach;
    return wrap;
  }

  function pickFile() {
    const f = U.el('input');
    f.type = 'file'; f.accept = 'audio/*'; f.multiple = true;
    f.onchange = function () {
      const fs = f.files; if (!fs) return;
      let i = 0;
      (function next() {
        if (i >= fs.length) return;
        addFile(fs[i++]).then(next, next);
      })();
    };
    f.click();
  }

  /* ---------- 年代联动：等功率交叉淡化 ---------- */
  function inEra(t, y) {
    if (!t.era) return null;
    const a = t.era[0], b = t.era[1];
    if (a == null && b == null) return null;      // 未标注 → 常驻
    if (a != null && y < a) return false;
    if (b != null && y > b) return false;
    return true;
  }
  function onYear(e) {
    if (!ctxRef.settings.get('eraAuto', true)) return;
    if (!ctxRef.settings.get('enabled', true)) return;
    const y = e && e.year;
    if (y == null) return;
    const xf = Math.max(0.4, Number(ctxRef.settings.get('xfade', 2.5)) || 2.5);
    tracks().forEach(function (t) {
      const r = inEra(t, y);
      if (r === null) return;                     // 常驻轨：交给「启用」开关管
      if (r && !live.has(t.id)) { startTrack(t, xf); toast('♪ 换曲：' + t.name, 1800); }
      else if (!r && live.has(t.id)) stopTrack(t.id, xf);
    });
  }

  return {
    id: 'music',
    name: '自定义背景音乐',
    icon: '♪',
    version: '1.0.0',
    author: '内置',
    description: '导入音频 → 截取片段 → 多轨混音循环；可按年代自动交叉淡化，拖进唐朝自动换古琴曲。',

    settingsSchema: [
      { type: 'group', label: '开关与总控' },
      /* 注意：default 只决定「设置面板上的初值显示」—— 用户没动过时 get() 返回 undefined，
         所以这里写的默认值必须与代码里的兜底（masterVolume / startTrack / onYear）一致，
         否则面板会显示成关、滑块会停在中点，跟实际行为对不上。 */
      { type: 'toggle', key: 'enabled', label: '启用背景音乐', default: true, hint: '关掉会淡出所有轨道' },
      { type: 'slider', key: 'volume', label: '音乐总音量', min: 0, max: 1, step: 0.02, default: 0.7,
        hint: '还会再乘上「设置 › 声音 › 总音量」' },
      { type: 'number', key: 'maxTracks', label: '最多同时播放', unit: '轨', min: 1, max: 8, step: 1, default: 3,
        hint: '超过上限时，最早起来的那一轨淡出' },
      { type: 'group', label: '年代联动' },
      { type: 'toggle', key: 'eraAuto', label: '随年代自动切换', default: true,
        hint: '给轨道标注年代区间后，跨区间时自动交叉淡化' },
      { type: 'slider', key: 'xfade', label: '交叉淡化时长', min: 0.5, max: 6, step: 0.1, unit: 's', default: 2.5 },
      { type: 'group', label: '曲库' },
      { type: 'custom', key: '__panel', render: function (host) {
        injectModCSS();                       /* 卡片在页面上，就得有这套样式（未装配时也一样） */
        uiRoot = host; buildPanel(host);
        return function () { if (!modMounted) removeModCSS(true); };   /* 卡片销毁且模块没装 → 收走样式 */
      } }
    ],

    init(ctx) {
      ctxRef = ctx;
      modMounted = true;
      injectModCSS();
      refreshMaster();
      /* 首次用户手势解锁 AudioContext（浏览器策略） */
      const unlock = function () { try { ac(); } catch (e) {} };
      document.addEventListener('pointerdown', unlock, true);
      document.addEventListener('keydown', unlock, true);

      /* 设置变化 → 实时生效 */
      const offVol = ctx.settings.onChange('volume', refreshMaster);
      const offMax = ctx.settings.onChange('maxTracks', function () {
        const max = Math.max(1, Number(ctx.settings.get('maxTracks', 3)) || 3);
        while (live.size > max) {
          let oldest = null;
          live.forEach(function (v, k) { if (!oldest || v.bornAt < oldest.bornAt) oldest = { id: k, bornAt: v.bornAt }; });
          if (!oldest) break;
          stopTrack(oldest.id, 0.6);
        }
      });
      const offOn = ctx.settings.onChange('enabled', function (v) {
        if (!v) stopAll(); else refreshMaster();
      });
      const offG = Settings.onChange('sound.master', refreshMaster);
      const offS = Settings.onChange('sound.enabled', function () {
        refreshMaster();
        if (!Settings.get('sound.enabled', true)) stopAll();
      });

      /* 事件订阅：年代联动 */
      const offYear = ctx.events.on(EV.YEAR, onYear);

      /* 音频缓存恢复（IndexedDB 里可能还有上次导入的文件） */
      ac();
      later(function () { reloadBuffers().then(function () { renderPanel(); }); }, 300);

      return function dispose() {
        modMounted = false;
        offVol(); offMax(); offOn(); offG(); offS(); offYear();
        document.removeEventListener('pointerdown', unlock, true);
        document.removeEventListener('keydown', unlock, true);
        clearTimers(); teardownEditor();
        stopAll(); stopPreview();
        uiRoot = null;
      };
    },

    update() { /* 音频由 Web Audio 自己在音频线程里跑，这里不需要每帧做事 */ },

    dispose() {
      clearTimers();
      try { teardownEditor(); } catch (e) {}
      try { stopAll(); } catch (e) {}
      removeModCSS();
      if (AC) { try { AC.close(); } catch (e) {} AC = null; master = null; }
      buffers.clear(); live.clear();
    },

    /* 给外部（自动化测试 / 别的模块）看的状态 */
    _debug: function () {
      return {
        ctxState: AC ? AC.state : 'none', master: masterVolume(),
        tracks: tracks().length, playing: Array.from(live.keys())
      };
    }
  };
})();

export default MusicModule;
