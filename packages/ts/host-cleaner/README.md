# @osdlc/host-cleaner

Machine cleanup over [`@osdlc/repo-cleaner`](../repo-cleaner/README.md). It
runs repo-cleaner's sweep, plan, check and run, and lets detected **adapters**
add what git cannot know: rows of their own (build caches, agent sessions) and
verdicts on repo-cleaner's rows (a worktree a terminal app still holds). One
plan, one re-check and one receipt cover both kinds of row, under
repo-cleaner's safety model.

With no adapter detected, the result is repo-cleaner's, row for row.

The `host-cleaner` command ships two adapters, `cargo` and `node`, for build
caches (see [Build artifacts](#build-artifacts)). Each further integration is its
own package change.

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

## Build artifacts

Two adapters reclaim directories nothing is using. Their rows are kind
`artifact`, id `artifact:<absolute path>`, with `evidence.kind`
(`cargo-target`, `cargo-incremental` or `node-modules`), `path`, `checkout`,
`sizeBytes`, `idleHours` (rounded down), `newestMtimeMs` and `unattended`.
`unattended` is true for a `delete` row idle past the threshold, which marks it
for a scheduled run. The evidence is the fingerprint, so a plan older than an
hour moves `idleHours` and is dropped as `changed` at `clean`.

| | `cargo` | `node` |
| --- | --- | --- |
| Detected | `cargo --version` runs, or a swept checkout has `Cargo.toml` | a swept checkout has `package.json` |
| Candidates | `target/` holding a `CACHEDIR.TAG`, in every checkout and worktree | `node_modules` in a linked worktree; the primary checkout's never |
| Idle time | newest file under `target/*/.fingerprint/` | newest file outside `node_modules`, `.git` and `target` |
| `delete` when | idle for the threshold | idle for the threshold |
| Also | `target/*/incremental`, `delete` at any idle time, when `CARGO_BUILD_INCREMENTAL` or `cargo config get build.incremental` says off; not when the whole `target/` is a row | a `.pnpm` tree is noted: mostly hard links, so less is freed than measured |
| `blocked` while | a `cargo` or `rustc` process works in the checkout | any process but an idle shell works in the worktree |

The threshold is 24 hours; `config.json` sets it per adapter:
`{ "adapters": { "cargo": { "idleHours": 48 }, "node": { "idleHours": 12 } } }`.

Every path is resolved through [`@osdlc/path-guard`](../path-guard/README.md)
against its checkout before anything is measured or removed; one that leads
outside is a `blocked` row with no size, and is never removed. `clean` reads
the adapter's rows again, removes the directory with `fs.rm`, checks it is gone
and records `removed <path>; freed <bytes> bytes` in the receipt. A row inside a
worktree the same run removed is dropped as `gone`.

## The approval

`hostCheck(plan, approval)` takes repo-cleaner's `{ pick, spare, allow }`. A
host row is named by its exact id. Anything else in `pick` or `spare` is a
repo-cleaner row. A risk repo-cleaner knows (`abandon-unmerged`,
`discard-changes`, `confirm-open-pr`) is granted to its rows, and any other
risk to host rows. As in repo-cleaner, without a pick only `delete` rows run,
and naming rows of one kind leaves the other alone.

A row is dropped, with a reason, when it is `gone`, `blocked`, has no action
(`keep`), is not `delete` and not picked (`needs-pick`), is `changed`, is
`not-allowed`, or is `spared`.

`hostRun` takes repo-cleaner's steps first, then each host step through its
adapter, and stops at the first failure. The receipt holds repo-cleaner's
receipt under `repo` and the host steps and drops under `host`, and is
rewritten after every step.

## Command line

```sh
host-cleaner [target...]   # the report; deletes nothing
host-cleaner plan          # save the rows and their evidence, to run later
host-cleaner clean         # check again, show the steps, ask, delete
```

The options are repo-cleaner's (`--only`, `--format`, `--pick`, `--spare`,
`--allow`, `--plan`, `--yes`, `--dry-run`, `--receipt`), less its remote-branch
and URL-target options, plus `--adapter <names>` to run only those adapters and
`--skip-adapter <names>` to never run them. Every command takes `--help`. The
exit codes are repo-cleaner's: 10 for nothing to sweep, 11 for a failed step.

The bin runs `cargoAdapter` and `nodeAdapter`; a program that calls `main` from
`src/cli.ts` passes its own list.

Files live in the `host-cleaner` tier of `@osdlc/tiered-dirs`, moved by the
`HOST_CLEANER_*` variables (`HOST_CLEANER_ROOT` moves all of them):

| Directory | Holds |
| --- | --- |
| config | `config.json`: `targets` (swept when none is named) and `adapters` (settings by adapter name, read through `HostContext.config`); `--config <file>` reads another |
| state | `receipts/`: a receipt for each `clean` run without `--receipt` |
| logs | `host-cleaner.log`: one JSON line per `clean` that ran |

## Install

```sh
npm install @osdlc/host-cleaner
```

Node 22.22.2 or later, ESM only.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
