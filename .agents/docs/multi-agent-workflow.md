# WorkTime Justin Multi-Agent Workflow

## 1. Project Roles

The project has five named roles:

- Ethan: stakeholder. Clarifies product intent, accepts major direction changes, and answers questions that cannot be resolved from context.
- PM: product owner and coordinator. Owns requirement discussion, task breakdown, official Feishu card creation, cross-role routing, `main` branch version control, promotion decisions from `stage` to `main`, acceptance of TL/DESIGN/QA outputs, and blocker triage.
- TL: technical lead. Owns implementation cards assigned to TL, implementation branch version control, and technical integration into the `stage` runnable branch when PM routes accepted work for Ethan validation.
- DESIGN: design owner. Owns visual exploration and image generation cards assigned to DESIGN.
- QA: quality owner. Owns test planning, automated/agentic testing, and test result cards assigned to QA.

PM and DESIGN are expected to be Codex threads. TL and QA are currently expected to be Claude Code sessions, but the protocol is role-based rather than tool-bound.

## 2. Feishu Board

Canonical board:

https://my.feishu.cn/wiki/QsKfwHvaDihj4QkTPMzclmQpnob?fromScene=spaceOverview&table=tblZfqKOydgqr7XS&view=vews2l5ddY

Preferred access path:

- Use the globally installed `lark-cli` and Lark skills for Feishu/Lark operations.
- Codex sessions read Lark skills from `/Users/claire/.codex/skills/lark-*`.
- Claude Code sessions read Lark skills from `/Users/claire/.claude/skills/lark-*`.
- For Base/Bitable card operations, use the `lark-base` skill and `lark-cli base +...` commands first.
- For Wiki URL/token resolution, use `lark-wiki`.
- For Feishu direct messages, use `lark-im`.
- Do not write another role-local Feishu client for normal board reads, writes, view changes, or message sends when `lark-cli` covers the operation.
- Existing project scripts under `.agents/tools/` remain allowed for idempotent project setup, compatibility with already-written automation, and narrow fallback when `lark-cli` cannot complete a required operation. Any fallback use must be recorded in the card evidence or latest progress.

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
- `状态`: one of `backlog`, `todo`, `in progress`, `review`, `testing`, `blocking`, `done`, `_deprecated`. Status aliases are invalid; `doing` must never be created, selected, or written.
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
- `阻塞负责人`: PM or Ethan only, when `状态 = blocking`.
- `阻塞问题`: exact question or missing decision, when blocked.
- `依赖`: upstream card IDs or dependencies. Prefix blocking dependencies with `Hard:` and non-blocking coordination dependencies with `Soft:`. If the field contains unqualified card IDs, PM must clarify them before the owner treats them as a stop condition.
- `分支`: target or delivery branch, if any. During `in progress`, this may be the intended branch and can still move. During `review`, it must identify the actual delivery branch and final commit must appear in `产物/证据`. For runtime-impacting or docs-preview-impacting TL delivery, this field or `产物/证据` must also name the TL-integrated `stage` commit, unless the card explicitly says branch-only preliminary review or PM records an explicit integration deferral.
- `产物/证据`: PR, commit, screenshot, generated asset path, test report, or other proof.
- `最新进展`: concise human-written status note.
- `截止/检查点`: date for the next expected transition or review.

Path-specific card instructions:

- If a card depends on a requirement, mockup, design spec, runtime asset, audio source, branch, test, or generated output, PM must name the exact path or upstream card ID directly on the card.
- Use local project paths that the role can open without asking Ethan, for example `docs/index.html`, `docs/assets/accepted-mvp-mockup.png`, `docs/design/wtj-081-main-ui-visual-motion-spec.md`, `docs/assets/style/wtj-082/manifest.json`, `app/web/audio/AUDIO-API.md`, or `tests/e2e/task_reward_integration.py`.
- A vague reference such as "the image", "the design", "the mock", or "the requirement doc" is not actionable. PM must clarify it before routing, or during the next PM loop if the gap is discovered later.
- If a role discovers that a named path is missing, stale, or insufficient, it records the exact path and question in `最新进展` or `阻塞问题` and returns to PM instead of asking Ethan only in the session chat.

## 4. Card Creation And Routing Authority

PM is the single routing authority for official project work.

Rules:

- PM creates official task cards, assigns owners, and ensures each official card has a `编号`.
- Non-PM roles do not directly assign follow-up work to other roles.
- Non-PM roles may propose new work through the current card's `最新进展`, `下一步动作`, `产物/证据`, and Feishu comments.
- Non-PM roles must not assign `负责人` or `阻塞负责人` directly to Ethan/stakeholder. If TL, DESIGN, or QA believes work cannot continue without stakeholder confirmation, they route the card to PM with the exact question and evidence. PM alone decides whether to ask Ethan.
- If a non-PM role must create a traceability card because the work would otherwise be lost, it must be created as a proposal only: `状态 = backlog`, `负责人 = PM`, and `下一步动作` must ask PM to triage it.
- PM decides whether a proposed card becomes real work, is merged into an existing card, is blocked for Ethan clarification, or is moved to `_deprecated`.

