// WTJ-20260706-005 — 可复用奖励烟花/粒子系统（window.WTJ_REWARD_FIREWORKS）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求（不 fetch 任何东西，不访问任何
// 外部 URL）、非 module（无 import/export），以普通 <script src="reward-fireworks.js"> 标签
// 加载，需排在 manifest.js 之后（读取 window.WTJ_MANIFEST.performance）、消费方
// reward-chest.js / status-rewards.js 之前。禁 OffscreenCanvas/ImageBitmap/fetch（Safari 14
// 约束），只用 document.createElement('canvas') + 普通 2D Canvas API。
//
// 权威规格：docs/design-notes/WTJ-005-reward-fireworks-plan.md（TL 综合架构/粒子物理/旧 Mac
// 性能三视角技术评审的方案汇总），本文件严格照该文档 §1-§4/§6 落地，逐节对应关系见下方各段
// 注释。
//
// -----------------------------------------------------------------------
// 职责边界（本卡 005：从 reward-chest.js 抽出一套「canvas-agnostic 可复用」粒子引擎）
// -----------------------------------------------------------------------
// 此前 reward-chest.js（011）自己实现了一整套烟花粒子系统（COLOR_PALETTE/spawnXBurst/
// updateParticles/renderFrame/tick 链），但那套引擎与"宝箱本体+背景光晕+音效+HUD 接线"耦合
// 在同一个文件里，task-complete（015/status-rewards.js）想要类似的粒子反馈时只能另起一套
// （sparkle burst + 成功环，复用 sparkles.js）。本卡把"粒子物理引擎"本身抽成独立、可被任意
// canvas 消费的模块：reward-chest.js 只保留"宝箱本体/背景光晕/音效/HUD 指示器接线"，把烟花
// 换成调用本模块的 play('molten-fountain', {...})；status-rewards.js 的「任务成功」即时反馈
// 从"sparkle burst + 成功环"换成调用本模块的 play('starburst'|'round-bloom', {...})。两个入口
// 通过 canvas-agnostic 的 playbacks[] 注册表并发运行、互不干扰，具体接线见两个消费文件自己的
// 文件头注释。
//
// -----------------------------------------------------------------------
// 引擎架构（doc §1）
// -----------------------------------------------------------------------
// 渲染 = Canvas 2D（doc 明确否决 SVG/CSS/DOM 逐粒子节点方案：2014 MBA/HD5000 WKWebView 上
// 300 级 DOM 节点的 layout/composite 会崩）。canvas-agnostic：play() 的 opts.canvas 可以是
// 调用方自己拥有生命周期的 canvas（如 reward-chest 的 .wtj-rc-canvas），也可以省略，这时
// 使用模块内部懒创建的单例全屏 overlay canvas（.wtj-fw-canvas，见 ensureDefaultCanvas()）。
// 全局登记表 `playbacks`（数组 + 线性扫描，与本项目 frame-anim.js 的 findPlaybackIndex()/
// isActivePlayback() 同一手法——同一时刻的并发播放数量是个位数到十几个量级，线性扫描足够，
// 不需要 Map）：每一次 play() 调用生成一个 playback 对象 `{id, canvasEl, ctx, styleId,
// styleParams, origin, startTime, durationMs, particles[], onComplete, reducedMotion, tier}`，
// push 进 `playbacks`。渲染按「canvas 分组」调度：`canvasGroups` 记录每一张实际用到的 canvas
// 各自的 tick 定时器 + 上次 tick 时间，一张 canvas 上可能同时挂着多个 playback（例如两次
// task-complete 紧挨着触发，都用默认单例 canvas）——分组调度保证同一张 canvas 每个 tick 只
// clearRect 一次、把这张 canvas 上所有 playback 的粒子画在同一帧里，不会互相清空对方刚画的
// 内容（这是"支持 chest 与 task-complete 并发、连续 task-complete 叠放"的关键，比"每个
// playback 各自独立 tick+clearRect 同一张共享 canvas"更正确）。
//
// -----------------------------------------------------------------------
// 对外 API（doc §1，Object.freeze 冻结 + 绑定加固）
// -----------------------------------------------------------------------
//   play(styleId, opts) -> handle
//       styleId: 'molten-fountain' | 'starburst' | 'round-bloom'（见 STYLE_PARAMS）。
//       opts: { canvas?, origin, tier?, onComplete? }。canvas 缺省时用模块单例 overlay
//       canvas；origin 支持 {x,y}（像素）或 {leftPercent,topPercent}（相对当前 canvas 尺寸的
//       百分比，供 task-complete 直接传 014/015 已经在用的 anchor 格式）；origin 完全缺失/
//       格式不对时防御式回退到 canvas 视觉中心（避免在 (0,0)/NaN 炸开，doc §4 明确警告的坑）。
//       tier 缺省时用当前全局 tier（manifest 配置 + _setTier() 覆盖 + 自适应降级三者合成，见
//       下方「性能分档」一节）。onComplete 在这次播放自然结束（粒子清零或到 durationMs）时
//       调用一次；显式 stop(handle) 不算自然结束，不触发 onComplete（与 frame-anim.js 的
//       stop() 语义一致）。返回值 handle 是一个不透明的数字 id，缺失 canvas/未知 styleId 时
//       返回 null（防御式，调用方应据此跳过后续 stop() 调用）。
//   stop(handle)      停止指定这一次播放（从注册表移除 + 若所在 canvas 分组已无其它 playback
//                     则连带停掉该分组的 tick 定时器），不触发 onComplete，是安全的幂等操作
//                     （对不存在/已结束的 handle 调用是 no-op）。
//   stopAll()/reset() 停止全部播放（等价别名），供"家长退出/新会话"级别的外部中止使用。
//   getState()        返回 { tier, particleCount, maxParticles, activeEffects, reducedMotion,
//                     degradeLevel }，供 QA/单测内省，不是渲染契约的一部分。particleCount 是
//                     跨全部并发 playback 共享的当前存活总数（性能红线的直接体现）。
//   _setClock(clock)  测试专用（与 task.js/frame-anim.js/reward-chest.js 同款模式），供单测
//                     把整段 tick 链路快进掉，不是给其余生产代码调用的稳定契约。
//   _setRandom(fn)    测试专用：替换内部 fxRandom() 的随机源（默认 Math.random），供单测注入
//                     确定性 PRNG（如 mulberry32）以精确复现某个触发瞬间的粒子分布/生命值。
//   _setTier(tier)    测试/未来配置面板专用：显式覆盖当前 tier（'old_mac'|'normal'|'burst'），
//                     覆盖 manifest 默认值，但仍会被自适应降级进一步下调（降级只降不升）。
//   _getParticles(handle?) 测试专用：省略 handle 时返回所有并发 playback 的粒子快照拼接；
//                     传入 play() 返回的 handle 时只返回该次播放自己的粒子快照。浅拷贝，不
//                     影响内部状态。
//
// -----------------------------------------------------------------------
// 三种形态 STYLE_PARAMS（doc §2，固化进模块常量，不在别处重复定义数值）
// -----------------------------------------------------------------------
//   molten-fountain（chest-open 高潮）：950ms，gravity260/drag0.9，counts
//     old_mac120/normal210/burst280。3 层：warm base(0.62)/长拖尾 gold-trail(0.30，低阻高速
//     dragScale0.55+fadePow1.4 拉出长尾感)/cyan accent(0.08，#8EEBFF 附近色，"次要层"，自适应
//     降级触发"砍次要层"时最先被砍掉的就是这一层）。origin 取调用方传入的宝箱位置，向上
//     90°±35° 扇形迸发（用 aim() helper，见下）。
//   starburst（task-complete 主形态）：720ms，gravity120/drag1.3，counts
//     old_mac70/normal120/burst160。5 主射线（-90°+i·72°+本次触发的 rotationBase 整体旋转+
//     ±7° 抖动，shape:'streak' 沿速度方向 rotate 绘制）+ 5 短次射线（在主射线基础上 +36°
//     偏移，shape:'dot'）+ 中心 flash（~8 粒白色，maxAlpha 硬封顶 0.35，避免全屏白闪）。
//   round-bloom（task-complete 次形态，贴纸/收藏场景）：840ms，gravity40/drag2.0，counts
//     old_mac90/normal150/burst210。双环（内环+外环，各占一半配额）从 r0=0.17·min(w,h) 起的
//     偏移半径生成（落地"保留中心 34% 直径不生成粒子"的占位留白，避免遮挡贴纸本体），每个
//     粒子带 gravityDelayMs=380（迟落点）：age<380ms 期间不受重力，之后才开始真正下坠。
//   三形态的粒子生成总数完全由算术公式决定（不掺入 fxRandom()），保证同一 tier 下每次触发的
//   "总粒子数"精确可预测、可单测断言（fxRandom() 只影响角度/速度/生命值/尺寸/贴图变体挑选这些
//   不改变总数的细节），这是本文件与 reward-chest.js 旧版"BURST_SCHEDULE 靠 Math.random 决定
//   是否被 maxParticles 裁剪"不同的一处刻意设计——让"计数矩阵"这类验收断言不依赖随机种子。
//
// aim(deg,speed) helper（doc §2 明确点名的高危坑）：deg 是"以水平轴为 0°、向上为正"的数学
// 约定角度，但 canvas 的 y 轴向下为正——如果直接拿 sin(deg) 当 vy，喷泉会朝下喷。本文件严格
// 按文档给定公式实现：r=deg·π/180; vx=cos(r)·speed; vy=-sin(r)·speed（对 vy 取负号完成坐标系
// 转换）。全文件所有速度矢量的生成都必须经过这个 helper，不允许绕开它直接手写 sin/cos。
//
// 每次触发都有变化（doc §2）：全部 Math.random() 调用统一走 fxRandom()（默认 Math.random，
// _setRandom() 可注入确定性源）；额外的"per-trigger 专属量"——molten-fountain 的 accent 层
// 数量本身由算术公式决定不随机，但其角度/速度仍随机；starburst 每次触发都会重新算一个
// rotationBase（fxRandom()*360）整体旋转量，让连续几次 starburst 视觉上不完全重合；
// round-bloom 双环的角度相位同样每次重新取样。
//
// -----------------------------------------------------------------------
// 性能红线落地（doc §3，PERFORMANCE.md / 2014 MacBook Air + HD5000 核显预算）
// -----------------------------------------------------------------------
// 预渲染发光贴图：spriteCache 按需（首次用到某个「颜色×变体×形状(dot/streak)」组合时）构建，
// 构建期用 document.createElement('canvas')（禁 OffscreenCanvas/ImageBitmap）画一张
// SPRITE_SIZE(28px) 见方的柔光贴图——createRadialGradient 只在 buildSprite() 这一个函数里
// 出现，且每个 key 只构建一次、永久缓存复用，绝不会在 tick/render 路径里被调用第二次。颜色
// jitter 不是"每帧随机算一次色值"，而是构建期就把 VARIANT_OFFSETS（3 个固定的 h/l 偏移量）
// 各自烘焙成一张独立贴图，运行期粒子只是从这个"变体池"里挑一个索引（makeParticle() 里的
// variantIdx，挑选动作本身用 fxRandom()，但只发生在 spawn 那一刻，不是每帧）。颜色 key 数
// （8 个）× 变体数（3）主要是 dot 形状，streak 形状只有 starburst-main 这一个 key 会用到，
// 总贴图数上限 8*3 + 1*3 = 27 张 28px canvas，在 doc 要求的"≤~30 张"以内。
//
// 每帧渲染（renderGroup()/drawParticle()）严格限定为：1 次 clearRect + 每个存活粒子 1 次
// drawImage + globalAlpha 赋值（做淡出）。星爆主射线（shape:'streak'）额外用 save/translate/
// rotate/restore 把贴图旋转到粒子当前速度方向——doc 明确这是"仅限少量 ray 粒子"的例外，不是
// "每帧允许调用的操作"整体放宽（其余绝大多数粒子走无旋转的 dot 分支）。全文件不出现
// ctx.shadowBlur 赋值、不出现 tick/render 路径里的 createRadialGradient 调用、不出现
// getImageData/putImageData。
//
// 单张持久化全屏 overlay canvas：ensureDefaultCanvas() 懒创建一次，跨轮次复用不销毁（修正
// reward-chest.js 旧版"每轮新建 canvas"的实现），pointer-events:none（reward-fireworks.css），
// 不参与 012（pointer.js）的命中判定。调用方自带 canvas（如 reward-chest 的 .wtj-rc-canvas）
// 时本模块完全不接触该 canvas 的创建/销毁/尺寸，只是借用其 2D context 画粒子 + 借用其 tick
// 调度——canvas 生命周期仍归调用方。
//
// tier（性能分档）三个来源，谁都不是唯一权威，合成规则见 currentGlobalTier()：
//   ① manifest.performance.particleTier（'old_mac'|'normal'|'burst'，默认 'normal'）—— 静态
//      配置基线，不做任何 UA/机型嗅探（真实 WKWebView 上不可靠、也无法在单测里确定性复现）。
//   ② 模块内自适应单向降级：每次某张 canvas 的 tick 触发时把这一帧的 dt 喂给 recordTickDt()。
//      dt 落在 (100ms, +∞) 视为"离群值"（后台节流恢复瞬间的一次性巨大 dt），直接豁免、不计入
//      任何降级判断（doc §3 明确要求"不误降"）。dt 落在 (40ms, 100ms] 视为单次极慢帧，立即
//      把 degradeSteps 打满到最大档位并永久置位 forceNoSecondaryLayers（连带砍掉次要层：
//      molten-fountain 的 accent 层、starburst 的次射线+中心 flash、round-bloom 的外环）。
//      dt 落在 (25ms, 40ms] 视为"慢"，连续 CONSECUTIVE_SLOW_THRESHOLD 次慢 tick（不要求连续
//      判定窗口内每次都恰好慢，中间只要出现一次不慢就重新计数，是"连续"而不是"累计"）才降低
//      一档——只降不升，degradeSteps 在本模块生命周期内单调不减（"本 session 粘滞"）。
//   ③ _setTier(tier) 测试/未来配置面板钩子：显式设定基线 tier，覆盖 manifest 默认值，但依然
//      会被②的自适应降级进一步下调（degradeSteps 是在基线之上再往下走的档位数，不是整体覆盖）。
//   单次 play() 若在 opts.tier 里显式传入合法值，这次播放优先用这个显式值（不经过①②③合成），
//   用于测试精确指定某一档的粒子数矩阵。
//
// 全局硬预算（doc §3 最核心的一条）：spawnList()/spawnLayer 系列函数在真正 push 粒子前，都会
// 用 `getMaxParticles() - totalAliveParticles()`（后者遍历全部 playbacks，不分 canvas）算出
// 剩余预算，本次请求数超出预算时静默裁剪，绝不允许任意时刻全局存活总数超过
// manifest.performance.maxParticles（默认 300）。STYLE_PARAMS.counts 只是"这一档想要生成的
// 目标数"，真正落地的数量始终以这个共享预算裁剪为准——这正是"3 style×3 tier 计数矩阵"与
// "并发触顶后回落"两类单测要验证的核心不变量。
//
// one-shot 自我清理：每个 playback 有 durationMs（= STYLE_PARAMS[styleId].durationMs），
// 每次所在 canvas 分组 tick 时会检查"粒子已清零"或"已到 durationMs"（两者任一，doc §3 的
// "或"语义）——命中即从全局 playbacks 移出 + 触发 onComplete，不会像 frame-anim.js 修复前的
// P1-1 那样"non-loop 播完只停 tick 不移出注册表"造成常驻泄漏。dt 钳制在 DT_CAP_MS(100ms)：
// 物理更新用被钳制过的 dt（避免后台节流恢复瞬间的巨大 dt 让粒子瞬间穿越大段位移/寿命），但
// 前面①②的自适应降级判断读取的是钳制前的原始 dt（要能观察到"这一帧真的很慢"这件事本身）。
//
// -----------------------------------------------------------------------
// 两入口接线（doc §4，详见各自消费文件自己的文件头注释）
// -----------------------------------------------------------------------
//   reward-chest.js（chest-open）：runSequence() 里原本的 scheduleFireworkBursts()+
//   startTicking()+各 spawnXBurst() 整段替换为一次 play('molten-fountain', {canvas: 现有
//   .wtj-rc-canvas, origin: chestOrigin(), onComplete}）；reset()/clearOverlayChildren() 摘
//   除烟花 canvas 前必须先 stop(handle)，与 056 的 stopFrameAnimDefensive() 同一手法防泄漏。
//   status-rewards.js（task-complete）：handleTaskComplete() 里把原来的"sparkle burst + 成功
//   环"整体换成 play(nextStyle, {origin: e.anchor || viewportCenter(), tier})，starburst 与
//   round-bloom 严格交替（每次任务完成切换一次），anchor 缺失（press 类任务恒为 null）时必须
//   回退到 viewportCenter()，否则会在 (0,0) 炸开。
//
// -----------------------------------------------------------------------
// prefers-reduced-motion（D3：两入口统一"静态定格一帧"，doc §5）
// -----------------------------------------------------------------------
// play() 命中 reduced-motion 时不进入 tick 循环，改为调用 spawnStaticFrame() 一次性摆出一个
// "已展开"的静态粒子分布（vx=vy=0、life=maxLife=1，不会衰减，因为压根没有 tick 在推进它），
// 只画一帧；仍然经过与正常路径完全相同的共享预算裁剪（spawnList()），不是红线的例外分支。
// 静态帧只保留每个形态的"主层"（molten-fountain 只有 base、starburst 只有主射线、round-bloom
// 只有内环），跳过次要层/次射线/中心 flash/外环——这是"吸收 007 skip-secondary 进构图"的落地
// 方式（007 卡的既有约定是 reduced-motion 下跳过次要层，这里把这条约定收进本模块，两个入口
// 共用同一份实现，不需要各自维护一份）。仍然会在 durationMs 后触发一次 onComplete（用一次性
// clockRef.setTimeout，不依赖 tick 循环），保证调用方的收尾时序不需要为 reduced-motion 分叉。
//
// -----------------------------------------------------------------------
// 与 016（parent-controls.js）/HUD 的关系：本文件不做任何家长态判断，也不直接调用 HUD——两个
// 消费方各自负责与 HUD/家长态的接线，本模块只是一个纯粹的"给个 canvas 和参数，画一段粒子"引擎。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 重复引入守卫（与 009~056 同款）：本模块只应被引入一次。
  // ---------------------------------------------------------------------
  if (window.WTJ_REWARD_FIREWORKS) {
    return;
  }

  // ---------------------------------------------------------------------
  // manifest 访问器：与 reward-chest.js/frame-anim.js 同一模式。缺失字段一律防御式回退到下方
  // 最小默认值并 console.warn，不阻断初始化。
  // ---------------------------------------------------------------------
  function getManifest() {
    if (window.WTJ_MANIFEST) {
      return window.WTJ_MANIFEST;
    }
    console.warn('[WTJ_REWARD_FIREWORKS] window.WTJ_MANIFEST 未找到（manifest.js 未加载或加载失败），回退到内置最小默认值。');
    return null;
  }

  var MANIFEST = getManifest();
  var PERF_CFG = (MANIFEST && MANIFEST.performance) ? MANIFEST.performance : null;

  var DEFAULT_MAX_PARTICLES = 300;
  var DEFAULT_TIER = 'normal';

  function getMaxParticles() {
    if (PERF_CFG && typeof PERF_CFG.maxParticles === 'number' && PERF_CFG.maxParticles > 0) {
      return PERF_CFG.maxParticles;
    }
    return DEFAULT_MAX_PARTICLES;
  }

  var TIER_RANK = { old_mac: 0, normal: 1, burst: 2 };
  var RANK_TIER = ['old_mac', 'normal', 'burst'];

  function isValidTier(name) {
    return Object.prototype.hasOwnProperty.call(TIER_RANK, name);
  }

  function tierRank(name) {
    return isValidTier(name) ? TIER_RANK[name] : TIER_RANK.normal;
  }

  function getConfiguredTier() {
    if (PERF_CFG && typeof PERF_CFG.particleTier === 'string' && isValidTier(PERF_CFG.particleTier)) {
      return PERF_CFG.particleTier;
    }
    return DEFAULT_TIER;
  }

  // ---------------------------------------------------------------------
  // 可注入时钟（默认真实 setTimeout/clearTimeout/Date.now；测试用 _setClock 整体或部分替换，
  // 与 task.js/frame-anim.js/reward-chest.js 同款模式）。
  // ---------------------------------------------------------------------
  var clockRef = {
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function (id) { clearTimeout(id); },
    now: function () { return Date.now(); }
  };

  function _setClock(clock) {
    if (!clock || typeof clock !== 'object') {
      console.warn('[WTJ_REWARD_FIREWORKS] _setClock: 参数必须是对象，已忽略。');
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
  // 可注入随机源（默认 Math.random；测试用 _setRandom 注入确定性 PRNG，如 mulberry32）。
  // 全模块所有随机决策必须经过 fxRandom()，不允许直接调用 Math.random()。
  // ---------------------------------------------------------------------
  var randomRef = Math.random;

  function fxRandom() {
    return randomRef();
  }

  function _setRandom(fn) {
    if (typeof fn !== 'function') {
      console.warn('[WTJ_REWARD_FIREWORKS] _setRandom: 参数必须是函数，已忽略。');
      return;
    }
    randomRef = fn;
  }

  // ---------------------------------------------------------------------
  // prefers-reduced-motion 检测：与 reward-chest.js/status-rewards.js/frame-anim.js 同款实现。
  // ---------------------------------------------------------------------
  function prefersReducedMotion() {
    try {
      if (typeof window.matchMedia === 'function') {
        var mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        return !!(mql && mql.matches);
      }
    } catch (err) {
      console.warn('[WTJ_REWARD_FIREWORKS] matchMedia 检测失败，按不启用 reduced-motion 处理，已捕获：', err);
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // 数值工具
  // ---------------------------------------------------------------------
  function clampNum(v, min, max) {
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }

  // doc §2 明确给出的公式：deg 是"水平轴为 0°、向上为正"的数学角度约定，canvas y 轴向下为正，
  // 因此 vy 必须取负号完成坐标系转换——否则喷泉类效果会朝下喷（doc 点名的高危坑）。
  function aim(deg, speed) {
    var r = (deg * Math.PI) / 180;
    return { vx: Math.cos(r) * speed, vy: -Math.sin(r) * speed };
  }

  // 把 total 个名额尽量均匀地分给 buckets 份，返回长度为 buckets、元素之和恰好等于 total 的
  // 数组（前 total%buckets 份多分 1 个）——用于星爆射线/环形粒子的按角度均分，保证"总数精确
  // 可预测"这一条设计原则在多桶分配场景下依然成立，不因为 Math.floor 丢粒子。
  function distributeEvenly(total, buckets) {
    var base = Math.floor(total / buckets);
    var remainder = total - base * buckets;
    var result = [];
    var i;
    for (i = 0; i < buckets; i++) {
      result.push(base + (i < remainder ? 1 : 0));
    }
    return result;
  }

  // ---------------------------------------------------------------------
  // 三形态参数（doc §2，固化常量，见文件头「三种形态」一节的完整数值解释）。
  // ---------------------------------------------------------------------
  var STYLE_PARAMS = {
    'molten-fountain': {
      durationMs: 950,
      gravity: 260,
      drag: 0.9,
      baseAngleDeg: 90,
      spreadDeg: 35,
      counts: { old_mac: 120, normal: 210, burst: 280 },
      layers: {
        base: { frac: 0.62, colorKey: 'warm-gold', speedMin: 180, speedMax: 320, lifeMin: 500, lifeMax: 850, sizeMin: 2.2, sizeMax: 3.6, dragScale: 1, fadePow: 1 },
        trail: { frac: 0.30, colorKey: 'ember-gold', speedMin: 260, speedMax: 420, lifeMin: 650, lifeMax: 950, sizeMin: 1.6, sizeMax: 2.6, dragScale: 0.55, fadePow: 1.4 },
        accent: { frac: 0.08, colorKey: 'cyan-accent', speedMin: 160, speedMax: 260, lifeMin: 400, lifeMax: 700, sizeMin: 1.8, sizeMax: 2.8, dragScale: 1, fadePow: 1 }
      }
    },
    'starburst': {
      durationMs: 720,
      gravity: 120,
      drag: 1.3,
      counts: { old_mac: 70, normal: 120, burst: 160 },
      mainRayCount: 5,
      secondaryRayCount: 5,
      centerFlashCount: 8,
      maxFlashAlpha: 0.35,
      rayJitterDeg: 7,
      secondaryOffsetDeg: 36
    },
    'round-bloom': {
      durationMs: 840,
      gravity: 40,
      drag: 2.0,
      counts: { old_mac: 90, normal: 150, burst: 210 },
      minRadiusFrac: 0.17,
      gravityDelayMs: 380
    }
  };

  // 颜色表：少量高质量 HSL 基色（沿用 reward-chest.js REQ-RWD-03「少量高质量色板 + 微调，不做
  // 完全 RGB 随机」的既有策略），每个 key 对应一个 STYLE_PARAMS 层/射线用到的基色。
  // cyan-accent 对应 doc 给出的 #8EEBFF 附近色（HSL 近似值）。
  var COLOR_TABLE = {
    'warm-gold': { h: 42, s: 92, l: 58 },
    'ember-gold': { h: 28, s: 90, l: 54 },
    'cyan-accent': { h: 190, s: 85, l: 78 },
    'starburst-main': { h: 46, s: 95, l: 62 },
    'starburst-secondary': { h: 46, s: 85, l: 70 },
    'starburst-flash': { h: 0, s: 0, l: 100 },
    'bloom-inner': { h: 320, s: 70, l: 68 },
    'bloom-outer': { h: 265, s: 65, l: 68 }
  };

  // ---------------------------------------------------------------------
  // 性能分档：三来源合成（见文件头「性能红线落地」一节）。
  // ---------------------------------------------------------------------
  var explicitTier = null; // ③ _setTier() 覆盖 manifest 基线。
  var degradeSteps = 0; // ② 自适应降级步数，只增不减，本 session 粘滞。
  var forceNoSecondaryLayers = false; // 单次极慢 tick 触发的"砍次要层"，同样只增不减。

  var dtEma = 16;
  var consecutiveSlowTicks = 0;
  var EMA_ALPHA = 0.2;
  var SLOW_DT_MS = 25;
  var CRITICAL_DT_MS = 40;
  var OUTLIER_DT_MS = 100;
  var CONSECUTIVE_SLOW_THRESHOLD = 3;
  var MAX_DEGRADE_STEPS = 2;

  function recordTickDt(dt) {
    if (dt > OUTLIER_DT_MS) {
      // 离群值（如标签页被节流后恢复的一次性巨大 dt）：视为暂停/恢复，不计入慢 tick 计数、
      // 也不触发任何降级判断（doc §3 明确要求"不误降"）。
      consecutiveSlowTicks = 0;
      return;
    }
    dtEma = dtEma + EMA_ALPHA * (dt - dtEma);
    if (dt > CRITICAL_DT_MS) {
      // 单次极慢 tick：不需要连续多次，立即打满降级档位并永久砍掉次要层。
      degradeSteps = MAX_DEGRADE_STEPS;
      forceNoSecondaryLayers = true;
      consecutiveSlowTicks = 0;
      return;
    }
    if (dt > SLOW_DT_MS) {
      consecutiveSlowTicks++;
      if (consecutiveSlowTicks >= CONSECUTIVE_SLOW_THRESHOLD) {
        degradeSteps = Math.min(MAX_DEGRADE_STEPS, degradeSteps + 1);
        consecutiveSlowTicks = 0; // 降级一档后重新计数，需要再连续 N 次慢 tick 才继续降。
      }
    } else {
      consecutiveSlowTicks = 0; // 出现一次不慢的 tick 就重新计数（"连续"而非"累计"）。
    }
  }

  function baseTierName() {
    return explicitTier || getConfiguredTier();
  }

  function currentGlobalTier() {
    var rank = tierRank(baseTierName()) - degradeSteps;
    if (rank < 0) rank = 0;
    if (rank > 2) rank = 2;
    return RANK_TIER[rank];
  }

  function _setTier(tier) {
    if (!isValidTier(tier)) {
      console.warn('[WTJ_REWARD_FIREWORKS] _setTier: 未知 tier "' + String(tier) + '"，已忽略。');
      return;
    }
    explicitTier = tier;
  }

  function resolveTierForPlay(optsTier) {
    if (typeof optsTier === 'string' && isValidTier(optsTier)) {
      return optsTier;
    }
    return currentGlobalTier();
  }

  // ---------------------------------------------------------------------
  // 预渲染发光贴图缓存（doc §3 性能红线核心）：createRadialGradient 只会在 buildSprite() 里
  // 出现，且每个 (colorKey, variantIdx, shapeKind) 组合只构建一次，构建后永久缓存复用。
  // ---------------------------------------------------------------------
  var SPRITE_SIZE = 28;
  var VARIANT_OFFSETS = [{ dh: 0, dl: 0 }, { dh: 6, dl: 5 }, { dh: -6, dl: -5 }];
  var spriteCache = {};

  function resolveVariantColor(colorKey, variantIdx) {
    var base = COLOR_TABLE[colorKey] || COLOR_TABLE['warm-gold'];
    var off = VARIANT_OFFSETS[variantIdx % VARIANT_OFFSETS.length];
    var h = ((base.h + off.dh) % 360 + 360) % 360;
    var l = clampNum(base.l + off.dl, 0, 100);
    return { h: h, s: base.s, l: l };
  }

  function hslaCss(color, alpha) {
    return 'hsla(' + color.h + ',' + color.s + '%,' + color.l + '%,' + alpha + ')';
  }

  // 构建期画一张柔光贴图：外层 createRadialGradient 柔光 + 内层实心核（与 reward-chest.js 旧版
  // "双层圆柔光，无 shadowBlur"同一视觉手法，只是这里是构建期画一次到贴图上，不是每帧现画）。
  function buildSprite(colorKey, variantIdx, shapeKind) {
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function') {
      return null;
    }
    var color = resolveVariantColor(colorKey, variantIdx);
    var c;
    try {
      c = document.createElement('canvas');
      c.width = SPRITE_SIZE;
      c.height = SPRITE_SIZE;
    } catch (err) {
      console.error('[WTJ_REWARD_FIREWORKS] 创建发光贴图 canvas 失败，已捕获：', err);
      return null;
    }
    var sctx;
    try {
      sctx = c.getContext('2d');
    } catch (err) {
      console.error('[WTJ_REWARD_FIREWORKS] 发光贴图 getContext 失败，已捕获：', err);
      return null;
    }
    if (!sctx) {
      return null;
    }
    var cx = SPRITE_SIZE / 2;
    var cy = SPRITE_SIZE / 2;
    try {
      if (shapeKind === 'streak') {
        // streak：沿水平轴拉长的柔光，渲染时按粒子当前速度方向 rotate（见 drawParticle()）。
        sctx.save();
        sctx.translate(cx, cy);
        sctx.scale(1.7, 0.5);
        var gradS = sctx.createRadialGradient(0, 0, 0, 0, 0, SPRITE_SIZE / 2);
        gradS.addColorStop(0, hslaCss(color, 0.95));
        gradS.addColorStop(0.5, hslaCss(color, 0.5));
        gradS.addColorStop(1, hslaCss(color, 0));
        sctx.fillStyle = gradS;
        sctx.beginPath();
        sctx.arc(0, 0, SPRITE_SIZE / 2, 0, Math.PI * 2);
        sctx.fill();
        sctx.restore();
        sctx.fillStyle = hslaCss(color, 1);
        sctx.beginPath();
        sctx.arc(cx, cy, SPRITE_SIZE * 0.12, 0, Math.PI * 2);
        sctx.fill();
      } else {
        var gradD = sctx.createRadialGradient(cx, cy, 0, cx, cy, SPRITE_SIZE / 2);
        gradD.addColorStop(0, hslaCss(color, 0.9));
        gradD.addColorStop(0.45, hslaCss(color, 0.5));
        gradD.addColorStop(1, hslaCss(color, 0));
        sctx.fillStyle = gradD;
        sctx.beginPath();
        sctx.arc(cx, cy, SPRITE_SIZE / 2, 0, Math.PI * 2);
        sctx.fill();
        sctx.fillStyle = hslaCss(color, 1);
        sctx.beginPath();
        sctx.arc(cx, cy, SPRITE_SIZE * 0.16, 0, Math.PI * 2);
        sctx.fill();
      }
    } catch (err) {
      console.error('[WTJ_REWARD_FIREWORKS] 绘制发光贴图失败，已捕获：', err);
    }
    return c;
  }

  function getSprite(colorKey, variantIdx, shapeKind) {
    var key = colorKey + '|' + variantIdx + '|' + shapeKind;
    if (Object.prototype.hasOwnProperty.call(spriteCache, key)) {
      return spriteCache[key];
    }
    var built = buildSprite(colorKey, variantIdx, shapeKind);
    spriteCache[key] = built; // 即便为 null（环境不支持 canvas）也缓存，避免重复尝试。
    return built;
  }

  // ---------------------------------------------------------------------
  // 粒子：makeParticle() 统一构造，dragScale/fadePow 是 doc §2 要求新增的两个可选字段
  // （默认各为 1，即"不特殊处理"）。variantIdx 在 spawn 那一刻用 fxRandom() 挑选一次，之后
  // 整个生命周期不变（渲染时只是查表，不逐帧重算）。
  // ---------------------------------------------------------------------
  function makeParticle(opts) {
    return {
      x: opts.x, y: opts.y, vx: opts.vx, vy: opts.vy,
      life: opts.life, maxLife: opts.life, age: 0,
      size: opts.size,
      gravityScale: (typeof opts.gravityScale === 'number') ? opts.gravityScale : 1,
      dragScale: (typeof opts.dragScale === 'number') ? opts.dragScale : 1,
      fadePow: (typeof opts.fadePow === 'number') ? opts.fadePow : 1,
      gravityDelayMs: (typeof opts.gravityDelayMs === 'number') ? opts.gravityDelayMs : 0,
      shape: opts.shape || 'dot',
      colorKey: opts.colorKey || 'warm-gold',
      angleForStreak: (typeof opts.angleForStreak === 'number') ? opts.angleForStreak : null,
      maxAlpha: (typeof opts.maxAlpha === 'number') ? opts.maxAlpha : 1,
      variantIdx: Math.floor(fxRandom() * VARIANT_OFFSETS.length) % VARIANT_OFFSETS.length
    };
  }

  // ---------------------------------------------------------------------
  // 全局登记表 + canvas 分组调度（doc §1「canvas-agnostic 引擎 + playbacks[] 注册表」，
  // 照搬 frame-anim.js 的 findPlaybackIndex()/isActivePlayback() 手法）。
  // ---------------------------------------------------------------------
  var playbacks = []; // 每项：{id, canvasEl, ctx, styleId, styleParams, origin, startTime, durationMs, particles[], onComplete, reducedMotion, tier}
  var canvasGroups = []; // 每项：{canvasEl, ctx, tickTimerId, lastTickAt} —— 同一张 canvas 上所有并发 playback 共用同一条 tick 调度。
  var nextPlaybackId = 1;
  var TICK_MS = 16;
  var DT_CAP_MS = 100;

  function findPlaybackIndexById(id) {
    var i;
    for (i = 0; i < playbacks.length; i++) {
      if (playbacks[i].id === id) {
        return i;
      }
    }
    return -1;
  }

  function isActivePlaybackId(id) {
    return findPlaybackIndexById(id) !== -1;
  }

  function playbacksForCanvas(canvasEl) {
    var out = [];
    var i;
    for (i = 0; i < playbacks.length; i++) {
      if (playbacks[i].canvasEl === canvasEl) {
        out.push(playbacks[i]);
      }
    }
    return out;
  }

  function totalAliveParticles() {
    var total = 0;
    var i;
    for (i = 0; i < playbacks.length; i++) {
      total += playbacks[i].particles.length;
    }
    return total;
  }

  function findGroupForCanvas(canvasEl) {
    var i;
    for (i = 0; i < canvasGroups.length; i++) {
      if (canvasGroups[i].canvasEl === canvasEl) {
        return canvasGroups[i];
      }
    }
    return null;
  }

  function ensureGroupForCanvas(canvasEl, ctx2d) {
    var g = findGroupForCanvas(canvasEl);
    if (g) {
      return g;
    }
    g = { canvasEl: canvasEl, ctx: ctx2d, tickTimerId: null, lastTickAt: clockRef.now() };
    canvasGroups.push(g);
    return g;
  }

  // ---------------------------------------------------------------------
  // 单例默认 overlay canvas（未显式传 opts.canvas 时使用，如 task-complete 入口）：懒创建、
  // 跨轮次复用不销毁（doc §3「单张持久化全屏 overlay canvas」）。
  // ---------------------------------------------------------------------
  var defaultCanvasEl = null;

  function ensureDefaultCanvas() {
    if (defaultCanvasEl) {
      return defaultCanvasEl;
    }
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function' || !document.body) {
      return null;
    }
    try {
      var el = document.createElement('canvas');
      el.className = 'wtj-fw-canvas';
      if (typeof el.setAttribute === 'function') {
        el.setAttribute('aria-hidden', 'true');
      }
      document.body.appendChild(el);
      var w = (typeof window.innerWidth === 'number' && window.innerWidth > 0) ? window.innerWidth : 1024;
      var h = (typeof window.innerHeight === 'number' && window.innerHeight > 0) ? window.innerHeight : 768;
      el.width = w;
      el.height = h;
      defaultCanvasEl = el;
      return defaultCanvasEl;
    } catch (err) {
      console.error('[WTJ_REWARD_FIREWORKS] 创建默认 overlay canvas 失败，已捕获：', err);
      return null;
    }
  }

  function resolveCanvas(explicitCanvas) {
    if (explicitCanvas) {
      return explicitCanvas;
    }
    return ensureDefaultCanvas();
  }

  function getCtxFor(canvasEl) {
    var group = findGroupForCanvas(canvasEl);
    if (group) {
      return group.ctx;
    }
    try {
      return canvasEl.getContext('2d');
    } catch (err) {
      console.error('[WTJ_REWARD_FIREWORKS] canvasEl.getContext("2d") 调用失败，已捕获：', err);
      return null;
    }
  }

  // origin 支持 {x,y}（像素）或 {leftPercent,topPercent}（相对 canvas 尺寸的百分比）；两者都
  // 缺失/格式不对时回退到 canvas 视觉中心（doc §4：anchor 为空必须兜底，否则在 (0,0)/NaN 炸开）。
  function resolveOrigin(originOpt, canvasEl) {
    var w = (canvasEl && canvasEl.width) ? canvasEl.width : 1024;
    var h = (canvasEl && canvasEl.height) ? canvasEl.height : 768;
    if (originOpt && typeof originOpt.x === 'number' && typeof originOpt.y === 'number') {
      return { x: originOpt.x, y: originOpt.y };
    }
    if (originOpt && typeof originOpt.leftPercent === 'number' && typeof originOpt.topPercent === 'number') {
      return { x: (originOpt.leftPercent / 100) * w, y: (originOpt.topPercent / 100) * h };
    }
    return { x: w / 2, y: h / 2 };
  }

  // ---------------------------------------------------------------------
  // 共享全局预算裁剪（doc §3 核心不变量）：任意时刻全部并发 playback 的存活粒子总数不超过
  // getMaxParticles()。list 是已经算好的粒子 opts 数组，本函数只负责裁剪 + push，不负责生成。
  // ---------------------------------------------------------------------
  function spawnList(pb, list) {
    var budget = getMaxParticles() - totalAliveParticles();
    if (budget <= 0) {
      return 0;
    }
    var actual = Math.min(list.length, budget);
    var i;
    for (i = 0; i < actual; i++) {
      pb.particles.push(makeParticle(list[i]));
    }
    return actual;
  }

  // ---------------------------------------------------------------------
  // molten-fountain 生成（doc §2）：3 层，每层的总数由 STYLE_PARAMS.layers[*].frac * total 的
  // 算术公式决定（accent 层用剩余量而非 round()，保证三层之和恰好等于 total）。
  // ---------------------------------------------------------------------
  function spawnMoltenLayer(pb, count, layerCfg, cfg) {
    var list = [];
    var i;
    for (i = 0; i < count; i++) {
      var deg = cfg.baseAngleDeg + (fxRandom() * 2 - 1) * cfg.spreadDeg;
      var speed = layerCfg.speedMin + fxRandom() * (layerCfg.speedMax - layerCfg.speedMin);
      var v = aim(deg, speed);
      list.push({
        x: pb.origin.x, y: pb.origin.y,
        vx: v.vx, vy: v.vy,
        life: layerCfg.lifeMin + fxRandom() * (layerCfg.lifeMax - layerCfg.lifeMin),
        size: layerCfg.sizeMin + fxRandom() * (layerCfg.sizeMax - layerCfg.sizeMin),
        gravityScale: 1,
        dragScale: layerCfg.dragScale,
        fadePow: layerCfg.fadePow,
        shape: 'dot',
        colorKey: layerCfg.colorKey
      });
    }
    spawnList(pb, list);
  }

  function spawnMoltenFountain(pb, tier) {
    var cfg = STYLE_PARAMS['molten-fountain'];
    var total = cfg.counts[tier] || cfg.counts.normal;
    var baseCount = Math.round(total * cfg.layers.base.frac);
    var trailCount = Math.round(total * cfg.layers.trail.frac);
    var accentCount = total - baseCount - trailCount; // 剩余量，保证三层之和精确等于 total。

    spawnMoltenLayer(pb, baseCount, cfg.layers.base, cfg);
    spawnMoltenLayer(pb, trailCount, cfg.layers.trail, cfg);
    if (!forceNoSecondaryLayers) {
      spawnMoltenLayer(pb, accentCount, cfg.layers.accent, cfg);
    }
  }

  // ---------------------------------------------------------------------
  // starburst 生成（doc §2）：5 主射线（streak，沿速度方向旋转贴图）+ 5 次射线（dot）+ 中心
  // flash（dot，alpha 硬封顶）。总数 = mainTotal + secTotal + flashCount 恰好等于 total（算术
  // 精确，不掺入随机）。
  // ---------------------------------------------------------------------
  function spawnStarburst(pb, tier) {
    var cfg = STYLE_PARAMS['starburst'];
    var total = cfg.counts[tier] || cfg.counts.normal;
    var rotationBase = fxRandom() * 360; // 每次触发的整体旋转量，让连续几次视觉不重合。

    var flashCount = forceNoSecondaryLayers ? 0 : Math.min(cfg.centerFlashCount, total);
    var remaining = total - flashCount;
    var mainTotal, secTotal;
    if (forceNoSecondaryLayers) {
      mainTotal = remaining;
      secTotal = 0;
    } else {
      mainTotal = Math.round(remaining * 0.65);
      secTotal = remaining - mainTotal;
    }

    var perMainArr = distributeEvenly(mainTotal, cfg.mainRayCount);
    var perSecArr = distributeEvenly(secTotal, cfg.secondaryRayCount);

    var list = [];
    var i, j, deg, speed, v;

    for (i = 0; i < cfg.mainRayCount; i++) {
      deg = -90 + i * (360 / cfg.mainRayCount) + rotationBase + (fxRandom() * 2 - 1) * cfg.rayJitterDeg;
      for (j = 0; j < perMainArr[i]; j++) {
        speed = 220 + fxRandom() * 160;
        v = aim(deg, speed);
        list.push({
          x: pb.origin.x, y: pb.origin.y, vx: v.vx, vy: v.vy,
          life: 420 + fxRandom() * 260, size: 2.2 + fxRandom() * 1.4,
          gravityScale: 1, dragScale: 1, fadePow: 1,
          shape: 'streak', angleForStreak: deg, colorKey: 'starburst-main'
        });
      }
    }

    if (!forceNoSecondaryLayers) {
      for (i = 0; i < cfg.secondaryRayCount; i++) {
        deg = -90 + cfg.secondaryOffsetDeg + i * (360 / cfg.secondaryRayCount) + rotationBase;
        for (j = 0; j < perSecArr[i]; j++) {
          speed = 140 + fxRandom() * 100;
          v = aim(deg, speed);
          list.push({
            x: pb.origin.x, y: pb.origin.y, vx: v.vx, vy: v.vy,
            life: 300 + fxRandom() * 200, size: 1.6 + fxRandom() * 1.0,
            gravityScale: 1, dragScale: 1, fadePow: 1,
            shape: 'dot', colorKey: 'starburst-secondary'
          });
        }
      }

      for (i = 0; i < flashCount; i++) {
        deg = fxRandom() * 360;
        speed = 20 + fxRandom() * 40;
        v = aim(deg, speed);
        list.push({
          x: pb.origin.x, y: pb.origin.y, vx: v.vx, vy: v.vy,
          life: 180 + fxRandom() * 120, size: 3 + fxRandom() * 2,
          gravityScale: 0.3, dragScale: 1.5, fadePow: 1,
          shape: 'dot', colorKey: 'starburst-flash', maxAlpha: cfg.maxFlashAlpha
        });
      }
    }

    spawnList(pb, list);
  }

  // ---------------------------------------------------------------------
  // round-bloom 生成（doc §2）：内环 + 外环，各占一半配额（inner=round(total*0.5)，
  // outer=剩余量，保证之和精确等于 total）。每个粒子的 gravityDelayMs=380（迟落点，age 未到
  // 之前不受重力，只按初速度飘）。半径从 r0=0.17*min(w,h) 起，天然留出中心一片不生成粒子的
  // 空白（约占直径 34%），避免遮挡奖励物本体。
  // ---------------------------------------------------------------------
  function spawnRoundBloom(pb, tier, canvasW, canvasH) {
    var cfg = STYLE_PARAMS['round-bloom'];
    var total = cfg.counts[tier] || cfg.counts.normal;
    var inner = Math.round(total * 0.5);
    var outer = forceNoSecondaryLayers ? 0 : (total - inner);
    if (forceNoSecondaryLayers) {
      inner = total; // 砍外环时把配额全部并入内环，仍保持总数精确等于 total。
    }
    var minDim = Math.min(canvasW, canvasH);
    var r0 = cfg.minRadiusFrac * minDim;

    var list = [];
    var i, deg, rad, radius, speed, v;

    for (i = 0; i < inner; i++) {
      deg = (360 * i) / inner + fxRandom() * 6;
      rad = (deg * Math.PI) / 180;
      radius = r0 + fxRandom() * (minDim * 0.06);
      speed = 60 + fxRandom() * 60;
      v = aim(deg, speed);
      list.push({
        x: pb.origin.x + Math.cos(rad) * radius,
        y: pb.origin.y - Math.sin(rad) * radius,
        vx: v.vx, vy: v.vy,
        life: 560 + fxRandom() * 260, size: 2 + fxRandom() * 1.6,
        gravityScale: 1, dragScale: 1, fadePow: 1,
        gravityDelayMs: cfg.gravityDelayMs,
        shape: 'dot', colorKey: 'bloom-inner'
      });
    }

    if (!forceNoSecondaryLayers) {
      for (i = 0; i < outer; i++) {
        deg = (360 * i) / outer + fxRandom() * 6 + (outer > 0 ? 180 / outer : 0);
        rad = (deg * Math.PI) / 180;
        radius = r0 * 1.7 + fxRandom() * (minDim * 0.08);
        speed = 40 + fxRandom() * 50;
        v = aim(deg, speed);
        list.push({
          x: pb.origin.x + Math.cos(rad) * radius,
          y: pb.origin.y - Math.sin(rad) * radius,
          vx: v.vx, vy: v.vy,
          life: 620 + fxRandom() * 260, size: 1.8 + fxRandom() * 1.4,
          gravityScale: 1, dragScale: 1, fadePow: 1,
          gravityDelayMs: cfg.gravityDelayMs,
          shape: 'dot', colorKey: 'bloom-outer'
        });
      }
    }

    spawnList(pb, list);
  }

  function spawnForStyle(pb, tier, w, h) {
    if (pb.styleId === 'molten-fountain') {
      spawnMoltenFountain(pb, tier);
    } else if (pb.styleId === 'starburst') {
      spawnStarburst(pb, tier);
    } else if (pb.styleId === 'round-bloom') {
      spawnRoundBloom(pb, tier, w, h);
    }
  }

  // ---------------------------------------------------------------------
  // reduced-motion 静态定格帧（D3：两入口统一"静态定格一帧"，见文件头「prefers-reduced-motion」
  // 一节）：只保留每个形态的主层，vx=vy=0、life=maxLife=1（不会衰减，因为不进 tick 循环），
  // 仍然经过与正常路径相同的共享预算裁剪（spawnList()）。
  // ---------------------------------------------------------------------
  function spawnStaticMolten(pb, tier) {
    var cfg = STYLE_PARAMS['molten-fountain'];
    var total = cfg.counts[tier] || cfg.counts.normal;
    var list = [];
    var i, deg, rad, dist;
    for (i = 0; i < total; i++) {
      deg = cfg.baseAngleDeg + (fxRandom() * 2 - 1) * cfg.spreadDeg;
      rad = (deg * Math.PI) / 180;
      dist = 40 + fxRandom() * 90;
      list.push({
        x: pb.origin.x + Math.cos(rad) * dist,
        y: pb.origin.y - Math.sin(rad) * dist,
        vx: 0, vy: 0, life: 1, gravityScale: 0, dragScale: 1, fadePow: 1,
        shape: 'dot', colorKey: 'warm-gold'
      });
    }
    spawnList(pb, list);
  }

  function spawnStaticStarburst(pb, tier) {
    var cfg = STYLE_PARAMS['starburst'];
    var total = cfg.counts[tier] || cfg.counts.normal;
    var rotationBase = fxRandom() * 360;
    var perMainArr = distributeEvenly(total, cfg.mainRayCount);
    var list = [];
    var i, j, deg, rad, dist;
    for (i = 0; i < cfg.mainRayCount; i++) {
      deg = -90 + i * (360 / cfg.mainRayCount) + rotationBase;
      rad = (deg * Math.PI) / 180;
      for (j = 0; j < perMainArr[i]; j++) {
        dist = 60 + fxRandom() * 120;
        list.push({
          x: pb.origin.x + Math.cos(rad) * dist,
          y: pb.origin.y - Math.sin(rad) * dist,
          vx: 0, vy: 0, life: 1, gravityScale: 0, dragScale: 1, fadePow: 1,
          shape: 'dot', colorKey: 'starburst-main'
        });
      }
    }
    spawnList(pb, list);
  }

  function spawnStaticRoundBloom(pb, tier, w, h) {
    var cfg = STYLE_PARAMS['round-bloom'];
    var total = cfg.counts[tier] || cfg.counts.normal;
    var minDim = Math.min(w, h);
    var r0 = cfg.minRadiusFrac * minDim;
    var list = [];
    var i, deg, rad;
    for (i = 0; i < total; i++) {
      deg = (360 * i) / total;
      rad = (deg * Math.PI) / 180;
      list.push({
        x: pb.origin.x + Math.cos(rad) * r0,
        y: pb.origin.y - Math.sin(rad) * r0,
        vx: 0, vy: 0, life: 1, gravityScale: 0, dragScale: 1, fadePow: 1,
        shape: 'dot', colorKey: 'bloom-inner'
      });
    }
    spawnList(pb, list);
  }

  function spawnStaticFrame(pb, tier, w, h) {
    if (pb.styleId === 'molten-fountain') {
      spawnStaticMolten(pb, tier);
    } else if (pb.styleId === 'starburst') {
      spawnStaticStarburst(pb, tier);
    } else if (pb.styleId === 'round-bloom') {
      spawnStaticRoundBloom(pb, tier, w, h);
    }
  }

  // ---------------------------------------------------------------------
  // 物理更新：per-playback 的 gravity/drag 来自其 styleParams（三形态各自不同，不是全局常量）。
  // gravityDelayMs（round-bloom 迟落点用）：age 未到之前不施加重力，只受既有速度 + 阻力影响。
  // ---------------------------------------------------------------------
  function updateParticlesForPlayback(pb, dtMs) {
    var gravity = pb.styleParams.gravity;
    var drag = pb.styleParams.drag;
    var dtSec = dtMs / 1000;
    var next = [];
    var i;
    for (i = 0; i < pb.particles.length; i++) {
      var p = pb.particles[i];
      p.life -= dtMs;
      p.age += dtMs;
      if (p.life <= 0) {
        continue; // 生命耗尽，剔除（不放入 next）。
      }
      if (p.age >= p.gravityDelayMs) {
        p.vy += gravity * dtSec * p.gravityScale;
      }
      var dragFactor = 1 - clampNum(drag * p.dragScale * dtSec, 0, 1);
      p.vx *= dragFactor;
      p.vy *= dragFactor;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      next.push(p);
    }
    pb.particles = next;
  }

  function computeAlpha(p) {
    var frac = clampNum(p.life / p.maxLife, 0, 1);
    var alpha = Math.pow(frac, p.fadePow || 1);
    if (typeof p.maxAlpha === 'number' && p.maxAlpha < alpha) {
      alpha = p.maxAlpha;
    }
    return alpha;
  }

  // ---------------------------------------------------------------------
  // 渲染：每帧仅 1×clearRect（每张 canvas 一次，不是每个 playback 一次）+ 每个存活粒子
  // 1×drawImage + globalAlpha 赋值。streak 形状（仅 starburst 主射线）额外 save/translate/
  // rotate/restore——doc 明确这是"仅限少量 ray 粒子"的例外，其余粒子走无旋转的 dot 分支。
  // ---------------------------------------------------------------------
  var SPRITE_DRAW_SCALE = 2.6;

  function drawParticle(ctx, p) {
    var alpha = computeAlpha(p);
    if (alpha <= 0) {
      return;
    }
    var shapeKind = (p.shape === 'streak') ? 'streak' : 'dot';
    var sprite = getSprite(p.colorKey, p.variantIdx, shapeKind);
    if (!sprite) {
      return;
    }
    var drawSize = Math.max(4, p.size * SPRITE_DRAW_SCALE);
    ctx.globalAlpha = alpha;
    if (shapeKind === 'streak' && typeof p.angleForStreak === 'number') {
      ctx.save();
      ctx.translate(p.x, p.y);
      // canvas rotate() 顺时针为正、math 角度约定向上为正，两者符号相反，故取负号——与
      // aim() 里的 vy 取负号是同一个坐标系转换问题的另一面，一并在此处注明防止后续维护者
      // 各自重新推导。
      ctx.rotate((-p.angleForStreak * Math.PI) / 180);
      ctx.drawImage(sprite, -drawSize, -drawSize / 2, drawSize * 2, drawSize);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, p.x - drawSize / 2, p.y - drawSize / 2, drawSize, drawSize);
    }
  }

  function renderGroup(group) {
    if (!group || !group.ctx || !group.canvasEl) {
      return;
    }
    try {
      group.ctx.clearRect(0, 0, group.canvasEl.width, group.canvasEl.height);
      var list = playbacksForCanvas(group.canvasEl);
      var i, j;
      for (i = 0; i < list.length; i++) {
        var pb = list[i];
        for (j = 0; j < pb.particles.length; j++) {
          drawParticle(group.ctx, pb.particles[j]);
        }
      }
      group.ctx.globalAlpha = 1;
    } catch (err) {
      console.error('[WTJ_REWARD_FIREWORKS] 渲染帧失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // one-shot 自我清理（doc §3）：粒子清零或到 durationMs（两者任一）即从全局 playbacks 移出
  // + 触发 onComplete，显式规避 frame-anim P1-1 那类"播完只停 tick 不移出注册表"的泄漏。
  // skipRender 为 true 时不在这里单独 renderGroup()（tick 循环自己会在 reap 之后统一渲染一次，
  // 避免同一个 tick 里重复渲染两次）。
  // ---------------------------------------------------------------------
  function finalizePlayback(pb, skipRender) {
    var idx = findPlaybackIndexById(pb.id);
    if (idx !== -1) {
      playbacks.splice(idx, 1);
    }
    if (!skipRender) {
      var group = findGroupForCanvas(pb.canvasEl);
      if (group) {
        renderGroup(group);
        if (playbacksForCanvas(pb.canvasEl).length === 0 && group.tickTimerId !== null) {
          clockRef.clearTimeout(group.tickTimerId);
          group.tickTimerId = null;
        }
      }
    }
    if (pb.onComplete) {
      try {
        pb.onComplete();
      } catch (err) {
        console.error('[WTJ_REWARD_FIREWORKS] onComplete 回调抛出异常，已捕获：', err);
      }
    }
  }

  function reapCompletedForCanvas(canvasEl, now) {
    var list = playbacksForCanvas(canvasEl);
    var i;
    for (i = 0; i < list.length; i++) {
      var pb = list[i];
      var elapsed = now - pb.startTime;
      var done = elapsed >= pb.durationMs || (elapsed > 0 && pb.particles.length === 0);
      if (done) {
        finalizePlayback(pb, true);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 每张 canvas 一条 tick 调度链（clockRef.setTimeout 链，TICK_MS≈60Hz，与 reward-chest.js/
  // frame-anim.js 同一取舍——见两者文件头「计时驱动方式」一节，此处不再重复论证）。
  // ---------------------------------------------------------------------
  function scheduleGroupTick(group) {
    group.tickTimerId = clockRef.setTimeout(function () {
      tickGroup(group);
    }, TICK_MS);
  }

  function tickGroup(group) {
    group.tickTimerId = null;
    var now = clockRef.now();
    var rawDt = now - group.lastTickAt;
    if (rawDt <= 0) {
      rawDt = TICK_MS;
    }
    group.lastTickAt = now;
    recordTickDt(rawDt); // 自适应降级读取未钳制的原始 dt（要能观察到"这一帧真的很慢"）。
    var dt = Math.min(rawDt, DT_CAP_MS); // 物理更新用钳制过的 dt（防止后台节流恢复时穿越）。

    try {
      var list = playbacksForCanvas(group.canvasEl);
      var i;
      for (i = 0; i < list.length; i++) {
        updateParticlesForPlayback(list[i], dt);
      }
    } catch (err) {
      console.error('[WTJ_REWARD_FIREWORKS] tick 粒子更新失败，已捕获：', err);
    }

    reapCompletedForCanvas(group.canvasEl, now);
    renderGroup(group); // 本 tick 只统一渲染这一次（reap 已经把结束的 playback 移出）。

    if (playbacksForCanvas(group.canvasEl).length > 0) {
      scheduleGroupTick(group);
    } else if (group.tickTimerId !== null) {
      clockRef.clearTimeout(group.tickTimerId);
      group.tickTimerId = null;
    }
  }

  // ---------------------------------------------------------------------
  // play() / stop() / stopAll() / reset()
  // ---------------------------------------------------------------------
  function play(styleId, opts) {
    opts = (opts && typeof opts === 'object') ? opts : {};

    var styleParams = STYLE_PARAMS[styleId];
    if (!styleParams) {
      console.warn('[WTJ_REWARD_FIREWORKS] play(): 未知 style "' + String(styleId) + '"，已忽略。');
      return null;
    }

    var canvasEl = resolveCanvas(opts.canvas);
    if (!canvasEl) {
      console.warn('[WTJ_REWARD_FIREWORKS] play(): 无可用 canvas（既未提供 opts.canvas，也无法创建模块单例 overlay canvas，可能是非浏览器环境），已忽略。');
      return null;
    }
    var ctx2d = getCtxFor(canvasEl);
    if (!ctx2d) {
      console.warn('[WTJ_REWARD_FIREWORKS] play(): canvasEl.getContext("2d") 返回空，已忽略。');
      return null;
    }

    var tier = resolveTierForPlay(opts.tier);
    var origin = resolveOrigin(opts.origin, canvasEl);
    var reduced = prefersReducedMotion();

    var pb = {
      id: nextPlaybackId++,
      canvasEl: canvasEl,
      ctx: ctx2d,
      styleId: styleId,
      styleParams: styleParams,
      origin: origin,
      startTime: clockRef.now(),
      durationMs: styleParams.durationMs,
      particles: [],
      onComplete: (typeof opts.onComplete === 'function') ? opts.onComplete : null,
      reducedMotion: reduced,
      tier: tier
    };

    playbacks.push(pb);

    try {
      if (reduced) {
        spawnStaticFrame(pb, tier, canvasEl.width, canvasEl.height);
      } else {
        spawnForStyle(pb, tier, canvasEl.width, canvasEl.height);
      }
    } catch (err) {
      console.error('[WTJ_REWARD_FIREWORKS] 生成粒子失败，已捕获：', err);
    }

    var group = ensureGroupForCanvas(canvasEl, ctx2d);
    renderGroup(group); // 立即画出首帧，不用等第一次 16ms tick——reduced-motion 下这就是唯一一帧。

    if (reduced) {
      // reduced-motion：不进入 tick 循环，但仍需要在 durationMs 后完成清理 + onComplete
      // （与 frame-anim.js runReducedMotionBranch() 同一取舍：定时照常跑，只是不逐帧重绘）。
      clockRef.setTimeout(function () {
        if (isActivePlaybackId(pb.id)) {
          finalizePlayback(pb, false);
        }
      }, pb.durationMs);
    } else if (group.tickTimerId === null) {
      group.lastTickAt = clockRef.now();
      scheduleGroupTick(group);
    }

    return pb.id;
  }

  function removePlaybackSilently(pb) {
    var idx = findPlaybackIndexById(pb.id);
    if (idx !== -1) {
      playbacks.splice(idx, 1);
    }
    var group = findGroupForCanvas(pb.canvasEl);
    if (group) {
      renderGroup(group);
      if (playbacksForCanvas(pb.canvasEl).length === 0 && group.tickTimerId !== null) {
        clockRef.clearTimeout(group.tickTimerId);
        group.tickTimerId = null;
      }
    }
  }

  // 显式外部停止：不触发 onComplete（这是"被中止"，不是"自然播完"，与 frame-anim.js stop()/
  // reward-chest.js reset() 同一语义），对不存在/已结束的 handle 是安全的幂等 no-op。
  function stop(handle) {
    var idx = findPlaybackIndexById(handle);
    if (idx === -1) {
      return;
    }
    removePlaybackSilently(playbacks[idx]);
  }

  function stopAll() {
    var snapshot = playbacks.slice(); // 复制一份快照，removePlaybackSilently 会修改 playbacks。
    var i;
    for (i = 0; i < snapshot.length; i++) {
      removePlaybackSilently(snapshot[i]);
    }
  }

  function reset() {
    stopAll();
  }

  // ---------------------------------------------------------------------
  // 测试/QA 内省 API
  // ---------------------------------------------------------------------
  function getState() {
    return {
      tier: currentGlobalTier(),
      particleCount: totalAliveParticles(),
      maxParticles: getMaxParticles(),
      activeEffects: playbacks.length,
      reducedMotion: prefersReducedMotion(),
      degradeLevel: degradeSteps
    };
  }

  function snapshotParticle(p) {
    return {
      x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      life: p.life, maxLife: p.maxLife, age: p.age,
      size: p.size, shape: p.shape, colorKey: p.colorKey,
      gravityScale: p.gravityScale, dragScale: p.dragScale, fadePow: p.fadePow
    };
  }

  function _getParticles(handle) {
    var out = [];
    var i, j;
    if (typeof handle !== 'undefined' && handle !== null) {
      var idx = findPlaybackIndexById(handle);
      if (idx === -1) {
        return out;
      }
      for (j = 0; j < playbacks[idx].particles.length; j++) {
        out.push(snapshotParticle(playbacks[idx].particles[j]));
      }
      return out;
    }
    for (i = 0; i < playbacks.length; i++) {
      for (j = 0; j < playbacks[i].particles.length; j++) {
        out.push(snapshotParticle(playbacks[i].particles[j]));
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // 对外冻结 API
  // ---------------------------------------------------------------------
  var API = {
    VERSION: '0.1.0',
    CARD_ID: 'WTJ-20260706-005',

    play: play,
    stop: stop,
    stopAll: stopAll,
    reset: reset,
    getState: getState,

    // 测试专用，见文件头 API 列表说明；不是给其余生产代码调用的稳定契约。
    _setClock: _setClock,
    _setRandom: _setRandom,
    _setTier: _setTier,
    _getParticles: _getParticles
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固：与 009~056 同款——API 对象自身已 Object.freeze，这里进一步把 window 上的
  // WTJ_REWARD_FIREWORKS 绑定本身设为不可写、不可重配置，防止整体重赋值把状态换掉。重复引入
  // 已由 IIFE 顶部守卫短路，走不到这里，因此到达时 window.WTJ_REWARD_FIREWORKS 必为未定义；
  // 下面判断只是二次保险（兼容无 defineProperty 环境）。
  if (!window.WTJ_REWARD_FIREWORKS && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_REWARD_FIREWORKS', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_REWARD_FIREWORKS) {
    window.WTJ_REWARD_FIREWORKS = API;
  }
})();
