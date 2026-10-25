# `@osdlc/cli-tool/devlink`

Run a system-installed CLI tool from a development checkout, and keep a
history of which checkouts have been linked.

```sh
tooly dev install            # once: put a shim for this checkout's launcher onto PATH
tooly dev link               # this checkout is now the one every `tooly` runs
tooly dev history            # every checkout ever linked, most recent first
tooly dev use #2             # back to an earlier one …
tooly dev use canonical      # … or to the install itself
tooly dev status             # which checkout runs now, and why
```

`tooly` here is any tool that mounts this package under its `dev` noun.

## Why

A CLI you develop is also a CLI you use, and the two need different code. The
installed one should run the source in your current directory without a link
step, follow one linked checkout from anywhere on the machine, and go back to
the published install with one verb. Every tool that ships as an installable
binary builds this again, with a `HOME` override in one tool and a config file
in another. None of them remembers where it pointed last week.

This package implements it once: a spec the tool declares, a resolution
order, a state directory, and a history.

## Resolution order

Four layers. The first that matches wins. `<NAME>` is the tool name upper-cased
(`tooly` → `TOOLY`, `pr-updater` → `PR_UPDATER`).

| Layer | Wins when | Off when |
|---|---|---|
| env | `<NAME>_HOME` names a checkout | never. An explicit value always applies |
| cwd | the cwd is inside a checkout of this tool | a suppressor is set, or `<NAME>_CWD_DEV=0` |
| link | `<config>/<name>/home` names a checkout | a suppressor is set |
| local | none of the above | never |

A layer naming a directory that is no longer a checkout is skipped, not an
error. Deleting a linked checkout must not break the installed tool. A layer
naming the launcher's own checkout resolves to `local`, so a link to the
installed checkout never re-execs itself.

A suppressor is an environment variable whose presence turns off the cwd and
link layers. A tool that a host program runs names the host's root
variable, so a machine-wide link never silently changes which code the host
runs.

`<config>` is the config home of the tool's standalone tier under the `xdg`
convention ([`@osdlc/tiered-dirs`](https://www.npmjs.com/package/@osdlc/tiered-dirs)):
`${XDG_CONFIG_HOME:-~/.config}` on Linux and macOS. The spec's `vendorDirs` (`{ vendor, envVars }`) names the override
variables that move it. Two files live under `<config>/<name>/`:

| File | Holds | Read by |
|---|---|---|
| `home` | the active link: one absolute path, or absent | the launcher, with `cat` |
| `history.jsonl` | every `link` / `use` / `off` event, append-only | `history`, `use #n` |

The `home` file is a bare path rather than JSON because a bash launcher reads
it before any runtime exists.

## The spec

```ts
import { envVars } from '@osdlc/cli-tool'
import { validateSpec, type ToolSpec } from '@osdlc/cli-tool/devlink'

export const SPEC: ToolSpec = validateSpec({
  name: 'tooly',          // the command; the state segment; the env stem
  marker: 'bin/tooly.js', // exists in every checkout of this tool, nowhere else
  entry: 'src/cli.ts',    // what a selected checkout runs under bun (default: marker)
  launcher: 'bin/tooly.js', // what the PATH shim from `install` runs
  aliases: ['ty'],         // extra PATH names
  suppressors: [],        // env vars whose presence turns off cwd + link
  vendorDirs: { vendor: 'com.example', envVars: envVars('EXAMPLE') }, // where state lives
})
```

## Two launcher shapes

A launcher is the file on PATH. It decides which checkout runs. Where it can
make that decision depends on what the canonical install is.

A JavaScript shim (the tool's npm `bin`) calls `resolve` and hands off:

```ts
#!/usr/bin/env bun
import { execSelection, resolve } from '@osdlc/cli-tool/devlink'
import { main } from '../src/cli.ts'
import { SPEC, checkoutRoot } from '../src/devlink.ts'

const argv = process.argv.slice(2)
const handedOff = execSelection(SPEC, resolve(SPEC, { self: checkoutRoot() }), argv)
process.exitCode = handedOff ?? (await main(argv))
```

`execSelection` returns `null` for a `local` selection, meaning run your own
code. Otherwise it spawns `bun run <entry>` with inherited stdio and returns
its exit code. This is the one place the package spawns. The child is the
program the user invoked.

A bash launcher is for a tool whose canonical install is a compiled binary or
built JavaScript, so the choice must be made before any runtime exists.
`renderLauncher(spec)` writes the same four-layer check in bash. The tool
commits the result, and `launcherDrift(spec, checkout)` in its test suite
fails when the committed file no longer matches the rendered one. Pass
`{ builtEntry }` to prefer a built file under Node. A dev checkout of the
tool itself (`node_modules` present, `bun` on PATH) still runs its own
source, so a committed built entry never hides the code being edited.

The package's launcher test drives the rendered script through every layer with
a fake `bun` on PATH and asserts it picks what `resolve()` picks.

## The verbs

Mount them with `runDevCli(spec, argv, { self })`, which gives a
`<tool> dev <verb>` command with no framework. Or call the functions in
`src/devlink/ops.ts` from your own CLI framework.

| Verb | Effect |
|---|---|
| `install [--bin-dir DIR]` | write a shim for the launcher into `DIR` (default `${XDG_BIN_HOME:-$HOME/.local/bin}`) as the name and each alias. The shim is a small `sh` file, not a symlink: when its checkout is deleted it says so and exits 1. Idempotent; replaces a symlink or an older shim; refuses any other file; warns when `DIR` is not on PATH |
| `link [PATH] [--label L]` | write `PATH` (default: the checkout above the cwd, else `self`) as the link, and record it |
| `use <#N \| PATH \| canonical>` | switch to history entry `N` (1 = most recent), a path, or clear the link; recorded |
| `off` | clear the link; recorded when one was set |
| `status` | the winning layer and every layer's state, `--json` for the full shape |
| `history` | one row per checkout ever linked, most recent first, with branch and HEAD at link time, `*` for active, `missing` when deleted |

Every verb takes `--dry-run` (compute, write nothing) and `--json`.

Branch and HEAD are read from `.git` directly (a plain repo or a worktree's
`gitdir:` file), never by spawning git. Anything unreadable is `null`.

## What is not here

- A standalone `devlink` binary. The spec belongs to the tool, so a generic
  command would have nothing to act on.
- Version pinning or installation. This links checkouts. It does not fetch
  them. The canonical install is whatever `npm i -g` or a compiled binary put
  on PATH.
- Windows launchers. The bash template and the shims are Unix only, so
  `runDevCli` on Windows prints that `<tool> dev` is not available there and
  exits 1. The JavaScript shim works anywhere bun does.

## Development

```sh
pnpm test
pnpm run typecheck
```
