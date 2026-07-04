# Production Animations v1

对应飞书卡：`WTJ-20260704-026`。

本包提供任务道具状态帧 v1，优先覆盖 `faucet`、`horse` 与后续拆卡交付的单道具动效。产物是可直接进入 app 的透明 PNG 编号帧和 frame sheet，不是 docs 示意图。

## 产物

- `manifest.json`: 动画清单，含 fps、loop、anchor、bounds、frames、frame sheet。
- `source/`: 从 A 包复制的静态生产素材源图。
- `faucet/`: off、running、closing、closed 四组透明 PNG 帧与 sheet。
- `horse/`: idle、run、stop-success 三组透明 PNG 帧与 sheet。
- `lamp/`: off、turning-on、on、turning-off 四组透明 PNG 帧与 sheet。
- `previews/`: 暗底 GIF 预览。
- `contact-sheets/animation-v1-contact-sheet.png`: 暗底接触表。

## 覆盖范围

### Faucet

- `off`: 1 帧，静止关水。
- `running`: 6 帧，循环水流和水滴。
- `closing`: 5 帧，水流减弱并附带非文字旋转提示光。
- `closed`: 1 帧，关闭确认态。

### Horse

- `idle`: 4 帧，轻微呼吸/上下浮动。
- `run`: 8 帧，轻量跑动 bob、细微倾斜、尘土和速度线。
- `stop_success`: 6 帧，停止缓冲后出现成功闪光。

### Lamp

- `off`: 1 帧，熄灯静止态。
- `turning-on`: 6 帧，按钮微亮、灯泡和光锥逐步增强。
- `on`: 1 帧，亮灯静止态。
- `turning-off`: 5 帧，光锥和灯泡逐步熄灭。

## 生成方法

本包没有重新生成已接受的主体图，因为重画会带来材质漂移。实际帧由已有生产 PNG 做确定性变换生成：

- faucet 主体来自 `docs/assets/production-pack-a/task-props/faucet.png`。
- horse 主体来自 `docs/assets/production-pack-a/task-props/horse.png`。
- lamp 主体来自 `docs/assets/production-pack-a/task-props/lamp.png`。
- 水流、尘土、速度线、成功闪光、灯光锥和灯泡 halo 为透明叠加层，绘制在同一 `1024x1024` 画布内。
- 主体素材不做风格重绘，只做轻微位移、缩放、旋转、局部亮度调整和透明特效叠加。

可复用的视觉方向提示词：

```text
Use the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the existing production sprite material exactly; only add transparent animation effects, subtle pose/position changes, and lamp on/off lighting. Keep every frame on a 1024x1024 transparent canvas, with stable anchor, no text, no watermark, no background, no magenta residue.
```

## 取舍

- `horse run` 是 v1 的轻量跑动循环，不是逐腿骨骼动画。这样能避免在扁平 PNG 上强行扭曲腿部导致低质量破相；如需要更强跑步表现，v2 应重新生成分层马身/腿部源或整套逐帧 pose。
- `faucet closing` 没有真的分离并旋转金属把手，而是用水流减弱加旋转提示光表达关闭过程。原因同上：直接切割 flattened PNG 的把手会破坏金属材质和边缘。
- `lamp on/off` 已在拆卡 `WTJ-20260704-032` 中补齐，采用保留灯体材质、只生成光效和局部亮度变化的方案。`door opening`、`bell ring` 已由各自拆卡交付。

## 自检

- 根索引中的 faucet/horse/lamp 共 44 张编号帧均为 `1024x1024 RGBA`。
- 所有编号帧四角 alpha 均为 0。
- 可见像素中无 #ff00ff / 洋红残留。
- `manifest.json` 中所有 frame、sheet、preview、contact sheet 路径均存在。
- 暗底接触表已检查：无明显裁切，faucet 状态可读，horse 材质稳定，lamp off/on 与过渡光效可读。
