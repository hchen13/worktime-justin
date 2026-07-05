# app/web/assets/ — 素材来源追溯（PROVENANCE）

本目录下的素材均为**运行时集成副本**：从 DESIGN 交付并已验收的素材包直接复制而来，文件名与
源交付路径保持一致，未做任何像素级修改（不裁剪、不压缩、不改格式、不改分辨率）。

## `ui/` 三个文件（本卡 WTJ-20260704-007 集成）

| 运行时路径 | 源路径 | 素材卡号 | 复制日期 |
|---|---|---|---|
| `app/web/assets/ui/five-slot-tray.png` | `docs/assets/production-pack-a/ui/five-slot-tray.png` | WTJ-20260704-005 | 2026-07-04 |
| `app/web/assets/ui/question-mark-token.png` | `docs/assets/production-pack-a/ui/question-mark-token.png` | WTJ-20260704-005 | 2026-07-04 |
| `app/web/assets/ui/working-status-light.png` | `docs/assets/production-pack-a/ui/working-status-light.png` | WTJ-20260704-005 | 2026-07-04 |

复制方式：直接 `cp`，并用 `md5` 核对复制前后校验和一致。规格（引自
`docs/assets/production-pack-a/manifest.json` / `README.md`）：PNG / RGBA / 1024x1024 /
透明背景 / 2.5D soft-plastic 儿童插画风格，四角 alpha 为 0，无 #ff00ff chroma-key 残留。

## `ui/chest-disabled.png` / `ui/chest-active.png`（WTJ-20260704-083 返工，PM 打回①②，接入 DESIGN 082）

| 运行时路径 | 源路径 | 素材卡号 | 处理方式 | 复制日期 |
|---|---|---|---|---|
| `app/web/assets/ui/chest-disabled.png` | `docs/assets/style/wtj-082/chest/chest-disabled.png` | WTJ-20260704-082 | `sips -Z 192`（1024x1024 → 192x192，保留 RGBA alpha） | 2026-07-04 |
| `app/web/assets/ui/chest-active.png` | `docs/assets/style/wtj-082/chest/chest-active.png` | WTJ-20260704-082 | `sips -Z 192`（1024x1024 → 192x192，保留 RGBA alpha） | 2026-07-04 |

与上面三个文件（直接 `cp` 不改分辨率）**不同**：这两个文件源图是 1024x1024，而 footer 常驻
宝箱指示器运行时只显示 72px~96px（见 082 doc 宝箱规则 / `app/web/hud.css`
`.wtj-hud-chest-lane`），直接用 1024² 原图会带来不必要的体积（约 528KB/789KB），因此用
`sips -Z 192 --setProperty format png ... --out ...` 降采到 192x192（覆盖常见 2x retina
显示，72px~96px 显示尺寸下留有余量），降采后 38KB/55KB，`sips -g hasAlpha` 核实降采后仍保留
透明通道。082 交付的这两张图 `asset_class` 为 `style_baseline_sample_not_full_runtime_
replacement`（已验收基线样本，可作可交付 interim 接入；全量最终生产另开卡）。运行时路径登记
在 `app/web/manifest.js` 的 `rewards.chest.footerIndicator.states`，由 `app/web/hud.js`
读取渲染为 footer 右侧常驻宝箱三态指示器（`.wtj-hud-chest`）。只有 Disabled/Active 两态
资产——"打开(Open)"态不是第三张静态图，直接复用既有 011（`reward-chest.js`）的一次性开箱
Canvas 分帧序列，见该文件与 `app/web/hud.js`「footer 常驻宝箱指示器」相关注释。

## `discovery-icons/` 键盘里程碑图标（WTJ-20260705-008，接入 DESIGN-007 discovery-icons 返工资产）

| 运行时路径 | 源路径 | 素材卡号 | 处理方式 | 复制日期 |
|---|---|---|---|---|
| `app/web/assets/discovery-icons/keyboard-star.png` | `docs/assets/design-expansion-v2/discovery-icons/filled/keyboard-star.png` | WTJ-20260704-061 | `sips -Z 192`（1024x1024 → 192x192，保留 RGBA alpha） | 2026-07-05 |
| `app/web/assets/discovery-icons/keyboard-spark.png` | `docs/assets/design-expansion-v2/discovery-icons/filled/keyboard-spark.png` | WTJ-20260704-061 | `sips -Z 384`（1024x1024 → 384x384，保留 RGBA alpha） | 2026-07-05 |