When TL, DESIGN, or QA finishes assigned work, they hand it back to PM:

- set `状态 = review`
- set `负责人 = PM`
- set `评审负责人 = PM`
- update `最新进展`, `下一步动作`, and `产物/证据`
- include defects, risks, test results, and recommended routing, but do not directly reassign the card to another role

PM then decides the next state and owner.

Stakeholder feedback routing:

- PM must classify every Ethan feedback item before routing it. Clear approval is acceptance or forward movement. Clear rejection is not a question; PM converts it into executable defects, expected behavior, exact artifact paths, and acceptance checks for TL, DESIGN, or QA.
- Only a true unanswered product decision may wait on Ethan. In that case, set `状态 = blocking`, `负责人 = Ethan`, `阻塞负责人 = Ethan`, and write the exact question, exact validation path or artifact, and what answer unblocks the card.
- If PM still needs to prepare the artifact, comparison, or question before Ethan can answer, the temporary owner is PM, not TL/DESIGN/QA. Once the question has been sent and the only remaining action is Ethan's answer, ownership moves to Ethan.
- A card owned by TL, DESIGN, or QA must not say "wait for Ethan", "ask Ethan to confirm", "need user validation", or equivalent language in `下一步动作`, `阻塞问题`, or `最新进展`. That is a no-stale violation. PM must either route a real Ethan blocker to Ethan or remove the wait and write the concrete role action.
- If Ethan has already rejected a result, PM must not create a before/after or quality-confirmation loop for the same bad result. The next card state is role rework unless PM needs a new, narrower stakeholder decision.
- Quality validation requests must be self-contained. For audio, video, animation, sprite, or visual judgment, the card must name the local review entry point, the file list or section IDs, what should be listened to or inspected, what comparison is expected, and the exact answer needed.

## 4.1 Stage Integration Branch

`stage` is Ethan's runnable integration-acceptance branch. Ethan should be able to run one build from `stage` and see the combined state of all PM-accepted feature work that has not yet been promoted to `main`.

Ethan's only accepted validation surface is the shared project directory `/Users/claire/Documents/worktime-justin`. Requirement HTML, design review HTML, app bundles, DMGs, and any other stakeholder-facing artifact must be opened from that directory or be explicitly built/copied from that directory at the recorded `stage` commit. Auxiliary paths such as `/Users/claire/Documents/wtj-stage`, `/private/tmp/...`, feature worktrees, temporary integration worktrees, and role-local build folders are internal evidence only; they are not acceptable stakeholder validation paths.

QA does not have to test on `stage`. QA may run focused target tests from a named implementation branch, package, or independent worktree when the card names the exact target and scope. Those QA results prove the named target, not the integrated app state shown to Ethan on `stage`.

PM review and QA test results are not the same thing as Ethan-visible completion. For any user-facing runtime, visual, audio, packaging, production asset, or docs-preview card, `done` means the accepted work is visible from `/Users/claire/Documents/worktime-justin` at the reviewer-runnable `stage` state or in a package/docs preview built from that same directory. A branch-only pass, worktree-only preview, target-specific QA pass, or artifact under another checkout may move a card through `review` or `testing`, but must not become `done` until the card records the `stage` commit/package that Ethan can run or open from `/Users/claire/Documents/worktime-justin`. If a change is not meant to appear in that validation surface, PM must record why it is non-user-facing before marking it done.

Branch ownership:

- PM owns `main`, the product acceptance gate, and the decision to promote a validated `stage` baseline to `main`.
- TL owns implementation branches and the `stage` integration branch. `stage` is technical integration work, so TL handles code, build, test, package, and asset conflicts there.
- DESIGN and QA do not merge to `stage` or `main`. If they produce documentation-only or test-only changes that need integration, the card must route that branch through TL for `stage` or PM for an accepted `main` promotion.
- `/Users/claire/Documents/worktime-justin` is a shared PM/Ethan validation checkout, not a role-local scratch checkout. During normal work it must stay on `stage` or `main`; TL, DESIGN, and QA feature branches must be developed in independent worktrees or role-owned checkouts. A role must not switch the shared checkout to a feature/design/test branch to do card work. If this happens, the active role must preserve the work, move it to the correct branch or worktree, and restore the shared checkout before any Ethan-facing validation.
- No role may rewrite, reset, or force-push `main`. No role may rewrite, reset, or force-push `stage` unless PM has routed an explicit TL recovery card and the card names the expected recovery point.

Integration rule:

