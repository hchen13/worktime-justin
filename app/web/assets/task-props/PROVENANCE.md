# app/web/assets/task-props/ — 素材来源追溯（PROVENANCE）

本目录下的 8 个 PNG 是**运行时集成副本**：从 DESIGN 交付并已验收的素材包直接 `cp` 复制而来，
文件名与源交付路径保持一致，未做任何像素级修改（不裁剪、不压缩、不改格式、不改分辨率）。
复制前后逐一用 `md5` 核对校验和一致（见下表）。沿用 `app/web/assets/sprites/PROVENANCE.md`
（WTJ-20260704-009）与 `app/web/assets/PROVENANCE.md`（WTJ-20260704-007）同一套集成模式。

## 复制清单（本卡 WTJ-20260704-014 集成，四类任务模板：拖拽/点击/寻找/按键）

| 运行时路径 | 源路径 | 素材卡号 | REQ ID | 复制日期 | md5 |
|---|---|---|---|---|---|
| `app/web/assets/task-props/apple.png` | `docs/assets/production-pack-a/task-props/apple.png` | WTJ-20260704-005 | REQ-AST-05 | 2026-07-04 | `9c315170acfd8e9d0342fff0ff7968f0` |
| `app/web/assets/task-props/basket.png` | `docs/assets/production-pack-a/task-props/basket.png` | WTJ-20260704-005 | REQ-AST-05 | 2026-07-04 | `e16b6d77f8e70da668cd8f40388423ba` |
| `app/web/assets/task-props/bell.png` | `docs/assets/production-pack-a/task-props/bell.png` | WTJ-20260704-005 | REQ-AST-05 | 2026-07-04 | `0a307de04ae923ed1ae20fd703af6c61` |
| `app/web/assets/task-props/doghouse.png` | `docs/assets/production-pack-a/task-props/doghouse.png` | WTJ-20260704-005 | REQ-AST-05 | 2026-07-04 | `0dac701bd6cd268eaf5949567eac652d` |
| `app/web/assets/task-props/door.png` | `docs/assets/production-pack-a/task-props/door.png` | WTJ-20260704-005 | REQ-AST-05 | 2026-07-04 | `4739dfc2066cd8e30e2df8d14525e0bb` |
| `app/web/assets/task-props/faucet.png` | `docs/assets/production-pack-a/task-props/faucet.png` | WTJ-20260704-005 | REQ-AST-05 | 2026-07-04 | `6cc33a206f27ccf4173870a49e9ab294` |
| `app/web/assets/task-props/horse.png` | `docs/assets/production-pack-a/task-props/horse.png` | WTJ-20260704-005 | REQ-AST-05 | 2026-07-04 | `839d554eb2935150bced6084fbe8d5b7` |
| `app/web/assets/task-props/lamp.png` | `docs/assets/production-pack-a/task-props/lamp.png` | WTJ-20260704-005 | REQ-AST-05 | 2026-07-04 | `cf224b8728bbf2a9d21eaf5724d90f0a` |

规格（引自 `docs/assets/production-pack-a/manifest.json` / `README.md`）：PNG / RGBA / 1024×1024 /
透明背景 / 2.5D soft-plastic 儿童插画风格，四角 alpha 为 0，无 #ff00ff chroma-key 残留。
`apple` / `basket` 两个由 DESIGN 直接复制自已验收 v3 基准素材（与
`app/web/assets/sprites/apple.png` / `basket.png` 像素内容一致，来源同一批 v3 基准，
`source_note: "Copied from accepted v3 baseline sprite."`），其余 6 个
（bell/doghouse/door/faucet/horse/lamp）是 Pack A（WTJ-20260704-005）新增原创绘制。

## 与 `manifest.js` 的对应关系

`app/web/manifest.js` 的 `tasks.templates.*.examples[]` 目前引用的 sprite 字段：

