# @osdlc/host-cleaner

Machine cleanup over [`@osdlc/repo-cleaner`](../repo-cleaner/README.md). It
runs repo-cleaner's sweep, plan, check and run, and lets detected **adapters**
add what git cannot know: rows of their own (build caches, agent sessions) and
verdicts on repo-cleaner's rows (a worktree a terminal app still holds). One
plan, one re-check and one receipt cover both kinds of row, under
repo-cleaner's safety model.

With no adapter detected, the result is repo-cleaner's, row for row.

This release is the library and the adapter contract. It ships no adapter; each
integration is its own package change. There is no command line yet.

```ts
import { hostSweep, hostPlan, hostCheck, hostRun, type HostAdapter } from '@osdlc/host-cleaner'

// An adapter that owns one row: a cache directory idle for a week.
const cache: HostAdapter = {
  name: 'cache',
  detect: () => true,
  gather: () => [
    {
      id: 'artifact:build-cache',
      adapter: 'cache',
      kind: 'artifact',
      name: 'build-cache',
      verdict: 'delete',
      action: 'remove',
      why: 'idle for a week',
      risks: [],
      blockers: [],
      commands: ['rm -r build-cache'],
      notes: [],
      evidence: { bytes: 4096 },
    },
  ],
  execute: (step) => `removed ${step.row.name}`,
}

const opts = { adapters: [cache] }
const swept = hostSweep([process.cwd()], opts)
const preview = hostCheck(hostPlan(swept), { pick: ['artifact:build-cache'] }, opts)
const receipt = hostRun(preview, { ...opts, receiptPath: 'receipt.json' })
```

## Adapters

An adapter is an object with a `name` and a `detect(ctx)`, and any of these
hooks. It is skipped, and the report says so, when `detect` returns false or
throws.

| Hook | What it does |
| --- | --- |
| `annotate(repo, rows)` | Re-rank repo-cleaner's rows with what the host knows. Chained, in run order, into the sweep and into every re-check, so its verdicts survive them |
| `gather(ctx)` | The rows this host owns. Read again at every re-check |
| `execute(step, ctx)` | Run one approved step for a row the adapter owns and verify it. Returns the sentence the receipt records; throws on failure |
| `removeWorktree(row, { repo, force })` | Remove a worktree the host manages in place of `git worktree remove`; return null for one it does not. repo-cleaner's process and force checks run before it and its directory and registration checks after |

`HostContext` carries the git runner, a `command(binary)` runner for every
other shell-out, the repo-cleaner `ProcessProbe`, a clock, the machine config
(`config.adapters[name]`), the targets and the `@osdlc/detect-harness` catalog
when the caller passes one.

### Rows

A host row has repo-cleaner's fields (`verdict`, `action`, `why`, `risks`,
`blockers`, `commands`, `notes`, `evidence`) with a kind the adapter names. Its
id is `<kind>:<name>`, and its kind must not be `worktree`, `branch` or
`remote`. `evidence` is the fingerprint: a re-check that reads different
evidence drops the row as `changed`, and the two are compared with
repo-cleaner's `sameFingerprint`.

## The approval

`hostCheck(plan, approval)` takes `{ pick, spare, allow }`. `pick` is the
exact list of rows to work on, as repo-cleaner's `select` is: the repo rows in
it go to repo-cleaner as its `select`. A host row is named by its exact id.
Anything else in `pick` or `spare` is a repo-cleaner row. A risk repo-cleaner
knows (`abandon-unmerged`, `discard-changes`, `confirm-open-pr`) is granted to
its rows, and any other risk to host rows. As in repo-cleaner, without a pick
only `delete` rows run, and naming rows of one kind leaves the other alone.

A row is dropped, with a reason, when it is `gone`, `blocked`, has no action
(`keep`), is not `delete` and not picked (`needs-pick`), is `changed`, is
`not-allowed`, or is `spared`.

`hostRun` takes repo-cleaner's steps first, then each host step through its
adapter, and stops at the first failure. The receipt holds repo-cleaner's
receipt under `repo` and the host steps and drops under `host`, and is
rewritten after every step.

## Install

```sh
npm install @osdlc/host-cleaner
```

Node 22.22.2 or later, ESM only.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
