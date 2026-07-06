// 本文件由 app/scripts/build-anim-assets.sh 自动生成，请勿手工编辑——
// 重新生成：cd app && ./scripts/build-anim-assets.sh
//
// WTJ-20260704-056 — 降采后的道具帧动效 manifest（window.WTJ_ANIM_MANIFEST）。
// 数据来源：docs/assets/production-animations-v1/manifest.json（faucet/horse/lamp）
// 与 docs/assets/production-animations-v1/treasure-chest/manifest.json（顶层 manifest
// 未收录 treasure-chest，见该卡自身 manifest.json 的 scope_note）。
//
// prop 列表由构建脚本数据驱动：从顶层 manifest 的 assets 键 + 各独立子目录 manifest.json
// 自动发现，唯一门禁是顶层 manifest 的 v1_boundary.deferred_to_v2（命中的 prop 跳过、不写入
// 本文件）。当前 deferred_to_v2 为空 —— WTJ-20260705-025 把 door/bell 的 v1 动画（各自
// 已 DESIGN 验收，卡 WTJ-20260704-030 门 / -031 铃）从 deferred_to_v2 移入 included 并接入
// 运行时引擎，故本文件现含 faucet/horse/lamp/treasure-chest/door/bell 全部 6 个 prop。
// frame-anim.js 对未出现在这里的 prop 仍走防御式回退（静态 img 占位）；若未来再暂缓某 prop，
// 把它加回 deferred_to_v2 重跑本脚本即可，**无需改脚本任何逻辑**。
//
// 每个 state 的字段：
//   sheetPath   相对 app/web/ 的运行时路径（256px cell 降采后的 strip sheet）。
//   frameCount  该 state 的帧数 = 该 strip sheet 的实际 cell 数（= 降采后 sheet 宽度 /
//               cellSize，也 = 源 sheet 宽度 / 高度）。**以 sheet 的 cell 数为权威**，不是
//               源 manifest 的 frames[] 数组长度——引擎逐 cell blit，sheet 有几个 cell 就是
//               几帧；两者本应一致，源素材偶发漂移时构建脚本会打印 WARNING 并以 sheet 为准。
//   fps         源 manifest 给出的播放帧率。
//   loop        源 manifest 给出的是否循环（frame-anim.js 的 play() 调用方可用
//               opts.loop 覆盖这个默认值，见 FRAME-ANIM-API.md）。
//   anchor      源 manifest 给出的 [x,y] 锚点（0-1 归一化），本卡暂未消费（预留
//               给未来需要精确对齐锚点的场景），仅透传保留。
//   cellSize    降采后每帧正方形 cell 的边长（像素），当前固定 256。