- For runtime-impacting implementation, production asset change, audio/TTS change, packaging change, QA-visible docs preview, or other change that Ethan should validate in the app/docs, TL delivery normally includes merging/syncing the completed branch into `stage` before PM review. PM may accept a branch-only preliminary review only when the card says so explicitly.
- TL performs the `stage` merge, resolves code/build/test/package/asset conflicts, updates `/Users/claire/Documents/worktime-justin` to the integrated `stage` commit, builds or verifies the stakeholder-facing docs/app/DMG artifacts from that directory, and records the `stage` commit plus package or run evidence on the card before requesting integrated PM/Ethan validation.
- If a `stage` conflict requires product, requirement, or design judgment, TL routes the card to PM with the exact files, conflicting choices, and recommended technical options. PM decides or routes to Ethan, then TL completes the technical merge.
- If a conflict is only in PM-owned process docs, requirement wording, or collaboration protocol, PM may resolve that documentation conflict directly or give TL exact text to apply.
- A user-facing card may not be marked `done` before `stage` integration. The only exceptions are changes that do not affect the runnable validation surface; PM must state that explicitly in `最新进展` or `产物/证据`. Do not use `stage integration deferred` to close a user-facing card; keep it active and route TL until Ethan can see it in `stage`.
- A one-off integration branch may be used for emergency builds, but TL must either promote/sync it into `stage` after PM accepts that route, or PM must record why it is intentionally temporary. Ethan should not have to switch between unrelated feature branches to inspect normal integrated progress.
- A package built from a temporary feature branch, throwaway integration branch, or local worktree is not a `stage` package. Even if the commit later matches `stage`, the Ethan-facing artifact must either be rebuilt from `/Users/claire/Documents/worktime-justin` at the recorded `stage` commit or have explicit TL verification that the artifact was produced from that exact directory and commit. Otherwise it is only PM preliminary evidence.

Evidence rule:

- After TL merges to `stage`, TL must update `/Users/claire/Documents/worktime-justin` to the recorded `stage` commit when it is safe to do so, rebuild or verify stakeholder-facing docs/app/DMG artifacts in that directory, record the `stage` commit and exact validation paths in `产物/证据`, then return the card to PM review.
- Ethan integration-acceptance cards must point to `/Users/claire/Documents/worktime-justin` on a recorded `stage` commit, or to a package built/copied from that exact directory and commit.
- QA cards may point to `stage`, but may also point to a named branch, package, or independent worktree for targeted validation. The card must explicitly say whether the result is `stage` integration validation or branch/worktree-specific target testing.
- If `stage` is behind accepted work, PM must surface that in `最新进展` and either route TL to integrate it before the next validation request or explain the blocker.
- Before PM tells Ethan "you can run/open it now", PM must verify `/Users/claire/Documents/worktime-justin` is on the intended `stage` commit and that the named docs/app/DMG path lives under that directory or was explicitly built/copied from that directory. If the shared project checkout is dirty in a way that affects validation, on another branch, or cannot safely switch to `stage`, PM must not ask Ethan to validate through another checkout; route TL to resolve the shared checkout state first.

Promotion rule:

- `main` remains the stable PM-owned line. PM promotes `stage` to `main` only after Ethan has accepted the integrated state, or when PM intentionally chooses to make the integrated state the new stable baseline with explicit evidence.
- If promotion from `stage` to `main` has code/build/test conflicts, PM stops and routes a TL card with the exact conflict files. PM may resolve only PM-owned docs/protocol conflicts during promotion.
- `stage` may contain accepted work that is still awaiting broader QA or Ethan visual acceptance. It is the working validation line, not a final release promise.

## 5. Multi-Session Role Coordination

`负责人` is role-level ownership, not a unique human/session identifier. Multiple sessions may run under the same role, especially `DESIGN` and `QA`, as long as each active card records which concrete session has claimed it.

Session identity rules:

- Each role session must have both a human-readable short label and a stable unique session identity.
- The short label is for scanning, for example `DESIGN-A`, `DESIGN-2`, `QA-Audio`, `QA-Visual`, or a named label chosen by Ethan/PM.
- The unique identity is for unambiguous ownership. Use the real runtime identifier whenever available: `CodexThread:<thread-id>` for Codex threads, `ClaudeSession:<session-id>` for Claude Code sessions, or `Automation:<automation-id>` for scheduled PM automation.
- The label and identity do not replace `负责人`; `负责人` remains `DESIGN`, `QA`, `TL`, `PM`, or `Ethan`.
- Do not write app secrets, OAuth tokens, cookies, local passwords, or API keys as identity. Thread/session/automation IDs are acceptable because they identify the working session, not credentials.
- A role session should not claim a formal card until it can write a stable identity. If the launcher has not provided one, the session should ask the launcher/PM for the Codex thread ID or Claude Code session ID before taking ownership.
- When claiming or updating a card, the session writes both label and identity at the start of `最新进展`, using this shape: `执行者：DESIGN-A；身份ID：CodexThread:019f2771-...；开始：2026-07-04 14:30 CST；范围：horse run sheet rework`.
- If the card has a concrete output path, branch, test file, or asset folder, the claiming note must include the touched scope so another same-role session can avoid collisions.
- Feishu comments may contain detail, but the table fields must still show the active session label, stable identity, and next action.

Claiming and takeover rules:

