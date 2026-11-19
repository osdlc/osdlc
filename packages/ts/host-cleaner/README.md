# @osdlc/host-cleaner

Machine cleanup as plugins. A plugin proposes **candidates** (things that could
be deleted) and **objects** to candidates. The core decides what runs, checks
again, and has each owner delete its own candidates, with one flat plan and one
receipt. The `git` plugin is [`@osdlc/repo-cleaner`](../repo-cleaner/README.md):
its sweep supplies worktrees and branches, and its `removeCandidate` deletes them,
under repo-cleaner's safety model.

This release is the library and the `git` plugin. There is no command line yet.

## Phases

Plugins run in a fixed order: `git`, `cargo`, `node`, `claude-code`, `orca`, then
any other in the order given. The order decides only who keeps a duplicate id.

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
import { clean, gitPlugin, plan, survey, type Ctx } from '@osdlc/host-cleaner'

const ctx: Ctx = { cwd: process.cwd(), targets: [], allow: [] }
const plugins = [gitPlugin({ sweep: { remote: true } })]

const found = survey(plugins, ctx) // scope, discover, object
const receipt = clean(plan(found), plugins, ctx, { receiptPath: 'receipt.json' })
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

## Licence

MIT OR Apache-2.0.
