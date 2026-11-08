# markdown-db corpus

Status: current.

A [corpus](corpus.md) that holds a markdown-db root file: `markdown-db.md`, `markdown-db.yaml` or `markdown-db.json`. It holds everything under its folder (types of records, their schemas, and free-form narrative) except dot-named paths, `node_modules` and any folder with its own root file, which is a separate corpus. Its name is its folder name. [S-markdown-db](../planning/standards/S-markdown-db.md) defines it.

In S-markdown-db and `@osdlc/markdown-db`, "corpus" alone means a markdown-db corpus. Everywhere else in this repository it keeps the general meaning.

## In code

`packages/ts/markdown-db`: `findCorpora` finds them by their root file, and `validateCorpus` checks one against the standard. Moved from osdlc/skillwright, where it was first defined.

## How it relates to corpus

Every markdown-db corpus is a corpus: its notes and the files they link to are read as one linked whole. Not every corpus is a markdown-db corpus: it needs a root file, and its types, records, ids and links follow the standard's rules. [markdown-corpus](markdown-corpus.md) reads one as it reads any corpus and does not apply those rules.
