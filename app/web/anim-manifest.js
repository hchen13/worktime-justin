// 本文件由 app/scripts/build-anim-assets.sh 自动生成，请勿手工编辑——
// 重新生成：cd app && ./scripts/build-anim-assets.sh
//
// WTJ-20260704-056 — 降采后的道具帧动效 manifest（window.WTJ_ANIM_MANIFEST）。
// 数据来源：docs/assets/production-animations-v1/manifest.json（faucet/horse/lamp）
// 与 docs/assets/production-animations-v1/treasure-chest/manifest.json（顶层 manifest
// 未收录 treasure-chest，见该卡自身 manifest.json 的 scope_note）。
//
// 只包含 v1_boundary.included 的道具（当前 faucet/horse/lamp/treasure-chest）；door/bell 属于
// v1_boundary.deferred_to_v2（DESIGN 验收未通过，质量问题），本文件不包含它们的任何条目——
// frame-anim.js 对未出现在这里的 prop 一律走防御式回退（调用方 task-templates.js 对 door/bell
// 应回退静态 img 占位）。**prop 列表由构建脚本数据驱动**（从顶层 manifest 的 assets 键 + 各
// 独立子目录 manifest.json 自动发现，唯一门禁是 v1_boundary.deferred_to_v2）：DESIGN 完成
// door/bell 的 v2 质量返工验收、把它们从 deferred_to_v2 移除后，重跑本脚本即可自动纳入，
// **无需改脚本任何逻辑**。
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
