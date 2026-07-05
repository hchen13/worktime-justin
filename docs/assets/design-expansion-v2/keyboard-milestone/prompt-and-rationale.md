# Keyboard Milestone Prompt And Rationale

对应飞书卡：`WTJ-20260705-007`。

## 推荐方案

推荐 `keyboard_milestone_v1` 作为键盘探索里程碑正式图标。它采用宽键盘主体、清晰键帽行和少量暖色按键，让 72px 卡槽小图仍能一眼读出“键盘”。星星只作为 popup 上极少量庆祝点缀，不承担语义。

## 生成方式

- 图像生成：Codex built-in `image_gen`
- 透明处理：本地 chroma-key alpha cleanup
- 派生：本地确定性生成 popup、filled slot、muted slot、72px/144px 预览和可选 pop 动画
- 最终路径：`docs/assets/design-expansion-v2/keyboard-milestone/`

## Source Prompt

```text
Use case: stylized-concept
Asset type: production game milestone icon source for WorkTime Justin keyboard exploration reward
Primary request: Create one polished 2.5D toy-like computer keyboard icon, immediately recognizable as a keyboard even at small size. It should be a chunky rounded mini keyboard with clear rows of raised keycaps, a few warm accent keys, subtle bevels, and a friendly sticker/toy finish. No star should be the main symbol.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal.
Subject: centered single toy keyboard object only; clear rectangular keyboard silhouette in slight 3/4 top-down view; no computer screen, no laptop lid, no mouse, no hands, no letters, no text, no logo, no face, no animal, no treasure chest, no rocket, no basket.
Style/medium: high-quality finished children's app sprite, polished 2.5D soft-plastic / soft-clay rendering, crisp silhouette, subtle bevels, medium soft outline, top-left soft light, clean material detail, unified with dark navy app canvas and die-cut reward stickers.
Composition/framing: centered, generous padding inside a square sprite canvas, full object visible, no crop, readable when scaled to a 72px discovery slot. Use larger keycaps and simplified rows so it remains legible at slot size.
Lighting/mood: cheerful but restrained, premium toy material, no cast shadow on the background, no floor plane.
Color palette: deep teal body, warm cream keycaps, small gold/coral accent keys, soft navy outline; do not use #00ff00 anywhere in the subject.
Constraints: background must be one uniform #00ff00 with no gradient, texture, shadows, reflections, or lighting variation; subject fully separated from background with crisp edges; no text, no letters, no watermark, no logo, no brand imitation.
Avoid: star badge as the primary symbol, flat vector icon, emoji style, low-detail placeholder, overbusy sparkles, realistic office keyboard, visible generation artifacts.
```

## 取舍

- 放弃旧 `keyboard-star`：旧图小尺寸读成星星或泛探索奖励，不像键盘里程碑。
- 不使用文字或字母：避免生成伪影，也避免把键盘探索误解成输入框任务。
- 键帽做大、行数简化：服务 72px 卡槽可读性，而不是写实键盘完整还原。
- popup 保留少量星光：只表达奖励，不让星星成为图标主体。
- muted 状态保留键盘轮廓和键帽行：灰态仍可识别，而不是只剩一个模糊圆点。

## 已知风险

- popup 比 slot 版本更强，建议作为短奖励或成就弹出，不应常驻 footer。
- 生成源图是高质量单体键盘，不包含 app 运行时布局；接入时仍需 TL/QA 检查实际 slot 尺寸、对齐和暗底对比。
