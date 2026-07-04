# Prompt And Rationale

本包没有重新调用图像生成模型，而是复用已验收生产素材做确定性组合与短帧动效，以降低风格漂移风险。

## 复用素材

- `production-pack-a/ui/working-status-light.png`
- `production-pack-a/rewards/happy-reward-sticker.png`
- `production-pack-a/rewards/star-sticker.png`
- `production-pack-a/rewards/sparkle-burst.png`
- `production-pack-b/sprites/rocket.png`

## 视觉约束

```text
Use the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Preserve the existing production sprite material exactly; only add transparent glow, sparkle, squash/scale, position, and flame/trail effects. Keep every frame on a 1024x1024 transparent canvas, no text, no watermark, no background, no magenta residue.
```

## 候选 rationale

### status_lights_flash

Three accepted working-status lights pulse, then a small star and sparkle burst appear; reads as completed work without occupying the canvas permanently.

- Sheet: `status-lights/status-lights-sheet.png`
- Preview: `previews/status-lights-preview.gif`
- Recommended use: 今日工作完成 after three task lights are filled.

### workbench_stamp

A happy/check reward sticker drops like a soft stamp, compresses, and releases star stickers; no text and no permanent sticker pile.

- Sheet: `workbench-stamp/workbench-stamp-sheet.png`
- Preview: `previews/workbench-stamp-preview.gif`
- Recommended use: Sticker/stamp interpretation of 今日工作完成.

### rocket_launch

The accepted rocket sprite lifts off with a warm flame trail and restrained sparkles; most expressive option, still a short one-shot.

- Sheet: `rocket-launch/rocket-launch-sheet.png`
- Preview: `previews/rocket-launch-preview.gif`
- Recommended use: High-delight version when PM/Ethan want a larger celebration.

## 已知风险

- `rocket_launch` 比另外两套更兴奋，PM 若想默认界面更克制，建议只保留为稀有大奖励。
- `workbench_stamp` 当前用无文字 happy/check 贴纸表达盖章，没有真实印章工具；如果 Ethan 更喜欢“爸爸工作台”隐喻，可后续生成专门的 stamp object。
- 三套均为设计候选，还未进入 app 运行性能验证。
