# 素材集成现状与缺口清单

对应飞书卡：`WTJ-20260704-019`（第一批核心：音频 file:// 加载层 + 素材缺口清单；
第二批：秘密词 pool 扩展到 Pack B 100 词 + 素材集成 + 清单更新）。

**本文件目的**：如实盘点截至本卡交付时刻，`app/web/` 运行时实际集成/消费了
哪些 DESIGN 交付的素材，哪些只是"DESIGN 已验收但尚未进入运行时"，哪些是**占位
（placeholder/stub）**、不得被误标为最终产品素材。所有数字均为本卡执行时**现场核对代码库
得到的真实值**（非转述其他文档的历史假设值）；若与飞书卡片交接文字描述的数字不一致，以本文件
现场核对结果为准，并在对应小节注明差异。

**第二批更新说明（2026-07-04，本次更新；含 PM 退回后的 narrow 数据 refresh）**：第一批交付时
（见第 9 节），秘密词词池扩展被列为"本卡不包含、留给后续卡"的缺口项。第二批已完成这项工作——
第 3 节已整体重写为完成后的现状（不再是缺口描述），第 1 节素材集成表格、第 6 节 placeholder
清单同步更新，第 5 节动效集成缺口补充了一轮"是否可以顺手做"的复杂度评估结论。**Pack B 曾是活
数据源、执行期间持续演进，现已 100% 产出完毕**：`docs/assets/production-pack-b/manifest.json`/
`missing-assets.json` 的 `updated_at_cst` 从任务交接时的 09:54 一路更新到本次 narrow refresh 的
**10:58**——`production_ready_count` 从 92 → 94 → 97 → **100**、`stubbed_pending_count` 从
8 → 6 → 3 → **0**（`xylophone`/`xray`、`yoyo`/`yarn`/`yak`、最后 `zebra`/`zipper`/`zucchini`
（卡 WTJ-20260704-054，PM 已验收）陆续由 stub 转 ready）。本文件所有数字**以最新状态（10:58）
现场核对结果为准：Pack B 已 100% ready、0 stub**，见第 3 节详述。

---

## 1. 已集成（DESIGN 验收 **且** 已拷贝进 `app/web/assets/` **且** 已被运行时代码消费）

| 目录 | 文件数 | 来源卡 / REQ | 消费方 | Provenance |
|---|---|---|---|---|
| `app/web/assets/sprites/` | 102 个 PNG（= 101 ready sprite + 1 共享占位图 secret-word-placeholder.png，后者 Pack B 全 ready 后已无 pool 引用、仅备用保留）。首批 8：dog/cat/apple/ball/star/car/basket/treasure-chest；第二批 93 个 Pack B ready sprite（85 首拷 + 后补 xylophone/xray/yoyo/yarn/yak/zebra/zipper/zucchini 8 个） | WTJ-20260703-007 / REQ-AST-12（首批）+ WTJ-20260704-006 Pack B / 本卡 019 第二批（新增） | `secretword.js`（命中反馈 sprite 叠层 + 五槽点亮图标，消费逻辑未改，读取词池数据自动扩展生效） | `app/web/assets/sprites/PROVENANCE.md` |
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

## 3. 秘密词词池扩展（Pack B，100 词目标）—— 已完成集成（本卡 019 第二批），现场核对数字为准

**现场核对时间**：2026-07-04（本卡第二批执行期间，Pack B 源数据持续变动，见下方说明）。
数据来源：`docs/assets/production-pack-b/manifest.json` + `missing-assets.json`。

