# `window.WTJ_AUDIO` — 音频 / TTS / SFX Manager API

对应飞书卡：`WTJ-20260704-016`（实现音频/TTS/SFX 管理与缓存）。
实现文件：`app/web/audio.js`。数据/文档配套文件：本目录下 `sfx-manifest.json`、
`missing-audio.json`、`README.md`。

**本卡边界（先读）**：本卡只交付统一 manager + 缓存策略 + SFX 清单 + 授权缺口清单。
**不接入 `index.html`**（`<script src="audio.js">` 尚未被添加到运行时页面），**不产出任何
真实音频素材**。接入运行时是 013（任务引擎）/ 019（集成）卡的工作；授权素材采购是
PM/DESIGN 的工作，缺口详见 `missing-audio.json`。

---

## 1. 加载方式

```html
<!-- 与 manifest.js 同款：普通 script 标签，非 module，晚于/独立于其它脚本均可 -->
<script src="audio.js"></script>
```

加载后暴露一个**已冻结**的全局对象 `window.WTJ_AUDIO`（`Object.freeze`，无法被覆盖或
新增属性）。语法基线 ES2020 以内（Safari 14 兼容）：全文 `var`/`function` 声明式，
不使用箭头函数 / `let` / `const` / 模板字符串 / 可选链 `?.` / 空值合并 `??`，无
`import`/`export`，零外部请求（只 `fetch()` 同源相对路径的本地音频文件）。

## 2. 红线：不使用浏览器内置发音（REQ-AST-07）

`audio.js` 全文**不出现** `speechSynthesis` / `SpeechSynthesisUtterance`。所有"语音"
播放走同一条路径：**预生成 `.m4a` 文件 → `fetch()` 拿 `ArrayBuffer` → `AudioContext
.decodeAudioData()` 解码为 `AudioBuffer` → 缓存 → `AudioBufferSourceNode` 播放**。
不论是秘密词发音、任务语音提示，还是固定短句/组合短语，统统是"播放预先烧录好的音频文件"，
不存在任何"运行时合成语音"的代码路径。

## 3. 路径约定

| 类别 | 目录 | 约定 | 来源 |
|---|---|---|---|
| 秘密词语音 | `audio/words/` | `audio/words/<word>.m4a` | 与 `app/web/manifest.js` `secretWords.pool[].audioFile` 完全一致 |
| 任务语音提示 | `audio/tasks/` | `audio/tasks/<id 或语音文件名>.m4a` | 与 `tasks.templates.*.examples[].voicePrompt` 一致 |
| 音效 SFX | `audio/sfx/` | `audio/sfx/<sfxKey>.m4a`（扁平，无子目录） | 见 `sfx-manifest.json`；`task-success` 已被 `manifest.js` 硬编码引用 |
| 组合短语 | `audio/phrases/` | `audio/phrases/<phraseKey>.m4a` | 本卡新增，供 `playComposite()` 拼接用，见 `missing-audio.json` 的 `compositePhrases` 段 |

**音频文件格式：`.m4a`（AAC）。** 理由：
1. Safari / WebKit（本项目目标运行环境——macOS 桌面壳，见 `docs/index.html` `#desktop`）
   对 AAC/M4A 有原生高效解码支持，`decodeAudioData()` 兼容性最好；
2. 同等音质下体积明显小于 WAV，契合目标机（2014 MacBook Air / 4GB 内存）的资源预算；
3. 与项目里已经落地的路径约定（`manifest.js` 里全部 `audioFile`/`voicePrompt`/
   `successAudio` 字段）保持一致，不需要额外做格式判断分支。

## 4. API 一览

### 生命周期

```js
WTJ_AUDIO.unlock()      // Promise<boolean> —— 在用户手势（click/keydown）回调里调用，
                         // resume() 处于 suspended 状态的 AudioContext。
WTJ_AUDIO.isUnlocked()  // boolean —— 当前 AudioContext 是否处于 'running' 状态。
```

`AudioContext` 是**懒创建**的：直到第一次 `preload()`/`play*()` 需要解码音频，或第一次
调用 `unlock()`，才会 `new (AudioContext || webkitAudioContext)()`。构造失败或环境不支持
时，所有后续 `play*()` 调用会自动走 silent 降级路径，不会抛错。