- A same-role session may claim an unstarted `todo` card by moving it to `in progress`, keeping `负责人` as that role, and writing the session label plus stable identity in `最新进展`.
- If another same-role session has already claimed the card and the claim is still current, do not overwrite it. Pick another card or ask PM to split/triage.
- A claim is current when `最新进展` or Feishu comments show recent work and `下一步动作` still belongs to that same session.
- A same-role session may take over only when PM explicitly says it may, the previous claim is stale past `截止/检查点`, or the previous executor has returned the card to `review`/PM.
- On takeover, preserve the previous evidence and write a new `最新进展` line naming both the new executor label/identity and why takeover is valid.
- If two same-role sessions race on the same card or asset path, the later claimant must stop and return the card to `review` for PM triage instead of silently continuing.

Returned and rejected cards:

- If PM rejects a delivered card for real rework, PM routes it back to `todo` by default, keeps `负责人` as the role expected to fix it, and writes the exact defect, branch/path, and acceptance condition in `下一步动作`. `todo` means the work is ready but no concrete session has acknowledged the returned work yet.
- PM may route rejected work directly back to `in progress` only when the original executor is still active and has explicitly acknowledged the rejection in the current session, or when PM is directly handing it to a named live session. The card's `最新进展` must then name that executor label and stable identity. Do not use `in progress` as a parking state after PM rejection.
- When useful, PM should name the preferred original executor by label and identity in `下一步动作`, for example `优先 DESIGN-A (CodexThread:019f2771-...) 继续；若该 session 空闲超 30 分钟，任意 DESIGN 可接手并保留原证据`.
- If PM does not name a preferred executor, any same-role session may claim the returned `todo` card, but it must read the previous `产物/证据`, `最新进展`, and comments before editing.
- A non-PM role still returns finished work to PM review. Multiple DESIGN or QA sessions do not directly pass cards to each other unless PM has written that handoff into the card.

Parallel DESIGN rules:

- PM should split large asset work into small cards by asset family, letter group, animation, or output folder whenever possible.
- Two DESIGN sessions must not edit the same output folder, sprite sheet, or source prompt file at the same time unless PM explicitly defines a merge plan.
- For production assets, each DESIGN session records prompt, selected asset paths, rejected outputs if relevant, cleanup steps, and known visual risks.
- If a DESIGN session discovers systemic style drift or quality-bar failure, it returns the card to PM review with evidence instead of continuing a large batch in the wrong direction.

Parallel QA rules:

- QA sessions may run concurrently by test type, feature area, or artifact path, for example `QA-Visual`, `QA-E2E`, and `QA-Audio`.
- Each QA session must claim a distinct card or a distinct scope explicitly written in the card. If one QA card covers multiple scopes, the first QA session must either split the work through PM or write a clear sub-scope before starting.
- New or changed reusable tests must name the creating executor label/identity and the adversarial reviewer label/identity in `对抗评审` or `产物/证据`.
- QA sessions may share test assets, but they must not rewrite the same test file or visual prompt concurrently without a named owner and merge plan.
- QA failures always return to PM review with suspected owner and evidence. QA sessions do not directly route failed work to TL or DESIGN.

## 6. 状态流转

Normal flow:

`backlog -> todo -> in progress -> review`

PM review can route to:

- `testing` when QA validation is needed.
- `done` when the card is accepted.
- `todo` for real rework, with PM assigning the owner and acceptance condition.
- `in progress` for rework only when a named live executor has already acknowledged and accepted the returned work.
- `blocking` only when PM or Ethan must unblock it. If TL, DESIGN, or QA should act, PM routes the card to `todo`, `in progress`, `review`, or `testing` with that role instead of using `blocking`.
- `_deprecated` when the card is no longer needed.

QA testing returns to PM review:

`testing -> review -> done`

Allowed side paths:

- Any active status may move to `blocking` only as `blocking/PM` or `blocking/Ethan`. TL, DESIGN, and QA do not own `blocking` cards; role-executable work stays in `todo`, `in progress`, `review`, or `testing`.
- `blocking` must move back to `todo` or `in progress` after the blocker is resolved.
- `review` may move back to `todo` if changes are required; it may move directly to `in progress` only under the named-live-executor rule above.
- `testing` must move back to `review` after QA reports pass/fail. PM decides whether defects go to `todo`, `in progress`, `blocking`, or `_deprecated`.
- Any non-`done` card may move to `_deprecated` only when PM decides it is no longer needed.

状态含义:

- `backlog`: captured but not ready. PM owns grooming.
- `todo`: ready to start, owner role assigned, acceptance criteria clear, but no concrete session is currently accountable for doing it.
- `in progress`: a concrete live executor has claimed the card in `最新进展` with label, stable identity, start time, and touched scope; stakeholders should be able to treat it as actively owned without watching session transcripts.
- `review`: work is delivered and awaiting PM routing or acceptance.
- `testing`: QA is validating a delivered change; after validation it returns to PM review.
- `blocking`: progress is stopped by a PM- or Ethan-owned blocker; it is not a waiting room for TL, DESIGN, or QA.
- `done`: accepted and no further work remains on this card.
- `_deprecated`: intentionally retired, not silently abandoned.

