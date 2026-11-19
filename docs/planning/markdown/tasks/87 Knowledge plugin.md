---
number: 87
title: Knowledge plugin
detail: a pack of skills for corpora
status: todo
type: functional
milestone: "[m-evidence](../milestones/m-evidence.md)"
---

A proposal, not yet decided: a new plugin, `knowledge`, beside `craft` and `sdlc` in this repo's
marketplace. It holds the skills for building and keeping a knowledge corpus: a data model backed
by the claims research behind it.

The first skill comes from [86 Evidence locators](86%20Evidence%20locators.md): given a claims
corpus, find the study results that do not lead to their source, open each source, and record the
document, the locator and the excerpt. It reads and writes the corpus through
`@osdlc/corpus-query` and checks its work with `corpus-schema validate`.

Skills that may follow, each when a real corpus needs it:

- Capture: turn a source into a document record and study results.
- Answer: ask a question of a corpus and get the answer with its sources.
- Review: find statements whose evidence is weak, old or dead.
- Convert: turn a vault into a corpus, from [85 Fitness corpus trial](85%20Fitness%20corpus%20trial.md).

Decide first: whether this is a new plugin or skills in an existing one, and its name. Then write
the first skill and prove it on the harness reference.
