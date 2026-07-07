// WTJ-20260705-017 — 旧机动画诊断日志（window.WTJ_DIAG）
//
// -----------------------------------------------------------------------
// 背景：本卡起因是"旧 Mac（2014 MBA / Big Sur，justin.local）上动画全局不播放"的报告。
// 排查后确认根因已在 WTJ-20260705-014 修复（见 app/web/frame-anim.js 文件头「WTJ-20260705-014
// 根因修复」一节）：旧实现在"帧未就绪"时只重试有限次就永久放弃/暂停，014 改为"未画出首帧
// 前持续重试直到真正画出或确认加载失败"。014 已随 stage 基线合入（本卡起点）。
//
// 本卡剩余职责：不是再修一次 bug，是给"今后旧机再报动画问题"补一条**持久化、旧机可取**的
// 诊断证据链——现状是这类问题只能靠"重现 + 猜"，孩子的旧机上出问题时开发者往往不在场、
// 拿不到 Web Inspector，Console.app 里的普通 NSLog 也会被系统日志噪音淹没、且不落盘到一个
// 固定可打包带走的文件。见 app/shell/main.swift 的 diag 消息处理与
// `~/Library/Logs/WorkTimeJustin/animation-diagnostics.log`。
//
// -----------------------------------------------------------------------
// 采集哪些信号（对应本卡验收清单第 1 条逐项落地）
// -----------------------------------------------------------------------
//   header              app 版本/commit（见 resolveBuildInfo()）、navigator.userAgent、
//                       从 UA 解析出的 WebKit/Safari 版本号、平台/屏幕/DPR、能力探测
//                       （canvas 2d/CSS animation/OffscreenCanvas 等，见 probeCapabilities()）、
//                       prefers-reduced-motion 是否命中。启动后延迟一拍发出（见文件尾
//                       deferredInit()），确保 manifest.js/shell 注入的构建信息已就绪。
//   heartbeat           每 HEARTBEAT_MS（5s）一条：这段窗口内 requestAnimationFrame 是否
//                       真的在推进（rafTicksSinceLast/rafTicking）+ window.WTJ_FRAME_ANIM.
//                       getState() 快照（activePlaybacks 里每个 canvas 的 hasDrawnOnce/
//                       idlePaused，直接对应 014 那次 bug 的可观测信号：'目标是否真的画出过'）。
//   anim-state-change   task-templates.js 把任务道具 DOM 元素的 data-anim-state 属性从
//                       idle 切到 active（或反向）时，用 MutationObserver 捕获（不触碰
//                       frame-anim.js/task-templates.js 任何已冻结的对外 API，纯 DOM 观察）。
//   task-complete       订阅 window.WTJ_TASK_TEMPLATES.onTaskComplete（若可用）。
//   sprite-load         img 元素（含 frame-anim.js 内部 `new Image()` 创建的 sprite sheet、
//                       task-templates.js/reward-chest.js 静态占位 `document.createElement
//                       ('img')` 两条路径）成功 load 时的 naturalWidth/naturalHeight——旧机上
//                       "sheet 尺寸与预期不符"（例如降采样产物损坏/路径错发）会在这里现形。
//   resource-error      任意资源元素（img/script/link 等）加载失败：捕获阶段监听 window 上的
//                       'error' 事件（这类事件不冒泡，必须用 capture:true 在祖先节点拦截）。
//   fetch-error         window.fetch 非侵入包装：HTTP 非 2xx 或 rejected 时记一条，透传原始
//                       promise 不变（audio.js 等调用方的 then/catch 行为完全不受影响，见
//                       wrapFetch() 内联注释）。
//   window-error        window.onerror（未捕获运行时异常），保留并转发原有 onerror（若有）。
//   unhandledrejection  window 'unhandledrejection' 事件（未捕获的 Promise reject）。
//
// 不采集：键盘按键内容、任务口令/密码、UserDefaults 存储的退出口令——本文件完全不接触这些
// （keyboard.js 的按键事件本身就不在上面任何一个采集点覆盖范围内），符合"不含密码/隐私"的
// 硬约束。
//
// -----------------------------------------------------------------------
// 上行通道与落盘
// -----------------------------------------------------------------------
// 每条诊断记录 { ts, kind, payload } 经 window.webkit.messageHandlers.diag.postMessage(...)
// 上行给原生壳（app/shell/main.swift 的 "diag" message handler），追加写入
// `~/Library/Logs/WorkTimeJustin/animation-diagnostics.log`（目录不存在则自动创建）。非
// WKWebView 环境（例如开发时直接用桌面浏览器打开调试）下 postMessage 会静默失败（try/catch
// 吞掉），诊断记录仍保留在本文件内部的环形缓冲区里，可用 window.WTJ_DIAG.getState() 内省，
// 不影响页面正常运行——诊断基础设施本身绝不能成为新故障源，这是本文件唯一允许"静默兜底"
// 的地方（record() 内层 try/catch），与"修 bug 不能 no silent fallback"是两回事。
//
// -----------------------------------------------------------------------
// 语法基线与加载位置
// -----------------------------------------------------------------------
// 与项目其余引擎同一基线：Safari 14 兼容（ES2020 以内），只用 var/function 声明式，不用
// 箭头函数/let/const/模板字符串；非 module，普通 <script src="diag.js"> 加载。
//
// 需要是 index.html 里**第一个** <script> 标签（早于 manifest.js）：
//   1) window.onerror / unhandledrejection 必须尽早安装，才能捕获后续脚本（manifest.js
//      起）解析/执行期间发生的错误；
//   2) 资源加载失败/成功的 capture-phase 监听同理，必须先于后续 <script src>/动态创建的
//      img/canvas 元素开始加载。
// 读取 window.WTJ_MANIFEST / window.WTJ_TASK_TEMPLATES 等"比自己晚加载"的模块时，延后一个
// setTimeout(fn, 0) 宏任务（deferredInit()）——不依赖脚本加载顺序（浏览器按文档顺序同步
// 加载/执行非 async/defer 的 <script src>，本文件之后的所有同步脚本会先于任何 0ms 宏任务
// 执行完毕），因此这一延后足以让它们就绪。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_DIAG，Object.freeze 冻结 + 绑定加固，与 009~015/056 同款约定）
// -----------------------------------------------------------------------
//   getState()   返回 { recent, counts, rafTicking, rafTotalTicks, buildInfo }，供 QA/单测
//                内省——recent 是最近 MAX_RECENT 条诊断记录的浅拷贝，counts 是按 kind 计数。
//   _setClock(clock)  测试专用：可整体或部分替换 setTimeout/clearTimeout/now/
//                requestAnimationFrame/cancelAnimationFrame，与其余引擎同款模式。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  if (window.WTJ_DIAG) {
    return;
  }

  var CARD_ID = 'WTJ-20260705-017';
  var HEARTBEAT_MS = 5000;
  var MAX_RECENT = 200;

  // ---------------------------------------------------------------------
  // 可注入时钟（测试用；默认真实 setTimeout/clearTimeout/Date.now/rAF）。
  // ---------------------------------------------------------------------
  var clockRef = {
    setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
    clearTimeout: function (id) { clearTimeout(id); },
    now: function () { return Date.now(); },
    requestAnimationFrame: (typeof window.requestAnimationFrame === 'function')
      ? function (fn) { return window.requestAnimationFrame(fn); }
      : null,
    cancelAnimationFrame: (typeof window.cancelAnimationFrame === 'function')
      ? function (id) { window.cancelAnimationFrame(id); }
      : null
  };

  function _setClock(clock) {
    if (!clock || typeof clock !== 'object') {
      console.warn('[WTJ_DIAG] _setClock: 参数必须是对象，已忽略。');
      return;
    }
    if (typeof clock.setTimeout === 'function') { clockRef.setTimeout = clock.setTimeout; }
    if (typeof clock.clearTimeout === 'function') { clockRef.clearTimeout = clock.clearTimeout; }
    if (typeof clock.now === 'function') { clockRef.now = clock.now; }
    if (typeof clock.requestAnimationFrame === 'function') { clockRef.requestAnimationFrame = clock.requestAnimationFrame; }
    if (typeof clock.cancelAnimationFrame === 'function') { clockRef.cancelAnimationFrame = clock.cancelAnimationFrame; }
  }

  // ---------------------------------------------------------------------
  // 环形缓冲区 + 计数器 + 上行 + 落地记录（record() 是本文件唯一的记录入口）。
  // ---------------------------------------------------------------------
  var recentRecords = [];
  var counts = {};

  function bumpCount(kind) {
    counts[kind] = (counts[kind] || 0) + 1;
  }

  function pushRecent(entry) {
    recentRecords.push(entry);
    if (recentRecords.length > MAX_RECENT) {
      recentRecords.shift();
    }
  }

  // 递归清洗成 WKScriptMessage 可安全 postMessage 的纯 JSON 形态（NSNumber/NSString/
  // NSArray/NSDictionary/NSNull 的 JS 对应物）：Error 转 {name,message,stack}，DOM 节点等
  // 复杂对象只保留可枚举的自有字符串/数字/布尔字段（限深度与字段数，防止循环引用/超大对象拖垮
  // postMessage 或日志文件）。
  function sanitize(value, depth) {
    depth = depth || 0;
    if (depth > 5) {
      return '[depth-limit]';
    }
    if (value === null || value === undefined) {
      return null;
    }
    var t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      return value;
    }
    if (value instanceof Error) {
      return {
        name: value.name || 'Error',
        message: value.message ? String(value.message) : '',
        stack: value.stack ? String(value.stack) : null
      };
    }
    if (Array.isArray(value)) {
      var arr = [];
      var i;
      for (i = 0; i < value.length && i < 50; i++) {
        arr.push(sanitize(value[i], depth + 1));
      }
      return arr;
    }
    if (t === 'object') {
      var out = {};
      var key;
      var fieldCount = 0;
      for (key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          fieldCount++;
          if (fieldCount > 40) {
            break;
          }
          try {
            out[key] = sanitize(value[key], depth + 1);
          } catch (err) {
            out[key] = '[unreadable]';
          }
        }
      }
      return out;
    }
    return String(value); // function/symbol 等一律转字符串，避免 postMessage/JSON 序列化抛错
  }

  function sendToShell(entry) {
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.diag) {
        window.webkit.messageHandlers.diag.postMessage(entry);
      }
    } catch (err) {
      // 非 WKWebView 环境或消息通道异常：忽略，诊断仍保留在 recentRecords 供 getState() 内省。
    }
  }

  var CONSOLE_LOUD_KINDS = ['window-error', 'unhandledrejection', 'resource-error', 'fetch-error'];

  function inList(list, value) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] === value) {
        return true;
      }
    }
    return false;
  }

  function record(kind, payload) {
    try {
      bumpCount(kind);
      var entry = {
        ts: clockRef.now(),
        kind: kind,
        payload: sanitize(payload, 0)
      };
      pushRecent(entry);
      sendToShell(entry);
      if (inList(CONSOLE_LOUD_KINDS, kind)) {
        console.error('[WTJ_DIAG] ' + kind + ':', entry.payload);
      } else if (kind === 'header') {
        console.info('[WTJ_DIAG] header:', entry.payload);
      }
    } catch (err) {
      // 诊断模块自身绝不能抛错影响宿主页面——本文件唯一允许静默吞掉的地方。
    }
  }

  // ---------------------------------------------------------------------
  // app 版本/commit：优先读 shell 经 WKUserScript（atDocumentStart）注入的
  // window.__WTJ_BUILD_INFO（见 app/shell/main.swift setupWebView() 内联注释），
  // 缺失时（非 WKWebView 环境）回退读 window.WTJ_MANIFEST.meta（无 commit 字段，只有
  // manifest 自身版本号，据实标注 source）。
  // ---------------------------------------------------------------------
  function resolveBuildInfo() {
    try {
      if (window.__WTJ_BUILD_INFO && typeof window.__WTJ_BUILD_INFO === 'object') {
        return {
          version: window.__WTJ_BUILD_INFO.version || null,
          commit: window.__WTJ_BUILD_INFO.commit || null,
          source: 'shell-injected'
        };
      }
    } catch (err) {
      // 忽略，走下面的 manifest 回退分支。
    }
    try {
      if (window.WTJ_MANIFEST && window.WTJ_MANIFEST.meta) {
        return {
          version: window.WTJ_MANIFEST.meta.version || null,
          commit: null,
          source: 'manifest-fallback（无 commit 字段——shell 未注入 __WTJ_BUILD_INFO，' +
            '可能是非 WKWebView 环境或壳版本较旧）'
        };
      }
    } catch (err) {
      // 忽略，走最终兜底。
    }
    return { version: null, commit: null, source: 'unavailable' };
  }

  // ---------------------------------------------------------------------
  // UA 解析（WebKit/Safari 版本号、Mac OS 版本片段——旧机诊断最常问的三个数字）。
  // ---------------------------------------------------------------------
  function parseUAField(ua, re) {
    try {
      var m = re.exec(ua || '');
      return m ? m[1] : null;
    } catch (err) {
      return null;
    }
  }

  function parseWebKitVersion(ua) {
    return parseUAField(ua, /AppleWebKit\/([0-9.]+)/);
  }

  function parseSafariVersion(ua) {
    return parseUAField(ua, /Version\/([0-9.]+)/);
  }

  function parseMacOSVersionFromUA(ua) {
    var raw = parseUAField(ua, /Mac OS X ([0-9_]+)/);
    return raw ? raw.replace(/_/g, '.') : null;
  }

  // ---------------------------------------------------------------------
  // prefers-reduced-motion（与 frame-anim.js/reward-chest.js 同款实现，独立探测互不依赖）。
  // 本探针刻意不受 WTJ-20260706-013 的 honorReducedMotion 开关影响——诊断日志需要如实反映
  // OS 原始状态，不能被 app 侧"无视 OS 偏好"的产品决策污染，否则旧机诊断会失去这条信号。
  // ---------------------------------------------------------------------
  function prefersReducedMotionProbe() {
    try {
      if (typeof window.matchMedia === 'function') {
        var mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        return !!(mql && mql.matches);
      }
    } catch (err) {
      return null;
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // WTJ-20260706-013：manifest.js 的 performance.honorReducedMotion 开关（防御式读取，
  // 缺失/非 true 都当 false=不尊重 OS 偏好）+ 由此推导出的"生效值"——即 frame-anim.js/
  // letter-motion.js/keyvisual.js/reward-fireworks.js 的 prefersReducedMotion() 实际会
  // 返回的值。honorReducedMotion=false（kiosk 默认）时恒为 false，即使 OS 原始探针为
  // true，供 QA 复验"reducedMotion 标志消失 + 帧推进"这条修复对照。
  // ---------------------------------------------------------------------
  function resolveHonorReducedMotion() {
    try {
      return !!(window.WTJ_MANIFEST && window.WTJ_MANIFEST.performance && window.WTJ_MANIFEST.performance.honorReducedMotion === true);
    } catch (err) {
      return false;
    }
  }

  function prefersReducedMotionEffective(rawProbe, honor) {
    if (!honor) {
      return false;
    }
    return rawProbe;
  }

  // ---------------------------------------------------------------------
  // 能力探测：canvas 2d / img.decode / CSS.supports 与 animationName 属性 / rAF /
  // OffscreenCanvas（预期旧机上应为 undefined，仅作记录用，不是失败信号）/ matchMedia / fetch。
  // ---------------------------------------------------------------------
  function probeCapabilities() {
    var caps = {};

    try {
      var canvasEl = document.createElement('canvas');
      var ctx = canvasEl && typeof canvasEl.getContext === 'function' ? canvasEl.getContext('2d') : null;
      caps.canvas2dContext = !!ctx;
      caps.canvasDrawImageFn = !!(ctx && typeof ctx.drawImage === 'function');
    } catch (err) {
      caps.canvas2dContext = false;
      caps.canvasProbeError = String((err && err.message) || err);
    }

    try {
      caps.imageDecodeFn = (typeof Image === 'function') && (typeof (new Image()).decode === 'function');
    } catch (err) {
      caps.imageDecodeFn = false;
    }

    try {
      caps.cssSupportsFn = !!(window.CSS && typeof window.CSS.supports === 'function');
      caps.cssAnimationSupported = caps.cssSupportsFn ? !!window.CSS.supports('animation-name', 'x') : null;
    } catch (err) {
      caps.cssSupportsFn = false;
      caps.cssAnimationSupported = null;
    }

    try {
      var probeDiv = document.createElement('div');
      caps.styleAnimationNameProp = (typeof probeDiv.style.animationName !== 'undefined') ||
        (typeof probeDiv.style.webkitAnimationName !== 'undefined');
    } catch (err) {
      caps.styleAnimationNameProp = null;
    }

    caps.requestAnimationFrameFn = typeof window.requestAnimationFrame === 'function';
    caps.offscreenCanvasSupported = typeof window.OffscreenCanvas !== 'undefined';
    caps.matchMediaFn = typeof window.matchMedia === 'function';
    caps.fetchFn = typeof window.fetch === 'function';

    return caps;
  }

  // ---------------------------------------------------------------------
  // header：启动信息一条（延后发出，见文件尾 deferredInit()）。
  // ---------------------------------------------------------------------
  function emitHeader() {
    var buildInfo = resolveBuildInfo();
    var ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    record('header', {
      cardId: CARD_ID,
      buildVersion: buildInfo.version,
      buildCommit: buildInfo.commit,
      buildInfoSource: buildInfo.source,
      userAgent: ua,
      webkitVersion: parseWebKitVersion(ua),
      safariVersion: parseSafariVersion(ua),
      macOSVersionFromUA: parseMacOSVersionFromUA(ua),
      platform: (typeof navigator !== 'undefined' && navigator.platform) || null,
      hardwareConcurrency: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || null,
      devicePixelRatio: (typeof window.devicePixelRatio === 'number') ? window.devicePixelRatio : null,
      screenSize: (typeof screen !== 'undefined' && screen) ? { width: screen.width, height: screen.height } : null,
      windowInnerSize: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
      capabilities: probeCapabilities(),
      prefersReducedMotion: prefersReducedMotionProbe(),
      // WTJ-20260706-013：honorReducedMotion 开关状态 + 由此推导的"生效值"，见上方两个函数
      // 注释。prefersReducedMotion（上面那个原始探针字段）保持不变，如实反映 OS 状态。
      honorReducedMotion: resolveHonorReducedMotion(),
      prefersReducedMotionEffective: prefersReducedMotionEffective(prefersReducedMotionProbe(), resolveHonorReducedMotion())
    });
  }

  // ---------------------------------------------------------------------
  // window.onerror / unhandledrejection：尽早安装（本文件是 index.html 里第一个 <script>）。
  // ---------------------------------------------------------------------
  function installWindowErrorHook() {
    var previousOnError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      record('window-error', {
        message: String(message),
        source: source || null,
        lineno: (typeof lineno === 'number') ? lineno : null,
        colno: (typeof colno === 'number') ? colno : null,
        stack: (error && error.stack) ? String(error.stack) : null
      });
      if (typeof previousOnError === 'function') {
        try {
          return previousOnError(message, source, lineno, colno, error);
        } catch (chainErr) {
          // 原有 onerror 自己抛错：忽略，不让诊断链路本身制造二次故障。
        }
      }
      return false; // 不阻止浏览器默认的控制台报错输出。
    };
  }

  function installUnhandledRejectionHook() {
    try {
      window.addEventListener('unhandledrejection', function (ev) {
        var reason = ev && ev.reason;
        record('unhandledrejection', {
          message: (reason && reason.message) ? String(reason.message) : String(reason),
          stack: (reason && reason.stack) ? String(reason.stack) : null
        });
      }, false);
    } catch (err) {
      console.error('[WTJ_DIAG] 注册 unhandledrejection 监听失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // 资源加载失败/成功（capture-phase window 监听——img/script/link 等资源级 load/error 事件
  // 不冒泡，只有在捕获阶段才能被祖先节点拦到）。同一对监听器同时覆盖 sprite-load（成功，仅
  // img，记 naturalWidth/naturalHeight）与 resource-error（失败，任意资源标签）两类信号，
  // 无需 monkey-patch 任何全局构造函数（如 window.Image）——覆盖 frame-anim.js 内部
  // `new Image()` 与 task-templates.js/reward-chest.js 的 `document.createElement('img')`
  // 两条 sprite 加载路径，因为两者最终都是普通 <img> 元素，事件行为一致。
  // ---------------------------------------------------------------------
  function installResourceListeners() {
    try {
      window.addEventListener('error', function (ev) {
        var target = ev && ev.target;
        if (!target || target === window || !target.tagName) {
          return; // window 自身的运行时错误已由 window.onerror 处理，这里只关心资源加载失败。
        }
        record('resource-error', {
          tag: target.tagName.toLowerCase(),
          src: target.src || target.href || null,
          id: target.id || null,
          className: (typeof target.className === 'string') ? target.className : null
        });
      }, true);
    } catch (err) {
      console.error('[WTJ_DIAG] 注册资源 error 捕获监听失败，已捕获：', err);
    }

    try {
      window.addEventListener('load', function (ev) {
        var target = ev && ev.target;
        if (!target || target === window || !target.tagName) {
          return; // 忽略页面整体 load（那是 window 自身事件，不是资源级信号）。
        }
        if (target.tagName.toLowerCase() !== 'img') {
          return; // 只关心 img——本卡明确要采集的 sprite sheet 尺寸信号，script/link 加载
                  // 成功不需要逐条上报（噪音大、诊断价值低）。
        }
        record('sprite-load', {
          src: (target.currentSrc || target.src || null),
          naturalWidth: (typeof target.naturalWidth === 'number') ? target.naturalWidth : null,
          naturalHeight: (typeof target.naturalHeight === 'number') ? target.naturalHeight : null,
          complete: !!target.complete
        });
      }, true);
    } catch (err) {
      console.error('[WTJ_DIAG] 注册资源 load 捕获监听失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // fetch 非侵入包装：只旁路观察，不改变调用方拿到的 promise（audio.js 等的 then/catch 行为
  // 与本模块加载与否完全一致）。
  // ---------------------------------------------------------------------
  function wrapFetch() {
    try {
      if (typeof window.fetch !== 'function') {
        return;
      }
      var originalFetch = window.fetch;
      window.fetch = function () {
        var args = arguments;
        var url = (args && args.length > 0 && args[0]) ? String(args[0]) : null;
        var result = originalFetch.apply(window, args);
        try {
          if (result && typeof result.then === 'function') {
            // 独立的旁路订阅：不 return、不复用这条链路的结果，调用方拿到的仍是
            // originalFetch 返回的原始 result（同一个 promise 实例）。
            result.then(function (resp) {
              try {
                if (resp && resp.ok === false) {
                  record('fetch-error', { url: url, phase: 'http-status', status: resp.status });
                }
              } catch (innerErr) {
                // 忽略：诊断旁路本身不应影响任何东西。
              }
            }, function (rejectReason) {
              try {
                record('fetch-error', {
                  url: url,
                  phase: 'rejected',
                  message: (rejectReason && rejectReason.message) ? String(rejectReason.message) : String(rejectReason)
                });
              } catch (innerErr) {
                // 忽略。
              }
            });
          }
        } catch (observeErr) {
          console.error('[WTJ_DIAG] fetch 旁路观察失败，已捕获（不影响原 fetch 结果）：', observeErr);
        }
        return result;
      };
    } catch (err) {
      console.error('[WTJ_DIAG] 包装 window.fetch 失败，已捕获（不影响原 fetch 可用性）：', err);
    }
  }

  // ---------------------------------------------------------------------
  // 任务动画状态切换：观察 data-anim-state 属性变化（task-templates.js 在任务判定完成时把
  // 道具元素从 idle 切到 active，见 app/web/task-templates.js「动画状态接口预留」一节）。
  // 纯 DOM 观察，不触碰 frame-anim.js/task-templates.js 任何已冻结的对外 API。
  // ---------------------------------------------------------------------
  function startAnimStateObserver() {
    try {
      if (typeof MutationObserver !== 'function' || !document.body) {
        console.warn('[WTJ_DIAG] MutationObserver 或 document.body 不可用，跳过任务动画状态切换观察。');
        return;
      }
      var observer = new MutationObserver(function (mutations) {
        var i;
        for (i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === 'attributes' && m.attributeName === 'data-anim-state') {
            var el = m.target;
            record('anim-state-change', {
              prop: (el.getAttribute && el.getAttribute('data-wtj-anim-prop')) || null,
              spriteFile: (el.getAttribute && el.getAttribute('data-wtj-sprite-file')) || null,
              oldState: (typeof m.oldValue === 'string') ? m.oldValue : null,
              newState: (el.getAttribute && el.getAttribute('data-anim-state')) || null,
              tag: el.tagName ? el.tagName.toLowerCase() : null
            });
          }
        }
      });
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-anim-state'],
        attributeOldValue: true,
        subtree: true
      });
    } catch (err) {
      console.error('[WTJ_DIAG] 启动 data-anim-state MutationObserver 失败，已捕获：', err);
    }
  }

  function subscribeTaskComplete() {
    try {
      if (window.WTJ_TASK_TEMPLATES && typeof window.WTJ_TASK_TEMPLATES.onTaskComplete === 'function') {
        window.WTJ_TASK_TEMPLATES.onTaskComplete(function (info) {
          record('task-complete', info);
        });
      }
      // 未接入/未加载：不是错误（例如页面尚未走到任务阶段），不打印警告避免噪音。
    } catch (err) {
      console.error('[WTJ_DIAG] 订阅 WTJ_TASK_TEMPLATES.onTaskComplete 失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // requestAnimationFrame ticking 探测：本卡诊断的核心信号——014 那次真机 bug 的表象正是
  // "canvas 长期空白"，rAF 本身是否在推进是排查"引擎完全没跑"还是"引擎跑了但没画出来"
  // 的第一道分界线（frame-anim.js 用可注入 setTimeout 链而非 rAF 驱动自己的 tick，但
  // app.js 的主渲染循环用 rAF——两者若表现不一致，这里能分开诊断）。
  // ---------------------------------------------------------------------
  var rafState = { totalTicks: 0, ticksSinceHeartbeat: 0, lastTickAt: null, active: false };

  function rafLoop() {
    rafState.totalTicks++;
    rafState.ticksSinceHeartbeat++;
    rafState.lastTickAt = clockRef.now();
    if (clockRef.requestAnimationFrame) {
      clockRef.requestAnimationFrame(rafLoop);
    }
  }

  function startRafProbe() {
    if (!clockRef.requestAnimationFrame) {
      console.warn('[WTJ_DIAG] window.requestAnimationFrame 不可用，跳过 rAF ticking 探测。');
      return;
    }
    rafState.active = true;
    clockRef.requestAnimationFrame(rafLoop);
  }

  function readFrameAnimSnapshot() {
    try {
      if (window.WTJ_FRAME_ANIM && typeof window.WTJ_FRAME_ANIM.getState === 'function') {
        var s = window.WTJ_FRAME_ANIM.getState();
        return {
          availableProps: s.availableProps,
          idleStopSec: s.idleStopSec,
          activePlaybacks: s.activePlaybacks
        };
      }
    } catch (err) {
      return { error: String((err && err.message) || err) };
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // 心跳：每 HEARTBEAT_MS 一条，recursive setTimeout 链（与 frame-anim.js/reward-chest.js
  // 同款风格，不用 setInterval）。
  // ---------------------------------------------------------------------
  function scheduleHeartbeat() {
    clockRef.setTimeout(heartbeatTick, HEARTBEAT_MS);
  }

  function heartbeatTick() {
    var ticksDelta = rafState.ticksSinceHeartbeat;
    rafState.ticksSinceHeartbeat = 0;
    record('heartbeat', {
      rafActive: rafState.active,
      rafTicksSinceLast: ticksDelta,
      rafTotalTicks: rafState.totalTicks,
      rafTicking: ticksDelta > 0,
      frameAnim: readFrameAnimSnapshot()
    });
    scheduleHeartbeat();
  }

  // ---------------------------------------------------------------------
  // 延迟一拍的初始化：见文件头「语法基线与加载位置」一节——manifest.js/task-templates.js
  // 此刻（0ms 宏任务触发时）已经过同步脚本解析阶段全部执行完毕，读取它们暴露的
  // window.WTJ_MANIFEST / window.WTJ_TASK_TEMPLATES 是安全的。
  // ---------------------------------------------------------------------
  function deferredInit() {
    emitHeader();
    subscribeTaskComplete();
  }

  // ---------------------------------------------------------------------
  // getState()：供 QA/单测内省。
  // ---------------------------------------------------------------------
  function getState() {
    var countsCopy = {};
    var key;
    for (key in counts) {
      if (Object.prototype.hasOwnProperty.call(counts, key)) {
        countsCopy[key] = counts[key];
      }
    }
    return {
      recent: recentRecords.slice(),
      counts: countsCopy,
      rafTicking: rafState.totalTicks > 0,
      rafTotalTicks: rafState.totalTicks,
      buildInfo: resolveBuildInfo()
    };
  }

  // ---------------------------------------------------------------------
  // 安装顺序：错误钩子最先（本文件是第一个 <script>，越早越好）；随后资源监听/fetch 包装/
  // DOM 观察/rAF 探测/心跳链；最后把"需要读晚加载模块"的部分推到 0ms 宏任务之后。
  // ---------------------------------------------------------------------
  installWindowErrorHook();
  installUnhandledRejectionHook();
  installResourceListeners();
  wrapFetch();
  startAnimStateObserver();
  startRafProbe();
  scheduleHeartbeat();
  clockRef.setTimeout(deferredInit, 0);

  // ---------------------------------------------------------------------
  // 对外冻结 API（与 009~015/056 同款约定）。
  // ---------------------------------------------------------------------
  var API = {
    VERSION: '0.1.0',
    CARD_ID: CARD_ID,

    getState: getState,

    // 测试专用，见文件头 API 列表说明；不是给其余生产代码调用的稳定契约。
    _setClock: _setClock
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  if (!window.WTJ_DIAG && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_DIAG', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_DIAG) {
    window.WTJ_DIAG = API;
  }
})();
