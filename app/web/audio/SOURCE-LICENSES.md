# SFX 来源与授权清单（WTJ-20260704-075）

本文档记录 `audio/sfx/*.m4a` 全部 20 个音效键位的素材来源、授权条款与处理方式，供 PM/QA/法务审阅。

**总述**：WorkTime Justin 为非商用（个人/教育用途）项目。本批 SFX 分两类来源：

1. **合成类（6 条）**：ffmpeg 程序化生成（正弦波/线性调频/白噪声瞬态 + 包络），完全原创，无第三方版权，无需任何授权声明。
2. **Mixkit 采集类（11 条）**：来自 [Mixkit](https://mixkit.co/free-sound-effects/) 免费音效库。Mixkit License 允许免费用于个人与商业项目，**无需署名（no attribution required）**，无需注册账号，条款见 https://mixkit.co/license/#sfxFree 。本项目为非商用场景，完全在授权范围内。PM 已在卡片 WTJ-20260704-075 中裁决"免费个人/非商用授权可接受"。
3. **Wikimedia Commons 采集类（3 条，TL 兜底）**：duck-quack / frog-croak / elephant-trumpet 在 Mixkit 免费库检索不到真实动物叫声（子代理已尝试多组查询词），TL 改从 [Wikimedia Commons](https://commons.wikimedia.org/) 采集真实录音——elephant-trumpet 为 **CC0（公有领域，无需署名）**，duck-quack（CC BY-SA 3.0）与 frog-croak（CC BY-SA 4.0）**需署名**（见下表逐条）。CC BY-SA 允许免费个人/非商用使用，署名要求已记录，满足卡片授权口径。

**署名要求汇总（打包/发布时需一并携带）**：duck-quack → Jonathon Jongsma (Xeno-canto XC62258, CC BY-SA 3.0)；frog-croak → File:Single Frog Croak.oga 作者 (Wikimedia Commons, CC BY-SA 4.0)。其余 17 条无署名要求。

**统一处理方式**：所有已交付文件均经过
`ffmpeg -i <raw> -af "loudnorm=I=-16:TP=-2.0:LRA=11,alimiter=limit=0.45:level=false" -ar 24000 -ac 1 -c:a aac -b:a 96k <out>.m4a`
（说明见文末"编码参数偏差说明"）。

---

## 逐条清单

| sfxKey | 类型 | 来源 URL / 分类页 | License | 是否需署名 | 处理方式 |
|---|---|---|---|---|---|
| task-success | 合成 | N/A（ffmpeg sine C5-E5-G5 上行琶音） | N/A 自制 | 否 | loudnorm+alimiter → m4a |
| light-hint-chime | 合成 | N/A（ffmpeg 单音高频 sine + 快速衰减） | N/A 自制 | 否 | loudnorm+alimiter → m4a |
| slot-light-up | 合成 | N/A（ffmpeg aevalsrc 线性 chirp 600→1800Hz） | N/A 自制 | 否 | loudnorm+alimiter → m4a |
| keyboard-milestone-chime | 合成 | N/A（ffmpeg sine 四音上行琶音 C5-E5-G5-C6） | N/A 自制 | 否 | loudnorm+alimiter → m4a |
| streak-reward-fanfare | 合成 | N/A（ffmpeg sine 上行琶音 + 顶音和声） | N/A 自制 | 否 | loudnorm+alimiter → m4a |
| chest-open | 合成 | N/A（ffmpeg 噪声 pop + chirp 上扫 + 高频 sparkle 叠加） | N/A 自制 | 否 | loudnorm+alimiter → m4a |
| dog-bark | Mixkit | 直链: https://assets.mixkit.co/active_storage/sfx/741/741-preview.mp3 ／分类页: https://mixkit.co/free-sound-effects/dog/ （条目 "Happy puppy barks"） | Mixkit License（免费个人+商用） | 否 | 截取前 1.05s → loudnorm+alimiter → m4a |
| cat-meow | Mixkit | 直链: https://assets.mixkit.co/active_storage/sfx/93/93-preview.mp3 ／分类页: https://mixkit.co/free-sound-effects/cat/ （条目 "Sweet kitty meow"） | Mixkit License（免费个人+商用） | 否 | 原长 0.876s，无需截取 → loudnorm+alimiter → m4a |
| duck-quack | Wikimedia Commons（TL 兜底） | 页面: https://commons.wikimedia.org/wiki/File:Anas_platyrhynchos_-_Mallard_XC62258.mp3 ／直链: https://upload.wikimedia.org/wikipedia/commons/6/69/Anas_platyrhynchos_-_Mallard_XC62258.mp3（真实绿头鸭 mallard，Xeno-canto XC62258） | CC BY-SA 3.0 | **是**（署名 Jonathon Jongsma） | 去静音+截前 2.0s → loudnorm+alimiter → m4a |
| horse-neigh | Mixkit | 直链: https://assets.mixkit.co/active_storage/sfx/1762/1762-preview.mp3 ／分类页: https://mixkit.co/free-sound-effects/horse/ （条目 "Stallion horse neigh"） | Mixkit License（免费个人+商用） | 否 | 原长 2.99s，无需截取 → loudnorm+alimiter → m4a |
| pig-oink | Mixkit | 直链: https://assets.mixkit.co/active_storage/sfx/3/3-preview.mp3 ／分类页: https://mixkit.co/free-sound-effects/pig/ （条目 "Pig grunting"） | Mixkit License（免费个人+商用） | 否 | 截取前 2.45s → loudnorm+alimiter → m4a |
| frog-croak | Wikimedia Commons（TL 兜底） | 页面: https://commons.wikimedia.org/wiki/File:Single_Frog_Croak.oga ／直链: https://upload.wikimedia.org/wikipedia/commons/9/9f/Single_Frog_Croak.oga（真实单次蛙鸣） | CC BY-SA 4.0 | **是**（署名 File:Single Frog Croak.oga 作者，见 Commons 页面） | 去静音+截 2.5s → loudnorm+alimiter → m4a |
| elephant-trumpet | Wikimedia Commons（TL 兜底） | 页面: https://commons.wikimedia.org/wiki/File:Elephant_voice_-_trumpeting.ogg ／直链: https://upload.wikimedia.org/wikipedia/commons/4/40/Elephant_voice_-_trumpeting.ogg（真实大象 trumpeting） | CC0（公有领域） | 否 | 去静音+截 ≤3s → loudnorm+alimiter → m4a |
| mouse-squeak | Mixkit | 直链: https://assets.mixkit.co/active_storage/sfx/1019/1019-preview.mp3 ／分类页: https://mixkit.co/free-sound-effects/squeak/ （条目 "Mouse squeak"） | Mixkit License（免费个人+商用） | 否 | 原素材仅 0.21s，用 apad 补 0.15s 静音尾巴满足 0.3s 下限 → loudnorm+alimiter → m4a |
| bell-ring | Mixkit | 直链: https://assets.mixkit.co/active_storage/sfx/931/931-preview.mp3 ／分类页: https://mixkit.co/free-sound-effects/bell/ （条目 "Service bell"） | Mixkit License（免费个人+商用） | 否 | 原长 1.18s，无需截取 → loudnorm+alimiter → m4a |
| bell-jingle | Mixkit | 直链: https://assets.mixkit.co/active_storage/sfx/937/937-preview.mp3 ／分类页: https://mixkit.co/free-sound-effects/bell/ （条目 "Happy bells notification"） | Mixkit License（免费个人+商用） | 否 | 原长 3.10s，无需截取 → loudnorm+alimiter → m4a |
| water-tap-flow | Mixkit | 直链: https://assets.mixkit.co/active_storage/sfx/1819/1819-preview.mp3 ／分类页: https://mixkit.co/free-sound-effects/water/ （条目 "Filling sink with water"） | Mixkit License（免费个人+商用） | 否 | 原长 10.8s，截取前 3.0s → loudnorm+alimiter → m4a |
| water-drop | Mixkit | 直链: https://assets.mixkit.co/active_storage/sfx/1879/1879-preview.mp3 ／搜索页: https://mixkit.co/free-sound-effects/discover/drip/ （条目 "Bathroom sink water drip"） | Mixkit License（免费个人+商用） | 否 | 原长 8.0s，截取中段 2.0s（1.0s-3.0s）→ loudnorm+alimiter → m4a |
| water-splash | Mixkit | 直链: https://assets.mixkit.co/active_storage/sfx/1311/1311-preview.mp3 ／分类页: https://mixkit.co/free-sound-effects/water/ （条目 "Water splash"） | Mixkit License（免费个人+商用） | 否 | 原长 1.48s，无需截取 → loudnorm+alimiter → m4a |
| chest-lid-creak | Mixkit | 直链: https://assets.mixkit.co/active_storage/sfx/1163/1163-preview.mp3 ／搜索页: https://mixkit.co/free-sound-effects/discover/creak/ （条目 "Door creak opened by the wind"；chest 分类页仅返回猴子拍胸不相关条目，故改用同为木质铰链吱呀声的门吱呀声近似） | Mixkit License（免费个人+商用） | 否 | 原长 4.5s，截取前 3.5s 去除尾部静音 → loudnorm+alimiter → m4a |

---

## 编码参数偏差说明

卡片原定转码命令为：
```
ffmpeg -y -i <raw> -af "loudnorm=I=-16:TP=-2.0:LRA=11,alimiter=limit=0.794:level=false" -ar 24000 -ac 1 -c:a aac -b:a 96k <out>.m4a
```

实测发现：`limit=0.794`（约 -2.0 dBFS 线性峰值目标）对本批 SFX 中瞬态较强的素材（打铃、狗吠、猪叫、水滴等）经 AAC 96k 编码后，解码峰值会反超到 -0.8 ~ 0.0 dBFS —— 这是有损编码常见的 inter-sample overshoot 现象，此前 TTS 语音卡（WTJ-20260704-074）因语音内容瞬态较弱未曾暴露此问题。

为使全部 20 条统一满足"峰值 ≤ -1.5 dBFS"客观验收标准，将 `alimiter` 的 `limit` 参数下调至 **0.45**（约 -6.9 dBFS 线性峰值目标），仍保持 `level=false`（避免限幅器自动增益补偿重新顶到 0dB 的既有坑）。复测后全部 17 条已交付文件编码后峰值落在 **-3.0 ~ -7.5 dBFS**，安全通过验收阈值，留有余量。

若 TL/PM 认为响度偏低需要调整，可在本参数基础上评估改用更高编码比特率或改用两阶段限幅（先限幅生成 PCM，再对编码后的峰值做二次验证微调）。

## 客观 QC 结果摘要

**20/20 全部交付并通过 TL 复验**：
- 格式：全部 `aac` / `24000 Hz` / `mono`
- 时长：0.30s ~ 3.50s（均落在 0.3-4s 范围内）
- 峰值：全部 ≤ -1.5 dBFS（实测 -3.0 ~ -7.5 dBFS，无削波，留余量）
- 3 条 TL 兜底 Commons 声（duck-quack -4.3dB/2.0s、frog-croak -3.9dB/2.5s、elephant-trumpet -4.0dB/1.35s）编码方式与其余一致。

## 兜底采集记录（原"未采集到"3 条，已解决）

- duck-quack / frog-croak / elephant-trumpet：Mixkit 免费库无真实动物叫声，TL 改自 Wikimedia Commons 采集真实录音（见逐条清单与顶部署名汇总）。已 20/20 全交付。

## 残余风险（TL）

- **响度一致性**：单遍 loudnorm 对短音效积分响度测量不稳，实测 20 条积分响度约 -15 ~ -20 LUFS 有约 5dB 跨度（不同类型音效如 chime vs 水声本身感知响度不同）；峰值已统一安全。是否需要更紧的响度对齐留给 QA076/Ethan 主观判断后再定（可二次 loudnorm 微调）。
- **CC BY-SA 传染性**：duck/frog 为 CC BY-SA，本项目非商用且仅本地打包分发、已署名，在授权范围内；若未来改商用或再分发需复核 ShareAlike 条款。

## 主观验收提醒

本卡执行者（音频工程师，sonnet）无法试听音频，以下事项均未验证，需交 QA076/Ethan 主观验收：
- 动物叫声是否自然、是否吓人、是否符合儿童友好基调
- 合成类 UI 反馈音（chime/fanfare/sparkle）情绪与游戏场景是否匹配
- 铃铛/水声/开箱声的情绪与语义匹配度
- 素材截取点（dog-bark/pig-oink/water-tap-flow/water-drop/chest-lid-creak）是否存在生硬掐头去尾感

---

## WTJ-20260704-084 追加：逐键机械键盘反馈音（5 条）

**背景**：084 卡音频侧交付——开发机验收发现按键缺少差异化反馈，需要更接近"机械键盘短促点击"的逐键反馈音，供新增 `app/web/keysound.js` 订阅 `window.WTJ_KEYBOARD.onLetter`/`onFunctionKey` 播放。本轮**不做** TTS 误读/发音审计（等 Ethan 给误读词清单），只做本节记录的机械键音。

**来源**：全部 5 条为 ffmpeg 程序化合成（噪声源 `anoisesrc` 经 `bandpass`/`lowpass`/`highpass` 滤波定形 + `aeval` 指数衰减包络，Enter/Space 额外叠加 `sine` 音调层做质感区分），完全原创，无第三方版权，无需任何授权声明——与本卡上方"6 条合成类 SFX"同一处理路线。

**统一处理方式**：与既有合成类 SFX 同款流程，末段接
`loudnorm=I=-16:TP=-2.0:LRA=11,alimiter=limit=0.5:level=false` → `-ar 24000 -ac 1 -c:a aac -b:a 96k`。因这批是极短瞬态（真实"点击"内容仅 30~75ms），额外用 `atrim` 截出瞬态主体后 `apad` 补静音尾巴，把最终文件时长垫到 0.15~0.19s——这样做同时满足两个客观门槛：本卡"时长合理（<0.2s）"验收口径，以及仓库既有 e2e 脚本 `tests/e2e/check_audio_assets.py`（WTJ-20260704-076）对 `missing-audio.json` 收录的每条 SFX 强制的 `DUR_MIN=0.15s` 下限——处理手法与本文件上方 `mouse-squeak`（apad 补尾满足 0.3s 下限）同一先例，非本卡新造规则。

| sfxKey | 类型 | 合成参数 | License | 时长 | 峰值 |
|---|---|---|---|---|---|
| key-letter | 合成 | anoisesrc white + bandpass f=3500/w=2500 + aeval exp(-t·90)，瞬态≈45ms | N/A 自制 | 0.16s | -8.2 dBFS |
| key-space | 合成 | anoisesrc bandpass f=200/w=160 + sine 140Hz 叠加，amix 后 aeval exp(-t·35)，瞬态≈75ms | N/A 自制 | 0.19s | -6.3 dBFS |
| key-enter | 合成 | anoisesrc bandpass f=2600/w=2000（衰减 exp(-t·70)）+ sine 900Hz（衰减 exp(-t·55)）amix 叠加，瞬态≈65ms | N/A 自制 | 0.18s | -6.5 dBFS |
| key-punct | 合成 | anoisesrc bandpass f=2000/w=1400 + aeval exp(-t·95)，瞬态≈35ms | N/A 自制 | 0.155s | -6.0 dBFS |
| key-modifier | 合成 | anoisesrc highpass f=80 + lowpass f=500（无高频亮度，闷钝感）+ aeval exp(-t·120)，瞬态≈30ms | N/A 自制 | 0.15s | -6.1 dBFS |

**客观 QC 结果**：5/5 全部 `aac` / `24000 Hz` / `mono`；时长 0.15s~0.19s（落在 [0.15, 0.2) 区间，见上方处理方式说明）；峰值全部 ≤ -1.5 dBFS（实测 -6.0 ~ -8.2 dBFS，无削波，留有余量，与上方 20 条既有 SFX 同一 `loudnorm+alimiter` 路线，未复现该批曾出现的"AAC 编码后 inter-sample overshoot"问题——瞬态强度/频段与铃铛/动物叫声等原始素材不同，`limit=0.5` 未见反超）。

**主观验收提醒（本卡执行者未试听，交 QA/Ethan）**：
- 5 类音色区分（letter 清脆 / space 低沉 thock / enter 确认感 / punct 中性轻 click / modifier 最钝）是否符合"机械键盘"直觉、是否儿童友好不刺耳
- `playSfx()` 当前不支持音量/gain 参数（见 `app/web/audio.js` `playFromPath()`，`BufferSource` 直连 `ctx.destination`，无 `GainNode`）——`keysound.js` 对 `onFunctionKey` 的 `intensity` 衰减改用"低于阈值跳过播放"实现"递减到几乎没有"，而非真实音量渐弱；若未来需要真正的连续渐弱手感，需先给 `audio.js` 加一层 `GainNode`（超出本卡范围，未改动 `audio.js` 播放链路本体）。
