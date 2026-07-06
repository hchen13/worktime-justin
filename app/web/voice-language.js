// WTJ-20260705-018 — 语言/任务语音模式设置（window.WTJ_VOICE_LANG）
//
// 语法基线：ES2020 以内（Safari 14 兼容）。只用 var/function，不用箭头函数 / let / const /
// 模板字符串 / 可选链 ?. / 空值合并 ??；零外部请求（不 fetch 任何东西，见下方"素材可用性
// 清单"一节——本文件不在运行时探测磁盘，靠随交付同步维护的静态清单）、非 module（无
// import/export），以普通 <script src="voice-language.js"> 标签加载，需在 task.js 之前
// （task.js 的 playTaskVoiceDefensive() 消费本文件的 resolveTaskVoicePath()）。
//
// -----------------------------------------------------------------------
// 背景（验收标准 #4，WTJ-20260705-018）
// -----------------------------------------------------------------------
// 设置里需要一个"语言/任务语音模式"切换：中文 / 英文 / 跟随素材可用性。当前磁盘上的真实
// 交付状态（见 app/web/audio/missing-audio.json 的 taskVoice / taskVoiceZh 两段 + 084/004
// 卡交付记录）：
//   - 中文（.zh.m4a）：24/24 任务全部交付（Phase B 004 已接线，manifest.js 当前默认值）。
//   - 英文（.m4a）：仅 8/24 任务交付（016/074 首批范围），find-the-cat/find-the-apple/
//     find-the-star/find-the-fish/find-the-elephant/find-the-pig/find-the-rocket/
//     find-the-turtle/find-the-unicorn/find-the-whale/find-the-zebra/press-b/press-s/
//     press-m/press-5/press-7 这 16 条尚无英文语音素材。
// no-silent-fallback 硬要求（验收标准 #4 原文）："某语言素材缺失必须明确禁用或提示,不能
// silent fallback"——因此"英文"选项在当前交付状态下必须在设置 UI 里被禁用并明确提示缺口
// （见 parent-controls.js 的设置面板渲染，读取本文件 getAvailability() 的结果），而不是让
// 家长选中"英文"后，缺素材的任务静默播放中文或完全无声却看起来"选择成功了"。
//
// -----------------------------------------------------------------------
// 素材可用性清单（ALL_TASK_IDS / EN_AVAILABLE_TASK_IDS）——维护约定
// -----------------------------------------------------------------------
// 与本仓库既有惯例一致（tts-audio-delivery.test.mjs 的硬编码计数门 101/8/10、
// task-voice-path.test.mjs 的 ===8 断言，见该文件顶部注释）：这两份 ID 清单是与
// audio/missing-audio.json + app/web/audio/tasks/ 磁盘目录人工同步维护的静态数据，不在
// 运行时探测文件系统（kiosk 生产环境的 wtjres:// 资源层用于按需加载单个音频文件已经足够，
// 没有"列目录"能力，也不应该为了这一个设置面板新增一种资源加载方式）。任何后续卡片新增/
// 补齐任务语音素材时，必须同步更新这里的两个数组，否则设置面板会展示过期的可用性判断——
// tests/unit/voice-language.test.mjs 有一条断言用磁盘真实文件核对这两份清单，交付新素材却
// 忘记同步会被测试当场抓到。
(function () {
  'use strict';

  var VERSION = '0.1.0';
  var CARD_ID = 'WTJ-20260705-018';

  var STORAGE_KEY = 'wtjVoiceLanguageMode';
  var DEFAULT_MODE = 'zh'; // 与 manifest.js 当前 24 条 example 的 voicePrompt 默认值（.zh.m4a）一致
  var VALID_MODES = ['zh', 'en', 'auto'];

  // 全部任务 id（与 app/web/manifest.js 的 tasks.templates.{drag,click,find,press}.examples
  // 及 task-templates.js 内置兜底样例并集一致，32 条：原 24 + 025 新增 8 条 ZH-only）。
  var ALL_TASK_IDS = [
    'drag-apple-to-basket', 'drag-dog-home',
    'click-lamp-on', 'click-faucet-on', 'click-horse-run',
    'find-the-dog', 'find-the-cat', 'find-the-apple', 'find-the-star',
    'find-the-fish', 'find-the-elephant', 'find-the-pig', 'find-the-rocket',
    'find-the-turtle', 'find-the-unicorn', 'find-the-whale', 'find-the-zebra',
    'press-a', 'press-3', 'press-b', 'press-s', 'press-m', 'press-5', 'press-7',
    // WTJ-20260705-024：025 新增 8 条任务的中文语音已由 CosyVoice3 交付（ZH-only，无 EN 版本，
    // 故不进 EN_AVAILABLE_TASK_IDS）。stem 即 example id（.zh.m4a 无 id/stem 错位）。
    'drag-egg-to-nest', 'drag-flower-to-vase', 'drag-orange-to-basket', 'drag-fish-to-net', 'drag-jam-to-jar', 'drag-treasure-to-chest', 'click-door-open', 'click-doorbell-ring'
  ];

  // 已交付英文 .m4a 的任务 id（8 条，见 audio/missing-audio.json 的 taskVoice 段落 + 磁盘
  // app/web/audio/tasks/*.m4a 现存文件；不含 .zh.m4a 后缀的那批）。
  var EN_AVAILABLE_TASK_IDS = [
    'drag-apple-to-basket', 'drag-dog-home',
    'click-lamp-on', 'click-faucet-on', 'click-horse-run',
    'find-the-dog', 'press-a', 'press-3'
  ];

  // 中文当前全量交付（24/24），若未来某次交付出现回退缺口，把对应 id 从这里移除即可让
  // getAvailability()/no-silent-fallback 判定如实反映真实缺口——不是恒为"全量"的占位符。
  var ZH_AVAILABLE_TASK_IDS = ALL_TASK_IDS.slice();

  function idSetFrom(list) {
    var set = {};
    for (var i = 0; i < list.length; i++) {
      set[list[i]] = true;
    }
    return set;
  }

  var EN_AVAILABLE_SET = idSetFrom(EN_AVAILABLE_TASK_IDS);
  var ZH_AVAILABLE_SET = idSetFrom(ZH_AVAILABLE_TASK_IDS);

  // ---------------------------------------------------------------------
  // 秘密词（words）语言可用性台账——WTJ-20260706-011（ZH 秘密词二期脚手架，第二片）
  // ---------------------------------------------------------------------
  // 与上面 TASK 台账同一约定，但方向相反：秘密词英文 .m4a 现在**全量交付**（100/100，见
  // app/web/audio/missing-audio.json secretWords[] 全部 status:"delivered"，磁盘
  // app/web/audio/words/*.m4a 现存 100 个文件），中文 .zh.m4a **尚未生成任何一条**（音频
  // 生成本身是 008 卡的范围，本卡只做不依赖生成音频的脚手架：ZH 文案 + missing-audio.json
  // 登记 + 本文件的台账 + secretword.js 的语言感知播放分支，全部 dormant/not-delivered）。
  // 因此这里只需要一份"哪些词的中文已交付"的台账（ZH_AVAILABLE_WORD），不需要像 TASK 那样
  // 两份都维护——英文永远可用，判定逻辑见 isWordZhAvailable()：不在这份清单里的词一律走
  // 英文，NO-SILENT 天然满足（从不构造/请求未交付的 .zh.m4a 路径）。
  //
  // ALL_WORD_IDS：与 app/web/manifest.js secretWords.pool[].word 完全一致的 100 词清单
  // （xylophone 已被 WTJ-20260706-011 从池中删除）。tests/unit/voice-language.test.mjs 有
  // 一条断言核对两者未漂移。
  var ALL_WORD_IDS = [
    'apple', 'ant', 'airplane', 'alligator',
    'ball', 'basket', 'bell', 'banana',
    'cat', 'car', 'cup', 'cake',
    'dog', 'door', 'duck', 'drum',
    'egg', 'elephant', 'eye', 'envelope',
    'fish', 'flower', 'frog', 'faucet',
    'goat', 'grapes', 'gift', 'guitar',
    'horse', 'hat', 'heart', 'house',
    'icecream', 'igloo', 'insect', 'island',
    'juice', 'jam', 'jar', 'jellyfish',
    'key', 'kite', 'koala', 'kettle',
    'lamp', 'leaf', 'lion', 'lemon',
    'moon', 'mouse', 'milk', 'monkey',
    'nest', 'nose', 'net', 'noodle',
    'orange', 'owl', 'octopus', 'oven',
    'pig', 'pear', 'pencil', 'pizza',
    'queen', 'quilt', 'quail', 'quarter',
    'rocket', 'robot', 'rainbow', 'ring',
    'star', 'sun', 'shoe', 'spoon',
    'treasure', 'tree', 'train', 'turtle',
    'umbrella', 'unicorn', 'ukulele', 'uniform',
    'van', 'vase', 'violin', 'volcano',
    'whale', 'watch', 'window', 'wagon',
    'fox',
    'yoyo', 'yarn', 'yak',
    'zebra', 'zipper', 'zucchini',
    'treasurechest'
  ];

  // ZH_AVAILABLE_WORD：中文秘密词已交付的 word 清单——WTJ-20260706-008（TTS 生成卡）确认
  // 后才会从这里开始逐个补齐（同步 app/web/audio/words/<word>.zh.m4a 落盘 + missing-audio
  // .json secretWordsZh[] 对应条目 status 改 "delivered"）。**当前必须是空数组**：这既是
  // 本卡的交付范围边界（011 不生成任何音频），也是本切片"零用户可见变化"的核心保证——只要
  // 这里是空的，secretword.js 的语言感知分支就恒定判定"这个词的中文不可用"，天然、无条件地
  // 回退到英文，效果与改动前逐字节相同（见 tests/unit/secretword-engine.test.mjs 新增用例
  // 与本文件 10. 号用例）。
  var ZH_AVAILABLE_WORD = [
    'apple', 'ant', 'airplane', 'alligator', 'ball', 'basket',
    'bell', 'banana', 'cat', 'car', 'cup', 'cake',
    'dog', 'door', 'duck', 'drum', 'egg', 'elephant',
    'eye', 'envelope', 'flower', 'frog', 'faucet', 'goat',
    'grapes', 'gift', 'guitar', 'hat', 'heart', 'house',
    'icecream', 'igloo', 'insect', 'juice', 'jam', 'jar',
    'jellyfish', 'key', 'kite', 'koala', 'kettle', 'lamp',
    'leaf', 'lion', 'lemon', 'moon', 'mouse', 'milk',
    'monkey', 'nest', 'nose', 'noodle', 'orange', 'owl',
    'octopus', 'oven', 'pencil', 'pizza', 'queen', 'quilt',
    'quarter', 'rocket', 'robot', 'rainbow', 'ring', 'star',
    'sun', 'shoe', 'spoon', 'treasure', 'train', 'turtle',
    'uniform', 'van', 'vase', 'violin', 'volcano', 'whale',
    'watch', 'window', 'wagon', 'fox', 'yoyo', 'yarn',
    'zebra'
  ];

  var ZH_AVAILABLE_WORD_SET = idSetFrom(ZH_AVAILABLE_WORD);

  // isWordZhAvailable(word)：给 secretword.js 用的最小查询接口——大小写/归一化由调用方负责
  // （与 pool 条目的 word 字段大小写约定一致，本文件不重复归一化逻辑）。空台账时对任何输入
  // 恒返回 false。
  function isWordZhAvailable(word) {
    return !!(typeof word === 'string' && ZH_AVAILABLE_WORD_SET[word] === true);
  }

  function warnOnce(message) {
    // 与 audio.js 同款轻量去重（避免同一诊断文案在长会话里被打印几十遍），但本文件独立维护
    // 自己的一份 seen 记录，不依赖/耦合 audio.js 的内部状态。
    if (warnOnce._seen[message]) return;
    warnOnce._seen[message] = true;
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(message);
    }
  }
  warnOnce._seen = {};

  // ---------------------------------------------------------------------
  // 持久化（localStorage——WKWebViewConfiguration 默认 persistent data store，
  // 随 app bundle 容器落盘，跨次启动保留；若环境不支持/被禁用，防御式退化为
  // 进程内内存变量，不抛错、不影响运行，只是重启后回到默认模式）。
  // ---------------------------------------------------------------------
  var memoryModeFallback = DEFAULT_MODE;

  function readStoredMode() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        var v = window.localStorage.getItem(STORAGE_KEY);
        if (v && VALID_MODES.indexOf(v) !== -1) {
          return v;
        }
      }
    } catch (err) {
      // Safari 隐私模式/沙箱限制等场景 localStorage 访问可能抛错，静默回退，不影响功能。
    }
    return null;
  }

  function writeStoredMode(mode) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, mode);
        return;
      }
    } catch (err) {
      // 同上，写入失败静默回退到内存变量。
    }
    memoryModeFallback = mode;
  }

  var currentMode = readStoredMode() || memoryModeFallback;

  // ---------------------------------------------------------------------
  // 可用性
  // ---------------------------------------------------------------------
  function computeAvailability(availableSet, totalIds) {
    var missing = [];
    for (var i = 0; i < totalIds.length; i++) {
      if (!availableSet[totalIds[i]]) {
        missing.push(totalIds[i]);
      }
    }
    return {
      deliveredCount: totalIds.length - missing.length,
      totalCount: totalIds.length,
      complete: missing.length === 0,
      missingIds: missing
    };
  }

  function getAvailability() {
    return {
      zh: computeAvailability(ZH_AVAILABLE_SET, ALL_TASK_IDS),
      en: computeAvailability(EN_AVAILABLE_SET, ALL_TASK_IDS)
    };
  }

  function isLanguageComplete(lang) {
    var avail = getAvailability();
    return !!(avail[lang] && avail[lang].complete);
  }

  // ---------------------------------------------------------------------
  // 模式 / 有效语言
  // ---------------------------------------------------------------------
  function getMode() {
    return currentMode;
  }

  // setMode(mode)：no-silent-fallback 守卫——'en'/'zh' 若素材不全一律拒绝并原样返回失败
  // 原因，绝不静默接受一个"看似成功、实则会在部分任务上悄悄用另一种语言顶替"的选择。
  // 'auto'（跟随素材可用性）恒可选，不存在"不完整"这个概念本身——它的定义就是"自动挑
  // 完整的那个"，见 getEffectiveLanguage()。
  function setMode(mode) {
    if (VALID_MODES.indexOf(mode) === -1) {
      warnOnce('WTJ_VOICE_LANG: setMode() 收到非法 mode "' + String(mode) + '"，已忽略。');
      return { ok: false, mode: currentMode, reason: 'invalid-mode' };
    }
    if ((mode === 'zh' || mode === 'en') && !isLanguageComplete(mode)) {
      var avail = getAvailability()[mode];
      warnOnce('WTJ_VOICE_LANG: 拒绝切换到 "' + mode + '"——素材不全（' + avail.deliveredCount +
        '/' + avail.totalCount + '），no-silent-fallback 禁止选中不完整语言。');
      return { ok: false, mode: currentMode, reason: 'incomplete-assets', availability: avail };
    }
    currentMode = mode;
    writeStoredMode(mode);
    return { ok: true, mode: currentMode };
  }

  // getEffectiveLanguage()：把 mode 折算成实际生效的具体语言（'zh'|'en'）。
  //   - mode 'zh' -> 'zh'（setMode 已保证选中时必然完整；即便外部绕过 setMode 直接改了
  //     localStorage 写入不完整的语言，这里仍以真实可用性为准而不是照单全收，双保险）。
  //   - mode 'en' -> 'en'（同上双保险）。
  //   - mode 'auto'（跟随素材可用性）：中文完整则用中文，否则若英文完整则用英文；两者都不
  //     完整时（理论边界情况，当前不会发生）保底用中文——保底选择本身仍会在
  //     resolveTaskVoicePath() 里对单个任务做二次可用性核实，不会因为"整体保底选了中文"就
  //     误以为每条任务都有中文素材。
  function getEffectiveLanguage() {
    if (currentMode === 'en') {
      return isLanguageComplete('en') ? 'en' : 'zh';
    }
    if (currentMode === 'auto') {
      if (isLanguageComplete('zh')) return 'zh';
      if (isLanguageComplete('en')) return 'en';
      return 'zh';
    }
    return 'zh';
  }

  // ---------------------------------------------------------------------
  // 路径推导 + 任务语音解析
  // ---------------------------------------------------------------------

  // 从 "audio/tasks/<id>.zh.m4a" 或 "audio/tasks/<id>.m4a" 两种既有命名约定之一，推出
  // { zh, en } 两条候选路径。当前 manifest.js/task-templates.js 里所有 voicePrompt 都已经是
  // 前一种形态（中文完整句，Phase B 004 接线），但保留对后一种形态的兼容判断，防止未来若某
  // 任务的权威 voicePrompt 改回英文命名时本函数仍能正确工作。
  function deriveVoicePaths(voicePromptPath) {
    var zhMatch = /^(.*)\.zh\.m4a$/i.exec(voicePromptPath);
    if (zhMatch) {
      return { zh: voicePromptPath, en: zhMatch[1] + '.m4a' };
    }
    var enMatch = /^(.*)\.m4a$/i.exec(voicePromptPath);
    if (enMatch) {
      return { zh: enMatch[1] + '.zh.m4a', en: voicePromptPath };
    }
    // 既不匹配也未知：原样两个语言都退回同一个字符串（不臆造后缀），交给 audio.js 自己的
    // 缺失诊断处理，不在本文件里过度猜测。
    return { zh: voicePromptPath, en: voicePromptPath };
  }

  // 从 voicePrompt **路径**（不是 taskDef.id！见下方大段说明）里取出 EN_AVAILABLE_SET /
  // ZH_AVAILABLE_SET 查找用的 key。取不出来就原样返回整个字符串（查不到即视为"不在已知
  // 清单里"，见 resolveTaskVoicePath 的兜底分支）。
  //
  // 为什么必须从 voicePrompt 路径推导、不能用 taskDef.id：manifest.js 的 press 类任务里，
  // taskDef.id（如 "press-letter-a" "press-digit-3"）与其语音文件 stem（"press-a"
  // "press-3"）历来就允许不一致——这是 078 卡明确记录、task-voice-path.test.mjs 有专项
  // 断言覆盖的既有设计（"id 与 voicePrompt 文件名 stem 本就不一致"）。ALL_TASK_IDS /
  // EN_AVAILABLE_TASK_IDS / ZH_AVAILABLE_TASK_IDS 三份清单统一按"语音文件 stem"编目（与磁盘
  // 上 audio/tasks/*.m4a 的真实文件名一一对应），如果这里改用 taskDef.id 去查，会把全部 7 条
  // press 类任务都误判成"未知任务"进而拒绝播放——tests/unit/voice-language.test.mjs 用例 9a
  // 用真实 manifest.js 数据核对过这一点。
  function extractTaskId(voicePromptPath) {
    if (typeof voicePromptPath !== 'string') return null;
    var m = /([^\/]+?)(\.zh)?\.m4a$/i.exec(voicePromptPath);
    return m ? m[1] : voicePromptPath;
  }

  function extractVoicePrompt(taskDefOrPath) {
    if (typeof taskDefOrPath === 'string') {
      return taskDefOrPath;
    }
    if (taskDefOrPath && typeof taskDefOrPath === 'object') {
      return taskDefOrPath.voicePrompt || taskDefOrPath.path || null;
    }
    return null;
  }

  // resolveTaskVoicePath(taskDefOrPath)：按当前生效语言解析出该播放的实际路径。
  // 入参可以是 task.js 的 taskDef 对象（{id, voicePrompt, ...}）或裸路径字符串，与
  // audio.js.playTaskVoice() 的入参形状保持同一套约定，方便调用方直接传同一个值。
  //
  // no-silent-fallback（防御分支，正常情况下不会触发——'en' 模式只有在 isLanguageComplete
  // 时才可能被 setMode 接受，见上方）：若 getEffectiveLanguage() 判定为 'en'，但**这一条
  // 具体任务**在 EN_AVAILABLE_SET 里查不到（理论上不该发生，除非 setMode 被绕过直接写
  // localStorage），明确 warnOnce 记录缺口并返回 null（不播放任何声音），而不是悄悄改播
  // 中文——调用方（task.js）在收到 null 时应保持沉默而不是自行再回退到 taskDef.voicePrompt
  // 播放中文，否则又制造出一次新的静默语言顶替。
  function resolveTaskVoicePath(taskDefOrPath) {
    var voicePrompt = extractVoicePrompt(taskDefOrPath);
    if (!voicePrompt) return null;

    var lang = getEffectiveLanguage();
    var paths = deriveVoicePaths(voicePrompt);
    // 必须从 voicePrompt 路径本身推导 taskId，不能用 taskDefOrPath.id——见 extractTaskId()
    // 顶部的详细说明（press 类任务 id 与语音文件 stem 历来不一致）。
    var taskId = extractTaskId(voicePrompt);

    if (lang === 'en') {
      if (taskId && EN_AVAILABLE_SET[taskId]) {
        return paths.en;
      }
      warnOnce('WTJ_VOICE_LANG: 当前语言模式为 "en"，但任务 "' + String(taskId) +
        '" 无英文语音素材——no-silent-fallback：拒绝静默改播中文，本次不播放任何任务语音。');
      return null;
    }

    // lang === 'zh'（含 auto 折算到 zh 的情形）
    if (taskId && ZH_AVAILABLE_SET[taskId]) {
      return paths.zh;
    }
    warnOnce('WTJ_VOICE_LANG: 当前语言模式为 "zh"，但任务 "' + String(taskId) +
      '" 无中文语音素材——no-silent-fallback：拒绝静默改播英文，本次不播放任何任务语音。');
    return null;
  }

  // ---------------------------------------------------------------------
  // 冻结导出
  // ---------------------------------------------------------------------
  var API = {
    VERSION: VERSION,
    CARD_ID: CARD_ID,

    getMode: getMode,
    setMode: setMode,
    getEffectiveLanguage: getEffectiveLanguage,
    getAvailability: getAvailability,
    resolveTaskVoicePath: resolveTaskVoicePath,

    // QA / 测试内省：清单本身不参与运行时决策以外的用途，暴露出来只为了让
    // tests/unit/voice-language.test.mjs 能对照磁盘真实文件核对没有漂移。
    getAllTaskIds: function () { return ALL_TASK_IDS.slice(); },
    getEnAvailableTaskIds: function () { return EN_AVAILABLE_TASK_IDS.slice(); },
    getZhAvailableTaskIds: function () { return ZH_AVAILABLE_TASK_IDS.slice(); },

    // 秘密词（words）语言可用性——WTJ-20260706-011。isWordZhAvailable() 供 secretword.js
    // 消费；getAllWordIds()/getZhAvailableWordIds() 供测试内省（与上面 TASK 三个 getter 同
    // 一用途，不参与运行时播放决策）。
    isWordZhAvailable: isWordZhAvailable,
    getAllWordIds: function () { return ALL_WORD_IDS.slice(); },
    getZhAvailableWordIds: function () { return ZH_AVAILABLE_WORD.slice(); }
  };

  if (Object.freeze) {
    Object.freeze(API);
  }

  if (!window.WTJ_VOICE_LANG && Object.defineProperty) {
    Object.defineProperty(window, 'WTJ_VOICE_LANG', {
      value: API,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else if (!window.WTJ_VOICE_LANG) {
    window.WTJ_VOICE_LANG = API;
  }
})();
