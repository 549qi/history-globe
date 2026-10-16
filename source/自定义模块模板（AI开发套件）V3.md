# 《我，地图和小女仆》自定义功能模块 · AI 开发套件（V3）

> **这份文件是给 AI 看的施工图。** 把整个文件丢给 AI，再说一句你想做什么模块
> （例如"做一个显示当前年代的星图角标"），AI 就能按下面的契约写出**能直接拖进程序装配**的模块文件。
> 程序里的两个内置模块——`背景音乐模块.js`（入门范例）与`女仆模块.js`（高级参考）——就是按这套契约写的现成样本。
>
> **V3 说明**：本版随《我，地图和小女仆》（KiMi3 改版）发布。新增**第九节「界面风格与
> 文案规范」**——风格 token、文案语气、使用者称呼（`ctx.user()`）三件事自此有了成文标准；
> 第八节的 UI 层级表补上了扉页与公约两层。程序名统一为《我，地图和小女仆》，
> 旧版模板写出的模块与本版**完全等效**，可直接互相装配。

---

## 〇、三十秒速览（给 AI 的第一句话）

你将要产出一个 **ES 模块源码文件**（`.js`）。它的最后一行是 `export default { ... }`。
使用者把它拖进程序「设置 › 功能模块 ➕ 装配区」，程序会把它当一段普通源码装配起来——
和程序自带的两个内置模块走**完全同一条装配线**。写完后请对照文末「验收清单」逐条自测。

> 模块与宿主的全部接触面只有三处，记住这三处就抓住了全局：
> ① 文件顶部的 `globalThis.__V3HOST`（拿宿主运行时）；
> ② `init(ctx)` 收到的 `ctx`（框架注入的模块专属上下文）；
> ③ 可选的裸全局 `V3`（宿主内核对象，`V3.UI` 即设置面板句柄）。
> 它们的来龙去脉见第八节。

---

## 一、模块契约（硬性，缺一不可）

| 项 | 要求 |
|---|---|
| 交付形状 | 一个 `.js` 文件（或一段可粘贴的源码），最后一行 `export default { ... }` |
| `id` | `/^[a-z0-9][a-z0-9._-]*$/`，全站唯一；**不得与 `music`、`pet` 重名**（这两个是内置模块） |
| `name` | 面板显示名（中文即可） |
| `icon` | 一个字符的图标（emoji 或字符）；也可以是 `data:image/...`（会用 `<img>` 渲染） |
| `version` / `author` / `description` | 可选，显示在模块卡片上（缺省 `1.0.0` / 空 / 空，见 8.3 的 `normalize()`） |
| `minHost` / `maxHost` | 可选，整数，声明适配的宿主版本（当前宿主 V3）。装配时先对八字：宿主版本 < `minHost` → 谢绝装配并提示升级；> `maxHost` → 照样装配但先提醒一句。代码里也可用 `ctx.hostVersion` 自查 |
| `settingsSchema` | 设置项声明数组（见第四节），设置面板**自动生成**，不用写 HTML。写了 `default` 只影响**面板上的初值显示**，代码里仍要自己兜底（第四节有坑位说明） |
| `init(ctx)` | 装配时调用一次；**必须返回一个清理函数**（卸下时框架调用它）。init 抛错 = 装配失败，框架会提示原因并把现场收拾干净（包括你还没来得及用的空容器，见 8.3 `mount()` 的兜底） |
| `update(dt, ctx, t)` | 每帧调用（`dt` 秒，约 60fps，`dt` 被钳制在 ≤0.06）；**页面切到后台时自动暂停**；不需要动画就整个删掉 |
| `dispose(ctx)` | 卸下时调用（与 init 返回的清理函数二选一即可，都写也行）。调用顺序：先 init 返回的清理函数，再 `dispose(ctx)` |
| 清理义务 | 卸载时**必须**：解绑你加的所有监听器、移除你创建的所有 DOM、关掉你开的定时器/连接。**排队中还没执行的 `setTimeout` 也要作废**（第六节骨架里有现成写法）|

> 框架还会**原样保留**你导出对象上的 `_debug` / `_set` / `_v33` 三个函数字段
> （见 8.3 `normalize()`）：它们是留给验收脚本的调试探针，普通模块不用写，
> 但写模块时**不要**用这三个名字干别的事。

## 二、ctx API 参考（框架注入，只此一条正路）

```js
init(ctx) {
  ctx.id                 // 你的模块 id
  ctx.name               // 你的模块名
  ctx.layer              // ★ 只有你能用的全屏透明 div（class="v3-modui"，data-mod=你的id，
                         //   position:fixed; inset:0; pointer-events:none，要交互自己开）。DOM 只准画在这里
                         //   ⚠ 它的 z-index 只有 23：势力侧栏(25)、年代条(30)、关系网面板(70) 都会盖住它。
                         //     要做「永远露在最上面」的常驻 HUD，只能走第五节红线的例外条款（自建容器挂 body）。
                         //     完整层级表见 8.7
  ctx.settings.get(k, d) // 读本模块设置（自动加 mod.<id>. 前缀，与其它模块完全隔离）；用户没动过时返回 d（不传就是 undefined）
  ctx.settings.set(k, v) // 写本模块设置（自动持久化到 localStorage）
  ctx.settings.onChange(k, fn) // 订阅设置变化 → fn(新值, 旧值)；返回解绑函数
  ctx.settings.all()           // ⚠ 返回的是**整份**设置（含全局与其它模块的），几乎用不到，别拿它读自己的项
  ctx.events.on(name, fn)      // 订阅事件 → 返回解绑函数（这是全站共享的同一根总线，见 8.1）
  ctx.events.once(name, fn)    // 同上，触发一次自动解绑
  ctx.events.off(name, fn)     // 也可以自己解绑（与 on() 返回的解绑函数等价）
  ctx.app.getYear()            // 当前年份（-3000000 ~ 1826）
  ctx.app.setYear(y)           // 跳到某年（内部是驱动主程序的时间轴滑块，见 8.6）
  ctx.app.getEra()             // 当前时代名
  ctx.app.eras()               // 全部时代表（可能返回 null，注意判空）
  ctx.app.activeAt(y)          // 某年在场的势力列表（⚠ 公元 50 年以前返回的是「史前分组名」，见 8.6 注释）
  ctx.app.polities()           // 完整势力库（带 start/end）
  ctx.app.person(name)         // 查人物档案
  ctx.app.people()             // 全部人物
  ctx.app.openPolity(name)     // 打开某势力的详情侧栏
  ctx.app.goto(lon, lat, dist) // 相机飞到某经纬度
  ctx.data.myths() / relations() / concepts() / deep() / events()  // 文本库（== ctx.app.data，见 8.4）
  ctx.toast(msg)               // 顶部提示条（第二、三个参数可传 ms 与 'ok'/'err'）
  ctx.user()                   // 使用者签署的称呼（签署公约时落款的名字；未签署返回 '旅人'）。
                               //   称呼变更会触发 setting 事件（key 为 'user.name'），见 9.3
  ctx.log(...)                 // 带模块前缀的控制台日志（前缀形如 [模块·你的id]）
  ctx.store                    // IndexedDB 封装：get/put/del（还有 keys/clear；放音频、图片等大对象）。
                               //   这就是 __V3HOST.U.idb，全站共用一个库，见 8.5
  ctx.stage(w, h)              // 便捷方法：开一块固定定位画布，**已经帮你挂进 ctx.layer**（对已挂好的再 append 也安全）
}
```

