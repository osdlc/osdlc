# @osdlc/pr-update

## 0.11.0

### Minor Changes

- 5d81237: `survey` and `update` now run on `@osdlc/cli-tool`'s command model, in one tree with `config` and `trust`; the hand dispatch on the first argument is gone. Every flag, exit code and text report is unchanged, and a bare `--branch` still means the checked-out branch. What a reader sees differently:
  
  - `--json` (and `--output json`) prints the same fields with `schemaVersion: 1` and `kind` (`survey` or `update`) in front, and `update --report` writes that same document. The `{ error }` report of a run that threw is unchanged.
  - Help is generated: `pr-update <command> --help`, `--help --all` for the long form (the `--repair-agent` agents, one per line, are there now), `pr-update help` and `pr-update schema`. `pr-update` alone still lists the commands and exits 0.
  - Errors read `pr-update: <message>` with the usage line, and under `--json` also print the error document on stdout. An unexpected error is reported by the app (exit 1) rather than thrown out of `main`.
  - `--output jsonl` and `--json --output text` are refused (exit 2).
  - For an adapter: `survey` is read-only, `update` is destructive, and an `update` call that passes `trust`, `repairAgent`, `repairCommand` or `report` is command-line only.

### Patch Changes

- Updated dependencies [912296d]
  - @osdlc/typed-git@0.15.0
  - @osdlc/code-host@0.7.12
  - @osdlc/trust-repo@0.5.7

## 0.10.1

### Patch Changes

- Updated dependencies [20dfeb4]
  - @osdlc/agent-call@0.12.0

## 0.10.0

### Minor Changes

