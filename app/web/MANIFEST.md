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
