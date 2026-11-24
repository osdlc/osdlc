# D-H3QW: host-cleaner is a flat plugin model; repo-cleaner becomes its `git` plugin

Accepted 2026-11-19. Supersedes the adapter model in
[D-L7N5](D-L7N5-host-cleaner.md); everything in D-L7N5 about repo-cleaner's
own gaps, the `ProcessProbe`, the one safety model, the unattended subset and
launchd scheduling still holds. The proposal and the owner's twelve answers
are in the review page
[host-cleaner-plugins](../parley/host-cleaner-plugins.html) (source
[host-cleaner-plugins.json](../parley/host-cleaner-plugins.json)).

## Decision

host-cleaner is a set of **plugins**, `git` among them, run through phases
in a fixed order:

scope, discover, object, decide, re-check, prepare, delete, deleted.

Plugins add roots (scope), propose candidates (discover), and object to
candidates (object). The core decides, re-checks, calls each owner's
`prepare`, then `delete`, then tells the other plugins what went (`deleted`).
There is one flat plan and one receipt. There are no `annotate` or
`removeWorktree` chains and no takeover.

| Question         | Choice                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| q-adopt          | Adopt the plugin model; the two-layer hook design goes.                                                                                 |
| q-git-plugin     | repo-cleaner is the `git` plugin through a library API (`candidatesOf`, `removeCandidate`); it keeps its CLI and safety model.         |
| q-scope          | A scope phase: plugins add roots, then discover runs with them. Scope is the only place a plugin adds a repository.                     |
| q-levels         | Objection levels are `refuse`, `protest` and a non-gating `note`; no `info`.                                                            |
| q-dupes          | First come: plugin order is fixed, git first; a duplicate candidate id is dropped and reported as a warning naming both plugins.        |
| q-prepare-fail   | A `prepare` failure stops only that candidate's delete; a `FatalRun` error stops the whole run. The git archive push throws `FatalRun`. |
| q-veto           | No veto in `prepare`; objections belong to `object`, and a throw in `prepare` is a failure.                                             |
| q-deleted-mode   | `deleted` is synchronous and best effort; failures go in the receipt. No event log.                                                     |
| q-orca-forget    | Verify first: if `orca worktree rm` on the removed path works, orca uses it in `deleted`. Spike still to do.                            |
| q-relations      | Owners declare `requires`; the core refuses a candidate whose requirement is refused and deletes dependents first.                      |
| q-rewrite-timing | Rewrite the stack (PRs 943 to 948) to the plugin model now, before merging; keep the parts that survive.                                |
| q-supersede      | Close the four superseded questions in the older review; rename "adapter" to "plugin".                                                  |

### Flag names

The proposal said `--plugin` and `--no-plugin`. cli-tool rejects list flags
named `no-*`, which is why the code uses `--skip-adapter` (`cli.ts` on
`sksizer/issue-666-scheduled-run`; `options.ts` there carries it as
`noAdapter`). So the flags are `--plugin` and `--skip-plugin`, and config is
`plugins.<name>`. `--adapter` may stay as an alias; nothing is merged yet.

### Where the code and D-L7N5 differed

The five differences listed in
[the architecture page](../architecture/host-cleaner.md#where-the-code-and-the-decision-record-differ),
settled here:

| Topic                  | Settled                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter run order      | Moot: rows have no run order. Plugin order is fixed, `git` first, then the built-ins in a stated order; it decides only duplicates (q-dupes).                                   |
| Selection flags        | `--plugin` and `--skip-plugin`, as above. The code's `--skip-adapter` was right and D-L7N5's `--no-adapter` was not possible.                                                    |
| Contract hooks         | Moot: the five-hook adapter contract is replaced. The "hook before the sweep" D-L7N5 awaited is the scope phase (q-scope).                                                      |
| `--auto` threshold     | The code's `>=` stands: an artifact idle for at least the threshold is eligible. D-L7N5's "longer than" is corrected.                                                            |
| `discard-archived`     | Archive-before-delete and the risk are repo-cleaner's, on `main` (PR 941); the stack's branch predates them and picks them up when it is rewritten. `--auto` still never grants it. |

## Open

- The Orca forget spike: does `orca worktree rm` forget a record whose
  directory git already removed, and does `orca worktree list` show a record
  with no directory? If not, the model may need a takeover and this decision
  reopens (q-adopt condition).

## Consequences

- PR 943 and the contract files are rewritten; the CLI, artifact layer, auto
  run and schedule carry over. repo-cleaner gains `candidatesOf` and
  `removeCandidate`, and loses `removeWorktree` and `HostBlocker` from its
  plan.
- [host-cleaner-design](../parley/host-cleaner-design.html) has four
  questions closed as superseded: q-order, q-discover, q-orca-discover and
  q-split-943.
- [The architecture page](../architecture/host-cleaner.md) describes the
  stack as built until it is rewritten with the code.

## Reopen if

The Orca spike shows a plugin must take over a deletion, or a plugin needs to
change how another plugin's candidate is classified rather than object to it.
