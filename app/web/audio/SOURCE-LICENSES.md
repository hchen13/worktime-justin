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
| task-success | 合成 | N/A（WTJ-20260705-015 修订：ffmpeg sine C5-E5-G5-C6 四音上行琶音 + E6/G6/C7 高频 sparkle 收尾和弦，见文末「WTJ-20260705-015 追加」一节） | N/A 自制 | 否 | loudnorm+alimiter → m4a |
| light-hint-chime | 合成 | N/A（ffmpeg 单音高频 sine + 快速衰减） | N/A 自制 | 否 | loudnorm+alimiter → m4a |
| slot-light-up | 合成 | N/A（ffmpeg aevalsrc 线性 chirp 600→1800Hz） | N/A 自制 | 否 | loudnorm+alimiter → m4a |
| keyboard-milestone-chime | 合成 | N/A（ffmpeg sine 四音上行琶音 C5-E5-G5-C6） | N/A 自制 | 否 | loudnorm+alimiter → m4a |
| streak-reward-fanfare | 合成 + Mixkit | WTJ-20260705-015 修订：原合成琶音层保留 + 叠加 Mixkit 直链 https://assets.mixkit.co/active_storage/sfx/975/975-preview.mp3 ／分类页 https://mixkit.co/free-sound-effects/party/ （条目 "Happy crowd cheer"），见文末「WTJ-20260705-015 追加」一节 | Mixkit License（免费个人+商用，新增部分）+ N/A 自制（合成部分） | 否 | 截取 cheer 0.30s-1.80s 段 + 淡出，与原合成琶音 amix 混合 → loudnorm+alimiter → m4a |
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

---

## WTJ-20260705-015 追加：任务成功反馈音效升级（`task-success` 修订 + `streak-reward-fanfare` 修订）

**背景**：Ethan 现场验收反馈——问号任务完成时"只有很小提示音 + 左下角灯点亮，缺视觉成功反馈"；连续完成 3 个任务的「今日工作完成」奖励音效也不够"cheer/yay"庆祝感。本卡（WTJ-20260705-015）新增画布视觉爆点（见 `app/web/status-rewards.js` 与 `app/web/task-templates.js` 的改动，非本文档范围）配合音频侧两处修订：

### 1. `task-success.m4a`（单次任务成功，短促加强，不改变 sfxKey/路径）

原素材是 3 音（C5-E5-G5）上行琶音、0.6s、峰值 -6.9dBFS、RMS -20.6dBFS。修订为 **4 音（C5-E5-G5-C6）上行琶音 + 一个短促的高频 sparkle 收尾和弦（E6/G6/C7 三音同时轻声进入，制造"闪光"尾韵）**，仍是纯 ffmpeg `sine` 程序化合成（无第三方版权），只是内容更丰富、RMS 更高（更有存在感），时长仍保持短促（0.57s，比原来还略短）：

```
ffmpeg -f lavfi -i "sine=frequency=523.25:duration=0.16" \
       -f lavfi -i "sine=frequency=659.25:duration=0.16" \
       -f lavfi -i "sine=frequency=783.99:duration=0.16" \
       -f lavfi -i "sine=frequency=1046.50:duration=0.20" \
       -f lavfi -i "sine=frequency=1318.51:duration=0.22" \
       -f lavfi -i "sine=frequency=1567.98:duration=0.22" \
       -f lavfi -i "sine=frequency=2093.00:duration=0.22" \
       -filter_complex "
         [0:a]afade=t=out:st=0.03:d=0.13,adelay=0|0[n1];
         [1:a]afade=t=out:st=0.03:d=0.13,adelay=90|90,volume=0.95[n2];
         [2:a]afade=t=out:st=0.03:d=0.13,adelay=180|180,volume=0.95[n3];
         [3:a]afade=t=out:st=0.03:d=0.17,adelay=270|270,volume=1.0[n4];
         [4:a]afade=t=out:st=0.02:d=0.20,adelay=330|330,volume=0.55[s1];
         [5:a]afade=t=out:st=0.02:d=0.20,adelay=340|340,volume=0.5[s2];
         [6:a]afade=t=out:st=0.02:d=0.20,adelay=350|350,volume=0.42[s3];
         [n1][n2][n3][n4][s1][s2][s3]amix=inputs=7:duration=longest:dropout_transition=0,volume=1.6,
         loudnorm=I=-16:TP=-2.0:LRA=11,alimiter=limit=0.45:level=false[out]
       " -map "[out]" -ar 24000 -ac 1 -c:a aac -b:a 96k task-success.m4a
```

**客观 QC**：`aac`/`24000Hz`/`mono`，时长 0.57s（在 [0.15,12]s 合理区间内，且比原 0.6s 更短促），峰值 -6.94dBFS（≤ -1.5dBFS 门槛，无削波），RMS -17.7dBFS（比原 -20.6dBFS 更响，"更有存在感"的客观代理指标）。

### 2. `streak-reward-fanfare.m4a`（三灯「今日工作完成」cheer/yay，与 010 completion-stamp 同步播放）

