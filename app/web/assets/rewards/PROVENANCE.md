# app/web/assets/rewards/ — 素材来源追溯（PROVENANCE）

本目录下的 2 个 PNG 是**运行时集成副本**：从 DESIGN 交付并已验收的素材包直接 `cp` 复制而来，
文件名与源交付路径保持一致，未做任何像素级修改（不裁剪、不压缩、不改格式、不改分辨率）。
复制前后逐一用 `md5` 核对校验和一致（见下表）。沿用 `app/web/assets/sprites/PROVENANCE.md`
（WTJ-20260704-009）与 `app/web/assets/task-props/PROVENANCE.md`（WTJ-20260704-014）同一套
集成模式。

## 复制清单（本卡 WTJ-20260704-015 集成：工作状态灯「今日工作完成」连续奖励）

| 运行时路径 | 源路径 | 素材卡号 | REQ ID | 复制日期 | md5 |
|---|---|---|---|---|---|
| `app/web/assets/rewards/sparkle-burst.png` | `docs/assets/production-pack-a/rewards/sparkle-burst.png` | WTJ-20260704-005 | REQ-AST-02 | 2026-07-04 | `8a33469593fc37fe311d05a617988411` |
| `app/web/assets/rewards/star-sticker.png` | `docs/assets/production-pack-a/rewards/star-sticker.png` | WTJ-20260704-005 | REQ-AST-02 | 2026-07-04 | `6a1fa0844b5267fbc43b937bd92428f9` |

规格（引自 `docs/assets/production-pack-a/README.md` / `manifest.json`）：PNG / RGBA / 1024×1024 /
透明背景 / 2.5D soft-plastic 儿童插画风格，四角 alpha 为 0，无 #ff00ff chroma-key 残留，
Production Pack A（WTJ-20260704-005）批次的 8 选 2（该批次同时交付了 `treasure-chest.png` /
`happy-reward-sticker.png`，本卡按 TL 架构指令「至少 sparkle-burst.png，酌情
star-sticker/happy-reward-sticker」只选用了 sparkle-burst 与 star-sticker 这两个，用于
REQ-RWD-06「今日工作完成」奖励表现中的 `mini-rocket-launch` 一次性大奖励叠层收尾——`sparkle-burst`
作为火箭升空到高点时的"爆发闪光"，`star-sticker` 作为伴随出现的小贴纸组合。`treasure-chest.png`
与 `happy-reward-sticker.png` 未被本卡使用，未来若要实现 `chest-partial-open`（宝箱小开一次）或
`desk-stamp`（工作台盖章）表现形式，可另行从
`docs/assets/production-pack-a/rewards/` 补齐复制，不影响本卡范围。）。

## 与 `manifest.js` 的对应关系

`app/web/manifest.js` 的 `rewards.statusLights.streakRewardForms` 字段列出了产品允许的四种
「今日工作完成」表现形式：`lights-flash-together` / `desk-stamp` / `mini-rocket-launch` /
`chest-partial-open`。本卡（`status-rewards.js`）实现了其中两种的组合：

- `lights-flash-together`：完全由 `WTJ_HUD.setStatusLight()` 反复调用实现，不依赖本目录任何素材。
- `mini-rocket-launch`：火箭本体是 `status-rewards.css` 里的纯 CSS 形状（border-radius +
  border 三角形，无贴图），本目录的两张 PNG 只用作升空收尾的"闪光/贴纸"点缀，不是火箭贴图本身。

## 集成范围

本卡只消费这 2 个素材，用于 `status-rewards.js` 的 `showRewardOverlay()`——「今日工作完成」
一次性大奖励叠层，淡入/上升 → 停留 → 淡出后由 JS 定时移除，不永久堆积于主画面
（REQ-RWD-04「不污染主画面」）。
