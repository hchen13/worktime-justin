# TTS 音频包 provenance（WTJ-20260704-074 EN + WTJ-20260704-084 ZH）

> ## ⚑ WTJ-20260707-003：新增 ZH「找到」组合引导语 find.zh.m4a
>
> 修复"ZH 问号找物任务开始只念词卡本身、没有找到该动作的语义"——见 `docs/design-notes/CN-TASK-DRAFT.md` #0
> 一节「追加（WTJ-20260707-003）」的完整理由与边界（唯一例外，不影响 24 条任务整句/100 条
> 词卡本身仍各自完整预生成的红线）。
>
> | 项 | 值 |
> |---|---|
> | 资产 | `audio/phrases/find.zh.m4a`（新增，此前不存在） |
> | 文本 | 「找到」（`app/scripts/tts-text-manifest.zh.json` 新增 `phrases.find`） |
> | 生成脚本 | `app/scripts/generate-tts-asr-gated.py --only zh-phrase:find`（`build_worklist_ext()` 新增读取 `tts-text-manifest.zh.json` 的 `phrases` 段落，tag `zh-phrase:<k>`） |
> | 模型/音色/母带链 | 与上方 CosyVoice3 当前路线完全一致（CosyVoice3 zero-shot 克隆 Ethan 自录 `zh.wav` 参考声，`loudnorm`+`alimiter`→24kHz mono AAC 64k），未引入新依赖 |
> | ASR 自证 | whisper `small`，5 次尝试内 3 个候选通过（seed 42/44/46 转写均为「找到」，ratio=1.00），按贴近 ZH 短句节奏目标（1.1-2.2s 窗口）择优，采用 seed=46（dur=1.08s——与同为 2 字的 `secretWordsZh.apple` 词卡同一时长量级，非仓促朗读） |
> | 客观 QC | ffprobe：aac/24000Hz/mono/1.08s；`volumedetect`：mean -25.0dB（非静音）、max -2.0dB（peak ≤ -0.1dBFS，无削波）；前置静音 ~0.35s，与同管线其它已交付素材（如 `apple.zh.m4a` 前置静音 ~0.14s、EN `find.m4a` 前置静音 ~0.44s）同一量级，非回归 |
> | sha256 | `8e170d25d77163ea826a472088c51320c5772e139387297d83b64cec698cab2b` |
> | 登记 | `app/web/audio/missing-audio.json` 新增顶层 `compositePhrasesZh`（1 条，status delivered）+ `summary.compositePhrasesZh`；与既有 `compositePhrases`（EN，10 条）各自独立数组，不影响 `tts-audio-delivery.test.mjs` 既有的 10-phrases EN 门 |
> | 主观验收 | TL 不试听；Ethan/QA 在主目录 `docs/design-review.html` 试听把关（本卡未把 `audio/phrases/` 目录接入该生成器的自动扫描区，find.zh.m4a 暂不会出现在试听专区缩略图列表里——与既有 10 条 EN phrases 同一现状，非本卡引入的新缺口） |
>
> ## ⚑ 当前路线（WTJ-20260705-024，2026-07-06 全量重生成，取代下方 Kokoro 历史）
>
> Ethan 拒绝 Kokoro 音色后选定 **CosyVoice 3 + 他本人自录参考声**。本目录下全部
> `audio/words/`、`audio/tasks/`（EN + `.zh`）、`audio/phrases/` 的 `.m4a` 已用 CosyVoice 3
> zero-shot **全量重生成**，克隆 Ethan 自录音（自我授权、个人非商用，最干净的音色来源）。
>
> | 项 | 值 |
> |---|---|
> | TTS 模型 | **CosyVoice 3**（`Fun-CosyVoice3-0.5B-2512`，FunAudioLLM），**Apache-2.0**（代码+权重） |
> | 音色 voice | **Ethan 自录参考声** zero-shot 克隆（`dist-stage/024-cosyvoice3-reference/`，自录·自我授权·不入库；个人非商用自用） |
> | 参考声-目标长度匹配 | EN 词→`words.wav`；EN 任务/组合→`en.wav`；ZH 任务(24+8 新)→`zh.wav`；每条参考先裁静音成干净 prompt_wav |
> | 确定性 | `set_all_random_seed(42)`（CosyVoice 采样本随机，固定 seed 复现） |
> | 生成脚本 | `app/scripts/generate-tts-cosyvoice3.py`（复用 074/084 文本源 + loudnorm→alimiter→AAC 母带链，仅换模型/音色） |
> | 母带链/格式 | **不变**：`loudnorm I=-16 LUFS` + `alimiter limit=0.794:level=false` → 24 kHz mono AAC 64k `.m4a` |
> | 覆盖 | ≈151 条：secretWords 101 + EN taskVoice 8 + compositePhrases 10 + ZH task 24 + ZH 新增 8（025 门/铃/drag） |
> | no-silent-fallback | 每条校验非静音(rms>1e-4)+合理时长后才编码；失败即非零退出，绝不出静音/截断文件 |
> | 音质主观验收 | TL 不试听；Ethan/QA 在主目录 `docs/design-review.html` 逐条试听把关 |
>
> **下方 Kokoro（074/084）内容为历史记录**——其 af_heart/zf_xiaoxiao 产物已被本次 CosyVoice3
> 全量重生成整体取代（磁盘上的 `.m4a` 现为 CosyVoice3 + Ethan 版本）。

