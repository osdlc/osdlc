# The session core

One run of wayfinder over one repository is a `Session`. The CLI, the
terminal UI and the web view's server all start one and call it, so they
read the same catalog, filter it the same way, decide trust with the same
store and policy (`way trust` uses them too, without a session) and
run a task with the same argument rules.

| Module | Holds | Browser-safe |
|---|---|---|
| `session.ts` | `createSession`, `Session`, `SessionError`, `resolveRun` | no |
| `run.ts` | `handOff`: give the terminal to a task and wait for it | no |
| `filter.ts` | `filterTasks`, `keepsTask`, `sourceDepth`, `TaskFilter` | yes |
| `skills.ts` | `SkillRow`, `filterSkills`, `skillLine`: the Skills group | yes |
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
| `session.catalog()` | probes every runner and stores the result. `cache[].probeMs` is each runner's measured time. `skills` holds the agent skills the `skills` setting chooses |
| `session.catalog({ cached: true })` | reads the store and probes only the runners missing from it. `origin` says which happened |
| `session.storedCatalog()` | the store alone, probing nothing, or null when it has no answer. It still detects the project and hashes each runner's files |
| `session.savedCatalog()` | the catalog the last `catalog()` call showed, in any process, from one file (`saved-view.ts`), unchecked; null unless it was saved under the same `viewKey()`. The terminal UI and `serve` draw it first, and fall back to the store |
| `session.viewKey()` | what decides which rows a probe returns: trust, the collect options, the `skills` setting and the tools |
| `session.search(catalog, filter)` | `filterTasks` over the catalog, best first with a query |
| `session.searchSkills(skills, filter)` | the same for `snapshot.skills` |
| `session.unknowns(snapshot)` | what could not be read, each with its `label` |
| `session.trustable()` | whether a grant would change this session's execution |
| `session.grantTrust()` | writes the grant, turns execution on for this session and drops the withheld hint. Probe again after it. Throws `not-trustable` when trust is not what withholds execution |
| `session.grantTrust(scope)` | trusts one tool. A runner runs once its id and each wrapping tool manager are trusted; the next probe applies it |
| `session.revokeTrust(scope?)` | removes the grant, or one tool's. A whole-repository revoke leaves this session's execution as it is |
| `session.missingScopes(runner)` | the tool grants a runner still needs; a withheld unknown carries the same list as `missing` |
| `session.settings()` | every setting and its source as last read (by `readSettings`, the reader `way config` uses), the effective `allowExec`, the gate's reason and trust, each tool's `homepage`, `description` and `language` (`tools`), and the tools trusted on their own (`trustedTools`) |
| `session.reloadSettings()` | reads the config files again; the collect options and the `skills` setting follow, except where a flag decided |
| `session.saveSetting(key, value)` | writes one setting to the file `settingLayer` (in `../config-keys.ts`) picks, then reloads. `pinned` says a flag decides it for this session |
| `session.withheldReason()` | why withheld runners are withheld: `untrusted`, `exec-off`, or null |
| `session.runnerOrder()` | `runners.order` from the config as last read |
| `session.resolveRun(catalog, id, args)` | the `RunPlan` (`argv`, `env`, `cwd`) for a task id, or a line from `list` or a `display` only one task has. Throws `task-not-found`, `ambiguous-task` (two tasks share the id; the hint names each one's `list` line), `not-runnable` (an editor variable) or `bad-arguments` |

`session.options` is the collect options object. A grant, a saved setting
and a reload change it in place, so a probe always uses the current ones.
`session.pinnedByFlag` names the options a flag set, which a saved setting
leaves alone. `session.gate` is the execution decision, `session.project`
the tool registry, and `session.store` the directory probes are stored in.

## How a surface uses it

- The CLI: each command in `src/commands/` calls `openSession` (in
  `commands/shared.ts`), which maps the global flags onto `createSession` and
  turns a `SessionError` into a `CommandError`.
- The terminal UI: `runTui(session)` in `src/tui/` takes the `Session` and
  calls `savedCatalog`, `storedCatalog`, `catalog`, `search`, `grantTrust`, `revokeTrust`,
  `settings`, `reloadSettings`, `saveSetting` and `resolveRun`. A run hands
  off with `handOff(plan)` after the terminal is released.
- The web view's server (`src/serve/`) takes the `Session` and the command
  tree. The page calls commands over HTTP, so each request opens its own
  session, as a CLI run does. `list` shares one catalog between those
  requests (`serve/catalog-share.ts`): `--cached` gets the newest one the
  server holds, and a fresh read joins a probe already running, both only
  under the same `viewKey()`. Its settings screen saves with `config set`,
  to the file `settingLayer` picks, the rule `saveSetting` uses. A run resolves with `run --dry-run` and hands
  off with `handOff(plan)` after the server has stopped.
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