**状态变化**：第一批交付时（见第 9 节历史记录），这里是一份"缺口清单"——`secretWords.pool`
还是 8 词样例，Pack B 的 ready sprite 一个都没拷贝进运行时。**第二批（含 PM 退回后的 narrow
数据 refresh）已完成这轮集成，且 Pack B 已 100% 产出**：`app/web/manifest.js` 的
`secretWords.pool` 已从 8 词扩展/同步到 Pack B 完整词池（100 词全 ready），
`app/web/assets/sprites/` 已拷贝 Pack B 全部 ready sprite，009（`secretword.js`）无需改动即可
读取新词池（`pool` 是数据，引擎遍历它，见 `app/web/MANIFEST.md`「新增词池条目的步骤」第 5 条）。

| 指标 | 数值（最新状态 2026-07-04 10:58 现场核对） |
|---|---|
| Pack B 目标词数 | 100 |
| Pack B 生产就绪（sprite 已产出）| **100（全部 ready）** |
| Pack B 仍是 stub 占位（无真实 sprite）| **0**（Pack B 已 100% 产出，`zebra`/`zipper`/`zucchini` 最后 Z 组由卡 WTJ-20260704-054 补齐、PM 已验收） |
| `app/web/manifest.js` `secretWords.pool` 实际长度 | **101**（Pack B 100 + 1 条非 Pack B 遗留词 `treasurechest`，见下方说明） |
| pool 内 ready 词（`spriteStub` 未设置）| **101（全部 ready）**（Pack B 100 ready + `treasurechest` 1） |
| pool 内 stub 词（`spriteStub: true`）| **0**（词池内已无任何 stub，全部指向真实 sprite） |
| `app/web/assets/sprites/` 磁盘 PNG 数 | **102**（101 ready sprite + 1 共享占位图；占位图现已无 pool 引用、仅备用保留，`tests/unit/secretword-pool-integrity.test.mjs` 用例 10 双向计数断言把它列为已知白名单孤儿并校验其余 101 个 PNG 与 pool 引用严格一一对应） |

**Pack B 曾是活数据源、执行期间持续演进，现已 100% 产出完毕**：任务交接时的参考数字是
`production_ready_count=92`/`stubbed_pending_count=8`（`updated_at_cst: 2026-07-04 09:54`）；
本卡执行过程中 DESIGN 侧分批交付——`WTJ-20260704-052`（`xylophone`/`xray`，10:23，ready 94）→
batch-04（`yoyo`/`yarn`/`yak`，10:38，ready 97）→ **`WTJ-20260704-054`
（`zebra`/`zipper`/`zucchini`，10:58，ready 100，PM 已验收）**。PM 把 019 退回做一次 narrow 数据
refresh 以吸收这最后一批，本文件按最新状态（10:58）落地：8 个从 stub 转 ready 的词
（xylophone/xray/yoyo/yarn/yak/zebra/zipper/zucchini）sprite 均已拷贝、`manifest.js` 对应条目
均已去掉 `spriteStub`。**Pack B 已 100% ready、0 stub，词池内无任何 stub 残留**。曾用于占位的
共享图 `secret-word-placeholder.png` 现已无 pool 条目引用，作为备用素材保留在
`app/web/assets/sprites/`，不被运行时加载。

**7 个与首批 8 词重名的词，沿用已验收 v3 baseline sprite，不切换成 Pack B 重生成版**：
Pack B 词池里 `dog / cat / apple / ball / star / car / basket` 这 7 个词与"首批 8 词"同名，
但 Pack B 为它们重新生成了一版不同的 sprite（md5 与已验收的 v3 baseline 不同，逐一核对过，见
`app/web/assets/sprites/PROVENANCE.md`）。本卡按"以已验收为准，避免重复/冲突"的原则，
`secretWords.pool` 里这 7 个词继续指向已验收且已被 `tests/unit/secretword-engine.test.mjs`
覆盖的 v3 baseline 文件（`sprites/dog.png` 等），Pack B 对应的重生成版本**没有**被拷贝进
`app/web/assets/sprites/`（仍只停留在 `docs/assets/production-pack-b/sprites/` 供参考）。

