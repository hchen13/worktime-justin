# CN-TASK-DRAFT — WorkTime Justin 中文任务语音文案草案

**卡片**：WTJ-20260705-004 Phase A 产出物
**状态**：**DRAFT — 待 Ethan 批准后才进 Phase B**（本文件不进 app 运行时目录，只供 TL / Ethan 审阅拍板）
**性质澄清**：本卡只产出「**文案文本草案 + 接线代码 + 单元测试**」，**不生成任何中文语音 .m4a 音频**——中文音频的全量重生成是 084 卡的事，本卡范围之外。
**日期**：2026-07-05

---

## 0. 最重要的红线：完整句，禁止运行时拼接

本草案里的每一条中文任务提示，都是**一整条独立、预生成的完整句子**，作为一个不可分割的音频单元。

- ✅ 正确：`find-the-dog` 对应一条完整音频，念「找到小狗！」。
- ❌ 禁止（反模式）：运行时用 `audio.js` 的 `playComposite()` 把片段「找到」和词条 `dog`（或中文「小狗」）**拼接**播放。
- ❌ 禁止（反模式）：中英混拼，如「找到 dog」。

**理由**（TL 综合裁定）：074 英文版 TTS 脚本里那套 `phrases`（"Find the" + word）合成片段设计，是**英文语境**下才成立的；中文语境下机械拼接「找到」+ 名词会产生生硬、不自然、甚至语序错误的儿童语音，损害 3 岁目标用户的语音体验。因此：

1. `app/scripts/tts-text-manifest.zh.json` **没有 `phrases` 段落**，只有 `tasks` 段落，每个 taskId 一条完整句。
2. 每条 find 任务的语音**只念 target，绝不念 distractor**（与 REQ-TASK-09 既有约束一致：寻找的过程本身才是任务，语音不能替孩子提前排除干扰项）。
3. Phase B 实际接线时，`manifest.js` 对应 example 的 `voicePrompt` 直接指向这条完整句的 out 路径，运行时一次性播放，不经过任何拼接逻辑。

> **追加（WTJ-20260707-003，TL 综合裁定，唯一例外）**：上面的"禁止运行时拼接"红线约束的是**这份文案草案里的 24 条整句、以及 011 卡交付的 100 条秘密词词卡**——每条都必须是独立预生成的完整素材，这一点不变。但 WTJ-20260706-012 之后，find 类找物任务的目标词已经改为**随机 word-card 抽取**（target/distractor 从 100 词秘密词池任意组合，见 `app/web/task-templates.js` `drawWordCardFind()`），词间任意组合根本不可能穷举预生成"找到 X！"这类整句。Ethan 反馈"只念词卡本身"（如单独念「小狗」）体验上不如 EN 模式"Find the dog"完整，因此 TL 裁定新增一条**唯一、固定**的引导语「找到」（`audio/phrases/find.zh.m4a`，ASR-gated 生成，见 `missing-audio.json` `compositePhrasesZh`），运行时用 `playComposite()` 与目标词已交付的中文词卡音频（`audio/words/<word>.zh.m4a`）组合播放。这是"引导语 + 已各自独立验收的词卡"两段固定素材的组合，不是"临时拼出一条不可穷举的新整句"，也不产生中英混拼（两段都是纯中文）——因此判定为与上面红线的立论前提（"完整句不能被拆解成不通顺的碎片"）不冲突的可控例外，且**仅限这一处**（find 任务开始的任务说明音频），不代表本文件 24 条任务整句或 011 的词卡素材本身可以被拆分/替换为拼接方案。

---

## 1. 24 条任务句（按类别）

数据源：`app/scripts/tts-text-manifest.zh.json`（本次同批提交的 Phase B 骨架文件），逐条对应 `app/web/manifest.js` `tasks.templates` 四类共 24 条 example。

### 1.1 放置类 / 拖拽（drag，2 条，REQ-TASK-07）

