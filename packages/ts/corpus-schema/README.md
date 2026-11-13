# @osdlc/corpus-schema

Facts kept as notes drift. A field gets misspelled, a link points at a file that was renamed, and
nothing notices. This package checks a folder of such notes the way a database checks its rows:
each record against its type's JSON Schema, and each link and reference against the files that
exist.

It is for people and tools that keep typed records as Markdown, YAML and JSON files in a folder,
edit them as plain notes (in Obsidian, on GitHub, in an editor) and want CI to catch mistakes. The
format is the [corpus-schema spec](https://github.com/osdlc/osdlc/blob/main/packages/conformance/corpus-schema/SPEC.md),
version 0. A corpus, a folder of notes and the files they link to, declares what it holds in a
root file, `<name>.corpus-schema.md` (or `.yaml`, `.json`), whose `<name>` is the corpus's name.
Each type folder sits at the corpus root and holds the type's JSON Schema. Every rule this
package checks comes from that spec or from the corpus's own files.

The spec has levels. Level 0 is any folder of linked notes, and this package does not check it.
Level 1 adds the root file, type folders and records, with schemas optional. Level 2 gives every
type a schema. The root file can say `level: 2`, and then a type with no schema is an error.

Do not use it to query notes or build an index of them, to check the structure of one Markdown
document, or as a database for an app with many concurrent writers. The comparison below names
tools for those jobs.

## Install

```sh
npm install @osdlc/corpus-schema
```

`pnpm add @osdlc/corpus-schema` and `yarn add @osdlc/corpus-schema` work too. For the command line
alone, `npx @osdlc/corpus-schema validate <folder>`.

ESM only. Node.js 22 or later.

## A corpus

```text
evidence/
├── evidence.corpus-schema.md       the root file: `corpus-schema: 0`
├── harnesses/
│   ├── harnesses.schema.md         the type "harnesses" and its JSON Schema
│   ├── Claude Code.md              a record, id "Claude Code"
│   └── google/
│       └── Gemini CLI.md           records may sit at any depth in a type folder
└── methods/
    ├── methods.schema.yaml
    └── Survey/                     a record folder
        ├── Survey.md               the record, id "Survey"
        ├── count.py                these belong to the record
        ├── query.sql
        └── results/counts.csv
```

A record folder is a folder in a type folder that holds a record named after it, such as
`methods/Survey/Survey.md`. It lets a record keep its own files beside it: here, the script, the
query and the CSV results of the method the record describes. Its other files are not records and
are not checked. The record links to them with relative links, such as
`[the counts](results/counts.csv)`, and those links are checked. A record folder inside another
one is an error. A folder with no record named after it, such as `harnesses/google/`, is a plain
folder of records.

A type's schema can say more about its records:

- `x-id-pattern` narrows the ids. The id is then the longest part of the name, ending before a
  `-`, that the pattern matches, so with `^P-[0-9]{4}$` the file `P-0002-be-kind.md` has the id
  `P-0002`. A record's data may hold `id`, and then it must be the record's id.
- `x-record-file: README.md` makes a folder holding `README.md` a record folder too, named by its
  folder: `decisions/D-0001-split/README.md` has the id `D-0001`. The type folder's own
  `README.md` documents the type.
- A folder whose name starts with `_`, such as `_attachments/`, holds narrative, not records.

## References

`x-ref` in a schema makes a field a typed reference to records. It names a type, or lists several,
and a record of any of them, or of a type that extends one, matches:

```yaml
properties:
  successor: { type: string, x-ref: harnesses }
  depends_on: { type: array, items: { type: string, x-ref: [tasks, decisions] } }
  about: { type: string, x-ref: notes, x-ref-form: wikilink }
```

`x-ref-form` says how the value names its record:

| `x-ref-form`     | Value                             | Resolved                                    |
| ---------------- | --------------------------------- | ------------------------------------------- |
| `link` (default) | `"[Antigravity](Antigravity.md)"` | as a relative link, to a record of the type |
| `id`             | `T-0012`                          | by id, among the records of the type        |
| `wikilink`       | `"[[N-0001]]"`                    | by id, as `id` does; quote it in YAML       |

An id matches ignoring case and Unicode composition. A value may also give the whole file name
without its extension. A `null` value refers to nothing; the schema says whether it is allowed. An
`id` value reaches records of referenced corpora at any depth. A `wikilink` value reaches only this
corpus and the corpora it references directly. A field that refers by id is not checked as a link,
gets no wikilink warning, and `validate --fix` leaves it as it is.

A wikilink in a body or in any other field must hold a path from its file, as a Markdown link
does: `[[../harnesses/Claude Code]]`. A bare name, such as `[[Claude Code]]` from another folder or
`[[P-0002]]`, is a warning. The validator looks it up by path suffix, then by record id, and
`--fix` rewrites it as a relative Markdown link.

## Other corpora: extends, references and uses

A corpus can name other corpora in its root file, each under a prefix. Each one is a folder that
holds a corpus: an npm package, found as Node finds it from this folder, or a relative path.

- `extends` brings in types. A parent's types are named `<prefix>/<type>`, and a local type builds
  on one. Its records are not brought in. `extends` needs `level: 2`.
- `references` brings in records to link to. `sync` copies each referenced corpus into
  `_references/<prefix>/`, and links and `x-ref` fields may point at its records. Its types can be
  named as `x-ref` targets, read-only. `references` works at any level.
- `uses` lists parent types that local folders hold as they are, with no schema file.

```yaml
corpus-schema: 0
level: 2
extends:
  sdlc: '@osdlc/corpus-profile-sdlc' # types, by package name
references:
  org: ../org-principles # records, by a path from this folder
uses: [sdlc/tasks, sdlc/decisions] # or sdlc/*
```

A prefix sits in one key. One corpus may sit under two prefixes, one in each key, to give both its
types and its records.

A package's corpus is the package folder, or the folder its `package.json` names in a `"corpus"`
field. A corpus package lists the corpora it extends or references as `peerDependencies`, with a
range, so the project installs one copy of each. pnpm and npm 7 or later install peers:

```json
{
  "peerDependencies": { "@osdlc/corpus-profile-claims": "^0.3.0" },
  "devDependencies": { "@osdlc/corpus-profile-claims": "^0.3.0" }
}
```

A project's own corpus lists them as `dependencies` or `devDependencies`. A git dependency, such as
`"acme-principles": "github:acme/principles#v3"`, suits a private corpus with no registry.

### Types: x-extends and uses

A local type builds on a parent's type with `x-extends` at the root of its schema. The fields add up
first: a type's `additionalProperties: false` or `unevaluatedProperties: false` admits its own
fields and those of every type it extends, as their root-level `properties` and
`patternProperties` declare them. A record then passes every schema up the chain, so a child can
add fields and tighten rules but not loosen them. A field the child declares again must still pass
the parent's rules for it, and a parent with `additionalProperties: false` admits no new ones:

```yaml
# rules/rules.schema.yaml
x-extends: sdlc/principles
additionalProperties: false # admits the parent's fields and team
properties:
  team: { type: string }
```

A folder at the corpus root named after a type in `uses`, with no schema file, holds records of
that type as it is: `tasks/T-0001.md` is an `sdlc/tasks` record. A deeper folder, such as
`notes/tasks/`, gets no type from `uses`. Such a folder must hold no schema file; to add fields,
take the type out of `uses` and write `x-extends`. A folder with no schema file that is not in
`uses` is plain narrative. At the root, it warns when it holds notes and its name is one or two
letters from a parent's type, such as `task/` for `sdlc/tasks`.

`x-ref: sdlc/tasks` matches records of local types that extend or use `sdlc/tasks`, and records of
that type in referenced corpora. A type a referenced corpus reaches through its own references is
named by the path: `team/org/principles`.

### Records: references and the copy

To link to another corpus's records, name it in `references` and keep its copy in the corpus:

```sh
corpus-schema sync
```

`sync` writes `_references/<prefix>/`, a byte-for-byte copy of each referenced corpus with its own
`_references/`, and removes stale files. Commit the copy. Links such as
`[Be Kind](../_references/org/principles/Be%20Kind.md)` then work in Obsidian and on GitHub, and
`validate` resolves them in the installed corpus. `validate` never writes the copy. When the copy
is missing or differs, it says to run `corpus-schema sync`. A corpus needs the copy only when one
of its files links into it, or a `wikilink` reference names one of its records. A reference by id
needs no copy.

### Identity

A corpus in a package has an identity: its package URL ([purl](https://github.com/package-url/purl-spec)),
such as `pkg:npm/%40osdlc/corpus-profile-claims`. A type adds `#<type>` and a record
`#<type>/<id>`. Types with one identity are one type, so two installed copies of one package at
one version give one type for `x-ref`. A record reached through two chains of references is one
record. A corpus graph holds each corpus at one version, and two versions are an error. A schema
may state its type's identity in `x-identity`, and then it must match.

## Command line

```sh
corpus-schema validate [--fix] [--strict] <folder>...
corpus-schema sync [<folder>...]
```

`validate` checks every corpus at or below each folder. It prints one line per problem, as
`<file>: <field>: <message>` with the file relative to the corpus root, and `ok: <name>: <counts>`
for each corpus that passes. A problem that is not in one field puts a word in parentheses in the
field's place, such as `(data)` for frontmatter that does not parse. Warnings start with
`warning: `. `--fix` first rewrites every bare-name wikilink it can resolve as a relative Markdown
link, except in a field that refers by id. A wikilink that holds a path stays. `--strict` fails a corpus that has warnings, as if they were
errors, so CI can hold a corpus to no warnings.

`sync` writes the `_references/` copies of every corpus at or below each folder, by default `.`. A
corpus syncs after the corpora it extends or references, so a chain of corpora in one repository
syncs in one run. It prints `wrote:` and `removed:` for each file it changes, and `synced: <name>: <counts>`.
Run it again and it changes nothing.

`sync` owns `_references/` outright. It removes every file there that no referenced corpus holds,
so in a corpus with no `references` it empties the folder. It does not write through a symbolic
link there; it reports one instead. With any error in the root file, or a corpus it names that does
not resolve or has errors of its own, a cycle included, it writes nothing in that corpus.

| Exit code | Meaning                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| `0`       | Every corpus is valid, or synced. Without `--strict`, warnings may have been printed.                            |
| `1`       | A corpus has an error, or a warning under `--strict`. Or a folder holds no corpus, or cannot be read or written. |
| `2`       | Bad usage: an unknown verb or option, or `validate` with no folder.                                              |

## Library

```ts
import { findCorpora, validateCorpus } from '@osdlc/corpus-schema'

/** Every problem in every corpus at or below `folder`, each line led by its corpus's name. */
export function check(folder: string): string[] {
  const problems: string[] = []
  for (const root of findCorpora(folder)) {
    const report = validateCorpus(root)
    problems.push(...report.errors.map((e) => `${report.name}: ${e}`))
  }
  return problems
}
```

`findCorpora(dir)` finds every corpus at or below a folder by its root file. It throws when a
folder outside every corpus cannot be read. `validateCorpus(root, { fix })` checks one corpus and
returns a `CorpusReport`. Every problem it finds is a line in the report, never a throw. A report
holds `root`, `name` (the `<name>` of the root file), `identity` and `version` (the package's, when the corpus is one), `id` and
`level` (the level the root file states), `records` (valid records by type, then id, each record's
`Data`), `files` (the corpus-relative path of each of those records), `errors`, `warnings` and
`fixed`.

`syncCorpus(root)` writes one corpus's `_references/` copies and returns a `SyncReport`: `root`,
`name`, `written` and `removed` (corpus-relative paths) and `errors`. It writes nothing when the
root file has an error, or a corpus it names does not resolve or has errors of its own.

Writers of records can use the same rules the validator reads with:

| Export                     | Use                                                        |
| -------------------------- | ---------------------------------------------------------- |
| `idProblem(id)`            | Why an id breaks the id rules, or `undefined`.             |
| `fold(s)`                  | The key two ids are compared by: NFC and case folding.     |
| `markdownLink(text, path)` | A relative Markdown link, with the path and label escaped. |
| `encodePath(path)`         | A path as a link destination.                              |

`npmPackageUrl(name, version?, subpath?)` builds the package URL of an npm package, and of a type
or record in it: `npmPackageUrl('@acme/org', '1.0.0', ['principles', 'Be Kind'])` is
`pkg:npm/%40acme/org@1.0.0#principles/Be%20Kind`. `packageUrl(parts)` builds one from a
`PackageUrl`, for any purl type.

The TSDoc in `dist/index.d.ts` describes each export. `examples/usage.test.ts` uses each one.

## Trust

A corpus's schemas run on its data. JSON Schema `pattern` and the spec's `x-id-pattern` are regular
expressions the corpus supplies, and a badly written one can take a very long time on some input
(ReDoS). Validate a corpus from a source you do not trust only with a time limit, for example in a
CI job with a timeout.

A parent's schemas run on the corpus's records too. Treat a corpus package you extend or reference
as you treat the corpus.

`--fix` and `validateCorpus(root, { fix: true })` rewrite files in place. They change only
bare-name wikilinks, and they leave a file alone if the rewrite would change its data, but they do not keep a
backup. Run them on files under version control.

## How it compares

- The [mdbase spec](https://github.com/mdbase-dev/mdbase-spec), with its TypeScript implementations
  [`@callumalpass/mdbase`](https://www.npmjs.com/package/@callumalpass/mdbase) and
  [`mdbase-cli`](https://www.npmjs.com/package/mdbase-cli), is the closest. It also types Markdown
  records and validates them, and the corpus-schema spec borrows several of its rules. It declares types in
  type notes under `_types/` and resolves links from each collection's root. corpus-schema puts each
  type's JSON Schema in the type's own folder, so a type carries its rules when it moves, and uses
  relative links, which GitHub and site generators follow.
- MarkdownDB ([`mddb`](https://www.npmjs.com/package/mddb)) parses a folder of Markdown into a
  SQL database for queries. It does not check records against schema files in the folder.
- [`@synstack/markdown-db`](https://www.npmjs.com/package/@synstack/markdown-db) uses Markdown files
  with frontmatter as a database from TypeScript code. It has no written spec for the folder.
- [`markdown-corpus`](https://github.com/osdlc/osdlc/tree/main/packages/rust/markdown-corpus#readme),
  a Rust crate in this repository, models any corpus: its files, links and frontmatter. It does not
  apply the corpus-schema rules.
- [`@osdlc/markdown-contract`](https://github.com/osdlc/osdlc/tree/main/packages/ts/markdown-contract#readme)
  checks the sections and blocks of one Markdown document. This package checks a whole corpus:
  data against JSON Schema, and links, ids and references across files.

This package exists because the rules should live in the folder and in a written spec, not only in
code, so that a validator in any language checks a corpus the same way. Its conformance cases sit
beside the spec for that reason.

## Tests

`pnpm run build`, then `pnpm run test`. The CLI tests run the built program.
`tests/conformance.test.ts` runs the spec's conformance cases from
[`packages/conformance/corpus-schema/`](https://github.com/osdlc/osdlc/tree/main/packages/conformance/corpus-schema#readme). A case compares
only the `<file>: <field>` prefix of each problem, as a set. Message text and order are not part of
it.

## Known gap

`@osdlc/markdown-link` finds only some Markdown links: only `.md` and media targets, with no titles
and no parentheses in the path. The spec checks every relative link, so `src/links.ts` finds
Markdown links with its own pattern. [osdlc/osdlc#635](https://github.com/osdlc/osdlc/issues/635)
tracks the fix; the local pattern goes once it lands.

## Stability

This is a 0.x package that follows version 0 of its spec. A minor release may change any export,
and the CHANGELOG marks the change as breaking. A patch release does not. The spec fixes the
`<file>: <field>` prefix of each problem line, not its message text, so a message may change in any
release.

The experimental exports, which may change in any release:

- `npmPackageUrl`, `packageUrl` and `PackageUrl`, while the spec's Identity section is new

## Runtimes and platforms

Node.js 22 or later, ESM only. The tests run on Linux and macOS. Windows is not tested.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
