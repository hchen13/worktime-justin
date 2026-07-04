# Backgrounds v2 Rework

对应飞书卡：`WTJ-20260704-062`。

本次为 PM 2026-07-04 15:31 CST 打回后的返工版：删除上一版依赖大光斑、渐变圆块、泛化 bokeh 的视觉方向，改为更克制的 WorkTime Justin 工作台轻背景。背景使用暗色干净舞台、淡桌面/墙面层次、少量可解释的工作台元素，避免抢字母、五槽、单问号和 sprite。

## 产物

- `backgrounds/`: 6 张 `1440x900 RGB` 背景 PNG。
- `mocks/`: 6 张叠加桌面 UI 后的 canvas mock。
- `contact-sheets/backgrounds-contact-sheet.png`: PM/Ethan 评审用接触表，含 desktop mock 与 raw background 小预览。
- `manifest.json`: 用途、路径、对比度抽样、返工自检。
- `prompt-and-rationale.md`: 生成方式、取舍和风险。

## 候选

- `default-workbench`: 默认工作台，最稳妥的常态背景。
- `keyboard-exploration-desk`: 普通键盘探索，桌面低位有少量 keycap 语义。
- `task-focus-workbench`: 问号任务状态，右缘有一张非常淡的任务卡。
- `reward-warm-shelf`: 有意义奖励后的短暂暖色变体。
- `quiet-rest-bench`: 大反馈后回到安静状态的休息/重置背景。
- `night-clean-stage`: 更低刺激的夜间/安静默认备选。

## 自检

- 6 张背景均为 `1440x900 RGB`。
- 6 张 mock 均包含高对比字母、默认单问号、五个发现槽、角落状态灯；无输入回显条、无右侧图标竖排。
- 背景图本身未使用圆形光斑、装饰 orb、bokeh 圆点或泛化渐变圆块；场景元素均为桌面、墙面、架子、轨道、工作垫、任务卡等可解释工作台语义。
- 字母颜色在代表性点位的最小对比度已写入 manifest。
- 本包是设计候选；进入 app runtime 仍需 PM 另拆 TL 集成卡，并可能走 QA 视觉验收。
