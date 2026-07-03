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
