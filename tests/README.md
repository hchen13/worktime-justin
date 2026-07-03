# WorkTime Justin Test Assets

Tests in this project are durable assets. If a behavior is worth checking and can be reproduced, preserve the test case here instead of treating it as a one-off QA note.

Directory convention:

- `unit/`: logic-level tests.
- `e2e/`: scripted frontend/app-flow tests.
- `visual/scripts/`: scripts that drive the app to a state and capture screenshots.
- `visual/cases/`: agentic visual test prompts and pass/fail schemas.
- `fixtures/`: reusable fixtures and deterministic input streams.
- `reports/`: generated test reports and screenshots.

See [.agents/docs/qa-testing-protocol.md](../.agents/docs/qa-testing-protocol.md) for the full QA workflow.
