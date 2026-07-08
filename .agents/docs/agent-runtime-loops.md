# Agent Runtime Loops And Automations

This document defines how long-running role sessions and scheduled Codex automations should behave in this project.

## 1. Purpose

Role agents are expected to advance board work without waiting for manual steering after every obvious step.

Two runtime styles are supported:

- Role loop: an interactive Codex or Claude Code session runs as PM, TL, DESIGN, or QA and repeatedly processes assigned cards.
- Automation/cron: a Codex automation wakes on a schedule to inspect the board, enforce hygiene, and perform bounded PM coordination work.

Both styles must obey the Feishu board protocol and PM central routing rules.

## 2. Starting A Role Loop

When starting a Claude Code or Codex role session, give it a role and ask it to loop.

Example TL start prompt:

```text
You are TL for WorkTime Justin. Your session label is TL-A and your stable session identity is ClaudeSession:<session-id>. Read AGENTS.md and the docs it references. Use the TL Feishu app identity from .env. Start your role loop: scan cards assigned to TL in every active status. `review` is PM-owned; if a card is assigned to TL with `状态 = review`, treat it as invalid routing, write that fact in 最新进展, normalize executable TL correction to `todo` or route a precise blocker to `blocking/PM`, then proceed from the corrected status. You may coordinate multiple TL-owned cards in parallel as technical scheduler: claim each card separately in 最新进展, give each card an isolated branch/worktree or explicitly non-overlapping file scope, run the PM-selected light/full workflow per card, and hand completed work back to PM review with branch/commit/evidence. Do not touch main. For runtime-impacting or docs-preview-impacting delivery, integrate to stage before PM review unless the card explicitly says branch-only preliminary review; record the integrated stage commit plus project-directory artifact paths before Ethan-facing validation.

When doing feature work, use a TL-owned branch/worktree. Do not switch `/Users/claire/Documents/worktime-justin` away from `stage` or `main` as a scratch checkout. If the shared checkout is already on a feature/design/test branch, first preserve any dirty work and route or move it to the correct branch/worktree before using the shared checkout for stage validation.
```

Example QA start prompt:

```text
You are QA for WorkTime Justin. Your session label is QA-Visual and your stable session identity is ClaudeSession:<session-id>. Read AGENTS.md, multi-agent workflow, and QA testing protocol. Use the QA Feishu app identity from .env. Start your QA loop: scan cards assigned to QA, claim only one card or explicit test scope at a time by writing `执行者：QA-Visual；身份ID：ClaudeSession:<session-id>` in 最新进展, maintain reusable tests under tests/, run or design tests as needed, perform adversarial review for new test assets, and return results to PM review.
```

Example DESIGN start prompt:

```text
You are DESIGN for WorkTime Justin. Your session label is DESIGN-A and your stable session identity is CodexThread:<thread-id>. Read AGENTS.md, multi-agent workflow, and production asset quality protocol. Use the DESIGN Feishu app identity from .env. Start your DESIGN loop: scan cards assigned to DESIGN, claim only one card or explicit asset scope at a time by writing `执行者：DESIGN-A；身份ID：CodexThread:<thread-id>` in 最新进展, generate or refine assets, save outputs under the card's target paths, record prompts/evidence, and return finished work to PM review.
```

Example PM start prompt:

```text
You are PM for WorkTime Justin. Your stable session identity is CodexThread:<thread-id> or Automation:<automation-id>. Read AGENTS.md and all .agents/docs protocols. Use the PM Feishu app identity from .env. Start your PM loop: triage backlog, create official cards, route review cards, handle blockers, enforce no-stale rules, require runtime/docs-preview TL deliveries to include stage integration unless explicitly branch-only preliminary review, run the whole-board completion notification check, and own main promotion decisions.
```

## 3. Loop Algorithm

Each role loop repeats this sequence:

1. Read `AGENTS.md` and relevant `.agents/docs/` files.
2. Use that role's app credentials from `.env` for Feishu writes.
3. Read board cards where `负责人` is the current role.
4. Prioritize in this order: `blocking`, `review`, `in progress`, `testing`, `todo`, `backlog`.
5. Pick one actionable card and update `最新进展` before meaningful work begins, unless the role protocol explicitly allows a parallel workstream such as TL technical scheduling or QA tester review. In parallel mode, every claimed card or test scope must have its own executor/workstream label and stable identity in `最新进展`.
6. Do the work required by the card, using the PM-selected review depth: `轻量流程` for small clear cards and `完整流程` for complex or high-risk cards.
7. Update `状态`, `负责人`, `下一步动作`, `产物/证据`, and role-specific fields.
8. If the role is not PM and the assigned work is finished, return the card to `review` with `负责人 = PM`.
9. Continue until no actionable cards remain or a real blocker prevents progress.

