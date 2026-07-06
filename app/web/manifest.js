// WTJ-20260704-004 — 产品数据模型 / 参数表 / 运行 manifest
//
// 语法基线：ES2020 以内（Safari 14 兼容）。非 module（无 import/export），
// 以普通 <script src="manifest.js"> 标签在 app.js 之前加载，暴露 window.WTJ_MANIFEST。
// 不用 JSON + fetch：file:// 直接双击打开时会被 CORS 拦截（见 docs/index.html 工程约束）。
//
// 数值来源单一参照：docs/index.html（需求文档 v0.1，卡 WTJ-20260703-002）
// 尤其 #params「参数与阈值总表」，逐条对照后落地于此。
// 每个配置项在其上方用注释标注对应 REQ ID，供 QA 对照 docs/index.html #coverage 核对。
// 少数字段（功能键衰减曲线、拖拽弹性、性能红线等）文档只给定性描述或数值不在文档内，
// 这些字段用 note 字段明确标注来源，不冒充为文档给出的精确数值。
//
// 原则：改 manifest 不改代码。新增词池条目、调整阈值、替换素材路径，优先编辑本文件。
// 各后续模块如何消费本文件、命名约定、新增词池步骤、素材路径契约，见 app/web/MANIFEST.md。

(function () {
  'use strict';

  // 深冻结：防止运行时被意外改写（含嵌套对象与数组）。
  function deepFreeze(obj) {
    if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
      return obj;
    }
    if (Object.isFrozen(obj)) {
      return obj;
    }
    Object.getOwnPropertyNames(obj).forEach(function (key) {
      deepFreeze(obj[key]);
    });
    return Object.freeze(obj);
  }

  var MANIFEST = {

    // =====================================================================
    // meta
    // =====================================================================
    meta: {
      version: '0.1.0', // manifest 自身版本，首次交付（卡 WTJ-20260704-004）
      card: 'WTJ-20260704-004',
      sourceDoc: 'docs/index.html v0.1', // 数值单一参照来源
      sourceDocReqCoverage: 'REQ-DEF-01 ~ REQ-DESK-05（共 66 条，见 docs/index.html #coverage 需求覆盖矩阵）',
      generatedAt: '2026-07-04'
    },

    // =====================================================================
    // keyboard —— 对应 docs/index.html #keyboard（域码 KB，REQ-KB-01 ~ 09）
    // =====================================================================
    keyboard: {
      // REQ-KB-01 / REQ-KB-02：每按一个普通字母/数字，屏幕随机位置弹出该字母；
      // 颜色/大小/旋转/位置可变，但必须深色背景高对比可读。
      normalKeyPopup: {
        reqIds: ['REQ-KB-01', 'REQ-KB-02'],
        randomPosition: true,
        randomColor: true,
        randomSize: true,
        randomRotation: true,
        highContrastOnDarkBg: true
      },

      // REQ-KB-03：出现方式是"啪"一下弹出，然后约 0.8-1.5 秒逐渐淡出（毫秒区间，供随机取值）。
      letterFadeMsRange: [800, 1500],

      // REQ-KB-04：字母建议用 SVG / Canvas / HTML text 动态生成，不为每种颜色准备贴图。
      renderMethod: 'canvas-text', // 当前实现（app.js）用 Canvas2D fillText

      // REQ-KB-05：空格、回车可以有轻微波纹或弹跳；Command/Option/Control/Shift 反馈很弱或不计奖励。
      functionKeys: {
        reqIds: ['REQ-KB-05'],
        lightFeedback: ['Space', 'Enter'],
        // KeyboardEvent.key 命名，Meta = Command。WTJ-20260705-002 追加 Escape/Tab/F1~F12——
        // 这些同样是"操作性"而非"探索性"按键，理应与 Meta/Alt/Control/Shift 一样归入弱反馈/
        // 不计奖励，而不是落进未分类的 'other'（此前会被当作标点/方向键同款中性反馈处理，
        // 强度偏高且会被计入 002 卡新增的标点弹出通道——见 keyboard.js handleFunctionKey()）。
        weakOrNoReward: [
          'Meta', 'Alt', 'Control', 'Shift',
          'Escape', 'Tab',
          'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
        ]
      },

      // REQ-KB-06：连续乱按功能键，反馈快速衰减到几乎没有。
      // 文档仅定性描述"快速衰减"，未给出具体衰减曲线数值参数；此处为结构占位，
      // 由 008 键盘引擎卡实现时补充具体常量，不视为文档给出的精确值。
      functionKeyMashDecay: {
        reqIds: ['REQ-KB-06'],
        curve: 'fast-decay-placeholder',
        note: '文档仅定性描述，无具体数值；由 008 键盘引擎卡落地时补充。'
      },

      // REQ-KB-07：长按一个键不持续计数（依赖 keydown repeat 事件去重实现，非数值参数）。
      longPressDoesNotRepeatCount: true,

      // REQ-KB-08：连续重复同一个键超过 3 次后暂停计数；换键后再切回来可以重新计数。
      repeatSameKey: {
        reqIds: ['REQ-KB-08'],
        pauseAfterCount: 3, // 连续 >3 次（即第 4 次起）暂停计数
        resumesOnKeyChange: true
      },

      // REQ-KB-09：正常双写例外，例如连续输入 apple 中的 pp 不会被判定为过度重复（见 REQ-KB-08）。
      doubleLetterException: {
        reqIds: ['REQ-KB-09'],
        enabled: true,
        note: '连续重复同键计数需结合正在输入的秘密词候选子串判断，词内双写（如 apple 的 pp）不触发 REQ-KB-08 的暂停规则。'
      },

      // REQ-SLOT-03：五槽来源之一——自由探索里程碑，累计有效按键数达到下列阈值之一即点亮一槽。
      // 阈值实际数值落在本处，slots 域通过 sources 枚举 'keyboard-milestone' 引用，不重复定义。
      effectiveKeyMilestones: [100, 200]
    },

    // =====================================================================
    // secretWords —— 对应 docs/index.html #secret（域码 SEC，REQ-SEC-01 ~ 11）
    // =====================================================================
    secretWords: {
      // REQ-SEC-02：命中判定总述——输入字母流中出现完整暗语子串即视为命中；具体边界规则见下方各开关。
      // 以下开关均来自「命中判定规则」子块（PM 已裁决 2026-07-04）。
      matchRules: {
        // REQ-SEC-01：系统监听最近的普通英文字母流，不要求输入框，也不要求回车。
        listensRawLetterStream: true,
        // REQ-SEC-04：子串命中，输入流中任意连续子串包含完整暗语即触发（如 xxdogxx 命中 dog）。
        substringMatch: true,
        // REQ-SEC-05：重叠触发，如 dogg 在输入到第三个字母 g 时即触发 dog，无需等待独立分隔。
        overlapTrigger: true,
        // REQ-SEC-06：双写不惩罚，词内重复字母不影响暗语子串匹配（如 apple 中的 pp）。
        doubleLetterNoPenalty: true,
        // REQ-SEC-07：同一个词在同一轮内重复命中，只给小反馈，不再点亮新的发现槽。
        sameWordRepeatMinorFeedbackOnly: true,
        // REQ-SEC-09：大小写等价，DOG / Dog / dog 均判定为命中同一暗语。
        caseInsensitive: true,
        // REQ-SEC-10：复合输入顺序命中，如输入 hotdog 过程中可先命中 hot、后命中 dog，两次各自独立触发。
        sequentialCompoundIndependentTriggers: true,
        // REQ-SEC-11：最长词优先，同一时刻多个后缀同时构成命中时，取最长词优先触发。
        longestMatchPriority: true
      },

      // REQ-SEC-08：第一阶段按 26 个字母、每个字母约 4 个儿童英语常见词组织，目标约 100 个词；
      // X / Y / Z 这类难字母可减少数量或选择学习场景里常见词。
      poolTargetSize: 100,
      poolTargetPerLetter: 4,
      // REQ-SEC-03：出现对象——命中后同时出现对应物体（spriteFile）并播放授权音效或预生成语音
      // （audioFile）。下方 pool 数组的 word/spriteFile/audioFile 三字段即对应本条的落地结构。
      //
      // 词池扩展记录（本卡 WTJ-20260704-019 第二批，2026-07-04）：pool 已从"首批 8 词"
      // 同步扩展到 Pack B 生产词池（卡 WTJ-20260704-006，源 docs/assets/production-pack-b/
      // manifest.json + missing-assets.json）。Pack B 曾是活数据源、DESIGN 分批补齐 stub，现已
      // **全部产出完毕**——现场核对以两个 json 的 updated_at_cst 2026-07-04 10:58 版本为准：
      // target_word_count=100、production_ready_count=100、stubbed_pending_count=0（卡
      // WTJ-20260704-054 补齐最后 Z 组 zebra/zipper/zucchini，PM 已验收）。下方 pool 共 101 条，
      // **全部 ready、无 spriteStub**：Pack B 的 100 词（100 条 ready，每词 spriteFile 指向真实
      // sprite）+ 1 条非 Pack B 的遗留词 treasurechest（复用已验收 treasure-chest.png，见下方说明）。
      // 曾用于 stub 占位的共享图 sprites/secret-word-placeholder.png 现已无 pool 条目引用，作为
      // "未来若有新 stub 词可复用"的备用素材保留在 app/web/assets/sprites/，不被运行时加载。
      //
      // 已知差异（据实记录，不在本卡自行裁决）：docs/index.html #secret 词池规模段落下方给出的示例词
      // 标签是 dog / cat / apple / ball / moon / star / car / zoo（8 个，仅作规模示意，覆盖不同字母）。
      // Pack B 100 词已覆盖 dog / cat / apple / ball / star / car / basket（moon 词已在 Pack B M 组
      // 补齐为正式秘密词；zoo 仍未补齐，Pack B 未提供对应词）。这 7 个词与"首批 8 词"最初
      // 已验收的 v3 baseline sprite（卡 WTJ-20260703-007，REQ-AST-12）同名，但 Pack B 对它们
      // 重新生成了一版不同的 sprite（md5 与 v3 baseline 不同，已现场核对）——本卡按"以已验收为准，
      // 避免重复/冲突"原则，这 7 词继续复用已验收并已被 009 测试覆盖的 v3 baseline sprite 文件，
      // 不切换成 Pack B 重生成版（Pack B 版未拷贝进运行时，仅停留在 docs/assets/production-pack-b/
      // sprites/），下方各条目已用行内注释标注。
      //
      // treasurechest（101st，非 Pack B 词）：遗留自 004/009 首批 8 词基线，Pack B 100 词范围内
      // 用的是不同的词 treasure（T 组，含义相近但字面不同，各自独立词条、互不冲突，均已入池）。
      // treasurechest 对应的 sprite（treasure-chest.png）在 docs/index.html 素材章节原本对应的是
      // REQ-AST-06（宝箱），而非 REQ-AST-04（秘密词对应物体），且不在 Pack B 的 100 词正式清单内。
      // 本卡不删除这个已存在两个批次（004/009、016）都引用过的词（audio/missing-audio.json 已把它
      // 登记为 additionalManifestOnlyWords: 1、totalNotDelivered 101 的一部分，删除会与该清单的
      // 既有口径不一致），仅在此如实记录，请 PM / DESIGN 后续裁决是否正式保留 treasurechest 为
      // 秘密词，或改回任务专用素材。
      pool: [
        // --- A ---
        { word: 'apple', spriteFile: 'sprites/apple.png', audioFile: 'audio/words/apple.m4a' }, // Pack B ready。沿用已验收 v3 baseline sprite（非 Pack B 重生成版，避免重复/冲突，见 PROVENANCE）
        { word: 'ant', spriteFile: 'sprites/ant.png', audioFile: 'audio/words/ant.m4a' }, // Pack B ready（ready-v1）
        { word: 'airplane', spriteFile: 'sprites/airplane.png', audioFile: 'audio/words/airplane.m4a' }, // Pack B ready（ready-v1）
        { word: 'alligator', spriteFile: 'sprites/alligator.png', audioFile: 'audio/words/alligator.m4a' }, // Pack B ready（batch-02）
        // --- B ---
        { word: 'ball', spriteFile: 'sprites/ball.png', audioFile: 'audio/words/ball.m4a' }, // Pack B ready。沿用已验收 v3 baseline sprite（非 Pack B 重生成版，避免重复/冲突，见 PROVENANCE）
        { word: 'basket', spriteFile: 'sprites/basket.png', audioFile: 'audio/words/basket.m4a' }, // Pack B ready。沿用已验收 v3 baseline sprite（非 Pack B 重生成版，避免重复/冲突，见 PROVENANCE）
        { word: 'bell', spriteFile: 'sprites/bell.png', audioFile: 'audio/words/bell.m4a' }, // Pack B ready（ready-v1）
        { word: 'banana', spriteFile: 'sprites/banana.png', audioFile: 'audio/words/banana.m4a' }, // Pack B ready（ready-v1）
        // --- C ---
        { word: 'cat', spriteFile: 'sprites/cat.png', audioFile: 'audio/words/cat.m4a' }, // Pack B ready。沿用已验收 v3 baseline sprite（非 Pack B 重生成版，避免重复/冲突，见 PROVENANCE）
        { word: 'car', spriteFile: 'sprites/car.png', audioFile: 'audio/words/car.m4a' }, // Pack B ready。沿用已验收 v3 baseline sprite（非 Pack B 重生成版，避免重复/冲突，见 PROVENANCE）
        { word: 'cup', spriteFile: 'sprites/cup.png', audioFile: 'audio/words/cup.m4a' }, // Pack B ready（ready-v1）
        { word: 'cake', spriteFile: 'sprites/cake.png', audioFile: 'audio/words/cake.m4a' }, // Pack B ready（ready-v1）
        // --- D ---
        { word: 'dog', spriteFile: 'sprites/dog.png', audioFile: 'audio/words/dog.m4a' }, // Pack B ready。沿用已验收 v3 baseline sprite（非 Pack B 重生成版，避免重复/冲突，见 PROVENANCE）
        { word: 'door', spriteFile: 'sprites/door.png', audioFile: 'audio/words/door.m4a' }, // Pack B ready（ready-v1）
        { word: 'duck', spriteFile: 'sprites/duck.png', audioFile: 'audio/words/duck.m4a' }, // Pack B ready（ready-v1）
        { word: 'drum', spriteFile: 'sprites/drum.png', audioFile: 'audio/words/drum.m4a' }, // Pack B ready（ready-v1）
        // --- E ---
        { word: 'egg', spriteFile: 'sprites/egg.png', audioFile: 'audio/words/egg.m4a' }, // Pack B ready（ready-v1）
        { word: 'elephant', spriteFile: 'sprites/elephant.png', audioFile: 'audio/words/elephant.m4a' }, // Pack B ready（ready-v1）
        { word: 'eye', spriteFile: 'sprites/eye.png', audioFile: 'audio/words/eye.m4a' }, // Pack B ready（batch-02）
        { word: 'envelope', spriteFile: 'sprites/envelope.png', audioFile: 'audio/words/envelope.m4a' }, // Pack B ready（batch-02）
        // --- F ---
        { word: 'fish', spriteFile: 'sprites/fish.png', audioFile: 'audio/words/fish.m4a' }, // Pack B ready（ready-v1）
        { word: 'flower', spriteFile: 'sprites/flower.png', audioFile: 'audio/words/flower.m4a' }, // Pack B ready（ready-v1）
        { word: 'frog', spriteFile: 'sprites/frog.png', audioFile: 'audio/words/frog.m4a' }, // Pack B ready（ready-v1）
        { word: 'faucet', spriteFile: 'sprites/faucet.png', audioFile: 'audio/words/faucet.m4a' }, // Pack B ready（ready-v1）
        // --- G ---
        { word: 'goat', spriteFile: 'sprites/goat.png', audioFile: 'audio/words/goat.m4a' }, // Pack B ready（batch-02）
        { word: 'grapes', spriteFile: 'sprites/grapes.png', audioFile: 'audio/words/grapes.m4a' }, // Pack B ready（ready-v1）
        { word: 'gift', spriteFile: 'sprites/gift.png', audioFile: 'audio/words/gift.m4a' }, // Pack B ready（batch-02）
        { word: 'guitar', spriteFile: 'sprites/guitar.png', audioFile: 'audio/words/guitar.m4a' }, // Pack B ready（batch-02）
        // --- H ---
        { word: 'horse', spriteFile: 'sprites/horse.png', audioFile: 'audio/words/horse.m4a' }, // Pack B ready（ready-v1）
        { word: 'hat', spriteFile: 'sprites/hat.png', audioFile: 'audio/words/hat.m4a' }, // Pack B ready（ready-v1）
        { word: 'heart', spriteFile: 'sprites/heart.png', audioFile: 'audio/words/heart.m4a' }, // Pack B ready（ready-v1）
        { word: 'house', spriteFile: 'sprites/house.png', audioFile: 'audio/words/house.m4a' }, // Pack B ready（batch-02）
        // --- I ---
        { word: 'icecream', spriteFile: 'sprites/icecream.png', audioFile: 'audio/words/icecream.m4a' }, // Pack B ready（ready-v1）
        { word: 'igloo', spriteFile: 'sprites/igloo.png', audioFile: 'audio/words/igloo.m4a' }, // Pack B ready（batch-02）
        { word: 'insect', spriteFile: 'sprites/insect.png', audioFile: 'audio/words/insect.m4a' }, // Pack B ready（batch-02）
        { word: 'island', spriteFile: 'sprites/island.png', audioFile: 'audio/words/island.m4a' }, // Pack B ready（batch-02）
        // --- J ---
        { word: 'juice', spriteFile: 'sprites/juice.png', audioFile: 'audio/words/juice.m4a' }, // Pack B ready（batch-02）
        { word: 'jam', spriteFile: 'sprites/jam.png', audioFile: 'audio/words/jam.m4a' }, // Pack B ready（batch-02）
        { word: 'jar', spriteFile: 'sprites/jar.png', audioFile: 'audio/words/jar.m4a' }, // Pack B ready（batch-02）
        { word: 'jellyfish', spriteFile: 'sprites/jellyfish.png', audioFile: 'audio/words/jellyfish.m4a' }, // Pack B ready（batch-02）
        // --- K ---
        { word: 'key', spriteFile: 'sprites/key.png', audioFile: 'audio/words/key.m4a' }, // Pack B ready（ready-v1）
        { word: 'kite', spriteFile: 'sprites/kite.png', audioFile: 'audio/words/kite.m4a' }, // Pack B ready（ready-v1）
        { word: 'koala', spriteFile: 'sprites/koala.png', audioFile: 'audio/words/koala.m4a' }, // Pack B ready（batch-02）
        { word: 'kettle', spriteFile: 'sprites/kettle.png', audioFile: 'audio/words/kettle.m4a' }, // Pack B ready（batch-02）
        // --- L ---
        { word: 'lamp', spriteFile: 'sprites/lamp.png', audioFile: 'audio/words/lamp.m4a' }, // Pack B ready（ready-v1）
        { word: 'leaf', spriteFile: 'sprites/leaf.png', audioFile: 'audio/words/leaf.m4a' }, // Pack B ready（ready-v1）
        { word: 'lion', spriteFile: 'sprites/lion.png', audioFile: 'audio/words/lion.m4a' }, // Pack B ready（batch-02）
        { word: 'lemon', spriteFile: 'sprites/lemon.png', audioFile: 'audio/words/lemon.m4a' }, // Pack B ready（batch-02）
        // --- M ---
        { word: 'moon', spriteFile: 'sprites/moon.png', audioFile: 'audio/words/moon.m4a' }, // Pack B ready（ready-v1）
        { word: 'mouse', spriteFile: 'sprites/mouse.png', audioFile: 'audio/words/mouse.m4a' }, // Pack B ready（ready-v1）
        { word: 'milk', spriteFile: 'sprites/milk.png', audioFile: 'audio/words/milk.m4a' }, // Pack B ready（batch-02）
        { word: 'monkey', spriteFile: 'sprites/monkey.png', audioFile: 'audio/words/monkey.m4a' }, // Pack B ready（batch-02）
        // --- N ---
        { word: 'nest', spriteFile: 'sprites/nest.png', audioFile: 'audio/words/nest.m4a' }, // Pack B ready（batch-02）
        { word: 'nose', spriteFile: 'sprites/nose.png', audioFile: 'audio/words/nose.m4a' }, // Pack B ready（batch-02）
        { word: 'net', spriteFile: 'sprites/net.png', audioFile: 'audio/words/net.m4a' }, // Pack B ready（batch-02）
        { word: 'noodle', spriteFile: 'sprites/noodle.png', audioFile: 'audio/words/noodle.m4a' }, // Pack B ready（batch-02）
        // --- O ---
        { word: 'orange', spriteFile: 'sprites/orange.png', audioFile: 'audio/words/orange.m4a' }, // Pack B ready（ready-v1）
        { word: 'owl', spriteFile: 'sprites/owl.png', audioFile: 'audio/words/owl.m4a' }, // Pack B ready（batch-03）
        { word: 'octopus', spriteFile: 'sprites/octopus.png', audioFile: 'audio/words/octopus.m4a' }, // Pack B ready（batch-03）
        { word: 'oven', spriteFile: 'sprites/oven.png', audioFile: 'audio/words/oven.m4a' }, // Pack B ready（batch-03）
        // --- P ---
        { word: 'pig', spriteFile: 'sprites/pig.png', audioFile: 'audio/words/pig.m4a' }, // Pack B ready（ready-v1）
        { word: 'pear', spriteFile: 'sprites/pear.png', audioFile: 'audio/words/pear.m4a' }, // Pack B ready（batch-03）
        { word: 'pencil', spriteFile: 'sprites/pencil.png', audioFile: 'audio/words/pencil.m4a' }, // Pack B ready（batch-03）
        { word: 'pizza', spriteFile: 'sprites/pizza.png', audioFile: 'audio/words/pizza.m4a' }, // Pack B ready（batch-03）
        // --- Q ---
        { word: 'queen', spriteFile: 'sprites/queen.png', audioFile: 'audio/words/queen.m4a' }, // Pack B ready（batch-03）
        { word: 'quilt', spriteFile: 'sprites/quilt.png', audioFile: 'audio/words/quilt.m4a' }, // Pack B ready（batch-03）
        { word: 'quail', spriteFile: 'sprites/quail.png', audioFile: 'audio/words/quail.m4a' }, // Pack B ready（batch-03）
        { word: 'quarter', spriteFile: 'sprites/quarter.png', audioFile: 'audio/words/quarter.m4a' }, // Pack B ready（batch-03）
        // --- R ---
        { word: 'rocket', spriteFile: 'sprites/rocket.png', audioFile: 'audio/words/rocket.m4a' }, // Pack B ready（ready-v1）
        { word: 'robot', spriteFile: 'sprites/robot.png', audioFile: 'audio/words/robot.m4a' }, // Pack B ready（batch-03）
        { word: 'rainbow', spriteFile: 'sprites/rainbow.png', audioFile: 'audio/words/rainbow.m4a' }, // Pack B ready（batch-03）
        { word: 'ring', spriteFile: 'sprites/ring.png', audioFile: 'audio/words/ring.m4a' }, // Pack B ready（batch-03）
        // --- S ---
        { word: 'star', spriteFile: 'sprites/star.png', audioFile: 'audio/words/star.m4a' }, // Pack B ready。沿用已验收 v3 baseline sprite（非 Pack B 重生成版，避免重复/冲突，见 PROVENANCE）
        { word: 'sun', spriteFile: 'sprites/sun.png', audioFile: 'audio/words/sun.m4a' }, // Pack B ready（batch-03）
        { word: 'shoe', spriteFile: 'sprites/shoe.png', audioFile: 'audio/words/shoe.m4a' }, // Pack B ready（batch-03）
        { word: 'spoon', spriteFile: 'sprites/spoon.png', audioFile: 'audio/words/spoon.m4a' }, // Pack B ready（batch-03）
        // --- T ---
        { word: 'treasure', spriteFile: 'sprites/treasure.png', audioFile: 'audio/words/treasure.m4a' }, // Pack B ready（ready-v1）
        { word: 'tree', spriteFile: 'sprites/tree.png', audioFile: 'audio/words/tree.m4a' }, // Pack B ready（batch-03）
        { word: 'train', spriteFile: 'sprites/train.png', audioFile: 'audio/words/train.m4a' }, // Pack B ready（batch-03）
        { word: 'turtle', spriteFile: 'sprites/turtle.png', audioFile: 'audio/words/turtle.m4a' }, // Pack B ready（batch-03）
        // --- U ---
        { word: 'umbrella', spriteFile: 'sprites/umbrella.png', audioFile: 'audio/words/umbrella.m4a' }, // Pack B ready（batch-03）
        { word: 'unicorn', spriteFile: 'sprites/unicorn.png', audioFile: 'audio/words/unicorn.m4a' }, // Pack B ready（batch-03）
        { word: 'ukulele', spriteFile: 'sprites/ukulele.png', audioFile: 'audio/words/ukulele.m4a' }, // Pack B ready（batch-03）
        { word: 'uniform', spriteFile: 'sprites/uniform.png', audioFile: 'audio/words/uniform.m4a' }, // Pack B ready（batch-03）
        // --- V ---
        { word: 'van', spriteFile: 'sprites/van.png', audioFile: 'audio/words/van.m4a' }, // Pack B ready（batch-03）
        { word: 'vase', spriteFile: 'sprites/vase.png', audioFile: 'audio/words/vase.m4a' }, // Pack B ready（batch-03）
        { word: 'violin', spriteFile: 'sprites/violin.png', audioFile: 'audio/words/violin.m4a' }, // Pack B ready（batch-03）
        { word: 'volcano', spriteFile: 'sprites/volcano.png', audioFile: 'audio/words/volcano.m4a' }, // Pack B ready（batch-03）
        // --- W ---
        { word: 'whale', spriteFile: 'sprites/whale.png', audioFile: 'audio/words/whale.m4a' }, // Pack B ready（batch-04）
        { word: 'watch', spriteFile: 'sprites/watch.png', audioFile: 'audio/words/watch.m4a' }, // Pack B ready（batch-04）
        { word: 'window', spriteFile: 'sprites/window.png', audioFile: 'audio/words/window.m4a' }, // Pack B ready（batch-04）
        { word: 'wagon', spriteFile: 'sprites/wagon.png', audioFile: 'audio/words/wagon.m4a' }, // Pack B ready（batch-04）
        // --- X ---
        { word: 'xray', spriteFile: 'sprites/xray.png', audioFile: 'audio/words/xray.m4a' }, // Pack B ready（batch-04，卡 WTJ-20260704-052 期间补齐，本卡执行时现场核对已转 ready）
        // --- Y ---
        { word: 'yoyo', spriteFile: 'sprites/yoyo.png', audioFile: 'audio/words/yoyo.m4a' }, // Pack B ready（batch-04，提交时点前已从 stub 转 ready，现场核对已落地）
        { word: 'yarn', spriteFile: 'sprites/yarn.png', audioFile: 'audio/words/yarn.m4a' }, // Pack B ready（batch-04，提交时点前已从 stub 转 ready，现场核对已落地）
        { word: 'yak', spriteFile: 'sprites/yak.png', audioFile: 'audio/words/yak.m4a' }, // Pack B ready（batch-04，提交时点前已从 stub 转 ready，现场核对已落地）
        // --- Z ---
        { word: 'zebra', spriteFile: 'sprites/zebra.png', audioFile: 'audio/words/zebra.m4a' }, // Pack B ready（batch-04，卡 WTJ-20260704-054 补齐 Z 组，现场核对已落地）
        { word: 'zipper', spriteFile: 'sprites/zipper.png', audioFile: 'audio/words/zipper.m4a' }, // Pack B ready（batch-04，卡 WTJ-20260704-054 补齐 Z 组，现场核对已落地）
        { word: 'zucchini', spriteFile: 'sprites/zucchini.png', audioFile: 'audio/words/zucchini.m4a' }, // Pack B ready（batch-04，卡 WTJ-20260704-054 补齐 Z 组，现场核对已落地）
        // --- 非 Pack B：既有 v3 基线遗留词（101st，见上方说明） ---
        { word: 'treasurechest', spriteFile: 'sprites/treasure-chest.png', audioFile: 'audio/words/treasurechest.m4a' } // 遗留自 004/009 首批 8 词基线；不在 Pack B 100 词范围内（Pack B 用的是 'treasure'，见上方 T 组），PM/DESIGN 尚未裁决是否保留（见 app/web/MANIFEST.md「已知的文档/素材对齐问题」与 app/web/audio/missing-audio.json additionalManifestOnlyWords）
      ],
      // 上述 101 条 audioFile 均为约定路径 stub：授权语音 / 音效素材尚未到位（全部 137 条缺口的一部分，
      // 见 app/web/audio/missing-audio.json 的 secretWords 段，totalNotDelivered: 101 = Pack B 100 +
      // 本 manifest 独有的 treasurechest 1 条），由音频供给卡（016，命名沿用本文件 WTJ-20260704-016）
      // 交付 .m4a 文件后落地，届时无需改动路径，只需补齐对应文件（见 REQ-AST-08 / REQ-AST-09）。
      // wtjres:// 加载层（019 第一批，见 shell/main.swift WTJResourceSchemeHandler）已就位：真实
      // .m4a 文件放入对应路径后，audio.js 的 fetch() 即可直接加载播放，无需再改任何代码。
      audioNotDelivered: true,
      audioSupplyCard: 'WTJ-20260704-016'
    },

    // =====================================================================
    // slots —— 对应 docs/index.html #slots（域码 SLOT，REQ-SLOT-01 ~ 04）
    // =====================================================================
    slots: {
      // REQ-SLOT-01：发现槽数量可配置；秘密词命中或键盘探索里程碑之一会点亮其中一格。
      // WTJ-20260704-083（开发机验收反馈①）：文档原文与 004/010 首次落地时的默认值均为 5，
      // 但对 3 岁目标用户实测偏多（5 次发现才触发一次宝箱奖励，正反馈间隔过长）。PM 裁定
      // 默认改为 3——数量本身此前就已经是可配置项（slots.js 的 SLOT_COUNT 从这里读，
      // 防御默认值也同步跟随，见该文件），本次只改这个数值，不改任何读取/渲染逻辑本身。
      count: 3,
      // REQ-SLOT-01 / REQ-SEC-07：当前几格内不重复；同一来源（同词或同一里程碑级别）
      // 在同一轮内重复命中只给小反馈，不再占用新格。
      noDuplicateSourceWithinRound: true,
      // REQ-SLOT-03 / REQ-SLOT-04：发现槽来源枚举。
      // 'keyboard-milestone' 对应的具体阈值见 keyboard.effectiveKeyMilestones（[100, 200]），
      // 此处不重复定义数值，避免单一事实来源分裂。
      sources: ['secret-word', 'keyboard-milestone'],
      // REQ-SLOT-04：建议秘密词命中显示为对应对象图标，键盘里程碑显示为抽象「键盘星星」图标。
      sourceIconHint: {
        'secret-word': 'sprite: 对应命中词的物体 sprite（见 secretWords.pool[].spriteFile）',
        'keyboard-milestone': 'sprite: slots.milestoneStickerSprite（DESIGN-007 键盘 medallion，见下）'
      },
      // WTJ-20260705-008：键盘里程碑点亮发现槽时，槽内显示的贴纸 sprite（DESIGN-007 discovery-icons
      // 包 keyboard_exploration 组的 keyboard-star medallion，卡 WTJ-20260704-061，已 accepted）。
      // hud.js renderSlot() 的 is-milestone 分支读取本字段渲染 <img>，替换掉此前的 ★ Unicode
      // 星字占位（production-asset-quality rule 12）。路径相对 app/web/，与 secretWords.pool[].
      // spriteFile 同一约定；素材接入方式见 app/web/assets/PROVENANCE.md「discovery-icons」节。
      milestoneStickerSprite: 'assets/discovery-icons/keyboard-star.png',
      // REQ-SLOT-02 / REQ-RWD-02：五格全部点亮后触发宝箱开启（见 rewards.chest），随后清空五槽，进入下一轮。
      onFull: {
        reqIds: ['REQ-SLOT-02', 'REQ-RWD-02'],
        triggersReward: 'chest',
        resetsSlotsAfter: true
      }
    },

    // =====================================================================
    // tasks —— 对应 docs/index.html #tasks（域码 TASK，REQ-TASK-01 ~ 10）
    // =====================================================================
    tasks: {
      entry: {
        // REQ-TASK-01：默认右侧只保留一个低调的问号，不再放 3-4 个图标按钮。
        singleSubtleQuestionMark: true,
        // REQ-TASK-02：点问号后播放语音任务，不显示中文任务文字。
        voiceOnlyNoChineseText: true
      },

      // 任务时序（对应 docs/index.html #params 参数与阈值总表逐条核对）。
      timing: {
        // REQ-TASK-03：15 秒未完成，轻提示一次。
        lightHintSec: 15,
        // REQ-TASK-04：30 秒未完成，目标变明显（闪一下或稍微放大）。
        emphasizeSec: 30,
        // REQ-TASK-05：45-60 秒仍未完成，任务自动收起，不算失败。
        autoDismissSecRange: [45, 60],
        // REQ-TASK-06：连续 20 个有效键视为明显转去玩键盘，任务也自动淡出。
        keyboardDistractionKeyCount: 20,
        // REQ-TASK-09：寻找类任务，鼠标移到目标上停满 1 秒即算完成（点一下也算完成，见 pressOrHoverAlsoCompletes）。
        findHoverSec: 1
      },

      // REQ-TASK-10：按键任务不做复杂组合键。allowedKeyTypes 纯文档字段（供 PM/QA 对照，
      // task-templates.js 不读取本字段——它按 targetKey 字面值直接比较，不做类型校验），
      // WTJ-20260706-010 起 task-templates.js 的 handlePressKey() 已接线 WTJ_KEYBOARD.onLetter/
      // onSymbol/onFunctionKey 三路判定，targetKey 除字母/数字外也可以是符号（symbol，如 ','）、
      // 空白类功能键（whitespace，即 'Space'/'Enter'）或方向键（arrow，即 'ArrowUp'/'ArrowDown'/
      // 'ArrowLeft'/'ArrowRight'），故在此扩列这三类，与运行时判定范围保持一致。
      pressTask: {
        allowedKeyTypes: ['alpha', 'digit', 'symbol', 'whitespace', 'arrow'],
        complexComboAllowed: false
      },

      // REQ-TASK-07 ~ REQ-TASK-10：四类任务模板结构定义。
      // 每类给出 schema（消费方 013/014 任务引擎按此读取字段）与 examples
      // （当前可落地的示例；素材未到位的字段用 stub 路径 + 行内注明，不留空）。
      templates: {

        drag: {
          reqId: 'REQ-TASK-07',
          description: '拖拽类：把苹果放进篮子；把狗狗带回家；把星星拖到天空。',
          schema: {
            id: 'string，任务唯一标识',
            objectSprite: 'string，可拖拽物体 sprite 路径',
            targetSprite: 'string，放置目标 sprite 路径',
            voicePrompt: 'string，语音任务提示音频路径',
            successAudio: 'string，成功音效路径',
            successAnimation: 'string（可选），成功动画标识',
            // WTJ-20260705-004 Phase A（pt1）：可选装饰性干扰物体列表，纯视觉散落在场景里
            // （不注册 pointer target，不参与任何拖拽判定），渲染方式见 task-templates.js
            // renderDragTask()「仿 renderFindTask() distractor 循环」一节。
            distractorSprites: 'string[]（可选），纯装饰干扰物 sprite 路径列表，不参与判定',
            // WTJ-20260705-004 Phase A（pt5）：可选英文单词字面量，必须能在 secretWords.pool
            // 里找到同名词条（零新增音频约束）；任务判定完成后防御式再念一遍这个词强化学习，
            // 见 task-templates.js playLearningWordDefensive()。
            //
            // WTJ-20260705-025：voicePrompt 允许空字符串 ''——表示这条 example 的中文任务语音
            // 尚未由 024/084 交付。空字符串是 falsy，task.js 的 playTaskVoiceDefensive() 与
            // voice-language.js 的 extractVoicePrompt()/resolveTaskVoicePath() 对它的既有处理
            // 恰好就是"直接判定无 voicePrompt，安全返回 null，不发起任何播放/fetch"（与
            // tests/unit/voice-language.test.mjs 用例 5b「缺 voicePrompt 字段」同一条件分支）。
            // 这是本卡刻意选择的 no-silent-fallback 落地方式：绝不把新任务的 voicePrompt 指向
            // 一个复用自其他任务的、语义不匹配的现成语音文件（那样会"静默播错"——孩子点开门
            // 任务却听到别的任务的提示句），也不需要为此改动 voice-language.js 的 ALL_TASK_IDS/
            // ZH_AVAILABLE_TASK_IDS 静态清单（这些留空的 example 从未进入该清单的比对范围，见
            // tests/unit/voice-language.test.mjs 9a 的过滤逻辑）——中文语言完整度仍如实报告
            // 24/24（该清单覆盖的既有任务集合不受影响），不会把这些新任务的语音缺口错误折算成
            // "中文语言本身不完整"进而让家长设置面板意外禁用中文选项。缺口台账见
            // app/web/audio/missing-audio.json 的 taskVoiceZh 段新增 status:"not-delivered"
            // 条目 + app/scripts/tts-text-manifest.zh.json 的文案草稿，供 024/084 后续排期。
            learningWord: 'string（可选），须命中 secretWords.pool[].word 的英文单词，完成后防御式重播强化'
          },
          // WTJ-20260705-025：Ethan 反馈"drag-to-basket 还是太重复"——此前只有 apple-basket/
          // dog-home 两条 example，轮转周期短，孩子很快就会看腻。这里参考 find 类"12 条精选
          // example"的做法（见下方 find.examples 与其行内注释），把 drag 扩到 8 条：新增 6 条
          // 全部复用 secretWords.pool 已交付的 Pack B 英文词 sprite 做"物体"与"放置目标"两端
          // （零新增美术，见每条下方注释标注具体来源），选取/轮转逻辑完全不变——仍然是
          // task-templates.js 的 questionClickCounter 确定性轮转（P1-1 修法：
          // Math.floor(questionClickCounter / TASK_TYPES.length) % examples.length），不引入
          // Math.random()。新增顺序统一"追加在数组末尾"，不调整/不重排原有两条的下标——
          // tests/unit/task-voice-language-switch.test.mjs 用例 4 与
          // tests/unit/task-voice-path.test.mjs 用例 2 都直接断言 `drag.examples[0]` 恒为
          // 'drag-apple-to-basket'，追加式扩容不影响这两条既有断言。
          examples: [
            {
              id: 'drag-apple-to-basket',
              objectSprite: 'sprites/apple.png',
              targetSprite: 'sprites/basket.png',
              // WTJ-20260705-004 Phase B：接线 084 交付的中文完整句任务语音（Kokoro
              // zf_xiaoxiao，整句预生成，禁止运行时拼接，见 tts-text-manifest.zh.json）。
              // 原 EN audio/tasks/drag-apple-to-basket.m4a 仍在磁盘上（074/078 交付），
              // 未被删除，只是本 example 不再引用它。
              voicePrompt: 'audio/tasks/drag-apple-to-basket.zh.m4a', // 已交付（084），完整句"把苹果放进篮子里！"
              successAudio: 'audio/sfx/task-success.m4a', // stub，待 016 卡供给
              successAnimation: 'bounce-in',
              // pt1：篮子旁边散落几个装饰性水果（复用 secretWords.pool 已交付 sprite，零新增
              // 美术），不影响判定——孩子仍然只需要把苹果拖进篮子。
              distractorSprites: ['sprites/banana.png', 'sprites/orange.png'],
              learningWord: 'apple' // pt5：命中 secretWords.pool 的 'apple' 词条。
            },
            {
              id: 'drag-dog-home',
              objectSprite: 'sprites/dog.png',
              // WTJ-20260705-025：doghouse.png 已交付（Pack A，卡 WTJ-20260704-005），非 stub——
              // 见 app/web/assets/task-props/PROVENANCE.md「本卡已补齐，不再是 stub」一节。此处
              // 修正上一版遗留的过期行内注释（曾误标 stub，待素材卡供给），素材路径本身未变。
              targetSprite: 'sprites/doghouse.png',
              voicePrompt: 'audio/tasks/drag-dog-home.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"把小狗带回家！"
              successAudio: 'audio/sfx/task-success.m4a', // stub
              successAnimation: 'bounce-in',
              // pt1：窝旁边有一只装饰性的猫，不影响判定。
              distractorSprites: ['sprites/cat.png'],
              learningWord: 'dog' // pt5：命中 secretWords.pool 的 'dog' 词条。
            },
            {
              id: 'drag-egg-to-nest',
              // 物体/目标均复用 secretWords.pool 已交付 Pack B sprite（egg/nest），零新增美术。
              objectSprite: 'sprites/egg.png',
              targetSprite: 'sprites/nest.png',
              // WTJ-20260705-025：024/084 尚未交付这条中文语音——留空而非指向一个语义不匹配的
              // 现成文件，见上方 schema.voicePrompt 行内注释的 no-silent-fallback 说明。拟定
              // 文案"把鸡蛋放进鸟窝里！"已登记到 app/scripts/tts-text-manifest.zh.json 供
              // 024/084 后续生成，生成后把这里改成 'audio/tasks/drag-egg-to-nest.zh.m4a' 即可，
              // 不需要改任何代码。
              // WTJ-20260705-024：CosyVoice3 + Ethan 自录音色已交付本条中文语音（见 audio/TTS-PROVENANCE.md）。
              voicePrompt: 'audio/tasks/drag-egg-to-nest.zh.m4a',
              successAudio: 'audio/sfx/task-success.m4a',
              successAnimation: 'bounce-in',
              distractorSprites: ['sprites/duck.png'], // 鸟窝旁边一只装饰性的鸭子，不影响判定。
              learningWord: 'egg'
            },
            {
              id: 'drag-flower-to-vase',
              objectSprite: 'sprites/flower.png',
              targetSprite: 'sprites/vase.png',
              // WTJ-20260705-024：CosyVoice3 + Ethan 自录音色已交付本条中文语音（见 audio/TTS-PROVENANCE.md）。
              voicePrompt: 'audio/tasks/drag-flower-to-vase.zh.m4a',
              successAudio: 'audio/sfx/task-success.m4a',
              successAnimation: 'bounce-in',
              distractorSprites: ['sprites/leaf.png'],
              learningWord: 'flower'
            },
            {
              id: 'drag-orange-to-basket',
              objectSprite: 'sprites/orange.png',
              // 复用 apple-to-basket 同一个放置目标 sprite（task-props/basket.png），不同物体、
              // 不同 example，孩子看到的是"另一种水果被放进同一个篮子"，与 find 任务里同一目标
              // sprite 被多个不同 example 复用（如 apple 既是 find-the-apple 的 target 又是
              // drag-apple-to-basket 的物体）同一工程取舍，不是重复渲染 bug。
              targetSprite: 'sprites/basket.png',
              // WTJ-20260705-024：CosyVoice3 + Ethan 自录音色已交付本条中文语音（见 audio/TTS-PROVENANCE.md）。
              voicePrompt: 'audio/tasks/drag-orange-to-basket.zh.m4a',
              successAudio: 'audio/sfx/task-success.m4a',
              successAnimation: 'bounce-in',
              distractorSprites: ['sprites/lemon.png', 'sprites/pear.png'],
              learningWord: 'orange'
            },
            {
              id: 'drag-fish-to-net',
              objectSprite: 'sprites/fish.png',
              targetSprite: 'sprites/net.png',
              // WTJ-20260705-024：CosyVoice3 + Ethan 自录音色已交付本条中文语音（见 audio/TTS-PROVENANCE.md）。
              voicePrompt: 'audio/tasks/drag-fish-to-net.zh.m4a',
              successAudio: 'audio/sfx/task-success.m4a',
              successAnimation: 'bounce-in',
              distractorSprites: ['sprites/frog.png'],
              learningWord: 'fish'
            },
            {
              id: 'drag-jam-to-jar',
              objectSprite: 'sprites/jam.png',
              targetSprite: 'sprites/jar.png',
              // WTJ-20260705-024：CosyVoice3 + Ethan 自录音色已交付本条中文语音（见 audio/TTS-PROVENANCE.md）。
              voicePrompt: 'audio/tasks/drag-jam-to-jar.zh.m4a',
              successAudio: 'audio/sfx/task-success.m4a',
              successAnimation: 'bounce-in',
              distractorSprites: ['sprites/spoon.png'],
              learningWord: 'jam'
            },
            {
              id: 'drag-treasure-to-chest',
              objectSprite: 'sprites/treasure.png',
              // treasure-chest.png 同时也是 rewards.chest.sprite 引用的同一张图（宝箱开箱大奖励
              // 用图）——这里只是复用同一份已交付素材渲染一个静态放置目标，不影响/不触发宝箱
              // 开箱逻辑本身（两处引用互相独立，见 task-templates.js resolveSpritePath()）。
              targetSprite: 'sprites/treasure-chest.png',
              // WTJ-20260705-024：CosyVoice3 + Ethan 自录音色已交付本条中文语音（见 audio/TTS-PROVENANCE.md）。
              voicePrompt: 'audio/tasks/drag-treasure-to-chest.zh.m4a',
              successAudio: 'audio/sfx/task-success.m4a',
              successAnimation: 'bounce-in',
              distractorSprites: ['sprites/key.png'],
              learningWord: 'treasure'
            }
          ]
        },

        click: {
          reqId: 'REQ-TASK-08',
          description: '点击类：点一下开灯；关水龙头；按铃铛；打开门；让小马跑起来。',
          schema: {
            id: 'string',
            targetSprite: 'string，可点击目标 sprite 路径（初始态）',
            targetSpriteActive: 'string（可选），命中后的状态 sprite（如灯亮）',
            voicePrompt: 'string',
            successAudio: 'string',
            successAnimation: 'string（可选）',
            // WTJ-20260705-004 Phase A（pt5）：见 drag.schema.learningWord 同一说明。
            learningWord: 'string（可选），须命中 secretWords.pool[].word 的英文单词，完成后防御式重播强化'
          },
          examples: [
            {
              id: 'click-lamp-on',
              // 分态灯具素材（灭/亮两张分离贴图）仍未到位（REQ-AST-05，待素材卡供给），
              // 这里指向唯一真实存在的 lamp.png；idle→active 的视觉变化由 056 帧动画
              // （PROP_ANIM_STATE_MAP: off→turning-on）驱动，不依赖 targetSprite 切图。
              targetSprite: 'sprites/lamp.png',
              targetSpriteActive: 'sprites/lamp.png',
              voicePrompt: 'audio/tasks/click-lamp-on.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"点亮小台灯！"
              successAudio: 'audio/sfx/task-success.m4a', // stub
              successAnimation: 'glow-pulse',
              learningWord: 'lamp' // pt5：命中 secretWords.pool 的 'lamp' 词条。
            },
            {
              id: 'click-faucet-on',
              // 056 PROP_ANIM_STATE_MAP: faucet idle='off'（关，静止）→active='running'（水流）；
              // 两态都指向同一张真实 faucet.png，态变化完全由帧动画驱动，不依赖静态切图。
              targetSprite: 'sprites/faucet.png',
              targetSpriteActive: 'sprites/faucet.png',
              // WTJ-20260705-004 Phase B：接线 084 中文完整句"打开水龙头！"，
              // 消解此前"文件暂缺静默兜底"的旧状态。
              voicePrompt: 'audio/tasks/click-faucet-on.zh.m4a',
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'faucet' // pt5：命中 secretWords.pool 的 'faucet' 词条。
            },
            {
              id: 'click-horse-run',
              // 056 PROP_ANIM_STATE_MAP: horse idle='idle'（原地待命）→active='stop_success'
              // （一次性"成功"收尾动作）；两态都指向同一张真实 horse.png。
              targetSprite: 'sprites/horse.png',
              targetSpriteActive: 'sprites/horse.png',
              voicePrompt: 'audio/tasks/click-horse-run.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"让小马跑起来！"
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'horse' // pt5：命中 secretWords.pool 的 'horse' 词条。
            },
            // WTJ-20260705-025：接入 door/doorbell 点击任务——素材（sprites/door.png、
            // sprites/bell.png）早已随 Pack A（WTJ-20260704-005）交付并集成到
            // app/web/assets/task-props/（见该目录 PROVENANCE.md），但此前从未有任何
            // manifest.tasks.templates.click.examples 条目引用它们（PROVENANCE.md「集成范围」
            // 一节原话："资源已就位、待 manifest 补充实例"）——这正是 Ethan 点名的"资产已存在但
            // 运行版没接"。door/bell 不在 056 的 PROP_ANIM_STATE_MAP 映射表内（v1_boundary.
            // deferred_to_v2：只有单张静态 PNG，没有分帧/分态动效数据），resolvePropAnimInfo()
            // 对它们恒返回 null，createPropEl() 因此走静态 <img> 回退——这是既有设计好的降级
            // 路径，本卡不需要也不应该改 task-templates.js 的引擎判定逻辑，直接复用即可（与
            // click-lamp-on 引擎缺失时的回退路径完全同构）。idle/active 两态复用同一张静态图，
            // 视觉差异由 task-templates.css 通用的 `[data-anim-state="active"]` 发光过渡规则
            // 提供（door.png/bell.png 已在 task-templates.js ANIM_STATE_FILENAMES 清单内，
            // data-anim-state 属性会被正常创建/切换）。真正的开合/摇铃分帧动效由后续动效卡
            // 026（门）/031（铃）接手，见 assets/task-props/PROVENANCE.md「animation state
            // 接口预留」一节。
            {
              id: 'click-door-open',
              targetSprite: 'sprites/door.png',
              targetSpriteActive: 'sprites/door.png', // 与 lamp/faucet/horse 同一"分态未到位，同图 + data-anim-state 区分视觉"约定
              // WTJ-20260705-024：CosyVoice3 + Ethan 自录音色已交付本条中文语音（见 audio/TTS-PROVENANCE.md）。
              voicePrompt: 'audio/tasks/click-door-open.zh.m4a',
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'door' // 命中 secretWords.pool 的 'door' 词条（D 组，已交付）。
            },
            {
              id: 'click-doorbell-ring',
              targetSprite: 'sprites/bell.png',
              targetSpriteActive: 'sprites/bell.png',
              // WTJ-20260705-024：CosyVoice3 + Ethan 自录音色已交付本条中文语音（见 audio/TTS-PROVENANCE.md）。
              voicePrompt: 'audio/tasks/click-doorbell-ring.zh.m4a',
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'bell' // 命中 secretWords.pool 的 'bell' 词条（B 组，已交付）。
            }
          ]
        },

        find: {
          reqId: 'REQ-TASK-09',
          description: '寻找类：语音说"找到小狗"；鼠标移到小狗上停 1 秒算完成，移上去点一下也算完成。',
          schema: {
            id: 'string',
            targetSprite: 'string，目标 sprite 路径',
            distractorSprites: 'string[]（可选），干扰项 sprite 路径列表',
            voicePrompt: 'string',
            hoverSec: 'number，命中判定悬停秒数（见 tasks.timing.findHoverSec）',
            pressOrHoverAlsoCompletes: 'boolean，命中判定是否接受"悬停未满但点击一下"提前完成',
            successAudio: 'string',
            // WTJ-20260705-004 Phase A（pt5）：见 drag.schema.learningWord 同一说明。
            learningWord: 'string（可选），须命中 secretWords.pool[].word 的英文单词，完成后防御式重播强化'
          },
          // WTJ-20260705-004 Phase A（pt2）：此前本类型只有 'find-the-dog' 一条写死示例
          // （TL 综合裁定：孩子应该能见到多样化的寻找目标，不是永远只找小狗）。这里手写 12 条
          // 精选 example（保持 Phase B 中文语音句子数可控——每条 find example 未来对应且仅对应
          // 一条预生成中文句，见 app/scripts/tts-text-manifest.zh.json 骨架与 CN-TASK-DRAFT.md），
          // target/distractor 全部复用 secretWords.pool 已交付的 101 词英文 sprite（103 张真实
          // 素材，零新增美术，见 task-templates.js SPRITES_FILENAMES 白名单同步扩展）。voicePrompt
          // WTJ-20260705-004 Phase B 更新：此前"除 find-the-dog 首条外，新增 11 条暂无预生成
          // 语音、静默兜底"的状态已结束——084 交付了全部 12 条 find example 对应的中文完整句
          // 语音，本节 12 条 voicePrompt 现全部指向 084 的 audio/tasks/<id>.zh.m4a（见
          // app/scripts/tts-text-manifest.zh.json 的 out 字段）。learningWord 恒等于 targetSprite
          // 对应的英文词本身（找到即再学一遍这个词）。distractorSprites 只提供视觉干扰，
          // voicePrompt 只会念 target，不会念 distractor（REQ-TASK-09 既有约束不变）。
          examples: [
            {
              id: 'find-the-dog',
              targetSprite: 'sprites/dog.png',
              distractorSprites: ['sprites/cat.png', 'sprites/ball.png'],
              voicePrompt: 'audio/tasks/find-the-dog.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到小狗！"（原 EN find-the-dog.m4a 074/078 交付仍在磁盘，不再被引用）
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'dog'
            },
            {
              id: 'find-the-cat',
              targetSprite: 'sprites/cat.png',
              distractorSprites: ['sprites/dog.png', 'sprites/duck.png'],
              voicePrompt: 'audio/tasks/find-the-cat.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到小猫！"
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'cat'
            },
            {
              id: 'find-the-apple',
              targetSprite: 'sprites/apple.png',
              distractorSprites: ['sprites/banana.png', 'sprites/orange.png'],
              voicePrompt: 'audio/tasks/find-the-apple.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到苹果！"
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'apple'
            },
            {
              id: 'find-the-star',
              targetSprite: 'sprites/star.png',
              distractorSprites: ['sprites/moon.png', 'sprites/sun.png'],
              voicePrompt: 'audio/tasks/find-the-star.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到星星！"
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'star'
            },
            {
              id: 'find-the-fish',
              targetSprite: 'sprites/fish.png',
              distractorSprites: ['sprites/frog.png', 'sprites/duck.png'],
              voicePrompt: 'audio/tasks/find-the-fish.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到小鱼！"
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'fish'
            },
            {
              id: 'find-the-elephant',
              targetSprite: 'sprites/elephant.png',
              distractorSprites: ['sprites/lion.png', 'sprites/monkey.png'],
              voicePrompt: 'audio/tasks/find-the-elephant.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到大象！"
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'elephant'
            },
            {
              id: 'find-the-pig',
              targetSprite: 'sprites/pig.png',
              distractorSprites: ['sprites/goat.png', 'sprites/koala.png'],
              voicePrompt: 'audio/tasks/find-the-pig.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到小猪！"
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'pig'
            },
            {
              id: 'find-the-rocket',
              targetSprite: 'sprites/rocket.png',
              distractorSprites: ['sprites/robot.png', 'sprites/rainbow.png'],
              voicePrompt: 'audio/tasks/find-the-rocket.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到火箭！"
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'rocket'
            },
            {
              id: 'find-the-turtle',
              targetSprite: 'sprites/turtle.png',
              distractorSprites: ['sprites/duck.png', 'sprites/frog.png'],
              voicePrompt: 'audio/tasks/find-the-turtle.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到小乌龟！"
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'turtle'
            },
            {
              id: 'find-the-unicorn',
              targetSprite: 'sprites/unicorn.png',
              distractorSprites: ['sprites/horse.png', 'sprites/zebra.png'],
              voicePrompt: 'audio/tasks/find-the-unicorn.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到独角兽！"
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'unicorn'
            },
            {
              id: 'find-the-whale',
              targetSprite: 'sprites/whale.png',
              distractorSprites: ['sprites/fish.png', 'sprites/octopus.png'],
              voicePrompt: 'audio/tasks/find-the-whale.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到鲸鱼！"
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'whale'
            },
            {
              id: 'find-the-zebra',
              targetSprite: 'sprites/zebra.png',
              distractorSprites: ['sprites/horse.png', 'sprites/unicorn.png'],
              voicePrompt: 'audio/tasks/find-the-zebra.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"找到斑马！"
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a',
              learningWord: 'zebra'
            }
          ]
        },

        press: {
          reqId: 'REQ-TASK-10',
          description: '按键类：只要求一个键，且仅限字母/数字，例如 "Press A."、"Press 3."。不做复杂组合键。',
          schema: {
            id: 'string',
            targetKey: 'string，单个字母或数字（KeyboardEvent.key 规范值）',
            voicePrompt: 'string',
            successAudio: 'string'
          },
          // WTJ-20260705-004 Phase A（pt3）：纯追加——examples[0]/[1]（press-letter-a /
          // press-digit-3）与下方 5 条新追加按键覆盖，扩大"孩子可能被要求按哪个键"的多样性，
          // 不改动字段结构。
          // WTJ-20260705-004 Phase B 更新：全部 7 条 voicePrompt 已从 EN audio/tasks/<key>.m4a
          // 改接 084 交付的中文完整句 audio/tasks/<key>.zh.m4a（examples[0]/[1] 的 EN 路径不再
          // 是 task-voice-path.test.mjs 用例 2 的断言对象——该用例已同步改为断言 ZH 路径，见该
          // 文件）。
          examples: [
            {
              id: 'press-letter-a',
              targetKey: 'A',
              // WTJ-20260705-004 Phase B：接线 084 中文完整句"按下字母 A！"。注意 id 与
              // 语音文件名 stem 本就不同（press-letter-a vs press-a），这正是
              // task-voice-path.test.mjs 用例 2 专门覆盖的刁钻样本——084 的 zh 版沿用同一
              // stem 约定（见 tts-text-manifest.zh.json out 字段），未改变这个既有落差。
              voicePrompt: 'audio/tasks/press-a.zh.m4a', // 已交付（084）
              successAudio: 'audio/sfx/task-success.m4a'
            },
            {
              id: 'press-digit-3',
              targetKey: '3',
              voicePrompt: 'audio/tasks/press-3.zh.m4a', // 已交付（084），完整句"按下数字 3！"
              successAudio: 'audio/sfx/task-success.m4a'
            },
            {
              id: 'press-letter-b',
              targetKey: 'B',
              voicePrompt: 'audio/tasks/press-b.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"按下字母 B！"
              successAudio: 'audio/sfx/task-success.m4a'
            },
            {
              id: 'press-letter-s',
              targetKey: 'S',
              voicePrompt: 'audio/tasks/press-s.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"按下字母 S！"
              successAudio: 'audio/sfx/task-success.m4a'
            },
            {
              id: 'press-letter-m',
              targetKey: 'M',
              voicePrompt: 'audio/tasks/press-m.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"按下字母 M！"
              successAudio: 'audio/sfx/task-success.m4a'
            },
            {
              id: 'press-digit-5',
              targetKey: '5',
              voicePrompt: 'audio/tasks/press-5.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"按下数字 5！"
              successAudio: 'audio/sfx/task-success.m4a'
            },
            {
              id: 'press-digit-7',
              targetKey: '7',
              voicePrompt: 'audio/tasks/press-7.zh.m4a', // WTJ-20260705-004 Phase B：接线 084 中文完整句"按下数字 7！"
              successAudio: 'audio/sfx/task-success.m4a'
            }
          ]
        }
      }
    },

    // =====================================================================
    // rewards —— 对应 docs/index.html #rewards（域码 RWD，REQ-RWD-01 ~ 06）
    // =====================================================================
    rewards: {
      chest: {
        // REQ-RWD-01：宝箱奖励以一次性表现为主，不长期占用屏幕空间。
        reqIds: ['REQ-RWD-01'],
        oneTimePresentation: true,
        formsAllowed: ['fireworks', 'sticker-popup-fade', 'short-animation', 'temporary-background-change', 'new-sfx'],
        sprite: 'sprites/treasure-chest.png',
        // REQ-RWD-02：宝箱开启后清空五槽，进入下一轮（见 slots.onFull）。
        resetsSlotsAfter: true,
        // REQ-RWD-03 / REQ-AST-02：烟花建议用 Canvas / SVG 代码生成（烟花粒子和部分 UI 动效
        // 属于「代码生成」类素材，不为每种效果准备贴图），预设「满天星、打铁花、圆形、星形」等类型
        // （原文"等类型"为开放列举，非封闭清单）；颜色从少量高质量色板出发做 HSL / HSV 微调，
        // 不做完全 RGB 随机。
        // WTJ-20260704-083（开发机验收反馈⑤）：新增 'heart'（心形）预设——开发机验收发现孩子
        // 对心形烟花反馈更好，docs 原文"等类型"本就留了开放口子，这里在文档给出的星形之外扩展一种，
        // 不替换/不移除既有 'star'。
        fireworks: {
          reqIds: ['REQ-RWD-03', 'REQ-AST-02'],
          generationMethod: 'canvas-or-svg-code',
          presetTypes: ['starfield', 'sparkler', 'circle', 'star', 'heart'], // 满天星 / 打铁花 / 圆形 / 星形 / 心形
          colorStrategy: 'small-curated-palette-hsl-hsv-jitter', // 少量高质量色板 + HSL/HSV 微调
          // 以下两项为性能红线，来自技术评审结论（目标机 4GB 内存 / HD5000 核显预算，
          // 详见 app/README.md「技术栈」），docs/index.html 未给出具体数值，不对应 REQ ID。
          maxParticles: 300,
          disallowShadowBlur: true
        },
        // WTJ-20260704-083 返工（PM 打回①②，接入 DESIGN 082 已验收资产）：footer 右侧
        // **常驻**宝箱三态指示器（Disabled/Active/Open）消费的运行时资产路径，由 hud.js 读取、
        // 渲染在 `.wtj-hud-chest`（见 app/web/hud.js「footer 常驻宝箱指示器」一节 /
        // app/web/hud.css `.wtj-hud-chest-lane`）。与上面 `sprite`（一次性开箱大奖励用的
        // treasure-chest.png，本文件 rewards.chest.sprite，独立于本字段）是两个不同的视觉：
        // 后者是 011（reward-chest.js）满槽时播放的一次性 Canvas 开箱序列本体；本字段是
        // footer 里全程可见、随发现槽填充进度变化的小指示器。
        //
        // 源文件：docs/assets/style/wtj-082/chest/chest-disabled.png / chest-active.png
        // （1024x1024 RGBA，卡 WTJ-20260704-082，asset_class: style_baseline_sample_not_full_
        // runtime_replacement——已验收基线样本，可作可交付 interim 接入；全量最终生产另开卡）。
        // 运行时副本用 sips 降采到 192x192（保留 alpha）复制到 app/web/assets/ui/，不直接在
        // runtime 里加载 1024² 原图（体积），见 app/web/assets/PROVENANCE.md。
        //
        // 只有 Disabled/Active 两态资产——082 明确"打开(Open)态不是第三张静态图"：Open 态直接
        // 复用本文件已有的 011 一次性开箱 Canvas 分帧序列（showChest()/WTJ_FRAME_ANIM
        // 'opening'），hud.js 的常驻指示器只在该序列播放期间切换到 is-open 视觉（复用 active
        // 图 + CSS 脉冲呼吸动画区分观感），序列播完/reset 后回落 Disabled。两个文件名为
        // ASSET_BASE（'assets/ui/'）之下的裸文件名，与 five-slot-tray.png 等既有资产同一约定。
        footerIndicator: {
          card: 'WTJ-20260704-082',
          assetClass: 'style_baseline_sample_not_full_runtime_replacement',
          states: {
            disabled: 'chest-disabled.png',
            active: 'chest-active.png'
          },
          sizePxRange: [72, 96], // 082 slot_rules：运行时显示建议 72px 到 96px
          minGapFromSlotsPx: 20 // 082：与槽位组保持至少 20px 视觉间距
        }
      },
      statusLights: {
        // REQ-RWD-04：小任务奖励不与底部五槽混用；角落放一排很小的工作状态灯，完成一个任务点亮一个。
        reqIds: ['REQ-RWD-04'],
        count: 3,
        countNote: '推断值：REQ-RWD-04 原文未给出灯的数量；依据 REQ-RWD-05（连续 3 任务触发大奖励）与 docs/index.html #overview 线框图中的 3 灯示意推断为 3，非文档给出的精确值。',
        separateFromSlots: true,
        // REQ-RWD-05：连续完成 3 个任务，触发「今日工作完成」奖励。
        streakThreshold: 3,
        // REQ-RWD-06：奖励表现可以是三个灯一起闪、工作台盖章、小火箭发射、宝箱小开一次。
        streakRewardForms: ['lights-flash-together', 'desk-stamp', 'mini-rocket-launch', 'chest-partial-open']
      },
      // WTJ-20260705-008：键盘自由探索里程碑奖励表现（REQ-SLOT-03 关联）。累计有效键达到
      // keyboard.effectiveKeyMilestones（[100, 200]）之一时，除了点亮一个发现槽（槽内贴纸见
      // slots.milestoneStickerSprite），还弹出一次性「键盘主题奖励」叠层做正反馈——用 DESIGN-007
      // discovery-icons 的 keyboard-spark（键盘星火迸发 medallion，卡 WTJ-20260704-061，已 accepted）
      // 一次性淡入 → 停留 → 淡出，不常驻屏幕（与 rewards.chest.oneTimePresentation 同一「一次性
      // 表现，不长期占屏」原则）。由 status-rewards.js 订阅 WTJ_KEYBOARD.onMilestone 落地。
      // rewardSticker 路径相对 app/web/，素材接入方式见 app/web/assets/PROVENANCE.md。
      keyboardMilestone: {
        reqIds: ['REQ-SLOT-03'],
        oneTimePresentation: true,
        rewardSticker: 'assets/discovery-icons/keyboard-spark.png'
      },
      // WTJ-20260705-010：接入 completion-stamp-v3 素材，替换「今日工作完成」奖励此前的
      // 纯 CSS 小火箭 + sparkle-burst/star-sticker 占位视觉（mini-rocket-launch 表现形式），
      // 改为 streakRewardForms 菜单里的 desk-stamp（工作台盖章）表现形式：一次性 pop/scale/
      // fade 展示这枚金色印章 + 三个打勾徽章的静态贴图（语义正好呼应"连续完成 3 个任务"）。
      // DESIGN 交付（docs/assets/design-expansion-v2/work-complete-reward/completion-stamp-v3/）
      // 实际只给了 source/ 下 1 张已抠像静态图（completion-stamp-cutout.png），没有多帧序列/
      // manifest.json/sheet/preview gif（与卡片原文列出的资产清单有出入，据实记录于
      // app/web/assets/rewards/PROVENANCE.md「与卡片原文档述的资产清单有出入」一节），因此本卡
      // 走纯 CSS 一次性 pop 方案而非 frame-anim.js 多帧管线，sprite 字段就是唯一需要的 config。
      // sprite 路径是 sips -Z 640 降采副本，见 app/web/assets/rewards/PROVENANCE.md
      // 「completion-stamp-v3.png」一节；status-rewards.js 读取本字段，不硬编码 docs/ 设计目录
      // 路径，缺配置时回退到与此处相同的默认相对路径（防御式，与 keyboardMilestone 的
      // getMilestoneRewardSticker() 同一读取模式，唯一区别是本字段有内置默认值兜底而非返回 null
      // ——「今日工作完成」奖励必须每次都展示视觉，不像键盘里程碑贴纸允许缺配置时空叠层）。
      completionStamp: {
        card: 'WTJ-20260705-010',
        reqIds: ['REQ-RWD-05', 'REQ-RWD-06'],
        oneTimePresentation: true,
        sprite: 'assets/rewards/completion-stamp-v3.png',
        form: 'desk-stamp'
      }
    },

    // =====================================================================
    // pointer —— 对应 docs/index.html #pointer（域码 PTR，REQ-PTR-01 ~ 03）
    // REQ-AST-03：鼠标尾迹、点击波纹、轻量过渡均属于「代码生成」类素材，不预置贴图。
    // =====================================================================
    pointer: {
      move: {
        // REQ-PTR-01：很淡的光点尾迹，快速移动时稍明显；连续乱晃约 3 秒后尾迹变弱，停一下再恢复；
        // 经过有效对象可让对象轻微躲开、旋转或发光。
        reqIds: ['REQ-PTR-01'],
        trailEnabled: true,
        idleDecayApproxSec: 3, // 文档原文"约 3 秒"，为近似值非精确阈值
        hoverEffectOnValidObjects: ['dodge', 'rotate', 'glow']
      },
      click: {
        // REQ-PTR-02：第一下有小星点、短音效或小印章；连续狂点反馈越来越弱，太快时不给声音；
        // 点中任务目标、宝箱或有效对象时才有明显反应。
        reqIds: ['REQ-PTR-02'],
        firstClickFeedback: ['star-point', 'short-sfx', 'small-stamp'],
        rapidClickDecay: {
          curve: 'fast-decay-placeholder',
          muteAudioAboveClickRate: true,
          note: '文档仅定性描述"越来越弱""太快时不给声音"，未给出具体衰减曲线与频率阈值；由 009/012 引擎卡实现时补充。'
        },
        bigFeedbackTargets: ['task-target', 'chest', 'valid-object']
      },
      drag: {
        // REQ-PTR-03：只有可拖对象进入强反馈，对象弹性跟随；拖错不惩罚只轻轻弹回；
        // 拖到正确目标后出现成功动画和任务计数。
        reqIds: ['REQ-PTR-03'],
        onlyDraggableObjectsStrongFeedback: true,
        elastic: {
          followStiffnessPlaceholder: 0.2,
          followDampingPlaceholder: 0.6,
          note: '文档未给出具体弹性系数数值；此处为结构占位，由拖拽任务实现（013/014）按实际手感调参，不视为文档给出的精确值。'
        },
        wrongTarget: { penalty: false, animation: 'gentle-snap-back' },
        correctTarget: { animation: 'success', incrementsTaskCount: true }
      }
    },

    // =====================================================================
    // exit —— 对应 docs/index.html #exit（域码 EXIT，REQ-EXIT-01 ~ 04）
    // =====================================================================
    exit: {
      // REQ-EXIT-01：App 内部拦截 Command+H / Command+W / Command+Q 等常见快捷键。
      interceptedShortcuts: ['Cmd+H', 'Cmd+W', 'Cmd+Q'],
      // REQ-EXIT-02：Esc 键不直接触发退出。
      escDoesNotDirectlyExit: true,
      // REQ-EXIT-03：家长退出需长按 Esc ≥5 秒，触发口令输入；口令正确后才能退出全屏安全空间。
      //
      // 重要：escHoldSec 与 passcodePlaceholder 这两个值与 shell/main.swift 原生层常量
      // （kExitPasswordPlaceholder 等）是镜像关系——原生层当前各自硬编码、两层尚未打通桥接，
      // 修改任一处务必同步修改另一处，否则 web 层进度条时长与原生层实际长按判定会不一致。
      // 017 卡会建立桥接把两层统一为单一来源。
      escHoldSec: 5,
      passcodePlaceholder: 'worktime',
      // REQ-EXIT-04：孩子侧不存在主动退出入口；任务超时自动收起（REQ-TASK-05）与转移键盘
      // 触发的任务淡出（REQ-TASK-06）均不判定为失败，也不触发应用退出。
      childSideExitEntryExists: false,
      taskTimeoutCountsAsFailure: false,
      keyboardDistractionCountsAsFailure: false
    },

    // =====================================================================
    // parentControls —— 隐藏家长菜单 / 每日使用时长额度 / 语言设置
    // （WTJ-20260705-018，P0 家长控制卡）
    // =====================================================================
    parentControls: {
      // 家长入口主通道由 Esc 长按改为 Cmd+Q 长按（Esc 长按口令退出保留为兜底，见上方
      // exit 域，未删除、未改行为）。cmdQHoldSec 与 shell/main.swift 的 kCmdQHoldSeconds
      // 常量是镜像关系——与 exit.escHoldSec 同款约定（改一处务必同步改另一处），018 卡的
      // web 层进度条（parent-controls.js 的 wtjParentGateProgress）用它算百分比。
      cmdQHoldSec: 5,
      // 每日允许使用时长默认值（分钟）——与 shell/main.swift 的 kDailyLimitDefaultMinutes
      // 镜像。家长在设置面板里可调，持久化在 shell 侧 UserDefaults（权威来源），本字段只是
      // web 层展示"默认值应该是多少"用，不是运行时权威状态（权威状态经
      // window.wtjApplyShellState/wtjShowSettingsPanel 由 shell 下发，见 parent-controls.js）。
      dailyLimitMinutesDefault: 30,
      dailyLimitMinutesRange: { min: 5, max: 180 },
      // 语言/任务语音模式：中文 / 英文 / 跟随素材可用性（voice-language.js 消费，验收标准
      // #4）。当前磁盘交付状态——中文 24/24 完整，英文仅 8/24（见 voice-language.js 顶部
      // 注释与 audio/missing-audio.json 的 taskVoice/taskVoiceZh 两段）。noSilentFallback:
      // true 是本域的硬约束标注（供 QA 对照验收标准 #4 原文核查，非运行时读取的开关）。
      voiceLanguage: {
        defaultMode: 'zh',
        modes: ['zh', 'en', 'auto'],
        zhTaskVoiceTotal: 24,
        zhTaskVoiceDelivered: 24,
        enTaskVoiceTotal: 24,
        enTaskVoiceDelivered: 8,
        noSilentFallback: true
      }
    },

    // =====================================================================
    // assets —— 对应 docs/index.html #assets（域码 AST，REQ-AST-01 ~ 12）
    // =====================================================================
    assets: {
      // 运行时资源目录约定（相对 app/web/，未来打包后对应 Resources/web/ 下同名目录）。
      runtimeDirs: {
        sprites: 'sprites/',
        states: 'states/',
        audio: 'audio/'
      },
      // 当前 DESIGN 素材实际存放位置（设计源，位于 docs/ 而非 app/web/ 运行时目录，
      // 尚未拷贝/裁剪进 app/web/ 运行时目录，由后续集成步骤统一处理）。
      designSourceDirs: {
        sprites: 'docs/assets/sprites/',
        states: 'docs/assets/states/',
        style: 'docs/assets/style/'
      },
      // REQ-AST-10 ~ REQ-AST-12：DESIGN 素材卡交付状态（均已验收）。
      deliveredCards: [
        { card: 'WTJ-20260703-005', slot: 'core-states', reqId: 'REQ-AST-10', status: 'accepted', path: 'docs/assets/states/' },
        { card: 'WTJ-20260703-006', slot: 'style-baseline', reqId: 'REQ-AST-11', status: 'accepted', path: 'docs/assets/style/' },
        { card: 'WTJ-20260703-007', slot: 'sprites-batch1', reqId: 'REQ-AST-12', status: 'accepted', path: 'docs/assets/sprites/' }
      ],
      // 在途素材卡（词池扩展 / 任务素材等）。完成交付前，manifest 内相关字段以 stub 路径占位，
      // 交付后只需替换/补齐文件，无需改动字段结构。
      inFlightCards: ['WTJ-20260704-005', 'WTJ-20260704-006'],
      audioPolicy: {
        // REQ-AST-07：不使用 Chrome 自带发音作为产品声音。
        noBrowserBuiltinTTS: true,
        // REQ-AST-08：固定短句预生成；组合任务运行时生成后缓存。
        fixedPhrasesPreGenerated: true,
        combinedPhrasesGeneratedThenCached: true,
        // REQ-AST-09：动物叫声、铃铛、水声、开箱声使用授权素材。
        sfxRequiresLicensedSource: true
      }
    },

    // =====================================================================
    // performance —— 性能红线（技术评审结论，非 docs/index.html 直接数值）
    // 关联需求：REQ-DESK-01（2014 MacBook Air 全屏运行）/ REQ-DESK-03（性能验证归 TL）。
    // docs/index.html 仅在 #desktop 定性提出运行环境约束，未给出具体数值；
    // 以下数值来自 4GB 内存 / HD5000 核显预算的技术评审结论（见 app/README.md「技术栈」）。
    // =====================================================================
    performance: {
      reqIds: ['REQ-DESK-01', 'REQ-DESK-03'],
      maxResidentSprites: 20,
      maxParticles: 300, // 与 rewards.chest.fireworks.maxParticles 一致，此处为全局引用值
      idleStopSec: 5, // app.js 现有实现值（原字面量 IDLE_TIMEOUT_MS = 5000），本卡起改由此处驱动
      disallowShadowBlur: true,
      // WTJ-20260706-005：可复用奖励烟花/粒子系统（app/web/reward-fireworks.js）的性能分档，
      // 三来源之一（另两个是模块内自适应单向降级 + _setTier() 测试钩子，见该文件文件头「性能
      // 红线」一节）。'old_mac' | 'normal' | 'burst'，默认 'normal'；不做 UA/机型嗅探（真实
      // WKWebView 上不可靠也不可测），与 idleStopSec/maxParticles 同处收拢，供 QA/未来配置面板
      // 统一调整。'burst' 档目前只有 chest-open（molten-fountain）会用到。
      particleTier: 'normal',
      targetMachine: {
        model: '2014 MacBook Air',
        ramGB: 4,
        gpu: 'Intel HD5000',
        os: 'macOS Big Sur 11'
      },
      // WTJ-20260706-013：kiosk 儿童 app 是否尊重 OS 的 prefers-reduced-motion（"减弱动态"）
      // 偏好。默认 false=不尊重，核心学习动画（frame-anim 的 door/faucet/horse/lamp、
      // letter-motion、keyvisual、reward-fireworks 等）一律照播，不因为 OS 偏好而只画静止的
      // 首帧/末帧。根因：QA 在旧机（2014 MacBook Air / Big Sur）上确认系统"减弱动态"默认开启
      // （com.apple.universalaccess reduceMotion=1），这是该系统版本的默认值，并非 Justin
      // 为这台 kiosk 主动选择的偏好——对一个单一用途、儿童向的学习 kiosk 而言，让核心反馈动画
      // 因系统默认值而失效是不可接受的（非崩溃非死循环，但等于"核心学习动画不动"）。将来若要
      // 支持家长在设置面板里主动选择"减弱动态"，把这里改回 true 即可恢复尊重 OS 偏好——四个
      // 动画模块（frame-anim.js/letter-motion.js/keyvisual.js/reward-fireworks.js）各自的
      // prefersReducedMotion() 都以此字段为唯一开关（见各文件同名函数顶部的守卫），CSS 侧则由
      // index.html 内联启动脚本按此字段给 <html> 打 data-wtj-motion-forced 属性、6 份 CSS 的
      // @media (prefers-reduced-motion: reduce) 规则相应加 html:not([data-wtj-motion-forced])
      // 门（见 hud.css/parent-controls.css/reward-chest.css/task-templates.css/
      // status-rewards.css/secretword.css）。diag.js 的 prefersReducedMotionProbe() 不受此
      // 字段影响，继续如实上报 OS 原始状态供诊断。
      honorReducedMotion: false
    }

  };

  window.WTJ_MANIFEST = deepFreeze(MANIFEST);
})();
