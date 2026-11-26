---
title: Using the library
sidebar:
  order: 5
description: The entry points, with an example for each job the command does.
---

The library does everything the command does, and every report it returns is plain data with a
[zod](https://zod.dev/) schema. Pick the entry point by what you need:

| Entry point | What it has | Needs git |
| --- | --- | --- |
| `@osdlc/code-stats/scan` | The line scanner: text in, one kind per line out. | No, and no file system either. |
| `@osdlc/code-stats` | Counting a folder or a commit, measuring changes, PR descriptions, rendering. | Only the history functions. |
| `@osdlc/code-stats/prep` | `runPrep`: the review-prep manifest of a change. See [Review prep](./review-prep.md). | Yes |
| `@osdlc/code-stats/analysis` | `diffApi`, `loadTypeScript`, `parseSource`: compare the public API of two versions of a file. Experimental. | No |
| `@osdlc/code-stats/tree-sitter` | Optional syntax-tree scanners. | No |

## Label the lines of a string

```ts
import { countKinds, createScannerRegistry } from '@osdlc/code-stats/scan'

const source = [
  "import { readFile } from 'node:fs/promises'",
  '',
  '/** Reads it. */',
  "export const read = (p: string) => readFile(p, 'utf8') // utf-8",
].join('\n')

const scan = createScannerRegistry().scan(source, 'src/read.ts')
scan.name // 'TypeScript'
scan.kinds // ['boilerplate', 'blank', 'doc', 'logic']
countKinds(scan.kinds) // { logic: 1, boilerplate: 1, comment: 0, doc: 1, blank: 1 }
scan.fallback // null; says why when a simpler rule was used instead
```

The path only picks the language; nothing is read from disk. Make one registry and reuse it.

## Count a folder

No git needed:

```ts
import { countDirectory, renderCount } from '@osdlc/code-stats'

const report = countDirectory({ dir: '/path/to/project', paths: ['src'] })
report.files // 42
report.kinds // { logic: 3120, boilerplate: 410, comment: 230, doc: 515, blank: 640 }
report.languages // per language, largest first
report.groups.tests // { files, lines, kinds } for the tests group
console.log(renderCount(report)) // the Markdown tables the command prints
```

`paths` are relative to `dir`. Pass `detail: true` for a row per file in `report.fileList`, and
`groups: { generated: ['src/api/**'] }` to put files in a group yourself. See
[Counting](./counting.md) for what is skipped.

## Count a commit

```ts
import { countTree } from '@osdlc/code-stats'

const atRelease = countTree({ cwd: process.cwd(), rev: 'v1.0' })
```

`countTree` reads a commit through git. `cwd` is any directory inside the repository, and
`paths` are relative to it.

## Measure a change

```ts
import { compareChanges, diffChange, parseChangeSpec, renderDiff } from '@osdlc/code-stats'

const cwd = process.cwd()
const report = diffChange(parseChangeSpec('main...HEAD'), { cwd })
report.kindOperations.logic // { added: 3, removed: 0, changed: 2, moved: 2 }
report.fileList // per file: group, category, kinds and operations
report.api.changes // exported names added, removed, changed
report.complexity.movers // functions whose complexity changed most
console.log(renderDiff(report))

const both = compareChanges(parseChangeSpec('#12'), parseChangeSpec('#13'), { cwd })
```

`parseChangeSpec` takes what the command takes: `123`, `#123`, `a..b`, `a...b`, or a ref.
`diffChange(null, …)` is the branch against the remote's default branch, the one `origin/HEAD`
names, or against `origin/main` when `origin/HEAD` is unset (a CI fetch, for instance).
A tool with separate flags names the change with `changeSpecFrom({ pr, base, head, worktree })`,
which throws a `bad-input` `CodeStatsError` for selectors that contradict each other.
`measureChange` is `diffChange` that also returns the repository it opened, the resolved
`change` and the parsed diff (`files`), for a caller that reads more of the same change.

`diffChange` uses the repository's own `typescript` package when it has one, for class members
and exact complexity. It is loaded only when the change holds a TypeScript or JavaScript file.
Pass `typescript: null` to skip it, your own copy to use that, or `analyzers: []` to skip
complexity.

## Write a PR description

```ts
import { describeChange, parseChangeSpec, writeDescription } from '@osdlc/code-stats'

const cwd = process.cwd()
const description = await describeChange(parseChangeSpec('#123'), { cwd })
description.markdown // the whole template
description.packages // the package map as data: nodes, edges
writeDescription(123, description, { cwd }) // false when the PR already held it
```

`spliceDescription(body, description)` does the same to a string without touching GitHub.
`writePrBody` writes the statistics block alone, and `spliceSection(body, block, section)` puts
any one block (`STATS_SECTION`, `PACKAGES_SECTION`, `RISK_SECTION`) into a string. See
[PR descriptions](./pr-descriptions.md).

## Plan a review

```ts
import { spawnRunner } from '@osdlc/command-seam'
import { runPrep } from '@osdlc/code-stats/prep'

const manifest = runPrep(
  { cwd: process.cwd(), pr: null, base: 'origin/main' },
  { git: spawnRunner('git'), gh: spawnRunner('gh') },
)
manifest.files.dropped // generated, vendored and formatting-only files, with the reason
manifest.groups // the kept files grouped by package root, for separate reviewers
manifest.flags // where to look first
```

`prepManifestSchema` validates a manifest and `DEFAULT_THRESHOLDS` holds the numbers a run
uses. The grouping pieces (`packageRoots`, `nearestRoot`, `buildGroups`, `PACKAGE_MARKERS`) are
experimental. See [Review prep](./review-prep.md).

## Add a language

A `LanguageScanner` reads files the built-in table reads poorly, or not at all:

```ts
import { createScannerRegistry, type LanguageScanner } from '@osdlc/code-stats/scan'

const sql: LanguageScanner = {
  id: 'my-sql',
  language: 'SQL',
  matches: (path) => path.endsWith('.sql'),
  scan: (text) => text.split('\n').map((line) => (line.trim().startsWith('--') ? 'comment' : 'logic')),
}
const registry = createScannerRegistry({ scanners: [sql] })
countDirectory({ dir, registry })
```

It must return one kind per line, as `splitLines` splits the text. A scanner that throws, returns
the wrong number of kinds or an unknown kind is not trusted. Its file falls back to the built-in
table, or to the one-line rule when the table does not know the language, and
`scan.fallback` says why.

For a tree-sitter grammar, describe it instead of writing a scanner:

```ts
import { createTreeSitterScanners, type TreeSitterGrammar } from '@osdlc/code-stats/tree-sitter'

const go: TreeSitterGrammar = {
  id: 'go',
  language: 'Go', // the built-in table's name, whose doc and directive rules apply
  extensions: ['go'],
  wasm: { package: 'tree-sitter-go', file: 'tree-sitter-go.wasm' },
  imports: ['package_clause', 'import_declaration'],
}
const { scanners, missing, failed } = await createTreeSitterScanners({ grammars: [go] })
const registry = createScannerRegistry({ scanners })
```

`missing` lists grammars whose `.wasm` was not found, and `failed` those that would not load,
with the reason.

## Use your own file contents

The report builders take content you have already read, and start no process:

```ts
import { buildCountReport } from '@osdlc/code-stats'

const report = buildCountReport({ label: 'upload', commit: null }, [], [
  { path: 'a.py', content: { kind: 'text', text: 'import os\nprint(os.name)\n' } },
  { path: 'logo.png', content: { kind: 'binary', bytes: 2048 } },
])
report.files // 1
report.skipped // [{ path: 'logo.png', reason: 'binary' }]
```

`buildDiffReport(change, unifiedDiff, content)` does the same for a diff, with `content` giving
both sides' files (or `null` for none).

To read a change's diff yourself, `openRepo(cwd)` opens the repository and `readDiff(repo,
change)` returns its unified diff, read with the same pinned flags `diffChange` uses.
`runPrep`, in `@osdlc/code-stats/prep`, builds on these. To run `git diff` yourself for `parseDiff`, pass it `DIFF_FLAGS`,
those flags, so the user's git config cannot change the diff it reads.

## Building blocks

The commands are made of smaller pieces, and a caller that assembles its own pipeline can use
them. They are experimental: their shape may change in any release (see
[Stability](https://github.com/osdlc/osdlc/tree/main/packages/ts/code-stats#stability) in the README for the list).

```ts
import { assignOperations, dependencyChange, parseDiff } from '@osdlc/code-stats'