### 事件总线（`ctx.events.on` 可用的名字）

| 事件 | 载荷 | 时机 |
|---|---|---|
| `apploaded` | `{}` | 应用就绪 |
| `yearchange` | `{year, prev}` | 年份落位（拖时间轴、跨越过场结束） |
| `polityview` | `{name, en}` | 查看了某势力 |
| `personview` | `{name, rec}` | 查看了某人物（rec 含 polity/era/role/tags/birth/death/en —— **没有** `life`） |
| `jumpstart` / `jumpend` | `{from, to}` | 「跨越时间」过场首尾 |
| `setting` | `{key, value, old}` | 任意设置变更（key 含全局与各模块的） |
| `module:register` / `module:mount` / `module:unmount` | 模块 id | 模块注册 / 装配 / 卸下（别的模块也会触发；比一下 id 是不是自己就行） |

> 这些事件名也是 `__V3HOST.EV` 常量的值（`EV.YEAR === 'yearchange'` …），用常量或写死字符串等价。
> 事件的实际产生位置是宿主桥接层 `__V3BRIDGE`（主程序每做一件事就翻译成一个事件），见 8.6。

## 三、进阶通道：宿主运行时 `__V3HOST`

模块要拿**跨模块的全局总控**（如声音开关）或主程序 UI 时，用这条**显式声明**的通道
（这不违反"不准留裸全局变量"的红线——`__V3HOST` 是宿主主动挂出的公开接口）：

```js
const H = globalThis.__V3HOST;   // 宿主装配任何模块前已挂好
H.U        // DOM/存储/数值小工具：U.el(tag, cls, html) / U.esc / U.clamp / U.lerp / U.rand / U.randInt
           //   / U.pick / U.Bag（无放回抽取袋）/ U.fmtYear / U.debounce / U.now / U.idb
H.Settings // 全局设置：get('sound.enabled') / onChange(...)（只用于全局总控；自己的设置一律走 ctx.settings）
H.toast    H.Events    H.EV      // 提示条 / 事件总线 / 事件名常量
H.APP      // 与 ctx.app 相同
H.UI       // 设置面板：UI.open(tab) / UI.close() / UI.toggle(tab) / UI.showModule(id)
           //   / UI.render() / UI.renderKeepScroll() / UI.isOpen()
           //   / UI.expandAll() / UI.collapseAll() / UI.toast / UI.curTab
H.Modules  // 模块管理器：get/list/has/mount/unmount/toggle/isMounted/mountedIds
           //   / importFromCode / removeImported / restoreImported / stats
```

> **裸全局 `V3`（宿主内核对象）**：宿主启动时执行 `const V3 = (globalThis.V3 = globalThis.V3 || {})`，
> 随后把内核部件逐个挂上：`V3.U` / `V3.toast` / `V3.app` / `V3.Modules` / `V3.UI` / `V3.renderSchema` …
> 女仆模块里 `V3.UI.renderKeepScroll()` 用的就是它。它与 `__V3HOST` 的关系：`__V3HOST` 是
> **专门给模块的、一次成型的公开接口**；`V3` 是宿主自己也在用的内核对象。**模块代码里优先用
> `__V3HOST` 与 `ctx`**；`V3` 可用但要用「先判存在再用」的防御写法（`if (V3.UI && V3.UI.render) ...`），
> 因为严格说它属于宿主内部。

> 调试通道：`globalThis.__V3` 是宿主的总口（`__V3.Modules.stats()` / `__V3.UI` / `__V3.set(k,v)` …），
> 只在控制台里用，**别在模块代码里依赖它**（它不是契约的一部分）。

> 模块若不在宿主中运行（比如被单独 import），请像两个内置模块那样在文件开头检查
> `globalThis.__V3HOST` 并抛出友好错误提示「请在宿主程序中装配」。

## 四、settingsSchema 类型速查

```js
{ type: 'group',  label: '分组标题' },                                        // 折叠组
{ type: 'toggle', key: 'on',   label: '开关', default: true,  hint: '说明' },
{ type: 'slider', key: 'n',    label: '滑杆', min: 0, max: 1, step: 0.05, default: 0.5, unit: 'x' },
{ type: 'number', key: 'age',  label: '数字', min: 1, max: 100, step: 1, default: 18, unit: '年' },
{ type: 'select', key: 'mode', label: '下拉', default: 'a',
  options: [{ value: 'a', label: '甲' }, { value: 'b', label: '乙' }] },
{ type: 'text',   key: 'txt',  label: '文本', placeholder: '…', maxlength: 40 },
{ type: 'color',  key: 'tint', label: '取色', default: '#a8802e' },
{ type: 'button', key: 'do',   text: '执行', kind: 'pri', action: (io, host) => {} },  // kind: pri | dgr
{ type: 'info',   text: '纯说明文字（支持 <b>HTML</b>）' },
{ type: 'custom', key: '__x',  render: (host, io) => { /* 自己画；返回值若是函数，宿主会在重绘/卸下前调用它 */ } }
```

> **⚠ `default` 的语义（最容易踩的坑）**：`default` 只决定**面板上控件的初值显示**。
> 用户还没动过这项设置时，`ctx.settings.get(k)` 返回的是 `undefined`，**不会**返回 `default`。
> 所以代码里必须自己兜底，而且兜底值要和 `default` 写成一致：
>
> ```js
> const on = ctx.settings.get('on') !== false;        // 默认开
> const n  = Number(ctx.settings.get('n') ?? 0.5);    // 默认 0.5
> const mode = ctx.settings.get('mode') || 'a';       // 默认 'a'
> ```
>
> 只写 `if (ctx.settings.get('on'))` 会把「默认开」当成关；反过来，**忘了写 `default`** 则是面板
> 显示成关、滑块停在中点、数值框空着 —— 与代码实际行为对不上（背景音乐模块早期就是这个毛病）。

> **`custom` 的清理契约**：`render(host, io)` 的返回值如果是函数，宿主会在
> 「面板重绘前 / 模块卸下前」调用它。你在自定义面板里挂的 **window/document 监听**、定时器、
> ResizeObserver 等等，都要在这里解绑 —— 设置卡片会被反复重绘，不解绑就会越积越多
> （背景音乐模块的波形编辑器就是这么漏的：每重绘一次多一套 pointermove/pointerup）。

> **⚠ 卡片在「未装配」时也会渲染**：设置面板里的模块卡片是跟着**注册**走的，不是跟着装配走的。
> 也就是说：用户把模块拖进来、还没打开开关，你的 `settingsSchema`（含 custom render）就已经
> 在跑了，`init(ctx)` 却还没被调用。所以：
> - custom render 里**不能假设** init 已经执行过（模块作用域变量还是初始值）；
> - 需要卡片期就有样式时，学女仆模块的做法：在 custom render 里注入 `<style>`，
>   并在「卡片销毁且模块没装」时才移除（`removeModCSS(force)` 模式，见 8.8 旁的注解）。

## 五、编写红线（违反会被验收打回）