Use only the exact board status values defined in the workflow. `doing` is not a valid synonym for `in progress`; role loops must never create, select, or write it.

Do not process multiple cards in parallel inside one role session unless the role protocol explicitly allows it. TL is the technical exception: TL may coordinate multiple TL-owned cards in parallel through independent branches/worktrees and subagents, while keeping each card's board fields, evidence, and handoff independent. QA may parallelize tester/reviewer subagents inside a named QA scope, but DESIGN and QA role sessions should still claim only one card or explicit asset/test scope at a time unless PM splits the scope.

Every role loop turn must start from a fresh board read. This applies to scheduled wakeups, task notifications, and human status questions. Do not answer whether a card belongs to a role from a previous scan, cached memory, or a stale local list.

Fresh board fields override any older wakeup prompt or session memory. If a scheduled wakeup says to wait for Ethan, PM, or another card, but the current Feishu card says `do not wait`, gives a concrete next action, or assigns the current role as `负责人`/`阻塞负责人`, the role must follow the card and record that it ignored the stale wakeup instruction. A role must never keep waiting because an older wakeup prompt encoded an obsolete blocker.

Scheduled wakeup prompts must not encode mutable stakeholder blockers as durable instructions. Do not write wakeups such as "wait for Ethan on 008" or "check whether Ethan confirmed the audio" as if they were source of truth. If a reminder must mention a disputed blocker, it must also say to re-read the current card fields and ignore the reminder if the board has changed.

A nonterminal card assigned to a role is an intake obligation on that role's next loop:

- `todo` with `负责人 = <role>` means that role must claim it in the next loop by moving it to `in progress` and writing the concrete executor, or immediately return/block it with a specific reason.
- `blocking` is valid only when `负责人` and `阻塞负责人` are `PM` or `Ethan`. A `blocking` card assigned to TL, DESIGN, or QA is invalid routing, not a normal intake obligation. If the role can unblock the issue itself, the card belongs in `todo`, `in progress`, or `review`; if it cannot continue, it must route the card to `blocking` with `负责人 = PM` and `阻塞负责人 = PM`.
- `review` must be PM-owned. A `review` card assigned to TL, DESIGN, or QA is invalid routing; normalize executable work to `todo/<role>` or route a precise blocker to `blocking/PM` before normal loop work continues.
- `in progress` with `负责人 = <role>` is valid only while the named executor in `最新进展` is actually working or expected to continue. If PM observes that no such session is active, PM must route takeover or downgrade the card to `todo` instead of leaving a fake active state.

If a role loop needs a document, screenshot, sprite sheet, audio source, branch, or test path that is not named on the card, it must not leave that request only in chat. It must write the exact missing item or question into `最新进展` or `阻塞问题`, and return the card to PM review/blocking if the missing information prevents progress.

When a non-PM role is blocked, it routes the card to PM, not directly to Ethan or another non-PM role: set `状态 = blocking`, `负责人 = PM`, `阻塞负责人 = PM`, and write the exact question, missing asset, branch, test path, or decision needed. PM performs the downstream assignment. TL, DESIGN, and QA must never set `负责人 = Ethan`, `阻塞负责人 = Ethan`, or keep themselves as `blocking` owner/blocker; if they do, the card is misrouted and PM must correct it before normal loop work continues.

Ethan feedback and validation gates:

- If Ethan has already approved or rejected something, the role must treat that as a decision recorded by PM, not as something to reconfirm in chat.
- If the card still truly needs Ethan to listen, inspect, or decide, the current owner/blocker must be Ethan, or PM while PM prepares the exact artifact and question. A TL/DESIGN/QA-owned `todo`, `review`, or `blocking` card must not wait on Ethan.
- If a role sees a card assigned to itself but believes the next action is actually Ethan validation, it must route the mismatch to PM with the exact field text that is wrong. It must not stop idle without updating the card.
- Only PM may convert that PM-routed mismatch into an Ethan blocker. Non-PM roles may recommend stakeholder confirmation, but they may not assign it to Ethan themselves.

### 3.1 Tool Call Hygiene

Role loops often make many board, shell, subagent, and wakeup calls. The model must keep tool calls separate from ordinary assistant text.

Rules:

