# app/web/assets/rewards/ — 素材来源追溯（PROVENANCE）

本目录下的前 2 个 PNG 是**运行时集成副本**：从 DESIGN 交付并已验收的素材包直接 `cp` 复制而来，
文件名与源交付路径保持一致，未做任何像素级修改（不裁剪、不压缩、不改格式、不改分辨率）。
复制前后逐一用 `md5` 核对校验和一致（见下表）。沿用 `app/web/assets/sprites/PROVENANCE.md`
（WTJ-20260704-009）与 `app/web/assets/task-props/PROVENANCE.md`（WTJ-20260704-014）同一套
集成模式。第 3 个 PNG（`completion-stamp-v3.png`，WTJ-20260705-010 新增）是 `sips -Z` 降采
副本，见本文件下方「`completion-stamp-v3.png`」独立小节，处理方式与 `app/web/assets/
PROVENANCE.md` 里 `discovery-icons/`/`ui/chest-*.png` 的 `sips -Z` 降采模式一致。

## 复制清单（WTJ-20260704-015 集成：工作状态灯「今日工作完成」连续奖励，历史素材）

| 运行时路径 | 源路径 | 素材卡号 | REQ ID | 复制日期 | md5 |
|---|---|---|---|---|---|
| `app/web/assets/rewards/sparkle-burst.png` | `docs/assets/production-pack-a/rewards/sparkle-burst.png` | WTJ-20260704-005 | REQ-AST-02 | 2026-07-04 | `8a33469593fc37fe311d05a617988411` |
| `app/web/assets/rewards/star-sticker.png` | `docs/assets/production-pack-a/rewards/star-sticker.png` | WTJ-20260704-005 | REQ-AST-02 | 2026-07-04 | `6a1fa0844b5267fbc43b937bd92428f9` |

规格（引自 `docs/assets/production-pack-a/README.md` / `manifest.json`）：PNG / RGBA / 1024×1024 /
透明背景 / 2.5D soft-plastic 儿童插画风格，四角 alpha 为 0，无 #ff00ff chroma-key 残留，
Production Pack A（WTJ-20260704-005）批次的 8 选 2（该批次同时交付了 `treasure-chest.png` /
`happy-reward-sticker.png`）。

**WTJ-20260705-010 现状更新**：015 当时用这两张图做 `mini-rocket-launch`（纯 CSS 小火箭 +
这两张图做升空收尾闪光/贴纸）表现形式的收尾点缀。010 把「今日工作完成」一次性大奖励视觉整体
换成了 `completion-stamp-v3.png`（`desk-stamp` 表现形式，见下节），`status-rewards.js` 的
`showRewardOverlay()` 不再引用 `sparkle-burst.png`/`star-sticker.png`、`status-rewards.css` 的
`.wtj-sr-rocket`/`.wtj-sr-sparkle`/`.wtj-sr-star` 规则块与对应 `@keyframes` 均已随之删除。这两个
文件本身**予以保留、未删除**（未来若要恢复/复用 `mini-rocket-launch` 或实现 `chest-partial-open`
可直接取用，且删除已验收生产素材不在本卡范围内），但当前**不再被任何运行时代码加载**，记录于此
避免后续维护者误以为它们仍在被消费。

## `completion-stamp-v3.png`（WTJ-20260705-010 新增：替换「今日工作完成」火箭/星星占位）

| 运行时路径 | 源路径 | 素材卡号 | 处理方式 | 复制日期 |
|---|---|---|---|---|
| `app/web/assets/rewards/completion-stamp-v3.png` | `docs/assets/design-expansion-v2/work-complete-reward/completion-stamp-v3/source/completion-stamp-cutout.png` | WTJ-20260705-010 | `sips -Z 640 --setProperty format png`（1254×1254 → 640×640，保留 RGBA alpha） | 2026-07-05 |

**取用哪个源文件**：该 DESIGN 交付目录下只有 `source/` 一层，含 2 张图——
`completion-stamp-chromakey.png`（RGB，绿幕底，无 alpha，抠像前的过程稿）与
`completion-stamp-cutout.png`（RGBA，已抠像，四角透明）。本卡只取用后者（`sips -g hasAlpha`
核实为 `yes`），`-chromakey` 版本不进入 runtime。

