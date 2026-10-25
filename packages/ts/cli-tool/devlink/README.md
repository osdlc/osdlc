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
installed one should follow one linked checkout from anywhere on the machine,
optionally run the checkout you are standing in, and go back to
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
| env | `<NAME>_HOME` names a checkout by absolute path | never. An explicit value always applies; a relative one is ignored |
| cwd | the spec sets `cwdLayer: true` and the cwd is inside a checkout of this tool | the spec leaves `cwdLayer` unset, a suppressor is set, or `<NAME>_CWD_DEV=0` |
| link | `<config>/<name>/home` names a checkout | a suppressor is set |
| local | none of the above | never |

The cwd layer is off unless the spec turns it on. With it on, running the tool
in any directory that passes the checkout test runs that directory's code. A
marker such as `src/cli.ts` is in many projects, so a cloned repository could
pick the code. Turn it on only with a marker no other project has, and set
`packageName` too.

A checkout is a directory that has the marker file. When the spec sets
`packageName`, its `package.json` must also have that `name`.

A layer naming a directory that is no longer a checkout is skipped, not an
error. Deleting a linked checkout must not break the installed tool. A layer
naming the launcher's own checkout resolves to `local`, so a link to the
installed checkout never re-execs itself.

A suppressor is an environment variable whose presence turns off the cwd and
link layers. A tool that a host program runs names the host's root
variable, so a machine-wide link never silently changes which code the host
runs.

`<config>` is the per-OS config home of the tool's standalone tier
([`@osdlc/tiered-dirs`](https://www.npmjs.com/package/@osdlc/tiered-dirs)):
`~/Library/Application Support` on macOS, `${XDG_CONFIG_HOME:-~/.config}`
elsewhere. A relative `HOME` counts as unset there and in the bash launcher,
and the account's home is used, so a link file under the cwd is never read.
The spec's `vendorDirs` (`{ vendor, envVars }`) names the override
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
  packageName: '@example/tooly', // optional: package.json name a checkout must have
  cwdLayer: false,        // optional: true runs a checkout above the cwd
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
code. Otherwise it spawns `bun --no-env-file --config=<null device> run
<entry>` with inherited stdio and returns its exit code. This is the one place
the package spawns. The child is the program the user invoked. The two flags
keep Bun from reading `.env*` and `bunfig.toml` in the cwd, which is often a
repository the user does not control: a `.env` would set the tool's
environment, and a `bunfig.toml` `preload` would run that repository's code
first. The bash launcher passes the same flags. A checkout's own
`bunfig.toml` is not read either.

A bash launcher is for a tool whose canonical install is a compiled binary or
built JavaScript, so the choice must be made before any runtime exists.
`renderLauncher(spec)` writes the same layer checks in bash. It throws for a
spec that sets `packageName`, because bash cannot read JSON reliably; use a
JavaScript shim for such a tool. So a bash-launcher tool that turns the cwd
layer on has only its marker to tell its checkout from another project, and
the marker must be unique. The bash launcher reads a drive path such as
`C:/x` in `<NAME>_HOME` as absolute only under Git Bash, MSYS or Cygwin, as
`resolve()` does only on Windows. The tool commits the result, and `launcherDrift(spec, checkout)` in its test suite
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
- Windows launchers. The bash template is Unix only. The JavaScript shim
  works anywhere bun does.

## Development

```sh
pnpm test
pnpm run typecheck
```