1. **DOM 边界**：你的界面只准画在 `ctx.layer` 里（或设置卡片的 custom render 里）；不准碰别人的 DOM。
   **唯一例外**（常驻 HUD 类模块）：如果你做的是桌宠、悬浮球这类「永远贴在屏幕角落」的界面，
   可以在 `init` 里自建 `position:fixed` 容器挂到 `document.body`（`女仆模块.js` 就是这么做的）——
   但**每一个**挂上去的节点都必须登记，并在清理函数里**逐个移除**，验收时「卸下后无残留」会严查这一点。
2. **CSS 命名空间**：样式一律注入 `<style data-mod="<你的id>">`，并在清理函数里移除。选择器两种合法写法：
   ① 带 `[data-mod="<你的id>"]` 前缀（`ctx.layer` 自带这个属性，画在它里面的 DOM 直接适用）；
   ② 用你自己独有的 id / 类名前缀（设置卡片里的 DOM 不在 layer 里，只能走这条，例如 `#v3Pet`、`.v3-trk`）。
   **不要重定义宿主已有的类名**（`.v3-btn` / `.v3-row` / `.v3-note` / `.v3-card` …）—— 那是全站共用的基座样式。
   宿主提供的可复用类名与 CSS 变量清单见 8.7。
3. **不准留裸全局变量、不准给宿主对象打补丁**：不要 `window.xxx = ...`，也不要 `U.xxx = ...` / `Settings.xxx = ...` 这类「顺手给宿主工具对象加方法」的写法——你改了宿主，别的模块就会依赖你的副作用，卸下你就连累别人。需要跨函数共享的放进模块文件的模块作用域。
   （读宿主挂出的 `V3` / `__V3HOST` / `__V3DATA` 不算违规——那是公开接口；**写**它们才是。）
4. **不准** `document.write`、改 `location`、注入 `<script>` 标签。
5. **设置项一律用 settingsSchema 声明**——设置面板自动生成、自动持久化、自动隔离，别自己造设置界面。
6. **init 返回清理函数**，清理要彻底（监听器、定时器、DOM、IndexedDB 连接）。
7. 自己 init 里的操作请自行 try/catch；抛错会被框架自动停用该模块（保护其它模块）。`update()` 里抛错同样会被停用并**连同界面一起卸干净**（`module.strict` 默认开，见 8.3 `fail()`），所以别把「必须留着」的状态只放在 update 里。
8. **全局监听与延迟任务**：`window`/`document` 上的监听必须成对解绑 —— 而且**每次重绘自定义面板前也要解绑**，只在卸下时解一次是不够的。排着队的 `setTimeout` 要用「代际号」作废，否则模块卸下后它还会触发（突然说话、放声音、开窗口）：
   ```js
   let gen = 0;                                   // init 里 gen++；清理函数里再 gen++
   function later(fn, ms) { const g = gen; return setTimeout(() => { if (g === gen) fn(); }, ms); }
   ```
9. **大素材别塞进 settingsSchema**：模块**源码**本身多大都行 —— 超过 256KB 会自动改存 IndexedDB，照样「下次打开自动恢复」（机制见 8.5）；
   但**设置项**存在 localStorage（整站约 5MB），别把 base64 图片/音频写进设置项里，那会把整站设置撑爆。
   要放素材请用 `ctx.store`（IndexedDB：`get/put/del`）。

## 六、标准骨架（复制即用）

```js
/* 模块装载的第一行：接入宿主运行时（宿主在装配任何模块前已把公共运行时挂到 globalThis.__V3HOST） */
const __HOST = globalThis.__V3HOST;
if (!__HOST || !__HOST.U) {
  throw new Error('本模块需要在《我，地图和小女仆》宿主程序中装载（未找到 __V3HOST 运行时）。'
    + '请打开程序的「设置 › 功能模块」，把本文件拖进 ➕ 装配区。');
}

export default {
  id: 'my-module',                    // 小写字母/数字/点/连字符，全站唯一
  name: '我的功能模块',
  icon: '件', version: '1.0.0', author: '', description: '一句话说明',
  minHost: 3,                         // 可选：需要的最低宿主版本（整数，当前宿主为 V3）
  settingsSchema: [
    { type: 'toggle', key: 'enabled', label: '启用', default: true },
    { type: 'slider', key: 'intensity', label: '强度', min: 0, max: 1, step: 0.05, default: 0.5 },
  ],
  init(ctx) {
    let gen = 0;                                    // 代际号：卸下后让排队的延迟任务作废
    gen++;
    const later = (fn, ms) => { const g = gen; return setTimeout(() => { if (g === gen) fn(); }, ms); };
    const enabled = () => ctx.settings.get('enabled') !== false;   // 注意：默认值自己兜底

    const box = document.createElement('div');
    box.dataset.mod = ctx.id;                       // CSS 命名空间
    box.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%)'
                      + ';pointer-events:none;padding:6px 12px;border-radius:6px'
                      + ';background:rgba(255,252,244,.92);border:1px solid #c9b892;font-size:12px';
    ctx.layer.appendChild(box);

    const offYear = ctx.events.on('yearchange', function (e) {
      if (!enabled()) { box.textContent = ''; return; }
      box.textContent = ctx.name + ' · 现在是 ' + e.year + ' 年';
    });

    return function dispose() {                     // ← 铁律：返回清理函数
      gen++;                                        // 排队中的 later() 全部作废
      offYear();                                    // 事件订阅
      if (box.parentNode) box.parentNode.removeChild(box);   // 自己建的 DOM
      const st = document.getElementById('my-module-css');   // 自己注入的样式
      if (st && st.parentNode) st.parentNode.removeChild(st);
    };
  },
  update(dt, ctx) { /* 每帧；不需要就删掉 */ },
  dispose() {}
};
```

> 如果模块自己有**设置在面板里现画的自定义界面**（`type: 'custom'`），那个 `render` 返回的清理函数
> 也要把这一块 DOM 上挂的监听/定时器收干净 —— 面板每次重绘都会重建它。

## 七、两个真实范例（随本套件交付）

| 文件 | 定位 | 学什么 |
|---|---|---|
| `背景音乐模块.js` | **入门范例**（约 620 行） | 标准生命周期、settingsSchema + custom 设置面板（含 `default` 对齐与清理函数）、Web Audio、IndexedDB 存音频、波形拖拽改选区、事件订阅（yearchange 年代联动）、CSS 随装配注入/卸载移除 |
| `女仆模块.js` | **高级参考**（约 8700 行，含 12MB base64 资产） | 大体量模块的组织方式：数据层与逻辑分层、多级设置面板、Canvas 逐帧渲染（update）、用户素材导入与槽位管理、常驻 HUD 节点的登记与逐个移除、延迟任务的代际号作废、`_debug/_set` 调试探针 |

> 「内置」与「导入」在这套系统里没有区别——内置模块只是把同一份源码以字符串形式内嵌在宿主的
> `globalThis.__V3_BUILTIN_SOURCES__` 里（键为 `music` / `pet` / `cn-history-plus` /
> `world-polity-plus` / `myth-age-plus` / `map-forge`），启动时和拖进来的 `.js`
> 走同一条 `importFromCode` 装配线（唯一差别：`builtin: true` 的源码不再重复落盘，见 8.2）。
> 所以这两个文件本身就是"适配验证过"的模板。
> 关于体积：模块**源码**不占 localStorage（超过 256KB 自动改存 IndexedDB），所以 `女仆模块.js` 直接拖进去
> 也能「下次打开自动恢复」；它作为内置模块随程序自带，只是省掉了每次导入这一步。

