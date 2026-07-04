# 素材集成现状与缺口清单

对应飞书卡：`WTJ-20260704-019`（第一批核心：音频 file:// 加载层 + 素材缺口清单）。

**本文件目的**：如实盘点截至本卡交付时刻（2026-07-04），`app/web/` 运行时实际集成/消费了
哪些 DESIGN 交付的素材，哪些只是"DESIGN 已验收但尚未进入运行时"，哪些是**占位
（placeholder/stub）**、不得被误标为最终产品素材。所有数字均为本卡执行时**现场核对代码库
得到的真实值**（非转述其他文档的历史假设值）；若与飞书卡片交接文字描述的数字不一致，以本文件
现场核对结果为准，并在对应小节注明差异。

---

## 1. 已集成（DESIGN 验收 **且** 已拷贝进 `app/web/assets/` **且** 已被运行时代码消费）

| 目录 | 文件数 | 来源卡 / REQ | 消费方 | Provenance |
|---|---|---|---|---|
| `app/web/assets/sprites/` | 8（dog/cat/apple/ball/star/car/basket/treasure-chest） | WTJ-20260703-007 / REQ-AST-12 | `secretword.js`（命中反馈 sprite 叠层 + 五槽点亮图标） | `app/web/assets/sprites/PROVENANCE.md` |
| `app/web/assets/task-props/` | 8（apple/basket/bell/doghouse/door/faucet/horse/lamp） | WTJ-20260704-005 / REQ-AST-05 | `task-templates.js`（拖拽/点击任务示例；仅 4/8 文件当前被 `manifest.js` 实例引用，见下方「未被 manifest 引用」说明） | `app/web/assets/task-props/PROVENANCE.md` |
| `app/web/assets/rewards/` | 2（sparkle-burst.png / star-sticker.png） | Pack A（WTJ-20260704-005） | 奖励表现（011/015：开箱高光、连续完成奖励） | `app/web/assets/PROVENANCE.md` |
| `app/web/assets/ui/` | 3（five-slot-tray / question-mark-token / working-status-light） | WTJ-20260704-005 | `hud.js`（007 主 HUD） | `app/web/assets/PROVENANCE.md` |
| `app/web/style.css` | — | WTJ-20260703-006 / REQ-AST-11（style-baseline） | 全站样式 | 非字面拷贝，是工程师按 `docs/assets/style/visual-style-tile.png` 视觉方向**手写实现**的 CSS，见第 2 节说明 |

`task-props/` 里 **bell / door / faucet / horse** 4 个文件目前只是"素材已就位、静态资源已拷贝"，
`manifest.js` 的 `tasks.templates.*.examples[]` 尚无任何实例引用它们（见
`app/web/assets/task-props/PROVENANCE.md`「集成范围」一节），供未来新增任务实例直接复用，不需要
再补素材。

## 2. 已验收但**未集成到运行时**（现场核对得到的真实缺口，与部分历史描述不一致，需注意）

以下两项在 `app/web/manifest.js` 的 `assets.deliveredCards` 里被标记 `status: 'accepted'`，
但**核对结果是**：它们只存在于 `docs/assets/`（DESIGN 验收产物/参考），从未被拷贝进
`app/web/assets/`，也没有任何 `app/web/*.js`/`*.css` 引用这些文件名——即"设计已验收"不等于
"运行时已集成"，这是本卡现场核实后需要澄清的一点：

- **`docs/assets/states/`（4 张核心状态图，WTJ-20260703-005 / REQ-AST-10）**：
  `default-canvas.png`、`treasure-reward.png`、`secret-word-dog.png`、`question-task-drag.png`。
  全文搜索 `app/web/` 未发现任何代码引用这 4 个文件名（含无扩展名的 stem）。目前看更像是
  "给工程实现对齐的视觉方向参考图"，而非"要被运行时按文件名加载的图片资源"——但这只是根据现状
  代码行为的推测，**没有找到任何文档明确这 4 张图的运行时消费方式**，需要 PM/TL 确认：
  ① 这 4 张图本就只是参考图、无需集成，还是 ② 遗漏了一步"拷贝 + 接入"的集成工作。
