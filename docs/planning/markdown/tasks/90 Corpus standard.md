---
number: 90
title: Corpus standard
detail: S-corpus-package-shape
status: todo
type: supporting
milestone: "[m-model-layer](../milestones/m-model-layer.md)"
---

Write the standard for a corpus with its builder, and enforce it.

Delivers: `docs/planning/standards/S-corpus-package-shape.md` (layout, scripts and rules from the plan's Q6, including `export/datapackage.json` as Data Package v2); the fix to the sentence in `packages/README.md` that says corpora hold no code; a `corpora` mode in `@osdlc/package-checks`; the rename of `harness-reference`'s `src/compile` to `src/build`, its `compile` script to `build`, `validate --strict`, and a `verify` script (and `LICENSE-*` and `CHANGELOG.md`, or an exemption for private packages); `sdlc-starter` gets `validate` and `check` scripts. The standards README gets a row.

Done when `pnpm run check:packages` runs the corpora checks, and `sdlc-starter` and `harness-reference` pass or are listed with the changes each needs. The corpus-schema spec does not change.

Part of [89 Food corpus](89%20Food%20corpus.md). See the food corpus plan, `docs/planning/food-corpus.md`.
