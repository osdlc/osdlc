# Spawning follow-up tasks from a post-mortem

This doc describes the procedure for converting the "Friction and
automation gaps" bullets in a `## Post-mortem` section into concrete
follow-up task files. It is the contract a sub-agent must follow when
spawned for this purpose by a parent skill (today: `/sdlc:task-work`
Step 8). Keeping the procedure here lets the parent skill stay short
and lets future consumers reuse the same contract.

## Inputs the caller must provide

A skill invoking this procedure (via the `Agent` tool) must pass:

- **Originating task path** — absolute path to the task file whose
  post-mortem is being mined. The file must already contain a
  `## Post-mortem` section with a `### Friction and automation gaps`
  subsection.
- **Worktree root** — absolute path to the worktree the sub-agent
  operates in. All file ops stay inside this root.
- **Feature branch name** — the branch to commit on (e.g.
  `task/<basename>` — see
  `${CLAUDE_PLUGIN_ROOT}/conventions/branch-naming.md`).
- **Plugin root** — the `${CLAUDE_PLUGIN_ROOT}` value, so the
  sub-agent can locate the `sdlc task create` op and the frontmatter
  validator.
- **Today's date (UTC)** — `YYYY-MM-DD`, used for the
  `Discovery context` line of spawned tasks.
- **Spawn policy** — the caller's resolved
  `task.execution.spawn_from_post_mortem` config (read once via
  `sdlc config get-spawn-policy`; see
  `${CLAUDE_PLUGIN_ROOT}/conventions/sdlc-yaml.md`):
  - `drive_to_ready` (bool) and `fallback_status` (a `planning/*` status) —
    forwarded verbatim to `/sdlc:spawn-task-pr` (step 4b). Default
    `drive_to_ready=false`, `fallback_status=planning/draft` if omitted.
  - `pr_grouping` (`per-task` | `per-execution` | `per-project`) and
    `pr_title_pattern` (string or null) — drive PR packaging (step 4a-bis).
    Default `per-task` and null (headline title) if omitted.

  The `enabled` knob is the caller's gate, not this procedure's — a caller
  that reaches this doc has already decided to spawn.

## Procedure

### 1. Read the post-mortem

Read the originating task end-to-end. Locate `## Post-mortem` →
`### Friction and automation gaps`. Extract the bullets verbatim.

If the only bullet is `- none observed`, jump straight to step 7 with
a count of zero. Do not invent gaps.

### 2. Decide which bullets become tasks

For each bullet, decide whether it implies a *concrete* automation,
tooling, or skill change. Err toward creating: the overriding goal of
post-mortems is to surface automation opportunities, and trimming
empty tasks later via `/sdlc:task-review` is cheap.

Skip a bullet only if there is genuinely no actionable change
(e.g. "tests were slow" with no proposed fix). Skipped bullets are
counted but not turned into tasks.