There is no `doing` status. If it appears, PM treats it as a board hygiene defect and corrects it immediately: use `in progress` only when `最新进展` already names a concrete live executor; otherwise use `todo` so the owner role must claim it properly on the next loop.

Whole-board completion:

- The project is considered complete only when every nonblank official card is in a terminal state: `done` or `_deprecated`.
- `backlog`, `todo`, `in progress`, `review`, `testing`, `blocking`, missing status, or any unknown status means the board is not complete.
- PM loop must run `.agents/tools/pm_completion_notify.py` after each board scan. If the board is complete, the tool sends Ethan a one-time Feishu direct message using PM app credentials and records local notification state under `.agents/state/` to avoid duplicate messages.
- If new active work appears after a completion notification, the notification state resets; the next all-terminal state may notify again.

## 7. No-Stale Rules

Every active card must have:

- `编号`
- `负责人`
- `状态`
- `验收标准`
- `下一步动作`
- `最新进展`

Additional rules:

- For cards owned by a role with multiple live sessions, `最新进展` must name the concrete active executor label plus stable identity, or say why no session has claimed it yet.
- A card in `in progress` must name the concrete active executor label plus stable identity and a current next action. If PM returns a card for rework and no live session has acknowledged the return, the card must be `todo`, not `in progress`.
- A card in `review` must have `负责人 = PM`, `评审负责人 = PM`, `下一步动作`, and `产物/证据`.
- Exception: if PM review finds only missing or inconsistent handoff metadata, not a code or behavior defect, PM may keep `状态 = review` and set `负责人 = TL` for a narrow handoff correction. `下一步动作` must say this is metadata-only and must list the exact missing branch/commit/evidence fields. After TL updates the evidence, TL returns `负责人 = PM` while keeping `状态 = review`.
- A card in `testing` must have `负责人 = QA`, `QA结果`, `测试方式`, and `产物/证据`.
- A card in `blocking` must have `负责人` and `阻塞负责人` set to `PM` or `Ethan`, plus `阻塞问题` and `下一步动作`. `blocking/TL`, `blocking/DESIGN`, and `blocking/QA` are invalid routing states that PM must correct.
- A dependency only blocks intake when it is explicitly marked `Hard:` and its required condition is unmet. `Soft:` dependencies are coordination or merge-order notes; the owner may start work, use stubs, or prepare implementation while preserving the stated integration boundary.
- When PM wants parallel work despite an upstream card still being active, PM must write that permission directly in `依赖`, `下一步动作`, or `最新进展`. Role agents should not infer this permission silently.
- An implementation card in `in progress` is not a delivery. PM must not block it solely because the shared worktree contains untracked files, dirty files, generated files, or a moving branch ref. Those are development-state observations, not acceptance evidence.
- For implementation cards, branch hygiene is a handoff gate. When TL moves work to `review`, `分支` and `产物/证据` must include the final branch, final commit, verification evidence, known risks, and the recommended PM route.
- For documentation-preview, visual-review, or design-gallery handoffs, `产物/证据` and `下一步动作` must name the exact reviewer-openable entry point for the review target. A feature-branch or worktree path may be used only for PM preliminary review. Ethan-facing validation must use `/Users/claire/Documents/worktime-justin` on `stage` or a package/docs preview built from that directory; TL must first complete `stage` integration, update or verify the shared directory, and name the `stage` commit/package. Branch-only or auxiliary-worktree content must not be described as visible to Ethan.
- Stakeholder-wait language is forbidden on cards owned by TL, DESIGN, or QA. If a card says the next action is for Ethan to listen, inspect, decide, confirm, or answer, then the owner/blocker must be Ethan, or PM while PM prepares the exact validation package. Otherwise PM must convert the feedback into concrete role work.
- If Ethan has already given a concrete rejection, the card must name that rejection as a defect and route rework. Do not leave the card as `todo/TL` or `blocking/TL` with a hidden assumption that Ethan still needs to validate the rejected output.
- A card that changes product behavior must either reference existing test coverage or create/update a QA card for test asset work.
- A blocked card cannot be used as storage for vague uncertainty. If the next step is obvious, assign it and move the card back to `todo` or `in progress`.
- A card that is no longer worth doing must become `_deprecated` with a short reason in `最新进展`.
- A role receiving a card must either accept it, return it with a concrete reason, or route a precise blocker to PM. Do not leave it ambiguous.

## 8. Card Intake And Handoff

Every role starts by checking cards where `负责人` is that role, across all active statuses.

Minimum handling rules:

