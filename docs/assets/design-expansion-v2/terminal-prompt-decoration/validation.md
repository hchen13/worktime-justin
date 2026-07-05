# Validation

对应飞书卡：`WTJ-20260705-011`。

## 结果

`PASS`

## 检查项

- Spec 存在：`docs/design/wtj-20260705-011-terminal-prompt-decoration-spec.md`。
- Tokens 存在且 JSON 可解析：`terminal-prompt-decoration-tokens.json`。
- Manifest 存在且 JSON 可解析：`manifest.json`。
- Runtime preview 存在：`previews/terminal-prompt-decoration-preview.png`，尺寸 `1672x941`。
- Contact sheet 存在：`previews/terminal-prompt-decoration-contact-sheet.png`，尺寸 `1680x1050`。
- Prompt/rationale 存在：`prompt-and-rationale.md`。
- Tokens 明确 `notInput: true`。
- Tokens 明确 `visibleText: ">_"`，`maxVisibleCharacters: 2`。
- Tokens 禁止 current key echo、secret word echo、username/host/path、command output 和 long input bar。

## 视觉复核

- 装饰条位于左下 status lane，贴近 footer，不在画布中央。
- 宽度控制在短 status chip 范围内，不像输入框。
- 可见内容只有 `>_` 和小 activity pip。
- 不出现 `justin@worktime`、秘密词、当前键、路径或命令输出。
- 与 `WTJ-081` 暗色画布和 `WTJ-082` footer 视觉语言一致。
