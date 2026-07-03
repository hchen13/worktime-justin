# WorkTime Justin Multi-Agent Workflow

## 1. Project Roles

The project has five named roles:

- Ethan: stakeholder. Clarifies product intent, accepts major direction changes, and answers questions that cannot be resolved from context.
- PM: product owner and coordinator. Owns requirement discussion, task breakdown, official Feishu card creation, cross-role routing, `main` branch version control, merge/commit/push on `main`, acceptance of TL/DESIGN/QA outputs, and blocker triage.
- TL: technical lead. Owns implementation cards assigned to TL and non-main branch version control.
- DESIGN: design owner. Owns visual exploration and image generation cards assigned to DESIGN.
- QA: quality owner. Owns test planning, automated/agentic testing, and test result cards assigned to QA.

PM and DESIGN are expected to be Codex threads. TL and QA are currently expected to be Claude Code sessions, but the protocol is role-based rather than tool-bound.

## 2. Feishu Board

Canonical board:

https://my.feishu.cn/wiki/QsKfwHvaDihj4QkTPMzclmQpnob?fromScene=spaceOverview&table=tblZfqKOydgqr7XS&view=vews2l5ddY

Use the role-specific Feishu app credentials in the project `.env`:

- PM: `PM_APP_ID`, `PM_APP_SECRET`
- TL: `TL_APP_ID`, `TL_APP_SECRET`
- DESIGN: `DESIGN_APP_ID`, `DESIGN_APP_SECRET`
- QA: `QA_APP_ID`, `QA_APP_SECRET`

Do not use another role's app identity for board writes. Feishu-side audit traces must identify the acting role.

## 3. Board Fields

The board is managed as a task card table. Fields are created idempotently by `.agents/tools/setup_feishu_board.py`.

Required fields:

- `编号`: stable card identifier. Format: `WTJ-YYYYMMDD-NNN`, for example `WTJ-20260703-001`. `WTJ` is the project prefix, the middle segment is the card creation date, and the final segment is a three-digit daily increment.
- `标题`: short card title.
- `状态`: one of `backlog`, `todo`, `in progress`, `review`, `testing`, `blocking`, `done`, `_deprecated`.
- `负责人`: current accountable role: `PM`, `TL`, `DESIGN`, `QA`, `Ethan`.
- `卡片类型`: `Requirement`, `Task`, `Design`, `Dev`, `QA`, `Blocker`, `Decision`, `Chore`.
- `优先级`: `P0`, `P1`, `P2`, `P3`.
- `模块`: product or technical area, such as `Product`, `UX`, `Canvas`, `Keyboard`, `Secret Words`, `Task Mode`, `Rewards`, `Assets`, `Audio/TTS`, `Packaging`, `Feishu/Process`, `Infra`.
- `概要`: concise context and intent.
- `验收标准`: concrete completion checks.
- `下一步动作`: the next physical action and who should do it.
- `评审负责人`: role expected to review next, when relevant.
- `QA结果`: `N/A`, `Not Started`, `Planned`, `Running`, `Pass`, `Fail`.
- `测试方式`: `N/A`, `Scripted`, `Agentic`, `Hybrid`.
- `测试类型`: `N/A`, `Unit`, `Frontend E2E`, `Visual`, `API E2E`, `Integration`.
- `测试资产路径`: reusable test script, fixture, or agentic test case prompt path.
- `测试覆盖范围`: what behavior, visual state, or regression surface the test covers.
- `对抗评审`: adversarial review status or evidence for the test case/test script.
- `阻塞负责人`: role expected to unblock, when relevant.
- `阻塞问题`: exact question or missing decision, when blocked.
- `依赖`: upstream card IDs or dependencies.
- `分支`: working branch, if any.
- `产物/证据`: PR, commit, screenshot, generated asset path, test report, or other proof.
- `最新进展`: concise human-written status note.
- `截止/检查点`: date for the next expected transition or review.

## 4. Card Creation And Routing Authority

PM is the single routing authority for official project work.

Rules:

- PM creates official task cards, assigns owners, and ensures each official card has a `编号`.
- Non-PM roles do not directly assign follow-up work to other roles.
- Non-PM roles may propose new work through the current card's `最新进展`, `下一步动作`, `产物/证据`, and Feishu comments.
- If a non-PM role must create a traceability card because the work would otherwise be lost, it must be created as a proposal only: `状态 = backlog`, `负责人 = PM`, and `下一步动作` must ask PM to triage it.
- PM decides whether a proposed card becomes real work, is merged into an existing card, is blocked for Ethan clarification, or is moved to `_deprecated`.

When TL, DESIGN, or QA finishes assigned work, they hand it back to PM:

- set `状态 = review`
- set `负责人 = PM`
- set `评审负责人 = PM`
- update `最新进展`, `下一步动作`, and `产物/证据`
- include defects, risks, test results, and recommended routing, but do not directly reassign the card to another role

