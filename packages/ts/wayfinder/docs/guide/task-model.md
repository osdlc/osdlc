---
title: The task model and JSON
sidebar:
  order: 7
description: The Task and Catalog shapes that way list --json prints.
---

Every runner produces the same shape. A consumer that understands `Task` and
`Catalog` once understands every runner, without knowing anything about moon
or just. The types come from `@osdlc/system-model`.

`way guide json` prints the same field list from the installed binary.

## Vocabulary

- **Runner**: a tool that runs things, such as moon, just, cargo or make.
- **Task**: one runnable command a runner exposes, such as `moon run web:dev`.
- **Tool**: a `ToolDef` that detects one tool and declares the roles it plays.
  A tool with a runner role adds tasks. See [Extending](extending.md).

## `Task`

```ts
interface Task {
  id: string
  runner: string
  path: string[]
  argv: string[]
  cwd: string
  display: string
  parameters: Param[]
  source: string
  origin: 'declared' | 'synthesized'
  doc?: string
  detail?: string
  tags: string[]
  persistent: { value: boolean; declared: boolean }
  executes: 'local' | 'remote' | 'container'
}

interface Param {
  name: string
  required: boolean
  variadic: boolean
  default?: string
}
```

### `argv` and `display`

These are two different values. Never build one from the other.

- **`argv`** is executable. Spawn it directly, never through a shell. It
  carries no parameter placeholders. To add arguments, bind them the way the
  tool expects: `way` puts them after `--` for npm, cargo, moon and the like.
- **`display`** is for showing and copying. It may carry `<required>`,
  `[optional]` and `*variadic` markers, so it is not executable. A shell would
  read `<lib>` as a redirection and `*flags` as a glob.

### The other fields

- **`id`**: stable across a re-collect, so a UI can keep its selection.
- **`runner`**: the owning runner's id, also `path[0]`.
- **`path`**: the display and search chain, root first.
- **`cwd`**: the directory the command expects, relative to the catalog
  root. `"."` is the root.
- **`parameters`**: the task's parameters as data. Empty when there are none.
- **`source`**: the file that declares the task, relative to the root.
- **`origin`**: `"declared"` when a file declares the task. `"synthesized"`
  when it comes from a convention, such as `cargo test` for a crate or an
  install for a lockfile.
- **`doc`**: a summary, where the runner supplies one.
- **`detail`**: what the task runs, when that differs from `display`, such as
  a just recipe's body.
- **`tags`**: free-text facets for search and filtering.
- **`persistent`**: `value` says whether the task runs until stopped.
  `declared` separates the runner stating it from a guess based on the task
  name.
- **`executes`**: where the work happens when the task runs.

### `executes` is not `kind`

A runner's `kind` (`parse` or `exec`) says what wayfinder must do to read the
repository. A task's `executes` says what happens when the task runs. The two
are independent. A GitHub Actions workflow is read by parsing YAML, but runs
`remote`. A docker-compose service runs in a `container`. Most tasks are
`local`, but do not assume it.

## The catalog

`way list --json` prints a `Catalog` as a document: the catalog's fields plus
`schemaVersion`, `kind: "catalog"`, `cache`, `unknowns` and `filter`.
`way schema list` prints its JSON Schema, and `@osdlc/wayfinder/schema`
exports it as `catalogDocumentSchema`, with `documentZod('catalog')` to parse
one. `way query --json` is the `query` document: `root`, `filter`, `tasks`,
`cache` and `unknowns`.

```ts
interface Catalog {
  root: string
  generatedAt: string
  discovery: 'git' | 'walk'
  allowExec: boolean
  reports: RunnerReport[]
  groups: { id: string; title: string; runners: string[] }[]
}

interface RunnerReport {
  runner: string
  status: 'absent' | 'ok' | 'error'
  chain: { label: string; hint: string }[]
  tasks: Task[]
  diagnostics: { severity: string; message: string; source?: string }[]
  brand?: { icon?: string; color?: string }
  tool?: { binary: string; found: boolean; path?: string }
  skippedForExec: boolean
}
```

- **`root`**: the absolute path collection ran against. Every `cwd` and
  `source` is relative to it.
- **`generatedAt`**: when this collection ran. Under `--cached` it is the
  oldest contributing probe time.
