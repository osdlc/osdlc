# @osdlc/diffkit

A review-prep manifest for a pull request or a branch diff. `diffkit prep` reads a change and prints one
JSON document that says which files to read, which to set aside and why, how to group the rest by
package for separate reviewers, and where to look first. It is deterministic, calls no model and keeps
no state.

A reviewer, human or automated, who is handed a large diff spends the first part of the review
deciding what to skip: lockfiles, generated code, vendored trees, reformatting. This package makes
that decision once, the same way every time, and records it. It is for a script or a review tool that
wants that plan as data, and for a person who wants it as a command. It does not review anything. A
flag says where to look, not that something is wrong, and a file with no flag has not been shown to be
fine. If you want findings, use a linter or a reviewer; if you want line statistics for a change, use
[`@osdlc/code-stats`](https://github.com/osdlc/osdlc/tree/main/packages/ts/code-stats) directly.

```sh
diffkit prep 123                    # a PR (needs gh, and its commits in this checkout)
diffkit prep --base origin/main     # the current branch: origin/main...HEAD
diffkit prep --base v1 --head v2    # exactly v1..v2, e.g. what changed since a last review
diffkit prep --worktree             # HEAD against the working tree, untracked files too
diffkit prep --base origin/main --worktree  # the branch's commits and its uncommitted edits together
```

The file facts come from [`@osdlc/code-stats`](https://github.com/osdlc/osdlc/tree/main/packages/ts/code-stats):
prep measures the change with its `measureChange` and plans the review on top. code-stats resolves the
change (a PR is the merge-base of its base and head, to the head; `--base` alone is `<base>...HEAD`;
`--head` makes the pair exact, `<base>..<head>`; `--worktree` adds untracked, non-ignored files as
added), reads its diff, and gives each file a group and a change category. Change statistics
themselves are `code-stats diff`.

## Install

```sh
npm install @osdlc/diffkit zod
```

Or run the command without installing it:

```sh
npx @osdlc/diffkit prep --base origin/main
```

zod 4 is a peer: the package exports a zod schema, so it shares your zod. The `typescript` package is
an optional peer. The flags need its compiler API, and use the measured project's own copy when it has
one. Without it, no flag is computed and `notes` says so.

ESM only. Node.js `^22.22.2`, `^24.15.0` or `>=26.0.0`. The tool runs `git` and, for a pull request,
`gh`, so both must be on `PATH`, and `gh` authenticated for a PR. Linux and macOS are tested. The tests
run on Windows in CI; the first results are pending.

## Quick start

`runPrep` is what the command runs. It takes the arguments and the two command runners it reaches git
and `gh` through, and returns the manifest.

```ts
import { spawnRunner } from '@osdlc/command-seam'
import { runPrep } from '@osdlc/diffkit'

// Diff the last commit against its parent; the runners are how it reaches git and gh.
const manifest = runPrep(
  { cwd: root, pr: null, base: 'HEAD~1' },
  { git: spawnRunner('git'), gh: spawnRunner('gh') },
)

manifest.files.kept.map((f) => f.path) // ['pkg/a.ts']
manifest.files.dropped // [{ path: 'pnpm-lock.yaml', reason: 'generated' }]
manifest.groups // [{ id: 'g1', roots: ['pkg'], files: ['pkg/a.ts'], lines: 2 }]
```

The example is run as a test in [`examples/readme.test.ts`](./examples/readme.test.ts). Install
`@osdlc/command-seam` to use `spawnRunner`; any `CommandRunner` works, so a test can pass a fake.

## The manifest

`diffkit prep [<pr> | --base <ref> [--head <ref>] | [--base <ref>] --worktree] [--group-size <n>]`
prints ONE JSON manifest (`schema: 2`, the zod `prepManifestSchema`). It creates no worktree and
reads the checkout it runs in; git and `gh` are reached only through the injected runners. With
`--worktree`, `--base` is the merge base of `<ref>` and `HEAD`, diffed against the working tree.

| Field | Content |
| --- | --- |
| `change` | The change as code-stats resolved it: `kind` (`pr`, `range`, `merge-base`, `worktree`), `label`, `pr`, and the `base` and `head` commits (`head` null for the working tree). |
| `coverage` | Languages the flags cover: `["ts"]`, the TypeScript and JavaScript sources the `typescript` compiler reads. A language that is not listed has no flags, and that is not the same as clean. |
| `thresholds` | The numbers this run used, so a reader can see how strict it was. |
| `files.kept` | `{path, status, group, category, language, added, removed}` for each file worth reading: code-stats' group, change category and language. `category: "comments"` shows a file whose change is only comments. |
| `files.dropped` | `{path, reason}`: `generated`, `vendored` or `formatting-only`. |
| `groups` | `{id, roots, files, lines}`: the kept files grouped for separate reviewers; `roots` lists the package roots a group holds. |
| `flags` | A reading order, below. |
| `notes` | A check that could not run, such as the TypeScript compiler API being absent or a source too large to read. |

**Dropped files** are code-stats' classification, read from its report: a file in the `generated`
group (lockfiles, `*.min.*`, `*.map`, `_generated/`, `*.generated.*`, snapshots, a `DO NOT EDIT` or
`@generated` marker in its first lines, and anything `.gitattributes` marks `linguist-generated`), a
file in the `vendored` group (`linguist-vendored`, `vendor/`, `node_modules/`, …), then a file whose
change category is `formatting` (only whitespace that cannot change meaning, or only blank lines).
Prep classifies nothing itself. A repository marks its own generated trees in `.gitattributes`, as
GitHub reads them. A source file whose changed lines are all comments or doc comments, with or
without blank lines among them, is kept, with `category: "comments"`, because comment accuracy is
reviewed. A generated or vendored file is dropped whatever its status. Of the rest, added, deleted
and renamed files are always kept, and so is a reformatted test or doc file, because the
categories put those first. See
code-stats' [Changes guide](https://github.com/osdlc/osdlc/blob/main/packages/ts/code-stats/docs/guide/changes.md)
for the categories.

**Groups.** A kept file belongs to its nearest package root: the closest ancestor directory, at the
change's head commit, that holds `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`,
`deno.json`, `pom.xml`, `build.gradle(.kts)`, `setup.py`, `Gemfile`, `composer.json`,
`Package.swift`, `mix.exs` or `pubspec.yaml`. A file with none above it is in the repo root group,
`"."`. The markers are read from the head's tree (`git ls-tree -r`), so no checkout is needed; for
`--worktree` the checkout's tracked and untracked files are used, a marker deleted in the working
tree excluded. Everything runs from the repository's top level, wherever `diffkit` was started. A
group of more than `--group-size` files (default 12) is split into even slices that keep its `root`,
in path order: count = ceil(n / limit), and the first n % count slices take one file more than
floor(n / count), so 13 files become 7+6 and not 12+1, and 13 over a limit of 4 become 4+3+3+3.
`--group-size 0` turns splitting off. Ids are `g1`, `g2`, … in root order. Afterwards, consecutive
groups whose combined size stays within the limit are packed into one (`roots` then lists several),
so thirty one-file packages are three reviewers, not thirty.

### Flags are a reading order

A flag says where to look first. None is a finding, and a file with no flag has not been
shown to be fine: every check is cheap, deterministic and partial. Each carries
`basis`: `measured` is a count taken from the diff and the syntax tree (the number is
exact, whether it matters is a judgement); `heuristic` is a pattern that is often right
and sometimes not, with its `measurements` giving the evidence to check. The checks cover
TypeScript and JavaScript sources (not deleted files, not declaration files, and not files under
`dist/`, `fixtures/` or `vendored/`) and need the `typescript` compiler
API, the checkout's own copy when it has one, else the one beside code-stats; without it they
are skipped and `notes` says so. A source too large for code-stats to read (over 2 MB) is
named in `notes`. A test file is one code-stats puts in its `tests` group.

| Kind | Basis | Rule |
| --- | --- | --- |
| `long-function` | measured | A function of at least 90 lines (first to last line) of which more than 50% is added by this change. Nested functions count separately; test files are not considered. Measurements: `lines`, `addedShare`. |
| `test-only-export` | heuristic | A name added to a changed module's exports (declarations, `export { … }` lists; not defaults or `export … from`) whose only importers in the checkout are test files. Importers come from a scan of top-level `import` and `export … from` declarations with relative specifiers; a namespace import counts for every name. Re-exports through an index count as a non-test importer, dynamic `import()`, `require()` and package-name imports are not seen, and an export nobody imports is not flagged. An importer over 400 KB is not read, and `notes` does not name it. Measurements: `name`, `importers`. |

## Library

The API reference is the TSDoc on each export, shipped in the package's `.d.ts` files; your editor
shows it on hover.

| Export | Use |
| --- | --- |
| `runPrep(args, env)` | Measure a change and return the validated manifest. |
| `PrepArgs`, `PrepEnv` | Its arguments, and the git and `gh` runners it takes. |
| `DEFAULT_THRESHOLDS` | The numbers a run uses unless `args.thresholds` overrides them. |
| `prepManifestSchema` | The zod schema of the manifest, `schema: 2`. Refuse a `schema` number you do not know. |
| `PrepManifest`, `PrepFile`, `PrepFlag`, `PrepGroup`, `Thresholds` | Types inferred from the schema. |
| `DiffkitError` | The failure to show as a message. `usage` is true when the command line was at fault. |
| `PACKAGE_MARKERS`, `packageRoots`, `nearestRoot`, `buildGroups` | The grouping pieces under `runPrep`. Experimental. |

Runnable examples of each are in [`examples/`](./examples/).

## Reading the checkout

The flags read source files from the working tree to find who imports an export. A file that is a
symlink is not followed and counts as unreadable, and a file behind a linked directory is read only
when its real path is still inside the repository, so a tracked link cannot make a run read a file
outside the repository. The changed files themselves are read from git at the head commit. See
[SECURITY.md](./SECURITY.md).

## Stability

The package is 0.x. A breaking change bumps the minor version.

These exports are experimental: their shape may change in any release, and a change to them is not a
breaking change.

The experimental exports of `@osdlc/diffkit`:

- `PACKAGE_MARKERS`, `packageRoots`, `nearestRoot` and `buildGroups`.

Everything else is stable within the 0.x minor line. The manifest's `schema` number changes when its
shape does.

## Alternatives

| Tool | What it does | How it differs |
| --- | --- | --- |
| [`@osdlc/code-stats`](https://github.com/osdlc/osdlc/tree/main/packages/ts/code-stats) | Measures a change: line counts, file groups, change categories. | diffkit uses it for every file fact and adds the review plan: kept and dropped files, groups by package root, flags. |
| [danger](https://danger.systems/js/) | A rules framework that runs your checks over a PR's changed files. | You write the rules. diffkit has a fixed plan and prints data, not comments. |
| [`diffstat`](https://www.npmjs.com/package/diffstat) | Diff statistics by category. | No kept and dropped lists, groups or flags. |
| [`parse-diff`](https://www.npmjs.com/package/parse-diff), [`gitdiff-parser`](https://www.npmjs.com/package/gitdiff-parser) | Parse a unified diff into hunks. | A building block. They classify nothing. |
| A model-based reviewer | Reads the diff and writes a review. | Not deterministic, and needs a model key. diffkit can feed one a smaller, grouped input. |

The unscoped npm package `diffkit` is an unrelated command-line tool that also installs a `diffkit`
binary. Installing both globally makes them claim the same command.

## Running from a checkout

To try a change to diffkit with the `diffkit` already on your PATH, link a checkout of this package:

```sh
diffkit dev link ~/src/osdlc/packages/ts/diffkit   # every run now uses that checkout
diffkit dev status                                 # which code runs, and why
diffkit dev off                                    # back to the installed copy
```

`DIFFKIT_HOME=<checkout> diffkit …` does the same for one run. The checkout runs from source under
Bun, with its own installed dependencies. The installed copy says which checkout it hands off to on
stderr; `DIFFKIT_QUIET=1` silences that line. `dev` is a command word, so `diffkit dev …` never reaches
`prep`. See [`@osdlc/cli-tool`'s devlink](https://github.com/osdlc/osdlc/tree/main/packages/ts/cli-tool#running-from-a-checkout-or-a-projects-pinned-copy).

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