**非 Pack B 的遗留词 `treasurechest`（pool 第 101 条）——PM 已裁决保留**：Pack B 的 100 词里 T
组用的是字面不同的正式词 `treasure`（本卡已拷贝对应 sprite `sprites/treasure.png`），并不包含
`treasurechest`。`treasurechest` 是 004/009 卡落地的"首批 8 词"基线遗留词，其对应 sprite
`treasure-chest.png` 在 `docs/index.html` 素材章节原本对应 REQ-AST-06（宝箱）而非 REQ-AST-04
（秘密词对应物体）。本卡**保留**这个词（`app/web/audio/missing-audio.json` 早已把它登记为
`additionalManifestOnlyWords: 1`、`secretWords.totalNotDelivered: 101` 的一部分），作为 pool 第
101 条并在 `manifest.js`/`PROVENANCE.md` 里如实注明。**PM 已裁决正式保留 `treasure` 与
`treasurechest` 两个词**（详见下方 PM 决策项）。

> **PM 决策项（对抗评审发现 → PM 已裁决保留，如实登记）**：`treasure.png`（Pack B 正式词
> `treasure`）与 `treasure-chest.png`（遗留词 `treasurechest`）**像素级完全相同**（同 md5
> `92fa4ff18fcd6d138b141c4a9c112b74`，已逐字节核对）。因 `treasurechest` 以 `treasure` 为真
> 前缀，输入 `TREASURECHEST` 会先命中 `treasure`、再命中 `treasurechest`（REQ-SEC-10 复合顺序
> 独立触发，见 `tests/unit/secretword-engine.test.mjs` 用例 14），从而**点亮两个视觉上完全一样
> 图标的发现槽**——这与 REQ-SLOT-01「五格内不重复」的精神存在张力，对抗评审据此列为 PM 决策项。
> **裁决结果（本次 narrow refresh 落地）：PM 已裁决保留这两个共享同一 md5 sprite 的 token
> 词，不删除。** 因此 pool 保持 101 条（含 `treasurechest`）、`missing-audio.json` 口径不变、
> 两个引擎测试维持现状（用例 14 保留 `treasure`+`treasurechest` 复合触发断言）。

**历史遗留问题现状（大部分已裁决/缓解）**：`app/web/assets/sprites/PROVENANCE.md` 记录的
`basket`/`treasurechest` 词池归属问题，随 Pack B 扩展与 PM 裁决基本收敛——`moon` 已在 Pack B M
组正式补齐为秘密词、`basket` 已确认是 Pack B 100 词正式成员（B 组）、`treasure`/`treasurechest`
PM 已裁决保留（见上）。仅剩 `zoo` 仍无对应词（Pack B 未提供），如实记录，非本卡范围。

**回归验证**：`tests/unit/secretword-engine.test.mjs`（009 既有单测，用例 14 已同步更新为
101 词现状，其余用例不受影响）与新增的 `tests/unit/secretword-pool-integrity.test.mjs`
（12 项 pool 数据完整性/落地校验，含 101 词结构校验、ready 词 sprite 文件真实存在校验、
**0-stub 断言（全部 101 词 ready、词池内无 spriteStub）**、7 个重名词沿用 v3 baseline 校验、
**目录 PNG 与 pool 引用双向一致（占位图列为已知白名单孤儿）**、009 引擎装载新 pool 不抛错、
固定样本命中冒烟）均已跑绿，详见 `node --test 'tests/unit/*.test.mjs'`。

## 4. 音频缺口（137 条，**全部未交付**，与交接描述一致）

来源：`app/web/audio/missing-audio.json`（`grandTotalNotDelivered: 137`）：

| 类目 | 数量 | 备注 |
|---|---|---|
| 秘密词发音 `secretWords` | 101 | 对应 Pack B 100 词目标 + 1 个 manifest-only 额外词 |
| 音效 `sfx` | 20 | ui:5 / animal:8 / bell:2 / water:3 / chest:2 |
| 任务语音提示 `taskVoice` | 6 | |
| 组合短语 `compositePhrases` | 10 | 支撑 `playComposite()`，非验收硬指标 |