| taskId | 中文全句 | 对应英文 learningWord | 用途 |
|---|---|---|---|
| `drag-apple-to-basket` | 把苹果放进篮子里！ | apple → basket | 把可拖物体（苹果）拖到放置目标（篮子）。旁边有装饰性干扰物 banana/orange，语音不提及。 |
| `drag-dog-home` | 把小狗带回家！ | dog → doghouse | 把小狗拖回窝。旁边有装饰性干扰物 cat，语音不提及。 |

### 1.2 点击类（click，3 条，REQ-TASK-08）

| taskId | 中文全句 | 对应英文 learningWord | 用途 |
|---|---|---|---|
| `click-lamp-on` | 点亮小台灯！ | lamp | 点一下台灯，帧动画 off→turning-on。 |
| `click-faucet-off` | 关掉水龙头！ | faucet | WTJ-20260706-009 语义翻转：初始画面帧动画 running（水一直流），点一下水龙头，帧动画 running→closing（关水，播完定格在关水帧）。此前 `click-faucet-on`「打开水龙头！」是反的，已改正。 |
| `click-horse-run` | 让小马跑起来！ | horse | 点一下小马，帧动画 idle→run。 |

### 1.3 寻找类（find，12 条，REQ-TASK-09 · pt2 从 1 条扩到 12 条）

每条只念 target；distractor 组合见第 3 节。

| taskId | 中文全句 | 对应英文词（learningWord） | 用途 |
|---|---|---|---|
| `find-the-dog` | 找到小狗！ | dog | 悬停 1s 或点一下命中目标。 |
| `find-the-cat` | 找到小猫！ | cat | 同上 |
| `find-the-apple` | 找到苹果！ | apple | 同上 |
| `find-the-star` | 找到星星！ | star | 同上 |
| `find-the-fish` | 找到小鱼！ | fish | 同上 |
| `find-the-elephant` | 找到大象！ | elephant | 同上 |
| `find-the-pig` | 找到小猪！ | pig | 同上 |
| `find-the-rocket` | 找到火箭！ | rocket | 同上 |
| `find-the-turtle` | 找到小乌龟！ | turtle | 同上 |
| `find-the-unicorn` | 找到独角兽！ | unicorn | 同上 |
| `find-the-whale` | 找到鲸鱼！ | whale | 同上 |
| `find-the-zebra` | 找到斑马！ | zebra | 同上 |

### 1.4 按字母类（press · alpha，4 条，REQ-TASK-10）

| taskId | 中文全句 | 对应字母（targetKey） | 用途 |
|---|---|---|---|
| `press-letter-a` | 按下字母 A！ | A | 键盘匹配大写字母。 |
| `press-letter-b` | 按下字母 B！ | B | 同上（pt3 新增） |
| `press-letter-s` | 按下字母 S！ | S | 同上（pt3 新增） |
| `press-letter-m` | 按下字母 M！ | M | 同上（pt3 新增） |

### 1.5 按数字类（press · digit，3 条，REQ-TASK-10）

| taskId | 中文全句 | 对应数字（targetKey） | 用途 |
|---|---|---|---|
| `press-digit-3` | 按下数字 3！ | 3 | 键盘匹配数字。 |
| `press-digit-5` | 按下数字 5！ | 5 | 同上（pt3 新增） |
| `press-digit-7` | 按下数字 7！ | 7 | 同上（pt3 新增） |

---

## 2. 词库覆盖范围与缺口

### 2.1 target / learningWord 全部命中 secretWords.pool（零新增美术、零新增英文音频）

本卡的一条硬约束是**零新增素材**：所有 find target、drag learningWord、click learningWord 用到的英文词，都**必须**能在 `app/web/manifest.js` `secretWords.pool`（101 词，103 张已交付 sprite，101 条已交付英文 .m4a）里找到同名词条。

