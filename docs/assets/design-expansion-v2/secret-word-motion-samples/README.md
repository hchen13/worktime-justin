# Secret Word Motion Samples v2

对应飞书卡：`WTJ-20260704-065`。

本包为 6 个代表性秘密词对象制作 3-6 帧以内的轻动效样例，用于判断静态词池后续是否值得扩展为命中弹出动画。源素材复用已验收生产基准 `docs/assets/production-pack-b/sprites/`，保持 2.5D polished soft-clay / soft-plastic 质感。

## 产物

- `frames/<word>/`: 每个对象 5 张 `1024x1024 RGBA` 透明 PNG 帧。
- `sheets/`: 每个对象一张横向 sprite sheet。
- `previews/`: 每个对象一张深色画布 GIF 预览。
- `contact-sheets/secret-word-motion-samples-contact-sheet.png`: 深色画布接触表，包含 72px / 128px 小尺寸预览。
- `manifest.json`: frame count / fps / loop / anchor / bounds / 路径 / 风险。
- `prompt-and-rationale.md`: 来源、生成方式、动作取舍。

## 样例

- `dog`: `hop-tail-swish`，小狗向上跳一下，末段带尾巴摆动弧线与落地软尘。
- `cat`: `lean-paw-wave`，小猫身体左右倾斜，右上方有 paw-wave 弧线，命中瞬间像招手。
- `apple`: `leaf-nod-pop`，苹果轻轻点头，顶部叶子方向用弧线强调，带小高光星点。
- `ball`: `bounce-roll`，球体沿弧线弹跳并旋转，落地帧有压缩和软尘，适合短暂命中弹出。
- `star`: `spin-spark`，星星做一圈轻旋转，周围出现少量十字高光，不是静态透明度闪烁。
- `car`: `zip-stop`，小车横向滑入并轻点头刹停，后方有短速度条，动作差异明确。

## 自检

- 每个对象 5 帧，全部 `1024x1024 RGBA`。
- 透明角检查通过，最小 alpha 边距 `72` px。
- contact sheet 已展示 72px / 128px 暗底可读性。
- 动作包含位移、旋转、姿态变化与少量动作痕迹，不是只改透明度或只做微缩放。
- 本卡是设计候选，不影响当前静态词池；进入 runtime 需 PM 另拆 TL 集成卡。