> **集成注记（写给 019 集成卡）**：`app/web/app.js` 里已经有一段独立的 AudioContext
> 解锁桩（007/002 遗留，变量名 `audioCtx`，只用于 `#dbg-audio` 调试展示，不做真正的
> 解码/播放）。本模块持有另一个完全独立的 `AudioContext` 单例，二者当前互不知晓、互不
> 冲突，但同一页面存在两个 `AudioContext` 实例不是好的长期状态。**019 卡把 `audio.js`
> 真正接入 `index.html` 时应该**：① 删除 `app.js` 里那段独立解锁桩；② 统一改为调用
> `WTJ_AUDIO.unlock()`；③ 全应用只保留 `audio.js` 内部这一个 `AudioContext` 单例；
> ④ `#dbg-audio` 状态展示可以直接读 `WTJ_AUDIO.isUnlocked()`。本卡不越权修改
> `app.js`，此处仅作说明。

### 预取 / 批量缓存

```js
WTJ_AUDIO.preload(items)          // Promise<Array<{type,key,path,loaded}>>
WTJ_AUDIO.preloadManifest(obj)    // Promise<Array<...>> —— preload() 的便捷封装
```

`items` 数组的每个元素可以是：
- 字符串：视为**原始路径**，直接 `fetch()`，不做任何约定拼接。
- 描述符对象 `{ type, key, path }`：`type` 是 `'word' | 'sfx' | 'task' | 'phrase' |
  'path'` 之一；若省略 `path`，按第 3 节的路径约定从 `key` 自动拼接；若显式给了
  `path`，直接使用（穿透约定拼接）。

`preloadManifest(manifestLikeObj)` 接受一个"分段"对象，直接消费项目里已有的 manifest
结构而不需要调用方手工转换：

```js
WTJ_AUDIO.preloadManifest({
  words: WTJ_MANIFEST.secretWords.pool,        // [{word, spriteFile, audioFile}, ...]
  tasks: []
    .concat(WTJ_MANIFEST.tasks.templates.drag.examples)
    .concat(WTJ_MANIFEST.tasks.templates.click.examples)
    .concat(WTJ_MANIFEST.tasks.templates.find.examples)
    .concat(WTJ_MANIFEST.tasks.templates.press.examples),  // [{id, voicePrompt, ...}, ...]
  sfx: WTJ_AUDIO.getSfxKeys(),                  // 或任意 sfxKey 字符串子集
  phrases: ['find', 'pick-up', 'put-into']      // 见 missing-audio.json compositePhrases
});
```

任何缺失/非法条目都会被跳过并 `console.warn` 一次，不会中断整批预取
（`Promise.all` 永远 resolve，单条失败不会让整体 reject）。

### 播放

```js
WTJ_AUDIO.playWord(word)            // 秘密词语音——009 秘密词卡消费
WTJ_AUDIO.playSfx(sfxKey)           // 音效——011 奖励卡（开箱声等）、013 任务卡消费
WTJ_AUDIO.playTaskVoice(taskKey)    // 任务语音提示——013 任务引擎卡消费
WTJ_AUDIO.playComposite(parts, opts)// 组合任务语音（短语 + 秘密词等按序播放）
```

四者都返回一个 **永不 reject** 的 `Promise`，resolve 值形如：

```ts
{
  ok: boolean,          // 是否真的播放成功
  silent: boolean,      // 是否走了静默降级（!ok 时恒为 true）
  type: string,          // 'word' | 'sfx' | 'task' | 'phrase' | 'path'
  key: string | null,
  path: string | null,
  reason?: string,       // 'missing' | 'invalid-arg' | 'no-audio-context' | 'play-error' | ...
  startedAtSec: number | null,  // 实际排定的绝对起播时刻（AudioContext 时钟秒）；silent 时为 null
  durationSec: number           // 该段音频时长（秒）；silent 时为 0
}
```

> `'phrase'` 会出现在 `playComposite()` 里 `{ type: 'phrase', key }` 片段的结果中
> （见下方组合语音一节）。`startedAtSec` / `durationSec` 是给 `playComposite()` 排程与
> QA 断言顺序语义用的（单段播放时也会带上，可忽略）。

