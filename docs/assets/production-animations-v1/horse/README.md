# Horse Animation v2

对应飞书卡：原始交付 `WTJ-20260704-028`，本次返工 `WTJ-20260704-068`。

本目录是 horse 单卡验收范围。faucet、treasure chest、lamp 等资产由各自卡片单独验收，本卡证据只引用 horse。

## 状态

- `idle/`: 4 帧，轻微呼吸/上下浮动，沿用已验收静态主体。
- `run/`: 8 帧，重新生成的真实小跑/奔跑循环，前后腿交替、支撑/抬腿/落脚姿态可读。
- `stop-success/`: 6 帧，停止后出现成功闪光；已移除旧速度线、尘土点和脚下脏边。
- `sheets/`: 每个状态的 frame sheet。
- `horse-contact-sheet.png`: 暗底验收接触表。
- `manifest.json`: fps、loop、anchor、bounds、frames、sheet、preview 路径。
- `prompt-and-rationale.md`: 本次返工提示词、取舍与自检证据。

## 生成方法

`run` 不再使用旧版源腿切片旋转，也不再用主体 bob / 倾斜冒充奔跑。新 run 使用内置 image generation 生成 8 帧横向 sprite sheet：以已验收 horse sprite 为风格和主体参考，要求每帧保持同一小马、同一 3/4 朝向，并真实改变腿部姿态。

生成 sheet 使用 #00ff00 chroma-key 背景；随后逐帧拆分、去背、统一缩放到 `1024x1024 RGBA` 透明画布。拆帧后对 run 帧做连通域清理，只保留主马主体，删除邻格边缘带来的孤立碎片。

Designer 1 在 `2026-07-04 17:53 CST` 接手 PM 退回的 `WTJ-20260704-068`：PM 点名 `horse_run_003` 左侧仍有漂浮残片。Designer 1 对 `run/horse_run_000..007` 做 actual production PNG 硬清理：移除超低透明残留、低透明 chroma 绿边和低透明蓝/青边，再只保留每帧唯一主 alpha 连通主体；随后重新导出 `run-sheet.png`、`horse-contact-sheet.png`、`horse-run-preview.gif`、检查图、清理报告和 manifest。

可复用的视觉方向提示词：

```text
Use the accepted toy horse sprite as style reference; create an 8-frame horizontal sprite sheet of the same horse doing a readable trot/run cycle with alternating leg poses; no body-bob-only substitute, no speed lines, no dust, no black artifacts, no vertical lines under legs, solid #00ff00 chroma-key background.
```

## 取舍

- 旧版 run 的腿部切片会产生黑块、竖线和不像奔跑的错位姿态，本次直接替换 run 视觉源。
- run 帧之间允许有轻微 AI 生成姿态差异，换取真实可读的腿部交替；头部、身体、鬃毛、鞍具、颜色和材质仍按源小马约束保持统一。
- `stop-success` 重做为干净停止和星光反馈，不再保留旧速度线、尘土点或脚下残留像素。
- `stop-success` 中右侧少量彩色星点是成功反馈，不属于 run 帧残片；本次返工验收重点仍是 `run/horse_run_000..007` 的透明 PNG 清洁度和奔跑可读性。

## 自检

- 18 张编号帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 可见像素无 #ff00ff / 洋红残留；低 alpha #00ff00 / 近似 chroma-key 绿边和低 alpha 蓝/青边残留已清理。
- Designer 1 清理后，`run/horse_run_000..007` 均为单一 `alpha>0` 主体；低 alpha 绿/蓝残留计数为 0。
- PM 点名的 `horse_run_003` 左侧残片已移除：该帧清理后 bbox 为 `(220, 205, 892, 882)`，不再从 x=132 外扩。
- run 8 帧是实际前后腿交替小跑循环，不是主体 bob / 倾斜替代。
- run 帧为单主体连通域，无黑块、竖线、速度线、尘土点、脚下孤立残留像素。
- `manifest.json` 中所有 frame、sheet、preview、contact sheet、inspection、cleanup report、source、README、prompt/rationale 路径均存在。
- 暗底接触表已检查：主体没有裁切，idle/run/stop_success 状态可读。
