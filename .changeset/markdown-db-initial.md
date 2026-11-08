---
'@osdlc/markdown-db': minor
---

First release, moved from osdlc/skillwright. A validator for markdown-db corpora, version 0 of S-markdown-db: typed records kept as Markdown, YAML and JSON files in a folder, with a JSON Schema per type, checked against the schemas, ids, links and `x-ref` references the folder holds.

- `findCorpora(dir)` finds every corpus at or below a folder by its root file. `validateCorpus(root, { fix })` returns a `CorpusReport`: valid `records` and their `files` by type, then id, and `errors`, `warnings` and `fixed`. With `fix`, it first rewrites each wikilink it can resolve as a relative Markdown link.
- For tools that write records: `idProblem(id)`, `fold(s)`, `markdownLink(text, path)` and `encodePath(path)`, the rules the validator reads with.
- The `markdown-db validate [--fix] <folder>...` command prints one `<file>: <field>: <message>` line per problem and exits 1 on any error.