> ## ⚑ WTJ-20260706-008：ASR-gated 修复（apple / banana / yoyo 固化）
>
> 024 全量重生成后 Ethan 驳回部分词条为**文不对题**（CosyVoice3 zero-shot 对短目标不稳，会
> 复述参考句而非目标词）。修法：`app/scripts/generate-tts-asr-gated.py`（WTJ-011 造的
> ASR-gated reseed wrapper，见该脚本头注）——每条生成后用 whisper 自证内容正确，不中就换
> seed 重生成，命中才写盘。本卡把 `docs/assets/008-audio-review/after/` 里 Ethan 已裁决通过
> 的候选固化为正式 `app/web/audio/words/*.m4a`：
>
> | 资产 | 采用版本 | sha256（固化后 = app/web 现役文件） |
> |---|---|---|
> | words/apple.m4a | `after/apple.m4a`（单候选，ASR 自证「Apple」） | `f32761db…be99ced` |
> | words/banana.m4a | `after/banana.alt3.m4a`（6 候选中 Ethan 选定 #3，美式发音） | `63ddd08a…266951e` |
> | words/yoyo.m4a | `after/yoyo.m4a`（ASR 自证「Yo yo」，Ethan 已验收） | `0afe7a6b…383763` |
> | tasks/press-m.zh.m4a | `after/press-m.zh.m4a`（第三版 ~2.1s 适中语速，Ethan/PM 批准；010 卡按下字母 M 依赖此版） | `54aa6f41…42ecc65` |
>
> fox 同批固化（见 secretWords fox 条目 licenseNeed 注记）。banana 保持 alt3 不动。

本文件记录 `audio/words/`、`audio/tasks/`、`audio/phrases/` 下预生成语音的来源、模型、
许可与可复现方式，满足卡片验收标准 4/5。运行时 app 只播放这些预生成 `.m4a`，**不使用
Chrome/系统内置实时 TTS**（REQ-AST-07 红线）。

> **两批交付、同一引擎**：
> - **EN（074/078，af_heart）**：secretWords 101 + taskVoice 8 + compositePhrases 10 = 119 文件，见下方第一部分。
> - **ZH（084，zf_xiaoxiao）**：24 条中文任务完整句 `audio/tasks/<id>.zh.m4a`，见文末「WTJ-20260704-084：中文任务语音」一节。
> PM 已采纳选型 spike（`tl/tts-spike-084` / `docs/spikes/tts-model-084/RECOMMENDATION.md`）的默认路线：
> **单引擎 Kokoro-onnx，EN=af_heart、ZH=zf_xiaoxiao**，全 app 一套运行时/依赖栈。

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

