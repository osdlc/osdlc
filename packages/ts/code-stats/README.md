# @osdlc/code-stats

How much of your code is real logic, and how much is imports, comments, docs and blank lines?
And when a pull request says "+400 lines", how many of those are new logic, and how many are a
function that moved, a renamed field or a rewritten comment?

`code-stats` answers both. It gives every line of a file one **kind**:

```text
boilerplate │ import { round } from './money.ts'
blank       │
doc         │ /** The total a customer pays. */
logic       │ export function total(items: Item[]): number {
logic       │   if (isEmpty(items)) return 0
comment     │   // Tax applies after rounding.
logic       │   return round(subtotal(items) * (1 + TAX_RATE))
boilerplate │ }
```

It adds them up for a folder, a commit, a change or two changes side by side. For a change, it also
says what happened to each line: **added**, **removed**, **changed** (rewritten in place) or
**moved** (the same code somewhere else). It is deterministic and calls no model.

Line counters such as scc, tokei and cloc give totals, but never label a line or follow a change;
see the [tool comparison](./docs/guide/tool-comparison.md).

It is for people and tools that need those numbers as data: a review bot that says how much of a
pull request is new logic, a CI gate on comment-only or generated-file changes, a report of what a
codebase is made of. It is a TypeScript library and a command, `code-stats`.

