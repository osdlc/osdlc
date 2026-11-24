---
number: 97
title: Fitness corpora
detail: muscles, exercises, measurement profiles
status: todo
type: functional
milestone: "[m-model-layer](../milestones/m-model-layer.md)"
---

Define and then build the fitness corpora: a muscle corpus, a vocabulary corpus that holds equipment, movement patterns, measurement dimensions and profiles and activity kinds, an exercise corpus that references both, and an optional evidence corpus. The plan is `docs/planning/fitness-corpora.md`, written for the owner to review before anything is built.

The central design is the measurement profile: which dimensions a performance of an exercise records, general enough for lifts, holds, carries, cardio, swimming, intervals and sport. It replaces the dashboard's deferred `log_kind`.

The phases, each its own task and pull request:

- [98 Muscles corpus](98%20Muscles%20corpus.md)
- [99 Fitness vocab corpus](99%20Fitness%20vocab%20corpus.md)
- [100 Exercises corpus](100%20Exercises%20corpus.md)
- [101 Fitness evidence corpus](101%20Fitness%20evidence%20corpus.md)
- [102 Fitness corpora consumers](102%20Fitness%20corpora%20consumers.md)

Waits on task 90 Corpus standard (pull request 866) and the owner's answers to the plan's open questions, above all the licence of public content. Foods and nutrients stay in task 89 Food corpus (pull request 866). This is the model half of [85 Fitness corpus trial](85%20Fitness%20corpus%20trial.md).