本草案用到的英文词（去重）：apple, dog, cat, star, fish, elephant, pig, rocket, turtle, unicorn, whale, zebra, lamp, faucet, horse。**全部在 pool 内已核对命中**。distractor 用到的 banana, orange, moon, sun, frog, duck, lion, monkey, goat, koala, robot, rainbow, octopus 也全部在 pool 内。

### 2.2 中文任务音频缺口（Phase B 待补，本卡不生成）

24 条中文任务句的 .m4a **一条都还没生成**（本卡只出文本草案）。Phase B 阻塞于：
- **Ethan**：中文文案定稿（本文件即待审对象）。
- **084**：全量中文音频重生成管线产出真实 .m4a。

### 2.3 词库扩展提议（供 Ethan 参考，非本卡实现）

现有 12 条 find 已覆盖 12 个高辨识度儿童词；pool 里还有 ~89 个词可扩展成更多 find 任务（如 banana/moon/sun/frog/duck/lion/monkey/rocket/train/rainbow…）。是否扩展、扩到多少条，建议 Ethan 结合中文语音生成成本（每条一条完整句）与产品多样性需求裁定——每新增一条 find example 就多一条中文完整句要生成，句数需可控。

---

## 3. distractor 组合（仅视觉干扰，语音永不提及）

drag/find 的 `distractorSprites` 只提供视觉干扰，不注册 pointer target、不参与判定、语音里不出现。组合原则：选与 target 同类或形近的词，增加辨识挑战但不误导。

| 任务 | target | distractor 组合 |
|---|---|---|
| drag-apple-to-basket | apple | banana, orange |
| drag-dog-home | dog | cat |
| find-the-dog | dog | cat, ball |
| find-the-cat | cat | dog, duck |
| find-the-apple | apple | banana, orange |
| find-the-star | star | moon, sun |
| find-the-fish | fish | frog, duck |
| find-the-elephant | elephant | lion, monkey |
| find-the-pig | pig | goat, koala |
| find-the-rocket | rocket | robot, rainbow |
| find-the-turtle | turtle | duck, frog |
| find-the-unicorn | unicorn | horse, zebra |
| find-the-whale | whale | fish, octopus |
| find-the-zebra | zebra | horse, unicorn |

---

## 4. press 字母 / 数字集（当前 7 条 + 扩展提议）

- **当前已落地（pt3）**：字母 A / B / S / M；数字 3 / 5 / 7。
- **提议扩展集**（Ethan 裁定是否加）：
  - 字母：可覆盖更多首字母（如 C/D/E/…），每个字母一条完整中文句「按下字母 X！」。
  - 数字：0–9 完整覆盖，每个一条「按下数字 N！」。
  - 约束：仅单字母 / 单数字，不做组合键（REQ-TASK-10 `complexComboAllowed: false`）；每条一条完整中文句，句数需可控。

---

## 5. out 路径命名（待 Phase B 定案的记录在案偏离）

`tts-text-manifest.zh.json` 的 `out` 用 `audio/tasks/<id>.zh.m4a`（同目录 + `.zh` 语言后缀），**不是**卡片原文示例的 `audio/tasks/<id>.m4a`——因为后者当前已经是**英文**语音（074/078 已交付），中文直接复用会覆盖英文。最终采用哪种目录 / 命名约定（如改成独立目录 `audio/tasks-zh/`）由 Ethan / TL 在 Phase B 正式定案，届时 out 值可能需要同步调整。

---

## 6. 审批清单（请 Ethan 逐项确认）

- [ ] 24 条中文全句文案是否符合 3 岁儿童语音习惯（用词、语气、断句）。
- [ ] find 类是否需要更多 / 更少目标（当前 12 条）。
- [ ] press 字母 / 数字集是否需要扩展（当前 7 条）。
- [ ] distractor 组合是否合理（不误导、有挑战）。
- [ ] out 路径 `audio/tasks/<id>.zh.m4a` vs 独立目录，哪种命名进 Phase B。
- [ ] 「完整句、禁止运行时拼接」原则是否确认采纳（这直接决定 Phase B 不引入中文 composite phrases）。
