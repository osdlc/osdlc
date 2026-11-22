# Machine files of osdlc tools

Status: draft.

## Summary

This standard is for authors of tools in the osdlc family: the CLIs published
under the `@osdlc` npm scope.

- osdlc tools share one root in each home: `osdlc`. Config is in
  `~/.config/osdlc/`, the cache in `~/.cache/osdlc/`, state in
  `~/.local/state/osdlc/`.
- Each tool owns one directory there, named after the tool, in every home:
  `~/.config/osdlc/pr-update/`.
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

```ts
import { envVars, systemDirs } from "@osdlc/config-layers";

const dirs = () =>
  systemDirs(
    { vendor: "osdlc", envVars: envVars("OSDLC") },
    { convention: "xdg", conventionFromEnv: false },
  );
```

A tool's machine file, with config-layers today:
`machineConfigFile({ tool: 'osdlc', fileName: '<tool>/config.yaml', env:
'<TOOL>_MACHINE_CONFIG', dirs, … })`. The `tool` option sets both the
directory and the default variable, so the variable is always passed. The
nested `fileName` is not validated; an `app` option in config-layers is
planned to replace it.

| File                                       | Path                                                             | Owner              |
| ------------------------------------------ | ---------------------------------------------------------------- | ------------------ |
| A tool's config                            | `standalone('osdlc').config().app('<tool>')`, then `config.yaml` | The tool           |
| A tool's cache, state, logs                | The same `.app('<tool>')` in that home                           | The tool           |
| A family file, such as `repositories.yaml` | `standalone('osdlc').config()`, then the file                    | `@osdlc/ecosystem` |

A tool published outside the `@osdlc` npm scope keeps its own root
(`standalone('<tool>')`) and may read the family files.

Tools written before this standard still use `standalone('<tool>')` with
`envVars('<TOOL>')`: devlink's files, repo-cleaner and host-cleaner. Each
category moves under the rule below for moves, one at a time.

## Rules

| Rule                                                                                                                                                                                                                                                                                                                                                                  | Why                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A tool writes only in its own directories. A family file is read and written only through `@osdlc/ecosystem`, which writes with a compare-and-swap                                                                                                                                                                                                                    | Two tools never race over one file, and every tool parses it and asks the person for it the same way                                                    |
| A family file holds one concern and only facts more than one tool uses                                                                                                                                                                                                                                                                                                | A tool reads only what it needs, and a tool's own setting stays in its own file                                                                         |
| Names directly under the root are reserved for family files and directories. No tool is named after one                                                                                                                                                                                                                                                               | A tool's directory never collides with a family entry                                                                                                   |
| A file-level relocation variable is named after the file's owner: `PR_UPDATE_MACHINE_CONFIG` for a tool's file, `OSDLC_REPOSITORIES` for a family file                                                                                                                                                                                                                | A variable named after the family would move every tool's file at once                                                                                  |
| `OSDLC_ROOT` and `OSDLC_<HOME>_DIR` move the whole family root. A test that spawns a tool sets `OSDLC_ROOT` and, for a tool whose files have not all moved under it, that tool's `<TOOL>_ROOT`. It also clears, or points into its root, every file-level relocation variable the tool reads (`OSDLC_REPOSITORIES`, `<TOOL>_MACHINE_CONFIG`, devlink's `<TOOL>_HOME`) | A file-level variable wins over the root, and a tool not yet moved still reads its own root, so either would point the child at the person's real files |
| A per-tool store, such as trust markers, is keyed by the tool, never by the family                                                                                                                                                                                                                                                                                    | Consent given to one tool must not cover another                                                                                                        |
| Data a person needs back, such as kept work or history, goes in state, never in cache                                                                                                                                                                                                                                                                                 | Anything under cache may be deleted whole, at any moment                                                                                                |
| File names stay apart across homes that share one directory (under Xdg, state and logs; on Windows, durable and config)                                                                                                                                                                                                                                               | Two homes can resolve to one directory                                                                                                                  |
| A category of files moves whole: every old file is moved before any is read, a tool never reads both places, and the release notes name the move                                                                                                                                                                                                                      | Half a move leaves two answers to one question                                                                                                          |
| Config files are YAML with the `.yaml` extension                                                                                                                                                                                                                                                                                                                      | One spelling to look for                                                                                                                                |

## Where this comes from

It applies the development repository's `S-0011-application-state-locations`
standard, whose "open family" rule lets a family of general tools share a
root, to the osdlc family. Family files at the root are new here.