> 另有三个**资料型**内置模块 `cn-history-plus`（中国古代历史补充）/ `world-polity-plus`
> （世界势力资料补充）/ `myth-age-plus`（神话时代补充），随程序内置并**默认装配**：
> 它们演示了「没有界面、只往宿主资料库补数据」的模块怎么写——用 `globalThis.__V3DATA` 接口
> （快照 → 补充 → 可撤回），能力探测写法见 8.9。

> 还有一个**界面型**内置模块 `map-forge`（自定义地图创建），同样内置并**默认装配**：
> 它演示了「在宿主里再长一套完整子系统」的模块怎么写——左缘书签入口、独立球体渲染、
> 自带编辑工具与建模系统。它是目前最大的内置模块（约 40 万字符），随主程序更新即更新；
> 历史包袱提示：早期手动导入过同名 `.js` 的存档，首次启动会被一次性清掉旧副本
> （`ui.mapforgeBuiltinV1` 迁移标记），自建地图数据（`mapforge:` 前缀）不受影响。

---

## 八、宿主程序内幕（写给模块作者：宿主到底是怎么做的）

> 本节把宿主程序拆给你看。读完你会明白：你的模块被拖进装配区之后，宿主**一步一步**对它做了什么；
> `ctx` 里每个字段是从哪来的；设置和模块源码分别存在哪；哪些全局对象是宿主挂出来的、各自管什么。
> 以下源码片段均取自宿主真实实现（为阅读做了删减，语义不变），注释为逐行讲解。
>
> **宿主总体结构只有四层，全部住在一个 `<script type="module">` 里：**
>
> ```
> ┌─ 内核层    Events（事件总线）· Settings（设置存储）· Schema（设置面板渲染器）· U（工具）
> ├─ 框架层    Modules（模块管理器）· UI（设置抽屉/模块卡片）
> ├─ 桥接层    __V3HOST（给模块的运行时）· __V3BRIDGE（主程序→事件翻译器）· V3（内核全局）
> └─ 内容层    内置模块源码仓 __V3_BUILTIN_SOURCES__（music / pet / cn-history-plus）
> ```
>
> 设计精髓在桥接层的注释里写得很明白：*"主程序本身是一个独立的 ES module，内部变量不外泄。
> 它通过寥寥几处「一行桥接」把内部时机交出来……于是：设置项真的能改变地球，模块订阅事件
> 就能工作，而主程序一行都不用重构。"*

### 8.1 内核层：事件总线与设置存储

**事件总线**（全站唯一一根，模块之间、模块与宿主之间都靠它）：

```js
/* 宿主内核层：事件总线。注意 emit 的隔离设计——这是模块能安全热插拔的前提 */
const Events = (function () {
  const map = new Map();            // name -> [fn]
  function on(name, fn) {
    let a = map.get(name);
    if (!a) { a = []; map.set(name, a); }
    a.push(fn);
    return function off() { /* 从数组里摘掉这个 fn */ };   // on() 的返回值就是解绑函数
  }
  function emit(name, payload) {
    const list = (map.get(name) || []).slice();
    for (const fn of list) {
      try { fn(payload); }
      catch (e) { /* 单个订阅者抛错只 console.warn，绝不拖垮别人 */ }
    }
  }
  // ... off / once / names / count
})();
```

**设置存储**（整站一份，localStorage 持久化）：

```js
const SETTINGS_KEY = 'v3.settings.v1';   // ← 整站所有设置都在这一个 localStorage 键里

/* 默认值表：这些是「主程序真的会读」的全局配置，也是模块可以读的跨模块总控 */
const SETTINGS_DEFAULTS = {
  'hud.hint':            false,  // 左下角操作提示
  'hud.badge':           false,  // 底部年份徽标
  'hud.tools':           true,   // 左下工具条
  'hud.opacity':         1,      // HUD 不透明度
  'hud.shortcut':        true,   // 键盘快捷键（G 设置 / M 模块 / P 女仆）
  'timeline.jumpThreshold': 30,  // ≥ 该年差才播「跨越时间」过场（年）
  'timeline.turns':      0,      // 过场整圈数：0=自动(3~4圈)，1~6=固定
  'timeline.autoRotate': false,  // 启动时自动旋转
  'timeline.reduceMotion': false,// 减弱动效：不播过场，只做缓动
  'display.panelWidth':  420,    // 设置/模块面板宽度
  'display.uiScale':     100,    // 设置界面大小（%）
  'display.sideWidth':   344,    // 势力详情侧栏宽度
  'display.parchment':   true,   // 羊皮纸暖色滤镜
  'sound.enabled':       true,   // 声音总开关（音乐/女仆模块都会读它 ← 跨模块总控的典型用法）
  'sound.master':        0.7,    // 总音量
  'module.mounted':      ['cn-history-plus'],   // 已装配的模块 id 列表（装配状态就是存在这里的）
  'module.strict':       true    // 模块异常时自动卸载并提示（8.3 的 fail() 读它）
};

/* Settings 的工作方式：读 = localStorage 存档与默认值深合并；写 = 落盘 + 广播。
   关键：加载时「旧存档缺字段不会变成 undefined，多余字段保留」——向后兼容。 */
```

> 你的模块设置只是这份大设置里 `mod.<你的id>.` 开头的一小片（见 8.4 的 `makeCtx`）。
> 所以「别的模块的设置」「全局设置」物理上都存在同一个 localStorage 键里，
> 隔离靠的是**前缀命名约定**，而不是分开存。这也是 `ctx.settings.all()` 能看到整份设置的原因。

### 8.2 装配线全程：从拖进文件到模块跑起来

当你把 `.js` 拖进装配区，宿主执行的就是这条流水线（`Modules.importFromCode`）：

```js
/* ---- 从源码导入（Blob -> 动态 import）---- */
async function importFromCode(code, opts) {
  opts = opts || {};
  if (typeof code !== 'string' || code.trim().length < 20) throw new Error('代码太短');

  /* ① 把你的源码包成 Blob，用动态 import() 跑起来。
        这就是为什么交付形状必须是「ES 模块 + export default」 */
  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  let mod;
  try { mod = await import(url); }
  finally { setTimeout(function () { URL.revokeObjectURL(url); }, 6000); }

  /* ② 取导出对象：default 优先，也认 module；没有 id 直接拒收 */
  const def = (mod && (mod.default || mod.module)) || null;
  if (!def || !def.id) throw new Error('模块必须 export default 一个带 id 的对象');
  def.__imported = opts.builtin !== true;   // 内置模块标成「内置」，界面里好区分

  /* ③ 注册（见 8.3）：同 id 会自动「卸旧装新」= 热替换 */
  const d = register(def);
  if (!d) throw new Error('注册失败（id 不合法或重复）');

  /* ④ 源码持久化：下次打开自动恢复（内置模块源码随程序自带，不重复落盘）。
        await：存完再挂载，刷新后一定能恢复 */
  if (opts.builtin !== true) {
    try { await saveSource(d.id, code); } catch (e) { /* 存失败只警告 */ }
  }

  /* ⑤ 装配（除非你明确说先别装） */
  if (opts.mount !== false) mount(d.id);
  return d;
}
```

