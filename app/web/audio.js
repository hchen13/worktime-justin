// WTJ-20260704-016 — 音频 / TTS / SFX 管理与缓存
//
// 语法基线：ES2020 以内（Safari 14 兼容）。非 module（无 import/export），
// 以普通 <script src="audio.js"> 标签加载，暴露 window.WTJ_AUDIO。
// 沿用 app/web/manifest.js 同款风格：var + function 声明式，
// 不用箭头函数 / let / const / 模板字符串 / 可选链 (?.) / 空值合并 (??)。
//
// 红线（REQ-AST-07）：全文不得出现 speechSynthesis / SpeechSynthesisUtterance。
// 产品语音一律走「预生成音频文件 + Web Audio API」（AudioContext + decodeAudioData
// → AudioBuffer → BufferSource 播放），不使用浏览器内置发音引擎。
//
// 本卡边界（据实重申，不越权）：
//   1) 只交付 manager 本体（本文件）+ 缓存策略 + audio/ 目录下的缺口清单与文档；
//   2) 不产出任何真实音频素材（授权采购超出本卡范围，见 audio/missing-audio.json）；
//   3) 不接入 index.html / app.js 运行时（接入是 013 任务引擎卡 / 019 集成卡的事）；
//   4) 零外部请求——preload/play 系列仅通过同源相对路径 fetch() 本地文件，不访问任何
//      CDN / 远程主机。
//
// 路径约定（与 app/web/manifest.js 的 secretWords.pool[].audioFile 及
// tasks.templates.*.examples[].voicePrompt / successAudio 完全一致）：
//   秘密词语音   audio/words/<word>.m4a
//   任务语音     audio/tasks/<taskId 或语音文件名 stem>.m4a
//   音效 SFX     audio/sfx/<sfxKey>.m4a（见 audio/sfx-manifest.json）
//   组合短语     audio/phrases/<phraseKey>.m4a（本卡新增，见 audio/missing-audio.json
//                的 compositePhrases 段落，供 playComposite() 的固定短句拼接用）
//
// 音频文件格式约定：.m4a（AAC）。理由见 audio/AUDIO-API.md「格式选型」一节
// （Safari/WebKit 原生解码支持好、单位时长体积小，适合本机 4GB 内存 / HD5000 核显预算）。