- `todo`: the assigned `负责人` must accept the card on that role's next loop by moving it to `in progress` and writing the concrete executor, or return/block it with a concrete reason. A card may not sit in `todo` across repeated owner loops with no claim or written refusal.
- `in progress`: keep `最新进展` and `下一步动作` current.
- `review`: PM must accept, reject with required changes, route to QA, route to another role, block, or deprecate.
- `testing`: QA owns execution and result reporting.
- `blocking`: only PM or Ethan may be the named `负责人` and `阻塞负责人`. PM either decides/reroutes, prepares a stakeholder question, or assigns a true stakeholder blocker to Ethan. Ethan answers the named validation or decision question. `blocking` is not a waiting room for TL/DESIGN/QA or vague dependency notes.

Current board fields are authoritative. Session chat, older wakeup prompts, and previous local scans are only hints. If a card says the current role should act and also says not to wait for Ethan or another role, the current role must act and must not rely on an obsolete wakeup prompt to defer work.

If a role-owned card remains in `todo` or `review` for one full owner loop with no claim, no refusal, and no precise blocker written back to the card, PM treats that as a role-loop failure. If a `blocking` card is owned by TL, DESIGN, or QA, PM treats it as invalid routing and corrects it to PM/Ethan ownership or executable role work. PM must record the observed failure, route a takeover or restart, and stop pretending the card is merely waiting normally.

When moving a card between roles or statuses, the acting role must update `最新进展`, `下一步动作`, and `产物/证据` when evidence exists. Feishu row comments may be used for detailed discussion, but the table fields must still summarize the current state so the board remains scannable.

When multiple sessions exist for the same role, the acting session must also update or preserve the executor label described in Section 5.

Implementation handoff contract:

- While a TL card is `in progress`, PM checks only whether the card has an owner, next action, and enough progress context. PM should not repeatedly interrupt TL for every local branch or worktree observation.
- TL may use a shared worktree, `commit-tree`, or other local mechanics as long as `main` and `stage` history are not changed outside PM control.
- Before TL moves implementation work to `review`, TL must run `.agents/tools/tl_handoff_check.py --card <编号> --branch <分支>`. If it fails, TL fixes the branch/evidence in the same active loop and does not hand off yet.
- When TL judges the work ready and preflight passes, TL moves the card to `review`, sets `负责人 = PM`, and records the final branch, final commit, preflight output, build/run evidence, residual risks, and recommended next route.
- PM performs branch/commit verification after review handoff.
- If final branch, final commit, or evidence is missing or inconsistent, but PM has not found a real product/code defect, PM keeps the card in `review`, sets `负责人 = TL`, and writes a metadata-only correction. This is not a development rejection.
- If PM finds a real code, behavior, security, packaging, or acceptance defect, PM routes the card back to `todo` with the required rework. PM may use `in progress` only if a named live executor has acknowledged and accepted that rework immediately.

Non-PM handoff rule:

- TL/DESIGN/QA do not directly set `负责人` to another non-PM role for follow-up.
- They finish by moving the card to `review` and assigning PM.
- PM performs the actual routing decision.

## 9. Task Size And Review Depth

PM chooses the review depth when creating or routing a card. The goal is to keep rigor where it matters and avoid making obvious small fixes wait behind heavyweight process.

Use `完整流程` for complex or high-risk work:

- architecture or technology choice
- cross-module behavior
- packaging, fullscreen safety, keyboard interception, permissions, or security
- production asset standards or large asset batches
- user-facing behavior that can regress multiple systems
- unclear requirements or non-obvious tradeoffs

For `完整流程`, TL should use the full process: at least three technical review subagents, implementation, adversarial review, verification, then PM review.

The selected review depth is per card, not per TL session. TL may run several card workflows in parallel when each card keeps its own executor/workstream claim, branch or worktree, evidence, and acceptance trail. Parallel execution does not weaken the required review depth for any individual card.

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

## 10. PM Workflow

PM responsibilities:

1. Discuss, brainstorm, and analyze requirements with Ethan.
2. Break work into Feishu cards with clear owner, priority, acceptance criteria, and next action.
3. Own `main` version control and the promotion gate from `stage` to `main`; route technical `stage` integration work to TL.
4. Accept or reject TL, DESIGN, and QA outputs.
5. Handle blockers that need Ethan clarification or PM decision.
6. Decide all cross-role routing after cards return to `review`.
7. Notify Ethan through Feishu when the entire board reaches whole-board completion.
8. Split large DESIGN/QA work enough that multiple same-role sessions can run without editing the same assets or test files.
9. Inspect active role sessions or thread summaries when the board alone does not explain why a card is stalled, when a role asks Ethan for missing information, or when one session claims multiple cards at once.
10. Convert session-only questions into board instructions. If TL, DESIGN, or QA says "need image", "which asset", "waiting for Ethan", or similar in chat, PM writes the exact path, blocker, or routing decision into the card so the next loop can proceed from the board alone.
11. Keep `stage` current by requiring runtime/docs-preview TL cards to include `stage` integration in their delivery unless PM explicitly marks a branch-only preliminary review, or record a concrete integration deferral on the relevant cards.
12. Stop routine routing when the workflow invariant itself is broken. If PM finds cards parked on role owners while the real next action is Ethan validation, or role loops repeatedly ignore assigned active cards, PM must repair the protocol/routing failure before continuing ordinary PM-loop work.