**与卡片原文档述的资产清单有出入（据实记录）**：`WTJ-20260705-010` 卡片原文列出的资产清单是
`manifest.json` / `completion-stamp-sheet.png` / `completion-stamp-static.png` / `frames/*.png` /
`previews/completion-stamp-preview.gif`，但截至本卡集成时，`completion-stamp-v3/` 目录下
**实际只有** `source/` 下这 2 张静态图，没有上述任何一个文件（无 manifest.json、无 sheet、无
frames 序列、无 preview gif）——即 DESIGN 只交付了单张已抠像静态图，未交付动画序列。因此本卡
按需求文档自身给出的备选口径（"若一次性 pop 更简单也可，但帧数据要 config 驱动"）走**纯 CSS
一次性 pop/scale/fade**方案（见 `status-rewards.css` `.wtj-sr-stamp` / `@keyframes
wtj-sr-stamp-pop`），不强行搭建帧序列 pipeline；`app/web/anim-manifest.js` /
`app/scripts/build-anim-assets.sh` 的多帧 sheet 管线本卡未触碰。

**尺寸取舍**：源图 1254×1254，运行时通过 CSS 显示在 `clamp(200px, 24vw, 340px)`
（见 `status-rewards.css` `.wtj-sr-stamp`）。按最大显示尺寸 340px 的约 2× retina 余量取
640×640（与 `keyboard-spark.png` 384px 降采、`chest-active/disabled.png` 192px 降采同一套
"按显示尺寸 × 2 覆盖 retina" 取舍逻辑），降采后 371KB（源图为图片，未记录源 md5，`sips`
降采后文件内容与源图不同，不适用「复制前后 md5 一致」的核对方式，改为 `sips -g pixelWidth -g
pixelHeight -g hasAlpha` 核实降采后仍为 640×640 RGBA 且保留透明通道）。

**素材语义与本卡内容高度吻合**：该图本身已经是一枚金色印章 + 底部三个打勾徽章 + 环形闪光/星芒的
构图，恰好呼应「连续完成 3 个问号任务」的语义（三个勾对应三个任务、印章对应"工作完成盖章"），
对应 `manifest.js` `rewards.statusLights.streakRewardForms` 菜单里的 `desk-stamp`（工作台盖章）
表现形式，比此前的 `mini-rocket-launch`（纯 CSS 小火箭）更贴题。

## 与 `manifest.js` 的对应关系

`app/web/manifest.js` 的 `rewards.statusLights.streakRewardForms` 字段列出了产品允许的四种
「今日工作完成」表现形式：`lights-flash-together` / `desk-stamp` / `mini-rocket-launch` /
`chest-partial-open`。`status-rewards.js` 当前（WTJ-20260705-010 之后）实现其中两种的组合：

- `lights-flash-together`：完全由 `WTJ_HUD.setStatusLight()` 反复调用实现，不依赖本目录任何素材。
- `desk-stamp`：一次性 pop/scale/fade 展示 `completion-stamp-v3.png`（本文件上一节），路径读自
  `manifest.js` `rewards.completionStamp.sprite`（config 驱动，不在 `status-rewards.js` 里硬编码
  `docs/` 设计目录路径）。

`mini-rocket-launch`（历史实现，已移除，见上文「WTJ-20260705-010 现状更新」）与
`chest-partial-open`（未实现）当前均不在 `IMPLEMENTED_FORMS` 里。

## 集成范围

`status-rewards.js` 的 `showRewardOverlay()`——「今日工作完成」一次性大奖励叠层，淡入/放大 →
停留 → 淡出后由 JS 定时移除，不永久堆积于主画面（REQ-RWD-04「不污染主画面」）——当前只消费
`completion-stamp-v3.png` 这一张图；`sparkle-burst.png`/`star-sticker.png` 保留在目录中但不再
被引用（见上文说明）。
