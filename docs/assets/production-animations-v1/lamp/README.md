# Lamp Toggle Animation

对应飞书卡：`WTJ-20260704-032`。

本包只交付灯开关动效，产物是 app 可消费的 `1024x1024 RGBA` 透明 PNG 编号帧和 frame sheet，不是文档占位图。

## 产物

- `manifest.json`: 状态、fps、loop、anchor、bounds、frame sheet 和逐帧路径。
- `off/`: 熄灯静止帧。
- `turning-on/`: 开灯过渡帧。
- `on/`: 亮灯静止帧。
- `turning-off/`: 关灯过渡帧。
- `sheets/`: 每个状态一张透明 frame sheet。
- `lamp-contact-sheet.png`: 暗底接触表。
- `../previews/lamp-toggle-preview.gif`: 暗底开关预览。

## 生成方法

主体来自 `docs/assets/production-pack-a/task-props/lamp.png`，并复制到 `docs/assets/production-animations-v1/source/lamp-base.png` 作为源图。为避免材质漂移，没有重新生成灯体，只生成透明光效层和局部亮度变化。

视觉方向提示词：

```text
WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the existing lamp material exactly; only add transparent lamp on/off lighting, bulb glow, button glow, and warm light cone. Keep every frame on a 1024x1024 transparent canvas, with stable anchor, no text, no watermark, no background, no emoji-like stickers, no magenta residue.
```

## 取舍

- `off` 使用冷灰遮罩压低灯罩内侧和灯泡亮度，保留外部蓝色灯罩和金色支架材质。
- `turning-on` 与 `turning-off` 用渐进光锥、灯泡 halo、按钮微亮和少量非表情闪光表达开关过程。
- 不切割灯头或按钮做大幅形变。当前源图是扁平合成 PNG，强行拆层会导致边缘破损和材质跳动。

## 自检

- 13 张编号帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 未发现 #ff00ff / 洋红残留。
- `manifest.json` 中所有 frame、sheet、preview、contact sheet 路径均存在。
- 暗底接触表已检查：off/on 状态可读，过渡帧不跳材质、不裁切。
