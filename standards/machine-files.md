# Machine files of osdlc tools

Status: draft.

## Summary

- osdlc tools share one root in each home: `osdlc`. Under the Xdg layout,
  config is in `~/.config/osdlc/`, the cache in `~/.cache/osdlc/`, state in
  `~/.local/state/osdlc/`.
- Each tool owns one directory there, named after the tool, in every home:
  `~/.config/osdlc/pr-update/`.
- Files directly in the root belong to the whole family. One package,
  `@osdlc/ecosystem`, owns them ([D-ZVIA](../docs/decisions/D-ZVIA-osdlc-ecosystem-package.md)).
- Machine files hold machine facts. A repository's config never sets a path
  on a person's disk.

## Where files go

Paths come from `@osdlc/tiered-dirs`, never from hand-built paths.

| File                                       | Path                                                             | Owner              |
| ------------------------------------------ | ---------------------------------------------------------------- | ------------------ |
| A tool's config                            | `standalone('osdlc').config().app('<tool>')`, then `config.yaml` | The tool           |
| A tool's cache, state, logs                | The same `.app('<tool>')` in that home                           | The tool           |
| A family file, such as `repositories.yaml` | `standalone('osdlc').config()`, then the file                    | `@osdlc/ecosystem` |

A tool published outside the `@osdlc` npm scope keeps its own root
(`standalone('<tool>')`) and may read the family files.

## Rules

| Rule                                                                                                                                                   | Why                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| A tool writes only in its own directories                                                                                                              | Two tools never race over one file                                              |
| A family file is read and written through `@osdlc/ecosystem`                                                                                           | Every tool parses it, and asks the person for it, the same way                  |
| A family file holds one concern and only facts more than one tool uses                                                                                 | A tool reads only what it needs, and a tool's own setting stays in its own file |
| A tool's relocation variables are named after the tool (`PR_UPDATE_MACHINE_CONFIG`). A family file's are named after the family (`OSDLC_REPOSITORIES`) | A variable named after the family would move every tool's file at once          |
| `OSDLC_ROOT` moves the whole family root. A test that moves a tool's root moves the family root too                                                    | Otherwise the test reads the person's real family files                         |
| A per-tool store, such as trust markers, is keyed by the tool, never by the family                                                                     | Consent given to one tool must not cover another                                |
| A category of files moves whole: every old file is moved before any is read, a tool never reads both places, and the release notes name the move       | Half a move leaves two answers to one question                                  |
| Files are YAML with the `.yaml` extension                                                                                                              | One spelling to look for                                                        |

## Where this comes from

It narrows the development repository's `S-0011-application-state-locations`
standard, whose "open family" rule lets a family of general tools share a
root, to the osdlc family.
