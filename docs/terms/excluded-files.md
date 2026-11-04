# Excluded files

Status: current.

Paths a [corpus](corpus.md) marks to be left out of every tool's view, such as Obsidian's `userIgnoreFilters` in `.obsidian/app.json`. Every corpus walk honours them by default ([D-DUFX](../decisions/D-DUFX-vfs-walk-and-vault-layer.md)).

## In code

`markdown-vault-fs`'s `hide` module reads and compiles the list; [vfs-walk](vfs-walk.md) applies it as a filter.
