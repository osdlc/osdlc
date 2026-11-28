# Machine files of osdlc tools

Status: draft.

## Summary

This standard is for authors of tools in the osdlc family: the CLIs published
under the `@osdlc` npm scope.

- osdlc tools share one root in each home: `osdlc`. Paths in this standard
  are the Linux and macOS defaults, with no variable set: config in
  `~/.config/osdlc/`, the cache in `~/.cache/osdlc/`, state in
  `~/.local/state/osdlc/`. Variables move them, and Windows uses its own
  places ([Where files go](#where-files-go)).
- Each tool owns one directory there, named after the tool, in every home,
  such as `~/.config/osdlc/pr-update/`.
- Files directly in the root belong to the whole family. One package,
  `@osdlc/ecosystem`, owns them ([D-ZVIA](../docs/decisions/D-ZVIA-osdlc-ecosystem-package.md)).
- Machine files hold machine facts. A repository's config never sets a path
  on a person's disk.

## Where files go

Every path comes from `@osdlc/tiered-dirs`, through config-layers'
`systemDirs`: `standalone('osdlc')` with
`envVars('OSDLC')`, pinned to the Xdg convention with `conventionFromEnv:
false`, so that one file has one path whichever program reads it and
`OSDLC_CONVENTION` moves none of them. tiered-dirs resolves under `native`
by default, so the pin is never left out. No path is built by hand.

The pin picks tiered-dirs' table, and the table still depends on the
platform. Each base home is the first of these that is set: its own
variable, such as `OSDLC_CONFIG_DIR`; `OSDLC_ROOT`, with `config/`,
`cache/` and `state/` under it; then the table. The `osdlc` directory goes
under the base home in every case, so on Linux and macOS
`OSDLC_CONFIG_DIR=/c` puts config in `/c/osdlc` and `OSDLC_ROOT=/r` puts it
in `/r/config/osdlc`. A relative `OSDLC_ROOT` or `OSDLC_<HOME>_DIR` throws;
Windows needs a drive letter or a UNC path.

| Home   | Linux, and macOS under the pin                       | Windows                                                               |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------- |
| config | `$XDG_CONFIG_HOME/osdlc`, else `~/.config/osdlc`     | `%APPDATA%\osdlc`, else `<home>\AppData\Roaming\osdlc`                |
| cache  | `$XDG_CACHE_HOME/osdlc`, else `~/.cache/osdlc`       | `%LOCALAPPDATA%\osdlc`, else `<home>\AppData\Local\osdlc`             |
| state  | `$XDG_STATE_HOME/osdlc`, else `~/.local/state/osdlc` | `%LOCALAPPDATA%\state\osdlc`, else `<home>\AppData\Local\state\osdlc` |

Without the pin, macOS would put config and state in
`~/Library/Application Support/osdlc` and the cache in
`~/Library/Caches/osdlc`. A relative `XDG_*` value is ignored, as the XDG
spec says. Windows reads no `XDG_*` variable, and `<home>` there is
`USERPROFILE`.

```ts
import { envVars, machineConfigFile, systemDirs } from '@osdlc/config-layers'

const vendorDirs = { vendor: 'osdlc', envVars: envVars('OSDLC') }
const dirs = () => systemDirs(vendorDirs, { convention: 'xdg', conventionFromEnv: false })

// A tool's machine file, with config-layers today:
const file = machineConfigFile({
  tool: 'osdlc',
  fileName: '<tool>/config.yaml',
  env: '<TOOL>_MACHINE_CONFIG',
  vendorDirs,
  dirs,
  schema,
})
```

The `tool` option sets both the directory and the default variable, so the
variable is always passed. `machineConfigFile` uses the variable's value as
given, so the tool checks that it is absolute and fails before reading the
file (the rule for file-level variables below). The
nested `fileName` is not validated; an `app` option in config-layers is
planned to replace it.

| File                                       | Path                                                             | Owner              |
| ------------------------------------------ | ---------------------------------------------------------------- | ------------------ |
| A tool's config                            | `standalone('osdlc').config().app('<tool>')`, then `config.yaml` | The tool           |
| A tool's cache, state, logs                | The same `.app('<tool>')` in that home                           | The tool           |
| A family file, such as `repositories.yaml` | `standalone('osdlc').config()`, then the file                    | `@osdlc/ecosystem` |

A tool published outside the `@osdlc` npm scope keeps its own root
(`standalone('<tool>')`) and may read the family files through
`@osdlc/ecosystem`.

Tools written before this standard keep their own roots:

| Files                                 | Where today                                                                                                                                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| devlink's files                       | `standalone('<name>')`, where `<name>` is the spec's `name` (the installed command), with the spec's `vendorDirs`, pinned to Xdg, and moved by those variables (`<P>_CONFIG_DIR`, `<P>_ROOT`). `<NAME>_HOME` is not a location: it names the checkout whose code runs |
| repo-cleaner, workstation-cleaner            | `standalone('<tool>')` with `envVars('<TOOL>')`, not pinned: they resolve under `native` (`~/Library/...` on macOS) and read `<TOOL>_CONVENTION`. The pin comes with their move. workstation-cleaner's config is `config.json`                                               |
| wayfinder                             | `standalone('wayfinder')`, pinned to Xdg. Its config is `config.json` with a `WAYFINDER_CONFIG` override, its `@osdlc/trust-repo` store is in its state home, and its devlink state is `standalone('way')`, moved by the same `WAYFINDER_*` variables                 |
| pr-update's `@osdlc/trust-repo` store | `$XDG_STATE_HOME/pr-update/trusted/`, else `~/.local/state/pr-update/trusted/`, on every platform, built by hand (osdlc/osdlc#1010)                                                                                                                                   |

Each category moves under the rule below for moves, one at a time.

## Rules

| Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Why                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A tool writes only in its own directories. A family file is read and written only through `@osdlc/ecosystem`, which writes with a compare-and-swap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Two tools never race over one file, and every tool parses it and asks the person for it the same way                                                                               |
| A family file holds one concern and only facts more than one tool uses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | A tool reads only what it needs, and a tool's own setting stays in its own file                                                                                                    |
| Names directly under the root are reserved for family files and directories. No tool is named after one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A tool's directory never collides with a family entry                                                                                                                              |
| A file-level relocation variable is named after the file's owner: `PR_UPDATE_MACHINE_CONFIG` for a tool's file, `OSDLC_REPOSITORIES` for a family file. Its value must be absolute, and the file's owner rejects a relative one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | A variable named after the family would move every tool's file at once, and a relative value would point tools started in different directories at different files                 |
| `OSDLC_ROOT` moves the family root in every home, and `OSDLC_<HOME>_DIR` in one home. A test that spawns a tool sets `OSDLC_ROOT` and, for a tool whose files have not all moved under it, that tool's `<TOOL>_ROOT`. For pr-update, whose `@osdlc/trust-repo` store reads neither root, it also sets `XDG_STATE_HOME` inside its root (osdlc/osdlc#1010). It clears, or points into its root, every other variable that moves a file the tool reads: the per-home ones (the rest of `overrideVars(envVars('OSDLC'))`, and `<TOOL>_<HOME>_DIR` for a tool not yet moved) and the file-level ones (`OSDLC_REPOSITORIES`, `<TOOL>_MACHINE_CONFIG`, `WAYFINDER_CONFIG`). It clears devlink's `<NAME>_HOME` (`WAY_HOME` for wayfinder) and never sets it, since that variable picks the code the child runs | A per-home or file-level variable wins over the root, and a tool or store not yet moved still reads its own place, so any of them would point the child at the person's real files |
| A per-tool store, such as trust markers, is keyed by the tool, never by the family                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Consent given to one tool must not cover another                                                                                                                                   |
| Data a person needs back, such as kept work or history, goes in state, never in cache                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Anything under cache may be deleted whole, at any moment                                                                                                                           |
| File names stay apart across homes that share one directory (under Xdg, state and logs; on Windows, durable and config)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Two homes can resolve to one directory                                                                                                                                             |
| A category of files moves whole: every old file is moved before any is read, a tool never reads both places, and the release notes name the move                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Half a move leaves two answers to one question                                                                                                                                     |
| Config files are YAML with the `.yaml` extension. An older tool's `config.json` (wayfinder, workstation-cleaner) is converted as part of its move                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | One spelling to look for                                                                                                                                                           |

## Where this comes from

It applies the development repository's `S-0011-application-state-locations`
standard, whose "open family" rule lets a family of general tools share a
root, to the osdlc family. Family files at the root are new here.
