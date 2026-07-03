# Treasure Chest Animation v1

对应飞书卡：`WTJ-20260704-029`。

本目录是 treasure-chest 单卡验收范围。faucet、horse、door、bell、lamp 均由各自卡片单独验收，本卡证据只引用宝箱开启动效。

## 状态

- `closed/`: 1 帧，关闭宝箱。
- `opening/`: 5 帧，箱盖打开并露出金色内光。
- `open/`: 1 帧，打开保持态。
- `reward-pop/`: 7 帧，奖励贴纸、闪光和金币粒子从箱口弹出。
- `sheets/`: 每个状态的 frame sheet。
- `treasure-chest-contact-sheet.png`: 暗底验收接触表。
- `manifest.json`: fps、loop、anchor、bounds、frames、sheet、preview 路径。

## 生成方法

主宝箱图来自 `docs/assets/production-pack-a/rewards/treasure-chest.png`，不重新生成主体，避免和 Pack A / Pack B 的 soft-clay 材质发生漂移。

动效帧采用确定性处理：

- `closed` 使用原始生产宝箱。
- `opening` 将宝箱盖区域分层、上移并压缩成打开角度，同时保留下半箱体。
- `open` 保持打开姿态，加柔和金色箱内光。
- `reward-pop` 复用 Pack A 的 star sticker、sparkle burst，并追加无表情礼物盒、金币粒子和宝石高光。

可复用的视觉方向提示词：

```text
Use the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the existing treasure chest material exactly; only add transparent animation effects, lid opening movement, golden interior light, stickers, sparkles, and coin particles. Keep every frame on a 1024x1024 transparent canvas, with stable anchor, no text, no watermark, no background, no magenta residue.
```

## 取舍

这是 v1 的 flattened PNG 分层动效，不是完整 3D 结构动画。箱盖采用安全的上移/压缩开盖表现，避免强行重绘木纹和金属边导致材质漂移。若后续需要更真实的铰链旋转，v2 应重新生成分层 chest source，至少拆为 lid、front body、interior glow、hardware 四层。

2026-07-04 rework：PM review 指出旧版 `reward-pop` 使用了笑脸表情贴纸，不符合 production-asset-quality 对 emoji-like final material 的硬拒标准。本版已移除该贴纸，改为星星、闪光、金币、宝石高光和无表情礼物盒；`closed`、`opening`、`open` 结构保持不变。

## 自检

- 14 张编号帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 可见像素无 #ff00ff / 洋红残留。
- `manifest.json` 中所有 frame、sheet、preview、contact sheet、source 路径均存在。
- 暗底接触表已检查：closed/opening/open/reward-pop 状态可读，无明显裁切，主体材质稳定。
