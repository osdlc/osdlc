# @osdlc/host-cleaner

Machine cleanup as plugins. A plugin proposes **candidates** (things that could
be deleted) and **objects** to candidates. The core decides what runs, checks
again, and has each owner delete its own candidates, with one flat plan and one
receipt. The `git` plugin is [`@osdlc/repo-cleaner`](../repo-cleaner/README.md):
its sweep supplies worktrees and branches, and its `removeCandidate` deletes them,
under repo-cleaner's safety model.

This release is the library, the `git` plugin and the `host-cleaner` command.

## Phases

Plugins run in a fixed order: `git`, `cargo`, `node`, `claude-code`, `orca`, then
any other in the order given. The order decides which plugin keeps a duplicate id, and the order `prepare` and `deleted` run in.

| Phase | Who | What |
| --- | --- | --- |
| scope | each plugin | adds roots to look in; the only way a plugin adds a repository |
| discover | each plugin | proposes candidates; a duplicate id keeps the first plugin's, with a warning naming both |
| object | each plugin | objects to any candidate; sees no other plugin's objections |
| decide | core | `refuse` blocks, `protest` needs `--allow <code>`, `note` does not gate |
| re-check | core | discovers and objects again; a candidate now refused is `blocked`, a protest not granted `not-allowed`, a vanished one `gone`, one whose evidence moved `changed` |
| prepare | every plugin | before the delete; a throw stops only that candidate, a `FatalRun` stops the run |
| delete | the owner | returns the receipt sentence |
| deleted | every other plugin | after the delete; best effort, failures are in the receipt |

A candidate's `requires` lists the candidates that must go first. If one is
refused, dropped or fails, the candidate is too; requirements are deleted
before their dependents (a branch after the worktree that holds it).

```ts
import { clean, plan, survey, type Ctx, type Plugin } from '@osdlc/host-cleaner'

// A plugin that owns one candidate: a cache directory idle for a week.
const cache: Plugin = {
  name: 'cache',
  detect: () => true,
  discover: () => [
    {
      id: 'artifact:build-cache',
      kind: 'artifact',
      path: 'build-cache',
      owner: 'cache',
      why: 'idle for a week',
      evidence: { bytes: 4096 },
    },
  ],
  delete: (c) => `removed ${c.path}`,
}

const ctx: Ctx = { cwd: process.cwd(), targets: [], allow: [] }
const found = survey([cache], ctx) // scope, discover, object
const receipt = clean(plan(found), [cache], ctx) // re-check, prepare, delete, deleted
```

Without a `pick`, a plan runs every candidate nothing objects to. With one, it
runs the named candidates, each judged by the rules above.

## The `git` plugin

`gitPlugin(options)` proposes repo-cleaner's worktrees and branches. Its
blockers are `refuse` objections and its risks `protest`s, so
`--allow abandon-unmerged` and the others work as in repo-cleaner. A branch
freed by a worktree requires it. With `archive`, unlanded work is pushed to the
remote first; a failed push throws `FatalRun`. Grant the named risks; the
`discard-archived` cover is not yet offered here.

## Command line

```sh
host-cleaner [target...]   # the report; deletes nothing
host-cleaner plan -o plan.json
host-cleaner clean [--plan plan.json] [--pick <id>] [--allow <code>] [--yes | --dry-run]
```

`--plugin <name>` runs only those plugins (`--adapter` is an alias) and
`--skip-plugin <name>` never runs these. Targets default to the config file's
`targets`, then the directory you are in. `clean` re-checks, shows the steps,
asks (`--yes` skips the question; with no terminal and no `--yes` it exits 2),
deletes, and writes one receipt to `--receipt` or the state directory's
`receipts/`, plus a line in `logs/host-cleaner.log`.

The config is `config.json` in the config directory (`HOST_CLEANER_ROOT` moves
all three directories):

```json
{ "targets": ["~/dev"], "plugins": { "git": {} } }
```

`plugins.<name>` holds that plugin's settings; a name that no plugin has is an
error.

Exit codes: 0 done, declined or nothing to delete; 1 failed against the state
found; 2 cannot run as typed; 10 nothing to sweep; 11 `clean` stopped at a
failed step.

## Install

```sh
npm install @osdlc/host-cleaner
```

Node 22.22.2 or later, ESM only.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