> 由此能推出三条实用结论：
> ① **热替换免费**：改完源码再导入一次，同 id 自动卸旧装新；
> ② 导出 `export module = {...}` 也认，但标准写法是 `export default`；
> ③ 导入是**异步**的——涉及 Blob URL 与 IndexedDB 落盘，卡片上的「导入并装配」按钮背后是 await。

### 8.3 模块管理器 Modules：注册 / 装配 / 卸下 / 帧循环

这是宿主对模块的「全生命周期管理」，你的模块被谁调用、按什么顺序调用，全在这里：

```js
const Modules = (function () {
  const reg = new Map();      // id -> 规范化后的模块定义（注册表）
  const live = new Map();     // id -> { def, ctx, dispose }（运行表：只有装配中的模块在里头）
  const order = [];           // 注册顺序（模块卡片就按这个排）

  const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;   // id 合法性就是这一条正则

  /* 注册第一步：把你的导出对象「规范化」——缺的字段补默认，多的字段挑着留 */
  function normalize(m) {
    return {
      id: String(m.id),
      name: m.name || m.id,
      icon: m.icon || '件',
      version: m.version || '1.0.0',
      author: m.author || '',
      description: m.description || '',
      settingsSchema: m.settingsSchema || [],
      init: typeof m.init === 'function' ? m.init : function () {},
      update: typeof m.update === 'function' ? m.update : null,   // 没写 update 就是 null，帧循环会跳过
      dispose: typeof m.dispose === 'function' ? m.dispose : null,
      _debug: typeof m._debug === 'function' ? m._debug : null,   // 调试探针原样保留（验收脚本用）
      _set:   typeof m._set === 'function' ? m._set : null,
      _v33:   typeof m._v33 === 'function' ? m._v33 : null,
      __imported: !!m.__imported,
      __raw: m
    };
  }

  function register(m) {
    if (!m || !m.id) { /* 拒收：没 id */ return null; }
    if (!ID_RE.test(m.id)) { /* 拒收：id 含非法字符 */ return null; }
    const def = normalize(m);
    if (reg.has(def.id)) {
      /* 同 id 重注册 = 热替换：先卸下旧的，再登记新的 */
      try { unmount(def.id, true); } catch (e) {}
    }
    reg.set(def.id, def);
    Events.emit('module:register', def.id);   // ← module:register 事件在这里发出
    refreshGallery();                          // 模块卡片面板重绘
    return def;
  }
```

**装配与卸下**（顺序是验收「无残留」的依据）：

```js
  function mount(id, silent) {
    const def = reg.get(id);
    if (!def || live.has(id)) return /* 不存在或已装着 */;
    const ctx = makeCtx(def);                 // 见 8.4：给你造专属上下文
    let dispose = null;
    try { dispose = def.init(ctx); }          // ← 你的 init 在这里被调用，清理函数被收进 live
    catch (e) {
      fail(def, e);                            // init 抛错：提示 + （strict 模式下）自动停用
      /* init 抛错时 live 里还没登记，fail→unmount 清不掉刚建的空容器，这里补一刀收走 */
      const orphan = document.querySelector('.v3-modui[data-mod="' + id + '"]');
      if (orphan) { runV3Cleanups(orphan); orphan.parentNode.removeChild(orphan); }
      return false;
    }
    live.set(id, { def: def, ctx: ctx, dispose: dispose });
    setMountedFlag(id, true);                  // 写进设置 module.mounted（刷新后能恢复装配状态）
    Events.emit('module:mount', id);
    return true;
  }

  function unmount(id, silent) {
    const L = live.get(id);
    if (!L) return false;
    live.delete(id);
    /* 收摊顺序（铁律，验收就按这个查）：
       ① init 返回的清理函数 → ② 模块自己的 dispose(ctx) → ③ 设置卡片上登记的清理
       → ④ 你的 ctx.layer 整个移除 → ⑤ 装配标记删掉 → ⑥ module:unmount 事件 */
    try { if (typeof L.dispose === 'function') L.dispose(); } catch (e) {}
    try { if (L.def.dispose) L.def.dispose(L.ctx); } catch (e) {}
    const el = document.querySelector('.v3-modui[data-mod="' + id + '"]');
    const cardEl = document.querySelector('.v3-card[data-id="' + id + '"]');
    if (cardEl) runV3Cleanups(cardEl);   // custom render 返回的清理函数在这里被调用
    if (el) { runV3Cleanups(el); el.parentNode.removeChild(el); }
    setMountedFlag(id, false);
    Events.emit('module:unmount', id);
    return true;
  }
```

**帧循环**（`update(dt, ctx, t)` 的实际驱动者）：

```js
  let rafId = 0, lastT = 0;
  function loop(t) {
    rafId = requestAnimationFrame(loop);          // 模块系统自己的一条 rAF，不依赖主程序渲染节奏
    const dt = Math.min(0.06, lastT ? (t - lastT) / 1000 : 0.016);   // dt 钳制在 ≤60ms（防后台切回跳变）
    lastT = t;
    if (document.hidden) return;                  // ← 「切后台自动暂停」就是这一行
    if (!live.size) return;
    live.forEach(function (L, id) {
      if (!L.def.update) return;                  // 没写 update 的模块直接跳过，零开销
      try { L.def.update(dt, L.ctx, t / 1000); }  // 第三个参数 t 是秒
      catch (e) { fail(L.def, e); }               // update 抛错 = 出错模块被停用并卸干净，其它模块照常
    });
  }

  function fail(def, e) {
    const strict = Settings.get('module.strict', true);   // 全局设置里的「模块异常自动停用」
    toast('模块「' + def.name + '」出错' + (strict ? '，已自动停用' : '（已隔离）') + '：' + e.message, 4200, 'err');
    if (strict) { try { unmount(def.id, true); } catch (e2) {} }
  }
```

### 8.4 ctx 是怎么造出来的（makeCtx 逐字段对照）

`init(ctx)` 收到的对象，每个字段的真实来源：

```js
  function makeCtx(def) {
    const pre = 'mod.' + def.id + '.';          // ← 隔离的全部秘密：一个字符串前缀
    return {
      id: def.id,
      name: def.name,
      events: Events,                            // 全站共享的同一根总线（不是给你单开的）
      settings: {
        get:      (k, d)  => Settings.get(pre + k, d),     // 读 = 全局设置里读 'mod.<id>.<k>'
        set:      (k, v)  => Settings.set(pre + k, v),     // 写 = 写进同一份 localStorage
        onChange: (k, fn) => Settings.onChange(pre + k, fn),
        all:      ()      => Settings.all()                // 整份设置（含别人的）——所以文档说别拿它读自己
      },
      layer: layerFor(def.id),                   // 你的专属容器（见下）
      app: APP,                                  // 只读世界句柄（见 8.6）
      data: APP.data,                            // 文本库 == APP.data，所以 ctx.data 与 ctx.app.data 是一回事
      store: U.idb,                              // IndexedDB 封装 == __V3HOST.U.idb（全站共用一个库）
      toast: toast,                              // 宿主的顶部提示条
      log: (...a) => console.log('[模块·' + def.id + ']', ...a),
      stage: function (w, h) {                   // 便捷画布：造好**直接挂进你的 layer**
        const c = U.el('canvas');
        c.style.cssText = 'position:fixed;pointer-events:none';
        c.width = w; c.height = h;
        c.style.width = w + 'px'; c.style.height = h + 'px';
        layerFor(def.id).appendChild(c);
        return c;
      }
    };
  }

  /* 每个模块一个全屏透明容器；第一次用到才创建，卸下时整个移除 */
  function layerFor(id) {
    let el = document.querySelector('.v3-modui[data-mod="' + id + '"]');
    if (!el) {
      el = U.el('div', 'v3-modui');
      el.dataset.mod = id;                       // ← CSS 红线里 [data-mod="<id>"] 前缀就是靠这个属性
      document.body.appendChild(el);
    }
    return el;
  }
```

