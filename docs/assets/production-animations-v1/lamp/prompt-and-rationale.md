# Lamp Rework Prompt And Rationale

对应飞书卡：`WTJ-20260704-069`。

## 返工目标

本次返工只处理台灯，不改动已验收的主体造型。目标是回应 Ethan 截图中 “bulb visible through shade / shade transparency got worse”：灯罩必须读作不透明实体，不能透出完整灯泡轮廓；同时保证 `off`、`on`、`turning-on`、`turning-off` 四组状态一致。

## 提示词

```text
WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the blue lamp body and gold arm exactly. Make the shade an opaque blue solid shell; do not show a bulb silhouette through the shade or as a visible circle in the opening. Replace bulb pixels with a matte warm inner liner clipped to the original shade opening; show lamp-on through warm liner glow, emitted cone, and button glow; no transparent shell, no strange perspective, no watermark, no background, no magenta residue.
```

## 视觉取舍

- 保留原蓝色灯罩、金色支架、底座比例和材质，避免重新生成带来的主体风格漂移。
- 不使用大面积半透明灰片遮住整个灯罩口，因为那会像贴片并破坏原本的透视。
- 不画新的外凸内衬椭圆；只用原始源图中灯罩开口的实际像素范围作为 mask，替换其中的白色灯泡圆形和暖色内衬像素。
- 关灯时是实体暖色灯罩内衬，开灯时只让内衬、光锥和按钮逐步变亮；蓝色灯罩外壳始终保持不透明。
- 所有 review 媒体使用固定视口，避免光锥 bounds 变化导致台灯主体在 contact sheet 或 GIF 中跳动。
- 针对 Ethan 截图，本轮移除了此前返工里最容易被读成“灯罩透明”的黄色侧面椭圆；这次修改的是 actual PNG frame content，不是只调整预览。

## 证据路径

- Manifest: `docs/assets/production-animations-v1/lamp/manifest.json`
- Contact sheet: `docs/assets/production-animations-v1/lamp/lamp-contact-sheet.png`
- Preview GIF: `docs/assets/production-animations-v1/previews/lamp-toggle-preview.gif`
- Frames: `docs/assets/production-animations-v1/lamp/off/`, `turning-on/`, `on/`, `turning-off/`
- Sheets: `docs/assets/production-animations-v1/lamp/sheets/`

## 自检

- 13 张生产帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 未发现 #ff00ff / 洋红残留。
- `turning-on` 首尾分别与 `off` / `on` 匹配，`turning-off` 首尾分别与 `on` / `off` 匹配。
- `manifest.json` 中 frame、sheet、contact sheet、preview、README、prompt/rationale 路径均存在。
- 暗底接触表目视复核：蓝色灯罩外壳不透光，开口里没有白色灯泡圆形，暖色只作为内衬和外射光锥存在。