> **WTJ-20260704-084 EN 处理方式 = 确定性复跑核实、byte 一致、未改动**。084 卡要求全量重生成
> 时，先在采纳的 Kokoro af_heart 模型下**重新生成全部 119 个 EN 文件**，逐文件 sha256 与已交付
> 的 074/078 版本**逐一比对完全一致**（Kokoro 固定音色、无采样、无 seed → 确定性，同输入必得同
> 输出字节）。既已证实现有 EN 音频就是采纳模型的确定性产物，工作树保持不变（不为 churn 而 churn，
> 避免污染 004 交接 diff）——EN 侧本卡只更新 provenance，磁盘上 119 个 `.m4a` 未变。

## 已知局限（须人工把关）

**TL 无法试听音频**，故"发音自然度/儿童友好/无爆音"这类**主观质量**无法由 TL 亲自确认，
仅提供上述客观指标。建议 **Ethan 抽样试听**（如 words/dog、apple、elephant；tasks/click-horse-run；
phrases/find + words 拼接）确认音色与发音可接受，再最终验收。若个别词发音不佳，可在
`tts-text-manifest.json`/词表层面微调文本或换 voice 重生成（脚本可复现）。

## 复现

见 `app/scripts/generate-tts.py` 顶部 SETUP/RUN 注释（uv + Python 3.12 + brew espeak-ng；
系统 Python 3.14 的 pip 因 libexpat 符号冲突不可用，故用 uv+3.12）。

---

# WTJ-20260704-084：中文任务语音（ZH taskVoice）

24 条中文任务提示，每条一整句独立预生成，输出 `audio/tasks/<id>.zh.m4a`（`.zh` 语言后缀，
不覆盖同目录已交付的 EN `audio/tasks/<id>.m4a`）。这是 084 卡真正的新交付物；004 Phase B 负责
把 `app/web/manifest.js` 对应 example 的 voicePrompt 接到这些路径（本卡只产出音频+清单+provenance）。

## 模型 / 许可（ZH）

| 项 | 值 |
|---|---|
| TTS 模型 | **Kokoro-82M**（`kokoro-v1.0.onnx` + `voices-v1.0.bin`，与 EN 同一份权重） |
| 权重 sha256 | `kokoro-v1.0.onnx` = `7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5`；`voices-v1.0.bin` = `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d`（本卡下载后已逐一核对，与 spike ENV-BUILD.md 一致） |
| 模型许可 | **Apache-2.0**（允许个人/非商用/商用；本项目非商用，口径充分满足；**无水印**——对比 Chatterbox 每条都盖 Perth 水印，这也是选 Kokoro 的理由之一） |
| 模型来源 | https://github.com/thewh1teagle/kokoro-onnx （release `model-files-v1.0`） |
| 音色 voice | **zf_xiaoxiao**（中文女声，来自 voices-v1.0.bin，Apache-2.0；bin 内含 8 个中文音色，本卡用 xiaoxiao） |
| 中文 G2P | **misaki 0.9.4 [zh]**（MIT；jieba 0.42.1 + pypinyin 0.55.0 + cn2an）。Kokoro 无原生中文前端，由 misaki 把汉字转音素串再 `create(phonemes, is_phonemes=True)` 喂给 Kokoro。**中文不经 espeak-ng**（espeak-ng 只服务 EN）。 |
| 合成参数 | voice=zf_xiaoxiao，`is_phonemes=True`，无 speed 覆盖；**确定性**（固定音色 + 无采样 + **无需 seed**）→ 可复现字节一致 |
| 生成脚本 | `app/scripts/generate-tts-zh.py`（+ 文本清单 `app/scripts/tts-text-manifest.zh.json`） |
| 文案来源 | `docs/design-notes/CN-TASK-DRAFT.md` v1（PM 已批为 v1 文案），24 条逐条对齐 `tts-text-manifest.zh.json` |

## 红线：完整句、禁止运行时拼接

