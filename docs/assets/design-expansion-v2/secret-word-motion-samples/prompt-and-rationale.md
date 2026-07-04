# Prompt And Rationale

本包没有调用新的图像生成模型，而是复用已验收静态生产 sprite 做确定性 motion sample。这样可以避免新模型输出造成风格漂移、脏 alpha、随机碎片、水印或版权风格风险。

## 动作设计约束

```text
Use the accepted WorkTime Justin production sprites as source. Create short one-shot secret-word hit animations: five transparent 1024x1024 RGBA frames per word, child-friendly, readable on dark canvas at 72px and 128px. Preserve the polished 2.5D soft-plastic / soft-clay material, top-left soft light, clean silhouette, and centered padding. Use clear action changes such as hop, lean, roll, spin, zip, tail/paw/leaf arcs, and soft motion puffs. Do not use text, watermark, brand imitation, emoji style, dirty alpha, random fragments, or mere opacity blinking.
```

## 取舍

- 这是轻动效样例，不是最终全量动画库；每个对象统一 5 帧，便于 PM/Ethan 快速看帧反馈。
- 动作痕迹为小尺寸辅助读动作，避免在透明 PNG 里加入场景背景。
- dog/cat/apple 使用源图整体姿态变化加局部语义弧线；car/ball/star 的位移和旋转更明显。
- 如果 PM 希望进入产品，建议另拆 TL 集成卡，并让 QA 做暗底小尺寸和帧跳变视觉验收。

## 源素材

- `dog`: `docs/assets/production-pack-b/sprites/dog.png` -> `hop-tail-swish`
- `cat`: `docs/assets/production-pack-b/sprites/cat.png` -> `lean-paw-wave`
- `apple`: `docs/assets/production-pack-b/sprites/apple.png` -> `leaf-nod-pop`
- `ball`: `docs/assets/production-pack-b/sprites/ball.png` -> `bounce-roll`
- `star`: `docs/assets/production-pack-b/sprites/star.png` -> `spin-spark`
- `car`: `docs/assets/production-pack-b/sprites/car.png` -> `zip-stop`
