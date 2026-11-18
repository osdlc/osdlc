---
number: 92
title: USDA FDC builder
detail: builder on fixtures
status: todo
type: functional
milestone: "[m-model-layer](../milestones/m-model-layer.md)"
after:
  - "[90 Corpus standard](90%20Corpus%20standard.md)"
  - "[91 Food nutrients corpus](91%20Food%20nutrients%20corpus.md)"
---

Create `packages/corpora/usda-fdc` with its builder, run on fixtures.

Delivers: `src/build/` ported from determined's `build-usda-pack.ts` and `rules.ts`; schemas for foods, categories and releases; the `whole-foods` tag; fixtures; tests; `check` green. Needs the layout of task 90 and the catalogue of task 91.

Done when a fixture build matches the golden records, with no network.

Part of [89 Food corpus](89%20Food%20corpus.md). See the food corpus plan, `docs/planning/food-corpus.md`.
