# markdown-corpus

Status: current.

The crate that models a corpus, a folder of markdown notes and the files they link to (see [corpus](corpus.md)): every file, every note, each note's outgoing and incoming links, link resolution, inline tags and incremental refresh ([D-ODPP](../decisions/D-ODPP-markdown-corpus.md)).

## In code

`packages/rust/markdown-corpus`: `Corpus::load` and `Corpus::try_load`, `LoadOptions`, `LinkGraph`, `FrontmatterIndex`, `Edge`, `EdgeKind`, `TagLexer`, `read_note` and `read_note_with` (`SplitMode`). Extracted from determined's `determined-notes`. First named `markdown-vault`.

Each cache walks with a `markdown-vault-fs` `WalkOptions` the caller can replace (`LoadOptions::link_walk` and `frontmatter_walk`, or `with_walk`): roots, dot files, pruned folders, symlink refusal, read errors and the caller's own [excluded files](excluded-files.md). The link graph's default walk keeps excluded files, so links into them resolve; the frontmatter index's default leaves them out. `LinkGraph::with_snapshot` lends paths and notes from one lock hold.

## Not to be confused with

[markdown-vault-fs](markdown-vault-fs.md), which only walks a corpus's files.