`playWord`/`playSfx`/`playTaskVoice` 都同时支持**字符串快捷式**和**对象穿透式**两种入参：

```js
// 字符串快捷式：按约定拼路径
WTJ_AUDIO.playWord('dog');                 // -> audio/words/dog.m4a
WTJ_AUDIO.playSfx('chest-open');           // -> audio/sfx/chest-open.m4a（见 DEFAULT_SFX_MAP）
WTJ_AUDIO.playTaskVoice('drag-dog-home');  // -> audio/tasks/drag-dog-home.m4a

// 对象穿透式：直接把 manifest 里的条目整个传进来，path 字段优先于约定拼接
WTJ_AUDIO.playWord(secretWordEntry);   // {word, spriteFile, audioFile} -> 用 audioFile
WTJ_AUDIO.playTaskVoice(taskExample);  // {id, voicePrompt, successAudio} -> 用 voicePrompt
```

**为什么需要对象穿透式**：`app/web/manifest.js` 里 `tasks.templates.press.examples`
的两条数据，`id`（`press-letter-a` / `press-digit-3`）与 `voicePrompt` 文件名 stem
（`press-a` / `press-3`）**并不一致**（`manifest.js` 原文如此，非本卡引入）。如果只用
字符串快捷式传 `taskKey`，传 `'press-letter-a'` 会拼出错误路径
`audio/tasks/press-letter-a.m4a`（不存在）。**更稳妥的用法**是直接把整个任务对象传给
`playTaskVoice()`，让它读取 `voicePrompt` 字段，完全绕开约定拼接：

```js
WTJ_AUDIO.playTaskVoice(WTJ_MANIFEST.tasks.templates.press.examples[0]);
// -> 直接用 voicePrompt: 'audio/tasks/press-a.m4a'，不受 id 命名不一致影响
```

`successAudio` 字段（如 `'audio/sfx/task-success.m4a'`）请用 `playSfx()`，同样支持对象
穿透：`WTJ_AUDIO.playSfx({ sfxKey: 'task-success', path: taskExample.successAudio })`，
或者更简单——因为约定路径本来就一致——直接 `WTJ_AUDIO.playSfx('task-success')`。

#### `playComposite(parts, opts)` —— 组合任务语音

对应 REQ-AST-08「组合任务语音运行时生成后缓存」。真正意义上的"多段音频拼接成一条无缝
语音（合成单个 buffer）"需要真实素材到位后另行实现（**超出本卡范围**，见下方"已知限制"）。
本卡实现的是**顺序时间轴排程**：各片段在 AudioContext 时钟上**依次、不重叠**地播放——
第 N 段被排到第 N-1 段结束时刻起播（内部对每段调用 `source.start(上一段结束时刻)`），
而不是"一 `start` 就 resolve、下一段立刻 `start(0)`"那种会在音频时钟上互相重叠的做法。
每个片段各自走标准的"缓存 + silent 降级"路径；缺失/静默的片段不占用时间轴（时长记 0），
后一段紧接在前一段有效片段之后。返回值里每段结果的 `startedAtSec`（绝对起播时刻）与
`durationSec`（该段时长）就是这套排程的可观测证据（`tests/unit/audio-manager.test.mjs`
第 7 组断言据此验证 3 段全存在时起播时刻恰为 `[0, D, 2D]`）。典型用法——用一个固定短语
+ 一个秘密词，拼出"找到 + 小狗"：

```js
WTJ_AUDIO.playComposite([
  { type: 'phrase', key: 'find' },  // audio/phrases/find.m4a
  { type: 'word', key: 'dog' }      // audio/words/dog.m4a
]);
```

`parts` 数组元素的形式与 `preload(items)` 完全一致（字符串 = 原始路径，或
`{type, key, path}` 描述符）。`opts.cacheKey`（可选）用于给这次组合调用命名——不传时
会自动用各片段 path 用 `'+'` 拼接生成一个 key。这个 `compositeKey` 目前只出现在返回值里
供调用方/QA 识别，**尚未**接一个"组合结果单独整体缓存"的存储层（因为目前没有真实拼接
音频这回事）；预留这个字段是为了未来素材到位、真的实现了音频拼接后，能在不改调用方代码
的前提下，把 `compositeKey` 接到一个新的"拼接结果缓存"里。

