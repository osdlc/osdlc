# @osdlc/markdown-db

A validator for markdown-db corpora. A corpus is a folder of typed records kept as Markdown, YAML
and JSON files, with a schema for each type, that people edit as plain notes. This package
implements [S-markdown-db: markdown-db, version 0](../../../docs/planning/standards/S-markdown-db.md).
Every rule it checks comes from that standard or from the corpus's own files.

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
for each corpus that passes. `--fix` first rewrites every wikilink it can resolve as a relative
Markdown link.

| Exit code | Meaning                                                |
| --------- | ------------------------------------------------------ |
| `0`       | Every corpus is valid. Warnings may have been printed. |
| `1`       | A corpus has an error, or a folder holds no corpus.    |
| `2`       | Bad usage: an unknown verb or option, or no folder.    |

## Library

```ts
import { findCorpora, validateCorpus } from '@osdlc/markdown-db'

for (const root of findCorpora('Data')) {
  const report = validateCorpus(root) // a CorpusReport
  for (const e of report.errors) console.error(e)
}
```

A `CorpusReport` holds `records` (valid records by type, then id), `files` (the corpus-relative path
of each of those records, by type, then id), `errors`, `warnings` and `fixed`.

Writers of records can use the same rules the validator reads with:

| Export                     | Use                                                        |
| -------------------------- | ---------------------------------------------------------- |
| `idProblem(id)`            | Why an id breaks the id rules, or `undefined`.             |
| `fold(s)`                  | The key two ids are compared by: NFC and case folding.     |
| `markdownLink(text, path)` | A relative Markdown link, with the path and label escaped. |
| `encodePath(path)`         | A path as a link destination.                              |

`src/index.ts` lists the exports. `examples/usage.test.ts` uses each one.

## How it compares

[`@osdlc/markdown-contract`](../markdown-contract/README.md) checks the section and block structure
of one Markdown document. This package checks a corpus: frontmatter and data files against JSON
Schema, and links, ids and references across files.
[mdbase](https://github.com/mdbase-dev/mdbase-spec) is the closest prior art. The standard lists
the rules it borrows and where it differs.

## Tests

`pnpm run build`, then `pnpm run test`. The CLI tests run the built program. `tests/cases/` holds
corpora with their expected reports, written so that a validator in another language can run the
same cases. A case compares only the `<file>: <field>` prefix of each problem, as a set; message
text and order are not part of it. The cases move to `packages/conformance/markdown-db/` once a
second implementation exists, as
[S-conformance-suites](../../../docs/planning/standards/S-conformance-suites.md) describes.

## Known gap

`@osdlc/markdown-link` finds only some Markdown links: only `.md` and media targets, with no titles
and no parentheses in the path. S-markdown-db checks every relative link, so `src/links.ts` finds
Markdown links with its own pattern. [osdlc/osdlc#635](https://github.com/osdlc/osdlc/issues/635)
tracks the fix; the local pattern goes once it lands.

## Stability

This is a 0.x package that follows version 0 of its standard. A breaking change comes only in a new
minor version, and the CHANGELOG marks it. The standard fixes the `<file>: <field>` prefix of each
problem line, not its message text, so a message may change in any release.

## Runtimes and platforms

Node.js 22 or later, ESM only. The tests run on Linux and macOS. Windows is not tested.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
