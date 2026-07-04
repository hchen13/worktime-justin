# WTJ-20260704-082 Prompt And Rationale

执行者：Designer 1  
身份ID：Automation:worktime-justin-design-loop

## 生成方式

本卡没有调用外部图库，也没有把临时目录当产物目录。正式资产保存在：

- `docs/assets/style/wtj-082/stickers/`
- `docs/assets/style/wtj-082/chest/`
- `docs/assets/style/wtj-082/previews/`

生成策略是本地合成：以项目内已验收 sprite 为主体来源，统一加上 die-cut sticker 视觉处理，包括白色贴纸边、深蓝外描边、暖色边缘光、柔和投影和高光。

来源：

- `app/web/assets/sprites/dog.png`
- `app/web/assets/sprites/cat.png`
- `app/web/assets/sprites/apple.png`
- `app/web/assets/sprites/ball.png`
- `app/web/assets/sprites/star.png`
- `app/web/assets/sprites/key.png`
- `app/web/assets/sprites/zebra.png`
- `app/web/assets/sprites/queen.png`
- `app/web/assets/sprites/treasure-chest.png`

没有使用内置 image generation 的原因：本卡需要与现有词库和已验收源图保持识别连续性；从零生成一套新图容易偏离当前 app 的对象语义，也会增加后续全量词库一致性风险。

## 视觉提示词基准

用于后续同类资产生产的方向提示：

```text
Kid-friendly premium 2D die-cut sticker for a dark interactive learning canvas.
Single centered object, transparent background, soft dimensional shading, clean white sticker border, subtle navy outer rim, warm highlight, soft drop shadow, readable at small size, no text, no label, no emoji, no watermark, no flat placeholder style.
```

宝箱方向：

```text
Footer reward chest icon, kid-friendly but premium, transparent background, dimensional material, readable at 72-96 px, disabled gray-blue state and active warm-gold state, no text, no label, not a full-screen reward illustration.
```

发现槽方向：

```text
Dark footer discovery slots, default three centered slots, optional fourth and fifth ghost slots, empty state as dark core with thin blue-gray rim, filled state as warm gold ring with sticker thumbnail, right-side treasure chest lane, restrained and non-intrusive.
```

## 取舍记录

第一轮草案里，单体 sticker 曾经包含词条标签 chip。已删除。单体 PNG 现在不嵌入文字，文字只出现在 contact sheet 评审说明中，避免 runtime 缩放时产生脏边或误导。

第一轮 slot preview 里，optional/empty slot 因透明层压到 RGB 背景时偏白，视觉上像浅色空洞。已修正为暗色低对比槽位，符合实际暗色 footer。

宝箱不做大面积发光和主画布展示，因为本卡目标是 footer 右侧奖励入口，不是奖励结算页。

## 输出

Sticker 样例：

- `docs/assets/style/wtj-082/stickers/dog-sticker.png`
- `docs/assets/style/wtj-082/stickers/cat-sticker.png`
- `docs/assets/style/wtj-082/stickers/apple-sticker.png`
- `docs/assets/style/wtj-082/stickers/ball-sticker.png`
- `docs/assets/style/wtj-082/stickers/star-sticker.png`
- `docs/assets/style/wtj-082/stickers/key-sticker.png`
- `docs/assets/style/wtj-082/stickers/zebra-sticker.png`
- `docs/assets/style/wtj-082/stickers/queen-sticker.png`

宝箱状态：

- `docs/assets/style/wtj-082/chest/chest-disabled.png`
- `docs/assets/style/wtj-082/chest/chest-active.png`

预览：

- `docs/assets/style/wtj-082/previews/discovery-footer-contact-sheet.png`
- `docs/assets/style/wtj-082/previews/slot-and-chest-state-preview.png`
- `docs/assets/style/wtj-082/previews/existing-sprite-reference.png`

结构化清单：

- `docs/assets/style/wtj-082/manifest.json`

## 自检证据

- 8 个 sticker PNG 均为 `1024x1024` RGBA。
- 2 个 chest PNG 均为 `1024x1024` RGBA。
- 上述 10 个单体 PNG 四角 alpha 为 0。
- 3 张 preview 均非空。
- `manifest.json` 可解析。

## 回审建议

PM 评审重点是：这个 die-cut sticker 方向是否可以作为全量词库生产基线；发现槽默认 3 个、可扩展到 5 个的规则是否接受；footer 右侧宝箱是否足够清楚但不抢主画布。

如果接受，建议 PM 后续拆出“全量 sticker 批量生产”和“TL runtime 接入”两类卡，不在本卡扩大范围。