const files = parseDiff(unifiedDiff)
const [operations] = assignOperations(files) // added, changed, moved or removed, per changed line
dependencyChange(files[0]!) // dependencies a manifest diff adds, removes and bumps, or null
```

| Piece | What it does |
| --- | --- |
| `assignOperations` | The operation of every changed line of a parsed diff. |
| `categorizeChange` | The one category a file's change falls in, from its diff and the kinds of its lines. |
| `dependencyChange` | The dependencies a `package.json` or `Cargo.toml` diff adds, removes and bumps. |
| `createTypescriptAnalyzer`, `createLizardAnalyzer`, `defaultAnalyzers` | The complexity analyzers `diffChange` uses, to pass your own list as `analyzers`. |
| `buildPackageMap`, `renderPackageMap`, `renderRisk`, `riskSignals`, `renderDescription` | The parts of a PR description, built from a report. |
| `PACKAGES_SECTION`, `RISK_SECTION` | The markers of the generated blocks, for `spliceSection`. |
| `CHANGE_KINDS`, `ENTRY_KINDS`, `RULE_GROUPS` | The lists the schemas and group rules are made from. |
| `emptyKindCounts`, `addKindCounts`, `stripBom`, `knownLanguages`, `languageNamed`, `classifyLines` | Scanner helpers, from `@osdlc/code-stats/scan`. |
| `BUILTIN_GRAMMARS`, `treeSitterScanner` | The tree-sitter grammars and the scanner made over one, from `@osdlc/code-stats/tree-sitter`. |

## JSON and schemas

`countReportSchema`, `diffReportSchema` and `compareReportSchema` are the zod schemas of the
reports. Each report carries `schema: 1`, which changes only when the shape does.

The command's `--json` output is the report with two fields in front: `schemaVersion` (1) and
`kind` (`count`, `diff`, `compare`, `describe` or `prep`). The schemas ignore those two, so they parse the
command's output too. `code-stats schema` prints the JSON Schema of each command's output.

```ts
import { diffReportSchema } from '@osdlc/code-stats'

