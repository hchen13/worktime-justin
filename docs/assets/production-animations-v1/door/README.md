# Door Animation v1

对应飞书卡：`WTJ-20260704-030`。

本目录是 door 单卡验收范围。faucet、horse、treasure-chest、bell、lamp 均由各自卡片单独验收，本卡证据只引用门打开动效。

## 状态

- `closed/`: 1 帧，关闭门。
- `opening/`: 5 帧，门扇向右侧铰链方向压缩打开，露出干净连续的室内暖光。`WTJ-20260706-004` 返工后移除了旧帧里的硬水平接缝、块状脏影和生成残留。
- `open/`: 1 帧，打开保持态；本轮同步为干净终态，避免 contact sheet / GIF 末尾重新出现旧脏背景。
- `sheets/`: 每个状态的 frame sheet。
- `door-contact-sheet.png`: 暗底验收接触表。
- `manifest.json`: fps、loop、anchor、bounds、frames、sheet、preview 和 evidence 路径。
- `evidence/wtj-20260706-004/`: 本轮 before/after、门洞裁切、小尺寸自检、alpha checker 和 validation JSON。

## 生成方法

主门图来自 `docs/assets/production-pack-a/task-props/door.png`，不重新生成主体，避免和 Pack A / Pack B 的 soft-clay 材质发生漂移。

动效帧采用确定性处理：

- `closed` 使用原始生产门。
- `opening` 从已验收 closed 门图派生：保留石质门框、底座和木门材质，重绘干净暖光门洞；门扇向右侧铰链压缩，模拟向内打开。
- `open` 与 opening 最后一帧保持一致，作为干净终态。

可复用的视觉方向提示词：

```text
Use the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the existing door material exactly; only add transparent animation effects, hinge-side door opening movement, and warm interior light. Keep every frame on a 1024x1024 transparent canvas, with stable anchor, no text, no watermark, no background, no magenta residue.
```

## 取舍

这是 v1 的 flattened PNG 分层动效，不是完整 3D 铰链旋转。门扇采用压缩打开表现，能稳定保留门框、石材和木纹质感；`WTJ-20260706-004` 优先解决验收反馈里的背景脏块/接缝，而不重开分层 rig。若后续需要更真实的门扇透视和厚度，v2 应重新生成分层 source，至少拆为 stone frame、door leaf、interior light、hardware 四层。

## 自检

- 7 张编号帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 可见像素无 #ff00ff / 洋红残留。
- `manifest.json` 中所有 frame、sheet、preview、contact sheet、source 路径均存在。
- 暗底接触表已检查：closed/opening/open 状态可读，无明显裁切，门框和门扇材质稳定。
- `WTJ-20260706-004` 小尺寸自检见 `evidence/wtj-20260706-004/door-opening-small-size-readability.png`；before/after 和门洞裁切见同目录证据图。