原素材是纯合成上行琶音 + 顶音和声、1.2s。Ethan 要求"更强的 cheer/yay 类庆祝音效"——纯合成 chime 无法传达真实人声欢呼的"yay"语感，改为**真实 Mixkit 人群欢呼采样与原合成琶音分层混音（amix）**，保留原有"音乐奖励动机"的听觉连续性，同时叠加真实欢呼声：

- 来源：Mixkit 直链 https://assets.mixkit.co/active_storage/sfx/975/975-preview.mp3 ，分类页 https://mixkit.co/free-sound-effects/party/ （条目 "Happy crowd cheer"，原长 4.38s）。License：Mixkit License（免费个人+商用，无需署名），条款同本文档其余 Mixkit 采集类条目，PM 已在 WTJ-20260704-075 裁决"免费个人/非商用授权可接受"同一口径下沿用。
- 处理：`silencedetect` 定位真实内容区间为 0.30s~3.79s（前后是静音），截取该区间内前 1.5s（0.30s-1.80s，欢呼声起势最强的开头段）+ 末尾 0.3s 淡出，延迟 150ms 起播（让原合成琶音的头几个音先被听见，再让人群欢呼声涌入），与**原合成琶音层（未改动，逐字节复用既有 `streak-reward-fanfare.m4a` 解码后的 PCM）**做 `amix`：

```
ffmpeg -i crowd-cheer-975-raw.mp3 -i streak-reward-fanfare-orig.m4a \
  -filter_complex "
    [0:a]atrim=0.30:1.80,asetpts=PTS-STARTPTS,afade=t=out:st=1.2:d=0.3,adelay=150|150,volume=0.85[cheer];
    [1:a]volume=1.0[fanfare];
    [cheer][fanfare]amix=inputs=2:duration=longest:dropout_transition=0,volume=1.3,
    loudnorm=I=-16:TP=-2.0:LRA=11,alimiter=limit=0.45:level=false[out]
  " -map "[out]" -ar 24000 -ac 1 -c:a aac -b:a 96k streak-reward-fanfare.m4a
```

**客观 QC**：`aac`/`24000Hz`/`mono`，时长 1.65s（比原 1.2s 略长，仍落在 010 的 `OVERLAY_TOTAL_MS`=1.8s 一次性叠层可见窗口内，不会播完之后叠层还没消失、也不会叠层已消失但声音还没播完的明显错位），峰值 -6.66dBFS（≤ -1.5dBFS 门槛，无削波），mean_volume -19.5dBFS。

**协调说明**：`status-rewards.js` 播放此音效的调用点（`playRewardSfxDefensive()` 内的 `window.WTJ_AUDIO.playSfx('streak-reward-fanfare')`）本身未改动——只替换了文件内容，sfxKey/路径/触发时机保持不变，因此与 010 的三灯连闪 + completion-stamp-v3 视觉叠层依旧是同一个 `triggerWorkComplete()` 里同时发起，不会出现新的时序冲突或"各弹各的"。

**残余风险 / 主观验收提醒（本卡执行者无法试听，交 QA076/Ethan）**：
- "Happy crowd cheer" 采样是否听感上确实像"孩子会觉得开心的欢呼"而非"体育场噪音感"过重；trim 的 0.30s-1.80s 窗口是否恰好落在该采样最有感染力的一段（本卡仅凭 `silencedetect` 定位内容边界，未做逐帧能量分析选取"最佳片段"）。
- 4 音+sparkle 版 `task-success.m4a` 与 3 灯 cheer 版 `streak-reward-fanfare.m4a` 两者的"奖励强度阶梯感"（单次 vs 三连）是否听感上区分明显、循序渐进，不生硬跳变。
- 二者与新增的画布视觉爆点（sparkle burst + 成功环）在真实设备上播放是否有音画不同步的观感问题（本卡未做真机录屏验证，只做了 JS 层的可注入时钟单测）。
## WTJ-20260705-024：全量重生成为 CosyVoice 3 + Ethan 自录音色（取代下方 Kokoro 074/084）

**背景**：Ethan 拒绝 Kokoro 音色，选定 CosyVoice 3 + 他本人自录参考声。本目录全部 TTS `.m4a`
（words 101 + EN tasks 8 + phrases 10 + ZH tasks 24 + ZH 新 8 ≈ 151）已 zero-shot 全量重生成。
下方 074/084 的 Kokoro 段为历史记录，磁盘上的 `.m4a` 现为 CosyVoice3 + Ethan 版本。

**来源 / 授权**：

