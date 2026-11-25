---
title: Review prep
sidebar:
  order: 4
description: A JSON manifest of a change for a reviewer, with the files to read, the files to drop, review groups by package and reading-order flags.
---

`code-stats prep` reads a change and prints one JSON document that says which files to read, which
to set aside and why, how to group the rest by package for separate reviewers, and where to look
first. It is deterministic, calls no model and keeps no state.

A reviewer, human or automated, who is handed a large diff spends the first part of the review
deciding what to skip: lockfiles, generated code, vendored trees, reformatting. `prep` makes that
decision once, the same way every time, and records it. It does not review anything. A flag says
where to look, not that something is wrong, and a file with no flag has not been shown to be fine.
For line statistics of a change, use [`code-stats diff`](./changes.md).

```sh
code-stats prep 123                    # a PR (needs gh, and its commits in this checkout)
code-stats prep --base origin/main     # the current branch: origin/main...HEAD
code-stats prep --base v1 --head v2    # exactly v1..v2, e.g. what changed since a last review
code-stats prep --worktree             # HEAD against the working tree, untracked files too
code-stats prep --base origin/main --worktree  # the branch's commits and its uncommitted edits together
```

`prep` classifies nothing itself. Every file fact comes from the same measurement `code-stats diff`
makes: the change is resolved as [Changes](./changes.md) describes (a PR is the merge base of its
base and head, to the head; `--base` alone is `<base>...HEAD`; `--head` makes the pair exact,
`<base>..<head>`; `--worktree` adds untracked, non-ignored files as added), and each file has a
[group](./counting.md) and a change category.

The command prints the manifest as it is. With `--json` it prints the same document with the
`schemaVersion` and `kind` fields every command's JSON starts with; the manifest's own
`schema: 2` follows them.

## The manifest

`code-stats prep [<pr> | --base <ref> [--head <ref>] | [--base <ref>] --worktree] [--group-size <n>]`
prints one manifest (`schema: 2`, the zod `prepManifestSchema`). It creates no worktree and reads
the checkout it runs in. With `--worktree`, `--base` is the merge base of `<ref>` and `HEAD`, diffed
against the working tree.

| Field | Content |
| --- | --- |
| `change` | The change as resolved: `kind` (`pr`, `range`, `merge-base`, `worktree`), `label`, `pr`, and the `base` and `head` commits (`head` null for the working tree). |
| `coverage` | Languages the flags cover: `["ts"]`, the TypeScript and JavaScript sources the `typescript` compiler reads. A language that is not listed has no flags, and that is not the same as clean. |
| `thresholds` | The numbers this run used, so a reader can see how strict it was. |
| `files.kept` | `{path, status, group, category, language, added, removed}` for each file worth reading. `category: "comments"` shows a file whose change is only comments. |
| `files.dropped` | `{path, reason}`: `generated`, `vendored` or `formatting-only`. |
| `groups` | `{id, roots, files, lines}`: the kept files grouped for separate reviewers; `roots` lists the package roots a group holds. |
| `flags` | A reading order, below. |
| `notes` | A check that could not run, such as the TypeScript compiler API being absent or a source too large to read. |

### Dropped files

A file is dropped when it is in the `generated` group (lockfiles, `*.min.*`, `*.map`,
`_generated/`, `*.generated.*`, snapshots, a `DO NOT EDIT` or `@generated` marker in its first
lines, and anything `.gitattributes` marks `linguist-generated`), or in the `vendored` group
(`linguist-vendored`, `vendor/`, `node_modules/`, and so on), or when its change category is
`formatting` (only whitespace that cannot change meaning, or only blank lines). A repository marks
its own generated trees in `.gitattributes`, as GitHub reads them.

