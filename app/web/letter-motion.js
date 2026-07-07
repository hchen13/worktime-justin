// WTJ-20260704-086 — 字母字形/字母动效的 token + 纯函数模块（window.WTJ_LETTER_MOTION）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求、非 module（无 import/export），
// 以普通 <script src="letter-motion.js"> 标签加载，需在 index.html 中排在 manifest.js 之后、
// app.js 之前（app.js 消费本文件暴露的 token/纯函数来渲染字母，见 app/web/app.js 顶部注释）。
//
// 职责边界（086 卡「视觉侧」，与 084 音频侧平行，本文件不碰任何音频）：本文件只提供
// docs/design/wtj-081-main-ui-visual-motion-spec.md（DESIGN 081，已验收）的字母渲染/motion
// token 与纯函数（字体串拼接 / 尺寸范围 / 旋转范围 / 安全区 / 缓动曲线求值 / 逐帧状态插值 /
// 拖尾透明度衰减），**不做任何 DOM/Canvas 绘制**——真正的 ctx.fillText/strokeText/drawImage
// 调用留在 app.js（它已经拥有 canvas/ctx 与 rAF 循环，见该文件 spawnLetter()/drawLetters()）。
// 这样分层的理由：本文件不依赖 document/canvas，可以在 Node vm 沙箱里直接跑单测断言
// token 数值/尺寸区间/缓动曲线单调性等，不需要伪造一整套 CanvasRenderingContext2D。
//
// token 数值来源：docs/assets/style/wtj-081/motion-token-sheet.json（DESIGN 081 已验收资产），
// 逐字段抄录，不擅自改动数值；仅额外补充了该 json 未显式给出、但规范文字描述了的两个派生量：
//   - RADIAL_LIGHT_RADIUS_RATIO = 0.38（081 Layout Spec「Canvas」一节："radius about 38% of
//     the short viewport side"，json 里没有对应字段，故在此以文字描述值补齐）。
//   - MAC_TARGET_MAX_WIDTH_PX = 1440（081"2014 MacBook Air target"对应的目标机分辨率，取自
//     app/PERFORMANCE.md 第 3.3 节"目标机分辨率 1440×900@1x"这一既有事实，非本卡臆造）。
//
// -----------------------------------------------------------------------
// 已知的性能红线冲突与本卡的工程取舍（据实记录，供 TL/PM 复核）
// -----------------------------------------------------------------------
// 081 规范「Letter Rendering Spec」要求给字母加两层 `shadowBlur` 发光（close glow / far
// glow）。但 app/PERFORMANCE.md 第 3.1 节与 app/web/manifest.js 的 `performance
// .disallowShadowBlur` 字段是本项目对目标机（2014 MacBook Air，Intel HD5000 核显）明确定案的
// 性能红线——`ctx.shadowBlur` 是逐像素软件混合，PERFORMANCE.md 原文估计"300 粒子/帧会直接掉到
// 个位数 fps"；字母虽不到 300 个（上限 40），但每字母两次 shadowBlur、逐帧重算，风险同源，
// 且 frame-anim.js / reward-chest.js 两个既有卡片都已明确"全文件不出现 ctx.shadowBlur"。
// 本卡不逐帧调用 shadowBlur，改用 PERFORMANCE.md 自己给出的既定替代方案："发光效果用预渲染
// offscreen canvas 的柔光贴图 + drawImage 代替 shadowBlur"——具体是 app.js 侧按
// (颜色, 尺寸分桶) 缓存一张离屏 canvas 柔光贴图（见 app.js 的 getGlowSprite()，径向渐变只在
// 缓存未命中时算一次，此后逐帧只是廉价的 ctx.drawImage()），视觉上仍是"两层柔光晕"的观感，
// 但去掉了逐帧 shadowBlur 的性能成本。这是本卡在"字面 token 指令"与"项目既有性能红线"之间的
// 主动工程取舍，未回去改 081 文档或 manifest 红线本身。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_LETTER_MOTION，Object.freeze 冻结）
// -----------------------------------------------------------------------
//   TOKENS                     081 token 只读镜像（canvas/header/footer/letters/letterMotion/
//                               functionKeyFeedback，深冻结）。
//   buildLetterFont(sizePx)    -> 拼好的 ctx.font 字符串（081 字体栈 + weight 900）。
//   colorWithAlpha(hex, alpha) -> 'rgba(r,g,b,a)' 字符串（六位 hex 输入）。
//   randomLetterSize(viewportWidth, isDigit) -> px（081 尺寸区间 + MacBook 目标机上限 +
//                               数字键上限，见 functionKeyFeedback.digits.maxSizePx）。
//   randomRotationRad()        -> 弧度（081 旋转区间 -12~12deg）。
//   randomDrift()              -> { angleRad, dx, dy }（081 drift 18-42px，随机方向）。
//   computeSafeArea(width, height) -> { minX, maxX, minY, maxY }（081 安全区：距 header/footer
//                               72px，距左右边 48px；极端小窗口下自动收缩为居中点，不产生
//                               minY > maxY 的非法区间）。
//   cubicBezier(x1,y1,x2,y2)  -> function(t){ return y; }（标准三次贝塞尔缓动求值器，二分法
//                               近似，供 popEase/settleEase 消费，也可供后续卡复用）。
//   popEase / settleEase       081 token 给出的两条缓动曲线（cubic-bezier(0.16,1,0.3,1) /
//                               cubic-bezier(0.2,0.8,0.2,1)）已预先构建好的求值函数。
//   computeLetterFrame(now, letter) -> { alive, scale, rotRad, dx, dy, opacity, blurPx,
//                               trailAlpha, trailGrowth }：给定字母记录（born/life/rotStart/
//                               rotFinal/driftDx/driftDy/reducedMotion）与当前时间戳，返回这一
//                               帧应该怎么画。081 Letter Motion Spec 的 birth pop / settle /
//                               drift / fade 四阶段状态机与 reduced-motion 简化路径都在这里。
//   prefersReducedMotion()     与 frame-anim.js/reward-chest.js 同款 matchMedia 检测。
//
//   —— 以下三项为 WTJ-20260705-002（键盘字母流星拖尾 + 符号显示规则）新增，均为纯函数，
//      不依赖 document/canvas；数值来源见各自旁边注释（均为本卡本地防御式占位值，非 081
//      motion-token-sheet.json 给出的精确数值，同款 keyboard.js FUNCTION_KEY_DECAY_SPAN 的
//      "占位常量"处理方式）：
//   randomizeLetterCase(ch)     -> ch 的大写或小写之一（50/50 随机，不改变字符本身，只改变
//                               大小写展示）。非字母字符（如误传入数字/符号）原样返回，防御式
//                               ——调用方（app.js spawnLetter()）已用 DIGIT_RE 分流，正常不会
//                               传入非字母字符，这里只是双保险。
//   randomizeDigitDisplay(digit) -> digit 原样数字，或按 US 键盘 shift 层映射后的符号（如
//                               '1'->'!'，见 DIGIT_SHIFT_MAP），60% 概率原样数字 / 40% 概率
//                               符号。非 0-9 字符原样返回，防御式。
//   randomSparkles()            -> [{ t, sizeFrac, phaseRad, twinkleHz }, ...]：字母流星拖尾上
//                               散落的星点/闪点纯参数生成器（2~4 个，见 SPARKLE_PARAMS），与
//                               randomDrift() 并列——只产生"这一次拖尾该有几个星点、分别在拖尾
//                               哪个位置比例(t)、多大(sizeFrac)、闪烁相位/频率(phaseRad/
//                               twinkleHz)"这组静态参数，不产生任何绘制副作用。真正把这些参数
//                               渲染成可见星点的贴图预渲染 + drawImage 在 app/web/sparkles.js
//                               （window.WTJ_SPARKLES.drawSparkles()）——该文件是与后续 003 卡
//                               （指针拖尾）共享的绘制层，见其文件头 "SHARED: consumed by card
//                               003 pointer trail" 注释。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // 重复引入守卫（同款 pointer.js/audio.js/keysound.js 的教训）。
  if (window.WTJ_LETTER_MOTION) {
    return;
  }

  // ---------------------------------------------------------------------
  // 081 token 镜像（逐字段抄录 docs/assets/style/wtj-081/motion-token-sheet.json）
  // ---------------------------------------------------------------------
  var TOKENS = {
    canvas: {
      top: '#090d15',
      mid: '#06101d',
      bottom: '#050812',
      radialLight: 'rgba(74, 128, 214, 0.18)',
      radialLightBoosted: 'rgba(74, 128, 214, 0.22)', // 74/128/214 alpha+0.04（功能键 light 反馈的 stageLightBoost）
      emptyStageRatio: 0.7,
      // 081 文字描述"radius about 38% of the short viewport side"；json 未给出字段名，
      // 此处补一个派生常量（见文件头「token 数值来源」说明）。
      radialLightRadiusRatio: 0.38
    },
    header: {
      heightPx: 44,
      minHeightPx: 38,
      titleFontPx: 15,
      titleWeight: 800,
      lockSvgSizePx: 13,
      lockOpacity: 0.36
    },
    footer: {
      heightPx: 92,
      minHeightPx: 78,
      divider: 'rgba(156, 180, 220, 0.16)',
      background: 'rgba(5, 10, 18, 0.72)',
      topGlow: 'rgba(94, 231, 255, 0.06)'
    },
    letters: {
      fontStack: '"Arial Rounded MT Bold", "Arial Rounded Bold", "SF Pro Rounded", "SF Compact Rounded", "Avenir Next", -apple-system, BlinkMacSystemFont, sans-serif',
      weight: 900,
      desktopSizeRangePx: [56, 148],
      targetMacCapPx: 132,
      rotationDegRange: [-12, 12],
      safeAreaPx: { topBottom: 72, sides: 48 },
      palette: ['#ffd84c', '#3ce7ff', '#ff675a', '#9cff38', '#ff77b8', '#82a8ff'],
      darkStrokeAlpha: 0.58,
      darkStrokeWidthRatio: 0.055,
      highlightAlpha: 0.2,
      highlightOffsetRatio: [-0.025, -0.035],
      closeGlowBlurRatio: 0.1,
      farGlowBlurRatio: 0.24,
      farGlowAlpha: 0.38
    },
    letterMotion: {
      birthPopMs: 90,
      settleMs: 100,
      lifeMsRange: [800, 1500],
      scale: { start: 0.78, overshoot: 1.08, settled: 1 },
      driftPxRange: [18, 42],
      trailLengthPxRange: [58, 120],
      trailMaxOpacity: 0.42,
      easing: {
        pop: [0.16, 1, 0.3, 1],
        settle: [0.2, 0.8, 0.2, 1]
      },
      reducedMotion: {
        overshoot: false,
        drift: false,
        fadeMsRange: [600, 900]
      }
    },
    functionKeyFeedback: {
      spaceEnter: {
        category: 'light',
        durationMs: 360,
        ringRadiusPx: [18, 96],
        ringStroke: 'rgba(94,231,255,0.42)',
        stageLightBoost: 0.04
      },
      modifiers: {
        category: 'weak',
        durationMs: 220,
        maxOpacity: 0.22,
        reward: false
      },
      digits: {
        category: 'effective',
        maxSizePx: 118,
        trailMultiplier: 0.75
      },
      punctuationArrowsOther: {
        category: 'other',
        durationMs: 260,
        maxOpacity: 0.25,
        maxGlowPx: 40,
        reward: false
      },
      sameFunctionKeyDecay: { nearZeroByPress: 4 }
    }
  };

  // 2014 MacBook Air 目标机分辨率（app/PERFORMANCE.md 第 3.3 节既有事实：1440×900@1x），
  // 081"2014 MacBook Air target"上限（targetMacCapPx=132）按视口宽度 <= 该值时生效。
  var MAC_TARGET_MAX_WIDTH_PX = 1440;

  function deepFreeze(obj) {
    if (!Object.freeze) return obj;
    Object.getOwnPropertyNames(obj).forEach(function (key) {
      var val = obj[key];
      if (val && (typeof val === 'object')) {
        deepFreeze(val);
      }
    });
    return Object.freeze(obj);
  }

  deepFreeze(TOKENS);

  // ---------------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------------
  function clamp01(t) {
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clampNum(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  // ---------------------------------------------------------------------
  // 字体串 / 颜色
  // ---------------------------------------------------------------------
  function buildLetterFont(sizePx) {
    return String(TOKENS.letters.weight) + ' ' + Math.round(sizePx) + 'px ' + TOKENS.letters.fontStack;
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    var num = parseInt(h, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function colorWithAlpha(hex, alpha) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
  }

  // ---------------------------------------------------------------------
  // 尺寸 / 旋转 / 漂移随机化
  // ---------------------------------------------------------------------
  function randomLetterSize(viewportWidth, isDigit) {
    var minSize = TOKENS.letters.desktopSizeRangePx[0];
    var maxSize = (typeof viewportWidth === 'number' && viewportWidth <= MAC_TARGET_MAX_WIDTH_PX) ?
      TOKENS.letters.targetMacCapPx :
      TOKENS.letters.desktopSizeRangePx[1];
    if (isDigit) {
      // REQ：数字键走同一渲染管线，但尺寸封顶 118px（functionKeyFeedback.digits.maxSizePx），
      // 不喧宾夺主盖过字母探索。
      maxSize = Math.min(maxSize, TOKENS.functionKeyFeedback.digits.maxSizePx);
    }
    if (maxSize < minSize) maxSize = minSize; // 极端窗口尺寸下的防御式兜底
    return rand(minSize, maxSize);
  }

  function randomRotationRad() {
    var deg = rand(TOKENS.letters.rotationDegRange[0], TOKENS.letters.rotationDegRange[1]);
    return deg * Math.PI / 180;
  }

  function randomDrift() {
    var angle = Math.random() * Math.PI * 2; // "random diagonal"：不限定象限，全向随机
    var dist = rand(TOKENS.letterMotion.driftPxRange[0], TOKENS.letterMotion.driftPxRange[1]);
    return {
      angleRad: angle,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist
    };
  }

  // ---------------------------------------------------------------------
  // WTJ-20260705-002 — 字母大小写随机化（50/50）：调用方（app.js spawnLetter()）在字母 spawn
  // 时调用一次，绝不逐帧调用（一旦字母诞生，展示的大小写在其整个生命周期内保持不变，只是
  // "这一次弹出用哪个大小写"是随机的，不是"这一帧用哪个"）。
  // ---------------------------------------------------------------------
  var ALPHA_RE = /^[a-zA-Z]$/;

  function randomizeLetterCase(ch) {
    if (!ALPHA_RE.test(ch)) return ch; // 防御式：非字母字符原样返回（数字/符号不受影响）
    return Math.random() < 0.5 ? String(ch).toUpperCase() : String(ch).toLowerCase();
  }

  // ---------------------------------------------------------------------
  // WTJ-20260705-002 — 数字键 60/40 展示规则：60% 概率原样数字，40% 概率替换为 US 键盘 shift
  // 层对应符号（如 1 键的 shift 层是 '!'）。DIGIT_SHIFT_MAP 逐字段抄录标准 US QWERTY 数字行
  // shift 映射（非 081 token 来源，US 键盘布局本身即是不会变的既定事实）。调用方
  // （app.js spawnLetter()）必须先用真实发射字符算好 isDigit（决定尺寸上限/拖尾倍率），
  // 再调用本函数只替换渲染用的 ch 字段，不影响已经算好的 size/trail 数值。
  // ---------------------------------------------------------------------
  var DIGIT_SHIFT_MAP = {
    '0': ')', '1': '!', '2': '@', '3': '#', '4': '$',
    '5': '%', '6': '^', '7': '&', '8': '*', '9': '('
  };
  if (Object.freeze) Object.freeze(DIGIT_SHIFT_MAP);

  var DIGIT_SHIFT_PROBABILITY = 0.4; // "数字 60/40"：60% 原样数字 / 40% shift 符号

  function randomizeDigitDisplay(digit) {
    var symbol = DIGIT_SHIFT_MAP[digit];
    if (!symbol) return digit; // 防御式兜底：非 0-9 字符原样返回（理论上调用方已用 DIGIT_RE 过滤）
    return Math.random() < DIGIT_SHIFT_PROBABILITY ? symbol : digit;
  }

  // ---------------------------------------------------------------------
  // WTJ-20260705-002 — 拖尾星点/闪点纯参数生成器（与 randomDrift() 并列，spawnLetter() 时
  // 调用一次，结果存在 letter 记录上，逐帧复用，不逐帧重新生成）。SPARKLE_PARAMS 是本卡本地
  // 占位数值（非 081 motion-token-sheet.json 来源），一并冻结导出，供消费方/单测直接读取
  // 边界值，避免手工镜像数值漂移（与本文件其余 081 token 的处理哲学一致）。
  //
  // WTJ-20260705-019b（Ethan 截图反馈④「字母拖尾更像流星尾迹：周围星点更小、更自然」）：
  // 002 首版的 sizeFracRange [0.32, 0.8] 相对字母尺寸偏大——按字母渲染尺寸区间
  // 56~148px（见 TOKENS.letters.desktopSizeRangePx）换算，上限星点可以画到约 118px，
  // 接近字母本体大小，观感是"大块光斑"而不是"细碎流星尘"。本次把整个区间下移收窄到
  // [0.12, 0.32]（新上限恰好等于旧下限，星点整体明显缩小），countRange 从 [2,4] 提到
  // [3,6] 略微增加颗粒数——单颗更小 + 数量略多，总体视觉"重量"不增反降，但连续感更强，
  // 更像细碎的流星尾迹而不是零星几个大光点。
  // 同时新增 tBiasPower：真实流星/彗星尾迹的光尘在靠近本体（t 接近 0）一端更密集，越往
  // 尾端（t 接近 1）越稀疏，不是沿整条拖尾长度等概率分布。randomSparkles() 用
  // Math.pow(Math.random(), tBiasPower) 对 [0,1) 均匀随机数做幂次变形（指数 > 1 时把分布
  // 向 0 端压缩）实现这种"头密尾疏"的非均匀分布。
  // ---------------------------------------------------------------------
  var SPARKLE_PARAMS = {
    countRange: [3, 6],           // 每条拖尾上的星点数量区间（"几个同色星星/闪点"）
    sizeFracRange: [0.12, 0.32],  // 相对字母渲染尺寸（size）的比例——较 002 首版明显缩小
    twinkleHzRange: [0.6, 1.6],   // 闪烁频率区间（Hz），供消费方按 now 算出逐帧 twinkle alpha
    tBiasPower: 1.6               // t 分布幂次偏置：>1 时越靠近字母本体（t 小）越密集
  };
  deepFreeze(SPARKLE_PARAMS);

  function randomSparkles() {
    var span = SPARKLE_PARAMS.countRange[1] - SPARKLE_PARAMS.countRange[0];
    var count = SPARKLE_PARAMS.countRange[0] + Math.floor(Math.random() * (span + 1));
    var list = [];
    var i;
    for (i = 0; i < count; i++) {
      list.push({
        // 沿拖尾方向的位置比例：0=贴近字母本体，1=拖尾末端。用 tBiasPower 对均匀随机数做
        // 幂次变形，让星点"头密尾疏"（见上方文件内「019b」说明），而不是均匀撒在整条拖尾上。
        t: Math.pow(Math.random(), SPARKLE_PARAMS.tBiasPower),
        sizeFrac: rand(SPARKLE_PARAMS.sizeFracRange[0], SPARKLE_PARAMS.sizeFracRange[1]),
        phaseRad: Math.random() * Math.PI * 2, // 闪烁相位偏移，让多个星点不同步闪烁
        twinkleHz: rand(SPARKLE_PARAMS.twinkleHzRange[0], SPARKLE_PARAMS.twinkleHzRange[1])
      });
    }
    return list;
  }

  function computeSafeArea(width, height) {
    var minX = TOKENS.letters.safeAreaPx.sides;
    var maxX = Math.max(minX, width - TOKENS.letters.safeAreaPx.sides);
    var minY = TOKENS.header.heightPx + TOKENS.letters.safeAreaPx.topBottom;
    var maxY = Math.max(minY, height - TOKENS.footer.heightPx - TOKENS.letters.safeAreaPx.topBottom);
    if (minY > maxY) {
      // 极端矮窗口（理论 edge case，正常 2014 MacBook Air 900px 高不会触发）：安全区退化为
      // 屏幕纵向中点附近的一个点，而不是抛出一个非法（min>max）区间给调用方的 rand()。
      var mid = (minY + maxY) / 2;
      minY = mid;
      maxY = mid;
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  // ---------------------------------------------------------------------
  // 三次贝塞尔缓动求值器（标准二分法近似，CSS cubic-bezier(x1,y1,x2,y2) 同款语义）
  // ---------------------------------------------------------------------
  function bezierComponent(t, a1, a2) {
    var it = 1 - t;
    return 3 * it * it * t * a1 + 3 * it * t * t * a2 + t * t * t;
  }

  function cubicBezier(x1, y1, x2, y2) {
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      var lo = 0, hi = 1, u = t;
      var i;
      for (i = 0; i < 20; i++) {
        u = (lo + hi) / 2;
        var x = bezierComponent(u, x1, x2);
        if (x < t) {
          lo = u;
        } else {
          hi = u;
        }
      }
      return bezierComponent(u, y1, y2);
    };
  }

  var popEase = cubicBezier(
    TOKENS.letterMotion.easing.pop[0], TOKENS.letterMotion.easing.pop[1],
    TOKENS.letterMotion.easing.pop[2], TOKENS.letterMotion.easing.pop[3]
  );
  var settleEase = cubicBezier(
    TOKENS.letterMotion.easing.settle[0], TOKENS.letterMotion.easing.settle[1],
    TOKENS.letterMotion.easing.settle[2], TOKENS.letterMotion.easing.settle[3]
  );

  // ---------------------------------------------------------------------
  // reduced-motion 检测：与 frame-anim.js/reward-chest.js/status-rewards.js 同款实现。
  // ---------------------------------------------------------------------
  function prefersReducedMotion() {
    // WTJ-20260706-013：kiosk 儿童 app 默认无视 OS「减弱动态」偏好，核心学习动画照播——
    // 旧 Mac（2014 MBA/Big Sur）等机型的系统「减弱动态」常默认开启，且并非 Justin 为这台
    // kiosk 主动选择的偏好。只有 manifest.js 的 performance.honorReducedMotion 显式为
    // true（未来家长设置钩子）时才回头尊重 OS matchMedia；缺省/非 true 一律当作"不尊重"。
    if (!(window.WTJ_MANIFEST && window.WTJ_MANIFEST.performance && window.WTJ_MANIFEST.performance.honorReducedMotion === true)) {
      return false;
    }
    try {
      if (typeof window.matchMedia === 'function') {
        var mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        return !!(mql && mql.matches);
      }
    } catch (err) {
      console.warn('[WTJ_LETTER_MOTION] matchMedia 检测失败，按不启用 reduced-motion 处理，已捕获：', err);
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // 逐帧状态机：081 Letter Motion Spec 的 birth pop / settle / drift / fade 四阶段
  // + reduced-motion 简化路径（跳过 pop overshoot 与 drift，scale 恒 1，600-900ms 线性淡出）。
  // ---------------------------------------------------------------------
  //
  // fade 窗口的推导（081 表格给的绝对毫秒值 900-1500ms 是以 life=1500（区间上限）为例的展示，
  // 文字明确要求"pop 和 drift 应该落在这个生命周期以内，而不是延长它"——若 life 取到区间下限
  // 800ms，绝对值 900ms 起跳的 fade 窗口根本放不进 800ms 的生命里。这里改为按比例换算：
  // fade 窗口占生命周期的比例 = 600/1500 = 0.4，同时收拢到 [300,600]ms 防止极短或极长生命下
  // fade 窗口失真（比如 life 恰好等于 settleEnd 附近的极端值）。
  function computeLetterFrame(now, letter) {
    var age = now - letter.born;
    if (age > letter.life) {
      return { alive: false };
    }

    if (letter.reducedMotion) {
      var rt = clamp01(age / letter.life);
      return {
        alive: true,
        scale: 1,
        rotRad: letter.rotFinal,
        dx: 0,
        dy: 0,
        opacity: 1 - rt,
        blurPx: 0,
        trailAlpha: 0,
        trailGrowth: 0
      };
    }

    var popMs = TOKENS.letterMotion.birthPopMs;
    var settleMs = TOKENS.letterMotion.settleMs;
    var settleEnd = popMs + settleMs;
    var fadeWindow = clampNum(letter.life * 0.4, 300, 600);
    var fadeStart = Math.max(settleEnd, letter.life - fadeWindow);

    var scale, rotRad, opacity = 1, blurPx = 0, driftT;

    if (age <= popMs) {
      var p = age / popMs;
      var e = popEase(p);
      scale = lerp(TOKENS.letterMotion.scale.start, TOKENS.letterMotion.scale.overshoot, e);
      opacity = clamp01(e);
      rotRad = letter.rotStart;
      driftT = 0;
    } else if (age <= settleEnd) {
      var p2 = (age - popMs) / settleMs;
      var e2 = settleEase(p2);
      scale = lerp(TOKENS.letterMotion.scale.overshoot, TOKENS.letterMotion.scale.settled, e2);
      rotRad = lerp(letter.rotStart, letter.rotFinal, e2);
      opacity = 1;
      driftT = 0;
    } else if (age <= fadeStart) {
      scale = TOKENS.letterMotion.scale.settled;
      rotRad = letter.rotFinal;
      opacity = 1;
      var driftDur = Math.max(1, fadeStart - settleEnd);
      driftT = clamp01((age - settleEnd) / driftDur);
    } else {
      scale = TOKENS.letterMotion.scale.settled;
      rotRad = letter.rotFinal;
      var fp = clamp01((age - fadeStart) / Math.max(1, letter.life - fadeStart));
      opacity = 1 - fp;
      blurPx = fp * 1.5; // 081："blur increases by 1.5px" 在 fade 阶段线性铺满
      driftT = 1;
    }

    // 拖尾透明度：081 "max 0.42 at birth, below 0.10 by halfway"。用
    // factor = 0.238^(2*age/life) 使得 age/life=0.5 时恰好落在 0.42*0.238≈0.10，
    // age/life=1 时趋近 0（约 0.42*0.057≈0.024），与"淡出阶段拖尾基本消失"的观感一致。
    var lifeT = clamp01(age / letter.life);
    var trailAlpha = TOKENS.letterMotion.trailMaxOpacity * Math.pow(0.238, 2 * lifeT);
    var trailGrowth = 0.35 + 0.65 * driftT; // 拖尾随 drift 进度从"短"长到"满长"

    return {
      alive: true,
      scale: scale,
      rotRad: rotRad,
      dx: letter.driftDx * driftT,
      dy: letter.driftDy * driftT,
      opacity: opacity,
      blurPx: blurPx,
      trailAlpha: trailAlpha,
      trailGrowth: trailGrowth
    };
  }

  // ---------------------------------------------------------------------
  // 对外冻结 API
  // ---------------------------------------------------------------------
  var API = {
    CARD_ID: 'WTJ-20260704-086',
    TOKENS: TOKENS,
    MAC_TARGET_MAX_WIDTH_PX: MAC_TARGET_MAX_WIDTH_PX,
    buildLetterFont: buildLetterFont,
    colorWithAlpha: colorWithAlpha,
    randomLetterSize: randomLetterSize,
    randomRotationRad: randomRotationRad,
    randomDrift: randomDrift,
    computeSafeArea: computeSafeArea,
    cubicBezier: cubicBezier,
    popEase: popEase,
    settleEase: settleEase,
    computeLetterFrame: computeLetterFrame,
    prefersReducedMotion: prefersReducedMotion,
    // WTJ-20260705-002 新增（见文件头「对外 API」一节最后三条 + 各自实现旁注释）：
    randomizeLetterCase: randomizeLetterCase,
    DIGIT_SHIFT_MAP: DIGIT_SHIFT_MAP,
    randomizeDigitDisplay: randomizeDigitDisplay,
    SPARKLE_PARAMS: SPARKLE_PARAMS,
    randomSparkles: randomSparkles
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固（与 task.js/secretword.js/audio.js/pointer.js/keysound.js 同款）：API 对象自身
  // 已 Object.freeze；这里进一步把 window 上的 WTJ_LETTER_MOTION 绑定设为不可写、不可重配置。
  if (!window.WTJ_LETTER_MOTION && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_LETTER_MOTION', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_LETTER_MOTION) {
    window.WTJ_LETTER_MOTION = API;
  }
})();
