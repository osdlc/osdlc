# @osdlc/pr-update

## 0.8.1

### Patch Changes

- da5e6a3: `remoteSlug` now reads a remote through `@osdlc/typed-git`'s `parseRemoteRepo`, the one remote parser typed-gh and code-host share, instead of its own composition of `parseGitUrl` and `parseRemoteUrl`. It answers the same for every remote.
- Updated dependencies [da5e6a3]
- Updated dependencies [da5e6a3]
- Updated dependencies [da5e6a3]
- Updated dependencies [da5e6a3]
  - @osdlc/agent-call@0.9.0
  - @osdlc/code-host@0.6.0
  - @osdlc/command-seam@0.14.0
  - @osdlc/typed-git@0.10.0
  - @osdlc/cli-tool@0.10.1
  - @osdlc/trust-repo@0.5.1

## 0.8.0

### Minor Changes

- b835ae4: Behaviour change: `--remote` (and the `remote` input) is now the remote measured against, not only the one fetched. Drift, conflict prediction and the unpushed-work guard read `<remote>/<branch>`; before, they always read `origin/*`. With the default `origin` nothing changes. The code host is still chosen from `origin`.
  A fork PR is no longer measured against a same-named branch of this remote, and is never taken as another PR's stack parent. A PR in a base/head cycle is now reported in `skipped` instead of disappearing. With `--repo`, each repository's PRs are updated in that repository's own checkout. A verify verb's untracked output left by one PR is no longer committed into the next PR's update.
  A rejected push is now classified from typed-git's per-ref `pushPorcelain` result, not by matching stderr. `isStalePush` takes typed-git's `PushRejection` instead of a stderr string. A stale lease, a non-fast-forward merge push and a ref another writer moved, deleted or created first still read as "moved since the run started; re-run". A ref clash (`<ref>` beside `<ref>/child`) and a `.lock` file in the way, both of which used to match `cannot lock ref` and be called a race, now report as a plain push failure, because re-running fails the same way. A git 2.53+ lease race (`incorrect old value provided`, `reference does not exist`) and `remote ref updated since checkout`, which used to be a plain failure, now read as a race. Any other rejection's reason now names git's reason and the remote's message, as `push <head>: rejected (<reason>: <message>)`, instead of stderr's first line.
  Behaviour change (stricter): the default `git` and `gh` runners (also the ones handed to the code host), and the preflight check that `git`, `gh` or `curl` is installed, use only absolute `PATH` entries. A relative or empty entry is skipped, so a binary the repository ships is never run or counted as the install.
  The standalone `runVerb` and the `repair.command` runner start `sh` only from an absolute PATH entry, as the git and gh runners do.
  Behaviour change: `pr-update config` and `pr-update trust` are now `@osdlc/cli-tool`'s shared `config` and `trust` commands, as in every tool built on it. `--json`/`--output json` work on them. Differences from before:
  `config` with no subcommand lists instead of printing help, and `config --help` is the shared help. `config path` is new.
  `--layer project|local` is replaced by `--project` and `--local`. `config get` no longer takes a layer (`config explain` shows each layer's value).
  `config set` reads a value as JSON, else as the bare string, instead of as YAML: a YAML flow list or map such as `[a, b]` must be written as JSON (`'["a","b"]'`), and `~` is the string `~`.
  `config get` prints the value as JSON (`"merge"`, not `merge`). `config list` prints `key  value  (source)` with the value as JSON, and the file locations on stderr.
  `config set` prints `<file>: <key> = <value>`, and with `--dry-run` `<file>: would set <key> = <value>`; the `updated`/`created`/`unchanged` wording is gone. `config unset` prints `<file>: removed <key>` (`would remove` with `--dry-run`).
  Exit code change: a `config set` or `unset` whose result would be invalid config (a bad value, `repair.agent` beside `repair.command`) exits 2 (usage) instead of 14. Only the result is validated, so a `set` or `unset` can still repair a file that is invalid now (as before). A layer file that does not parse as YAML, or a `PR_UPDATE_CONFIG` naming a missing file, still exits 14; `config path` lists the files even then, marking a missing one. An unknown key exits 2 for `get`, `set`, `unset` and `explain` (before, it was an unclassified error, exit 1).
  Exit code change: `config unset` of a key the file does not set exits 1 instead of 0.
  `config explain` shows each layer (default, project, local) with its value and which one won, from cli-tool's explain; the description, shape, category and nested-field lines are gone.
  `trust` prints `trusted <root>` / `already trusted <root>` (no colon), and gains `--show`, `--list` and `--untrust`.
  Error lines from `survey`, `update`, an unknown command and an invalid config file have terminal control characters removed.

### Patch Changes

- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [fdef74f]
  - @osdlc/agent-call@0.8.0
  - @osdlc/cli-tool@0.10.0
  - @osdlc/code-host@0.5.0
  - @osdlc/command-seam@0.13.0
  - @osdlc/config-layers@0.8.0
  - @osdlc/etag-write@0.3.0
  - @osdlc/trust-repo@0.5.0
  - @osdlc/typed-git@0.9.0

## 0.7.5

### Patch Changes

- Updated dependencies [9616994]
- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
- Updated dependencies [9616994]
  - @osdlc/cli-tool@0.9.0
  - @osdlc/command-seam@0.12.0
  - @osdlc/trust-repo@0.4.0
  - @osdlc/code-host@0.4.6
  - @osdlc/typed-git@0.8.1
  - @osdlc/config-layers@0.7.3

## 0.7.4

### Patch Changes

- Updated dependencies [1a44195]
  - @osdlc/typed-git@0.8.0
  - @osdlc/code-host@0.4.5

## 0.7.3

### Patch Changes

- Updated dependencies [0cf31de]
  - @osdlc/command-seam@0.11.0
  - @osdlc/cli-tool@0.8.1
  - @osdlc/code-host@0.4.4
  - @osdlc/typed-git@0.7.2

## 0.7.2

### Patch Changes

- Updated dependencies [910deca]
- Updated dependencies [910deca]
- Updated dependencies [910deca]
- Updated dependencies [910deca]
  - @osdlc/cli-tool@0.8.0
  - @osdlc/command-seam@0.10.0
  - @osdlc/config-layers@0.7.1
  - @osdlc/trust-repo@0.3.0
  - @osdlc/code-host@0.4.3
  - @osdlc/typed-git@0.7.1

## 0.7.1

### Patch Changes

- Updated dependencies [007d8ee]
- Updated dependencies [96b7144]
- Updated dependencies [b5aac07]
- Updated dependencies [41ef520]
  - @osdlc/cli-tool@0.7.0
  - @osdlc/config-layers@0.7.0
  - @osdlc/typed-git@0.7.0
  - @osdlc/code-host@0.4.2

## 0.7.0

### Minor Changes

- d9b0f77: `pr-update` no longer reports a broken setup as "no open PRs", and the command-line tool picks its code host from the `origin` remote (or `code_host.override`): a Forgejo remote works with `curl` and `FORGEJO_TOKEN`, a GitHub one with `gh`. Before listing anything, `survey` and `update` check that `git`, and `gh` or `curl`, are installed and that the remote can be read. A PR listing the host refuses (`gh` signed out, no network, a refused token) is an error, not an empty list. Every one of these failures is the shared classified failure from `@osdlc/typed-git`, `@osdlc/typed-gh` and `@osdlc/code-host`, printed as `pr-update: <message> <hint>` and numbered by `@osdlc/cli-tool`: `22` a missing tool, `23` the host refused or answered unusably, `24` no repository or remote, `25` unreachable or rate-limited (`21`, untrusted, is unchanged). A self-hosted remote is now read as `owner/name`. With several `--repo` targets, a repository whose PR listing fails no longer aborts the others: it is recorded on its `repos` entry (`failure`) and in `update --report` (`repoFailures`), printed, and the run exits with the first failure's code. `update --report` writes `{ "error", "failure": { "kind", "message", "hint" } }` for such a failure. Library callers that pass their own `codeHost` are unaffected, and the library default stays GitHub. `selectedCodeHostFor` is the CLI's host factory; it throws a `FailureError` when no host can be built.
- d9b0f77: **Breaking:** typed-git's plain door throws the classified failure, as typed-gh's does. A failed git call (any verb, `rawChecked`) now throws a `FailureError` whose `failure` is the `GitFailure` and whose `failure.cause` is the `CommandFailed`, where it threw the `CommandFailed` itself. The bare `CommandFailed` had only command-seam's generic `exit` kind, so a signed-out `git push` exited 1 from `runMain` instead of 23. Read `error.failure.argv` and `error.failure.cause.result` where you read `error.argv` and `error.result`.
  
  New `GitFailureKind` `tls`: `unable to access … SSL certificate problem` is no longer `remote-unreachable`. The host answered, so retrying cannot help until the system clock, the CA certificates or the remote's certificate is fixed. `@osdlc/cli-tool` numbers `tls` 23, with the other "fix it" failures; `@osdlc/pr-update` accounts for it in its exit-table check and reads a push failure through the `FailureError`'s cause.

### Patch Changes

- fb712e0: Ship the compiled `dist/` only. The `bun` export condition and the TypeScript source are no longer in the package, so Bun, Node and every bundler load the same compiled ESM and `.d.ts` files. Bun still works through the compiled `dist/`.
- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [fb712e0]
- Updated dependencies [fb712e0]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
  - @osdlc/cli-tool@0.6.0
  - @osdlc/code-host@0.4.0
  - @osdlc/command-seam@0.9.0
  - @osdlc/etag-write@0.2.1
  - @osdlc/trust-repo@0.2.2
  - @osdlc/typed-git@0.6.0
  - @osdlc/agent-call@0.7.1
  - @osdlc/config-layers@0.6.1
  - @osdlc/result@0.1.0

## 0.6.0

### Minor Changes

- 91ca330: First public release. `@osdlc/pr-update` is a standalone tool and library that brings pull-request branches up to date with their base, one PR or a whole stack. It moves here from the development repository, where it was `@sksizer/pr-update`.
  
  - `pr-update`: a CLI with a survey step (drift measured locally, conflicts predicted with `git merge-tree`, PRs read through `@osdlc/code-host`) and an update step that rebases and falls back to a merge when the rebase cannot finish.
  - A conflict ladder: `git rerere`, lockfile regeneration, configured resolvers and generators, then the repair port.
  - The repair port runs a command or a built-in headless agent preset (`claude`, `codex`, `cursor`, `pi`) through `@osdlc/agent-call`.
  - `--branch` updates the PR whose head is the checked-out (or named) branch, `--pr` picks one PR (with its stack parents), and `--report` writes the run as JSON.
  - Settings live in a `pr-update.yaml` config file, read through `@osdlc/config-layers`. Commands that come from a repository's own config run only after the repository is trusted, through `@osdlc/trust-repo`.
  - A host-neutral engine API: `runSurvey`, `runUpdate` and the `Ports` they take.
  - Depends on `@osdlc/agent-call`, `@osdlc/cli-tool`, `@osdlc/code-host`, `@osdlc/command-seam`, `@osdlc/config-layers`, `@osdlc/etag-write`, `@osdlc/trust-repo`, `@osdlc/typed-git`, `yaml` and `zod`. ESM with `.d.ts` types, for Node 22.18 or newer. Licence `MIT OR Apache-2.0`.

### Patch Changes

- @osdlc/trust-repo@0.2.1
