# manifest.js 消费说明

`app/web/manifest.js` 是 WorkTime Justin 应用可读的产品数据模型与参数表，来源单一参照
`docs/index.html`（需求文档 v0.1，尤其 `#params` 参数与阈值总表）。它把散落在需求文本各章节
的阈值、词池、任务模板、素材与音频引用收敛到一个文件里，运行时通过 `window.WTJ_MANIFEST`
暴露给 `app.js` 及后续各引擎模块。

## 核心原则：改 manifest 不改代码

凡是能用数据表达的行为（阈值、词池条目、素材路径、模板结构），一律只改
`app/web/manifest.js`，不要把新的数值或字符串硬编码进 `app.js` 或未来的引擎模块。
新增一个秘密词、调整一个超时时长、替换一个素材路径，理想情况下只涉及本文件的一次编辑，
不需要改动消费方代码逻辑。若某个消费方发现自己必须为了读一个新字段而改逻辑（而不是改
manifest 里的值），说明 schema 设计得不够，应该先扩展 schema 而不是绕过 manifest 直接硬编码。

## 加载方式

`index.html` 用普通 `<script>` 标签顺序加载：

```html
<script src="manifest.js"></script>
<script src="app.js"></script>
```

`manifest.js` 是非 module 的 IIFE，执行后把一个深冻结（`Object.freeze` 递归应用到所有嵌套
对象/数组）的对象挂到 `window.WTJ_MANIFEST` 上。选择"JS 文件 + 全局变量"而非 JSON + `fetch`，
是因为 `file://` 直接双击打开时 `fetch` 会被浏览器 CORS 拦截（工程约束见 `docs/index.html`
文件头注释），而 `<script src>` 不受此限制。

深冻结意味着任何模块都不能在运行时修改 manifest 的值（包括修改数组/嵌套对象的属性）——
如果某个模块需要"运行时可变状态"（比如"当前已收集的词池条目""当前槽位点亮状态"），那属于
应用状态，应该由该模块自己的状态对象持有，从 manifest 读初始配置，不要试图改写 manifest 本身。

## 读取契约（`getManifest()`）

`app.js` 顶部定义了一个 `getManifest()` 访问器：

```js
function getManifest() {
  if (window.WTJ_MANIFEST) {
    return window.WTJ_MANIFEST;
  }
  console.warn('[WTJ] window.WTJ_MANIFEST 未找到...');
  return DEFAULT_MANIFEST; // 内置最小默认值
}
```

后续新增的模块（键盘引擎、秘密词引擎等）如果是独立文件，应复用同样的模式：优先读
`window.WTJ_MANIFEST`，缺失时（例如单独打开旧版页面、或 manifest.js 加载失败）回退到一个
只覆盖自己需要的字段的最小默认值，并 `console.warn`，不要直接抛错阻断渲染。不要在多个文件
里重复实现"深冻结""默认值合并"这类基础设施——如果后续模块变多，考虑把 `getManifest()` 提升
成一个共享的小工具函数（不在本卡范围内，留给后续重构）。

## 各域结构与消费方

### `meta`
版本、来源文档、生成日期、卡片号。纯元信息，一般不被引擎模块读取，供 QA / 排障时确认
manifest 对应哪个需求文档版本。

### `keyboard` —— 008 键盘引擎卡消费
- `letterFadeMsRange`：字母弹出淡出时长区间（毫秒），`app.js` 当前已消费（`spawnLetter` 里
  `life: rand(range[0], range[1])`）。008 卡实现更完整的键盘引擎时应继续从这里读，不要重新
  写死一个固定值。
- `repeatSameKey.pauseAfterCount`：连续同键计数暂停的阈值（>3 次）。
- `doubleLetterException`：双写例外开关，008 卡需要结合秘密词候选子串判断是否命中此例外
  （逻辑本身由 008 卡实现，manifest 只提供开关和说明）。
- `effectiveKeyMilestones`：有效按键里程碑数组 `[100, 200]`，010 槽位引擎读取这个数组来判断
  何时点亮一个 `source: 'keyboard-milestone'` 的槽（见下方 `slots.sources`）。
- `functionKeys` / `functionKeyMashDecay`：功能键分类与衰减占位，008 卡实现具体衰减曲线时
  把最终常量写回这里（当前是占位结构，见字段内 `note`）。