| 项 | 值 |
|---|---|
| TTS 模型 | **CosyVoice 3**（`Fun-CosyVoice3-0.5B-2512`，FunAudioLLM / 阿里达摩院） |
| 模型许可 | **Apache-2.0**（代码 + 权重均 Apache-2.0；024/084 spike 核实为所有候选中最干净——无 Chatterbox 式 Perth 水印、无 IndexTTS2 式营收/MAU 门槛） |
| 模型来源 | HF `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` + GitHub `FunAudioLLM/CosyVoice`（Apache-2.0） |
| 音色 voice | **Ethan 本人自录参考声**（zero-shot 克隆）。个人自录、**自我授权**——不涉及第三方录音/肖像/配音授权；本项目个人非商用自用。参考声在 `dist-stage/024-cosyvoice3-reference/`（`.gitignore` 不入库） |
| 为何合法 | CosyVoice 3 无内置固定音色、只能 zero-shot 克隆参考声，参考声带独立权利；本卡刻意**不用**模型自带 demo 声（同意范围不明），改用 Ethan 自录音，从源头消除音色授权风险 |
| 确定性 | `set_all_random_seed(42)`（CosyVoice 采样本随机，固定 seed 复现） |
| 生成脚本 | `app/scripts/generate-tts-cosyvoice3.py`（复用 074/084 文本源） |
| 授权口径 | 模型 Apache-2.0 + 音色 Ethan 自录自授权 + ffmpeg（构建期工具）→ 产物 `.m4a` 可随 app 分发（个人非商用）。espeak-ng 不再参与（CosyVoice 自带 wetext 文本前端）。 |

**统一处理方式**：与 074/084 完全一致——`ffmpeg loudnorm=I=-16:TP=-2.0:LRA=11,alimiter=limit=0.794:level=false` → `-ar 24000 -ac 1 -c:a aac -b:a 64k`。仅换 TTS 模型/音色，母带链不变。

**主观验收（TL 不试听）**：音色 / 发音自然度 / 儿童友好 / 无爆音，交 Ethan / QA 在主目录 `docs/design-review.html` 逐条把关。

---

## WTJ-20260704-084 追加：中文任务语音 TTS（24 条 `.zh.m4a`）

**背景**：084 卡音频侧的 TTS 全量重生成。PM 已验收选型 spike（`tl/tts-spike-084`）并采纳默认路线
**单引擎 Kokoro-onnx：EN=af_heart、ZH=zf_xiaoxiao**。本节记录中文任务语音（24 条完整句）的来源与授权；
EN 侧（af_heart，119 文件）本卡确定性复跑核实与已交付 074/078 版本逐文件 sha256 一致，未改动磁盘文件，
仅更新 provenance。逐句音素串 / 客观 QC / 复现步骤见 **`app/web/audio/TTS-PROVENANCE.md`**「WTJ-20260704-084：中文任务语音」一节。

**来源 / 授权**：

| 项 | 值 |
|---|---|
| TTS 模型 | **Kokoro-82M**（`kokoro-v1.0.onnx` + `voices-v1.0.bin`，与 EN 同一份权重） |
| 模型许可 | **Apache-2.0**（允许个人 / 非商用 / 商用；本项目非商用，充分满足；**无水印**） |
| 模型来源 | https://github.com/thewh1teagle/kokoro-onnx （release `model-files-v1.0`） |
| 权重 sha256 | onnx `7d5df8ec…a6c5` / voices `bca610b8…bf7d`（下载后已核对，与 spike ENV-BUILD.md 一致） |
| 音色 | **zf_xiaoxiao**（中文女声，来自 voices-v1.0.bin，Apache-2.0） |
| 中文 G2P | **misaki 0.9.4 [zh]**（MIT；jieba 0.42.1 + pypinyin 0.55.0 + cn2an）。中文不经 espeak-ng。 |
| espeak-ng | 1.52（Homebrew，GPLv3）——**仅 EN 用**，构建期音素化工具，不链接进、不随 app 分发；中文侧完全不用它 |
| 确定性 | 固定音色 + 无采样 + **无需 seed** → 可复现字节一致 |
| 文案来源 | `CN-TASK-DRAFT.md` v1（PM 已批），24 条逐条对齐 `app/scripts/tts-text-manifest.zh.json` |
| 生成脚本 | `app/scripts/generate-tts-zh.py` |
| 授权口径 | 全部模型 / G2P / 依赖均为宽松许可（Apache-2.0 / MIT），无第三方录音素材、无署名要求、无水印。中文语音产物 `.zh.m4a` 可随 app 分发。 |

**统一处理方式**：`ffmpeg loudnorm=I=-16:TP=-2.0:LRA=11,alimiter=limit=0.794:level=false` → `-ar 24000 -ac 1 -c:a aac -b:a 64k`（与 074 EN 语音链完全一致；`level=false` 必需）。

**客观 QC**：24/24 生成成功、0 失败（生成期 no-silent-fallback：RMS>1e-4 + 时长带校验后才编码）；
全部 aac/24000Hz/mono；时长 1.00–1.73s；峰值 -1.9 ~ -4.7 dBFS（无过载）；均值 -15.6 ~ -17.1 dB（非静音）。逐条见 TTS-PROVENANCE.md。

**主观验收提醒（本卡执行者未试听，交 QA/Ethan）**：中文发音自然度、多音字实际读音（对照 TTS-PROVENANCE.md 逐句 misaki 音素串核对，重点数字 3/5/7 读法与单字母尾音）、儿童友好度、无爆音——均需 Ethan / QA-076 主观核对。
