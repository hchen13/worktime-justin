// WTJ-20260705-002 — 共享星点/闪点贴图预渲染 + 绘制层（window.WTJ_SPARKLES）
//
// SHARED: consumed by card 003 pointer trail — 本文件不是「键盘流星拖尾」卡（002）的专属实现，
// 而是 002（字母拖尾星点）与后续 003（指针拖尾，尚未落地）共用的绘制层。getSparkleSprite(color,
// sizePx) / drawSparkles(ctx, x, y, opts) 这两个函数签名一旦确定，003 会直接依赖它们，未来若要
// 改动请先确认不会破坏 003 的消费方式（沿用 app.js getGlowSprite() 的"按 (颜色, 尺寸) 分桶缓存
// + drawImage 复用"约定，只是形状换成星点而不是柔光晕）。
//
// 语法基线：ES2020 以内（Safari 14 兼容），只用 var/function，不用箭头函数 / let / const /
// 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求、非 module（无 import/export），以普通
// <script src="sparkles.js"> 标签加载，需在 index.html 中排在 manifest.js 之后、app.js 之前
// （app.js 的 drawLetterTrail() 消费本文件的 drawSparkles()，见该文件顶部注释）。
//
// 职责边界：本文件只负责"离屏 canvas 星点贴图预渲染 + 按 (颜色, 尺寸分桶) 缓存 + 复用
// ctx.drawImage() 画出来"，不做任何"这一条拖尾该有几个星点/分布在哪/怎么闪烁"的判定——那是
// 纯参数生成器的职责，在 app/web/letter-motion.js 的 randomSparkles()（与该文件 randomDrift()
// 并列，产出 { t, sizeFrac, phaseRad, twinkleHz } 描述数组，不依赖 document/canvas，可独立单测）。
// 本文件只消费这组参数描述 + 调用方给出的锚点/方向/长度/整体强度，把它们渲染成实际像素。
// 这样分层是为了让"参数怎么随机生成"与"参数怎么画成星点"两件事可以分别被复用/替换——003 卡
// 指针拖尾大概率会有自己的一套锚点/方向计算，但仍可以直接复用本文件的 drawSparkles()。
//
// 性能红线（app/PERFORMANCE.md 第 3.1 节，与 app.js 的 getGlowSprite()/buildGlowSprite() 同一
// 理由）：星点的柔光贴图只在 (颜色, 尺寸桶) 缓存未命中时用一次 ctx.createRadialGradient() 预渲染
// 到离屏 canvas，此后逐帧只是廉价的 ctx.drawImage()——禁止逐帧调用 createXxxGradient()/
// shadowBlur。逐帧唯一变化的是 globalAlpha（闪烁强度）与 drawImage 的目标坐标，不重新生成贴图。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_SPARKLES，Object.freeze 冻结）
// -----------------------------------------------------------------------
//   getSparkleSprite(color, sizePx) -> { canvas, size } 或 null（环境不支持 canvas 时防御式
//                               返回 null，同款 app.js getGlowSprite() 的契约）。按
//                               (颜色, 尺寸分桶) 缓存，缓存条目数有界。
//   drawSparkles(ctx, x, y, opts) -> 无返回值。opts:
//                               { color, sparkles, angleRad, lengthPx, baseSizePx, alpha, now }
//                               —— sparkles 是 letter-motion.js randomSparkles() 产出的描述数组；
//                               angleRad/lengthPx 定义"沿哪个方向、多长的一条线上"分布这些星点
//                               （x,y 为该线的起点/锚点）；baseSizePx 把每个星点的 sizeFrac 换算
//                               成实际像素；alpha 是整体强度包络（如拖尾的 trailAlpha）；now 用于
//                               按 twinkleHz/phaseRad 算出逐帧闪烁强度。防御式：任何字段缺失/
//                               类型不对都不抛错，静默跳过对应星点或整个调用。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // 重复引入守卫（同款 pointer.js/audio.js/keysound.js/keyvisual.js/letter-motion.js 的教训）。
  if (window.WTJ_SPARKLES) {
    return;
  }

  var SPARK_BUCKET_PX = 4; // 尺寸分桶粒度：星点普遍很小（约 3~20px），4px 粒度足够，缓存条目数有界

  // 与 app.js LETTER_MOTION_FALLBACK.colorWithAlpha() 同款最小实现（六位 hex -> rgba 字符串）。
  // 本文件刻意不依赖 window.WTJ_LETTER_MOTION.colorWithAlpha——本文件是独立的共享绘制层，
  // 不应该要求消费方（如未来 003 卡）必须先加载 letter-motion.js 才能用星点绘制，两个模块
  // 各自持有一份小实现，避免加载顺序耦合（与 app.js 顶部同类注释的理由一致）。
  function colorWithAlpha(hex, alpha) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var num = parseInt(h, 16) || 0;
    var r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // ---------------------------------------------------------------------
  // 离屏贴图：柔光底（径向渐变，只在缓存未命中时算一次） + 十字高光描边（比纯光斑更有
  // "星星"辨识度），两层都在离屏 canvas 上一次性画完，此后只是整体 drawImage。
  // ---------------------------------------------------------------------
  function buildSparkleSprite(color, bucket) {
    var pad = Math.max(2, bucket * 0.75);
    var dim = Math.max(4, Math.ceil(pad * 2));
    var off = document.createElement('canvas');
    off.width = dim;
    off.height = dim;
    var octx = off.getContext('2d');
    if (!octx) return null;
    var cx = dim / 2;
    var cy = dim / 2;

    if (typeof octx.createRadialGradient === 'function') {
      var grad = octx.createRadialGradient(cx, cy, 0, cx, cy, pad);
      grad.addColorStop(0, colorWithAlpha(color, 0.9));
      grad.addColorStop(0.45, colorWithAlpha(color, 0.45));
      grad.addColorStop(1, colorWithAlpha(color, 0));
      octx.fillStyle = grad;
      octx.beginPath();
      octx.arc(cx, cy, pad, 0, Math.PI * 2);
      octx.fill();
    }

    octx.save();
    octx.strokeStyle = colorWithAlpha('#ffffff', 0.85);
    octx.lineWidth = Math.max(1, pad * 0.12);
    octx.beginPath();
    octx.moveTo(cx - pad * 0.85, cy);
    octx.lineTo(cx + pad * 0.85, cy);
    octx.moveTo(cx, cy - pad * 0.85);
    octx.lineTo(cx, cy + pad * 0.85);
    octx.stroke();
    octx.restore();

    return { canvas: off, size: dim };
  }

  var SPARKLE_CACHE = {};

  function getSparkleSprite(color, sizePx) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    var bucket = Math.max(SPARK_BUCKET_PX, Math.round(sizePx / SPARK_BUCKET_PX) * SPARK_BUCKET_PX);
    var key = color + '|' + bucket;
    if (Object.prototype.hasOwnProperty.call(SPARKLE_CACHE, key)) return SPARKLE_CACHE[key];
    var sprite = null;
    try {
      sprite = buildSparkleSprite(color, bucket);
    } catch (e) {
      console.error('[WTJ_SPARKLES] 星点贴图预渲染失败，已捕获，本次跳过：', e);
      sprite = null;
    }
    SPARKLE_CACHE[key] = sprite; // 即便失败也缓存 null，避免同一 key 反复重试制造额外开销
    return sprite;
  }

  // ---------------------------------------------------------------------
  // 绘制：把 letter-motion.js randomSparkles() 产出的静态参数，结合调用方给出的锚点/方向/
  // 长度/强度/时间戳，逐个算出这一帧的位置与闪烁 alpha，drawImage 缓存贴图。
  // ---------------------------------------------------------------------
  function drawSparkles(ctx, x, y, opts) {
    if (!ctx || !opts || !opts.sparkles || !opts.sparkles.length) return;

    var color = opts.color || '#ffffff';
    var angleRad = (typeof opts.angleRad === 'number') ? opts.angleRad : 0;
    var lengthPx = (typeof opts.lengthPx === 'number') ? opts.lengthPx : 0;
    var baseSizePx = (typeof opts.baseSizePx === 'number') ? opts.baseSizePx : 24;
    var alpha = (typeof opts.alpha === 'number') ? opts.alpha : 1;
    var now = (typeof opts.now === 'number') ? opts.now : 0;

    if (alpha <= 0.004 || lengthPx <= 0) return;

    var cosA = Math.cos(angleRad);
    var sinA = Math.sin(angleRad);
    var i;
    for (i = 0; i < opts.sparkles.length; i++) {
      var sp = opts.sparkles[i];
      if (!sp) continue;
      var dist = sp.t * lengthPx;
      var px = x + cosA * dist;
      var py = y + sinA * dist;

      // twinkle: 0~1 之间随时间正弦波动（twinkleHz 次/秒），phaseRad 让多个星点不同步闪烁。
      var twinkle = 0.5 + 0.5 * Math.sin((now / 1000) * sp.twinkleHz * Math.PI * 2 + sp.phaseRad);
      // 越靠近拖尾末端的星点也越淡，呼应拖尾本体的锥形收窄，避免末梢星点过于抢眼。
      var fade = 1 - sp.t * 0.6;
      var itemAlpha = alpha * twinkle * fade;
      if (itemAlpha <= 0.02) continue;

      var sizePx = Math.max(2, baseSizePx * sp.sizeFrac);
      var sprite = getSparkleSprite(color, sizePx);
      if (!sprite) continue;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, itemAlpha));
      ctx.drawImage(sprite.canvas, px - sprite.size / 2, py - sprite.size / 2, sprite.size, sprite.size);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------
  // 对外冻结 API
  // ---------------------------------------------------------------------
  var API = {
    CARD_ID: 'WTJ-20260705-002',
    getSparkleSprite: getSparkleSprite,
    drawSparkles: drawSparkles
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  if (!window.WTJ_SPARKLES && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_SPARKLES', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_SPARKLES) {
    window.WTJ_SPARKLES = API;
  }
})();
