# KBD/SECRET/SLOTS 脚本化回归用例集（WTJ-20260704-020）

被测：`app/web/keyboard.js`（WTJ_KEYBOARD, 008）、`secretword.js`（WTJ_SECRET, 009）、
`slots.js`（WTJ_SLOTS, 010），验证提交 `e5b358a`。
资产：`tests/e2e/kbd_secret_slots_regression.py`（可复用，31 用例）。
报告：`tests/reports/kbd_secret_slots_report.json`。

## 怎么测

Headless Chromium 加载三模块（顺序 slots→keyboard→secret，与源文件头一致），
注入**受控 manifest 词池**（dog/apple/car/scar/hot/star，里程碑 [100,200]）+ WTJ_AUDIO stub，
派发真实 `KeyboardEvent`（可控 `.repeat`）驱动完整 keyboard→secret→slots 链，
断言三个冻结 API 的输出（计数/事件/槽位快照）。

**为何注入受控词池而非用线上 8→100 词池**：这是*引擎*回归，不能因*词表*扩展而挂。
受控池覆盖每条匹配规则；另有 REAL-01 用线上 `manifest.js` 词池确认 wiring 不因加载顺序/
配置断裂。退出码 0 全过 / 1 有失败 / 2 基础设施错误。

## 用例（31）

**键盘 008（KBD-01~10）**：普通字母→onLetter+计数；长按 e.repeat 全忽略；同键 streak>3 第4次暂停；
换键重置 streak；功能键 light/weak/other 三类分类 + 强度衰减到 0 且非负钳位 + 永不计数；
大小写不敏感的同键 streak（A/a/A/a）；数字键走 onLetter。

**秘密词 009（SEC-01~10）**：DOG 大小写等价；xxdogxx 子串末尾命中；dogg 重叠只触发一次；
apple 双写不惩罚；scar 最长优先（不触发 car）；hotdog 复合独立双触发；hotdogcar 三触发 + scarcar；
同轮同词→minorHit；resetRound 后同词恢复大反馈；无 DOM 回显（无 input/textarea，buffer 不进可见 DOM）；
超长前缀后 buffer 裁剪不破坏尾部命中。

**五槽 010（SLOT-DEDUP-DIRECT / SLOT-01~06）**：**直接**调 fillSlot 验证 slots.js 去重契约
（同 source+itemKey 去重、不同 source 同 itemKey 各占槽）；端到端秘密词命中的 renderState.spriteUrl
（assets/ 前缀映射）+ 音效 + sprite 叠层；键盘里程碑 100 点槽 + renderState.milestone；
第二里程碑 200 各占独立槽；满 5 槽 onFull 恰一次 + 满后拒填；reset 清空 + 开新轮 + 重启里程碑。

**线上 wiring（REAL-01）**：线上 manifest.js 词池打真实词确认命中链路。

**产品特征化（PROD-01/02，见下"产品发现"）**：用真实 reset 契约锁定当前跨轮行为。

## 对抗评审（一轮：2 tester + 1 adversary）

初版 19 用例经对抗评审发现并修复的问题（变异实证）：
- **[blocker 假过] 五槽去重**：初版 SLOT-01 名义测"五槽去重"，但变异证明——禁用 slots.js
  `findDuplicateIndex`（return -1）仍全绿。因为它观察到的去重是 secretword 上游 roundHitSet
  产生的（第二个 dog 是 minorHit 根本没调 fillSlot）。已加 SLOT-DEDUP-DIRECT 直接测 fillSlot，
  变异复验：禁用去重 → 该用例正确 FAIL。
- **[major 假过] renderState/sprite 路径未断言**：变异 resolveSpritePath（assets/→WRONG/）仍全绿。
  已加 renderState.spriteUrl 断言，变异复验正确 FAIL。
- **[major 隔离] SLOT-04 继承 SLOT-03 满槽状态**（自身打字全是 minorHit），已加起始 reset()。
- **[must 覆盖缺口] 200 里程碑 + 功能键 weak/other 分类**未测（直接命中卡验收标准2/3），已补。
- **[隔离] filler '0' 掩盖真实跨轮行为**：初版 reset 的 '0' 分隔符结构性掩盖了 PROD-01/02，
  已加用真实 reset 契约的 PROD 用例暴露它们。

变异验证：dedup / spritepath / milestone 三处改坏均被新用例正确捕获；onFull guard 变异不可观测
（满槽时 fillSlot 提前 return，guard 与之冗余——记为代码卫生观察，非功能缺陷）。

## 产品发现（交 PM 裁决，非测试缺陷）

引擎 31/31 全绿，但对抗评审在**产品**层发现 3 处跨轮/耦合行为，已用特征化用例锁定当前行为
（若 PM 裁定为 bug 且 TL 修复，对应断言翻转）：

1. **[major] PROD-01 跨轮 buffer 未清** ✅ **已由 WTJ-20260704-066 修复**：`WTJ_SLOTS.reset()`
   （011 开新一轮契约）原先清了槽位/008 计数/009 roundHitSet，但**没清 009 的 rolling buffer**。
   轮次边界前打的半个词会在新一轮"续上"：打 `do` → reset → 只打 `g` → 误命中 `dog`。
   066 在 `resetRound()` 一并清 buffer；本文件对应特征化用例断言已翻转为 hits=[]（不再误命中）。
2. **[minor] PROD-02 暂停键的字母也从 secret buffer 丢失**：streak>3 被暂停的 alnum 键在
   `handleAlnumKey` 里 `return` 早于 `emit(onLetter)`，故该字母不进 secret buffer——含 4+ 连续
   相同字母的词永不可命中（当前词池无此类词，影响低）。
3. **[minor] streak 状态 survive reset**：`resetEffectiveKeyCount` 按设计不清 lastKeyId/sameKeyStreak，
   新一轮首键若与上一轮末键相同会被静默吞掉（计数与 buffer 双丢）。与 PROD-01 同根：reset 未清流式输入态。

## 已知边界

- REQ-KB-03/04（字母淡出/渲染方式）属 app.js 渲染域，不在这三引擎单元可测范围。
- 受控池无 4+ 连续同字母词，PROD-02 用 buffer 特征化间接验证。
- 真机键盘硬件重复率/事件时序差异不在无头范围（若需，归 022 真机冒烟）。
