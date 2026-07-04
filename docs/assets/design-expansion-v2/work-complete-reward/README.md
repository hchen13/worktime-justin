# Work Complete Reward v2

对应飞书卡：`WTJ-20260704-060`。

本包交付“今日工作完成”奖励的 3 套生产候选。目标是让 PM/Ethan 能直接看关键帧和短动画 preview 决定方向；当前不直接进入 app，是否集成由 PM 评审后另拆 TL 卡。

## 产物

- `manifest.json`: 3 套候选的帧、sheet、preview、来源素材和质量检查。
- `status-lights/`: 三个工作状态灯一起闪的短奖励。
- `workbench-stamp/`: 工作台盖章/贴纸式完成奖励。
- `rocket-launch/`: 小火箭发射式较强奖励。
- `previews/`: 暗底 GIF，便于直接查看动效。
- `contact-sheets/work-complete-reward-contact-sheet.png`: 三套候选的暗底接触表。
- `source/`: 复制本包使用的已验收生产素材源图，方便追溯。

## 候选说明

1. `status_lights_flash`: 最克制，和需求里的“工作状态灯”语义最直接。适合作为默认完成奖励。
2. `workbench_stamp`: 更像“完成盖章”，但不含文字，不会把贴纸永久堆在画布上。
3. `rocket_launch`: 最有兴奋感，适合作为偶发或更强的三任务连续完成奖励。

## 取舍

- 没有重新生成主体图，避免和已验收 v3 / A / B 包材质漂移。
- 所有动效都是透明 PNG 帧叠加，可由 TL 后续接入现有 frame animation 管线。
- preview GIF 的深色背景仅用于评审；实际帧文件仍是透明背景。
- 三套都不含文字，避免三岁孩子依赖阅读，也避免中文任务说明进入奖励层。

## 自检

- 三套候选共 25 张编号帧，均为 `1024x1024 RGBA`。
- 帧文件透明背景，四角 alpha 为 0。
- 已生成 frame sheet、preview GIF、contact sheet。
- 深色画布上可读，没有明显裁切或永久占屏元素。
