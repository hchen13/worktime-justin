# WTJ-20260704-024 最终验收 · 66-REQ 覆盖矩阵（FINAL / Go-No-Go）

> **【dab84f1 DELTA 更新 2026-07-08】** 最终验收目标已由 PM 从 bf8b284 推进到 **stage@dab84f1**（= bf8b284 + 单 commit WTJ-20260707-011，Ethan 对 bf8b284 的 4 项验收反馈 polish：①底部槽去横长条→3 紧凑居中圆 ②秘密词完成音频恒英文 ③terminal 提示放大 ④宝箱 is-open 双层只留 Canvas 动画）。QA 已对 dab84f1 做 delta 复验：四处部署对齐 dab84f1（含 justin.local SSH）、干净 worktree run_all **8/8** + webkit e2e（verify_011_polish 四项 PASS / 门铃14/14 / 键盘10/10 / target25/25 / drag PASS / faucet6/6）全绿无回归。**下方 bf8b284 的 66-REQ 逐条结论 carry-forward 到 dab84f1**（delta 仅触 DEF/SLOT/SEC/RWD，均已复核不回归）。P2 变化：DEF-01 收窄为纯 doc-sync（011 fix#1 = Ethan 亲自打磨 3 槽 → 确认 3 槽为接受态，仅需 docs 由 5 更新为 3+ghost）；EXIT-01/03 不变。**判定：dab84f1 GO（条件性）。**

生成：QA loop（ClaudeSession:47f2c9e9…），原 66-REQ 逐条重核目标产物 **stage@bf8b284**（主目录/app-dist/本机-Applications/justin.local-/Applications 全对齐，bundle web 对源零差异），后经上述 dab84f1 delta 复验 carry-forward。

> 本报告取代 `024-req-coverage-interim.md`（9a455e6 INTERIM，run_all 旧 5/5，早于门铃 006→010 修复链）。每条 REQ 已对 bf8b284 当前码+测试逐条重核（10 域并行 + 对抗验证）。

## 结论：GO（条件性，带 3 条 P2 待 Ethan 签核）

- **66 条 REQ：Pass 49 / Risk 17 / Fail 0**
- 严重度：**P0/P1 = 0**；Risk 全部为 P2×3 + P3×14。对抗验证（对任何 Fail 或 P0/P1-Risk）**跳过——无此类项**；确认真实用户可见缺陷 **0 个**。
- 出货版核心体验（键盘自由探索/秘密词/四类问号任务含拖拽/五槽里程碑/宝箱烟花奖励/门铃门等 canvas 帧动画/音频/每日额度/kiosk 全屏/打包）均已实现并经 run_all 8/8 + webkit e2e（门铃14/14 像素级、键盘10/10、target 可见25/25、faucet6/6、drag 修复后2/2）+ justin.local bf8b284 现场会话（task-complete=6、发热 rafTicksSinceLast 300→1）+ 门铃/门 WebKit 截图（bell 8255 / door 24485 非透明像素）验证。

## 3 条 P2（非阻塞，需 Ethan 显式签核/裁决）

- **REQ-DEF-01** — 线框：默认只保留画布、底部五个发现槽、右侧一个问号、角落任务状态灯和很小的家长入口（默认极简界面）。
  - 元素类型全部在位、极简性满足，但默认槽数与规范文本冲突：DEF-01 明文『五个发现槽』，DEF-02 line 807/810 又把『五个发现槽』列为已定点并以需求文本为准，SLOT-01(line 970) 与奖励汇总表(line 1237『发现槽数量 5 个』)亦均为 5；实现默认 3 主槽 + ghost 可扩展位。此为 WTJ-20260704-083(c3365ab) 有意把槽数改为可配置、默认 3 引入，但权威 docs 从未同步。与 interim(Pass) 不同：这不是已闭环的历史 Risk，而是 interim(@9a455e6) 漏判的一条当前活跃的规范/实现背离，直接影响满槽→宝箱的奖励节奏与默认线框呈现。非阻塞（app 可用、系有意改动），故 Risk P2 交 Ethan 裁决（改 manifest 回 5 或更新 docs 承认 3+ghost）。
- **REQ-EXIT-01** — App 内部拦截 Command+H / Command+W / Command+Q 等常见快捷键，防止孩子误触退出。
  - 实现正确且在位，与 interim(Risk) 一致，且未被门铃/发热/额度修复链触及（那些针对 web 渲染/发热，与原生吞键无关）。残余：原生吞键仅代码审查+窗口模式 responder 手测，真机端到端未闭环（interim 开放 P0 项 491 仍在）。有冗余防线（吞键+空菜单去绑定），家长可重启，故非阻塞→P2。
- **REQ-EXIT-03** — 家长退出需长按 Esc ≥5 秒，触发口令输入；口令正确后才能退出全屏安全空间。
  - 实现+审查在位，与 interim(Risk) 一致，无后续卡闭环。残余为真机交互链（NSAlert 模态焦点/安全输入框/terminate）从未在 CI 或真机端到端验证（interim 开放 P0 项 486；证据简报 justin.local 会话为只读诊断、未触发退出）。这是唯一安全退出闸门，错误口令不退出已静态可证，非 Fail；但真机保真未闭环、需 Ethan 显式签核→P2。

