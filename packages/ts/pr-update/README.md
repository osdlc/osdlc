# @osdlc/pr-update

Survey every open pull request's drift from its base, and bring the ones that
are behind up to date — rebase or merge, one PR or a whole stack, with
conflicts predicted before anything is checked out.

```ts
import { prUpdateConfigSchema, runSurvey, standalonePorts } from "@osdlc/pr-update";
import { spawnRunner } from "@osdlc/command-seam";

const report = runSurvey(
  { repo: [], noFetch: false, noDrafts: false, limit: 100, remote: "origin" },
  {
    projectRoot: process.cwd(),
    dryRun: false,
    git: spawnRunner("git"),
    gh: spawnRunner("gh"),
    cfg: prUpdateConfigSchema.parse({}),
    ports: standalonePorts(),
  },
);
```

Or from a shell (`npx @osdlc/pr-update …`, or after installing the package):

```sh
pr-update survey --output json
pr-update update --apply --strategy rebase     # every open PR, parent first
pr-update update --branch --apply              # the PR of the branch you are on
pr-update update --pr 12 --apply --report out.json
```

## Install

```sh
npm install @osdlc/pr-update
```

ESM only. Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of its
dependency `@osdlc/typed-git`. `pnpm add @osdlc/pr-update` and
`yarn add @osdlc/pr-update` work too.

## Requirements

- `git` on `PATH`, always.
- For a GitHub repository, the GitHub CLI (`gh`) on `PATH` and signed in:
  `gh auth login`.
- For a Forgejo repository, `curl` on `PATH` and a token in the
  `FORGEJO_TOKEN` environment variable.

`survey` and `update` check this before they list anything. A missing tool, an
unreadable git remote or a PR listing the host refused is an error with its own
exit code (see Exit codes), never "no open PRs". The message is the one every
tool built on `@osdlc/cli-tool` prints for that failure, for example
`pr-update: gh is not signed in to GitHub. Run \`gh auth login\`.`

## Why this exists as its own package

A stack of PRs drifts constantly — every merge to `main` puts the next PR one
commit further behind, and a PR three deep in a stack can look clean while
sitting on a base that is itself stale. Catching that by eye does not scale
past a handful of PRs; surveying it costs a GitHub API call and a
`git merge-tree` per PR, both cheap enough to run on every one that is open.

This package started life inside a larger CLI. It moved out once "run this
standalone against any repository, with your own idea of trust and your own
GitHub client" stopped being a hypothetical: the `CodeHost` port leaves the
GitHub client entirely to a caller.

It has two layers. The engine (`runSurvey`, `runUpdate`, the resolver ladder,
the guards and the `Ports`) names no host, no host config file and no
project's commands. The `pr-update` binary is one host of it, and any other
host embeds the engine as a library and supplies its own ports.

## One PR, or all of them

With no scope, `update` works on every open PR in the repository, parent
first. `--pr N` (repeatable) names PRs, and `--branch [name]` names the PR
whose head is that branch; a bare `--branch` means the branch checked out in
the current directory. A branch with no open PR is a usage error (exit `2`).

A scoped run measures only what it needs. It lists the code host once, then
fetches and `merge-tree`s just the named PRs and their stack parents, so a
host that updates one PR at a time does not pay for a survey of fifty. A PR
whose parent is behind is still reported `blocked`.

In branch mode, after a successful push the checkout you ran it from is moved
to the pushed head, when that loses nothing: it is on that branch, has no
uncommitted change and sits exactly at the head the run started from. (A
rebase is not a fast-forward, so the checkout is reset to the new head; it was
clean and at the old remote head, so every commit it held is on the pushed
branch.) Otherwise it is left alone, and the result's `localCheckout` says
why: `{ updated: false, detail: "the working tree has uncommitted changes" }`.

## Three things it knows that a per-PR check cannot

**Drift is measured locally.** GitHub only reports `mergeStateStatus: BEHIND`
when branch protection requires an up-to-date branch; without it the field
stays silent however far a branch has drifted. So behind-ness comes from
`git rev-list --left-right --count` over the remote-tracking refs.

