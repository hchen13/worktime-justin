# WTJ-20260704-082 Discovery Footer Sticker System

执行者：Designer 1  
身份ID：Automation:worktime-justin-design-loop  
状态：提交 PM review

## 目标

本卡交付发现槽、2D sticker 样例、footer 分界和右侧宝箱的视觉系统小样。它不是全量词库替换，也不触碰 runtime 代码；PM 接受方向后，再拆全量 sticker 批量生产卡。

产物目录：

- `docs/assets/style/wtj-082/stickers/`
- `docs/assets/style/wtj-082/chest/`
- `docs/assets/style/wtj-082/previews/`
- `docs/assets/style/wtj-082/manifest.json`
- `docs/assets/style/wtj-082/prompt-and-rationale.md`

## 发现槽规则

默认槽位数为 3，配置范围建议为 3 到 5。运行时第一版只展示 3 个主槽；如果配置为 4 或 5，新增槽位先以 ghost slot 显示，不能挤压中间主画布，也不能让 footer 变成第二个游戏面板。

布局：

- footer 高度建议桌面端 96px 左右，移动端按安全区压缩到 76px 到 88px。
- 槽位组居中，宝箱固定在 footer 右侧 lane。
- 槽位直径建议桌面端 82px 到 92px，移动端 64px 到 76px。
- 槽间距建议 18px 到 26px，不能因为第 4/5 槽出现而破坏中间视觉重心。
- footer 顶部分界线使用低对比蓝灰线，推荐 `rgba(156, 180, 220, 0.16)`。
- footer 背景使用接近黑蓝的半透明深色，推荐 `rgba(5, 10, 18, 0.78)`。

状态：

- Empty：深色内芯、细蓝灰外圈、无图形提示，避免白色空洞感。
- Filled：金色外圈、轻微暖色发光，sticker 缩略图占槽位直径的 68% 到 76%。
- Optional/Ghost：低透明深色槽和低透明加号，只表达可扩展，不抢主槽注意力。
- Locked/Unavailable：本卡不建议新增锁形图标；Justin 当前体验更适合少讲规则、少出现惩罚感。

## Sticker 样例规则

本卡提供 8 个代表词样例：

- dog
- cat
- apple
- ball
- star
- key
- zebra
- queen

单体 sticker 标准：

- PNG，`1024x1024`，RGBA，四角透明。
- 单体 PNG 内不嵌入文字、词条标签或 UI chip。
- 主体占画布约 62% 到 74%，保留足够透明外沿，便于运行时缩放。
- 统一 die-cut 贴纸语言：白色贴纸边、深蓝外描边、轻暖色边缘光、柔和投影。
- 形体必须比旧的篮子、宝箱、动物扁平草图更有体积、材质和高光。
- 不使用 emoji、粗糙 mockup、低分辨率截图或带水印素材。

这些样例使用现有已验收 sprite 作为主体来源，再统一生成贴纸外观。这样能保留当前词库识别度，同时把“太扁平、太像占位图”的问题收敛到可复用的生产风格。

## 宝箱规则

宝箱只属于 footer 右侧功能 lane，不进入中间主画布抢注意力。

尺寸：

- 运行时显示建议 72px 到 96px。
- 与槽位组保持至少 20px 视觉间距。
- 移动端优先保留 3 个槽位居中，宝箱可缩小，不能压到槽位。

状态：

- Disabled：低饱和灰蓝、低亮度、无金色光圈，只表达暂不可领取。
- Active：暖金边缘、轻微发光、体积高光更明确，但不做全屏奖励效果。

宝箱单体 PNG 同样为 `1024x1024` RGBA 透明底，运行时不应直接使用旧粗糙版本。

## Contact Sheet

评审预览：

- `docs/assets/style/wtj-082/previews/discovery-footer-contact-sheet.png`
- `docs/assets/style/wtj-082/previews/slot-and-chest-state-preview.png`

预览必须在暗色画布上检查，因为实际体验的中间 canvas 和 footer 都偏暗。浅色边、金色环、灰态宝箱都以暗底可读为准，不以白底展示效果为准。

## 给 TL 的接入边界

如果 PM 接受本视觉方向，后续实现建议读取 `manifest.json` 中的文件路径和 slot 规则；不要把本卡 contact sheet 截图当 runtime 资源切图。

本卡不要求 TL 立即替换全量词库。全量生产需要另开卡，按同一规则批量生成并逐批验收，避免一次性把质量风险带进 runtime。

## 风险与取舍

现有源 sprite 的画风并不完全一致，本卡先用统一 sticker 外观压平差异。它适合做方向评审和前 8 个代表词质量基线；不代表全量词库可以无审查地机械转换。

footer 采用克制布局，是为了保留 Justin 可乱点乱按的主画布空间。宝箱必须是“右侧奖励入口”，不是主角。
