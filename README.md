# WorkTime Justin

WorkTime Justin / 小小工作台 is a fullscreen macOS app for Justin's old MacBook. The app started from a simple idea: Justin sees his parents working, opens his own old computer, and says he wants to "work" too.

It turns that moment into a safe, playful workbench with keyboard exploration, pointer play, simple tasks, word cards, sounds, and small visual rewards.

## Release

Current release: `1.0.0`

- macOS 11+ universal app: `x86_64` and `arm64`
- Release build output: `app/dist/WorkTimeJustin.app`
- DMG output: `app/dist/WorkTimeJustin.dmg`
- Stakeholder validation target: Justin's old Intel MacBook Air on macOS Big Sur

## Build And Run

Build the app:

```bash
./app/build.sh
```

Open the local build:

```bash
open app/dist/WorkTimeJustin.app
```

For the development machine, use the project build under `app/dist/`. Do not keep a development copy in `/Applications`. For Justin's machine, install the release app as `/Applications/WorkTimeJustin.app`.

## Project Layout

- `app/`: macOS app shell and bundled web runtime
- `docs/index.html`: requirements and asset validation artifact
- `docs/design-review.html`: design and media review artifact
- `tests/`: reusable checks and validation assets
- `.agents/docs/`: multi-agent collaboration protocol

Parent controls and local security notes are documented in `app/SECURITY.md`.