- **`discovery`**: how files were found. `git` lists tracked and untracked,
  not ignored files. `walk` walks the tree.
- **`allowExec`**: whether runners were allowed to run subprocesses.
- **`reports`**: one entry per runner, grouped, then in configured order.
- **`groups`**: the non-empty groups in display order:
  - `tasks`: Tasks
  - `dependencies`: Dependencies (runner `package-manager`)
  - `tools`: Tools (runner `tool-manager`)
  - `hooks`: Git hooks (runner `hook-manager`)

In a `RunnerReport`:

- **`status`**: `"absent"` when the runner was not found, `"ok"` when it ran
  (possibly with zero tasks), `"error"` when it failed.
- **`chain`**: what each position of the runner's `Task.path` means.
- **`diagnostics`**: anything worth reporting that is not a task, such as a
  malformed config file.
- **`brand`**: an optional icon and colour.
- **`tool`**: whether the runner's binary is on `PATH`, from a lookup that
  runs nothing. Absent when the tool declares no binary, such as
  `node-scripts`, which picks npm, pnpm, yarn or bun per package. It is filled
  even when the runner was withheld or failed.
- **`skippedForExec`**: true when the runner was withheld because it needed
  to run its tool.

Over HTTP, `way serve` also adds `trustable`: whether a trust grant would
change this run's gate.

### The `cache` array

Every document carries a `cache` array, one entry per selected runner. The
web view's catalog carries it too.

```ts
interface RunnerCacheState {
  runner: string
  state: 'fresh' | 'stale' | 'miss'
  reason?: 'changed' | 'max-age' | 'excludes' | 'exec' | 'version' | 'tool'
  ageMs?: number
  estimateMs: number | null
  slow: boolean
  probeMs?: number
}
```

- **`state`**: `fresh`, `stale` (used, and out of date), or `miss` (nothing
  was stored, so it was probed now).
- **`reason`**: on a stale entry only.
- **`ageMs`**: how old the stored answer is. 0 after a fresh probe.
- **`estimateMs`**: the median re-probe cost measured in this repository, or
  `null` when never measured.
- **`slow`**: true when those measurements say the runner is slow here.

- **`probeMs`**: how long the probe took, when it ran in this call.

See [The cache](cache.md).

### The `unknowns` array

What could not be read, each with the `label` the stderr note prints:

```ts
type Unknown =
  | { kind: 'withheld'; runner: string; reason: 'untrusted' | 'exec-off'; label: string }
  | { kind: 'parameters'; runner: string; reason: string; tasks: string[]; label: string }
  | { kind: 'stale'; runner: string; reason?: string; ageMs?: number; label: string }
  | { kind: 'binary'; runner: string; binary: string; label: string }
```

`parameters` lists the ids of tasks whose parameters were not read, and why:
`exec-withheld`, `tool-missing`, `tool-failed`, `not-read` or
`editor-variable`.

### The `filter` object

The filters the command applied: `query`, `mode`, `servicesOnly`,
`declaredOnly` and `maxDepth`. Each is present only when set.

## Example

Trimmed:

```json
{
  "root": "/home/you/repo",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "discovery": "git",
  "allowExec": false,
  "reports": [
    {
      "runner": "just",
      "status": "ok",
      "chain": [{ "label": "recipe", "hint": "the recipe to run" }],
      "tasks": [
        {
          "id": "just:justfile:build",
          "runner": "just",
          "path": ["just", ".", "build"],
          "argv": ["just", "build"],
          "cwd": ".",
          "display": "just build <target>",
          "parameters": [{ "name": "target", "required": true, "variadic": false }],
          "source": "justfile",
          "origin": "declared",
          "doc": "build one crate",
          "tags": [],
          "persistent": { "value": false, "declared": false },
          "executes": "local"
        }
      ],
      "diagnostics": [],
      "tool": { "binary": "just", "found": true, "path": "/usr/bin/just" },
      "skippedForExec": false
    }
  ],
  "groups": [{ "id": "tasks", "title": "Tasks", "runners": ["just"] }]
}
```

`display` carries the `<target>` placeholder, while `argv` stops at
`["just", "build"]`. The parameter is data, not text glued onto the command.
