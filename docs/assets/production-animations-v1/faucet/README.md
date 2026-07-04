# Faucet Animation v1

对应原始卡：`WTJ-20260704-026`。
本轮返工卡：`WTJ-20260705-005`。

本目录是 faucet 单卡验收范围。本轮由 `Designer 1` 认领，身份ID：`Automation:worktime-justin-design-loop`。返工重点：水柱必须与出水口尺度匹配，读起来是有体量的流水，不是细线或短水块；同时保持水龙头主体的比例、光照、材质和位置不跳变。

## 状态

- `off/`: 1 帧，静止关水。
- `open/`: 1 帧，打开满流水，用于需要静态 open 状态的接入方。
- `running/`: 6 帧，循环流水；水柱宽度约 `130-140px`，带圆柱体积、侧向阴影、内侧高光和少量水滴，并保留底部安全留白。
- `closing/`: 6 帧，水流从满流连续收窄到无水。
- `closed/`: 1 帧，关闭确认态。
- `sheets/`: 每个状态的 frame sheet。
- `faucet-contact-sheet.png`: 暗底验收接触表。
- `manifest.json`: fps、loop、anchor、bounds、frames、sheet、预览路径和水流序列数据。

## 取舍

保留已验收的金属 faucet 主体，不重新生成主体，避免材质漂移。水流层用固定 outlet anchor 重绘：先画透明水柱，再把同一张 faucet body 覆盖到上层，让水从出水口后方出现。

旧版水流虽然已经拓宽过，但视觉上仍像短胶囊。本轮把 running/open 改成出水口尺度的下落水柱，宽度围绕出水口尺度轻微变化，形成循环 shimmer；closing 从同一满流宽度连续变窄、变短，最终回到 closed/off 的完全无水状态。返工中避免水流触到画布底边，给 TL 动画混合保留安全留白。

## 视觉生成提示词 / 生成配方

Use the accepted 2.5D polished silver faucet body as a fixed layer. Redraw only the transparent water overlay: a broad falling cyan water column emerging from behind the outlet lip, matching the outlet scale, with rounded volume, darker side shading, a bright inner body, a narrow specular highlight, subtle loop shimmer, and a few readable droplets. Closing should taper smoothly from the same full stream to no water, without body drift, crop, yellow cue dots, dirty pixels, or placeholder marks.

执行上采用 deterministic layer generation，而不是重跑整张 AI 图：卡的硬性要求是主体不跳变，固定 body layer 比重新生成整张水龙头更可靠。

## 自检

- 所有 production frame 均为 `1024x1024 RGBA`。
- 四角 alpha 为 0。
- 无 #ff00ff / #00ff00 key-color 残留。
- `open` 与 `closing_000` 使用同一满流水状态，closing 序列连续收窄到 `closing_005 == closed`。
- 除水流区域外，open/running/closing 主体像素与 `off/faucet_off_000.png` 保持一致。
- contact sheet 和 GIF 使用完整 1024 画布固定缩放，预览不会因水流长短改变主体大小。
