---
number: 91
title: Food nutrients corpus
detail: the nutrient catalogue
status: todo
type: functional
milestone: "[m-model-layer](../milestones/m-model-layer.md)"
---

Create `packages/corpora/food-nutrients`: the nutrient catalogue, owned by osdlc.

Delivers: 68 records seeded from determined's nutrient notes, each with `fdc_nutrient_number`, `off_key` and `infoods_tagname`, plus `nutrient-categories`; schemas; README; validates with `--strict`. Needs the owner's word that the notes may be public (task 85 has the same gate). Task 85 and this task must agree on the catalogue's shape.

Done when `validate` passes and the ids equal determined's catalogue ids. Independent of task 90.

Part of [89 Food corpus](89%20Food%20corpus.md). See the food corpus plan, `docs/planning/food-corpus.md`.
