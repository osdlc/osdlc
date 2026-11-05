# Corpus

Status: current.

A folder of markdown notes and the files they link to, read as one linked whole. An Obsidian vault is one example; so is a docs folder or a skills source.

## In code

[markdown-corpus](markdown-corpus.md) models one: `Corpus::load`, `LinkGraph`, `FrontmatterIndex`.

## Also called

[Vault](vault.md). Some crate names use it, such as `markdown-vault-fs`.

## Not to be confused with

A bundle: one note's folder inside a corpus (`<name>/<name>.md` and the files beside it), which `markdown-relink` moves as one unit.
