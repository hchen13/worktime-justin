# Treasure Chest Animation v2

对应飞书卡：原始交付 `WTJ-20260704-029`，本次返工 `WTJ-20260704-070`。

本目录是 treasure-chest 单卡验收范围。faucet、horse、door、bell、lamp 均由各自卡片单独验收，本卡证据只引用宝箱开启动效。

## 状态

- `closed/`: 1 帧，关闭宝箱。
- `opening/`: 5 帧，真实关键姿态开盖并露出金色内光。
- `open/`: 1 帧，打开保持态。
- `reward-pop/`: 7 帧，奖励星星、闪光、礼物盒、金币和宝石光点从箱口弹出。
- `sheets/`: 每个状态的 frame sheet。
- `treasure-chest-contact-sheet.png`: 暗底验收接触表。
- `manifest.json`: fps、loop、anchor、bounds、frames、sheet、preview 路径。
- `prompt-and-rationale.md`: 本次返工提示词、取舍与自检证据。

## 生成方法

本次返工不再沿用旧宝箱主体。`closed`、`quarter-open`、`half-open`、`mostly-open`、`open` 五个关键姿态使用内置 image generation 生成高质 2.5D key art，统一去除 #00ff00 chroma-key 背景后规范化到 `1024x1024 RGBA` 透明画布。

动效帧采用关键姿态加确定性合成：

- `closed` 使用新生成闭合宝箱源图。
- `opening` 使用五个真实关键姿态：closed、quarter-open、half-open、mostly-open、open；不再使用半透明交叉淡化双影。
- `open` 使用新生成完全打开源图。
- `reward-pop` 从 `open` 精确起步，复用 Pack A 的 star sticker / sparkle burst，并追加无表情礼物盒、金币和宝石光点。

可复用的视觉方向提示词：

```text
Premium polished 2.5D soft-clay treasure chest sprite, warm wood grain, rounded gold metal bands, blue diamond lock, consistent 3/4 perspective, clean #00ff00 chroma-key background; closed, quarter-open, half-open, mostly-open, and open states generated as key art, then normalized to 1024 transparent production frames. Keep every frame on a 1024x1024 transparent canvas, with stable anchor, no text, no watermark, no background, no magenta residue.
```

## 取舍

本次不再用旧版 flattened PNG 拉伸开盖，因为旧方案会出现盖子漂浮、尾帧错位、结构割裂。新方案牺牲逐帧完全同源的像素连续性，换取五个真实绘制关键姿态的结构可信度；首尾帧仍与 `closed` / `open` 精确一致，便于 TL 接入。

`reward-pop` 保持短促、清楚、无表情贴纸：星星、sparkle、礼物盒、金币和宝石光点都从箱口弹出，不出现不明三尖形异物或生成伪影。

## 自检

- 14 张编号帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 可见像素无 #ff00ff / 洋红残留，且无明显 #00ff00 绿边残留。
- `manifest.json` 中所有 frame、sheet、preview、contact sheet、source、README、prompt/rationale 路径均存在。
- `opening` 首尾分别与 `closed` / `open` 匹配；`reward-pop` 首帧与 `open` 匹配。
- 暗底接触表已检查：closed/opening/open/reward-pop 状态可读，无明显裁切，结构完整，reward-pop 元素可识别。