现场核对：仓库内**不存在任何 `.m4a` 文件**（`find . -iname "*.m4a"` 全仓无匹配），`missing-audio.json`
里全部 137 条状态均为 `not-delivered`。**本卡第一批解决的是加载层**（`wtjres://` 让
`fetch()` 在真实 `.m4a` 到位后能够成功加载并解码播放），**不产出、不采购任何音频素材**——
在真实素材到位前，`audio.js` 的降级契约（见 `audio/AUDIO-API.md` §5）会让所有播放调用继续
静默降级，这是设计内的预期行为，不是回归。

**第二批更新**：`missing-audio.json` 早在第一批交付时就已经把 `secretWords` 类目的数量口径
（101 = Pack B 100 + `treasurechest` 1）当作"未来 pool 应该长成的样子"来登记；第二批完成 pool
扩展后，`app/web/manifest.js` 的 `secretWords.pool` 实际长度（101）与这份音频缺口清单的口径
现已**完全对齐**（此前 pool 只有 8 词，两者不一致）。`audioFile` 路径约定（`audio/words/
<word>.m4a`）逐词核对一致，未发现遗漏或路径拼写偏差（见 `tests/unit/
secretword-pool-integrity.test.mjs` 用例 2）。仍然是 137 条全部未交付，本卡第二批同样不产出、
不采购任何音频素材，只同步数据。

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

**第二批（本卡）复杂度评估结论：不做，列为 019 剩余，需要独立卡**。评估依据（现场核对
`docs/assets/production-animations-v1/` 结构与各 `manifest.json`）：

- 逐道具真实帧 PNG 数量（不含 contact sheet/sheets 合图/source 底图）：bell 11、door 7、
  faucet 13、horse 18、lamp 13、treasure-chest 14，共 **76 张独立帧文件**。
- 每个道具的 `manifest.json` 定义的不是"idle/active 两态"，而是**每态各自独立的 fps/loop/
  anchor/bounds/frame_sheet/frames 数组**的小型动画时间轴——例如 `lamp/manifest.json` 定义了
  `off`（1 帧静态）、`turning-on`（6 帧 @12fps 不循环）、`on`（1 帧静态）、`turning-off`
  （5 帧 @10fps 不循环）四个独立状态，door/faucet/horse/bell 结构类似（各 3~4 个状态，状态名
  与当前 `task-templates.js` 的 `idle`/`active` 二态命名也不完全对应，如 `door` 是
  `closed/opening/open`、`faucet` 是 `off/closing/running`）。
- 要把这套真实帧动画接进运行时，需要新建一个**通用帧序列播放引擎**（读某道具当前
  manifest.json、按 fps 定时步进 frames 数组、非循环态播完停在最后一帧、用 anchor/bounds 做
  定位合成），并把 `task-templates.js` 现有的"设置一个 CSS class 属性"模型改造成"按任务生命周期
  事件切换到对应帧动画状态名"的更细粒度状态机——这是一块新的、有一定复杂度的运行时能力，不是简单
  的"把 data-anim-state 静态占位换成引用帧序列"式改动。
- 结论与 PM 预设的"倾向"一致：本批（019 第二批）聚焦 pool + sprite + 清单，**动效帧动画集成
  不在本卡做**，继续列为 019 剩余项，建议 PM/TL 拆出一张独立卡（帧序列播放引擎 + 5 道具接入）
  处理，其余细节见第 9/10 节完成范围小结。

## 6. Placeholder / stub 清单（明确标注，不得误标为 final）

