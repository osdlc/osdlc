---
type: decision
schema_version: '2'
id: D-0005
title: Run without a local checkout from a managed bare clone
state: open/proposed
created: '2026-11-19'
last_reviewed: '2026-11-19'
tags:
  - pr-update
  - checkout
  - mirror
---
# Run without a local checkout from a managed bare clone

## Summary

Proposed: `pr_update.checkout: mirror` (and `--mirror-dir <dir>`) keeps one
bare clone per repository under a cache directory. The clone is not a
`git clone --mirror`: it keeps the `origin/<branch>` remote-tracking layout
that `survey` and `update` already read. `locate` stays first and the clone is
the fallback. Nothing is built yet. This record exists so the owner settles the
open choices below before code is written (osdlc/osdlc#844).

^summary

## Context

`Ports.locate(repo)` returns a local checkout or null. A standalone run's
`locate` is `() => null` (`src/defaults.ts`), so every `--repo` other than the
project root is reported `no local checkout — drift not measured`
(`src/survey.ts`) and `update` skips it. The update worktree is made at
`<checkout>/.pr-update/<run>` (`src/update.ts`), and file-store attempts live in
`<projectRoot>/.pr-update/attempts` (`src/update/attempts.ts`). Verified in code.

## Facts the choice rests on

- Drift reads `origin/<base>` and `origin/<head>` (`measure` in
  `src/survey.ts`, `remote` argument). A `git clone --mirror` has no
  `refs/remotes/origin/*`: it maps `refs/*` onto itself, so branches are
  `refs/heads/*`. Reading it as is would need a second ref layout in `measure`,
  `scopedRefspecs`, the executor's fetch and push, and the lease and attempt
  refs. Verified by reading the code; the mirror layout is standard git.
- `git worktree add` works from a bare repository. Inferred; to confirm in the
  build with a test.
- `unpushed_local` asks `git worktree list` for a checkout of the head. A bare
  clone this tool owns has none, so it is true by construction. Verified in code.
- `branch` mode reads the project-root checkout and does not apply to a managed
  clone (the issue says so).
- `attempts.store: git-ref` keeps records as refs on the remote, so it needs no
  project root. Verified (`ref-attempts.ts`).

## Prior art

| System | What it does | Verdict |
| --- | --- | --- |
| `attempts.store: git-ref` here | Moves state off the project root onto the remote | Adopt: it already works in this mode and needs nothing |
| `ports.locate` here | Host-owned resolution of a repo to a path | Adopt: stays first, the clone is its fallback |
| `git clone --mirror` (git docs) | Bare clone, refs mapped `refs/*` to `refs/*` | Reject as the layout: breaks the `origin/*` reads. Keep the bare, bounded-cost idea |
| Renovate's repository cache (renovatebot.com docs, inferred from memory, not re-read) | One managed clone per repository in a cache dir, fetched each run | Borrow: cache directory, fetch-or-clone on first use |

## Criteria

1. The engine's ref reads and pushes change in no place (smallest diff).
2. The run never touches a developer's working tree.
3. Standalone: needs no host registry, and works from a fresh machine.
4. The push keeps `--force-with-lease` against the head the run read.
5. Existing file-store users see no change.

## Options

- **A. Bare clone with the remote-tracking layout (recommended).** First use:
  `git clone --bare <url> <dir>`, then set
  `remote.origin.fetch=+refs/heads/*:refs/remotes/origin/*` and fetch with
  `--prune`. Cost: one setup step and a custom refspec. Forecloses nothing.
  Scores: 1 yes, 2 yes, 3 yes, 4 yes, 5 yes.
- **B. `git clone --mirror`, as the issue words it.** Cost: a second ref layout
  threaded through survey, executor, leases and tests. Forecloses a single code
  path. Scores: 1 no, 2 yes, 3 yes, 4 yes (needs new push refspecs), 5 yes.
- **C. Normal (non-bare) managed clone.** Cost: a working tree to keep clean and
  disk per repository. Forecloses the cheap worktree and the trivial
  `unpushed_local`. Scores: 1 yes, 2 yes, 3 yes, 4 yes, 5 yes, but heavier.

## Decision

Option A, once the owner confirms. B lost on criterion 1, C on cost and the
guard. Details to build:

- **Config and flag.** `pr_update.checkout: local | mirror` (default `local`),
  and `--mirror-dir <dir>` which implies `mirror`. `mirror` means local first,
  clone as fallback. A stricter "mirror only" value is not added until asked.
- **Location.** `--mirror-dir`, else `$XDG_CACHE_HOME/pr-update/repos`, else
  `~/.cache/pr-update/repos`; one `<owner>-<name>.git` each.
- **Clone URL.** The remote URL of the project-root checkout cannot serve other
  repositories. Use `gh repo clone <owner/name> <dir> -- --bare`, the
  authenticated path `gh` already provides (the tool requires `gh`).
- **Worktrees and attempts.** `.pr-update/<run>` goes inside the bare clone's
  directory. With `attempts.store: file` in this mode the store lives in the
  mirror directory, one per cache, keyed by repo in each record; `git-ref` is
  unchanged.
- **Where it plugs in.** `standalonePorts` gets a `locate` that returns the
  clone path (clone or fetch on demand) when the mode is on. `branch` mode skips
  mirror targets.

## Consequences

Touches `src/defaults.ts` (`locate`), `src/config.ts` (the key),
`src/commands.ts` (flag, seam), `src/update.ts` (worktree and attempts root),
`README.md`. About 250 non-test lines. Does not supersede D-0001..D-0004.

## What would reopen it

A host where `gh repo clone` cannot authenticate; evidence that
`git worktree add` from a bare clone misbehaves with this tool's submodule
handling; or an owner need for a literal `--mirror` push of all refs.

## Open questions for the owner

1. Option A over the issue's literal `--mirror`?
2. Clone through `gh repo clone`, or a URL from config?
3. File attempts store in the mirror directory, or require `git-ref` in this mode?
4. Is a "mirror only" value wanted now?
