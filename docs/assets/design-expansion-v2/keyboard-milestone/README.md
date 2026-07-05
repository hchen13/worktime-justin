# Keyboard Milestone v1

对应飞书卡：`WTJ-20260705-007`。

这是键盘探索里程碑的正式返工包，用真正的 2.5D 键盘主体替换旧 `keyboard-star` 方案。目标是让弹出奖励和底部卡槽小图都能一眼读成“键盘”，不再用星星代替键盘探索语义。

## 产物

- `manifest.json`: 运行时路径、状态、动画和质量检查入口。
- `source/keyboard-milestone-chromakey.png`: built-in `image_gen` 源图。
- `source/keyboard-milestone-cutout.png`: 透明源图。
- `popup/keyboard-milestone-popup.png`: 弹出奖励版本。
- `slot/keyboard-milestone-slot-filled.png`: 卡槽 filled 源图。
- `slot/keyboard-milestone-slot-muted.png`: 卡槽 muted 源图。
- `slot/keyboard-milestone-slot-filled-72.png` / `slot/keyboard-milestone-slot-muted-72.png`: 72px 小尺寸可读性预览。
- `slot/keyboard-milestone-slot-filled-144.png` / `slot/keyboard-milestone-slot-muted-144.png`: 144px 预览。
- `frames/keyboard_milestone_pop_000.png` 到 `frames/keyboard_milestone_pop_007.png`: 可选 pop 动画帧。
- `keyboard-milestone-pop-sheet.png`: 4 x 2 透明 frame sheet。
- `previews/keyboard-milestone-pop-preview.gif`: 深色画布 GIF 预览。
- `contact-sheets/keyboard-milestone-contact-sheet.png`: contact sheet。
- `prompt-and-rationale.md`: 源提示词与取舍。
- `validation.md`: 自检记录。

## 接入建议

- 卡槽默认使用 `slot/keyboard-milestone-slot-filled.png` 和 `slot/keyboard-milestone-slot-muted.png`，运行时缩放到 72px 左右。
- 弹出奖励使用 `popup/keyboard-milestone-popup.png`；如果需要动效，播放 `frames/` 或 `keyboard-milestone-pop-sheet.png`。
- 动画 fps 建议 `12`，一次性播放，末帧透明后移除 overlay。
- 旧 `discovery-icons/filled/keyboard-star.png` 和 `muted/keyboard-star.png` 只保留为反例，不再作为正式键盘里程碑资产。
