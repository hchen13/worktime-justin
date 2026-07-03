# Production Pack A

对应飞书卡：`WTJ-20260704-005`。

本包覆盖核心 UI、任务道具与奖励素材，作为可进入 app 的透明 PNG 资产，而不是 docs 示意图。风格基准为 `docs/assets/sprites/production-sprite-contact-sheet.png` 的 v3 sprite 样例：2.5D soft-plastic / soft-clay、统一 3/4 视角、柔和高光、暗色画布可读。

## 产物

- `ui/`: 问号占位、五槽托盘、工作状态灯、任务目标徽章。
- `task-props/`: apple、basket、doghouse、lamp、faucet、bell、door、horse。
- `rewards/`: 宝箱、星星贴纸、笑脸完成贴纸、闪光奖励效果。
- `source/`: 两张生成源图及去背后的 alpha sheet。
- `contact-sheets/pack-a-contact-sheet.png`: 暗底评审接触表。
- `manifest.json`: 资产清单和路径。

## 生成与取舍

- 使用内置 image generation 生成两张 #ff00ff chroma-key sheet：任务道具 sheet、UI/奖励 sheet。
- 使用本地 chroma-key 去背脚本转为 alpha sheet，再切成单体 PNG。
- UI/奖励 sheet 初次网格切片会截断五槽托盘并带入相邻碎片，因此改用 alpha 连通域/手工联合框重切。
- `apple` 和 `basket` 直接复制已通过的 v3 基准素材，避免为了覆盖清单而重画出不一致版本。
- 所有输出 PNG 统一为 `1024x1024 RGBA`，透明背景，保留动画缩放边距。

## Prompts

### Task Props Sheet

```text
Use case: stylized-concept
Asset type: production sprite sheet for WorkTime Justin, a children's fullscreen desktop app.
Style reference: match the visible WorkTime Justin v3 production sprite contact sheet: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance, top-left soft light, warm friendly saturation, no photorealism, no emoji, no flat vector icon.
Primary request: create exactly six separate original task-prop sprites: doghouse, table lamp, faucet, hand bell, front door, toy horse.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background only. Arrange in a clean 3 by 2 grid, one centered object per cell, generous padding. No labels, no text, no border, no frame, no shadows on the background, no floor plane.
Subject details: doghouse should be a small red-roof child-friendly dog house; lamp should be a simple desk/table lamp; faucet should be a shiny rounded bathroom faucet without water; bell should be a small golden hand bell; door should be a friendly rounded wooden front door; horse should be a simplified toy-like horse sprite, not a real animal photo and not a copyrighted character.
Quality constraints: production-quality finished illustration, readable on a dark navy app canvas at small sizes, consistent material and outline across all six objects, clean edges for background removal, no watermark. Avoid using #ff00ff inside any object.
```

### UI And Rewards Sheet

```text
Use case: stylized-concept
Asset type: production UI and reward sprite sheet for WorkTime Justin, a children's fullscreen desktop app.
Style reference: match the visible WorkTime Justin v3 production sprite contact sheet and the newly generated task prop sheet: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouettes, subtle bevels, medium-thick soft outline, unified 3/4 front perspective where appropriate, top-left soft light, child-friendly saturation, no flat vector placeholder, no emoji.
Primary request: create exactly eight separate production assets: question-mark mystery token, five-slot answer tray, working status light, task target badge, treasure chest, star sticker, happy reward sticker, sparkle burst reward.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background only. Arrange in a clean 4 by 2 grid, one centered asset per cell, generous padding. No labels, no text except the single question mark on the mystery token. No border, no frame, no shadows on the background, no floor plane.
Subject details: question-mark mystery token is a glossy rounded medallion with one large readable white question mark; five-slot answer tray is a single rounded horizontal base containing five empty child-safe slots; working status light is a small glowing green/yellow capsule indicator; task target badge is a rounded target marker/badge suitable for highlighting a requested object; treasure chest matches the warm wooden/gold soft-clay style; star sticker is a puffy reward star with a white sticker edge; happy reward sticker is a puffy smile/check reward sticker without copyrighted character style; sparkle burst reward is a celebratory soft-clay sparkle cluster.
Quality constraints: production-quality finished illustration, readable on a dark navy app canvas at 96-240 px, consistent material and outline across all eight assets, clean edges for background removal, no watermark. Avoid using #ff00ff inside any asset.
```

## 自检

- 16 张单体 PNG 均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 可见像素中无 #ff00ff / 洋红残留。
- 暗底接触表已检查：主体完整、无明显截断、无相邻格碎片、儿童可识别。
- `sparkle-burst` 保留多颗闪光组件，因此按联合框裁切，没有只保留最大连通域。