- cb8eafc: **Breaking:** `survey` and `update` identify every PR by repository and number, in one shape whether a run covers one repository or several (#753).
  
  - Each `update` `results` and `skipped` entry carries `repo` (`owner/name`) next to `number`.
  - Text output always names a PR `owner/name#N`, the form GitHub links, in one repository or several. The survey table's `PR` column holds it, and the separate `REPO` column is gone. The base/head cycle line names its PRs the same way.
  - `--pr` accepts `owner/name#N` as well as a bare number. A bare number still selects that PR in every repository of the run. A key names one PR of one repository, which must be in the run: a key for any other repository is a usage error (exit `2`).
  - `slug` is renamed `repo` everywhere: each survey `repos[]` entry, `RepoTarget`, and the target `SurveyEnv.codeHost` receives (`{ cwd, repo }`).
  - `update` output carries `repos`, the same entries `survey` reports, and no longer has `repoFailures`. A repository that could not be listed has `failure` set on its `repos` entry, as in `survey`.
  - Base/head cycles are listed on each `repos[]` entry as `cycles`. The top-level `cycles` is gone.
  - A `--pr` selector no surveyed PR matched is listed in the new `notFound` (`#N` or `owner/name#N`), with a `notFound` count, and is no longer a `skipped` entry. Every `skipped` entry is a surveyed PR with a `repo`.
  - `Ports.resolveVerifyVerbs` receives `repo` and `checkout` (that repository's local checkout) along with `which` and `trust`, so repositories that build differently can each get their own list. It is called once for each repository the run surveyed in a local checkout, all before the first update, so a list refused for one repository stops the run before anything is pushed. A port that ignores the new fields keeps working. A direct call must pass them.
  - New: `update --restack` (input `restack`) updates a whole stack in one run, parent first. A PR blocked only because its parent is behind is updated right after that parent, onto the head the parent just got, and a rebase replays only its own commits (`rebase --onto <parent's new head> <parent's old head>`), not its parent's old ones. A rehearsal builds each level on the one below and pushes nothing. A child goes up only onto a parent that was pushed: one held back by a conflict, a failure or a declined push is skipped with the reason. With `--pr` or `--branch`, the named PRs' stack ancestors are updated too. A restacked result carries `restackedOnto`, and every `updated` outcome records `builtOid`. See D-0002.
  - `prKey`, `parsePrKey`, `selectorLabel`, `PrSelector` and `surveyRepoSchema` are exported. `selectTargets` takes `PrSelector`s and returns `notFound` as well.
  - Fixed: in a run over several repositories, PRs were matched by number alone. A PR in a base/head cycle in one repository was dropped when another repository had a PR with that number. In branch mode, a PR with the same number in another repository was selected too, and could be given the local checkout note meant for the branch's PR. A scoped run no longer runs a full `git fetch` in a repository where nothing was selected.

### Patch Changes

- e1a5941: `pr-update update` now installs `@osdlc/command-seam`'s process-group signal forwarding. SIGINT, SIGTERM or SIGHUP while the repair agent runs kills the agent's group, starts no further repair or PR update, records no failed attempt for the interrupted run, and exits `128 + signal` (130 for SIGINT, 143 for SIGTERM). A second signal is SIGKILL. Before, an interrupted run left the spawned agent running. `survey` is unchanged. Between agent runs (git and `gh` steps, the verify command) pr-update holds no process group, so a signal there ends it as before.
- Updated dependencies [e1a5941]
- Updated dependencies [e1a5941]
- Updated dependencies [cb8eafc]
  - @osdlc/agent-call@0.11.0
  - @osdlc/command-seam@0.15.0
  - @osdlc/typed-git@0.14.0
  - @osdlc/cli-tool@0.18.2
  - @osdlc/code-host@0.7.11
  - @osdlc/trust-repo@0.5.6

## 0.9.12

### Patch Changes

- Updated dependencies [65605cb]
  - @osdlc/config-layers@0.10.0
  - @osdlc/cli-tool@0.18.1
  - @osdlc/code-host@0.7.10

## 0.9.11

### Patch Changes

- 8aa9237: The merge strategy now writes the merge commit message `Merge <base> into <head>` with a body line naming the base sha, instead of git's default title that named the temporary local branch (`Merge remote-tracking branch 'origin/main' into pr-update/scratch-...`).

## 0.9.10

### Patch Changes

- Updated dependencies [3a8af1e]
- Updated dependencies [3d4a6d7]
- Updated dependencies [6422022]
  - @osdlc/agent-call@0.10.0

## 0.9.9

### Patch Changes

- a148598: Fixed: `pr-update config set` and `config unset` no longer overwrite an edit saved in an editor while they ran. They write with a compare-and-swap against the text they edited, and when the file changed in between they leave it as it is and exit 1 with code `config-conflict`.
- Updated dependencies [a148598]
- Updated dependencies [0703abd]
- Updated dependencies [2d0e130]
  - @osdlc/config-layers@0.9.0
  - @osdlc/cli-tool@0.18.0
  - @osdlc/trust-repo@0.5.5
  - @osdlc/code-host@0.7.9

## 0.9.8

### Patch Changes

- Updated dependencies [25ccd9e]
  - @osdlc/typed-git@0.13.0
  - @osdlc/code-host@0.7.8
  - @osdlc/trust-repo@0.5.4

## 0.9.7

### Patch Changes

- Updated dependencies [25c1c72]
  - @osdlc/cli-tool@0.17.0
  - @osdlc/code-host@0.7.7

## 0.9.6

### Patch Changes

- bd8a52f: When `git worktree list` fails, the unpushed-work guard's reason now says so (`could not list worktrees, so assuming unpushed work in another checkout`) instead of claiming the head branch is checked out elsewhere. The guard still applies, and the rule is still `guard:unpushed-local`. `StrategySignals` gains an optional `worktreesUnknown`.

## 0.9.5

### Patch Changes

- Updated dependencies [41439a6]
  - @osdlc/cli-tool@0.16.0

## 0.9.4

### Patch Changes

- Updated dependencies [a3ef86d]
  - @osdlc/cli-tool@0.15.0

## 0.9.3

### Patch Changes

- 9948d90: In a project that has this tool in its `node_modules`, the global command now runs the project's copy, unless a `dev link` or `<NAME>_HOME` checkout is set. Set `<NAME>_PROJECT=0` to keep the global copy.
- 79407f5: Depend on `zod` `^4.6.6` instead of exactly `4.4.3`. 4.4.3 is covered by GHSA-mrhx-c7xc-m3w5 (memory exhaustion validating an oversized constrained collection; fixed in 4.6.6), and the exact pin made a consumer that already had a fixed `zod` install a second, vulnerable copy.
- Updated dependencies [9948d90]
- Updated dependencies [79407f5]
  - @osdlc/cli-tool@0.14.0
  - @osdlc/code-host@0.7.5

## 0.9.2

### Patch Changes

- Updated dependencies [14d4351]
- Updated dependencies [dd2265e]
  - @osdlc/cli-tool@0.13.0

## 0.9.1

### Patch Changes

- e0aaba5: `isStalePush` accepts typed-git's new `atomic-failed` rejection, and returns `false` for it.
- Updated dependencies [e0aaba5]
  - @osdlc/typed-git@0.12.0
  - @osdlc/code-host@0.7.4
  - @osdlc/trust-repo@0.5.3

## 0.9.0

### Minor Changes

- 43a4097: `pr-update dev` and `repo-cleaner dev` run the tool from a development checkout: `dev link <checkout>` makes the installed command run that checkout's source under Bun, `dev status` says which code runs, and `dev off` goes back. `PR_UPDATE_HOME` and `REPO_CLEANER_HOME` do the same for one run. `dev` is now a word for both tools: sweep a directory named `dev` with `repo-cleaner ./dev`, as with `apply`. The bin now loads `dist/bin.js`, built from the new `src/bin.ts`.

### Patch Changes

- Updated dependencies [43a4097]
  - @osdlc/cli-tool@0.12.0

## 0.8.4

### Patch Changes

- Updated dependencies [7fe7f51]
- Updated dependencies [7fe7f51]
  - @osdlc/code-host@0.7.0
  - @osdlc/typed-git@0.11.1

## 0.8.3

### Patch Changes

- ebe0e0d: A survey that cannot list the worktrees no longer reads that as "no checkout holds the branch". It used `git.soft.worktrees()`, whose `[]` on a failure cleared the unpushed-local guard and could plan a force-push over local commits. It now uses `git.try.worktrees()`, and a failed listing counts as unsafe, like refs that cannot be read: the PR gets the `guard:unpushed-local` strategy. This matters on a git older than 2.34, where typed-git's `worktrees()` now fails as `unsupported-git`. `unpushedLocalWork` and `surveyRows` take `null` for worktrees that could not be listed.
- Updated dependencies [82d9841]
- Updated dependencies [ebe0e0d]
  - @osdlc/typed-git@0.11.0
  - @osdlc/code-host@0.6.2
  - @osdlc/trust-repo@0.5.2

## 0.8.2

### Patch Changes

- bb61f10: The version `--version` prints is now stamped from package.json at build time by `cli-tool-stamp-version` instead of read from package.json at run time.
- Updated dependencies [bb61f10]
  - @osdlc/cli-tool@0.11.0

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
