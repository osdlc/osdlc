# Branch naming conventions

The SDLC flow uses three distinct branch-name prefixes. They are deliberately
distinct to prevent collisions across the task lifecycle.

## `task/<task-basename>`

**Created by:** `/sdlc:task-work` Step 4.
**Purpose:** holds the implementation of a task.
**PR target:** `main`.

Example: `task/2026-05-19-build-import-planning-skill`.

The basename matches the task file's name without the `.md` extension. This
namespace is reserved for `task-work`; do not use `task/<basename>` for
anything else, or you'll collide with a future `task-work` run that picks up
the same task.

The `task/` prefix is self-describing: the branch belongs to a task entity
and is mechanically created from one. Tooling like
`sdlc task inflight` filters by this prefix to decide which worktrees are
orchestrator-owned.

## `meta-task/<slug>`

**Created by:** `/sdlc:spawn-task-pr` (run by the
spawn-from-post-mortem procedure,
`lib/model/entities/task/spawn-from-post-mortem.md`).
**Purpose:** carries a single spawned follow-up task — a planning/draft
task file filed against the target repo because a `/sdlc:task-work`
post-mortem identified a friction bullet worth turning into its own
ticket.
**PR target:** `main` on the target repo (this repo for `Local`
classification, the resolved foreign repo for `Upstream-plugin` /
`Cross-project-request`).

Example: `meta-task/worktree-init-verifies-lefthook`.

The `meta-task/` prefix is deliberately distinct from `task/`:

- A `meta-task/<slug>` branch carries a *draft task spec* that the
  reviewer can accept or reject. It is not (yet) an implementation
  branch.
- A `task/<slug>` branch is created later, by `task-work`, when a
  human picks the spawned follow-up up to actually implement it.
  The two branches share the same `<slug>` segment by design — once
  the spawn PR merges, the next `task-work` run on that task creates
  `task/<slug>` to implement it; the long-since-merged
  `meta-task/<slug>` is out of the way.
- Tooling that filters in-flight task counts (e.g.
  `sdlc task inflight`) intentionally does NOT
  match `meta-task/<slug>` — a draft-task PR awaiting review is not
  an in-flight task and shouldn't count against the per-project
  in-flight cap.
- Each `meta-task/<slug>` PR is independent of the originating
  task's PR, which is the whole point: a reviewer can accept one
  follow-up, reject another, and the originating task's merge is
  not coupled to either decision.

## `docs/<task-basename>`

**Created by:** the author, ad hoc.
**Purpose:** ships a task **spec** in a PR before its implementation begins.
**PR target:** `main`.

Example: `docs/2026-05-19-build-import-planning-skill` (PR #14, which landed
the task spec before `task/2026-05-19-build-import-planning-skill` was created
by `task-work` to implement it).

The distinct prefix matters: a `task/<basename>` for the same basename will
later be created by `task-work`. If the spec PR also used `task/`, the two
branches would collide.

When to use:

- Authoring a task spec collaboratively in a PR before anyone runs `task-work`.
- Iterating on `## Approach` or ACs with reviewers before promoting to
  `state: ready`.

When NOT to use:

- The task spec is trivial. Just commit it on `main` directly (the
  `chore(tasks): start <basename>` commit `task-work` creates already lands
  the spec on main if it wasn't already).

## `chore/<short-slug>`

**Created by:** skills that do bulk work not tied to a single task
(`/sdlc:entities-migrate`, `/sdlc:import-planning`, `/sdlc:milestones-from-file`,
`/sdlc:capability-map`, `/sdlc:capability-review`).
**Purpose:** worktree+PR flow for batched edits the skill produces.
**PR target:** `main`.

Examples:

- `chore/entities-migrate-<timestamp>` (entities-migrate's runtime branch)
- `chore/import-planning-<stem>` (import-planning's runtime branch)
- `chore/milestones-from-<stem>` (milestones-from-file's runtime branch)
- `chore/capability-map-<stem>` (capability-map's runtime branch)
- `chore/capability-review-<stem>` (capability-review's runtime branch)

The basename comes from the skill's own state, NOT from a task basename, so
these branches do not collide with `task/` or `docs/` task branches.

When a skill that does bulk work needs a new branch flavour, prefer the
`chore/<skill-name>-<stem>` shape; the `chore/` prefix is the affordance that
keeps the namespace clear.

## `backlog-capture` (rolling, singular)

The rolling `backlog-capture` branch is managed programmatically by `sdlc
backlog create`, not created by hand — its behavior is documented in
[`solutions/ontological/cli/backlog_cli/README.md`](../cli/backlog_cli/README.md).

## Why this matters

Without this convention, two failure modes are common:

1. A spec-only PR uses `task/<basename>`; later, `task-work` for the same
   basename tries to create `task/<basename>` and fails (or, worse, gets
   silently sharing the spec branch's history).
2. A bulk-work skill picks a `task/`-shaped name; the next `task-work` run
   collides with it.

Picking the right prefix at branch-create time is the cheap fix.