**Staleness is transitive.** When PR A targets PR B's head branch, A is
stacked on B, and updating A before B is wasted work — A's base is about to
move. `survey` builds the stack graph, sorts it parent-first, and marks a
child `blocked` on the nearest ancestor that is itself behind, however many
levels up that ancestor sits.

**A rebase is not always safe.** `--force-with-lease` compares against the
*remote*, so it does not notice a checkout holding commits nobody has pushed;
rebasing over that would orphan the work with no warning. The
`guards.unpushed_local` guard checks for this ahead of every preference and no
override defeats it.

## Conflicts, predicted before anything is checked out

`survey` predicts each PR's merge with `git merge-tree`, which merges in the
object database and never touches a working tree — the only thing that makes
surveying every open PR affordable; a full checkout per PR would cost minutes,
not seconds, across a large stack. A conflict prediction carries the
conflicted paths and `conflictBaseSha` — the base ref's resolved commit at the
moment it was measured — so a caller (a router keying a delivery signature on
it, say) can tell whether the prediction is still fresh.

## Resolving a conflict without asking anyone

`update` walks a resolver ladder before giving up on a conflict: git's own
`rerere` replay, the built-in lockfile rule (take a side, re-run
`lockfile_install`), then a project's own `resolvers` (glob-matched paths
paired with the shell verb that rebuilds them, `make docs` say), then a host's
in-process `generators`. A conflict no rung claims is reported with the path
and why, in `update`'s structured `conflicts` field, and never guessed at.

### The fallback chain

A rebase replays every commit, so it can stop once per commit. Generated files
tend to conflict at every stop, so the ladder's deterministic rungs run at
**every** stop, looping while the rebase keeps stopping. The chain:

1. Rebase, with the rungs at each stop.
2. A stop they cannot clear aborts the rebase and the PR is retried as a
   merge, with the same rungs. This is `pr_update.on_rebase_conflict`:
   `merge` (the default) retries, `fail` reports the PR as a conflict instead.
3. A merge still stuck goes to `repair`, called once, editing files in the open
   merge only. `repair` is never called mid-rebase: repairing each stop of a
   20-commit rebase could mean 20 agent calls on 20 versions of one conflict.
4. Otherwise the PR is reported for a person, and the failed-attempt record
   keeps it from being retried until its head or base moves.

When step 2 ran, the result's `strategy` is `merge`, whatever was planned, and
`strategyFallback` says what stopped the rebase. A reader must use the result's
strategy, not the requested one: a rebase-strategy PR can be pushed as a merge.

### Repair

`repair` is the one judgement seam, and it is opt-in. With `repair.agent`, `repair.command` or a
host's `repair` port, `update --apply` calls it once for whatever the ladder left: an unclaimed
`conflict` (on a merge only), and a failed verify step when `repair.on` lists `verify-failed` (for
either strategy). It is async (an agent run takes minutes), and `repair.timeout_seconds` kills one
that runs too long. The repair only edits files. `update` rejects it if HEAD moved or a ref was
created, or if conflict markers or `git diff --check` errors remain. Otherwise `update` stages,
commits, re-runs `verify` and pushes. The result lists each fix under `repaired`. A rehearsal never
calls the repair.

`repair.command` runs a shell command in the update worktree. It gets the
request as JSON on stdin and as `PR_UPDATE_KIND`, `PR_UPDATE_PR`,
`PR_UPDATE_BASE`, `PR_UPDATE_HEAD`, `PR_UPDATE_WORKTREE`, `PR_UPDATE_PATHS`
(one per line) and `PR_UPDATE_REASON`. Exit 0 claims success; the last line of
output is the note.

`repair.agent` (or `update --repair-agent <agent>`) runs a built-in headless
agent instead. The two are mutually exclusive: a config that sets both is
refused with exit `14`.

