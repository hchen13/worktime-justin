# WorkTime Justin Agent Protocol

This project uses a multi-agent workflow. Every participant must coordinate through the Feishu Bitable board and keep each card actionable.

Detailed protocol:

- Collaboration rules: [.agents/docs/multi-agent-workflow.md](.agents/docs/multi-agent-workflow.md)
- QA testing protocol: [.agents/docs/qa-testing-protocol.md](.agents/docs/qa-testing-protocol.md)
- Agent runtime loops and automations: [.agents/docs/agent-runtime-loops.md](.agents/docs/agent-runtime-loops.md)
- Production asset quality bar: [.agents/docs/production-asset-quality.md](.agents/docs/production-asset-quality.md)
- Feishu board setup script: [.agents/tools/setup_feishu_board.py](.agents/tools/setup_feishu_board.py)
- Global Lark CLI skills for Feishu access: `/Users/claire/.codex/skills/lark-*` and `/Users/claire/.claude/skills/lark-*`
- Project-local Hyperframes skills for Codex: [.codex/skills/](.codex/skills/)
- Project-local Hyperframes skills for Claude Code: [.claude/skills/](.claude/skills/)

Core rules:

1. Use Chinese for project discussion unless a task explicitly requires another language.
2. Do obvious next steps that belong to the assigned card; do not stop for avoidable permission checks.
3. All work must be represented by a Feishu card with `编号`, `负责人`, `状态`, `下一步动作`, and `验收标准`.
4. No stale cards: a card in `in progress`, `review`, `testing`, or `blocking` must name the next accountable role and the condition for moving forward.
5. PM owns official card creation, cross-role routing, and final acceptance. Non-PM roles submit completed work to PM review instead of assigning follow-up work directly to other roles.
6. PM owns `main` and the product acceptance gate. TL owns implementation branches and the runnable integration branch `stage`. Do not merge to `main` outside the PM workflow; do not touch `stage` except through TL stage-integration work routed or accepted by PM.
7. `stage` is Ethan's runnable integration-acceptance branch, not QA's required test target. After PM accepts a runtime-impacting or docs-preview-impacting branch that should be shown to Ethan as the combined app/docs state, PM routes TL to merge it into `stage`. TL resolves code/build/test conflicts, builds from `stage`, and records the `stage` commit/evidence on the card; if integration needs product or PM-owned document/protocol judgment, TL routes the exact blocker back to PM. PM promotes `stage` to `main` only after Ethan accepts it as a stable baseline. QA may run focused target tests from a named branch, package, or independent worktree when the card says what is under test.
8. Use the role-specific Feishu app identity from `.env` when reading or writing the board.
9. Use the global `lark-cli` and Lark skills first for Feishu/Lark work. Do not create a new ad hoc Feishu client when an installed Lark skill or `lark-cli` command covers the operation.
10. Hyperframes skills are installed locally under `.codex/skills/` and `.claude/skills/`; do not install them globally for this project.
11. QA assets are persistent project assets. New behavior must add or update reusable test cases under `tests/`, not only run a one-off check.
12. Role sessions may run as loops. Follow [.agents/docs/agent-runtime-loops.md](.agents/docs/agent-runtime-loops.md) for Claude Code loops, Codex role loops, and PM automation/cron behavior.
13. Documentation mockups and production assets are different quality classes. Real app sprites, treasure chests, stickers, and reward visuals must satisfy [.agents/docs/production-asset-quality.md](.agents/docs/production-asset-quality.md); rough mockups, emoji, or placeholder-looking art must not ship as product assets.
14. PM loop must check for whole-board completion. When every official card is terminal (`done` or `_deprecated`) and no active card remains, PM sends Ethan a one-time Feishu DM using the PM app identity via [.agents/tools/pm_completion_notify.py](.agents/tools/pm_completion_notify.py).
15. Use the lightweight task path for small, clear, low-risk cards. Full multi-agent technical review is required for complex architecture, cross-module behavior, packaging/security, production asset standards, and other high-risk work; it is not required for obvious CSS/doc/copy fixes or tightly scoped implementation slices with clear acceptance checks.
16. Implementation handoff has two different failure modes. Missing final branch/commit/evidence is a `review` handoff correction, not technical rework: PM keeps the card in `review`, assigns TL, and asks only for the missing handoff metadata. Real code or behavior defects are routed back to `todo` unless the original executor has explicitly acknowledged the rejection and is actively continuing in the same session; only then may PM keep or move the card to `in progress`. TL review handoff must name the final branch, final commit, verification evidence, risks, and recommended PM route.
17. TL must run [.agents/tools/tl_handoff_check.py](.agents/tools/tl_handoff_check.py) before moving implementation work to `review`. If the preflight fails, TL fixes the branch/evidence in the same loop and does not hand off to PM yet.
18. Multiple sessions may run under the same role, especially `DESIGN` and `QA`. `负责人` remains role-level, but every active same-role session must claim work in `最新进展` with both a readable label and a stable runtime identity, such as `执行者：DESIGN-A；身份ID：CodexThread:<thread-id>` or `执行者：QA-Visual；身份ID：ClaudeSession:<session-id>`, and must not touch another session's claimed asset/test scope without PM routing.
19. Tool calls must use the actual Codex/Claude Code tool interface only. Do not type XML-like or JSON-like tool-call markup such as `<invoke ...>` in ordinary assistant text, and do not use stray marker words such as `课` or `course` before tool calls. Do not repeat leaked marker words in wakeup prompts; use neutral wording like `keep ordinary text separate from tool calls`. If any tool-call-looking text or stray marker leaks into a normal message, treat it as a tool-call hygiene incident: verify whether the intended tool actually ran, retry through the real tool interface if it did not, and report the incident plus evidence instead of assuming the board or files changed.
20. PM loop must inspect active role session transcripts or thread summaries when available, especially when a card is stale, a role asks Ethan for missing information, or several cards were claimed at once. Session chat is not durable coordination: PM must translate any discovered blocker, missing asset path, or clarified instruction back into the Feishu card fields.
21. Cards that require a document, image, sprite, audio file, branch, test, or accepted design spec must name the exact local path or card ID in `依赖`, `下一步动作`, or `产物/证据`. Do not write vague instructions like "use the image" or "see the design"; PM must provide the path before expecting TL, DESIGN, or QA to proceed.
22. Status values are user-facing signals. `todo` means ready but not currently claimed by a concrete session. `in progress` means a specific live executor has claimed the card in `最新进展` with label and stable identity and is expected to continue without stakeholder monitoring. PM must not park rejected work in `in progress` just to show role ownership; if no session has acknowledged the returned work, set `状态 = todo`.
23. Non-PM roles may mark a card `blocking` only by routing it to PM (`负责人 = PM`, `阻塞负责人 = PM`) with the exact question or missing artifact. PM then decides whether the real blocker belongs to Ethan, TL, DESIGN, QA, or should be converted back to `todo`.
