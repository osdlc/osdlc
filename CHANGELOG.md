# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.17.0] - 2026-10-22

### Fixed

- sdlc, `@osdlc/agent-dev` and `@osdlc/tool-router` take `@osdlc/agent-call` ^0.7.1, the range
  `@osdlc/pr-update` already needs. The release packs pin one version of each npm package, so the
  split stopped the 0.16.0 osdlc release from assembling.

### Changed

- `sdlc verify changes` can dispatch to every tool agent-call 0.7 has an adapter for, cursor and pi
  among them, where before it refused all but claude, codex, antigravity and opencode.

## [0.16.0] - 2026-10-22

### Added

- `sdlc dashboard start --lan --token <t>` serves a chosen access token instead of a random one, so
  the LAN URL survives a restart. `SDLC_DASHBOARD_TOKEN` sets it too; `--token` wins, but shows in
  `ps` while `start` runs and the variable does not. The token needs at least 16 characters from
  `A-Z a-z 0-9 . _ ~ -`, `--token` without `--lan` is an error, and `start` refuses to reuse a
  running LAN dashboard that serves a different token
  ([#3657](https://github.com/sksizer/dev/pull/3657)).

### Changed

- `sdlc task dispatch` refuses an untrusted repository before it takes a lease or makes a
  worktree, `--dry-run` included (`UNTRUSTED`, exit 21, naming `sdlc repo trust <root>`).
  When define's scratch worktree cannot be made, the failure names the git command, its exit
  code and the last lines of its output, and says when git made the worktree but its
  post-checkout hook failed; the worktree and its temp dir are removed. A failed step too long
  for the `task dispatch` or `orchestrate work-run` summary line now prints in full below it
  ([#3577](https://github.com/sksizer/dev/pull/3577)).
- `sdlc harness model` redacts MCP secrets: `env` and header values, and the user part and query
  values of a server `url`, read `<redacted>` in the `--output json` model
  ([#3495](https://github.com/sksizer/dev/pull/3495)).
- `sdlc harness model` reads more of a Claude plugin: flat `commands/*.md` files, `hooks/hooks.json`
  and the `hooks` and `mcpServers` of `plugin.json`. `.claude/settings.local.json` now overrides
  `settings.json`, with permission rules and hooks from both kept
  ([#3495](https://github.com/sksizer/dev/pull/3495)).
- `sdlc` reads harness state through `@osdlc/detect-harness`: `harness detect`, `doctor`,
  `harness model`, `plugin info`, `plugin resolve`, `log hooks status` and
  `task preflight-permissions`. `CLAUDE_HOME` is no longer read; `CLAUDE_CONFIG_DIR` is honoured.
  `plugin info` and `plugin resolve` no longer show plugins installed only for another project;
  a plugin installed for the main checkout still shows in a linked worktree of it. When a plugin
  registry holds nothing for the project, `plugin resolve` says "no plugin install record applies
  to <project>" instead of "no plugins recorded".
  `task preflight-permissions` loses `--user-settings`, `--project-settings` and
  `--project-local-settings`, and with no git checkout it reads the task file's folder as the
  project, so that folder's `.claude/settings.json` and `settings.local.json` count
  ([#3499](https://github.com/sksizer/dev/pull/3499)).
- `harness detect` and `project doctor` count the `oauthAccount` key in `~/.claude.json` as Claude
  sign-in evidence, as the `@osdlc/detect-harness` library does. A machine whose login is in the
  macOS Keychain now shows Claude as signed in, with evidence `~/.claude.json#oauthAccount`, where
  it showed "unknown" before. Other tools' sign-in output is unchanged
  ([#3499](https://github.com/sksizer/dev/pull/3499)).

## [0.15.0] - 2026-10-19

The sdlc 1.0 work ships as 0.15.0, a pre-1.0 release: starting-rules kits, scheduled runs, a
hardened unattended orchestrator, the contract inventory and compatibility promise, and the `craft`
skill `parley` at alpha. `craft` ships as 0.7.0. Breaking changes are marked below.

### Added

- The `craft` skill `parley` is the alpha release. A parley document is JSON: typed blocks and the
  questions the agent needs answered. `parley serve` shows it as one review page and
  `parley answers --wait` hands the reviewer's comments, answers and verdict back to the agent. New
  in this release: a first-visit orientation and one progress control, an unread-replies count,
  keyboard use and WCAG AA basics, a chosen-editor link on file pages, and a `schema --md` command
  that prints the block reference. `parley serve` exits 1 when it cannot listen. The bundled
  `parley.mjs` still runs under node 22+, bun and deno with no dependencies
  ([#3302](https://github.com/sksizer/dev/pull/3302)).
- The `parley` skill is split into short files read as needed: `SKILL.md`, `loop.md`, `writing.md`,
  `answers.md` and `glossary.md`, with new and updated `examples/`. `blocks.md` is gone; run
  `parley.mjs schema --md` for the block reference
  ([#3302](https://github.com/sksizer/dev/pull/3302)).
- The `craft` skill `pr-mermaid-comment` moves into `craft` from the `dev-agent` plugin. It posts or
  updates a PR comment with Mermaid diagrams and checks that they render first
  ([#3172](https://github.com/sksizer/dev/pull/3172)).
- craft `lib-publish-ready` (prototype): audits one library package for a first public release
  against a language-neutral quality bar, with check files for crates.io and npm and the end-to-end
  release process. Reads the package only ([#3253](https://github.com/sksizer/dev/pull/3253)).
- `sdlc schedule` has ops to list, show status of, add, edit and remove scheduled entries, to run,
  pause and resume them, to show run history, and to promote an entry to the project
  ([#3234](https://github.com/sksizer/dev/pull/3234),
  [#3254](https://github.com/sksizer/dev/pull/3254),
  [#3236](https://github.com/sksizer/dev/pull/3236),
  [#3240](https://github.com/sksizer/dev/pull/3240),
  [#3291](https://github.com/sksizer/dev/pull/3291)). `project doctor` gains a `schedules` check.
- `sdlc.yaml` keys and commands can carry a deprecation warning, so a rename warns before it breaks
  ([#3231](https://github.com/sksizer/dev/pull/3231)).
- `sdlc markdown verify-reflow <paths...> [--base <ref>]` checks that a reflow changed only prose
  wrapping and names the first element that differs. The `markdown-format` skill runs it after
  `fmt`, and its `assess_reflow_safety.sh` script is removed
  ([#3232](https://github.com/sksizer/dev/pull/3232)).
- Every task, operation and slot lease change is written to the project journal as a `lease.*`
  event with the holder, actor and reason ([#3258](https://github.com/sksizer/dev/pull/3258)).
- Orchestrator dev mode: `orchestrate status` names each loop's mode and, in dev mode, the
  checkout it runs from. A new `orchestrator-install` doctor check compares live loops with the
  hooks. See `docs/orchestrator-running.md` ([#3237](https://github.com/sksizer/dev/pull/3237)).
- `sdlc lib history` lists the release units of a library's version history, follows the package
  across directory moves and names each unit's PR. `lib.boilerplate` in `sdlc.yaml` adds file names
  to ignore ([#3328](https://github.com/sksizer/dev/pull/3328)).
- Starting-rules kits: a kit is a directory with a strict `kit.yaml` manifest listing principles,
  standards, terms and other items, each validated under its real entity contract. Four kits ship
  (`base`, `rust`, `ts` and `sdlc-terms`), `sdlc setup` scaffolds the chosen kits' real items, and
  the wizard's starting-rules screen shows them ([#3021](https://github.com/sksizer/dev/pull/3021),
  [#3026](https://github.com/sksizer/dev/pull/3026),
  [#3031](https://github.com/sksizer/dev/pull/3031),
  [#3039](https://github.com/sksizer/dev/pull/3039),
  [#3060](https://github.com/sksizer/dev/pull/3060),
  [#3022](https://github.com/sksizer/dev/pull/3022),
  [#3074](https://github.com/sksizer/dev/pull/3074)).
- Task work has a configurable target branch (`sdlc orchestrate target`): the task branch is cut
  from it, its PR opens against it and quality is baselined on its tip. Unset, it is the
  repository's default branch. A gated PR merge step lands task PRs into an integration branch
  ([#3038](https://github.com/sksizer/dev/pull/3038),
  [#3053](https://github.com/sksizer/dev/pull/3053)).
- `sdlc task next` follows the roadmap's release order and takes a goal scope
  ([#3034](https://github.com/sksizer/dev/pull/3034)).
- Schedules: `schedules:` entries in `sdlc.yaml` run a workflow on a five-field cron expression. The
  `orchestrate run` schedule loop starts each due run as a detached `sdlc schedule run`, records
  last-run state and a run lock, and journals a run identity. Each run gets its own worktree on
  `schedule/<entry>/<slot>`, and a per-schedule `output` (`none`, `pr`, `branch`) decides what
  becomes of its changes; output never lands on `main`
  ([#3116](https://github.com/sksizer/dev/pull/3116),
  [#3132](https://github.com/sksizer/dev/pull/3132),
  [#3157](https://github.com/sksizer/dev/pull/3157),
  [#3213](https://github.com/sksizer/dev/pull/3213),
  [#3215](https://github.com/sksizer/dev/pull/3215),
  [#3277](https://github.com/sksizer/dev/pull/3277),
  [#3283](https://github.com/sksizer/dev/pull/3283)).
- `runner: {kind: launchd|systemd|none}` in `sdlc.local.yaml` and the `schedule-runner` applier
  install a user-level launchd job or systemd unit so scheduled runs fire with no terminal open. It
  starts every orchestrate loop, the schedule loop included
  ([#3222](https://github.com/sksizer/dev/pull/3222),
  [#3401](https://github.com/sksizer/dev/pull/3401)).
- `sdlc run --visible`, and `session: interactive` on a scheduled run, run agent steps in a
  watchable tmux session. A host that cannot wait (Orca) is refused for a visible run
  ([#3292](https://github.com/sksizer/dev/pull/3292)).
- tmux is a second session host, next to Orca ([#3100](https://github.com/sksizer/dev/pull/3100)).
- A per-run time limit bounds an agent step; a hung work run is stopped when declared stale
  ([#3118](https://github.com/sksizer/dev/pull/3118),
  [#3162](https://github.com/sksizer/dev/pull/3162)).
- `sdlc.yaml` is split into one config section module per key. A JSON Schema for it is committed at
  `docs/schema/sdlc.schema.json`, `config scaffold` and `sdlc init` point editors at it, and
  `sdlc config validate [--file <path>]` checks a file without running an op (exit 14 on any
  problem). A `secret` flag on a key keeps its value out of output
  ([#3127](https://github.com/sksizer/dev/pull/3127),
  [#3209](https://github.com/sksizer/dev/pull/3209),
  [#3204](https://github.com/sksizer/dev/pull/3204),
  [#3227](https://github.com/sksizer/dev/pull/3227),
  [#3224](https://github.com/sksizer/dev/pull/3224)).
- Config changes are picked up without a restart: `loadConfig` notices an edited `sdlc.yaml` or
  `sdlc.local.yaml`, and the orchestrate loop reloads at the start of each pass. An invalid edit is
  logged and skipped ([#3086](https://github.com/sksizer/dev/pull/3086)).
- The config machinery is shared as `@osdlc/cli-tool/config` with an `SDLC_CONFIG` override
  ([#3153](https://github.com/sksizer/dev/pull/3153)).
- `orchestrator.limits` is a hierarchy: a machine-wide `total`, an `executor` pool with a cap per
  operation, and a `schedule` pool ([#3205](https://github.com/sksizer/dev/pull/3205)).
- Each orchestrate loop records which sdlc code it runs and whether that code has moved on
  (`restart_needed`), and a second process cannot run a loop already running for the repository on
  the machine ([#3225](https://github.com/sksizer/dev/pull/3225)).
- `sdlc tui` gets full-screen layout, scrolling panes and key hints; a detail modal on Enter for
  task, PR and work-run rows; a Processes pane to start, stop and pause loops and work-runs; a
  Settings page (key `4`) that edits only `sdlc.local.yaml`; and a Schedules page with add, edit,
  remove, promote and loop status ([#3128](https://github.com/sksizer/dev/pull/3128),
  [#3140](https://github.com/sksizer/dev/pull/3140),
  [#3208](https://github.com/sksizer/dev/pull/3208),
  [#3218](https://github.com/sksizer/dev/pull/3218),
  [#3278](https://github.com/sksizer/dev/pull/3278),
  [#3295](https://github.com/sksizer/dev/pull/3295),
  [#3296](https://github.com/sksizer/dev/pull/3296)).
- `sdlc lease task release <task>` hands a task back at once after a work run dies, instead of
  waiting out the lease (exit 24 while the holder looks alive; `--force` overrides). It also frees
  the run's op and slot leases ([#3114](https://github.com/sksizer/dev/pull/3114),
  [#3135](https://github.com/sksizer/dev/pull/3135),
  [#3113](https://github.com/sksizer/dev/pull/3113)).
- Standards can say how hard they are enforced: `enforcement` (`advise` or `block`) and
  `severity_floor`. The wizard's review-strictness choice writes real config
  ([#3139](https://github.com/sksizer/dev/pull/3139)).
- A configured set of `orchestrator.base_health.commands` gates the `work` tick: nothing is
  dispatched while the target branch's tip is red or unverified
  ([#3189](https://github.com/sksizer/dev/pull/3189)).
- Configured gates block merge: the merges loop refuses a PR whose `check` gate steps did not run
  or failed (`gate-not-run`, `gate-failed`) ([#3167](https://github.com/sksizer/dev/pull/3167)).
- The merge gate requires a `/sdlc:pr-review` verdict recorded for the PR's current head
  (`sdlc pr review-verdict`, refusing with `verdict-missing` or `verdict-blocking`) when
  `verify.blocking` is on ([#3248](https://github.com/sksizer/dev/pull/3248)).
- Task PRs open as drafts and only `sdlc pr ready` marks one ready, after the local checks pass for
  the head (`sdlc pr record-check`). A push to a ready task PR returns it to draft until checks pass
  again. When a work run ends, the PR is marked ready or returned to draft with one failure comment
  ([#3188](https://github.com/sksizer/dev/pull/3188),
  [#3317](https://github.com/sksizer/dev/pull/3317),
  [#3366](https://github.com/sksizer/dev/pull/3366)).
- `sdlc pr create` opens a PR through the code-host port, and the skills that ran `gh pr create`
  call it ([#3169](https://github.com/sksizer/dev/pull/3169)).
- Setup: `sdlc setup apply` delivers as a PR on `sdlc/setup` instead of writing into the working
  tree (new exit codes 30 and 31). It writes the starter milestone and task as real planning
  entities, and checks GitHub sign-in through `project doctor`
  ([#3206](https://github.com/sksizer/dev/pull/3206),
  [#3346](https://github.com/sksizer/dev/pull/3346),
  [#3168](https://github.com/sksizer/dev/pull/3168)).
- Doctor checks are pluggable, and the lefthook check warns when hooks are silently skipped
  ([#3190](https://github.com/sksizer/dev/pull/3190)).
- A work dry run predicts the real tick ([#3147](https://github.com/sksizer/dev/pull/3147)).
- A work run's lifecycle is journalled under a run id, and its redacted, size-capped output is
  published under `runs/<run-id>/output.log` in the log root
  ([#3300](https://github.com/sksizer/dev/pull/3300),
  [#3336](https://github.com/sksizer/dev/pull/3336)). `log.store.tracked` commits the log under
  `sdlc/log` ([#3214](https://github.com/sksizer/dev/pull/3214)).
- `sdlc task set-section <task> <Section> (--from <path> | --text <text|->)` replaces one section of
  a task, and `sdlc task create` takes `--body-file` or `--body-text`. The work tick's define guard
  stops a run that edits a task's Goal or acceptance criteria outside a `planning/*` state
  (`TASK_INTENT_LOCKED`, 50; `TASK_BODY_GAPS`, 51)
  ([#3458](https://github.com/sksizer/dev/pull/3458)).
- `task-work` runs a project-defined `generate` workflow after implementing and before `check`, so
  committed generated files are rebuilt. sdlc ships no default
  ([#3201](https://github.com/sksizer/dev/pull/3201)).
- A configured lease authority creates its control-plane ref. A live run without one exits 49
  ([#3391](https://github.com/sksizer/dev/pull/3391)).
- `docs/contract-inventory.md` lists the stable surfaces, `docs/compatibility.md` states the 1.x
  promise, and a snapshot test guards removals. Surfaces marked experimental (config keys
  `schedules`, `runner`, `router`, `usage`, `harness`; commands `trace`, `route`, `models`, `okf`,
  `tui`, `report`, `friction`; the `friction` entity) are outside that promise
  ([#3192](https://github.com/sksizer/dev/pull/3192),
  [#3400](https://github.com/sksizer/dev/pull/3400)).
- `just acceptance -- --repo <owner/name>` runs the acceptance script: it resets a test repository,
  runs setup, seeds a milestone, a task and a scheduled job, runs the orchestrator, and reports
  dispatch, PR, review, merge, close-out and the scheduled run. `just release-smoke` installs from
  npm on a clean machine, and a generator builds the test repositories
  ([#3313](https://github.com/sksizer/dev/pull/3313),
  [#3193](https://github.com/sksizer/dev/pull/3193),
  [#3381](https://github.com/sksizer/dev/pull/3381)).
- A guide takes a new user from install to a first task
  ([#3210](https://github.com/sksizer/dev/pull/3210)).
- Project-only skills are generated from a vault, with a drift gate
  ([#3229](https://github.com/sksizer/dev/pull/3229)).
- Usage cooldowns expire on read and show in `doctor`, `status` and the TUI
  ([#3228](https://github.com/sksizer/dev/pull/3228)).
- Plugin install tests for Claude and Codex, and a guard against plugins sharing an invocation
  prefix ([#3245](https://github.com/sksizer/dev/pull/3245),
  [#3173](https://github.com/sksizer/dev/pull/3173)).
- The sdlc wizard in the desktop app gains the adopt flow: connect and rules sections, routing,
  steering and alerts, an apply section with a drift report and preview tabs, navigation hints, and
  a Polish skin ([#3255](https://github.com/sksizer/dev/pull/3255),
  [#3281](https://github.com/sksizer/dev/pull/3281),
  [#3305](https://github.com/sksizer/dev/pull/3305),
  [#3309](https://github.com/sksizer/dev/pull/3309),
  [#3316](https://github.com/sksizer/dev/pull/3316),
  [#3353](https://github.com/sksizer/dev/pull/3353),
  [#3238](https://github.com/sksizer/dev/pull/3238)).

### Changed

- **Breaking:** the `craft` skill `collaborate-in-markdown` is renamed `collaborate`. Invoke it as
  `/craft:collaborate`; the old name no longer resolves
  ([#3256](https://github.com/sksizer/dev/pull/3256)).
- The `craft` skill `propose-solution` is renamed `discuss`; invoke it as `/craft:discuss`. The old
  name no longer resolves ([#3174](https://github.com/sksizer/dev/pull/3174)).
- Depends on `@osdlc/color` `^1.0.1` from npm instead of `@sksizer/color`
  ([#3419](https://github.com/sksizer/dev/pull/3419)).
- The `craft` skill `sks-code-review` is renamed `pr-review`; invoke it as `/craft:pr-review`. Its
  behaviour is unchanged ([#3259](https://github.com/sksizer/dev/pull/3259)).
- Skill reference pages on the docs site move to `reference/skills/<plugin>-<skill>` (for example
  `reference/skills/sdlc-task-work`), so two plugins can ship a skill of the same name. The old
  `reference/skills/<skill>` URLs no longer exist
  ([#3259](https://github.com/sksizer/dev/pull/3259)).
- Depends on `@osdlc/agent-call` `^0.4.1` from npm instead of the in-repo `@sksizer/agent-call`.
  `sdlc verify`'s error for a tool with no adapter now names `@osdlc/agent-call`. The error `detail`
  of a failed headless run changes: a nonzero exit joins the parser's text and the stderr tail, and
  a caller abort reads `aborted by the caller` ([#3424](https://github.com/sksizer/dev/pull/3424)).
- **Breaking:** the marketplace is now named `osdlc` and lives at `osdlc/osdlc`. The plugins keep
  their names, so their ids become `sdlc@osdlc` and `craft@osdlc`. An existing install from the
  old `sdlc` marketplace does not update. Remove it with `/plugin marketplace remove sdlc`, then
  add the new one:

  ```text
  /plugin marketplace add osdlc/osdlc
  /plugin install sdlc@osdlc
  ```

  Add `craft@osdlc` the same way if you use it. `sdlc harness install claude` registers the
  `osdlc` marketplace but leaves an old `sdlc` registration in place. Delete the `sdlc` key under
  `extraKnownMarketplaces` and `sdlc@sdlc` under `enabledPlugins` in `.claude/settings.json` or
  `.claude/settings.local.json` by hand ([#3252](https://github.com/sksizer/dev/pull/3252)).
- Workflow script steps and hook steps now run in their own process group and session by default, so
  a kill or a signal to sdlc reaches every process a step started, and a Ctrl-C of the loop stops
  the step without parking the task. The step has no controlling terminal: a prompt on `/dev/tty`
  fails. Set `process_group: false` on a step to opt out
  ([#3200](https://github.com/sksizer/dev/pull/3200)). A signal to the loop does not stop detached
  work-runs (use `sdlc orchestrate work-stop <basename>`); an interrupted run frees its task for
  retry.
- `sdlc orchestrate run` now works in the repository's main checkout by default, wherever it is
  launched, so config, tasks and git all come from one root; `--root launch` or
  `SDLC_LOOP_ROOT=launch` keeps the launch folder. A detached task run is handed the loop's root
  with `--project-root`. The `define` workflow runs in a scratch worktree, so the main checkout is
  not edited or committed to ([#3203](https://github.com/sksizer/dev/pull/3203)).
- **Breaking:** `workflows.<name>.session: interactive | headless` replaces the boolean
  `workflows.<name>.headless`, and `headless` is now refused as an unknown key. A new
  `host.session` sets a per-machine default (in `sdlc.local.yaml`). The order is run flag, task,
  workflow, machine, then headless ([#3251](https://github.com/sksizer/dev/pull/3251)).
- **Breaking:** the `sksizer` marketplace is deleted from this repo; `osdlc` is the only
  marketplace. Remove it with `/plugin marketplace remove sksizer`
  ([#3239](https://github.com/sksizer/dev/pull/3239)).
- **Breaking:** sdlc no longer reads or cleans up the old `sdlc` names.
  `sdlc harness install claude` ignores `sdlc@sdlc`, and `--session-skills` disables only
  `sdlc@osdlc`. Remove old registrations by hand
  ([#3252](https://github.com/sksizer/dev/pull/3252)).
- Unknown keys in `sdlc.yaml` and `sdlc.local.yaml` warn once on stderr and are ignored instead of
  failing to load, so an older sdlc can read a repository that a newer one wrote. Invalid values for
  known keys, and strict sections, still refuse ([#3436](https://github.com/sksizer/dev/pull/3436),
  [#3453](https://github.com/sksizer/dev/pull/3453)).
- A review comment resumes the task-work session, and a PR is reviewed again when its head moves
  ([#3159](https://github.com/sksizer/dev/pull/3159),
  [#3163](https://github.com/sksizer/dev/pull/3163)).
- Review proceeds when CI cannot run ([#3160](https://github.com/sksizer/dev/pull/3160)).
- Task close-out releases a merged task's lease and deletes through the safe delete op, and tasks
  whose PR merged outside the loop are closed out
  ([#3158](https://github.com/sksizer/dev/pull/3158),
  [#3170](https://github.com/sksizer/dev/pull/3170),
  [#3191](https://github.com/sksizer/dev/pull/3191)).
- The merges loop's `pr-update` applies the update
  ([#3130](https://github.com/sksizer/dev/pull/3130)).
- Manual task dispatch is tracked and its PR reviewed
  ([#3133](https://github.com/sksizer/dev/pull/3133)).
- `sdlc quality run` resolves `--name` from the project's `sdlc.yaml` by default
  ([#3220](https://github.com/sksizer/dev/pull/3220)).
- The skill extension fills are retired; the rebuild commands live in the plugin's `CLAUDE.md`
  ([#3207](https://github.com/sksizer/dev/pull/3207)).
- **Breaking:** `log.store.scope` is removed; `log.store.tracked` replaces it
  ([#3214](https://github.com/sksizer/dev/pull/3214)).
- Standards for ops, config, hosts, sessions and logs are adopted
  ([#3441](https://github.com/sksizer/dev/pull/3441)).

### Fixed

- `parley serve` refuses a request with a duplicate or missing `Host` header with a 400, and its
  "server stopped" line now shows promptly
  ([#3473](https://github.com/sksizer/dev/pull/3473)).
- The `judge` workflow diffs against the task's target branch, not `main`, so a task for an
  integration branch is no longer judged on the whole branch
  ([#3247](https://github.com/sksizer/dev/pull/3247)).
- A detached task run now starts in its own session and process group and is re-parented away from
  the loop, so stopping the `work` loop (or its shell) no longer kills running tasks
  ([#3088](https://github.com/sksizer/dev/pull/3088)).
- The `work` tick no longer redispatches a task whose `task/<basename>` branch has an open PR
  (`in-review`), or whose branch is left by an earlier run (`needs-resume`: a person resumes it with
  `/sdlc:task-work`). A dead run's log now says so
  ([#3088](https://github.com/sksizer/dev/pull/3088)).
- The `work` tick skips a task whose task lease is held and unexpired on the lease authority, so a
  second loop process cannot start a task another run is still working (it used to rely on the
  operation lease and the local worktree roster). A failed, parked or dead run's task lease is not
  released, so that task waits out the lease (up to an hour) before it is started again, by the
  loop or by `sdlc task dispatch` ([#3084](https://github.com/sksizer/dev/pull/3084)).
- The `work` tick no longer waits for a task: it starts each task's sequence as a detached run and
  returns, up to `limits.implement` at once, so the `prs`/`merges`/`issues` ticks are not held up. A
  run that dies without an outcome is reported as stale
  ([#3080](https://github.com/sksizer/dev/pull/3080)).
- A PR on the `task/<basename>` branch of a task the loop ran is in scope for the PR ticks without
  the `pr_filters.include_labels` label; human PRs still need it
  ([#3080](https://github.com/sksizer/dev/pull/3080)).
- `sdlc setup plan` and `apply` act on their own project: the nearest `sdlc.yaml` from the cwd,
  never past the git top level, so a repository nested under an adopted directory is set up as its
  own project and the plan notes the enclosing one.
- `orchestrate run`, `start` and `work-start` refuse a repository never trusted with
  `sdlc repo trust`, with `UNTRUSTED` (exit 21), before any tick, claim or spawn
  ([#3422](https://github.com/sksizer/dev/pull/3422),
  [#3433](https://github.com/sksizer/dev/pull/3433)).
- A work run that delivers nothing is held, not recorded `ok`: after `implement` and its checks, the
  run must have closed the task, moved or created the remote `task/<basename>` branch, or opened a
  PR. Otherwise it is blocked as `no-deliverable`, and `sdlc task retry` returns it to the queue
  ([#3443](https://github.com/sksizer/dev/pull/3443)).
- Spec edits travel in the task PR: `task-work` no longer pushes body edits to the target branch
  ([#3445](https://github.com/sksizer/dev/pull/3445)).
- `task-work` close-out arms from the branch config and accepts `open/ready` and lease-less closes
  ([#3076](https://github.com/sksizer/dev/pull/3076)).
- A failed work run names the failing step, its exit code and output; dispatch runs are honest and
  the check baseline is green ([#3096](https://github.com/sksizer/dev/pull/3096),
  [#3112](https://github.com/sksizer/dev/pull/3112)).
- `pr-review` launches once per PR head across loop processes, and the orchestrator log's tick
  counter is serialised across processes ([#3202](https://github.com/sksizer/dev/pull/3202),
  [#3166](https://github.com/sksizer/dev/pull/3166)).
- The Orchestrator page shows real loop state and live claims only
  ([#3145](https://github.com/sksizer/dev/pull/3145)).
- The router lock key survives a non-GitHub origin, and the lease ref mirror stays current after
  compare-and-swap writes, retrying on a local ref lock
  ([#3164](https://github.com/sksizer/dev/pull/3164),
  [#3134](https://github.com/sksizer/dev/pull/3134),
  [#3151](https://github.com/sksizer/dev/pull/3151)).
- Orca comment delivery uses a unique harness terminal
  ([#3161](https://github.com/sksizer/dev/pull/3161)).
- The `lint-state-origin` task check treats shared remote branches as bases
  ([#3040](https://github.com/sksizer/dev/pull/3040)).
- Loop runtime state and task worktrees are anchored at the main checkout
  ([#3101](https://github.com/sksizer/dev/pull/3101)).
- Setup resolves its own project root, not an ancestor's `sdlc.yaml`
  ([#3393](https://github.com/sksizer/dev/pull/3393)).

## [0.14.0] - 2026-10-12

Sessions you can watch and drive, agent logging, `review-pr` state on a git ref, and the
`craft` skill `canvas` renamed to `parley`. `craft` ships as 0.6.0.

Agent logging: one log root holds session lifecycle, session activity and a
project journal, with always-on redaction (guide:
`docs/logging.md`).

Four more session hosts, a delivery receipt for the live route, and
Windows and Linux groundwork.

### Added

- `sdlc tui` has an Orchestrator page (key `3`, or `O` on the Tasks page): pause state per
  loop, goal and target, the tick log, in-flight tasks, open PRs with verdict, review rounds
  and merge-gate refusals, and the work waiting on a person. Read-only; it refreshes without
  blocking keys. `w` on the Tasks page is still a stub.
- `sdlc orchestrate prs`: a read-only list of the open PRs the loop handles, with each one's
  last verdict, review rounds and what the merge gate would refuse on now
  ([#3057](https://github.com/sksizer/dev/pull/3057)).
- craft `lib-publish-ready` (prototype): audits one library package for a first public release
  against a language-neutral quality bar, with check files for crates.io and npm and the
  end-to-end release process. Reads the package only.
- `review-pr` and `check-pr` keep review state on one git ref per PR on origin,
  `refs/review-pr/<number>`, written by the new `review-state.mjs` beside `review-pr` (node 22+ and
  git only, compare-and-swap with `--force-with-lease`). Each commit holds a `state.json` (claim,
  round, findings with their status) and the history is the audit log. `review-pr` claims through it
  instead of a local ref, hands the open and declined findings to the delta review, marks every
  finding with `<!-- review-pr: finding=<id> -->`, rebuilds the ref from the PR when it is missing,
  and archives it to `refs/review-pr/archive/<number>` when the PR closes. `check-pr` replies
  `fixed in <sha>` or `declined: <reason>` on a finding's thread and records the answer on the ref.
  ([#3064](https://github.com/sksizer/dev/pull/3064))
- `review-state.mjs from-pr` turns the JSON that `gh api --paginate` returns for a PR's reviews and
  inline comments into the `rebuild` input (markers, `declined:` / `fixed in <sha>` replies, round),
  so `review-pr` no longer describes that parsing in prose. An opt-in end-to-end suite,
  `review-pr/tests/review-state.e2e.test.mjs`, runs the state script against real GitHub: run it
  with `REVIEW_PR_E2E=1 bun test <that file>` (repo from `REVIEW_PR_E2E_REPO`, default
  `sksizer/marketplace-sdlc`); it opens two draft PRs and closes them, deletes its branches and
  state refs, and removes its temp dirs, even on failure.
  ([#3073](https://github.com/sksizer/dev/pull/3073))
- `craft` review rubrics for duplication, modules, correctness and error paths, written once in
  `code-review/references/` as short portable prose (`duplication-rubric`, `modules-rubric`,
  `correctness-rubric`, `error-paths-rubric`). `review-rubric` embeds all four in its severity order
  and no longer carries their detail, so `code-review` and `review-pr` apply them. `sks-code-review`
  embeds the same files in its external-reviewer brief, so codex and claude get identical wording.
  ([#3046](https://github.com/sksizer/dev/pull/3046))
- `craft` gains the `code-review`, `comment-review`, `review-pr` and `check-pr` skills, moved from
  the `dev-agent` and `pr-tools` plugins of the `sksizer` marketplace. Invoke them as
  `/craft:code-review`, `/craft:comment-review`, `/craft:review-pr` and `/craft:check-pr`; the
  `dev-agent:` and `pr-tools:` names no longer exist, and the `pr-tools` plugin is removed from the
  marketplace (`dev-agent` keeps `dev-update-docs` and `pr-mermaid-comment`). Consumers who enabled
  `pr-tools` or called these skills from `dev-agent` enable `craft` and rename the calls. The skills
  no longer name this repo's layout: `comment-review` takes the project's docs directories as
  `docsRoots` (default `docs/`) and `check-pr` recognises any tool's lease footer, not only sdlc's.
  The `<!-- pr-tools: ... -->` comment marker keeps its name so existing PR comments still parse.
  ([#3045](https://github.com/sksizer/dev/pull/3045))
- A `profiles:` config section: named, ordered lists of model references
  (`[claude/opus, codex/max@high]`, or the long form with `order`, `host`,
  `context`). A bad
  reference, an unknown tool or an unsupported effort fails the load and names
  the entry. `codex` has built-in tiers.
- A profile has no `headless:` field: the launching command picks the mode, and a profile that
  sets one fails the load.
- A `router:` config section: `providers`, `tools` (a built-in tool's extra `serves`, or a
  declared tool with `serves`, `openness`, `modes` and a `headless` launch template; it runs as
  the command its id names, is never run for `--version`, and its template runs only in a
  trusted repository), `pins` (hold a tier to one model across refreshes), `strict` (refuse a
  model the catalogue does not know, rather than warn about it).
- A `routing:` section of rules, each a `when` and a `profile`; the first match wins. A launch
  resolves in this order: `--tool`, the first matching rule, the workflow's `profile:` or
  `tool:`, then `profiles.default`.
- Reference qualifiers: `[ctx=<size>]` asks for at least that much context, and traits (`local`,
  `agent`, `reasoning`, `long-context`) narrow a tier, as in `*/fast[local]`. A wildcard tool,
  `*/<tier>`, walks every tool that offers the tier.
- A context size passes to a tool with no context form only when the catalogue states the
  window the tool runs the model with (`context.default`), never a model's `max`. The snapshot
  gives codex its own 272k window for the models it lists; an Ollama model's `context_length`
  is a maximum, so `pi/ollama/qwen3:4b[ctx=32k]` is skipped as `not-launchable`, and the run
  record never names a context the run did not have.
- Built-in profiles `default` (`*/standard`) and `small` (`*/fast`). A project may redefine either.
- `sdlc models refresh` rebuilds a machine catalogue from models.dev and local probes, validates
  each row and reports models that have gone (`--dry-run` writes nothing). `sdlc models list`
  shows the catalogue by tier; `sdlc models explain <ref>` shows how a reference resolves, with
  the source and date of every fact.
- `sdlc route resolve [profile] --in-session <tool>` gives the model alias and effort a subagent
  in this session takes. `sdlc route report` groups launches by model, profile, `via`, role,
  fallback depth or author-reviewer pair.
- A PR body's lease footer carries `author=<tool>/<model>@<effort>` and `run=<id>`, and a review
  sdlc posts ends with `role=review reviewed=<author>`. The author keeps the exact model id, so
  the record holds even for interactive sessions, which report no model.
- The journal records each launch as `route.chose` (requested and resolved reference, `via`,
  skipped entries with a reason code and detail, effort, context, role, warnings) and its outcome as
  `route.outcome` (`ok`, `rate-limit`, `auth`, `error`).
- `sdlc project doctor` adds routing rows: one per profile entry and workflow binding, held
  pins, deprecated or withdrawn models, and `ANTHROPIC_DEFAULT_*_MODEL` variables that bypass
  the catalogue.
- The model catalogue's `tools` table is the one tool list. A walk skips an entry the launcher
  cannot run (`not-launchable`), so `*/standard` falls through to the next tool.
- A reviewer trusts a PR footer only as far as the lease backs it. A footer naming another lease
  or a lease bound to another PR, and any footer on a fork PR, leaves the author unknown, and an
  author only the footer names is warned about. A fork PR is reviewed
  only by an allow-listed tool (`claude`), unless `--trust` is passed.
- A rate-limit cooldown is kept per tool and model and lasts until the reset the tool reports, at
  most 7 days ahead (15 minutes when the reset cannot be read). The model is the exact id
  (`claude/claude-opus-5-5`, not `claude/opus`), and `route.outcome` records the same id; a
  profile entry naming an alias is matched by resolving it first.
- `sdlc quality checks [<dir>]` runs a folder of numbered check scripts through
  `@sksizer/agent-dev`: `<dir>`, else the new `quality.checks_dir`, else `.sdlc/checks.d/` (a
  missing default folder is a no-op). Script checks pass the repo-trust gate `quality run` uses
  (`--trust` for one run); `--dry-run` lists the plan and runs nothing; any failed check exits 1.
  `sdlc setup` re-includes `.sdlc/checks.d/` in a consumer's `.gitignore`.
- `log.store.scope: repo | worktree`: where a relative `log.store.path` resolves. `repo` (the new
  default) resolves it against the repository's main checkout (the git common dir's worktree), so
  every git worktree shares one log and the session hooks and the op journal write to the same
  place; `worktree` resolves it per worktree and records everything a session does (hook
  `--project-root`, `SDLC_PROJECT_ROOT`, launch records) in the worktree the session works in, so a
  committed path such as `sdlc/log` travels with its branch. New `sdlc log setup` writes the
  `.gitattributes` union-merge rule for a committed journal (`sdlc project doctor` warns while it is
  missing) and `sdlc log stage` stages a committed store from a `pre-commit` hook step. Sessions and
  trace nodes show the worktree and branch they ran in.
- Log lineage for a harness the agent starts directly: when a hook arrives under a session's
  `SDLC_SESSION` from another harness, or another harness session id, the reporter files it under a
  new child record (origin `spawned`, `parent` the tagged session, same run) instead of the tagged
  session, notes the child once on the parent's timeline, and shows it under the parent in the
  trace and the sessions tree ("started directly by <session>" in the dashboard). Best effort: the
  record is `headless` with no host. A new conversation id in the same process (`SessionStart`
  `source` `clear`, `resume`, `compact`; Pi `new`, `fork`, `reload`) is the same session: the record
  takes the new id and keeps the old, so late hooks of the old id still match.
- Log explorer, originator and time zone: a session's `launched` event and record, and `run.start`,
  record who started it (`startedBy`: git `user.name`, else the OS login), the machine's `hostname`
  and its `tz`. The runs index and trace nodes show them with the command that started the run
  (`sdlc <op> <flag names>`, never flag values); the root lane reads "Started by <name>: <command>"
  and op lanes "ran sdlc <op>". A time zone picker in the dashboard header (Local by default, UTC,
  Recorded, or any IANA zone, remembered in localStorage) drives one formatter behind every time
  on screen, Recorded included on the session page, event drawer, state strip and search rows
  (each in its own session's zone); axis ticks stay on the zone's clock across a DST change, and
  a change of zone in one tab reaches the others. `log.capture.originator` (default on) switches
  the name and hostname off: `startedBy` is then `null` and `hostname` omitted, while `tz` and the
  hashed machine id stay.
- Log explorer: a Runs home at `/logs` (one row per run with state, problems, cost and a lane
  sparkline, last-24-hour cards, running / problems / origin filters), a Live tab, and search
  moved to `/logs/search`. A run opens as a branched timeline (lanes, state spans, event marks,
  squeeze, zoom, problems-only filter) or the execution graph (show-ops collapse, minimap, path
  from the run). The session view is by turn, with a state strip and an event drawer. Deep links:
  `?view`, `?sel`, `?event`. New endpoints: `GET /api/log/runs`, `GET /api/log/trace/:id/marks`;
  trace session and subagent nodes carry `spans` and `facts`; the session detail carries `turns`
  and `spans` (one span derivation for both pages); `subagent.start` takes `parent_agent_id`.
- Log explorer, nested subagents and attribution: the Claude digest reads each subagent's
  `agent-<id>.meta.json` sidecar, so a subagent spawned by another shows under its parent
  (`parent_agent_id` on `subagent.start`) and its tool calls carry `agent_id` (also set from
  the `agent_id` of tool hooks fired inside a subagent). Codex, Cursor, Pi and OpenCode stay
  flat (`harness-adapters.md` records what each exposes).
- Log explorer: `GET /api/log/runs` takes `harness=` (runs with a session of that harness);
  the session detail (`GET /api/log/sessions/:id`, `sdlc session show --json`) carries
  `resume: { command } | null`, the `sdlc session attach <id>` command for an ended, resumable
  session.
- Log explorer UI: the run timeline dims lanes by harness and by node kind; `harness=`, `kind=`,
  `from=`/`to=` (zoom window) and `collapsed=` are kept in the URL. The Runs home filters by
  harness. The session view has a "Copy resume command" button (selectable text when the clipboard
  is refused).
- Log explorer trace view: clicking a node (or its timeline row) selects it (`?sel=<node id>`) and
  an Events panel under the graph lists that node's events; `GET /api/log/search` takes
  `invocation=` to filter to one op run.
- Session names: `sdlc session launch --name`, `sdlc session rename <id> <name>`, and a name
  derived from what launched a session (`pr-review · PR #12`, `task-work · T-ABCD`); the
  harness's own title (Claude, Codex) is used when `log.capture.prompts` is on. `session list`,
  `session show`, the journal and the dashboard log explorer show it beside the id.
- A `friction` entity: a deduplicated record of something that cost time or
  failed, holding counts and ids only. `sdlc friction detect` finds ten signals
  in the agent log (`--apply` writes them); post-mortems and the setup wizard's
  look-back step record reported frictions; `sdlc friction promote --to
  task|backlog` turns one into work. The dashboard log explorer has a Friction
  tab with promote and dismiss.
- `sdlc session reconcile [id] [--dry-run] [--grace <dur>] [--backfill]` ends session
  records that never got an end (launcher killed, pane closed, harness with no
  hooks): no process, no host pane and a quiet log past the grace (default 15
  minutes) make it `ended` with outcome `lost`, stamped at the last evidence
  time. `lost` is terminal; a later hook is noted, never revives it. Runs once per
  `orchestrate run` pass, every minute in the dashboard server, with
  `session list --reconcile`, and as a dry-run line in `project doctor`.
  `--backfill` digests ended sessions with no digest marker.
- `sdlc task start <task>` starts a task yourself: it takes the task lease as a
  person, creates the worktree and branch, opens an interactive `task-work`
  session and focuses it. The lease has a new `human` owner kind that never
  expires and is never stolen; `task next` skips a task a person holds
  (`skipped_human`) and `task inflight` reports the lease owner kind.
- `sdlc session adopt` tracks a session sdlc did not start: a record bound to
  the current directory, branch and task, with the host and harness session read
  from the environment. Hooks cannot be added to a running session, so it is
  `launch-only`.
- `session launch --skill-args` appends arguments to a `--skill` first message.
- A `log:` config block: `store` (path, layout), `capture` (activity, prompts,
  messages, tool_args, tool_output, raw_transcript), `journal` (ops, sessions,
  workflow), `redact` (extra patterns and env names), `retention` and size
  caps. Content capture is opt-in per channel; activity metadata is on.
- A deterministic redactor (secretlint plus in-house rules and secret-named
  environment values) that every content string passes before it reaches disk.
  It cannot be turned off, only extended.
- The project journal at `<log root>/journal/<writer>/<yyyy-mm>.jsonl`:
  `op.start`/`op.end` for every top-level command, `session.*`, `step.*`,
  `dispatch.decision` and `run.*`. `sdlc journal append|tail`;
  `SDLC_LOG_JOURNAL=off` stops a process writing it.
- Correlation ids: `SDLC_RUN`, `SDLC_SUBJECT`, `SDLC_INVOCATION` and
  `SDLC_INVOCATION_PID` ride into every launched session.
- Claude hooks injected per launch (`sdlc session hook`) with a preset
  `--session-id`: session activity in `activity.jsonl`, and hands-off hosts
  (every host but `terminal`) now reach `ended`.
- Codex hooks: `sdlc log hooks install|uninstall|status --harness codex` manage
  sdlc's entries in `~/.codex/hooks.json` without disturbing the user's other
  hooks (append-only, idempotent, backed up, refused on a file that does not
  parse; an older sdlc command is updated in place, which needs approving again).
  The hook command returns at once and runs the reporter detached, so Codex is
  never blocked. Codex runs them only after the user approves them in `/hooks`;
  `status` and `sdlc project doctor` say so. `--dangerously-bypass-hook-trust`
  is never used. A Codex launch with approved hooks records `capture: hooks`.
  Behind this, `lib/services/log/adapters/<harness>.ts` is the per-harness seam
  (payload, status, transcript locate and parse); Claude and Codex are its first
  two adapters. The launch also sets `SDLC_PROJECT_ROOT`.
- Cursor logging adapter. Cursor's hooks are installed once with
  `sdlc log hooks install --harness cursor` into `~/.cursor/hooks.json` (Cursor
  reads no other file), through the same append-only, backed-up, compare-and-swap
  edit as Codex's; Cursor has no approval step for user hooks, so installed means
  ready, and `sdlc project doctor` reports the state. Cursor was checked against
  a live cursor-agent, interactive and `--headless` (`-p --output-format json
  --trust`, with usage from its result).
- Pi and OpenCode sessions are launched observed. Per launch, sdlc writes a small
  forwarding extension (Pi, loaded with `-e`, session id preset with
  `--session-id`) or plugin (OpenCode, added through `OPENCODE_CONFIG_CONTENT`) into
  the session's own directory and never touches the user's pi or opencode config.
  It hands each event to `sdlc session hook --harness pi|opencode` detached, so the
  agent is never blocked. `opencode` is a new `--model` tool (interactive only).
- A transcript digest at `ended` (headless runs, per-turn usage) and an opt-in
  redacted raw transcript copy; `sdlc session digest <id>` finishes a digest
  that ran out of time.
- Readers: `sdlc session show`, `sdlc session list --tree`, `sdlc trace <id>`
  (`--graph`, `--format json|mermaid|dot`; `--follow` redraws text output until
  nothing runs, nothing changes for about two minutes, or Ctrl-C, and is
  CLI-only), `sdlc log search` and `sdlc log prune`. `session show`, `log
  search`, `journal tail` and `trace` are also MCP tools.
- A log explorer in the dashboard: `/logs` (search), `/logs/sessions`,
  `/logs/sessions/:id` and `/logs/trace/:id`, over `/api/log/*`.
- `sdlc dashboard start --lan` serves the dashboard to other machines on the
  network: it binds every interface and prints a URL carrying a per-process
  access token, which the first visit swaps for an HttpOnly cookie. Remote
  viewers are read-only. Whether a request is local is decided by the socket's
  address, not the `Host` header alone, which also closes that gap for a plain
  `--host 0.0.0.0`; an unknown peer address counts as remote. `/api/health` reports
  `readOnly`, and the SPA hides mutating buttons from read-only viewers. The pidfile,
  registry and `dashboard.log`, which hold the token, are created 0600. `start --lan`
  against a running dashboard started without it fails and says to stop it first.
- The setup wizard's `log` step writes real `log:` keys. `record`, `keep`,
  `publish` and `keepRaw` map to journal, retention, a tracked `sdlc/log` store
  and `capture.raw_transcript`; a new `capture` choice picks content channels.
- Session hosts `herdr`, `otty`, `wezterm`, `vscode` and `jetbrains` (`otty` and
  `wezterm` are unverified against a live app), each
  fulfilling `session` and `terminal` plus `send`, `find` and `focus` (and
  `capture` where the app can read a terminal back). `vscode` covers VS Code,
  Cursor and Windsurf through the `sdlc-host` companion extension
  (`packages/ts/vscode-host`; the compiled `sdlc` binary needs `node` or `bun`
  on `PATH` to reach it, and reports the host unavailable otherwise);
  `jetbrains` drives a companion plugin (`packages/kotlin/jetbrains-host`; the host is
  unavailable until the plugin is installed). The plugin builds (CI workflow
  `jetbrains-host`, with JUnit tests over the golden wire fixtures) and was verified in the
  `gradle runIde` sandbox on macOS, IntelliJ IDEA 2025.3 (owner-observed 2026-10-10), so the host
  lists `darwin` only. It starts the agent as the tab's own process, reaps registry files of dead
  IDEs, and records `startedAt` so the CLI picks the newest IDE on a tie. The host surfaces the
  plugin's error text, times pings out after 1.5 s and caches the answering IDEs for 5 s. The plugin
  bounds its wait for the IDE's UI thread (3 s, then 2 s more) and answers 503 (nothing done) or
  504 (outcome unknown; a 504 on terminal/open may still produce a tab, so callers must not retry
  blindly) instead of hanging a request; `ping` reports the IDE's `pid`, and the host
  skips a registry entry whose ping answers as another pid. Wire protocol 2.
  `host.default`, `pr_review.host` and `--host` accept the new names.
- Launching a session opens a workspace first when the host has none open for the directory: the new
  optional host part `openWorkspace` (implemented by `jetbrains`, which opens the git root as a
  project; the IDE's trust prompt still applies) is called before `session`/`terminal` when
  `host.open_workspace` (default `true`) is on, after one line on stderr saying what is opening.
  `host.jetbrains.ide` picks the IDE by product name when several run. The plugin publishes itself
  from the welcome screen too, so an IDE with no project open is found.
- The `cmux` host now fulfils `send`, `find`, `focus` and `capture`. `live`
  sends type only into a known agent session: cmux needs a session-store row
  naming the agent, otty an sdlc-tagged pane; a match by working directory
  alone is refused.
- Wrapper hosts pass session environment on Windows through PowerShell
  instead of POSIX `env`.
- A `capture` host part (recent screen text of a session), also on `tmux`.
- `orchestrator.router.receipt_timeout_ms` (default `15000`): how long the
  `live` route waits, after typing into a running session, for a delivery
  receipt. Evidence comes from the host's own ack, a harness hook (only with
  `log.capture.activity` on and the session not mid-turn), the
  session state log, Claude's own state file and the host's `capture`. A
  receipt that never arrives while a confirming signal was expected sends the
  delivery on to `resume` or `fresh`; the result reports the `evidence` and
  `armed` probes.
- Standard S-0021: macOS and Linux are supported, Windows is a target.
  Hosts declare their `platforms` and report "not supported on <os>"
  elsewhere; PATH lookup and command quoting go through shared helpers
  instead of a POSIX shell. CI runs the suite on macOS (blocking) and
  Windows (non-blocking).
- `sdlc markdown fmt|check [paths]` format and check markdown with a pinned rumdl, passing its exit
  code through. `sdlc project setup` writes the managed rule set to `.sdlc/rumdl.base.toml` and
  points the project's `.rumdl.toml` at it with `extends`; `check` fails when that base is stale.
- The `markdown-format` skill moves into the sdlc plugin as a thin wrapper over those verbs.
- `craft` gains the `collaborate-in-markdown` and `sks-code-review` skills, moved from the
  `dev-agent` plugin of the `sksizer` marketplace. Invoke them as `/craft:collaborate-in-markdown`
  and `/craft:sks-code-review`; the `dev-agent:` names no longer exist. `sks-code-review` no
  longer names this repo's `docs/LIBRARIES.md` and `packages/`. Its brief tells the external
  reviewer to read the project's agent instruction files (`CLAUDE.md`, `AGENTS.md`) and follow
  their library-roster and reuse rules.
  ([#2979](https://github.com/sksizer/dev/pull/2979))
- `parley` gains the decision board's features: live Storybook stories and screenshots on
  questions, options and a new `story` block; a document `revision`, closed questions with a
  `resolution`, changed and stale answers, answer history, and `answers --mark-read`; reviewer
  notes on the whole document and a `group` heading on questions. `propose-solution` gains a `ui`
  domain note.
- `sdlc orchestrate` can run a task's agent sessions in a host pane you can watch and type into.
  Choose it per run (`--interactive`), per task (`session: interactive`) or per workflow
  (`workflows.<name>.headless: false`). ([#3095](https://github.com/sksizer/dev/pull/3095))
- sdlc sends a notification when a session starts waiting for input (`session.waiting`) and when it
  says it is done (`session.done`). `sdlc session focus` also takes a session id.
  ([#3092](https://github.com/sksizer/dev/pull/3092))
- An agent can end its session with `sdlc session done --outcome ok|failed`. On a hands-off host the
  harness runs under `sdlc session run`, which records its real exit code.
  ([#3075](https://github.com/sksizer/dev/pull/3075))
- Each host binds the pane it opens to the sdlc session id, so two sessions in one worktree are
  told apart. `host.close_pane` in `sdlc.yaml` says when sdlc closes a session's pane.
  ([#3082](https://github.com/sksizer/dev/pull/3082))
- The `parley` page reconnects after a dropped connection and keeps unsent answers in the browser. A
  missing document returns 404. ([#3058](https://github.com/sksizer/dev/pull/3058),
  [#3063](https://github.com/sksizer/dev/pull/3063))
- `parley` markdown output starts with OKF frontmatter.
  ([#3081](https://github.com/sksizer/dev/pull/3081))

### Changed

- `@sksizer/pr-stats` is now `@sksizer/diffkit`, with no alias. The craft `pr-stats` skill keeps its
  name but its script is `diffkit.mjs` and the command is `node <skill-dir>/diffkit.mjs stats …`.
  The PR-body statistics markers are `<!-- sdlc-diffkit-stats:start -->` and
  `<!-- sdlc-diffkit-stats:end -->`; a body with the old markers gets a second section on the next
  `sdlc pr stats --write`; delete the old one by hand. `sdlc pr stats` also takes
  `--head <ref>` (exactly `<base>..<head>`) and `--worktree`. The script's new `prep` command
  lists the kept and dropped files of a change and groups the kept ones by nearest package root.
  `review-pr` and `code-review` always run it first, and review a large change (more than 15 kept
  files or more than 800 changed lines) with one reviewer sub-agent per group.
  ([#3089](https://github.com/sksizer/dev/pull/3089))
- Depends on `@osdlc/color` `^1.0.1` from npm instead of `@sksizer/color`.
- The `craft` skill `sks-code-review` is renamed `pr-review`; invoke it as `/craft:pr-review`. Its
  behaviour is unchanged.
- Skill reference pages on the docs site move to `reference/skills/<plugin>-<skill>` (for example
  `reference/skills/sdlc-task-work`), so two plugins can ship a skill of the same name. The old
  `reference/skills/<skill>` URLs no longer exist.
- Depends on `@osdlc/agent-call` `^0.4.1` from npm instead of the in-repo `@sksizer/agent-call`.
  `sdlc verify`'s error for a tool with no adapter now names `@osdlc/agent-call`. The error `detail`
  of a failed headless run changes: a nonzero exit joins the parser's text and the stderr tail, and
  a caller abort reads `aborted by the caller`.
- **Breaking:** the marketplace is now named `osdlc` and lives at `osdlc/osdlc`. The plugins keep
  their names, so their ids become `sdlc@osdlc` and `craft@osdlc`. An existing install from the
  old `sdlc` marketplace does not update. Remove it with `/plugin marketplace remove sdlc`, then
  add the new one:

  ```text
  /plugin marketplace add osdlc/osdlc
  /plugin install sdlc@osdlc
  ```

  Add `craft@osdlc` the same way if you use it. `sdlc harness install claude` registers the
  `osdlc` marketplace but leaves an old `sdlc` registration in place. Delete the `sdlc` key under
  `extraKnownMarketplaces` and `sdlc@sdlc` under `enabledPlugins` in `.claude/settings.json` or
  `.claude/settings.local.json` by hand.
- Workflow script steps and hook steps now run in their own process group and session by default, so
  a kill or a signal to sdlc reaches every process a step started, and a Ctrl-C of the loop stops
  the step without parking the task. The step has no controlling terminal: a prompt on `/dev/tty`
  fails. Set `process_group: false` on a step to opt out. A signal to the loop does not stop
  detached work-runs (use `sdlc orchestrate work-stop <basename>`); an interrupted run frees its
  task for retry.
- `sdlc orchestrate run` now works in the repository's main checkout by default, wherever it is
  launched, so config, tasks and git all come from one root; `--root launch` or
  `SDLC_LOOP_ROOT=launch` keeps the launch folder. A detached task run is handed the loop's root
  with `--project-root`. The `define` workflow runs in a scratch worktree, so the main checkout is
  not edited or committed to.
- `review-state.mjs archive` on a PR with no live ref now exits 0 with
  `{"archived":false,"reason":"no live state"}` instead of 1. `review-pr` reports a merged or closed
  PR as `REVIEW=closed`, says so when the person named it, falls back to a generated session id when
  the harness PID is unreadable, uses `<skill>@dev` without a plugin manifest, and spells out the
  `origin` comparison for `--remote` (also in `check-pr`).
  ([#3073](https://github.com/sksizer/dev/pull/3073))
- `review-state.mjs` works from any directory: outside a git checkout it uses a cached bare repo
  under the temp directory, so `--remote <url>` is enough. `from-pr` takes the last marker in a
  comment, accepts a backticked sha in `fixed in`, uses the line at the reviewed commit
  (`original_line`) and a short title (first line, markdown and a `Category:` label removed).
  `review-pr`: a generated session id is the default, the model is the exact id, `<base>` is the
  merge-base with `origin/<baseRefName>`, only reviews carrying the marker count, missing coverage
  is a finding only when it points at a diff line, and step 6 is a numbered order (re-check,
  record, post, answer, release). `check-pr` creates its worktree when it skipped the rebase,
  replies, then answers, then resolves, pages through review threads, and passes full shas. The
  `origin` comparison lives once, in `references/agent-work-signature.md`, and strips
  `user[:token]@`.
  ([#3073](https://github.com/sksizer/dev/pull/3073))
- `review-state.mjs rebuild` keeps the title already recorded for a finding id (`from-pr` titles are
  excerpts) and the full fix sha when a reply carried only a prefix of it; `review-pr` and
  `check-pr` pass the PR's repository to every `gh` call.
  ([#3073](https://github.com/sksizer/dev/pull/3073))
- **BREAKING:** routing is the **tool router**, and a binding names its reference with `tool:`.
  `workflows.<name>.model`, `pr_review.model` and `verify.model` are now `.tool` (beside
  `profile`); the old key fails the load as an unknown key. The `--model` flag of
  `sdlc session launch` and `sdlc pr review` is now `--tool`, and a route's `via` for a binding
  is `tool`. A reference is `tool/model[qualifiers]@effort`: tool, model, effort and context. The
  `sdlc models` and `route.chose`'s `model` keep their names.
- **BREAKING:** the author rule moves from profiles into `pr_review:`
  (`pr_review: { profile: reviewers, not_the_author: true, if_only_author_left: different-model }`,
  same defaults: off, then `different-model`). A profile is an ordered list plus `host` and
  `context`; `not_the_author` or `if_only_author_left` on a profile fails the load as an unknown
  key. `sdlc pr review` is the one launch that passes the rule, and it applies to whatever the
  review walks except `--tool`; a `--tool` that lands on the author's tool (a wildcard's pick
  included) runs with a warning naming the author's tool and the chosen reference. Setup writes the
  reviewer profile as a bare list and the rule under `pr_review:`.
- **BREAKING:** `router.tools.<id>.binary` is dropped: a tool's executable is not config. A
  built-in tool runs as the snapshot names it and a declared tool as its id; `binary:` fails the
  load as an unknown key. Launch, `session attach`, the dashboard's resume, `sdlc verify`, the
  orchestrator's resume delivery and `harness detect` no longer read an override. Use a shell
  alias or a `PATH` shim for a wrapper command.
- **BREAKING:** the `models:` config block is renamed `router:`. It keeps `tools`, `providers`,
  `models`, `strict`, `classify`, `chains` and `pins`; `profiles:` and `routing:` stay top-level.
  A `models:` key now fails the load as an unknown key. `sdlc models refresh|list|explain`, the
  machine catalogue's path and `route.chose`'s `model` keep their names.
- A binding's `tool:` (`workflows.<name>.tool`, `pr_review.tool`, `verify.tool`) and `--tool` may
  be a wildcard such as `"*/max"` or `"*/fast[local]"`, walked as a one-entry profile with
  availability probed. It expands through `router.chains.order`, or the built-in order when that
  is unset, as a profile wildcard does.
- `sdlc pr review` refusing a fork PR, under `pr_review.untrusted: refuse` or because no tool
  that asks for workspace trust is left, exits 21, `UNTRUSTED`, not 17, `SERVICE_ERROR`:
  `--trust` is the fix.
- **Breaking:** the default log scope is `repo`, so a relative `log.store.path` now resolves against
  the repository's main checkout rather than the worktree you run in. A `.sdlc/log` that an earlier
  version wrote inside a linked worktree is no longer read: move its `sessions/` and `journal/` into
  the main checkout's `.sdlc/log`, or set `log.store.scope: worktree` to keep one log per worktree.
- Log explorer: the runs index reads the journal incrementally (per shard file, from the last
  byte offset), so a poll no longer re-reads every journal event.
- The machine id (`machine` on session records, `writer` on log lines and the journal directory
  name) is now stable: `m-` plus 16 hex characters derived from the platform machine UUID, instead
  of the hostname, which changes when a laptop's network renames. The UUID is never written.
  Hard cutover, no migration: records and journal directories written with a hostname keep it and
  read as another machine's, so reconcile and the live checks leave them alone.
- The hidden step `task-work` shells out to (lease `claimed` to `working`, reset
  the task branch) is now `sdlc task begin`; `sdlc task start` is the new
  person-facing verb above.
- **Breaking:** the `sessions:` config block is replaced by `log:`. An old
  block is rejected as an unknown key. `sessions.store`
  becomes `log.store`; `sessions.keep_raw` becomes
  `log.capture.raw_transcript`.
- **Breaking:** the default session store moved from `.sdlc/sessions` to
  `.sdlc/log/sessions`. Existing sessions are not moved; relocate them by hand
  or point `log.store.path` at the old location.
- **Breaking:** `workflows.<name>.engine` and `pr_review.engine` are replaced
  by exactly one of `profile:` (a name from the new `profiles:` section) or
  `model:` (a reference such as `codex` or `claude/opus@high`). A config that
  still sets `engine` is an unrecognized key. The `--engine` flags of
  `sdlc pr review` and `sdlc session launch` become `--model <reference>`. A
  launch picks its tool from `--model`, the first matching `routing:` rule, the
  workflow's binding, then the built-in `profiles.default`.
- **Breaking:** `verify.engine` and `verify.model` are replaced by exactly one
  of `verify.profile` or `verify.model`, now a reference such as
  `claude/haiku@low`; a bare model id such as `claude-sonnet-5` no longer
  loads. A config that still sets `verify.engine` is an unrecognized key. A nested
  `sdlc.yaml` that sets either key replaces both of
  its parent's. The tool must be one of claude, codex, antigravity or opencode.
- An external `log.store.path` is an error in `sdlc.yaml`; set it in
  `sdlc.local.yaml`.
- The setup wizard's `history` and `sessions` steps are one `log` step, and it
  has no `redact` choice (an old one is rejected as unknown): redaction is always on.
  It warns about every content channel captured into a tracked (`publish: repo`) store.
- The `--host` help of `session launch` and `pr review` lists every host, generated from the host
  names instead of hand-typed.
- `Host.send` returns `{accepted, ack}`; `ack` is true only when the host itself confirmed the
  harness consumed the input (`orca`, `herdr`; `jetbrains` never acks: the terminal API cannot
  confirm consumption). `uncertain` marks a send that was accepted but whose landing the host cannot
  tell; it arms no `host-ack` and is not re-sent.
- The `live` route is skipped while the session is `waiting_for_input`, so
  the Enter cannot answer a permission prompt.
- `herdr` refuses to type into a pane it does not recognise as an agent.
- `log.capture.prompts` now also governs the launch prompt text stored in a session's `launched`
  event, and `capture.messages` / `capture.tool_output` govern the headless `log.txt`; with them off
  neither is stored. The `turn.prompt` digest is written only when `log.capture.prompts` is on.
- `log.max_blob_bytes` must be at least `log.max_inline_bytes` (config error otherwise), and
  `log.redact.extra_patterns` refuses more catastrophic shapes (overlapping alternation under an
  unbounded repeat, large repeats of unbounded groups).
- `sdlc project doctor` reports `lostSessions` as `{count, unknown?, hostsSkipped?}`, says when the
  check could not run, and skips host probes when many sessions are open on a host.
- The Codex and Cursor hook spool is `sdlc-hook.*` in `$TMPDIR`, and stale files are swept; re-run
  `sdlc log hooks install` to pick up the new command.
- The machine id is cached in the user cache dir and the hostname fallback is hashed.
- Run explorer: narrow-screen layouts for Runs, Sessions and Search; `?fixtures=1` shows a
  fixture-data banner; the search poll pauses once you page past the first page; the read-only probe
  is shared and buttons stay hidden until it answers; the execution graph colours follow the
  light/dark tokens.
- Journal `since` queries compare instants (fractional seconds and offsets). The explorer's run and
  op reads share one incremental journal reader, and session scans read incrementally.
- The `craft` skill `canvas` is now `parley`: invoke `/craft:parley`, and keep documents in
  `docs/parley/`. There is no alias for the old name. Its engine is the `@sksizer/parley` package;
  the skill ships it as one bundled `parley.mjs` that runs under bun, node 22+ and deno.
  `answers --wait --timeout` now exits `10` when nothing arrives (it was `3`), and the env vars
  are `PARLEY_DOC`, `PARLEY_DIR` and `PARLEY_MODEL`.
- `/sdlc:backlog-triage` checks each item against `origin/main` before deciding. It leaves an item
  alone when an open PR already addresses it. ([#3067](https://github.com/sksizer/dev/pull/3067))
- The `sdlc.yaml` schema accepts `orchestrator.target_branch`, `orchestrator.merge` and
  `orchestrator.goal`. They have no effect yet. ([#3042](https://github.com/sksizer/dev/pull/3042))

### Fixed

- A detached task run now starts in its own session and process group and is re-parented away from
  the loop, so stopping the `work` loop (or its shell) no longer kills running tasks.
- The `work` tick no longer redispatches a task whose `task/<basename>` branch has an open PR
  (`in-review`), or whose branch is left by an earlier run (`needs-resume`: a person resumes it with
  `/sdlc:task-work`). A dead run's log now says so.
- The `work` tick skips a task whose task lease is held and unexpired on the lease authority, so a
  second loop process cannot start a task another run is still working (it used to rely on the
  operation lease and the local worktree roster). A failed, parked or dead run's task lease is not
  released, so that task waits out the lease (up to an hour) before it is started again, by the
  loop or by `sdlc task dispatch`.
- The `work` tick no longer waits for a task: it starts each task's sequence as a detached run and
  returns, up to `limits.implement` at once, so the `prs`/`merges`/`issues` ticks are not held up.
  A run that dies without an outcome is reported as stale.
- A PR on the `task/<basename>` branch of a task the loop ran is in scope for the PR ticks without
  the `pr_filters.include_labels` label; human PRs still need it.
- A codex reference to a local model (`codex/ollama/qwen3:4b`, or a tier that resolves to one)
  launched codex without `--oss --local-provider <provider>`, so the run went to OpenAI. Every
  codex launch (headless, interactive, `sdlc verify changes`, a step of `sdlc run`, and a
  `codex exec resume` delivery) now passes the launch mode the catalogue's `via` names for the
  provider, with the model by the name the mode takes. The route, `route.chose` and the author
  record name the model `provider/id`, so they say where it ran.
- Hooks of a harness an agent started directly (a Claude session running `codex exec` or
  `cursor-agent`) were filed in the parent session because the child inherits `SDLC_SESSION`, and
  the child's `SessionEnd` could end the parent. They now go to a child record of their own.
- Reconcile no longer ends a session as `lost` when the process scan fails (`ps` error,
  unreadable `/proc`) or the host probe throws; both read as unknown. `scanTaggedProcesses`
  (`@sksizer/agent-session`) returns `null` when it could not scan.
- A hook `state_changed` planned from a stale state is applied when its target is legal from
  the current state, so a late `Stop` no longer leaves a session `waiting_for_input`; the
  journal gets no `session.*` line for an event the session log ignored.
- Pi: a provider retry no longer logs a `turn.stop` or flips the session idle; the turn ends
  on `agent_settled`, and the session-file parser keeps only a retried turn's final stop.
- OpenCode: a malformed `OPENCODE_CONFIG_CONTENT` makes the launch launch-only instead of
  dropping the user's config; the plugin URL is file-URL encoded; a turn with no reply no
  longer reports the previous one. Pi and OpenCode no longer count a not-yet-written
  transcript as a rejected path. Forwarder spool files older than an hour are swept.
- Digest: a long run keeps its lock alive and only one racing digest can take over a stale
  lock; one malformed transcript field (bad timestamp, negative cost) is skipped with a note
  instead of aborting; a failed raw copy leaves the session pending so the next run retries.
- Raw-transcript redaction is about 3x faster and no longer blanks session ids or token
  counts. Mermaid and DOT trace labels are escaped. Hook metadata strings are capped at
  200 characters.
- `/logs/sessions/<id>` and its blob route accept a unique id prefix. A paused log page stays
  paused across navigation; Escape in an input no longer clears the trace selection; the
  trace Events panel filters subagent events on the server (`/api/log/search?agent=`) and
  says when results are capped; the session list polls every 15 s and says when it shows only
  the newest 200. Reconcile failures in the dashboard log a line.
- `sdlc journal append` exits 0 with `written: false` when the journal is turned off.
- Friction: `dispatch-fallback` fires on route order (`resume`/`fresh` after `live` for the
  same PR), not on reason text; a strict-failed step is journalled `failed` so it yields
  `step-failure`; step fingerprints use the step's kind and name, not its index.
- Live delivery: wezterm types only into a pane it spawned and still sees on the same tty;
  otty sends only when it sees the agent in the pane's foreground; the never-type-twice guard
  no longer expires with the capped attempt log; journalled reasons are redacted before they
  are cut. The VS Code host
  tightens existing socket and registry directories to 0700. A win32 env var name that is not
  a plain identifier is refused.
- Log search skips non-matching lines before parsing them, and a live session's cost is summed
  incrementally rather than re-read on every poll.
- The `sdlc platforms` CI job runs the moon `sdlc:test` task (timeout, ignores, preload).
- The Pi adapter finds session files where Pi writes them: `PI_CODING_AGENT_SESSION_DIR`, else
  `$PI_CODING_AGENT_DIR/sessions`, else `~/.pi/agent/sessions` (it ignored `PI_CODING_AGENT_DIR`, so
  the digest found no transcript for a Pi with a moved config).
- `sdlc session digest` and `sdlc session reconcile` accept a unique id prefix, like `show` and
  `trace`.
- A dashboard server built for a real socket treats a request with no socket bindings as remote, so
  the LAN token and read-only mutation gates cannot be bypassed by a runtime that omits them. The
  LAN token redirect is same-origin and path-only, and the LAN cookie is port-scoped
  (`sdlc_dashboard_token_<port>`).
- Friction promote and dismiss report a closed friction as `CAS_FAILED` (CLI exit 10, HTTP 409) and
  a missing one as `REF_NOT_FOUND` (HTTP 404).
- The path guard no longer lets a dangling symlink or a `..` after a missing name escape the root,
  and more path checks use it. ([#2999](https://github.com/sksizer/dev/pull/2999),
  [#3024](https://github.com/sksizer/dev/pull/3024),
  [#2997](https://github.com/sksizer/dev/pull/2997))
- On a `parley` choice question, words typed with no option ticked become a question for the
  agent instead of a note marked answered. ([#3011](https://github.com/sksizer/dev/pull/3011))
- Resuming a session from the dashboard keeps it in the session log.
  ([#3069](https://github.com/sksizer/dev/pull/3069))

## [0.13.0] - 2026-10-10

Antigravity replaces Gemini CLI, and the `canvas` review page becomes a conversation with the
agent. The libraries the pack vendors now carry correct versions and their own changelogs. `craft`
ships as 0.5.0.

### Added

- `canvas` gains the `figure` block (one image with a caption and an optional link to its live
  version), the `question` block (questions placed in the centre column where the reader meets what
  they decide), the `code-flow` block (a path through code drawn as a sequence diagram) and the
  `workflow` block (a process drawn as a flowchart with lanes). Both diagrams are inline SVG with
  their mermaid source under a disclosure. ([#2954](https://github.com/sksizer/dev/pull/2954))
- `canvas render --out <doc>.md` (or `--format markdown`) writes the same document as markdown:
  headings, lists, tables and mermaid fences, for a PR body or a README. Every block writes its own
  markdown. ([#2954](https://github.com/sksizer/dev/pull/2954))
- `canvas` comments reach the agent as they are added, and `answers.ts <id> --wait` blocks until the
  reviewer sends something, prints it and exits; `--reply <id> --text "..." --model <id>` answers
  in place, and `--notify "<command>"` keeps a watcher running that pushes every send into a
  session, with `--timeout`. **Save draft** keeps a comment private until **Send**.
  ([#2954](https://github.com/sksizer/dev/pull/2954))
- `canvas` comments and asked-back questions are threads: the agent's replies and the reviewer's
  follow-ups sit under the item in order, a follow-up wakes the watcher under the same id, and
  quoted words show their thread on hover and go to it on click.
  ([#2954](https://github.com/sksizer/dev/pull/2954))
- Every `canvas` question offers "None of these, or I have a question", which keeps it open until
  the agent replies. A progress meter in the header shows one segment per question, arrows beside it
  and the `n` / `p` keys step through questions, and a **Verdict** control (Still reviewing, Changes
  requested, Approved) is what the agent reads back.
  ([#2954](https://github.com/sksizer/dev/pull/2954))
- `canvas` figures and diagrams open full size in a lightbox, the pane heads stay put while a pane
  scrolls, and the servlet's front page lists every document with its block kinds, verdict, answered
  count and comment count. ([#2954](https://github.com/sksizer/dev/pull/2954))

### Changed

- Every library under `packages/ts` and `packages/rust` has a version reconstructed from its history
  and a `CHANGELOG.md`, and workspace dependency ranges follow. The pack ships `easy-git` 0.5.0,
  `easy-gh` 0.4.0, `command-seam` 0.2.0 and `cli-tool` 0.4.0 in place of placeholder 0.1.0 releases.
  ([#2961](https://github.com/sksizer/dev/pull/2961))
- **BREAKING:** Gemini CLI support is replaced by Google Antigravity (`agy`), a hard cutover with no
  alias. `verify.engine` in `sdlc.yaml` now accepts `claude`, `codex`, `antigravity` or `opencode`;
  `gemini` is rejected, so a project that sets it must change it. `sdlc harness detect` reports
  `antigravity` (binary `agy`) in place of `gemini`; its sign-in verdict is always `unknown`, as
  `agy` keeps its login in the OS keyring. Antigravity renders skills and MCP configuration only.
  ([#2955](https://github.com/sksizer/dev/pull/2955))
- `canvas` lays out one way at every width, with rails that become overlays under 1100px. The
  walkthrough carries only what the left does not show, and a node the left shows in full gets a
  compact row for comments. ([#2954](https://github.com/sksizer/dev/pull/2954))
- `pr-stats` no longer refers to an `sdlc` skill, so `craft` stands alone; `task-work` documents the
  integration on its side. ([#2954](https://github.com/sksizer/dev/pull/2954))
- The CLI's git, GitHub and shell calls move onto the shared command seam and the `easy-git` and
  `easy-gh` clients (`AsyncGh`, tolerant reads, shared shell quoting). No command changes its
  interface. ([#2950](https://github.com/sksizer/dev/pull/2950))

### Fixed

- The `setup` skill and the lease service README named the wrong exit code for a namespace conflict;
  the CLI exits with 15, as the code and its tests already did.
  ([#2257](https://github.com/sksizer/dev/pull/2257))

## [0.12.0] - 2026-10-09

A change-statistics command for pull requests, and the same tool as a `craft` skill. `craft` ships
as 0.4.0.

### Added

- `sdlc pr stats <pr>` (and `--base <ref>` for a branch) summarizes a pull request beyond GitHub's
  +/-: lines added and removed by code, comments, blank and prose, with generated bundles counted
  apart; a change-category breakdown (added, deleted, renamed, tests, docs, generated,
  formatting-only, comment-only, logic); dependency and exported-API changes; and the
  cyclomatic-complexity movers. `--write` puts the table in the PR body as a `## Change statistics`
  section between `<!-- sdlc-pr-stats:start -->` and `<!-- sdlc-pr-stats:end -->` markers, before
  the lease footer, and re-running replaces it in place; `--detail` adds the per-file list and
  `--json` prints the report. ([#2911](https://github.com/sksizer/dev/pull/2911))
- `craft` gains the `pr-stats` skill: the same measurement from one bundled script that needs only
  plain Node, git and `gh`, and no other plugin. Complexity for languages other than
  TypeScript needs `lizard` on PATH.
  ([#2911](https://github.com/sksizer/dev/pull/2911))

### Changed

- The `task-work` skill adds the change statistics to the PR body after opening it, best-effort: a
  failure is noted in the final report and never blocks the run.
  ([#2911](https://github.com/sksizer/dev/pull/2911))

## [0.11.0] - 2026-10-08

New `craft` skills, and the public repository now tags its own releases. The `sdlc` plugin and CLI
are unchanged from 0.10.0. `craft` ships as 0.3.0.

### Added

- `craft` gains three skills for reviewing work as a page:
  - `canvas` checks, renders and serves a typed document as one reviewable page: click a numbered
    node, read its section in the walkthrough, comment on selected words, answer the agent's
    questions, and the answers land in a JSON sidecar the agent reads back. Documents are lists of
    typed blocks (`prose`, `annotated-text`, `schema`, `operations`). Its peer scripts run under
    bun, Node 23.6+ or Deno with no dependencies and no build step.
  - `explain` writes one canvas document with no questions, for a reader who needs to understand
    something.
  - `propose-solution` writes one canvas document that ends in a decision, with a recommended
    answer for every trade-off the reviewer must ratify, so the page can be approved or sent back.
  - Both take a domain as their first argument and read `domains/<domain>.md` beside the skill;
    `sql` is the first domain (queries and schemas under `explain`, changes under
    `propose-solution`).
  ([#2935](https://github.com/sksizer/dev/pull/2935))
- The public `sksizer/sdlc` repository tags a release when its pull request merges: on a push to
  `main` it creates the annotated `v<version>` tag from the marketplace manifest, once
  `CHANGELOG.md` has a section for that version.
  ([#2939](https://github.com/sksizer/dev/pull/2939))

## [0.10.0] - 2026-10-08

The public `sksizer/sdlc` repository becomes a two-plugin marketplace. The `sdlc`
plugin and CLI are unchanged from 0.9.0.

### Added

- The public `sksizer/sdlc` repository now also publishes the `craft` plugin
  (script-free, portable skills) beside `sdlc`, for Claude Code, Codex,
  Cursor and Pi. Install it with `/plugin install craft@sdlc`. `craft` is
  versioned on its own and ships as 0.2.0, with seven skills: `research`,
  `decision-make`, `capability-groom`, `explore-codebase`,
  `api-enhancement-scan`, `skill-author` and `skill-review`.
- `craft`'s `skill-review` grades one skill or a plugin's skills against the
  `skill-author` checks and against each other (drift, dead references,
  overlap, two processes, orphans, vocabulary) and reports one
  recommendation per finding; `--fix` hands marked skills to `skill-author`.
  ([#2928](https://github.com/sksizer/dev/pull/2928))

### Changed

- `craft`'s `skill-author` calls other skills by wikilink, keeps prose short
  and maps non-linear flow; its agent-pants rules apply only when agent-pants
  is installed. ([#2928](https://github.com/sksizer/dev/pull/2928))

## [0.9.0] - 2026-10-08

Adoption, sessions and a safer orchestrator: the setup wizard becomes real
ops, every launch writes one session record, the orchestrator is safe to
run live, branch cleanup becomes plan, verify and apply, and the entity
commands gain a uniform read surface.

### Added

- `sdlc setup plan` and `sdlc setup apply [--choices <json|file>] [--up-to <step>]`:
  the adoption wizard's steps as ops. `plan` shows the file changes and
  notes without writing; `apply` makes them. Both are additive: a key
  already set, or a file that exists with different text, is reported and
  left alone, and nothing is removed, so replaying the same choices changes
  nothing. A default run writes only what every project wants (the
  `.gitignore` section, the `sdlc.yaml` skeleton and example docs); checks,
  extensions, sandbox lists and the look-back prompt are written only when
  chosen. Setup offers the runners it detected, can write machine-local
  choices to `sdlc.local.yaml`, and lists choices it cannot write yet
  instead of dropping them silently.
  ([#2822](https://github.com/sksizer/dev/pull/2822),
  [#2825](https://github.com/sksizer/dev/pull/2825),
  [#2827](https://github.com/sksizer/dev/pull/2827),
  [#2886](https://github.com/sksizer/dev/pull/2886))
- `sdlc harness detect [--write-host-default]`: reports the AI tools that are
  installed, local runtimes (Ollama, LM Studio) and their models, session
  hosts, and sign-in state (signed in or unknown, never "signed out"), and
  can write `host.default`. `project doctor` prints the same table.
  ([#2886](https://github.com/sksizer/dev/pull/2886))
- `sdlc project doctor` checks authentication for the code host the repo
  uses and prints one fix line per failed check; it also prints the
  resolved tracker and code host and warns when `sessions.keep_raw` is set
  with a store outside the project.
  ([#2660](https://github.com/sksizer/dev/pull/2660),
  [#2886](https://github.com/sksizer/dev/pull/2886))
- Unknown nouns, verbs, config keys and repo names get "did you mean"
  suggestions, and top-level `sdlc --help` shows a one-line summary for each
  noun. ([#2660](https://github.com/sksizer/dev/pull/2660))
- `sdlc shell completion`: bash, zsh and fish completion generated from the
  op registry. ([#2660](https://github.com/sksizer/dev/pull/2660))
- Every entity kind (backlog, capability, decision, driver, milestone,
  principle, product, reference, roadmap, standard, task, term) gets the
  same read verbs: `list`, `get`, `search` and `related`.
  ([#2664](https://github.com/sksizer/dev/pull/2664))
- The `note` kind (`N-XXXX`, a required `genre` and an optional `parent`)
  with `sdlc note create|get|list|preview-id|related|search`. A roadmap's
  `plan_doc` now links a note, and `roadmap check` resolves it
  (`missing_plan_note`). ([#2512](https://github.com/sksizer/dev/pull/2512))
- OKF v0.2 is the base contract: every entity accepts `description`,
  `resource`, `status`, `stale_after`, `generated`, `verified`, `sources` and
  `usage_window`, and `sdlc okf validate` walks `docs/` as a bundle (every
  non-reserved markdown file carries frontmatter with a `type`).
  ([#2512](https://github.com/sksizer/dev/pull/2512))
- Planning links on the capability graph: a capability can name its
  `product`, a milestone can list the `capabilities` it advances,
  `entities audit` reports a `dangling_link` for either, and `roadmap check`
  reports `missing_capability`.
  ([#2513](https://github.com/sksizer/dev/pull/2513))
- `sdlc capability graph` gains `--audience user|system`, `--tree` (indented
  containment tree), `--depth N` (with `--tree`; hidden children show a
  `(+K)` count) and `--unnested` (capabilities with no parent that are not
  a system root). `sdlc capability relations <id>` and
  `GET /api/capabilities/:id/relations` (client method
  `getCapabilityRelations`) return a capability's children, the milestones
  that list it and their open tasks.
  ([#2513](https://github.com/sksizer/dev/pull/2513),
  [#2595](https://github.com/sksizer/dev/pull/2595),
  [#2633](https://github.com/sksizer/dev/pull/2633))
- `sdlc roadmap check --strict-order` also reports ordered-flow findings
  (off by default). ([#2886](https://github.com/sksizer/dev/pull/2886))
- `sdlc config pin-test` records the project's test command once in
  `sdlc.yaml`; `pr_update.verify: test` runs only that recorded command.
  `sdlc config migrate-machine` upgrades the machine config file to the
  current version and keeps a `.bak`.
  ([#2662](https://github.com/sksizer/dev/pull/2662))
- `sdlc pr update`: a configurable `pr_update.repair.command` can fix a
  conflict or a failed verify (`pr_update.repair.on`); `--confirm-push` shows
  the commits and diffstat and asks before each force-push;
  `pr_update.max_failed_attempts` (default 1) and `--retry-failed` skip a PR
  whose update failed until its head or base moves.
  ([#2662](https://github.com/sksizer/dev/pull/2662))
- `sdlc pr review` refreshes a reused worktree, and updates the PR first when
  it is behind its base (`pr_review.refresh`: `update` (default), `pull` or
  `off`; `--no-refresh` for one run). `pr_review.related_prs` lists stacked
  and overlapping PRs in the review brief.
  ([#2662](https://github.com/sksizer/dev/pull/2662))
- Orchestrator safety: a new `CI-BLOCKED` verdict for checks that a billing or
  spending-limit block stopped (no `pr-respond` is dispatched for it);
  `orchestrator.pr_filters.exclude_drafts` (default `true`) and
  `include_labels` (opt-in) scope which PRs the `prs` and `merges` ticks touch;
  `orchestrator.limits.*` caps every session-starting dispatch (`implement`,
  `pr_review`, `pr_respond`, `pr_update`, `close_out`, `issues`, optional
  `total`, and `session_ttl_minutes`); `orchestrate run` lists every planned
  item, dry-run or live. ([#2462](https://github.com/sksizer/dev/pull/2462))
- Orchestrator efficiency and visibility: the `prs` tick lists open PRs and
  fully fetches only those whose `updatedAt` changed
  (`orchestrator.polling.full_refresh_secs`, default 900);
  `router.quiet_period_secs` (default 120) batches a reviewer's consecutive
  comments into one delivery; `sdlc orchestrate status --waiting` and a
  dashboard panel list the tasks and PRs waiting on a person.
  ([#2663](https://github.com/sksizer/dev/pull/2663))
- Dispatch hardening: review feedback goes to a file under `.sdlc/feedback/`
  and the session gets a one-line pointer; the router never starts a second
  session beside a running one; the work tick re-checks `depends_on` before
  launching and holds the task as `blocked-deps`; `sdlc pr update` tells the
  live session on a rebased branch to fetch and rebase.
  ([#2663](https://github.com/sksizer/dev/pull/2663))
- `sdlc session focus <target>` brings the terminal of a task, PR or branch
  forward, through a new optional host `focus` part (Orca and tmux).
  ([#2663](https://github.com/sksizer/dev/pull/2663))
- A `sessions:` config block (local layer): `sessions.store.path` and
  `sessions.store.layout` (`flat` or `by-project`) choose where session records
  live (default `.sdlc/sessions`), and `sessions.keep_raw` is reserved. Each
  session keeps an append-only `events.jsonl` log and a `machine` field, and
  records carry kind, origin, state, outcome and author. Session commands
  ignore other machines' records.
  ([#2823](https://github.com/sksizer/dev/pull/2823),
  [#2886](https://github.com/sksizer/dev/pull/2886))
- A `tracker:` config block (`tracker.kind`, default `github`) behind a Tracker
  port with a GitHub Issues adapter, and the code host is its own port
  (`@osdlc/code-host`) that `pr survey` and `pr update` go through; every PR
  argument parses with one `parsePrInput`.
  ([#2886](https://github.com/sksizer/dev/pull/2886))
- Each PR head gets a step evidence ledger at `.sdlc/pr-evidence/<sha>.jsonl`,
  and every `sdlc.yaml` key carries an enforcement grade, projected into the
  generated `docs/sdlc-yaml-enforcement.md`.
  ([#2886](https://github.com/sksizer/dev/pull/2886))
- Safe branch and worktree cleanup: `sdlc project apply-cleanup --plan <file>
  [--row <category:id>] [--authorize <name[=category:id]>]` re-checks an
  approved plan, deletes compare-and-swap on the judged commit and writes a
  receipt. `sdlc project cleanup` now fetches first (`--no-fetch` to skip;
  a repo whose fetch failed is an error row), writes a plan with
  `--write-plan` or `--plan-out`, narrows to one branch with `--branch`,
  reports worktrees that are locked, hide index edits, nest repos or share a
  branch, and reports one remote checked out as several clones. Each row names
  the authorization its delete needs (`abandon-unmerged`, `discard-changes`,
  `confirm-open-pr`). `session-cleanup` runs on this plan and apply pair.
  ([#2640](https://github.com/sksizer/dev/pull/2640))
- `sdlc project follow <checkout> [--status]` fast-forwards a served project's
  detached checkout to `origin/main` when the tree is clean, and
  `sdlc project follow-loop start <checkout> [--interval <secs>]` repeats it
  (default 60s). ([#2597](https://github.com/sksizer/dev/pull/2597))
- Multi-root projects: `task resolve` searches every planning root,
  `task start` finds a task in a nested planning root, and every op builds
  worktree paths from one worktree root. ([#2560](https://github.com/sksizer/dev/pull/2560),
  [#2561](https://github.com/sksizer/dev/pull/2561),
  [#2566](https://github.com/sksizer/dev/pull/2566))
- Harness distribution: `sdlc dev install` writes the launcher as a real-file
  shim instead of a symlink; dispatched prompts pin the running `sdlc`
  (`SDLC_PINNED_CMD`, opt out with `--no-pin-sdlc`) and every launch and
  resume sets `SDLC_SESSION` and `SDLC_TASK`; a dispatched agent loads
  skills from a session-local plugin directory; harness plugins install
  through each harness's own CLI. ([#2661](https://github.com/sksizer/dev/pull/2661))
- A Pi export: the plugin builds a `.pi/` tree beside `.claude-plugin/`,
  `.agents/` and `.cursor-plugin/`, one Pi package per plugin, with skills
  named `<plugin>-<skill>` (install with `pi install <path>/.pi/packs/<plugin>`).
  Skill invocations in plugin source are `/[[skill]]` calls rendered in each
  harness's own spelling. ([#2482](https://github.com/sksizer/dev/pull/2482),
  [#2483](https://github.com/sksizer/dev/pull/2483))
- The dev-checkout launcher names the checkout and says `bun install` when a
  declared dependency is missing, instead of printing a module-resolution
  trace. ([#2599](https://github.com/sksizer/dev/pull/2599))
- `GET /api/entities/notes` and `/api/entities/notes/:id`; entity list rows
  carry `genre` and `parent`. ([#2569](https://github.com/sksizer/dev/pull/2569))
- The docs site builds a reference page for every plugin's skills, not only
  `sdlc`'s. ([#2835](https://github.com/sksizer/dev/pull/2835))
- `GET /api/session-records` and `getSessionRecords` in `@sdlc/dashboard-client`: the session
  store's records (state, author, origin, task, outcome) as typed JSON. The dashboard sessions page
  lists them above the Claude transcripts.

### Changed

- **BREAKING:** the per-lease session note (`.sdlc/dispatch/sessions/<lease>.json`) is deleted
  with `SessionNote`, `SessionRegistry`, `reconcileNotes` and `reportStatusEvent`. The session
  record is the only record: `session list`'s `state` column is now the record's `state`
  (`starting`, `running`, `waiting_for_input`, `idle`, `ended`), and is never `null`. Existing
  note files are no longer read; delete them. The hook-status mapping moved to
  `lib/services/session/hook-status.ts`.
- **BREAKING:** the `forge:` key in `sdlc.yaml` is renamed `code_host:`
  (`code_host.override` still takes `'github' | 'forgejo' | null`). A stale
  `forge:` key is an unknown key, and an invalid `sdlc.yaml` is fatal: the
  config refuses to load until `forge:` is renamed to `code_host:` (in
  `sdlc.local.yaml` too). There is no alias. The `Forge` port is renamed `CodeHost` throughout
  (`selectForge` -> `selectCodeHost`, `GithubForge` -> `GithubCodeHost`,
  `ForgejoForge` -> `ForgejoCodeHost`, `lib/services/pr/forge/` ->
  `lib/services/pr/code-host/`).
- The built-in `judge` workflow now runs `sdlc verify changes --blocking`
  (one `script:` step) instead of nothing. A project without its own
  `workflows.judge` now runs an AI review in the gate, which costs tokens;
  set `workflows.judge` to override it, or to `[]` to opt out. The step
  assumes `sdlc` is on `PATH`. (T-3N5B)
- **BREAKING:** `orchestrator.max_implementations` is now
  `orchestrator.limits.implement` (same default, 5). The orchestrator block
  rejects unknown keys, so `sdlc.yaml` refuses to load until you rename it.
  There is no alias.
  ([#2462](https://github.com/sksizer/dev/pull/2462))
- **BREAKING:** session records are one type. The field `hostSessionId` is now
  `harnessSessionId`, and a record written before the event log (or without
  `kind`, `origin`, `state`, `outcome`, `author` and `harnessSessionId`) fails
  the schema and is skipped by `session list`. Nothing migrates old records.
  ([#2823](https://github.com/sksizer/dev/pull/2823),
  [#2886](https://github.com/sksizer/dev/pull/2886))
- **BREAKING:** `entities validate` now fails a file stamped with an older
  schema version (`[schema_version/outdated]`), and `ensure-ready` refuses a
  task behind the current task schema. Run `sdlc entities migrate` first;
  `entities migrate --dry-run` now runs the transform chain in memory so each
  plan line says what changes (for example `v3 -> v9 (status -> state)`), and
  `entities migrate` is listed in help.
  ([#2600](https://github.com/sksizer/dev/pull/2600))
- The `harness` key in `sdlc.yaml` is no longer reserved: `sdlc apply` acts on it.
  ([#2886](https://github.com/sksizer/dev/pull/2886))
- `--project-root` help states the real default (the nearest directory above
  the cwd that holds an `sdlc.yaml`), not "cwd".
  ([#2602](https://github.com/sksizer/dev/pull/2602))

### Removed

- **BREAKING:** the `explore-codebase` and `api-enhancement-scan` skills
  leave the `sdlc` plugin. They moved to the portable `craft` plugin, which
  the sdlc product does not ship; install them from a source that carries
  `craft`. ([#2835](https://github.com/sksizer/dev/pull/2835))
- The legacy `docs/planning/backlogs/` directory alias: backlog entries load
  from `docs/planning/backlog/` only.
  ([#2770](https://github.com/sksizer/dev/pull/2770))

### Fixed

- A merged PR counts as proof that a branch landed only on an exact head-SHA,
  same-repo match; a closed task alone never turns an unmerged branch into a
  force delete; local-branch ancestry is measured against the remote default
  branch, and slashed default branch names are read whole. `task-close-out`
  deletes the remote branch only at the merged PR's head.
  ([#2640](https://github.com/sksizer/dev/pull/2640))
- A `BEHIND` PR no longer marks new review comments as read: they surface as
  `NEEDS-RESPONSE` once the branch is current.
  ([#2462](https://github.com/sksizer/dev/pull/2462))
- `sdlc pr update` no longer pushes a rebase that hit a second conflict
  half-replayed. ([#2662](https://github.com/sksizer/dev/pull/2662))
- Staging a path that begins with `-` no longer reads it as an option
  (`git add` always puts `--` before the paths).
  ([#2806](https://github.com/sksizer/dev/pull/2806))
- The docs site no longer strips `^2` out of `mc^2`: a block id needs
  whitespace or a line start before it.
  ([#2792](https://github.com/sksizer/dev/pull/2792))
- `sdlc gate corpus-invocation` no longer walks `node_modules` and follows
  symlinks (23 minutes became about a second), and reports the exempt
  runtime-conventions doc once. ([#2835](https://github.com/sksizer/dev/pull/2835))

## [0.8.0] - 2026-09-28

Phase 13 of the sdlc plan (M-I6NE,
[#2421](https://github.com/sksizer/dev/pull/2421)) — the last phase of the
sdlc 0.8 roadmap (RM-E2L0), which now completes.

### Added

- `sdlc tui`: an Ink terminal UI over the op registry. A PR page shows real
  `pr survey` data with sort, filter and multi-select, and `u` dispatches a
  real `pr update --apply`; a Tasks page joins `task next` and `task
  inflight`. Respond, open-session, work and orchestrate are labelled stubs
  pending the session/router layer.
  ([#2421](https://github.com/sksizer/dev/pull/2421))
- `@sksizer/command-seam` gains streaming and managed-process doors
  (T-TOFK); every `@sdlc:ignore-spawn` call site (`supervise`,
  `release-lib`, `install-desktop-apps`, the docs-site build, `quality
  run`'s log mode, session-attach, the terminal host) moves onto them, and
  `check_command_seam.sh` is now import-aware so an injected dependency no
  longer false-positives. ([#2421](https://github.com/sksizer/dev/pull/2421))

### Changed

- The audit-driven refactors: lease-payload mint-site consolidation, with
  transition/reconcile now delegating; oversized functions split across
  capability/task/migrate/validate and the dashboard; the `MigrationError`
  hoist; a shared `plugin/registry.ts` for info-report/resolve; and a
  util/config single-home sweep. ([#2421](https://github.com/sksizer/dev/pull/2421))
- The session-attach spawn, moved onto the streaming door, now reports the
  exit code instead of throwing.
  ([#2421](https://github.com/sksizer/dev/pull/2421))

### Removed

- **BREAKING:** the `sdlc quality baseline prune` CLI op — defined as a
  command but never invoked from production code, a skill, or another op;
  the underlying `prune()` helper remains in `baseline.ts` for future use.
  ([#2421](https://github.com/sksizer/dev/pull/2421))
- Dead code and exports: the `lib/model/index.ts` barrel and its dangling
  `frontmatterOf`/`readFrontmatter` re-exports, dead default exports from
  the claims resolvers, the `projectSeedSet` re-export, the dashboard's
  `tcpProbe` helper, and the `projectRegistry()` singleton wrapper.
  ([#2421](https://github.com/sksizer/dev/pull/2421))

### Fixed

- `verify changes --base <branch>` preferring a local branch ahead of
  origin (T-PEUC). ([#2421](https://github.com/sksizer/dev/pull/2421))
- The empty-registry CLI help summary, which now falls back to lifecycle
  phases instead of showing nothing (T-H0SB).
  ([#2421](https://github.com/sksizer/dev/pull/2421))
- Stale-comment and stale-doc sweeps across `lib/model`, `quality`, and the
  docs/tests trees. ([#2421](https://github.com/sksizer/dev/pull/2421))
- The packaged Node CLI's `sdlc dashboard start`, which timed out
  ("dashboard did not confirm startup within 5s") because bundling collapsed
  every module's `import.meta.url` to `cli/sdlc.js`, so the detached child
  re-ran the whole CLI with `--host` as a bogus top-level flag; the child now
  re-enters through a real `dashboard start --foreground` CLI route. Also
  stops the packaged CLI printing `MODULE_TYPELESS_PACKAGE_JSON` on every
  invocation.
  ([#2434](https://github.com/sksizer/dev/pull/2434))
- The same self-invocation bug in the compiled binary (`bun build
  --compile`): `dashboard start`'s detached child and `backlog create`'s
  validation shell-out both re-invoked a `cli/sdlc.{js,ts}` path the
  binary's asset tar never ships, and a standalone binary has no argv slot
  for an entry path anyway (`argument NOUN: invalid choice: <path>`). Both
  now build their subprocess argv through one `sdlcSelfInvocation()` helper
  that resolves to `[binary]`, `[node, cli/sdlc.js]`, or `[bun,
  cli/sdlc.ts]` depending on how sdlc is running.
  ([#2434](https://github.com/sksizer/dev/pull/2434))

## [0.7.0] - 2026-09-28

v0.5.0 and v0.6.0 were never cut — this release rolls both up, covering
everything merged to main since v0.4.0: Phases 4 through 12 of the sdlc
plan, plus the Router, the forge port, detection consolidation, and the
lifecycle simplification.

### Added

#### Phase 4 — audit report

- A full audit of the sdlc plan: surface grading of every skill, CLI
  noun/op and `sdlc.yaml` config key; a code-quality review across
  `solutions/ontological` and its workspace-package dependencies (99
  findings); and reconciliation against the prior 2026-07-19
  simplification audit (79 of 96 items confirmed fixed). Report-only, no
  code changes. ([#2285](https://github.com/sksizer/dev/pull/2285))

#### Phase 5 — meta-defined `sdlc.yaml`, config CLI, hooks

- Every `SdlcConfigSchema` key now carries a typed `.meta()` block
  (`category`, `consumers`, `layers`, `applies_via`, `runs_in`), enforced
  by a completeness test.
- `sdlc config list|explain|get|set|unset`; `set`/`unset` write through
  `yaml-splice` and preserve every untouched byte of the file.
  `docs/sdlc-yaml-reference.md` is generated from the schema plus meta.
- `sdlc init` scaffolds a starter `sdlc.yaml`; `sdlc run <workflow>` runs
  a workflow through the step runner.
- `hooks:` config maps git hooks to workflow `run`/`script` steps
  (`when: always|deps-missing`, `on_fail: warn|block|park`); `sdlc hooks
  run <hook>`.
- `sdlc apply [--dry-run|--check]` applies hooks/harness/mcp appliers
  keyed by the meta's `applies_via`; `project doctor` reports drift.
  ([#2319](https://github.com/sksizer/dev/pull/2319))

#### Phase 6 — hosts and cross-host sessions

- New engine-native hosts under `lib/services/host/hosts/`: `claude`,
  `codex`, `cursor`, alongside the existing `terminal`/`orca`/`cmux`
  wrapper hosts.
- `sdlc session list` / `sdlc session attach <id>` read
  `.sdlc/sessions/<id>/record.json` across every host, zod-validated on
  read.
- A `sessions.workflows.<name>.{engine,host}` config section gives
  per-workflow defaults for `sdlc session launch`.
  ([#2327](https://github.com/sksizer/dev/pull/2327))

#### The Router — PR feedback delivery, pause/resume, per-item dispatch

- Delivers PR review feedback (comments, failing checks, merge
  conflicts) into the session that produced the PR, via an ordered
  fallback: `live` (opt-in, off by default) → `resume` → `fresh`.
- A global pause/resume switch for the orchestrator loops (`sdlc
  orchestrate pause|resume|status`, scoped per loop) and manual
  per-item dispatch escape hatches: `sdlc pr route`, `sdlc task
  dispatch`, both usable even while paused.
- New `orchestrator.router` and `orchestrator.review.response_policy`
  config. ([#2368](https://github.com/sksizer/dev/pull/2368))

#### Phase 7 — SDLC chain, stage labels, issue loop

- The `sdlc` chain: a fixed 11-stage pipeline (`capture` → `triage` →
  `define` → `ready` → `implement` → `check` → `judge` → `review` →
  `respond` → `merge` → `close-out`) formalizing orchestrator behavior,
  with a per-project `chain:` config override for a stage's bound
  workflow.
- A 22-label `sdlc:stage/<stage>` / `sdlc:auto/<stage>` vocabulary,
  managed by a new `labels` applier that never deletes a label it
  doesn't own.
- An optional task `issue` field linking GitHub issues to tasks
  (markdown stays the source of truth); `sdlc issues sync` reports —
  never auto-fixes — a mismatch between a linked issue's label and its
  task's status.
- A new `issues` orchestrator loop (`sdlc orchestrate run --loop
  issues`) walking open, chain-labeled GitHub issues one stage at a
  time up to each issue's autonomy ceiling.
- The `pr-review` skill: adversarial review of a PR diff against the
  S-0017 rubric, wired as the chain's `review`-stage workflow.
  ([#2330](https://github.com/sksizer/dev/pull/2330))

#### Phase 8 — notifications

- `notify:` config: `channels` (desktop / ntfy HTTP topic / webhook)
  and `events` (9 canonical names), cross-validated so an event can't
  name an undefined channel.
- `sdlc notify send --channel <name>` / `sdlc notify test`.
- Every orchestrator call site rewired onto the canonical event names —
  a hard cutover: `orchestrator.notify`, `'work-park'`, `'max-rounds'`
  and `'hook.parked'` are gone.
  ([#2372](https://github.com/sksizer/dev/pull/2372))

#### The forge port / `pr-update` extraction

- A synchronous `Forge` port (`listPrs`/`getPr`/`postComment`/
  `updateBranch`/`parsePrUrl`/`prForBranch`) with a `GithubForge`
  adapter; PR classification, the Router's feedback bundle, and the
  `prs` tick all read PR state through it.
- A `ForgejoForge` adapter and `selectForge` (GitHub for github.com,
  Forgejo otherwise, overridable via `forge.override`).
- `pr-update` extracted into its own workspace package,
  `packages/ts/pr-update`, with 5 injectable ports; `solutions/ontological`'s
  `pr survey`/`pr update` are now thin wrappers over it.
  ([#2373](https://github.com/sksizer/dev/pull/2373))

#### Phase 9 — MCP server

- `sdlc mcp start`: a stdio MCP server whose tool set is derived from
  the op registry — no hand-written tool schemas. Defaults to
  read-only ops (`mutating: false`), and every tool is confined to the
  server's own project root.
- `sdlc mcp register --harness claude|codex|cursor [--dry-run]` writes
  each harness's client config (`.mcp.json`, `.codex/config.toml`,
  `.cursor/mcp.json`).
- A minimal `mcp:` config section with `allow`/`deny` op-path lists
  (deny always wins). ([#2313](https://github.com/sksizer/dev/pull/2313))

#### Detection consolidation (M-LOCI)

- One TypeScript aspect-detection layer
  (`@sksizer/detect-runners/aspects`) underneath both runner tooling
  and dependency graphing (`@sksizer/manifest-graph`): each manifest
  type (Cargo.toml, package.json, justfile, mise config, lockfiles,
  Makefile, moon) is read once per directory.
- The cargo, node-scripts, just, mise and make providers consume the
  shared aspect facts instead of re-reading manifests themselves.
  ([#2393](https://github.com/sksizer/dev/pull/2393))

#### The lifecycle simplification — verbs → workflows (D-LSLH)

- One layered config resolver (env → local → project → default), used
  everywhere a workflow, hook, or chain stage is resolved.
- An opinionated verb vocabulary (fmt, fmt-check, lint, lint-fix,
  typecheck, test, test-int, test-e2e, build, clean), each resolved
  from project/local/env config, then a same-named task in the
  project's own runner, then the toolchain command for the detected
  aspect. The default `check` composes fmt-check + lint + typecheck +
  test.
- sdlc's own `detect-deps`, `pinned-manager` and `detect-setup` deleted;
  every consumer moved to `@sksizer/detect-runners`.
  ([#2399](https://github.com/sksizer/dev/pull/2399))

#### Sessions v2 — host/harness split, tmux + pi (M-TAYX)

- `HostName` (where a session runs: terminal/orca/cmux/tmux) and
  `Harness` (which CLI runs there: claude/codex/cursor/pi) split back
  into independent axes; any harness can now run in any host.
- A `tmux` host and a `pi` harness.
- `Host.send({cwd, text})` delivers a message into an already-open
  session, addressed by `cwd` alone (orca, tmux).
- `SessionNote`/`SessionRegistry`: one JSON file per lease under
  `.sdlc/dispatch/sessions/`, tracking `running | waiting_for_input |
  gone`, reconciled against what's actually alive.
  ([#2371](https://github.com/sksizer/dev/pull/2371))

#### Phase 11 — usage and cost tracking (M-U0LQ)

- Headless `session launch` runs capture token/cost usage to
  `.sdlc/usage.jsonl`; interactive runs read the Claude/Codex transcript
  by session id when the host waits.
- `sdlc usage report`, grouping by day, harness, workflow or subject.
- A `usage.budget` rolling-window ceiling (tokens or cost); exceeding it
  pauses the work tick's dispatch and sends the new
  `usage.budget_exceeded` notify event.
  ([#2407](https://github.com/sksizer/dev/pull/2407))

#### Phase 10 — OKF v0.2 conformance (M-LBU2)

- `sdlc okf validate` checks the corpus against an OKF-bundle allowlist,
  wired into the `check` workflow.
- OKF's optional keys admitted: `status: draft|stable|deprecated` under
  OKF's own meaning, and `provenance`.
  ([#2412](https://github.com/sksizer/dev/pull/2412))

#### Phase 12 — static SPA dashboard (M-VBZB)

- `packages/ts/dashboard-spa` (Vite + Vue 3 + vue-router), served by
  `sdlc dashboard`, replaces the old built-in `INDEX_HTML` page.
- Eight views, each backed by the dashboard JSON API: roadmap progress,
  loop status and tick log, PR board, chain stages and labels, config
  (read and edit), notifications, usage, and sessions.
- Two new ops back the new views: `roadmap progress` and `orchestrate
  log-tail`.
- Open-in-host: `POST /api/sessions/open` launches a new session or
  resumes a recorded one in its host, reusing `launchInteractive`.
- A CSRF gate on every non-GET/HEAD `/api/*` request: same-origin plus a
  per-process token (`x-sdlc-csrf-token`), with a Tauri-origin allowlist
  for the desktop shell.
- The three new `mutating: false` ops are exposed as MCP tools, taking
  the default set from 21 to 25.
  ([#2415](https://github.com/sksizer/dev/pull/2415))

### Changed

- **BREAKING:** entity frontmatter `status` → `state` across every
  entity type (schema bumps: task 8→9, capability 2→3, backlog 2→3, all
  others 1→2). Run `sdlc entities migrate` to bring an existing corpus
  forward. CLI flags follow: `--status` → `--state` on the task and
  backlog nouns. ([#2412](https://github.com/sksizer/dev/pull/2412))
- Config CLI spellings finalized: top-level `sdlc init` and `sdlc run
  <workflow>` replace `config init` and `workflow run`, with no aliases.
  ([#2319](https://github.com/sksizer/dev/pull/2319))

### Removed

- **BREAKING:** the `verbs:` config section — use `workflows:` instead;
  a bare string step is now a `script:` step.
  ([#2399](https://github.com/sksizer/dev/pull/2399))
- **BREAKING:** `orchestrator.workflows` and `sessions.workflows` — use
  `workflows.<name>.{engine,host}` instead.
  ([#2399](https://github.com/sksizer/dev/pull/2399))
- **BREAKING:** the `--host claude|codex|cursor|pi` legacy host/engine
  names and their config equivalents — `--engine`/`engine:` and
  `--host`/`host:` are now separate, validated axes.
  ([#2371](https://github.com/sksizer/dev/pull/2371))
- The `plugin_source` config key — the sdlc source tree now resolves
  from the running code. ([#2319](https://github.com/sksizer/dev/pull/2319))
- **BREAKING:** the built-in `INDEX_HTML` dashboard page — `sdlc
  dashboard` now serves the SPA in `packages/ts/dashboard-spa`.
  ([#2415](https://github.com/sksizer/dev/pull/2415))

### Fixed

- A driven follow-up from `/sdlc:spawn-task-pr` could land at
  `open/ready` without its `readiness_verified_at` stamp; promotion to
  `open/ready` is now exclusively the readiness gate's job.
  ([#2395](https://github.com/sksizer/dev/pull/2395))
- Follow-up: the readiness drive is now skipped entirely when the
  fallback status is `planning/needs-definition`, instead of silently
  exiting 20 on every spawn. ([#2413](https://github.com/sksizer/dev/pull/2413))

## [0.4.0] - 2026-09-25

Phases 1-3 of the sdlc plan (PR [#2284](https://github.com/sksizer/dev/pull/2284)).

### Added

#### Phase 1 — tracking, strict loop, relaxed task contract

- A `roadmap` entity type with create/check ops, so a phased plan is a
  checkable artifact rather than prose.
- A strict `check` verb: typecheck, tests, `entities audit --strict`,
  `roadmap check`, and `docs generate --check`.
- A `judge` verb, running `verify changes` against the fixed S-0017
  code-review rubric shared by human and agent reviewers.
- The task contract relaxed: `## Files to touch` became advisory `## Areas`,
  `## Today` became free prose (schema v6 -> v7, migrated across the
  existing task corpus) — Goal/AC/verification/out-of-scope stay strict.

#### Phase 2 — CLI orchestrator loops

- A `workflows:` section in `sdlc.yaml`: ordered `skill:`/`run:`/`script:`/
  `prompt:` steps, with built-ins (`implement`, `check`, `judge`,
  `pr-review`, `pr-respond`, `pr-update`, `close-out`, `define`) shipped in
  code and project-overridable.
- `sdlc session launch` — a headless-capable session runner (extracted from
  `pr review`), writing session records under `.sdlc/sessions/<id>/`.
- `sdlc orchestrate run --loop work,prs,merges` — per-item leases and a
  park-and-notify path on block, dispatching work and tending PRs and
  merges.

#### Phase 3 — canonical agent-pants vault

- sdlc's own plugin identity and every skill converted from the bespoke
  `.claude-plugin/plugin.json` + `skills/<name>/SKILL.md` layout onto the
  agent-pants vault shape: a `sdlc.md` plugin note, per-skill `<name>.md`
  vault notes, and a `marketplace-sdlc` marketplace note.
- A nested `solutions/ontological/agent-pants.yaml` build config for a
  vault root nested inside a larger non-vault tree.
- `agent-pants build`/`check` joined as a drift gate on the `check` verb,
  with a `--watch` dev loop.
- `sdlc harness export` and `agent-plugin`'s exporters retired; `pr-tools`'
  `check-pr` reconciled with `sdlc:pr-respond`.

## [0.3.1] - 2026-07-13

The first installable build of the CLI-primary distribution. Tagged `v0.3.1`
in the private `sksizer/dev` repo (merge of
[#740](https://github.com/sksizer/dev/pull/740); release commit
`1c652156ec`). This release and everything below it predate this changelog
and were reconstructed from the tags, the commit history and the planning
corpus; versions 0.3.x were never published to the public `sksizer/sdlc`
repo (see the note under 0.3.0).

### Fixed

- The published artifact could not be installed. 0.3.0 shipped the vendored
  `markdown-contract` as a `file:` tarball dependency, which does not
  survive a git or registry install: bun ignores `bundledDependencies` and
  npm's pack strips `node_modules`, so consumers hit an unresolvable
  `markdown-contract`. `sdlc plugin build-artifact` now esbuilds it into one
  self-contained file at `plugin/lib/_vendor/markdown-contract.js`, rewrites
  the import specifiers to point at it, drops `markdown-contract` from the
  published `package.json` and hoists its registry dependencies (`unified`,
  `remark-*`, `picomatch`). Those stay external so one shared copy of each
  (including `zod`) resolves across the sdlc and markdown-contract seam. The
  dev repo is unchanged: it keeps the vendored `file:` dependency.
  ([#738](https://github.com/sksizer/dev/pull/738); task T-XTGT)
- The release workflow gained a consumer-install smoke: pack the artifact,
  install it with `npm` into an empty directory outside the repo, assert
  `markdown-contract` does not reappear as an external package, then run
  `--help` and `project doctor --output json` from `node_modules`. The
  release job also refuses to publish unless the bundled
  `plugin/lib/_vendor/markdown-contract.js` is staged.

### Changed

- The harness core (model, deriver, and the claude, codex, cursor, gemini
  and json exporters) moved out of `plugin/lib/services/harness` into a new
  workspace package, `@sksizer/agent-plugin` (`packages/ts/agent-plugin`).
  The `sdlc harness export|model|install` ops now import it.
  ([#734](https://github.com/sksizer/dev/pull/734))
- The repo's moon configuration moved to moon v2
  ([#739](https://github.com/sksizer/dev/pull/739),
  [#741](https://github.com/sksizer/dev/pull/741)), a repo-wide Rust aspect
  (rustfmt, clippy, test) was added
  ([#717](https://github.com/sksizer/dev/pull/717)), and the Polish app came
  into the monorepo as `apps/polish`
  ([#716](https://github.com/sksizer/dev/pull/716)). These affect the dev
  repo's build only, not the shipped CLI or plugin.

### Known limits

- 0.3.0 stays a known-broken tag (not installable); use 0.3.1.
- The package is `"private": true` in the repo and was distributed only
  through the git-pinned dist channel described under 0.3.0, not a registry.
- `plugin/.claude-plugin/plugin.json` still reads `0.2.0` at this tag; the
  release version is the root `package.json` version, `0.3.1`.

## [0.3.0] - 2026-07-13

The first CLI-primary distribution: `sdlc` stops being a Bun-only,
symlink-installed Claude Code plugin and becomes a plain-Node artifact,
`@sksizer/sdlc`, that carries both the `sdlc` CLI and the Claude plugin
tree. Tagged `v0.3.0` (annotated, "first CLI-primary dist release (D-0014 /
T-75UD)"; merge of [#737](https://github.com/sksizer/dev/pull/737)). The
install it describes did not work (see 0.3.1).

This section covers the whole state at the tag, including work from the
weeks after 0.2.0 that was never tagged (2026-06-07 to 2026-07-13).

### Where this version lived

The 0.3.x line is the private `sksizer/dev` lineage: a TypeScript plugin and
CLI under `plugin/`, which later moved to `solutions/ontological/` and
became 0.4.0. It is not the same thing as the Python `darkfactory` code
that the public `sksizer/sdlc` repo held before 0.4.0 (tag `python-legacy`,
`darkfactory` `__version__ = "0.1.0"`, a PRD-harness CLI named `prd` with
no sdlc plugin). The public repo's first sdlc tag is `v0.4.0`; it has no 0.3.x tag.

### Added

- Distribution per decision D-0014. One npm artifact, `@sksizer/sdlc`
  (`bin: sdlc`, `files: plugin, vendor, README.md`), carries the CLI and the
  plugin directory, so the skills and the CLI that they call cannot skew.
  - `sdlc plugin build-artifact` stages the publishable tree: built JS
    (Node refuses to type-strip TypeScript under `node_modules`), run by
    `prepack`. Verified by an npm-pack install that runs `npx sdlc` on
    plain Node with Bun absent. ([#700](https://github.com/sksizer/dev/pull/700);
    task T-XTGT)
  - Shipped code is runtime-agnostic: `Bun.*`, `import.meta.dir` and
    `import.meta.main` were removed from every shipped tree and the new
    `sdlc gate runtime-agnostic` keeps them out
    ([#692](https://github.com/sksizer/dev/pull/692),
    [#697](https://github.com/sksizer/dev/pull/697)). Engines in the
    manifest: `node >= 24`, `bun >= 1.3`.
  - A release workflow (`.github/workflows/release.yml`,
    [#709](https://github.com/sksizer/dev/pull/709),
    [#730](https://github.com/sksizer/dev/pull/730); task T-75UD). Pushing a
    `vX.Y.Z` tag checks the tag against `package.json`, runs the
    `sdlc.yaml` quality roster, builds the artifact, smoke-tests it under
    Node 20 with Bun stripped from `PATH`, and pushes the built tree to a
    private mirror, `sksizer/sdlc-dist`, tagged to match. Consumers pin it
    as a git dependency (`sdlc-dist#vX.Y.Z`): no registry. A manual
    dry-run dispatch builds and smokes without publishing. Setup of the
    mirror and the deploy-key secret was manual.
  - Onboarding is three verbs: `bun add -d @sksizer/sdlc` (or
    `npm i -D`), `sdlc project setup`, `sdlc harness install claude`.
  - `sdlc harness install claude [--mode copy|node-modules|link] [--dev]`
    wires the harness into a consumer project idempotently (auto-detects
    link for a source checkout, copy for an installed package; idempotent
    settings merge). `--dev` registers the live source and writes to
    `.claude/settings.local.json`. `project doctor` gained a same-install
    check and reports `dev/linked`.
    ([#699](https://github.com/sksizer/dev/pull/699),
    [#707](https://github.com/sksizer/dev/pull/707))
  - `sdlc dev use <path> | off | status | link`: points a PATH-installed
    `sdlc` at a live checkout. The launcher resolves its source as
    `SDLC_HOME`, then the XDG `sdlc/home` config, then local (config is
    ignored when `CLAUDE_PLUGIN_ROOT` is set).
    ([#708](https://github.com/sksizer/dev/pull/708))
  - Skills call the `${CLAUDE_PLUGIN_ROOT}cli/sdlc` launcher, which picks
    runtime and entry; `sdlc gate corpus-invocation` forbids raw
    `cli/sdlc.ts` calls in skills
    ([#698](https://github.com/sksizer/dev/pull/698)). Self-location walks
    up to the project's `sdlc.yaml` instead of assuming a code root
    ([#701](https://github.com/sksizer/dev/pull/701)).
  - `sdlc site build`: generate, package-manager detect, `astro build`, and
    report the dist path, so a consumer builds the docs site without Bun
    ([#705](https://github.com/sksizer/dev/pull/705)).
- `sdlc harness export <target>`, `sdlc harness model`: derive a
  host-neutral model of the plugin (capabilities, hooks, MCP servers,
  permissions, documents) and project it to `claude`, `codex`, `cursor`,
  `gemini` or `json` (a verbatim `harness.json`), with `--dry-run`; plus
  an import bootstrap from the Claude surface. Skill and document bodies
  validate through markdown-contract.
  ([#720](https://github.com/sksizer/dev/pull/720),
  [#721](https://github.com/sksizer/dev/pull/721),
  [#722](https://github.com/sksizer/dev/pull/722),
  [#725](https://github.com/sksizer/dev/pull/725),
  [#726](https://github.com/sksizer/dev/pull/726),
  [#727](https://github.com/sksizer/dev/pull/727),
  [#728](https://github.com/sksizer/dev/pull/728))
- Entity types (11, each with a schema, template and docs under
  `plugin/lib/model/entities/<type>/`): backlog, capability, decision,
  driver, milestone, principle, product, reference, standard, task, term.
  `reference` (prefix `RF`) and `term` (`TM`) arrived after 0.2.0;
  `sdlc reference create` and `sdlc term create` mint them.
- Docs generation: `sdlc docs generate [index|glossary|references|site]`
  replaced `sdlc index generate`. The docs site is a pure build artifact
  (the whole content root is generated; hand-written pages live under
  `sites/df-docs/supplemental/` and are declared in `site.yaml`), with a
  `--check` drift gate wired into `quality_checks`. The glossary and
  references appendix are generated from `term` and `reference` entities.
- Monorepo: shared framework packages, the family app and scoped tooling
  came under `apps/` and `packages/ts/`
  ([#711](https://github.com/sksizer/dev/pull/711),
  [#712](https://github.com/sksizer/dev/pull/712),
  [#715](https://github.com/sksizer/dev/pull/715)).

### The CLI at this tag

Visible nouns: `commit`, `config`, `dashboard`, `dev`, `docs`, `entities`
(`validate`), `harness` (`export`, `install`, `model`), `milestone`
(`create`), `orchestrate` (`log-tick`, `watch`), `project` (`cleanup`,
`detect-worktree-init`, `doctor`, `preflight-worktree`, `scan`, `setup`,
`teardown-worktree`), `quality` (`baseline`, `detect`, `run`), `reference`,
`report`, `site`, `standard` (`create`, `preview-id`, `supersede`,
`update`), `task` (`create`, `inflight`, `next`, `preview-id`,
`probe-state`, `resolve`, `update`), `term`, and `backlog`. Hidden behind
`--advanced`: `gate` (`corpus-invocation`, `markdown-fixtures`,
`runtime-agnostic`, `skill-prose`, `worktree-scope`), `lease`, `plugin`
(`build-artifact`, `info`, `install-permissions`, `resolve`) and `pr`
(`classify`). There is no `roadmap`, `note`, `session`, `verify`, `judge`
or `setup plan|apply`; those came in 0.4.0 and later.

### Skills

36 skills under `plugin/skills/`, invoked as `/sdlc:<name>`:
`api-enhancement-scan`, `backlog-capture`, `backlog-triage`,
`consolidate-task-prs`, `docs`, `entities-audit`, `entities-migrate`,
`explore-codebase`, `find-quality-checks`, `find-worktree-init`,
`import-planning`, `info`, `migrate`, `migrate-runtime-state`,
`milestone-new`, `milestone-review`, `milestones-from-file`,
`orchestrate`, `pr-check`, `pr-respond`, `principle-review`, `product-new`,
`project-cleanup`, `review-todos`, `setup`, `spawn-task-pr`, `standard-new`,
`status-dashboard`, `task-auto-define`, `task-close-out`, `task-define`,
`task-ensure-ready`, `task-new`, `task-review`, `task-work`,
`update-skill-doc`. Plugin layout was the bespoke
`plugin/.claude-plugin/plugin.json` plus `skills/<name>/SKILL.md`; the
0.4.0 vault conversion replaced it.

### Configuration

`sdlc.yaml` at the project root, with `quality_checks` (a flat list of
commands run by `/sdlc:task-work` and `sdlc quality run`),
`lease_authority`, `docs_site` and worktree-init settings. There is no
`workflows:`, `verbs` or `host` section yet.

### Known limits

- The git-pinned `sdlc-dist` channel needed manual setup of a private repo
  and a deploy key, and was a stopgap. Decision D-2APS (2026-07-14)
  replaced it with a compiled `bun` binary wrapped for npm; T-75UD was
  closed as obsoleted.
- Not installable as published; fixed in 0.3.1.
- The Claude plugin manifest still said `0.2.0` and the marketplace entry
  `0.1.1`; the release version lived only in the root `package.json`.

## [0.2.0] - 2026-06-06

Not tagged; the date and contents come from the project's own site
changelog (`sites/df-docs/supplemental/changelog.md`) and the manifest
(`plugin.json` `0.2.0`). The op-substrate sweep (milestone M-0003): every
capability that lived in `plugin/scripts/` and `plugin/validators/` moved
into `plugin/lib/` as a registry op or service, and the `sdlc` CLI became
the sole entry.

### Added

- A path-keyed op registry (`defineOp`, 2 to 3 segment kebab paths),
  `defineService` for long-running capabilities (the dashboard, the lease
  heartbeat loop), `--output text|json|jsonl`, op render hooks, and a
  `SERVICE_ERROR` exit tier.
- 11 visible nouns (`task`, `backlog`, `milestone`, `standard`, `entities`,
  `commit`, `report`, `index`, `quality`, `project`, `dashboard`) and 4
  hidden (`plugin`, `pr`, `gate`, `lease`).

### Removed

- `plugin/scripts/`, `plugin/validators/` and `plugin/cli/lease_cli`.
  Skills no longer shell out to `${CLAUDE_PLUGIN_ROOT}scripts/X.ts`; they
  call `sdlc <path...>`.
