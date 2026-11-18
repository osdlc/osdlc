---
number: 93
title: USDA FDC first release
detail: SR Legacy and Foundation
status: todo
type: functional
milestone: "[m-model-layer](../milestones/m-model-layer.md)"
after:
  - "[92 USDA FDC builder](92%20USDA%20FDC%20builder.md)"
---

The first full build of `usda-fdc`.

Delivers: `pin` and `fetch`; the real SR Legacy 2018-04 and Foundation 2026-04-30 build, committed; `export/foods.ndjson` and `export/datapackage.json`; README with licence and credit; changelog.

Done when a second `build` gives zero diff, sizes are measured and written in the README, and the oracle test passes: the corpus reproduces determined's current ndjson (3,091 foods, 135,411 nutrient rows, 5,621 portions).

Part of [89 Food corpus](89%20Food%20corpus.md). See the food corpus plan, `docs/planning/food-corpus.md`.
