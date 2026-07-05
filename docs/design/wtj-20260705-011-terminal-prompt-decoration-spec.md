# WTJ-20260705-011 Terminal Prompt Decoration Spec

执行者：Designer 1  
身份ID：Automation:worktime-justin-design-loop  
状态：提交 PM review

## 目标

本卡补齐 terminal/status prompt 装饰条的最终视觉规范，解除 `WTJ-20260705-001` Phase B 的设计阻塞。它是 footer/status 区域的低强度装饰，不是输入框、不是命令行、不是孩子按键的实时回显。

产物目录：

- `docs/assets/design-expansion-v2/terminal-prompt-decoration/manifest.json`
- `docs/assets/design-expansion-v2/terminal-prompt-decoration/terminal-prompt-decoration-tokens.json`
- `docs/assets/design-expansion-v2/terminal-prompt-decoration/previews/terminal-prompt-decoration-preview.png`
- `docs/assets/design-expansion-v2/terminal-prompt-decoration/previews/terminal-prompt-decoration-contact-sheet.png`
- `docs/assets/design-expansion-v2/terminal-prompt-decoration/prompt-and-rationale.md`
- `docs/assets/design-expansion-v2/terminal-prompt-decoration/validation.md`

## 最终视觉意图

使用一个小型 `>_` 状态铭牌，贴在 footer 上方的左下 status lane。它只暗示“爸爸的工作台 / pretend terminal”氛围，不能像 accepted mockup 里那样形成可输入的长条框。

推荐 runtime 内容只包含两个可见元素：

- prompt glyph: `>_`
- activity pip: 一个 4px 到 5px 的小圆点

禁止内容：

- `justin@worktime`
- 当前按键或秘密词，例如 `dog`
- 多字母输入流
- 任何看起来像输入中的文本光标后面还有待输入空间的长条
- 错误、失败、命令执行、系统路径或 shell 用户名

## 位置与尺寸

桌面端：

- Anchor: left bottom status lane, above footer top edge.
- `left`: `32px`
- `bottom`: `calc(var(--wtj-footer-height, 92px) + 14px)`
- `width`: `clamp(136px, 15vw, 184px)`
- `height`: `24px`
- `border-radius`: `12px`
- 最大不要超过 `220px`；超过这个宽度会重新读成输入框。

短屏 / 2014 MacBook Air：

- `left`: `24px`
- `bottom`: `calc(var(--wtj-footer-height, 78px) + 10px)`
- `width`: `136px`
- `height`: `22px`

窄屏：

- 若左下 status lane 与任务物件或 footer 槽位冲突，切换为 icon-only 模式：`width: 48px; height: 22px;`，只保留 `>_`。
- 不要移动到画布中央，也不要覆盖发现槽。

## 颜色与透明度

```json
{
  "background": "rgba(5, 10, 18, 0.48)",
  "backgroundPulse": "rgba(8, 20, 34, 0.58)",
  "border": "rgba(156, 180, 220, 0.20)",
  "borderActive": "rgba(94, 231, 255, 0.28)",
  "dividerGlow": "rgba(94, 231, 255, 0.08)",
  "promptGlyph": "rgba(101, 240, 141, 0.82)",
  "promptGlyphDim": "rgba(101, 240, 141, 0.56)",
  "pip": "rgba(255, 216, 76, 0.72)",
  "cursor": "rgba(60, 231, 255, 0.42)"
}
```

这些颜色继承 `WTJ-081` 的暗色 canvas、`successGreen` 和 `letterCyan`，并与 `WTJ-082` footer divider / dark footer shell 保持一致。

## 字体与符号

- Font stack: `"SF Mono", "Menlo", "Monaco", "Consolas", monospace`
- Font size: `13px` desktop, `12px` short-screen
- Weight: `800`
- Letter spacing: `0`
- Visible glyph: `>_`
- Glyph 宽度固定，不随孩子按键增加文本。

如果 runtime 不想使用文本 glyph，可以用 SVG 画两个 strokes：`>` 形折线和 8px 下划线。SVG 版本也必须保持同样尺寸和透明度。

## 行为与闪烁节奏

Idle:

- Decoration opacity: `0.72`
- Glyph opacity: `0.82`
- Pip opacity: `0.42`
- Cursor / underscore micro pulse: 1100ms 一次，opacity `0.28 -> 0.52 -> 0.28`
- 不移动、不打字、不追加字符。

Key activity pulse:

- 任意有效键盘反馈出现时，装饰条只做 140ms 的边框微亮。
- Border 从 `rgba(156, 180, 220, 0.20)` 过渡到 `rgba(94, 231, 255, 0.28)` 再回落。
- 不显示按下的字符，不改变 `>_`。

Secret word success:

- 可做 220ms 的绿色 glyph glow，opacity 最高 `0.94`。
- 不显示秘密词本身。

Reduced motion:

- 禁止闪烁动画。
- Cursor 固定 opacity `0.38`。
- Key activity pulse 可降为一次 120ms opacity change，或完全关闭。

## TL 接入 tokens

建议 TL 读取：

`docs/assets/design-expansion-v2/terminal-prompt-decoration/terminal-prompt-decoration-tokens.json`

核心 tokens 摘要：

```json
{
  "component": "terminalPromptDecoration",
  "runtimeRole": "footerStatusDecorationOnly",
  "notInput": true,
  "contentPolicy": {
    "visibleText": ">_",
    "maxVisibleCharacters": 2,
    "forbidCurrentKeyEcho": true,
    "forbidSecretWordEcho": true,
    "forbidUsernameHostPath": true
  }
}
```

## 验收检查

- 看起来是低强度状态装饰，不像可输入框。
- 不显示 `justin@worktime`、当前键、秘密词、路径或命令。
- 不在画布中央形成长条，不抢 letters / props / task reward 的注意力。
- 与 081 暗色 canvas、082 footer shell 同一视觉语言。
- 有可执行 tokens、预览图、取舍和验证记录。

## 风险与取舍

accepted mockup 的 terminal prompt 很有“爸爸工作台”味道，但它过大、居中且包含真实词 `dog`，会让孩子按键反馈读成命令输入。本规范保留 `>_` 这个最小符号，把它降级成 status decoration，牺牲一点 terminal 氛围，换取更少误导和更稳的幼儿体验。
