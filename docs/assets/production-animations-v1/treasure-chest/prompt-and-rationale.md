# Treasure Chest Rework Prompt And Rationale

对应飞书卡：`WTJ-20260704-070`。

## 返工目标

旧版宝箱开启动效来自 flattened PNG 分层变形，开盖阶段容易出现结构割裂、漂浮盖、尾帧错位和 reward-pop 伪影。本次返工目标是替换旧宝箱为可作为最终奖励素材使用的高质 2.5D 生产帧。

## 关键提示词

```text
Premium polished 2.5D soft-clay treasure chest sprite, warm wood grain, rounded gold metal bands, blue diamond lock, consistent 3/4 perspective, clean #00ff00 chroma-key background; closed, quarter-open, half-open, mostly-open, and open states generated as key art, then normalized to 1024 transparent production frames.
```

约束补充：

```text
No flat vector icon, no emoji style, no rough sketch, no watermark, no text, no reward items in the opening key art, no broken geometry, no floating lid, no #00ff00 in the subject.
```

## 视觉取舍

- 放弃旧宝箱主体，不再使用旧 flattened PNG 作为最终奖励素材。
- 生成 closed、quarter-open、half-open、mostly-open、open 五个真实关键姿态，避免交叉淡化带来的半透明双影。
- 所有关键姿态去背后统一缩放到 `1024x1024` 透明画布，保持 anchor `[0.5, 0.85]`。
- `reward-pop` 从 open 精确起步，使用星星、sparkle、无表情礼物盒、金币、宝石光点表达奖励，不使用笑脸贴纸或难以识别的生成碎片。

## 证据路径

- Manifest: `docs/assets/production-animations-v1/treasure-chest/manifest.json`
- Contact sheet: `docs/assets/production-animations-v1/treasure-chest/treasure-chest-contact-sheet.png`
- Opening preview: `docs/assets/production-animations-v1/previews/treasure-chest-opening-preview.gif`
- Reward preview: `docs/assets/production-animations-v1/previews/treasure-chest-reward-pop-preview.gif`
- Frames: `docs/assets/production-animations-v1/treasure-chest/closed/`, `opening/`, `open/`, `reward-pop/`
- Key alpha sources: `docs/assets/production-animations-v1/source/treasure-chest-base.png`, `treasure-chest-quarter-open-base.png`, `treasure-chest-half-open-base.png`, `treasure-chest-mostly-open-base.png`, `treasure-chest-open-base.png`

## 自检

- 14 张生产帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 可见像素无 #ff00ff / 洋红残留，且无明显 #00ff00 绿边残留。
- `opening` 首尾分别与 `closed` / `open` 匹配；`reward-pop` 首帧与 `open` 匹配。
- `manifest.json` 中 frame、sheet、contact sheet、preview、README、prompt/rationale、source 路径均存在。
