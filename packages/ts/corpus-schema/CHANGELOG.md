# @osdlc/corpus-schema

## 0.5.0

### Minor Changes

- cc900b3: `loadCorpus(root)` returns one corpus as plain data, so a site build, a query tool or a server can
  work from it without parsing anything again. The model holds the corpus (name, level, identity,
  version, and the errors and warnings `validateCorpus` reports), each type (its own schema, its
  flattened schema, its chain, where it comes from, and its fields with their `x-ref`), and each
  record (id, type, path, format, data, Markdown body, record folder and its files). Every value of
  an `x-ref` field and every body link to a record is resolved to its target, or carries the reason
  it names none, and each record lists what points at it. Records of referenced corpora are in the
  model too, by prefix, each corpus once. The model has a fixed order and survives
  `JSON.stringify`. A corpus with errors still loads, with `valid: false` on the records that have
  them. `getCorpus`, `getType`, `recordsOf`, `getRecord` and `resolveTarget` look things up in a
  model. `loadCorpus` writes nothing and does not need the `_references/` copies. These exports are
  experimental. `validateCorpus` reports what it did before.

## 0.4.0

### Minor Changes

- 3d0f6d7: The root file is now `<name>.corpus-schema.md`, `.yaml` or `.json`, one per folder, and `<name>` is
  the corpus's name: lowercase letters, digits and `-`. The folder's name no longer matters, so the
  name survives a folder rename, a copy under `_references/<prefix>/` and a package subfolder. A bare
  `corpus-schema.md` is no longer a root file: rename it to `<name>.corpus-schema.md`. A report's
  `name` is the root file's `<name>`.
  
  Type folders sit at the corpus root only. A folder below the root that holds a schema file named
  after it is an error, and its files are not its records.
  
  A wikilink must hold a path relative to the file that holds it, as a Markdown link does, such as
  `[[../harnesses/Claude Code]]`. The extension of a record may be left out, and the case must match.
  Such a wikilink gets no warning, and `validate --fix` leaves it as it is. A bare name, such as
  `[[oats]]` or `[[P-0002]]`, is a warning, so `validate --strict` fails on it. It is looked up by
  path suffix, or by record id, and `validate --fix` rewrites it as a relative Markdown link. A
  wikilink path into a copy's own `_references/` is an error: a wikilink reaches only the corpus and
  the corpora it references directly. Fields with `x-ref-form: id` or `wikilink` keep bare ids.
  
  A corpus can name other corpora in its root file, under three new keys, each for one purpose.
  
  - `extends` maps a prefix to a parent whose types the corpus builds on: an npm package name, found
    as Node finds it from the corpus folder (with an optional `"corpus"` field in its package.json),
    or a `./` or `../` path. A parent's types are named `<prefix>/<type>`. Its records are not
    brought in, so a local record may share a parent record's id, and a link into a parent is an
    error. `extends` needs level 2.
  - `references` maps a prefix to a corpus whose records the corpus links to, in the same source
    forms. Links, `x-ref` links and references by id or wikilink may point at its records. Its types
    can be `x-ref` targets, but not built on. `references` works at level 1 and level 2. A type
    through further references is named by the path, such as `team/org/principles`.
  - `uses` lists parent types (`[sdlc/tasks, sdlc/decisions]`, or `sdlc/*`) that local folders hold
    as they are: a folder at the corpus root named after the type, with no schema file, holds its
    records. A deeper folder gets no type from `uses`. A schema file in such a folder, or two used
    types with one name, is an error. A root folder with no schema file that is not in `uses` and is
    named like a parent type warns.
  
  A prefix sits in one key. Named corpora load transitively, and a cycle is an error. Each named
  corpus is validated by its own rules, and one with errors is an error of the corpus that names it.
  
  The new `corpus-schema sync [<folder>...]` command, and `syncCorpus`, write a copy of each
  referenced corpus into `_references/<prefix>/`, with its own `_references/` nested inside, and
  remove stale files. `extends` gets no copy. Links into `_references/` resolve in the installed
  corpus. `validate` checks that the copy matches and says to run `sync` when it does not, and never
  writes the copy. A corpus needs a copy only when one of its files links into it, or a `wikilink`
  reference names one of its records. `sync` writes nothing when a named corpus does not resolve or
  has errors, a cycle included, and it replaces a path that turned from a folder into a file or
  back. `_references/` holds no local types or records, and `findCorpora` does not search it.
  
  Corpora, types and records in packages have an identity: a package URL (purl), such as
  `pkg:npm/%40osdlc/corpus-profile-claims#statements`. Types with one identity are one type, so two
  installed copies of one package at one version give one type for `x-ref`. A record reached through
  two chains of references is one record, taken through the shortest chain. Each corpus appears at
  one version across the whole graph, and two versions are an error. A schema's new `x-identity`
  key, when present, must be its type's unversioned identity. `CorpusReport` gains `identity` and
  `version`. The new experimental exports `npmPackageUrl`, `packageUrl` and `PackageUrl` build
  package URLs.
  
  A schema's new `x-extends` key builds a type on a parent's type (`org/principles`) or a local type.
  The chain's fields are merged before a closing keyword applies: a type's
  `additionalProperties: false` or `unevaluatedProperties: false` admits the root-level `properties`
  and `patternProperties` of every type up its chain, so a closed child does not have to list its
  parent's fields. A record still passes every schema up the chain, so a field the child declares
  again keeps the parent's rules. A parent with `additionalProperties: false` admits no new fields,
  and a child that declares one gets an error at that field. `x-ref` accepts records of types that
  extend or use the named type.
  
  `x-ref` can list several types, as in `x-ref: [tasks, decisions, milestones]`. A record of any of
  them, or of a type that extends one, matches. The single name still works.
  
  The new `x-ref-form` keyword, beside `x-ref`, says how a value names its record: `link` (the
  default, a relative link), `id` (a bare id such as `T-0012`) or `wikilink` (`"[[N-0001]]"`). An id
  resolves among the matching records of the corpus and of every corpus it references, at any depth,
  matching ignoring case and Unicode composition. A `wikilink` value, like any wikilink, reaches
  only the corpus and the corpora it references directly. No match, or more than one, is an error.
  An `id` or `wikilink` field is not checked as a link, gets no wikilink warning, and
  `validate --fix` leaves it as it is.
  
  With `x-id-pattern`, a record's id is the longest part of its name, ending before a `-`, that the
  pattern matches: `P-0002-be-kind.md` has the id `P-0002`. A name the pattern matches whole keeps it
  as its id. A record's data may hold `id`, which must then be the record's id. A reference by id may
  also give the whole file name. The new `x-record-file` schema keyword, such as `README.md`, makes a
  folder holding that file a record folder, named by its folder. A folder in a type folder whose name
  starts with `_` holds narrative. A `null`
  `x-ref` value refers to nothing. Links in a schema are checked only in `title`, `description` and
  `$comment`, so a `pattern` or `enum` value holding `[[` is not read as a wikilink.
  
  The new `validate --strict` flag fails a corpus that has warnings, as if they were errors.
  
  `x-ref` messages name the type as "a record of type org/principles", in place of "a org/principles
  record". A field whose `x-ref` names no type is an error in the schema only: its values are not
  checked as well.

## 0.3.0

Not published. Its changes were released as 0.4.0.

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