- **`docs/assets/style/`（style-baseline，WTJ-20260703-006 / REQ-AST-11）**：
  `visual-style-tile.png` + `visual-style-tile.html`。同样未被拷贝进 `app/web/assets/`；
  `app/web/style.css` 是工程师参照这张风格板手写的 CSS 实现，不是该文件的直接拷贝或引用。这种
  "设计板 -> 手写 CSS 复刻" 的集成方式本身合理，但如果风格板后续修订，不会有任何自动化机制提醒
  `style.css` 需要同步更新——与其余素材"拷贝 + PROVENANCE 记录"的模式不同，值得 PM/TL 知悉。

## 3. 秘密词词池扩展（Pack B，100 词目标）—— 现场核对数字与卡片交接描述不一致，以本节为准

**现场核对时间**：2026-07-04（本卡执行时）。数据来源：
`docs/assets/production-pack-b/manifest.json` + `missing-assets.json`。

| 指标 | 数值 |
|---|---|
| 目标词数 | 100 |
| 生产就绪（sprite 已产出）| **92** |
| 仍是 stub 占位（无真实 sprite）| **8** |

仍缺 sprite 的 8 个词（均为 X/Y/Z 开头，占位图统一是
`docs/assets/production-pack-b/stubs/secret-word-placeholder.png`）：
`xylophone / xray / yoyo / yarn / yak / zebra / zipper / zucchini`。

**与本卡交接文字描述的偏差（需 PM 知悉）**：交接材料中提到"100 词中缺 63 个 sprite"，TL 分支
交付时现场核对为缺口 **12**、已就绪 **88**；随后 PM 已接受 `WTJ-20260704-051` 并把 W 组
`whale/watch/window/wagon` 合入 main，当前主干以 `docs/assets/production-pack-b/missing-assets.json`
的 `updated_at_cst`（2026-07-04 09:54）为准：实际缺口 **8**、已就绪 **92**。

**更重要的一层缺口（即使 92 个已就绪也不能直接用）**：`app/web/manifest.js` 的
`secretWords.pool` **目前仍是 004/009 卡落地的"首批 8 词"v3 基准样例**
（dog/cat/apple/ball/star/car/basket/treasurechest），Pack B 的 92 个已就绪 sprite **一个都没有**
被拷贝进 `app/web/assets/sprites/`，也没有被写入 `secretWords.pool`。也就是说词池从 8 词扩展到
100 词规模，除了"补齐剩余 8 个 sprite"这个设计缺口外，还需要一轮独立的**集成工作**（拷贝 92+
个文件 + 扩充 `manifest.js` 的 `pool` 数组 + 对应音频，见第 4 节）——manifest.js 依据本卡
"不碰 manifest.js" 的范围限制，未在本卡改动，留给后续词池扩展卡处理。

