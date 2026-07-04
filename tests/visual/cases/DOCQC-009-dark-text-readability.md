# DOCQC-009 深色背景文字可读性（对比度，hybrid）

- 类型: hybrid（脚本对比度 + 视觉复核）
- 优先级: P0
- 关联需求: 深色主题需求文档的可读性；WTJ-20260703-002 验收标准 5
- 前置: `python3 tests/visual/scripts/capture_docs.py`；视觉层判读前确认
  `tests/reports/docs-qc/GATE_FAILED` **不存在**（存在=硬门禁失败、截图已被移入
  `quarantine/`，禁止判读，见 tests/visual/README.md 两级门禁语义）。
- 脚本层归属: `text_contrast_aa` 是 **advisory** 探针（probes.json 的
  `advisory` 段），**只**决定本用例（DOCQC-009）的脚本层结论；它失败（退出码 3）
  不作废截图、不连坐 008/010/011/012。
- 输入: `tests/reports/docs-qc/probes.json`（`advisory.text_contrast_aa`）+
  桌面 segments（**以 probes.json `profiles.desktop.screenshots.segments`
  清单为唯一权威**，不要 glob 目录）

## 测什么
深色背景 (#0e1117 系) 上的正文、次级文字（muted 灰）、表格文字、卡片说明、
tag/pill 小字是否全部达到可读标准；半透明表面（卡片、callout、置顶导航）上的
文字是否仍然可读。

## 怎么测
两层：

1. **脚本层**（capture_docs.py 内置）：对页面采样到的每种「文字颜色 x 字号 x
   纵/横向带 x 有效背景签名」组合计算 WCAG 对比度（无采样硬顶，覆盖到页面
   末尾；背景取自元素内部像素、双候选取低对比，详见 tests/visual/README.md），
   正文阈值 4.5:1、大字（>=24px 或 >=18.66px 粗体）阈值 3.0:1。
   结果写入 probes.json 的 `advisory.text_contrast_aa`。实现语义（详见
   tests/visual/README.md）：
   - **背景色实测**：从已截的全页 PNG 上取样字 bbox 周边/背后像素的中位色
     （先剔除接近前景色的像素）——渐变、图片背景、半透明表面叠加都按真实
     渲染结果计。
   - **前景色浏览器内归一化**：computed color 画到 1x1 canvas 读回像素，
     `oklch()` / `color(display-p3 …)` 等一律真实求值，不会被静默跳过。
   - **防空转**：`evaluated >= 1` 才允许 pass；无法评估的样本进
     `detail.skipped` 并打 WARNING。
2. **视觉层**：把桌面 segments 逐张交给视觉子代理，用下面 prompt 复核脚本覆盖不到的
   情况（发光文字、图片内文字、字体渲染导致的主观可读性）。

## 视觉理解 Prompt（对每张 segment 分别执行，最后汇总）

```
你在质检一个深色主题需求文档的文字可读性。只看这张截图，回答具体问题：

1. 这张截图里最难读的一段文字是哪一段？引用它的开头文字，说明它难读的原因
   （太灰/太小/背景太亮/发光模糊/被图案干扰），或者明确说"没有难读的文字"。
2. 灰色次级文字（说明文字、列表、表格单元格、图片下方 caption）是否全部能不费力
   地读出来？随机挑 2 处灰色小字，把它们的内容抄出来作为证据。
3. 卡片、标签(tag/pill)、高亮块(callout) 这类带背景色的表面上，文字和表面底色的
   对比是否足够？有没有"浅色文字浮在浅色半透明底上"或"暗文字压在暗底上"的组合？
4. 如果截图里有产品界面 mock 图片：图片内部的文字（如界面标题、按钮字）在当前
   显示尺寸下是否可辨认？不可辨认时说明是"本来就是装饰性小字"还是"关键信息丢失"。

输出严格 JSON：
{
  "pass": true/false,
  "reason": "一句话",
  "evidence": ["每个问题的具体观察，含抄录的文字"],
  "risks": ["边缘可读但不舒适的位置"]
}
判定规则：出现任何"需要努力才能读出"的正文/说明/表格文字 → pass=false；
纯装饰性元素（发光字母、mock 图内装饰）不影响 pass，但要进 risks。
```

## 怎么算过
- 脚本层：probes.json 中 `advisory.text_contrast_aa.pass == true`
  （`belowAA` 为空且 `evaluated >= 1`）。
- 视觉层：所有 segment 的 JSON 均 pass=true。
- 两层都过才算过；任一层 fail 都要附上具体颜色/文字位置提报。
- 本用例 fail（退出码 3）**不影响** 008/010/011/012 在有效截图上的判读。

## 证据
- probes.json 的 `advisory.text_contrast_aa.detail`（evaluated / skipped /
  belowAA，belowAA 每条含实测背景色 `measuredBg` 与对比度）
- 各 segment 的视觉 JSON（汇总存 `tests/reports/docs-qc/DOCQC-009.json`）

## 鲁棒性说明
- 脚本按「计算样式采样」而不是选择器清单工作，TL 重构 class 名不影响。
- 阈值是 WCAG AA 通用标准，不耦合当前配色；背景是像素实测的，正式版若改
  浅色主题（浅底 + 深色文字）属合法设计，自然通过，不会误报。
- 渐变/图片背景/任意 CSS 色彩空间（oklch 等）都被真实评估：白底白字类
  低对比变异已验证会触发脚本层红（advisory 失败、退出码 3）。
- 无法评估的样本（如移出画面的跳转链接）降级进 `skipped`，不判失败；
  但评估数为 0 时按失败处理，防止探针空转假绿。
