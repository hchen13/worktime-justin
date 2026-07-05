# Completion Stamp v3 Prompt And Rationale

对应飞书卡：`WTJ-20260705-006`。

## 推荐方案

推荐 `completion_stamp_v3` 作为今日工作完成默认奖励。它用一个 2.5D 工作台完成印章、三枚完成勾和短星光，表达“三项任务已完成”；动画为一次性 pop、盖章感、星光释放、淡出，不长期遮住深色主画布。

## 生成方式

- 图像生成：Codex built-in `image_gen`
- 透明处理：本地 chroma-key alpha cleanup
- 动画生成：对透明主体做确定性缩放、位移、透明度和星光粒子帧
- 最终路径：`docs/assets/design-expansion-v2/work-complete-reward/completion-stamp-v3/`

## Source Prompt

```text
Use case: stylized-concept
Asset type: production game reward sprite source for WorkTime Justin, a child-friendly desktop/workbench completion reward
Primary request: Create one polished 2.5D toy-like completion badge/stamp visual that communicates "three tasks finished" without using text. The subject should be a chunky rounded golden workbench stamp or seal with three small completed task lights/check tokens arranged clearly around it, a gentle celebratory sparkle halo, and refined soft-plastic/clay rendering.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal.
Subject: centered single reward object, no rocket, no basket, no treasure chest, no dog, no emoji face; visual metaphor is workbench completion stamp / three-task completion badge.
Style/medium: high-quality finished children's app sprite, polished 2.5D soft plastic and soft clay, crisp silhouette, subtle bevels, soft outline, top-left soft light, clean material detail.
Composition/framing: centered, generous padding inside a square sprite canvas, full object visible, no crop, readable at small overlay size on a dark navy app canvas.
Lighting/mood: warm celebratory but restrained; no cast shadow on the background, no floor plane.
Color palette: warm gold, soft teal, cream, tiny green completion accents; do not use #00ff00 anywhere in the subject.
Constraints: background must be one uniform #00ff00 with no gradient, texture, shadows, reflections, or lighting variation; subject fully separated from background with crisp edges; no text, no letters, no watermark, no logo, no brand imitation.
Avoid: rough icon, emoji style, flat vector look, low-detail placeholder, overbusy fireworks, long cluttering decoration, visible generation artifacts.
```

## 取舍

- 放弃火箭作为默认奖励：Ethan 已指出旧火箭质量不够，且火箭语义更像大奖励，容易抢中心体验。
- 不做宝箱、篮子、狗等形象：这些已被明确反馈为过扁平或质量不可接受，继续沿用会扩大风格风险。
- 不加文字：三岁孩子不依赖阅读，且文字会增加生成伪影和本地化成本。
- 使用完成印章：它和“今天的工作完成”更贴近，也能用三枚完成勾直接表达三项任务。
- 星光只作为瞬时点缀：中后段会淡出，避免奖励停留过久。

## 已知风险

- 源图上方仍有星形装饰，但主语义来自三枚完成勾和印章，不把星星作为任务完成主体。
- GIF 只用于评审预览；真实接入应使用透明 PNG 帧或 sheet。
- 还未经过运行时尺寸、播放时长和叠层位置验证，建议 PM 通过后再路由 TL/QA。
