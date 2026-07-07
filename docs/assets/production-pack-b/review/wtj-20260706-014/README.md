# WTJ-20260706-014 Treasure Review Evidence

This folder contains the visual evidence for replacing the Pack B `treasure` production candidate without touching the runtime app copy.

## Files

- `treasure-before-runtime-copy.png`: current runtime `app/web/assets/sprites/treasure.png`, preserved as before evidence.
- `treasure-chest-reference.png`: current runtime `app/web/assets/sprites/treasure-chest.png`, preserved as the confusing reference.
- `treasure-new-production.png`: new DESIGN production candidate, same pixels as `docs/assets/production-pack-b/sprites/treasure.png`.
- `treasure-vs-chest-dark-72-128.png`: dark-canvas comparison at 128px and 72px.

## Decision

Accepted direction for PM review: use a compact pile of loose gold coins and colored gems. Rejected direction: any object with a box, chest, crate, pouch, lock, hinged lid, or container body.

## Runtime Note

Per card instruction, this DESIGN handoff does not replace `app/web/assets/sprites/treasure.png`. PM review can route TL to copy the accepted production candidate into the runtime sprite path.
