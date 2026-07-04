# Lamp Toggle Animation

对应飞书卡：原始交付 `WTJ-20260704-032`，本次返工 `WTJ-20260704-069`。

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
- `prompt-and-rationale.md`: 本次返工提示词、取舍和自检证据。

## 生成方法

主体来自 `docs/assets/production-pack-a/task-props/lamp.png`，并复制到 `docs/assets/production-animations-v1/source/lamp-base.png` 作为源图。为避免材质漂移，没有重新生成灯体；本次只替换原始灯罩开口内的暖色/白色灯泡像素，保留蓝色灯罩实体外壳，并重做光锥和按钮微光。

视觉方向提示词：

```text
WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the blue lamp body and gold arm exactly. Make the shade an opaque blue solid shell; do not show a bulb silhouette through the shade or as a visible circle in the opening. Replace bulb pixels with a matte warm inner liner clipped to the original shade opening; show lamp-on through warm liner glow, emitted cone, and button glow; no transparent shell, no strange perspective, no watermark, no background, no magenta residue.
```

## 取舍

- 保留已通过基准的蓝色灯罩、金色支架和底座，只替换灯罩口内可见的完整灯泡轮廓。
- `off` 仍保留暖色灯罩内衬，但白色灯泡圆形被完全涂掉，融合成不透明内衬，不再像透明壳。
- `turning-on` 与 `turning-off` 用渐进光锥、内衬 glow 和按钮微亮表达开关过程。
- 不切割灯头或按钮做大幅形变。当前源图是扁平合成 PNG，强行拆层会导致边缘破损和材质跳动。
- contact sheet 与 GIF preview 使用固定视口，避免亮灯光效扩大 bounds 后让主体在预览里跳缩放。
- 针对 Ethan 截图问题，本轮明确移除了此前返工中的黄色半透明侧面椭圆和白色灯泡轮廓；实际 PNG 源帧已改，不只是 contact sheet 缩放或遮罩说明变化。

## 自检

- 13 张编号帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 未发现 #ff00ff / 洋红残留。
- `manifest.json` 中所有 frame、sheet、preview、contact sheet 路径均存在。
- `turning-on` 首尾分别匹配 `off` / `on`，`turning-off` 首尾分别匹配 `on` / `off`。
- 暗底接触表已检查：蓝色灯罩读作实体外壳，开口里只剩均匀暖色内衬；没有可读白色灯泡圆形，off/on 状态可读，过渡帧不跳材质、不裁切。
