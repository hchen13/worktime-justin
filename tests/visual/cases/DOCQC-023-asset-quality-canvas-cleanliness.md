# 素材质量与画面清洁度视觉验收（WTJ-20260704-023，静态半）

被测：`app/web/assets/` 生产素材（115 PNG）+ 默认画布 HUD，提交 `9a455e6`。
标准：`.agents/docs/production-asset-quality.md`。
本卡范围（PM 下一步动作明确）：**静态素材 + 画面清洁度现在验；生产动效最终视觉待 056 runtime + 067-070 返工**。

## 怎么测（可复现）

1. 脚本层：`python3 tests/visual/scripts/check_sprite_assets.py` —— 扫全部 PNG 的
   格式/alpha/透明背景/非空/内容 padding(不触边)/尺寸。报告 `tests/reports/sprite_asset_scan.json`。
2. 视觉层：把 sprite 合成到暗底(#0e1117 app 画布)拼图(`tests/reports/docs-023/sprites_{1,2,3}.png`、
   `props_ui_rewards.png`)，agentic 目视判断风格一致性/非草图非emoji/儿童可识别/暗底可读。
3. 画面清洁度：headless 渲染 `index.html` 默认态截图(`tests/reports/docs-023/default-canvas.png`)+
   清点 HUD chrome(按钮/输入框数)。

## 结构化视觉判断

```json
{
  "pass": true,
  "scope": "static-assets-and-canvas-cleanliness (dynamic animation visual deferred to WTJ-20260704-056)",
  "criteria": {
    "1_not_rough_not_emoji_unified": {
      "pass": true,
      "reason": "115 张(102 秘密词 sprite + 8 task-props + 3 ui + 2 rewards)统一 3D 光泽圆润儿童插画风：软阴影、高光、圆润造型、一致的 3/4 透视与打光。明显优于 emoji（真实渲染的阴影/质感/细节），非草图非占位图标；task-props 与 ui/rewards 与秘密词 sprite 同一美术方向，全套一致。",
      "evidence": ["sprites_1/2/3.png 目视：apple/dog/cat/duck/lion/octopus... 全部高质量成品插画",
                   "props_ui_rewards.png：five-slot-tray/question-mark-token/working-status-light 与 sprite 同风格"]
    },
    "2_alpha_crop_dark_readable": {
      "pass": true,
      "reason": "脚本扫描 115/115：全部 RGBA、有透明背景(非全不透明)、非空、内容不触画布边缘(padding 充足，符合'不裁切'要求)、全部 1024x1024 一致尺寸；暗底拼图目视全部清晰可读(含浅色的 egg/igloo/spoon/quarter/xray)。",
      "evidence": ["sprite_asset_scan.json: 115 total, 0 defects, 0 warnings", "暗底拼图无不可读项"]
    },
    "3_default_canvas_clean": {
      "pass": true,
      "reason": "默认画布：干净深色画布、底部居中 5 槽托盘、右侧仅一个低调问号(符合需求'不放 3-4 个按钮')、0 输入框(无回显条)、无按钮堆；左下 3 个暗状态灯。HUD 清点：visButtons=1, inputs=0。",
      "evidence": ["default-canvas.png", "HUD inventory: {buttons:1, inputs:0}"]
    },
    "4_rewards_no_permanent_pollution": {
      "pass": true,
      "reason": "默认态无任何奖励残留；奖励一次性行为(宝箱播放后 reset)已由 021 INT-CHEST 端到端验证(onChestComplete 后五槽清空)。最终动效帧的视觉丰富度待 056。",
      "evidence": ["default-canvas.png 无奖励残留", "021 task_reward_integration INT-CHEST"]
    }
  },
  "findings_to_pm": [
    {"severity": "minor", "what": "默认 HUD 右上角家长锁用 🔒 raw emoji(非统一风格 sprite)。质量标准『不用 emoji 作最终素材』——建议换成与 sprite 集一致的样式化锁图标。"},
    {"severity": "info", "what": "app/web/assets/sprites/secret-word-placeholder.png(蓝圈 ? 图标)在生产 sprites 目录中——应为未匹配词的意图性 fallback，风格一致；请 PM 确认是有意保留的 fallback 而非未完成资产。"},
    {"severity": "info", "what": "treasure-chest.png 与 treasure.png 目视疑似重复/别名，请 PM 确认是否有意。"}
  ],
  "risks": [
    "本轮只覆盖静态素材 + 默认画布清洁度；生产动效帧序列(宝箱烟花/开箱/状态灯连闪/faucet 流水/horse 跑动等)的逐帧视觉质量与'读起来是活的'待 056 动画 runtime 接入 + 067-070 返工后单独验收。",
    "秘密词命中/任务进行/奖励播放等运行态画面清洁度(旧字母退背景、奖励淡出不堆积)本轮未逐态截图，随 056 一并做运行态视觉验收更有意义。"
  ]
}
```

## 已知边界 / 后续

- 动效最终视觉验收（本卡剩余半）待 WTJ-20260704-056 runtime + 067-070 返工，届时做逐帧/运行态截图 + agentic 视觉验收。
- `check_sprite_assets.py` 与本 case 为可复用资产，素材批次更新后可复跑回归。

---

