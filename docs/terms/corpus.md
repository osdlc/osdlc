# Corpus

Status: current.

A folder of markdown notes and the files they link to, read as one linked whole. An Obsidian vault is one example; so is a docs folder or a skills source.

## In code

[markdown-corpus](markdown-corpus.md) models one: `Corpus::load`, `LinkGraph`, `FrontmatterIndex`.

## Also called

[Vault](vault.md). Some crate names use it, such as `markdown-vault-fs`.

## Not to be confused with

A bundle: one note's folder inside a corpus (`<name>/<name>.md` and the files beside it), which `markdown-relink` moves as one unit.

[corpus-schema](corpus-schema.md): what a corpus can declare about itself, such as typed records and their schemas, by the [corpus-schema spec](../../packages/conformance/corpus-schema/SPEC.md). In that spec and in `@osdlc/corpus-schema`, "corpus" alone means a corpus with a corpus-schema root file.
