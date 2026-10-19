# `sdlc.yaml` — per-project SDLC configuration

`sdlc.yaml` is a top-level configuration file (placed at the project root,
alongside `README.md` / `CLAUDE.md`) that declares per-project runtime
choices for the sdlc plugin's skills. It is operational config, not a
planning artifact — it does not live under `docs/planning/` and is not
managed by `/sdlc:setup`'s entity-schema machinery.

## Where the file lives

By default `sdlc.yaml` sits at the project root and `sdlc.local.yaml` beside it.
`SDLC_CONFIG=<path>` points every tool built on the library at another file of
the same shape and REPLACES that pair: while it is set, neither root file is
read, a relative path resolves against the working directory at startup, and
the overlay is `<dir>/<name without its last extension>.local.<ext>`
(`tools/sdlc.yaml` pairs with `tools/sdlc.local.yaml`, `cfg.yml` with
`cfg.local.yml`). A path that names a missing file is an error (exit 14) naming
it; `sdlc config explain <key>` prints the absolute paths it read, and `sdlc
config set --layer project|local` writes the pointed file and its overlay. A
file named this way is project-sourced for the repository-trust gate exactly
like `sdlc.yaml`, so it does not bypass exit 21. The machine file
(`SDLC_MACHINE_CONFIG`) and the trust store are not affected.

## Where the shape lives

