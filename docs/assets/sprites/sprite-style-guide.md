# WorkTime Justin Sprite 样例规范

适用于首批秘密词物体和后续词库扩展。

## 输出

- 透明背景 PNG。
- 方形画布，建议源尺寸 `1024x1024`。
- 主体居中，主体包围盒约占画布 `65%-75%`，四周保留动画边距。
- 对象不要贴边，不带文字、水印、边框或场景背景。

## 视觉

- 成品级 2.5D 友好插画，轮廓简单但细节精致，远看可识别。
- 统一 3/4 正面视角，柔和高光，内部自阴影清楚；透明 PNG 本身不带背景投影。
- 深色画布上必须清楚：浅色主体加深色细节，深色主体加亮边或高光。
- 避免复刻任何品牌角色、影视角色或图库风格。

## 尺寸

- 单个 PNG 保持 `1024x1024`。
- 产品中可按场景缩放到 `128-260px`。
- 阴影和高光包含在透明边距内。

## 当前生产候选样例

- `dog.png`
- `cat.png`
- `apple.png`
- `ball.png`
- `star.png`
- `car.png`
- `basket.png`
- `treasure-chest.png`

评审接触表：`production-sprite-contact-sheet.png`。

源图与处理产物：

- `production-sprite-sheet-source.png`: 内置图片生成得到的洋红抠图源。
- `production-sprite-sheet-alpha.png`: 本地去背后的透明 sheet。
- `exploration-v1/`: 第一版扁平 SVG 样例，只作 exploration/reference，不作为生产素材。
- `exploration-v2/`: 第二版高细节但风格不统一的候选，只作 exploration/reference，不作为生产基准。

## 生成提示

```text
Use case: stylized-concept
Asset type: production sprite sheet for a children's fullscreen desktop app.
Create a polished production-quality sprite sheet with exactly eight separate original objects: dog, cat, apple, ball, star, car, basket, treasure chest.
Perfectly flat solid #ff00ff chroma-key background only, arranged in a clean 4 by 2 grid, one object per cell, no labels, no shadows on the background.
Style: one single art direction across all eight objects: polished 2.5D soft-plastic / soft-clay children's app illustration, not photorealistic, not emoji, not sticker, not plush toy, not 3D mascot render. Use simplified rounded geometry, refined matte shading, clean crisp silhouette, subtle bevels, same medium-thick soft outline, same 3/4 front perspective, same camera distance, same top-left soft light, same saturation, same detail density.
Dog and cat are cute but simplified soft-clay animal sprites, not realistic pets and not branded characters. Apple is stylized soft-clay, not a realistic fruit photo. Ball, car, basket, and treasure chest use the same soft-clay material language, not toy catalog renders. Star is an object only, no face.
Avoid text, labels, watermark, background objects, border, frame, copyrighted character style, and #ff00ff inside objects.
```

## 后处理

1. 用 `remove_chroma_key.py` 移除洋红背景。
2. 按 4x2 网格切图。
3. 对每张图只保留最大 alpha 连通域，去除相邻格残片。
4. 重新打包到 `1024x1024`，主体约占 `65%-75%`。
5. 在深色画布接触表上做可读性检查。