PM acceptance requires:

- Card acceptance criteria are satisfied.
- Evidence is linked or summarized.
- Required QA has passed, or PM explicitly marks QA as not required.
- Any follow-up work is represented by a new card before the current card is closed.
- For runtime-impacting or docs-preview-impacting work, either TL-provided `stage` integration evidence is recorded or PM has recorded a concrete deferral reason.

PM branch discipline:

- PM owns `main` and product acceptance. TL owns `stage` technical integration.
- PM should verify final branch and commit only after TL hands the card to `review`, unless there is evidence that `stage`/`main` history was changed outside the defined ownership model or a destructive operation is underway.
- PM should expect runtime/docs-preview TL handoffs to include `stage` integration before Ethan validates the combined app, unless the card explicitly says branch-only preliminary review. If `stage` is not current, say so instead of presenting `main` or a feature branch as the latest integrated app.
- QA may validate a combined app build from `stage` when the card asks for integrated-app QA, but QA may also run target-specific tests from a named branch/package/worktree. PM must not treat a target-specific QA pass as Ethan acceptance of `stage`.
- PM must not resolve code/build/test/package conflicts on `stage` or during `stage` to `main` promotion. Route those to TL with exact files and target baseline. PM may resolve PM-owned documentation, requirement wording, or workflow-protocol conflicts.
- Dirty or untracked files in the shared worktree are not accepted deliverables and are not by themselves a reason to block an in-progress card.
- In `review`, distinguish handoff metadata correction from technical rework. Missing final commit/evidence should stay in the review lane as a narrow TL correction; actual defects should be routed as rework.

## 11. TL Workflow

TL responsibilities:

1. Process cards assigned to TL.
2. Follow the PM-selected review depth: `完整流程` for complex or high-risk work, `轻量流程` for small and clear work.
3. For non-trivial `完整流程` technical work, spawn at least three subagents to review technical approaches in parallel.
4. Choose the implementation approach and assign dev subagents.
5. Run adversarial code review through a separate agent before accepting implementation, scaled to card risk.
6. Iterate until TL judges the work ready for PM review or QA.
7. Own git version control on implementation branches and the `stage` integration branch.

TL must not merge directly to `main`. For runtime-impacting or docs-preview-impacting cards, TL normally merges/syncs the completed work into `stage` before handoff to PM review, because PM/Ethan validation uses the integrated project checkout. TL may skip `stage` integration only when the card explicitly says the work is branch-only preliminary review, or when TL records a concrete PM-owned blocker that prevents integration.

TL is allowed, and often expected, to act as a technical scheduler rather than a single-card coder. If several TL-owned cards are ready, TL may claim and coordinate multiple cards in parallel by launching separate technical-review, coding, and adversarial-review workstreams. Each active card must still be independently auditable:

- `最新进展` names the card's executor/workstream label and stable identity.
- `分支`, `依赖`, `下一步动作`, and `产物/证据` name that card's branch/worktree, touched scope, current step, and verification output.
- Parallel work uses independent branches/worktrees or explicitly non-overlapping file scopes. TL must not use `/Users/claire/Documents/worktime-justin` as a scratch checkout.
- TL resolves cross-card conflicts before handoff. A branch/worktree can be reviewed by PM or QA as a preliminary target, but it is not the Ethan-facing integrated surface until TL merges/syncs it to `stage`, updates `/Users/claire/Documents/worktime-justin` to that `stage` commit, and records the project-directory artifact paths.
- `stage` integration is serialized and evidence-backed. TL may have many cards in flight, but every card that should affect Ethan's integrated app/docs must eventually record the final branch commit, the integrated `stage` commit, and the exact docs/app/package path under `/Users/claire/Documents/worktime-justin`.

When TL work is ready, TL moves the card to `review`, assigns PM, records evidence, and recommends either QA, acceptance, or rework. PM decides the route.

`review` does not always mean the card belongs to PM. If PM keeps a card in `review` but sets `负责人 = TL`, TL owns the next action. This is the handoff-correction queue, used for missing or inconsistent final branch, final commit, `stage` commit, shared-checkout evidence, package path, or other delivery metadata. TL must pick these cards during its normal board scan, write a TL session claim in `最新进展`, perform only the requested correction unless PM identified a real defect, and return the card to `review` with `负责人 = PM` when the correction is complete. TL should not move these cards to `in progress` merely to acknowledge ownership; `review/TL` already means active TL correction is required.

TL handoff must include:

- final branch name
- final commit hash
- exact reviewer entry point: PM preliminary review may use branch/worktree plus an absolute path; Ethan-facing validation must name `/Users/claire/Documents/worktime-justin` on the recorded `stage` commit, plus the absolute docs/app/package path under that directory or an app/DMG copied from that directory
- passing `.agents/tools/tl_handoff_check.py` output
- build/run or smoke evidence
- known risks and whether they require a follow-up card
- whether TL recommends PM acceptance, QA testing, or further TL work
- whether the branch is ready for TL `stage` integration, already integrated to `stage`, or should not be integrated yet