另外，`app/web/assets/sprites/PROVENANCE.md` 已记录一个未决问题：`basket` / `treasurechest`
两个词是为了凑够"首批 8 词对应已验收 sprite"而选用，与 `docs/index.html` `#secret` 章节给出的
示例词标签（dog/cat/apple/ball/**moon**/star/car/**zoo**）不完全一致，仍待 PM/DESIGN 裁决是否
保留。本卡不重复裁决，仅再次指出。

## 4. 音频缺口（137 条，**全部未交付**，与交接描述一致）

来源：`app/web/audio/missing-audio.json`（`grandTotalNotDelivered: 137`）：

| 类目 | 数量 | 备注 |
|---|---|---|
| 秘密词发音 `secretWords` | 101 | 对应 Pack B 100 词目标 + 1 个 manifest-only 额外词 |
| 音效 `sfx` | 20 | ui:5 / animal:8 / bell:2 / water:3 / chest:2 |
| 任务语音提示 `taskVoice` | 6 | |
| 组合短语 `compositePhrases` | 10 | 支撑 `playComposite()`，非验收硬指标 |

现场核对：仓库内**不存在任何 `.m4a` 文件**（`find . -iname "*.m4a"` 全仓无匹配），`missing-audio.json`
里全部 137 条状态均为 `not-delivered`。**本卡（019）解决的是加载层**（`wtjres://` 让
`fetch()` 在真实 `.m4a` 到位后能够成功加载并解码播放），**不产出、不采购任何音频素材**——
在真实素材到位前，`audio.js` 的降级契约（见 `audio/AUDIO-API.md` §5）会让所有播放调用继续
静默降级，这是设计内的预期行为，不是回归。

## 5. 动效卡集成缺口（026/028/029/030/031/032：faucet/horse/treasure-chest/door/bell/lamp）

**现场核对更正**：这 6 张动效卡的**设计源产物其实已经交付并验收**，位于
`docs/assets/production-animations-v1/{faucet,horse,treasure-chest,door,bell,lamp}/`，每个目录
都有完整的多帧序列（如 horse 的 idle/run/stop-success）、`manifest.json`
（fps/loop/anchor/bounds/frames/sheet 路径）、暗底验收接触表，git 历史也能看到对应的
"assets: accept ... animation v1" 验收提交。卡号对应关系（引自各目录 README「对应飞书卡」）：

| 道具 | 卡号 | 源目录 |
|---|---|---|
| faucet（关水动效）| WTJ-20260704-026 | `docs/assets/production-animations-v1/faucet/` |
| horse（奔跑动效）| WTJ-20260704-028 | `docs/assets/production-animations-v1/horse/` |
| treasure-chest（开箱动效）| WTJ-20260704-029 | `docs/assets/production-animations-v1/treasure-chest/` |
| door（开门动效）| WTJ-20260704-030 | `docs/assets/production-animations-v1/door/` |
| bell（摇铃动效）| WTJ-20260704-031 | `docs/assets/production-animations-v1/bell/` |
| lamp（开关灯动效）| WTJ-20260704-032 | `docs/assets/production-animations-v1/lamp/` |

**但这些动效序列全部未被集成进 `app/web` 运行时**：`app/web/assets/task-props/` 下每个道具仍
只有**单张静态 PNG**（来自 Pack A，non-animated），`task-templates.js`/`task-templates.css`
对这 5 类道具（faucet/horse/door/bell/lamp）统一只实现了 `data-anim-state="idle"/"active"`
两态的 **CSS 占位效果**（缩放脉冲 + `drop-shadow` 发光），**不消费** 上述任何一套真实帧序列/
frame sheet/manifest.json。这一点 `app/web/assets/task-props/PROVENANCE.md`「animation state
接口预留」一节已明确记录、本卡现场复核属实。**结论：这 6 张动效卡的设计产出已验收，但集成到
运行时的工作尚未发生**——这与"未交付"的表述有细微但重要的差别，请 PM/TL 注意：接下来需要的是
"把 docs/assets/production-animations-v1/ 的帧序列接入 task-templates.js/css"这一类集成卡，
而不是重新去产出这些动效素材。

## 6. Placeholder / stub 清单（明确标注，不得误标为 final）

| 项目 | 现状 | 位置 |
|---|---|---|
| lamp `idle`/`active` 两态 | 复用同一张 `lamp.png`，仅靠 CSS 第二层 `drop-shadow` 模拟"灯亮"，无真实分态贴图 | `app/web/assets/task-props/lamp.png` + `task-templates.css` |
| `lamp-off.png` / `lamp-on.png`（manifest.js 字面量） | 代码里用 `SPRITE_FILENAME_ALIASES` 别名到唯一真实存在的 `lamp.png`，两个文件名本身并不存在 | `task-templates.js` |
| doghouse | 单张静态 PNG，无任何动效/分态 | `app/web/assets/task-props/doghouse.png` |
| faucet / horse / door / bell（`data-anim-state`）| CSS-only 缩放脉冲 + 发光占位，**不是**第 5 节所列已验收帧序列动效的最终效果 | `task-templates.css` `[data-anim-state="active"]` 规则 |
| Pack B 8 个缺口词 sprite | 统一占位图 `docs/assets/production-pack-b/stubs/secret-word-placeholder.png` | `docs/assets/production-pack-b/missing-assets.json` |
| `keyboard-milestone` 里程碑 sprite | manifest.js 原文注释已自曝：`states/keyboard-star.png（stub，素材未到位，待素材卡供给）`，`docs/assets/` 下未找到对应源文件 | `app/web/manifest.js` L184 |
| 全部音频（137 条）| 100% 未交付，`audio.js` 静默降级 | 见第 4 节 |

## 7. REQ-DEF-02 核对：docs mock 不作为运行时素材

现场核对 `docs/index.html`（L732）：`accepted-mvp-mockup.png` 仅在该文档内以
`<img class="mock-image" src="assets/accepted-mvp-mockup.png">` 被引用，物理文件位于
`docs/assets/accepted-mvp-mockup.png`。全仓搜索确认 `app/web/assets/` 下**不存在**该文件、
`app/web/` 任何 JS/CSS 均未引用它。**结论：该 mock 图确认只服务于 `docs/` 文档展示，不是、也
从未被当作产品运行时素材，符合 REQ-DEF-02 要求，无需改动。**

## 8. 文档过期项（本卡范围明确不含"修复其它文件"，仅如实记录供 PM/后续卡处理）

本卡改动范围限定在 `shell/main.swift` / `build.sh`（如需）/ 本文件 / `audio/AUDIO-API.md`，
不碰 `app/web/` 下功能 js/css 与 `manifest.js`。以下文档提到的"file://"描述在切换到
`wtjres://` 之后已过期，但修复它们超出本卡范围，列在此处供后续卡（或 PM 批准后的小范围补丁）
处理：

- `app/web/index.html` 顶部注释（约 L4）：`"可被 file:// 直接加载（供 WKWebView loadFileURL
  使用）"`——现在页面经 `wtjres://` 加载，这句话字面已不准确（不过 `web/` 目录本身在断开原生壳、
  单独用浏览器打开调试时确实仍可被 file:// 直接打开，见 `app/README.md`，所以这句话在"独立预览"
  语境下依然成立，只是不再是 App 内加载的实际方式，容易引起混淆）。
- `app/web/audio.js` `loadArrayBuffer()` 上方注释（约 L389-399）：仍写着"019 必须把本函数
  替换为一种可用的加载方式"——本卡的结论是**该函数本身不需要替换**（问题在壳层用
  `WKURLSchemeHandler` 解决，`fetch()` 保持不变即可同源可用，见本次冒烟证据），但由于本卡范围
  明确排除 `app/web/` 功能 js 改动（含注释），这段现已过期的注释未做更新，建议 PM 批准一个
  仅改注释的最小后续改动。
- `app/web/manifest.js` `assets.runtimeDirs.sprites: 'sprites/'` 与 `secretWords.pool[].spriteFile`
  的 `'sprites/xxx.png'` 字面值，与实际集成路径 `app/web/assets/sprites/xxx.png` 之间的前缀
  不一致——这是 009 卡遗留的已知问题（详见 `app/web/assets/sprites/PROVENANCE.md`），与本卡
  wtjres:// 改动无关，本卡未处理，仍待 PM/TL 后续裁决统一。

## 9. 本卡（019 第一批）实际完成范围小结

**完成**：`shell/main.swift` 新增 `WTJResourceSchemeHandler`（`WKURLSchemeHandler` 实现，
MIME 映射 + 路径遍历防护）+ `setupWebView()` 改为通过 `wtjres://app/index.html` 加载（取代
`loadFileURL` file:// 方案），kiosk 与 `WTJ_WINDOWED` 窗口化调试模式共用同一加载路径。已用
真实音频文件（临时冒烟素材，验证后已移除）证明 `fetch()` 在 `wtjres://` 下同源可用、状态码
200、`response.type === 'basic'`（非 `opaque`，证明不是被 CORS 降级的跨源响应）；缺失资源正确
走 `didFailWithError`（404 语义），未见崩溃。窗口化冒烟同时验证了键盘输入、秘密词命中 sprite
弹出、HUD 五槽点亮、Cmd+W 拦截等既有功能在新加载方式下无回归。

**不包含在本卡**（留给后续卡）：秘密词词池从 8 词扩展到 100 词的集成工作（拷贝 Pack B sprite +
扩充 `manifest.js` pool + 对应音频）；6 张动效卡（026/028/029/030/031/032）帧序列接入
`task-templates.js`/`css`；`docs/assets/states/` 与 `docs/assets/style/` 是否需要正式集成进
`app/web/assets/` 的裁决；任何真实音频素材的采购/接入；第 8 节列出的文档过期措辞修正。
