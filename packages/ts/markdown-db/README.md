# @osdlc/markdown-db

Facts kept as notes drift. A field gets misspelled, a link points at a file that was renamed, and
nothing notices. This package checks a folder of such notes, a markdown-db corpus, the way a
database checks its rows: each record against its type's JSON Schema, and each link and reference
against the files that exist.

It is for people and tools that keep typed records as Markdown, YAML and JSON files in a folder,
edit them as plain notes (in Obsidian, on GitHub, in an editor) and want CI to catch mistakes. The
format is the [markdown-db spec](https://github.com/osdlc/osdlc/blob/main/packages/conformance/markdown-db/SPEC.md), version 0. Every rule this
package checks comes from that spec or from the corpus's own files.

Do not use it to query notes or build an index of them, to check the structure of one Markdown
document, or as a database for an app with many concurrent writers. The comparison below names
tools for those jobs.

This is not MarkdownDB (`mddb`, from datopian and flowershow), and not the unscoped npm package
`markdown-db`.

## Install

```sh
npm install @osdlc/markdown-db
```

`pnpm add @osdlc/markdown-db` and `yarn add @osdlc/markdown-db` work too. For the command line
alone, `npx @osdlc/markdown-db validate <folder>`.

ESM only. Node.js 22 or later.

## Command line

```sh
markdown-db validate [--fix] <folder>...
```

`validate` checks every corpus at or below each folder. It prints one line per problem, as
`<file>: <field>: <message>` with the file relative to the corpus root, and `ok: <name>: <counts>`
for each corpus that passes. A problem that is not in one field puts a word in parentheses in the
field's place, such as `(data)` for frontmatter that does not parse. `--fix` first rewrites every
wikilink it can resolve as a relative Markdown link.

| Exit code | Meaning                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| `0`       | Every corpus is valid. Warnings may have been printed.                        |
| `1`       | A corpus has an error, a folder holds no corpus, or a folder cannot be read. |
| `2`       | Bad usage: an unknown verb or option, or no folder.                           |

## Library

```ts
import { findCorpora, validateCorpus } from '@osdlc/markdown-db'

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
holds `root`, `name` and `id`, `records` (valid records by type, then id, each record's `Data`),
`files` (the corpus-relative path of each of those records), `errors`, `warnings` and `fixed`.

Writers of records can use the same rules the validator reads with:

| Export                     | Use                                                        |
| -------------------------- | ---------------------------------------------------------- |
| `idProblem(id)`            | Why an id breaks the id rules, or `undefined`.             |
| `fold(s)`                  | The key two ids are compared by: NFC and case folding.     |
| `markdownLink(text, path)` | A relative Markdown link, with the path and label escaped. |
| `encodePath(path)`         | A path as a link destination.                              |

The TSDoc in `dist/index.d.ts` describes each export. `examples/usage.test.ts` uses each one.

## Trust

A corpus's schemas run on its data. JSON Schema `pattern` and the spec's `x-id-pattern` are regular
expressions the corpus supplies, and a badly written one can take a very long time on some input
(ReDoS). Validate a corpus from a source you do not trust only with a time limit, for example in a
CI job with a timeout.

`--fix` and `validateCorpus(root, { fix: true })` rewrite files in place. They change only
wikilinks, and they leave a file alone if the rewrite would change its data, but they do not keep a
backup. Run them on files under version control.

## How it compares

- The [mdbase spec](https://github.com/mdbase-dev/mdbase-spec), with its TypeScript implementations
  [`@callumalpass/mdbase`](https://www.npmjs.com/package/@callumalpass/mdbase) and
  [`mdbase-cli`](https://www.npmjs.com/package/mdbase-cli), is the closest. It also types Markdown
  records and validates them, and the markdown-db spec borrows several of its rules. It declares types in
  type notes under `_types/` and resolves links from each collection's root. markdown-db puts each
  type's JSON Schema in the type's own folder, so a type carries its rules when it moves, and uses
  relative links, which GitHub and site generators follow.
- MarkdownDB ([`mddb`](https://www.npmjs.com/package/mddb)) parses a folder of Markdown into a
  SQL database for queries. It does not check records against schema files in the folder.
- [`@synstack/markdown-db`](https://www.npmjs.com/package/@synstack/markdown-db) uses Markdown files
  with frontmatter as a database from TypeScript code. It has no written spec for the folder.
- [`@osdlc/markdown-contract`](https://github.com/osdlc/osdlc/tree/main/packages/ts/markdown-contract#readme)
  checks the sections and blocks of one Markdown document. This package checks a whole corpus:
  data against JSON Schema, and links, ids and references across files.

This package exists because the rules should live in the folder and in a written spec, not only in
code, so that a validator in any language checks a corpus the same way. Its conformance cases sit
beside the spec for that reason.

## Tests

`pnpm run build`, then `pnpm run test`. The CLI tests run the built program.
`tests/conformance.test.ts` runs the spec's conformance cases from
[`packages/conformance/markdown-db/`](https://github.com/osdlc/osdlc/tree/main/packages/conformance/markdown-db#readme). A case compares
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

- none

## Runtimes and platforms

Node.js 22 or later, ESM only. The tests run on Linux and macOS. Windows is not tested.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