If PM returns a review card to TL for handoff metadata correction, TL should not restart implementation unless the PM explicitly found a real defect. TL only fills the missing final branch/commit/evidence and returns the card to PM in `review`.

## 12. DESIGN Workflow

DESIGN responsibilities:

1. Process cards assigned to DESIGN.
2. Use Codex image generation for visual exploration and project assets.
3. Save selected deliverables in project paths when they are meant to be consumed by the app.
4. Put prompt, selected output path, and design rationale in `产物/证据` or `最新进展`.
5. Keep documentation mockups separate from production assets. Rough screenshots, emoji-like placeholders, and simplified diagrams may be acceptable for docs, but production sprites, secret-word objects, treasure chest art, stickers, and reward visuals must satisfy the production asset quality bar.
6. Use a DESIGN-owned branch or independent worktree for design production. Do not switch `/Users/claire/Documents/worktime-justin` away from `stage` or `main` to perform DESIGN work. When a design branch should become visible in the integrated docs/app, DESIGN hands it to PM review with branch, commit, and paths; PM then routes TL for `stage` integration if needed.

Design cards move to `review` with `负责人 = PM`. DESIGN may recommend TL implementation or further design iteration, but PM decides the route.

When multiple DESIGN sessions are running, each DESIGN session must use its session label in `最新进展`, claim only one active card or one explicit asset scope at a time, and avoid touching folders claimed by another DESIGN session.

Detailed production asset standard: [production-asset-quality.md](production-asset-quality.md).

## 13. QA Workflow

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

When multiple QA sessions are running, each QA session must claim a distinct card or explicit test scope, write its session label in `最新进展`, and avoid concurrent edits to the same test asset unless PM has named a merge owner.

Detailed QA protocol: [.agents/docs/qa-testing-protocol.md](qa-testing-protocol.md).

Runtime loop and automation protocol: [.agents/docs/agent-runtime-loops.md](agent-runtime-loops.md).

## 14. Blocker Handling

Use `blocking` only when progress genuinely requires PM triage or Ethan's answer.

Owner invariant: every `blocking` card must have `负责人` and `阻塞负责人` set to `PM` or `Ethan`. TL, DESIGN, and QA never own `blocking`; if they can unblock the issue themselves, it is normal executable work, not a blocker.

Non-PM roles do not assign blockers directly to Ethan, TL, DESIGN, or QA. When TL, DESIGN, or QA cannot continue, they set `状态 = blocking`, `负责人 = PM`, `阻塞负责人 = PM`, and write the exact blocker. PM owns triage and may then decide, route executable work to another role in a non-blocking status, or reassign a true stakeholder blocker to Ethan.

Only PM may assign a blocker to Ethan/stakeholder. A non-PM card update that sets `负责人 = Ethan`, `阻塞负责人 = Ethan`, or equivalent stakeholder ownership is invalid routing even if the underlying question is legitimate. PM must correct the owner back to PM or write the validated Ethan blocker personally.

Stakeholder blocker rules:

- A true Ethan blocker must have `负责人 = Ethan` and `阻塞负责人 = Ethan`, unless PM is still preparing the exact question/artifact. Do not keep the card assigned to TL, DESIGN, or QA while the next physical action belongs to Ethan.
- The blocker must say where Ethan validates it, what he should decide, and what exact answer moves the card forward. "Quality confirmation", "listen and decide", or "see above" is not precise enough.
- If Ethan's response is already a rejection, the blocker is resolved. PM records the rejection and routes concrete rework to the responsible role.
- If a role says it cannot act because Ethan has not confirmed something, PM must decide whether that is a real stakeholder decision. If not, PM writes the decision and routes the role action; if yes, PM assigns the blocker to Ethan with a self-contained validation request.

Blocking card requirements:

- `负责人`: `PM` or `Ethan` only.
- `阻塞负责人`: `PM` or `Ethan` only.
- `阻塞问题`: exact question or missing decision.
- `下一步动作`: what the blocker owner should do.
- `截止/检查点`: when PM should inspect it again.

Resolution:

- Ethan answer received: PM updates requirement and moves card to `todo`, or to `in progress` only if a named live executor has already accepted the work.
- PM decision made: PM records decision and moves card forward using the same `todo` versus `in progress` ownership signal.
- Technical/design/QA issue identified by PM: PM routes executable work to the responsible role using `todo`, `in progress`, `review`, or `testing`; it does not remain `blocking` under that execution role.
- Work no longer needed: PM moves card to `_deprecated`.

## 15. Local Skills

Hyperframes skills from `heygen-com/hyperframes` are installed project-locally under `.codex/skills/` for Codex and `.claude/skills/` for Claude Code.

Use them for animation, keyframe, video, and motion-related work when relevant. Do not install these skills globally for this project.
