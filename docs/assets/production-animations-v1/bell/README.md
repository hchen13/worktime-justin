# Bell Animation v1

对应飞书卡：`WTJ-20260704-031`。

本目录是 bell 单卡验收范围。faucet、horse、treasure-chest、door、lamp 均由各自卡片单独验收，本卡证据只引用铃铛响动。

## 状态

- `idle/`: 1 帧，静止铃铛。
- `ring/`: 6 帧，循环/敲响态。`WTJ-20260706-003` 返工后采用更大的左右交替倾角、位移和更强的声波弧线，让 96-128px 小尺寸下也能读成“响铃”。
- `settle/`: 4 帧，振幅衰减并回到静止。
- `sheets/`: 每个状态的 frame sheet。
- `bell-contact-sheet.png`: 暗底验收接触表。
- `manifest.json`: fps、loop、anchor、bounds、frames、sheet、preview 和本轮 evidence 路径。
- `evidence/wtj-20260706-003/`: 本轮 before/after、暗底小尺寸自检、alpha checker 和 validation JSON。

## 生成方法

主铃铛图来自 `docs/assets/production-pack-a/task-props/bell.png`，不重新生成主体，避免和 Pack A / Pack B 的 soft-clay / polished-metal 材质发生漂移。

动效帧采用确定性处理：

- `idle` 使用原始生产铃铛。
- `ring` 对主体做更明显的交替旋转和左右位移，并叠加透明声波弧线与小高光；不重新生成铃铛主体，避免材质和轮廓漂移。
- `settle` 逐步降低旋转幅度和声波透明度，回到稳定状态。

可复用的视觉方向提示词：

```text
Use the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the existing bell material exactly; only add transparent animation effects, subtle ringing rotation, sound arcs, and metallic glints. Keep every frame on a 1024x1024 transparent canvas, with stable anchor, no text, no watermark, no background, no magenta residue.
```

## 取舍

这是 v1 的 flattened PNG 动效，不是分层 clapper/handle 的物理模拟。主体用小幅旋转和透明声波表达“响动”，避免强行切割铃舌、铃身后造成金属边缘破损。若后续需要更真实的敲击/摆锤细节，v2 应重新生成分层 source，至少拆为 handle、bell body、clapper、ring waves 四层。

`WTJ-20260706-003` 没有改变 runtime 帧数，仍保持 6 帧，避免需要同步修改 `app/web/anim-manifest.js` 的 frameCount。返工重点是让现有 6 帧里每一帧的轮廓倾角和声波在暗底小尺寸下更可读。

## 自检

- 11 张编号帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 可见像素无 #ff00ff / 洋红残留。
- `manifest.json` 中所有 frame、sheet、preview、contact sheet、source 路径均存在。
- 暗底接触表已检查：idle/ring/settle 状态可读，无明显裁切，铃铛主体材质稳定。
- `WTJ-20260706-003` 小尺寸自检见 `evidence/wtj-20260706-003/bell-ring-small-size-readability.png`；before/after 见 `evidence/wtj-20260706-003/bell-ring-before-after-contact-sheet.png`。