### `secretWords` —— 009 秘密词引擎卡消费
- `matchRules`：命中判定规则开关集合（子串命中、重叠触发、双写不惩罚、同词重复只小反馈、
  大小写等价、复合顺序命中、最长词优先）。009 卡的匹配算法应该按这些开关实现，而不是把规则
  写死在代码里——如果某天需要关掉"最长词优先"做 A/B 测试，应该只改这里的 `longestMatchPriority`。
- `pool`：词池数组，每条 `{ word, spriteFile, audioFile }`。`word` 用于匹配用户按键流（纯小写
  字母），`spriteFile` 是 009 卡命中后要展示的对象贴图，`audioFile` 是要播放的语音/音效。
- `poolTargetSize` / `poolTargetPerLetter`：规模说明，非运行时直接消费的数值，供词池扩展时
  参考目标（约 100 词，26 字母 × 约 4 词/字母）。
- `audioNotDelivered` / `audioSupplyCard`：标记当前 8 条词的 `audioFile` 均为约定路径 stub，
  实际音频文件由 016 音频卡交付。009 卡实现时应对"文件不存在"做兜底（静音播放失败不报错阻断
  交互），不要假设文件一定存在。

**新增词池条目的步骤**：
1. 确认对应 sprite 已由 DESIGN 素材卡验收并落地到 `docs/assets/sprites/`（或运行时的
   `sprites/` 目录，视集成阶段而定）。
2. 在 `secretWords.pool` 数组追加一条 `{ word: '<小写字母，仅 a-z>', spriteFile: 'sprites/<file>.png', audioFile: 'audio/words/<word>.m4a' }`。
3. 若音频尚未交付，`audioFile` 仍按约定路径填写（stub），不要留空或指向占位文件之外的路径。
4. 跑一遍一致性检查（可参照本卡验收时用的断言脚本思路）：`spriteFile` 对应文件在设计源目录
   真实存在、`word` 是纯小写字母、`audioFile` 命名符合 `audio/words/<word>.m4a` 约定。
5. 不需要改 `app.js` 或任何引擎代码——`pool` 是数组，009 卡的匹配逻辑应该遍历它，不针对具体
   词写 if/else。

### `slots` —— 010 槽位引擎卡消费
- `count`：槽位数量（5）。
- `noDuplicateSourceWithinRound`：同一轮内同一来源不重复点亮新槽的开关。
- `sources`：来源枚举 `['secret-word', 'keyboard-milestone']`，010 卡的槽位状态机应该只接受
  这个枚举里的来源类型，出现新来源类型时先扩展这个数组。
- `sourceIconHint`：每种来源对应的图标素材路径提示（`keyboard-milestone` 目前是 stub）。
- `onFull`：五槽满后的行为——触发哪个奖励（`chest`，对应 `rewards.chest`）、是否清空槽位。

### `tasks` —— 013 / 014 任务引擎卡消费
- `entry` / `timing`：问号任务的入口行为和时序阈值（15s 轻提示、30s 强化、45-60s 自动收起、
  20 个有效键转移判定、寻找类 1s 悬停判定）。013/014 卡的任务状态机应该是一个读这些时长驱动
  的定时器/状态转换，而不是把秒数写死在状态机代码里。
- `pressTask`：按键任务的按键类型限制（仅字母/数字）。
- `templates.{drag,click,find,press}`：四类任务模板，每类有 `schema`（字段说明，供任务作者/
  后续任务配置工具参照）和 `examples`（当前可直接使用的任务实例，未到位素材用 stub 路径 +
  行内注释）。013/014 卡实现任务加载器时，应该能读任意符合某个模板 `schema` 的任务配置对象
  并运行它，而不是只能跑 `examples` 里写死的这几个。新增一个任务实例，只需要在对应模板下的
  某个任务列表（未来可能从 `templates.drag.examples` 迁移到独立的 `tasks.instances` 之类的
  结构，视 013/014 卡实际需要的数据形状而定，本卡先提供了最小可行的 schema+examples 组织方式）
  里追加一条，不用改代码。

### `rewards` —— 011 / 015 奖励引擎卡消费
- `chest`：五槽满触发的一次性宝箱奖励配置，包括允许的表现形式、宝箱贴图路径、烟花类型预设
  （满天星/打铁花/圆形/星形）、颜色策略（少量高质量色板 + HSL/HSV 微调，不做完全 RGB 随机）、
  以及两条性能红线（`maxParticles: 300`、`disallowShadowBlur: true`——这两条来自技术评审的
  4GB 内存 / HD5000 核显预算，不对应 docs/index.html 的具体 REQ 编号，011/015 卡实现烟花效果
  时必须遵守，不要为了视觉效果突破这两条红线）。
