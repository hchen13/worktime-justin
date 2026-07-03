# WorkTime Justin Agent Protocol

This project uses a multi-agent workflow. Every participant must coordinate through the Feishu Bitable board and keep each card actionable.

Detailed protocol:

- Collaboration rules: [.agents/docs/multi-agent-workflow.md](.agents/docs/multi-agent-workflow.md)
- QA testing protocol: [.agents/docs/qa-testing-protocol.md](.agents/docs/qa-testing-protocol.md)
- Agent runtime loops and automations: [.agents/docs/agent-runtime-loops.md](.agents/docs/agent-runtime-loops.md)
- Production asset quality bar: [.agents/docs/production-asset-quality.md](.agents/docs/production-asset-quality.md)
- Feishu board setup script: [.agents/tools/setup_feishu_board.py](.agents/tools/setup_feishu_board.py)
- Project-local Hyperframes skills for Codex: [.codex/skills/](.codex/skills/)
- Project-local Hyperframes skills for Claude Code: [.claude/skills/](.claude/skills/)

Core rules:

1. Use Chinese for project discussion unless a task explicitly requires another language.
2. Do obvious next steps that belong to the assigned card; do not stop for avoidable permission checks.
3. All work must be represented by a Feishu card with `编号`, `负责人`, `状态`, `下一步动作`, and `验收标准`.
4. No stale cards: a card in `in progress`, `review`, `testing`, or `blocking` must name the next accountable role and the condition for moving forward.
5. PM owns official card creation, cross-role routing, and final acceptance. Non-PM roles submit completed work to PM review instead of assigning follow-up work directly to other roles.
6. PM owns `main`; TL owns non-main implementation branches. Do not merge to `main` outside the PM workflow.
7. Use the role-specific Feishu app identity from `.env` when reading or writing the board.
8. Hyperframes skills are installed locally under `.codex/skills/` and `.claude/skills/`; do not install them globally for this project.
9. QA assets are persistent project assets. New behavior must add or update reusable test cases under `tests/`, not only run a one-off check.
10. Role sessions may run as loops. Follow [.agents/docs/agent-runtime-loops.md](.agents/docs/agent-runtime-loops.md) for Claude Code loops, Codex role loops, and PM automation/cron behavior.
11. Documentation mockups and production assets are different quality classes. Real app sprites, treasure chests, stickers, and reward visuals must satisfy [.agents/docs/production-asset-quality.md](.agents/docs/production-asset-quality.md); rough mockups, emoji, or placeholder-looking art must not ship as product assets.
12. PM loop must check for whole-board completion. When every official card is terminal (`done` or `_deprecated`) and no active card remains, PM sends Ethan a one-time Feishu DM using the PM app identity via [.agents/tools/pm_completion_notify.py](.agents/tools/pm_completion_notify.py).