It is not for the quick totals of a large tree (scc and tokei are native programs built for that),
for trends and per-author views over time (it measures one folder or one change at a time), or
for a language-aware diff you read (difftastic shows a change and produces no numbers). The kinds
are heuristics with documented limits; the [guides](#guides) say where.

## Install

```sh
npm install @osdlc/code-stats
```

Run the command without installing it:

```sh
npx @osdlc/code-stats count
```

Write the scope: the unscoped npm package `code-stats` is a different tool that also installs a
`code-stats` command.

ESM only. Node.js `^22.22.2`, `^24.15.0` or `>=26.0.0`: the `engines` range in `package.json` is
the one of `@osdlc/typed-git`, which the package reads git through.

The library and the command are one package, so the install brings `@osdlc/cli-tool`, the
framework the command is built on, and its dependencies. Importing the library loads it too, for
one function
([T-03](https://github.com/osdlc/osdlc/blob/main/packages/ts/code-stats/docs/planning/tasks/T-03-import-the-library-without-the-command-framework.md)
is the task to stop that).

## Quick start

```sh
npm install @osdlc/code-stats

code-stats count                 # every file in this folder, by kind and language
code-stats diff 123              # what pull request 123 did, line by line
code-stats compare 123 456       # two pull requests side by side
code-stats describe 123 --write  # a PR description with the stats, a package map and risk signals
```

`code-stats count` on a small project:

```text
| Language | Files | Logic | Boilerplate | Comments | Docs | Blank | Lines |
|---|---:|---:|---:|---:|---:|---:|---:|
| TypeScript | 2 | 9 | 5 | 1 | 2 | 3 | 20 |
| Markdown | 1 | 0 | 0 | 0 | 2 | 1 | 3 |
| JSON | 1 | 1 | 0 | 0 | 0 | 0 | 1 |
| **Total** | **4** | **10** | **5** | **1** | **4** | **4** | **24** |
```

The same from code, on a repository with two commits:

```ts
import { countTree, diffChange, parseChangeSpec, renderDiff } from '@osdlc/code-stats'

const tree = countTree({ cwd, paths: ['src'] })
tree.kinds // { logic: 1, boilerplate: 1, comment: 1, doc: 0, blank: 1 }

const report = diffChange(parseChangeSpec('HEAD~1..HEAD'), { cwd })
report.kindOperations.logic.changed // 1
report.kindOperations.comment.added // 1
renderDiff(report) // the Markdown table the command prints, a row per kind
```

## Do I need git?

Only for history.

| You want | Command | Library | Needs git |
| --- | --- | --- | --- |
| Stats for a folder | `code-stats count [paths]` | `countDirectory` | No |
| The kinds of one file's lines | | `createScannerRegistry().scan` | No |
| Stats for a commit | `code-stats count --rev <ref>` | `countTree` | Yes |
| A change: a PR, `a..b`, `a...b`, uncommitted work | `code-stats diff` | `diffChange` | Yes |
| Two changes side by side | `code-stats compare` | `compareChanges` | Yes |
| A PR description | `code-stats describe` | `describeChange` | Yes |

`count` reads the files on disk, with the same result whether or not git is installed. It still
honours your `.gitignore` and `.gitattributes`, which it reads as files, from the repository's
top down. A command that needs history, run where git is missing or outside a repository, stops
with a message saying so.

Pull requests (`123` or `#123`) also need an authenticated [`gh`](https://cli.github.com/).

## The command

`code-stats help` lists the commands, and `code-stats help --all` adds the exit codes.
`code-stats <command> --help` shows one command's flags, and `code-stats help <command> --full`
adds its examples. `code-stats help --json` gives the same help as data.

Every command takes `--json`, which prints the report as one JSON document. The document is the
report with `schemaVersion` and `kind` (such as `count`) in front. `code-stats schema` prints the
JSON Schema of each command's input and output. On a failure, `--json` also prints an error
document with `kind: "error"`, a `code`, the `message` and the `exit` code.

Errors go to stderr, starting `code-stats:`. `code-stats --version` prints the version,
and `code-stats --where` says which install or checkout is running.

The command exits 0 on success, 2 for a mistake in the request (a bad flag, revision or path),
22 when git or `gh` is not installed, 23 when `gh` is signed out or cannot see the pull request,
24 outside a git repository, 25 for a network failure or timeout, and 1 for anything else. These
are the codes shared by the `@osdlc` command-line tools.

## Guides

- [Counting](./docs/guide/counting.md): line kinds, languages, file groups, what is skipped, and
  tree-sitter.
- [Changes](./docs/guide/changes.md): naming a change, what added, changed and moved mean,
  change categories, API and complexity, a worked example.
- [PR descriptions](./docs/guide/pr-descriptions.md): `describe`, the package map, the risk
  list, and how `--write` keeps your text.
- [Library](./docs/guide/library.md): the API, with examples for each job.
- [How it works](./docs/guide/how-it-works.md): the layers, where git comes in, and accuracy.
- [Tool comparison](./docs/guide/tool-comparison.md): scc, tokei, cloc, GitClear and others,
  where each stops, and when to use them instead.

## Alternatives

| Tool | What it gives | What it does not |
| --- | --- | --- |
| [scc](https://github.com/boyter/scc) | Code, comment and blank totals for 366 languages, fast, with a complexity estimate. | A kind for each line, or an account of a change. code-stats vendors its language table. |
| [tokei](https://github.com/XAMPPRocky/tokei) | The same totals, docstrings for a few languages, and a Rust library. | A kind for each line, or an account of a change. |
| [cloc](https://github.com/AlDanial/cloc) | Totals, and `--diff` between two trees or refs. A Perl program under GPL-2.0. | Doc against comment, boilerplate, moved lines, or a library. |
| `git diff --stat`, GitHub's `+/-` | Added and removed lines, everywhere. | A moved or renamed function reads as new code. |
| [GitClear](https://www.gitclear.com/) | Line operations (moved, updated, deleted) in a hosted service. | A library you run locally. code-stats takes its idea of recording an operation apart from a kind. |
| [GitHub linguist](https://github.com/github-linguist/linguist) | A file's language, and whether it is generated, vendored or documentation. | Counts. code-stats reads its `.gitattributes` attributes. |
| [lizard](https://github.com/terryyin/lizard) | Cyclomatic complexity per function, for many languages. | A link to the kinds of lines a change touched. code-stats calls it for languages other than TypeScript and JavaScript. |
| [difftastic](https://difftastic.wilfred.me.uk/) | A diff that follows the syntax. | Numbers. |

The [tool comparison](./docs/guide/tool-comparison.md) has the detail and says when to use each.

## Runtimes and platforms

- Node.js `^22.22.2`, `^24.15.0` or `>=26.0.0`. The repository's CI runs the tests on Node 22, 24
  and 26. Bun is not tested.
- Linux and macOS are tested. The tests run on Windows in CI; the first results are pending. The
  package starts `git`, `gh` and `lizard` as programs and handles paths through one helper.
- `git` on `PATH` for anything that reads history. `gh` for pull requests. Neither is needed for
  `count` or for the scanner.

Optional extras:

- `typescript`: exact complexity and class members for TypeScript and JavaScript in a diff. The
  measured repository's own copy is used when it has one.
- `web-tree-sitter` plus the grammar packages for the languages you want
  (`tree-sitter-typescript`, `-javascript`, `-python`, `-rust`, `-scala`, `-go`, `-java`, `-c`,
  `-cpp`, `-c-sharp`, `-ruby`, `-php`, `-bash`): syntax-tree scanners
  ([Counting](./docs/guide/counting.md#reading-with-tree-sitter)). They are optional peers:
  declared in `package.json`, but never installed for you.
- [`lizard`](https://github.com/terryyin/lizard) on `PATH`: complexity for other languages.

`code-stats dev link <checkout>` makes the installed command run a checkout of this package. The
checkout runs from source under Bun, with its own installed dependencies, so the hand-off needs
`bun` on `PATH`. Nothing else in the package needs Bun. See
[`@osdlc/cli-tool`'s devlink](https://github.com/osdlc/osdlc/tree/main/packages/ts/cli-tool#running-from-a-checkout-or-a-projects-pinned-copy).

## Stability

The version is 0.x. A breaking change to a stable export ships in a minor release, with a changelog
entry that starts `Breaking:`.

These exports are experimental: their shape may change in any release, and a change to them is not
a breaking change. They are building blocks the commands are made from, kept public for callers
that assemble their own pipeline.

The experimental exports of `@osdlc/code-stats`:

`CHANGE_KINDS`, `ENTRY_KINDS`, `PACKAGES_SECTION`, `RISK_SECTION`, `RULE_GROUPS`,
`assignOperations`, `buildPackageMap`, `categorizeChange`, `createLizardAnalyzer`,
`createTypescriptAnalyzer`, `defaultAnalyzers`, `dependencyChange`, `renderDescription`,
`renderPackageMap`, `renderRisk`, `riskSignals`

The experimental exports of `@osdlc/code-stats/scan`:

`addKindCounts`, `classifyLines`, `emptyKindCounts`, `knownLanguages`, `languageNamed`, `stripBom`

The experimental exports of `@osdlc/code-stats/tree-sitter`:

`BUILTIN_GRAMMARS`, `treeSitterScanner`

Every other export is stable. A test compares these lists with the `@experimental` tags in the
source, and requires TSDoc on every export and an example in `examples/` for every value export.

The report shapes (`countReportSchema`, `diffReportSchema`, `compareReportSchema`) carry
`schema: 1`, which changes only when a shape does.

## Licence

`MIT OR Apache-2.0`, at your option. See [MIT](./LICENSE-MIT) and [Apache-2.0](./LICENSE-APACHE).
The language table is derived from scc, under the MIT licence; see
[THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES).
