# D-ZVIA: Settings osdlc tools share live in `@osdlc/ecosystem`

Proposed 2026-11-22. The name is provisional (owner, 2026-11-22). The file
rules are in [machine-files.md](../../standards/machine-files.md).

## Context

More than one tool needs to know where a person's checkouts are. sdlc merges
a `repos:` list from its machine file with one from the project's
`sdlc.yaml`, and matches each checkout's `origin`. pr-update needs the same
answer for a `--repo` that is not the project root
([D-0005](../../packages/ts/pr-update/docs/planning/decisions/D-0005-managed-bare-mirror-checkout.md)).
A list per tool means one list to keep up per tool, and the lists drift.

## Options

| Option                                                       | Cost                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| A list in each tool's own machine file                       | One list per tool, kept in step by hand                                |
| A package per shared concern                                 | Many small packages. This repository already publishes about 50        |
| One `~/.config/osdlc/config.yaml` with a section per concern | Every tool parses every section, and one bad section can hide the rest |
| **One package, one file per concern (chosen)**               | One package versions every concern together                            |

## Decision

- **Two kinds of package.**

  | Kind                                                         | Examples                                                 | Rule                                                                                           |
  | ------------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
  | Building block: a general library, useful outside osdlc      | `typed-git`, `tiered-dirs`, `config-layers`, `file-lock` | One package each, as today                                                                     |
  | Ecosystem convention: a fact or rule every osdlc tool shares | Where checkouts live                                     | All in `@osdlc/ecosystem`. A new concern is a new module and subpath export, not a new package |

- **The package owns the family's own files.** Each sits directly in the
  osdlc config home: `standalone('osdlc').config()` with `envVars('OSDLC')`,
  pinned to the Xdg convention, which is `~/.config/osdlc/` on Linux and
  macOS. One file per concern, so a tool reads only what it needs. A tool's
  own files stay in `osdlc/<tool>/`.
- **The first file is `repositories.yaml`.**

  ```yaml
  # ~/.config/osdlc/repositories.yaml
  roots:
    - ~/dev/repos
  ```

  | Case                                  | Meaning                                                                                                                                                                              |
  | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | An absolute path, or one starting `~` | A root. `~` is expanded                                                                                                                                                              |
  | A relative path                       | Dropped, with a warning naming the file                                                                                                                                              |
  | A root that does not exist            | Skipped silently: the file may list another machine's directories                                                                                                                    |
  | `roots: []`                           | Scan nothing                                                                                                                                                                         |
  | No file, or no `roots`                | The directory that holds the caller's main checkout, or the one above it when that directory is named after the wanted repository's owner. Nothing when the caller names no checkout |

- **The package matches checkouts.** `@osdlc/ecosystem/repositories` exports
  the loader and `locateCheckout(owner/name)`. The matching moves here from
  sdlc's `locateRepo`: owner and name in any case, the host when both sides
  name one, an SSH host alias resolved through `ssh -G`. It also:
  - resolves each match to its main checkout and counts it once, since
    `discoverCheckouts` lists linked worktrees as checkouts;
  - returns every match, not only the first, so a caller can check each for
    unpushed work;
  - builds one index per call site, so a run with many targets scans once.

  The filesystem scan stays in `@osdlc/typed-git` (`discoverCheckouts`),
  because it is a general building block.

- **Machine-only.** A repository's config cannot set `roots`, so a cloned
  repository cannot point a tool at directories on a person's disk.
- **Relocation.** `OSDLC_REPOSITORIES` moves the file. The package passes it
  to `machineConfigFile` explicitly, since the default would be
  `OSDLC_MACHINE_CONFIG`. `OSDLC_ROOT` moves the whole family root.
- **Writing goes through the package.** It reads and writes with
  config-layers' `machineConfigFile` (tool `osdlc`, file
  `repositories.yaml`), which places a file directly in that home and writes
  with a compare-and-swap. A tool that asks the person where their checkouts
  are asks through the package, so every tool asks the same question.
- **Adoption.** pr-update reads it first (D-0005). sdlc is published outside
  the `@osdlc` scope and keeps `~/.config/sdlc/`. In a later change it reads
  `repositories.yaml` in place of its machine `repos:` (owner, 2026-11-21).
  Its project `repos:` and its `{paths}` names have no equivalent here, and
  stay sdlc's.

## Not decided yet

| Candidate                                                                           | Waits for                                                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| How new checkouts are laid out and cloned (sdlc's `checkout.layout` and `protocol`) | sdlc's adoption, which would move them here                           |
| A shared bare-clone cache at `standalone('osdlc').cache()`                          | A second tool that wants clones. pr-update keeps its cache until then |
| The package's final name                                                            | The owner. "ecosystem" also names the markdown ecosystem (D-SM4K)     |

## Consequences

- One package versions every shared concern together, so a breaking change
  to one bumps them all. Subpath exports keep what each tool imports small.
- Dependencies: `typed-git`, `config-layers`, `tiered-dirs`, `command-seam`.
- sdlc's matching code has two homes until sdlc imports it from here.
- Inside a test runner, an unset `OSDLC_ROOT` already resolves to
  tiered-dirs' per-process test root. A test that spawns a tool's CLI as a
  child process does not get that, and reads the person's real
  `repositories.yaml` unless it sets `OSDLC_ROOT` or injects directories.

## What would reopen it

A shared concern whose readers need different release cadences, so that one
package's versions hold one of them back; or a family member that cannot
depend on the package.