(function () {
  'use strict';

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

  var DATA = {
  "bell": {
    "idle": {
      "sheetPath": "assets/anim/bell/idle-sheet.png",
      "frameCount": 1,
      "fps": 1,
      "loop": false,
      "anchor": [
        0.5,
        0.82
      ],
      "cellSize": 256
    },
    "ring": {
      "sheetPath": "assets/anim/bell/ring-sheet.png",
      "frameCount": 6,
      "fps": 14,
      "loop": true,
      "anchor": [
        0.5,
        0.82
      ],
      "cellSize": 256
    },
    "settle": {
      "sheetPath": "assets/anim/bell/settle-sheet.png",
      "frameCount": 4,
      "fps": 10,
      "loop": false,
      "anchor": [
        0.5,
        0.82
      ],
      "cellSize": 256
    }
  },
  "door": {
    "closed": {
      "sheetPath": "assets/anim/door/closed-sheet.png",
      "frameCount": 1,
      "fps": 1,
      "loop": false,
      "anchor": [
        0.5,
        0.86
      ],
      "cellSize": 256
    },
    "open": {
      "sheetPath": "assets/anim/door/open-sheet.png",
      "frameCount": 1,
      "fps": 1,
      "loop": false,
      "anchor": [
        0.5,
        0.86
      ],
      "cellSize": 256
    },
    "opening": {
      "sheetPath": "assets/anim/door/opening-sheet.png",
      "frameCount": 5,
      "fps": 10,
      "loop": false,
      "anchor": [
        0.5,
        0.86
      ],
      "cellSize": 256
    }
  },
  "faucet": {
    "closed": {
      "sheetPath": "assets/anim/faucet/closed-sheet.png",
      "frameCount": 1,
      "fps": 1,
      "loop": false,
      "anchor": [
        0.5,
        0.78
      ],
      "cellSize": 256
    },
    "closing": {
      "sheetPath": "assets/anim/faucet/closing-sheet.png",
      "frameCount": 6,
      "fps": 8,
      "loop": false,
      "anchor": [
        0.5,
        0.78
      ],
      "cellSize": 256
    },
    "off": {
      "sheetPath": "assets/anim/faucet/off-sheet.png",
      "frameCount": 1,
      "fps": 1,
      "loop": false,
      "anchor": [
        0.5,
        0.78
      ],
      "cellSize": 256
    },
    "running": {
      "sheetPath": "assets/anim/faucet/running-sheet.png",
      "frameCount": 6,
      "fps": 10,
      "loop": true,
      "anchor": [
        0.5,
        0.78
      ],
      "cellSize": 256
    }
  },
  "horse": {
    "idle": {
      "sheetPath": "assets/anim/horse/idle-sheet.png",
      "frameCount": 4,
      "fps": 6,
      "loop": true,
      "anchor": [
        0.5,
        0.86
      ],
      "cellSize": 256
    },
    "run": {
      "sheetPath": "assets/anim/horse/run-sheet.png",
      "frameCount": 8,
      "fps": 12,
      "loop": true,
      "anchor": [
        0.5,
        0.86
      ],
      "cellSize": 256
    },
    "stop_success": {
      "sheetPath": "assets/anim/horse/stop_success-sheet.png",
      "frameCount": 6,
      "fps": 9,
      "loop": false,
      "anchor": [
        0.5,
        0.86
      ],
      "cellSize": 256
    }
  },
  "lamp": {
    "off": {
      "sheetPath": "assets/anim/lamp/off-sheet.png",
      "frameCount": 1,
      "fps": 1,
      "loop": false,
      "anchor": [
        0.5,
        0.86
      ],
      "cellSize": 256
    },
    "on": {
      "sheetPath": "assets/anim/lamp/on-sheet.png",
      "frameCount": 1,
      "fps": 1,
      "loop": false,
      "anchor": [
        0.5,
        0.86
      ],
      "cellSize": 256
    },
    "turning-off": {
      "sheetPath": "assets/anim/lamp/turning-off-sheet.png",
      "frameCount": 5,
      "fps": 10,
      "loop": false,
      "anchor": [
        0.5,
        0.86
      ],
      "cellSize": 256
    },
    "turning-on": {
      "sheetPath": "assets/anim/lamp/turning-on-sheet.png",
      "frameCount": 6,
      "fps": 12,
      "loop": false,
      "anchor": [
        0.5,
        0.86
      ],
      "cellSize": 256
    }
  },
  "treasure-chest": {
    "closed": {
      "sheetPath": "assets/anim/treasure-chest/closed-sheet.png",
      "frameCount": 1,
      "fps": 1,
      "loop": false,
      "anchor": [
        0.5,
        0.85
      ],
      "cellSize": 256
    },
    "open": {
      "sheetPath": "assets/anim/treasure-chest/open-sheet.png",
      "frameCount": 1,
      "fps": 1,
      "loop": false,
      "anchor": [
        0.5,
        0.85
      ],
      "cellSize": 256
    },
    "opening": {
      "sheetPath": "assets/anim/treasure-chest/opening-sheet.png",
      "frameCount": 5,
      "fps": 10,
      "loop": false,
      "anchor": [
        0.5,
        0.85
      ],
      "cellSize": 256
    },
    "reward-pop": {
      "sheetPath": "assets/anim/treasure-chest/reward-pop-sheet.png",
      "frameCount": 7,
      "fps": 12,
      "loop": false,
      "anchor": [
        0.5,
        0.85
      ],
      "cellSize": 256
    }
  }
};

  window.WTJ_ANIM_MANIFEST = deepFreeze(DATA);
})();
