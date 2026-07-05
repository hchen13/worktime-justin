# Validation

对应飞书卡：`WTJ-20260705-007`。

## 结果

`PASS`

## 检查项

- `popup/keyboard-milestone-popup.png`: `1024x1024 RGBA`，四角透明，主体 bbox `(132, 160, 892, 881)`。
- `slot/keyboard-milestone-slot-filled.png`: `1024x1024 RGBA`，四角透明，主体 bbox `(72, 72, 953, 953)`。
- `slot/keyboard-milestone-slot-muted.png`: `1024x1024 RGBA`，四角透明，主体 bbox `(142, 142, 883, 883)`。
- `slot/keyboard-milestone-slot-filled-72.png` / `slot/keyboard-milestone-slot-muted-72.png`: `72x72 RGBA`，用于小尺寸可读性检查。
- `slot/keyboard-milestone-slot-filled-144.png` / `slot/keyboard-milestone-slot-muted-144.png`: `144x144 RGBA`。
- `frames/keyboard_milestone_pop_000.png` 到 `frames/keyboard_milestone_pop_007.png`: 8 张 `1024x1024 RGBA`。
- 动画首帧和末帧透明，便于 overlay 进入和移除。
- `keyboard-milestone-pop-sheet.png`: `4096x2048`。
- `previews/keyboard-milestone-pop-preview.gif`: 8 帧。
- `contact-sheets/keyboard-milestone-contact-sheet.png`: `1680x1120`。
- `manifest.json` 中引用的 source、popup、slot、frames、sheet、preview、contact sheet、prompt 和 README 路径均存在。
- 未检出 chroma-key 绿幕残留。

## 视觉复核

- 72px filled 版本仍能读成键盘，键帽行和宽键盘轮廓清楚。
- muted 版本保留键盘轮廓，不退化成模糊圆点。
- 星星不作为主语义；主图标是键盘。
- 未引入文字、字母、水印、品牌、火箭、篮子、宝箱、狗或 emoji 占位风格。