> 对应的 CSS 只有一行：`'.v3-modui{position:fixed;inset:0;pointer-events:none;z-index:23}'`。
> 「全屏透明、不挡鼠标、层级 23」就是这么来的。要交互的元素自己开 `pointer-events:auto`。

### 8.5 持久化：设置、模块源码与「下次打开自动恢复」

宿主把三种东西分三个地方存，模块作者必须知道边界：

| 存什么 | 存哪 | 键 / 入口 | 容量注意 |
|---|---|---|---|
| 全部设置（含全局、含每个模块的 `mod.<id>.*`、含装配列表 `module.mounted`、含小模块源码清单 `module.sources`） | **localStorage** | `v3.settings.v1` 一个键 | 整站约 **5MB**——所以别把 base64 塞进设置项 |
| 大模块源码（> 256KB） | **IndexedDB** | 库 `v3` / 表 `blobs`，键 `modsrc:<id>`；localStorage 里只留 `'@idb'` 标记 | 阈值常量 `BIG_SRC = 262144`（256KB） |
| 模块运行时素材（音频、图片、用户导入的形象包） | **IndexedDB** | 经 `ctx.store`（== `U.idb`）：`put(k,v)` / `get(k)` / `del(k)` / `keys()` / `clear()` | 同上库表；键名自己起，建议带模块前缀防撞车 |

```js
/* 大源码自动改存 IndexedDB 的实现（理解「为什么 12MB 的女仆模块也能自动恢复」） */
const BIG_SRC = 262144;        // 256KB：超过就走 IndexedDB
const IDB_MARK = '@idb';
async function saveSource(id, code) {
  const srcs = Settings.get('module.sources', {}) || {};
  if (code && code.length > BIG_SRC) {
    await U.idb.put('modsrc:' + id, code);   // 大文件进 IndexedDB
    srcs[id] = IDB_MARK;                     // localStorage 里只留标记
  } else {
    srcs[id] = code;                         // 小文件直接进设置存储
  }
  Settings.set('module.sources', srcs);
}

/* 启动时的恢复流程（restoreImported）：读 module.sources 清单 → 逐个 loadSource()
   → 逐个 importFromCode({ mount: 上次是否装着 }) ——「上次装着、这次自动装好」就是这么实现的 */
```

### 8.6 桥接层：宿主挂出来的全部全局对象

宿主在全局放了一组对象，按「给谁用」分三类。**模块作者只需要记前两个**：

| 全局对象 | 给谁用 | 内容 |
|---|---|---|
| `globalThis.__V3HOST` | **模块（契约的一部分）** | `{ U, Settings, toast, Events, EV, APP, Modules, UI }` —— 第三节讲的就是它 |
| `globalThis.V3` | 宿主内核 + 模块（防御性使用） | 宿主逐件挂上的内核部件：`V3.U` / `V3.toast` / `V3.app` / `V3.Modules` / `V3.UI` / `V3.renderSchema` / `V3.requestGalleryRefresh` 等 |
| `globalThis.__V3BRIDGE` | **主程序自己调**（模块别碰） | 主程序 → 事件的翻译器：`year(y,prev)` / `polity(cn,en)` / `person(n,rec)` / `jumpStart/End(from,to)`；另有反向两个：`jumpThreshold()` / `turns()`（主程序来读设置） |
| `globalThis.__V3APP` | 主程序挂出的内部句柄 | `APP` 的「真身」：`getYear/getEra/eras/polities/activeAt/selectByName/__goto` |
| `globalThis.__V3DATA` | 资料型模块 | 资料补充接口：`snapshot/restore/addPeople/addRelations/patchPolities/addTerms/refresh/stats`，见 8.9 |
| `__POLITIES__` `__RELATIONS__` `__MYTHS__` `__CONCEPTS__` `__DEEP__` `__EVENTS__` | 宿主数据仓（**只读**） | `APP` / `ctx.data` 的底层来源；模块应走 `ctx.app` / `ctx.data` 而不是直接读它们 |

```js
/* 你订阅的事件是这样产生的：主程序每做一件事，就往桥接器报一句，桥接器翻译成事件 */
globalThis.__V3BRIDGE = {
  year:   (year, prev) => Events.emit(EV.YEAR,   { year, prev }),   // applyYear() 里调用
  polity: (cn, en)     => Events.emit(EV.POLITY, { name: cn, en }), // selectByName() 里调用
  person: (n, rec)     => Events.emit(EV.PERSON, { name: n, rec }), // showPersonInSide() 里调用
  /* 反向：主程序播不播过场、播几圈，是反过来读全局设置决定的 */
  jumpThreshold: () => Settings.get('timeline.reduceMotion', false) ? 1e9
                      : Number(Settings.get('timeline.jumpThreshold', 30)),
  // ...
};
```

```js
/* APP（== ctx.app == __V3HOST.APP）的实现要点：
   每个方法都是「先问主程序内部句柄 __V3APP，问不到再降级」的双保险 */
const APP = {
  getYear()  { /* 先 __V3APP.getYear()，降级读页面上的年份输入框 #yearIn */ },
  getEra()   { /* 先 __V3APP.getEra()，降级读 #eraLabel 的文本 */ },
  eras()     { /* __V3APP.eras()；可能返回 null */ },
  polities() { /* __V3APP.polities()，降级读全局 __POLITIES__ */ },
  setYear(y) { /* 把时间轴滑块拨到 y，再派发 input/change 事件让主程序自己走过去——
                  所以 setYear 会触发完整的过场与 yearchange 事件链 */
               /* y 会被钳制在 -3000000 ~ 1826 */ },
  activeAt(y){ /* ⚠ 宿主注释原话：公元 50 年以前返回的是「史前分组名」，对不上任何具体势力——
                  要按年查势力请优先用 polities() 自己按 start/end 过滤 */ },
  person(n)  { /* 读 __RELATIONS__.people[n] */ },
  openPolity(name) { /* 调 __V3APP.selectByName(name, '') */ },
  goto(lon, lat, dist) { /* 调 __V3APP.__goto(lon, lat, dist)，相机飞行 */ },
  data: { myths: () => __MYTHS__, relations: () => __RELATIONS__, concepts: () => __CONCEPTS__,
          deep: () => __DEEP__, events: () => __EVENTS__ }
};
```

### 8.7 宿主 UI 层级（z-index）与可复用的基座样式

**层级表**（自下而上；模块的 `ctx.layer` 在 23，这就是「侧栏会盖住你」的原因）：