返回值 `parts` 数组按顺序给出每个片段各自的播放结果，顶层 `silent` 在**所有**片段都
silent 时才为 `true`（只要有一个片段真的播放了，`ok` 就是 `true`）。

### 缓存

```js
WTJ_AUDIO.clearCache()                 // 清空 AudioBuffer 缓存
WTJ_AUDIO.getCacheStats()              // { size, maxEntries, keys: string[] }
WTJ_AUDIO.setMaxCacheEntries(n)        // 运行时调整 LRU 上限（正整数），立即触发淘汰
```

**缓存策略**：`AudioBuffer` 按"解析后的路径"为 key 缓存，采用 **LRU**（最近最少使用）
淘汰，默认上限 **64 条**。依据：目标机 2014 MacBook Air（4GB 内存 / Intel HD5000 核显，
technical review 结论，与 `app/web/manifest.js` 的 `performance` 红线同源）；一段
1-2 秒短句/音效解码为 PCM 大约占用 0.7MB~1.5MB，64 条上限对应峰值约 45MB~95MB，在
4GB 机器上给渲染/动效/其余运行时留足余量。此常量可通过 `setMaxCacheEntries()` 在运行时
覆盖，不需要改动源码常量。

### QA / 集成内省

```js
WTJ_AUDIO.getMissingReport()   // Array<{type,key,path,reason,count,firstRequestedAt,lastRequestedAt}>
WTJ_AUDIO.getSfxKeys()         // string[] —— 内置 DEFAULT_SFX_MAP 的全部 sfxKey（应与 sfx-manifest.json 一致）
```

`getMissingReport()` 返回**运行时实际被请求过、但取不到 buffer**（文件不存在 / fetch
失败 / decode 失败 / 无 AudioContext 支持）的资源清单，去重后按 `type:key:path` 聚合、
带命中次数与首末次请求时间。QA 或 019 集成卡可以在跑完一轮完整交互流程后调用它，
和 `missing-audio.json` 的静态清单做交叉核对，确认"文档记录的缺口"与"运行时实际被
用到的缺口"一致。

## 5. 降级契约（所有消费方都可以依赖这一点）

- `preload*()` / `play*()` **永不 reject、永不抛出未捕获异常**。文件不存在、网络/CORS
  失败、解码失败、环境不支持 Web Audio、参数非法——所有这些情况统一表现为：返回一个
  `resolve` 的结果对象，`silent: true`，对应资源级别的失败（非参数错误）会记录进
  `getMissingReport()`，并且 `console.warn` **恰好一次**（同一缺口重复请求不会刷屏）。
- 这意味着 013（任务引擎）等消费方**不需要等真实音频素材到位**就能接入：所有
  `play*()` 调用在真素材缺失时会自然表现为"什么都没播放，但流程正常往下走"，等价于
  一个天然的 silent/mock adapter，不需要额外写 mock 层。
- 非法参数（错误类型、空值、非法 key 字符等）会被防御式忽略：`console.warn` 一次并
  返回 `{ok:false, silent:true, reason:'invalid-arg', ...}`，**不会**污染
  `getMissingReport()`（那里只记录"真实资源缺口"，不记录"调用方传参错误"）。

## 6. 已知限制 / 不在本卡范围内的事项

1. **不接入运行时**：`index.html` 尚未加 `<script src="audio.js">`，`app.js` 未调用
   任何 `WTJ_AUDIO.*`。接入属于 013/019。
2. **零真实素材**：`audio/words/`、`audio/tasks/`、`audio/sfx/`、`audio/phrases/`
   目录本身**不存在**于本次交付（本卡未创建任何 `.m4a` 文件），所有路径都是"约定"，
   在真实浏览器环境里当前 100% 会走 silent 降级路径。完整缺口清单见
   `missing-audio.json`。
