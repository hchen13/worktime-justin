// WTJ-20260704-011 — 宝箱开启 + 烟花 + 一次性大奖励（window.WTJ_REWARD_CHEST）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求（不 fetch 任何东西，不访问任何
// 外部 URL）、非 module（无 import/export），以普通 <script src="reward-chest.js"> 标签加载，
// 需排在 010（slots.js）之后——本文件订阅它暴露的 WTJ_SLOTS.onFull 事件。也需要 manifest.js
// （读 rewards.chest / performance 配置）之后加载；也需要 056（frame-anim.js/
// anim-manifest.js）之后——宝箱本体的 opening 分帧动效改由 WTJ_FRAME_ANIM.play() 驱动
// （见下方「宝箱开箱动效接入」一节），调用同样走防御式包装，缺失时回退静态 <img>，不阻断。
// 也需要 005（reward-fireworks.js）之后——烟花表现改由 WTJ_REWARD_FIREWORKS.play() 驱动
// （见下方「烟花粒子系统」一节），同样走防御式包装，缺失时静默跳过烟花、不阻断宝箱本体/背景
// 光晕/音效/HUD 指示器等其余表现。与 hud.js / audio.js 的加载顺序无强依赖（调用均走下方
// 防御式包装，缺失时优雅降级为 console.warn/console.error，不阻断）。
//
// -----------------------------------------------------------------------
// WTJ-20260706-005（烟花粒子引擎抽出为可复用模块，取代本文件此前自带的 BURST_SCHEDULE 五预设
// 粒子系统）
// -----------------------------------------------------------------------
// 011 首次交付时自己实现了一整套烟花粒子物理（COLOR_PALETTE/spawnXBurst/updateParticles/
// renderFrame/tick 链，五种预设 circle/starfield/sparkler/star/heart 按 BURST_SCHEDULE 错峰
// 触发）。005 卡把"粒子物理引擎"本身抽成独立、canvas-agnostic 的可复用模块
// window.WTJ_REWARD_FIREWORKS（app/web/reward-fireworks.js），供本文件与 status-rewards.js
// （015 的任务成功即时反馈）共用同一套引擎、共享同一条全局粒子数硬预算。本文件不再自己维护
// 粒子数组/物理更新/tick 循环，只在 showChest()/showBackgroundFlash() 等既有表现之外，多调用
// 一次 playFireworksDefensive()（见该函数），把 chest-open 的高潮烟花换成引擎的
// 'molten-fountain' 形态；宝箱本体的 Canvas 仍归本文件创建/拥有，只是借给引擎画粒子——摘除该
// Canvas 前必须先 stopFireworksDefensive()（照抄 056 P1-1 修复的 stopFrameAnimDefensive() 同一
// 手法，防止引擎侧 playbacks 注册表泄漏）。BURST_SCHEDULE 的五预设精确时间点单测已整体迁移到
// tests/unit/reward-fireworks.test.mjs（molten-fountain 的分层衰减時间线断言），本文件自己的
// 单测（tests/unit/reward-chest.test.mjs）改为对 WTJ_REWARD_FIREWORKS 用 stub（只记录
// play()/stop() 调用参数，不重新验证引擎内部的粒子物理判定），与本文件对 WTJ_FRAME_ANIM 一贯
// 的"消费方只测自己这一层逻辑"策略保持一致。
//
// -----------------------------------------------------------------------
// 宝箱开箱动效接入（WTJ-20260704-056，三路技术评审定案：Canvas 逐帧 + 可注入时钟 + 构建期
// 降采样，引擎实现见 app/web/frame-anim.js，完整 API 见 app/web/anim/FRAME-ANIM-API.md）
// -----------------------------------------------------------------------
// treasure-chest 是 v1 已验收道具（不在源 manifest 的 v1_boundary.deferred_to_v2 里），本卡
// 把 showChest() 从"创建一张静态 <img> + CSS 弹出动画"改为"创建一个 <canvas> + CSS 弹出动画
// （入场编排不变）+ WTJ_FRAME_ANIM.play(canvas, 'treasure-chest', 'opening', {...})（内容
// 改为真正的开箱分帧动画）"，两层职责正交：CSS 负责元素怎么弹出到屏幕上，Canvas 内容负责画的
// 是什么，与 014（task-templates.css 的 hint/emphasize + WTJ_FRAME_ANIM 内容）同一分层方式，
// 详见 showChest()/playChestOpeningAnimDefensive() 的实现与内联注释。
//
// **复用本文件已有的 clockRef**：WTJ_FRAME_ANIM 引擎有自己独立的可注入时钟（通过它自己的
// _setClock()），不是本文件 clockRef 的一部分——两者是两个独立的定时器系统，各自可以被各自
// 的单测用 _setClock() 分别注入假时钟。本卡测试策略：reward-chest.test.mjs 用一个手写的
// WTJ_FRAME_ANIM stub（只记录 play()/stop() 调用参数，不加载 frame-anim.js 真实源码），与
// 本文件对 WTJ_SLOTS/WTJ_AUDIO 一贯的"消费方只测自己这一层逻辑，不重新验证被消费模块内部
// 判定"的既有测试策略保持一致；frame-anim.js 自身的帧号/loop/reduced-motion/onComplete
// 等判定逻辑由 tests/unit/frame-anim.test.mjs 独立覆盖。
//
// **烟花/reset/一次性/reduced-motion 逻辑全部保留不变**（本卡 056 交付时的历史记录，供追溯
// 阅读）：BURST_SCHEDULE 错峰时间线、finishSequence() 的一次性清空节奏、reset() 的外部中止
// 入口、reduced-motion 下的静态定格帧分支——全部原样保留，056 只换了 showChest() 内部"画什么"
// 这一件事。烟花的触发时机**没有**改成"等 opening 播完才开始"（尽管卡片原文字面描述是这个
// 方向），据实记录的偏离理由与详细时间线推导见 playChestOpeningAnimDefensive() 的 onComplete
// 回调内联注释。**WTJ-20260706-005 更新**：BURST_SCHEDULE 五预设那套粒子实现本身已经被整体
// 替换为调用 window.WTJ_REWARD_FIREWORKS 的 'molten-fountain' 形态（见文件头「烟花粒子系统」
// 一节），"烟花与宝箱开箱动画并行、各自独立按序列起点计时、不等 opening 播完"这条时序原则被
// 完整保留下来，只是承载它的具体粒子实现换了。
//
// -----------------------------------------------------------------------
// 职责边界（本卡 011，是最后一张核心功能卡：五槽满 → 宝箱 → 烟花 → 一次性大奖励 → 清屏 → 下一轮）
// -----------------------------------------------------------------------
// 010（slots.js）在第 5 格被填满的那一刻 emit 一次 WTJ_SLOTS.onFull(snapshot)，并且**不会
// 自动清空五槽**——它明确把"播放宝箱奖励表现，播完后调用 WTJ_SLOTS.reset() 开新一轮"这件事
// 留给本文件（见 app/web/slots/SLOTS-API.md 第 4 节「满槽 → 011 契约」）。本文件只做这一件事：
// 订阅 onFull → 播放一次性宝箱开启 + 烟花 + 补充表现形式 → 约 2.6s 后全部清空 → 调用
// WTJ_SLOTS.reset()。本文件不参与五槽的填充/去重逻辑，也不判定"该不该点亮槽"。
//
// -----------------------------------------------------------------------
// 计时驱动方式（据实记录的工程取舍）：不使用真实 requestAnimationFrame
// -----------------------------------------------------------------------
// 本文件改用与 013/014/015（task.js/task-templates.js/status-rewards.js）完全一致的「可注入
// 时钟（clockRef.setTimeout 链）+ _setClock 测试钩子」驱动整段奖励序列的调度（宝箱弹出、约
// 2.6s 后的收尾清空），而不是调用浏览器原生 requestAnimationFrame。原因：真实 rAF 的回调
// 时间戳不受 _setClock 这类可注入时钟控制，单元测试（Node vm 沙箱，没有 rAF）没有办法确定性地
// "快进"这段序列并断言其状态——而这正是本卡验收标准里明确要求持久化单测覆盖的点。用固定节拍
// （TICK_MS=16，约 60fps）的 setTimeout 链在生产环境里视觉效果与 rAF 几乎无差异（本奖励序列
// 只播放一次、约 2.6 秒，不是常驻主循环），却能让整段序列在测试沙箱里与其余奖励模块（015 三灯
// 连闪/大奖励叠层）用同一手法被确定性驱动。这是本卡在"文档建议 rAF"与"QA 强制要求的可测试性"
// 之间的工程取舍，据实记录，供 PM/TL 需要时复核。**WTJ-20260706-005 起**：烟花本身的逐帧粒子
// 模拟已经抽到 window.WTJ_REWARD_FIREWORKS（该模块有自己独立的可注入时钟，通过它自己的
// _setClock()，不是本文件 clockRef 的一部分），本文件的 clockRef 现在只驱动"序列本身的调度"
// （宝箱/背景光晕/音效何时出现、何时整体收尾），不再驱动粒子物理。
//
// -----------------------------------------------------------------------
// 表现形式选用（REQ-RWD-01，manifest.rewards.chest.formsAllowed 是产品允许的表现形式菜单，
// 不要求每次全部实现；本文件实际落地的子集见 IMPLEMENTED_FORMS）
// -----------------------------------------------------------------------
//   'fireworks'                  烟花粒子系统（见下方「烟花粒子系统」一节），验收 3/4 的落地位置。
//   'short-animation'            宝箱本体的一次性"弹出开启"（showChest()：CSS 入场编排
//                                reward-chest.css 的 wtj-rc-chest-pop + 056 起改为 Canvas
//                                逐帧驱动的真实开箱内容，见「宝箱开箱动效接入」一节）。
//   'temporary-background-change' 宝箱开启瞬间的暖金色全屏光晕闪烁，短暂后淡出
//                                （showBackgroundFlash()，reward-chest.css 的 wtj-rc-flash-pulse）。
//   'new-sfx'                    防御式播放 audio.js 已登记的 'chest-open' 音效
//                                （playChestOpenSfxDefensive()）。
// 满足验收 5「支持大贴纸/短动画/临时背景中的至少一种」——本文件实现了 short-animation 与
// temporary-background-change 两种（超过"至少一种"的门槛）。未实现 'sticker-popup-fade'：
// 与"宝箱本体的短动画"在视觉上高度重叠（都是同一张 treasure-chest.png 的弹出表现），实现两者
// 会是同一素材的重复包装而非真正的表现形式多样化，故本卡选择用背景光晕闪烁替代，做出真正不同的
// 第二种表现。
//
// -----------------------------------------------------------------------
// 烟花粒子系统（REQ-RWD-03 / REQ-AST-02，验收 3/4）——WTJ-20260706-005 起委托给
// window.WTJ_REWARD_FIREWORKS
// -----------------------------------------------------------------------
// 本文件不再自己维护粒子数组/物理更新/tick 循环/配色策略——005 起这些全部由可复用的
// window.WTJ_REWARD_FIREWORKS 引擎负责（该引擎自己的形态/性能红线/颜色策略见
// app/web/reward-fireworks.js 文件头）。本文件只在 runSequence() 里调用一次
// playFireworksDefensive()，让引擎在宝箱自己的 Canvas 上播放 'molten-fountain' 形态（TL 决策
// D2：chest-open 高潮统一采用这一形态，见 docs/design-notes/WTJ-005-reward-fireworks-plan.md
// §5），origin 取 chestOrigin()（本文件既有的宝箱位置计算，未改动）。烟花的触发时机沿用一贯
// 做法：与宝箱本体的开箱分帧动效（WTJ_FRAME_ANIM）并行播放，不等宝箱动效播完才开始（详见
// playChestOpeningAnimDefensive() 的 onComplete 回调内联注释，历史沿革未变）。宝箱 Canvas 的
// 生命周期仍归本文件（引擎只借用其 2D context 画粒子 + 借用其 tick 调度，不创建/不销毁这个
// Canvas 元素本身）；摘除该 Canvas（clearOverlayChildren()）前必须先调用
// stopFireworksDefensive()，防止引擎侧 playbacks 注册表因为"Canvas 已从 DOM 摘除但引擎仍在
// 其注册表里持有对它的引用"而泄漏（与 056 P1-1 的 stopFrameAnimDefensive() 同一手法）。
// REQ-RWD-03 五种旧预设（circle/starfield/sparkler/star/heart）+ BURST_SCHEDULE 错峰时间线 +
// COLOR_PALETTE/jitterColor() 颜色策略的精确断言已整体迁移到
// tests/unit/reward-fireworks.test.mjs（molten-fountain 形态的分层衰减时间线断言，见该文件），
// 本文件自己的单测（tests/unit/reward-chest.test.mjs）改为对 WTJ_REWARD_FIREWORKS 用 stub
// （只记录 play()/stop() 调用参数），与本文件对 WTJ_FRAME_ANIM 一贯的"消费方只测自己这一层
// 逻辑，不重新验证被消费模块内部判定"既有测试策略保持一致。
//
// -----------------------------------------------------------------------
// prefers-reduced-motion（验收里的可访问性红线，延续 009/014/015 的既有约定）
// -----------------------------------------------------------------------
// 宝箱本体 / 背景光晕两个 CSS 驱动的表现，沿用 status-rewards.css 同款手法：JS 始终添加
// "-anim" 动画类，由 reward-chest.css 的 @media (prefers-reduced-motion: reduce) 统一覆盖为
// 无动画的静态终态（不需要 JS 分支判断类名）。烟花本身的 reduced-motion 判定（TL 决策 D3：
// 静态定格一帧，吸收 007 skip-secondary 进构图）已经内置在 WTJ_REWARD_FIREWORKS.play() 内部
// （该引擎自己检测 prefers-reduced-motion，见其文件头），本文件不需要为烟花再做一次分支判断
// ——playFireworksDefensive() 无条件调用一次 play()，引擎自己决定是逐帧动态还是静态定格。
// lastReducedMotion（本文件自己的 prefersReducedMotion() 判定）仍然保留，只用于
// onChestComplete payload 的 reducedMotion 字段与 QA 断言，与烟花引擎各自独立判定（两者读的
// 是同一个浏览器媒体查询，结果理应一致，只是没有共享同一次判定调用）。仍然照常经过完整的
// TOTAL_SEQUENCE_MS 展示时长后调用 WTJ_SLOTS.reset()——展示时长与移除时机不变。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_REWARD_CHEST，Object.freeze 冻结 + 绑定加固）
// -----------------------------------------------------------------------
//   onChestComplete(fn)   订阅"一次宝箱奖励序列自然播完"事件（已调用 WTJ_SLOTS.reset() 之后
//                         emit），fn({ ts, reducedMotion, forms, presetTypesFired })。多订阅 +
//                         逐个 try/catch 隔离。外部调用 reset() 中止播放不会触发本事件（那是
//                         "被中止"，不是"自然播完"）。presetTypesFired 自 005 起恒为
//                         ['molten-fountain']（见 IMPLEMENTED_FIREWORKS_STYLE 一节），保留
//                         这个字段名是为了不破坏既有订阅者的字段形状。
//   getState()            返回 { playing, reducedMotion, maxParticles, configuredForms,
//                         implementedForms, fireworksStyle, spriteResolved }，供 QA 断言。
//                         WTJ-20260706-005 起移除了 particleCount/configuredPresetTypes/
//                         implementedPresetTypes/colorStrategy 四个字段——它们描述的是本文件
//                         已不再拥有的旧粒子系统内部状态，改问
//                         window.WTJ_REWARD_FIREWORKS.getState()（particleCount 是跨全部并发
//                         effect 的共享值，不专属于宝箱这一个 playback）。新增 fireworksStyle
//                         字段说明本文件目前调用引擎的哪个形态。
//   reset()               外部中止入口（如家长退出 / 新会话）：立即停止任何进行中的奖励播放、
//                         清空 Canvas 与 DOM 叠层子元素、取消所有挂起的定时器。**不会**级联调用
//                         WTJ_SLOTS.reset()——这是"叫停本模块自己的播放"，不是"模拟一次自然播完"，
//                         与 015（status-rewards.js）reset() 同一取舍（该函数也不会反过来通知
//                         014）。
//   _setClock(clock)      测试专用（与 task.js/pointer.js/task-templates.js/status-rewards.js
//                         同款模式），供单测把整段奖励序列快进掉，不是给其余生产代码调用的稳定
//                         契约。WTJ-20260706-005 起不再驱动粒子模拟本身（那部分已经是
//                         WTJ_REWARD_FIREWORKS 自己的 _setClock，两者是独立的时钟系统）。
//
// -----------------------------------------------------------------------
// REQ-RWD-01~03 + REQ-AST-02/06 逐条落地位置索引（供 PM/QA 对照）：
//   REQ-RWD-01（一次性表现，不长期占屏；formsAllowed 菜单）：TOTAL_SEQUENCE_MS 控制整段序列
//               2.6s 后 finishSequence() 清空 Canvas + 移除 DOM 子元素；IMPLEMENTED_FORMS 是
//               formsAllowed 菜单的已落地子集（fireworks/short-animation/
//               temporary-background-change/new-sfx）。
//   REQ-RWD-02（宝箱开启后清五槽进入下一轮）：finishSequence() → callSlotsResetDefensive()
//               防御式调用 window.WTJ_SLOTS.reset()。
//   REQ-RWD-03（烟花 Canvas 生成，预设类型，颜色 HSL/HSV 微调）：WTJ-20260706-005 起委托给
//               window.WTJ_REWARD_FIREWORKS 的 'molten-fountain' 形态落地（见该模块文件头）。
//   REQ-AST-02（烟花粒子属于代码生成类素材，不预置贴图）：WTJ_REWARD_FIREWORKS 全部由
//               Canvas2D 代码生成（含构建期预渲染的发光贴图，仍是代码生成而非外部美术贴图
//               文件），不引用任何设计交付的烟花贴图文件。
//   REQ-AST-06（宝箱贴图）：resolveSpritePath(getSpriteFile()) 引用已验收的
//               app/web/assets/sprites/treasure-chest.png（manifest.rewards.chest.sprite）。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 重复引入守卫（与 009/010/012~015 同款）：本模块只应被引入一次。
  // ---------------------------------------------------------------------
  if (window.WTJ_REWARD_CHEST) {
    return;
  }

  // ---------------------------------------------------------------------
  // manifest 访问器：与 slots.js/status-rewards.js 同一模式。缺失字段一律防御式回退到下方
  // 最小默认值并 console.warn，不阻断初始化。
  // ---------------------------------------------------------------------
  function getManifest() {
    if (window.WTJ_MANIFEST) {
      return window.WTJ_MANIFEST;
    }
    console.warn('[WTJ_REWARD_CHEST] window.WTJ_MANIFEST 未找到（manifest.js 未加载或加载失败），回退到内置最小默认值。');
    return null;
  }

  var MANIFEST = getManifest();
  var CHEST_CFG = (MANIFEST && MANIFEST.rewards && MANIFEST.rewards.chest) ? MANIFEST.rewards.chest : null;
  var PERF_CFG = (MANIFEST && MANIFEST.performance) ? MANIFEST.performance : null;

  var DEFAULT_SPRITE = 'sprites/treasure-chest.png';
  var DEFAULT_FORMS_ALLOWED = ['fireworks', 'sticker-popup-fade', 'short-animation', 'temporary-background-change', 'new-sfx'];
  var DEFAULT_MAX_PARTICLES = 300;

  function getSpriteFile() {
    if (CHEST_CFG && typeof CHEST_CFG.sprite === 'string' && CHEST_CFG.sprite.length > 0) {
      return CHEST_CFG.sprite;
    }
    return DEFAULT_SPRITE;
  }

  function getConfiguredForms() {
    if (CHEST_CFG && Array.isArray(CHEST_CFG.formsAllowed) && CHEST_CFG.formsAllowed.length > 0) {
      return CHEST_CFG.formsAllowed;
    }
    return DEFAULT_FORMS_ALLOWED;
  }

  // WTJ-20260706-005：仍保留（getState().maxParticles 向后兼容 QA 断言），但不再用于本文件自己
  // 的粒子生成裁剪——那部分已经委托给 window.WTJ_REWARD_FIREWORKS 自己的同名逻辑。
  function getMaxParticles() {
    if (CHEST_CFG && CHEST_CFG.fireworks && typeof CHEST_CFG.fireworks.maxParticles === 'number' && CHEST_CFG.fireworks.maxParticles > 0) {
      return CHEST_CFG.fireworks.maxParticles;
    }
    if (PERF_CFG && typeof PERF_CFG.maxParticles === 'number' && PERF_CFG.maxParticles > 0) {
      return PERF_CFG.maxParticles;
    }
    return DEFAULT_MAX_PARTICLES;
  }

  // 本文件实际落地的表现形式子集（见文件头「表现形式选用」一节）。
  var IMPLEMENTED_FORMS = ['fireworks', 'short-animation', 'temporary-background-change', 'new-sfx'];

  // WTJ-20260706-005：本文件调用 WTJ_REWARD_FIREWORKS 时使用的形态 id（TL 决策 D2），供
  // getState().fireworksStyle 与 onChestComplete payload 的 presetTypesFired 字段引用。
  var FIREWORKS_STYLE_ID = 'molten-fountain';

  // ---------------------------------------------------------------------
  // 素材路径解析：与 secretword.js 的 resolveSpritePath() 同一模式（见
  // app/web/assets/sprites/PROVENANCE.md「运行时路径约定与已知偏离」）。
  // manifest.rewards.chest.sprite 字面值 'sprites/treasure-chest.png' 需要补 'assets/' 前缀
  // 才能对应实际文件 app/web/assets/sprites/treasure-chest.png（已在本卡开工前由 009 复制到位）。
  // ---------------------------------------------------------------------
  function resolveSpritePath(spriteFile) {
    if (typeof spriteFile !== 'string' || spriteFile.length === 0) return null;
    if (spriteFile.indexOf('assets/') === 0) return spriteFile;
    if (spriteFile.indexOf('sprites/') === 0) return 'assets/' + spriteFile;
    return spriteFile;
  }

  var CHEST_SPRITE_PATH = resolveSpritePath(getSpriteFile());

  // ---------------------------------------------------------------------
  // 订阅者管理（onChestComplete）：与 009/010/012~015 完全同款多订阅者 + 逐个 try/catch 模式。
  // ---------------------------------------------------------------------
  var chestCompleteSubscribers = [];

  function addSubscriber(list, fn) {
    if (typeof fn !== 'function') {
      console.warn('[WTJ_REWARD_CHEST] 订阅回调必须是函数，已忽略此次注册。');
      return;
    }
    list.push(fn);
  }

  function emit(list, arg) {
    var i;
    for (i = 0; i < list.length; i++) {
      try {
        list[i](arg);
      } catch (err) {
        console.error('[WTJ_REWARD_CHEST] 订阅回调抛出异常，已捕获：', err);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 可注入时钟（默认真实 setTimeout/clearTimeout/Date.now；测试用 _setClock 整体或部分替换，
  // 与 task.js/pointer.js/task-templates.js/status-rewards.js 同款模式）。整段奖励序列的调度
  // （宝箱弹出、五种烟花错峰迸发、逐帧粒子模拟、收尾清空）全部经由本时钟驱动。
  // ---------------------------------------------------------------------
  var clockRef = {
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function (id) { clearTimeout(id); },
    now: function () { return Date.now(); }
  };

  function _setClock(clock) {
    if (!clock || typeof clock !== 'object') {
      console.warn('[WTJ_REWARD_CHEST] _setClock: 参数必须是对象，已忽略。');
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
  // WTJ_SLOTS / WTJ_AUDIO 防御式调用包装（两者均可能缺失/未加载）。
  // ---------------------------------------------------------------------
  function callSlotsResetDefensive() {
    try {
      if (window.WTJ_SLOTS && typeof window.WTJ_SLOTS.reset === 'function') {
        window.WTJ_SLOTS.reset();
      } else {
        console.warn('[WTJ_REWARD_CHEST] window.WTJ_SLOTS.reset 未找到，跳过清槽/开新一轮（防御式降级）。');
      }
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] 调用 window.WTJ_SLOTS.reset 失败，已捕获：', err);
    }
  }

  // -----------------------------------------------------------------------
  // WTJ-20260704-083 返工（PM 打回①，footer 常驻宝箱三态指示器接线）：hud.js 新增了一个
  // footer 右侧 lane 里全程可见的宝箱指示器（`.wtj-hud-chest`，与本文件下面的一次性开箱
  // Canvas 序列是两个独立视觉），随发现槽填充进度在 Disabled/Active 间切换，并通过
  // `WTJ_HUD.setChestOpen(isOpen)` 由本文件在序列开始/结束时显式接管切到 Open——082 明确
  // "打开态不是第三张静态图"，就是本文件这段序列本身在播放的意思。防御式调用（与本文件对
  // WTJ_SLOTS/WTJ_AUDIO 一贯的包装同款）：hud.js 未加载/无该方法时静默跳过，不阻断奖励序列。
  // -----------------------------------------------------------------------
  function callHudSetChestOpenDefensive(isOpen) {
    try {
      if (window.WTJ_HUD && typeof window.WTJ_HUD.setChestOpen === 'function') {
        window.WTJ_HUD.setChestOpen(isOpen);
      }
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] 调用 window.WTJ_HUD.setChestOpen 失败，已捕获：', err);
    }
  }

  function playChestOpenSfxDefensive() {
    try {
      if (window.WTJ_AUDIO && typeof window.WTJ_AUDIO.playSfx === 'function') {
        var result = window.WTJ_AUDIO.playSfx('chest-open');
        if (result && typeof result.then === 'function') {
          result.then(null, function (err) {
            console.error('[WTJ_REWARD_CHEST] window.WTJ_AUDIO.playSfx 返回的 Promise 被 reject，已捕获：', err);
          });
        }
      }
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] window.WTJ_AUDIO.playSfx 调用失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // prefers-reduced-motion 检测：与 status-rewards.js 的 prefersReducedMotion() 同款实现。
  // ---------------------------------------------------------------------
  function prefersReducedMotion() {
    try {
      if (typeof window.matchMedia === 'function') {
        var mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        return !!(mql && mql.matches);
      }
    } catch (err) {
      console.warn('[WTJ_REWARD_CHEST] matchMedia 检测失败，按不启用 reduced-motion 处理，已捕获：', err);
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // DOM 叠层：懒创建的单一 overlay root（与 status-rewards.js 的 ensureOverlayRoot() 同款持久化
  // 单例策略——root 容器本身跨轮次复用不销毁，每轮真正展示内容的子元素在序列结束时整体清空）。
  // document 缺失（如本文件被非浏览器环境的测试 harness 用 stub window 加载而不提供 document）
  // 时防御式跳过，不抛错。
  // ---------------------------------------------------------------------
  var overlayRoot = null;
  var overlayChildren = []; // 当前这一轮的所有子元素（canvas + chest 图 + 背景光晕），一次性移除用。

  function ensureOverlayRoot() {
    if (overlayRoot) {
      return overlayRoot;
    }
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function' || !document.body) {
      return null;
    }
    try {
      var root = document.createElement('div');
      root.className = 'wtj-rc-root';
      if (typeof root.setAttribute === 'function') {
        root.setAttribute('aria-hidden', 'true');
      }
      document.body.appendChild(root);
      overlayRoot = root;
      return overlayRoot;
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] 创建奖励叠层容器失败，已捕获：', err);
      return null;
    }
  }

  // 056（Fable 对抗评审 P1-1，内存泄漏修复）：宝箱本体现在是一个交给 WTJ_FRAME_ANIM 播放
  // 'opening' 的 <canvas>（见 showChest()）。引擎侧的 non-loop playback 播完后**只停 tick、
  // 不会自动把自己从内部 playbacks 注册表移除**（frame-anim.js 的 tick() 到末帧后直接 return，
  // 只有显式 stop() 才 splice 出注册表）——所以每一轮宝箱都新建一个 canvas，若移除 DOM 时不
  // 调 stop()，旧的 playback 项会永久留在引擎注册表里，连带一张 detached 的 256×256 canvas
  // (~262KB) + 2D context 无法回收，getState().activePlaybacks 逐轮无界增长。在 4GB 目标机
  // 的"儿童长时段连续使用"场景下这是实打实的泄漏。这里仿 014 的 stopPropAnimDefensive()：
  // 移除任何叠层元素前都防御式调一次 WTJ_FRAME_ANIM.stop(el)。对非引擎管理的元素（烟花
  // canvas、静态 img 回退、背景光晕 div）调 stop() 是安全 no-op（引擎在注册表里找不到匹配的
  // 播放态直接返回），因此可以无条件对每个 overlay 子元素调用，不需要先判断它是不是宝箱 canvas。
  function stopFrameAnimDefensive(el) {
    try {
      if (el && window.WTJ_FRAME_ANIM && typeof window.WTJ_FRAME_ANIM.stop === 'function') {
        window.WTJ_FRAME_ANIM.stop(el);
      }
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] window.WTJ_FRAME_ANIM.stop 调用失败，已捕获：', err);
    }
  }

  function removeElementDefensive(el) {
    if (!el) return;
    stopFrameAnimDefensive(el); // P1-1：摘 DOM 前先停引擎播放，避免 playbacks 注册表泄漏（见上）。
    try {
      if (typeof el.remove === 'function') {
        el.remove();
      } else if (el.parentNode && typeof el.parentNode.removeChild === 'function') {
        el.parentNode.removeChild(el);
      }
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] 移除奖励叠层元素失败，已捕获：', err);
    }
  }

  // 清空上一轮叠层子元素，保证同一时刻只有一批叠层元素在 DOM 里，不堆积（REQ-RWD-01「一次性
  // 不长期占屏」的落地方式之一）。
  function clearOverlayChildren() {
    // WTJ-20260706-005：摘除烟花 Canvas 前必须先 stop() 掉引擎里对应的这次播放（照抄 056
    // P1-1 修复的 stopFrameAnimDefensive() 同一手法），防止 WTJ_REWARD_FIREWORKS 内部
    // playbacks 注册表因为"Canvas 已从 DOM 摘除但引擎仍持有引用"而泄漏。函数名未改（沿用
    // overlayChildren 里包含 chest canvas/烟花 canvas/背景光晕等全部子元素的既有含义），
    // 这里统一在移除任何子元素之前先做这一步。
    stopFireworksDefensive();
    var i;
    for (i = 0; i < overlayChildren.length; i++) {
      removeElementDefensive(overlayChildren[i]);
    }
    overlayChildren = [];
    canvasEl = null;
    ctx = null;
  }

  function createOverlayChild(tag, className) {
    var root = ensureOverlayRoot();
    if (!root) return null;
    try {
      var el = document.createElement(tag);
      el.className = className;
      if (typeof el.setAttribute === 'function') {
        el.setAttribute('aria-hidden', 'true');
      }
      root.appendChild(el);
      overlayChildren.push(el);
      return el;
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] 创建奖励叠层子元素失败，已捕获：', err);
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // Canvas + 2D context（每轮新建，随 clearOverlayChildren() 一并移除，避免跨轮次尺寸/状态残留）。
  // ---------------------------------------------------------------------
  var canvasEl = null;
  var ctx = null;

  function ensureCanvas() {
    if (canvasEl) return canvasEl;
    var el = createOverlayChild('canvas', 'wtj-rc-canvas');
    if (!el) return null;
    var w = (typeof window.innerWidth === 'number' && window.innerWidth > 0) ? window.innerWidth : 800;
    var h = (typeof window.innerHeight === 'number' && window.innerHeight > 0) ? window.innerHeight : 600;
    try {
      el.width = w;
      el.height = h;
      if (typeof el.getContext === 'function') {
        ctx = el.getContext('2d');
      }
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] 初始化 Canvas 2D context 失败，已捕获：', err);
      ctx = null;
    }
    canvasEl = el;
    return canvasEl;
  }

  // WTJ-20260705-019（移植 001 Phase A，req1/req4）：宝箱本体从水平居中的 footer 区域挪到
  // footer **右侧**（见 reward-chest.css `.wtj-rc-chest` 顶部说明），这里的烟花发射原点同步
  // 改成右下角，与 CSS 视觉锚点保持一致的数值来源——直接复用 hud.css `.wtj-hud-chest-lane` 的
  // 锚点数值（right: clamp(16px, 4vw, 32px)；bottom: 14px），保证烟花从 footer 右侧宝箱迸发，
  // 而不是从画面底部中央炸开（那样会和挪走的宝箱视觉对不上）。canvasEl.width/height 就是
  // window.innerWidth/innerHeight（见 createFireworksCanvas()），可以直接当作 CSS 里的
  // 视口宽度来复算 clamp() 的 vw 项。不追加 hud.css 里 max-width:640px 断点的移动端数值——
  // 那只是让发射原点在窄屏下略微偏离几像素，不影响功能，保持这个函数的实现简单。
  var CHEST_LANE_RIGHT_MIN_PX = 16;
  var CHEST_LANE_RIGHT_VW_PERCENT = 4;
  var CHEST_LANE_RIGHT_MAX_PX = 32;
  var CHEST_LANE_BOTTOM_PX = 14;

  function computeChestLaneRightOffsetPx(viewportWidthPx) {
    var vwValue = (CHEST_LANE_RIGHT_VW_PERCENT / 100) * viewportWidthPx;
    if (vwValue < CHEST_LANE_RIGHT_MIN_PX) return CHEST_LANE_RIGHT_MIN_PX;
    if (vwValue > CHEST_LANE_RIGHT_MAX_PX) return CHEST_LANE_RIGHT_MAX_PX;
    return vwValue;
  }

  function chestOrigin() {
    var w = canvasEl ? canvasEl.width : 800;
    var h = canvasEl ? canvasEl.height : 600;
    var rightOffsetPx = computeChestLaneRightOffsetPx(w);
    return { x: w - rightOffsetPx, y: h - CHEST_LANE_BOTTOM_PX };
  }

  // ---------------------------------------------------------------------
  // WTJ-20260706-005：颜色策略 / 粒子物理 / 渲染 / tick 循环全部委托给
  // window.WTJ_REWARD_FIREWORKS（见该模块文件头「三种形态」「性能红线落地」两节），本文件不再
  // 自己维护这些——playFireworksDefensive()/stopFireworksDefensive() 两个函数（定义在下方
  // chestOrigin() 之后）是本文件与引擎之间唯一的接口。
  // ---------------------------------------------------------------------

  var fireworksHandle = null; // WTJ_REWARD_FIREWORKS.play() 返回的不透明 handle，供 stop() 用。

  // 播放烟花（chest-open 高潮，'molten-fountain' 形态，TL 决策 D2）：防御式调用，引擎缺失/加载
  // 失败时静默降级为 console.warn，不阻断宝箱本体/背景光晕/音效等其余表现。origin 取
  // chestOrigin()（本文件既有的宝箱位置计算，未改动）；不传 tier，使用引擎自己的全局 tier 合成
  // 逻辑（manifest 配置 + 自适应降级）。onComplete 只用于把本地 fireworksHandle 清回 null（引擎
  // 自然播完后这个 handle 已经从其内部注册表移除，留着旧值没有意义，纯粹是本文件自己的记账，不
  // 影响任何对外可见行为）。
  function playFireworksDefensive() {
    try {
      if (window.WTJ_REWARD_FIREWORKS && typeof window.WTJ_REWARD_FIREWORKS.play === 'function') {
        fireworksHandle = window.WTJ_REWARD_FIREWORKS.play(FIREWORKS_STYLE_ID, {
          canvas: canvasEl,
          origin: chestOrigin(),
          onComplete: function () {
            fireworksHandle = null;
          }
        });
      } else {
        console.warn('[WTJ_REWARD_CHEST] window.WTJ_REWARD_FIREWORKS 未找到（reward-fireworks.js 未加载或加载失败），烟花表现不可用（防御式降级，其余奖励表现不受影响）。');
      }
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] window.WTJ_REWARD_FIREWORKS.play 调用失败，已捕获：', err);
    }
  }

  // 摘除烟花 Canvas（clearOverlayChildren()）前必须先调用本函数：与 056 P1-1 修复的
  // stopFrameAnimDefensive() 同一手法——先叫引擎 stop() 掉这次播放（从其内部 playbacks 注册表
  // 移除），再摘 DOM，避免"Canvas 已从 DOM 摘除但引擎仍在其注册表里持有引用"式的泄漏。对
  // fireworksHandle 已经是 null（引擎已自然播完/从未成功 play()）的情况是安全的 no-op。
  function stopFireworksDefensive() {
    try {
      if (fireworksHandle !== null && window.WTJ_REWARD_FIREWORKS && typeof window.WTJ_REWARD_FIREWORKS.stop === 'function') {
        window.WTJ_REWARD_FIREWORKS.stop(fireworksHandle);
      }
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] window.WTJ_REWARD_FIREWORKS.stop 调用失败，已捕获：', err);
    } finally {
      fireworksHandle = null;
    }
  }

  // ---------------------------------------------------------------------
  // 宝箱本体（short-animation）+ 背景光晕闪烁（temporary-background-change）：与
  // status-rewards.js 的 showRewardOverlay() 同一手法——始终添加 "-anim" 动画类，
  // prefers-reduced-motion 由 reward-chest.css 统一覆盖为静态终态，JS 不需要按 reducedMotion
  // 分支切换类名。这个 "-anim" CSS 类驱动的是宝箱本体的**入场编排**（缩小态弹出/回弹/轻微
  // 摇晃，wtj-rc-chest-pop 关键帧，纯 position/scale/opacity/rotate）——056 卡起，宝箱内容
  // 本身（是否在"开合"）改由下面的 WTJ_FRAME_ANIM 引擎逐帧驱动，两者是正交的两层：CSS 负责
  // "这个元素怎么出现在屏幕上"，Canvas 帧内容负责"这个元素画的是什么"，与 014
  // （task-templates.css 的 hint/emphasize 类 + WTJ_FRAME_ANIM 内容）同一分层方式。
  // ---------------------------------------------------------------------

  // 056：从 overlayChildren 里移除一个元素，同时保持数组一致（createOverlayChild() 已经把
  // 它 push 进 overlayChildren；这里用于"元素已创建但决定不用它"的极少数防御式回退场景，见
  // showChest()），避免 clearOverlayChildren() 之后残留一个已经不在 DOM 里的悬空引用。
  function removeOverlayChild(el) {
    var idx = overlayChildren.indexOf(el);
    if (idx !== -1) {
      overlayChildren.splice(idx, 1);
    }
    removeElementDefensive(el);
  }

  // 056：宝箱本体是否能用 WTJ_FRAME_ANIM 播放 'opening' 分帧动效，只取决于引擎是否加载——
  // treasure-chest 是 v1 已验收道具（不在 v1_boundary.deferred_to_v2 里），理论上这里应该
  // 恒为 true；仍然做防御式检查，覆盖"frame-anim.js 加载失败/被移除"这类极端场景。
  function canUseFrameAnimForChest() {
    try {
      return !!(window.WTJ_FRAME_ANIM && typeof window.WTJ_FRAME_ANIM.play === 'function');
    } catch (err) {
      return false;
    }
  }

  // 056：把 WTJ_FRAME_ANIM.play() 的调用与 onComplete 回调集中在这一个函数里，方便对照
  // FRAME-ANIM-API.md 第 9 节的分工说明阅读。
  function playChestOpeningAnimDefensive(canvasEl) {
    try {
      return !!window.WTJ_FRAME_ANIM.play(canvasEl, 'treasure-chest', 'opening', {
        loop: false,
        onComplete: function () {
          // 据实记录的一处刻意偏离（卡片原文字面描述是"onComplete 触发现有烟花/reward-pop"）：
          // 烟花（WTJ_REWARD_FIREWORKS 的 'molten-fountain' 形态，950ms）与宝箱开箱动画各自
          // 独立按**序列起点**计时并行播放，不是"等宝箱开箱动画播完（约 500ms，5 帧 @10fps）
          // 才开始炸"。这条时间线此前由 tests/unit/reward-chest.test.mjs 的逐时间点粒子数量
          // 断言精确锁定（WTJ-20260706-005 起已整体迁移到 tests/unit/reward-fireworks.test.mjs，
          // 断言对象换成了 molten-fountain 的分层衰减时间线，见该文件），本文件这里保留"并行、
          // 各自独立计时"的现状不变。若 PM/DESIGN 认定"烟花必须等宝箱可见地打开之后才炸"是强制
          // 产品要求，需要重新设计触发时机并同步更新 reward-fireworks.test.mjs 里的时间线断言，
          // 不是本卡能顺手做的小改动，留作交接注记。onComplete 暂时是 no-op。
        }
      });
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] window.WTJ_FRAME_ANIM.play 调用失败，已捕获：', err);
      return false;
    }
  }

  // 返回值仅供内部/单测使用：true 表示宝箱本体已经交给引擎播放分帧动效（canvas），false
  // 表示回退到了原静态 <img> 占位（door/bell 在 014 里的等价回退在这里体现为"engine 缺失/
  // play() 失败"这一支，treasure-chest 本身不属于 v1_boundary.deferred_to_v2）。
  function showChest() {
    if (canUseFrameAnimForChest()) {
      var canvasEl = createOverlayChild('canvas', 'wtj-rc-chest wtj-rc-anim');
      if (canvasEl) {
        if (playChestOpeningAnimDefensive(canvasEl)) {
          return true;
        }
        // 引擎"看起来可用"但 play() 仍返回 false（例如 anim-manifest.js 未接入
        // treasure-chest 条目）：已创建的空 canvas 不会画出任何内容，比完全没有宝箱视觉更
        // 糟——显式移除它，改走下面的静态 img 回退路径，保证"最终只留一个宝箱本体元素"。
        removeOverlayChild(canvasEl);
      }
    }
    var img = createOverlayChild('img', 'wtj-rc-chest wtj-rc-anim');
    if (img) {
      if (CHEST_SPRITE_PATH) img.src = CHEST_SPRITE_PATH;
      img.alt = '';
    }
    return false;
  }

  function showBackgroundFlash() {
    createOverlayChild('div', 'wtj-rc-flash wtj-rc-anim');
  }

  // ---------------------------------------------------------------------
  // 序列状态机
  // ---------------------------------------------------------------------
  var TOTAL_SEQUENCE_MS = 2600; // 与 reward-chest.css 的 wtj-rc-chest-pop 动画时长 2.6s 对应，
                                // 落在 TL 架构指令给出的"约 2-3 秒"区间内（略超，属"约"字容差）。
  var playing = false;
  var lastReducedMotion = false;
  var sequenceTimerId = null;

  function cancelSequenceTimer() {
    if (sequenceTimerId !== null) {
      clockRef.clearTimeout(sequenceTimerId);
      sequenceTimerId = null;
    }
  }

  // WTJ-20260706-005：不再清空本地 particles 数组（已不存在），只做 Canvas 像素层面的兜底
  // 清空——正常情况下 stopFireworksDefensive()（见 clearOverlayChildren()）已经会让引擎自己的
  // renderGroup() 清空这张 Canvas，这里是双保险（例如引擎缺失/stop() 抛错时，仍保证 Canvas
  // 不会带着最后一帧烟花内容被摘除前露出一瞬间）。
  function clearFireworksCanvas() {
    if (ctx && canvasEl) {
      try {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      } catch (err) {
        console.error('[WTJ_REWARD_CHEST] 清空烟花 Canvas 失败，已捕获：', err);
      }
    }
  }

  function finishSequence() {
    sequenceTimerId = null;
    clearFireworksCanvas();
    clearOverlayChildren(); // 摘除烟花 Canvas 前会先 stopFireworksDefensive()，见该函数定义。
    playing = false;
    // WTJ-20260704-083 返工：序列自然播完，footer 常驻宝箱指示器退出 Open——回落到 Active 或
    // Disabled（按当前实际填槽情况，见 hud.js setChestOpen() 实现），随后 callSlotsResetDefensive()
    // 触发的 WTJ_SLOTS.reset() 会级联调用 hud.js 的 clearSlots()，把它再强制回落 Disabled。
    callHudSetChestOpenDefensive(false);

    var payload = {
      ts: clockRef.now(),
      reducedMotion: lastReducedMotion,
      forms: IMPLEMENTED_FORMS.slice(),
      // WTJ-20260706-005：本文件现在只调用引擎的一个形态（molten-fountain，TL 决策 D2），
      // 恒为单元素数组——保留这个字段名/形状是为了不破坏既有订阅者对 payload 的字段假设。
      presetTypesFired: [FIREWORKS_STYLE_ID]
    };

    callSlotsResetDefensive();
    emit(chestCompleteSubscribers, payload);
  }

  // P2-1（Fable 对抗评审，闭环健壮性兜底）：handleSlotsFull() 先把 playing 置 true 再调用
  // runSequence()。runSequence 内多数子调用各自已 try/catch，但若某个未被单独包裹的调用抛错
  // （如坏时钟注入的 clockRef.setTimeout、img.src setter 抛异常等）且此时序列的收尾定时器
  // sequenceTimerId 尚未挂上，playing 会永久卡在 true、finishSequence 永不被调用 → 从不调用
  // WTJ_SLOTS.reset() → 五槽永久保持"满"（010 满槽后在 reset 之前不再 emit onFull）→ 整个
  // "发现槽 → 宝箱 → 下一轮"游戏闭环死锁，只能靠外部 WTJ_REWARD_CHEST.reset() 手动解救。真实
  // 浏览器几乎不会抛，但闭环健壮性值得兜底：把整段启动包在 try/catch 里，任何异常都走一次完整
  // 收尾（finishSequence：清空 Canvas/DOM + 取消定时器 + playing 复位 + 调用 WTJ_SLOTS.reset()
  // 恢复闭环）。finishSequence 自身也可能因坏时钟抛错，故再包一层，兜底强制 playing = false，
  // 保证下一次 onFull 一定能重新触发（不死锁）。
  function runSequence() {
    lastReducedMotion = prefersReducedMotion();
    // WTJ-20260704-083 返工：footer 常驻宝箱指示器切到 Open——本序列本身就是"打开"这个动作的
    // 可见表现，见上方 callHudSetChestOpenDefensive() 说明。放在 try 之外/之前也安全，该函数
    // 内部已自行 try/catch，不会让本次调用成为 P2-1 兜底逻辑要处理的抛错源。
    callHudSetChestOpenDefensive(true);

    try {
      ensureCanvas();
      showChest();
      showBackgroundFlash();
      playChestOpenSfxDefensive();

      // WTJ-20260706-005：烟花委托给 WTJ_REWARD_FIREWORKS，该引擎内部自己判定
      // prefers-reduced-motion 并切换到静态定格一帧（TL 决策 D3），本文件这里不再需要按
      // lastReducedMotion 分支处理烟花本身。
      playFireworksDefensive();

      sequenceTimerId = clockRef.setTimeout(finishSequence, TOTAL_SEQUENCE_MS);
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] 奖励序列启动过程中抛出异常，已捕获；执行兜底收尾（清空叠层 + 调用 WTJ_SLOTS.reset() 恢复游戏闭环，避免五槽永久卡满死锁）：', err);
      try {
        cancelSequenceTimer();
        finishSequence();
      } catch (err2) {
        console.error('[WTJ_REWARD_CHEST] 兜底收尾自身也抛错（如坏时钟），强制复位 playing 标志以保证下一轮可触发：', err2);
        playing = false;
      }
    }
  }

  // ---------------------------------------------------------------------
  // 触发入口：订阅 010（slots.js）的 WTJ_SLOTS.onFull（见文件头「职责边界」一节）。
  // 并发守卫（TL 架构指令第 10 条）：理论上五槽满后 010 在 reset() 之前不会再 emit onFull，
  // 但仍加一层防御——播放期间再收到 onFull 一律忽略，不叠加第二套奖励序列。
  // ---------------------------------------------------------------------
  function handleSlotsFull(snapshot) {
    if (playing) {
      console.warn('[WTJ_REWARD_CHEST] 收到 WTJ_SLOTS.onFull，但奖励序列正在播放中，已忽略（并发守卫）。');
      return;
    }
    playing = true;
    runSequence();
  }

  (function wireSlotsFull() {
    try {
      if (window.WTJ_SLOTS && typeof window.WTJ_SLOTS.onFull === 'function') {
        window.WTJ_SLOTS.onFull(handleSlotsFull);
      } else {
        console.warn('[WTJ_REWARD_CHEST] window.WTJ_SLOTS.onFull 未找到（010 未加载或加载失败），宝箱奖励序列无法被自动触发（防御式降级，其余 API 仍可用）。');
      }
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] 订阅 window.WTJ_SLOTS.onFull 失败，已捕获：', err);
    }
  })();

  // ---------------------------------------------------------------------
  // 对外 API
  // ---------------------------------------------------------------------
  function onChestComplete(fn) {
    addSubscriber(chestCompleteSubscribers, fn);
  }

  function reset() {
    cancelSequenceTimer();
    clearFireworksCanvas();
    clearOverlayChildren(); // 摘除烟花 Canvas 前会先 stopFireworksDefensive()，见该函数定义。
    playing = false;
    // WTJ-20260704-083 返工：外部中止（家长退出等）同样应该让 footer 常驻宝箱指示器退出
    // Open——不这样做的话，指示器会永久卡在"看起来在打开"，而实际 Canvas 序列已经被中止、
    // 五槽也可能仍是满的（reset() 不级联 WTJ_SLOTS.reset()，见本函数文件头说明），没有其它
    // 路径能把它带回正确的 Active/Disabled 视觉。
    callHudSetChestOpenDefensive(false);
  }

  function getState() {
    return {
      playing: playing,
      reducedMotion: lastReducedMotion,
      maxParticles: getMaxParticles(),
      configuredForms: getConfiguredForms().slice(),
      implementedForms: IMPLEMENTED_FORMS.slice(),
      fireworksStyle: FIREWORKS_STYLE_ID,
      spriteResolved: CHEST_SPRITE_PATH
    };
  }

  var API = {
    VERSION: '0.1.0',
    CARD_ID: 'WTJ-20260704-011',

    onChestComplete: onChestComplete,
    getState: getState,
    reset: reset,

    // 测试专用，见文件头 API 列表说明；不是给其余生产代码调用的稳定契约。
    _setClock: _setClock
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固：与 009/010/012~015 同款——API 对象自身已 Object.freeze，这里进一步把 window 上的
  // WTJ_REWARD_CHEST 绑定本身设为不可写、不可重配置，防止整体重赋值把状态换掉。重复引入已由 IIFE
  // 顶部守卫短路，走不到这里，因此到达时 window.WTJ_REWARD_CHEST 必为未定义；下面判断只是二次
  // 保险（兼容无 defineProperty 环境）。
  if (!window.WTJ_REWARD_CHEST && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_REWARD_CHEST', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_REWARD_CHEST) {
    window.WTJ_REWARD_CHEST = API;
  }
})();