| 项目 | 现状 | 位置 |
|---|---|---|
| lamp `idle`/`active` 两态 | 复用同一张 `lamp.png`，仅靠 CSS 第二层 `drop-shadow` 模拟"灯亮"，无真实分态贴图 | `app/web/assets/task-props/lamp.png` + `task-templates.css` |
| `lamp-off.png` / `lamp-on.png`（manifest.js 字面量） | 代码里用 `SPRITE_FILENAME_ALIASES` 别名到唯一真实存在的 `lamp.png`，两个文件名本身并不存在 | `task-templates.js` |
| doghouse | 单张静态 PNG，无任何动效/分态 | `app/web/assets/task-props/doghouse.png` |
| faucet / horse / door / bell（`data-anim-state`）| CSS-only 缩放脉冲 + 发光占位，**不是**第 5 节所列已验收帧序列动效的最终效果 | `task-templates.css` `[data-anim-state="active"]` 规则 |
| ~~Pack B 缺口词 sprite~~（**已清零**：现场核对 8 → 6 → 3 → 0，全部由 052/054 等卡陆续补齐并落地） | 词池内已无任何 stub；共享占位图 `secret-word-placeholder.png` 现已无 pool 引用，作为备用素材保留（不被运行时加载，不再是 placeholder 缺口） | `docs/assets/production-pack-b/missing-assets.json`（`updated_at_cst: 10:58`，`missing_count: 0`）+ `app/web/manifest.js` `secretWords.pool`（全 ready） |
| `keyboard-milestone` 里程碑 sprite | manifest.js 原文注释已自曝：`states/keyboard-star.png（stub，素材未到位，待素材卡供给）`，`docs/assets/` 下未找到对应源文件 | `app/web/manifest.js`（secretWords 段附近，slots.sourceIconHint） |
| 全部音频（137 条，含本卡新扩展的 101 条秘密词发音）| 100% 未交付，`audio.js` 静默降级（sprite 素材已 100% 到位，但音频仍全缺，见第 4 节） | 见第 4 节 |
| 动效帧动画（bell/door/faucet/horse/lamp，共 76 帧）| 设计源已验收，运行时仍是 CSS 占位（缩放脉冲 + drop-shadow），未消费任何真实帧序列 | 见第 5 节评估结论 |

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
  wtjres:// 改动无关，本卡第一批未处理，仍待 PM/TL 后续裁决统一。第二批（词池扩展到 101 词）
  延续了同一前缀写法，把新增词条目的 `spriteFile` 继续写成不带 `assets/` 前缀的
  `'sprites/xxx.png'`，靠 `secretword.js` 现有的 `resolveSpritePath()` 补前缀——101 处都保持
  一致写法，没有借词池扩展的机会顺带统一掉这个遗留问题（那需要同时改 101 条 pool 数据 + 决定是否
  改 `resolveSpritePath()`，超出本卡"数据 + 素材"范围），仍待后续裁决。

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

（以上是第一批交付时的历史记录，原样保留不改写。词池扩展工作已在第二批完成，见第 3 节与下方
第 10 节；其余三项——动效帧序列接入、states/style 集成裁决、真实音频采购——第二批同样未做，
仍是缺口，见第 10 节。）

## 10. 本卡（019 第二批）实际完成范围小结

**完成**（含 PM 退回后的 narrow 数据 refresh，把 Pack B 最后 Z 组吸收进来）：
1. 秘密词词池扩展/同步：`app/web/manifest.js` 的 `secretWords.pool` 从 8 词扩展为 101 词
   （Pack B 100 + 遗留词 `treasurechest` 1）。narrow refresh 后 Pack B 已 **100% ready**——现场
   核对源数据最新状态（`updated_at_cst: 2026-07-04 10:58`，`production_ready_count: 100`、
   `stubbed_pending_count: 0`），词池内**已无任何 `spriteStub`，101 条全部 ready**，指向真实
   sprite。