- `statusLights`：角落工作状态灯配置（3 个灯、连续完成 3 个任务触发大奖励、大奖励的几种可选
  表现形式）。

### `pointer` —— 鼠标/触控反馈相关引擎（当前 app.js 的可视化层已实现基础版本，
后续若拆分独立的指针反馈引擎卡，从这里读配置）
- `move.idleDecayApproxSec`：约 3 秒乱晃衰减，文档原文是近似值，不是精确阈值。
- `click.rapidClickDecay` / `drag.elastic`：均带 `note` 字段说明"文档未给出精确数值，此处是
  结构占位"，实现时把最终调好的常量写回对应字段，不要在 manifest 之外另开一套参数。

### `exit` —— 017 退出桥接卡消费
- `escHoldSec`（5）、`passcodePlaceholder`（`"worktime"`）：**这两个值与 `shell/main.swift`
  原生层的常量（如 `kExitPasswordPlaceholder`）是镜像关系**，当前 web 层和原生层各自硬编码，
  尚未打通桥接。**修改任一处必须同步修改另一处**，否则会出现"web 层进度条显示的长按时长"与
  "原生层实际判定退出的长按时长"不一致的问题。017 卡的目标就是把这两层统一成单一数据源（大概率
  是原生层通过某种桥接把实际配置值传给 web 层，或者反过来），届时这里的注释和实现方式需要一并
  更新。
- `interceptedShortcuts` / `escDoesNotDirectlyExit` / `childSideExitEntryExists` 等：行为性
  开关，供退出流程相关的 QA 断言或未来的配置化实现参考。

### `assets` —— 所有素材消费方共用的路径契约
- `runtimeDirs`：运行时素材目录约定（`sprites/`、`states/`、`audio/`），相对 `app/web/`；
  未来打包后对应 `Resources/web/` 下同名目录（见 `app/README.md` 构建产物结构）。
- `designSourceDirs`：当前 DESIGN 素材实际存放位置（`docs/assets/...`），与 `runtimeDirs` 是
  两个不同的物理位置——素材验收后位于设计源目录，尚未被拷贝/裁剪进应用运行时目录，这一步由
  未来的集成脚本或构建步骤处理。**任何模块引用素材路径时，manifest 里的 `spriteFile` /
  `audioFile` 等字段一律写 `runtimeDirs` 风格的相对路径（如 `sprites/dog.png`），不要写
  `docs/assets/...` 路径**——后者只是当前素材的物理存放位置，不是运行时契约。
- `deliveredCards` / `inFlightCards`：素材卡交付状态追踪，供 QA 核对哪些引用已经有真实文件、
  哪些还是 stub。
- `audioPolicy`：音频相关的产品策略开关（不用 Chrome 内置发音、固定短句预生成、组合任务运行时
  生成后缓存、音效需授权来源），016 音频卡应遵守。

### `performance` —— 所有渲染/动效相关引擎共用的红线
- `maxResidentSprites`（20）、`maxParticles`（300）、`idleStopSec`（5）、
  `disallowShadowBlur`（true）：性能预算红线，来自目标机（2014 MacBook Air / 4GB 内存 /
  HD5000 核显）的技术评审结论，不是 `docs/index.html` 给出的数值（该文档 `#desktop` 章节只
  定性提出运行环境约束）。`app.js` 当前已消费 `idleStopSec`（`IDLE_TIMEOUT_MS = idleStopSec * 1000`）。
  任何新增的常驻贴图/粒子效果，实现时都要检查是否会突破这两条上限。

## 已知的文档/素材对齐问题（据实记录，未自行裁决）

`secretWords.pool` 里的 `basket`、`treasurechest` 两个词，是为了满足"首批 8 词对应已验收
sprite"这条架构指令而选用的——但 `docs/index.html` `#secret` 章节给出的示例词标签实际是
`dog / cat / apple / ball / moon / star / car / zoo`，且 `basket`（篮子）、`treasure chest`
（宝箱）在文档素材章节里原本对应的是 `REQ-AST-05`（任务物件）和 `REQ-AST-06`（宝箱），而不是
`REQ-AST-04`（秘密词对应物体）。`moon`、`zoo` 目前没有对应 sprite。这是"已验收素材"与"文档
秘密词示例"两条线索没有完全对齐导致的既成情况，本卡按 TL 指令实现，但没有权限替 PM/DESIGN 做
最终裁决。词池扩展卡或 016 音频供给卡启动前，建议 PM/DESIGN 明确：`basket`/`treasurechest`
是否保留为正式秘密词，或改回任务专用素材、另行补齐 `moon`/`zoo` 的 sprite。