| z-index | 谁 |
|---|---|
| 23 | `#v3Gear` 设置齿轮 · **`ctx.layer`（`.v3-modui`）← 你默认在这一层** |
| 25 | `.side` 势力详情侧栏 |
| 30 | 顶部年代条 |
| 70 | `.relPanel` 人物关系网全屏面板 |
| 75–77 | 女仆模块自建的常驻层（`#v3Pet` 75 / 热区 76 / 气泡 77）——走第五节例外条款的范例 |
| 92 | 女仆模块的程序内视频小窗（同为自建层） |
| 130 / 131 | `.v3-mask` 设置遮罩 / `.v3-drawer` 设置抽屉（**设置面板永远压在所有模块之上**） |
| 210 | 女仆模块「导入新角色」向导的全屏遮罩（模块自建层的上限参考） |
| 2147482000 | 扉页（一级界面，`#kxFront`）与「关于 · 赞助」卡——**别碰这一层** |
| 2147483000 | 123 公约签署仪式与启动加载遮罩——全程序最高层，**任何模块都不准盖它** |

> 启示：做「永远露在最上面」的常驻 HUD，自建层的 z-index 选在 **71~129** 之间最稳妥
> （压过主界面、不压设置面板）。女仆的 75~92 就是活例。

**宿主按钮位置登记表**（新模块的浮动按钮**不许**落在这些格子里——挑空地放）：

| 位置 | 谁在用 |
|---|---|
| `left:12px; bottom:12px` 起的一排（`.tools` 容器） | 宿主圆形按钮列：图层开关 / ⌂ / ⟳ / ↻ / 「设」设置 / 「扉」书签 / 人物关系 `#btnRel` / 神话体系 `#mythBtn` |
| `left:0; top:50%`（左缘竖排标签） | map-forge 的「图 · 其他地图」书签 `.mf-bookmark` |
| `left:14px; bottom:168px` | myth-age-plus 的圆形入口 `#v3MythPlusBtn` |
| `right:14px; bottom:96px`（及其上方 134px 起的面板） | world-polity-plus 的入口 `#v3WPP` |
| `right:0; top:112px` | 势力侧栏拉手 `#sideToggle` |
| `left:50%; bottom:10px` | 底部信息条 `#badge` |
| 屏幕四边（底边为主） | 女仆的活动轨道（z 75~92） |

> 选位原则：先查这张表，再用**整数像素**避开；两个模块撞位时，后到者搬家。

**自定义地图创建模块（map-forge）内部按钮登记表**（给「地球地图同款」界面用的；新模块若仿它的界面，左侧竖栏与工具条别再占用这些序位）：

| 界面元素 | 已有内容（自上而下） |
|---|---|
| 左侧图标竖栏 `.mf-left` | 全部为无色线条图标（SVG，`currentColor` 随主题变色，鼠标悬停显示名称与功能），自上而下：扳手＝工具包 / 地图＝地图目录 / 环形箭头＝刷新画面 / 网格＝经纬线开关 / 星球＝星球编辑 / 立方体＝建模系统直达 / 撤销 / 重做 / 时钟＝历史快照 / 软盘＝保存 / 地球＝返回主界面 |
| 工具条 `.mf-dock`（工具包开启时出现） | 同样是线条图标：陆地板笔 / 海洋板笔 / 其他区域笔 / 橡皮擦 / 势力笔 / 城镇笔 / 水域笔 / 建模实例 / 标签 / 空间笔；追加作画模式钮（涂抹→圈地→直线循环，右键开圈地图形菜单）；圈地激活时再追加图形排（自由/直线/圆/椭圆/曲线/正方形/平行四边形）与「微调」开关 |
| 顶部 | 时代栏（每个时代＝一颗星球）+ 搜索栏 |
| 面板区 | 地图编辑 / 地形编辑 两个页签；「星球编辑」区是星球管理与空间列表的总入口 |

**建模系统内部布局**（打开「模」后的全屏界面）：左栏是建模目录（「＋新建」菜单 + 基础体图鉴：35 种预制造型的缩略图小窗，
分「基础形 / 管环与曲面 / 尖棱与星 / 组合造型」四组，每卡带悬停说明）与导入按钮；右栏是编辑工具；对话框标题栏右侧有「✎编辑 / ◉观察」开关（观察态下右栏沉睡，只看不改）。
**部署流程**：把建模放上球面时先进「幽灵预览」（半透明 + 虚线描边），鼠标选位置、滚轮拉近拉远、左键短击确认、右键轮换调整项、Esc 取消；
首次确认会弹「是否确认部署」小窗（下方可勾选「以后每次都问我」，同类确认窗还有一键填充、重置球形，都能在模块设置里改回）。
**建模文件互通**：`.mfmodel`（本程序格式）/ `.obj` / `.stl` / `.glb` 四种格式双向导入导出，
目录卡片右键菜单即导出入口；导入走左栏「⇱」按钮或直接把文件拖进左栏。新模块若产出建模，建议走 `.mfmodel` 或 OBJ。

**可复用的基座类名**（宿主提供，可以直接用、**不准重定义**）：
`.v3-btn`（含 `.pri` 主按钮 / `.dgr` 危险按钮）、`.v3-row`、`.v3-note`、`.v3-card`、`.v3-grp`（分组标题）、
`.v3-fold` / `.v3-fold-bd`（折叠组）、`.v3-val`、`.v3-mini`、`.v3-drop`（拖放区）、`.v3-ico` 等。

**可复用的 CSS 变量**（带兜底的写法）：`var(--rule,#c9b892)`（边框线色）、`var(--ink,#3a2a16)`（主文字色）、
`var(--paper,#f6efdd)`（纸色）、`var(--ink-faint,#8a7a5e)`（弱文字色）。用它们，你的界面就自动
融入宿主的羊皮纸复古风，而不是一块突兀的补丁。

### 8.8 卡片期样式：女仆模块的 `injectModCSS / removeModCSS` 模式

第四节说过「卡片在未装配时也会渲染」。由此产生一个真实需求：**卡片要显示，就得有样式；
但模块没装，样式又算谁的？** 两个内置模块的标准解法（照抄即可）：

```js
function injectModCSS() {
  if (document.getElementById('v3-mod-css-你的id')) return;         // 幂等：已注入就不重复
  const st = document.createElement('style');
  st.id = 'v3-mod-css-你的id';
  st.dataset.mod = '你的id';                                        // 命名空间红线
  st.textContent = MOD_CSS;
  (document.head || document.documentElement).appendChild(st);
}
function removeModCSS(force) {
  /* 设置卡片还在页面上就先留着（未装配时也能先改设置，卡片得有样式）；
     卡片被销毁且模块没装 → 宿主调用这里登记的清理函数，那时 force=true 再收。 */
  if (!force && document.querySelector('.v3-card[data-id="你的id"]')) return;
  const st = document.getElementById('v3-mod-css-你的id');
  if (st && st.parentNode) st.parentNode.removeChild(st);
}
/* 挂法：settingsSchema 里放一个 custom 项，render 里 injectModCSS() 并返回 () => removeModCSS(true)；
   init 里也 injectModCSS()，清理函数里 removeModCSS(false)。两处调用都是幂等的，不会重复注入。 */
```

