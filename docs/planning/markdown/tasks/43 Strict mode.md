---
number: 43
title: Strict mode
detail: warnings fail
status: done
type: supporting
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[3 Publish 0.2.0](3%20Publish%200.2.0.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
  - "[osdlc/osdlc#790](https://github.com/osdlc/osdlc/pull/790)"
---

Add `--strict` to `corpus-schema validate`. With it, a warning fails the run, like an error. After
3. Built in [#12](https://github.com/osdlc/markdown/pull/12).
`tools/validate-strict.sh` already passes `--strict` to this repo's validator.

Done: `validate --strict` is in `@osdlc/corpus-schema` 0.4.0, on npm since 2026-11-13 (task 36).
