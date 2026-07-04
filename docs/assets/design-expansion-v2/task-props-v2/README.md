# Future Task Props v2

Card: `WTJ-20260704-064`
Owner session: `Designer 1 / Automation:worktime-justin-design-loop`

This pack provides static future-task props for PM/Ethan review. It is a design candidate pack, not an automatic runtime handoff.

## Contents

- `props/`: 20 transparent task prop PNGs on 512 x 512 canvases.
- `contact-sheets/task-props-v2-contact-sheet.png`: dark-canvas sheet with 128 px and 72 px previews.
- `manifest.json`: source path, suggested task sentence, interaction type, hit area, anchor, bounds, and review notes for each prop.
- `prompt-and-rationale.md`: source strategy, exclusion decisions, tradeoffs, and self-check results.

## Coverage

- drag: 6 props
- click: 7 props
- find: 7 props

## Active Props

- `apple` / `drag`: Put the apple in the glowing spot.
- `ball` / `drag`: Move the ball to the play spot.
- `gift` / `drag`: Carry the gift to the finish light.
- `flower` / `drag`: Place the flower on the desk.
- `key` / `drag`: Drag the key to the door.
- `star` / `drag`: Move the star into the tray.
- `bell` / `click`: Tap the bell.
- `lamp` / `click`: Turn on the lamp.
- `faucet` / `click`: Turn off the faucet.
- `door` / `click`: Open the door.
- `drum` / `click`: Tap the drum.
- `rocket` / `click`: Launch the rocket.
- `train` / `click`: Start the train.
- `duck` / `find`: Find the duck.
- `cup` / `find`: Find the cup.
- `cake` / `find`: Find the cake.
- `hat` / `find`: Find the hat.
- `heart` / `find`: Find the heart.
- `rainbow` / `find`: Find the rainbow.
- `pencil` / `find`: Find the pencil.

## Review Notes

- The active set deliberately excludes the earlier low-confidence basket, dog, and treasure directions.
- Every prop is normalized from accepted production-pack-b sprites to keep the WorkTime Justin 2.5D soft-clay baseline.
- Thin or small props such as `key` and `pencil` have generous recommended hit areas for toddler-friendly interaction.
- Runtime placement, scale, and any animation hooks should be handled later through a PM-routed TL integration card if accepted.
