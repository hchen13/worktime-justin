# 生产音频完整性/可播放性/体验验收用例集（WTJ-20260704-076）

被测：`app/web/audio/` 交付的生产音频（audio/words/·sfx/·tasks/·phrases/*.m4a）。
标准：验收标准 1-6（脚本层 + 抽样听感 + license + 流程无缺失报错）。
预期清单权威源：`app/web/audio/missing-audio.json`（139 项：秘密词 101 / SFX 20 / 任务语音 8 / 组合短语 10）。

## 资产（可复用）

- `tests/e2e/check_audio_assets.py` —— 脚本层（criterion 1/2/5）。ffprobe/ffmpeg：
  存在性 / 可解码 / 时长 0.15-12s / RMS 非静音(mean_volume>-50dB) / 峰值不过载(max_volume<-0.1dB)；
  并对账运行时引用路径（manifest.js pool audioFile + audio.js DEFAULT_SFX_MAP）全部在清单内。
  报告 `tests/reports/audio_asset_scan.json`。`--emit-checklist` 打印试听清单。
- 已并入 `tests/run_all.py`？（否——音频交付前不纳入合并回归，避免 all-missing 拖红；074/075 交付后加入）。

## 当前状态（074/075 未交付）

`python3 tests/e2e/check_audio_assets.py`：139 预期 / present 0 / missing 139 / defective 0 / 必选就绪 0/129 /
运行时引用未覆盖 0。即"全部未交付"，符合现状。**074/075 交付并被 PM 路由后重跑本脚本即验收脚本层。**

criterion 5（app 流程不因音频缺失报错）：当前 WTJ_AUDIO 运行时未接入（016 说明待本地加载策略），
secretword/task 的 playWordDefensive 防御式跳过，全栈加载冒烟 0 console/page error —— 已满足。

## 抽样听感 checklist（criterion 3，交付后人工/agentic 试听）

- **任务语音（全部 8）**：drag-apple-to-basket, drag-dog-home, click-lamp-on, click-faucet-off
  （WTJ-20260706-009 由 click-faucet-on 改名，语义翻转为"关水"），
  click-horse-run, find-the-dog, press-letter-a, press-digit-3。
- **SFX（每类 ≥1，共 20）**：ui(task-success/light-hint-chime/slot-light-up/keyboard-milestone-chime/
  streak-reward-fanfare) / animal(dog-bark/cat-meow/duck-quack/horse-neigh/pig-oink/frog-croak/
  elephant-trumpet/mouse-squeak) / object(bell-ring/bell-jingle/water-drop/water-splash/水龙头/
  chest-open/chest-lid-creak)。
- **秘密词（每首字母若干，共 101）**：抽样 apple/ant/ball/cat/dog/… 覆盖每个首字母。
- **每条判定**：英文发音清楚 / 儿童友好 / 无明显误读 / 音量与其它一致 / **非 Chrome 内置语音（REQ-AST-07 红线）**。
- 输出结构化 `{pass, reason, evidence, risks}`（可用视觉/听觉子代理或人工）。

## criterion 4（license/attribution）

交付后核对 `missing-audio.json` 的 license 字段 / 交付 manifest 的 attribution 清单完整；
接受免费个人/非商用授权，不要求商用授权。

## 验收标准映射

1→check_audio_assets.py(存在/解码/时长/RMS/峰值)；2→脚本对账 missing-audio 必选项不再 not-delivered；
3→抽样听感 checklist；4→license 核对；5→全栈冒烟无缺失报错(已验)；6→本文件 + 脚本 + 报告即产物。

---

## TTS 子集验收（2026-07-04 15:41 CST · WTJ-074 交付 119 文件后）

074 TTS 音频包(Kokoro-82M/af_heart)交付 119 文件(words101/tasks8/phrases10)到 app/web/audio/(未合 main,在工作区)。QA 验收 TTS 子集(SFX 20 条待 075):

- **criterion 1 可播放性 PASS**: check_audio_assets.py → 预期139/present119/missing20(SFX)/defective0/必选就绪109/129。119 文件全部存在、ffprobe 可解码、时长合理(词~0.7-0.9s/任务~1.1s/短语~0.9s)、RMS 非静音、峰值不过载。
- **criterion 2 manifest PASS**: missing-audio.json 已把 secretWords(101)/taskVoice(8)/compositePhrases(10) 标 delivered;sfx(20) 仍 not-delivered(075 范围)。
- **criterion 3 内容(文本级 PASS,声学待听)**: 词按词本身合成(无 typo/错词风险);任务句为正确儿童友好英文且语义匹配任务("Put the apple in the basket!"/"Take the dog home!"/"Turn on the lamp!"),无中文(REQ-TASK-02)。**声学发音质量(是否清楚/无误读,如 Kokoro 对生僻词 igloo/quinoa 的读法)需音频能力复核(agent 无法听),交 PM 路由人工/音频 agent 抽样试听。**
- **criterion 4 license PASS**: TTS-PROVENANCE.md 完整——Kokoro Apache-2.0(允许非商用/商用)、af_heart 声色、espeak-ng 仅构建期工具不分发、可复现(generate-tts.py+tts-text-manifest.json)、**非 Chrome 内置语音(REQ-AST-07 红线明确遵守)**。
- **criterion 5 流程**: 全栈冒烟 0 error(缺 SFX 时防御式降级);但注意 audio.js 尚未接入 index.html→运行时仍不实际播放音频,集成待后续卡(不属本卡缺陷,记录交 PM)。

**TTS 子集结论**: 脚本可测面 + license + 文本内容全绿;残余=声学抽样试听(需音频能力)+ SFX 20 条(075)+ 运行时 audio.js 接入。SFX 交付后重跑脚本+统一抽样试听即可完成 076 全量。

## 全量音频脚本+license 验收（2026-07-04 16:28 CST · SFX 20 交付后）

075 SFX 20 条交付(卡仍 in progress)。全量重跑：

- **criterion 1 可播放性 PASS(全量)**：check_audio_assets.py → 139/139 present+valid、0 defective、必选 129/129。
- **criterion 4 license PASS**：SOURCE-LICENSES.md 完整——SFX 20 条 = 6 合成(ffmpeg 原创无版权) + 11 Mixkit(免费个人+商用,无需署名) + 3 Wikimedia(elephant CC0 / duck-quack CC BY-SA 3.0 / frog-croak CC BY-SA 4.0);TTS = Kokoro Apache-2.0。全部接受免费个人/非商用。**打包携带项：2 条需署名 — duck-quack→Jonathon Jongsma(Xeno-canto XC62258)、frog-croak→Wikimedia File:Single Frog Croak.oga 作者。** 交 PM/打包卡。
- **残余**：(a) 声学抽样试听(criterion 3)需音频能力复核(agent 听不了); (b) audio.js 未接入 index.html→运行时不实际播放(criterion 5 集成待后续卡); (c) 075 卡仍 in progress 待 PM accept。

---

## SFX 客观代理分析 + runtime 接入调查（PM 补项 1/2）

**item 1 · SFX 主观代理(ffmpeg astats,tests/reports/sfx_analysis.json)**：20 条 SFX——
无峰值过载(全 ≤-3dB)、无高 crest 尖锐瞬态(max ~10dB,无 >22 的惊吓突变)、无极短(<0.25s)、
时长 0.3-3.5s 合理、RMS 在正常带内(已 loudnorm/-16 LUFS)。**客观上"不过刺/不过载/不惊吓"低风险**。
真正主观项(动物声是否自然、儿童友好、截取点感知平滑)仍宜由人工/音频能力 agent 抽样试听确认,
残余风险低(源为 Mixkit 免费库 + 合成 + Wikimedia 真实录音)。

**item 2 · runtime 接入(GAP 发现)**：audio.js 用同源相对路径 `fetch()`(header 自述)加载 .m4a,
file:// 下被 CORS 拦;019 已在 native shell 加 `wtjres://` WKURLSchemeHandler 解决 file:// 加载。
**但 audio.js 未接入 index.html(`<script src="audio.js">` 缺席)** → 运行时 WTJ_AUDIO undefined →
**139 个已交付验证的音频在 app 里一个都不播放**(secretword/task/reward 的 playWordDefensive/playTaskVoice/
SFX 调用全部防御式静默跳过,冒烟 0 error 但也 0 声音)。影响 REQ-SEC-03 声音半 / REQ-TASK-02 任务语音 / SFX。
**Suspected owner**: 集成卡(019 同类,负责把 audio.js wire 进 index.html + 验证 wtjres:// 音频路径端到端)/ TL。
建议 PM 开音频运行时接入卡。

---

## 076 音频运行态回归（077 接入后，发现 P1 bug）

方法：http://localhost 服务 app/web 忠实模拟 native shell wtjres:// 同源（都非 file://，fetch 可用），
headless(--autoplay-policy=no-user-gesture-required) 端到端验证 audio.js 真加载+解码+排播 .m4a。

**PASS（077 核心修复生效，不再 silent fallback）**：
- unlock false→true；秘密词 8/8（dog/apple/cat/ball/star/zebra/igloo/queen）ok+silent:false，真实 .m4a 加载解码播放；
  SFX 6/6（dog-bark/cat-meow/task-success/chest-open/water-splash/bell-ring）ok；cache 正确缓存；getMissingReport 只捕获真缺失。
- 真实调用点确认无恙：secretword.js `playWord(entry对象)`、reward-chest/status-rewards `playSfx('bare-key')`、
  task-templates `playSfx({sfxKey,path})` 均正确解析。

**[P1 BUG 发现] 全部任务语音运行时静默（REQ-TASK-02）**：
- 根因：task.js:279 `voiceArg = taskDef.voicePrompt ? taskDef.voicePrompt : taskDef` 传的是 **voicePrompt 路径字符串**
  （manifest 如 press-letter-a → 'audio/tasks/press-a.m4a'）；而 audio.js playTaskVoice(string) 在 686 行把字符串
  包成 `{type:'task', key: str}` 而非透传 → resolveDescriptor 按 taskId 构造 `audio/tasks/<key>.m4a`，把已是路径的
  字符串 mangle 成 `audio/tasks/audiotaskspress-am4a.m4a` → 404 → ok:false/silent:true。
- 实证（模拟 task.js 精确取参逻辑）：voiceArgType=string, voiceArg='audio/tasks/press-a.m4a' →
  playResult ok:false silent:true path='audio/tasks/audiotaskspress-am4a.m4a' reason:missing。
- 对照：playTaskVoice({id,voicePrompt:path})（对象）与 playTaskVoice('press-a')（裸 stem）都 ok:true——
  只有 task.js 实际用的「路径字符串」形式失败。影响全部 8 个任务语音（问号任务语音提示全静默）。
- 修复建议（二选一，TL）：(a) audio.js playTaskVoice(string)：字符串含 '/' 时按路径透传 resolveDescriptor(str)
  而非包 {type:'task',key}; (b) task.js:279 传 `{ id: taskDef.id, voicePrompt: taskDef.voicePrompt }` 对象形式。
- suspected owner: TL（audio.js playTaskVoice 契约 vs task.js 调用口径；077 集成/013/016 交界）。

## 078 修复复验（2026-07-04 18:40 CST · PASS）

WTJ-078 修复任务语音 voicePrompt 路径静默。QA 重跑 check_audio_runtime.py：
**words 8/8 + SFX 6/6 + task-voice 8/8 全部播放 ok(non-silent)，cache=22，missing-report=0，exit 0。**
原 task-voice 0/8 → 现 8/8,bug 闭合。音频运行态完全打通,无 silent fallback。
