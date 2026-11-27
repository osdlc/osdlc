---
id: T-01
type: task
state: open
created: 2026-11-22
---

# T-01: `extractEmbeddedBases` matches fences too loosely

## Goal

`extractEmbeddedBases` returns one base for each ```base fence of a markdown note, and only for
those.

## Today

The pattern in `src/base/parse.ts` reads the info word as a prefix, so a ```base64 fence is read as
a base. It needs a non-empty body, so an empty ```base block is dropped or merged with the next
fence.

## Approach

- [ ] Match `base` only as the whole info word.
- [ ] Allow an empty body, and return the empty base it parses to.
- [ ] Add tests for both, and for a ```base64 fence beside a real one.

## Acceptance criteria

- [ ] A ```base64 fence yields no base.
- [ ] An empty ```base block yields one empty base and does not swallow the next fence.