- Invoke tools only through the real Codex or Claude Code tool interface. Never type tool-call markup such as `<invoke name="Bash">`, `<tool_use>`, raw JSON call envelopes, or similar pseudo-tool syntax in a normal message.
- Do not use stray marker words before tool calls, including `课`, `course`, `call`, or any private sentinel. These tokens can leak into user-visible text and make the session look like it attempted a malformed tool call.
- Do not carry leaked marker words into wakeup prompts as self-reminders. If a session needs a reminder, phrase it generically, for example `Keep ordinary text separate from tool calls`.
- If ordinary assistant text contains tool-call-looking markup, treat the intended action as not executed unless there is a real `tool_use` record and a corresponding `tool_result`.
- If ordinary assistant text contains stray marker words near a tool boundary, treat it as an output-contamination incident even when later tool calls are valid.
- After any suspected hygiene incident, the role must immediately verify the actual state by reading the board, checking the file, or inspecting the command result. If the intended action did not run, rerun it through the real tool interface. If it did run, report that the visible text was noise and include the evidence.
- Do not close or hand off a card based on text that merely looks like a tool call. Only actual tool results, board reads, command output, commits, files, or recorded evidence count.

Known failure pattern:

- In Claude Code session `8b125223-44cb-43a3-b5fe-fd221f3e9a0b`, the assistant emitted `课` followed by `<invoke name="Bash">...` inside a normal text message. Claude Code displayed it as prose, so that block did not execute. Later the same session repeatedly emitted `course` as ordinary text before valid Bash or ScheduleWakeup tool calls. The first case was a malformed pseudo-tool call; the later cases were stray text leakage. The recovery pattern is to verify the real tool result and retry only if the real action did not occur.
- That incident attempted to call Claude Code's `Bash` tool, with a command that ran the project-local board wrapper `python3 tl_board.py update ...`. It was operationally related to Feishu board work, but the malformed wrapper was not a `lark-cli` or Lark skill invocation.
- Local inspection of `/Users/claire/.claude/skills`, `/Users/claire/.codex/skills`, and `/Users/claire/.agents/skills` found no `SKILL.md` instructions that teach `<invoke ...>`, `<parameter ...>`, or `antml` style tool-call markup. Treat this as a Claude Code/tool-boundary leakage hazard, not as an approved Lark skill syntax.
- Similar `<invoke name="Bash">` leakage has appeared in Claude Code ecosystem issue data outside this project, including samples with other stray pre-tool tokens such as `court`. Do not assume the exact leaked token is semantically meaningful; it is a symptom of model/tool serialization drift.
- Never include the leaked token itself in future loop prompts as a warning. Use neutral wording such as `keep ordinary text separate from tool calls`; repeating `course`, `课`, or similar tokens in wakeup prompts can make the token more likely to reappear.

## 4. Claiming Work

To avoid two agents working the same card:

- Before starting a `todo` card, set `状态 = in progress`, keep `负责人` as the current role, and write `最新进展` with the session label, stable identity, start time, current action, and touched scope.
- Do not use `doing` when claiming work. The only active claimed-work status is `in progress`.
- Treat `in progress` as a strong stakeholder-facing signal: a concrete live session has accepted responsibility and is actively expected to continue. If a card is merely ready for a role but no session has acknowledged it yet, it belongs in `todo`.
- Use a stable session label, for example `DESIGN-A`, `DESIGN-2`, `QA-Visual`, or `QA-Audio`, plus a stable identity such as `CodexThread:<thread-id>`, `ClaudeSession:<session-id>`, or `Automation:<automation-id>`. Both must appear in the first line of the claiming update: `执行者：<label>；身份ID：<runtime-id>；开始：<time>；范围：<asset/test scope>`.
- If the role session does not know its stable identity, it may read the board but should not claim formal work until the launcher/PM provides the Codex thread ID, Claude Code session ID, or automation ID.
- If a card already has another clear active `最新进展` from the same role, do not overwrite it unless PM explicitly allowed takeover, the previous claim is stale past `截止/检查点`, or the previous session has returned the card to PM review.
- If taking over a stale or PM-authorized card, preserve previous evidence and write why takeover is valid.
- If ownership is unclear, move it to `review` for PM triage rather than racing another role.
- Multiple sessions under the same role should prefer different cards. If they must share one large card, PM must write the sub-scopes explicitly before the sessions start.

## 5. PM Automation/Cron

Codex automation is appropriate for PM-side recurring coordination, not for unbounded development.

Recommended PM cron responsibilities:

- scan `review` cards and route them
- inspect `blocking` cards and ensure `阻塞负责人`, `阻塞问题`, and `下一步动作` are clear
- find stale `in progress`, `testing`, or `review` cards missing required fields
- keep `stage` current by requiring runtime/docs-preview TL deliveries to include `stage` integration unless the card is explicitly branch-only preliminary review, or write a concrete `stage` integration deferral onto the card
- ensure Ethan validation requests name `/Users/claire/Documents/worktime-justin` on the recorded `stage` commit, or an app/DMG/docs artifact built or copied from that exact directory and commit; ensure QA validation requests name the exact branch/package/worktree under test and say whether the result is stakeholder-visible `stage` integration validation or target-specific testing
- before marking any user-facing runtime, visual, audio, packaging, production-asset, or docs-preview card `done`, verify the card names `/Users/claire/Documents/worktime-justin` on the recorded `stage` commit, or a package built/copied from that directory, where Ethan can immediately see the accepted change; branch-only review, auxiliary-worktree preview, or target-specific QA pass is not enough
- groom `backlog` proposals into official cards or `_deprecated`
- run `.agents/tools/pm_completion_notify.py` after each scan; if every official card is `done` or `_deprecated`, it sends Ethan a one-time Feishu DM using PM app credentials
- summarize board health and urgent decisions

PM automation must use PM Feishu credentials and must not impersonate TL, DESIGN, or QA.

PM automation also owns session-surface hygiene:

- Inspect active TL, DESIGN, and QA session transcripts or thread summaries when they are locally available and a card is active, stale, confusing, or has several sibling cards claimed at once.
- Treat session text as a signal, not as the source of truth. If a role asks Ethan for a screenshot, says an asset is missing, reports an instruction conflict, or describes a blocker in chat, PM must write the resolved instruction or blocker into the Feishu card.
- For implementation/design/test cards, PM should verify that `依赖` or `下一步动作` names exact requirement and asset paths before expecting the role to proceed, for example `docs/index.html`, `docs/assets/accepted-mvp-mockup.png`, `docs/design/wtj-081-main-ui-visual-motion-spec.md`, or a runtime folder under `app/web/assets/`.
- If PM cannot inspect the external session, the card must say so and require the role to summarize blockers in `最新进展`; PM should not rely on Ethan monitoring role chats.
- PM must classify stakeholder feedback before routing: approval, rejection, true unanswered decision, or technical blocker. A rejection becomes concrete rework. A true Ethan decision becomes `blocking/Ethan` with exact validation path/question. It must not be parked as TL/DESIGN/QA `todo`.
- When PM asks Ethan to validate audio, video, animation, or visual quality, the card must name the exact HTML entry point, section or file list, expected before/after comparison, and the answer that unblocks the card. If Ethan already said the output is bad or wrong, PM routes repair instead of asking for the same validation again.
- If a role-owned `todo` card survives the role's next loop without a claim, refusal, or precise blocker, PM records that as a role-loop failure and routes a takeover/restart/escalation. If `review` or `blocking` is assigned to TL, DESIGN, or QA, PM records it as invalid routing and corrects owner/blocker to PM or routes executable work. PM does not keep the card in place with the same next action.

For implementation cards in `in progress`, PM automation should treat local branch and worktree observations as informational only. Do not move a card to `blocking` or repeatedly rewrite its next action just because a shared worktree is dirty, has untracked files, or the TL branch has advanced.

For implementation cards in `review`, PM automation first checks the handoff metadata: final branch, final commit, evidence, risks, and recommended route. If only handoff metadata is missing or inconsistent, route a narrow metadata-only correction to `todo` with `负责人 = TL`. Do not route it as technical rework unless PM found a real defect. TL returns the card to `review` with `负责人 = PM` after filling the missing evidence.

When PM automation rejects a delivered card for real rework, route it to `todo` with the fixing role as `负责人` unless a named live executor has already acknowledged and accepted the returned work. Only use `in progress` for rejected work when that concrete session label and stable identity are written in `最新进展`.

Automation should be bounded:

- do not run open-ended implementation work
- do not merge to `main` unless the card explicitly calls for PM release/stable-line work and evidence is complete
- do not merge code into `stage` as PM; require TL to integrate runtime/docs-preview deliveries into `stage` when Ethan should see them in the integrated app/docs
- if a `stage` or `stage` to `main` conflict is code/build/test/package related, write the exact conflict/blocker back to the card and assign TL; PM may resolve only PM-owned docs/protocol conflicts
- do not ask Ethan to validate anything outside `/Users/claire/Documents/worktime-justin`. The shared project checkout must be on the named `stage` state, and app/DMG/docs artifacts must be built or copied from that directory and commit. If the checkout is dirty in a validation-relevant way or on another branch, keep the card active and route a shared-checkout/package handoff.
- do not create duplicate cards when an existing card can be updated
- stop and mark `blocking` when Ethan clarification is genuinely required
- stop routine PM-loop execution and repair protocol/routing first when the board workflow invariant is broken, for example when role-owned cards are really waiting on Ethan, active cards survive repeated owner loops without claim/refusal, or stale wakeup prompts are overriding current board fields