## 14 条 P3（非阻塞残余：动态逐帧像素/真机目视未闭环，或 PM 已接受取舍，或 docs 标『可选』）

- **REQ-DEF-02**：作为治理性声明——存在、结构完整、交叉引用全解析、DOCQC-002 干净——核心功能（记录 mock↔文本四条差异裁决）成立。但声明第 807 行及第②项把『五个发现槽』列为已定点/以需求文本为准，而 WTJ-20260704-083 已把默认改为 3 槽（manifest.js:317）——该声明自身携带了一条已被后续卡覆盖却未同步的规范主张，属文档一致性漂移。与 interim(Pass) 
- **REQ-KB-02**：变化四要素(颜色/大小/旋转/位置)均有单测量化覆盖，判 Pass 侧；但『深色背景高对比可读』仅由亮色板+描边+高光的静态设计保证，无自动对比度/像素测量测试——保留为 P3 静态残余，与 interim(Risk) 判定一致(后续卡未新增对比度门)。
- **REQ-KB-03**：弹出+淡出时长与曲线由 manifest 真值[800,1500]驱动、computeLetterFrame 纯函数逐阶段单测覆盖，代码正确；但整段是动画时序，无真浏览器逐帧像素捕获验证实际观感——纯『无动态像素测试但代码+单测已覆盖』故 P3。与 interim(Risk) 一致，非阻塞。
- **REQ-SEC-03**：较 interim 升级：interim 判 Risk 因『声音半边未交付(016)』，bf8b284 词音已实际落盘且 scan 0 缺陷、playWord 已接线。残余仅为：sprite 屏上一次性淡入→停留→淡出无动态像素/e2e 视觉测试（仅单测 DOM 叠层接线），且音频可听性为主观项（TL 不试听，交 QA076/Ethan）。故 P3，非阻塞。附注：manifest.js:304 a
- **REQ-SLOT-01**：点亮机制、五格内去重、双来源点槽全部实现且行为性测试通过——机制层 Pass。唯一残留：交付槽数为 3 而文档权威文本(docs/index.html:965,970,986-993 反复写「五个/五格」)规定 5。这是 WTJ-20260704-083 的 PM 明确裁定(manifest.js:313-316 记录「文档原文为5…对3岁实测偏多…PM 裁定默认改为3」)，属 PM 已接受的取舍
- **REQ-TASK-01**：代码结构性保证只渲染单个低调问号、无图标列，需求实质已满足；残余仅是缺少专项 DOM/像素计数断言，且 docs REQ-DEF-02 自陈 mock 仍画 4 图标（以文本需求为准）。非功能缺陷，判 Risk P3 而非 Fail。与 interim 的 Risk 一致（其 P1 注记即『无专项断言』）。
- **REQ-PTR-01**：核心'淡尾迹+速度稍明显+3秒衰减+停顿恢复'已实现且单测钉死数值台阶、jsdom 集成验证真实渲染路径 → 非 Fail。Risk P3 两点残余：(1) 大反馈'对象轻微躲开/旋转/发光'未实现为对象对指针悬停的反应；computeDropAvoidanceFactor 是'拖拽期间尾迹星点避开 drop target'另一种效果，真正对象反应被 pointer.js:165-168 显式设计
- **REQ-RWD-01**：机制与一次性/清屏逻辑完整且单测充分；宝箱开箱走 WTJ_FRAME_ANIM，其渲染路径已由 faucet6/6+door/bell14/14 webkit e2e 像素级验证（同引擎）。残余：reward-fireworks 粒子引擎与 treasure-chest 开箱的运行态逐帧像素/视觉无任何自动化渲染测试；证据简报 L24 明确 justin.local 短会话未触发宝箱、无真机宝箱截
- **REQ-AST-01**：纯代码生成、无字母贴图，实现与 e2e 弹出覆盖到位。interim 判 Risk 的『待 056』理由已消（056 done+接入）；残余仅『淡出 0.8-1.5s 曲线/旋转的逐帧像素视觉』无自动视觉快照/真机截图，非阻塞，故 P3。
- **REQ-AST-02**：粒子引擎与上限裁剪逻辑经确定性单测锁死。残余仅生产态逐帧渲染平滑度无自动像素视觉验证（单测用 stub）。056 已接入，故不再是『待 056』；P3 视觉盲区非阻塞。
- **REQ-AST-03**：尾迹/波纹判定数值经单测钉死；消费侧 Canvas 绘制在 app.js。残余仅渲染平滑度无自动视觉/真机验证（PTR-01 已知后续项）。P3。
- **REQ-AST-06**：贴纸+宝箱+短帧动画素材齐备并 0 缺陷；door/bell/faucet 帧播放已 webkit 像素验证、treasure-chest opening 由 reward-chest 单测覆盖。残余：lamp/horse 帧序列逐帧动态视觉未全部自动化。056 已 done+接入，interim『待 056』理由消，降为 P3。
- **REQ-DESK-01**：较 interim 的 Risk 根因已实质缩小：interim 判 Risk 是因『x86_64 交叉编译产物从未在 2014 MBA/Big Sur 跑过』——现已在 justin.local(Big Sur x86_64)实跑且 task-complete=6，证明伪全屏 WKWebView 在目标 OS/架构上确实起来并能玩。残余仅为『无现场全屏 GUI 目视截图』（QA 只读诊断、未注入
- **REQ-DESK-03**：较 interim 的 Risk 显著收敛：TL 性能验证职责已由 PERFORMANCE.md 落实（Electron 评估 + 原生选型 + 量化预算），且『稳定全屏安全空间』的最大威胁——旧机发热空转(010)——已修复并在真机诊断日志现场确认 ~300× 降频。残余仅为 HD5000 逐帧帧率 / 物理 RSS / Safari14-WebKit 音频解锁的现场目视 P0 未录（WTJ-0

