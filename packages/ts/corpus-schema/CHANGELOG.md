# @osdlc/corpus-schema

## 0.2.1

### Patch Changes

- Updated dependencies [e7a4300]
  - @osdlc/markdown-link@0.9.0

## 0.2.0

### Minor Changes

- ab1aa21: Record folders. A folder inside a type folder that holds a record named after it, such as `methods/Survey/Survey.md`, is one record with the folder's name as its id. Every other file under the folder belongs to the record: it is not a record and is not checked. Links from the record to those files resolve, as do links into another record's folder. A record folder inside another one is an error, reported as `<folder>: (folder)`. A folder with no record named after it stays a plain folder, as before. The spec states this as part of level 1.

## 0.1.0

### Minor Changes

- 45562f5: First release, moved from osdlc/skillwright, where it was called markdown-db. A validator for version 0 of the corpus-schema spec (`packages/conformance/corpus-schema/SPEC.md`): what a corpus, a folder of notes, declares about itself in a `corpus-schema.md` root file. Typed records are kept as Markdown, YAML and JSON files, with a JSON Schema per type, and are checked against the schemas, ids, links and `x-ref` references the folder holds.
  
  - `findCorpora(dir)` finds every corpus at or below a folder by its root file. It throws a one-line error when a folder outside every corpus cannot be read. `validateCorpus(root, { fix })` returns a `CorpusReport`: valid `records` and their `files` by type, then id, and `errors`, `warnings` and `fixed`. With `fix`, it first rewrites each wikilink it can resolve as a relative Markdown link. A file or folder it cannot read is an error in the report, not a throw.
  - The spec has levels: 1 for a root file and types with optional schemas, 2 for a schema on every type. A root file may state `level: 1` or `level: 2`, and the report gives it as `level`. At level 2 an untyped type is an error. The root keys `dialect` and `profiles` are reserved: they warn that they are not checked yet, not that they are unknown.
  - For tools that write records: `idProblem(id)`, `fold(s)`, `markdownLink(text, path)` and `encodePath(path)`, the rules the validator reads with.
  - The `corpus-schema validate [--fix] <folder>...` command prints one `<file>: <field>: <message>` line per problem and exits 1 on any error. A problem that is not in one field names a word in parentheses as its field, such as `(data)` for frontmatter that does not parse, with the line and column. A symlink in a type folder is not followed and warns.
