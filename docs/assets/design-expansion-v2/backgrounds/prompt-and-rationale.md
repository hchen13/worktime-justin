# Prompt And Rationale

本包采用确定性本地绘制，不调用图像生成模型。原因是 PM 已明确拒绝抽象大光斑/渐变圆块/bokeh 方向；代码绘制可以强制把视觉控制在 WorkTime Justin 工作台语义内，并避免随机贴图碎片、水印、文本、脏 alpha、版权风格模仿。

## 设计提示

```text
Create restrained dark WorkTime Justin workbench backgrounds for a toddler-safe fullscreen desktop app. The scene should feel like a quiet soft-plastic / soft-clay workbench stage: matte wall plane, subtle desktop plane, tiny shelves or rails, peripheral task atmosphere, top-left soft light implied by bevels. Keep the center clean for bright random letters. Show only one low-key question mark and five discovery slots in mocks. Do not use abstract light orbs, bokeh circles, decorative blobs, terminal input echoes, right-side icon stacks, wallpaper patterns, text inside assets, watermarks, or brand-like characters.
```

## 取舍

- 背景是 `RGB` 画布底层候选，不是透明 sprite；因此不做 alpha 角检查。
- 场景细节被限制在边缘和桌面低位，中间留给 A/D/G/T 等大字母。
- `reward-warm-shelf` 只建议作为短暂奖励 tint；不建议默认常驻。
- `task-focus-workbench` 的任务卡在右缘，语义上支持问号任务，但不构成第二套默认入口。
- 当前包用于 PM/Ethan 视觉筛选；是否进入 runtime 应由 PM 另拆 TL 集成卡决定。

## 对比度摘要

- `default-workbench`: min sampled letter contrast 6.43; Default canvas, broadest safe option.
- `keyboard-exploration-desk`: min sampled letter contrast 6.03; Keyboard exploration with subtle key shapes near the desk.
- `task-focus-workbench`: min sampled letter contrast 6.55; Question-mark task mode, with one quiet task card at the right edge.
- `reward-warm-shelf`: min sampled letter contrast 6.02; Short reward tint after a meaningful event.
- `quiet-rest-bench`: min sampled letter contrast 6.19; Rest/reset state after a larger reward or busy task.
- `night-clean-stage`: min sampled letter contrast 6.56; Very quiet night/default alternate for lower stimulation.
