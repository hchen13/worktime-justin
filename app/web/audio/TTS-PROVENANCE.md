# TTS 音频包 provenance（WTJ-20260704-074）

本文件记录 `audio/words/`、`audio/tasks/`、`audio/phrases/` 下预生成语音的来源、模型、
许可与可复现方式，满足卡片验收标准 4/5。运行时 app 只播放这些预生成 `.m4a`，**不使用
Chrome/系统内置实时 TTS**（REQ-AST-07 红线）。

## 模型 / 许可

| 项 | 值 |
|---|---|
| TTS 模型 | **Kokoro-82M**（`kokoro-v1.0.onnx` + `voices-v1.0.bin`） |
| 模型许可 | **Apache-2.0**（允许个人/非商用/商用；本项目非商用，口径充分满足） |
| 模型来源 | https://github.com/thewh1teagle/kokoro-onnx （release `model-files-v1.0`） |
| 音色 voice | **af_heart**（温暖 en-US 女声，来自 voices-v1.0.bin，Apache-2.0） |
| 音素化工具 | **espeak-ng 1.52**（Homebrew）——GPLv3，**仅在生成时作为构建工具使用，不链接进、不随 app 分发**；分发物只有生成出的 `.m4a` |
| 合成参数 | speed=0.95（略慢更清晰）、lang=en-us |
| 生成脚本 | `app/scripts/generate-tts.py`（+ 文本清单 `app/scripts/tts-text-manifest.json`） |

> 许可口径：Ethan 明确本项目不商用；Kokoro（Apache-2.0）本身即允许商用，无署名强制要求。
> espeak-ng 为 GPLv3，但此处仅作离线构建期工具生成音频，产物 `.m4a` 不含其代码，非衍生分发。

## 覆盖范围（119 文件）

| 类目 | 数量 | 目录 | 朗读文本来源 |
|---|---|---|---|
| secretWords | 101 | `audio/words/<word>.m4a` | 词本身（missing-audio.json） |
| taskVoice | 8 | `audio/tasks/<id>.m4a` | `tts-text-manifest.json` tasks（TL 定，儿童友好句） |
| compositePhrases | 10 | `audio/phrases/<key>.m4a` | `tts-text-manifest.json` phrases（拼接片段，供 playComposite） |

SFX（20 条，`audio/sfx/`）不在本卡范围，见 WTJ-20260704-075。

## 音频规格与客观 QC

- 格式：**AAC / 24 kHz / 单声道 / 64 kbps `.m4a`**。
- 响度：`ffmpeg loudnorm I=-16 LUFS`，再经 `alimiter limit=0.794 level=false` 硬限幅
  （`level=false` 必需——默认 `level=true` 会把输出重新归一化回 0 dB 反而引入削波）。
- 客观校验（TL，脚本化）：119/119 路径全覆盖无缺失；全部为 aac/24k/mono；逐文件峰值
  ≤ ~-2 dBFS（无削波、留足 headroom）；时长 0.66–1.56 s（无空文件/截断）。

## 已知局限（须人工把关）

**TL 无法试听音频**，故"发音自然度/儿童友好/无爆音"这类**主观质量**无法由 TL 亲自确认，
仅提供上述客观指标。建议 **Ethan 抽样试听**（如 words/dog、apple、elephant；tasks/click-horse-run；
phrases/find + words 拼接）确认音色与发音可接受，再最终验收。若个别词发音不佳，可在
`tts-text-manifest.json`/词表层面微调文本或换 voice 重生成（脚本可复现）。

## 复现

见 `app/scripts/generate-tts.py` 顶部 SETUP/RUN 注释（uv + Python 3.12 + brew espeak-ng；
系统 Python 3.14 的 pip 因 libexpat 符号冲突不可用，故用 uv+3.12）。
