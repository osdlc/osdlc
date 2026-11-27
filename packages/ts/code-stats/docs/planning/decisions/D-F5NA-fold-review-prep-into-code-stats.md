---
id: D-F5NA
type: decision
state: proposed
created: 2026-11-25
---

# D-F5NA: Review prep is a command of code-stats

The owner has not yet confirmed this. This note proposes it.

## Decision

- The review-prep manifest, `prep`, is part of `@osdlc/code-stats`. It was a separate package
  with one command; that package is gone and was never published.
- The command is `code-stats prep`, with the flags the standalone command had. It is wired like
  `count`, `diff`, `compare` and `describe`, so its output and failures follow their rules: the
  plain output is the manifest, `--json` puts `schemaVersion` and `kind` in front of it, and a
  classified failure (no git, no `gh`, `gh` signed out) exits with the shared codes instead of 1.
- The library is the `@osdlc/code-stats/prep` entry point: `runPrep`, `prepManifestSchema` and
  its types, `DEFAULT_THRESHOLDS`, and the grouping pieces (`PACKAGE_MARKERS`, `packageRoots`,
  `nearestRoot`, `buildGroups`). `runPrep`, `prepManifestSchema` with its types, and
  `DEFAULT_THRESHOLDS` are stable; the grouping pieces are `@experimental`, as before.
- `prep` raises `CodeStatsError`, not an error type of its own: `kind` is `bad-input` when the
  arguments contradict each other or name something that does not exist, so the command exits
  with the usage code, as the other commands do for a bad revision.
- The four TypeScript helpers that the root entry exported only for `prep` (`isTsSource`,
  `loadTypeScript`, `parseSource`, `withParseMemo`) are no longer exported from it. `prep`
  imports them from inside the package. `loadTypeScript` and `parseSource` are public again from
  `@osdlc/code-stats/analysis` (`@experimental`, with `diffApi`), because an API-surface check
  needs them; `isTsSource` and `withParseMemo` stay internal. The `TypeScript` and `TypeScriptSource` types stay, because the
  complexity analyzers take them.
- `prep` keeps its own copy of the even-split rule (`src/prep/split.ts`); see
  [T-04](../tasks/T-04-share-the-even-split-rule.md).

## What `prep` computes and what it leaves to a reviewer

- `prep` is deterministic. The same change in the same checkout gives the same manifest. It
  calls no model, writes nothing, creates no worktree and keeps no state.
- It classifies nothing itself. Every file fact, the group, the change category and the
  language, comes from the same measurement `code-stats diff` makes, so the two agree on what a
  generated file or a formatting-only change is.
- On top of those facts it computes which files to drop and why (generated, vendored or
  formatting-only), groups of the kept files by nearest package root, split and packed to a
  size, and reading-order flags.
- It leaves to a reviewer whether a change is correct. A flag is not a finding. A file with no
  flag has not been shown to be fine. A language with no flag checks is not in `coverage`, which
  is not the same as clean.
- A generated or vendored file is dropped whatever its status. Of the rest, added, deleted and
  renamed files are always kept. A file whose changed lines are all comments is kept, with
  `category: "comments"`, because the accuracy of comments is reviewed. A reformatted test or doc
  file is kept.
- A flag has a `basis`. `measured` is a count taken from the diff and the syntax tree.
  `heuristic` is a pattern that is often right and sometimes not, and its measurements are the
  evidence to check.
- A repository marks its own generated trees in `.gitattributes`, as GitHub reads them; `prep`
  has no list of its own to configure.
- The flags need the `typescript` compiler API. Without it they are skipped and `notes` says so.

## The checkout is read without following symlinks

- When the flags read a file from the checkout, a path that is itself a symlink is not read. The
  read returns nothing, as it does for a missing file. A file behind a linked directory is read
  only when its real path is still inside the repository.
- The changed files are read from git at the head revision, not from the working tree, so this
  concerns only the other files the flags scan.
- A tracked symlink can point outside the repository. Following it would make `prep` parse a file
  the repository does not hold. A symlink is rarely source a reviewer cares about, so skipping it
  loses little. A flag that depends on a file behind a link is missed, and `coverage` and the
  flag rules already say a flag is partial.
- `tests/prep-flags.test.ts` checks that a link outside the repository is not read and names no
  importer. Git lists a symlink to a directory as one entry, so files reached only through it
  are not listed and not seen as importers.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep a separate package that depends on code-stats | It had one command, no library consumers, and used four exports code-stats published only for it. Two packages meant two release notes, and a `diffkit` binary that clashes with the unscoped npm package of that name. |
| Fold `prep` into `describe` | `describe` writes prose for a PR body. `prep` prints data for a reviewer, a different reader and a different schema. |

## Why

- `prep` is a consumer of code-stats' file facts and nothing else. It has no dependency of its
  own beyond `@osdlc/path-guard`, which the symlink rule uses.
- Folding it in lets the TypeScript helpers stop being public, and removes the `diffkit` command
  name that clashes on npm.

## Consequences

- The manifest's `schema` is 2. It changes when the manifest's shape does, separately from the
  package version.
- The `change` object and the group, category and status words in the manifest are code-stats'.
  A change to them is a change to the manifest's `schema`.
- `zod` stays a dependency, as for the other report schemas. The `typescript` peer stays
  optional.
