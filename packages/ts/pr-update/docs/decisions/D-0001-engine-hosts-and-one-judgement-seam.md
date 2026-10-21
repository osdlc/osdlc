---
type: decision
schema_version: '2'
id: D-0001
title: pr-update is a host-neutral update engine with one judgement seam
state: open/accepted
created: '2026-10-20'
last_reviewed: '2026-10-20'
tags:
  - pr-update
  - architecture
  - ports
  - agent
---
# pr-update is a host-neutral update engine with one judgement seam

## Summary

pr-update has two layers:

- **The engine** surveys pull requests, runs the resolver ladder and applies
  the guards. It reaches its host only through `Ports` and the arguments it
  is called with, and it knows no host by name.
- **The hosts.** The `pr-update` binary is the one this package ships. It can
  update the branch you are on or every open PR in a repository, reads
  `pr-update.yaml`, and offers built-in headless agent presets. Any other host
  embeds the engine as a library and supplies its own ports.

Agent judgement goes through one seam, the async `repair` port. The ladder
runs at every stop of a rebase. When a stop needs judgement, the rebase is
aborted and the PR retried as a merge, so judgement runs once. `--report`
writes a structured result, so a host can act on each PR's outcome.

^summary

## Context

Before this decision:

- **The engine is mostly done.** `survey` measures drift locally, orders
  stacked PRs parent-first and predicts conflicts with `git merge-tree`.
  `update` works through a ladder: rerere, lockfiles, the configured
  `resolvers`, host `generators`, then an optional `repair`. Guards,
  failed-attempt memory, a push preview and a trust gate are in place.
- **Branch mode is missing.** `pr-update` works on PR numbers. You cannot
  run it inside a checkout and have it update that branch's PR.
- **The ladder only runs at a rebase's first stop.** A later stop fails the
  update. Generated files usually conflict on every commit, so the
  regenerate rules miss the case that needs them most.
- **`Repair` is synchronous, and the only repair is a shell command.**
  An agent call is slow, needs a timeout, and is naturally async. Every user
  who wants an agent has to write their own wrapper.
- **A caller learns little.** The binary returns an exit code. A caller
  running many PRs cannot tell a conflict that needs judgement from a guard
  skip or a rejected push without parsing text.
- **The package knows its first host.** It was extracted from a larger
  CLI. It still reads that CLI's config file name and env var, builds in one
  of its generator commands, and its comments name it.

## Decision

1. **The engine is host-neutral.**
   - The engine (`runSurvey`, `runUpdate`, the ladder, guards, `Ports`,
     the config schema) names no host, no host config file, no env var and
     no project's commands.
   - Hosts supply all of these. A project's generators are configured as
     `resolvers` or supplied as `generators`.
2. **The binary has two scopes.**
   - `pr-update update --branch [name]` updates the PR whose head is that
     branch. With no name it uses the branch checked out in the current
     directory.
   - With no scope it updates every open PR in the repository. `--pr`
     stays.
   - A `--pr` or `--branch` run measures only its PRs and their stack
     parents, so a host can run one PR at a time cheaply.
   - No interactive checklist: the Ink TUI and its `ink`/`react`
     dependencies go. `--confirm-push` stays.
   - In branch mode, after a successful push, the local checkout is
     fast-forwarded to the new head when it is clean and was at the old
     remote head. Otherwise it is left alone and the report says so.
3. **The binary reads its own config file.**
   - The engine's loader takes the file name and env var from its caller.
     The binary passes `pr-update.yaml` (overlay `pr-update.local.yaml`,
     relocated by `PR_UPDATE_CONFIG`), with a `pr_update:` block.
   - The binary reads no other file.
   - A host that keeps its own config mounts `prUpdateSection` in it.
4. **The ladder runs at every rebase stop.**
   - At each stop the deterministic rungs run: rerere, lockfile,
     resolvers, generators.
   - A stop they cannot clear aborts the rebase. The PR is retried as a
     merge, which resolves the conflict once, and the ladder runs again
     with `repair` available. This fallback is
     `on_rebase_conflict: merge | fail`, default `merge`; `fail` reports
     the PR instead.
   - The report records the strategy change. `repair` is never called
     mid-rebase.
