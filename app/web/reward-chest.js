// WTJ-20260704-011 — 宝箱开启 + 烟花 + 一次性大奖励（window.WTJ_REWARD_CHEST）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求（不 fetch 任何东西，不访问任何
// 外部 URL）、非 module（无 import/export），以普通 <script src="reward-chest.js"> 标签加载，
// 需排在 010（slots.js）之后——本文件订阅它暴露的 WTJ_SLOTS.onFull 事件。也需要 manifest.js
// （读 rewards.chest / performance 配置）之后加载；也需要 056（frame-anim.js/
// anim-manifest.js）之后——宝箱本体的 opening 分帧动效改由 WTJ_FRAME_ANIM.play() 驱动
// （见下方「宝箱开箱动效接入」一节），调用同样走防御式包装，缺失时回退静态 <img>，不阻断。
// 与 hud.js / audio.js 的加载顺序无强依赖（调用均走下方防御式包装，缺失时优雅降级为
// console.warn/console.error，不阻断）。
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
// **烟花/reset/一次性/reduced-motion 逻辑全部保留不变**：BURST_SCHEDULE 错峰时间线、
// finishSequence() 的一次性清空节奏、reset() 的外部中止入口、reduced-motion 下的静态定格帧
// 分支——全部原样保留，本卡只换了 showChest() 内部"画什么"这一件事。烟花的触发时机**没有**
// 改成"等 opening 播完才开始"（尽管卡片原文字面描述是这个方向），据实记录的偏离理由与详细
// 时间线推导见 playChestOpeningAnimDefensive() 的 onComplete 回调内联注释——核心原因是现有
// tests/unit/reward-chest.test.mjs 已经用逐时间点的粒子数量断言把 BURST_SCHEDULE 相对**序列
// 起点**（不是相对宝箱动画播完）的精确时间线锁定为验收标准的一部分，本卡不在未与 PM/DESIGN
// 重新确认产品意图、也不同步重写那份单测的前提下改变这条时间线。
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
// manifest.rewards.chest.fireworks 的落地建议是"rAF 驱动"的 Canvas 粒子系统。本文件改用与
// 013/014/015（task.js/task-templates.js/status-rewards.js）完全一致的「可注入时钟
// （clockRef.setTimeout 链）+ _setClock 测试钩子」驱动整个粒子模拟的逐帧更新，而不是调用浏览器
// 原生 requestAnimationFrame。原因：真实 rAF 的回调时间戳不受 _setClock 这类可注入时钟控制，
// 单元测试（Node vm 沙箱，没有 rAF）没有办法确定性地"快进"一段粒子物理模拟并断言其状态（存活数、
// 颜色、预设类型分布、"不超过 maxParticles 上限"等）——而这些正是本卡验收标准里明确要求持久化
// 单测覆盖的点。用固定节拍（TICK_MS=16，约 60fps）的 setTimeout 链在生产环境里视觉效果与 rAF
// 几乎无差异（本奖励序列只播放一次、约 2.6 秒，不是常驻主循环），却能让整套粒子系统在测试沙箱里
// 与其余奖励模块（015 三灯连闪/大奖励叠层）用同一手法被确定性驱动。这是本卡在"文档建议 rAF"与
// "QA 强制要求的可测试性"之间的工程取舍，据实记录，供 PM/TL 需要时复核。
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
// 烟花粒子系统（REQ-RWD-03 / REQ-AST-02，验收 3/4）
// -----------------------------------------------------------------------
// 单一粒子引擎（update + render 通用），manifest.rewards.chest.fireworks.presetTypes 全部
// 落地（超过验收 3 要求的"至少 2 种"）：
//   'circle'    圆形——从宝箱位置向 360° 均匀爆发，经典烟花环。
//   'starfield' 满天星——散布在画面上半部，缓慢上浮 + 明暗闪烁（twinkle），不来自单一爆发点。
//   'sparkler'  打铁花——从宝箱位置向上方锥形高速迸发，重力大、衰减快，模拟"铁花四溅"的急促感。
//   'star'      星形——沿五角星的 5 个主方向成束迸发，形成星形轮廓。
//   'heart'     心形（WTJ-20260704-083 新增，开发机验收反馈⑤）——沿参数化心形曲线取样方向
//               成束迸发，形成心形轮廓，物理与渲染复用同一套粒子引擎（spawnHeartBurst() +
//               drawHeart()），不新建独立引擎。
// 五种预设按 BURST_SCHEDULE 错峰触发（见该常量），共用同一套物理（重力 + 阻力 + 生命衰减）与
// 同一套配色策略，只在初始位置/速度分布/形状/衰减系数上区分「类型」。
//
// 颜色策略（REQ-RWD-03「少量高质量色板出发做 HSL/HSV 微调，不做完全 RGB 随机」，验收 4）：
// 见 COLOR_PALETTE + jitterColor()——每个粒子的颜色 = 从 5 个手工挑选的高质量 HSL 基色中随机选
// 一个，再对 h/s/l 三个通道分别做小范围随机偏移（HUE_JITTER/SAT_JITTER/LIGHT_JITTER），而不是
// Math.random() 出三个 0-255 的 RGB 分量。
//
// 性能红线（manifest.performance.maxParticles=300 / disallowShadowBlur=true，技术评审结论，
// 非 docs/index.html 直接数值）：spawnBurst() 在生成每一批粒子前用 getMaxParticles() 读到的
// 上限裁剪本次实际生成数量，保证任意时刻 particles.length 不超过该上限（见验收 3 的性能红线）；
// 全文档不出现 ctx.shadowBlur，"发光感"改用同心双层圆（柔光晕 + 实心核）纯 alpha 叠加实现。
//
// -----------------------------------------------------------------------
// prefers-reduced-motion（验收里的可访问性红线，延续 009/014/015 的既有约定）
// -----------------------------------------------------------------------
// 宝箱本体 / 背景光晕两个 CSS 驱动的表现，沿用 status-rewards.css 同款手法：JS 始终添加
// "-anim" 动画类，由 reward-chest.css 的 @media (prefers-reduced-motion: reduce) 统一覆盖为
// 无动画的静态终态（不需要 JS 分支判断类名）。Canvas 烟花是 JS 逐帧驱动，CSS 管不到，因此这里
// 由 JS 显式判断：命中时不启动 tick 循环，改为一次性画出一帧「静态定格」的粒子分布
// （spawnStaticFrame()），仍然照常经过完整的 TOTAL_SEQUENCE_MS 展示时长后调用 WTJ_SLOTS.reset()
// ——展示时长与移除时机不变，只是烟花本身不再逐帧运动。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_REWARD_CHEST，Object.freeze 冻结 + 绑定加固）
// -----------------------------------------------------------------------
//   onChestComplete(fn)   订阅"一次宝箱奖励序列自然播完"事件（已调用 WTJ_SLOTS.reset() 之后
//                         emit），fn({ ts, reducedMotion, forms, presetTypesFired })。多订阅 +
//                         逐个 try/catch 隔离。外部调用 reset() 中止播放不会触发本事件（那是
//                         "被中止"，不是"自然播完"）。
//   getState()            返回 { playing, reducedMotion, particleCount, maxParticles,
//                         configuredForms, implementedForms, configuredPresetTypes,
//                         implementedPresetTypes, colorStrategy, spriteResolved }，供 QA 断言。
//   reset()               外部中止入口（如家长退出 / 新会话）：立即停止任何进行中的奖励播放、
//                         清空 Canvas 与 DOM 叠层子元素、取消所有挂起的定时器。**不会**级联调用
//                         WTJ_SLOTS.reset()——这是"叫停本模块自己的播放"，不是"模拟一次自然播完"，
//                         与 015（status-rewards.js）reset() 同一取舍（该函数也不会反过来通知
//                         014）。
//   _setClock(clock)      测试专用（与 task.js/pointer.js/task-templates.js/status-rewards.js
//                         同款模式），供单测把整段奖励序列 + 逐帧粒子模拟快进掉，不是给其余生产
//                         代码调用的稳定契约。
//   _getParticles()       测试专用，返回当前存活粒子的浅拷贝快照数组（不影响内部状态），供单测
//                         断言粒子数上限 / 颜色策略 / 预设类型分布，不是稳定契约。
//
// -----------------------------------------------------------------------
// REQ-RWD-01~03 + REQ-AST-02/06 逐条落地位置索引（供 PM/QA 对照）：
//   REQ-RWD-01（一次性表现，不长期占屏；formsAllowed 菜单）：TOTAL_SEQUENCE_MS 控制整段序列
//               2.6s 后 finishSequence() 清空 Canvas + 移除 DOM 子元素；IMPLEMENTED_FORMS 是
//               formsAllowed 菜单的已落地子集（fireworks/short-animation/
//               temporary-background-change/new-sfx）。
//   REQ-RWD-02（宝箱开启后清五槽进入下一轮）：finishSequence() → callSlotsResetDefensive()
//               防御式调用 window.WTJ_SLOTS.reset()。
//   REQ-RWD-03（烟花 Canvas 生成，预设类型，颜色 HSL/HSV 微调）：BURST_SCHEDULE 五种预设全部
//               实现；COLOR_PALETTE + jitterColor() 落地颜色策略。
//   REQ-AST-02（烟花粒子属于代码生成类素材，不预置贴图）：全部由 Canvas2D 路径/圆弧代码生成，
//               不引用任何烟花贴图文件。
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
  var DEFAULT_PRESET_TYPES = ['starfield', 'sparkler', 'circle', 'star', 'heart'];
  var DEFAULT_MAX_PARTICLES = 300;
  var DEFAULT_COLOR_STRATEGY = 'small-curated-palette-hsl-hsv-jitter';

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

  function getConfiguredPresetTypes() {
    if (CHEST_CFG && CHEST_CFG.fireworks && Array.isArray(CHEST_CFG.fireworks.presetTypes) && CHEST_CFG.fireworks.presetTypes.length > 0) {
      return CHEST_CFG.fireworks.presetTypes;
    }
    return DEFAULT_PRESET_TYPES;
  }

  function getMaxParticles() {
    if (CHEST_CFG && CHEST_CFG.fireworks && typeof CHEST_CFG.fireworks.maxParticles === 'number' && CHEST_CFG.fireworks.maxParticles > 0) {
      return CHEST_CFG.fireworks.maxParticles;
    }
    if (PERF_CFG && typeof PERF_CFG.maxParticles === 'number' && PERF_CFG.maxParticles > 0) {
      return PERF_CFG.maxParticles;
    }
    return DEFAULT_MAX_PARTICLES;
  }

  function getColorStrategy() {
    if (CHEST_CFG && CHEST_CFG.fireworks && typeof CHEST_CFG.fireworks.colorStrategy === 'string' && CHEST_CFG.fireworks.colorStrategy.length > 0) {
      return CHEST_CFG.fireworks.colorStrategy;
    }
    return DEFAULT_COLOR_STRATEGY;
  }

  // 本文件实际落地的表现形式 / 预设类型子集（见文件头「表现形式选用」「烟花粒子系统」两节）。
  var IMPLEMENTED_FORMS = ['fireworks', 'short-animation', 'temporary-background-change', 'new-sfx'];
  var IMPLEMENTED_PRESET_TYPES = ['circle', 'starfield', 'sparkler', 'star', 'heart'];

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

  // WTJ-20260704-083：宝箱本体的 CSS 位置从 bottom:16% 收进了 footer 固定区域（bottom:2vh +
  // max-height:20vh，见 reward-chest.css 顶部「验收反馈③」说明），这里的烟花发射原点同步下移
  // 保持视觉一致（烟花从宝箱所在的位置炸开，不是从画面中段炸开）。0.58 → 0.86：新的宝箱视觉
  // 中心大约落在画布高度的 82%~90% 之间（bottom 2%~22% 区间的中点附近），取 0.86 作为发射原点。
  function chestOrigin() {
    var w = canvasEl ? canvasEl.width : 800;
    var h = canvasEl ? canvasEl.height : 600;
    return { x: w / 2, y: h * 0.86 };
  }

  // ---------------------------------------------------------------------
  // 颜色策略（REQ-RWD-03 / REQ-AST-02，验收 4）：少量高质量 HSL 色板 + 小范围 HSL 微调，
  // 不做完全 RGB 随机。
  // ---------------------------------------------------------------------
  var COLOR_PALETTE = [
    { name: 'gold', h: 45, s: 88, l: 58 },
    { name: 'ember-red', h: 352, s: 82, l: 56 },
    { name: 'violet', h: 275, s: 68, l: 62 },
    { name: 'cyan', h: 189, s: 78, l: 58 },
    { name: 'warm-white', h: 38, s: 45, l: 92 }
  ];
  var HUE_JITTER = 9;    // ± 度
  var SAT_JITTER = 8;    // ± 百分点
  var LIGHT_JITTER = 8;  // ± 百分点

  function clampNum(v, min, max) {
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }

  function pickPaletteColor() {
    var idx = Math.floor(Math.random() * COLOR_PALETTE.length);
    if (idx >= COLOR_PALETTE.length) idx = COLOR_PALETTE.length - 1;
    return COLOR_PALETTE[idx];
  }

  // 在挑中的色板基色上做 HSL 三通道微调，而非从零随机生成一个 RGB 三元组。
  function jitterColor(base) {
    var h = base.h + (Math.random() * 2 - 1) * HUE_JITTER;
    h = ((h % 360) + 360) % 360;
    var s = clampNum(base.s + (Math.random() * 2 - 1) * SAT_JITTER, 0, 100);
    var l = clampNum(base.l + (Math.random() * 2 - 1) * LIGHT_JITTER, 0, 100);
    var hr = Math.round(h);
    var sr = Math.round(s);
    var lr = Math.round(l);
    return {
      h: hr,
      s: sr,
      l: lr,
      css: 'hsl(' + hr + ',' + sr + '%,' + lr + '%)'
    };
  }

  function randomPaletteJitteredColor() {
    return jitterColor(pickPaletteColor());
  }

  // ---------------------------------------------------------------------
  // 粒子系统：单一物理引擎（重力 + 阻力 + 生命衰减），五种 presetType 只在初始分布/形状/衰减
  // 系数上区分。particles 数组任意时刻长度 <= getMaxParticles()（性能红线，spawnBurst 内裁剪）。
  // ---------------------------------------------------------------------
  var particles = [];
  var GRAVITY_PX_S2 = 240;
  var DRAG_PER_SEC = 0.85;

  function makeParticle(opts) {
    return {
      x: opts.x,
      y: opts.y,
      vx: opts.vx,
      vy: opts.vy,
      life: opts.life,
      maxLife: opts.life,
      age: 0,
      size: opts.size,
      gravityScale: (typeof opts.gravityScale === 'number') ? opts.gravityScale : 1,
      twinkle: !!opts.twinkle,
      shape: opts.shape,
      preset: opts.preset,
      color: randomPaletteJitteredColor()
    };
  }

  // 生成 count 个粒子并入队，若会超出 getMaxParticles() 上限则裁剪本次实际生成数量
  // （性能红线：任意时刻存活粒子数不超过上限，不是"整段序列累计生成数"不超过上限——早先批次
  // 死亡释放的名额允许后续批次使用）。builder(i) 返回单个粒子的构造 opts。
  function spawnBurst(count, builder) {
    var budget = getMaxParticles() - particles.length;
    if (budget <= 0) return;
    var actual = Math.min(count, budget);
    var i;
    for (i = 0; i < actual; i++) {
      particles.push(makeParticle(builder(i, actual)));
    }
  }

  function spawnCircleBurst(count, origin) {
    spawnBurst(count, function (i, total) {
      var angle = (Math.PI * 2 * i) / total + (Math.random() - 0.5) * 0.12;
      var speed = 140 + Math.random() * 60;
      return {
        x: origin.x, y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 900 + Math.random() * 400,
        size: 2 + Math.random() * 2,
        gravityScale: 1,
        shape: 'dot',
        preset: 'circle'
      };
    });
  }

  function spawnStarfieldBurst(count, canvasW, canvasH) {
    spawnBurst(count, function () {
      return {
        x: Math.random() * canvasW,
        y: Math.random() * canvasH * 0.55,
        vx: (Math.random() - 0.5) * 10,
        vy: -(10 + Math.random() * 20),
        life: 1200 + Math.random() * 800,
        size: 1.2 + Math.random() * 1.6,
        gravityScale: 0.15,
        twinkle: true,
        shape: 'dot',
        preset: 'starfield'
      };
    });
  }

  function spawnSparklerBurst(count, origin) {
    spawnBurst(count, function () {
      var base = -Math.PI / 2; // 向上
      var spread = Math.PI * 0.9; // 锥形展开约 162°
      var angle = base + (Math.random() - 0.5) * spread;
      var speed = 220 + Math.random() * 140;
      return {
        x: origin.x, y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 500 + Math.random() * 300,
        size: 1.5 + Math.random() * 1.2,
        gravityScale: 1.6,
        shape: 'dot',
        preset: 'sparkler'
      };
    });
  }

  function spawnStarBurst(count, origin) {
    var directions = 5; // 五角星主方向
    spawnBurst(count, function (i, total) {
      var dirIndex = i % directions;
      var angle = -Math.PI / 2 + dirIndex * (Math.PI * 2 / directions) + (Math.random() - 0.5) * 0.16;
      var speed = 110 + Math.random() * 150;
      return {
        x: origin.x, y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1000 + Math.random() * 500,
        size: 1.6 + Math.random() * 1.4,
        gravityScale: 0.8,
        shape: 'star',
        preset: 'star'
      };
    });
  }

  // WTJ-20260704-083（开发机验收反馈⑤）：心形预设。沿经典心形参数方程
  // x = 16*sin(t)^3, y = 13*cos(t) - 5*cos(2t) - 2*cos(3t) - cos(4t) 在 [0, 2π) 上按
  // total 个采样点取方向向量（归一化后乘以随机速度），让粒子的初始飞溅方向沿心形轮廓分布，
  // 复用同一套重力 + 阻力 + 生命衰减物理与同一套调色板（与 spawnStarBurst() 沿五角星方向
  // 取样同一手法，只是采样曲线换成心形）。参数方程的 y 轴在数学上"向上为正"，画布坐标系
  // "向下为正"，取 vy 时需整体取负号，才能让心形顶部两个圆润凸起朝上、底部尖角朝下（符合
  // "心形"的直觉朝向），而不是上下颠倒的心形。
  function spawnHeartBurst(count, origin) {
    spawnBurst(count, function (i, total) {
      var t = (Math.PI * 2 * i) / total;
      var hx = 16 * Math.pow(Math.sin(t), 3);
      var hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      var len = Math.sqrt(hx * hx + hy * hy) || 1;
      var speed = 120 + Math.random() * 90;
      return {
        x: origin.x, y: origin.y,
        vx: (hx / len) * speed,
        vy: -(hy / len) * speed, // 取负号：心形参数方程 y 向上为正，画布坐标 y 向下为正，见上方说明
        life: 900 + Math.random() * 500,
        size: 1.8 + Math.random() * 1.4,
        gravityScale: 0.9,
        shape: 'heart',
        preset: 'heart'
      };
    });
  }

  // 错峰触发五种预设烟花（延迟单位 ms，相对序列起点）。总请求数刻意设计为超过默认
  // maxParticles(300)（80+100+80+70+40=370），验证 spawnBurst() 的裁剪逻辑在多批叠加存活时
  // 确实生效（见 tests/unit/reward-chest.test.mjs「粒子上限（确定性推导）」用例的逐时间点推导）。
  var BURST_SCHEDULE = [
    { delayMs: 0, preset: 'circle', count: 80 },
    { delayMs: 320, preset: 'starfield', count: 100 },
    { delayMs: 680, preset: 'sparkler', count: 80 },
    { delayMs: 1040, preset: 'star', count: 70 },
    { delayMs: 1360, preset: 'heart', count: 40 }
  ];

  function fireBurst(entry) {
    var origin = chestOrigin();
    var w = canvasEl ? canvasEl.width : 800;
    var h = canvasEl ? canvasEl.height : 600;
    if (entry.preset === 'circle') {
      spawnCircleBurst(entry.count, origin);
    } else if (entry.preset === 'starfield') {
      spawnStarfieldBurst(entry.count, w, h);
    } else if (entry.preset === 'sparkler') {
      spawnSparklerBurst(entry.count, origin);
    } else if (entry.preset === 'star') {
      spawnStarBurst(entry.count, origin);
    } else if (entry.preset === 'heart') {
      spawnHeartBurst(entry.count, origin);
    }
    presetTypesFiredThisRound.push(entry.preset);
  }

  // 静态定格帧（prefers-reduced-motion 命中时）：一次性摆出一圈"已展开"的粒子，vx/vy=0，
  // 不进入 tick 循环，只画一帧。仍标记 circle/star 两种预设，供 QA 观察到静态帧确实生成了内容。
  // P2-2（Fable 对抗评审）：本函数直接 push 固定粒数，此前绕过了 spawnBurst() 的 maxParticles
  // 预算裁剪——默认 300 上限下 24 粒安全，但当 manifest 把 maxParticles 配成 < 24 时会破红线。
  // 这里显式取 min(24, 剩余预算)，与 spawnBurst() 走同一条性能红线，reduced-motion 分支不再是
  // 上限的例外。
  function spawnStaticFrame() {
    var origin = chestOrigin();
    var budget = getMaxParticles() - particles.length;
    var n = Math.min(24, budget);
    if (n < 0) n = 0;
    var i;
    for (i = 0; i < n; i++) {
      var angle = (Math.PI * 2 * i) / n;
      var radius = 60 + (i % 3) * 22;
      particles.push({
        x: origin.x + Math.cos(angle) * radius,
        y: origin.y + Math.sin(angle) * radius * 0.7,
        vx: 0, vy: 0,
        life: 1, maxLife: 1, age: 0,
        size: 2.5,
        gravityScale: 0,
        twinkle: false,
        shape: (i % 4 === 0) ? 'star' : 'dot',
        preset: (i % 4 === 0) ? 'star' : 'circle',
        color: randomPaletteJitteredColor()
      });
    }
    presetTypesFiredThisRound.push('circle', 'star');
  }

  function updateParticles(dtMs) {
    var dtSec = dtMs / 1000;
    var next = [];
    var i;
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.life -= dtMs;
      p.age += dtMs;
      if (p.life <= 0) continue; // 生命耗尽，剔除（不放入 next）
      p.vy += GRAVITY_PX_S2 * dtSec * p.gravityScale;
      var dragFactor = 1 - clampNum(DRAG_PER_SEC * dtSec, 0, 1);
      p.vx *= dragFactor;
      p.vy *= dragFactor;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      next.push(p);
    }
    particles = next;
  }

  function drawDot(c, p, alpha) {
    c.globalAlpha = alpha * 0.35;
    c.beginPath();
    c.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = alpha;
    c.beginPath();
    c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    c.fill();
  }

  function drawStar(c, p, alpha) {
    var spikes = 5;
    var outerR = p.size * 2.4;
    var innerR = p.size * 1.0;
    var rot = Math.PI / 2 * 3;
    var step = Math.PI / spikes;
    var cx = p.x, cy = p.y;
    c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(cx, cy - outerR);
    var k;
    for (k = 0; k < spikes; k++) {
      var xOuter = cx + Math.cos(rot) * outerR;
      var yOuter = cy + Math.sin(rot) * outerR;
      c.lineTo(xOuter, yOuter);
      rot += step;
      var xInner = cx + Math.cos(rot) * innerR;
      var yInner = cy + Math.sin(rot) * innerR;
      c.lineTo(xInner, yInner);
      rot += step;
    }
    c.closePath();
    c.fill();
  }

  // WTJ-20260704-083：心形单粒渲染。只用已经在本文件其余绘制函数里出现过的 Canvas2D API
  // （beginPath/arc/lineTo/closePath/fill，与 drawStar() 同一能力子集，不引入
  // bezierCurveTo/quadraticCurveTo 等新 API 面），用两个圆弧拼出心形的左右两叶，再用一条
  // lineTo 收到底部尖点，闭合出心形轮廓。
  function drawHeart(c, p, alpha) {
    var s = p.size * 1.6;
    var cx = p.x, cy = p.y;
    c.globalAlpha = alpha;
    c.beginPath();
    c.arc(cx - s * 0.5, cy - s * 0.35, s * 0.5, Math.PI, 0, false);
    c.arc(cx + s * 0.5, cy - s * 0.35, s * 0.5, Math.PI, 0, false);
    c.lineTo(cx, cy + s * 0.9);
    c.closePath();
    c.fill();
  }

  function renderFrame() {
    if (!ctx || !canvasEl) return;
    try {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      var i;
      for (i = 0; i < particles.length; i++) {
        var p = particles[i];
        var lifeAlpha = clampNum(p.life / p.maxLife, 0, 1);
        var alpha = lifeAlpha;
        if (p.twinkle) {
          alpha = alpha * (0.55 + 0.45 * Math.abs(Math.sin(p.age * 0.006)));
        }
        ctx.fillStyle = p.color.css;
        if (p.shape === 'star') {
          drawStar(ctx, p, alpha);
        } else if (p.shape === 'heart') {
          drawHeart(ctx, p, alpha);
        } else {
          drawDot(ctx, p, alpha);
        }
      }
      ctx.globalAlpha = 1;
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] Canvas 渲染帧失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // tick 循环（见文件头「计时驱动方式」一节：clockRef.setTimeout 链，非真实 rAF）。
  // ---------------------------------------------------------------------
  var TICK_MS = 16;
  var tickTimerId = null;
  var lastTickAt = 0;

  function scheduleNextTick() {
    tickTimerId = clockRef.setTimeout(tick, TICK_MS);
  }

  function tick() {
    tickTimerId = null;
    var now = clockRef.now();
    var dt = now - lastTickAt;
    if (dt <= 0) dt = TICK_MS;
    lastTickAt = now;
    try {
      updateParticles(dt);
      renderFrame();
    } catch (err) {
      console.error('[WTJ_REWARD_CHEST] 粒子 tick 更新失败，已捕获：', err);
    }
    if (playing) {
      scheduleNextTick();
    }
  }

  function startTicking() {
    lastTickAt = clockRef.now();
    scheduleNextTick();
  }

  function stopTicking() {
    if (tickTimerId !== null) {
      clockRef.clearTimeout(tickTimerId);
      tickTimerId = null;
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
          // 本文件的 BURST_SCHEDULE 五种烟花预设按相对**序列起点**（不是相对宝箱开箱动画播完）
          // 0/320/680/1040ms 错峰触发，这条精确时间线已经被 tests/unit/reward-chest.test.mjs
          // 的逐时间点粒子数量断言精确锁定（例如 t=50ms 时必须已有 80 个 circle 粒子存活，即
          // circle 那批必须在 t<50ms 就已生成）。如果把 scheduleFireworkBursts() 改到"opening
          // 播完"（约 500ms，5 帧 @10fps）之后才触发，会把全部烟花整体后移，直接打破那份逐
          // 时间点断言，还会把尾批（star，序列相对延迟 1040ms）推到只剩约 1000ms 存活窗口
          // 就被 TOTAL_SEQUENCE_MS=2600 的收尾截断，比现状更容易被提前打断。因此这里保留
          // "烟花与宝箱开箱动画并行、各自独立按序列起点计时"的现状（与此前纯 CSS 占位版本
          // 完全一致的时间线），onComplete 暂时是 no-op。若 PM/DESIGN 认定"烟花必须等宝箱
          // 可见地打开之后才炸"是强制产品要求，需要重新设计 BURST_SCHEDULE 的相对时间点并
          // 同步更新那份逐时间点单测，不是本卡能在不回归既有验收断言的前提下顺手做的小改动，
          // 留作交接注记。
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
  var presetTypesFiredThisRound = [];
  var sequenceTimerId = null;
  var burstTimerIds = [];

  function cancelBurstTimers() {
    var i;
    for (i = 0; i < burstTimerIds.length; i++) {
      clockRef.clearTimeout(burstTimerIds[i]);
    }
    burstTimerIds = [];
  }

  function cancelSequenceTimer() {
    if (sequenceTimerId !== null) {
      clockRef.clearTimeout(sequenceTimerId);
      sequenceTimerId = null;
    }
  }

  function clearCanvasAndParticles() {
    particles = [];
    if (ctx && canvasEl) {
      try {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      } catch (err) {
        console.error('[WTJ_REWARD_CHEST] 清空 Canvas 失败，已捕获：', err);
      }
    }
  }

  function scheduleFireworkBursts() {
    var i;
    for (i = 0; i < BURST_SCHEDULE.length; i++) {
      (function (entry) {
        var timerId = clockRef.setTimeout(function () {
          fireBurst(entry);
        }, entry.delayMs);
        burstTimerIds.push(timerId);
      })(BURST_SCHEDULE[i]);
    }
  }

  function finishSequence() {
    sequenceTimerId = null;
    stopTicking();
    cancelBurstTimers();
    clearCanvasAndParticles();
    clearOverlayChildren();
    playing = false;
    // WTJ-20260704-083 返工：序列自然播完，footer 常驻宝箱指示器退出 Open——回落到 Active 或
    // Disabled（按当前实际填槽情况，见 hud.js setChestOpen() 实现），随后 callSlotsResetDefensive()
    // 触发的 WTJ_SLOTS.reset() 会级联调用 hud.js 的 clearSlots()，把它再强制回落 Disabled。
    callHudSetChestOpenDefensive(false);

    var payload = {
      ts: clockRef.now(),
      reducedMotion: lastReducedMotion,
      forms: IMPLEMENTED_FORMS.slice(),
      presetTypesFired: presetTypesFiredThisRound.slice()
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
    presetTypesFiredThisRound = [];
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

      if (lastReducedMotion) {
        spawnStaticFrame();
        renderFrame();
      } else {
        scheduleFireworkBursts();
        startTicking();
      }

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
    cancelBurstTimers();
    stopTicking();
    clearCanvasAndParticles();
    clearOverlayChildren();
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
      particleCount: particles.length,
      maxParticles: getMaxParticles(),
      configuredForms: getConfiguredForms().slice(),
      implementedForms: IMPLEMENTED_FORMS.slice(),
      configuredPresetTypes: getConfiguredPresetTypes().slice(),
      implementedPresetTypes: IMPLEMENTED_PRESET_TYPES.slice(),
      colorStrategy: getColorStrategy(),
      spriteResolved: CHEST_SPRITE_PATH
    };
  }

  function snapshotParticles() {
    var out = [];
    var i;
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      out.push({
        x: p.x, y: p.y, vx: p.vx, vy: p.vy,
        life: p.life, maxLife: p.maxLife,
        size: p.size, shape: p.shape, preset: p.preset,
        color: { h: p.color.h, s: p.color.s, l: p.color.l, css: p.color.css }
      });
    }
    return out;
  }

  function _getParticles() {
    return snapshotParticles();
  }

  var API = {
    VERSION: '0.1.0',
    CARD_ID: 'WTJ-20260704-011',

    onChestComplete: onChestComplete,
    getState: getState,
    reset: reset,

    // 测试专用，见文件头 API 列表说明；不是给其余生产代码调用的稳定契约。
    _setClock: _setClock,
    _getParticles: _getParticles
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
