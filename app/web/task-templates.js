// WTJ-20260704-014 — 四类任务模板：拖拽 / 点击 / 寻找 / 按键（window.WTJ_TASK_TEMPLATES）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求（不 fetch 任何东西，不访问任何
// 外部 URL）、非 module（无 import/export），以普通 <script src="task-templates.js"> 标签
// 加载，需排在 task.js / pointer.js / keyboard.js 之后（本文件订阅它们暴露的 API），app.js
// 之后亦可。
//
// -----------------------------------------------------------------------
// 职责边界（本卡 014，消费 013 任务框架 + 012 指针引擎，落地 REQ-TASK-07~10 四类具体任务）
// -----------------------------------------------------------------------
// 013（task.js）只负责问号任务的生命周期状态机（IDLE/ACTIVE、15s/30s/45-60s 时序、键盘转移
// 淡出），明确不渲染任何具体任务视觉、不判定任何具体任务是否"完成"。012（pointer.js）只负责
// 指针输入的判定与事件层（尾迹/点击强度、拖拽状态机、可交互目标注册），明确不画任何东西、
// 不判定任何具体任务是否"完成"。本文件是两者之上唯一负责"四类任务长什么样、怎么判定完成"的
// 一层：订阅 WTJ_TASK.onQuestionClicked 生成具体任务实例并 startTask，按类型渲染 DOM 叠层，
// 用 WTJ_POINTER.registerTarget 接入拖拽/点击/悬停判定，判定完成后调用 WTJ_TASK.completeTask
// 并防御式点亮一个 WTJ_HUD 状态灯（REQ-RWD-04 的最小落地，完整三灯连续奖励逻辑留给 015）。
//
// 与 013 的红线不同：013 全文不触碰 document.*（REQ-TASK-02 的结构性保证是"框架层不创建任何
// DOM"）；本文件明确需要创建任务目标的 DOM 叠层（拖拽物体/放置目标/点击目标/寻找目标与干扰
// 项），这是 013 文件头「本卡边界」一节明确交给 014 的工作："长什么样（呼吸光晕/闪烁/放大等）
// 完全由 014 决定并自行创建 DOM"。REQ-TASK-02"不显示中文任务文字"在本文件的落地方式是：全文
// 不出现任何 textContent/innerHTML 赋值中文文案（本文件根本不通过任何 DOM 节点渲染文字，四类
// 任务的提示手段是语音 voicePrompt 播放 + 纯视觉 sprite 叠层，按键任务甚至不渲染任何 DOM，
// 完全依赖语音提示 + 键盘匹配判定，见下方「四、按键任务」一节）。
//
// -----------------------------------------------------------------------
// 四类任务完成判定（REQ-TASK-07~10）
// -----------------------------------------------------------------------
// 一、拖拽（REQ-TASK-07）：渲染 objectSprite（可拖）+ targetSprite（放置目标），用
//     WTJ_POINTER.registerTarget 把物体注册为 draggable:true 且 dropTargetIds 指向目标 id，
//     目标注册为 accepts:['drag']；目标的 config.onDrop 回调触发即代表这次拖放命中了正确的
//     目标（dropTargetIds 白名单已经在 012 侧过滤掉了"拖错地方"的情况，本文件的 onDrop 回调
//     不需要再自己比对 id），据此判定任务完成。此外本文件订阅 WTJ_POINTER.onDragMove/onDrop
//     两个全局事件（POINTER-API.md「9. 各消费卡怎么用」表格明确分派给 014）渲染拖拽跟随视觉：
//     onDragMove 把 payload.followX/followY 写回被拖元素的 style.left/top（跟随，REQ-PTR-03），
//     onDrop 的 dropCancel 分支把元素复位到渲染时的初始位置（拖错弹回）。见下方 handleDragMove()/
//     handleDragDropGlobal() 一节。
// 二、点击（REQ-TASK-08）：渲染 targetSprite（可点），registerTarget 注册 accepts:['click']；
//     config.onClick 回调触发时，若任务定义了 targetSpriteActive 则把该元素的图片切到激活态
//     （灯亮/门开等），并把 data-anim-state 从 idle 切到 active（见下方「动画状态接口预留」），
//     随即判定任务完成。
// 三、寻找（REQ-TASK-09）：渲染 targetSprite（可能混在 distractorSprites 干扰物中，干扰物不
//     注册 pointer target，纯视觉存在，不参与任何命中判定），目标注册 accepts:['hover','click']；
//     config.onHover（012 侧已经实现"停满 findHoverSec 秒才触发一次"的判定，本文件不需要自己
//     再计时）与 config.onClick 都指向同一个完成回调——"悬停 1 秒或点一下均算完成"
//     （pressOrHoverAlsoCompletes）在本文件的落地方式就是让这两个 target 回调共享同一个完成
//     函数，不是两套独立判定逻辑。
// 四、按键（REQ-TASK-10）：不渲染任何 DOM（纯语音 + 键盘判定，见文件头"长什么样"一节）。加载
//     时注册常驻的 WTJ_KEYBOARD.onLetter/onSymbol/onFunctionKey 三路处理函数（三者都与 013 对
//     WTJ_KEYBOARD.onEffectiveKey 的处理同一个模式——只支持追加订阅、不支持退订，因此本文件也
//     采用"常驻处理函数 + 内部状态判断当前是否有进行中的按键任务"这种等价退订写法，见 013
//     文件头「键盘转移淡出的实现机制」一节的同款设计说明）：当前若存在一个 type==='press' 的
//     进行中任务，比较传入的键身份字符串与 taskDef.targetKey（统一转大写比较，兼容 manifest 里
//     'A'/'3' 这类已是大写/数字的写法，也兼容符号/'Space'/'Enter'/'ArrowUp' 等写法）是否相等，
//     相等则判定任务完成。WTJ-20260706-010 前 targetKey 只能是字母/数字（onLetter 是唯一接线的
//     判定通道），symbol（如 ','）/'Space'/'Enter'/方向键作为 targetKey 永远无法完成——010 卡
//     补齐 onSymbol/onFunctionKey 两路订阅（见下方 handlePressKey()/wireSymbol()/
//     wireFunctionKey() 的详细说明），三路统一收敛到同一个 handlePressKey() 判定+完成入口。
//
// -----------------------------------------------------------------------
// 任务生成：问号点击 → 洗牌袋（shuffle bag）真随机挑一个任务模板类型 + 具体示例
// （REQ-TASK-01/02 入口，013 接线点；WTJ-20260706-002 part1）
// -----------------------------------------------------------------------
// 014 首次交付时"随机"选择刻意不依赖 Math.random()，改用一个从 0 开始的递增计数器
// questionClickCounter 取模轮转 TASK_TYPES/examples（详见下方「历史记录」小节，保留供追溯）。
// Ethan 开发机验收反馈：这种轮转"太可预测/太重复"，孩子很快就能猜到下一次问号出现什么任务，
// 产品体验上不可接受。002 卡起改成洗牌袋（shuffle bag）真随机调度，设计如下：
//
//   1. 可注入 RNG（taskRandom，见下方"可注入随机数生成器"一节的 _setRandom()）：生产默认走
//      真实 Math.random()（Ethan 要的是真随机，不是确定性轮转）；测试可以把 taskRandom 整体
//      替换成确定性 RNG（如 mulberry32/LCG 或固定序列桩），从而精确断言/复现洗牌袋的抽取序列，
//      不需要真的依赖不可控的 Math.random 输出。Math.random 本身在本代码库从来不是禁用项
//      （app.js randomLetterSize()/randomRotationRad()/随机取元素、pointer-trail.js 都在用），
//      014 当初避开它单纯是为了"测试确定性"这一个理由——这条理由现在被"可注入 RNG"结构性满足，
//      不再需要靠"完全放弃随机性"去换取。
//   2. type 洗牌袋（drawTaskType()）：维护一个 TASK_TYPES 的洗牌袋，袋空时用 Fisher-Yates
//      （fisherYatesShuffle()，基于 taskRandom）重新装满并打乱，之后无放回逐个抽取——保证
//      "四个类型各出现一次后才可能重复"，不再是死板的固定顺序轮转，但仍然结构性避免"连续好几次
//      同一类型"这种真随机偶尔会出现、体验上很差的极端情况。
//   3. example 洗牌袋（drawExampleIndex()）：每个 type 各自维护一个 example 下标的洗牌袋，
//      逻辑与 type 洗牌袋相同（无放回、袋空重洗）。这就是 P1-1（Fable 对抗评审，原文见下方
//      「历史记录」小节）"该类型下每个 example 都必须可达、不能有永不可达的下标"这条硬要求
//      现在的满足方式：不再依赖"计数器取模的奇偶是否与 examples.length 互质"这种容易踩坑的
//      数论巧合，而是结构性保证——无放回抽取，数学上不可能在一整袋内漏掉任何一个候选（drag 的
//      dog-home、press 的 letter-a 这些当年因为奇偶巧合永不可达的 example，现在必然会在每一轮
//      examples.length 次抽取内出现一次）。example 袋按**当前** getExamplesForType(type).length
//      构建，这个长度变化时（如 manifest 热更新）会自动重建，不尝试续用语义已经不对的旧下标。
//   4. 跨袋边界避免相邻重复：无论是 type 袋还是 example 袋，重新装袋后如果袋首（下一次将被抽到
//      的值）恰好等于上一次抽到的值，就把袋首与袋内另一个随机位置交换——避免"上一袋最后一个"和
//      "下一袋第一个"连续抽到同一个候选，产生视觉上的"连续两次一样"。
//
// questionClickCounter 变量仍然保留，但职责收窄为纯粹驱动布局位置轮转（presetAt()，见下方
// 「递增计数器」一节），不再参与 type/example 的选择——两件事在设计意图上从来就不同：布局位置
// 只需要"不要连续挤在同一屏幕位置"（固定轮转就够），任务类型/示例需要"不可预测"（洗牌袋更合适）。
//
// 测试：tests/unit/task-templates.test.mjs 用 _setRandom() 注入确定性 RNG 复现/断言洗牌袋的
// 抽取序列，断言契约属性（一个完整周期内每个候选恰好出现一次、跨周期边界不相邻重复、同一 RNG
// 种子两次注入产生一致序列），而不是像旧版那样断言"第 N 次点击必然是某个具体 type/example"这种
// 绑定在确定性计数器实现细节上的脆弱断言。
//
// -----------------------------------------------------------------------
// 历史记录（014 首次交付 + P1-1 对抗评审的旧设计，002 卡已废弃，保留供追溯"为什么当初这么做"）
// -----------------------------------------------------------------------
// 014 首次交付的原始设计：type = questionClickCounter % TASK_TYPES.length（四个类型间固定顺序
// 轮转）。轮转不是"真随机"，但满足"每次点问号出现不同任务"的产品意图，且是完全确定性的，对
// 单元测试更友好（不需要 mock Math.random 就能精确断言第 N 次点击出现的任务类型），与 013/012
// 里"手动指定占位常量、注明不是文档给出的精确随机分布"是同一种工程取舍。
//
// P1-1（Fable 对抗评审）：该类型下具体 example 的选择**不能**复用同一个 questionClickCounter
// 对 TASK_TYPES.length 取模的结果再去对 examples.length 取模——TASK_TYPES.length 固定为 4，
// 当时与 drag/press 两个类型的 examples.length（均为 2）同奇偶，会导致"同一类型每次轮到时，
// questionClickCounter % examples.length 的余数恒定不变"（比如 drag 恒在 counter=0,4,8,...
// 被轮到，这些数 % 2 恒为 0），于是 drag 恒选中 examples[0]="apple-basket"（"狗回家"
// dog-home=examples[1] 永不可达）、press 恒选中 examples[1]="digit-3"（letter-a=examples[0]
// 永不可达），直接违反验收标准"孩子应该能见到‘把狗狗带回家’"。当时的修法：example 的选择改用
// "这个类型第几次被轮到"（questionClickCounter 整除 TASK_TYPES.length 的商，typeRotationIndex）
// 再对 examples.length 取模，与 type 的选择（同一个 counter 取余数）解耦成两个独立递增的轮转
// 序列。002 卡的洗牌袋方案继承了这条修法背后的产品要求（每个 example 都必须可达），换了一种
// 结构性更强、不依赖数论巧合的实现方式（见上方新设计说明）。
//
// -----------------------------------------------------------------------
// animation state 接口预留（硬要求，见卡片原文；faucet/horse/door/bell/lamp 五个道具）
// -----------------------------------------------------------------------
// DESIGN 当前只交付了这五个道具各自的单张静态 PNG（无分帧/分态/骨骼动画素材）。本文件给渲染出
// 的道具 DOM 元素统一打上 data-anim-state="idle"（初始）/ data-anim-state="active"（任务判定
// 完成后切换）属性，作为**预留的动画状态接口**：当前只用 task-templates.css 里一小段 CSS
// transition/filter 做占位视觉（轻微放大 + 发光过渡），绝不把这当作最终动效。真实的开合/奔跑/
// 摇铃/流水/点亮动效由后续动效卡接管（门→026、马→028、水龙头→030、铃铛→031、灯→032，卡号
// 引自 TL 架构指令原文），接手时只需要在同一个 data-anim-state 属性上挂真正的动效实现，不需要
// 改动本文件的任务判定逻辑。详见 app/web/assets/task-props/PROVENANCE.md「animation state
// 接口预留」一节。
//
// 上面这段是 014 首次交付时的记录，**056 卡起，faucet/horse/lamp 三个道具的"真正的动效实现"
// 已经接上**；**WTJ-20260705-025 起 door/bell 的 v1 动画（卡 -030/-031 已 DESIGN 验收 done）
// 也已从 v1_boundary.deferred_to_v2 移入 included 并接入引擎**，五个预留道具至此全部走真实分帧
// 动画（见下方「五、动效引擎接入」一节），data-anim-state 属性本身的读写时机完全不变
// （创建时 idle，onClick 命中后切 active），只是 idle→active 现在真的驱动了一段
// WTJ_FRAME_ANIM 播放的分帧动画，而不再只是一段 CSS transition。
//
// -----------------------------------------------------------------------
// 五、动效引擎接入（WTJ-20260704-056，三路技术评审定案：Canvas 逐帧 + 可注入时钟 + 构建期
// 降采样，方案与实现细节见 app/web/frame-anim.js 与 app/web/anim/FRAME-ANIM-API.md）
// -----------------------------------------------------------------------
// 本卡改动范围只有 createPropEl()（把动效道具的承载元素从 <img> 换成 <canvas>，非动效道具
// 与引擎缺失时的回退路径仍然是 <img>）与 renderClickTask()（onClick 命中时从"切换
// targetSpriteActive 静态贴图"改为"WTJ_FRAME_ANIM.play() 播放 activeState"）+
// handleTemplateComplete()/scheduleElementsRemoval() 的 COMPLETE_VISUAL_HOLD 耦合修正。
// 拖拽/寻找两类任务的道具渲染路径不变（它们目前的 manifest 示例都不引用 faucet/horse/lamp
// 三个已接入引擎的 prop，仍然全程走静态 img；若未来某个 drag/find 示例的 sprite 文件名恰好
// 命中这三者，createPropEl() 会通用地按 idle 态播放循环动效，设计上是通用的，不是只服务
// click 任务类型）。
//
// **per-prop idle/active 映射表**（PROP_ANIM_STATE_MAP，二值 idle/active → anim-manifest.js
// 里的具体 state 名）：
//
//   | prop   | idle（常驻/静息） | active（onClick 命中后播放）        | 选择理由 |
//   |--------|-------------------|--------------------------------------|----------|
//   | faucet | 'off'（水龙头关，单帧静止）      | 'running'（源数据 loop:true，播放时用 opts.loop:false 强制单轮播完 clamp 在最后一帧，见下） | 计入 v1_boundary，off 天然是"没人碰"的静息态；running 是唯一有"水在流"视觉意图的 state |
//   | horse  | 'idle'（源数据 loop:true，马原地小动作）  | 'run'（源数据 loop:true，播放时用 opts.loop:false 强制单轮播完 clamp 在最后一帧，与 faucet 的 running 完全同构，见下） | REQ-TASK-08"点一下小马跑起来"要求 onClick 命中后**实际播放奔跑动效**；'run' 正是 anim-manifest.js 里 idle/run/stop_success 三态之一，资源可解析。faucet 已是先例：faucet.active='running' 同为 loop:true 源数据，靠 renderClickTask 传入的 {loop:false} 覆盖成"播一轮定格"，horse 'run' 走的是同一条通用路径，不是新逻辑。**不实现 run→stop_success 链**：068 的 run-sheet 正在返工、资产仍在流动中，run-only 已满足 072 验收 criterion 3（断言 click 后首先播放 run）且与 faucet 保持一致；链式收尾留作 068 定稿后的未来增强评估项，非本卡范围（PM 打回 072：旧版 active=stop_success 会让"点一下跑起来"不成立、也让 068 run-sheet 在运行态看不到，故本卡改回 run，替换掉上一轮"run 无自然终帧"的论证） |
//   | lamp   | 'off'（灯灭，单帧静止）          | 'turning-on'（源数据 loop:false，一次性点亮过程）                    | 与卡片原文"lamp active→turning-on"完全一致 |
//   | door   | 'closed'（门关，单帧静止）        | 'opening'（5 帧，源数据 loop:false，一次性开门过程，播完定格在开门末帧）  | WTJ-20260705-025：click-door-open 点门开门；'opening' 是 anim-manifest.js closed/opening/open 三态里唯一有"开门过程"视觉意图的 state（'open' 是开完的单帧静止终态，不用作 active 过程） |
//   | bell   | 'idle'（铃静止，单帧）            | 'ring'（6 帧，源数据 loop:true，onClick 传 {loop:false} 播一轮定格，与 faucet.running 同构） | WTJ-20260705-025：click-doorbell-ring 点铃摇铃；'ring' 是 idle/ring/settle 三态里唯一有"摇铃发声"视觉意图的 state（'settle' 是摇完的阻尼收尾，链式收尾留作未来增强，非本卡范围，与 faucet 不接 closing 收尾同理） |
//
// door/bell 由 WTJ-20260705-025 加入本表（v1 动画卡 -030 门 / -031 铃均已 DESIGN 验收 done，
// 从 v1_boundary.deferred_to_v2 移入 included）。此前它们**有意不在表里**、resolvePropAnimInfo()
// 恒返回 null 回退静态 <img>，那是当时 deferred_to_v2 在本文件的落地方式；现素材验收通过、已降采
// 进 anim-manifest.js，故登记映射改走真实分帧动画。FRAME-ANIM-API.md 第 7 节已同步更新。
//
// **onClick 播放 activeState 时统一传 { loop:false, onComplete }**：即使某个 state 的源数据
// 本身 loop:true（如 faucet 的 running），onClick 场景下也要求它"播完一轮后 clamp 定住"而
// 不是无限循环——这正是 WTJ_FRAME_ANIM.play() 的 opts.loop 覆盖能力存在的原因（同一份 state
// 数据在 idle 场景下可能被复用为持续循环，在 active/完成场景下被复用为"播一轮定格"）。
// onComplete 目前是预留 no-op（详见 renderClickTask() 内联注释）：字面 API 形状要求传它，
// 但本卡定案的映射表都是"单一 activeState 播完即定格"这一最简单方案，没有实现"完成后再接一段
// 收尾动画"（例如 faucet 的 running→closing 链）这类更复杂的编排——卡片原文允许这个更简单的
// 变体（"running（或 running→closing 链）"），本卡选择前者，理由：更少状态、更少可能出错的
// 编排代码，且 running 本身停在最后一帧（水柱清晰可见）已经足够传达"任务完成"的视觉反馈，不
// 需要额外用 closing 收尾。若 PM/DESIGN 认为链式收尾是必须的产品体验，属于后续卡的评估项。
//
// **COMPLETE_VISUAL_HOLD 与 getDuration() 的耦合修正**（P0 红线，卡片原文明确指出"现在
// 800ms 恰≥success 时长是巧合非契约"）：computeVisualHoldMs() 在完成瞬间用
// WTJ_FRAME_ANIM.getDuration(prop, activeState) 读出这个 state 播完一轮实际需要多少毫秒，
// hold = Math.max(COMPLETE_VISUAL_HOLD_MS（800，既有占位下限）, duration + 缓冲)——非动效
// 道具（drag/find 等，door/bell 自 025 起已是动效道具）没有 prop/activeState，直接沿用 800ms
// 不变。已接入道具
// 里 horse.run（8 帧 @12fps ≈ 667ms + 150ms 缓冲 = 817ms；072 返工后 horse.active 由
// stop_success 改为 run，二者巧合同为 ≈667ms，本地板分支的数值论证不变）已经在本次实现里
// 真实触发了"实际时长超过 800ms 地板"的分支，不是纯假设场景。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_TASK_TEMPLATES，Object.freeze 冻结 + 绑定加固）
// -----------------------------------------------------------------------
//   getActiveTaskInfo()   返回当前进行中任务的快照 { type, taskId } | null（QA 用）。
//   onTaskComplete(fn)    订阅"某个具体任务模板判定完成"事件，fn({ type, taskId, lightIndex,
//                          anchor }）。anchor 是 WTJ-20260705-015 新增字段：drag/click/find
//                          三类为 { leftPercent, topPercent }（判定完成时目标在屏幕上的位置，
//                          百分比数字，供 015 换算成像素锚点画即时视觉反馈），press 类无 DOM
//                          恒为 null。供 015 奖励/状态灯引擎卡消费（完整三连奖励/轮次重置逻辑
//                          属于 015，本卡只负责在每次判定完成时 emit 这个事件 + 防御式点亮一个
//                          状态灯）。
//   _setClock(clock)      测试专用（与 task.js/pointer.js 同款模式），不是给其余生产代码调用的
//                          稳定契约。供单测把 P1-3「完成态延迟移除」的 ~800ms 可见窗口快进掉。
//   _setRandom(fn)         测试专用（与 _setClock 同款校验/忽略约定），不是给其余生产代码调用的
//                          稳定契约。注入确定性 RNG 替换 taskRandom（默认 Math.random），供单测
//                          精确断言/复现洗牌袋（type/example 调度，WTJ-20260706-002）的抽取序列。
//
// -----------------------------------------------------------------------
// REQ-TASK-07~10 / REQ-PTR-02/03 / REQ-RWD-04 逐条落地位置索引（供 PM/QA 对照）：
//   REQ-TASK-07  renderDragTask()：draggable + dropTargetIds + 目标 accepts:'drag' 的
//                onDrop 回调。
//   REQ-TASK-08  renderClickTask()：accepts:'click' 的 onClick 回调，切换 targetSpriteActive。
//   REQ-TASK-09  renderFindTask()：accepts:['hover','click']，onHover 与 onClick 共享同一个
//                完成回调（"点一下也算完成"）。
//   REQ-TASK-10  setupPressTask() + handlePressKey()：WTJ_KEYBOARD.onLetter/onSymbol/
//                onFunctionKey 三路常驻处理函数（010 起补齐 symbol/Space/Enter/方向键判定）。
//   REQ-PTR-02/03 本文件通过 WTJ_POINTER.registerTarget 消费 012 已经实现的点击/拖拽判定，
//                不重新实现命中测试/弹性跟随算法本身；handleDragMove()/handleDragDropGlobal()
//                订阅 onDragMove/onDrop 的输出结果渲染跟随视觉/拖错弹回（P1-2）。
//   REQ-RWD-04   handleTemplateComplete()：防御式 WTJ_HUD.setStatusLight(index, true)。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 重复引入守卫（吸取 009/012/013 的教训）：本模块只应被引入一次。
  // ---------------------------------------------------------------------
  if (window.WTJ_TASK_TEMPLATES) {
    return;
  }

  // ---------------------------------------------------------------------
  // manifest 访问器：与 task.js/pointer.js/keyboard.js/hud.js 同一模式。缺失字段一律防御式
  // 回退到下方最小默认值并 console.warn，不阻断任务模板初始化。
  // ---------------------------------------------------------------------
  function getManifest() {
    if (window.WTJ_MANIFEST) {
      return window.WTJ_MANIFEST;
    }
    console.warn('[WTJ_TASK_TEMPLATES] window.WTJ_MANIFEST 未找到（manifest.js 未加载或加载失败），回退到内置最小默认任务示例。');
    return null;
  }

  var MANIFEST = getManifest();
  var TEMPLATES_CFG = (MANIFEST && MANIFEST.tasks && MANIFEST.tasks.templates) ? MANIFEST.tasks.templates : null;

  // 内置默认示例：镜像 manifest.js 里 tasks.templates.*.examples[0] 的真实产品数据，仅在
  // manifest 缺失/对应字段非法时作为兜底，不是本文件自造的另一套数据（与 keyboard.js/task.js/
  // pointer.js 的 DEFAULT_MANIFEST 兜底常量同一工程取舍）。
  // WTJ-20260705-004 Phase B：voicePrompt 随 manifest.js 同步改指向 084 交付的中文完整句
  // .zh.m4a（这份兜底本就承诺"镜像 manifest.js 真实产品数据"，见上方注释）。
  var DEFAULT_EXAMPLES = {
    drag: [
      { id: 'drag-apple-to-basket', objectSprite: 'sprites/apple.png', targetSprite: 'sprites/basket.png', voicePrompt: 'audio/tasks/drag-apple-to-basket.zh.m4a', successAudio: 'audio/sfx/task-success.m4a' }
    ],
    click: [
      { id: 'click-lamp-on', targetSprite: 'sprites/lamp.png', targetSpriteActive: 'sprites/lamp.png', voicePrompt: 'audio/tasks/click-lamp-on.zh.m4a', successAudio: 'audio/sfx/task-success.m4a' },
      { id: 'click-faucet-on', targetSprite: 'sprites/faucet.png', targetSpriteActive: 'sprites/faucet.png', voicePrompt: 'audio/tasks/click-faucet-on.zh.m4a', successAudio: 'audio/sfx/task-success.m4a' },
      { id: 'click-horse-run', targetSprite: 'sprites/horse.png', targetSpriteActive: 'sprites/horse.png', voicePrompt: 'audio/tasks/click-horse-run.zh.m4a', successAudio: 'audio/sfx/task-success.m4a' }
    ],
    find: [
      { id: 'find-the-dog', targetSprite: 'sprites/dog.png', distractorSprites: ['sprites/cat.png', 'sprites/ball.png'], voicePrompt: 'audio/tasks/find-the-dog.zh.m4a', successAudio: 'audio/sfx/task-success.m4a' }
    ],
    press: [
      { id: 'press-letter-a', targetKey: 'A', voicePrompt: 'audio/tasks/press-a.zh.m4a', successAudio: 'audio/sfx/task-success.m4a' }
    ]
  };

  var TASK_TYPES = ['drag', 'click', 'find', 'press'];

  function getExamplesForType(type) {
    var tmpl = TEMPLATES_CFG ? TEMPLATES_CFG[type] : null;
    if (tmpl && Array.isArray(tmpl.examples) && tmpl.examples.length > 0) {
      return tmpl.examples;
    }
    console.warn('[WTJ_TASK_TEMPLATES] manifest.tasks.templates.' + type + '.examples 缺失或为空，回退内置默认示例。');
    return DEFAULT_EXAMPLES[type] || [];
  }

  var DEFAULT_STATUS_LIGHT_COUNT = 3; // 镜像 hud.js 同款默认值。

  function getStatusLightCount() {
    if (
      MANIFEST &&
      MANIFEST.rewards &&
      MANIFEST.rewards.statusLights &&
      typeof MANIFEST.rewards.statusLights.count === 'number' &&
      MANIFEST.rewards.statusLights.count > 0
    ) {
      return MANIFEST.rewards.statusLights.count;
    }
    return DEFAULT_STATUS_LIGHT_COUNT;
  }

  // ---------------------------------------------------------------------
  // sprite 路径解析：manifest.js 里的 spriteFile 字段是 'sprites/xxx.png' 这种不带 assets/
  // 前缀的字面值，不能直接拼进 <img src>。与 secretword.js 的 resolveSpritePath() 同一模式
  // （见 app/web/assets/sprites/PROVENANCE.md「运行时路径约定与已知偏离」一节），本文件维护
  // 一张任务道具专属的文件名 → 实际子目录映射表，不改动只读的 manifest.js。
  // ---------------------------------------------------------------------
  var TASK_PROPS_FILENAMES = ['apple.png', 'basket.png', 'bell.png', 'doghouse.png', 'door.png', 'faucet.png', 'horse.png', 'lamp.png'];
  // WTJ-20260705-004 Phase A（pt2）：find.examples[] 从"写死 dog/cat/ball 单条"扩展到 12 条
  // 精选 example（见 manifest.js tasks.templates.find.examples 与该处行内注释），target/
  // distractor 全部复用 secretWords.pool 已交付的英文词 sprite（103 张真实素材覆盖 101 词，
  // 零新增美术）。这里同步把新用到的 sprite 文件名加入白名单，避免 resolveSpritePath() 走到
  // "未知文件名，assets/ 前缀兜底可能 404"的兜底分支噪声警告——路径本身其实仍会拼对（因为
  // manifest 传入的 spriteFile 原就带 'sprites/' 前缀），加入白名单只是消除噪声、保持与既有
  // TASK_PROPS_FILENAMES/SPRITES_FILENAMES"已知文件名清单"的工程约定一致。
  //
  // WTJ-20260705-025：drag 池扩容新增 6 条 example（egg-to-nest/flower-to-vase/
  // orange-to-basket/fish-to-net/jam-to-jar/treasure-to-chest，见 manifest.js
  // tasks.templates.drag.examples 行内注释），同样全部复用 secretWords.pool 已交付 sprite，
  // 这里追加对应的新文件名（egg/nest/flower/vase/leaf/lemon/pear/net/jam/jar/treasure/key/
  // spoon），零新增美术、零逻辑改动，只是扩充这张既有白名单。
  var SPRITES_FILENAMES = [
    'dog.png', 'cat.png', 'ball.png', 'star.png', 'car.png', 'treasure-chest.png',
    'banana.png', 'orange.png', 'moon.png', 'sun.png', 'fish.png', 'frog.png', 'duck.png',
    'elephant.png', 'lion.png', 'monkey.png', 'pig.png', 'goat.png', 'koala.png',
    'rocket.png', 'robot.png', 'rainbow.png', 'turtle.png', 'unicorn.png', 'zebra.png',
    'whale.png', 'octopus.png',
    'egg.png', 'nest.png', 'flower.png', 'vase.png', 'leaf.png', 'lemon.png', 'pear.png',
    'net.png', 'jam.png', 'jar.png', 'treasure.png', 'key.png', 'spoon.png'
  ];
  // 五个"有动效预期但当前只有静态占位"的道具（见文件头「animation state 接口预留」一节）。
  var ANIM_STATE_FILENAMES = ['faucet.png', 'horse.png', 'door.png', 'bell.png', 'lamp.png'];

  // 已知的 stub 文件名别名：早期 manifest.js 的 click.examples[0] 曾把 targetSprite/
  // targetSpriteActive 写成 'sprites/lamp-off.png' / 'sprites/lamp-on.png'（分态灯具素材
  // 未到位时的占位写法），但 Pack A（WTJ-20260704-005）只交付了一张 `lamp.png`，这里把这两个
  // stub 文件名都别名到唯一真实存在的 lamp.png。**072 起 manifest.js 已直接改用 'lamp.png'
  // 字面值**（见 manifest.js click.examples[0] 行内注释），本别名表不再是解析路径上的必经
  // 分支，只作防御式向后兼容保留（万一未来又出现引用 lamp-off/lamp-on 字面值的 example 或
  // 外部调用，不会 404）。idle/active 两态渲染同一张图，视觉差异完全靠 CSS（[data-anim-state]
  // 规则，见 task-templates.css）与 056 起接入的帧动画，不是最终产品分态贴图。见
  // app/web/assets/task-props/PROVENANCE.md「灯具 idle/active 分态说明」。
  var SPRITE_FILENAME_ALIASES = {
    'lamp-off.png': 'lamp.png',
    'lamp-on.png': 'lamp.png'
  };

  function baseName(spriteFile) {
    if (typeof spriteFile !== 'string' || spriteFile.length === 0) {
      return '';
    }
    var idx = spriteFile.lastIndexOf('/');
    return idx === -1 ? spriteFile : spriteFile.slice(idx + 1);
  }

  function inList(list, name) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === name) {
        return true;
      }
    }
    return false;
  }

  function resolvedBaseName(spriteFile) {
    var name = baseName(spriteFile);
    if (name && Object.prototype.hasOwnProperty.call(SPRITE_FILENAME_ALIASES, name)) {
      return SPRITE_FILENAME_ALIASES[name];
    }
    return name;
  }

  function resolveSpritePath(spriteFile) {
    var name = resolvedBaseName(spriteFile);
    if (!name) {
      console.warn('[WTJ_TASK_TEMPLATES] 无法解析 spriteFile: "' + String(spriteFile) + '"，已忽略。');
      return '';
    }
    // 任务道具目录优先（apple/basket 在 sprites/ 与 task-props/ 两处都存在同一份 v3 基准像素，
    // 任务渲染语境下统一取 task-props/ 版本，见 assets/task-props/PROVENANCE.md）。
    if (inList(TASK_PROPS_FILENAMES, name)) {
      return 'assets/task-props/' + name;
    }
    if (inList(SPRITES_FILENAMES, name)) {
      return 'assets/sprites/' + name;
    }
    console.warn('[WTJ_TASK_TEMPLATES] spriteFile "' + spriteFile + '" 不在已知的 task-props/sprites 文件名清单内，使用 assets/ 前缀兜底（可能 404）。');
    return 'assets/' + spriteFile;
  }

  function wantsAnimState(spriteFile) {
    return inList(ANIM_STATE_FILENAMES, resolvedBaseName(spriteFile));
  }

  // ---------------------------------------------------------------------
  // 056 动效引擎接入：per-prop idle/active 映射表（见文件头「五、动效引擎接入」一节的表格与
  // 逐条理由）。door/bell 有意不在这张表里——resolvePropAnimInfo() 对它们恒返回 null，
  // createPropEl() 因此恒回退静态 <img>，这是 v1_boundary.deferred_to_v2 在本文件的落地
  // 方式，不是遗漏。
  // ---------------------------------------------------------------------
  var PROP_ANIM_STATE_MAP = {
    faucet: { idle: 'off', active: 'running' },
    horse: { idle: 'idle', active: 'run' },
    lamp: { idle: 'off', active: 'turning-on' },
    // WTJ-20260705-025：door/bell 的 v1 动画（卡 -030 门 / -031 铃，均已 DESIGN 验收 done）
    // 已从 v1_boundary.deferred_to_v2 移入 included 并降采进 anim-manifest.js，故在此登记映射，
    // 由「静态 img 兜底」升级为真实帧动画。door 点击 → 'closed'→'opening'（5 帧非循环，播完停在
    // 开门末帧）；bell 点击 → 'idle'→'ring'（6 帧循环，命中期间持续摇铃）。
    door: { idle: 'closed', active: 'opening' },
    bell: { idle: 'idle', active: 'ring' }
  };

  // 把一个 spriteFile（如 'sprites/lamp-off.png'）解析成"这个道具在 WTJ_FRAME_ANIM 引擎里
  // 对应的 prop key + idle/active state 名"。五个 animation-state 道具（faucet/horse/lamp/
  // door/bell，door/bell 由 WTJ-20260705-025 接入）都在 PROP_ANIM_STATE_MAP 里；只有非动效
  // spriteFile（apple/basket/dog/cat/ball/doghouse 等）解析不到 prop 映射、返回 null。
  // 复用 resolvedBaseName()（而不是 baseName()）是刻意的：'lamp-off.png'/'lamp-on.png' 这两个
  // stub 文件名要先经过 SPRITE_FILENAME_ALIASES 别名解析成 'lamp.png'，再去掉扩展名得到
  // prop key 'lamp'，与 wantsAnimState() 判断"是否该有 data-anim-state 属性"用的是同一份
  // 名称解析逻辑，两者保持一致不会出现"有 data-anim-state 但引擎映射查不到"的错配。
  function resolvePropAnimInfo(spriteFile) {
    if (!wantsAnimState(spriteFile)) {
      return null;
    }
    var name = resolvedBaseName(spriteFile);
    var dotIdx = name.lastIndexOf('.');
    var prop = dotIdx === -1 ? name : name.slice(0, dotIdx);
    var states = PROP_ANIM_STATE_MAP[prop];
    if (!states) {
      return null; // 非动效道具（无 PROP_ANIM_STATE_MAP 条目）在此回退静态 img，见上方注释。
    }
    return { prop: prop, idleState: states.idle, activeState: states.active };
  }

  // ---------------------------------------------------------------------
  // 订阅者管理（本文件对外的 onTaskComplete 事件）：与 task.js/pointer.js/keyboard.js 完全
  // 同款多订阅者 + 逐个 try/catch 模式。
  // ---------------------------------------------------------------------
  var taskCompleteSubscribers = [];

  function addSubscriber(list, fn) {
    if (typeof fn !== 'function') {
      console.warn('[WTJ_TASK_TEMPLATES] 订阅回调必须是函数，已忽略此次注册。');
      return;
    }
    list.push(fn);
  }

  function emit(list, arg) {
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](arg);
      } catch (err) {
        console.error('[WTJ_TASK_TEMPLATES] 订阅回调抛出异常，已捕获：', err);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 可注入随机数生成器（与 _setClock 同款模式，见下方「可注入时钟」一节）：taskRandom 默认走
  // 真实 Math.random()（Ethan 开发机验收要的是"真随机"，不是确定性轮转），返回 [0,1) 区间数字，
  // 语义与 Math.random() 完全一致。测试用 _setRandom(fn) 整体替换成确定性 RNG（如
  // mulberry32/LCG 或固定序列桩），从而可以精确断言/复现下方洗牌袋的抽取顺序——不需要真的
  // 依赖 Math.random 的不可控输出。_setRandom 校验参数必须是函数，否则 warn 并忽略（与
  // _setClock 对非法参数的处理同一套防御式约定）。
  // ---------------------------------------------------------------------
  var taskRandom = Math.random;

  function _setRandom(fn) {
    if (typeof fn !== 'function') {
      console.warn('[WTJ_TASK_TEMPLATES] _setRandom: 参数必须是函数，已忽略。');
      return;
    }
    taskRandom = fn;
  }

  // ---------------------------------------------------------------------
  // 洗牌袋（shuffle bag）：问号任务的 type 与"该 type 下选哪个 example"都改用这个机制替代旧版
  // 确定性递增计数器轮转（见文件头「任务生成」一节完整设计说明与"为什么"）。下面两个通用函数
  // （refillShuffleBag()、drawFromShuffleBag()，消费一个字面量状态 { bag, lastPicked }）是
  // 同一套无放回抽取逻辑，同时服务 TASK_TYPES（drawTaskType()）与每个
  // type 各自的 example 下标（drawExampleIndex()），不是两套独立实现。
  //
  // 契约（详见文件头「任务生成」一节 1~4 点）：①袋空时 Fisher-Yates 重新装满打乱，无放回逐个
  // 取出，保证一整袋内每个候选恰好出现一次；②跨袋边界若新袋首撞上上一次抽到的值，交换袋首与
  // 袋内另一随机位置，避免连续两次同一个候选；③单元素候选池（袋子只有 1 个候选）无法避免"连续
  // 抽到同一个"，直接放弃这条保证，是数学上唯一自洽的选择。
  // ---------------------------------------------------------------------
  function fisherYatesShuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(taskRandom() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function refillShuffleBag(state, items) {
    var pool = items.slice();
    fisherYatesShuffle(pool);
    if (pool.length > 1 && state.lastPicked !== null && pool[0] === state.lastPicked) {
      var swapIdx = 1 + Math.floor(taskRandom() * (pool.length - 1));
      var tmp = pool[0];
      pool[0] = pool[swapIdx];
      pool[swapIdx] = tmp;
    }
    state.bag = pool;
  }

  function drawFromShuffleBag(state, items) {
    if (!state.bag || state.bag.length === 0) {
      refillShuffleBag(state, items);
    }
    var picked = state.bag.shift();
    state.lastPicked = picked;
    return picked;
  }

  // type 洗牌袋：候选池恒为 TASK_TYPES 本身（4 个类型字符串，直接按值比较/存放，不需要额外的
  // 下标映射）。
  var typeBagState = { bag: [], lastPicked: null };

  function drawTaskType() {
    return drawFromShuffleBag(typeBagState, TASK_TYPES);
  }

  // example 洗牌袋：每个 type 各自维护一份独立状态（exampleBagStates，键为 type 字符串）。
  // 候选池是"下标"而不是 example 对象本身——这样"长度变化时重建"只需要比较一个数字
  // （itemsLength），不需要对候选池做深比较。itemsLength 与当前 getExamplesForType(type).length
  // 不一致时（如 manifest 热更新新增/减少了某个 type 的 examples），直接丢弃旧状态重新开始
  // （不尝试续用旧袋子里还没抽完的下标，因为下标语义已经变了）。
  var exampleBagStates = {};

  function drawExampleIndex(type, examplesLength) {
    var state = exampleBagStates[type];
    if (!state || state.itemsLength !== examplesLength) {
      state = { bag: [], lastPicked: null, itemsLength: examplesLength };
      exampleBagStates[type] = state;
    }
    var indices = [];
    for (var i = 0; i < examplesLength; i++) {
      indices.push(i);
    }
    return drawFromShuffleBag(state, indices);
  }

  // ---------------------------------------------------------------------
  // 递增计数器：现在只驱动布局位置轮转（presetAt()），不再参与 type/example 的选择（那部分已
  // 改用上方洗牌袋，见文件头「任务生成」一节）。布局位置不需要"不可预测"，纯轮转即可保证连续
  // 任务不会挤在同一屏幕位置。
  // ---------------------------------------------------------------------
  var questionClickCounter = 0;

  // 6 个预设布局位置（viewport 百分比），刻意避开顶栏（top 34px）、右侧问号（垂直居中偏右）、
  // 底部五槽托盘（水平居中偏下）、左下角状态灯这几个 HUD 固定区域。轮转使用，不是随机分布。
  var POSITION_PRESETS = [
    { left: '18%', top: '22%' },
    { left: '38%', top: '22%' },
    { left: '58%', top: '24%' },
    { left: '20%', top: '58%' },
    { left: '76%', top: '54%' },
    { left: '42%', top: '40%' }
  ];

  function presetAt(offset) {
    var idx = (questionClickCounter + offset) % POSITION_PRESETS.length;
    if (idx < 0) {
      idx += POSITION_PRESETS.length;
    }
    return POSITION_PRESETS[idx];
  }

  // ---------------------------------------------------------------------
  // WTJ-20260705-015：任务成功即时视觉反馈（第三路，见 status-rewards.js「三、任务成功即时
  // 视觉反馈」一节）需要知道"这次判定完成的任务在屏幕上的哪个位置"，才能在正确的地方画出
  // sparkle burst，而不是屏幕正中心或固定角落。本文件的任务道具全部用 POSITION_PRESETS 给出的
  // 百分比字符串（如 '38%'）定位（.wtj-tt-prop 的 style.left/top，相对 .wtj-tt-root 这个
  // 全屏 fixed 容器），因此这里只需要把渲染时实际使用的那个 preset 位置原样透传出去，换算成
  // { leftPercent, topPercent } 两个数字，供 015 在渲染时按 window.innerWidth/innerHeight 换算
  // 成像素锚点——不依赖 getBoundingClientRect()（沙箱测试环境的 fake DOM 元素没有这个方法，见
  // handleDragMove() 上方注释的同一取舍），也不需要真实浏览器布局。press 类任务没有任何 DOM
  // 元素（见「四、按键任务」一节），completionAnchor 恒为 null——015 侧对 null 有自己的
  // 画布安全区兜底位置，不是本文件的职责。
  // ---------------------------------------------------------------------
  function parsePercent(str) {
    if (typeof str !== 'string' || str.length === 0) {
      return null;
    }
    var n = parseFloat(str);
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  function anchorFromPos(pos) {
    if (!pos) {
      return null;
    }
    var leftPercent = parsePercent(pos.left);
    var topPercent = parsePercent(pos.top);
    if (leftPercent === null || topPercent === null) {
      return null;
    }
    return { leftPercent: leftPercent, topPercent: topPercent };
  }

  // ---------------------------------------------------------------------
  // DOM 叠层：懒创建的单一 overlay root，挂在 document.body 下。document 不存在（如本文件
  // 被非浏览器环境的测试 harness 用 stub window 加载而不提供 document）时防御式跳过——本文件
  // 不是 013 那种"结构性禁止 DOM"，而是"DOM 缺失时优雅降级为不可视但不抛错"。
  // ---------------------------------------------------------------------
  var overlayRoot = null;

  function ensureOverlayRoot() {
    if (overlayRoot) {
      return overlayRoot;
    }
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function' || !document.body) {
      return null;
    }
    try {
      var root = document.createElement('div');
      root.className = 'wtj-tt-root';
      if (typeof root.setAttribute === 'function') {
        root.setAttribute('aria-hidden', 'true');
      }
      document.body.appendChild(root);
      overlayRoot = root;
      return overlayRoot;
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 创建任务叠层容器失败，已捕获：', err);
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // WTJ_FRAME_ANIM 防御式调用包装（056 引擎，可能整体缺失/未加载——与 WTJ_POINTER/WTJ_HUD/
  // WTJ_AUDIO 同一降级契约）。
  // ---------------------------------------------------------------------
  function playPropAnimDefensive(canvasEl, prop, state, opts) {
    try {
      if (window.WTJ_FRAME_ANIM && typeof window.WTJ_FRAME_ANIM.play === 'function') {
        return !!window.WTJ_FRAME_ANIM.play(canvasEl, prop, state, opts);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] window.WTJ_FRAME_ANIM.play 调用失败，已捕获：', err);
    }
    return false;
  }

  function stopPropAnimDefensive(canvasEl) {
    try {
      if (window.WTJ_FRAME_ANIM && typeof window.WTJ_FRAME_ANIM.stop === 'function') {
        window.WTJ_FRAME_ANIM.stop(canvasEl);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] window.WTJ_FRAME_ANIM.stop 调用失败，已捕获：', err);
    }
  }

  function frameAnimAvailable() {
    try {
      return !!(window.WTJ_FRAME_ANIM && typeof window.WTJ_FRAME_ANIM.play === 'function');
    } catch (err) {
      return false;
    }
  }

  // 056：动效道具（faucet/horse/lamp）挂载 <canvas> + 用引擎播放 idleState（loop:true）；
  // 非动效道具与 door/bell（resolvePropAnimInfo() 返回 null）、以及引擎缺失/play() 失败时
  // 一律回退原有的静态 <img> 占位——这是本函数唯一的分支点，调用方（renderDragTask()/
  // renderClickTask()/renderFindTask()）完全不需要关心某个具体元素最终是 canvas 还是 img。
  function createPropEl(spriteFile, pos, extraClass) {
    var root = ensureOverlayRoot();
    if (!root) {
      return null;
    }
    try {
      var animInfo = resolvePropAnimInfo(spriteFile);
      var el = null;

      if (animInfo && frameAnimAvailable()) {
        var canvasCandidate = document.createElement('canvas');
        if (playPropAnimDefensive(canvasCandidate, animInfo.prop, animInfo.idleState, { loop: true })) {
          el = canvasCandidate;
          if (typeof el.setAttribute === 'function') {
            el.setAttribute('data-wtj-anim-prop', animInfo.prop);
          }
        }
        // play() 失败（理论上罕见：anim-manifest 缺这个 prop/state 的条目）时 canvasCandidate
        // 直接丢弃——还没 appendChild 到任何父节点，不需要额外清理，下面统一走静态 img 回退。
      }
      if (!el) {
        el = document.createElement('img');
        el.src = resolveSpritePath(spriteFile);
      }

      el.className = extraClass ? 'wtj-tt-prop ' + extraClass : 'wtj-tt-prop';
      el.alt = '';
      if (pos && el.style) {
        el.style.left = pos.left;
        el.style.top = pos.top;
      }
      if (typeof el.setAttribute === 'function') {
        el.setAttribute('data-wtj-sprite-file', spriteFile || '');
        if (wantsAnimState(spriteFile)) {
          el.setAttribute('data-anim-state', 'idle');
        }
        // WTJ-080 根因修复：<img> 默认 draggable=true，会让浏览器/WKWebView 在 mousedown 时启动
        // 原生 HTML5 拖拽（半透明 ghost 跟指针、原物留原位），原生拖拽期间 mousemove/mouseup 被
        // drag 系事件取代不再派发，导致 pointer.js 的 onMouseUp 永不触发、拖拽状态机卡死、任务
        // 永不完成。这里统一禁用（canvas 分支本无此默认行为，但一并设置无害，防止未来引擎改用
        // 别的可拖拽元素类型时悄悄引入同一个坑）。CSS 侧另有 -webkit-user-drag:none 作为
        // Safari/WKWebView 专属兜底（draggable=false 在 Safari 对 img 有时不够彻底）。
        el.setAttribute('draggable', 'false');
      }
      root.appendChild(el);
      return el;
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 创建任务道具元素失败，已捕获：', err);
      return null;
    }
  }

  function setPropSpriteSrc(el, spriteFile) {
    if (!el || !spriteFile) {
      return;
    }
    try {
      el.src = resolveSpritePath(spriteFile);
      if (typeof el.setAttribute === 'function') {
        el.setAttribute('data-wtj-sprite-file', spriteFile);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 切换任务道具贴图失败，已捕获：', err);
    }
  }

  function setAnimState(el, state) {
    if (!el || typeof el.setAttribute !== 'function') {
      return;
    }
    try {
      el.setAttribute('data-anim-state', state);
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 设置 data-anim-state 失败，已捕获：', err);
    }
  }

  function removeElementDefensive(el) {
    if (!el) {
      return;
    }
    // 056：若该元素是引擎播放中的 <canvas>，先停掉它的 tick 定时器再摘 DOM——不这样做的话，
    // 引擎的 setTimeout 链会继续对着一个已经从文档树摘除的 canvas 空转（尤其是常驻的循环
    // idle 播放，见 app/web/anim/FRAME-ANIM-API.md「idle-stop」一节"stop() 时清 tick"这条
    // 无条件下限）。对非 canvas / 从未注册过的元素调用 WTJ_FRAME_ANIM.stop() 是安全的
    // no-op（找不到匹配的播放态直接返回），因此这里可以无条件调用，不需要先判断 tagName。
    stopPropAnimDefensive(el);
    try {
      if (typeof el.remove === 'function') {
        el.remove();
      } else if (el.parentNode && typeof el.parentNode.removeChild === 'function') {
        el.parentNode.removeChild(el);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 移除任务叠层元素失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // 可注入时钟（默认真实 setTimeout/clearTimeout/Date.now；测试用 _setClock 整体或部分替换，
  // 与 task.js/pointer.js 的 _setClock 同款模式）。P1-3「完成态延迟移除」需要单测能把 ~800ms
  // 的可见窗口快进掉，不需要真的等待。
  // ---------------------------------------------------------------------
  var clockRef = {
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function (id) { clearTimeout(id); },
    now: function () { return Date.now(); }
  };

  function _setClock(clock) {
    if (!clock || typeof clock !== 'object') {
      console.warn('[WTJ_TASK_TEMPLATES] _setClock: 参数必须是对象，已忽略。');
      return;
    }
    if (typeof clock.setTimeout === 'function') {
      clockRef.setTimeout = clock.setTimeout;
    }
    if (typeof clock.clearTimeout === 'function') {
      clockRef.clearTimeout = clock.clearTimeout;
    }
    if (typeof clock.now === 'function') {
      clockRef.now = clock.now;
    }
  }

  // ---------------------------------------------------------------------
  // P1-3（Fable 对抗评审）完成态延迟移除：判定完成的瞬间到 DOM 真正被摘除之间，留一个可见窗口，
  // 让 active 态（灯亮/门开等 data-anim-state="active" 占位视觉）真的有机会被浏览器 paint 出来、
  // 被孩子看见——而不是在同一个事件循环 tick 内"切到 active 态 → 整个元素被移除"，把 active 态
  // 变成死代码。约 800ms 是本卡本地占位值（卡片原文未给出精确数值，与 keyboard.js
  // FUNCTION_KEY_DECAY_SPAN 同一工程取舍）。同一时刻只应有一批"待移除"的元素在排队（activeRuntime
  // 同一时刻只有一个进行中任务，完成之后 activeRuntime 立即置空，下一个任务才能开始），因此这里
  // 用一组模块级变量而不是每次完成都各自维护一份列表。
  // ---------------------------------------------------------------------
  var COMPLETE_VISUAL_HOLD_MS = 800;
  var pendingRemovalTimerId = null;
  var pendingRemovalElements = null;

  // 056：COMPLETE_VISUAL_HOLD_MS（800）曾经是"恰好 >= 唯一一种完成态视觉时长"的巧合，不是
  // 契约——现在动效道具的 activeState 真的有一个由 WTJ_FRAME_ANIM.getDuration() 给出的确切
  // 播放时长，hold 窗口必须不短于这个时长，否则素材以后加长会被腰斩（DOM 在动画播完前就被
  // 摘掉）。computeVisualHoldMs()：非动效道具（animProp/animActiveState 为 null，即 door/
  // bell/drag/find 等）直接沿用 800ms 既有下限；动效道具取
  // Math.max(800, getDuration(prop, activeState) + 缓冲)。
  var COMPLETE_VISUAL_HOLD_BUFFER_MS = 150; // 缓冲：给最后一帧真正被 paint 出来留一点余量。

  function computeVisualHoldMs(animProp, animActiveState) {
    if (!animProp || !animActiveState) {
      return COMPLETE_VISUAL_HOLD_MS;
    }
    try {
      if (window.WTJ_FRAME_ANIM && typeof window.WTJ_FRAME_ANIM.getDuration === 'function') {
        var dur = window.WTJ_FRAME_ANIM.getDuration(animProp, animActiveState);
        if (typeof dur === 'number' && dur > 0) {
          return Math.max(COMPLETE_VISUAL_HOLD_MS, dur + COMPLETE_VISUAL_HOLD_BUFFER_MS);
        }
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 读取 window.WTJ_FRAME_ANIM.getDuration 失败，已捕获，沿用默认完成态可见窗口：', err);
    }
    return COMPLETE_VISUAL_HOLD_MS;
  }

  // 立即执行一次尚未到期的延迟移除（不等定时器自然触发）：供下一次问号点击/dismiss 兜底清理，
  // 防止上一轮完成态的叠层元素残留跨越任务边界继续堆积在 DOM 里。
  function flushPendingRemoval() {
    if (pendingRemovalTimerId !== null) {
      clockRef.clearTimeout(pendingRemovalTimerId);
      pendingRemovalTimerId = null;
    }
    if (pendingRemovalElements) {
      var els = pendingRemovalElements;
      pendingRemovalElements = null;
      for (var i = 0; i < els.length; i++) {
        removeElementDefensive(els[i]);
      }
    }
  }

  function scheduleElementsRemoval(elements, holdMs) {
    flushPendingRemoval(); // 保险：正常不应该有上一轮残留，避免两次完成的延迟移除互相覆盖。
    if (!elements || !elements.length) {
      return;
    }
    var delay = (typeof holdMs === 'number' && holdMs > 0) ? holdMs : COMPLETE_VISUAL_HOLD_MS;
    pendingRemovalElements = elements;
    pendingRemovalTimerId = clockRef.setTimeout(function () {
      pendingRemovalTimerId = null;
      var els = pendingRemovalElements;
      pendingRemovalElements = null;
      if (els) {
        for (var i = 0; i < els.length; i++) {
          removeElementDefensive(els[i]);
        }
      }
    }, delay);
  }

  // ---------------------------------------------------------------------
  // WTJ_POINTER / WTJ_HUD / WTJ_AUDIO 防御式调用包装（三者均可能缺失/未加载，见 012/016/007
  // 各自文档的降级契约；本文件对三者的每一次调用都单独 try/catch，一处失败不影响其余）。
  // ---------------------------------------------------------------------
  function registerPointerTargetDefensive(id, config) {
    try {
      if (window.WTJ_POINTER && typeof window.WTJ_POINTER.registerTarget === 'function') {
        window.WTJ_POINTER.registerTarget(id, config);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] window.WTJ_POINTER.registerTarget 调用失败，已捕获：', err);
    }
  }

  function unregisterPointerTargetDefensive(id) {
    try {
      if (window.WTJ_POINTER && typeof window.WTJ_POINTER.unregisterTarget === 'function') {
        window.WTJ_POINTER.unregisterTarget(id);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] window.WTJ_POINTER.unregisterTarget 调用失败，已捕获：', err);
    }
  }

  function setStatusLightDefensive(index, on) {
    try {
      if (window.WTJ_HUD && typeof window.WTJ_HUD.setStatusLight === 'function') {
        window.WTJ_HUD.setStatusLight(index, on);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] window.WTJ_HUD.setStatusLight 调用失败，已捕获：', err);
    }
  }

  function playSuccessAudioDefensive(example) {
    try {
      if (window.WTJ_AUDIO && typeof window.WTJ_AUDIO.playSfx === 'function' && example && typeof example.successAudio === 'string' && example.successAudio) {
        window.WTJ_AUDIO.playSfx({ sfxKey: 'task-success', path: example.successAudio });
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] window.WTJ_AUDIO.playSfx 调用失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // WTJ-20260705-004 Phase A（pt5）：英文 learning 反馈——任务判定完成后，若该 example 带了
  // 可选 example.learningWord 字段（一个英文单词字面量，如 'dog'/'apple'），防御式地再用
  // WTJ_AUDIO.playWord() 念一遍这个词，强化"任务目标 = 一个可以学习的英文单词"这条产品意图。
  //
  // 零新增音频约束：learningWord 必须能在 MANIFEST.secretWords.pool 里找到同名词条，直接复用
  // 该词条已经交付的 audioFile（101 词均已有真实 .m4a，见 manifest.js secretWords.pool 与
  // audio/words/ 目录），不新造任何音频路径约定、不新增任何音频文件依赖。找不到对应词条时
  // （拼写不在 pool 内，或 pool 缺失）静默跳过并 warn 一次，不阻断任务完成流程——与本文件其余
  // WTJ_AUDIO/WTJ_HUD/WTJ_POINTER 调用一贯的防御式降级契约一致。
  // ---------------------------------------------------------------------
  function findSecretWordPoolEntry(word) {
    try {
      if (MANIFEST && MANIFEST.secretWords && Array.isArray(MANIFEST.secretWords.pool)) {
        var pool = MANIFEST.secretWords.pool;
        for (var i = 0; i < pool.length; i++) {
          if (pool[i] && pool[i].word === word) {
            return pool[i];
          }
        }
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 读取 MANIFEST.secretWords.pool 失败，已捕获：', err);
    }
    return null;
  }

  function playLearningWordDefensive(example) {
    try {
      if (!example || typeof example.learningWord !== 'string' || !example.learningWord) {
        return; // learningWord 是可选字段，未提供时是完全正常的 no-op（如 press 任务当前不填）。
      }
      var entry = findSecretWordPoolEntry(example.learningWord);
      if (!entry) {
        console.warn('[WTJ_TASK_TEMPLATES] example.learningWord "' + example.learningWord + '" 未在 MANIFEST.secretWords.pool 找到对应词条，已跳过播放（零新增音频约束：只能引用池内已交付词）。');
        return;
      }
      if (window.WTJ_AUDIO && typeof window.WTJ_AUDIO.playWord === 'function') {
        window.WTJ_AUDIO.playWord({ word: entry.word, audioFile: entry.audioFile });
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] window.WTJ_AUDIO.playWord（learningWord）调用失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // 当前进行中任务的运行时状态（同一时刻只有一个，与 013 的"同一时刻只允许一个进行中任务"
  // 不变式保持一致——本文件不需要自己再做一次并发保护，013 的 startTask() 已经保证了这点）。
  // ---------------------------------------------------------------------
  var activeRuntime = null; // { type, example, elements, pointerIds, emphasizeElements,
                             //   dragObjectId, dragObjectEl, dragObjectInitialPos }
  var statusLightIndex = 0; // 下一个要点亮的状态灯索引，按 getStatusLightCount() 取模轮转。

  function unregisterRuntimeTargets(runtime) {
    if (!runtime) {
      return;
    }
    for (var i = 0; i < runtime.pointerIds.length; i++) {
      unregisterPointerTargetDefensive(runtime.pointerIds[i]);
    }
  }

  // dismiss（013 超时/键盘转移）等"不算完成"的收尾路径用的立即完整清理：unregister + DOM 立即
  // 移除都不需要延迟。完成路径不走这个函数，见下方 handleTemplateComplete() 的说明——完成需要
  // "pointer target 立即卸载、DOM 延迟移除"两段不同节奏，不能共用同一个"一起清"的函数。
  function cleanupActiveRuntime() {
    if (!activeRuntime) {
      return;
    }
    unregisterRuntimeTargets(activeRuntime);
    for (var i = 0; i < activeRuntime.elements.length; i++) {
      removeElementDefensive(activeRuntime.elements[i]);
    }
    activeRuntime = null;
  }

  // 判定完成的唯一入口：四类任务的所有完成路径都收敛到这里。
  // guard：只有当 activeRuntime 仍然是"这一个"任务（type + taskId 都对得上）时才生效，防止
  // 已经被清理过的任务的迟到回调（例如 dismiss 之后残留的异步调用）重复触发完成逻辑。
  //
  // P1-3（Fable 对抗评审）：以前这里直接调用 cleanupActiveRuntime() 同步移除 DOM——
  // setPropSpriteSrc(active 贴图)/setAnimState('active') 与元素被摘掉发生在同一个事件循环
  // tick 内，浏览器根本没有机会把"灯亮/门开"这一帧 paint 出来，active 态视觉和它的占位 CSS
  // （task-templates.css 的 [data-anim-state="active"] 规则）都成了死代码。现在拆成两段：
  // pointer target 立即 unregister（防止同一个已判定完成的 target 被迟到事件重复触发完成），
  // DOM 元素改用可注入时钟延迟 COMPLETE_VISUAL_HOLD_MS 后再摘除，给 active 态一个真实可见的
  // 窗口；下一次问号点击/dismiss 会兜底 flush 一次（见 flushPendingRemoval()），不会无限堆积。
  function handleTemplateComplete(type, example) {
    if (!activeRuntime || activeRuntime.type !== type || !example || activeRuntime.example.id !== example.id) {
      return;
    }
    var taskId = example.id;
    var lightIndex = statusLightIndex;
    statusLightIndex = (statusLightIndex + 1) % getStatusLightCount();

    var completedRuntime = activeRuntime;
    activeRuntime = null; // 立即清空"进行中任务"：guard 生效，迟到的重复完成回调不会二次触发。

    unregisterRuntimeTargets(completedRuntime);
    // 056：hold 窗口不再是硬编码的 800ms——见 computeVisualHoldMs() 一节，非动效道具
    // （animProp/animActiveState 均为 null）沿用 800ms 原值，动效道具按 getDuration() 校正。
    scheduleElementsRemoval(completedRuntime.elements, computeVisualHoldMs(completedRuntime.animProp, completedRuntime.animActiveState));

    setStatusLightDefensive(lightIndex, true);
    playSuccessAudioDefensive(example);
    playLearningWordDefensive(example); // pt5：可选 learningWord 英文单词强化播放。

    try {
      if (window.WTJ_TASK && typeof window.WTJ_TASK.completeTask === 'function') {
        window.WTJ_TASK.completeTask({ type: type, taskId: taskId });
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] window.WTJ_TASK.completeTask 调用失败，已捕获：', err);
    }

    // WTJ-20260705-015：新增 anchor 字段（drag/click/find 类型为 { leftPercent, topPercent }，
    // press 类型恒为 null），供 015（status-rewards.js）的任务成功即时视觉反馈定位 sparkle
    // burst——纯新增字段，不改动既有的 type/taskId/lightIndex 三个字段，向后兼容既有订阅者
    // （010/008 两路奖励逻辑与本文件自身单测均只逐字段读取，不做整体形状断言）。
    emit(taskCompleteSubscribers, { type: type, taskId: taskId, lightIndex: lightIndex, anchor: completedRuntime.completionAnchor || null });
  }

  // ---------------------------------------------------------------------
  // 一、拖拽任务（REQ-TASK-07）
  // ---------------------------------------------------------------------
  function renderDragTask(example) {
    var objPos = presetAt(0);
    var targetPos = presetAt(2);
    var objEl = createPropEl(example.objectSprite, objPos, 'wtj-tt-drag-object');
    var targetEl = createPropEl(example.targetSprite, targetPos, 'wtj-tt-drag-target');
    if (!objEl || !targetEl) {
      removeElementDefensive(objEl);
      removeElementDefensive(targetEl);
      return { elements: [], pointerIds: [] };
    }

    var objId = 'wtj-tt-drag-object-' + example.id;
    var targetId = 'wtj-tt-drag-target-' + example.id;

    registerPointerTargetDefensive(objId, {
      el: objEl,
      accepts: [],
      draggable: true,
      dropTargetIds: [targetId]
    });
    registerPointerTargetDefensive(targetId, {
      el: targetEl,
      accepts: ['drag'],
      onDrop: function () {
        handleTemplateComplete('drag', example);
      }
    });

    // WTJ-20260705-004 Phase A（pt1）：可选 example.distractorSprites——纯装饰性的干扰物体
    // 散落在场景里（例如苹果任务旁边放一根香蕉/橘子），仿 renderFindTask() 的干扰项循环：
    // 只 createPropEl() + push 进 elements（供完成后统一清理/移除），不 registerTarget（不
    // 参与任何拖拽/点击判定），不占用 objPos（presetAt(0)）/targetPos（presetAt(2)）这两个
    // 已用的布局位——从 presetAt(3) 起顺延，与 renderFindTask() 从 presetAt(1) 起顺延同一手法
    // （避免与 find 任务的目标位 presetAt(0) 冲突，这里避免与 drag 的物体/目标位冲突）。
    var elements = [objEl, targetEl];
    var distractorEls = [];
    var distractors = Array.isArray(example.distractorSprites) ? example.distractorSprites : [];
    var i;
    for (i = 0; i < distractors.length; i++) {
      var dEl = createPropEl(distractors[i], presetAt(3 + i), 'wtj-tt-drag-distractor');
      if (dEl) {
        elements.push(dEl);
        distractorEls.push(dEl);
      }
    }

    return {
      elements: elements,
      pointerIds: [objId, targetId],
      // P1-2（Fable 对抗评审）：拖拽跟随视觉需要知道"哪个元素是被拖物体"+ 它的初始 preset
      // 位置（拖错弹回要复位到这里），见下方 handleDragMove()/handleDragDropGlobal()。
      dragObjectId: objId,
      dragObjectEl: objEl,
      dragObjectInitialPos: objPos,
      // WTJ-20260705-015：拖拽成功的"落点"是放置目标的位置（物体被拖过去、命中判定也在这里
      // 发生），任务成功即时视觉反馈锚定在这里，而不是物体的出发点。
      completionAnchor: anchorFromPos(targetPos),
      // pt1（004b）：与 renderFindTask() 的 P2-4 修法保持同一风格——emphasize（30s 目标增强提示）
      // 只应该强调"任务本身涉及的元素"（可拖物体 + 放置目标），装饰性干扰物不应该被一起放大/
      // 发光（虽然不像 find 那样构成"泄漏答案"，但会让强调阶段的视觉焦点被无关装饰稀释，
      // 与 find 保持一致的设计意图：干扰项恒不参与 emphasize）。
      emphasizeElements: [objEl, targetEl]
    };
  }

  // P1-2（Fable 对抗评审）：POINTER-API.md「9. 各消费卡怎么用」表格明确把"订阅 onDragMove/onDrop
  // 渲染拖拽视觉"分派给 014。此前本文件只调用了 registerTarget 接入判定，从未订阅这两个事件，
  // 判定链路正确但拖拽物体原地不动，孩子拖苹果没有任何跟随反馈（REQ-PTR-03 弹性跟随/拖错弹回
  // 在视觉上完全缺失）。
  //
  // followX/followY 的语义（见 pointer.js 的 resolveBounds()/updateDragFollow()）：两者是"被拖
  // 元素 getBoundingClientRect() 应该在的左上角"坐标（viewport px），不是中心点。但本文件的
  // .wtj-tt-prop 元素统一用 `transform: translate(-50%, -50%)` + style.left/top 定位
  // （left/top 代表"元素中心应该落在的点"，见 task-templates.css 与 POSITION_PRESETS 的注释），
  // 两者原点语义不同，这里必须做一次换算：中心点 = 左上角 + 元素自身宽高的一半，否则直接把
  // followX/Y 写进 left/top 会让元素的视觉中心整体偏移半个身位。
  function currentDragObjectId() {
    return (activeRuntime && activeRuntime.type === 'drag') ? activeRuntime.dragObjectId : null;
  }

  function handleDragMove(payload) {
    if (!payload || payload.id === null || payload.id === undefined) {
      return;
    }
    if (payload.id !== currentDragObjectId()) {
      return; // 不是当前任务的可拖物（例如残留的迟到事件），防御式忽略。
    }
    var el = activeRuntime.dragObjectEl;
    if (!el || !el.style) {
      return;
    }
    var halfW = 0;
    var halfH = 0;
    try {
      if (typeof el.getBoundingClientRect === 'function') {
        var rect = el.getBoundingClientRect();
        if (rect && typeof rect.width === 'number' && typeof rect.height === 'number') {
          halfW = rect.width / 2;
          halfH = rect.height / 2;
        }
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 读取拖拽物体 getBoundingClientRect 失败，已捕获：', err);
    }
    try {
      el.style.left = (payload.followX + halfW) + 'px';
      el.style.top = (payload.followY + halfH) + 'px';
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 更新拖拽物体跟随位置失败，已捕获：', err);
    }
  }

  // 拖错弹回（REQ-PTR-03）：WTJ_POINTER.onDrop 的 dropCancel 分支复位到渲染时的初始 preset
  // 位置。只处理 dropCancel 且 draggedId 匹配当前任务可拖物的情况；成功的 'drop' 分支不需要
  // 复位（任务已经判定完成，元素即将被 P1-3 的延迟移除逻辑摘掉，复位了也白复位）。
  function handleDragDropGlobal(payload) {
    if (!payload || payload.type !== 'dropCancel') {
      return;
    }
    if (payload.draggedId !== currentDragObjectId()) {
      return;
    }
    var el = activeRuntime.dragObjectEl;
    var pos = activeRuntime.dragObjectInitialPos;
    if (!el || !el.style || !pos) {
      return;
    }
    try {
      el.style.left = pos.left;
      el.style.top = pos.top;
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 拖错弹回复位失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // 二、点击任务（REQ-TASK-08）
  // ---------------------------------------------------------------------
  function renderClickTask(example) {
    var targetPos = presetAt(0);
    var targetEl = createPropEl(example.targetSprite, targetPos, 'wtj-tt-click-target');
    if (!targetEl) {
      return { elements: [], pointerIds: [] };
    }

    var targetId = 'wtj-tt-click-target-' + example.id;

    // 056：只有当 createPropEl() 真的用上了引擎（拿到一个 <canvas>）时才走 WTJ_FRAME_ANIM
    // 播放 activeState 这条路径；animInfo 非空只代表"这个 spriteFile 理论上在三个已接入引擎
    // 的道具清单里"（PROP_ANIM_STATE_MAP），createPropEl() 仍可能因为引擎缺失/play() 失败而
    // 退回静态 <img>（door/bell 或引擎完全未加载时的最终兜底）——用 targetEl.tagName 是否为
    // CANVAS 二次确认，避免"以为用了引擎但其实拿到的是 img"这种错配。
    var animInfo = resolvePropAnimInfo(example.targetSprite);
    var usingEngine = !!(animInfo && targetEl.tagName && String(targetEl.tagName).toUpperCase() === 'CANVAS');

    registerPointerTargetDefensive(targetId, {
      el: targetEl,
      accepts: ['click'],
      onClick: function () {
        if (usingEngine) {
          // 统一 { loop:false }：即使 activeState 源数据本身 loop:true（如 faucet 的
          // running），点击命中后也要求"播完一轮后 clamp 定住"而不是无限循环，见文件头
          // 「五、动效引擎接入」一节。onComplete 目前是预留 no-op（同节说明为什么本卡选择
          // "单一 activeState 播完即定格"而不是 running→closing 这类链式收尾）。
          playPropAnimDefensive(targetEl, animInfo.prop, animInfo.activeState, {
            loop: false,
            onComplete: function () {}
          });
        } else if (example.targetSpriteActive) {
          // 非动效道具、或引擎缺失/播放失败时的静态 img 回退：沿用 014 首次交付的静态切图。
          setPropSpriteSrc(targetEl, example.targetSpriteActive);
        }
        // P2-1（Fable 对抗评审）：与创建时机对称——createPropEl() 只在 wantsAnimState() 为真时
        // 才会打上 data-anim-state="idle"（见该函数实现），这里切到 active 态前也应该用同一个
        // 判据守卫，避免未来某个非动画预留的点击类 example 被无条件打上一个从未有过 idle 的
        // 孤儿 active 属性。
        if (wantsAnimState(example.targetSprite)) {
          setAnimState(targetEl, 'active');
        }
        handleTemplateComplete('click', example);
      }
    });

    return {
      elements: [targetEl],
      pointerIds: [targetId],
      // 056：供 handleTemplateComplete() 的 computeVisualHoldMs() 读取；非引擎路径为 null，
      // 沿用既有 800ms 默认 hold（见该函数与文件头「COMPLETE_VISUAL_HOLD 耦合修正」一节）。
      animProp: usingEngine ? animInfo.prop : null,
      animActiveState: usingEngine ? animInfo.activeState : null,
      completionAnchor: anchorFromPos(targetPos)
    };
  }

  // ---------------------------------------------------------------------
  // 三、寻找任务（REQ-TASK-09）
  // ---------------------------------------------------------------------
  function renderFindTask(example) {
    var elements = [];
    var pointerIds = [];

    var targetPos = presetAt(0);
    var targetEl = createPropEl(example.targetSprite, targetPos, 'wtj-tt-find-target');
    if (!targetEl) {
      return { elements: [], pointerIds: [] };
    }
    elements.push(targetEl);

    var distractors = Array.isArray(example.distractorSprites) ? example.distractorSprites : [];
    var i;
    for (i = 0; i < distractors.length; i++) {
      var dEl = createPropEl(distractors[i], presetAt(i + 1), 'wtj-tt-find-distractor');
      if (dEl) {
        elements.push(dEl);
      }
    }

    var targetId = 'wtj-tt-find-target-' + example.id;

    function onFoundIt() {
      handleTemplateComplete('find', example);
    }

    registerPointerTargetDefensive(targetId, {
      el: targetEl,
      accepts: ['hover', 'click'],
      onHover: onFoundIt,
      onClick: onFoundIt // pressOrHoverAlsoCompletes：悬停满 1 秒或点一下共享同一个完成回调。
    });
    pointerIds.push(targetId);

    return {
      elements: elements,
      pointerIds: pointerIds,
      // P2-4（Fable 对抗评审）：emphasize 阶段（30s 目标增强提示）只应该强调"目标本身"，不能
      // 连着 distractorSprites 干扰项一起强调——干扰项被强调等于视觉上泄漏了正确答案，抵消
      // 寻找任务本该有的提示效果。targetEl 恒是本函数第一个 push 进 elements 的元素，这里单独
      // 存一份引用供 handleTaskPhase() 的 emphasize 分支使用，不依赖调用方去猜 elements[0]
      // 这个隐含约定。
      emphasizeElements: [targetEl],
      completionAnchor: anchorFromPos(targetPos)
    };
  }

  // ---------------------------------------------------------------------
  // 四、按键任务（REQ-TASK-10）：不渲染任何 DOM，见文件头设计说明。
  // ---------------------------------------------------------------------
  function setupPressTask() {
    return { elements: [], pointerIds: [] };
  }

  // WTJ-20260706-010：原来只有 handlePressLetter(charUpper)，只服务 WTJ_KEYBOARD.onLetter
  // （字母/数字）。缺口：targetKey 是符号（如 ',' '[' ']' '=' '?' '/'）或 'Space'/'Enter'/
  // 方向键（'ArrowUp' 等）的按键任务永远无法命中——onSymbol/onFunctionKey 从未接线到这里。
  // 泛化成 handlePressKey(keyIdentity)，对任意"键身份"字符串统一按 toUpperCase() 比较（与
  // 原字母任务同一比较方式，字母任务本就转大写比较；符号/Space/Enter/方向键转大写不影响其
  // 唯一性，'ArrowUp'.toUpperCase() 仍是自身大小写归一化后的唯一值，不会与其它键身份碰撞）。
  // guard 仍在最前面：只有 activeRuntime.type === 'press' 时才可能完成，杂散的 Enter/方向键/
  // 符号事件在 drag/click/find 进行中任务时直接短路返回，不会误判其它类型完成。
  function handlePressKey(keyIdentity) {
    if (!activeRuntime || activeRuntime.type !== 'press') {
      return;
    }
    var example = activeRuntime.example;
    var want = (example && typeof example.targetKey === 'string') ? example.targetKey.toUpperCase() : null;
    var got = (typeof keyIdentity === 'string') ? keyIdentity.toUpperCase() : null;
    if (want !== null && got !== null && got === want) {
      handleTemplateComplete('press', example);
    }
  }

  // 保留旧名字作为别名（内部注释 REQ-TASK-10 索引与历史设计说明引用过这个名字），避免无谓改动
  // 其它引用点；本文件内目前只有下方 wireKeyboard() 这一处消费者。
  var handlePressLetter = handlePressKey;

  // WTJ_KEYBOARD.onSymbol(fn) 是 fn(char, intensity) 两个位置参数（不是 payload 对象，
  // 与 onLetter/onMilestone 同一单参数风格不同——见 keyboard.js 文件头设计说明第 26~33 行）。
  // 按键任务判定只需要 char 本身，intensity（连打衰减强度）与"是否命中 targetKey"无关，不消费。
  function handlePressSymbol(char) {
    handlePressKey(char);
  }

  // WTJ_KEYBOARD.onFunctionKey(fn) 是 fn({ key, category, intensity }) 单一 payload 对象
  // （与 onSymbol 两个位置参数的约定不同，见 keyboard.js 文件头设计说明第 23~25 行）。key 已经过
  // keyboard.js 的 normalizeFunctionKeyName() 归一化——Space 键统一是字符串 'Space'（原始
  // e.key 是单个空格字符 ' '，本文件不需要再关心这层转换），其余功能键原样透传 e.key（如
  // 'Enter'/'ArrowUp'/'ArrowDown'/'ArrowLeft'/'ArrowRight'/'Tab'/'Escape'/'Meta' 等）。
  function handlePressFunctionKey(payload) {
    if (!payload) {
      return;
    }
    handlePressKey(payload.key);
  }

  // ---------------------------------------------------------------------
  // onPhase：轻提示（hint）/目标增强（emphasize）的视觉驱动——只给已渲染的元素加/换一个 CSS
  // 类，具体呼吸光晕/闪烁/放大效果在 task-templates.css 里定义，本文件保持轻量（不引入独立的
  // JS 动画循环）。按键任务没有 DOM 元素，这里天然是 no-op。
  //
  // P2-4（Fable 对抗评审）：emphasize 阶段改为只作用于 activeRuntime.emphasizeElements（find
  // 任务是 [targetEl]，其余三类任务没有干扰项，emphasizeElements 缺省时退化为 elements 本身）——
  // 之前无差别给 elements 全体（含 find 的 distractorSprites 干扰项）加强调，等于视觉上把
  // "干扰项也一起放大发光"，抵消了寻找任务本该有的提示效果。hint 阶段维持原样，仍然作用于
  // 全部元素（一次性小弹跳，不构成"泄漏答案"的问题，卡片评审也没有把 hint 列入 P2-4 范围）。
  // ---------------------------------------------------------------------
  function handleTaskPhase(payload) {
    if (!activeRuntime || !payload) {
      return;
    }
    var cls = null;
    var targets = activeRuntime.elements;
    if (payload.phase === 'hint') {
      cls = 'wtj-tt-hint';
    } else if (payload.phase === 'emphasize') {
      cls = 'wtj-tt-emphasize';
      targets = activeRuntime.emphasizeElements || activeRuntime.elements;
    }
    if (!cls) {
      return;
    }
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      if (el && el.classList && typeof el.classList.add === 'function') {
        el.classList.add(cls);
      }
    }
  }

  // ---------------------------------------------------------------------
  // onDismiss：013 自动收起（超时/键盘转移）或外部手动 dismiss 时，清理本任务的目标视觉与
  // pointer 注册——不算失败（REQ-EXIT-04），本文件不对 dismiss 的 reason 做任何特殊处理，
  // 统一走同一套清理路径。额外顺手 flush 一次上一个已完成任务的延迟移除残留（P1-3 兜底，见
  // flushPendingRemoval() 说明），避免叠层元素跨越 dismiss 边界继续堆积。
  // ---------------------------------------------------------------------
  function handleTaskDismiss() {
    flushPendingRemoval();
    cleanupActiveRuntime();
  }

  // ---------------------------------------------------------------------
  // 问号点击接线：见文件头「任务生成」一节（含 P1-1 的 example 轮转修法）。
  // ---------------------------------------------------------------------
  function handleQuestionClicked() {
    // P1-3 兜底清理：上一个任务如果刚判定完成，它的 DOM 叠层可能还在 800ms 的"完成态可见窗口"
    // 里排队等待延迟移除（见 scheduleElementsRemoval()）。013 保证同一时刻只有一个进行中任务，
    // 但不保证上一个任务的延迟移除定时器已经触发——这里先强制 flush 一次，防止残留元素跨任务
    // 堆积在 DOM 里。
    flushPendingRemoval();

    if (activeRuntime) {
      // 013 只在 IDLE 时才会 emit questionClicked，这里是双重保险，不应该发生。
      return;
    }

    var type = drawTaskType();
    var examples = getExamplesForType(type);
    if (!examples.length) {
      console.warn('[WTJ_TASK_TEMPLATES] 类型 "' + type + '" 没有任何可用任务示例，已跳过本次问号点击。');
      questionClickCounter += 1;
      return;
    }
    // 洗牌袋（见文件头「任务生成」一节与上方 drawExampleIndex() 详细说明）：每个 type 各自维护
    // 一个 example 下标的洗牌袋，无放回抽取保证该 type 的每个 example 在一轮内都会被抽到——这就
    // 是 P1-1（Fable 对抗评审）"每个 example 都必须可达"这条硬要求现在的满足方式。
    var exampleIndex = drawExampleIndex(type, examples.length);
    var example = examples[exampleIndex];

    var taskDef = { id: example.id, type: type, voicePrompt: example.voicePrompt };

    var started = false;
    try {
      if (window.WTJ_TASK && typeof window.WTJ_TASK.startTask === 'function') {
        started = window.WTJ_TASK.startTask(taskDef);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] window.WTJ_TASK.startTask 调用失败，已捕获：', err);
      started = false;
    }

    if (!started) {
      questionClickCounter += 1;
      return;
    }

    var runtime;
    if (type === 'drag') {
      runtime = renderDragTask(example);
    } else if (type === 'click') {
      runtime = renderClickTask(example);
    } else if (type === 'find') {
      runtime = renderFindTask(example);
    } else {
      runtime = setupPressTask(example);
    }

    activeRuntime = {
      type: type,
      example: example,
      elements: (runtime && runtime.elements) || [],
      pointerIds: (runtime && runtime.pointerIds) || [],
      emphasizeElements: (runtime && runtime.emphasizeElements) || (runtime && runtime.elements) || [],
      dragObjectId: (runtime && runtime.dragObjectId) || null,
      dragObjectEl: (runtime && runtime.dragObjectEl) || null,
      dragObjectInitialPos: (runtime && runtime.dragObjectInitialPos) || null,
      // 056：仅 renderClickTask() 在真正用上引擎时会填充这两项，其余类型/回退路径均为 null，
      // 见 computeVisualHoldMs() 的消费方式。
      animProp: (runtime && runtime.animProp) || null,
      animActiveState: (runtime && runtime.animActiveState) || null,
      // WTJ-20260705-015：drag/click/find 三类填充 { leftPercent, topPercent }，press 类
      // （无 DOM）恒为 null——见 presetAt() 下方 anchorFromPos() 一节说明，供 handleTemplateComplete()
      // 通过 onTaskComplete 事件透传给 015 的任务成功即时视觉反馈消费。
      completionAnchor: (runtime && runtime.completionAnchor) || null
    };

    questionClickCounter += 1;
  }

  // ---------------------------------------------------------------------
  // 接线：防御式订阅 013/008 的事件源，任何一个缺失都不阻断本文件加载（与 task.js/pointer.js
  // 同款降级契约）。
  // ---------------------------------------------------------------------
  (function wireQuestionClicked() {
    try {
      if (window.WTJ_TASK && typeof window.WTJ_TASK.onQuestionClicked === 'function') {
        window.WTJ_TASK.onQuestionClicked(handleQuestionClicked);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 订阅 window.WTJ_TASK.onQuestionClicked 失败，已捕获：', err);
    }
  })();

  (function wireDismiss() {
    try {
      if (window.WTJ_TASK && typeof window.WTJ_TASK.onDismiss === 'function') {
        window.WTJ_TASK.onDismiss(handleTaskDismiss);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 订阅 window.WTJ_TASK.onDismiss 失败，已捕获：', err);
    }
  })();

  (function wirePhase() {
    try {
      if (window.WTJ_TASK && typeof window.WTJ_TASK.onPhase === 'function') {
        window.WTJ_TASK.onPhase(handleTaskPhase);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 订阅 window.WTJ_TASK.onPhase 失败，已捕获：', err);
    }
  })();

  (function wireKeyboard() {
    try {
      if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.onLetter === 'function') {
        window.WTJ_KEYBOARD.onLetter(handlePressLetter);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 订阅 window.WTJ_KEYBOARD.onLetter 失败，已捕获：', err);
    }
  })();

  // WTJ-20260706-010：按键任务此前只能通过 onLetter 命中（targetKey 为字母/数字），symbol /
  // Space / Enter / 方向键等 targetKey 永远无法完成任务（缺口修复）。这里新增两路订阅，复用
  // 同一个 handlePressKey() 门禁（见上方 handlePressKey() 注释）——不会误触发其余三类任务的
  // 完成，也不会写入秘密词 rolling buffer / 有效键计数（那两套状态完全由 keyboard.js/
  // secretword.js 自己维护，本文件从不碰）。
  (function wireSymbol() {
    try {
      if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.onSymbol === 'function') {
        window.WTJ_KEYBOARD.onSymbol(handlePressSymbol);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 订阅 window.WTJ_KEYBOARD.onSymbol 失败，已捕获：', err);
    }
  })();

  (function wireFunctionKey() {
    try {
      if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.onFunctionKey === 'function') {
        window.WTJ_KEYBOARD.onFunctionKey(handlePressFunctionKey);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 订阅 window.WTJ_KEYBOARD.onFunctionKey 失败，已捕获：', err);
    }
  })();

  // P1-2（Fable 对抗评审）：订阅 012 的全局 onDragMove/onDrop 渲染拖拽视觉（跟随 + 拖错弹回），
  // 见 renderDragTask() 上方 handleDragMove()/handleDragDropGlobal() 的详细说明。
  (function wireDragMove() {
    try {
      if (window.WTJ_POINTER && typeof window.WTJ_POINTER.onDragMove === 'function') {
        window.WTJ_POINTER.onDragMove(handleDragMove);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 订阅 window.WTJ_POINTER.onDragMove 失败，已捕获：', err);
    }
  })();

  (function wireDragDrop() {
    try {
      if (window.WTJ_POINTER && typeof window.WTJ_POINTER.onDrop === 'function') {
        window.WTJ_POINTER.onDrop(handleDragDropGlobal);
      }
    } catch (err) {
      console.error('[WTJ_TASK_TEMPLATES] 订阅 window.WTJ_POINTER.onDrop 失败，已捕获：', err);
    }
  })();

  // ---------------------------------------------------------------------
  // 对外冻结 API
  // ---------------------------------------------------------------------
  function getActiveTaskInfo() {
    if (!activeRuntime) {
      return null;
    }
    return { type: activeRuntime.type, taskId: activeRuntime.example.id };
  }

  function onTaskComplete(fn) {
    addSubscriber(taskCompleteSubscribers, fn);
  }

  var API = {
    VERSION: '0.1.0',
    CARD_ID: 'WTJ-20260704-014',

    getActiveTaskInfo: getActiveTaskInfo,
    onTaskComplete: onTaskComplete,

    // 测试专用，见文件头 API 列表说明；不是给其余生产代码调用的稳定契约（与 task.js/pointer.js
    // 的 _setClock 同款模式），供单测把 P1-3 的 ~800ms 完成态延迟移除快进掉。
    _setClock: _setClock,
    // 测试专用，WTJ-20260706-002：注入确定性 RNG 替换 taskRandom（默认 Math.random），供单测
    // 精确断言/复现洗牌袋（type/example 调度）的抽取序列，见文件头「任务生成」一节与
    // drawTaskType()/drawExampleIndex() 的详细说明。同款"校验参数是函数，否则 warn 并忽略"约定。
    _setRandom: _setRandom
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固：与 task.js/pointer.js/audio.js 同款——API 对象自身已 Object.freeze，这里进一步
  // 把 window 上的 WTJ_TASK_TEMPLATES 绑定本身设为不可写、不可重配置，防止整体重赋值把状态
  // 换掉。重复引入已由 IIFE 顶部守卫短路，走不到这里，因此到达时 window.WTJ_TASK_TEMPLATES
  // 必为未定义；下面判断只是二次保险（兼容无 defineProperty 环境）。
  if (!window.WTJ_TASK_TEMPLATES && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_TASK_TEMPLATES', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_TASK_TEMPLATES) {
    window.WTJ_TASK_TEMPLATES = API;
  }
})();
