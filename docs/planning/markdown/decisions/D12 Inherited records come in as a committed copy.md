---
title: Inherited records come in as a committed copy
status: decided
decided: "2026-11-09"
---

Inherited records come in as a committed copy. `corpus-schema sync` copies each parent into
`_inherited/<prefix>/`. The validator checks the copy against the installed parent and says to run
`corpus-schema sync` when they differ.

[D15](D15%20Extending%20types%20and%20referencing%20corpora%20are%20separate.md) supersedes part of
this. Records come in through `references`, not `extends`, and the copy is `_references/<prefix>/`,
not `_inherited/<prefix>/`.