每条 taskId 是**一整条独立、预生成的完整句子**，作为不可分割的音频单元。**没有** phrases/
composite 拼接表（EN 那套 "Find the"+word 合成片段是英文语境专属；中文机械拼接「找到」+名词会
生硬/语序错，损害 3 岁用户体验）。运行时**禁止**用 `audio.js` 的 `playComposite()` 拼接中文片段，
「找到 dog」式中英混拼更是明确反模式（TL 综合裁定，见 `docs/design-notes/CN-TASK-DRAFT.md` #0）。生成脚本内已用
`assert "phrases" not in tm` 硬性守卫。

## 24 条 misaki 音素串（供 Ethan / QA-076 多音字人工核对）

TL 无法试听，以下为逐句 misaki[zh] G2P 输出的 IPA 音素串（`↓↘↗→` 为声调标记）。多音字风险词
（行/长/为/得/地/着/重/都/数/量…）经逐句排查：**本批 24 句均未出现上述常见多音字歧义**；唯一需
留意的是 press 类里的**阿拉伯数字读法**（cn2an 已正确把 3/5/7 读作 三/五/七 sān/wǔ/qī，见下表音素
串末尾），以及「按字母 X」结尾的**单字母原样透传**（A/B/S/M 作为 grapheme 直接带入，非中文音素）。

| taskId | 中文全句 | misaki 音素串 | 时长(s) | 峰值(dB) | 均值(dB) | sr/格式 | 非静音(RMS) |
|---|---|---|---|---|---|---|---|
| drag-apple-to-basket | 把苹果放进篮子里！ | `pa↓ pʰi↗ŋkwo↓ fa↘ŋʨi↘n la↗nʦɨ li↓!` | 1.728 | -1.9 | -17.1 | 24k mono aac | 0.177 |
| drag-dog-home | 把小狗带回家！ | `pa↓ ɕjau↓kou↓ tai↘xwei↗ʨja→!` | 1.408 | -2.0 | -16.0 | 24k mono aac | 0.174 |
| click-lamp-on | 点亮小台灯！ | `tjɛ↓nlja↘ŋ ɕjau↓ tʰai↗tə→ŋ!` | 1.237 | -2.0 | -15.7 | 24k mono aac | 0.180 |
| click-faucet-off ⁽⁹⁾ | 关掉水龙头！ | `kwan→tjau↘ ʂwei↓lʊ↗ŋtʰou↗!` | 1.76 | -2.0 | -24.0 | 24k mono aac | 0.063 |
| click-horse-run | 让小马跑起来！ | `ɻa↘ŋ ɕjau↓ma↓ pʰau↓ ʨʰi↓lai↗!` | 1.344 | -2.9 | -16.1 | 24k mono aac | 0.170 |
| find-the-dog | 找到小狗！ | `ꭧau↓tau↘ ɕjau↓kou↓!` | 1.109 | -3.5 | -15.9 | 24k mono aac | 0.178 |
| find-the-cat | 找到小猫！ | `ꭧau↓tau↘ ɕjau↓mau→!` | 1.088 | -4.3 | -16.1 | 24k mono aac | 0.182 |
| find-the-apple | 找到苹果！ | `ꭧau↓tau↘ pʰi↗ŋkwo↓!` | 1.067 | -2.4 | -15.9 | 24k mono aac | 0.191 |
| find-the-star | 找到星星！ | `ꭧau↓tau↘ ɕi→ŋɕi→ŋ!` | 1.045 | -3.0 | -15.6 | 24k mono aac | 0.188 |
| find-the-fish | 找到小鱼！ | `ꭧau↓tau↘ ɕjau↓y↗!` | 1.045 | -3.4 | -16.2 | 24k mono aac | 0.180 |
| find-the-elephant | 找到大象！ | `ꭧau↓tau↘ ta↘ɕja↘ŋ!` | 1.024 | -3.5 | -15.8 | 24k mono aac | 0.182 |
| find-the-pig | 找到小猪！ | `ꭧau↓tau↘ ɕjau↓ꭧu→!` | 1.109 | -2.6 | -15.8 | 24k mono aac | 0.176 |
| find-the-rocket | 找到火箭！ | `ꭧau↓tau↘ xwo↓ʨjɛ↘n!` | 1.067 | -2.8 | -15.9 | 24k mono aac | 0.186 |
| find-the-turtle | 找到小乌龟！ | `ꭧau↓tau↘ ɕjau↓ u→kwei→!` | 1.195 | -3.3 | -15.8 | 24k mono aac | 0.178 |
| find-the-unicorn | 找到独角兽！ | `ꭧau↓tau↘ tu↗ʨjau↓ʂou↘!` | 1.301 | -3.4 | -15.6 | 24k mono aac | 0.174 |
| find-the-whale | 找到鲸鱼！ | `ꭧau↓tau↘ ʨi→ŋy↗!` | 1.045 | -3.9 | -15.8 | 24k mono aac | 0.179 |
| find-the-zebra | 找到斑马！ | `ꭧau↓tau↘ pa→nma↓!` | 1.067 | -3.9 | -16.1 | 24k mono aac | 0.176 |
| press-letter-a | 按下字母 A！ | `a↘nɕja↘ ʦɨ↘mu↓ A!` | 1.131 | -3.4 | -16.3 | 24k mono aac | 0.172 |
| press-digit-3 | 按下数字 3！ | `a↘nɕja↘ ʂu↘ʦɨ↘ sa→n!` | 1.216 | -4.1 | -15.9 | 24k mono aac | 0.176 |
| press-letter-b | 按下字母 B！ | `a↘nɕja↘ ʦɨ↘mu↓ B!` | 1.003 | -4.7 | -16.1 | 24k mono aac | 0.190 |
| press-letter-s | 按下字母 S！ | `a↘nɕja↘ ʦɨ↘mu↓ S!` | 1.152 | -2.6 | -16.2 | 24k mono aac | 0.171 |
| press-letter-m | 按下字母 M！ | `a↘nɕja↘ ʦɨ↘mu↓ M!` | 1.003 | -4.7 | -16.1 | 24k mono aac | 0.190 |
| press-digit-5 | 按下数字 5！ | `a↘nɕja↘ ʂu↘ʦɨ↘ u↓!` | 1.173 | -3.5 | -16.3 | 24k mono aac | 0.173 |
| press-digit-7 | 按下数字 7！ | `a↘nɕja↘ ʂu↘ʦɨ↘ ʨʰi→!` | 1.237 | -3.8 | -15.9 | 24k mono aac | 0.179 |