## HUD API（`window.WTJ_HUD`，卡 WTJ-20260704-007）

`app/web/hud.js` 在 DOM 上渲染默认画布首屏的主 HUD（极简顶栏、右侧问号、底部五槽托盘、左下角
工作状态灯），并把一个**冻结对象**挂到 `window.WTJ_HUD`，供后续消费方（010 槽位引擎、013 任务
引擎、015 奖励引擎等）读写 HUD 展示状态，不用各自重新实现 DOM 结构。`hud.js` 只负责 HUD 的结构、
样式与最小状态机，不实现任何业务判定逻辑（秘密词命中、任务计时、奖励触发条件等仍由对应卡片实现，
通过下列 API 驱动 HUD 表现）。canvas 与 rAF 渲染循环仍由 `app.js` 独立维护，两者互不依赖。

### 依赖与加载顺序

`index.html` 中 `hud.js` 需在 `manifest.js` 之后加载——读取 `manifest.rewards.statusLights.count`
决定渲染几个状态灯，字段缺失或非法时防御式回退为 3 并 `console.warn`。与 `app.js` 之间没有依赖
关系，加载顺序互换不影响功能（当前 `index.html` 顺序为 `manifest.js` → `app.js` → `hud.js`）。

### 方法

- **`WTJ_HUD.setSlot(index, state)`** —— 设置第 `index`（0-based，0 ~ 4）个发现槽的展示状态。
  - `state === null`（或 `undefined`）：清空为空态（暗圈）。
  - `state = { spriteUrl: 'sprites/dog.png' }`：显示对应物体贴图（秘密词命中场景，见
    `secretWords.pool[].spriteFile`）。
  - `state = { milestone: true }`：显示星形占位（键盘探索里程碑场景，见
    `keyboard.effectiveKeyMilestones`）。
  - **`state` 同时包含 `milestone: true` 与合法 `spriteUrl` 两个字段时，`milestone` 优先**——
    渲染为星形占位，`spriteUrl` 被忽略。调用方（010 槽位引擎等）不应依赖"两者都传时以
    `spriteUrl` 为准"的行为，若需要按贴图渲染，不要在同一次调用里附带 `milestone: true`。
  - `index` 越界，或 `state` 是非 `null` 的非对象、或对象形状不合法（既无合法 `spriteUrl` 也非
    `milestone: true`）时，**不抛错**，`console.warn` 后原样忽略（不改变现有状态）。
- **`WTJ_HUD.clearSlots()`** —— 五槽全部清空为空态（五槽满触发宝箱后调用，见 `slots.onFull`）。
- **`WTJ_HUD.setStatusLight(index, on)`** —— 设置第 `index` 个工作状态灯的亮/灭（`on` 会被
  转换为布尔值，即 `!!on`）。灯的数量取 `manifest.rewards.statusLights.count`（当前 3 个）。
  `index` 越界时 `console.warn` 后忽略，不抛错。
- **`WTJ_HUD.onQuestionClick(fn)`** —— 注册问号点击回调（覆盖式，非追加式——只保留最后一次
  注册的 `fn`）。默认回调只是一条 `console.log` 占位，不做任何业务动作；013 任务引擎卡应调用
  本方法接管真实的问号任务入口逻辑。`fn` 非函数时 `console.warn` 后忽略，不覆盖已注册的回调。
  实际点击时 `hud.js` 内部在调用 `fn` 的地方包了 `try/catch`（见 `buildQuestion()`）——下游
  回调若抛出异常，只会被 `console.error` 记录，不会裸冒泡到 HUD 自身的事件处理链上，不影响
  HUD 其余交互（这条是 WTJ-20260704-007 Safari 14 兼容修复顺带补的健壮性修复，非该卡新增
  业务行为）。
