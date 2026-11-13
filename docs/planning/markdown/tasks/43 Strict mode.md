---
number: 43
title: Strict mode
detail: warnings fail
status: doing
type: supporting
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[3 Publish 0.2.0](3%20Publish%200.2.0.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
---

Add `--strict` to `corpus-schema validate`. With it, a warning fails the run, like an error. After
3. Built in [#12](https://github.com/osdlc/markdown/pull/12), not yet released.
`tools/validate-strict.sh` already passes `--strict` to this repo's validator.
