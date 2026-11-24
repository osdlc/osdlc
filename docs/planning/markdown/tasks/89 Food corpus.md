---
number: 89
title: Food corpus
detail: foods from USDA, and a corpus standard
status: todo
type: functional
milestone: "[m-model-layer](../milestones/m-model-layer.md)"
---

Build a corpus of foods from USDA FoodData Central that an app can optionally ingest, with its builder in the package, and a standard for any corpus with a builder. The plan is the food corpus plan, `docs/planning/food-corpus.md`, in [pull request 866](https://github.com/osdlc/osdlc/pull/866).

Decided by the owner: all SR Legacy and Foundation foods with a `whole-foods` tag; osdlc owns the `food-nutrients` catalogue, seeded from determined's notes; the standard is a convention doc plus a package-checks mode, and harness-reference renames `src/compile` to `src/build`. Still open: three corpora or two.

The phases, each its own task and pull request:

- [90 Corpus standard](90%20Corpus%20standard.md)
- [91 Food nutrients corpus](91%20Food%20nutrients%20corpus.md)
- [92 USDA FDC builder](92%20USDA%20FDC%20builder.md)
- [93 USDA FDC first release](93%20USDA%20FDC%20first%20release.md)
- [94 Publish USDA FDC](94%20Publish%20USDA%20FDC.md)
- [95 Food corpus consumers](95%20Food%20corpus%20consumers.md)
- [96 Other food sources](96%20Other%20food%20sources.md)

Overlaps [85 Fitness corpus trial](85%20Fitness%20corpus%20trial.md): foods and nutrients come from these corpora.