DESIGN-007（discovery-icons 包，飞书卡 `WTJ-20260704-061`，已 accepted）交付了统一 medallion
体系的五槽与探索里程碑图标，每个都有 `filled`/`muted` 两态、`1024x1024 RGBA`、四角 alpha 为 0
（见源包 `manifest.json` / `README.md`）。本卡（WTJ-20260705-008）接入其中 `keyboard_exploration`
语义组的两张 `filled` 图，替换掉此前的 `★` Unicode 星字占位（rule 12 生产视觉质量线）：

- `keyboard-star.png`（键盘 medallion）→ **发现槽内键盘贴纸**：键盘里程碑点亮发现槽时，槽内
  渲染这张图（`hud.js` `renderSlot()` 的 `is-milestone` 分支，`recommended_slot_size` 72px，
  降采到 192px 覆盖 2x retina 余量）。运行时路径登记在 `app/web/manifest.js`
  `slots.milestoneStickerSprite`。
- `keyboard-spark.png`（键盘星火迸发）→ **里程碑奖励弹出**：累计有效键达到里程碑
  （`keyboard.effectiveKeyMilestones` = [100, 200]）时，`status-rewards.js` 弹出一次性键盘主题
  奖励叠层用这张图（约 120~200px 显示，降采到 384px 覆盖 2x）。运行时路径登记在
  `app/web/manifest.js` `rewards.keyboardMilestone.rewardSticker`。

与 `ui/chest-*.png` 同款取舍：源图 1024² 直接进 runtime 体积偏大（68KB/224KB），按显示尺寸
`sips -Z` 降采并 `-g hasAlpha` 核实降采后仍保留透明通道，未做其它像素级修改。这两张只用
`filled` 态；`muted` 灰态（未点亮/空槽）本卡不涉及，留待后续。

## 集成范围

本卡（WTJ-20260704-007，默认画布与主 HUD）只消费上述 3 个文件，分别用于：

- `question-mark-token.png` → 右侧低调问号入口（`.wtj-hud-question`）。
- `five-slot-tray.png` → 底部五槽托盘底图（`.wtj-hud-tray-bg`），5 个槽位状态指示点由
  `hud.js` 叠加渲染在其上。
- `working-status-light.png` → 左下角工作状态灯（`.wtj-hud-light`，渲染份数取
  `manifest.js` 的 `rewards.statusLights.count`，缺省防御回退为 3）。

Pack A 中的其余素材（`ui/task-target-badge.png`、`task-props/*`、`rewards/*`）不在本卡范围内，
由消费它们的具体卡片（任务引擎类卡片、奖励表现类卡片等）按需各自复制集成，届时应沿用同一模式：
从 `docs/assets/production-pack-*/` 复制、文件名保持不变、在本文件追加一行记录。

## 遗留事项（明确不在本卡处理）

- **统一素材管线**：当前是每张素材各自手动从 `docs/assets/` 复制进 `app/web/assets/`，没有
  构建期自动化同步/一致性校验（源文件若后续被替换或重新出图，不会自动同步到这里，需要人工重新
  复制并更新本文件的记录）。这一统一管线由 **019 集成卡**负责建立，本卡不解决。
- **性能优化留给 018 卡**：本卡直接使用 DESIGN 交付的 1024x1024 原图，不做任何降采样/裁剪/
  雪碧图合并/懒加载，页面通过 CSS（`width` / `height` / `clamp()` / `background-size` 等）
  控制实际显示尺寸（问号约 56–72px、托盘约 260–380px、状态灯约 22–28px）。加载体积、GPU
  内存占用（对应 `app/web/manifest.js` 的 `performance.maxResidentSprites` 等红线）与是否需要
  预裁剪/压缩到更小分辨率，由 **018 卡**评估并处理，本卡不做改动。
- **槽位像素坐标为采样近似值**：`hud.js` 里 5 个槽位指示点的水平定位（约 18% / 34% / 50% /
  66% / 82%，均为 `five-slot-tray.png` 自身宽度的百分比）与垂直定位（约 48.8%，图片自身高度
  的百分比）是本卡用脚本采样像素颜色变化边界得到的近似值，不是素材卡附带的官方坐标数据。若
  `five-slot-tray.png` 未来重新出图导致构图变化，这些百分比需要重新校准，否则槽位指示点会与
  托盘上的实际凹槽错位。
