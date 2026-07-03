# app/web/assets/sprites/ — 素材来源追溯（PROVENANCE）

本目录下的 8 个 PNG 是**运行时集成副本**：从 DESIGN 交付并已验收的素材包直接 `cp` 复制而来，
文件名与源交付路径保持一致，未做任何像素级修改（不裁剪、不压缩、不改格式、不改分辨率）。
复制前后逐一用 `md5` 核对校验和一致（见下表）。

## 复制清单（本卡 WTJ-20260704-009 集成）

| 运行时路径 | 源路径 | 素材卡号 | REQ ID | 复制日期 | md5 |
|---|---|---|---|---|---|
| `app/web/assets/sprites/dog.png` | `docs/assets/sprites/dog.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `480d9d4b955a60d0a2fd1046e3f93b4f` |
| `app/web/assets/sprites/cat.png` | `docs/assets/sprites/cat.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `20d86921be108864366062ecab3e1270` |
| `app/web/assets/sprites/apple.png` | `docs/assets/sprites/apple.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `90ad2555e3acaf032b30cf31d5edb042` |
| `app/web/assets/sprites/ball.png` | `docs/assets/sprites/ball.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `329e2b8f0e0c1f864f0c111ba7f1d25f` |
| `app/web/assets/sprites/star.png` | `docs/assets/sprites/star.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `d0835faeffedf4d741e3abdb422be3b4` |
| `app/web/assets/sprites/car.png` | `docs/assets/sprites/car.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `1e03a4ae2dce95ac5ade0d9f0cd844bf` |
| `app/web/assets/sprites/basket.png` | `docs/assets/sprites/basket.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `bf179b7c3308e79ad2652087721a682f` |
| `app/web/assets/sprites/treasure-chest.png` | `docs/assets/sprites/treasure-chest.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `92fa4ff18fcd6d138b141c4a9c112b74` |

规格（引自 `docs/index.html` `#assets` / `#sprite-contact-sheet`）：PNG / RGBA / 1024×1024 /
透明背景，v3 生产基准（已验收，commit `8cc540f`）。这 8 个文件与
`app/web/manifest.js` 的 `secretWords.pool[].spriteFile` 逐一对应（`treasurechest` 词对应的
文件名是 `treasure-chest.png`，含连字符，manifest 里已按此正确拼写引用，不要在新增词池条目时
误写成 `treasurechest.png`）。

## 运行时路径约定与已知偏离（需 PM/TL 关注）

`app/web/manifest.js` 的 `assets.runtimeDirs.sprites` 字段声明的运行时约定是 `'sprites/'`
（相对 `app/web/`，即最终期望路径形如 `app/web/sprites/dog.png`），`secretWords.pool[].spriteFile`
字段也确实写成 `'sprites/dog.png'` 这种不带 `assets/` 前缀的形式。但本卡（WTJ-20260704-009）
收到的 TL 架构指令明确要求把 sprite 复制到 **`app/web/assets/sprites/`**（与 007 卡
`app/web/assets/ui/` 的既有先例一致），而不是 `app/web/sprites/`。

这与 `manifest.js` 里 `spriteFile` 字段字面值存在一层路径前缀差异——如果 `secretword.js` 直接把
`spriteFile`（如 `'sprites/dog.png'`）原样喂给 `<img src>` 或 `WTJ_HUD.setSlot({ spriteUrl })`，
在浏览器里会解析成 `app/web/sprites/dog.png`，而实际文件位于
`app/web/assets/sprites/dog.png`，会 404。

**本卡的处理方式**：`secretword.js` 内部有一个 `resolveSpritePath()` 函数，统一把
`spriteFile` 拼接上 `'assets/'` 前缀后再用于 DOM `<img src>` 与 `WTJ_HUD.setSlot()` 调用
（见 `secretword.js` 文件头「素材路径解析」一节的详细说明）。这是本卡范围内的最小修正，
**没有改动 `manifest.js` 本身**（改 manifest 不改代码是既定原则，但这次是反过来——本卡选择在
消费端做路径映射，而不是去改 `manifest.js` 的 `runtimeDirs`/`spriteFile` 约定，因为
`manifest.js` 明确标注为只读参考、不在本卡改动范围内）。

遗留问题，需 PM/TL 后续裁决其中一种方案统一掉这个不一致：
1. 把 `manifest.js` 的 `assets.runtimeDirs.sprites` 改成 `'assets/sprites/'`、`pool[].spriteFile`
   一并改成 `'assets/sprites/dog.png'` 这种带前缀的写法，与 `assets/ui/` 保持同一约定；或
2. 未来集成卡（019）把 sprite 实际迁移到 `app/web/sprites/`（与 `manifest.js` 现有字面值一致），
   届时应同步删除本目录并更新 `secretword.js` 的 `resolveSpritePath()`，去掉 `'assets/'` 前缀拼接。

在这层统一之前，任何新代码直接使用 `manifest.secretWords.pool[].spriteFile` 拼 DOM 路径时，都
应该复用 `secretword.js` 的 `resolveSpritePath()`（或等价逻辑），不要各自重新硬编码前缀。

## 集成范围

本卡只消费 `secretWords.pool` 引用的这 8 个 sprite，用于：命中反馈 sprite 叠层
（`secretword.js` 的 `showSpriteOverlay()`）与五槽点亮图标（`WTJ_HUD.setSlot(index,
{ spriteUrl })`）。

## 遗留事项（明确不在本卡处理）

- **统一素材管线**：与 `app/web/assets/PROVENANCE.md` 记录的同一遗留问题——当前是手动
  `cp` + 人工核对 md5，没有构建期自动化同步。由 **019 集成卡**负责建立统一管线。
- **`basket` / `treasurechest` 词池归属**：见 `app/web/MANIFEST.md`「已知的文档/素材对齐问题」
  一节——这两个词是为了满足"首批 8 词对应已验收 sprite"而选用，但 `docs/index.html` `#secret`
  章节给出的示例词标签实际是 `dog / cat / apple / ball / moon / star / car / zoo`。本卡按
  manifest 已落地的 pool 原样使用，不重复裁决，仅在此处再次指出以提醒 PM/DESIGN 在词池扩展卡
  启动前明确。
- **性能优化留给 018 卡**：直接使用 1024×1024 原图，不做降采样/裁剪/雪碧图合并，页面通过 CSS
  控制显示尺寸（sprite 叠层约 96–200px，见 `secretword.css`）。