## 音频规格与客观 QC（ZH）

- 格式：**AAC / 24 kHz / 单声道 / 64 kbps `.m4a`**（与 EN 完全一致的 ffmpeg 链）。
- 响度：`ffmpeg loudnorm I=-16 LUFS`，再经 `alimiter limit=0.794 level=false`（`level=false` 必需）。
- **no-silent-fallback（生成期护栏）**：`generate-tts-zh.py` 对每条先 `try/except` 包住 g2p+create，
  再对渲染出的 PCM 校验**非静音（RMS > 1e-4）+ 时长在 0.3–6s 合理带**，通过才允许 ffmpeg 编码；
  任一条被拒即**非零退出并打印全部失败**，绝不写出缺失/静音/截断文件。
- 客观结果：**24/24 生成成功，0 失败**；编码后全部 aac/24000Hz/mono；时长 **1.00–1.73 s**；
  逐文件均值 **-15.6 ~ -17.1 dB**（非静音）；峰值 **-1.9 ~ -4.7 dB**（无削波，与 EN 的 alimiter
  目标一致，**响度不过载**）。逐句数据见上表。

> ⁽⁹⁾ **WTJ-20260706-009（关水语义翻转）**：`click-faucet-off`（原 `click-faucet-on`「打开水龙头！」）
> 与 024 之后的其余任务语音一样，实际由 **ASR-gated CosyVoice3 wrapper**（`generate-tts-asr-gated.py`）
> 生成，非上表列头所述的 misaki[zh] 管线（misaki 是 084 首版 ZH 任务语音的历史来源，024 起已整体
> 迁到 CosyVoice3——此列头/引擎口径差异早于本卡，非本卡范围）。上表该行的音素串是**intended
> reading 的人工核对参考**，不代表 misaki 实际 G2P 输出。该 clip 由 whisper `small` 自证内容正确：
> `asr='关掉水龙头' ratio=1.00 seed=42`（见 `/tmp/asr-009.json` 与本卡回报）。均值 -24.0 dB 低于
> 上表其余行的 -15.6~-17.1 dB 带，是 CosyVoice3 输出的固有响度差异（峰值 -2.0 dB 仍无削波、非静音），
> 客观指标合格；主观音色/自然度交 Ethan 在 design-review.html 把关。

