# Horse Animation v1

对应飞书卡：`WTJ-20260704-028`。

本目录是 horse 单卡验收范围。faucet 相关文件已通过 `WTJ-20260704-026` 作为单独卡处理，本卡证据只引用 horse。

## 状态

- `idle/`: 4 帧，轻微呼吸/上下浮动。
- `run/`: 8 帧，轻量跑动循环，包含主体 bob、细微倾斜、尘土和速度线。
- `stop-success/`: 6 帧，停止缓冲后出现成功闪光。
- `sheets/`: 每个状态的 frame sheet。
- `horse-contact-sheet.png`: 暗底验收接触表。
- `manifest.json`: fps、loop、anchor、bounds、frames、sheet、preview 路径。

## 生成方法

主 horse 图来自 `docs/assets/production-pack-a/task-props/horse.png`，不重新生成主体，避免和 Pack A / Pack B 的 soft-clay 材质发生漂移。

动效帧采用确定性处理：

- 主体做小幅位移、缩放和旋转，保持同一画布、同一材质。
- `run` 加入低透明尘土和速度线，增强运动感。
- `stop-success` 加入彩色软高光闪星，表达任务完成。

可复用的视觉方向提示词：

```text
Use the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the existing horse material exactly; only add transparent animation effects and subtle pose/position changes. Keep every frame on a 1024x1024 transparent canvas, with stable anchor, no text, no watermark, no background, no magenta residue.
```

## 取舍

`run` 是 v1 轻量跑动循环，不是逐腿骨骼动画。原因是当前源素材是 flattened PNG，强行分割和扭曲腿部会破坏边缘、阴影和软陶材质，质量会低于 production-asset-quality。若需要更强跑步表现，v2 应重新生成分层马身/腿部源或整套逐帧 pose。

## 自检

- 18 张编号帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 可见像素无 #ff00ff / 洋红残留。
- `manifest.json` 中所有 frame、sheet、preview、contact sheet 路径均存在。
- 暗底接触表已检查：主体没有裁切，材质稳定，idle/run/stop_success 状态可读。