Whole-board completion notification:

- Run `.agents/tools/pm_completion_notify.py` after no-stale routing is finished.
- The tool treats the board as incomplete if any nonblank card is `backlog`, `todo`, `in progress`, `review`, `testing`, `blocking`, has a missing status, or has an unknown status.
- When all nonblank cards are terminal (`done` or `_deprecated`), the tool sends Ethan a Feishu text message using `PM_APP_ID` / `PM_APP_SECRET` and `ETHAN_FEISHU_OPEN_ID` from `.env`.
- The tool writes local state under `.agents/state/` so the same terminal board snapshot is not announced repeatedly.

## 6. Non-PM Role Loops

TL loop:

- works only cards assigned to TL
- treats any TL-owned `review` card as invalid routing; executable correction must first be normalized to `todo/TL`, and true blockers must be routed to `blocking/PM`
- owns implementation branches and TL-routed `stage` integration work
- may spawn technical review/dev/review subagents as defined in the workflow
- uses `轻量流程` when PM marks a card as small, clear, and low risk; do not run three-way technical review for obvious small fixes unless the work reveals hidden complexity
- may use shared-worktree mechanics during `in progress`, but must keep `main` history untouched and touch `stage` only for explicit PM-routed integration; provide final branch/commit evidence at `review`
- resolves code/build/test/package/asset conflicts for `stage` integration, then records the integrated `stage` commit plus clean-stage-checkout build/package evidence before returning to PM review
- before moving implementation work to `review`, runs `.agents/tools/tl_handoff_check.py --card <编号> --branch <分支>` and fixes any failure in the same loop
- when correcting metadata or `stage` handoff evidence, claims the `todo/TL` card, fixes only the requested evidence unless PM explicitly routed real rework, then sets `状态 = review` and `负责人 = PM`
- returns finished work to PM review

DESIGN loop:

- works only cards assigned to DESIGN
- uses its stable session label and stable identity in every claim/progress handoff
- claims one card or explicit asset scope at a time
- uses image generation and project-local assets
- records prompts, output paths, and design rationale
- avoids folders, source prompts, sprite sheets, or output files already claimed by another DESIGN session unless PM defined the merge plan
- uses a DESIGN-owned branch or independent worktree for production work; do not switch `/Users/claire/Documents/worktime-justin` away from `stage` or `main`
- hands finished design work to PM review with final branch, commit, reviewer-openable HTML/path evidence, and whether TL stage integration is needed
- returns finished work to PM review

QA loop:

- works only cards assigned to QA
- uses its stable session label and stable identity in every claim/progress handoff
- claims one card or explicit test scope at a time
- maintains persistent tests under `tests/`
- separates scripted tests from agentic visual tests
- performs adversarial review before accepting new test assets
- avoids concurrent edits to the same test file, visual prompt, fixture, or report path unless PM defined the merge owner
- returns test result cards to PM review
- before answering any "why is this not moving" or card-ownership question, re-read the board live and quote the current `状态` and `负责人`
- during an active sprint with nonterminal development cards, an idle QA loop should wake again within 10 minutes; use longer idle delays only when the whole board is quiet or PM has explicitly paused QA work

Loop accountability:

- A role loop that sees a `todo` card assigned to itself must not stop as idle. If it cannot do the card, it must write the exact reason to the card and route the blocker to PM before stopping. A `review` or `blocking` card assigned to TL, DESIGN, or QA is a routing defect; the role must correct executable `review` work to `todo/<role>` or report/block it to PM instead of treating it as a normal queue.
- A role loop that previously scheduled a wakeup must still obey the latest board on wake. The wakeup text is a reminder, not a source of truth.
- A role loop must not claim that Ethan needs to decide unless the card is routed to PM with the exact question and validation path, or PM has already routed it onward to Ethan. If the card owner is the role, the default assumption is that the role must act. Non-PM roles may not route directly to Ethan.

## 7. Stop Conditions

A loop should stop and report when:

- there are no actionable cards for that role
- all remaining cards are blocked by PM/Ethan, or are assigned to another role in a non-blocking active state
- required credentials or board access are unavailable
- the role would need to violate PM central routing or branch ownership rules
- the next step is destructive or outside the assigned card

When stopping, update the current card if one was active. Do not leave a card in `in progress` without `最新进展` and `下一步动作`.
