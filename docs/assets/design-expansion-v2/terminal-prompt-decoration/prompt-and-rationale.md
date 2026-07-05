# Prompt And Rationale

对应飞书卡：`WTJ-20260705-011`。

## 生成方式

本卡没有调用图像模型。目标是 UI tokens 与可执行视觉规范，适合用确定性绘制生成预览图，避免 AI 生成图把 terminal 装饰误画成真实输入框。

预览生成约束：

```text
Create a dark WorkTime Justin runtime UI preview focused on a tiny terminal/status prompt decoration. The decoration must sit in the lower-left status lane above the footer, not centered like an input field. It should contain only the glyph >_ plus one tiny activity pip. Do not show justin@worktime, current keyboard letters, secret words, command output, shell paths, or a long input bar. Match WTJ-081 dark canvas and WTJ-082 footer shell colors. Keep the middle stage empty and keep the decoration visually weaker than letters, task props, reward overlays, discovery slots, and the footer chest.
```

## 取舍

- 保留 `>_`：这是最小 terminal 氛围符号，可以让“爸爸工作台”隐喻成立。
- 删除 `justin@worktime: dog`：这会把幼儿按键反馈读成真实命令输入，并与秘密词回显混淆。
- 从中央长条移到左下 status lane：降低输入框感，并让主画布继续留给 letters / task props / rewards。
- 限制宽度到 `136px` 到 `184px`：宽度过长会重新变成输入框。
- activity 只做边框微亮：不显示按下字符，不制造实时输入流。

## 已知风险

- 如果 TL 把组件放回画布中央或把宽度拉长，视觉会重新读成输入框。tokens 中已经给出 max width 和 icon-only fallback。
- 如果后续产品想强化 terminal 氛围，需要另开卡设计非输入型装饰，而不是在本组件里追加文本。