3. **既定 `loadFileURL` 运行时下，本地音频 `fetch()` 近乎必然失败——019 必须替换加载层
   才能出声**：本项目运行时已由 002 卡敲定为 WKWebView `loadFileURL`（`file:` 方案）。
   在这个运行时下，`fetch()`/XHR 对 `file:` 方案资源的读取会被 WebKit 近乎必然地拦截
   失败——`loadFileURL(_:allowingReadAccessTo:)` **只放开标签式子资源**（`<img>` /
   `<audio>` / `<script>` / CSS 引用等）的读取，**并不解除** `fetch`/XHR 对 `file:`
   方案的限制（事实与"loadFileURL 让同目录访问更宽松"这种直觉相反）。
   `audio.js` 的加载层（`getBuffer` → `loadArrayBuffer`）走的正是 `fetch()`，因此**在当前
   运行时下，即使把真实 `.m4a` 放到约定路径，也不会出声**——所有 `play*()` 会走 silent
   降级（把"加载失败"和"文件不存在"一视同仁，详见第 5 节，不会抛错或卡死，但也没有声音）。
   **019 集成卡必须把加载层替换掉**才能真正播放，推荐方案（任选）：① 自定义
   `WKURLSchemeHandler`，用一个自定义 scheme（如 `wtj-audio://`）供 `fetch` 走；
   ② 把 `.m4a` 以 `data:` URI 内联后交给 `decodeAudioData`（绕开 `fetch`）；
   ③ 在本机起一个 `localhost` 静态 server，页面与音频都走 `http://localhost`。
   替换点已被单独抽成 `audio.js` 里的内部函数 `loadArrayBuffer(path)`（见其上方注释），
   decode/缓存/播放/降级逻辑都无需改动。
4. **`playComposite()` 不做真实音频拼接**：只做多段依次播放的调度，不产出"无缝的
   单条合成音频"。真正需要无缝合成时，应在有素材/TTS 供应商确定后另行实现（可能是
   预先在离线阶段把常见组合拼好存成单文件，或引入更复杂的音频调度/交叉淡入淡出）。
5. **`sfx-manifest.json` 与 `DEFAULT_SFX_MAP`（`audio.js` 内部常量）是两份需要手动
   保持同步的数据**：因为运行时不通过 `fetch()` 读取 JSON（同一个 file:// CORS 限制，
   与 `manifest.js` 不用 `JSON+fetch` 的理由一致），`audio.js` 把等价的 key→path 映射
   内联成了 JS 常量。新增/修改 SFX 时两处都要改。

## 7. 各消费卡怎么用（快速对照）

| 卡 | 用什么 API | 备注 |
|---|---|---|
| 009 秘密词卡 | `playWord(word)` | 命中秘密词后播放对应发音；可先 `preloadManifest({words: WTJ_MANIFEST.secretWords.pool})` 预热 |
| 011 奖励卡 | `playSfx('chest-open')` 等 | 开箱声、发现槽点亮、连续任务奖励音效，见 `sfx-manifest.json` 的 `chest`/`ui` 分类 |
| 013 任务引擎卡 | `playTaskVoice(taskExample)`（对象穿透式）+ `playSfx('task-success')` + 需要时 `playComposite(...)` | 任务缺素材时天然 silent，可直接用作 mock adapter；`unlock()` 建议挂在任务系统的首次用户交互处调用 |
| 019 集成卡 | 全部 | 把 `<script src="audio.js">` 接入 `index.html`；统一 AudioContext（见第 4 节集成注记）；真实素材到位后按 `missing-audio.json` 逐条替换文件，无需改字段结构 |

## 8. 缺口清单维护方式

`missing-audio.json` 是**人工审阅用的静态清单**（不在运行时被 `fetch()`），按
`secretWords` / `sfx` / `taskVoice` / `compositePhrases` 四段列出所有仍然
`status: "not-delivered"` 的音频资产及其 `path`。当某个资产真正拿到授权/录制完成后：
1. 把 `.m4a` 文件放到清单里 `path` 字段指定的位置（相对 `app/web/`）；
2. 把该条目的 `status` 改成 `"delivered"`（或直接从清单删除，两种做法均可，QA 侧
   建议保留 `delivered` 记录以便追溯交付时间）；
3. **不需要改 `audio.js`、`manifest.js` 或本文档的路径字段**——路径从一开始就是按
   最终交付位置约定的。
