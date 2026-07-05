# Validation

对应飞书卡：`WTJ-20260705-006`。

## 结果

`PASS`

## 检查项

- `frames/completion_stamp_000.png` 到 `frames/completion_stamp_011.png`: 12 张 `1024x1024 RGBA` 透明 PNG。
- 首帧和尾帧透明，便于奖励 overlay 进入和移除。
- 四角 alpha 为 0。
- 可见 alpha bbox 未贴边，无裁切。
- 未检出 chroma-key 绿幕残留。
- `completion-stamp-sheet.png`: `4096x3072`。
- `previews/completion-stamp-preview.gif`: 12 帧。
- `completion-stamp-static.png`: 静态 fallback 存在且非空。
- `manifest.json` 中记录的帧、sheet、preview、contact sheet、source 和文档路径均存在。

## 视觉复核

- 深色画布上主体可读。
- 三枚完成勾清楚表达三项任务完成。
- 没有火箭、宝箱、篮子、狗、文字、水印或 emoji 占位风格。
- 星光只作为短暂庆祝元素，后段淡出，降低遮挡主体验的风险。
