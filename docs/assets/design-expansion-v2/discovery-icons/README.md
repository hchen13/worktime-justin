# Discovery Icons v2

对应飞书卡：`WTJ-20260704-061`。

本包交付五槽与探索里程碑图标候选。每个图标都有 `filled` 点亮态和 `muted` 灰态，源文件为 `1024x1024 RGBA` 透明 PNG，contact sheet 同时展示五槽实际小尺寸读感。

## 产物

- `filled/`: 12 个点亮态透明 PNG。
- `muted/`: 12 个灰态透明 PNG。
- `contact-sheets/discovery-icons-contact-sheet.png`: 暗底评审接触表，含 72px 五槽尺寸示例。
- `manifest.json`: 图标语义、状态路径、推荐槽位尺寸与质量检查。
- `source/`: 复用的已验收生产素材。

## 语义分组

- `keyboard_exploration`: 键盘探索、按键里程碑、键盘星星。
- `secret_word_discovery`: 秘密词命中后的对象类发现。
- `task_success`: 问号任务完成和工作状态灯类反馈。

## 取舍

- 没有新生成大批图像，而是把已验收 v3 / A / B 包素材装入统一 medallion 体系，保证小尺寸读感和风格一致。
- 键盘类图标中有少量本地绘制的 soft-clay 键帽和里程碑点，避免使用文字数字表达 100/200 次。
- 灰态不只是降透明度，而是整体去饱和并保留轮廓，便于五槽内看清“空槽/未点亮”。

## 自检

- 12 个候选，24 张状态 PNG。
- PNG 均为 `1024x1024 RGBA`，四角 alpha 均为 0。
- contact sheet 已包含 72px 五槽尺寸预览。
- 无文字、水印、外部品牌或版权角色风格。