PM then decides the next state and owner.

## 5. 状态流转

Normal flow:

`backlog -> todo -> in progress -> review`

PM review can route to:

- `testing` when QA validation is needed.
- `done` when the card is accepted.
- `todo` or `in progress` for rework, with PM assigning the owner.
- `blocking` when another role or Ethan must unblock it.
- `_deprecated` when the card is no longer needed.

QA testing returns to PM review:

`testing -> review -> done`

Allowed side paths:

- Any active status may move to `blocking` when progress needs another role or Ethan.
- `blocking` must move back to `todo` or `in progress` after the blocker is resolved.
- `review` may move back to `todo` or `in progress` if changes are required.
- `testing` must move back to `review` after QA reports pass/fail. PM decides whether defects go to `todo`, `in progress`, `blocking`, or `_deprecated`.
- Any non-`done` card may move to `_deprecated` only when PM decides it is no longer needed.

状态含义:

- `backlog`: captured but not ready. PM owns grooming.
- `todo`: ready to start, owner assigned, acceptance criteria clear.
- `in progress`: owner is actively working.
- `review`: work is delivered and awaiting PM routing or acceptance.
- `testing`: QA is validating a delivered change; after validation it returns to PM review.
- `blocking`: progress is stopped by a named blocker.
- `done`: accepted and no further work remains on this card.
- `_deprecated`: intentionally retired, not silently abandoned.

Whole-board completion:

- The project is considered complete only when every nonblank official card is in a terminal state: `done` or `_deprecated`.
- `backlog`, `todo`, `in progress`, `review`, `testing`, `blocking`, missing status, or any unknown status means the board is not complete.
- PM loop must run `.agents/tools/pm_completion_notify.py` after each board scan. If the board is complete, the tool sends Ethan a one-time Feishu direct message using PM app credentials and records local notification state under `.agents/state/` to avoid duplicate messages.
- If new active work appears after a completion notification, the notification state resets; the next all-terminal state may notify again.

## 6. No-Stale Rules

Every active card must have:

- `编号`
- `负责人`
- `状态`
- `验收标准`
- `下一步动作`
- `最新进展`

Additional rules:

- A card in `review` must have `负责人 = PM`, `评审负责人 = PM`, `下一步动作`, and `产物/证据`.
- A card in `testing` must have `负责人 = QA`, `QA结果`, `测试方式`, and `产物/证据`.
- A card in `blocking` must have `阻塞负责人`, `阻塞问题`, and `下一步动作`.
- A card that changes product behavior must either reference existing test coverage or create/update a QA card for test asset work.
- A blocked card cannot be used as storage for vague uncertainty. If the next step is obvious, assign it and move the card back to `todo` or `in progress`.
- A card that is no longer worth doing must become `_deprecated` with a short reason in `最新进展`.
- A role receiving a card must either accept it, return it with a concrete reason, or block it with a precise question. Do not leave it ambiguous.

## 7. Card Intake And Handoff

Every role starts by checking cards where `负责人` is that role, across all active statuses.

Minimum handling rules:

- `todo`: accept the card by moving it to `in progress`, or return/block it with a concrete reason.
- `in progress`: keep `最新进展` and `下一步动作` current.
- `review`: PM must accept, reject with required changes, route to QA, route to another role, block, or deprecate.
- `testing`: QA owns execution and result reporting.
- `blocking`: the named `阻塞负责人` owns the next answer or decision.

When moving a card between roles or statuses, the acting role must update `最新进展`, `下一步动作`, and `产物/证据` when evidence exists. Feishu row comments may be used for detailed discussion, but the table fields must still summarize the current state so the board remains scannable.

Non-PM handoff rule:

- TL/DESIGN/QA do not directly set `负责人` to another non-PM role for follow-up.
- They finish by moving the card to `review` and assigning PM.
- PM performs the actual routing decision.

## 8. Task Size And Review Depth

PM chooses the review depth when creating or routing a card. The goal is to keep rigor where it matters and avoid making obvious small fixes wait behind heavyweight process.

Use `完整流程` for complex or high-risk work:

- architecture or technology choice
- cross-module behavior
- packaging, fullscreen safety, keyboard interception, permissions, or security
- production asset standards or large asset batches
- user-facing behavior that can regress multiple systems
- unclear requirements or non-obvious tradeoffs

For `完整流程`, TL should use the full process: at least three technical review subagents, implementation, adversarial review, verification, then PM review.

Use `轻量流程` for small, clear, low-risk cards:

- obvious CSS/layout fixes, including image aspect-ratio bugs
- copy corrections and settled requirement wording
- single-file documentation fixes
- small implementation slices with explicit acceptance criteria and low coupling
- test maintenance where existing patterns are clear

For `轻量流程`:

- TL may implement directly or with one dev agent.
- Three-way technical review is not required.
- Adversarial review can be a focused single reviewer or checklist, proportional to risk.
- QA can use targeted smoke/regression checks instead of designing a full new suite, unless behavior risk justifies more.
- The card still returns to PM review with evidence.

