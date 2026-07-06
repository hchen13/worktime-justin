# Prompt And Rationale

## Design Prompt

Create a non-shipping visual reference pack for WorkTime Justin reward fireworks. The visuals must feel celebratory on a dark child-facing canvas, avoid generic RGB noise, and give TL usable runtime parameters for a code-generated particle system.

## Selected Direction

- Use three distinct presets instead of one generic burst.
- Keep palettes fixed and curated, then allow small runtime hue/value jitter.
- Place particles behind or around rewards, never over the primary object or task target.
- Prefer fast bloom and fade timings under one second so the screen does not stay dirty.

## Rejected Directions

- Full random rainbow: too noisy and hard to control.
- Giant white flash: too aggressive for a toddler-facing app and can obscure the reward.
- Fixed GIF/sprite implementation: conflicts with Ethan's request for randomized runtime particles.
- Heavy full-screen particle storm: risks old Mac performance and hides task/reward objects.

## Tradeoffs

The preview images are generated locally from deterministic particle drawings rather than using a black-box image model. That makes the references less painterly, but much more useful for TL because every style maps directly to particle count, duration, density, gravity/drag, and palette choices.
