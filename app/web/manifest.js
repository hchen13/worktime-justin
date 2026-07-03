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
        weakOrNoReward: ['Meta', 'Alt', 'Control', 'Shift'] // KeyboardEvent.key 命名，Meta = Command
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
      // 扩展说明：当前 pool 仅落地"首批 8 词"，对应已验收 sprite（卡 WTJ-20260703-007，v3 生产基准，
      // REQ-AST-12）。扩展到约 100 词规模属于后续词池 / 素材卡范畴（对应 docs/index.html #open
      // 待确认项「第一批词池和每个词对应素材」）；新增词池条目的步骤见 app/web/MANIFEST.md。
      //
      // 已知差异（据实记录，不在本卡自行裁决）：docs/index.html #secret 词池规模段落下方给出的示例词
      // 标签是 dog / cat / apple / ball / moon / star / car / zoo（8 个，仅作规模示意，覆盖不同字母），
      // 与本卡实际可用的"首批 8 词对应已验收 sprite"集合不完全一致 —— 已验收 sprite 是
      // dog / cat / apple / ball / star / car / basket / treasure-chest（REQ-AST-12）。
      // 其中 basket、treasure-chest 两个 sprite 在 docs/index.html 素材章节中原本对应的是
      // REQ-AST-05（任务物件：篮子）与 REQ-AST-06（宝箱），而非 REQ-AST-04（秘密词对应物体）；
      // moon、zoo 两词目前没有对应 sprite。本卡按 TL 架构指令「首批 8 词对应已验收 sprite」执行，
      // 采用 basket / treasure-chest 作为词池条目，但这属于已验收素材复用而非文档原意的秘密词示例，
      // 请 PM / DESIGN 在词池扩展卡或 016 音频供给卡之前确认是否保留 basket / treasurechest 作为
      // 正式秘密词，或改为任务专用素材、另行补齐 moon / zoo 的 sprite。
      pool: [
        { word: 'dog', spriteFile: 'sprites/dog.png', audioFile: 'audio/words/dog.m4a' },
        { word: 'cat', spriteFile: 'sprites/cat.png', audioFile: 'audio/words/cat.m4a' },
        { word: 'apple', spriteFile: 'sprites/apple.png', audioFile: 'audio/words/apple.m4a' },
        { word: 'ball', spriteFile: 'sprites/ball.png', audioFile: 'audio/words/ball.m4a' },
        { word: 'star', spriteFile: 'sprites/star.png', audioFile: 'audio/words/star.m4a' },
        { word: 'car', spriteFile: 'sprites/car.png', audioFile: 'audio/words/car.m4a' },
        { word: 'basket', spriteFile: 'sprites/basket.png', audioFile: 'audio/words/basket.m4a' },
        { word: 'treasurechest', spriteFile: 'sprites/treasure-chest.png', audioFile: 'audio/words/treasurechest.m4a' }
      ],
      // 上述 8 条 audioFile 均为约定路径 stub：授权语音 / 音效素材尚未到位，
      // 由音频供给卡（016，命名沿用本文件 WTJ-20260704-016）交付 .m4a 文件后落地，
      // 届时无需改动路径，只需补齐对应文件（见 REQ-AST-08 / REQ-AST-09）。
      audioNotDelivered: true,
      audioSupplyCard: 'WTJ-20260704-016'
    },

    // =====================================================================
    // slots —— 对应 docs/index.html #slots（域码 SLOT，REQ-SLOT-01 ~ 04）
    // =====================================================================
    slots: {
      // REQ-SLOT-01：五个发现槽；秘密词命中或键盘探索里程碑之一会点亮其中一格。
      count: 5,
      // REQ-SLOT-01 / REQ-SEC-07：当前五格内不重复；同一来源（同词或同一里程碑级别）
      // 在同一轮内重复命中只给小反馈，不再占用新格。
      noDuplicateSourceWithinRound: true,
      // REQ-SLOT-03 / REQ-SLOT-04：发现槽来源枚举。
      // 'keyboard-milestone' 对应的具体阈值见 keyboard.effectiveKeyMilestones（[100, 200]），
      // 此处不重复定义数值，避免单一事实来源分裂。
      sources: ['secret-word', 'keyboard-milestone'],
      // REQ-SLOT-04：建议秘密词命中显示为对应对象图标，键盘里程碑显示为抽象「键盘星星」图标。
      sourceIconHint: {
        'secret-word': 'sprite: 对应命中词的物体 sprite（见 secretWords.pool[].spriteFile）',
        'keyboard-milestone': 'sprite: states/keyboard-star.png（stub，素材未到位，待素材卡供给）'
      },
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

      // REQ-TASK-10：按键任务仅字母/数字，不做复杂组合键。
      pressTask: {
        allowedKeyTypes: ['alpha', 'digit'],
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
            successAnimation: 'string（可选），成功动画标识'
          },
          examples: [
            {
              id: 'drag-apple-to-basket',
              objectSprite: 'sprites/apple.png',
              targetSprite: 'sprites/basket.png',
              voicePrompt: 'audio/tasks/drag-apple-to-basket.m4a', // stub，待 016 卡供给
              successAudio: 'audio/sfx/task-success.m4a', // stub，待 016 卡供给
              successAnimation: 'bounce-in'
            },
            {
              id: 'drag-dog-home',
              objectSprite: 'sprites/dog.png',
              targetSprite: 'sprites/doghouse.png', // stub，狗窝素材未到位（REQ-AST-05），待素材卡供给
              voicePrompt: 'audio/tasks/drag-dog-home.m4a', // stub
              successAudio: 'audio/sfx/task-success.m4a', // stub
              successAnimation: 'bounce-in'
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
            successAnimation: 'string（可选）'
          },
          examples: [
            {
              id: 'click-lamp-on',
              targetSprite: 'sprites/lamp-off.png', // stub，灯具素材未到位（REQ-AST-05），待素材卡供给
              targetSpriteActive: 'sprites/lamp-on.png', // stub
              voicePrompt: 'audio/tasks/click-lamp-on.m4a', // stub
              successAudio: 'audio/sfx/task-success.m4a', // stub
              successAnimation: 'glow-pulse'
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
            successAudio: 'string'
          },
          examples: [
            {
              id: 'find-the-dog',
              targetSprite: 'sprites/dog.png',
              distractorSprites: ['sprites/cat.png', 'sprites/ball.png'],
              voicePrompt: 'audio/tasks/find-the-dog.m4a', // stub
              hoverSec: 1,
              pressOrHoverAlsoCompletes: true,
              successAudio: 'audio/sfx/task-success.m4a' // stub
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
          examples: [
            {
              id: 'press-letter-a',
              targetKey: 'A',
              voicePrompt: 'audio/tasks/press-a.m4a', // stub
              successAudio: 'audio/sfx/task-success.m4a' // stub
            },
            {
              id: 'press-digit-3',
              targetKey: '3',
              voicePrompt: 'audio/tasks/press-3.m4a', // stub
              successAudio: 'audio/sfx/task-success.m4a' // stub
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
        // 属于「代码生成」类素材，不为每种效果准备贴图），预设「满天星、打铁花、圆形、星形」等类型；
        // 颜色从少量高质量色板出发做 HSL / HSV 微调，不做完全 RGB 随机。
        fireworks: {
          reqIds: ['REQ-RWD-03', 'REQ-AST-02'],
          generationMethod: 'canvas-or-svg-code',
          presetTypes: ['starfield', 'sparkler', 'circle', 'star'], // 满天星 / 打铁花 / 圆形 / 星形
          colorStrategy: 'small-curated-palette-hsl-hsv-jitter', // 少量高质量色板 + HSL/HSV 微调
          // 以下两项为性能红线，来自技术评审结论（目标机 4GB 内存 / HD5000 核显预算，
          // 详见 app/README.md「技术栈」），docs/index.html 未给出具体数值，不对应 REQ ID。
          maxParticles: 300,
          disallowShadowBlur: true
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
      targetMachine: {
        model: '2014 MacBook Air',
        ramGB: 4,
        gpu: 'Intel HD5000',
        os: 'macOS Big Sur 11'
      }
    }

  };

  window.WTJ_MANIFEST = deepFreeze(MANIFEST);
})();
