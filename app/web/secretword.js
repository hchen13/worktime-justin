// WTJ-20260704-009 — 秘密词识别 / 命中反馈 / 对象出现引擎（window.WTJ_SECRET）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function 声明式，不用箭头函数 / let /
// const / 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求（不 fetch 任何东西）、非 module
// （无 import/export），以普通 <script src="secretword.js"> 标签加载，需在 keyboard.js 之后
// （加载时若 keyboard.js 已就绪即订阅 window.WTJ_KEYBOARD.onLetter；缺失则 console.warn 后
// 降级为空转，不阻断页面）。暴露一个已冻结的 window.WTJ_SECRET。
//
// -----------------------------------------------------------------------
// 职责边界（TL 已定案，见卡 WTJ-20260704-009 说明）
// -----------------------------------------------------------------------
// 本文件只负责"字母流 → 秘密词匹配 → 命中反馈"这条链：rolling input buffer、词池匹配引擎
// （规则从 manifest.secretWords.matchRules 读）、命中处理（onHit 事件 + 防御式音效 + sprite
// 对象一次性叠层出现 + 五槽基础联动 + 本轮去重的小反馈）。
//
// 本文件明确不做（红线，QA 会盯）：
//   - REQ-SEC-01：不创建任何输入框 / textarea / contenteditable，不把 buffer 或字母流回显到
//     任何可见 DOM（buffer 只在内存里，getBuffer() 仅供测试/调试读取，从不写进 DOM 文本）。
//   - 不接管完整的"跨秘密词命中 + 键盘里程碑"的五槽轮次去重状态机——那是 010 五槽引擎卡的事。
//     009 只做"命中即防御式点亮下一个空槽 + 本轮同词去重"这一最小契约，供 010 接管/改造。
//
// -----------------------------------------------------------------------
// 秘密词完成音：恒定英文（WTJ-20260707-011 验收反馈②）
// -----------------------------------------------------------------------
// playWordDefensive() 前的 resolveWordAudioEntry() 现恒定返回英文 entry.audioFile。曾经的
// "语言感知词音"脚手架（WTJ-20260706-011）会在 zh 叙述 + 该词 ZH 已交付时改播 .zh.m4a，随
// 008/011 音频卡补全 ZH 台账 + DEFAULT_MODE 改 'zh' 后变为活跃并导致默认中文叙述下秘密词念
// 中文——Ethan 验收反馈②要求秘密词（键盘拼出的英文单词）完成发音固定英文、与任务叙述语言
// 解耦。详见 resolveWordAudioEntry() 处的完整说明。
//
// -----------------------------------------------------------------------
// 匹配引擎设计（逐条对 docs/index.html #secret「命中判定规则」+ manifest.secretWords.matchRules）
// -----------------------------------------------------------------------
// 核心思路：**每来一个新字母，把它归一化后追加到 buffer 末尾，然后检查"这个新字母是否使
// buffer 末尾恰好构成某个 pool 词"**（即 buffer.endsWith(word)）。命中判定锚定在"末尾/后缀"
// 而非"整串包含"，这样一次只对"刚刚形成的那个词"触发一次，天然满足重叠触发且不重复触发。
//
//   REQ-SEC-09 大小写等价：matchRules.caseInsensitive 为 true 时，新字母与 pool 词都转小写
//     后比较（keyboard.js 送来的是大写字符，这里 toLowerCase 归一）。DOG/Dog/dog 等价。
//   REQ-SEC-04 子串命中：buffer 保留最近若干字符，xxdogxx 输入到 ...dog 时 buffer 末尾恰为
//     dog → 命中。用"末尾匹配"实现"输入流中出现完整暗语即触发"，无需输入框/回车。
//   REQ-SEC-05 重叠触发：dogg 输入到第 3 个字母 g 时 buffer 末尾="dog" → 触发 dog；第 4 个
//     字母 g 到来后 buffer 末尾="ogg"，不构成任何词 → 不重复触发。命中锚定"本次新字母使末尾
//     形成某词"，因此同一次命中只在其形成的那一刻触发一次。
//   REQ-SEC-06 双写不惩罚：apple 的 pp 只是 buffer 里两个连续 p，末尾匹配 apple 时照常命中，
//     没有任何"连续重复字母打断匹配"的逻辑，天然不惩罚。
//   REQ-SEC-11 最长词优先：若同一个新字母使 buffer 末尾同时匹配多个 pool 词（此时较短者必是
//     较长者的后缀，如 ...scar 同时末尾匹配 scar 与 car），matchRules.longestMatchPriority 为
//     true 时取**最长**的那个触发（scar），且**只触发它一个**（不再额外触发 car）。
//   REQ-SEC-10 复合顺序独立触发：hot 与 dog 在输入 hotdog 时结束于**不同位置**（t 之后、g
//     之后），属于两次不同的"新字母形成末尾词"事件，各自独立触发一次。最长优先只在"同一个
//     新字母位置多词同时结尾"时生效，不影响不同位置的多次命中。（当前真实 pool 无 hot，实际
//     hotdog 只命中 dog；引擎逻辑支持复合，测试用注入 pool 含 hot+dog 验证双触发。）
//   REQ-SEC-07 同词重复只小反馈：维护"本轮已命中词集合"。某词本轮首次命中 → 大反馈（emit
//     'hit' + 音效 + sprite 叠层 + 点亮下一空槽）；本轮同词再次命中 → matchRules
//     .sameWordRepeatMinorFeedbackOnly 为 true 时只 emit 'minorHit'（不占新槽、不放 sprite、
//     不重复出声），resetRound() 开启新一轮后同词可再触发大反馈。
//
// -----------------------------------------------------------------------
// 素材路径解析（见 app/web/assets/sprites/PROVENANCE.md「运行时路径约定与已知偏离」）
// -----------------------------------------------------------------------
// manifest.secretWords.pool[].spriteFile 字面值形如 'sprites/dog.png'（对应 manifest
// assets.runtimeDirs.sprites = 'sprites/' 的约定）；但本卡按 TL 指令把 sprite 实际复制到
// app/web/assets/sprites/（与 007 卡 assets/ui/ 的先例一致）。二者差一层 'assets/' 前缀。
// resolveSpritePath() 在**消费端**把 'sprites/xxx.png' 拼成 'assets/sprites/xxx.png' 再喂给
// DOM <img src> 与 WTJ_HUD.setSlot({spriteUrl})——**不改 manifest.js**（manifest 是本卡只读
// 参考）。这层前缀映射是已知遗留，PM/TL/019 统一路径约定后应同步删除（详见 PROVENANCE.md）。
//
// -----------------------------------------------------------------------
// 轮次边界（WTJ-20260704-066 缺陷修复：QA 020 对抗评审发现的跨轮半词误命中）
// -----------------------------------------------------------------------
// 缺陷复现：五槽满 → 010 WTJ_SLOTS.reset() 开新一轮 → 调用本文件 resetRound()。修复前
// resetRound() 只清 roundHitSet（去重表）与 secretSlotCursor（fallback 槽游标），**没有清
// rolling input buffer**——buffer 是跨"轮"持续存在的模块级闭包变量，只要 App 不刷新页面就
// 一直累积。于是上一轮残留的半词前缀（如输入到一半的 "do"，未构成任何词、五槽在此之前已因
// 别的发现满槽触发 reset）会原样留在 buffer 里；新一轮开局第一个字母若恰好是 "g"，
// tryMatchAtBufferTail() 在 buffer 末尾看到的是跨轮拼接出的 "...dog"，被误判为新一轮真实
// 输入了 dog（实际是"上轮 do" + "reset" + "新轮 g"三段拼接的假阳性）。
//
// 修复：resetRound() 增加 `buffer = ''`（见下方实现）。语义上，"新一轮"本就应该让秘密词匹配
// 从一张白纸开始——buffer 只是"字母流的滚动匹配窗口"，不携带任何应跨轮存活的产品语义（不同于
// getRoundHits() 承诺"按首次命中顺序"的可回溯历史，buffer 从来只对外暴露 getBuffer() 供调试，
// 没有任何契约要求它跨轮保留）。故直接在 resetRound() 里一并清空，而不是新增一个独立的
// resetInputStream() 方法——这样 010 无需改动（010 已经调用 resetRound()），也不需要 App 里
// 新增一处调用点会被遗漏的风险。已确认此改动不破坏 009 现有单测对 resetRound() 语义的断言
// （测试 8 只验证"resetRound 后同词可再次触发 onHit"，不依赖 buffer 是否跨轮保留）。
//
// 与 008（键盘同键节奏门控 sameKeyStreak/lastKeyId）的关系：两者是**两个独立机制**——本文件
// 的 buffer 服务于"字母流 → 秘密词匹配"，008 的 streak 服务于"连续同键 > 3 次暂停计数"防刷。
// 两者互不读写对方状态，但都属于"轮次内的瞬时输入流状态"，语义上都应在"新一轮"边界被清空
// （008 一侧的对应修复见 keyboard.js resetEffectiveKeyCount()）。
//
// -----------------------------------------------------------------------
// 对外 API（window.WTJ_SECRET，Object.freeze 冻结 + 绑定加固，多订阅者，回调数组内部 try/catch）
// -----------------------------------------------------------------------
//   onHit(fn)          注册"本轮首次命中某词"回调，fn({ word, spriteFile, audioFile })。
//   onMinorHit(fn)     注册"本轮同词重复命中"回调，fn({ word, spriteFile, audioFile })。
//   getRoundHits()     返回本轮已命中词数组（去重、按首次命中顺序），供 QA / 010 读。
//   resetRound()       重置本轮已命中集合、本卡内部的五槽游标、**以及 rolling input buffer**
//                       （WTJ-20260704-066 修复：见下方"轮次边界"一节），开启新一轮（五槽满
//                       触发宝箱后由 010 五槽引擎调用；009 单独运行时也可自测调用）。
//   getBuffer()        返回当前 rolling buffer 的快照字符串（**仅供测试/调试**，从不写进 DOM）。
//
// -----------------------------------------------------------------------
// REQ-SEC-01~11 + REQ-AST-04 逐条落地位置索引（供 PM/QA 对照）：
//   REQ-SEC-01  订阅 onLetter 消费字母流，全文无 input/textarea/contenteditable/回显 DOM。
//   REQ-SEC-02  onNewLetter() → tryMatchAtBufferTail()（子串/末尾命中总入口）。
//   REQ-SEC-03 / REQ-AST-04  handleHit() → showSpriteOverlay()（对象出现）+ playWordDefensive()（声音）。
//   REQ-SEC-04  tryMatchAtBufferTail() 用 buffer.endsWith(word)。
//   REQ-SEC-05  每个新字母只查一次末尾匹配 → 重叠但不重复触发。
//   REQ-SEC-06  匹配不含任何"连续重复字母打断"逻辑，双写天然放行。
//   REQ-SEC-07  roundHitSet 去重 → 首次 handleHit / 重复 handleMinorHit。
//   REQ-SEC-08  词池规模（约 100 词）属词池扩展卡范畴，本卡遍历 pool 数组，不写死具体词。
//   REQ-SEC-09  NORMALIZE()（caseInsensitive 时 toLowerCase）。
//   REQ-SEC-10  不同位置多次命中各自独立触发（末尾匹配按位置逐次判定）。
//   REQ-SEC-11  tryMatchAtBufferTail() 在多后缀同时命中时取最长（longestMatchPriority）。
// -----------------------------------------------------------------------

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 重复引入守卫（吸取 013 P1 教训）：本模块只应被引入一次。若脚本被重复引入，第二次执行
  // IIFE 若不短路，会再次调用 window.WTJ_KEYBOARD.onLetter(...) 注册第二个字母处理函数——
  // 而 window.WTJ_SECRET 因下方 defineProperty 不可写、仍指向「实例 1」，导致字母流被「实例
  // 2」消费、外部通过 window.WTJ_SECRET.onHit 注册的订阅者却挂在「实例 1」上，两者永不相遇
  // → 命中静默失效（无报错）。因此在任何接线副作用之前直接短路返回。
  // ---------------------------------------------------------------------
  if (window.WTJ_SECRET) {
    return;
  }

  // ---------------------------------------------------------------------
  // manifest 访问器：与 keyboard.js / task.js / app.js 同一模式（MANIFEST.md 建议后续模块
  // 变多时可提升为共享工具，本卡不做该重构）。缺失字段一律防御式回退到最小默认值并 warn。
  // ---------------------------------------------------------------------
  var DEFAULT_MANIFEST = {
    secretWords: {
      matchRules: {
        caseInsensitive: true,
        substringMatch: true,
        overlapTrigger: true,
        doubleLetterNoPenalty: true,
        sameWordRepeatMinorFeedbackOnly: true,
        longestMatchPriority: true,
        sequentialCompoundIndependentTriggers: true
      },
      pool: []
    },
    slots: { count: 5 }
  };

  function getManifest() {
    if (window.WTJ_MANIFEST) {
      return window.WTJ_MANIFEST;
    }
    console.warn('[WTJ_SECRET] window.WTJ_MANIFEST 未找到（manifest.js 未加载或加载失败），回退到内置最小默认值（空词池，引擎空转）。');
    return DEFAULT_MANIFEST;
  }

  var MANIFEST = getManifest();
  var SEC_CFG = (MANIFEST.secretWords) || DEFAULT_MANIFEST.secretWords;
  var MATCH_RULES = (SEC_CFG.matchRules) || DEFAULT_MANIFEST.secretWords.matchRules;

  function boolRule(name) {
    // matchRules 里的开关缺失时，回退到默认值（默认均为 true）。
    if (MATCH_RULES && typeof MATCH_RULES[name] === 'boolean') {
      return MATCH_RULES[name];
    }
    return DEFAULT_MANIFEST.secretWords.matchRules[name];
  }

  // 引擎**只真正消费这 3 个开关**（置 false 会改变行为）。matchRules 里其余 4 个开关
  // （substringMatch / overlapTrigger / doubleLetterNoPenalty / sequentialCompoundIndependent
  // Triggers）是本引擎"末尾/后缀逐字母命中"算法的**固有行为**，没有对应的 if 分支——置 false
  // 不会改变引擎行为，故此处**不读取**它们（仅作需求可追溯的声明性标注）。诚实说明见
  // app/web/secretword/SECRETWORD-API.md §3「开关消费诚实说明」A/B 两组（Fable 对抗评审 P2-1）。
  var CASE_INSENSITIVE = boolRule('caseInsensitive');
  var LONGEST_MATCH_PRIORITY = boolRule('longestMatchPriority');
  var SAME_WORD_REPEAT_MINOR = boolRule('sameWordRepeatMinorFeedbackOnly');

  var SLOT_COUNT =
    (MANIFEST.slots && typeof MANIFEST.slots.count === 'number' && MANIFEST.slots.count > 0) ?
      MANIFEST.slots.count :
      DEFAULT_MANIFEST.slots.count;

  // ---------------------------------------------------------------------
  // 词池：从 manifest 读，过滤非法条目；缓存每条的归一化 word 用于匹配（原 entry 保留供
  // spriteFile/audioFile 反查）。matching-word 与 entry 一一对应，长度供最长优先排序。
  // ---------------------------------------------------------------------
  function normalizeStr(s) {
    if (typeof s !== 'string') return '';
    return CASE_INSENSITIVE ? s.toLowerCase() : s;
  }

  var POOL = []; // [{ word: normalizedWord, entry: {word, spriteFile, audioFile} }, ...]
  (function buildPool() {
    var raw = (SEC_CFG && SEC_CFG.pool) || [];
    var i;
    for (i = 0; i < raw.length; i++) {
      var entry = raw[i];
      if (!entry || typeof entry.word !== 'string' || entry.word.length === 0) {
        console.warn('[WTJ_SECRET] 跳过非法词池条目（word 缺失或非字符串）：', entry);
        continue;
      }
      POOL.push({ word: normalizeStr(entry.word), entry: entry });
    }
  })();

  // rolling buffer 上限：最长 pool 词长度 * 2（留余量，避免无限增长），至少 8。
  var MAX_WORD_LEN = 0;
  (function computeMaxWordLen() {
    var i;
    for (i = 0; i < POOL.length; i++) {
      if (POOL[i].word.length > MAX_WORD_LEN) MAX_WORD_LEN = POOL[i].word.length;
    }
  })();
  var BUFFER_MAX = Math.max(MAX_WORD_LEN * 2, 8);

  // sprite 叠层一次性出现总时长（淡入 ~0.3s + 停留 + 淡出 ~0.4s ≈ 1.5s 主体，1900ms 为
  // 兜底移除时刻，略长于 CSS 动画，确保动画结束后节点一定被移除，不永久堆积）。
  var SPRITE_TOTAL_MS = 1900;

  // ---------------------------------------------------------------------
  // 状态
  // ---------------------------------------------------------------------
  var buffer = '';
  // 本轮已命中词集合（去重）。用 Object.create(null) 建**无原型**对象，避免词池扩展到约 100
  // 词后混入与 Object.prototype 同名的纯字母词（如 'constructor' / 'hasOwnProperty' /
  // 'toString'）时，roundHitSet[word] 误读到原型链上的方法引用而被当成"已命中" → 首次命中即
  // 被误判为同轮重复、永远只小反馈、永不出 sprite/占槽（静默 bug）。配合读取处的 `=== true`
  // 双保险（Fable 对抗评审 P2-2）。
  var roundHitSet = Object.create(null); // { normalizedWord: true }
  var roundHitOrder = []; // 本轮已命中词（按首次命中顺序），getRoundHits() 返回其快照
  // 本卡内部的"下一个待点亮空槽"游标——010（window.WTJ_SLOTS）接管点槽后，只在其 fillSlot
  // 委托路径不可用时的 fallback 分支（lightNextSlotFallback）里使用，委托路径下不再被读取。
  var secretSlotCursor = 0;

  // ---------------------------------------------------------------------
  // 订阅者管理：多订阅者数组 + 逐个 try/catch，防止下游回调抛错裸冒泡打断本引擎。
  // ---------------------------------------------------------------------
  var hitSubscribers = [];
  var minorHitSubscribers = [];

  function addSubscriber(list, fn) {
    if (typeof fn !== 'function') {
      console.warn('[WTJ_SECRET] 订阅回调必须是函数，已忽略此次注册。');
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
        console.error('[WTJ_SECRET] 订阅回调抛出异常，已捕获：', err);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 素材路径解析（见文件头「素材路径解析」一节）
  // ---------------------------------------------------------------------
  function resolveSpritePath(spriteFile) {
    if (typeof spriteFile !== 'string' || spriteFile.length === 0) return null;
    if (spriteFile.indexOf('assets/') === 0) return spriteFile;         // 已带前缀，穿透
    if (spriteFile.indexOf('sprites/') === 0) return 'assets/' + spriteFile; // 补 assets/ 前缀
    return spriteFile; // 其它形状原样透传，交给浏览器解析
  }

  // ---------------------------------------------------------------------
  // 秘密词完成音：恒定英文（WTJ-20260707-011 验收反馈②）
  // ---------------------------------------------------------------------
  // Ethan 最终验收反馈②：「通过键盘拼出秘密词后得到的标签/卡片/卡槽对象，其完成反馈发音固定
  // 使用英文单词音频，不受中文任务叙述设置影响。」
  //
  // 历史背景：WTJ-20260706-011 曾加入"语言感知词音"脚手架——当 WTJ_VOICE_LANG
  // .getEffectiveLanguage()==='zh' 且该词 ZH 已交付时改播 audio/words/<word>.zh.m4a。当时
  // ZH_AVAILABLE_WORD 台账是空数组、DEFAULT_MODE 也未默认 zh，故该分支 dormant、行为等价英文。
  // 但后续音频卡（008/011 秘密词 ZH 音）把 ZH_AVAILABLE_WORD 补成了完整 100 词台账、且
  // voice-language.js 的 DEFAULT_MODE 现为 'zh'——于是该分支变为**活跃**，默认中文叙述下每次
  // 秘密词命中都播中文词音，正是 Ethan 反馈的缺陷。
  //
  // 秘密词是孩子在 QWERTY 键盘上逐字母拼出的**英文**单词（dog/cat/apple…），其完成发音应恒定
  // 念英文单词本身，与"任务叙述语言"（中文/英文旁白）这个独立设置解耦。故本函数恒定返回英文
  // entry（entry.audioFile），不再查 WTJ_VOICE_LANG。任务叙述语言路径（voice-language.js
  // resolveTaskVoicePath / task-templates 的 FIND 学习词双语）是另一条独立链路，本改动不触及。
  // ---------------------------------------------------------------------
  function resolveWordAudioEntry(entry) {
    return entry;
  }

  // ---------------------------------------------------------------------
  // 防御式音效（吸取 013 P2 教训）：AUDIO-API 承诺 playWord 返回的 Promise「永不 reject」，
  // 但为了对不守约的替身/未来实现也稳健，给它挂一个 rejection handler，避免万一 reject 时
  // 冒出 unhandledrejection。用 then(null, fn) 而非 .catch()——Safari 14 两者都支持，此处
  // 与本文件其余写法保持不引入额外语法特性的一致性。
  // ---------------------------------------------------------------------
  function playWordDefensive(entry) {
    try {
      if (window.WTJ_AUDIO && typeof window.WTJ_AUDIO.playWord === 'function') {
        // 对象穿透式：直接把词条传进去，playWord 会用其 audioFile 字段（见 AUDIO-API.md）。
        // resolveWordAudioEntry() 现恒定返回英文 entry（WTJ-20260707-011 反馈②），故此处始终
        // 播英文单词音，不受任务叙述语言影响。
        var resolvedEntry = resolveWordAudioEntry(entry);
        var p = window.WTJ_AUDIO.playWord(resolvedEntry);
        if (p && typeof p.then === 'function') {
          p.then(null, function (err) {
            console.error('[WTJ_SECRET] window.WTJ_AUDIO.playWord 返回的 Promise 被 reject（AUDIO-API 契约本不应发生），已捕获：', err);
          });
        }
      }
    } catch (err) {
      console.error('[WTJ_SECRET] 调用 window.WTJ_AUDIO.playWord 失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // sprite 对象一次性叠层出现（REQ-SEC-03 / REQ-AST-04）：DOM img 叠加在画面上，CSS 驱动
  // 一次性淡入 → 停留 → 淡出，动画结束（或兜底定时器到时）后移除节点，不永久堆积。整个过程
  // 对 document 缺失（如单元测试沙箱不提供 document）完全防御式：拿不到 document 就静默跳过，
  // 不抛错、不影响 onHit 事件与音效等其余反馈。容器 pointer-events:none（样式在 secretword.css）。
  // ---------------------------------------------------------------------
  var overlayContainer = null;

  function ensureOverlayContainer() {
    if (overlayContainer && overlayContainer.parentNode) {
      return overlayContainer;
    }
    if (typeof document === 'undefined' || !document ||
        typeof document.createElement !== 'function' || !document.body ||
        typeof document.body.appendChild !== 'function') {
      return null;
    }
    var c = document.createElement('div');
    c.className = 'wtj-secret-overlay';
    if (typeof c.setAttribute === 'function') {
      c.setAttribute('aria-hidden', 'true');
    }
    document.body.appendChild(c);
    overlayContainer = c;
    return c;
  }

  function scheduleRemoval(removeFn) {
    // 用 setTimeout 兜底移除；在 Node 测试沙箱里返回的 Timeout 有 unref()，调用它避免定时器
    // 把测试进程挂住不退出（浏览器里 setTimeout 返回数字，无 unref，此判断自然跳过）。
    var t = null;
    try {
      t = setTimeout(removeFn, SPRITE_TOTAL_MS);
    } catch (err) {
      // 极端环境无 setTimeout：动画结束事件仍会兜底（若可用），否则最多多留一个节点，不抛错。
      return;
    }
    if (t && typeof t.unref === 'function') {
      t.unref();
    }
  }

  function showSpriteOverlay(spriteFile) {
    var spritePath = resolveSpritePath(spriteFile);
    if (!spritePath) return;
    var container = ensureOverlayContainer();
    if (!container) return; // 无 document / 无 body：静默跳过（不影响其它反馈）
    try {
      var img = document.createElement('img');
      img.className = 'wtj-secret-sprite';
      if (typeof img.setAttribute === 'function') {
        img.setAttribute('alt', '');
        img.setAttribute('aria-hidden', 'true');
      }
      var removed = false;
      function removeImg() {
        if (removed) return;
        removed = true;
        try {
          if (img.parentNode && typeof img.parentNode.removeChild === 'function') {
            img.parentNode.removeChild(img);
          }
        } catch (e) { /* 移除失败无所谓，最多多留一个节点 */ }
      }
      // 素材加载失败兜底（不用 onerror HTML 属性，改用 JS 事件监听）：加载失败时提前移除，
      // 不留一个破图占位；一次性动画结束（animationend）时也移除，二者以先到者为准。
      if (typeof img.addEventListener === 'function') {
        img.addEventListener('animationend', removeImg, false);
        img.addEventListener('error', removeImg, false);
      }
      img.src = spritePath;
      container.appendChild(img);
      scheduleRemoval(removeImg);
    } catch (err) {
      console.error('[WTJ_SECRET] 创建/挂载 sprite 叠层失败，已捕获：', err);
    }
  }

  // ---------------------------------------------------------------------
  // 五槽联动（REQ-SLOT-01 / REQ-SEC-07）：优先委托 010 的统一五槽状态机
  // window.WTJ_SLOTS.fillSlot('secret-word', { itemKey: word, renderState: { spriteUrl } })——
  // 由它负责跨"秘密词命中"与"008 键盘里程碑"两种来源的统一去重、槽位分配与满槽事件
  // （见 app/web/slots/SLOTS-API.md）。
  //
  // Fallback（WTJ_SLOTS 不可用时，如 slots.js 未加载/被移除，不视为回归）：退回本卡原有的
  // "内部游标 secretSlotCursor 直接点 WTJ_HUD.setSlot" 最小实现——只跟踪本文件自己点亮过的槽，
  // 不感知 008 键盘里程碑经由 WTJ_HUD.setSlot 独立点亮的槽，游标满后不再点亮（等 resetRound()
  // 开启新一轮）。防御式：WTJ_HUD 缺失/setSlot 抛错都不影响其它反馈。
  // ---------------------------------------------------------------------
  function lightNextSlotFallback(spriteFile) {
    if (secretSlotCursor >= SLOT_COUNT) return;
    var idx = secretSlotCursor;
    secretSlotCursor += 1;
    var spritePath = resolveSpritePath(spriteFile);
    try {
      if (window.WTJ_HUD && typeof window.WTJ_HUD.setSlot === 'function') {
        window.WTJ_HUD.setSlot(idx, { spriteUrl: spritePath });
      }
    } catch (err) {
      console.error('[WTJ_SECRET] 调用 window.WTJ_HUD.setSlot 失败，已捕获：', err);
    }
  }

  function lightNextSlot(word, spriteFile) {
    if (window.WTJ_SLOTS && typeof window.WTJ_SLOTS.fillSlot === 'function') {
      try {
        window.WTJ_SLOTS.fillSlot('secret-word', {
          itemKey: word,
          renderState: { spriteUrl: resolveSpritePath(spriteFile) }
        });
      } catch (err) {
        console.error('[WTJ_SECRET] 调用 window.WTJ_SLOTS.fillSlot 失败，已捕获：', err);
      }
      return;
    }
    lightNextSlotFallback(spriteFile);
  }

  // ---------------------------------------------------------------------
  // 命中处理
  // ---------------------------------------------------------------------
  function handleHit(poolItem) {
    var word = poolItem.word;
    var entry = poolItem.entry;
    var payload = { word: word, spriteFile: entry.spriteFile, audioFile: entry.audioFile };

    if (roundHitSet[word] === true) {
      // 本轮同词重复命中（REQ-SEC-07）。sameWordRepeatMinorFeedbackOnly 为 true → 只小反馈。
      // `=== true` 严格比较：即使 roundHitSet 意外带原型（非无原型对象），也只认本引擎写入的
      // 布尔真值，不被原型链上的方法引用误判（与无原型对象 Object.create(null) 双保险，P2-2）。
      if (SAME_WORD_REPEAT_MINOR) {
        emit(minorHitSubscribers, payload);
        return;
      }
      // 开关关闭时（如未来 A/B 测试）：退化为每次都大反馈，往下走完整命中流程。
    } else {
      roundHitSet[word] = true;
      roundHitOrder.push(word);
    }

    // 大反馈：事件广播 + 音效 + sprite 叠层 + 点亮下一空槽。
    emit(hitSubscribers, payload);
    playWordDefensive(entry);
    showSpriteOverlay(entry.spriteFile);
    lightNextSlot(word, entry.spriteFile);
  }

  // ---------------------------------------------------------------------
  // 匹配引擎：每来一个新字母调用一次。返回后 buffer 已含该字母（供 getBuffer 观察）。
  // ---------------------------------------------------------------------
  function tryMatchAtBufferTail() {
    // 找出 buffer 末尾恰好构成的 pool 词；多词同时命中（互为后缀）时按最长优先取一个。
    var best = null;
    var i;
    for (i = 0; i < POOL.length; i++) {
      var item = POOL[i];
      var w = item.word;
      if (w.length === 0 || w.length > buffer.length) continue;
      if (buffer.lastIndexOf(w) === buffer.length - w.length) {
        // buffer.endsWith(w) 的 ES2020 安全写法（endsWith 本身 Safari 14 亦支持，此处用
        // lastIndexOf 语义等价，避免对 endsWith 的任何顾虑，同时便于最长优先比较）。
        if (best === null) {
          best = item;
        } else if (LONGEST_MATCH_PRIORITY) {
          if (w.length > best.word.length) best = item;
        }
        // LONGEST_MATCH_PRIORITY 为 false 时保留第一个命中（较早遍历到的），不覆盖。
      }
    }
    if (best !== null) {
      handleHit(best);
    }
  }

  function onNewLetter(rawChar) {
    if (typeof rawChar !== 'string' || rawChar.length === 0) return;
    // 单字符归一化后追加（keyboard.js 送来的是单个大写字符；防御式对多字符也取归一化整串）。
    var chunk = normalizeStr(rawChar);
    buffer += chunk;
    if (buffer.length > BUFFER_MAX) {
      buffer = buffer.slice(buffer.length - BUFFER_MAX);
    }
    tryMatchAtBufferTail();
  }

  // ---------------------------------------------------------------------
  // 订阅键盘字母流（REQ-SEC-01：不建输入框，直接消费 onLetter 事件）
  // ---------------------------------------------------------------------
  (function wireKeyboard() {
    if (window.WTJ_KEYBOARD && typeof window.WTJ_KEYBOARD.onLetter === 'function') {
      window.WTJ_KEYBOARD.onLetter(onNewLetter);
    } else {
      console.warn('[WTJ_SECRET] window.WTJ_KEYBOARD.onLetter 不可用（keyboard.js 未加载或加载顺序在本文件之后），秘密词识别降级为空转（不监听字母流）。');
    }
  })();

  // ---------------------------------------------------------------------
  // 对外 API
  // ---------------------------------------------------------------------
  function onHit(fn) { addSubscriber(hitSubscribers, fn); }
  function onMinorHit(fn) { addSubscriber(minorHitSubscribers, fn); }

  function getRoundHits() {
    // 返回快照（值拷贝），外部修改不影响内部状态。
    return roundHitOrder.slice();
  }

  function resetRound() {
    roundHitSet = Object.create(null); // 同初始化：无原型对象，防同名词误读（P2-2）
    roundHitOrder = [];
    secretSlotCursor = 0;
    // WTJ-20260704-066 修复：rolling input buffer 也在轮次边界清空，新一轮从空 buffer 开始
    // 匹配——否则上一轮残留的半词前缀会与新一轮首批字母跨轮拼接，造成误命中（如残留 "do" +
    // 新轮 "g" → 误判命中 dog）。见文件顶部「轮次边界」一节的详细说明。
    buffer = '';
  }

  function getBuffer() {
    // 仅供测试/调试：返回内存 buffer 快照，本引擎从不把它写进任何可见 DOM（REQ-SEC-01）。
    return buffer;
  }

  var API = {
    onHit: onHit,
    onMinorHit: onMinorHit,
    getRoundHits: getRoundHits,
    resetRound: resetRound,
    getBuffer: getBuffer
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  // 绑定加固（与 task.js / audio.js 同款）：API 对象自身已 Object.freeze（属性不可增删改）；
  // 这里进一步把 window 上的 WTJ_SECRET 绑定设为不可写、不可重配置，防止整体重赋值
  // （window.WTJ_SECRET = 伪造对象）把引擎换掉。重复引入已由 IIFE 顶部守卫短路，走不到这里，
  // 因此到达时 window.WTJ_SECRET 必为未定义；下面判断只是二次保险（兼容无 defineProperty 环境）。
  if (!window.WTJ_SECRET && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_SECRET', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_SECRET) {
    window.WTJ_SECRET = API;
  }
})();
