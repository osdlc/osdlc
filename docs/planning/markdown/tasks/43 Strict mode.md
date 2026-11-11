---
number: 43
title: Strict mode
detail: warnings fail
status: todo
type: supporting
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[3 Publish 0.2.0](3%20Publish%200.2.0.md)"
---

Add `--strict` to `corpus-schema validate`. With it, a warning fails the run, like an error. Then
`tools/validate-strict.sh`, which greps stderr for warning lines, can go. After 3.
