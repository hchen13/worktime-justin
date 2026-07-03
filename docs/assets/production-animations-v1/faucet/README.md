# Faucet Animation v1

对应飞书卡：`WTJ-20260704-026`。

本目录是 faucet 单卡验收范围。horse 相关文件保留在相邻目录，后续归 `WTJ-20260704-028` 处理，本卡证据不引用 horse。

## 状态

- `off/`: 1 帧，静止关水。
- `running/`: 6 帧，循环流水。
- `closing/`: 5 帧，水流减弱并附关闭提示光。
- `closed/`: 1 帧，关闭确认态。
- `sheets/`: 每个状态的 frame sheet。
- `faucet-contact-sheet.png`: 暗底验收接触表。
- `manifest.json`: fps、loop、anchor、bounds、frames、sheet 路径。

## 取舍

主 faucet 图来自 `docs/assets/production-pack-a/task-props/faucet.png`，不重画金属主体，避免材质漂移；水流和关闭提示光以透明叠加层表达。

## 自检

- 13 张编号帧均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 可见像素无 #ff00ff / 洋红残留。
- manifest 中所有 frame、sheet、preview、contact sheet 路径均存在。