If a light card uncovers unclear requirements, cross-module coupling, or high-risk behavior, TL/QA must stop, record the reason, and return it to PM for rerouting as `完整流程`.

## 9. PM Workflow

PM responsibilities:

1. Discuss, brainstorm, and analyze requirements with Ethan.
2. Break work into Feishu cards with clear owner, priority, acceptance criteria, and next action.
3. Own project git version control on `main`: initialize when appropriate, merge, commit, and push.
4. Accept or reject TL, DESIGN, and QA outputs.
5. Handle blockers that need Ethan clarification or PM decision.
6. Decide all cross-role routing after cards return to `review`.
7. Notify Ethan through Feishu when the entire board reaches whole-board completion.

PM acceptance requires:

- Card acceptance criteria are satisfied.
- Evidence is linked or summarized.
- Required QA has passed, or PM explicitly marks QA as not required.
- Any follow-up work is represented by a new card before the current card is closed.

## 10. TL Workflow

TL responsibilities:

1. Process cards assigned to TL.
2. Follow the PM-selected review depth: `完整流程` for complex or high-risk work, `轻量流程` for small and clear work.
3. For non-trivial `完整流程` technical work, spawn at least three subagents to review technical approaches in parallel.
4. Choose the implementation approach and assign dev subagents.
5. Run adversarial code review through a separate agent before accepting implementation, scaled to card risk.
6. Iterate until TL judges the work ready for PM review or QA.
7. Own git version control on non-main branches.

TL must not merge directly to `main`.

When TL work is ready, TL moves the card to `review`, assigns PM, records evidence, and recommends either QA, acceptance, or rework. PM decides the route.

## 11. DESIGN Workflow

DESIGN responsibilities:

1. Process cards assigned to DESIGN.
2. Use Codex image generation for visual exploration and project assets.
3. Save selected deliverables in project paths when they are meant to be consumed by the app.
4. Put prompt, selected output path, and design rationale in `产物/证据` or `最新进展`.
5. Keep documentation mockups separate from production assets. Rough screenshots, emoji-like placeholders, and simplified diagrams may be acceptable for docs, but production sprites, secret-word objects, treasure chest art, stickers, and reward visuals must satisfy the production asset quality bar.

Design cards move to `review` with `负责人 = PM`. DESIGN may recommend TL implementation or further design iteration, but PM decides the route.

Detailed production asset standard: [production-asset-quality.md](production-asset-quality.md).

## 12. QA Workflow

QA responsibilities:

1. Process cards assigned to QA.
2. Maintain reusable test assets under `tests/`; QA work is not only a one-off validation pass.
3. For frontend functionality, write Playwright automated tests when the behavior can be scripted.
4. For visual QA, use screenshot-driving scripts plus agentic visual-understanding prompts.
5. For every new or changed test case, first define what to test, how to test, and what counts as passing.
6. For all QA plans, spawn at least two tester subagents for QA approach review and test case design.
7. For scriptable cases, parallelize test script work where practical.
8. Before running tests, use an adversarial subagent to check that test logic covers the actual task and has not drifted toward merely passing.
9. Run the tests and report result, evidence, residual risk, and reusable asset paths.

QA cards can appear in `todo` before implementation reaches `testing` when the task is to create or update reusable test cases/scripts. Implementation cards that alter behavior should usually produce a paired QA card unless existing tests already cover the change.

When QA finishes testing, QA does not directly assign the card back to TL/DESIGN. QA moves it to `review`, sets `负责人 = PM`, records `QA结果`, evidence, failures, suspected owner, and recommended next action. PM decides whether to close, route rework, create a new QA asset card, block for Ethan, or deprecate.

Detailed QA protocol: [.agents/docs/qa-testing-protocol.md](qa-testing-protocol.md).

Runtime loop and automation protocol: [.agents/docs/agent-runtime-loops.md](agent-runtime-loops.md).

## 13. Blocker Handling

Use `blocking` only when progress genuinely requires another role or Ethan.

Blocking card requirements:

- `阻塞负责人`: who must act.
- `阻塞问题`: exact question or missing decision.
- `下一步动作`: what the blocker owner should do.
- `截止/检查点`: when PM should inspect it again.

Resolution:

- Ethan answer received: PM updates requirement and moves card to `todo` or `in progress`.
- PM decision made: PM records decision and moves card forward.
- Technical/design/QA issue resolved by owner: owner records evidence and moves card forward.
- Work no longer needed: PM moves card to `_deprecated`.

## 14. Local Skills

Hyperframes skills from `heygen-com/hyperframes` are installed project-locally under `.codex/skills/` for Codex and `.claude/skills/` for Claude Code.

Use them for animation, keyframe, video, and motion-related work when relevant. Do not install these skills globally for this project.
