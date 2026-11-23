# D-ZVIA: Settings osdlc tools share live in `@osdlc/ecosystem`

Accepted 2026-11-23. The name `@osdlc/ecosystem` stands for now (owner,
2026-11-23). The file rules are in [machine-files.md](../../standards/machine-files.md).

## Context

More than one tool needs to know where a person's checkouts are. sdlc merges
a `repos:` list from its machine file with one from the project's
`sdlc.yaml`, and matches each checkout's `origin`. pr-update needs the same
answer for a `--repo` that is not the project root
([D-0005](../../packages/ts/pr-update/docs/planning/decisions/D-0005-managed-bare-mirror-checkout.md)).
A list per tool means one list to keep up per tool, and the lists drift.

## Options

| Option                                                                | Cost                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A list in each tool's own machine file                                | One list per tool, kept in step by hand                                |
| A package per shared concern                                          | Many small packages. This repository already publishes about 50        |
| One `osdlc/config.yaml` in the config home with a section per concern | Every tool parses every section, and one bad section can hide the rest |
| **One package, one file per concern (chosen)**                        | One package versions every concern together                            |

## Decision

- **Two kinds of package.**

  | Kind                                                         | Examples                                                 | Rule                                                                                           |
  | ------------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
  | Building block: a general library, useful outside osdlc      | `typed-git`, `tiered-dirs`, `config-layers`, `file-lock` | One package each, as today                                                                     |
  | Ecosystem convention: a fact or rule every osdlc tool shares | Where checkouts live                                     | All in `@osdlc/ecosystem`. A new concern is a new module and subpath export, not a new package |