**Apply the no-carve-out test** (see `PRINCIPLES.md` → "General
skills stay general"). For each kept bullet, ask: "would the
proposed fix only ever fire when the consuming project IS the SDLC
plugin itself?" Recognition flags: the bullet talks about scanning
for `plugin/skills/*/SKILL.md` paths, special-casing SDLC artifact
shapes, or improving ergonomics that only matter for SDLC-on-SDLC
dogfooding. When the test trips, the spawned task's `## Proposed`
and `## Areas` route the fix to `.claude/` (project-local
hook, project-local skill extension, project-local script) — NOT
to `plugin/`. The bullet still becomes a task; the difference is
the proposed implementation site.

General improvements that dogfooding happened to surface stay in
`plugin/` — the test is whether the fix helps any consumer with
the same workflow.

### 2a. Classify each kept bullet by ownership

A post-mortem in a downstream consumer project often surfaces gaps
that belong to a **different repo** — typically the SDLC plugin
itself, or another upstream library this project depends on. Spawning
those follow-ups inside the current repo accumulates plugin-bugs
inside every consumer, fragments the upstream backlog, and silently
duplicates work across repos.

Before scaffolding, label each kept bullet with one of:

- `Local` — the gap is about THIS project's code, docs, or planning.
  The fix would touch files under `<worktree-root>/` that are owned by
  this repo. Default classification when in doubt about a small or
  ambiguous bullet.
- `Upstream-plugin` — the gap is about a Claude Code plugin this
  project uses (most commonly the SDLC plugin itself). Tells: the
  bullet names a skill, script, or convention under `plugin/...`; the
  bullet says "the orchestrator / task-work / pr-check / etc. should
  do X"; the bullet describes a missing entity-schema field or a
  template the plugin owns.
- `Cross-project-request` — the gap is a request *from* this project
  *to* a different downstream or sibling project (e.g. "the data-model
  package should export type X for us"). Distinct from
  `Upstream-plugin` because the receiver isn't necessarily a Claude
  Code plugin — it's any sibling repo with its own owners and
  schedule.

Classification heuristic — apply in order, take the first match:

1. If the bullet's proposed fix is to edit a file path beginning with
   `plugin/`, classify `Upstream-plugin`. The plugin convention
   (`${CLAUDE_PLUGIN_ROOT}/skills/CLAUDE.md` → "Post-mortem follow-ups about plugin
   code go upstream") makes this binding.
2. If the bullet names a sibling repo by URL, owner/name, or
   well-known nickname AND the bullet's proposed fix would land in
   that sibling, classify `Cross-project-request`.
3. Otherwise, classify `Local`.

If a bullet is genuinely ambiguous after applying the heuristic
(common: a fix that *could* live in either repo, like a doc note that
references both), the sub-agent MUST surface the ambiguity to the
caller via the structured report (see step 7) rather than guessing —
the orchestrator's recovery is to escalate via `AskUserQuestion` and
re-invoke this procedure with a hint. Do not silently pick a side.

When the classification is `Upstream-plugin`, additionally resolve
the upstream plugin's name. The convention is the plugin whose
`plugin/skills/<x>/SKILL.md` or `plugin/conventions/<y>.md` would be
the receiving file. For SDLC-plugin gaps that name is `sdlc`. Carry
this name forward to step 4.

### 3. De-duplicate before scaffolding

First capture the tasks that exist only on open PR heads, ONCE for the
whole run (it is one gh call plus one git read per PR, not per bullet):

```text
${CLAUDE_PLUGIN_ROOT}/cli/sdlc task list-unmerged --output json \
    > <worktree>/.sdlc/unmerged-tasks.json
```

Then, for each kept bullet, run the dedup search script:

```text
${CLAUDE_PLUGIN_ROOT}/cli/sdlc task dedup-search \
    --bullet "<verbatim bullet text>" \
    --tasks-dir <worktree>/docs/planning/tasks/ \
    --exclude-basename <originating-basename> \
    --extra-candidates <worktree>/.sdlc/unmerged-tasks.json \
    --emit-telemetry-line <worktree>/.claude/dedup-telemetry.jsonl \
    --worktree <worktree> \
    --json
```

The op extracts a small keyword set from the bullet, scores
every task file under `<worktree>/docs/planning/tasks/` by counting
keyword occurrences across the **full body** (not just headline +
Goal), and returns a ranked candidate list plus a recommended
decision. See the op's module docstring
(`lib/model/entities/task/ops/dedup-search.ts`) for the scoring rule,
the threshold defaults, and the search-trail block shape. The eval
suite beside it (`lib/model/entities/task/ops/dedup-search.test.ts`,
a dev-only file the built plugin does not ship) locks the AC-1 known-overlap
regression.

`--extra-candidates` is what makes the search see PARALLEL work. Task
ids are minted deterministically from the slug, and the on-disk corpus
is whatever is merged — so two post-mortems describing the same
friction derive the same slug, mint the same id, and land the same
filename on two different PRs. Without this flag neither run can see
the other, and the collision surfaces as a git conflict at merge time
instead of a `LINKED-EXISTING` here. (That is how
`T-OLTA-task-work-step7-worktree-baseline-dir` ended up on both #1164
and #1165.) Unmerged candidates score on the same scale as merged ones
and are marked `[unmerged, PR #N]` in the search trail, so a reader who
greps the corpus and finds nothing knows why.

`sdlc task list-unmerged` reads REMOTE tracking refs, so a stale fetch
means a thin corpus. It reports any head ref it could not read in
`skipped_refs` rather than silently omitting it — a non-empty
`skipped_refs` means run `git fetch origin` and redo the capture.
When `gh` is unavailable it returns `gh_available: false` with an empty
list; the dedup search then behaves exactly as it did before the flag
existed.

`--exclude-basename <originating-basename>` drops the originating
task from the candidate corpus before scoring. Without it the
post-mortem bullet's keywords (which were extracted from the
originating task's own body) inevitably score that task as the top
match, masking real near-duplicates. Pass the originating basename
on every invocation. When the exclude set is non-empty the rendered
search-trail block carries an `Excluded: <basenames>` line so a
reviewer sees what was filtered out.

`--emit-telemetry-line <path>` appends one JSON line per invocation
to the named path so the threshold defaults can be recalibrated
empirically. The default path under `<worktree>/.claude/` is
gitignored (`.claude/*` covers it). `sdlc task summarize-dedup-telemetry`
reads the log and prints a histogram of decisions bucketed by
top-candidate score.

The JSON output has `decision: "LINKED-EXISTING"` (with `link_to`
naming the existing task) or `decision: "SPAWNED"`, plus a
preformatted `block` string. Use the script's decision unless you
have a concrete reason to override it; if you do override, capture
the rationale on the `Rationale:` line of the search-trail block
(see step 5) so a later reviewer can second-guess the call.

If the decision is `LINKED-EXISTING`:

- Do **not** create a new task.
- Edit the existing task's frontmatter to append the originating
  task's basename to its `related:` array (de-duplicated).
- Append the script's search-trail `block` (verbatim) to the
  candidate task's `## Discovery context` section so the link's
  origin is preserved inline.
- Validate the edited file (see step 5).
- Record this outcome as `LINKED-EXISTING`.

If the decision is `SPAWNED`, keep the JSON output (in particular
the `block` field) — step 5 embeds it in the new task body.

### 4. Scaffold a new task — every classification opens its own PR

Every classified follow-up — `Local`, `Upstream-plugin`, and
`Cross-project-request` — lands via the shared sub-skill
`/sdlc:spawn-task-pr`, never on the originating task's PR. How the
follow-ups are packaged into PRs is set by the caller's
`pr_grouping` (step 4a-bis); by default (`per-task`) each gets its own
independent PR, so a reviewer can accept or reject each on its own
merits without coupling to the originating task's merge.

**4a. Resolve the target repo and tags.**

- `Local`: `target_root = <main-checkout-root>` — the *main checkout*
  of the repo this worktree is on (use `git -C <worktree-root>
  rev-parse --git-common-dir`; the parent of `.git` is the main
  checkout). The `spawn-task-pr` sub-skill creates its own
  dedicated worktree under that main checkout. No classification-
  specific tag for `Local`.
- `Upstream-plugin` (plugin name carried from step 2a, e.g. `sdlc`):
  Resolve the plugin's source-of-truth repo via the resolver:

  ```text
  ${CLAUDE_PLUGIN_ROOT}/cli/sdlc plugin resolve <plugin-name>
  ```

  The op prints `<repo-root>\t<origin-url>`. `target_root` is
  the printed `<repo-root>`. The new task's `tags:` array MUST
  include `<plugin-name>-meta` (e.g. `sdlc-meta`). That tag travels
  with the task even in the degenerate case where the consumer
  project IS the plugin's dev repo. The tag lets downstream readers
  (`/sdlc:task-review`, audits) distinguish plugin-meta work from
  project-domain work.
- `Cross-project-request` (target repo named in the bullet or
  inferred from context): `target_root` is the receiving repo's
  main checkout. The new task's `tags:` array MUST include
  `cross-project-request` so the receiver can filter for inbound
  asks. Phrase the headline and Goal as a *request*, not a
  self-claim: "Export type X for use by <consumer>" rather than
  "Add type X".

**4a-bis. Resolve the PR grouping (branch, PR mode, title) per target repo.**

Grouping is **per target repo** — classification routes follow-ups to
different repos, and a PR cannot span repos. So first group the kept bullets
by their resolved `target_root`. Then, within each repo-group, map the
caller's `pr_grouping` to the `spawn-task-pr` flags:

| `pr_grouping` | `--branch` | `--pr` (per task in the group) | title source |
|---|---|---|---|
| `per-task` | `meta-task/<slug>` (skill default — omit `--branch`) | `open` | headline (or pattern) |
| `per-execution` | `meta-task/followups-<originating-basename>` | `rolling` | `chore(tasks): follow-ups from <originating-basename>` (or pattern) |
| `per-project` | `meta-task/spawn-followups` | `rolling` | `chore(tasks): spawned follow-up tasks` (or pattern) |

For `rolling` branches the FIRST dispatch opens the PR and the rest append —
`spawn-task-pr` handles create-vs-append itself, so you pass `--pr rolling`
uniformly for every task in the group; no special-casing the first one.

**Resolve the title** once per repo-group. If the caller passed a
`pr_title_pattern`, substitute its placeholders (`{headline}`, `{slug}`,
`{originating_task}`, `{classification}`, `{date}` UTC, `{repo}` owner/name;
unknown → empty) and pass the result as `--pr-title`. Otherwise omit
`--pr-title` for `per-task` (the skill defaults to the headline) and pass the
mode default above for `per-execution` / `per-project`. `{slug}` /
`{classification}` are only meaningful for `per-task`; for shared modes they
resolve to the first task's values, so prefer run-level tokens there.

**4b. Dispatch the task via the sub-skill.**

Defer all PR creation to the dedicated sub-skill — do NOT run
`sdlc task create`, `git commit`, `git push`, or `gh pr create` from
inside this sub-agent for any classification. The sub-skill owns
worktree creation, branch/commit/PR shape so the dispatch stays consistent.

```text
/sdlc:spawn-task-pr \
  --target-repo <target_root> \
  --slug <kebab-slug> \
  --headline "<one-line headline>" \
  --classification <Local|Upstream-plugin|Cross-project-request> \
  [--tag <plugin-name>-meta | --tag cross-project-request] \
  --originating-task <originating-basename> \
  [--brief "<short body brief for the spawned task's Goal>"] \
  --drive-to-ready <drive_to_ready> \
  --fallback-status <fallback_status> \
  [--branch <shared-branch>]   # from 4a-bis; omit for per-task \
  --pr <open|rolling> \
  [--pr-title "<resolved title>"]
```

Pass `--drive-to-ready` and `--fallback-status` through from the caller's
spawn policy on every dispatch. With `drive_to_ready=true`, `spawn-task-pr`
best-effort drives the spawned task to `open/ready` (auto-define +
ensure-ready) before opening its PR, landing it at `fallback_status` when the
spec can't be readied. Pass `--branch` / `--pr` / `--pr-title` from 4a-bis.
The `SPAWN-TASK-PR-DONE` marker gains `state=<final-status>` and
`action=<created|appended>` fields so you can report readied-vs-draft and
which spawns opened vs. appended to a shared PR (step 7).

Slug guidance: name the **fix**, not the symptom. Prefer
`worktree-init-verifies-lefthook` over `full-check-failed-twice`.
Keep it ≤ 6 words.

Omit `--tag` for `Local`. Pass `--tag <plugin-name>-meta` for
`Upstream-plugin`. Pass `--tag cross-project-request` for
`Cross-project-request`.

The sub-skill ensures a worktree exists for the target repo,
branches `meta-task/<slug>` from its `origin/main`, runs
`sdlc task create` against that repo's root, fleshes out the body
(stubs for sections this sub-agent doesn't supply — see step 5),
commits, pushes, and opens a PR. On success it emits one of:

- `SPAWN-TASK-PR-DONE pr=<url> target=<owner/name> branch=meta-task/<slug>` —
  new PR opened. Capture the URL.
- `SPAWN-TASK-PR-EXISTING pr=<url>` — a PR with this slug already
  existed on the target. Capture the URL; treat as success.
- `ERROR reason="<...>"` — dispatch failed. Record this bullet as
  a classification-failure in the report (step 7); do not retry
  silently and do not downgrade to a different classification to
  keep moving.

### 5. Brief the sub-skill on body content

This sub-agent does not write the spawned task's body directly —
`/sdlc:spawn-task-pr` owns the new file and stubs the placeholder
sections. To pass through richer Goal content, supply `--brief
"<short body brief>"` on the dispatch in step 4b. The brief should
be one or two sentences describing the gap and proposed fix, so the
spawned task's `## Goal` carries useful context before the receiver
fleshes the rest.

The sub-skill itself emits a `## Discovery context` line of the
form `Spawned by /sdlc:spawn-task-pr on <YYYY-MM-DD UTC> from
[[<originating-basename>]] in <originating-repo-url>.` — this
sub-agent does not need to add a duplicate.

For dedup-search audit trail: the dedup `block` returned by step
3 belongs on the spawned task's `## Discovery context` under a
`### Dedup search (spawn-from-post-mortem)` H3. If the dispatch
in step 4b returned `SPAWN-TASK-PR-DONE`, this sub-agent does NOT edit the
spawned task file directly — instead, surface the dedup `block`
in the report (step 7) under a `DEDUP-AUDIT:` row so a reviewer
can paste it onto the spawned PR or into the post-mortem if they
care to. Editing the spawned task file would require a second
push to the spawn PR's branch, which `spawn-task-pr` does not
expose.

For `LINKED-EXISTING` (no dispatch happened — step 3 found an
existing task to link to), this sub-agent DOES still edit:
append the originating task's basename to the linked task's
`related:` array (de-duplicated), append the dedup search trail
`block` to the linked task's `## Discovery context`, and validate the
frontmatter:

```text
${CLAUDE_PLUGIN_ROOT}/cli/sdlc entities validate <linked-task-path>
```

If it fails, fix the frontmatter and re-run. Never commit a file
that fails validation. The linked file edits are committed in
step 7 alongside the post-mortem updates from step 6.

### 5b. Record each bullet as a friction

Every bullet from step 1, including the ones step 2 skipped, is recorded as a reported
`friction` entity, so the retro view and `sdlc friction detect` see it beside the frictions
detected from the log. Map the step 2a classification to `scope`: `Local` is `local`,
`Upstream-plugin` is `upstream`, `Cross-project-request` is `external`.

```bash
sdlc friction create --title "<bullet, one line>" --source reported --scope <scope> \
  --subjects '["<originating task id>"]' --json
```

Then, for a bullet that became or was linked to a task, close the friction against it:

```bash
sdlc friction update <friction basename> \
  --set '{"state":"closed/promoted","result":"[[<task-slug>]]"}'
```

A skipped bullet stays `open/accepted`. A friction file holds the bullet's one-line title,
never the post-mortem prose. Stage the friction files with the task changes in step 7.

### 6. Update the originating post-mortem

After processing all bullets, edit the originating task body:

- For each gap bullet that became (or was linked to) a task, append
  `→ [[<task-slug>]]` to the bullet so the link is visible inline.
  Note: for newly-spawned follow-ups the linked slug is not yet on
  main (the spawned PR may not have been merged yet, or may be
  rejected by the reviewer). The link records intent; if the
  spawned PR is later closed without merging, the link becomes a
  dead reference — a soft issue worth knowing about but not worth
  blocking on.
- Append a new subsection at the end of the post-mortem:

  ```text
  ### Spawned follow-up tasks

  - [[<slug-1>]] (<pr-url-1>) [<final-status>] — <one-line description, spawned|linked>
  - [[<slug-2>]] (<pr-url-2>) [<final-status>] — ...
  ```

  Carry the PR URL inline for each spawned entry so a reader can
  click through to the follow-up's PR without grepping, and the
  `[<final-status>]` from the `SPAWN-TASK-PR-DONE state=` field so a
  reader sees at a glance which follow-ups already reached `open/ready`
  versus landed as a draft. For
  `LINKED-EXISTING` entries the PR URL is omitted (the linked task
  is already in the corpus). If nothing was created or linked,
  write `- none`.

Re-run the validator on the originating task as a defensive check
(its frontmatter shouldn't have changed, but it's a cheap guard).

### 7. Commit and report

The only files this sub-agent stages on the originating feature
branch are (plus the friction files from step 5b):

- The originating task file (post-mortem updates from step 6).
- Any **existing local task files** edited in step 3 because the
  dedup search returned `LINKED-EXISTING` (their `related:` array
  and `## Discovery context` got appended to).

Spawned follow-up task files MUST NOT be staged here — every
spawned task lives on its own PR opened by `/sdlc:spawn-task-pr`,
not on the originating feature branch. That separation is what
lets a reviewer accept or reject each follow-up independently.

```text
git add docs/planning/tasks/
git commit -m "docs(tasks): record post-mortem follow-ups for <originating-basename>"
```

If neither set of edits exists (no post-mortem updates AND no
`LINKED-EXISTING` edits — for example, every bullet was `SKIPPED`),
do **not** create an empty commit; skip the commit entirely. Spawn
dispatches are still reported below even when no commit happens
here.

Report back to the caller in exactly this shape so it can be parsed:

```text
SPAWNED-LOCAL: <N>
SPAWNED-UPSTREAM: <X>
SPAWNED-REQUEST: <Y>
LINKED-EXISTING: <M>
SKIPPED: <K>
CLASSIFICATION-FAILED: <F>
PRS:
  local:    <pr-url> -> <slug>
  upstream: <pr-url> -> <plugin-name>-meta task
  request:  <pr-url> -> <target-repo>
LINKED-PATHS:
  - <linked-task-path-1>
DEDUP-AUDIT:
  - <slug-1>: <one-line dedup decision summary>
AMBIGUOUS-BULLETS:
  - "<verbatim bullet text>" — <one-line reason classification was unclear>
```

- `SPAWNED-LOCAL`, `SPAWNED-UPSTREAM`, and `SPAWNED-REQUEST` count
  the three classifications separately. Sum them for the total
  number of follow-up PRs opened.
- Every spawned follow-up — Local included — is a PR URL under
  `PRS:`. There is no "this task file landed on the originating
  branch" row anymore.
- `LINKED-PATHS` lists the local task files edited because the
  dedup search returned `LINKED-EXISTING`. These ride the
  originating PR (they were staged in the commit above).
- `DEDUP-AUDIT` carries the one-line dedup summary per spawned
  task so the caller (typically `/sdlc:task-work` Step 8) can
  decide whether to paste the full search trail onto the spawned
  PR. Omit the row entirely if no spawns happened.
- `CLASSIFICATION-FAILED` counts bullets where step 2a could not
  reach a confident classification AND the sub-agent did not get a
  caller clarification before this report. Always non-empty
  `AMBIGUOUS-BULLETS` list when this number is non-zero. The
  orchestrator's recovery is to surface these to the user.
- Omit any `PRS:` row whose category had zero entries; emit at
  least the `PRS:` header even when every category is empty so the
  parser can detect a clean run.

## Constraints

- The only files this sub-agent commits on the originating feature
  branch are the originating task file (post-mortem updates) and
  any local task files edited via `LINKED-EXISTING`. Spawned
  follow-up task files MUST NOT land on the originating branch —
  they live on `meta-task/<slug>` branches in their own PRs.
- Do not modify the originating task's frontmatter — only its body.
- For all three classifications, do not attempt to clone, branch,
  push, or open PRs from inside this sub-agent. All PR creation
  goes through `/sdlc:spawn-task-pr` — that's the boundary that
  owns target-repo state (worktree creation, branch naming, push,
  `gh pr create`). This sub-agent's job is to classify, prepare
  the inputs, call the sub-skill, and reconcile the result.
- Do not push the originating repo's PR, do not open the originating
  PR — that belongs to the parent skill.
- On unrecoverable error (validator keeps failing, script errors,
  ambiguous gap with no reasonable interpretation), stop and report
  `ERROR: <one-line reason>` instead of the SPAWNED block. Do not
  partially commit — leave the worktree clean.