The **authoritative source of truth** for `sdlc.yaml` is the Zod schema
`SdlcConfigSchema`, which `solutions/ontological/lib/config/load.ts` assembles
from one section module per top-level key under `lib/config/sections/` (the
assembly, loader and file resolver are `@osdlc/config-layers`'s). Every
supported top-level key, its type, its default, and its description live in
its section as `.describe()` and `.default()` annotations, and every top-level
key also carries a `.meta()` block (see [Key meta](#key-meta)). This prose doc covers
the "why" (what each key is for, which skills consume it, when to set it) but
does not re-state the field list.

`SdlcConfigSchema` is the **only** validation path. There is no generated
JSON-Schema artifact and no AJV validator: both `loadConfig`'s hydration
and the strict surface (`validateFile`, and `lib/config/workflows.ts`'s
`resolveWorkflow` when it validates, via the `.safeParse` core in
`solutions/ontological/lib/config/schema.ts`) validate against this
one Zod schema. To export a JSON Schema for an external tool, generate it
on demand from `SdlcConfigSchema` with Zod 4's `z.toJSONSchema` (the key meta
rides along as extra properties); nothing is checked in, so there is no
resync step and no drift to guard.

The **field-by-field reference** is generated from the same schema and meta:
`sdlc docs generate sdlc-yaml` writes `docs/sdlc-yaml-reference.md` (one
section per top-level key: description, meta, value shape, default, nested
fields; `lib/config/reference.ts`), and `sdlc docs generate --check` fails when
the committed copy drifts from the schema. From inside a project,
`sdlc config list` shows every key's effective value and the layer it comes
from, and `sdlc config explain <key>` (dotted paths such as
`orchestrator.limits.executor.implement` work) prints one key's reference entry
alongside its value here.

## Key meta

Every top-level key of `SdlcConfigSchema` carries a meta block, set through
`defineSdlcSection`. The meta structure is `ConfigKeyMeta` in
`packages/ts/config-layers/meta.ts`; sdlc's terms (categories, appliers,
layers, run contexts, enforcement levels) live in
`solutions/ontological/lib/config/vocabulary.ts`:

| Field | Values | Meaning |
|---|---|---|
| `category` | `lifecycle` \| `automation` \| `integration` \| `planning` \| `infrastructure` | Grouping for `sdlc config list` and the generated reference. |
| `consumers` | non-empty list of `<path>.ts#<symbol>` or `planned:<note>` | The code that reads the key, paths relative to the sdlc source root. `planned:` marks a reserved section whose reader is not built yet. |
| `layers` | non-empty subset of `project` \| `local` \| `machine` \| `subtree` | The files that may set it: `sdlc.yaml`, `sdlc.local.yaml`, the machine config, a nested `sdlc.yaml` (`verify:` only). |
| `applies_via` | `read` \| `apply:hooks` \| `apply:harness` \| `apply:mcp` | `read`: consumers read it at run time. `apply:<applier>`: `sdlc apply` must run before a change is live. |
| `runs_in` | non-empty subset of `cli` \| `hook` \| `loop` \| `session` \| `ci` | Where the consumers run. |

Meta is required on top-level keys only; a nested field carries a
`.describe()` and inherits its section's meta. `.meta()` must be the last call
on the chain, because `.default()`/`.prefault()`/`.optional()` each wrap the
schema in a new instance and the registry is keyed by instance.
`checkConfigMeta(shape)` reports every key with missing or malformed meta, and
`lib/config/meta.test.ts` fails on any report. The same test runs the
completeness kit (`packages/ts/config-layers/meta-kit.ts`), which checks the
claims the code can confirm: every `<path>#<symbol>` consumer exists and mentions the
symbol, the `machine` layer is claimed by exactly the keys
`MachineConfigSchema` declares, and no trust key appears in `SdlcConfigSchema`
(trust is machine-local; see [Trust](#trust)).

## Single hydration point

All in-process consumers route through `loadConfig(projectRoot)` from
`@lib/config`. `createCtx` in `solutions/ontological/lib/registry.ts` calls it on
first read of `ctx.sdlcConfig` (once per ctx). Handlers read config via `ctx.sdlcConfig`
— no secondary YAML reads.

`loadConfig` contract:

- Returns a fully-typed `SdlcConfig` with all defaults filled by Zod.
- An absent `sdlc.yaml`/`sdlc.local.yaml` is not an error: with neither file
  present the result is the all-defaults object (same as an empty file).
- **An invalid file is fatal.** A file that exists but cannot be read, is not
  YAML, is not a mapping, or fails the schema throws `ConfigInvalidError`
  (the layered file path(s) plus each Zod issue's key path and message). There
  is no fallback to defaults; the CLI exits 14 (`SCHEMA_ERROR`). Only the
  ops that read, explain, edit or diagnose the config (`sdlc config
  get|list|explain|set|unset|scaffold`, `sdlc project doctor`) run against an
  invalid file, reporting the problem rather than refusing.
- Memoized per resolved absolute path, successes only, and invalidated when
  `sdlc.yaml` or `sdlc.local.yaml` changes on disk (stat signature: mtime,
  ctime, size, inode, or absence), so a long-running host sees an edit at its
  next load. There is no fallback to the last good config: after an invalid
  edit every load throws until the files are valid again; `orchestrate run`
  holds its previous config itself and skips the pass. Call `clearConfigCache()`
  between tests.

For the strict surface (schema validation / error reporting to humans),
use `validateFile` from `@lib/config` — it validates via `SdlcConfigSchema`
`.safeParse` and renders each Zod issue as an `at <location>: <message>`
diagnostic line. The exact message text is locked by
`solutions/ontological/lib/config/schema.test.ts`.

To see the full field-by-field reference, read the Zod source directly:

```text
cat solutions/ontological/lib/config/load.ts
```

## Location

The file lives at `<project-root>/sdlc.yaml`. The path is pinned so
skills can discover it without project-specific configuration. It is
kept top-level (not under `.claude/`) so it sits next to the other
"how this project works" documents and is visible at a glance.

`/sdlc:setup` (via `sdlc project setup`) scaffolds a fresh `sdlc.yaml`
**fully defined**, and it is a **schema-driven projection of
`SdlcConfigSchema`** — not a hand-maintained template. `configScaffoldYaml`
(`solutions/ontological/lib/config/scaffold.ts`) walks the schema and emits every key (nested
included) at its default value, with the schema's own `.describe()` prose as
comments and enum choices inlined; optional keys with no default are emitted
commented. This is "parse over validate": the schema is the single typed
source of truth, so a new key / changed default / reworded description flows
into the scaffold automatically and **cannot drift** by construction (a bug
would fail `solutions/ontological/lib/config/scaffold.test.ts`). The emitted values
equal the all-defaults object, so writing the file changes no behavior; it only
documents the surface. Preview or regenerate it any time with `sdlc config
scaffold`.

`sdlc init` writes the smaller **starter** form
instead (`configStarterYaml`, same module): only the verbs detection finds are
set — `workflows.check` from the project's aggregate `ci`/`check` task or else
its `fmt-check`/`lint`/`typecheck`/`test` tasks (`@sksizer/detect-runners`, as
`sdlc quality detect` probes), `workflows.setup` from `sdlc project
detect-setup`'s candidates — and every other key is a commented-out skeleton
with its description, grouped by meta category. It refuses to overwrite an
existing `sdlc.yaml` without `--force`; `--dry-run` prints the file instead.

## Shape at a glance

A minimal example covering every supported key:

```yaml
workflows:                  # named lifecycle workflows: setup, setup-hooks, check, ...
  setup:
    - bun install
  setup-hooks:              # optional; absent/null → fallback to setup, [] → no-op
    - bun install --frozen-lockfile --filter '@myname/my-package'
  fmt-check:
    - bun run format:check
  lint:
    - bun run lint
  check:                    # composed BY REFERENCE — each line lives in one place
    - run: fmt-check
    - run: lint
    - bun test
  pr-review:
    tool: codex              # profile|tool/host live beside steps on any entry

profiles:                   # named tool preferences — see below
  default: [claude/standard, codex/standard]
  reviewer: [codex/max, claude/max@high]

pr_review:                  # sdlc pr review
  profile: reviewer
  not_the_author: true      # the author rule — see profiles: below

orchestrator:
  limits:                  # concurrency caps in two pools — see below
    executor:              # task execution
      implement: 5         # cap on concurrent /sdlc:task-work sub-agents
      pr_review: 2
      pr_respond: 3
      pr_update: 5
      close_out: 5
      issues: 2
    schedule:              # scheduled runs
      total: 1
  max_awaiting_review: 20   # informational ceiling on open PRs awaiting review
  review:
    max_rounds: 3           # review/respond round-trips per PR before it stops

pr_update:                  # sdlc pr survey / sdlc pr update
  author: null              # null = every author; '@me' = just yours
  include_drafts: true      # drafts drift too
  strategy: rebase          # rebase | merge
  overrides:                # first match wins; beats the preference guards
    - base: 'release/*'
      strategy: merge
  guards:
    unpushed_local: skip    # skip | merge — never force-push over unpushed work
    reviewed: merge         # merge | rebase — a rewrite outdates review threads
    max_rebase_commits: 20  # above this, merge instead of replaying; 0 disables
  lockfile_install: null    # verb that re-derives lockfiles, e.g. 'bun install'
  resolvers: []             # [{paths: ['docs/index.md'], run: 'sdlc docs generate'}]
  verify: none              # none | check | test, before a push
  repair:
    command: null           # last-resort command (e.g. an LLM call); trust-gated
    on: [conflict]          # conflict | verify-failed
  max_failed_attempts: 1    # skip a PR after this many failures at the same head and base; 0 = off

task:
  execution:
    spawn_from_post_mortem:
      enabled: true                  # spawn follow-up tasks from post-mortem friction bullets
      drive_to_ready: true           # best-effort drive each spawned task to open/ready
      fallback_status: planning/draft  # status when a task can't be driven to ready
      target:
        pr_grouping: per-task        # per-task | per-execution | per-project
        pr_title_pattern: null       # optional PR title template; null = mode default

backlog:
  capture:
    enabled: true                    # sdlc backlog create auto-opens/updates a PR
    target:
      pr_grouping: per-project       # per-project (rolling) | per-item
      pr_title_pattern: null         # optional PR title template; null = mode default

paths:                      # named directories; other path settings say {name}
  dev: ~/Developer

repos:                      # directories that CONTAIN checkouts, at any depth
  - '{dev}'

checkout:                   # sdlc repo checkout <url>
  layout: '{dev}/{repo}'    # tokens: {host} {owner} {repo} + every paths: name
  protocol: https           # https | ssh, for a bare owner/repo input

host:
  default: terminal         # terminal | orca | cmux | tmux | herdr | otty | wezterm | vscode | jetbrains
  close_pane: on-close-out  # when sdlc closes a session's host pane: on-close-out | on-done | never

pr_review:                  # sdlc pr review
  profile: reviewer         # a profiles: name; or `tool: codex` — exactly one
  untrusted: skip-init      # skip-init | full | refuse
  setup: true               # run setup on every launch; --no-setup skips it
  refresh: update           # update | pull | off, for a reused worktree; --no-refresh skips it

verify:                     # sdlc verify changes
  tool: claude/haiku@low    # a reference, or profile: <name> — exactly one
  blocking: false
```

Every top-level key is optional. An entirely empty file (or a missing
file) is valid and means "no preferences set." The schema is `.strict()`
at every level, so typos (e.g. `workflow:` instead of `workflows:`) are
caught — see the validator output for the specific key name.

## Keys — the "why" (the "what" is in the schema)

### `workflows:` — named lifecycle commands

A map of name → an ordered list of steps, resolved and executed by the one
shared cascade every lifecycle-command consumer calls through
([[D-LSLH-collapse-verbs-workflows-chain-hooks]]; see "Resolution: the
workflow cascade" below). A step is `{script: '<command>'}` (a shell command
line, invoked through a shell — `sh -c "<command>"`), `{run: '<name>'}`
(splices in another named workflow's own resolved steps, recursively —
see "Composing a workflow from named leaves" below), `{skill: '<name>'}` or
`{prompt: '<text>'}` (launches an agent session; only meaningful for the
built-in lifecycle names, never for a `hooks:` step). **A bare string in the
list is sugar for `{script: '<string>'}`** — a verb's old shell-command list
is spelled identically, just under this key.

`workflows:` is the canonical home for every lifecycle command this
project's tools run: `/sdlc:task-work` Step 4 (setup), Step 7 (check),
`sdlc pr review` (setup), ephemeral commit-worktrees (setup-hooks), and
`sdlc quality run` (any named entry). Baseline names `setup`, `setup-hooks`,
and `check` are run by SDLC itself; [[S-0013-baseline-task-vocabulary]] names
(`fmt`, `lint`, `test`, `build`, etc.) pass through unchanged; any other name
is allowed and validated for shape only. sdlc's own `setup`/`check` sit above
the S-0013 runner vocabulary — a project's S-0013 tasks (`moon run fmt`, etc.)
are typically what a `workflows:` entry invokes. An entry may also set
`profile` or `tool` (exactly one) and `host` with no `steps` at all — the one
place a workflow's binding and host live, read by `resolveWorkflow` and
dispatched by the orchestrate loop and `sdlc session launch` alike. `profile`
names a `profiles:` entry; `tool` is a reference (`codex`, `claude/opus@high`).
`engine` and `model` were removed: each is an unrecognized key.

`generate` is an optional project-defined name for the committed files a
change must rebuild before `check` (bundles, copied packs, generated docs,
goldens). sdlc ships no default list and knows nothing about what it builds;
`/sdlc:task-work` (after implementing and after a base rebase) and
`/sdlc:pr-respond` run it with `sdlc quality run --name generate
--allow-empty`, so a project that omits it no-ops.

Execution semantics:

- A `script`/bare-string step is invoked through a shell. Multi-word
  commands, pipes, and redirections work (`just full-check`, `cmd | grep
  foo`, etc.). Cwd varies by consumer: task-worktrees run in the worktree
  root; ephemeral commit-worktrees run in their detached root; other
  contexts (quality run) default to the project root or explicit override.
- Order matters: steps execute sequentially; the first failure aborts
  the run.
- Empty list (`workflows.check: []`) and missing name both mean "nothing" for
  baseline verbs, with one exception: `setup-hooks` absent falls back to
  `setup` (same cascade logic as below); explicit `[]` means no fallback.
- Under the orchestrator (`orchestrate run` and its ticks), a `script` step
  runs in its own process group and session. A kill, or a Ctrl-C to sdlc,
  then reaches every process the step started. The step has no controlling
  terminal, so a prompt on `/dev/tty` fails: an ssh passphrase on
  `git push`, a credential prompt, `pinentry-curses`. Set
  `process_group: false` on a `{script}` step that must prompt. A `SIGKILL`
  sent to the caller's process group (for example `timeout -s KILL`), or a
  `SIGKILL` of sdlc itself, does not reach a step in its own group and leaves
  its tree running. Once the step's `sh` exits, a process it left in the
  background that still holds the step's output is killed 250 ms later.
  Redirect its output (`cmd >/dev/null 2>&1 &`) to let it outlive the step.
  `sdlc run <workflow>` streams its steps with inherited stdio and keeps the
  terminal either way.

Examples:

```yaml
workflows:
  setup:
    - bun install
  check:
    - just full-check
    - npm run lint
    - npm test
```

```yaml
workflows:
  check:
    - solutions/ontological/cli/sdlc entities audit
    - bun test solutions/ontological/plugin/plugins/sdlc/skills/entities-audit/tests/run_evals.test.ts
```

#### Composing a workflow from named leaves

A `{run: <name>}` step splices in `<name>`'s own already-resolved steps —
recursively, guarded against a cycle by a threaded visited-name set (a real
cycle throws `OpError('SCHEMA_ERROR', 'workflow cycle: a → b → a')`; a
non-cyclical multi-level chain, e.g. a hook's `run: check` where `check`
itself composes four `run:` references, resolves fine). This is how the
[[S-0013-baseline-task-vocabulary]] names compose into `check` BY REFERENCE
rather than duplicating command lines:

```yaml
workflows:
  fmt-check:
    - bun run format:check
  lint:
    - bun run lint
  typecheck:
    - bunx tsc --noEmit
  test:
    - bun test
  check:                      # composed BY REFERENCE, not duplicated lines
    - run: fmt-check
    - run: lint
    - run: typecheck
    - run: test
```

Each command line lives in exactly one place; `check` is a plain list of
names. A project that wants CI to run a different test tier edits
`workflows.check` alone — the leaf entries don't move. By the time
`resolveWorkflow` returns, a `run:` step has always been spliced away: the
resolved list contains only `skill`/`prompt`/`script` steps.

#### Baseline-gated mode: isolating pre-existing drift

Some `workflows.check` entries (notably `sdlc entities audit`) audit the
entire entity corpus on every run and emit findings that may already
be present on `origin/main` — drift the current branch did not
introduce. Without a baseline, the gate forces every operator to
triage those pre-existing findings on every task pickup. To close
that friction, `sdlc quality run` accepts a memoized baseline
keyed on the `origin/main` SHA and gates only on findings the
current branch introduced.

Two flags participate:

- **`--baseline-dir <path>`** — directory holding the per-SHA
  baseline JSON files. Defaults to
  `<project-root>/.sdlc/quality-baselines/`. The directory is
  auto-created on capture and gitignored as part of `.sdlc/` — every
  developer's baselines are local-only; nothing is committed.
- **`--diff-against-baseline <sha>`** — switches the gate from raw
  exit codes to a finding-set diff against the baseline at
  `<baseline-dir>/<sha>.json`. Findings present in both surface on
  stderr prefixed `pre-existing: <verb>: <line>` (visible but
  non-gating). Findings present only on HEAD surface as
  `new-drift: <verb>: <line>` (visible AND gating). Exit 0 iff zero
  new-drift entries.

The baseline file is written by `sdlc quality baseline capture` —
typically invoked from `/sdlc:task-work` Step 3a against the
current `origin/main` SHA, well before any code is written. Its
on-disk shape is:

```json
{
  "sha": "<git sha>",
  "captured_at": "<iso8601 UTC>",
  "verbs": {
    "<verb>": {"exit": <int>, "findings": ["<line>", "..."]},
    ...
  }
}
```

Capture also prunes `<baseline-dir>` to the 5 most-recently-mtimed
JSON files on every call, so the cache stays bounded across
multiple in-flight branches without manual cleanup.

`--log` is incompatible with `--diff-against-baseline` because the
gate needs to capture each verb's stdout to compute the diff. Passing
both warns and coerces to `--line`.

## Resolution: the workflow cascade

Every tool that runs a named command list (task-work, pr review, quality run,
or ephemeral commit-worktree arming) calls the same resolver:
`resolveWorkflow(name, projectRoot)` (or its script-only-shaped wrapper,
`resolveWorkflowCommands`) from `lib/config/workflows.ts`. It picks the
effective step list for a name by walking layers in order, the highest layer
either fully REPLACING the layer beneath it or WRAPPING it (`prepend`/
`append`) — see [[D-LSLH-collapse-verbs-workflows-chain-hooks]] for the full
design:

| Layer | Where | Source tag | Whose |
|-------|-------|------------|-------|
| Environment | `SDLC_WORKFLOW_<NAME>` (uppercase, `-` → `_`), newline-separated; an empty value means `[]`; full replace only, never a wrap | `env` | the person's, a one-run override |
| Local | `<projectRoot>/sdlc.local.yaml` `workflows.<name>` (raw, its own layer) | `local` | the checkout's |
| Project | `<projectRoot>/sdlc.yaml` `workflows.<name>` (raw, its own layer) | `project` | the repository's |
| Default | Built-in step list in code, or (`setup` only) the heuristic below | `default` | sdlc's own, or inferred from the repository |
| None | Nothing — not env, not local, not project, not a builtin entry — named this `name` at all | `none` | — |

Every resolved step carries `{layer, mode}` provenance (`mode` is
`'default'`/`'replace'`/`'prepend'`/`'append'`) — `sdlc config explain
workflows.<name>` renders it directly, one line per step. The envelope
`layer` above is distinct from any one step's: it is `'none'` only when
NOTHING named `name` at all, which is what lets `sdlc run <name>` tell "nobody
has ever heard of this name" (a hard error) apart from "this name resolves to
zero steps on purpose" (a silent no-op) — see `lib/services/workflow/ops/run.ts`.

**The default heuristic (setup only).** When no config layer carries `setup`,
the resolver probes the repo with `detect-runners#collect`, passing
`allowExec: isRepoTrusted(repoRoot) || trust` — the ONE place trust changes
what a verb RESOLVES to, not merely whether it may run (see Trust, below). A
single `just`/`moon`/`mise` task named `setup`, `install`, or `bootstrap`
becomes `setup`. Otherwise, a single lockfile-driven package-manager install
(from `detectDeps`) becomes `setup`. More than one candidate at any step
(ambiguity) yields `layer: 'none'` — no guess. Under `allowExec: false`
(the repo is not trusted and no per-run `--trust` applies) only parse-kind
runners surface tasks: `just` does, `moon` and `mise` (exec-kind, readable
only by running them) contribute nothing until the repo is trusted (`sdlc repo
trust`) or a per-run `--trust` flag lets the probe execute.

**The `setup-hooks` fallback.** When `setup-hooks` is absent from all three
config layers (env, local, project), `resolveWorkflow('setup-hooks', …)`
walks the cascade FOR `setup` and returns that result verbatim (so `layer`
reports where `setup` actually came from). Explicit `setup-hooks: []` in any
layer means "no fallback" — that name is satisfied and setup-hooks runs
nothing.

**`run:` composition.** A `{run: <other>}` step is not a shell command — it
splices `<other>`'s own already-resolved steps in place, recursively
(cycle-guarded). See "Composing a workflow from named leaves" above. By the
time `resolveWorkflow` returns, its steps are always `skill`/`prompt`/
`script` only.

**Cross-repo validation.** When `projectRoot` differs from the preflight cwd
(e.g., `sdlc pr review <url>` targeting another repo), `resolveWorkflow`
validates the target's `sdlc.yaml` and `sdlc.local.yaml` (when present),
throwing `OpError('SCHEMA_ERROR', …)` so a stale key fails loudly rather than
silently defaulting. Callers that choose `validate: false` skip only this
extra check (used internally when recursing into a `run:`/fallback splice);
`loadConfig` still throws on an invalid file.

**Unknown keys fail validation.** A top-level key the schema does not declare
fails Zod's ordinary unrecognized-key check, the same diagnostic as any typo
— including a leftover `verbs:` section from before this cascade collapsed
`verbs:`/`workflows:` into one. There is no migration shim for the retired
shape; [[D-LSLH-collapse-verbs-workflows-chain-hooks]] records what moved
where (superseding [[D-V2XJ-verb-cascade-and-repo-trust]], which specified the
now-retired `verbs:`-only cascade).

**The gate rule.** A resolved step whose `layer` is `local`, `project`
or `default` was read from inside the repository being acted on, and runs
only when that repo is trusted (`sdlc repo trust`) or the caller passes
`--trust` for this run on a command that offers it. The gate asks about the
REPOSITORY owning the root it is handed, not that directory: a linked
worktree and a subdirectory resolve to the main checkout `sdlc repo trust`
grants, so one grant covers every worktree of a repository and the two
surfaces cannot disagree. A command with no `--trust` flag (the ephemeral
commit-worktree arming, which runs unattended) says so — its refusal names
`sdlc repo trust <root>` and nothing else. `env`-sourced steps — the person's own shell — run
ungated, and so does `layer: 'none'` (nothing to gate). Every verb-running
call site checks this immediately before its resolved list executes, never
before resolution; see Trust, below.

## Trust

Some things a tool does to a repository it did not write are code execution
in disguise — running that repository's own scripts, evaluating its build
config. A setting the repository itself can write (`sdlc.yaml`,
`sdlc.local.yaml`) cannot be what authorizes that, because a repository that
can write the setting can grant itself permission. So a person consents
once, per repository, outside the repo, and sdlc remembers the answer.

The consent lives in `$XDG_STATE_HOME/sdlc/trusted/`, or
`~/.local/state/sdlc/trusted/` when unset — deliberately outside the repo
and outside `sdlc.yaml`'s own directory, the way `@sksizer/cli-tool/trust`
(the reusable store this is built on) keys every decision on the absolute,
symlink-resolved repository root. `SDLC_TRUST_STATE=<dir>` relocates the
store outright (tests only; never point it at a real trust directory).

```sh
sdlc repo trust              # trust the repository owning the cwd
sdlc repo trust <path>       # trust the repository owning <path>
sdlc repo trust --list       # every trusted root on this machine
sdlc repo trust --show       # is the resolved root trusted, and its marker path
sdlc repo untrust [<path>]   # revoke a grant
```

`--trust` on a gated command that carries it (`sdlc quality run`, `sdlc pr
review`, `sdlc pr update`) satisfies the gate for that one run without
recording anything — a deliberate one-off, never a standing grant. Commands
without the flag have no per-run bypass at all.

**Layered on top of the fork rule.** `sdlc pr review`'s `pr_review.untrusted`
setting decides FIRST whether a FORK PR's own tree gets its setup verbs run
at all (a stranger's code, reviewed but not installed by default) —
`skip-init`, the default, withholds setup with a warning and never consults
repo trust. Only once that leaves setup verbs to run does the repo-trust
gate ask whether the TARGET repository's own checkout may run them. Both
must pass for setup to run on a fork PR review; `--trust` satisfies both for
one run.

### Policy: trust by path or owner

A machine can pre-trust a whole class of repositories instead of granting
each one by hand. `trust:` lives in the machine config only — never
`sdlc.yaml` — the same rule that keeps marker grants outside the repo: a
repository must not be able to grant itself trust. The policy engine itself —
the glob matcher and its dialect, the `origin`-owner lookup, and the
marker → path → owner precedence — lives in
[`@sksizer/sdlc-tool`](../../../packages/ts/sdlc-tool/README.md), the
repo-aware substrate downstream of cli-tool/typed-git/typed-gh that sdlc
mounts; see that package's README for the glob dialect and the
origin-remote threat model. What follows here is sdlc's own adapter: the
machine-file keys, `~`/`{name}` token expansion, and how `sdlc repo trust
--show`/`untrust`/`project doctor` report a decision.

```yaml
trust:
  paths: ['{dev}/sksizer/**'] # glob over the resolved, symlink-free repo root
  owners: ['sksizer'] # matched case-insensitively against origin's owner
```

Both default to `[]`. A `paths` entry's `~` and `{name}` tokens expand the
same way a `repos:` entry's do, against the machine's own `paths:` — never
the target repo's `sdlc.yaml`, which the repository being judged could
otherwise use to steer its own trust decision.

**Resolution order**: a marker grant (`sdlc repo trust`) wins first, then
`trust.paths`, then `trust.owners` — the first layer that matches decides.
`sdlc repo trust --show` reports which one (`by`) and, for a policy hit, the
matching rule; `sdlc project doctor`'s trust block does too.

**This is written config, not consent.** A marker grant is a one-time,
per-repository decision made by hand, outside any file a dotfiles sync would
carry. A `trust:` policy is a line in a file that DOES travel with a
dotfiles sync — pushing it to a new machine re-grants it there with no
prompt. Write one only as a deliberate standing decision ("every repo I
clone under this directory is trusted"), never as a shortcut past
`sdlc repo trust`.

**The fork rule is unaffected.** `pr_review.untrusted` still decides FIRST
whether a fork PR's own tree runs setup at all, before repo trust — marker
or policy, no difference — is even consulted (see above).

## sdlc.local.yaml

An optional, uncommitted file at `<project-root>/sdlc.local.yaml`, beside
`sdlc.yaml`. Gitignored by `sdlc project setup`. Accepts every key the
project file accepts; deep-merged over the project config BEFORE validation
(mappings merge recursively per key, lists and scalars replace wholesale).

Use it to override one verb without editing the project file:

```yaml
workflows:
  check:
    - just full-check-local
```

The resolver reports `layer: 'local'` when the verb came specifically from
this file, not from the underlying project config. The strict-validation
surfaces (`resolveWorkflow`'s loud path, and the per-op preflight gate)
validate `sdlc.local.yaml` on its own — a read/parse/non-mapping error or an unknown
key fails loudly naming the local file — before also validating the two
merged together. `loadConfig`/`loadConfigLayers` likewise throw on an invalid
local file; the standalone check names which file is at fault, and reads the
layers through the unvalidating `readConfigLayers` so it can look at a broken
one.

`sdlc config scaffold --local` renders a commented template of the full
shape.

### `orchestrator:` — in-flight limits for `/sdlc:orchestrate`

The `orchestrator:` block configures the categorized in-flight limits
that `/sdlc:orchestrate` enforces during its dispatch step, plus the
concurrency caps the `work`/`prs`/`merges`/`issues` ticks gate every
dispatch against, in two pools under one optional overall `total`. A
start is allowed only when its own cap, its pool's `total` and the overall
`total` all have room. The `executor` pool covers task execution; the
`schedule` pool covers scheduled runs, enforced by the schedule loop
(T-URC0):

```yaml
orchestrator:
  limits:
    executor:          # task execution pool
      implement: 5     # default
      pr_review: 2     # default
      pr_respond: 3    # default
      pr_update: 5     # default
      pr_merge: 3      # default
      close_out: 5     # default
      issues: 2        # default
      # total: unset — no executor-pool cap by default
    schedule:          # scheduled-run pool
      total: 1         # default
    session_ttl_minutes: 180   # default
    # total: unset — no overall cap across both pools by default
  max_awaiting_review: 20   # default
```

- **`limits.executor.implement:`** — hard cap on concurrent `implement`
  dispatches: tasks currently in the `implementing` category (state
  `in-progress`, no open PR), read via `sdlc task inflight`. Counts
  sessions already running from earlier passes plus this pass's own
  dispatches. At or above this limit, the `work` tick does NOT
  dispatch any new `/sdlc:task-work` sub-agent this pass — the
  candidate stays eligible for the next one (no cursor/round advance,
  no lease taken). The `issues` tick's `define`/`implement`/`check`/
  `judge` advances count against this cap too; when `work` has not
  run first in the pass (`--loop issues` alone), the `issues` tick
  seeds the same `task inflight` count itself, so it can never push
  past the cap while tasks are already implementing. Default: `5`.
- **`limits.executor.pr_review:`** — cap on concurrent `pr-review` dispatches
  (the `prs` tick's new-PR path). Counted from live `.sdlc/log/sessions/`
  records plus this pass's own dispatches (see
  `limits.session_ttl_minutes` for what "live" means). Default: `2`.
- **`limits.executor.pr_respond:`** — cap on concurrent `pr-respond`
  dispatches (the `prs` tick's NEEDS-RESPONSE/CI-FAILED path,
  `merges`' CONFLICTS path, and a `respond` chain-stage advance from
  the `issues` tick). Durable for fresh dispatches, per-pass for
  resume: the Router's `fresh` route (and the direct non-Router
  dispatch) goes through session launch and leaves a session record a
  later pass counts, but a Router `resume` delivery bypasses session
  launch entirely, so a `resume` still running from an earlier pass is
  invisible to the count (an accepted under-count) and counts only
  within the pass that started it; a `live` delivery into an
  already-running session starts no new session and never counts at
  all. Default: `3`.
- **`limits.executor.pr_update:`** — cap on concurrent `pr-update` dispatches
  (the `merges` tick's stale-branch fan-out). Counted per pass only:
  it is a deterministic script step, not an agent session, so no
  session record exists to scan on a later pass. Every attempt counts,
  whether the script exits clean or not. The built-in
  `pr-update` workflow runs `sdlc pr update --pr {pr} --apply`, so each
  dispatch can push a rebased or merged head: this cap bounds that
  rebase/merge work. Default: `5`.
- **`limits.executor.close_out:`** — cap on concurrent `close-out` dispatches
  (the `merges` tick's MERGED-verdict path, and a `close-out`
  chain-stage advance from the `issues` tick). Counted from live
  `.sdlc/log/sessions/` records plus this pass's own dispatches. A merged
  PR leaves the open-PR listing, so a close-out a cap (or a pause)
  holds back is recorded in `.sdlc/orchestrator-pending-close-outs.json`
  and retried first on the next pass. Default: `5`.
- **`limits.executor.issues:`** — cap on concurrent chain-stage advances
  dispatched by the `issues` tick, enforced IN ADDITION to whichever
  of the caps above the advanced stage's own workflow counts against.
  Counted per pass only (the underlying stage's own cap carries the
  durable count). Default: `2`.
- **`limits.executor.pr_merge:`** — cap on PR merges the `merges` tick
  performs in one pass. Counted per pass only: a merge is a deterministic
  op call, not an agent session. Default: `3`.
- **`limits.executor.total:`** — optional cap across ALL of the executor
  operations above combined, checked in addition to each one's own
  limit. Reported as `limit executor <n>/<cap>`. Unset by default: no
  executor-pool cap. Schedules do not count here.
- **`limits.schedule.total:`** — cap on schedule entries running at once.
  Counted from the schedule run lock and state file, not from session
  records, so a script-only run counts too. The schedule loop (T-URC0)
  enforces this pool; the orchestrate ticks do not yet. There is no
  per-entry cap: an entry never overlaps itself. Default: `1`.
- **`limits.total:`** — optional machine-wide cap across BOTH pools:
  every executor operation plus every running schedule entry, checked in
  addition to each one's own cap and its pool total. Reported as
  `limit total <n>/<cap>`. Unset by default: no overall cap.
- **`limits.session_ttl_minutes:`** — how long a session record with
  no recorded `pid` still counts as running toward the session-counted
  caps (`executor.pr_review`, `executor.pr_respond`, `executor.close_out`). A headless launch
  stamps the spawned engine's pid on its record, and a record with a
  pid counts only while that process is alive, so a session orphaned
  by a killed orchestrator stops blocking once its process is gone; a
  pid-less record has no such signal, so this age bound keeps it from
  counting forever. The sessions directory is scanned once per pass
  and the counts cached for that pass. Default: `180`.

Every cap above accepts `0`, meaning that operation is disabled: each
candidate is skipped with `limit <op> 0/0` (and `limits.total: 0`
disables them all).

- **`max_awaiting_review:`** — informational ceiling on the count
  of tasks in the `awaiting-review` category (state `in-progress`
  AND an open PR exists for `task/<basename>`). When the count is
  at or above this limit, the orchestrator's digest line records
  `caps-reached=max_awaiting_review` as a warning so the human knows
  the review queue is saturated. **It does NOT block new
  implementations from starting** — awaiting-review tasks have
  already handed control back to the human; they don't consume
  implementation slots. Default: `20`.

A limit that blocks an item never advances its cursor, records a
review round, or takes a lease — the item stays eligible for the next
pass. For the `prs` tick that includes the PR comment cursor: a
blocked item commits nothing, so comment-only feedback is still unseen
next pass, and a new PR keeps its first `pr-review` (the cursor's
`first_review_at` is stamped only when that review is actually
dispatched, not when the PR is first classified). Each tick's per-item
plan output (`sdlc orchestrate run --dry-run`) reports a blocked item
as `action=skip reason="limit <op> <count>/<cap>"`, and the tick
summary line's `caps-reached=` field collects the distinct reasons hit
that pass in a space-free, comma-joined form
(`caps-reached=limit:pr_review:2/2,limit:total:7/7`) so readers that
split the line on whitespace keep the whole value (see
`ticks/_limits.ts`, the one shared gate/count helper every tick reads
through).

A third inflight category — `stale` — surfaces in the digest but never
counts against any limit. Stale = worktree still exists but the
task file's frontmatter is already `closed/...`; the close-out
teardown missed something and the digest is the surface for the
human (or a follow-up tick) to clean it up.

The counter behind `limits.executor.implement`'s durable share is `sdlc task
inflight` — see its `--help` for the schema of its JSON output. The
orchestrator shells out to it once per tick.

Missing block or missing keys default to `limits.executor.implement: 5` (and
the rest of `limits`' own defaults) and `max_awaiting_review: 20`. An
empty `orchestrator: {}` block is treated the same as missing. The
retired top-level `orchestrator.max_implementations` key is now an
unrecognized key — a leftover copy of it fails validation the same
way any other typo would, rather than being silently accepted.
A
config that fails validation stops every sdlc command (see "Single
hydration point"), `orchestrate run` included, `--dry-run` too.

#### `orchestrator.review:` — the built-in `pr-review` dispatch

```yaml
orchestrator:
  review:
    max_rounds: 3    # default
    response_policy: docs/planning/standards/S-0018-review-response-policy.md

workflows:
  pr-review:
    tool: codex      # the prs/merges ticks' dispatch tool — see below
```

Configures the `prs`/`merges` ticks' (`sdlc orchestrate run`) built-in
`pr-review` workflow dispatch. The dispatch MODEL is no longer set here —
`orchestrator.review.engine` was retired
([[D-LSLH-collapse-verbs-workflows-chain-hooks]]) in favor of
`workflows.pr-review.profile` or `.tool`, the one place a workflow's
binding/host live (see `workflows:` above). It is deliberately separate from
`pr_review.profile`/`pr_review.tool` (the interactive `sdlc pr review`
binding) so an unattended review can run a different model from the one the PR
author used. The author is recorded in the lease and the PR footer, but the
dispatch does not read it yet. Default: the built-in `profiles.default`
(`*/standard`) when none is set.

Every orchestrate/`sdlc run` dispatch is HEADLESS — there is no person
sitting at a terminal to attend it — so it is routed as a headless launch
(`lib/services/route/launch.ts`): a profile's walk skips an entry whose tool
sdlc cannot launch headless, or whose launcher cannot take the resolved model
and effort, and a `tool:` reference that cannot launch is rejected before any
step runs (`orchestrator/step-runner.ts`'s `runWorkflow`), not left to fail
partway through a step. claude, codex, cursor (no model or effort), antigravity
and a tool declared with a `router.tools.<id>.headless` template launch
headless; pi and opencode launch interactive only. An interactive `sdlc session
launch --workflow` is routed as an interactive launch instead.

- **`max_rounds:`** — cap on review/respond round-trips per PR
  (tracked on the per-PR cursor's `review_rounds` field) before the
  loop stops dispatching `pr-review`/`pr-respond` for that PR and
  fires a `max-rounds` notification instead of looping forever.
  Default: `3`.
- **`response_policy:`** — repo-relative path to a standard document
  the `pr-respond` skill triages review comments against: fix /
  decline-with-a-reply / verify-before-acting / minimize-churn /
  loop-guard-at-`max_rounds`. Unset (the default) falls back to a
  short built-in policy inlined in the skill's own prose, which states
  the same triage shape. `S-0018-review-response-policy.md` is the
  editable, project-tunable version — point this key at a project's
  own copy to change the triage rules without editing the skill. Read
  via `sdlc config get orchestrator.review.response_policy`, and also
  surfaced in the Router's feedback bundle
  (`lib/services/dispatch/feedback.ts`'s `responsePolicyLine`) so a
  `resume`/`live` delivery — which sends the bundle as a bare
  follow-up prompt, never re-reading the `pr-respond` skill's own
  instructions — still knows which policy governs its reply. This key
  is a DIFFERENT document from `S-0017-code-review-rubric.md` (no
  config key of its own — `sdlc verify changes` applies it by matching
  every standard whose `applies_to.paths` encloses a changed file, not
  by a named key): S-0017 judges a diff when it's opened;
  `response_policy` governs how a session responds to feedback on a
  diff already opened.

Missing block or missing key defaults to `max_rounds: 3` and no
`response_policy` (built-in fallback); a missing `workflows.pr-review` binding
falls to the built-in `profiles.default` (`*/standard`). (An earlier `command`
field here backed the OLD `/sdlc:orchestrate` Step 2a opt-in review phase; that
phase and its `get-review-policy` op were retired when the orchestrate skill was
rewritten as a thin `orchestrate run` wrapper — see [[T-XRFD]].)

#### `orchestrator.router:` — delivering PR feedback into its producing session

```yaml
orchestrator:
  router:
    enabled: true                        # default
    routes: [live, resume, fresh]        # default
    live_enabled: false                  # default
    max_deliveries_per_pr: 20            # default
    quiet_period_secs: 120               # default
    receipt_timeout_ms: 15000            # default
```

The Router (M-27ZR, `lib/services/dispatch/`) is how the `prs`/`merges`
ticks deliver a PR's review comments, failing checks, or merge conflicts
back to the session that produced the PR, instead of always paying for a
brand-new, context-less `pr-respond` sub-agent. It tries an ordered
fallback chain and stops at the first route that succeeds:

- **`live`** — send text into a still-running session (any host with
  a `send` part — every host but `terminal`). Off by default
  (`live_enabled: false`) for the `prs`/`merges` loop — unverified
  end-to-end against a real hosted session. An explicit
  `sdlc pr route <n> --route live` still attempts it regardless of
  this flag: that is a single manual op confirming the route works
  from the pane, not the loop-wide default turning on.
- **`resume`** — a headless native resume of the originating harness
  session (`claude -p --resume=<id> -- <message>` /
  `codex exec resume <id> -- <message>`) with the feedback bundle as
  the follow-up prompt. A claude resume passes the launch's plugin and
  prompt-pin flags again, read from the session record. The common case
  once a task's session record has a `harnessSessionId`.
- **`fresh`** — today's cold dispatch: open a brand-new `pr-respond`
  sub-agent with the feedback as its prompt. Always reachable once a
  PR number is known; the terminal fallback when no session can be
  resolved or every earlier route fails.

Delivery is idempotent per feedback item (a signature-keyed
`DeliveryRecord` — the same comment is never redelivered) and gated by
the same per-task operation lease and `orchestrator.review.max_rounds`
cap `pr-respond` itself already respects.

- **`enabled:`** — whether the `prs`/`merges` ticks route feedback
  through the Router at all. `false` restores the pre-Router
  cold-dispatch-only behavior for every tick's OWN automatic
  reconciliation; `sdlc pr route`/`sdlc task dispatch` (below) can
  still be invoked manually regardless of this flag. Default: `true`.
- **`routes:`** — the ordered fallback chain itself; a route missing
  from this list is never attempted. Default: `[live, resume, fresh]`.
- **`live_enabled:`** — whether the `prs`/`merges` loop may actually
  run `live` even when `routes` lists it. Default: `false` (see
  above). Does not gate an explicit `sdlc pr route <n> --route live`.
- **`max_deliveries_per_pr:`** — cap on entries kept in one subject's
  `DeliveryRecord` attempt history (oldest dropped past this); does
  NOT cap how many distinct items can be delivered. Default: `20`.
- **`quiet_period_secs:`** — seconds to wait after the newest undelivered
  comment or review before delivering, so a burst of comments goes out as
  one batch. Failing checks and conflicts never start the wait;
  `sdlc pr route --force` and `--route` skip it. `0` turns it off.
  Default: `120`.
- **`receipt_timeout_ms:`** — milliseconds a `live` send waits for a delivery
  receipt: the host confirming it, a harness hook reporting the prompt (armed only
  when `log.capture.activity` is on and the session is not mid-turn), or
  weaker signs the agent started a turn. A receipt that never arrives while a
  confirming signal was expected sends the delivery on to `resume`/`fresh`
  (or holds while the session runs); with none expected, the send counts as
  unconfirmed. `0` checks once and does not wait. Default: `15000`. See
  `solutions/ontological/conventions/host.md`.

Missing block or missing key defaults to all the values above.

#### `orchestrator.polling:` — skipping unchanged PRs

```yaml
orchestrator:
  polling:
    full_refresh_secs: 900               # default
```

The `prs` tick lists open PRs with their `updatedAt` first. A PR whose
`updatedAt` matches what its cursor recorded on the last full fetch keeps
its cached verdict and is not fetched again, until that fetch is older
than `full_refresh_secs`. A PR whose last verdict was `CI-BLOCKED`,
`NEEDS-RESPONSE` or `CI-FAILED`, or whose checks were still pending, is
always fetched: GitHub does not bump
`updatedAt` for check runs or base-branch moves. `0` fetches every PR
every tick. Default: `900`.

##### Pausing the orchestrator

`sdlc orchestrate pause [--loop work|prs|merges|issues|schedule]...` /
`sdlc orchestrate resume [--loop ...]` / `sdlc orchestrate status` are
runtime switches, not `sdlc.yaml` config — they persist to
`.sdlc/pause.json` in the main checkout (gitignored, shared by every worktree,
`lib/services/dispatch/pause.ts`), so a
running `sdlc orchestrate run --loop ... --interval ...` foreground
loop picks up a pause on its very next tick without a restart. No
`--loop` means all five loops; repeating the flag composes (two
separate `pause --loop prs` / `pause --loop work` calls both end up
paused, not the second replacing the first). Both `pause` and `resume`
accept `--dry-run` to preview the resulting state without writing it.

While paused, a tick still classifies open PRs/issues, still runs
`task next`/`task inflight`, and still logs to
`.sdlc/orchestrator-log.md` — pause gates dispatch ONLY, never
read-only survey/classification/logging. Every mutating step of a
paused loop is gated, not just its main dispatch: `work.ts`'s
per-candidate `define`/`implement`/`check`/`judge` dispatch,
`prs.ts`'s `pr-review`/`pr-respond` dispatch (both the pre-Router
path and the Router `deliver()` call), `merges.ts`'s close-out
(step 1), `pr-update` fan-out (step 3), and CONFLICTS dispatch
(step 4), and `issues.ts`'s per-issue dispatch/relabel all report
`claim: 'paused'` (or, for `merges.ts`'s `pr-update` fan-out,
`ran: false, paused: true`) per item instead of running.
`merges.ts`'s step 5 survey/requeue signal is the one merges-tick
part that keeps running regardless — it is genuinely read-only.
`ops/run.ts` folds a paused `merges` tick's step-1/3 skip counts
into one `PAUSED: loop=merges detail="skipped close-out/pr-update
for N PRs"` line, and a paused `issues` tick's skip count into one
`PAUSED: loop=issues detail="skipped dispatch/relabel for N
issues"` line, on the tick digest so an operator watching the log
can see the pause actually took effect (see `ticks/work.ts`,
`ticks/prs.ts`, `ticks/merges.ts`, `ticks/issues.ts`, and
`ops/log-tick.ts`'s `PAUSED:` event).

`issues.ts`'s workflow-bound dispatch (`define`/`implement`/`check`/
`judge`/`review`/`respond`/`close-out`) claims, for each stage, the
SAME operation lease the sibling tick that could independently pick
up that exact item claims for that exact stage — never one blanket
lease:

- `define`/`implement`/`check`/`judge` claim `work.ts`'s own per-task
  lease (`orchestrate-work/<basename>`, `ticks/_op_lease.ts`) — an
  issue's linked task can independently surface as a `task next`
  candidate for `work.ts`'s own ready-task walk.
- `review`/`respond` claim `ticks/_pr_action.ts`'s own per-PR lease
  (`orchestrate-pr-review`/`orchestrate-pr-respond`, keyed by PR
  NUMBER, never the task basename) — the SAME lease `prs.ts` claims
  for its own verdict-driven `pr-review`/`pr-respond` dispatch of that
  exact PR.
- `close-out` claims `ticks/_close_out.ts`'s own lease
  (`orchestrate-merge-close-out/<basename>`) — the SAME lease
  `merges.ts` claims for its own MERGED-verdict close-out dispatch of
  that exact basename.

A stage bound to a workflow `_pr_action.ts` doesn't recognize (a
project override of `review`/`respond` to something other than
`pr-review`/`pr-respond`) is parked with a logged reason instead of
guessing which lease namespace to claim. Losing any of these claims to
a live holder skips the issue for the tick (`claim: 'lost'`, no
relabel) rather than racing it; a dispatched workflow that fails fires
the same `task.parked` notification `work.ts` fires on its own
dispatch failures.

##### Manual per-item dispatch

Two ops bypass every loop and every pause switch by construction, for
acting on ONE task or ONE PR on demand:

- **`sdlc pr route --pr <n> [--route live|resume|fresh] [--force]`** —
  runs the exact same Router `deliver()` chain the `prs`/`merges`
  ticks use, for one PR, right now. `--route` skips straight to one
  route (still subject to the lease/max-rounds/signature gates);
  `--force` bypasses ONLY the signature dedupe, never the lease or
  max-rounds gate. `--dry-run` previews the route without claiming a
  lease or writing a delivery record.
- **`sdlc task dispatch <basename>`** — runs the same
  define/implement/check/judge sequence the `work` tick's loop would,
  for one task, right now (`dispatchOneTask`, shared code with
  `ticks/work.ts`). No `--force` (the lease pair is the only
  concurrency guard, and force-stealing an actively-held lease would
  let two runs collide on the same worktree); `--dry-run` reports the
  plan without claiming a lease or running a workflow.

Both are the escape hatch for "the loop is paused (or a tick simply
hasn't run yet) but I want this one item handled now" — they read no
pause state at all, so they work identically whether the orchestrator
is paused or not.

### `pr_check:` — comment-filtering for `/sdlc:pr-check` and `orchestrate watch`

```yaml
pr_check:
  author_comments: actionable   # actionable (default, solo) | self-notes (team)
  ignored_authors:              # extra automation bots to filter (optional)
    - vercel
    - dependabot
```

- **`author_comments: actionable`** (default) — review comments and
  submitted reviews authored by the PR author themselves count as
  actionable feedback and can flip `NEEDS-RESPONSE`. This is correct
  for solo-developer repos where the PR author and the reviewer are
  the same human; without it, every comment the author leaves on
  their own PR is silently filtered out and the orchestrator's PR
  triage stays stuck at `CLEAN` forever.
- **`author_comments: self-notes`** — exclude entries whose
  `author.login` matches the PR's `author.login`. This is correct
  for multi-developer teams where author comments on their own PR
  are usually notes-to-self, not actionable feedback waiting on a
  response.
- **`ignored_authors`** — project-specific automation logins whose
  comments and reviews never count as actionable feedback (and never
  wake `orchestrate watch`). This list ADDS to the always-applied
  built-in set; it is the place to silence a project's deploy-preview
  or dependency bots without a plugin release.

**Automation authors are always excluded regardless of `author_comments`.**
The built-in set is `github-actions` and `cloudflare-workers-and-pages`;
`ignored_authors` extends it. Matching is **shape-normalized** — a trailing
`[bot]` suffix is stripped before comparison, so the filter catches both the
suffix-less login `gh pr view --json` (GraphQL) returns (`github-actions`) and
the suffixed login `gh api` (REST) returns (`github-actions[bot]`). An
`ignored_authors` entry may be written in either shape; both match.

Missing block, missing key, or an unrecognised value all default to
`actionable` (and an empty/absent `ignored_authors`). An unrecognised
`author_comments` value also logs a one-line warning to stderr so the
misconfiguration is visible.

The default favours solo workflows because that's the most common
shape today; an explicit setting in `sdlc.yaml` (even when it
matches the default) makes the project's choice auditable rather
than implicit.

### `pr_update:` — scope and strategy for `sdlc pr survey` / `sdlc pr update`

Every key has a default and the whole block is optional, so both verbs
work in a repository with no `sdlc.yaml` at all. Flags override config;
config overrides the built-in defaults.

**Why `rebase` is the default.** A rebase keeps each PR's history linear
and its diff exactly its own commits. That matters most in a stack: a
merge leaves every descendant carrying one merge commit per ancestor
update, and this repository runs stacks seven deep. The usual argument
against — that rewriting outdates review threads — is handled by a guard
rather than by defaulting the whole project to `merge`.

**Why the guards exist.** What a rebase costs is a force-push, and
`--force-with-lease` protects less than it appears to: it compares
against the *remote* ref, so a checkout holding commits nobody has
pushed leaves the lease satisfied and the work destroyed. Hence:

- `unpushed_local:` is checked before everything, `overrides:` included.
  It is a data-safety interlock, not a preference, and there is
  deliberately no way to switch it off. A branch whose state cannot be
  read counts as unsafe.
- `reviewed:` keeps review threads anchored on the one kind of PR where
  a rewrite loses something a human wrote.
- `max_rebase_commits:` bounds replay cost. A rebase re-resolves a
  conflict once per commit; a merge resolves it once. Past some branch
  length that trade stops paying.

`overrides:` is for explicit intent — pinning a protected base to
`merge`, or letting a label opt one PR out. A rule matches when every
field it declares matches, and a rule declaring neither `base:` nor
`label:` is inert rather than a silent global default. Overrides beat
`reviewed:` and `max_rebase_commits:`; they do not beat
`unpushed_local:`.

Guards only ever step down from `rebase`. Nothing in this block turns a
configured `merge` into a rebase.

`lockfile_install:`, `resolvers:`, `verify:` and `repair:` are `sdlc pr update`'s
business — how a conflict is resolved without a human, and what must pass
before the result is pushed.

A conflict in a derived file is not a judgement call: the answer is to re-run
whatever derives it. `resolvers:` is where a project says which globs a verb
owns; `sdlc pr update` runs each matched verb once, whatever number of paths
it claimed, and stages the result. Lockfiles are recognized without
configuration, but re-deriving one needs a command only the project knows, so
`lockfile_install:` supplies it — without one, a lockfile conflict is left for
a human rather than resolved to a file that disagrees with its own manifest.

A conflicted path nothing claims ends that PR's update and the run moves on.
Guessing at a source file would be worse than reporting it.

`repair.command:` is the opt-in exception. When it is set, `sdlc pr update
--apply` runs it once in the update worktree for a problem the deterministic
rungs left: an unclaimed `conflict`, and a failed verify step when `on:` lists
`verify-failed`. It receives the request as JSON on stdin and in
`PR_UPDATE_*` variables, edits files, and exits 0 to claim success. It must
not commit, move HEAD or create refs. `sdlc pr update` checks for that, for
leftover conflict markers and for `git diff --check` errors, then commits,
re-runs `verify` and pushes itself. A rehearsal never runs it. The command
is project-sourced, so it is trust-gated like `verify: check` below.

`max_failed_attempts:` stops `sdlc pr update` retrying a PR that will fail the
same way. Each `conflict` or `failed` result from an `--apply` run is recorded
in `.pr-update/attempts.json`, keyed by the head and base sha. Once a PR has
failed that many times at its current head and base, later runs skip it until
either branch moves. A successful update clears the record. The default is
`1`; `0` turns the check off, and `--retry-failed` ignores it for one run.

`sdlc pr update --interactive` shows the same plan as a checklist and runs
only the rows you tick — the per-PR call is the one a person actually wants
to make. Rows the guards refused are shown, greyed, with their reason, and
cannot be ticked; a keystroke is not an argument against a safety guard.

`verify:` defaults to `none`: the deterministic tier only ever produces a
merge git resolved itself or an artifact a generator rebuilt, and running a
project's whole gate once per PR does not scale across a fifty-PR run — CI on
the PR is the real gate. Set `check` where a bad push is expensive.

`verify: check` resolves and runs `workflows.check` (via
`resolveWorkflowCommands`) exactly like `sdlc quality run` — a project-sourced
verb list, so it is trust-gated
the same way (see Trust, above): the repository must be trusted (`sdlc repo
trust`) or the run must pass `sdlc pr update --trust`, or it exits
`UNTRUSTED` before touching any PR.

`verify: test` runs `workflows.test` the same way, but only a list set in
`sdlc.yaml`, `sdlc.local.yaml` or `SDLC_WORKFLOW_TEST`. It never falls back to
a detected test task. Record one once with `sdlc config pin-test` (or accept it during `sdlc
init`): it detects the test command, asks `[Y/n]` on a terminal, and writes
`workflows.test`. `--yes` skips the question and `--command <cmd>` records a
given command; a detected command never replaces a different recorded one.
When `workflows.test` resolves to no command (unset, `[]`, or a `run:` to an
unset name), `sdlc pr update` fails before touching any PR and names `sdlc
config pin-test`.

Scope is the repository at `--project-root` unless `--repo owner/name` names others; those are found
through the top-level [`repos:`](#repos--where-other-repositories-live-on-this-machine) containers.
Drift and conflict prediction read git objects, so a repository named with `--repo` but with no
checkout on this machine is reported as unmeasurable rather than guessed at.

### `task.execution.spawn_from_post_mortem:` — how `/sdlc:task-work` spawns follow-ups

```yaml
task:
  execution:
    spawn_from_post_mortem:
      enabled: true                    # default true
      drive_to_ready: true             # default true
      fallback_status: planning/draft  # default planning/draft
```

Governs the Step 8 post-mortem → follow-up-task flow (the spawn-from-post-mortem procedure, which
hands each bullet to `/sdlc:spawn-task-pr`). Read once per `/sdlc:task-work` run via
`sdlc config get-spawn-policy`.

- **`enabled`** — whether Step 8 spawns follow-up tasks at all. `false`
  skips the spawn sub-step entirely (the post-mortem is still written and
  committed); Step 8 emits a `SPAWN-DISABLED:` no-op line and moves on. Use
  it to turn off automatic follow-up generation for a project that triages
  friction by hand.
- **`drive_to_ready`** — whether each spawned follow-up is best-effort driven
  to `open/ready` before its PR opens. `true` runs
  `/sdlc:task-auto-define` then `/sdlc:task-ensure-ready` on the scaffolded
  task: when the spec can be synthesized from the friction bullet plus
  codebase context AND passes the readiness gate, ensure-ready promotes the
  task to `open/ready` with `readiness_verified_at:` stamped, and it carries
  an `AUTO-DEFINED:` review note. When the spec can't be synthesized, the
  task lands at `fallback_status`; when it fails the gate, at
  `planning/needs-definition`. The drive is best-effort — it never
  fabricates a spec and never fails the spawn.
- **`fallback_status`** — the `planning/*` status a follow-up lands at when it
  is NOT driven to ready (either `drive_to_ready: false`, or auto-define
  couldn't synthesize the spec). Must be a non-ready planning status
  (`planning/draft`, `planning/needs-definition`, `planning/proposed`,
  `planning/backlog`); default `planning/draft`. Set
  `planning/needs-definition` to route undriveable follow-ups straight into
  the definition backlog — note that with `drive_to_ready: true` this value
  also skips the drive entirely, since `planning/needs-definition` isn't a
  status `/sdlc:task-ensure-ready` accepts as input; the follow-up lands
  there directly instead of the gate ever running.

Missing block or missing keys default to `enabled: true`,
`drive_to_ready: true`, `fallback_status: planning/draft`. A `drive_to_ready`
pass costs an LLM auto-define per spawned follow-up, so a project that spawns
many follow-ups and prefers hand-authored specs can set `drive_to_ready: false`.

#### `target:` — which PR a spawned follow-up lands in, and its title

```yaml
task:
  execution:
    spawn_from_post_mortem:
      target:
        pr_grouping: per-task        # per-task | per-execution | per-project
        pr_title_pattern: null       # optional; null = each mode's default title
```

Controls how spawned follow-ups are packaged into PRs. **Grouping is per
target repo** — classification routes `Local` / `Upstream-plugin` /
`Cross-project-request` follow-ups to different repos, and a PR cannot span
repos, so the modes below bundle *within each target repo*.

- **`pr_grouping: per-task`** (default) — one PR per spawned task, on
  `meta-task/<slug>`. Today's behavior; each gap is independently reviewable.
- **`pr_grouping: per-execution`** — one PR per `/sdlc:task-work` run,
  bundling all that run's follow-ups for a repo onto
  `meta-task/followups-<originating-task>`. Fewer PRs; the reviewer takes the
  batch together.
- **`pr_grouping: per-project`** — a single rolling PR per repo on
  `meta-task/spawn-followups` that accumulates follow-ups across runs (append
  to the open PR, or start a fresh one — the `sdlc backlog create` rolling
  pattern). Lowest PR churn; the PR can grow large between merges.
- **`pr_title_pattern`** — optional template for the PR title, resolved at
  PR-creation time. Placeholders (unknown → empty): `{headline}`, `{slug}`,
  `{originating_task}`, `{classification}`, `{date}` (UTC), `{repo}`
  (owner/name). `null` (default) → each mode's built-in title: `per-task` uses
  the task headline (today's behavior), `per-execution` uses
  `chore(tasks): follow-ups from {originating_task}`, `per-project` uses
  `chore(tasks): spawned follow-up tasks`. `{slug}` / `{classification}` are
  meaningful only for `per-task`; for shared modes they resolve to the first
  task in the PR, so prefer run-level tokens there.

The `spawn-task-pr` sub-skill stays a pure mechanism (`--branch` +
`--pr open|rolling` + `--pr-title`); the spawn-from-post-mortem procedure maps this config
onto those flags per target-repo group.

### `backlog.capture:` — how `sdlc backlog create` submits captured items

```yaml
backlog:
  capture:
    enabled: true                    # auto-open/update a PR (vs. author locally)
    target:
      pr_grouping: per-project       # per-project (rolling) | per-item
      pr_title_pattern: null         # optional; null = mode default
```

Governs the deterministic tail behind `/sdlc:backlog-capture`
(`sdlc backlog create`). Read via `sdlc config get-backlog-policy`.

- **`enabled`** — whether capture auto-submits to a PR. `true` (default)
  authors the item, commits it in an ephemeral worktree, pushes, and
  opens-or-updates a PR (today's behavior; prints `PR: <url>`). `false`
  authors the file in the working tree and stops — no commit, push, or PR
  (prints `WROTE: <path>`). Use it to capture locally and submit by hand.
- **`pr_grouping`** — `per-project` (default) is a single rolling
  `backlog-capture` PR that accumulates every captured item until triaged;
  `per-item` opens one branch/PR per item (`backlog/<slug>`). (No
  `per-execution` — backlog capture has no run to bundle, unlike spawn.)
- **`pr_title_pattern`** — optional title template, resolved at PR-creation
  time. Placeholders (unknown → empty): `{id}` (B-NNNN), `{slug}`, `{title}`
  (headline), `{date}` (UTC). `null` → each mode's default: `per-project` =
  `docs(backlog): rolling capture`; `per-item` = `docs(backlog): {title}`. A
  rolling PR's title is fixed by the item that first opened it.

Missing block or missing keys default to `enabled: true`,
`pr_grouping: per-project` — today's rolling-capture behavior.

### `log.store:` — where the agent log lives

`log.store.tracked` (default `false`) picks the log root. `false`: `.sdlc/log`, gitignored, in the
repository's **main checkout** (found from the git common dir), so every worktree of a repo shares
one log and the session hooks and the op journal cannot disagree; outside git (or in a bare repo)
the project root is used. `true`: `sdlc/log` in the writing process's own project root, so the log
is committed with the branch that wrote it, and everything a session does (its hook command's
`--project-root`, `SDLC_PROJECT_ROOT`, the launch records) goes to the worktree it works in.
`tracked` is accepted only in `sdlc.local.yaml` (a committed `true` would make every clone commit
its hostname and user name), and it needs `sdlc log setup` (the `.gitattributes` union-merge rule
for the append-only journal) and `sdlc log stage` as a `hooks: pre-commit` step; `sdlc project
doctor` fails when `sdlc/log` is gitignored or the rule is missing. `log.store.path` now names a
root OUTSIDE the project only (with `layout: by-project`, `sdlc.local.yaml` only) and cannot be
combined with `tracked: true`; `log.store.scope` and in-project relative paths are gone. See
`docs/logging.md` ("Where it lives"). A hard cutover: a store at the old location is not read.

### `paths:` — named directories the other path settings refer to

```yaml
paths:
  dev: ~/Developer
  work: /srv/work
```

A map of name → directory. Any path-valued setting that accepts tokens can
say `{name}` instead of spelling the directory again: today that is each
`repos:` entry and `checkout.layout`. So `dev` declared once gives
`repos: ['{dev}', '{dev}/work']` and `layout: '{dev}/{owner}/{repo}'`.

A name is letters, digits and `_`, starting with a letter, and cannot be
`host`, `owner` or `repo` — those are the layout's own tokens. A value
expands `~` and resolves a relative path against the project root. Entries
do not refer to each other. A `{name}` that nothing defines is an error
naming the setting it appeared in and the fix, never an empty string.

Directories are facts about a machine, so this map is the natural home for
the **machine-level config** (below): put `dev` there once and every
project's `sdlc.yaml` can refer to it. A project may still declare a name
for a path its own docs assume (`checkouts: ./checkouts`, say); the machine's
entry of the same name wins.

### `repos:` — where other repositories live on this machine

```yaml
repos:
  - '{dev}'              # a directory that CONTAINS checkouts, at any depth
  - ~/work/api           # a single checkout
  - /srv/repos
```

Used whenever a verb has to work on a repository other than the one it runs
in: `sdlc pr review <url>` to find the review target, `sdlc pr survey --repo
owner/name` to find the checkout its drift is measured in, `sdlc repo
checkout` to notice a clone that is already on disk, `sdlc project cleanup
--all` to know what to sweep. An entry may use `{paths}` tokens; `~` expands
and a relative path resolves against the project root, as for every other
path value.

What an entry names is read off the disk, not off how it is written:

| Entry | Detected by | Names |
| --- | --- | --- |
| `~/work/api` | it is itself a checkout | that repository |
| `~/Developer` | it is a directory that is not a checkout | every checkout under it |

The search descends through directories that are not checkouts and stops at
the ones that are, so `~/Developer/acme/api` is found and nothing inside a
repository — a vendored tree, a parked worktree — is walked into. A linked
worktree collapses into the repository it belongs to, so a directory holding
a checkout and its worktrees names one repository, not several.

**The list never puts a repository in scope by itself.** Listing `~/Developer`
says where checkouts live. A verb that can work across repositories does so
only when asked — `sdlc project cleanup --all`, `sdlc pr survey --repo` — and
every other invocation stays in the repository you are standing in.

Paths like these describe a machine, not a project, so the same key also
lives in the **machine-level config** — see below — and that list is searched
first. Keep the committed `repos:` for entries that hold on every clone (a
sibling directory the project's own docs assume, say) and put personal paths
in the machine file.

### `checkout:` — where `sdlc repo checkout` puts a clone

```yaml
checkout:
  layout: '{dev}/{owner}/{repo}'   # default: '{dev}/{repo}'
  protocol: https                  # https | ssh
```

`sdlc repo checkout <url>` takes anything that names a hosted repository — a
clone URL, the page of a pull request or a file, a bare `owner/repo` — and
puts a checkout of it where `layout` says.

- **`layout`** — a path template. Its tokens are the repository's own —
  `{host}` (`github.com`), `{owner}`, `{repo}` — plus every `paths:` name.
  The default `{dev}/{repo}` needs a `dev` path and keeps every checkout
  directly under it. A grouped layout such as `{dev}/{owner}/{repo}` works
  the same way: `repos: ['{dev}']` finds both, because the scan descends
  through directories that are not checkouts. A token nothing defines is an error, not an
  empty string. `~` expands and a relative result resolves against the
  project root. `--dest <dir>` skips the layout for one run.
- **`protocol`** — the clone URL built for an input that does not carry one
  (`owner/repo`, `github:owner/repo`). An explicit `https://…` or `git@…:`
  input is cloned the way it was given.

A checkout that already exists is reported, not cloned twice: one at the
planned path, or — when no `--dest` pinned the place — one found under the
`repos:` containers. `--branch` picks the branch; a URL that names one
(`/tree/<branch>`, `#v1.0`) is honoured without it. `--print-path` prints
only the path, which is what the `sdlc-repo-checkout` shell function `cd`s
to (see `solutions/ontological/cli/README.md`, "Shell integration").

Both keys also live in the machine-level config (below), where each one set
wins over the project's.

### `profiles:` — which tool and model a launch uses

Words used here and under `router:`: [[TM-0052-tool-router|tool router]], [[TM-0053-tool|tool]],
[[TM-0054-provider|provider]], [[TM-0055-reference|reference]], [[TM-0056-profile|profile]],
[[TM-0057-tier|tier]] and [[TM-0051-effort|effort]] (defined in the glossary).

```yaml
profiles:
  default: [claude/standard, codex/standard]   # a bare list: tried in order
  reviewer:                                    # the long form
    order: [codex/max, claude/max@high]
    host: tmux

pr_review:
  profile: reviewer
  not_the_author: true                         # the author rule
  if_only_author_left: different-model         # different-model | wait | person

workflows:
  implement: { profile: default }
  pr-review: { profile: reviewer }
  pr-respond: { tool: claude/opus@high }
```

A profile is a named, ordered list of references. A reference is
`tool[/model][@effort]`: the tool is one the model catalogue knows (built in:
`claude`, `codex`, `cursor`, `antigravity`, `pi`, `opencode`; more under
`router.tools`), or `*` for every tool that offers the tier; the model a tier
(`fast`, `standard`, `max`) or a model name; the effort a level the tool
accepts. A bare tool (`codex`) is a valid reference. `workflows.<name>`
and `pr_review` each take exactly one of `profile:` (a name defined here) or
`tool:` (a reference); `--tool <reference>` on `sdlc pr review` and `sdlc
session launch` names one for a single run.

A `tool:` (or `--tool`) may be a wildcard, `"*/max"` or `"*/fast[local]"`: it
walks as a one-entry profile, every tool that offers the tier, skipping the
unavailable. The tools come in `router.chains.order`, or the built-in order
(claude, codex, cursor, antigravity, pi, opencode) when it is unset, as for a
wildcard in a profile.

```yaml
router:
  chains: { order: [codex, claude] }
workflows:
  pr-respond: { tool: "*/max" }
```

The author rule is `pr_review`'s, not a profile's: `sdlc pr review` is the one
launch that knows an author (from the PR's lease and footer). With
`not_the_author: true` the review skips every entry on the author's tool; when
only that tool is left, `if_only_author_left` decides: `different-model`
(default) takes a model that differs from the author's, `wait` stops, `person`
hands the review to a person. An author nobody could establish counts as on
every tool. The rule applies to whatever the review walks, but not to `--tool`:
a `--tool` that lands on the author's tool (a wildcard's pick included) runs,
with a warning naming the author's tool and the chosen reference.

| Order | Source |
| --- | --- |
| 1 | the `--tool` flag |
| 2 | the first matching `routing:` rule |
| 3 | the workflow's (or `pr_review`'s) `profile:` / `tool:` |
| 4 | `profiles.default`, the built-in `*/standard` when unset |

The `router:` and `routing:` sections are described field by field in the
generated reference, `docs/sdlc-yaml-reference.md` in the sdlc repository.

A launch passes the resolved model, effort and context to the tool. A profile
walk skips an entry that is unavailable (not installed, signed out, cooling
down) or that the launcher cannot run, and records why. A syntax error, an
unknown tool, a tier the tool has no model for, an effort the tool lacks, a
`profile:` naming an entry that is not defined, or both keys on one binding is
a load error that names the entry. `sdlc.local.yaml` can define profiles that `sdlc.yaml` names.

### `host:` — where sdlc puts work in front of you

```yaml
host:
  default: terminal       # terminal | orca | cmux | tmux | herdr | otty | wezterm | vscode | jetbrains
  close_pane: on-close-out  # on-close-out | on-done | never
```

The default host for every feature that opens something for a person — an
agent session, a command in a terminal. `terminal` runs it in the current
terminal and returns when it ends; `orca` opens a terminal tab in the Orca
app; `cmux` opens a cmux workspace; `tmux` opens a detached tmux session
named from the sdlc session id; `herdr`, `otty` and
`wezterm` open a workspace or tab in that terminal app; `vscode` and
`jetbrains` open a terminal in the IDE window that has the project open,
through a companion extension or plugin. `close_pane` says when sdlc closes the host
pane a session ran in (the host's `close` part; a host without one leaves the pane
open): `on-close-out` (default) when a merged task is closed out (`sdlc task close-commit`),
before the worktree is removed; `on-done` when the agent runs `sdlc session done`; `never`.
Closing a pane ends whatever still runs in it. Hosts are platform-bound (macOS,
Linux or all; see host.md) and report themselves unavailable elsewhere. Every host is a
WRAPPER host: it runs whichever coding-agent CLI (the tool a `profile:` or
`tool:` binding resolves to, see below) the feature picks, in a
terminal/workspace it opens — the two are independent, never a fixed pairing;
`claude`/`codex`/`cursor` are tools, never hosts. A feature's own key
(`pr_review.host`) overrides this, and a `--host` flag overrides both. Hosts
fulfil a contract in parts; a feature that needs a part the host lacks fails
rather than falling back. See
`solutions/ontological/conventions/host.md`.

### `pr_review:` — how `sdlc pr review` opens a session

```yaml
pr_review:
  profile: reviewer       # a profiles: name, or `tool: codex`; set one, not both
  host: orca              # any host name above; optional, absent → host.default
  untrusted: skip-init    # skip-init | full | refuse
  setup: true             # run setup on every launch; --no-setup skips it
  prompt:
    mode: extend          # extend | replace
    text: |
      Also check that every PR mention is hyperlinked.
```

- **`profile`** / **`tool`** — which agent starts in the PR's worktree, with
  the review brief as its first message. `profile` names a `profiles:` entry;
  `tool` is a reference (`codex`, `claude/opus@high`). Set one, not both.
  `--tool <reference>` overrides per run. `engine` was removed.
- **`host`** — where the session opens when it should differ from
  `host.default` (see above). `--host` overrides per run.
- **`setup`** (default `true`) — whether the `setup` verb runs in the PR
  worktree before every launch, created or reused alike. Idempotency is the
  verb's own contract, so re-running it on a reused worktree is cheap by
  design; there is no "did it already run" bookkeeping. `--no-setup` skips it
  for one run; `setup: false` skips it for every run. Still gated by
  `untrusted` (below) and by repo-store trust
  ([[D-V2XJ-verb-cascade-and-repo-trust]]).
- **`untrusted`** — what setup does with a fork PR, whose tree is a
  stranger's code. Three things are true of any PR checkout and only matter
  when the author is not trusted. The setup verb runs with that tree as cwd,
  so an install executes the PR's own package lifecycle scripts before
  anyone has read them. The agent starts inside the tree, so the branch's
  `CLAUDE.md`, `.claude/settings.json` hooks and MCP config are the author's.
  And the brief embeds the PR title while the agent reads the body and
  comments on request, so the text is a prompt-injection surface — which is
  why the brief tells the agent to post nothing and change nothing.
  `skip-init` (default) closes the first: the worktree is created, setup is
  withheld, and a warning names the second. `full` treats the PR like a
  colleague's. `refuse` exits with an error. `--trust` runs one PR as `full`.
  Same-repo PRs are never affected.
- **`prompt`** — the brief. `extend` (default) appends `text` after the
  built-in brief; `replace` uses `text` as the whole prompt. Both resolve the
  placeholders `{pr_number}`, `{pr_url}`, `{pr_title}`, `{pr_author}`,
  `{base}`, `{head}`, `{repo}`, `{worktree}` and `{default_prompt}` (unknown
  ones render empty), so a replacement can embed the built-in brief wherever
  it likes. The built-in brief is `DEFAULT_REVIEW_PROMPT` in
  `solutions/ontological/lib/services/pr/review/prompt.ts`.

Missing block uses `profiles.default` (built in as `*/standard`) in the current
terminal with the built-in brief.

### `hooks:`

Git hooks sdlc runs, keyed by client-side hook name: `pre-commit`,
`pre-merge-commit`, `prepare-commit-msg`, `commit-msg`, `post-commit`,
`pre-rebase`, `post-checkout`, `post-merge`, `pre-push`, `post-rewrite`. Any
other name fails validation. Each value is an ordered list of hook steps: a
`run:` (a workflow name, resolved through `lib/config/hooks.ts`'s
`resolveHook` — the same shared layered-resolution primitive `workflows:`
uses, with no `env` layer and an empty default, since hooks have no built-in
step list) or `script:` (a command line) step, plus four optional fields. A
`run:` target's own steps splice in via `resolveWorkflow` exactly like a
workflow's own `run:` composition (see "Composing a workflow from named
leaves" above) — a spliced-in `skill:`/`prompt:` step fails resolution with
the same message a literal one would. Each resolved step carries the shared
`{layer, mode}` provenance; `sdlc config explain hooks.<hookname>` renders it.

```yaml
hooks:
  pre-commit:
    - run: setup              # a fresh worktree gets its deps first...
      when: deps-missing      # ...only when a lockfile has no deps dir
    - run: check
      name: gates
      on_fail: park           # let the commit through, park the task
  commit-msg:
    - script: scripts/lint-msg.sh "$1"
      on_fail: warn
  pre-push:
    - script: scripts/sign-release.sh
      process_group: false    # prompts for a passphrase on the terminal
```

- **`when`**: `always` (default), or `deps-missing`, which runs the step only
  when the checkout root has a lockfile whose deps dir is absent (`bun.lock`
  with no `node_modules`, `uv.lock` with no `.venv`; see `hasMissingDeps` in
  `@sksizer/detect-runners`). The check repeats just before the step runs,
  so an earlier `run: setup` that installed the deps skips it. A post-checkout
  file checkout (git's third argument `0`) skips it too.
- **`on_fail`**: `block` (default) stops and exits 1, which aborts the commit
  or push. Git ignores the exit code of post-commit, post-checkout,
  post-merge and post-rewrite. `warn` prints the failure, runs the next step
  and exits 0. `park` stops and exits 0 so the git operation proceeds, then
  writes a park marker to `<git-common-dir>/sdlc/park/<branch-slug>.json`
  (branch, hook, step, exit code, stderr tail, timestamp). The orchestrator's
  `work` tick consumes the marker for `task/<basename>` and parks that task
  instead of running its next workflow. A `park` failure is notified later,
  when the `work` tick discovers the park marker and fires `task.parked`
  through `notify:` (below); a `block` failure notifies `hook.blocked`
  directly, through the same `notify:` section.
- **`name`**: the label hook output, markers and notifications use. It
  defaults to the verb or script text.
- **`process_group`**: `true` (default) runs the step in its own process
  group and session. A kill, or a Ctrl-C to sdlc, then reaches every process
  the step started. A step in its own session has no controlling terminal, so
  a prompt on `/dev/tty` fails: a git credential prompt, an ssh passphrase,
  `pinentry-curses`. Set `false` for a step that must prompt; a kill then
  reaches only its `sh`. A `SIGKILL` sent to git's process group (for example
  `timeout -s KILL git commit`), or a `SIGKILL` of sdlc itself, does not
  reach a step in its own group and leaves its tree running. Once the step's
  `sh` exits, a process it left in the
  background that still holds the step's output is killed 250 ms later.
  Redirect its output (`cmd >/dev/null 2>&1 &`) to let it outlive the step.

A Ctrl-C, `SIGTERM` or `SIGHUP` to sdlc stops the hook. The step running
fails as `interrupted`, no later step runs, and nothing is parked or notified,
whatever `on_fail` says. sdlc exits with `128 + signal number`.

Each step runs as `sh -c -- <text> <hook> <args...>` in the checkout root, so
the hook's own arguments are `$1`, `$2`, and so on. No `{placeholder}`
templating happens. The steps come from the repository, so a hook with a
step to run needs the repo trusted (`sdlc repo trust`) and exits 21 without
running any step otherwise. A hook with nothing to run exits 0 without a
trust check. A shim in the shared hooks dir fires in every worktree, and that
exit costs one config read. A hook shim calls
`sdlc hooks run <hook> -- "$@"`, adding `--stdin -` for pre-push and
post-rewrite, which git feeds on stdin.

### `chain:`

The `sdlc` chain: a fixed, ordered 11-stage pipeline — `capture` →
`triage` → `define` → `ready` → `implement` → `check` → `judge` →
`review` → `respond` → `merge` → `close-out` — declared once in code
(`CHAIN_STAGE_NAMES`, `lib/config/chain.ts`) and never reordered,
renamed, or extended by a project. 7 stages bind to a built-in
workflow (`define`, `implement`, `check`, `judge`, `review` → `pr-review`,
`respond` → `pr-respond`, `close-out`); 4 are checkpoints with no bound
workflow (`capture`, `triage`, `ready`, `merge`) — points where a human
or an external event (filing an issue, merging a PR) moves the item,
not an automated step. `resolveChain(projectRoot)` returns the effective
11-entry binding list, each entry tagged `{layer: 'project' | 'local' |
'default'}` — the same provenance vocabulary `workflows:`/`hooks:` report,
narrowed to the modes that make sense for a single nullable name (no `mode`,
no `env`: nothing to wrap or run directly). See
[[D-0019-sdlc-chain-stages-and-labels]] for the full stage table and
rationale, and
[[D-LSLH-collapse-verbs-workflows-chain-hooks]] for the shared resolver.

`stages.<name>.workflow` overrides ONE stage's bound workflow — the
same override-the-value, never override-the-shape convention
`workflows:` uses for its own built-ins (see `workflows:` in "Shape at
a glance" above). An unknown stage name under `chain.stages` fails
validation rather than being silently ignored.

```yaml
chain:
  stages:
    review:
      workflow: custom-review   # override: run a different workflow at `review`
    merge:
      workflow: null            # explicit checkpoint — same as the built-in default
```

### `notify:`

Named notification channels (`channels`), and an event catalog (`events`)
that routes each event to zero or more of them. A channel is one of three
shapes, picked by `type`: `desktop` (no other fields — raises a desktop
notification on the machine running the loop), `ntfy` (`topic_url:`, an ntfy
HTTP topic to POST to), or `webhook` (`url:` plus `format:` — `slack`,
`discord`, or `raw`, the default — controlling the POSTed JSON body's shape).
`events` has exactly 12 fixed keys — `pr.needs_response`, `pr.ci_failed`,
`task.parked`, `stage.ceiling_reached`, `phase.ready_for_review`,
`lease.expired`, `session.ended`, `session.waiting`, `session.done`, `hook.blocked`,
`orchestrator.dead_stop`, `usage.budget_exceeded` — each an ordered list of channel names from
`channels`; an unknown event key, or an `events.*` entry naming a channel
that `channels` does not define, fails validation at `sdlc.yaml` load time.
An event with no list, or an empty one, fires no channel — a silent no-op.
`phase.ready_for_review` and `orchestrator.dead_stop` are config-only today:
no detector fires them yet. `session.waiting` fires once when an interactive
Claude session enters `waiting_for_input`, `session.done` when an agent runs
`sdlc session done`; the session events and `task.parked` carry
a `focus` field, the `sdlc session focus …` command that brings the session
forward.

```yaml
notify:
  channels:
    desk:
      type: desktop
    pager:
      type: ntfy
      topic_url: https://ntfy.sh/my-private-topic
    slack:
      type: webhook
      url: https://hooks.slack.com/services/…
      format: slack
  events:
    task.parked: [desk, pager]
    hook.blocked: [slack]
    pr.ci_failed: [slack]
```

`notify(event, payload, ctx)` (`lib/services/notify/dispatch.ts`) resolves
`events[event]` to channel names, looks each one up in `channels`, and
dispatches best-effort per channel — one channel failing (an unreachable
ntfy server, a missing notifier binary, a non-2xx webhook response) never
suppresses another or fails the caller that fired the event.

### `usage:`

Token/cost usage reporting (`sdlc usage report`) and the `budget:` gate: a
rolling-window token/cost ceiling that pauses the orchestrator `work` tick's
dispatch and fires `usage.budget_exceeded` (routed through `notify:` above)
when exceeded.

```yaml
usage:
  budget:
    window_hours: 24 # default; rolling lookback ending now
    tokens: 2000000 # optional token ceiling
    cost_usd: 50 # optional USD ceiling
```

`budget` is optional, and either limit inside it is optional — absent (or
both `tokens`/`cost_usd` unset) means no cap: inert, the same "valid but
inert" posture an unreferenced `notify.channels` entry has. Both limits
compare a SUM over `.sdlc/usage.jsonl` rows inside the trailing
`window_hours` hours (default 24), a row's `null` token/cost field counting
as `0` toward that sum — see `lib/services/usage/budget.ts#checkUsageBudget`.
This is a different concept from `orchestrate log-tick`'s own
`usage={tokens=…,cost=…}` digest field, which is an ALL-TIME cumulative
total (every row ever logged), not a rolling window.

**`tokens` compares a BILLABLE sum, not the ledger's own `totalTokens`
column.** A row's `totalTokens` (what `sdlc usage report` shows) includes
cache reads, which dominate real usage — a typical session's deduplicated
tokens are 90%+ cache reads — so a ceiling compared against that
cache-inclusive total would trip within a single session. The `tokens`
budget instead sums `inputTokens + outputTokens + cacheWriteTokens` per row,
deliberately excluding `cacheReadTokens` — see
`lib/services/usage/record.ts#sumBillableTokens`, the one place this
reduction is computed, consumed by
`lib/services/usage/budget.ts#checkUsageBudget`. `2000000` above is sized
against that billable total, not the (much larger, cache-dominated) ledger
total.

**`cost_usd` only ever caps headless Claude spend.** Only a headless Claude
run's own JSON envelope reports a dollar figure (`total_cost_usd`) — every
interactive row (`claude` or `codex`) and every codex row (headless or
interactive) is always `costUsd: null`, since codex reports no cost and there
is no local price table. A `cost_usd` ceiling is therefore silently inert
against everything but headless Claude usage, not a true total-spend cap.

### Reserved and apply-driven sections

These top-level keys are optional and read as absent (`undefined`) when unset.
Most are reserved for a later sdlc 1.0 phase: a strict empty object that fails
validation on any key until that phase defines its fields, so adding a field
never breaks a file someone already wrote.

| Key | Today | `applies_via` |
|---|---|---|
| `hooks:` | git hook name → hook steps, run by `sdlc hooks run` (see [`hooks:`](#hooks)) | `apply:hooks` |
| `harness:` | `targets:` — harness exporter names to install for | `apply:harness` |
| `mcp:` | `allow:` / `deny:` — op names the `sdlc mcp` server may or may not expose (both default `[]`) | `apply:mcp` |
| `knowledge:` | reserved | `read` |
| `issues:` | reserved — issue sync and the issues loop (Phase 7) | `read` |

A key whose `applies_via` is `apply:<applier>` changes nothing on its own:
`sdlc apply` writes the files it drives (hook shims, harness installs, MCP
registrations).

## Machine-level config

`<config-home>/sdlc/config.yaml` — `~/Library/Application Support/sdlc/config.yaml`
on macOS, `$XDG_CONFIG_HOME/sdlc/config.yaml` (default `~/.config/sdlc/`)
elsewhere; the same directory `sdlc dev use` writes its `home` redirect into —
is `sdlc.yaml`'s twin for values that describe THIS machine rather than a
project. It is never committed.

```yaml
paths:
  dev: ~/Developer
repos:
  - '{dev}'
checkout:
  layout: '{dev}/{owner}/{repo}'
```

Every key it carries also exists in `sdlc.yaml`, and the two files are read
together. How they combine depends on the key's shape, and the rule is the
same for every key of that shape:

| Shape | Keys | Rule |
|---|---|---|
| list | `repos` | concatenated, machine entries first, duplicates dropped |
| map | `paths` | merged per name; the machine's entry wins |
| scalar | `checkout.layout`, `checkout.protocol` | the machine's value wins when set; the project's default applies otherwise |
| map | `trust` | machine only — no `sdlc.yaml` counterpart; a repository cannot grant itself trust (see [Policy: trust by path or owner](#policy-trust-by-path-or-owner)) |

The machine file is optional everywhere: with no machine file at all, the
project's `sdlc.yaml` alone decides. A `~` or relative path in the machine
file expands the same way as in `sdlc.yaml` (relative against the project
root). Keep the committed `sdlc.yaml` for entries that hold on every clone
and put personal directories in the machine file.

Shape and loader: `MachineConfigSchema` in
`solutions/ontological/lib/config/machine-schema.ts`, read by `@osdlc/config-layers`'s
`machineConfigFile` with the same never-throws, defaults-on-failure contract
as `loadConfig`. The merge rules live where each
key is consumed — `repoContainers` (`repos`), `pathTokens` (`paths`),
`checkoutSettings` (`checkout`) — so the table above is documentation of
those three functions, not a fourth mechanism. `SDLC_MACHINE_CONFIG=<path>`
relocates the file for one run.

`sdlc config set --layer machine <key> <value>` and `sdlc config unset --layer
machine <key>` edit the file in place, keeping its comments. They accept only
keys whose `layers` list `machine`, validate the result against
`MachineConfigSchema`, keep the previous file as `config.yaml.bak`, and write
atomically. A problem already in the file does not block an unrelated edit.
The dashboard cannot write this file. `trust` grants stay with `sdlc repo trust`.

The file has an optional integer `version`; a file without one is version 1.
The loader upgrades an older file in memory on every read. `sdlc config
migrate-machine` writes the upgrade to disk (`--dry-run` reports it only),
keeping a `.bak`; the rewrite drops comments. A file whose `version` is newer
than this build knows is read as-is and reported.

## Consumers

All in-process consumers read config via `ctx.sdlcConfig` (set by
`createCtx` → `loadConfig`). **Do not add new ad-hoc `sdlc.yaml` reads;**
use `ctx.sdlcConfig` instead. The per-key `consumers` list in each key's
`.meta()` is the checked inventory; when you add a reader of a key, add it
there too. The list below is the narrative companion.

- **`ctx.sdlcConfig`** (`solutions/ontological/lib/registry.ts`) — the op-context field
  hydrated once per CLI invocation by `createCtx` via `loadConfig`. Every
  op handler reads config from here.
- **`solutions/ontological/lib/model/entities/task/ops/inflight.ts`** — reads
  `ctx.sdlcConfig.orchestrator.limits.executor.implement` and
  `ctx.sdlcConfig.orchestrator.max_awaiting_review` for the dispatch caps.
- **`solutions/ontological/lib/services/orchestrator/ticks/_limits.ts`** —
  reads the whole `ctx.sdlcConfig.orchestrator.limits` block; the one shared
  gate/count helper `work.ts`/`prs.ts`/`merges.ts`/`issues.ts` all read
  through, rather than each resolving `orchestrator.limits.*` itself.
- **`solutions/ontological/lib/services/orchestrator/ticks/prs.ts`** /
  **`_pr_action.ts`** — read `ctx.sdlcConfig.orchestrator.review.max_rounds`
  to cap `pr-review`/`pr-respond` round-trips per PR.
- **`solutions/ontological/lib/services/orchestrator/step-runner.ts`** —
  `resolveEngine`/`resolveHost` read `resolveWorkflow(name).profile|tool`/
  `.host` (i.e. `workflows.<name>.profile|tool`/`.host`) to pick a dispatched
  workflow's tool/host (the tool through `lib/services/route/route.ts`),
  falling back to the built-in `profiles.default` (`*/standard`), and `host.default` when
  unset. The retired `orchestrator.workflows`/`orchestrator.review.engine` settings
  collapsed into this one place
  ([[D-LSLH-collapse-verbs-workflows-chain-hooks]]).
- **`solutions/ontological/lib/services/session/ops/launch.ts`** — resolves
  `resolveWorkflow(name).profile|tool`/`.host` (i.e.
  `workflows.<name>.profile|tool`/`.host`, the SAME setting `step-runner.ts`
  reads above) as a `--workflow <name>` launch's fallback default, below
  `--tool`/`--host` and above `profiles.default` and the hardcoded
  `host.default` fallback. `--skill`/`--prompt` launches
  never consult it (no workflow name to key off).
- **`solutions/ontological/lib/services/pr/ops/review.ts`** — reads
  `ctx.sdlcConfig.pr_review` for the binding, host and prompt, and
  `loadConfig(<target-repo>).repos` + `loadMachineConfig().repos` (via
  `repoContainers` in `lib/services/repo/locate.ts`) to find another
  repository's checkout.
- **`solutions/ontological/lib/services/repo/ops/checkout.ts`** — reads the
  `checkout:` block and the `paths:` map of both files (via
  `lib/services/repo/layout.ts` `checkoutSettings`) for the layout, protocol
  and tokens, and scans the `repos:` containers (via `repoContainers` /
  `locateRepo`) before cloning.
- **`solutions/ontological/lib/services/pr/ops/classify.ts`** — reads
  `ctx.sdlcConfig.pr_check.author_comments` to decide whether the PR
  author's own comments are actionable or self-notes.
- **`solutions/ontological/lib/services/pr/ops/survey.ts`** — a thin
  wrapper over `@sksizer/pr-update`: hands `ctx.sdlcConfig.pr_update`
  through unchanged as the package's `PrUpdateConfig` (scope: `author`,
  `include_drafts`; the strategy block goes to the package's
  `chooseStrategy`, which decides rebase vs merge vs skip per PR), and binds
  the top-level `repos:` containers (via `repoContainers` / `locateRepo`) as
  the package's `locate` port for a `--repo` target.
- **`solutions/ontological/lib/services/pr/ops/update.ts`** — a thin
  wrapper over `@sksizer/pr-update`'s `runUpdate`, which plans from the same
  `runSurvey` call and reads `pr_update.lockfile_install`,
  `pr_update.resolvers` and `pr_update.verify` for the conflict-resolver
  ladder and the pre-push gate; `verify: check` or `test` reaches the
  wrapper's `resolveVerifyVerbs` port, which calls
  `resolveWorkflowCommands(which, projectRoot)` (with detection off for
  `test`) and trust-gates the result before the package runs the verbs.
- **`solutions/ontological/lib/services/lease/runtime.ts`** — calls `lowReadLeaseAuthority`
  (from `@lib/config/load.ts`) as the raw YAML read inside its
  `readAuthorityFromSdlcYaml` dedup point. The env-override / throw-on-unset
  wrapper in `resolveAuthority` is unchanged.
- **`solutions/ontological/lib/config/sdlc_yaml.ts`** (`validateFile`) —
  the strict validation surface. Validates via `SdlcConfigSchema`
  `.safeParse` and surfaces each Zod issue as an `at <location>:
  <message>` diagnostic line.
- **`solutions/ontological/lib/services/config/ops/{get,set}-verbs.ts`** —
  YAML-Document **read/write** paths for one named `workflows.<name>` entry
  (their own CLI-facing names, `get-verbs`/`set-verbs`, kept over the
  `verbs:` → `workflows:` migration — see `get-verbs.ts`'s own doc comment).
  `get-verbs --name <verb>` retrieves the list; `set-verbs --name <verb>
  <cmd1> <cmd2> …` writes it. These use the `yaml` Document API for
  comment/sibling preservation and are out of scope for the typed hydration
  path.
- **`sdlc quality run`** (`solutions/ontological/lib/services/quality/ops/run.ts`) — executor.
  Resolves a verb name via `resolveWorkflowCommands(name, projectRoot)` where
  name defaults to `check`, and runs each verb. The project root is
  `--project-root` or the nearest `sdlc.yaml`, so a bare `--name generate`
  reads that project's `sdlc.yaml`; `--config <path>` names another
  `sdlc.yaml` (its directory is the root) and `--verbs` runs a positional list
  instead (the two are mutually exclusive). Project-sourced lists are
  trust-gated either way. `--dry-run` resolves and gates as normal, then lists
  the commands without running them. An unconfigured name warns naming the
  project root it looked in (exit non-zero unless `--allow-empty`). Also accepts `--baseline-dir
  <path>` and `--diff-against-baseline <sha>`.
- **`solutions/ontological/lib/services/git/arm-worktree.ts`** — resolves
  `setup-hooks` for ephemeral commit-worktrees via `resolveWorkflowCommands`,
  with trust gating and progress output.
- **`solutions/ontological/lib/services/project/ops/detect-setup.ts`** —
  probes the repo with `detect-runners#collect` for the implicit `setup`
  default heuristic (part of `resolveWorkflow`'s default layer).
- **`solutions/ontological/plugin/plugins/sdlc/skills/task-work/task-work.md`** Steps 4 and 7 — call
  `resolveWorkflowCommands('setup', worktreeRoot)` (Step 4) and
  `resolveWorkflowCommands('check', repoRoot)` (Step 7) via `sdlc quality run
  --name check`.
- **`solutions/ontological/plugin/plugins/sdlc/skills/orchestrate/orchestrate.md`** — a thin wrapper
  around `sdlc orchestrate run --once`, which reads the whole
  `orchestrator:` block (`loops`, `interval_seconds`, `review.max_rounds`,
  `pr_filters`) plus the top-level `notify:` section — see the
  `orchestrate run` op (`lib/services/orchestrator/ops/run.ts`) and its ticks
  (`lib/services/orchestrator/ticks/`) for where each field is read.
- **`sdlc project setup`** (called by `/sdlc:setup`) — creates an empty
  `sdlc.yaml` when absent; creates an empty gitignored `sdlc.local.yaml`
  template. Idempotent: existing files are left untouched.

## Editing

`sdlc.yaml` is human-authored YAML. `sdlc config set <key> <value>` edits
any key in place (`<value>` read as YAML: a scalar or a flow list/map;
`--layer local` targets `sdlc.local.yaml`, `--layer machine` the
[machine-level config](#machine-level-config)), and `sdlc config unset <key>`
removes one. Both validate the whole resulting config against
`SdlcConfigSchema` before writing and write through `@sksizer/yaml-splice`
(`lib/config/edit.ts`), so comments, key order and blank lines elsewhere in the
file survive byte-for-byte. A key whose meta says `applies_via: apply:<x>`
prints a reminder to run `sdlc apply`. `sdlc config get <key>` prints the
effective value (`--layer` for one file's).

Two paths to populate verbs specifically:

1. **Interactively:** run `/sdlc:find-verbs --name check` (or `--name setup` /
   `--name setup-hooks`). The skill probes the project, presents detected
   runners via `AskUserQuestion`, and writes the approved subset via
   `sdlc config set-verbs --name <verb>`.
2. **By hand:** edit the file directly. Any YAML editor works; the shape is
   documented by `SdlcConfigSchema` in `solutions/ontological/lib/config/load.ts`.
   Re-running `/sdlc:find-verbs --name check` later is safe — it reads the
   existing list, merges the new selection, and writes back.

A hand-edited file is validated against `SdlcConfigSchema` whenever an sdlc command runs: the CLI's
preflight (`solutions/ontological/lib/preflight.ts`) refuses to run any op while the file fails the
schema, printing each Zod issue as an `at <location>: <message>` line; the library's `loadConfig`
throws `ConfigInvalidError` on the same file. Ops that set `toleratesInvalidConfig`
(`sdlc config …`, `sdlc project doctor`) are exempt so a person can see and fix the problem. The
`workflows:` names are validated through the same schema every time a tool resolves them, so a
malformed verb list surfaces at that point.

## Why not under `entities/`?

`solutions/ontological/lib/model/entities/<type>/` holds planning artifacts — things with stages,
lifecycles, and frontmatter that the validator gates on. `sdlc.yaml` is
operational configuration: no stages, no lifecycle, no required fields.
Its schema is the Zod `SdlcConfigSchema` in `solutions/ontological/lib/config/`, not a
`solutions/ontological/lib/model/entities/sdlc-yaml/schema.json` — so the entity-audit /
entity-migrate machinery (which walks `solutions/ontological/lib/model/entities/*/`) does
not treat `sdlc.yaml` as an entity.
