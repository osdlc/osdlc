---
number: 100
title: Exercises corpus
detail: exercises, families, profiles in use
status: todo
type: functional
milestone: "[m-model-layer](../milestones/m-model-layer.md)"
after:
  - "[98 Muscles corpus](98%20Muscles%20corpus.md)"
  - "[99 Fitness vocab corpus](99%20Fitness%20vocab%20corpus.md)"
---

Create `packages/corpora/exercises`: the 200 verified exercises and 34 movement families, referencing `muscles` and `fitness-vocab`, each exercise naming one measurement profile; plus about 40 new non-strength exercises.

Done when `validate --strict` passes, every profile is used by a verified exercise, and the plan's section 4 acceptance checks pass. Adopting free-exercise-db rows is a second pull request.

Part of [97 Fitness corpora](97%20Fitness%20corpora.md). See the fitness corpora plan, `docs/planning/fitness-corpora.md`.
