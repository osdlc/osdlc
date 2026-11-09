---
id: D-RSWP
type: decision
state: accepted
created: 2026-09-11
---

# D-RSWP: repo-cleaner is a standalone tool; a host adds what it knows through `annotate`

Accepted 2026-09-11 in sksizer/dev, where repo-cleaner began as part of
`sdlc project cleanup`. Moved here on 2026-11-07, after the package came over
in [#497](https://github.com/osdlc/osdlc/pull/497), and restated for 0.18.
The sdlc side of the decision, how `sdlc` picks repositories and links rows to
task files, stays with sdlc, in
[sksizer/dev's D-RSWP](https://github.com/sksizer/dev/blob/main/docs/planning/decisions/D-RSWP-standalone-repo-sweep-tool.md)
(a private repository).

## Decision

- **The sweep is its own package.** `@osdlc/repo-cleaner`, binary
  `repo-cleaner`, judges worktrees, local branches and remote branches on
  git evidence, the process table (whether anything runs in a worktree) and,
  with `--remote`, the code host's pull requests. Nothing else.
- **It reads no host configuration.** The library takes targets, and the
  CLI takes them as arguments. A host resolves its own list of repositories
  and passes paths in.
- **A bare invocation sweeps where the caller stands.** No target is the same
  as naming the current directory: at a checkout's root that sweeps its
  repository, and in a directory of checkouts it fans out over them. In a
  subdirectory that the checkout around it tracks, where the search finds no
  checkout, it sweeps that checkout
  ([#680](https://github.com/osdlc/osdlc/issues/680)).
- **A target is a path or a remote URL.** A checkout names that repository.
  Any other directory is searched for the checkouts under it. Linked
  worktrees collapse into their repository and appear as its rows. A remote
  URL that names no path on disk is cloned into a cache and swept for its
  remote branches only, in a run of its own: mixing URL and path targets is
  refused. A target that resolves to nothing is reported, not dropped.
- **A host re-ranks rows after classification.** `annotate(repo, rows)` may
  change a verdict, add a note or drop a row. It never reaches into
  classification, and the same hook runs in every re-check, so a run checks
  the rows the host planned from.
- **One unreadable repository never ends a fan-out.** It comes back with
  `error` set, and the sweep goes on.

## Why

Finding what has landed is not specific to any one product. The original
code depended on the host for only one function, the task linkage, so the
boundary was already drawn.

A git-derived `delete` rarely needs overruling, so a host usually only
sharpens rows the sweep left at `review` or `keep`. A `blocked` row has no
action to take, so re-ranking it changes nothing. When a host does
hold a `delete` back, the sweep keeps that worktree's branch too.
Post-processing does all of this with a smaller surface than a hook inside
classification.

## Options rejected

- **Leave the sweep inside the host product.** Cheapest, but the part most
  worth reusing has no host content in it.
- **A hook inside classification** that lets a host override a verdict as it
  is reached. Nothing needs it; `annotate` over the output is enough.
- **A configuration file of repositories to sweep.** Earlier versions read
  one. Targets on the command line, or from the host, are one list instead
  of two to keep in step.

## Consequences

- Rows carry typed evidence, filled as far as classification went (a row
  that returns early, such as the default branch, carries less), and `notes`
  is a list of sentences. A host composes its own sentence
  rather than parsing a joined string.
- Bad or contradictory input is refused with a `RepoCleanerError` carrying a
  `code`, so a host can tell "you asked for something contradictory" from
  "no such row". A repository that cannot be read is not an input error: a
  sweep returns it with `error` set, and a run that cannot re-read it throws
  a plain `Error`.

## Reopen if

A host needs to change a verdict mid-classification, for example to stop a
patch-equivalence check that is too slow on a repository it knows.
