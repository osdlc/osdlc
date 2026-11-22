# D-ZVIA: Settings osdlc tools share live in `@osdlc/ecosystem`

Proposed 2026-11-22. The name is provisional (owner, 2026-11-22). The file
rules are in [machine-files.md](../../standards/machine-files.md).

## Context

More than one tool needs to know where a person's checkouts are. sdlc reads
a `repos:` list from its machine file and matches each checkout's `origin`.
pr-update needs the same answer for a `--repo` that is not the project root
([D-0005](../../packages/ts/pr-update/docs/planning/decisions/D-0005-managed-bare-mirror-checkout.md)).
A list per tool means one list to keep up per tool, and the lists drift.

A package per shared concern would solve that, at the cost of many small
packages. This repository already publishes about 50.

## Decision

- **Two kinds of package.**

  | Kind                                                         | Examples                                                 | Rule                                                                                           |
  | ------------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
  | Building block: a general library, useful outside osdlc      | `typed-git`, `tiered-dirs`, `config-layers`, `file-lock` | One package each, as today                                                                     |
  | Ecosystem convention: a fact or rule every osdlc tool shares | Where checkouts live                                     | All in `@osdlc/ecosystem`. A new concern is a new module and subpath export, not a new package |

- **The package owns the family's own files.** Each file sits directly in
  the osdlc config home, `standalone('osdlc').config()`, which is
  `~/.config/osdlc/` on Linux. One file per concern, so a tool reads only
  what it needs. A tool's own files stay in `osdlc/<tool>/`.
- **The first file is `repositories.yaml`.**

  ```yaml
  # ~/.config/osdlc/repositories.yaml
  roots:
    - ~/dev/repos
  ```

  `roots` lists directories that hold checkouts. `~` is expanded. A relative
  path is an error. A root that does not exist is skipped silently, since the
  file may list directories from another machine. With no file, or no
  `roots`, the roots are the directory that holds the caller's project
  checkout, when the caller names one.

- **The package matches checkouts.** `@osdlc/ecosystem/repositories` exports
  the loader and `locateCheckout(owner/name)`, which returns the first
  checkout under the roots whose `origin` names that repository. The
  matching moves here from sdlc's `locateRepo`: owner and name in any case,
  the host when both sides name one, an SSH host alias resolved through
  `ssh -G`. The filesystem scan stays in `@osdlc/typed-git`
  (`discoverCheckouts`), because it is a general building block.
- **Machine-only.** A repository's config cannot set `roots`, so a cloned
  repository cannot point a tool at directories on a person's disk.
- **Relocation.** `OSDLC_REPOSITORIES` moves the file. `OSDLC_ROOT` moves the
  whole family root, through tiered-dirs.
- **Writing goes through the package.** It is read and written with
  config-layers' `machineConfigFile` (tool `osdlc`, file `repositories.yaml`),
  which already places a file directly in that home. A tool that asks the
  person where their checkouts are asks through the package, so every tool
  asks the same question.
- **Adoption.** pr-update reads it first (D-0005). sdlc keeps its own
  `repos:` for now and moves onto this file with the rest of its machine
  file, a later change (owner, 2026-11-21).

## Not decided yet

| Candidate                                                                   | Waits for                                                             |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| How new checkouts are laid out (`{owner}/{name}`) and cloned (SSH or HTTPS) | The first osdlc tool that makes a working checkout                    |
| A shared bare-clone cache at `standalone('osdlc').cache()`                  | A second tool that wants clones. pr-update keeps its cache until then |
| The package's final name                                                    | The owner                                                             |

## Consequences

- One package versions every shared concern together, so a breaking change
  to one bumps them all. Subpath exports keep what each tool imports small.
- Dependencies: `typed-git`, `config-layers`, `tiered-dirs`, `command-seam`.
- sdlc's matching code gets a second home until sdlc imports it from here.
- A tool's tests that move its own root (`PR_UPDATE_ROOT`) must also move the
  family root (`OSDLC_ROOT`), or they read a person's real
  `repositories.yaml`. The package takes injected directories for that.