## 合并回归（criterion 2/3，干净隔离 worktree @bf8b284）

- `python3 tests/run_all.py` = **8/8**（tl-unit / kbd-secret-slots / task-reward / appweb-smoke[APPSHELL-06/07/08] / sprite无硬缺陷 / audio-asset 260-0missing-178必选 / audio-runtime / swift-daily-quota 6/6）。
- webkit e2e：door_bell 14/14、press_key_hint 10/10、task_target_visibility 25/25、faucet_water_ratio 6/6、drag_task 2/2（QA 修复过期随机化脆性后）。

## 66-REQ 逐条

| REQ | 状态 | 严重度 | 需求 | 覆盖证据 |
|---|---|---|---|---|
| REQ-DEF-01 | ⚠️Risk | P2 | 线框：默认只保留画布、底部五个发现槽、右侧一个问号、角落任务状态灯和很小的家长入口（默认极简界面）。 | 画布 app/web/index.html:22 (#stage)；单问号 app/web/hud.js:359-366 (单个 .wtj-hud-question button + question-mark-token.png)；角落任务状态灯 app/web/hud.js:627-633 (.wtj-hud-lights / working-statu |
| REQ-DEF-02 | ⚠️Risk | P3 | mock 与需求文本差异声明：PM 裁决（2026-07-04）文字需求为规范源、mock/状态图仅方向示意；列①右侧图 | 声明节点存在 docs/index.html:805-814 (data-req-id=REQ-DEF-02，含①②③④四条差异 + 交叉引用)；交叉锚点 #req-task-01/#req-slot-01/#req-sec-01 各解析(grep=1)；tests/reports/docqc_static_report.json:13-19 DOCQC-0 |
| REQ-KB-01 | ✅Pass |  | 每按一个普通字母，屏幕随机位置弹出这个字母。 | keyboard.js:322-347 handleAlnumKey() 非repeat普通字母键 emit onLetter(rawKey.toUpperCase()); app.js:490-491 订阅后 spawnLetter(ch); app.js:242-243 x/y=rand(area.minX..maxX, minY..maxY) 随机位置 |
| REQ-KB-02 | ⚠️Risk | P3 | 颜色、大小、旋转、位置都可以变化，但必须保证深色背景上高对比可读。 | 变化项全部实现+单测：app.js:212 size=randomLetterSize(letter-motion.js:255 区间[56,148]，单测L149/158/171)、app.js:213 rotFinal=randomRotationRad(区间[-12,12]度，单测L180)、app.js:245 color=pick(PALETTE= |
| REQ-KB-03 | ⚠️Risk | P3 | 出现方式是啪一下弹出，然后约 0.8-1.5 秒逐渐淡出。 | app.js:219-222 life=rand(LETTER_FADE_MS_RANGE)=manifest.js:62 keyboard.letterFadeMsRange[800,1500]；letter-motion.js:443 computeLetterFrame 四阶段：birthPop 90ms scale 0.78→1.08 oversho |
| REQ-KB-04 | ✅Pass |  | 字母建议用 SVG / Canvas / HTML text 动态生成，不为每种颜色准备贴图。 | app.js:880-897 drawLetterGlyph 用 ctx.font=buildLetterFont(size)+ctx.fillStyle=l.color+ctx.strokeText/fillText(l.ch) 运行时 Canvas 文本渲染，颜色/字号/字形全动态生成，无逐字母/逐色贴图资产。run_all sprite-asset-s |
| REQ-KB-05 | ✅Pass |  | 空格、回车可以有轻微波纹或弹跳；Command/Option/Control/Shift 反馈很弱或不计奖励。 | keyboard.js:136-138/164-170 functionKeys.lightFeedback=[Space,Enter] / weakOrNoReward=[Meta,Alt,Control,Shift]；handleFunctionKey:364-376 分类 light/weak/other，功能键永不计 effectiveKeyCoun |
| REQ-KB-06 | ✅Pass |  | 连续乱按功能键，反馈快速衰减到几乎没有。 | keyboard.js:372 decayMultiplier=max(0,1-(sameKeyStreak-1)/FUNCTION_KEY_DECAY_SPAN=4)，intensity=base*decay，约4次后归0。e2e KBD-05(intensities递减)、KBD-08-decay-floor-clamp(6x同功能键→intensity |
| REQ-KB-07 | ✅Pass |  | 长按一个键不持续计数。 | keyboard.js:326-329 handleAlnumKey 与 352-355 handleFunctionKey 均对 e.repeat 直接 return(不更新streak/不计数/不emit)。e2e KBD-02-keyhold-no-count(10个 e.repeat 事件全忽略,count=1)；单测 keyboard-engine |
| REQ-KB-08 | ✅Pass |  | 连续重复同一个键超过 3 次后暂停计数；换键后再切回来可以重新计数。 | keyboard.js:331-341 normalized===lastKeyId 累加 sameKeyStreak，严格 >PAUSE_AFTER_COUNT(=manifest pauseAfterCount 3)才暂停；换键立即重置为1(334-335)。e2e KBD-03-repeat-threshold(6x'c'→counted=3)、KBD |
| REQ-KB-09 | ✅Pass |  | 正常双写不计入连续重复同键的暂停规则，例如连续输入 apple 中的 pp 不会被判定为过度重复。 | keyboard.js:338-341 阈值严格 >3，连续2次(pp)天然落在阈值内正常计数(设计说明第3条,行54-62)。单测 keyboard-engine.test.mjs L327『双写例外：连续2次同键(pp)』断言 letters==['P','P'] 且 count==2；e2e SEC-04-double-letter-apple(typ |
| REQ-SEC-01 | ✅Pass |  | 自由输入：系统监听最近的普通英文字母流，不要求输入框，也不要求回车，不回显字母流。 | app/web/secretword.js:514-534 (onNewLetter 直接消费 WTJ_KEYBOARD.onLetter，buffer 仅内存、getBuffer() 从不写 DOM)；tests/unit/secretword-engine.test.mjs:185 用例0 静态红线断言无 createElement input/text |
| REQ-SEC-02 | ✅Pass |  | 命中判定：输入字母流中出现完整暗语子串即视为命中。 | app/web/secretword.js:490-512 tryMatchAtBufferTail 用 buffer.lastIndexOf(w)==len-w.len 末尾匹配；tests/unit/secretword-engine.test.mjs:220 用例2 XXDOGXX→dog；e2e SEC-02-substring |
| REQ-SEC-03 | ⚠️Risk | P3 | 出现对象：dog 出现小狗、apple 出现苹果，同时播放授权音效或预生成语音。 | sprite: secretword.js:382-416 showSpriteOverlay + resolveSpritePath('assets/'+ 前缀)，tests/unit/secretword-engine.test.mjs:357 用例9 断言 WTJ_HUD.setSlot 收到 assets/ 前缀 spriteUrl；101 spri |
| REQ-SEC-04 | ✅Pass |  | 子串命中：输入流中任意连续子串包含完整暗语即触发，如 xxdogxx 中间含 dog 即命中。 | app/web/secretword.js:498 buffer 末尾匹配 + buffer 保留最近字符实现子串；tests/unit/secretword-engine.test.mjs:220 用例2 XXDOGXX→dog(仅一次)；e2e SEC-02-substring |
| REQ-SEC-05 | ✅Pass |  | 重叠触发：dogg 输入到第三个字母 g 时即触发 dog，无需独立分隔。 | app/web/secretword.js:514-522 每新字母只查一次末尾匹配→重叠但不重复；tests/unit/secretword-engine.test.mjs:249 用例4 DOGG 第3字母G触发、第4字母G不重复触发；e2e SEC-03-overlap-dogg-once |
| REQ-SEC-06 | ✅Pass |  | 双写不惩罚：apple 中的 pp 不打断或误判命中。 | app/web/secretword.js 匹配算法无任何『连续重复字母打断』分支(注释 47-48/113)；tests/unit/secretword-engine.test.mjs:304 用例7 APPLE(含 pp)正常命中 apple；e2e SEC-04-double-letter-apple |
| REQ-SEC-07 | ✅Pass |  | 同词重复命中：同一词同一轮内重复只给小反馈，不再点亮新发现槽；同轮已收集词再次命中同样适用。 | app/web/secretword.js:461-485 handleHit：roundHitSet[word]===true 走 emit(minorHit) 直接 return，不 setSlot/不 sprite/不出声；tests/unit/secretword-engine.test.mjs:316 用例8 dog两次→第1次onHit+setS |
| REQ-SEC-08 | ✅Pass |  | 词池规模：26 字母×约4词，目标约100词，X/Y/Z 可减量。 | app/web/manifest.js pool 100 条(grep word: =100)；tests/unit/secretword-pool-integrity.test.mjs 用例1 长度=100、用例3 无重复、用例4/10 sprite 文件与目录双向一致、用例12 样本词(alligator/umbrella/wagon/fox/yoyo/ |
| REQ-SEC-09 | ✅Pass |  | 大小写等价：DOG、Dog、dog 均判定为命中同一暗语（PM 2026-07-04 裁决）。 | app/web/secretword.js:193-196 normalizeStr(caseInsensitive→toLowerCase)，180 CASE_INSENSITIVE 读 manifest；tests/unit/secretword-engine.test.mjs:235 用例3 DOG/Dog/dog 均命中 + 用例17a caseIn |
| REQ-SEC-10 | ✅Pass |  | 复合输入顺序命中：hotdog 先命中 hot 后命中 dog，各自独立触发（PM 裁决）。 | app/web/secretword.js 不同位置各自触发末尾匹配(注释52-55)；tests/unit/secretword-engine.test.mjs:284 用例6 注入 hot+dog，HOTDOG→hot,dog 各一次 + 用例14 真实 manifest vm 直跑；e2e SEC-06-compound-hotdog + SEC-09 |
| REQ-SEC-11 | ✅Pass |  | 最长词优先：同一时刻多个后缀同时构成命中时取最长词优先触发（PM 裁决）。 | app/web/secretword.js:490-512 tryMatchAtBufferTail 多后缀同时命中时 LONGEST_MATCH_PRIORITY 取 w.length 最大且只触发一个；tests/unit/secretword-engine.test.mjs:267 用例5 car+scar，SCAR→只命中 scar + 用例17b  |
| REQ-SLOT-01 | ⚠️Risk | P3 | 点亮五槽：秘密词命中或键盘探索里程碑点亮五个发现槽之一；当前五格内不重复；同一词重复命中只给小反馈、不占新格（见 REQ | app/web/slots.js:300-334 fillSlot（isKnownSource 分支支持 secret-word/keyboard-milestone 两来源；findDuplicateIndex L202-210 同 source+itemKey 去重返回 duplicate:true 不占新槽）；SLOT_COUNT 从 manifest |
| REQ-SLOT-02 | ✅Pass |  | 开宝箱：五格全部点亮后触发宝箱开启（一次性大奖励，表现见 REQ-RWD-01），随后清空五槽、进入下一轮。 | app/web/slots.js:327-331 满槽当次 emit onFull 恰好一次(everFullEmittedForCurrentRound 守卫)，满后保持点亮不自动清；L344-348 reset()=clearSlots()+通知 009 resetRound/008 resetEffectiveKeyCount 开新一轮。tests/u |
| REQ-SLOT-03 | ✅Pass |  | 发现槽来源不只服务秘密词，也可被自由探索里程碑点亮（例如累计 100、200 次有效按键），使孩子未拼出单词也能获得小目 | manifest.js:110 effectiveKeyMilestones:[100,200]（单一事实来源，slots.js 注释 L90-92 明确不重复定义）；app/web/keyboard.js:76-83 达阈值触发 onMilestone 并委托 fillSlot('keyboard-milestone',{itemKey:阈值,render |
| REQ-SLOT-04 | ✅Pass |  | 建议把秘密词命中显示为对应对象图标，键盘里程碑显示为「键盘星星」这类抽象图标；当前一轮内同类发现不重复。 | app/web/hud.js:412-430 renderSlot：renderState.milestone===true → 渲染 img.wtj-hud-slot-milestone-sprite src=manifest.slots.milestoneStickerSprite（CSS ★ 仅在 manifest 缺字段时兜底 L427-430）；s |
| REQ-TASK-01 | ⚠️Risk | P3 | 默认右侧只保留一个低调的问号，不再放 3-4 个图标按钮。 | app/web/hud.js:358-383 buildQuestion() 只构建单个 <button.wtj-hud-question>+question-mark-token.png；root.appendChild(buildQuestion()) 仅在 hud.js:739 调用一次，全文无任何图标列/多按钮渲染代码；红线注释 hud.js:13。 |
| REQ-TASK-02 | ✅Pass |  | 点问号后播放语音任务，不显示中文任务文字。 | task.js:324 startTask() 走 WTJ_AUDIO.playTaskVoice；task.js 全文零 DOM 创建 API（tests/unit/task-lifecycle.test.mjs:223-229 §0 静态源码扫描断言无 innerHTML/textContent/createElement/appendChild）。ta |
| REQ-TASK-03 | ✅Pass |  | 15 秒未完成：轻提示一次。 | app/web/task.js:326-329 hintTimerId=setTimeout(emit phase 'hint', LIGHT_HINT_SEC*1000)，LIGHT_HINT_SEC 取自 manifest.tasks.timing.lightHintSec=15。tests/unit/task-lifecycle.test.mjs:28 |
| REQ-TASK-04 | ✅Pass |  | 30 秒未完成：目标变明显，比如闪一下或稍微放大。 | app/web/task.js:331-334 emphasizeTimerId=setTimeout(emit phase 'emphasize', EMPHASIZE_SEC*1000=30000)。tests/unit/task-lifecycle.test.mjs:302-314 §4 断言 t=30000ms emit、序列恰为 ['hint',' |
| REQ-TASK-05 | ✅Pass |  | 45-60 秒仍未完成：任务自动收起，不算失败。 | app/web/task.js:336-339 autoDismissTimerId=setTimeout(dismiss('timeout'), randomAutoDismissMs())，randomAutoDismissMs (task.js:263-274) 产出 [45,60)s。dismiss() (task.js:344-358) paylo |
| REQ-TASK-06 | ✅Pass |  | 孩子明显转去玩键盘（连续 20 个有效键）任务自动淡出（不算失败）。 | app/web/task.js:387-395 handleEffectiveKey()：ACTIVE 期间每有效键 effectiveKeysSinceStart+1，>=KEYBOARD_DISTRACTION_KEY_COUNT(=20) 时 dismiss('keyboard-distraction')；常驻订阅 task.js:397-405 靠  |
| REQ-TASK-07 | ✅Pass |  | 拖拽：把苹果放进篮子/狗狗带回家/星星拖到天空。 | app/web/task-templates.js:1392 renderDragTask()：物体 draggable+dropTargetIds、目标 accepts:['drag'] 的 onDrop(1415)→handleTemplateComplete→WTJ_TASK.completeTask (1354-1379)；拖错弹回 handleDr |
| REQ-TASK-08 | ✅Pass |  | 点击：点一下开灯/关水龙头/按铃铛/开门/让小马跑起来。 | app/web/task-templates.js:1530 renderClickTask()：accepts:['click'] onClick(1551)→completeTask；idle/active 帧动效 PROP_ANIM_STATE_MAP（horse idle→run、door closed→opening、bell idle→ring、 |
| REQ-TASK-09 | ✅Pass |  | 寻找：语音说找到小狗，鼠标悬停 1 秒或点一下算完成。 | app/web/task-templates.js:1590 renderFindTask()：目标 accepts:['hover','click']，onHover 与 onClick 共享同一 onFoundIt 完成回调（1623-1624，pressOrHoverAlsoCompletes）；悬停满 findHoverSec=1s 判定在 012/ |
| REQ-TASK-10 | ✅Pass |  | 按键：只要求一个键且仅限字母/数字，如 Press A / Press 3，不做复杂组合键。 | app/web/task-templates.js:1985 setupPressTask()+handlePressKey(2023-2039) 按 targetKey.toUpperCase() 比对单键完成。manifest.js:853+ press.examples 全部为单个字母/数字 targetKey（A/3/B/S/M/5/7 + C-V  |
| REQ-EXIT-01 | ⚠️Risk | P2 | App 内部拦截 Command+H / Command+W / Command+Q 等常见快捷键，防止孩子误触退出。 | app/shell/main.swift:781-798 handleKeyDown：Cmd+Q(kiosk)进 handleCmdQKeyDown 状态机 return nil；Cmd+W/H/M/` 两模式均 return nil 吞键；配合 setupMenu 空主菜单去掉默认 keyEquivalent（约 line 705）。无任何 CI/自动断言 |
| REQ-EXIT-02 | ✅Pass |  | Esc 键不直接触发退出。 | app/shell/main.swift:757-780：keyCode==53 一律进入 handleEscKeyDown 长按状态机并 return nil，短按/单击只推进或复位计时；全文仅 2 处 NSApp.terminate（line 700 窗口调试菜单项，受 kIsWindowedMode 门；line 905 口令校验通过后），bare E |
| REQ-EXIT-03 | ⚠️Risk | P2 | 家长退出需长按 Esc ≥5 秒，触发口令输入；口令正确后才能退出全屏安全空间。 | app/shell/main.swift:39 kEscHoldSeconds=5.0；handleEscKeyDown(840-850)/checkEscProgress(860-874) elapsed>=5 → showExitPasswordPrompt(885-913)：NSSecureTextField 输入，仅当 response==确定 且  |
| REQ-EXIT-04 | ✅Pass |  | 孩子侧不存在主动退出入口；任务超时自动收起（REQ-TASK-05）与转移键盘触发的任务淡出（REQ-TASK-06）均 | web 层无任何退出/quit UI（grep app/web/index.html+app.js 仅得 exit.escHoldSec 配置，无按钮）；原生退出与任务系统解耦（main.swift:834-838 注释+结构：仅 2 处 terminate 均为家长闸门）；tests/unit/task-lifecycle.test.mjs:339-357 |
| REQ-PTR-01 | ⚠️Risk | P3 | 移动：很淡的光点尾迹，快速移动时稍明显；连续乱晃约3秒后尾迹变弱、停一下再恢复；大反馈：经过有效对象可让对象轻微躲开/旋 | 引擎 app/web/pointer.js:335-365 updateTrailIntensity（速度映射 TRAIL_MIN_BASE 0.28→TRAIL_MAX_BASE 0.55、IDLE_DECAY_MS=3000 衰减坡道、PAUSE_RESET_MS 停顿重算）。单测 tests/unit/pointer-engine.test.mjs:2 |
| REQ-PTR-02 | ✅Pass |  | 点击：第一下有小星点/短音效/小印章；连续狂点反馈越来越弱、太快时不给声音；大反馈：点中任务目标/宝箱/有效对象才有明显 | 引擎 app/web/pointer.js:379-395 computeClickIntensity（第一下满值；streak 衰减 1-(streak-1)/5；soundless 独立阈值 SOUNDLESS_GAP_MS=180）+ :715-743 onClickEvent 输出{intensity,soundless,targetId}。单测 t |
| REQ-PTR-03 | ✅Pass |  | 拖拽：只有可拖对象进入强反馈、对象弹性跟随；拖错不惩罚只轻轻弹回；大反馈：拖到正确目标后出现成功动画和任务计数。 | 引擎 app/web/pointer.js:613-654 onMouseDown（仅 draggable 命中进入 + WTJ-080 preventDefault:638 阻原生 HTML5 拖拽卡死）、:579-588 updateDragFollow（弹簧-阻尼弹性跟随）、:656-689 onMouseUp（命中→drop；未命中→dropCanc |
| REQ-RWD-01 | ⚠️Risk | P3 | 宝箱奖励以一次性表现为主，不长期占用屏幕空间；可用烟花、大贴纸弹出后淡出、短动画、临时背景变化、新音效等形式。 | app/web/reward-chest.js:670 TOTAL_SEQUENCE_MS=2600 → finishSequence():697 调 clearFireworksCanvas()+clearOverlayChildren()（一次性清屏，叠层子元素整体移除）；runSequence():730 一次序列内落地 IMPLEMENTED_FOR |
| REQ-RWD-02 | ✅Pass |  | 宝箱开启后清空五槽，进入下一轮（见 REQ-SLOT-02）。 | app/web/reward-chest.js:697 finishSequence()→callSlotsResetDefensive():319 防御式调用 window.WTJ_SLOTS.reset()（订阅 slots.js onFull，010 满槽后在 reset 前不再 emit,见注释:763）。tests/unit/reward-ches |
| REQ-RWD-03 | ✅Pass |  | 烟花建议用 Canvas / SVG 代码生成，预设『满天星、打铁花、圆形、星形』等类型；颜色从少量高质量色板出发做 H | app/web/reward-fireworks.js:8 只用 document.createElement('canvas')+2D API（doc 已否决 SVG/DOM 逐粒子）；STYLE_PARAMS:345 三形态 molten-fountain(打铁花上扬扇形)/starburst(星形)/round-bloom(圆形)；COLOR_TABL |
| REQ-RWD-04 | ✅Pass |  | 小任务奖励不与底部五槽混用；角落放一排很小的工作状态灯，完成一个任务点亮一个。 | app/web/hud.js:626 buildStatusLights() 建独立 .wtj-hud-lights 容器（working-status-light.png，data-light-index），与五槽 .wtj-hud-slot 是两套 DOM；hud.css:725 .wtj-hud-lights position:fixed left:1 |
| REQ-RWD-05 | ✅Pass |  | 连续完成 3 个任务，触发『今日工作完成』奖励。 | app/web/status-rewards.js:679 handleTaskComplete()→streak++（:692），streak>=getStreakThreshold()(:142,manifest.rewards.statusLights.streakThreshold 默认3) 调 triggerWorkComplete():653。t |
| REQ-RWD-06 | ✅Pass |  | 『今日工作完成』奖励表现可为三灯一起闪 / 工作台盖章 / 小火箭发射 / 宝箱小开一次；风格接近爸爸工作界面的状态灯， | app/web/status-rewards.js:160 IMPLEMENTED_FORMS=['lights-flash-together','desk-stamp']；flashLightsSequence():404 反复 setAllLightsDefensive(on/off) 实现三灯连闪；showRewardOverlay():442 渲染  |
| REQ-AST-01 | ⚠️Risk | P3 | 字母弹出、颜色、大小、旋转和淡出（代码生成，优先 Canvas 2D，非图片素材）。 | app/web/app.js:209 spawnLetter()（rot=rand rotFinal、size=rand、color 选亮色板、life=rand(LETTER_FADE_MS_RANGE)）+ app.js:88 淡出 opacity=1-age/life + app.js:893/897 ctx.fillText 动态渲染；运动参数外置  |
| REQ-AST-02 | ⚠️Risk | P3 | 烟花粒子和部分 UI 动效（代码生成，优先 Canvas 2D）。 | app/web/reward-chest.js + reward-fireworks.js（Canvas rAF 粒子引擎、四预设满天星/打铁花/圆/星、getMaxParticles 上限、HSL 微调、无 shadowBlur）；单测 tests/unit/reward-chest.test.mjs L434『四预设全触发·粒子≤300·确定性顶满』，r |
| REQ-AST-03 | ⚠️Risk | P3 | 鼠标尾迹、点击波纹、轻量过渡（代码生成，优先 Canvas 2D）。 | app/web/pointer.js（尾迹强度算法 idleDecayApproxSec=3、onMove/onClickFeedback、拖拽状态机，纯事件层）+ app/web/app.js:769-773 ripple life/衰减、trail dot 绘制；单测 tests/unit/pointer-engine.test.mjs（尾迹 3s 衰减 |
| REQ-AST-04 | ✅Pass |  | 秘密词对应物体 PNG（图片 / Sprite）。 | tests/reports/sprite_asset_scan.json：total 140 PNG / 0 defects / 0 warnings（全 RGBA、有透明背景、非空、内容不触边）；app/web/assets/sprites/ 实存 102 项；run_all sprite-asset-scan PASS『无硬缺陷』。task-reward |
| REQ-AST-05 | ✅Pass |  | 任务物件、动物、篮子、狗窝、灯、水龙头（图片 / Sprite）。 | app/web/assets/task-props/ 实存 8 道具 apple/basket/bell/doghouse/door/faucet/horse/lamp + PROVENANCE.md；sprite_asset_scan 0 缺陷。webkit e2e task_target_visibility 25/25（47 props 视口安全边界、 |
| REQ-AST-06 | ⚠️Risk | P3 | 宝箱、贴纸、必要的短帧动画（图片 / Sprite）。 | app/web/assets/sprites/treasure-chest.png + assets/rewards/（star-sticker/sparkle-burst/completion-stamp-v3.png）+ assets/anim/（bell/door/faucet/horse/lamp/treasure-chest 分帧 sheet，sp |
| REQ-AST-07 | ✅Pass |  | 不使用 Chrome 自带发音作为产品声音（声音 / TTS）。 | grep 全 app/web/ 确认代码零 speechSynthesis/SpeechSynthesisUtterance（仅 audio.js:8 红线注释与 AUDIO-API.md 说明）；产品语音走 Web Audio decodeAudioData（app/web/audio.js:290 decodeAudioDataCompat）。音频已交付 |
| REQ-AST-08 | ✅Pass |  | 固定短句预生成；组合任务运行时生成后缓存（声音 / TTS）。 | app/web/audio.js playComposite()（时间轴排程、依次不重叠）+ LRU 缓存（MAX_CACHE_ENTRIES=64、cacheGet/cachePut audio.js:307-325、setMaxCacheEntries）；app/web/audio/phrases/ 实存 11 固定短句 m4a（click/find/p |
| REQ-AST-09 | ✅Pass |  | 动物叫声、铃铛、水声、开箱声使用授权素材（声音 / SFX）。 | app/web/audio.js:66 DEFAULT_SFX_MAP 覆盖 animal（dog/cat/duck/horse/pig/frog/elephant/mouse）/bell（bell-ring/bell-jingle）/water（tap-flow/drop/splash）/chest（chest-open/chest-lid-creak）； |
| REQ-AST-10 | ✅Pass |  | core-states：核心状态图已验收，4 张状态图已集成于 #state-assets 章（素材集成点，卡 005） | app/web/assets/states/ 实存 4 图 default-canvas/secret-word-dog/question-task-drag/treasure-reward.png；docs/index.html:849 #state-assets 章 <img> 集成引用到位。 |
| REQ-AST-11 | ✅Pass |  | style-baseline：视觉风格基线已验收，风格基准图已集成于本章上方（素材集成点，卡 006）。 | docs/assets/style/visual-style-tile.png 实存（513KB）；docs/index.html:1102 <img> 集成于素材章顶部。 |
| REQ-AST-12 | ✅Pass |  | sprites-batch1：sprite 生产基准 v3 已验收（commit 8cc540f），已集成于本章基准展示 | docs/assets/sprites/production-sprite-contact-sheet.png 实存；docs/index.html:1106 #sprite-contact-sheet 展示卡集成 8 个 v3 基准 sprite（dog/cat/apple/ball/star/car/basket/treasure-chest）；chan |
| REQ-DESK-01 | ⚠️Risk | P3 | 目标机器为 2014 款 MacBook Air，应用以 macOS 桌面全屏方式运行。 | app/shell/main.swift:1272-1294 kiosk 分支：frame=NSScreen.main?.frame、KioskWindow styleMask=.borderless、level=.mainMenu+1、collectionBehavior=[.canJoinAllSpaces,.stationary]、isOpaque/b |
| REQ-DESK-02 | ✅Pass |  | 应用需能打包成可安装/启动形式，例如 DMG 或等价分发方式。 | app/build.sh 全链：:67-75 swiftc x86_64+arm64 双 slice→lipo -create universal；:114 codesign --force --deep；:116-118 hdiutil create -format UDZO 生成 DMG；构建后硬门禁 :128-132 lipo -archs 断言两 s |
| REQ-DESK-03 | ⚠️Risk | P3 | Electron 是否可接受需要 TL 做性能验证；也可评估更轻的原生方案。需求层只要求孩子能进入一个稳定全屏安全空间。 | app/PERFORMANCE.md §4 Swift/AppKit/WKWebView vs Electron 选型（选原生轻量方案）、§3 2014 MBA 性能预算量化表（粒子≤300/禁 shadowBlur/idleStopSec:5/dpr/AudioBuffer LRU64/HD5000 帧率红线+降级策略）、§1 构建机不可线性外推目标机、§ |
| REQ-DESK-04 | ✅Pass |  | Command+Space / Command+Tab 等 macOS 系统级快捷键，普通应用未必能 100% 禁掉。 | 这是诚实边界式需求（陈述限制，非要求屏蔽）。app/SECURITY.md §2『拦不住什么（诚实边界，REQ-DESK-04/05）』:113-131 明列 Cmd+Space/Cmd+Tab/Cmd+Option+Esc 普通 app 拦不住的固有边界；main.swift:1367-1381 setupKioskPresentation 注释明示 pr |
| REQ-DESK-05 | ✅Pass |  | 如需更强控制，需要系统设置、辅助功能权限或家长控制配合，不能在产品需求里虚假承诺。 | app/SECURITY.md §2/§2.1 best-effort 边界与『干扰非逃逸』说明 :136-152；§3『家长可以做的补强』:157-173 列屏幕使用时间内容限制、受限账号+开机自启、辅助功能权限+CGEventTap 更强拦截；main.swift:1373-1377/1395-1399 注释明示需辅助功能授权才能真正兜住系统级键、未授权 |
