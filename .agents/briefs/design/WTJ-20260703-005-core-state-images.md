# WTJ-20260703-005 Core State Images

## Goal

Create document-facing images that explain the product states in `docs/index.html`. These are communication assets for the requirements artifact, not final in-app production sprites.

## Outputs

Save 4 images under:

`/Users/claire/Documents/worktime-justin/docs/assets/states/`

Required states:

1. `default-canvas.png`: clean dark fullscreen canvas, several colorful high-contrast floating letters fading out, one small `?`, five discovery slots.
2. `secret-word-dog.png`: `dog` has just been recognized; cute puppy appears with sound/reward glow; bottom slot fills.
3. `question-task-drag.png`: `?` task mode; apple being dragged toward a basket, no written task text.
4. `treasure-reward.png`: five slots are full; treasure chest opens with one-time fireworks/sticker burst, screen still clean.

## Style

- Continue the accepted MVP mock direction in `docs/assets/accepted-mvp-mockup.png`.
- Deep clean background, lots of negative space.
- Child-friendly but not cartoon-cluttered.
- High-contrast readable letter colors.
- No Chinese task text inside the app UI.
- No copyrighted characters.

## Prompt Starter

```text
Use case: UI mockup image for a children's fullscreen desktop app.
Create a high-fidelity 16:9 app screenshot for "Work Time, Justin!" / "小小工作台".
The app is a minimal dark fullscreen canvas for a 3-year-old child. Keep the interface sparse and calm.
Show [STATE DESCRIPTION].
Use bright high-contrast letters and soft reward glow. Include only minimal UI: app title, tiny parent lock, one small question mark task button, bottom five discovery slots.
No text-heavy instructions, no Chinese task copy, no dense dashboard, no copyrighted characters.
```

Replace `[STATE DESCRIPTION]` with each required state.

## Acceptance Notes

The images should make the product behavior easier to understand in the docs. They do not need to be pixel-perfect implementation targets.