### 8.9 能力探测（拿不准的接口，先探后用）

宿主会持续更新，个别接口可能因版本不同而缺席。凡是不是「模块契约三处接触面」里的能力，
一律**先探测再使用**，探不到就降级或友好提示，绝不直接抛错吓使用者：

```js
init(ctx) {
  const D = globalThis.__V3DATA;
  if (!D || typeof D.addPeople !== 'function') {
    ctx.toast('这册地图的版本还太旧，接不上这份资料补充——请换用最新版的《我，地图和小女仆》再试', 5200, 'err');
    return function () {};          // 返回空清理函数 = 装配成功但不干活，不算事故
  }
  // ... 正常开工
}
```

> `__V3DATA` 用法速览（仅资料型模块需要）：`snapshot()` 先拍快照 → `addPeople/addRelations/
> patchPolities/addTerms` 补数据 → `refresh()` 生效；要撤回就 `restore(快照)`。
> 它的设计是「只补空缺：程序里已经写好的正文一个字都不动」。

---

## 九、界面风格与文案规范（V3 新增，写给模块作者）

### 9.1 风格 token：让你的模块长在羊皮纸上

宿主 :root 提供的 CSS 变量（**一律带兜底写法**，防止旧版宿主没有该变量）：

| 变量 | 含义 | 推荐写法 |
|---|---|---|
| `--paper` | 羊皮纸底色 | `var(--paper,#f6efdd)` |
| `--ink` | 主文字（深棕） | `var(--ink,#3a2a16)` |
| `--ink-soft` / `--ink-faint` | 次级 / 弱文字 | `var(--ink-faint,#8a7a5e)` |
| `--rule` | 边框线色 | `var(--rule,#c9b892)` |
| `--accent` | 强调色 | `var(--accent,#a8802e)` |
| `--gold` | 金色点缀 | `var(--gold,#a8802e)` |
| `--brass` / `--brass-deep` | 黄铜 / 深黄铜（V3 新增） | `var(--brass,#8e6b32)` |
| `--seal` | 印泥红（落款、印章用） | `var(--seal,#a03a2a)` |
| `--panel` | 半透明纸面板 | `var(--panel,rgba(240,231,211,.94))` |

硬编码一串 `#f6efdd` 不是不行，但用变量，你的界面会跟着宿主以后的换肤一起走。

### 9.2 文案风格：故作严肃的温柔

这册地图的文案有一套脾气——像 123 公约那样：**架子端着，心是热的；说明要准确，语气要有希望感。**

- 技术限制用叙事解决，不甩术语。
  ❌「浏览器自动播放策略阻止了 AudioContext」
  ✔「音频需要你先点一下页面任意处才会出声——这是浏览器的自动播放规矩，并非地图在闹脾气。」
- 报错说人话，并给一条出路。
  ❌「解码失败：编码不受支持」
  ✔「读不出这个音频——换 mp3 或 wav 试试？」
- 按钮与功能性说明**正经写**，别为了俏皮牺牲准确（「刷新页面」就是刷新页面）。
- 不给使用者看任何开发期字样（测试、调试、占位、TODO 一律留在注释里）。

### 9.3 称呼使用者：她记得你的名字

使用者在 123 公约上落款的名字存在全局设置键 `user.name`（未落款时是「旅人」）。

```js
const name = ctx.user();                       // 当前称呼
ctx.events.on('setting', function (e) {        // 称呼被修改时
  if (e && e.key === 'user.name') hello.textContent = '日安，' + ctx.user() + '。';
});
```

签署/改名的瞬间宿主还会在 `document` 上派发一次 `kx:user` 事件
（`detail` 为 `{name, fresh}`，`fresh` 表示刚落款的全新签署）。模块用 `ctx.user()` 就够，
只有需要在签名动画当拍反应的模块才监听这个 DOM 事件。

### 9.4 层级纪律（配合 8.7）

扉页（2147482000）与公约/启动遮罩（2147483000）是程序的「门面两层」，
模块自建层最高不要超过 210——门面迎客的时候，谁也不许站在她前面。

---

## 十、验收清单（AI 交付前逐条自测，使用者拿到手即可直接用）

- [ ] 保存为 `.js` 后拖进「设置 › 功能模块 ➕ 装配区」，**导入无报错**（右上角无红字，控制台无 error）。
- [ ] 装配 → 卸下 → 再装配，**无残留无重复**（界面元素不重复出现、监听不叠加、控制台无累积报错）。
- [ ] 卸下后 `window` / `document` 上**没有你留下的监听**（DevTools 里 `getEventListeners(window)` 自查一遍）。
- [ ] 卸下后 **1~2 秒内不再冒出你排队的延迟动作**（没有残留的提示、声音、窗口、DOM）。
- [ ] 走了例外条款的常驻 HUD：卸下后 `document.body` 下**逐个节点都收干净了**（对照登记清单）。
- [ ] 卡片里出现声明好的设置面板，**初值显示与代码默认值一致**（开关不是「明明开着却显示关」，滑块/数值框不是 `undefined`）。
- [ ] **未装配状态**下打开设置面板：卡片渲染正常，custom render 没有因为「init 还没跑」而抛错。
- [ ] 卡片里**反复重绘**（点几次「刷新/重新载入」之类的按钮）后，`window` 上的监听数量**不增长**，注入的 `<style>` 不重复。
- [ ] 需要拖拽/滑动的交互：**只移鼠标不按键**不会改动任何状态；每个手柄（起点/终点、左/右）松手后都能把结果存进设置。
- [ ] **修改能存**（刷新页面后设置还在、模块自动恢复装配；源码 ≲1MB 时直接恢复，>256KB 走 IndexedDB 也一样恢复）。
- [ ] 模块即使抛错也**不拖垮其它模块**（框架会隔离它并连同它的界面一起卸干净，其它功能照常）。
- [ ] 在「编辑当前已装配模块」里能看到你的模块卡片，开关可卸/可装。
- [ ] 用了版本限定接口（如 `__V3DATA`）的：做了能力探测，探不到时有友好提示且不留残骸。

## 十一、给使用者的话

- **装**：设置 › 功能模块 ➕ 把 `.js` 拖进去（可一次拖多个）；或粘贴源码点「导入并装配」。
- **卸**：拨模块卡片右上角的开关（不删源码）；要彻底删除，进「编辑当前已装配模块」点「删除源码」。
- **换**：同一份源码改完再导入一次即热替换（同 id 自动卸旧装新）。
- 导入的模块源码存在浏览器本地，下次打开自动恢复（小源码放 localStorage，**超过 256KB 的大模块自动改存 IndexedDB**）；
  内置的「音乐 / 女仆」随程序自带，卸下后下次打开仍在待命。
- ⚠ **设置项有配额**：整站设置存在 localStorage（约 5MB），模块源码不占它，但**别把图片/音频塞进设置项**——
  要放素材用 `ctx.store`（IndexedDB）。
- 想直观理解宿主：打开控制台，输入 `__V3HOST` 能看到第三节的全部运行时；输入 `V3.Modules.stats()`
  能看到当前注册了哪些模块、装配着哪几个；输入 `JSON.parse(localStorage.getItem('v3.settings.v1'))`
  能看到你的模块设置真实落盘的样子（找 `mod.<你的id>.` 开头的键）。
