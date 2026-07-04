# 任务/鼠标/奖励 E2E 集成用例集（WTJ-20260704-021）

被测：`app/web/` 的 task.js(013)、task-templates.js(014)、pointer.js(012)、
status-rewards.js(015)、reward-chest.js(011)（+ 依赖 slots/keyboard/secret/manifest），
验证提交 `9a455e6`。

## 分层与本卡定位

- **单元层（TL 已交付）**：`tests/unit/*.test.mjs` 共 **150 断言全过**（QA 已在交付提交独立复跑，
  证据 `tests/reports/appshell_021_tl_units.log`）。每模块用 node:vm 隔离加载、**其它模块 stub**，
  覆盖 4 类任务完成判定、拖拽落点、生命周期时序（假时钟）、20 键淡出、pointer 衰减、宝箱粒子、
  状态灯 streak，含各模块 Fable 对抗评审的 P1/P2 回归。QA 不重复这层。
- **E2E 集成层（本卡 QA 交付）**：`tests/e2e/task_reward_integration.py`。单测 stub 掉了跨模块事件，
  故**真实全栈加载时的 wiring** 是缺口——本文件加载完整模块栈（index.html 顺序）验证奖励链真的接通。
- **视觉层**：动效帧序列视觉质量**待 WTJ-20260704-056（动画 runtime）**完成后单独视觉验收，本卡不覆盖。

## E2E 集成用例（3，全过）

用每模块的 `_setClock` 钩子注入**共享虚拟时钟**，快进驱动 2.6s 宝箱序列，无需真等。

| ID | 测什么 | 怎么算过 |
|---|---|---|
| INT-SMOKE-full-stack-loads | 9 个引擎按 index.html 顺序全栈加载 | 全部 window.WTJ_* 在场且 Object.isFrozen，零 console error/pageerror |
| INT-CHEST-slots-full-drives-chest | **真实 slots→宝箱 wiring**（单测 stub 了 onFull） | 打 5 个秘密词填满→onFull→reward-chest playing=true；快进 +3s→onChestComplete 恰 1 次 + WTJ_SLOTS.reset() 使五槽清空(occupied=0) + playing=false |
| INT-STATUS-wiring-live | **真实 task→status→今日工作完成 wiring** | 经真实问号→任务流驱动完成 3 个 press 任务→status streak=3(threshold=3)→onWorkComplete 触发 1 次 |

## 对抗/变异自检

`--self-check`：变异切断 reward-chest 对 `WTJ_SLOTS.onFull` 的订阅（severed）→ INT-CHEST **正确报红**
（chestComplete=0、五槽不清空 occupied=5）——证明 INT-CHEST 真的测到 slots→宝箱这条边，非假过。

未另起 3-agent 对抗工作流：(a) TL 已对每模块做 Fable 对抗评审（单测含 P1/P2 回归），(b) 本 E2E 是薄
wiring 层且关键边已过变异自检，(c) 避免与 020 同类的过度投入。

## 已知边界 / 后续

- **视觉动效 E2E 待 056**：宝箱烟花/开箱帧序列、状态灯连闪、任务道具动画的视觉质量待动画 runtime
  交付后做截图 + agentic 视觉验收（归本卡后续复测或并入 023）。
- INT-STATUS 的非 press 任务（drag/click/find）完成需 pointer 几何坐标驱动，其完成判定已由 TL
  task-templates 单测逐类型覆盖；本 E2E 用 press 类型验证 task→status 整链接通即足够。
- 鼠标反馈衰减（REQ-PTR）在 pointer 单测充分覆盖；如需 E2E 级衰减-恢复曲线，可后续补。