- **`WTJ_HUD.setChestOpen(isOpen)`**（WTJ-20260704-083 返工，PM 打回①新增）—— footer 右侧
  **常驻**宝箱三态指示器（`.wtj-hud-chest-lane`/`.wtj-hud-chest`，与 011（`reward-chest.js`）
  满槽时播放的一次性开箱大奖励 Canvas 序列是两个独立视觉）的 Open 态入口。指示器的
  Disabled/Active 两态由 `setSlot`/`clearSlots` 的填槽进度自动推导（当前 `SLOT_COUNT` 个槽
  全部非空时自动切到 Active；`clearSlots()` 时无条件强制回落 Disabled）；`setChestOpen(true)`
  由 011 在其一次性开箱 Canvas 序列开始时调用，无条件切到 Open（复用 Active 态的
  `chest-active.png`，视觉区分交给 CSS 呼吸脉冲动画——DESIGN 082 明确"打开态不是第三张静态
  图"）；`setChestOpen(false)` 由 011 在序列自然播完/被 `reset()` 中止时调用，按**当前实际
  填槽情况**回落 Active 或 Disabled（不是恒定回落 Disabled，避免把仍然全满的真实进度错误
  清空）。
- **`WTJ_HUD.getState()`** —— 返回当前 HUD 状态的一份快照（普通对象，值拷贝，不是内部状态的
  引用，外部修改返回值不会影响 HUD 实际状态），结构为：
  ```js
  {
    slotCount: 5,
    slots: [null, { milestone: true }, { spriteUrl: 'sprites/dog.png' }, null, null],
    statusLightCount: 3,
    statusLights: [true, false, false],
    chestState: 'disabled' // 'disabled' | 'active' | 'open'，见上面 setChestOpen()
  }
  ```
  供 QA 断言或调试使用。

### 约束

- `window.WTJ_HUD` 本身用 `Object.freeze` 冻结（不可增删改顶层属性）；各方法内部状态在闭包内
  维护，不通过修改 `WTJ_HUD` 对象本身的属性来变更状态。
- HUD 容器（`.wtj-hud-root` 及其大多数子元素）`pointer-events: none`，仅右侧问号按钮
  （`.wtj-hud-question`）单独开启 `pointer-events: auto`，是当前唯一可交互的 HUD 元素——家长
  入口锁形 glyph（🔒）当前是纯展示占位，未开启 `pointer-events`，因此 `title` 属性暂不会在
  悬停时出现；实际"长按 Esc 5 秒退出"的判定逻辑由 017 卡接管，届时可能需要把
  `pointer-events: auto` 打开到锁形 glyph 上（对应 CSS 位于 `app/web/hud.css` 的
  `.wtj-hud-lock`）。
- 明确不做（REQ-SEC-01 / REQ-TASK-01 红线，QA 会盯）：不渲染任何输入框、终端回显条、右侧图标列
  （默认右侧只有问号一个元素）。
- 素材来源、集成范围与遗留事项见 `app/web/assets/PROVENANCE.md`。

### 后续卡片预告（本卡不实现）

- **013 任务引擎卡若需要问号的视觉强调**（比如新任务可用时的呼吸光晕/抖动提示），应在
  `hud.js` 里新增一个 `setQuestionEmphasis(on)` 方法（预告性质的接口占位，具体参数形状与
  表现由 013 卡设计时定），不要绕开 `WTJ_HUD` API 直接操作 `.wtj-hud-question` 的 DOM/class——
  这会破坏"HUD 状态只能通过 API 读写"的既有约束。本卡（WTJ-20260704-007）不实现该方法。

### Safari 14 兼容基线（WTJ-20260704-007 对抗评审修复，2026-07-04）

`hud.js` / `hud.css` 面向目标机（2014 MacBook Air / macOS Big Sur 11 / Safari 14 引擎）做过一轮
兼容性修复：`aspect-ratio`（Safari 15+）、`inset` 简写（Safari 14.1+）、flex `gap`
（Safari 14.1+）、`:hover, :focus-visible` 合写选择器（`:focus-visible` Safari 14 不识别，
合写会导致整条规则被丢弃）均已替换为 Safari 14 兼容写法，详见 `hud.css` 对应位置的行内注释。
`index.html` 的 `#debug` 调试叠层默认通过 `style.css` 隐藏（`display: none`），`hud.js` 的
`applyDebugQueryFlag()` 用 `URLSearchParams`（Safari 14 支持）解析 `?debug=1` 后恢复显示，
供后续卡片（如 008）调试用，不改动 `manifest.js`。后续卡片继续往 `hud.css`/`hud.js` 添加样式
或逻辑时，请延续这条基线（不使用 Safari 15+ 或 14.1+ 才支持的 CSS 特性、不假设 `:focus-visible`
在同一选择器列表里安全）。