| Agent | Runs |
|---|---|
| `claude` | Claude Code (`claude`) |
| `codex` | OpenAI Codex (`codex exec`) |
| `cursor` | Cursor's CLI (`agent`) |
| `pi` | the pi coding agent (`pi`) |

Each preset is one [`@osdlc/agent-call`](https://www.npmjs.com/package/@osdlc/agent-call)
call, run in the update worktree with file edits allowed, no shell and no
permission prompts, and the repair timeout. agent-call owns every CLI's
argument list; this package writes no per-agent flags. The agent CLI must be
installed and signed in. `repair.model` passes a model name to it. The exit
status gives `ok` and the agent's final line gives the note. All presets share
one prompt, `repairPrompt(req)`, which states the contract; a library host that
runs its own agent can reuse it.

An agent reads the repository and can run tools, so a `repair.agent` (like a
`repair.command`) read from the project file needs trust (see Config).
`--repair-agent` and `--repair-command` on the command line are your own
consent and need none; they beat whatever the config names.

## Checking before a push

`verify` decides what must pass before an updated branch is pushed. `none`
(the default) leaves it to CI on the PR. `check` and `test` run a verb list in
the update worktree, and a failure blocks the push. The host resolves that
list through `Ports.resolveVerifyVerbs({ which, trust })`. A standalone run
has no list for `check`, and runs `test` from `test_command`:

```yaml
# pr-update.local.yaml
pr_update:
  verify: test
  test_command: bun test
```

With `verify: test` and no `test_command`, a standalone `update` fails before
it touches any PR.

## Not retrying a failure that will repeat

An update that ends `conflict` or `failed` will fail the same way next time unless the head or the
base has moved. So `update --apply` records each failure in `.pr-update/attempts/` (one file per
repo, head and base branch), keyed by repo, head branch, head sha, base branch and base sha. Once a
PR has failed `max_failed_attempts` times (default `1`) at its current key, later runs list it under
`skipped` with the reason `failed N time(s) at this head and base; waiting for either to move`, and
do not check it out. A new commit on either branch changes the key, so the next run attempts it
again. A PR whose head or base sha is unknown has no key and is never skipped. An `updated` or
`up-to-date` result clears the branch's entries. Entries older than 30 days are dropped.

`--retry-failed` attempts recorded PRs anyway and still records new failures.
`max_failed_attempts: 0` turns the check off. A rehearsal reads the record but
never writes it: it cannot call the repair, so its failures say nothing about a
real run.

## Seeing a force-push before it happens

`update --apply --confirm-push` stops before each rebase force-push. It prints
the PR, the commits that will be on the branch (`git log
<remote>/<head>..HEAD`), how many commits the push replaces, and `git diff
--stat <remote>/<head> HEAD`, then asks `Force-push to <head>? [y/N]`. Only
`y` or `yes` pushes. Anything else leaves the branch as it was and reports
`push declined`. A prompt that fails (the terminal went away) counts as no and
is not recorded as a failed update. A merge push is a fast-forward and is not
asked about, and a dry run never asks.

The flag needs `--apply` and a terminal on stdin and stderr. A library caller
sets `confirmPush: true` in the args and may supply `Ports.confirmPush` to ask
some other way than the terminal.

## A report a host can read

`update --report <file>` writes the run's result as JSON (the same document
`--json` prints) through a temp file and a rename, so a reader never sees half
of it. Any report left by an earlier run is removed first, so a file that is
there belongs to this run. It is written whenever the run produced a result: on
a clean exit and on a conflict or failure alike. Each PR's entry carries its `status`, the
`strategy` that ran, `strategyFallback`, `repaired`, `conflicts` and
`localCheckout`, so a host can act on each outcome without parsing text. A run
that throws writes `{ "error": "<message>" }` instead; one refused before the
run starts (a flag usage error, a refusal for want of trust) writes none.

There is no interactive checklist: `--confirm-push` is the way to ask before a
force-push.

## Config