A source file whose changed lines are all comments or doc comments, with or without blank lines
among them, is kept, with `category: "comments"`, because comment accuracy is reviewed. A generated
or vendored file is dropped whatever its status. Of the rest, added, deleted and renamed files are
always kept, and so is a reformatted test or doc file, because the categories put those first. See
[Changes](./changes.md#change-categories) for the categories.

### Groups

A kept file belongs to its nearest package root: the closest ancestor directory, at the change's
head commit, that holds `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `deno.json`,
`pom.xml`, `build.gradle(.kts)`, `setup.py`, `Gemfile`, `composer.json`, `Package.swift`,
`mix.exs` or `pubspec.yaml`. A file with none above it is in the repo root group, `"."`. The
markers are read from the head's tree (`git ls-tree -r`), so no checkout is needed; for
`--worktree` the checkout's tracked and untracked files are used, and a marker deleted in the
working tree is excluded. Everything runs from the repository's top level, wherever the command was
started.

A group of more than `--group-size` files (default 12) is split into even slices that keep its
`root`, in path order: count = ceil(n / limit), and the first n % count slices take one file more
than floor(n / count), so 13 files become 7+6 and not 12+1, and 13 over a limit of 4 become
4+3+3+3. `--group-size 0` turns splitting off. Ids are `g1`, `g2`, and so on, in root order.
Afterwards, consecutive groups whose combined size stays within the limit are packed into one
(`roots` then lists several), so thirty one-file packages are three reviewers, not thirty.

### Flags are a reading order

A flag says where to look first. None is a finding, and a file with no flag has not been shown to
be fine: every check is cheap, deterministic and partial. Each carries `basis`: `measured` is a
count taken from the diff and the syntax tree (the number is exact, whether it matters is a
judgement); `heuristic` is a pattern that is often right and sometimes not, with its
`measurements` giving the evidence to check.

The checks cover TypeScript and JavaScript sources (not deleted files, not declaration files, and
not files under `dist/`, `fixtures/` or `vendored/`) and need the `typescript` compiler API: the
checkout's own copy when it has one, else the one beside code-stats. Without it they are skipped
and `notes` says so. A source too large to read (over 2 MB) is named in `notes`. A test file is one
the `tests` group holds.

| Kind | Basis | Rule |
| --- | --- | --- |
| `long-function` | measured | A function of at least 90 lines (first to last line) of which more than 50% is added by this change. Nested functions count separately; test files are not considered. Measurements: `lines`, `addedShare`. |
| `test-only-export` | heuristic | A name added to a changed module's exports (declarations, `export { ... }` lists; not defaults or `export ... from`) whose only importers in the checkout are test files. Importers come from a scan of top-level `import` and `export ... from` declarations with relative specifiers; a namespace import counts for every name. Re-exports through an index count as a non-test importer, dynamic `import()`, `require()` and package-name imports are not seen, and an export nobody imports is not flagged. An importer over 400 KB is not read, and `notes` does not name it. Measurements: `name`, `importers`. |

## Reading the checkout

The flags read source files from the working tree to find who imports an export. A file that is a
symlink is not followed and counts as unreadable, and a file behind a linked directory is read only
when its real path is still inside the repository, so a tracked link cannot make a run read a file
outside the repository. The changed files themselves are read from git at the head commit. See
[SECURITY.md](https://github.com/osdlc/osdlc/blob/main/packages/ts/code-stats/SECURITY.md).

## From code

`runPrep` is what the command runs. It takes the arguments and the two command runners it reaches
git and `gh` through, and returns the validated manifest. It is in the `@osdlc/code-stats/prep`
entry point.

```ts
import { spawnRunner } from '@osdlc/command-seam'
import { runPrep } from '@osdlc/code-stats/prep'

// Diff the last commit against its parent; the runners are how it reaches git and gh.
const manifest = runPrep(
  { cwd: root, pr: null, base: 'HEAD~1' },
  { git: spawnRunner('git'), gh: spawnRunner('gh') },
)

manifest.files.kept.map((f) => f.path) // ['pkg/a.ts']
manifest.files.dropped // [{ path: 'pnpm-lock.yaml', reason: 'generated' }]
manifest.groups // [{ id: 'g1', roots: ['pkg'], files: ['pkg/a.ts'], lines: 2 }]
```

Any `CommandRunner` works, so a test can pass a fake. A failure is a `CodeStatsError`: `kind` is
`bad-input` when the arguments contradict each other or name something that does not exist.

| Export | Use |
| --- | --- |
| `runPrep(args, env)` | Measure a change and return the validated manifest. |
| `PrepArgs`, `PrepEnv` | Its arguments, and the git and `gh` runners it takes. |
| `DEFAULT_THRESHOLDS` | The numbers a run uses unless `args.thresholds` overrides them. |
| `prepManifestSchema` | The zod schema of the manifest, `schema: 2`. Refuse a `schema` number you do not know. |
| `PrepManifest`, `PrepFile`, `PrepFlag`, `PrepGroup`, `Thresholds` | Types inferred from the schema. |
| `PACKAGE_MARKERS`, `packageRoots`, `nearestRoot`, `buildGroups` | The grouping pieces under `runPrep`. Experimental. |

Runnable examples of each are in
[`examples/`](https://github.com/osdlc/osdlc/tree/main/packages/ts/code-stats/examples).
