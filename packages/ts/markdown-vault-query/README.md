# @osdlc/markdown-vault-query

Run Obsidian Bases queries over a folder of markdown notes, from code or the
command line, with no Obsidian app.

## Why

A `.base` file is a saved query: filters, formulas, and views with columns,
sort, groups and summaries. Obsidian reads it inside the app. Code that wants
the same answer from the same file, in a script, a build step or a server, has
to reimplement the expression language and the view pipeline. This package
holds both, in memory, over the vault index of
[`@osdlc/markdown-vault`](https://github.com/osdlc/osdlc/tree/main/packages/ts/markdown-vault#readme).

It is for tools that already treat a folder of notes as data: a planning
dashboard that shows a task table, a static site that renders a base, a
linter that checks what a base returns. The vault index can come from a
folder (`scanVault`) or from note data you hold (`createVaultIndex`).

When not to use it:

- To read or write a `.base` file in the Obsidian app, use Obsidian. This
  package has no plugin API and no editor integration.
- To draw a table, cards or a map. The package computes view data (rows,
  groups, summaries). Drawing it is the caller's job.
- To get Obsidian's exact behaviour for a release newer than the 1.9 to 1.13
  documentation this package follows. See [How it compares](#how-it-compares).

The planned corpus model of this repository may replace the vault index under
this package. If it does, a 0.x release will say so.

## Install

```sh
npm install @osdlc/markdown-vault-query
```

`pnpm add @osdlc/markdown-vault-query` and `yarn add @osdlc/markdown-vault-query` work too.
The package depends on `@osdlc/markdown-vault`, which npm installs with it.

ESM only. Node.js 22 or later.

## Quick start

```ts
import { createVaultIndex } from '@osdlc/markdown-vault'
import { parseBase, queryExpression, runView } from '@osdlc/markdown-vault-query'

// The vault is built from data here. `scanVault` from `@osdlc/markdown-vault` builds the same
// index from a folder.
const vault = createVaultIndex([
  { path: 'tasks/write-docs.md', frontmatter: { status: 'open', due: '2026-03-01' } },
  { path: 'tasks/ship-it.md', frontmatter: { status: 'open', due: '2026-01-15' } },
  { path: 'tasks/fix-lexer.md', frontmatter: { status: 'done', due: '2026-02-01' } },
])

// Run one view of a base file.
const base = parseBase(`
filters: file.inFolder("tasks")
views:
  - type: table
    name: Open tasks
    filters: status == "open"
    order: [file.name, due]
    sort:
      - property: due
        direction: ASC
`)
const { rows, total } = runView(vault, base, 'Open tasks')
// total is 2; rows are ship-it.md, then write-docs.md

// Or filter with a bare expression.
const done = queryExpression(vault, 'status == "done"')
// one note: tasks/fix-lexer.md
```

To query a folder, build the index with `scanVault('/path/to/vault')` and read
the base with `parseBase(await readFile('tasks.base', 'utf8'))`.

## Which query function

All four take the vault index first and return plain data. They differ in what
they run and what they return.

| Function | Runs | Returns | Use it when |
| --- | --- | --- | --- |
| `runView` | One view of a base: global and view filters, `order` columns, sort, limit, groups, summaries | `ViewResult`: rows with evaluated columns, groups, summaries, and `total` before the limit | You render a base's view |
| `queryBase` | Only the base's global filters | The matching notes, in vault order | You want the notes a base selects and no columns |
| `queryExpression` | One filter expression | The matching notes, in vault order | You filter with a string and need no sort or paging |
| `queryVault` | One filter expression, sort keys, `offset` and `limit` | `FilterQueryResult`: one page of notes and the `total` before paging | You page through results, as a UI list does |

A note whose expression fails to evaluate is left out of a filter. In a view
column, the failure shows as an `ErrorValue` in that cell, and the query still
completes.

## What it reads

The Bases syntax as documented in the
[official help](https://help.obsidian.md/bases/syntax) (Obsidian 1.9 to 1.13):

- **Filters**: string expressions and recursive `and`/`or`/`not` groups
  (`not` means "none of the following"), global and per view.
- **Expression language**: arithmetic, comparisons, boolean logic, method
  chaining, `list[0]` and `obj["key"]` indexing, list, object and regex
  literals, `note.`, `file.` and `formula.` scopes, bare-name note
  properties, and `this`.
- **Function library**: the documented set. Globals: `date` `duration`
  `escapeHTML` `file` `html` `icon` `if` `image` `link` `list` `max` `min`
  `now` `number` `random` `today`. Methods on strings, numbers, lists, dates,
  links, files, objects and regexps, including `filter`, `map` and `reduce`
  with the implicit `value`, `index` and `acc`, `hasTag` (any of the tags,
  nested tags), `inFolder` (subfolders), `replace` with a regex and `$1`
  capture references, Moment-style `date.format()`, `relative()`, and duration
  arithmetic (`now() + "1d"`, and calendar-aware `date + "1M"`).
- **Views**: `table`, `cards`, `list` and plugin types, with `order`
  (columns), multi-key `sort` (and the legacy `column:` spelling), `groupBy`,
  `limit`, and built-in and custom `summaries` over the implicit `values`
  list. Unknown view keys are kept in `extra`, so a base round-trips.
- **Error model**: an evaluation error becomes an `ErrorValue` in that cell
  instead of failing the query, as in Obsidian.

Frontmatter wikilink strings become link values, and ISO date strings become
dates.

What it does not do: plugin-registered expression functions do not exist here,
and `file.backlinks` is whatever the vault index holds, so a long-lived index
needs rebuilding to see new links.

## Untrusted input

A `.base` file and a filter expression are code-like input. A regular
expression in one runs with JavaScript's backtracking matcher, and a pattern
such as `/^(a+)+$/` against a long value can take unbounded time. Nothing in
the package limits that. Do not evaluate bases or expressions from a party you
do not trust in a process you share. Run them in a worker you can stop.

Nesting too deep for the stack is not a hang, and it ends in an error the
package names. `parseExpression` throws `ExpressionError` and `parseBase`
throws `BaseParseError`. `evaluateSafe` returns an `ErrorValue`. The query
functions show that value in the cell, or count the filter expression as
false. `evaluate` throws a `RangeError`.

## CLI

The package installs `markdown-vault-query`:

```sh
markdown-vault-query query docs/planning/tasks/tasks.base --vault docs
markdown-vault-query filter 'file.hasTag("work") && file.mtime > now() - "7d"' --vault vault
markdown-vault-query check docs/planning/**/*.base
markdown-vault-query views some.base
```

| Command | Does | Exit code |
| --- | --- | --- |
| `query <file.base>` | Runs a view and prints a table. `--view <name>` picks the view, `--this <vault-path>` sets `this`, `--json` prints JSON. `this` defaults to the base file's own path when the file is inside the vault. | 0, or 1 on an invalid base or an error |
| `filter '<expression>'` | Prints the paths of the matching notes. | 0, or 1 on an error |
| `check <file.base> ...` | Parses each base and prints `ok` or `FAIL` per file. | 1 when any file fails |
| `views <file.base>` | Lists the view types and names. | 0, or 1 on an error |

`--vault <dir>` sets the vault root for `query` and `filter`. It defaults to the
current directory. `--help` and `--version` print usage and the version. An
unknown option, or `--vault`, `--view` or `--this` with no value, prints one
line on stderr and exits 1. A missing or unknown command, or a command with
its argument missing, prints the usage text on stderr and exits 1. An argument
after `--` is not read as an option, so an expression that starts with `-`
goes there: `markdown-vault-query filter --vault vault -- '-price < 0'`.

## API

Each export has TSDoc in the source. Your editor shows it.

| Group | Exports |
| --- | --- |
| Base files | `parseBase`, `extractEmbeddedBases`, `BaseParseError`, and the types `BaseDef`, `BaseViewDef`, `FilterNode` and `SortKey` |
| Queries | `runView`, `queryBase`, `queryExpression`, `queryVault`, `selectView`, `matchesFilter`, `evaluatePropertyId`, and the types `QueryOptions`, `FilterQueryOptions`, `FilterQueryResult`, `ViewResult`, `ViewRow` and `ViewGroup` |
| Expressions | `parseExpression`, `ExpressionError`, `evaluate`, `evaluateSafe`, `ExpressionEvalError`, `resolveNote`, `runLinkResolver`, and the type `EvalContext` |
| Values | `DateValue`, `DurationValue`, `LinkValue`, `FileValue`, `RegexpValue`, `HtmlValue`, `ImageValue`, `IconValue`, `ErrorValue`, the type `Value`, and the helpers `isTruthy`, `isEmptyValue`, `valueEquals`, `compareValues`, `toDisplayString`, `toNumber`, `typeName`, `parseDate`, `parseDuration`, `fromFrontmatter` and the type `LinkResolver` |
| Dates | `formatDateMoment`, `formatRelative` |
| Syntax tree and lexer (experimental) | `tokenize`, `Token`, `TokenType`, and the node types listed under [Stability](#stability) |

`evaluate` throws `ExpressionEvalError`, which is not the global `EvalError`,
and a `RangeError` for an expression nested too deeply for the stack.
`evaluateSafe` returns an `ErrorValue` for both. `queryVault` throws a
`RangeError` when `offset` or `limit` is not a non-negative integer. A caller
that evaluates many expressions against one index builds one resolver with
`runLinkResolver(vault)` and passes it as `EvalContext.resolveLink`, so the
index's name table is built once. Examples of each export are in
[`examples/`](https://github.com/osdlc/osdlc/tree/main/packages/ts/markdown-vault-query/examples).

## How it compares

Other packages read Bases files. The facts below are from their published
packages in November 2026.

| Package | Covers | Does not cover |
| --- | --- | --- |
| [`@type32/obsidian-bases-parser`](https://www.npmjs.com/package/@type32/obsidian-bases-parser) | Parses, writes and edits `.base` files. Runs the expression language and queries over a `BaseHost` the caller supplies. No file system access. Follows Obsidian 1.15.1 as observed. | A command line, a vault scanner or index (the caller writes the host), paged ad hoc queries, and extracting `base` blocks from markdown. |
| [`mdbasequery`](https://www.npmjs.com/package/mdbasequery) | Runs `.base` files and queries built from YAML or flags, as a command line and a TypeScript library, over a vault directory. | An in-memory index as input, and editing `.base` files. Version 0.0.x. |
| This package | `.base` parsing, the expression language, views and summaries over a vault index from a folder or from data, `queryVault` paging, `base` blocks in markdown, a command line. | Writing `.base` files. Behaviour newer than the 1.9 to 1.13 documentation. |

The first two read a `.base` file the way Obsidian does and can fit where this
one does not. This package continues because the notes of the repository it
comes from already sit in a `VaultIndex`, and it needs the paged query and the
command line. See the decision note
[D-02](https://github.com/osdlc/osdlc/blob/main/packages/ts/markdown-vault-query/docs/planning/decisions/D-02-alternatives.md).

## Stability

The package is 0.x, so any minor release may break the API. Within that, each
export is stable or experimental. A breaking change to a stable export is
listed in the CHANGELOG under "Breaking". Any release may change or remove an
experimental export.

The experimental exports of `@osdlc/markdown-vault-query`:

`tokenize`, `Token`, `TokenType`, `Expr`, `LiteralExpr`, `RegexExpr`,
`ListExpr`, `ObjectExpr`, `IdentExpr`, `PropExpr`, `IndexExpr`, `CallExpr`,
`MethodExpr`, `UnaryExpr`, `BinaryOp`, `BinaryExpr`

They are exported because `evaluate` takes a syntax tree. The tree follows the
expression grammar, so a new operator or literal changes it. A test compares
this list with the `@experimental` tags in the source.

## Platforms and runtimes

Node.js 22 or later, ESM only. The package reads files through Node's file
system and resolves symlinks when the CLI decides whether a base file is inside
the vault. It is tested on Linux and macOS. Windows is not tested.

## Running from a checkout

To try a change to markdown-vault-query with the `markdown-vault-query` already on your
PATH, link a checkout of this package:

```sh
markdown-vault-query dev link ~/src/osdlc/packages/ts/markdown-vault-query   # every run now uses that checkout
markdown-vault-query dev status                                              # which code runs, and why
markdown-vault-query dev off                                                 # back to the installed copy
```

`MARKDOWN_VAULT_QUERY_HOME=<checkout> markdown-vault-query …` does the same for one run. The
checkout runs from source under Bun, so it needs `bun` on PATH and the checkout's
dependencies installed and built. The installed copy says which checkout it
hands off to on stderr; `MARKDOWN_VAULT_QUERY_QUIET=1` silences that line. `dev` is a command
word, so `markdown-vault-query dev …` never reaches `query`, `filter`, `check` or `views`. See
[`@osdlc/cli-tool`'s devlink](https://github.com/osdlc/osdlc/tree/main/packages/ts/cli-tool#running-from-a-checkout-or-a-projects-pinned-copy).

## Licence

`MIT OR Apache-2.0`, at your option. See [MIT](./LICENSE-MIT) and [Apache-2.0](./LICENSE-APACHE).