(function () {
  'use strict';

  // =====================================================================
  // 常量
  // =====================================================================

  // AudioBuffer 缓存的 LRU 上限（按缓存条目数，不按字节数）。
  //
  // 依据：技术评审结论——目标机 2014 MacBook Air（4GB 内存 / Intel HD5000 核显），
  // 与 app/web/manifest.js 的 performance 红线（maxResidentSprites=20、
  // maxParticles=300）同源但非文档给出的精确数值，这里给出估算：
  // 一段 1-2 秒的短句/音效解码为 PCM（Web Audio 内部通常按 32-bit float、
  // 44.1kHz、双声道估算）约占用 0.7MB~1.5MB 内存；64 条上限对应约 45MB~95MB
  // 峰值占用，在 4GB 机器上给渲染/动效/其余运行时留出充足余量。
  // 如后续实测需要调整，可通过 WTJ_AUDIO.setMaxCacheEntries() 运行时覆盖，
  // 不需要改动本常量。
  //
  // 注意：「按条目数」只是对内存占用的粗略代理——它假设每段音频时长相近（本产品的
  // 秘密词/短句/SFX 基本都是 1-2 秒的短音频，这个假设成立）。若未来引入明显更长的
  // 音频（如整段背景音乐、长语音），单条 buffer 的字节占用会远超上述估算，条目数上限
  // 就不能准确反映内存预算；届时应通过 setMaxCacheEntries() 调低上限，或把缓存策略
  // 改为按解码后估算字节数（buffer.length * numberOfChannels * 4）计量。
  var MAX_CACHE_ENTRIES = 64;

  var AUDIO_DIRS = {
    words: 'audio/words/',
    tasks: 'audio/tasks/',
    sfx: 'audio/sfx/',
    phrases: 'audio/phrases/'
  };

  // 默认 SFX key -> 路径映射，须与 audio/sfx-manifest.json 保持同步（见该文件顶部
  // $schema_note 说明：运行时不对 JSON 做 fetch，两处各自维护同一份数据）。
  // 覆盖 REQ-AST-09 点名的四类：动物叫声 / 铃铛 / 水声 / 开箱声，另加 ui 类
  // 通用反馈音（含已被 app/web/manifest.js 硬编码引用的 task-success）。
  var DEFAULT_SFX_MAP = {
    'task-success': 'audio/sfx/task-success.m4a',
    'light-hint-chime': 'audio/sfx/light-hint-chime.m4a',
    'slot-light-up': 'audio/sfx/slot-light-up.m4a',
    'keyboard-milestone-chime': 'audio/sfx/keyboard-milestone-chime.m4a',
    'streak-reward-fanfare': 'audio/sfx/streak-reward-fanfare.m4a',
    'dog-bark': 'audio/sfx/dog-bark.m4a',
    'cat-meow': 'audio/sfx/cat-meow.m4a',
    'duck-quack': 'audio/sfx/duck-quack.m4a',
    'horse-neigh': 'audio/sfx/horse-neigh.m4a',
    'pig-oink': 'audio/sfx/pig-oink.m4a',
    'frog-croak': 'audio/sfx/frog-croak.m4a',
    'elephant-trumpet': 'audio/sfx/elephant-trumpet.m4a',
    'mouse-squeak': 'audio/sfx/mouse-squeak.m4a',
    'bell-ring': 'audio/sfx/bell-ring.m4a',
    'bell-jingle': 'audio/sfx/bell-jingle.m4a',
    'water-tap-flow': 'audio/sfx/water-tap-flow.m4a',
    'water-drop': 'audio/sfx/water-drop.m4a',
    'water-splash': 'audio/sfx/water-splash.m4a',
    'chest-open': 'audio/sfx/chest-open.m4a',
    'chest-lid-creak': 'audio/sfx/chest-lid-creak.m4a'
  };

  var VALID_TYPES = { word: true, sfx: true, task: true, phrase: true, path: true };

  // =====================================================================
  // 内部状态（闭包持有；window.WTJ_AUDIO 本身会被冻结，但内部状态不受影响）
  // =====================================================================

  var audioCtx = null;             // 懒创建的单例 AudioContext
  var cacheMap = new Map();        // resolvedPath -> AudioBuffer，插入顺序即 LRU 顺序
  var missingMap = new Map();      // "type:key:path" -> { type, key, path, reason, count, ... }
  var warnedMessages = new Set();  // 已经 console.warn 过的文案，避免刷屏

  // =====================================================================
  // 小工具
  // =====================================================================

  function warnOnce(message) {
    if (warnedMessages.has(message)) {
      return;
    }
    warnedMessages.add(message);
    if (typeof window !== 'undefined' && window.console && typeof window.console.warn === 'function') {
      window.console.warn(message);
    }
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch (err) {
      return '';
    }
  }

  function isNonEmptyArray(x) {
    return Array.isArray(x) && x.length > 0;
  }

  function isPlainObject(x) {
    return !!x && typeof x === 'object';
  }

  // 只允许 a-z0-9- 作为拼路径用的 token，防止越权路径（如 ../../ 之类）混入。
  function sanitizeToken(rawKey) {
    if (typeof rawKey !== 'string') {
      return '';
    }
    var lower = rawKey.toLowerCase();
    return lower.replace(/[^a-z0-9-]/g, '');
  }

  function conventionalPath(type, rawKey) {
    var key = sanitizeToken(rawKey);
    if (!key) {
      warnOnce('WTJ_AUDIO: 无法从 "' + String(rawKey) + '" 解析出合法 key（仅允许 a-z0-9-），已忽略。');
      return null;
    }
    if (type === 'word') {
      return AUDIO_DIRS.words + key + '.m4a';
    }
    if (type === 'sfx') {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_SFX_MAP, key)) {
        return DEFAULT_SFX_MAP[key];
      }
      // 未登记在 DEFAULT_SFX_MAP 的 sfxKey：仍按约定路径尝试兜底，
      // 而不是直接拒绝——允许未来新增 SFX 时无需先改代码。
      return AUDIO_DIRS.sfx + key + '.m4a';
    }
    if (type === 'task') {
      return AUDIO_DIRS.tasks + key + '.m4a';
    }
    if (type === 'phrase') {
      return AUDIO_DIRS.phrases + key + '.m4a';
    }
    return null;
  }

  // 描述符归一化：preload() / playComposite() 的数组元素、以及
  // playWord/playSfx/playTaskVoice 的单个入参，最终都收敛到这里。
  // 支持两种形式：
  //   字符串           -> 视为原始 path（不做约定拼接），key 就是该字符串本身。
  //   { type, key, path } -> type 必须是 word/sfx/task/phrase/path 之一；
  //                          若显式给了 path 则直接使用（穿透约定拼接，
  //                          用于 013/019 直接把 manifest.js 的任务对象
  //                          {id, voicePrompt} 转成 {type:'task', key:id, path:voicePrompt}
  //                          传入，规避「id 与语音文件名 stem 不一致」的坑，
  //                          例如 manifest.js 里的 press-letter-a / press-a.m4a）。
  function resolveDescriptor(item) {
    if (typeof item === 'string') {
      if (item.length === 0) {
        warnOnce('WTJ_AUDIO: 忽略了一个空字符串描述符。');
        return null;
      }
      return { type: 'path', key: item, path: item };
    }
    if (!isPlainObject(item)) {
      warnOnce('WTJ_AUDIO: 忽略了一个非法描述符（既不是字符串也不是对象）。');
      return null;
    }
    var type = item.type;
    if (!Object.prototype.hasOwnProperty.call(VALID_TYPES, type)) {
      warnOnce('WTJ_AUDIO: 忽略了一个未知 type 的描述符："' + String(type) + '"。');
      return null;
    }
    if (type === 'path') {
      if (typeof item.path !== 'string' || item.path.length === 0) {
        warnOnce('WTJ_AUDIO: type:"path" 的描述符缺少合法 path 字符串，已忽略。');
        return null;
      }
      return { type: 'path', key: (typeof item.key === 'string' && item.key) ? item.key : item.path, path: item.path };
    }
    var key = item.key;
    if (typeof key !== 'string' || key.length === 0) {
      warnOnce('WTJ_AUDIO: type:"' + type + '" 的描述符缺少合法 key 字符串，已忽略。');
      return null;
    }
    var explicitPath = (typeof item.path === 'string' && item.path.length > 0) ? item.path : null;
    var path = explicitPath || conventionalPath(type, key);
    if (!path) {
      return null;
    }
    return { type: type, key: key, path: path };
  }

  // =====================================================================
  // AudioContext 生命周期
  //
  // 集成注记（供未来 019 集成卡参考，本卡不改动 app.js）：
  // app/web/app.js 里已经有一段独立的 AudioContext 解锁桩（007/002 遗留，
  // 变量名 audioCtx，仅用于 dbg-audio 状态展示，不做任何真正的音频解码/播放）。
  // 本模块（audio.js）持有另一个完全独立的 AudioContext 单例。二者互不冲突
  // （各自的闭包变量，互不可见），但同一页面里存在两个 AudioContext 实例本身
  // 不是好的长期状态——iOS/桌面 Safari 对同时存在的 AudioContext 数量、
  // 以及"是否已被同一次用户手势解锁"都有细节差异。019 集成卡把 audio.js
  // 真正接入 index.html 时，应当：
  //   1) 删除 app.js 里那段独立解锁桩，统一改为调用 WTJ_AUDIO.unlock()；
  //   2) 只保留 audio.js 内部的单例 AudioContext 作为全应用唯一实例；
  //   3) dbg-audio 状态展示可以直接读 WTJ_AUDIO.isUnlocked() 的返回值。
  // 本卡不越权修改 app.js，仅在此留下明确的集成说明。
  // =====================================================================

  function ensureContext() {
    if (audioCtx) {
      return audioCtx;
    }
    if (typeof window === 'undefined') {
      return null;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      warnOnce('WTJ_AUDIO: 当前环境不支持 Web Audio API（无 AudioContext），音频播放将始终 silent 降级。');
      return null;
    }
    try {
      audioCtx = new AC();
    } catch (err) {
      warnOnce('WTJ_AUDIO: 创建 AudioContext 失败 - ' + (err && err.message ? err.message : String(err)));
      audioCtx = null;
    }
    return audioCtx;
  }

  // 首次用户手势（click/keydown 等）里调用，用来 resume() 处于 suspended
  // 状态的 AudioContext——file:// 场景下浏览器的自动播放门控要求这一步。
  function unlock() {
    var ctx = ensureContext();
    if (!ctx) {
      return Promise.resolve(false);
    }
    if (ctx.state === 'running') {
      return Promise.resolve(true);
    }
    if (typeof ctx.resume !== 'function') {
      return Promise.resolve(false);
    }
    return ctx.resume().then(
      function () {
        return ctx.state === 'running';
      },
      function (err) {
        warnOnce('WTJ_AUDIO: AudioContext.resume() 失败 - ' + (err && err.message ? err.message : String(err)));
        return false;
      }
    );
  }

  function isUnlocked() {
    return !!(audioCtx && audioCtx.state === 'running');
  }

  // decodeAudioData 兼容包装：优先走回调式签名（新旧浏览器都支持），
  // 同时兼容只实现 Promise 式签名的实现——两条路径谁先 resolve/reject 都安全，
  // 因为 Promise executor 保证 resolve/reject 只有第一次调用生效。
  function decodeAudioDataCompat(ctx, arrayBuffer) {
    return new Promise(function (resolve, reject) {
      try {
        var maybePromise = ctx.decodeAudioData(arrayBuffer, resolve, reject);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(resolve, reject);
        }
      } catch (syncErr) {
        reject(syncErr);
      }
    });
  }

  // =====================================================================
  // 缓存（AudioBuffer 按 resolvedPath 缓存 + LRU 上限）
  // =====================================================================

  function cacheGet(path) {
    if (!cacheMap.has(path)) {
      return undefined;
    }
    var buffer = cacheMap.get(path);
    // 触达即视为最近使用：删除后重新插入，让它排到 Map 迭代顺序的末尾。
    cacheMap.delete(path);
    cacheMap.set(path, buffer);
    return buffer;
  }

  function cachePut(path, buffer) {
    if (cacheMap.has(path)) {
      cacheMap.delete(path);
    }
    cacheMap.set(path, buffer);
    while (cacheMap.size > MAX_CACHE_ENTRIES) {
      var oldestKey = cacheMap.keys().next().value;
      cacheMap.delete(oldestKey);
    }
  }

  function clearCache() {
    cacheMap.clear();
    return true;
  }

  function getCacheStats() {
    var keys = [];
    cacheMap.forEach(function (value, key) {
      keys.push(key);
    });
    return { size: cacheMap.size, maxEntries: MAX_CACHE_ENTRIES, keys: keys };
  }

  function setMaxCacheEntries(n) {
    if (typeof n !== 'number' || !isFinite(n) || n < 1 || Math.floor(n) !== n) {
      warnOnce('WTJ_AUDIO: setMaxCacheEntries() 需要一个 >=1 的整数，已忽略非法调用。');
      return false;
    }
    MAX_CACHE_ENTRIES = n;
    while (cacheMap.size > MAX_CACHE_ENTRIES) {
      var oldestKey = cacheMap.keys().next().value;
      cacheMap.delete(oldestKey);
    }
    return true;
  }

  // =====================================================================
  // 缺口记录（QA / 019 消费）
  // =====================================================================

  function recordMissing(type, key, path, reason) {
    var mapKey = type + ':' + key + ':' + path;
    if (missingMap.has(mapKey)) {
      var existing = missingMap.get(mapKey);
      existing.count += 1;
      existing.lastRequestedAt = nowIso();
      return;
    }
    missingMap.set(mapKey, {
      type: type,
      key: key,
      path: path,
      reason: reason,
      count: 1,
      firstRequestedAt: nowIso(),
      lastRequestedAt: nowIso()
    });
  }

  function getMissingReport() {
    var out = [];
    missingMap.forEach(function (entry) {
      out.push({
        type: entry.type,
        key: entry.key,
        path: entry.path,
        reason: entry.reason,
        count: entry.count,
        firstRequestedAt: entry.firstRequestedAt,
        lastRequestedAt: entry.lastRequestedAt
      });
    });
    return out;
  }

  // =====================================================================
  // 加载 + 解码（带缓存），核心降级契约：永不 reject，取不到就 resolve(null)。
  // =====================================================================

  // loadArrayBuffer(path) -> Promise<ArrayBuffer>（失败时 reject）。
  //
  // >>> 019 集成卡的唯一加载层替换点 <<<
  // 这是整个 manager 里唯一发起网络/文件读取的地方。当前实现用同源 fetch()。
  // 重要：在本项目既定的 WKWebView loadFileURL 运行时下（见 AUDIO-API.md §6.3），
  // 【已解决】历史上 file:// 下 fetch()/XHR 会被 WebKit 近乎必然拦截失败（loadFileURL /
  // allowingReadAccessTo 只放开标签式子资源 <img>/<audio>/<script>，不解除 fetch/XHR
  // 对 file:// 的限制）。019 卡已用自定义 WKURLSchemeHandler（wtjres:// scheme）改壳：
  // 页面经 wtjres:// 加载后，本函数的相对路径 fetch 自动变同源，不再被拦——本函数无需
  // 替换。（浏览器直开 file:// 调试时仍会受限，属预期。）decode 与缓存逻辑（外层 getBuffer）
  // 无需改动。把加载层单独抽成这一个函数，就是为了让这个替换点一目了然。
  function loadArrayBuffer(path) {
    return window.fetch(path).then(function (resp) {
      if (!resp || !resp.ok) {
        throw new Error('http-status-' + (resp ? resp.status : 'unknown'));
      }
      return resp.arrayBuffer();
    });
  }

  function getBuffer(path, type, key) {
    var cached = cacheGet(path);
    if (cached) {
      return Promise.resolve(cached);
    }
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
      recordMissing(type, key, path, 'fetch-unsupported');
      warnOnce('WTJ_AUDIO: 当前环境不支持 fetch()，无法加载 ' + path + '，已降级为 silent。');
      return Promise.resolve(null);
    }
    var ctx = ensureContext();
    if (!ctx) {
      recordMissing(type, key, path, 'no-audio-context');
      return Promise.resolve(null);
    }
    return loadArrayBuffer(path)
      .then(function (arrayBuffer) {
        return decodeAudioDataCompat(ctx, arrayBuffer);
      })
      .then(function (decodedBuffer) {
        cachePut(path, decodedBuffer);
        return decodedBuffer;
      })
      .catch(function (err) {
        recordMissing(type, key, path, 'load-or-decode-failed');
        warnOnce(
          'WTJ_AUDIO: 音频缺失或无法解码，已 silent 降级 - ' +
            type +
            ':' +
            key +
            ' (' +
            path +
            ') - ' +
            (err && err.message ? err.message : String(err))
        );
        return null;
      });
  }

  function invalidResult(type, reason) {
    return {
      ok: false,
      silent: true,
      type: type,
      key: null,
      path: null,
      reason: reason || 'invalid-arg',
      startedAtSec: null,
      durationSec: 0
    };
  }

  function silentResult(type, key, path, reason) {
    return {
      ok: false,
      silent: true,
      type: type,
      key: key,
      path: path,
      reason: reason,
      startedAtSec: null,
      durationSec: 0
    };
  }

  // 实际播放：拿到 AudioBuffer 后创建一次性 BufferSource 播放。
  // 同样永不 reject——播放期间任何异常都被吞掉、记为 silent。
  //
  // whenSec（可选）：在 AudioContext 时钟上的绝对起播时刻（秒）。
  //   - 省略 / 非数字：立即播放（source.start(ctx.currentTime)，等价于 start(0)）。
  //     playWord / playSfx / playTaskVoice 这类单段播放走这条路径。
  //   - 数字：把这段排到时间轴上的 whenSec 时刻起播（source.start(whenSec)）。
  //     playComposite 用它把多段排到「上一段结束时刻」，实现真正的顺序不重叠播放，
  //     同时为未来的无缝拼接铺路。
  // 返回值新增 startedAtSec（实际排定的绝对起播时刻）与 durationSec（该段 buffer 时长），
  // 供 playComposite 累计下一段的起播时刻、也供 QA 断言顺序语义。
  function playFromPath(type, key, path, whenSec) {
    return getBuffer(path, type, key).then(function (buffer) {
      if (!buffer) {
        return silentResult(type, key, path, 'missing');
      }
      var ctx = ensureContext();
      if (!ctx) {
        return silentResult(type, key, path, 'no-audio-context');
      }
      try {
        var startAt = (typeof whenSec === 'number' && isFinite(whenSec)) ? whenSec : ctx.currentTime;
        var durationSec = (typeof buffer.duration === 'number' && isFinite(buffer.duration)) ? buffer.duration : 0;
        var source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(startAt);
        return {
          ok: true,
          silent: false,
          type: type,
          key: key,
          path: path,
          startedAtSec: startAt,
          durationSec: durationSec
        };
      } catch (err) {
        warnOnce(
          'WTJ_AUDIO: 播放失败，已 silent 降级 - ' +
            type +
            ':' +
            key +
            ' (' +
            path +
            ') - ' +
            (err && err.message ? err.message : String(err))
        );
        return silentResult(type, key, path, 'play-error');
      }
    });
  }

  // =====================================================================
  // 预取 / 批量缓存
  // =====================================================================

  function preload(items) {
    if (!isNonEmptyArray(items)) {
      warnOnce('WTJ_AUDIO: preload() 需要一个非空数组，已忽略非法调用。');
      return Promise.resolve([]);
    }
    var descriptors = [];
    var i;
    for (i = 0; i < items.length; i += 1) {
      var d = resolveDescriptor(items[i]);
      if (d) {
        descriptors.push(d);
      }
    }
    var promises = [];
    for (i = 0; i < descriptors.length; i += 1) {
      (function (descriptor) {
        promises.push(
          getBuffer(descriptor.path, descriptor.type, descriptor.key).then(function (buffer) {
            return { type: descriptor.type, key: descriptor.key, path: descriptor.path, loaded: !!buffer };
          })
        );
      })(descriptors[i]);
    }
    return Promise.all(promises);
  }

  function appendManifestSection(items, list, type, preferredKeyFields, preferredPathFields) {
    if (!isNonEmptyArray(list)) {
      return;
    }
    var i;
    for (i = 0; i < list.length; i += 1) {
      var entry = list[i];
      if (typeof entry === 'string') {
        items.push({ type: type, key: entry });
        continue;
      }
      if (!isPlainObject(entry)) {
        warnOnce('WTJ_AUDIO: preloadManifest() 跳过了一个非法条目（既不是字符串也不是对象）。');
        continue;
      }
      var keyVal = null;
      var j;
      for (j = 0; j < preferredKeyFields.length; j += 1) {
        if (typeof entry[preferredKeyFields[j]] === 'string' && entry[preferredKeyFields[j]]) {
          keyVal = entry[preferredKeyFields[j]];
          break;
        }
      }
      var pathVal = null;
      for (j = 0; j < preferredPathFields.length; j += 1) {
        if (typeof entry[preferredPathFields[j]] === 'string' && entry[preferredPathFields[j]]) {
          pathVal = entry[preferredPathFields[j]];
          break;
        }
      }
      if (!keyVal) {
        warnOnce('WTJ_AUDIO: preloadManifest() 跳过了一个缺少可用 key 字段的 "' + type + '" 条目。');
        continue;
      }
      items.push({ type: type, key: keyVal, path: pathVal });
    }
  }

  // 便捷批量入口：接受形如
  //   {
  //     words:   WTJ_MANIFEST.secretWords.pool（每条 {word, spriteFile, audioFile}）,
  //     tasks:   [].concat(...模板 examples)（每条 {id, voicePrompt, successAudio, ...}）,
  //     sfx:     ['task-success', 'chest-open', ...]（sfxKey 字符串数组）,
  //     phrases: ['find', 'pick-up', ...],
  //     paths:   ['audio/…/xxx.m4a', ...]（原始路径，直接透传）
  //   }
  // 的对象；缺失的分段可以省略。具体消费示例见 audio/AUDIO-API.md。
  function preloadManifest(manifestLikeObj) {
    if (!isPlainObject(manifestLikeObj)) {
      warnOnce('WTJ_AUDIO: preloadManifest() 需要一个对象，已忽略非法调用。');
      return Promise.resolve([]);
    }
    var items = [];
    appendManifestSection(items, manifestLikeObj.words, 'word', ['word', 'key'], ['audioFile', 'path']);
    appendManifestSection(items, manifestLikeObj.sfx, 'sfx', ['sfxKey', 'key'], ['path']);
    appendManifestSection(items, manifestLikeObj.tasks, 'task', ['id', 'taskId', 'key'], ['voicePrompt', 'path']);
    appendManifestSection(items, manifestLikeObj.phrases, 'phrase', ['phraseKey', 'key'], ['path']);
    if (isNonEmptyArray(manifestLikeObj.paths)) {
      var i;
      for (i = 0; i < manifestLikeObj.paths.length; i += 1) {
        items.push(manifestLikeObj.paths[i]);
      }
    }
    if (items.length === 0) {
      warnOnce('WTJ_AUDIO: preloadManifest() 没有解析出任何可预取的条目。');
      return Promise.resolve([]);
    }
    return preload(items);
  }

  // =====================================================================
  // 分层播放 API
  // =====================================================================

  // playWord(word) / playWord({ word, audioFile })
  // 秘密词命中语音；009 秘密词卡消费。约定路径 audio/words/<word>.m4a，
  // 与 app/web/manifest.js secretWords.pool[].audioFile 完全一致。
  function playWord(wordOrObj) {
    var descriptor;
    if (typeof wordOrObj === 'string') {
      descriptor = resolveDescriptor({ type: 'word', key: wordOrObj });
    } else if (isPlainObject(wordOrObj)) {
      descriptor = resolveDescriptor({
        type: 'word',
        key: wordOrObj.word || wordOrObj.key,
        path: wordOrObj.audioFile || wordOrObj.path
      });
    } else {
      warnOnce('WTJ_AUDIO: playWord() 需要字符串或 {word, audioFile} 对象。');
      return Promise.resolve(invalidResult('word'));
    }
    if (!descriptor) {
      return Promise.resolve(invalidResult('word'));
    }
    return playFromPath(descriptor.type, descriptor.key, descriptor.path);
  }

  // playSfx(sfxKey) / playSfx({ sfxKey, path })
  // 音效播放；011 奖励卡（开箱声等）、013 任务卡（task-success 等）消费。
  function playSfx(sfxKeyOrObj) {
    var descriptor;
    if (typeof sfxKeyOrObj === 'string') {
      descriptor = resolveDescriptor({ type: 'sfx', key: sfxKeyOrObj });
    } else if (isPlainObject(sfxKeyOrObj)) {
      descriptor = resolveDescriptor({
        type: 'sfx',
        key: sfxKeyOrObj.sfxKey || sfxKeyOrObj.key,
        path: sfxKeyOrObj.path
      });
    } else {
      warnOnce('WTJ_AUDIO: playSfx() 需要字符串或 {sfxKey, path} 对象。');
      return Promise.resolve(invalidResult('sfx'));
    }
    if (!descriptor) {
      return Promise.resolve(invalidResult('sfx'));
    }
    return playFromPath(descriptor.type, descriptor.key, descriptor.path);
  }

  // playTaskVoice(taskKey) / playTaskVoice({ id, voicePrompt })
  // 任务语音提示；013 任务引擎卡消费。
  //
  // 重要：字符串快捷式按约定拼 audio/tasks/<taskKey>.m4a；但 app/web/manifest.js
  // 里少数任务示例（press-letter-a / press-digit-3）的 id 与 voicePrompt 文件名
  // stem 并不一致（见 audio/missing-audio.json taskVoice 段落的 note 字段）。
  // 更稳妥的用法是直接把 manifest 任务对象整个传进来，让本函数直接读取
  // voicePrompt 字段，不做约定拼接：
  //   WTJ_AUDIO.playTaskVoice(WTJ_MANIFEST.tasks.templates.press.examples[0]);
  function playTaskVoice(taskKeyOrObj) {
    var descriptor;
    if (typeof taskKeyOrObj === 'string') {
      descriptor = resolveDescriptor({ type: 'task', key: taskKeyOrObj });
    } else if (isPlainObject(taskKeyOrObj)) {
      descriptor = resolveDescriptor({
        type: 'task',
        key: taskKeyOrObj.id || taskKeyOrObj.taskId || taskKeyOrObj.key,
        path: taskKeyOrObj.voicePrompt || taskKeyOrObj.path
      });
    } else {
      warnOnce('WTJ_AUDIO: playTaskVoice() 需要字符串或 {id, voicePrompt} 对象。');
      return Promise.resolve(invalidResult('task'));
    }
    if (!descriptor) {
      return Promise.resolve(invalidResult('task'));
    }
    return playFromPath(descriptor.type, descriptor.key, descriptor.path);
  }

  // playComposite(parts, opts)
  // 组合任务语音——按顺序播放多个预生成片段（如短语 "找到" + 秘密词 "小狗"）。
  // parts 数组元素支持字符串（视为原始 path）或 {type, key, path} 描述符，
  // type 可以是 word/sfx/task/phrase/path 的任意组合，例如：
  //   WTJ_AUDIO.playComposite([
  //     { type: 'phrase', key: 'find' },   // audio/phrases/find.m4a
  //     { type: 'word', key: 'dog' }       // audio/words/dog.m4a
  //   ]);
  // 顺序语义（本卡承诺、013 据以构建的接口原语）：各片段在 AudioContext 时钟上
  // 依次、不重叠地播放。实现方式是「时间轴排程」——把第 N 段排到第 N-1 段结束时刻
  // 起播（source.start(上一段结束时刻)），而不是「一 start 就 resolve、下一段立刻
  // start(0)」那种会在音频时钟上重叠的做法。缺失/静默的片段不占用时间轴（时长记 0），
  // 后一段紧接再前一段有效片段之后。
  //
  // 注意：这里只做「顺序排程 + 已解码片段各自缓存」，不做真实的音频拼接/混音——把
  // 多个片段合成一条无缝语音（单个 buffer）需要真实素材到位后另行处理（超出本卡范围）。
  // 运行时按 opts.cacheKey（或由各片段 path 拼接自动生成的 key）记录这次组合的调用，
  // 方便未来在同一个 cacheKey 上接入「真正拼接后的单文件缓存」而不用改调用方代码。
  function playComposite(parts, opts) {
    if (!isNonEmptyArray(parts)) {
      warnOnce('WTJ_AUDIO: playComposite() 需要一个非空数组，已忽略非法调用。');
      return Promise.resolve({ ok: false, silent: true, reason: 'invalid-arg', compositeKey: null, parts: [] });
    }
    var descriptors = [];
    var i;
    for (i = 0; i < parts.length; i += 1) {
      var d = resolveDescriptor(parts[i]);
      if (d) {
        descriptors.push(d);
      }
    }
    if (descriptors.length === 0) {
      warnOnce('WTJ_AUDIO: playComposite() 没有解析出任何合法片段。');
      return Promise.resolve({ ok: false, silent: true, reason: 'no-valid-parts', compositeKey: null, parts: [] });
    }
    var compositeKey;
    if (opts && typeof opts.cacheKey === 'string' && opts.cacheKey) {
      compositeKey = opts.cacheKey;
    } else {
      var pathList = [];
      for (i = 0; i < descriptors.length; i += 1) {
        pathList.push(descriptors[i].path);
      }
      compositeKey = pathList.join('+');
    }
    var results = [];
    // nextStartTime：下一段应当起播的绝对音频时钟时刻（秒）；null 表示尚未排过第一段。
    var nextStartTime = null;
    var chain = Promise.resolve();
    descriptors.forEach(function (descriptor) {
      chain = chain.then(function () {
        var ctx = ensureContext();
        var whenSec;
        if (!ctx) {
          // 没有 AudioContext：交给 playFromPath 走 silent 降级，起播时刻无意义。
          whenSec = undefined;
        } else if (nextStartTime === null) {
          whenSec = ctx.currentTime;
        } else if (ctx.currentTime > nextStartTime) {
          // 上一段排定的结束时刻已经过去（例如后续片段 fetch/decode 耗时较久）：
          // 立刻起播即可，此时上一段早已播完，依然不重叠。
          whenSec = ctx.currentTime;
        } else {
          whenSec = nextStartTime;
        }
        return playFromPath(descriptor.type, descriptor.key, descriptor.path, whenSec).then(function (result) {
          results.push(result);
          if (result.ok && result.startedAtSec !== null) {
            nextStartTime = result.startedAtSec + result.durationSec;
          }
          return result;
        });
      });
    });
    return chain.then(function () {
      var allSilent = results.every(function (r) {
        return r.silent;
      });
      return { ok: !allSilent, silent: allSilent, compositeKey: compositeKey, parts: results };
    });
  }

  // =====================================================================
  // 其它内省 / 调试辅助
  // =====================================================================

  function getSfxKeys() {
    var out = [];
    var k;
    for (k in DEFAULT_SFX_MAP) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_SFX_MAP, k)) {
        out.push(k);
      }
    }
    return out;
  }

  // =====================================================================
  // 冻结导出
  // =====================================================================

  var API = {
    VERSION: '0.1.0',
    CARD_ID: 'WTJ-20260704-016',

    // 生命周期
    unlock: unlock,
    isUnlocked: isUnlocked,

    // 预取
    preload: preload,
    preloadManifest: preloadManifest,

    // 播放
    playWord: playWord,
    playSfx: playSfx,
    playTaskVoice: playTaskVoice,
    playComposite: playComposite,

    // 缓存
    clearCache: clearCache,
    getCacheStats: getCacheStats,
    setMaxCacheEntries: setMaxCacheEntries,

    // QA / 集成用内省
    getMissingReport: getMissingReport,
    getSfxKeys: getSfxKeys
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固：API 对象自身已 Object.freeze（属性不可增删改）；这里进一步把 window 上的
  // WTJ_AUDIO 这个「绑定」本身设为不可写、不可重配置，防止有人整体重赋值
  // （window.WTJ_AUDIO = 伪造对象）把 manager 换掉。只有在尚未定义时才 defineProperty，
  // 这样脚本被重复引入时是安全的 no-op（不会因重定义 non-configurable 属性而抛错），
  // 且第二次不会覆盖既有绑定。
  if (!window.WTJ_AUDIO && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_AUDIO', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_AUDIO) {
    window.WTJ_AUDIO = API;
  }
})();