The binary reads the `pr_update:` and `code_host:` blocks of `pr-update.yaml`
in the project root, layered under `pr-update.local.yaml` (the gitignored,
per-checkout overlay). It reads no other file, and every other top-level key is
skipped unread. Every key has a default, so `survey` and `update` work with no
config file at all.

| Source | Wins over |
|---|---|
| A CLI flag | everything below |
| `pr-update.local.yaml` | `pr-update.yaml` |
| `pr-update.yaml` | the built-in defaults |

`PR_UPDATE_CONFIG=path/to/file.yaml` replaces that pair with the named file and
its overlay (`file.local.yaml`); a path that does not exist is an error. A key
the blocks do not define, at any depth, and a malformed value both exit `14`.

`pr-update config list|get|set|unset|explain|scaffold` reads and edits those
files (`--layer project|local`, default project; `set` validates before it
writes and keeps comments and layout). A key without a section prefix means
`pr_update.<key>`: `pr-update config set strategy merge` equals
`pr-update config set pr_update.strategy merge`, and `list` and `explain`
print the qualified key.

Five values name a command, or an agent that can run tools, that the tool will
start: `lockfile_install`, `resolvers[].run`, `repair.command`, `repair.agent`
and `test_command`. When one is set in the project file (and not overridden in
`pr-update.local.yaml`), `update` exits `21` until you consent: pass `--trust`
for one run, or run `pr-update trust` once to record the repository (kept under
`$XDG_STATE_HOME/pr-update/trusted/`).

`repair.command` and `repair.agent` are mutually exclusive, checked on the
merged config. A `pr-update.local.yaml` that wants an agent where the project
file names a command must also set `command: null`, or the merged config names
both and is refused.

### Caller-named config

The engine's loader takes the file name and the env variable from its caller.
The binary passes `{ name: 'pr-update.yaml', envVar: 'PR_UPDATE_CONFIG' }`. A
host that keeps these blocks inside its own config file passes that file's
`ConfigFileSpec` to `loadConfigLayers(file, projectRoot)` and gets the same
schema, defaults and layering, or hands it to `main(argv, ctx, { configFile })`
to run the whole binary against it. A host may also mount `prUpdateSection` in
its own section list, or build a `PrUpdateConfig` from whatever config format
it already has; nothing here requires a config file.

## The `Ports` a host supplies

Three things this package deliberately does not know for itself, two
optional extensions to the conflict ladder, an optional record of failed
updates, and an optional push confirmation:

| Port | What it answers |
|---|---|
| `locate(slug)` | Where `owner/name` is checked out on this machine, or `null` |
| `runVerb(verb, cwd)` | Run one shell verb — the resolver/verify seam |
| `resolveVerifyVerbs({ which, trust })` | The trust-gated verb list `verify: check` or `verify: test` runs before a push |
| `generators` (optional) | In-process rebuild steps, each with `claims(path)` and `run(worktree)` |
| `repair(req)` (optional) | The last rung, async: edit the worktree to fix a `conflict` or `verify-failed` |
| `attempts` (optional) | The failed-update record: `get(key)`, `recordFailure(key, reason)`, `clear(repo, head)` |
| `confirmPush(preview)` (optional) | Under `confirmPush: true`, whether to make one rebase force-push; the terminal prompt when absent |

`standalonePorts(cfg, projectRoot)` gives a `pr-update` CLI run reasonable defaults for the first
two, builds `repair` from `repair.agent` or `repair.command`, stores attempts in
`<projectRoot>/.pr-update/attempts/` (`fileAttemptStore`), answers `verify: test` with
`test_command`, and refuses `verify: check` outright (a standalone run has no host registry to
resolve `check` from — set `verify: 'none'`, or embed this package as a library and supply real
ports). `commandRepair(command, timeoutSeconds)` and `agentRepair(agent, options)` are the
command-backed and agent-backed repairs, for a host that gates them itself; `planRepair` shows the
call a preset would make without running it.

## Code hosts

