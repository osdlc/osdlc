---
number: 95
title: Food corpus consumers
detail: determined and dashboard
status: todo
type: functional
milestone: "[m-model-layer](../milestones/m-model-layer.md)"
after:
  - "[94 Publish USDA FDC](94%20Publish%20USDA%20FDC.md)"
---

Two pull requests in sksizer/dev: (a) determined switches to the package and keeps a thin adapter (curated rule, confidence, field names, `external_refs`); (b) the dashboard pack tool reads the `whole-foods` tag, and the offline match for T-F9KM. Done when determined's ndjson regenerates equal and the dashboard installs the pack in a dry run.

Part of [89 Food corpus](89%20Food%20corpus.md). See the food corpus plan, `docs/planning/food-corpus.md`.