## 动效视觉验收（2026-07-04 14:42 CST · interim,056 动画 runtime 落地后）

056 动画 runtime + 067/069/070 动效资产落地。QA 做动效逐帧+运行时视觉验收(068 horse 仍返工中,标待复验;072/073 待):

**静态帧表质量(check_sprite_assets.py 扫 app/web/assets/anim/ 15 张 sheet: RGBA/透明/非空/不触边 0 缺陷)+ 暗底拼图目视(anim_sheets.png)**:
- faucet running(6帧水流渐长)/closing(6帧收束到滴落)、horse idle(4)/run(8帧奔跑循环)/stop_success(6帧星星庆祝)、lamp turning-on(6)/off(5 灯光渐亮渐灭)、treasure-chest opening(5 箱盖渐开)/reward_pop(7 星星礼物爆出)。
- 判定: 风格与静态生产集完全一致(光泽3D儿童风)、足够中间帧"读起来是活的"、首末帧干净可与静态态混合、暗底透明可读、无emoji非草图——**达 production-asset-quality.md 动画 sprite 质量bar**。

**运行时集成(frame-anim.js WTJ_FRAME_ANIM)**:
- getState: availableProps=[faucet/horse/lamp/treasure-chest], deferredProps=[door/bell](符合设计延 v2)。
- getDuration 合理(reward_pop 583ms/turning-on 500ms/run 667ms/faucet 600ms), preload 全 True。
- play() 实际驱动: 捕获运行时帧 runtime-chest-frame.png = 开箱金宝箱+星星礼物,证明帧表→抽帧→canvas 绘制端到端成立, 0 console/page error。

**结构化判断**: {"pass": true, "scope": "动效帧表质量+运行时集成(faucet/lamp/treasure-chest)", "pending": ["horse 待 068 返工后复验", "door/bell 设计延 v2", "音频配套待 016 内容(137条仍0)", "faucet/horse 点击任务入口+语音路径待 072", "运行时资产同步待 073"]}

证据: tests/reports/docs-023/{anim_sheets.png, runtime-chest-frame.png, anim_sheet_scan.json}。

## horse 复验（2026-07-04 15:17 CST · 068 返工后）

068「小马 run sheet 奔跑姿态与伪影」返工已 done。QA 复验 horse_recheck.png：
- idle(4帧 轻摆)/run(8帧 清晰 gallop 循环,腿部展开收拢,无伪影)/stop_success(6帧 动态线+星星庆祝)。
- 判定 PASS：奔跑步态读起来是活的、无伪影、风格与全集一致——**"horse 待 068 复验"项闭合**。
- 至此 023 动效视觉对全部 4 个 prop(faucet/lamp/treasure-chest/horse)均已验收通过;仅剩 073 runtime 同步后做运行态最终确认 + 正式 handback。证据 docs-023/horse_recheck.png。

## 最终视觉复测（2026-07-04 16:26 CST · 073 accepted 后正式执行,PASS）

073 runtime 动效资产同步 PM accepted。QA 执行运行态 agentic 视觉复测 + 闭合遗留发现：

- **运行态动效播放（runtime_all4.png + 早前 runtime-chest-frame.png）**：frame-anim.play() 实播全部 4 prop——
  faucet(水流+水滴)/lamp(暖光亮起)/horse(奔跑姿态)/treasure-chest(开箱+星星)均在暗底 canvas 正确渲染,0 console/page error。
- **🔒 emoji 发现闭合（071）**：默认 HUD 右上家长锁已由彩色 🔒 raw emoji 换成低调样式化线条锁图标(hud-lock-check.png; body 文本不再含 🔒)——023-static 的 minor 发现 closed。
- **门/铃 door/bell**：frame-anim deferredProps 明确延 v2,非本轮缺陷。

**023 最终视觉结论 PASS**：静态素材(115 PNG)+ 画面清洁度(锁已修)+ 动效帧表质量(15 sheet)+ horse 068 返工复验 + 4 prop 运行态播放 + 奖励不永久污染,全部验收通过。残余(非本视觉卡阻塞):音频耦合反馈(faucet 水声等)待 076/音频运行时接入; door/bell v2。

## 最终视觉复验（2026-07-04 19:05 CST · 079 runtime refresh 后，PASS）

079 runtime refresh(把再返工的 068/067/069 同步进运行时资产)已 PM accepted。QA 重做 raw asset + runtime 动效视觉:
- **faucet(Ethan 关注点·水柱与出水口匹配)**: faucet_recheck.png 目视——running 6 帧水柱从出水口开口正确位置连续下流+水滴, closing 6 帧渐细到滴落, 位置对齐正确。**已解决**。
- **运行态 frame-anim 实播 4 prop(runtime2_all4.png)**: faucet(水柱对齐)/lamp(亮起)/horse(068返工版奔跑)/treasure-chest(开箱)全部正确渲染, 0 console/page error。
- 结合前述: 115 静态 sprite + 画面清洁度(锁已修) + 15 动画帧表质量 + horse 068 复验 + 全 4 prop 运行态, 全部通过。
- **023 最终视觉结论 PASS**。残余(非本视觉卡阻塞): 音频耦合已由 076 单独闭合(task-voice 修复); door/bell 设计延 v2。