2. Pack B ready sprite 集成：93 个 Pack B ready sprite（85 个首拷 + 后补
   `xylophone`/`xray`/`yoyo`/`yarn`/`yak`/`zebra`/`zipper`/`zucchini` 8 个）+ 1 个共享占位图
   拷贝进 `app/web/assets/sprites/`，与首批 8 个 v3 baseline sprite 共存于同一目录，目录现共
   **102 个 PNG**（101 ready sprite + 1 占位图，占位图 Pack B 全 ready 后已无 pool 引用、仅备用
   保留）；7 个重名词（dog/cat/apple/ball/star/car/basket）明确决定沿用已验收 v3 baseline、
   不切换成 Pack B 重生成版，避免重复/冲突。`app/web/assets/sprites/PROVENANCE.md` 已补全两批次
   的完整来源追溯记录（含逐行 md5 校验、复制清单、遗留问题更新）。
3. 音频 key/placeholder 清单核对：确认 `app/web/audio/missing-audio.json` 的 `secretWords`
   101 条口径与本卡落地的 pool 长度（101）完全一致，`audioFile` 路径命名逐词核对无偏差；137 条
   音频仍全部未交付，本卡不采购/不产出任何音频素材，只确认数据口径对齐。
4. treasure/treasurechest PM 裁决落地：PM 已裁决**保留** `treasure` 与 `treasurechest` 两个
   共享同一 md5 sprite 的 token 词（不删除），第 3 节 PM 决策项已从"待裁决"更新为"已裁决保留"。
5. `INTEGRATION-STATUS.md` 更新：第 1/3/4/6 节据实更新为 Pack B 100% ready 后的现状，历史记录
   （第 9 节）原样保留未改写。
6. 动效帧序列集成复杂度评估：现场核对 `docs/assets/production-animations-v1/` 结构（76 张独立
   帧文件、每道具多状态 fps/loop/anchor 时间轴），结论为"需要独立的帧序列播放引擎，非简单数据
   替换"，按 PM 预设倾向不在本批做，列为 019 剩余，建议拆独立卡处理（详见第 5 节）。
7. 测试：新增 `tests/unit/secretword-pool-integrity.test.mjs`（12 项 pool 完整性/落地校验，含
   用例 10 的**目录 PNG 与 pool 引用文件名双向计数断言**——既查悬空引用、也查未被引用的孤儿
   sprite，占位图列为已知白名单孤儿；narrow refresh 后用例 4/5 更新为 **ready=101 / stub=0**
   的全-ready 断言）；更新既有 `tests/unit/secretword-engine.test.mjs` 用例 14 以匹配 101 词
   现状（原用例硬编码"首批 8 词"假设，且未预料到词池扩展后 `treasure`/`treasurechest` 前后缀
   复合触发的正确行为，现已按真实数据更新断言，非引擎回归）。
   `node --test 'tests/unit/*.test.mjs'` 全绿（150 项，含本卡新增 12 项 pool 完整性测试；总数含
   另一 agent 并行交付的 reward-chest 测试，与本卡改动无冲突）。

**不包含在本卡**（明确列为 019 剩余，留给后续卡）：
- 6 张动效卡（026/028/029/030/031/032）帧序列接入 `task-templates.js`/`css`（需要新建帧序列
  播放引擎，见第 5 节评估）。
- `docs/assets/states/` 与 `docs/assets/style/` 是否需要正式集成进 `app/web/assets/` 的裁决
  （第 2 节遗留问题，未变化）。
- 任何真实音频素材（137 条）的采购/接入。
- ~~Pack B stub 词再集成~~（**已完成**：Pack B 100 词全部 ready，本次 narrow refresh 已把最后
  Z 组 zebra/zipper/zucchini 落地，词池 0 stub）。
- `zoo` 词是否补齐（Pack B 未提供对应词；`basket`/`treasure`/`treasurechest` 归属 PM 已裁决保留，
  见第 3 节）。
- `manifest.js` `spriteFile` 前缀（`sprites/` vs `assets/sprites/`）与 `resolveSpritePath()`
  的统一裁决（第 8 节，101 条词池条目延续现状写法，未改动）。