| manifest 字段 | 字面值 | 本目录实际路径 |
|---|---|---|
| `drag.examples[0].objectSprite` | `sprites/apple.png` | `assets/task-props/apple.png`（本卡消费时统一加 `assets/task-props/` 前缀，见下方「路径解析」） |
| `drag.examples[0].targetSprite` | `sprites/basket.png` | `assets/task-props/basket.png` |
| `drag.examples[1].objectSprite` | `sprites/dog.png` | 复用 `app/web/assets/sprites/dog.png`（009 卡已交付的秘密词 sprite，不在本目录） |
| `drag.examples[1].targetSprite` | `sprites/doghouse.png`（manifest 注释标 stub） | `assets/task-props/doghouse.png`（**本卡已补齐**，不再是 stub） |
| `click.examples[0].targetSprite` | `sprites/lamp-off.png`（manifest 注释标 stub） | `assets/task-props/lamp.png`（**分态未到位**，idle/active 两态复用同一张图 + CSS 视觉区分，见下方「灯具分态」） |
| `click.examples[0].targetSpriteActive` | `sprites/lamp-on.png`（manifest 注释标 stub） | 同上，复用 `lamp.png` |
| `find.examples[0].targetSprite` | `sprites/dog.png` | 复用 `app/web/assets/sprites/dog.png` |
| `find.examples[0].distractorSprites` | `sprites/cat.png` / `sprites/ball.png` | 复用 `app/web/assets/sprites/` 下已交付的 cat.png / ball.png |

**路径解析约定**（与 `secretword.js` 的 `resolveSpritePath()` 同一模式，见
`app/web/assets/sprites/PROVENANCE.md`「运行时路径约定与已知偏离」一节）：`manifest.js` 里
`sprites/xxx.png` 这个字面值不能直接拼进 `<img src>`——运行时实际文件在
`app/web/assets/task-props/xxx.png` 或 `app/web/assets/sprites/xxx.png`，两个子目录都需要
`assets/` 前缀 + 各自子目录名。`task-templates.js` 内部维护的不是单张映射表，而是两张文件名
清单 + 一张别名表：`TASK_PROPS_FILENAMES`（本目录 8 个文件名，解析到 `assets/task-props/`）、
`SPRITES_FILENAMES`（复用的 dog/cat/ball 等已有 sprite 文件名，解析到 `assets/sprites/`），
以及 `SPRITE_FILENAME_ALIASES`（`lamp-off.png`/`lamp-on.png` 两个 stub 文件名各自别名到唯一
真实存在的 `lamp.png`，见下方「灯具 idle/active 分态说明」），不去改动只读的 `manifest.js`。
这是本卡范围内的最小修正，遗留的 `manifest.js` 路径字段统一问题与 009 卡记录的遗留事项是同一件
事，留给 PM/TL 后续裁决（见 `app/web/assets/sprites/PROVENANCE.md` 对应小节）。

## 灯具（lamp）idle/active 分态说明（REQ-TASK-08 点击类示例：开灯）

`manifest.js` 的 `click.examples[0]` 把 `targetSprite`/`targetSpriteActive` 分别写成
`sprites/lamp-off.png` / `sprites/lamp-on.png` 两个 stub 路径——DESIGN 交付的 Pack A 只有一张
`lamp.png`（台灯，未点亮/点亮两态素材尚未分别出图）。本卡（014）在 idle/active 两态**都**渲染
同一张 `lamp.png`，用 `[data-anim-state]` 属性选择器区分视觉差异（`idle` 态是基础样式的
`filter: drop-shadow(...)` 阴影；`active` 态在 `task-templates.css` 里叠加**第二层**暖黄
`drop-shadow(0 0 14px rgba(255, 216, 130, 0.75))` 发光——两层 `drop-shadow` 叠加模拟"灯亮"
效果，CSS 里目前**没有**用到 `brightness()` 滤镜），并在完成判定后把 `data-anim-state` 从
`idle` 切到 `active`（P1-3 对抗评审修复后：pointer target 判定完成即刻 unregister，但 DOM 元素
延迟约 800ms 才移除，让这个 active 态真的有机会被浏览器 paint 出来、被孩子看见，而不是判定完成
瞬间元素就被摘除）。这是**占位视觉**，不是最终动效——真正的灯泡点亮分态贴图/动效由后续动效卡
接管（见下节）。