const report = diffReportSchema.parse(JSON.parse(text))
```

## Errors

Expected failures throw a `CodeStatsError` with a `kind`:

| `kind` | Meaning |
| --- | --- |
| `bad-input` | The request was wrong: an unknown revision, a path outside the directory, a bad change name. |
| `needs-git` | It reads git history, and git is not installed or there is no repository here. |
| `failed` | git, `gh` or the file system failed. |

When a command was behind it, `e.failure` says why in more detail: its `kind` (such as
`not-installed`, `not-a-repo` or `not-authenticated`), a message, and often a `hint`, such as
running `gh auth login`.

```ts
import { CodeStatsError, countDirectory, countTree } from '@osdlc/code-stats'

function count(cwd: string) {
  try {
    return countTree({ cwd })
  } catch (e) {
    if (e instanceof CodeStatsError && e.kind === 'needs-git') return countDirectory({ dir: cwd })
    throw e
  }
}
```

## Runtimes

The package is ESM and runs under Node.js `^22.22.2`, `^24.15.0` or `>=26.0.0` (the range in
`engines`), from the compiled JavaScript in `dist/`.

## Running commands

Every git and `gh` call goes through [`@osdlc/command-seam`][command-seam] runners, which you
can replace: `runners: { git, gitBytes, gh }`. Tests use this to stand in a fake `gh`, and a
host can use it to add timeouts or logging.

[command-seam]: https://www.npmjs.com/package/@osdlc/command-seam
