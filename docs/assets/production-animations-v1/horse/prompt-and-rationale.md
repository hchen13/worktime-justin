# Horse Run Rework Prompt And Rationale

对应飞书卡：`WTJ-20260704-068`。

## 返工目标

旧版 run sheet 的腿部下方存在黑块、竖线、点状残留，并且连贯播放不是可读奔跑姿态。本次返工目标是产出 8 帧真实可读的小跑/奔跑循环：前后腿交替、支撑/抬腿/落脚清楚，不用主体 bob、倾斜、速度线或尘土替代腿部运动。

## 关键提示词

```text
Use the visible toy horse sprite as the exact visual style and character reference.
Create an 8-frame horizontal sprite sheet of the same cute toy horse doing a clear readable trot/run cycle. The horse must keep the same 3/4 left-facing pose, soft-clay / soft-plastic material, warm orange body, brown mane and tail, red bridle, blue saddle, rounded toy proportions. Each frame should show real alternating leg poses: front/back legs alternate, support/lift/landing are readable. Do not rely on body bob, tilt, speed lines, dust, or motion streaks.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background only.
Constraints: no shadows on background, no text labels, no watermark, no black artifacts, no vertical lines under legs, no extra animals, no dust particles, no motion lines, no cropped hooves, no distorted or broken legs.
```

## 视觉取舍

- 使用内置 image generation 做 run-cycle key sheet，因为手工切腿/旋转容易产生机械感和旧版同类伪影。
- 拆分后的 run 帧统一归一到 `1024x1024` 透明画布，保持 anchor `[0.5, 0.86]`。
- 对 run 帧执行连通域清理，删除邻格残留小碎片。
- Designer 1 接手 PM 退回后，没有重新生成角色风格，而是对实际生产 PNG 做像素级清理：移除超低透明残留、低透明 chroma 绿边和低透明蓝/青边，并在每个 run 帧只保留清理后的主 `alpha>0` 连通主体。
- 这次修复直接针对 PM 点名问题：`horse_run_003` 左侧漂浮残片已移除，清理后该帧 bbox 收回到 `(220, 205, 892, 882)`。
- `stop-success` 星光反馈保持原语义；右侧少量彩色星点是成功反馈，不是 run sheet 残片。
- `stop-success` 去掉旧速度线和尘土点，改为干净停止与少量星光反馈。

## 证据路径

- Manifest: `docs/assets/production-animations-v1/horse/manifest.json`
- Contact sheet: `docs/assets/production-animations-v1/horse/horse-contact-sheet.png`
- Run preview: `docs/assets/production-animations-v1/previews/horse-run-preview.gif`
- Run sheet: `docs/assets/production-animations-v1/horse/sheets/run-sheet.png`
- Run frames: `docs/assets/production-animations-v1/horse/run/horse_run_000.png` through `horse_run_007.png`
- Cleanliness inspection: `docs/assets/production-animations-v1/horse/horse-run-cleanliness-inspection.png`
- Cleanup report: `docs/assets/production-animations-v1/horse/run-cleanup-report.json`
- Source sheet: `docs/assets/production-animations-v1/horse/source-run-cycle-generated-chroma.png`

## 自检

- 18 张生产帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 可见像素无 #ff00ff / 洋红残留；低 alpha #00ff00 / 近似 chroma-key 绿边和低 alpha 蓝/青边残留已清理。
- Designer 1 pass: `horse_run_000..007` 清理后每帧 `alpha>0 components=1`，`magenta=0`，`green=0`，`low_green=0`，`low_blue=0`，四角 alpha 全部为 0。
- PM 点名的 `horse_run_003` 左侧残片已不在暗底 contact sheet、run sheet 和原始生产 PNG 中出现。
- run 8 帧是实际前后腿交替小跑循环，不是主体 bob / 倾斜替代。
- run 8 帧均为单主体连通域，无黑块、竖线、速度线、尘土点、脚下孤立残留像素。
- `manifest.json` 中 frame、sheet、preview、contact sheet、inspection、cleanup report、README、prompt/rationale、source 路径均存在。
