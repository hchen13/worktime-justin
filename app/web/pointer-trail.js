// WTJ-20260705-003 — 鼠标尾迹星光化：纯参数生成器（window.WTJ_POINTER_TRAIL）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求、非 module（无 import/export），
// 以普通 <script src="pointer-trail.js"> 标签加载。不依赖 document/canvas/window.WTJ_POINTER/
// window.WTJ_MANIFEST 中的任何一个——纯函数 + 只读常量，可在 Node vm 沙箱直接单测，不需要伪造
// 一整套 CanvasRenderingContext2D 或 DOM。放在 index.html 中 sparkles.js 之后、app.js 之前
// （app.js 的鼠标尾迹渲染消费本文件的 classifyClickTier()/classifyDropTier()/
// buildTrailSparkles()/computeTierAlphaCap()/computeDropAvoidanceFactor()，见该文件"指针引擎
// 订阅"一节与 drawTrail()）。
//
// -----------------------------------------------------------------------
// 职责边界（本卡 003，复用 002/012 已交付的模块，不重新发明星点渲染或指针判定）
// -----------------------------------------------------------------------
// 本文件只回答"这一次尾迹/点击/拖放事件该生成几颗星点、分布在锚点周围多大范围、多亮（强度
// 上限）、拖拽途中经过 drop target 附近该怎么避让"这组纯参数问题，不做任何 document/Canvas
// 操作——真正把这些参数渲染成像素的仍是共享绘制层 app/web/sparkles.js
// （window.WTJ_SPARKLES.getSparkleSprite()/drawSparkles()，见该文件头 "SHARED: consumed by
// card 003 pointer trail" 注释，本文件是该注释兑现的落地实现）；指针原始输入判定（尾迹强度/
// 点击强度/拖拽状态机/悬停）仍完全是 app/web/pointer.js（012）的职责，本文件不重复实现、也不
// 读取 window.WTJ_POINTER——只接收调用方（app.js）已经从 WTJ_POINTER 事件里拿到的
// feedback/dropEvent 数据对象作为输入。这样分层的理由与 letter-motion.js randomSparkles() /
// sparkles.js drawSparkles() 的关系完全同构：参数生成与参数渲染分开，前者不依赖 canvas 可独立
// 单测，后者（sparkles.js）已经在 002 卡验证过、直接复用。
//
// -----------------------------------------------------------------------
// 卡片需求逐条落地位置索引（WTJ-20260705-003，供 PM/QA/TL 对照）
// -----------------------------------------------------------------------
// 需求1（Canvas 风格星星/闪光替代粗糙蓝点）：本文件产出的星点描述数组经 app.js drawTrail() 用
//   window.WTJ_SPARKLES.drawSparkles() 渲染，取代旧版纯色 ctx.arc() 圆点——具体渲染改动见
//   app.js spawnTrailPoint()/drawTrail()。
// 需求2（移动轻、命中有效对象/拖拽成功更明显）：TIERS.MOVE 用最小的 countRange/alphaCap；
//   TIERS.CLICK_HIT（classifyClickTier() 判定 feedback.targetId 非空）与 TIERS.DRAG_SUCCESS
//   （classifyDropTier() 判定 dropEvent.success===true）用明显更大的 countRange/spreadPxRange/
//   alphaCap，见 BURST_PARAMS。
// 需求3（颜色统一 + 低调不抢焦点）：本文件不生成颜色——app.js 直接复用它已有的 PALETTE
//   （letter-motion.js TOKENS.letters.palette，与键盘流星/符号弹出同一份调色板），本文件只
//   控制"多亮"（alphaCap 全部 ≤0.62，远低于 letters/reward-chest 的视觉强度，baseSizePx 由
//   app.js 传入一个明显小于字母尺寸区间[56,148]的常量）。
// 需求4（乱晃3秒后衰减，不重新实现）：尾迹强度衰减完全是 pointer.js updateTrailIntensity() 的
//   既有职责（idleDecayApproxSec/PAUSE_RESET_MS/DECAY_RAMP_MS/TRAIL_FLOOR），本文件不感知、
//   不复制这套时序逻辑——app.js 直接消费 pointer.js onMove 给出的 trailIntensity 快照作为
//   每个尾迹点的 intensity 字段，本文件只在这之上再乘一层 tier alphaCap。
// 需求5（拖拽时尾迹不得遮挡 drop target）：computeDropAvoidanceFactor(x,y,dropTargetRects,opts)
//   ——纯几何函数：点在矩形内部→完全避让（0），矩形外 marginPx 范围内线性回升，marginPx 之外→
//   不避让（1）。opts.dragging 为 false 时恒返回 1（只在拖拽中才避让，不影响平时的尾迹）。
//   dropTargetRects 由 app.js 在拖拽中每帧查询 DOM（.wtj-tt-drag-target，task-templates.js
//   014 卡已有的放置目标 class）得到，本文件不关心这些矩形从哪来，只做几何判定，因此这里的
//   "drop target"是通用矩形列表，不与 pointer.js 内部的 target 注册表耦合。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_POINTER_TRAIL，Object.freeze 冻结）
// -----------------------------------------------------------------------
//   TIERS                        { MOVE, CLICK_HIT, CLICK_MISS, DRAG_SUCCESS } 强度分级常量。
//   BURST_PARAMS                 各分级的本卡本地占位参数（countRange/sizeFracRange/
//                                 spreadPxRange/twinkleHzRange/alphaCap），只读镜像，供
//                                 QA/单测直接读取边界值。
//   classifyClickTier(feedback)  -> TIERS.CLICK_HIT | TIERS.CLICK_MISS。feedback 是
//                                 WTJ_POINTER.onClickFeedback 回调收到的第二个参数
//                                 { intensity, soundless, targetId }。
//   classifyDropTier(dropEvent)  -> TIERS.DRAG_SUCCESS | null。dropEvent 是
//                                 WTJ_POINTER.onDrop 回调收到的参数
//                                 { success, type, draggedId, targetId, x, y }；
//                                 success!==true（dropCancel）时返回 null——"拖错不惩罚"，
//                                 本文件不为取消态生成额外星点爆发，既有"轻轻弹回"视觉
//                                 （014 task-templates.js 已实现）已经足够。
//   buildTrailSparkles(tier)     -> [{ angleRad, t, sizeFrac, phaseRad, twinkleHz, spreadPx }..]
//                                 每颗星点独立一个 angleRad（区别于 letter-motion.js
//                                 randomSparkles() 共用一条拖尾方向线的设计——鼠标尾迹/点击
//                                 爆发是"围绕一个锚点向四周散开"而不是"沿一条固定方向的拖尾"，
//                                 见 app.js 消费处：每颗星点各自调用一次
//                                 WTJ_SPARKLES.drawSparkles()，用它自己的 angleRad 与
//                                 spreadPx 当作那一次调用的 angleRad/lengthPx）。
//   computeTierAlphaCap(tier)    -> number，该分级的整体透明度上限（需求3"低透明度"）。
//   computeDropAvoidanceFactor(x, y, dropTargetRects, opts) -> [0,1] 乘数因子。
//                                 opts: { dragging, marginPx }（marginPx 缺省
//                                 DROP_AVOID_MARGIN_PX_DEFAULT）。
//   DROP_AVOID_MARGIN_PX_DEFAULT  避让渐变带宽度（px）默认值。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // 重复引入守卫（同款 pointer.js/sparkles.js/letter-motion.js 的教训）。
  if (window.WTJ_POINTER_TRAIL) {
    return;
  }

  function clamp01(v) {
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  var TIERS = {
    MOVE: 'move',
    CLICK_HIT: 'clickHit',
    CLICK_MISS: 'clickMiss',
    DRAG_SUCCESS: 'dragSuccess'
  };

  // 本卡本地占位参数（DESIGN-012「pointer trail 星光尾迹视觉令牌」截至本卡仍 in progress，
  // 未给出精确数值——做法与 letter-motion.js SPARKLE_PARAMS/pointer.js 尾迹衰减占位常量完全
  // 同款：先给出满足"轻/更明显/低调"这组定性验收的合理默认值，未来令牌落地后回填即可，不阻塞
  // 本卡交付）。alphaCap 刻意分级递增但整体压低：clickHit/dragSuccess 也不超过 0.62，明显低于
  // letters（fade 前 opacity=1）与 reward-chest 烟花（详见该文件 alpha 用法），满足"不能抢中心
  // 奖励或任务目标视觉焦点"。
  var BURST_PARAMS = {
    move: {
      countRange: [1, 2],
      sizeFracRange: [0.28, 0.55],
      spreadPxRange: [4, 10],
      twinkleHzRange: [0.6, 1.6],
      alphaCap: 0.30
    },
    clickHit: {
      countRange: [5, 7],
      sizeFracRange: [0.4, 0.9],
      spreadPxRange: [14, 26],
      twinkleHzRange: [0.8, 2.0],
      alphaCap: 0.58
    },
    dragSuccess: {
      countRange: [8, 12],
      sizeFracRange: [0.45, 1.0],
      spreadPxRange: [18, 34],
      twinkleHzRange: [0.8, 2.2],
      alphaCap: 0.62
    }
  };

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

  deepFreeze(TIERS);
  deepFreeze(BURST_PARAMS);

  // clickMiss（点击空白处）刻意不在 BURST_PARAMS 里给独立分级：现状是"不叠加星点爆发，只保留
  // 既有点击圆环"（见需求2 落地说明与 app.js 消费处注释），getBurstParams() 对它和任何未知 tier
  // 一律回退到 move 参数——防御式，即便调用方误传也不会抛错，只是退化成最低调的表现。
  function getBurstParams(tier) {
    return BURST_PARAMS[tier] || BURST_PARAMS.move;
  }

  function classifyClickTier(feedback) {
    if (feedback && typeof feedback === 'object' && feedback.targetId) {
      return TIERS.CLICK_HIT;
    }
    return TIERS.CLICK_MISS;
  }

  function classifyDropTier(dropEvent) {
    if (dropEvent && typeof dropEvent === 'object' && dropEvent.success === true) {
      return TIERS.DRAG_SUCCESS;
    }
    return null;
  }

  function buildTrailSparkles(tier) {
    var params = getBurstParams(tier);
    var span = params.countRange[1] - params.countRange[0];
    var count = params.countRange[0] + Math.floor(Math.random() * (span + 1));
    var list = [];
    var i;
    for (i = 0; i < count; i++) {
      list.push({
        angleRad: Math.random() * Math.PI * 2, // 围绕锚点全向散开（区别于字母拖尾的单一方向线）
        t: Math.random(), // 沿各自 angleRad 方向、离锚点的距离比例：0=贴近锚点，1=spreadPx 处
        sizeFrac: rand(params.sizeFracRange[0], params.sizeFracRange[1]),
        phaseRad: Math.random() * Math.PI * 2,
        twinkleHz: rand(params.twinkleHzRange[0], params.twinkleHzRange[1]),
        spreadPx: rand(params.spreadPxRange[0], params.spreadPxRange[1])
      });
    }
    return list;
  }

  function computeTierAlphaCap(tier) {
    return getBurstParams(tier).alphaCap;
  }

  var DROP_AVOID_MARGIN_PX_DEFAULT = 46;

  // 纯几何避让判定（需求5）：dropTargetRects 是 [{x,y,w,h}, ...]（viewport 坐标，与
  // pointer.js registerTarget 的 getBounds()/POINTER-API.md 同一坐标约定，但本文件不读取
  // pointer.js 的注册表，rects 完全由调用方传入）。opts.dragging 为假时不避让（恒 1）——只在
  // 真的处于拖拽状态时才需要担心尾迹盖住 drop target，平时鼠标路过不受影响。
  function computeDropAvoidanceFactor(x, y, dropTargetRects, opts) {
    opts = opts || {};
    if (!opts.dragging) return 1;
    if (!dropTargetRects || !dropTargetRects.length) return 1;

    var margin = (typeof opts.marginPx === 'number' && opts.marginPx > 0) ? opts.marginPx : DROP_AVOID_MARGIN_PX_DEFAULT;
    var minFactor = 1;
    var i;
    for (i = 0; i < dropTargetRects.length; i++) {
      var r = dropTargetRects[i];
      if (!r) continue;
      var dx = 0;
      var dy = 0;
      if (x < r.x) dx = r.x - x;
      else if (x > r.x + r.w) dx = x - (r.x + r.w);
      if (y < r.y) dy = r.y - y;
      else if (y > r.y + r.h) dy = y - (r.y + r.h);

      var dist = Math.sqrt(dx * dx + dy * dy);
      var factor;
      if (dist <= 0) {
        factor = 0; // 落在矩形内部（含边界）：完全避让，不遮挡 drop target 本体
      } else if (dist >= margin) {
        factor = 1; // 已远离 margin 渐变带：不避让
      } else {
        factor = dist / margin; // 渐变带内：线性回升，避免与全避让区之间出现生硬的可见分界线
      }
      if (factor < minFactor) minFactor = factor;
    }
    return clamp01(minFactor);
  }

  var API = {
    CARD_ID: 'WTJ-20260705-003',
    TIERS: TIERS,
    BURST_PARAMS: BURST_PARAMS,
    classifyClickTier: classifyClickTier,
    classifyDropTier: classifyDropTier,
    buildTrailSparkles: buildTrailSparkles,
    computeTierAlphaCap: computeTierAlphaCap,
    computeDropAvoidanceFactor: computeDropAvoidanceFactor,
    DROP_AVOID_MARGIN_PX_DEFAULT: DROP_AVOID_MARGIN_PX_DEFAULT
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固（与 pointer.js/sparkles.js/letter-motion.js 同款）：API 对象自身已 Object.freeze；
  // 这里进一步把 window 上的 WTJ_POINTER_TRAIL 绑定设为不可写、不可重配置，防止整体重赋值。
  if (!window.WTJ_POINTER_TRAIL && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_POINTER_TRAIL', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_POINTER_TRAIL) {
    window.WTJ_POINTER_TRAIL = API;
  }
})();