## 已知局限（须人工把关，ZH）

**TL 无法试听音频**，故「发音自然度 / 多音字实际读音 / 儿童友好 / 无爆音」这类**主观质量**无法由
TL 确认，仅提供上述客观指标 + 逐句 misaki 音素串。建议 **Ethan / QA-076 抽样试听**并对照上表音素串
核对多音字（重点：数字读法 3/5/7、单字母尾音、每条声调是否自然）。若个别句读音不佳，可在
`tts-text-manifest.zh.json` 层面微调文案或换中文音色（zf_xiaobei/xiaoni/xiaoyi 等）重生成（脚本可复现）。

## 复现（ZH）

见 `app/scripts/generate-tts-zh.py` 顶部 SETUP/RUN 注释。env 为 **Kokoro-only 子集**（不需 Chatterbox/
torch）：`uv venv --python 3.12 ttsenv` + `kokoro-onnx==0.5.0` / `onnxruntime==1.27.0` /
`soundfile==0.14.0` / `misaki==0.9.4[zh]` / `numpy==2.4.6`（pin `<2.5`）+ Homebrew espeak-ng 1.52
（`PHONEMIZER_ESPEAK_LIBRARY=/opt/homebrew/lib/libespeak-ng.dylib`，供 EN；ZH 不用它）+ 下载
kokoro onnx/voices（sha256 见上表）。`ttsenv/` 与 `kokoro_models/` 大文件不入 git（见 `.gitignore`）。
运行：`PHONEMIZER_ESPEAK_LIBRARY=/opt/homebrew/lib/libespeak-ng.dylib ttsenv/bin/python
app/scripts/generate-tts-zh.py --model-dir kokoro_models --app-web app/web`。

---

# WTJ-20260706-011：中文秘密词发音（ZH secretWords，100/100）

100 个秘密词的中文发音 `audio/words/<word>.zh.m4a`，与 100 个 EN 词一一对应。**全部 100 条已交付、
0 缺口、无 EN fallback 占位**（missing-audio.json `secretWordsZh[]` 全 `delivered`，
`voice-language.js` `ZH_AVAILABLE_WORD` 台账为完整 100 词）。

## 模型 / 管线（ZH 秘密词）

| 项 | 值 |
|---|---|
| TTS 模型 | **CosyVoice 3**（`Fun-CosyVoice3-0.5B`，Apache-2.0），Ethan 自录参考声 zero-shot 克隆（`zh.wav`） |
| 生成脚本 | **`app/scripts/generate-tts-asr-gated.py`**（008 定案的 ASR-gated reseed wrapper；复用 `generate-tts-cosyvoice3.py` 的母带链/参考裁剪，仅加 ASR 门） |
| 母带链/格式 | **不变**：`loudnorm I=-16 LUFS` + `alimiter limit=0.794:level=false` → 24 kHz mono AAC 64k `.m4a` |
| **质量门（核心）** | 每条生成后用 **whisper small** 转写自证念的是目标中文词；不中就换随机 seed 重生成（默认 8-12 次），命中才写盘；**绝不 ship 文不对题音频**（no-misread-fallback，失败即非零退出不写盘） |
| 匹配判定 | 归一后 `difflib` 比率（ZH ≥0.7）**或** toneless-pinyin 音节精确相等；孤立字母/数字须全部命中。**opencc** 繁→简归一（whisper 常输出繁体，如 苹果→蘋果）；**pypinyin** toneless 同音救回（whisper 常输出同音异字，如 牦牛→毛牛、小岛→小刀，声音对仅字不同）。真误读仍拒（考拉→考了、鹌鹑→安全 音不同） |
| 确定性 | CosyVoice 采样随机，wrapper 记录每条命中 seed；产物 `.m4a` 已落盘，非从 seed 复算 |
| 审计 | 除新生成/返工外的既有 ZH 词全部过一遍 wrapper `--audit`（仅 ASR 校验、命中即保留）；ASR 判为误读的旧词就地重生成（本轮修正若干旧批误读，如 car 汽车→旧误读機車、egg 鸡蛋→奇滩、lemon 柠檬→你忙、nest 鸟窝→鳥屋 等） |

