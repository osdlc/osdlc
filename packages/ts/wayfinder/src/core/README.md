# The session core

One run of wayfinder over one repository is a `Session`. The CLI, the
terminal UI and the web view's server all start one and call it, so they
read the same catalog, filter it the same way, grant trust the same way and
run a task with the same argument rules.

| Module | Holds | Browser-safe |
|---|---|---|
| `session.ts` | `createSession`, `Session`, `SessionError`, `resolveRun` | no |
| `run.ts` | `handOff`: give the terminal to a task and wait for it | no |
| `filter.ts` | `filterTasks`, `keepsTask`, `sourceDepth`, `TaskFilter` | yes |
| `unknowns.ts` | `unknownsOf`, `unknownLine`, `Unknown` | yes |
| `../vocabulary.ts` | every label a person reads: `TASK_NOUN`, `runnerLabel`, `withheldLabel`, `parametersUnknownLabel`, `staleLabel` and the rest | yes |
| `../app.ts` | the names: `APP` (`wayfinder`) and `BIN` (`way`) | yes |

## The session

```ts
const session = await createSession({ dir, cwd, env, home, flags, signal })
```

`createSession` checks that `dir` exists, finds the root, loads config,
decides execution against the trust store and loads tool modules. It throws
`SessionError` with a `code`: `no-such-directory`, `config` or
`tool-module`.

| Call | Does |
|---|---|
| `session.catalog()` | probes every runner and stores the result. `cache[].probeMs` is each runner's measured time |
| `session.catalog({ cached: true })` | reads the store and probes only the runners missing from it. `origin` says which happened |
| `session.search(catalog, filter)` | `filterTasks` over the catalog, best first with a query |
| `session.unknowns(snapshot)` | what could not be read, each with its `label` |
| `session.trustable()` | whether a grant would change this session's execution |
| `session.grantTrust()` | writes the grant, turns execution on for this session and drops the withheld hint. Probe again after it. Throws `not-trustable` when trust is not what withholds execution |
| `session.revokeTrust()` | removes the grant. This session's execution stays as it is |
| `session.settings()` | every setting and its source (from `readSettings`, the reader `way config` uses), the effective `allowExec`, the gate's reason and trust |
| `session.resolveRun(catalog, id, args)` | the `RunPlan` (`argv`, `env`, `cwd`) for a task id, or a `command line` only one task has. Throws `task-not-found`, `not-runnable` (an editor variable) or `bad-arguments` |

`session.options` is the collect options object. A grant and a saved
setting change it in place, so a probe always uses the current ones.
`session.pinnedByFlag` names the options a flag set, which a saved setting
must leave alone.

## How a surface uses it

- The CLI: each command in `src/commands/` calls `openSession` (in
  `commands/shared.ts`), which maps the global flags onto `createSession` and
  turns a `SessionError` into a `CommandError`.
- The terminal UI: `runTui(session)` in `src/tui/` takes the `Session` and
  calls `catalog`, `search`, `grantTrust`, `revokeTrust`, `settings` and
  `resolveRun`. A run hands off with `handOff(plan)` after the terminal is
  released.
- The web view's server: today `commands/browse.ts` passes it the session's
  parts (`project`, `root`, `options`, `runnerOrder()`, `env`, `home`).
- The page: `filterTasks`, `unknownsOf`, `unknownLine` and the vocabulary
  module are browser-safe, so the page imports them directly.
  `tests/web-bundle.test.ts` fails if the page's bundle imports a Node
  built-in.

## Adding a command

1. Write `src/commands/<name>.ts` with `kit.command({ ... })` from
   `commands/shared.ts`. A data command declares `output` as a Zod object
   from `src/documents.ts` and a `kind`; `run` returns the output and `text`
   renders it. An interactive one says `interactive: true`.
2. Call `openSession(globals, ctx, home)` for a session. Notes go to stderr
   through `ctx.note`; nothing writes stdout but `text`.
3. Mount it in `createWayApp` in `commands/index.ts`. The complete help
   shows every command the tree mounts.
4. For a new document, add its Zod output to `documents.ts` and its kind to
   `DOCUMENT_SCHEMAS` in `schema.ts`. `tests/commands.test.ts` checks the
   exported schema is the one `way schema` prints.

## Shared commands

`config`, `trust`, `guide` and `clean` are `@osdlc/cli-tool`'s shared
commands over wayfinder's stores (`config-command.ts`, `trust-command.ts`,
`guide.ts`, `clean-command.ts`), mounted in `createWayApp` like the rest.
`dev` parses its own arguments, so `main` in `src/cli.ts` runs it before the
tree, and help does not list it.
