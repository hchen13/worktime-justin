# QA Testing Protocol

QA is a coordinator role, not only a final checker. Its output is both a test result and a durable test asset that can be reused in future full regression runs.

Multiple QA sessions may run at the same time. They share the role owner `QA`, but each concrete session must use both a stable executor label and stable runtime identity in `最新进展`, for example `执行者：QA-Visual；身份ID：ClaudeSession:<session-id>`.

Integrated QA validation should run against the PM-maintained `stage` branch or a package built from a named `stage` commit. QA may test a feature branch only when the card explicitly says the run is branch-specific and not representative of the combined app state.

## 1. Test Asset Principle

If a behavior is worth testing once and can be reproduced, it should become a reusable project asset under `tests/`.

One-off testing is acceptable only when the target is exploratory, impossible to reproduce, or explicitly marked as not worth preserving by PM.

For cards explicitly routed as `轻量流程`, QA may use existing reusable tests plus focused smoke checks instead of creating a full new test suite. If the light card changes behavior in a way that is not already covered, QA should add the smallest durable test asset that covers the new risk.

Every durable test case must state:

- what to test
- how to reach the state under test
- what evidence to collect
- what counts as pass/fail
- which script or agentic prompt executes the case

## 2. Test Types

Use these categories unless PM changes the project structure:

- Unit: logic-level checks for pure functions or isolated modules.
- Frontend E2E: scripted UI behavior checks, normally with Playwright or an equivalent driver.
- Visual: screenshot-driven visual quality checks with an agentic visual-understanding prompt.
- Integration: checks across multiple local modules.
- API E2E: kept as a supported category, but expected to be rare because this project is currently planned as a mostly frontend desktop app.

## 3. Directory Layout

Reusable tests live under `tests/`:

- `tests/unit/`: unit tests.
- `tests/e2e/`: scripted frontend or app-flow tests.
- `tests/visual/`: visual test cases and prompts.
- `tests/visual/scripts/`: scripts that drive the app to a visual state and capture screenshots.
- `tests/visual/cases/`: agentic visual test prompts and expected evaluation schema.
- `tests/fixtures/`: reusable assets, fixtures, and deterministic input streams.
- `tests/reports/`: generated reports and screenshots. Large or generated files should be ignored by git unless PM decides otherwise.

## 4. Scripted Test Flow

Scripted tests cover behavior that can be objectively driven and checked.

Examples:

- pressing a letter creates one visible letter element
- repeated key-hold does not overcount exploration progress
- `dogg` triggers `dog` once
- completing three tasks triggers the work-state reward
- parent exit requires the intended long-press and passcode flow

Required flow:

1. QA designs test cases with at least two tester subagents.
2. QA chooses cases to preserve and records them in the Feishu card.
3. Test engineers implement scripts under `tests/`.
4. QA spawns an adversarial reviewer subagent that assumes the test is wrong and tries to prove coverage drift, false positives, false negatives, or implementation coupling.
5. QA fixes or rejects the test until the adversarial review is satisfied.
6. QA runs the test and records result, command, evidence, and residual risk.

When multiple QA sessions are active:

- Each session claims one card or one explicit test scope before editing files, using both executor label and runtime identity.
- Distinct QA sessions may split by `测试类型`, feature area, or asset path.
- Do not concurrently edit the same test script, visual prompt, fixture, or report path unless PM has named a merge owner.
- A session that discovers overlap stops and returns the card to PM review for splitting rather than racing another QA session.
- `对抗评审` or `产物/证据` must name the test creator executor label/identity and adversarial reviewer label/identity when a reusable test asset is added or changed.

## 5. Agentic Visual Test Flow

Visual checks are persistent test cases too, but their executable asset is often a prompt plus a screenshot-capture script rather than a pure assertion script.

Visual test assets should include:

- a script or documented path to reach the visual state
- screenshot output path
- visual-understanding prompt
- pass/fail schema
- explicit visual focus

The prompt must not ask for generic image description. It must name the target visual question, for example:

- whether the screen stays clean after letter fade-out
- whether high-contrast random letters remain readable on the dark background
- whether the bottom five discovery slots are visible without crowding the canvas
- whether the reward animation is celebratory but not visually noisy after it ends

Expected output should be structured, normally:

```json
{
  "pass": true,
  "reason": "short explanation",
  "evidence": ["specific visual observations"],
  "risks": ["remaining uncertainty"]
}
```

## 6. Regression Runs

Full regression means:

- run all relevant scripted tests
- run all relevant visual screenshot scripts
- execute selected visual-understanding prompts through tester subagents
- summarize failures, flakes, and residual risk

When a UI change breaks an old test because the product intentionally changed, QA must update the test asset in the same workflow. Do not silently delete or bypass old coverage.

## 7. Feishu Card Requirements

QA-related cards should fill these fields when relevant:

- `测试方式`: `Scripted`, `Agentic`, or `Hybrid`
- `测试类型`: `Unit`, `Frontend E2E`, `Visual`, `API E2E`, or `Integration`
- `测试资产路径`: path under `tests/`
- `测试覆盖范围`: behavior or visual state covered
- `对抗评审`: adversarial review outcome
- `QA结果`: current execution result
- `产物/证据`: command output summary, screenshot path, report path, or reviewer notes
- `分支` or `产物/证据`: source branch/commit under test. For integrated app validation this must be a `stage` commit or a package built from `stage`.

QA cards can start from `todo` when the work is test design or test asset maintenance. They do not need to wait for an implementation card to enter `testing`.

## 8. QA Handoff To PM

QA reports; PM routes.

After any QA execution or QA asset work, QA must hand the card back to PM:

- set `状态 = review`
- set `负责人 = PM`
- set `评审负责人 = PM`
- set `QA结果` to the observed result
- update `测试资产路径`, `测试覆盖范围`, and `对抗评审` when applicable
- summarize executor label/identity, failures, evidence, suspected owner, and recommended next action in `最新进展` / `下一步动作`

QA must not directly reassign failed work to TL, DESIGN, or Ethan. PM decides whether to route rework, open or approve a follow-up card, mark the issue blocked, close the card, or deprecate it.
