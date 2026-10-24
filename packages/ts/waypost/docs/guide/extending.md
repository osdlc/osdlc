---
title: Extending
sidebar:
  order: 8
description: Add your own tool with a ToolDef module.
---

waypost has no library API. You extend it with a module that exports tools.
A tool is a `ToolDef` from `@osdlc/system-model/detect`, the same shape the
built-ins use. Built-in tools have no privileges your own tool lacks.

`way guide extend` prints this contract from the installed binary.

## The `ToolDef` shape

A tool has an id, the binary it runs through, the files that show it is in
use, and the roles it plays:

- `runner`: lists runnable tasks. A tool with this role adds rows to the
  Tasks group.
- `packageManager`: installs dependencies. Feeds the Dependencies group.
- `toolManager`: installs and runs other tools at pinned versions, such as
  mise. Feeds the Tools group.
- `hookManager`: arms git hooks, such as lefthook. Feeds the Git hooks group.

`way providers` lists every registered tool with its roles, kind, binary,
whether the binary is on `PATH`, and whether it is built-in or custom.

## The runner role

```ts
interface RunnerRole {
  kind: 'parse' | 'exec'
  chain?: { label: string; hint: string }[]
  brand?: { icon?: string; color?: string }
  watch?: string[]
  collect(ctx, packages): Promise<{ status; tasks; diagnostics }>
  invoke?(task: Task, args: readonly string[]): string[]
}
```

- **`kind`** is a trust boundary. A `parse` runner reads files. An `exec`
  runner runs the repository's code to be read, so it is withheld until the
  repository is trusted. See [Trust and execution](trust.md).
- **`chain`** says what each position of the runner's `Task.path` means.
- **`watch`** lists file patterns that decide whether a stored answer still
  holds, for an exec runner whose tool reads files the runner never opens.
  See [The cache](cache.md).
- **`collect`** lists the tasks. It is called only when the tool was
  detected, with the packages where it was found.
- **`invoke`** binds a task's arguments the way the tool expects. The default
  appends them. A tool like `npm run` puts them after `--`. `invoke` must not
  change the binary: `way` refuses to run a task whose `invoke` does.

## Two rules for a runner

1. It never spawns a process directly. `ctx.runner(binary)` hands back an
   injected runner.
2. It never reads the filesystem for discovery. `ctx.files(pattern)` applies
   the caller's discovery mode, git-tracked files or a directory walk.

Everything a runner needs comes through the context: `root`,
`files(pattern)`, `readJson(path)`, `readText(path)`, `exists(path)`,
`which(binary)`, `runner(binary)`, `allowExec`, `discovery` and `signal`.

`which(binary)` is a `PATH` lookup that runs nothing, so it is safe when
`allowExec` is false. A parse runner may check `ctx.allowExec` and ask its
tool for a better answer, but must never spawn when `allowExec` is false.

## A complete module

```ts
import type { ToolDef } from '@osdlc/system-model/detect'

export const tools: ToolDef[] = [
  {
    id: 'acme',
    binary: 'acme',
    markers: [{ files: '/acme.json', tier: 'files' }],
    roles: {
      runner: {
        kind: 'parse',
        chain: [{ label: 'task', hint: 'the acme task to run' }],
        async collect(ctx) {
          const config = (await ctx.readJson('acme.json')) as { tasks?: string[] } | null
          const tasks = (config?.tasks ?? []).map((name) => ({
            id: `acme:${name}`,
            runner: 'acme',
            path: ['acme', name],
            argv: ['acme', 'run', name],
            cwd: '.',
            display: `acme run ${name}`,
            parameters: [],
            source: 'acme.json',
            origin: 'declared' as const,
            tags: [],
            persistent: { value: false, declared: false },
            executes: 'local' as const,
          }))
          return { status: 'ok', tasks, diagnostics: [] }
        },
      },
    },
  },
]
```

The module exports `tools`, an array, or a default export that is an array
or has a `tools` property. Node loads it, so write JavaScript, or TypeScript
on a Node that strips types. A tool whose id matches a built-in is an error.

## Loading a module

There are three places to name a module:

- **This run only**: `way --config ./acme-tools.js`. The flag is repeatable.
  `way providers --config ./acme-tools.js` shows what it registers.
- **Always**: the `tools` key in your user config file.

  ```sh
  way config set tools '["./acme-tools.js"]' --user
  ```

- **One repository**: `tools` in the project's `waypost.config.json`. These
  load only once the repository is trusted, because a tool module is code.
  Until then `way` prints a warning and skips them.

A relative path in a config file resolves against the file that names it. A
`--config` path resolves against the working directory.
