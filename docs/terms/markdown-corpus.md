# markdown-corpus

Status: current.

The crate that models a corpus, a folder of markdown notes and the files they link to (see [corpus](corpus.md)): every file, every note, each note's outgoing and incoming links, link resolution, inline tags and incremental refresh ([D-ODPP](../decisions/D-ODPP-markdown-corpus.md)).

## In code

`packages/rust/markdown-corpus`: `Corpus::load`, `LinkGraph`, `FrontmatterIndex`, `Edge`, `EdgeKind`, `TagLexer`, `read_note`. Extracted from determined's `determined-notes`. First named `markdown-vault`.

## Not to be confused with

[markdown-vault-fs](markdown-vault-fs.md), which only walks a corpus's files.