## 儿童友好文本返工（单字/同音困难词）

CosyVoice3 对单字/超短 ZH 目标不稳：whisper 或转空、或判为同音字。按 008 已确立的「猫→小猫」先例，
以下词改用**儿童友好的更长标签**（EN 词与 `<word>.zh.m4a` 文件名不变，仅中文标签/朗读文本变），
使 clip 够长可被 ASR 转写：

| word | 原标签 | 现标签 | 原因 |
|---|---|---|---|
| cat | 猫 | 小猫 | whisper 判同音「毛」(máo) |
| fish | 鱼 | 小鱼 | 单字太短 whisper 转空 |
| pig | 猪 | 小猪 | 单字太短 whisper 转空 |
| pear | 梨 | 梨子 | 单字太短 whisper 转空 |
| net | 网 | 渔网 | 单字太短 whisper 转空 |
| island | 岛 | 小岛 | 单字太短 whisper 转空 |
| quail | 鹌鹑 | 小鹌鹑 | whisper 误判「安全」，加字后可转写 |

（其余同音困难词如 yak 牦牛、zucchini 西葫芦、ukulele 尤克里里 由 toneless-pinyin 救回，标签不变。）

## 已知局限（须人工把关，ZH 秘密词）

**TL 无法试听**：内容正确性已由 whisper ASR + pinyin/opencc 技术自证（念的是目标词），但音色自然度、
儿童友好度、同音救回词的实际听感（如 小岛 clip whisper 听成「小刀」——声音对但请 Ethan 确认发音清晰）
仍需 **Ethan / QA-076 主观验收**，逐条见 `docs/design-review.html` 秘密词发音区（全 100 词 EN+ZH 试听）。

## 复现（ZH 秘密词）

见 `app/scripts/generate-tts-asr-gated.py` 顶部 RUN 注释。env 复用 024 的 `cosyvoice_env`
（+ 本卡新增 `opencc-python-reimplemented`、`pypinyin` 两个纯 Python 依赖 + `openai-whisper`）。
运行（持共享锁 `/private/tmp/wtj-024/.cosy.lock`）：
`cosyvoice_env/bin/python app/scripts/generate-tts-asr-gated.py --model-dir <Fun-CosyVoice3-0.5B>
--ref-dir <024 参考声目录> --only zhword: --out-web app/web --report <json>`。

## WTJ-20260707-001：island.zh 声调返工（小刀→小岛）

Ethan 验收反馈原 island.zh 听成「小刀」(xiāo dāo 1声)。根因：wrapper 的 toneless-pinyin
同音救回门对纯 ZH 词把「小刀」当「小岛」(xiǎo dǎo 3声，同 toneless pinyin) 放行。
本卡用**更严的声调门**重生成：whisper-small 须精确输出「岛」(非「刀") + tone-aware pypinyin
须为 3 声 (dǎo)。交付 clip whisper-small asr=「小岛」、pinyin=[xiao3, dao3]、峰值 -2.2dB、
无前置空白、非静音。另有 alt2/alt3 过同门候选可供 Ethan 择优。主观清晰度/语速交 Ethan design-review。