- **The package owns the family's own files.** Each sits directly in the
  osdlc config home (`~/.config/osdlc/` on Linux and macOS when no
  variable is set), resolved as
  [machine-files.md](../../standards/machine-files.md#where-files-go) says.
  One file per concern, so a tool reads only what it needs. A tool's own
  files stay in `osdlc/<tool>/`.
- **The first file is `repositories.yaml`.**

  ```yaml
  # <osdlc config home>/repositories.yaml (default ~/.config/osdlc/ on Linux and macOS)
  roots:
    - ~/dev/repos
  ```

  | Case                                  | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
  | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | An absolute path, or one starting `~` | A root. `~` is expanded                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
  | A relative path                       | Dropped, with a warning naming the file                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
  | A root that does not exist            | Skipped silently: the file may list another machine's directories                                                                                                                                                                                                                                                                                                                                                                                                                             |
  | `roots: []`                           | Scan nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | No file, or no `roots`                | The directory that holds the caller's main checkout, or the one above it when that directory is named after the owner in the caller's own `origin` (in any case, as remote matching compares owners), so an `<owner>/<name>` layout resolves to the directory above every owner. It never steps to or above the person's home directory: a checkout directly in `$HOME` keeps `$HOME`, and a checkout that is `$HOME` itself gives no default root. Nothing when the caller names no checkout |

- **The package locates checkouts; `typed-git` does the git work.** The
  split follows the two kinds of package above:

  | Part                                                                                                                                                                               | Home                                                                                                                                               | Why                                                           |
  | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
  | Scanning a directory for checkouts (`discoverCheckouts`), finding a worktree's main checkout (`Git#mainCheckout`), parsing a remote URL (`parseRemoteRepo`)                        | `@osdlc/typed-git`, as today                                                                                                                       | General git facts                                             |
  | Reading a remote with its SSH host alias resolved through `ssh -G`, and deciding whether two remotes name one repository (owner and name in any case, the host when both name one) | `@osdlc/typed-git`, new. It moves from sdlc's `readRemote`, `sshAliasResolver` and `sameRepo`, and takes the `ssh` runner as an optional parameter | Any tool that reads git remotes needs it, inside osdlc or not |
  | Reading `roots`, the default roots and the home-directory stop, and `locateCheckout(owner/name)`                                                                                   | `@osdlc/ecosystem/repositories`, new                                                                                                               | osdlc policy                                                  |

  `locateCheckout` resolves each match to its main checkout and counts it
  once, since `discoverCheckouts` lists linked worktrees as checkouts. It
  returns every match, not only the first, so a caller can check each for
  unpushed work. It builds one index per call site, so a run with many
  targets scans once.

- **Machine-only.** A repository's config cannot set `roots`, so a cloned
  repository cannot point a tool at directories on a person's disk.
- **Reading and writing go through the package**, with config-layers'
  `machineConfigFile`: tool `osdlc`, file `repositories.yaml`, the
  Xdg-pinned `dirs` the standard gives, and `env: 'OSDLC_REPOSITORIES'`
  passed explicitly, since the default would be `OSDLC_MACHINE_CONFIG`.
  `machineConfigFile` uses that variable as given, so the package rejects a
  relative value itself. It writes with a compare-and-swap. A tool that asks the person where their
  checkouts are asks through the package, so every tool asks the same
  question.
- **Adoption.** pr-update reads it first (D-0005). sdlc is published outside
  the `@osdlc` scope and keeps its own directories. In a later change it reads
  `repositories.yaml` in place of its machine `repos:` (owner, 2026-11-21).
  Its project `repos:` and its `{paths}` names have no equivalent here, and
  stay sdlc's.

## Not decided yet

| Candidate                                                                           | Waits for                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| How new checkouts are laid out and cloned (sdlc's `checkout.layout` and `protocol`) | sdlc's adoption, which would move them here                              |
| A shared bare-clone cache at `standalone('osdlc').cache()`                          | A second tool that wants clones. pr-update keeps its cache until then    |
| The package's final name                                                            | The owner, later. "ecosystem" also names the markdown ecosystem (D-SM4K) |

## Consequences

- One package versions every shared concern together, so a breaking change
  to one bumps them all. Subpath exports keep what each tool imports small.
- It builds on existing libraries. `tiered-dirs` and `command-seam` need no
  change. `config-layers` needs none for family files. `typed-git` gains the
  remote matching above. The `app` option in `machineConfigFile`
  ([#1056](https://github.com/osdlc/osdlc/pull/1056)) is for tools' own
  files, not this package.
- sdlc's remote matching has two homes until sdlc imports it from
  `typed-git`.
- A test that spawns a tool's CLI follows the isolation rule in
  machine-files.md, or the child reads, and may write, the person's real files.

## Build notes

Built in [#1058](https://github.com/osdlc/osdlc/pull/1058) (the package) and
[#1055](https://github.com/osdlc/osdlc/pull/1055) (typed-git's remote
matching), within the pr-update omnibus
[#1016](https://github.com/osdlc/osdlc/pull/1016).

- **No tool asks where checkouts are yet.** So the package has no shared
  question. `repositoriesFile().writeRoots(roots, { etag })` is what such a
  question would write through, and the first tool that asks adds it here.
  pr-update's only question is whether to clone.
- **The scan is `scanForCheckouts`.** The table names `discoverCheckouts`.
  The package uses typed-git's `scanForCheckouts`, the same walk, which also
  reports `depthLimited`, the directories it left unopened at `maxDepth` (3
  by default), so a caller can say a checkout may be deeper.
- **One index per call site is `CheckoutLocator`.** One locator scans once
  for all its targets and gives the roots it searched and the file's path for
  messages. The `locateCheckout()` function scans on each call.
- **The ssh runner.** It is a parameter of `sshAliasResolver(runner?)`;
  `readRemote` takes a resolver. The default runner finds `ssh` on absolute
  `PATH` entries only.
- **What the scan trusts.** A directory counts only when git, run in it with
  `GIT_CEILING_DIRECTORIES` at its parent, says it is the top of a working
  tree, so a broken `.git` never answers with the repository around a root,
  such as a dotfiles repository at the home directory. Every git call the
  package makes unsets an inherited `GIT_DIR` and the other variables that
  pick a repository, so the answer is the same inside a git hook. The home
  stop compares real paths. The wrapper that does it, `withoutRepositoryVars`,
  is exported from `./repositories`, so a tool's own git calls in a checkout
  the locator found run the same way; pr-update's do.
- **The `.` entry holds the family's directories.** It exports
  `OSDLC_VENDOR_DIRS` and `osdlcDirs()`, pinned to the Xdg convention, where
  the Decision puts each concern in a subpath of its own. That keeps the
  rule: the directories are not a concern but where every concern's files
  go. `./repositories` and any later concern resolve their files through
  them, and a tool needs them without importing any concern.
- **Roots the table does not cover.** `~user/…` is not expanded: it is
  dropped with the relative-path warning, and `writeRoots` refuses it. A
  `roots` value that is not a list is reported with the file's path, and the
  default roots apply.
- **`OSDLC_REPOSITORIES` is read from `process.env`.** `machineConfigFile`
  reads its variable there and takes no environment, so the package's
  relative-path check reads the same place.
- **Not found yet:** a bare store with its worktrees beside it (`proj/.git`
  pointing at `proj/.bare`). The package README says so.
- **Not tested.** Machine-only: no project config reaches the package, so
  there is nothing for a repository to set `roots` through, and pr-update's
  project schema refuses unknown keys besides. The two kinds of package are
  a policy the build kept: each building-block change stayed in its own
  package.
- **Adoption.** pr-update reads `repositories.yaml` through the package.
  sdlc's change is in the release phase, after this build.

## What would reopen it

A shared concern whose readers need different release cadences, so that one
package's versions hold one of them back; or a family member that cannot
depend on the package.
