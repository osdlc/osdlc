---
number: 4
title: Claims example
detail: profiles/claims
status: done
type: functional
milestone: "[m-evidence](../milestones/m-evidence.md)"
after:
  - "[3 Publish 0.2.0](3%20Publish%200.2.0.md)"
---

Example claims corpus, in this repo at `profiles/claims/example/`. A valid level-2 corpus with the
VA-Spec types `documents`, `study-results`, `methods` and `statements`, their schemas, and a few
records that show the whole chain. After 3.
- A statement holds its proposition (subject, predicate, object) and its evidence lines. Each line
  names study results, says whether it supports or disputes the statement, and how strongly.
- Contribution (who, when, what role) is a field on records, not a type of its own.
- `profiles/claims/README.md` maps each type to VA-Spec and says what we leave out and why. Check it
  against VA-Spec's published schemas.
- CI validates the example with `@osdlc/corpus-schema` from npm.
- People copy it with `npx degit osdlc/markdown/profiles/claims/example <dir>`. No npm package is
  needed yet.

- Until task 31, a statement's evidence lines are plain relative links with a pattern check, not
  `x-ref`.

Done: [osdlc/markdown#6](https://github.com/osdlc/markdown/pull/6).
