---
number: 69
title: Add command
detail: optional
status: todo
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[29 Sync](29%20Sync.md)"
---

Optional: `corpus-schema add <package> --as <prefix>`. It adds the package as a dependency, adds
the `extends` entry to the root file and runs sync. It saves three steps a person can do by hand,
so no other task waits on it and it is off the beeline's critical path. After 29.