## animation state 接口预留（硬要求，卡片原文）

`faucet` / `horse` / `door` / `bell` / `lamp` 五个道具在产品设计意图上都有"动作后状态改变"的
预期（关水龙头、小马跑起来、开门、按铃、开灯），但当前 DESIGN 只交付了每个道具的**单张静态
PNG**（未提供分帧/分态素材，也未提供任何 Lottie/序列帧/骨骼动画数据）。本卡在
`task-templates.js` 渲染这些目标时，统一给渲染出的 DOM 元素打上
`data-anim-state="idle"`（初始）/`data-anim-state="active"`（任务判定完成后切换）两个状态值，
作为**预留的动画状态接口**：

- 当前实现：`data-anim-state` 切换时只触发 `task-templates.css` 里一段轻量 CSS
  `transition`/`filter` 占位效果（缩放脉冲 + 轻微发光），**绝不**冒充为最终动效，也不使用
  静态 PNG 的裁切/合成来模拟动作（例如不会把 `door.png` 裁出"半开门"这种假动效）。
- 未来集成点：真正的开合/奔跑/摇铃/流水/点亮动效由动效卡接管——
  门（开合）→ 待 026、马（奔跑）→ 待 028、水龙头（关闭出水动画）→ 待 030、
  铃铛（摇晃）→ 待 031、灯（点亮渐变）→ 待 032（卡号引自 TL 架构指令原文，四类任务卡自身
  不产出这些动效，也不在本卡编号范围内重新核实这些卡号是否已在飞书建卡，仅按 TL 指令记录）。
  这些卡片接手时只需要在同一个 `data-anim-state` 属性上挂真正的动效实现（CSS
  keyframes / Lottie / 序列帧均可），不需要改动 `task-templates.js` 判定完成的业务逻辑，也
  不需要改变 DOM 结构里 `data-anim-state` 这个属性名/取值集合的契约。

## 集成范围

本卡（WTJ-20260704-014）消费本目录全部 8 个文件，但目前只有 4 个在真实 `manifest.js` 里落地
渲染：`drag`（apple→basket、dog→doghouse 两个 example）、`click`（仅 lamp 开灯这一个
example，即 `click.examples[0]`）。其余 `faucet`/`bell`/`door`/`horse` 四个道具当前没有任何
`manifest.tasks.templates.*.examples` 条目引用，只是作为已集成的静态 PNG 资源留在本目录，供
未来新增点击类任务实例时直接复用，不需要再补素材——`task-templates.js` 本身没有为它们单开
文档章节，这里只是记录"资源已就位、待 manifest 补充实例"这个事实。

## 遗留事项（明确不在本卡处理）

- **统一素材管线**：与 `app/web/assets/PROVENANCE.md` / `app/web/assets/sprites/PROVENANCE.md`
  记录的同一遗留问题——当前是手动 `cp` + 人工核对 md5，没有构建期自动化同步。由 **019 集成卡**
  负责建立统一管线。
- **性能优化留给 018 卡**：直接使用 1024×1024 原图，不做降采样/裁剪/雪碧图合并，页面通过 CSS
  控制显示尺寸（任务道具约 96–220px，见 `task-templates.css`）。
- **lamp-off/lamp-on 分态素材缺口**：见上方「灯具 idle/active 分态说明」，需素材卡补齐真正的
  两态贴图（或动效卡直接用代码生成过渡）。
- **动效卡集成点**：见上方「animation state 接口预留」，026/028/030/031/032 五张卡片接手前，
  `data-anim-state="idle"/"active"` 只有占位 CSS 效果，不是最终产品动效。