`survey` and `update` list PRs through the `CodeHost` port
(`@osdlc/code-host`, `listPrDetails`), so no GitHub client is imported
here. The `pr-update` binary picks the host with `selectCodeHost`: a
`github.com` remote (and a repository with no `origin` to read) uses
GitHub over `gh`; any other remote is read as a self-hosted Forgejo, over
`curl`, with the token in `FORGEJO_TOKEN`. `code_host.override: github` or
`forgejo` in the config forces the answer, for a GitHub Enterprise host say.
The token's variable name is not configurable here; it is always
`FORGEJO_TOKEN`.

A host that embeds the engine as a library supplies `SurveyEnv.codeHost` and
is untouched by all of this. Left absent, the library default stays GitHub
over `gh`, as it always was: it does not read the remote, so an embedding that
never named a host cannot start answering from Forgejo. `selectedCodeHostFor`
is the CLI's factory, if a library caller wants the same choice.

Whatever the host, a listing it could not complete (not signed in, no
network, a refused token) makes `runSurvey` throw a `FailureError` from
`@osdlc/result` carrying the code host's `CodeHostFailure` (its `kind`,
`message` and `hint`); it is never an empty list. The CLI prints it as
`pr-update: <message> <hint>` and exits with the code for its kind. A host
that cannot be built throws the same way, from `selectedCodeHostFor`.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean run (`survey` always; `update` when no PR ended `conflict` or `failed`) |
| `1` | The run finished but a PR ended `conflict` or `failed`, or an unexpected error |
| `2` | Malformed command line, or a `--branch` with no open PR |
| `14` | The config file is invalid or unreadable |
| `21` | `update` refused for want of repository trust |
| `22` | A tool the run needs is not installed: `git`, and `gh` (GitHub) or `curl` (Forgejo) |
| `23` | The code host refused the caller or answered unusably: not signed in, no `FORGEJO_TOKEN` or a refused one, no such repository, an HTTP error |
| `24` | There is no repository to work on: no readable git remote, one that names no repository, or not a git checkout (pass `--remote` or `--repo`) |
| `25` | The code host could not be reached, timed out or rate-limited the caller; try again later |

`22` to `25` are not pr-update's own: they are the failure codes every tool
built on `@osdlc/cli-tool` shares (`EXIT_FAILURE`), so a script that handles one
handles the others. `21` is this tool's. Any other failure of a tool the run
shells out to is an ordinary `1`.

With `update --report`, a run that failed before it had a result writes
`{ "error": "<message and hint>", "failure": { "kind", "message", "hint" } }`
(`failure` only for a classified failure; `hint` only when there is one). A
refusal before the run starts (a missing tool, a missing remote, no trust)
writes no report.

## When not to use

- You want a hosted bot that keeps PRs current without a machine of yours
  running: use Kodiak or Mergify.
- You only need to update one PR by hand: GitHub's "Update branch" button or
  `git rebase` does it.
- You manage a stack you author yourself and want a branch-stack workflow
  end to end: use Graphite or git-town.
- Your host is neither GitHub nor Forgejo and you do not supply a `CodeHost`
  adapter: there is nothing to list PRs with.

## Prior art

From the author's knowledge, read on 2026-10-20 and not re-checked against
current docs. The design record,
[D-0001](docs/planning/decisions/D-0001-engine-hosts-and-one-judgement-seam.md), has the
full table.

- GitHub "Update branch" merges or rebases the base into one PR from the web
  UI. This package borrows the two strategies, and adds conflict resolution and
  stacks.
- Kodiak and Mergify keep PRs current with their base through a hosted bot and
  a merge queue. This package borrows "update only what is behind, in order"
  and runs locally instead.
- Renovate rebases its own PRs and regenerates lockfiles by re-running the
  package manager. The lockfile and `resolvers` rungs follow that: a derived
  file is regenerated, not merged.
- `git rerere` replays a recorded resolution. It is the first rung.
- Graphite `gt restack` and git-town `sync` restack a branch stack parent
  first. The stack order and blocked children follow the same idea.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
