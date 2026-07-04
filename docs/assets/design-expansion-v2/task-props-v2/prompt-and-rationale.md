# Prompt And Rationale

Card: `WTJ-20260704-064`
Owner session: `Designer 1 / Automation:worktime-justin-design-loop`

## Source Strategy

The safest route for this card is not a fresh mixed AI batch. I reused accepted `production-pack-b` sprites and normalized them into task props so the materials, lighting, alpha, and dark-canvas readability stay aligned with the current WorkTime Justin production baseline.

Selection rules:

- polished 2.5D soft-plastic / soft-clay object style
- simple silhouette that still reads at 72 px
- no embedded text, watermark, background, or brand-like character
- no old low-confidence basket, dog, or treasure directions
- balanced drag, click, and find task coverage

## Generation Rule

```text
Create WorkTime Justin future-task props in the accepted production sprite style. Use transparent PNGs, rounded soft-clay geometry, consistent 3/4-ish object language, top-left soft light, clean alpha, and dark-canvas readability at 72 px and 128 px. Cover draggable, clickable, and findable task objects. Avoid flat icon/vector art, rough mockups, emoji-like assets, copyrighted character imitation, text inside assets, dirty alpha, magenta/green chroma remnants, crop artifacts, and the previously rejected basket/dog/treasure directions.
```

## Tradeoffs

- Reusing accepted sprites is less novel than generating 20 new images, but it directly addresses the current quality problem: consistency and production polish matter more than novelty.
- These are static props. Some click props have obvious future animation hooks (`bell`, `lamp`, `faucet`, `door`, `rocket`, `train`), but this card does not create runtime animation.
- `duck` is included as a toy-like search target, while the rejected dog direction stays out of this pack.

## Self-Check

- Active prop PNG count: 20.
- All active prop PNGs are 512 x 512 RGBA: True.
- Transparent corners are clean: True.
- Minimum alpha margin: 65 px.
- Pure magenta/green chroma-like active pixels after cleanup: 0.
- Missing manifest paths: [].
- Contact sheet shows both 128 px and 72 px previews on the dark app canvas.
