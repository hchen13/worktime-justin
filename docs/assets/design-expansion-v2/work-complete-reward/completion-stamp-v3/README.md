# Completion Stamp v3

对应飞书卡：`WTJ-20260705-006`。

这是本轮推荐的今日工作完成奖励返工包。目标是替换旧火箭方向，提供更稳的“完成印章 + 三任务完成勾”生产级短动画。

## 产物

- `manifest.json`: 帧、sheet、preview、source、质量检查和接入参数。
- `completion-stamp-static.png`: 静态 fallback。
- `frames/completion_stamp_000.png` 到 `frames/completion_stamp_011.png`: 12 张 `1024x1024` 透明 PNG 帧。
- `completion-stamp-sheet.png`: 4 x 3 透明 frame sheet。
- `previews/completion-stamp-preview.gif`: 深色画布预览 GIF。
- `contact-sheets/completion-stamp-v3-contact-sheet.png`: 深色画布接触表。
- `source/completion-stamp-chromakey.png`: built-in `image_gen` 源图。
- `source/completion-stamp-cutout.png`: 清理后的透明源图。
- `prompt-and-rationale.md`: 源提示词、取舍和风险。

## 接入建议

- 默认播放 `completion_stamp_v3`，一次性播放后移除 overlay。
- 推荐 fps: `13`。
- Anchor: `[512, 522]`。
- 首尾帧透明，便于进入和退出，不需要长期驻留。

## 自检

- 12 张编号帧均为 `1024x1024 RGBA`。
- 四角 alpha 为 0。
- frame sheet、静态 fallback、暗底 GIF 和 contact sheet 均已生成。
- 未引入火箭、宝箱、篮子、狗、文字、水印或 emoji 占位风格。
