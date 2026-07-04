# Prompt And Rationale

本包没有重新调用图像生成模型。视觉策略是复用已验收生产素材，并用统一的 soft-clay medallion 体系生成五槽尺寸图标，降低风格漂移风险。

## 视觉约束

```text
Use the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, top-left soft light, warm child-friendly saturation. Discovery icons must be readable inside a five-slot tray at about 58-72 px, with both filled and muted states. No text, no watermark, no background, no copyrighted character style.
```

## 设计说明

- 点亮态使用暖色描边和低强度光晕，适合作为五槽“已发现”状态。
- 灰态去饱和并降低 alpha，但保留 medallion 轮廓，避免空槽看起来像缺图。
- 键盘探索、秘密词发现、任务成功三类语义都各给了 4 个候选，PM 可按游戏节奏筛选。

## 已知风险

- 当前图标是候选集合，不代表 12 个都要进入 app；建议 PM/Ethan 先从每类各选 1-2 个。
- 键盘里程碑没有数字标记，儿童友好但对成人配置含义不够直白；manifest 中已保留语义 ID。
