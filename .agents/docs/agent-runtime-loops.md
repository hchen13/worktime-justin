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
You are TL for WorkTime Justin. Read AGENTS.md and the docs it references. Use the TL Feishu app identity from .env. Start your role loop: scan cards assigned to TL, take one actionable card at a time, update Feishu status fields, do the work, and hand completed work back to PM review. Do not touch main.
```

Example QA start prompt:

```text
You are QA for WorkTime Justin. Read AGENTS.md, multi-agent workflow, and QA testing protocol. Use the QA Feishu app identity from .env. Start your QA loop: scan cards assigned to QA, maintain reusable tests under tests/, run or design tests as needed, perform adversarial review for new test assets, and return results to PM review.
```

Example PM start prompt:

```text
You are PM for WorkTime Justin. Read AGENTS.md and all .agents/docs protocols. Use the PM Feishu app identity from .env. Start your PM loop: triage backlog, create official cards, route review cards, handle blockers, enforce no-stale rules, and own main branch decisions.
```

## 3. Loop Algorithm

Each role loop repeats this sequence:

1. Read `AGENTS.md` and relevant `.agents/docs/` files.
2. Use that role's app credentials from `.env` for Feishu writes.
3. Read board cards where `负责人` is the current role.
4. Prioritize in this order: `blocking`, `review`, `in progress`, `testing`, `todo`, `backlog`.
5. Pick one actionable card and update `最新进展` before meaningful work begins.
6. Do the work required by the card.
7. Update `状态`, `负责人`, `下一步动作`, `产物/证据`, and role-specific fields.
8. If the role is not PM and the assigned work is finished, return the card to `review` with `负责人 = PM`.
9. Continue until no actionable cards remain or a real blocker prevents progress.

Do not process multiple cards in parallel inside one role session unless the role protocol explicitly calls for subagents, such as TL technical review or QA tester review.

## 4. Claiming Work

To avoid two agents working the same card:

- Before starting a `todo` card, set `状态 = in progress`, keep `负责人` as the current role, and write `最新进展` with the session identity and current action.
- If a card already has another clear active `最新进展`, do not overwrite it unless the role owns that card and the previous session is clearly finished or stale.
- If ownership is unclear, move it to `review` for PM triage rather than racing another role.

## 5. PM Automation/Cron

Codex automation is appropriate for PM-side recurring coordination, not for unbounded development.

Recommended PM cron responsibilities:

- scan `review` cards and route them
- inspect `blocking` cards and ensure `阻塞负责人`, `阻塞问题`, and `下一步动作` are clear
- find stale `in progress`, `testing`, or `review` cards missing required fields
- groom `backlog` proposals into official cards or `_deprecated`
- summarize board health and urgent decisions

PM automation must use PM Feishu credentials and must not impersonate TL, DESIGN, or QA.

Automation should be bounded:

- do not run open-ended implementation work
- do not merge code unless the card explicitly calls for PM git work and evidence is complete
- do not create duplicate cards when an existing card can be updated
- stop and mark `blocking` when Ethan clarification is genuinely required

## 6. Non-PM Role Loops

TL loop:

- works only cards assigned to TL
- owns non-main branches
- may spawn technical review/dev/review subagents as defined in the workflow
- returns finished work to PM review

DESIGN loop:

- works only cards assigned to DESIGN
- uses image generation and project-local assets
- records prompts, output paths, and design rationale
- returns finished work to PM review

QA loop:

- works only cards assigned to QA
- maintains persistent tests under `tests/`
- separates scripted tests from agentic visual tests
- performs adversarial review before accepting new test assets
- returns test result cards to PM review

## 7. Stop Conditions

A loop should stop and report when:

- there are no actionable cards for that role
- all remaining cards are blocked by PM/Ethan/another role
- required credentials or board access are unavailable
- the role would need to violate PM central routing or branch ownership rules
- the next step is destructive or outside the assigned card

When stopping, update the current card if one was active. Do not leave a card in `in progress` without `最新进展` and `下一步动作`.

