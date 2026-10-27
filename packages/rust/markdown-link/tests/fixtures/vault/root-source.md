---
title: Root source note
---

# Root source note

A note at the vault root. Its folder is `""`, which every path starts with, so
Obsidian's group B is empty here and the source-folder tie-break degenerates to
shortest path.

Bare and ambiguous: [[plugin]]. Two files answer to that basename;
`glossary/plugin.md` is 18 characters and `capabilities/plugin.md` is 22, so
Obsidian picks the glossary one from here.

Rooted and exact: [[/glossary/plugin]].

Rooted at a path no file has: [[/nowhere/plugin]].

Rooted at a vault-root file: [[/note]].

Rooted at a folder that exists, spelled exactly: [[/suffix/target]].

Nothing in the vault answers to this: [[nowhere]].
