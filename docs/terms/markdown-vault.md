# markdown-vault

Status: current.

The crate that models a [vault](vault.md): every file, every note, each note's outgoing and incoming links, link resolution, inline tags, each note's document tree, and incremental refresh ([D-ODPP](../decisions/D-ODPP-markdown-vault.md)).

## In code

`packages/rust/markdown-vault`: `Vault::load`, `LinkGraph`, `FrontmatterIndex`, `Edge`, `EdgeKind`, `TagLexer`, `read_note`, `document`. Extracted from determined's `determined-notes`.

## Not to be confused with

[markdown-vault-fs](markdown-vault-fs.md), which only walks a vault's files.