5. **`repair` is the one judgement seam.**
   - `Repair` becomes `(req) => Promise<RepairResult>`, and the executor
     becomes async.
   - The engine keeps its contract checks: no commit, no HEAD move, no new
     ref, no conflict markers, `git diff --check` clean.
   - **Built-in headless agent presets:** `claude` (Claude Code), `codex`
     (Codex CLI), `cursor` (Cursor's `agent` CLI) and `pi`.
     - Each preset is one call through `@osdlc/agent-call`. That package
       already builds each CLI's headless command line, maps a permission
       posture to the CLI's own flags, applies timeouts and normalises the
       result. pr-update writes no per-CLI argv of its own.
     - The call runs in the update worktree with file edits allowed and no
       permission prompts.
     - All presets use one exported prompt, `repairPrompt(req)`, which
       states the contract.
   - The binary offers the presets as explicit choices:
     `--repair-agent <claude|codex|cursor|pi>` lists them in
     `update --help`; `repair.agent` sets one in config, and
     `repair.model` is optional.
   - `repair.command` stays for any other harness. `repair.agent` and
     `repair.command` are mutually exclusive.
   - Presets and commands are trust-gated alike. An agent reads the
     repository and can run tools, so an untrusted repository's config must
     not start one.
   - A library host binds `repair` to its own agent runner. It can reuse
     `repairPrompt` so all hosts share one prompt.
6. **A structured report.** `update --report <file>` writes the update
   output as JSON, on success and on failure. It covers each PR's outcome,
   repairs, strategy changes and skips, so a host acts on each outcome
   without parsing text.

## Why

- **Host-neutral is what makes it composable.** The engine is useful to any
  host only if no host is built in. A host-specific rule in the engine is a
  rule every other host has to work around.
- **One seam keeps judgement reusable.** If the agent sits behind `repair`,
  any host gets the engine's contract checks on whatever its agent did. A
  host that dispatches an agent after the update has given up starts the
  agent cold, in a fresh worktree, and has to repeat those checks.
- **Presets make the standalone tool useful on day one.** A
  `repair.command` wrapper per agent is boilerplate every user would write.
  Explicit choices in `--help` show what is supported.
- **Merge after a later stop bounds the cost.** Repairing each stop of a
  20-commit rebase could mean 20 agent calls on 20 versions of the same
  conflict. The guards already step down from rebase to merge for this
  reason (`max_rebase_commits`).
- **A report beats an exit code.** A host can tell a conflict that needs
  judgement from a guard skip or a rejected push.

## Prior art

Read from the author's knowledge of these tools on 2026-10-20, not
re-checked against their current docs.

| System or pattern | What it does | Source | Verdict |
| --- | --- | --- | --- |
| GitHub "Update branch" | Merges or rebases the base into one PR from the web UI | docs.github.com, pull requests | Borrow the two strategies. It does no conflict resolution and no stacks. |
| Kodiak / Mergify auto-update | A bot keeps PRs current with their base and serialises merges through a queue | kodiakhq.com, docs.mergify.com | Borrow "update only what is behind, in order". Reject the hosted-bot model: the engine runs locally. |
| Renovate rebase + post-upgrade tasks | Rebases its own PRs when conflicted and regenerates lockfiles by re-running the package manager | docs.renovatebot.com | Adopt: this is the lockfile rung and the `resolvers` rung. A derived file is regenerated, not merged. |
| git rerere | Replays a recorded conflict resolution | git-scm.com/docs/git-rerere | Already adopted as the first rung. |
| Graphite `gt restack` / git-town `sync` | Restack a branch stack parent-first after the base moves | graphite.dev docs, git-town.com | Already adopted (stack order, blocked children). Branch mode mirrors `git town sync` from inside a branch. |
| Agentic conflict resolution (agent CLIs in CI) | An LLM edits conflicted files, then a person or CI checks the result | common practice, 2025–2026 | Adopt behind a contract: the agent only edits, and the engine checks, commits and pushes. |

## Options considered

### Judgement: repair port vs host dispatch after failure

The repair port was chosen. Dispatching an agent after the update fails
works only in the host that does it, starts the agent cold, and duplicates
the contract checks.

### Agent support: built-in presets vs `repair.command` only

Built-in presets were chosen, with `repair.command` kept as the escape
hatch. A command alone leaves every user to write the same wrapper.

### Config file: own file vs a host's file vs either

The binary gets its own file. Reading a host's file ties the tool to that
host. Reading either means two places to look and a precedence rule to
explain.

## Consequences

- `runUpdate`, `updateAll` and `updateOne` become async, and `Repair`
  changes signature. These are breaking changes in a pre-1.0 package. No
  compatibility shim.
- A rebase-strategy PR can be pushed as a merge. Report readers must use
  the result's strategy, not the requested one.
- The binary stops reading any host's config file. A project moves its
  `pr_update:` block to `pr-update.yaml`.
- The package gains a dependency on `@osdlc/agent-call`, which has no
  dependencies of its own. The agent CLIs are needed only at run time, and
  only when a preset is chosen.
- Branch mode adds one code-host lookup: list PRs by head.

## Open questions

- Branch mode for a branch with no PR: refuse (the default), or accept
  `--base <ref>` and update a branch with no PR. Deferred until someone
  needs it.
- Which other agents get a preset. One that `@osdlc/agent-call` already
  supports (`opencode`, `copilot`, `qwen`, `droid`, `agy`, `dsh`) costs an
  enum value. Gemini CLI first needs an adapter in agent-call.
- Choosing the agent, model and effort through routing profiles rather than
  a fixed preset: backlog B-0001 (`docs/backlog/`).
- Reading a shared project config file. The owner expects one
  such file to become a standard place for tools to hang their config off
  (2026-10-20). The binary would then read its `pr_update:` block from it
  as well. Not in the first cut, which reads `pr-update.yaml` only.
