---
title: Inherited records come in as a committed copy
status: decided
decided: "2026-11-09"
---

Inherited records come in as a committed copy. `corpus-schema sync` copies each parent into
`_inherited/<prefix>/`. The validator checks the copy against the installed parent and says to run
`corpus-schema sync` when they differ.
