# Skill-authoring conventions

This file applies to anyone (human or LLM) editing the sdlc plugin's skills — the vault notes under
`solutions/ontological/plugin/plugins/sdlc/skills/<name>/<name>.md` and the scripts beside them. The
built plugin ships a copy at `${CLAUDE_PLUGIN_ROOT}/skills/CLAUDE.md`, the path skill prose cites.

One standard governs how skills are written:
[[S-0006-skill-md-is-direct-instruction]]. It covers both the phrasing
discipline — positive framing, surgical rationale, no structurally-enforced
negatives — and the structure and equipping — the `description` field, degrees of
freedom, decomposition, progressive disclosure, formatting/placement, examples,
eval. The house rules below are its actionable form; consult the standard for the
evidence base.

## Write the `description` to trigger, and match freedom to fragility

When authoring a skill note (per [[S-0006-skill-md-is-direct-instruction]]):

- **`description` field.** Third person, packing BOTH what the skill does AND
  when to invoke it (the key terms, file types, contexts that should fire it). It
  is the single most important field for skill selection; make it slightly pushy
  if it under-triggers.
- **Degrees of freedom match fragility.** Fragile/irreversible work (migrations,
  releases — a "narrow bridge with cliffs") gets an exact, do-not-modify script;
  open judgment work (review, drafting) gets general direction; medium gets
  parameterized pseudocode. This is [[P-0001-prefer-deterministic-over-llm]]
  applied per-instruction — the cost of a wrong move, not just the workflow's
  maturity, sets the latitude.
- **Decompose; cap constraints per step.** Number sequential steps, keep each to
  ~3-4 hard constraints, split denser ones, and end any output-producing flow
  with an explicit verification step. Joint compliance decays sharply with the
  number of constraints in one step.
- **Write a call to another skill as `/[[skill]]`.** The build writes each
  harness's own form. A hand-written `/sdlc:skill`, `$sdlc:skill` or `/skill` in a
  body is refused; escape one meant literally as `\/sdlc:skill`, `\$sdlc:skill`
  or `\/skill`.

## Rebuild after editing a skill

Rebuild and check the harness packs, then run the skill-prose gate for an `sdlc` skill:

```sh
cargo run -q -p agent-pants -- build --config solutions/ontological/agent-pants.yaml --yes
cargo run -q -p agent-pants -- check --config solutions/ontological/agent-pants.yaml
solutions/ontological/cli/sdlc gate skill-prose
```

Commit the rendered packs with the skill.

## Namespace every terminal stdout marker with the skill's slug

**Status: live today; retires at the engine cutover.** This section is the
prose form of the engine's step-result contract. Once steps report over the
stdio JSON-RPC step protocol
([[D-VSLI-distributed-work-runner-architecture]]), a result is a typed value on
a channel belonging to one step, so no marker can be mistaken for another's and
the naming convention has nothing left to prevent. Until then it is
load-bearing — follow it.

Every skill's terminal stdout markers — the deterministic single-line strings
a caller reads to decide what happened — MUST be prefixed with the skill's
own slug in `SCREAMING-KEBAB`. No bare `DONE`, `READY`, `BLOCKED`,
`NEEDS-DEFINITION`, etc.

| Skill                  | Canonical prefix          | Example                                            |
|------------------------|---------------------------|----------------------------------------------------|
| `/sdlc:task-work`      | `TASK-WORK-`              | `TASK-WORK-DONE pr=#42`                            |
| `/sdlc:task-ensure-ready` | `ENSURE-READY-`        | `ENSURE-READY-OK: 2026-05-21-foo`                  |
| `/sdlc:task-define`    | `TASK-DEFINE-`            | `TASK-DEFINE-DEFINED: 2026-05-21-foo`              |
| `/sdlc:spawn-task-pr`  | `SPAWN-TASK-PR-`          | `SPAWN-TASK-PR-DONE pr=https://...`                |
| `/sdlc:task-close-out` | `TASK-CLOSE-OUT-`         | `TASK-CLOSE-OUT-DONE pr=#42 worktree=removed ...`  |

The one un-prefixed marker is `ERROR reason="..."`, shared by convention
across every skill.

### Why

When skill A invokes skill B as a sub-agent via the `Agent` tool, the parent
LLM running A reads B's stdout looking for B's terminal marker. If B's marker
and A's marker share a prefix (e.g. both start with `DONE pr=`), the LLM
mistakes B's intermediate output for A's terminal verdict and short-circuits
A's flow.

On 2026-05-28 this exact failure cost two task-work runs: `spawn-task-pr` (called
from task-work Step 8's post-mortem) emitted bare `DONE pr=<url> ...` that
collided with task-work's terminal `DONE pr=#<N>`. Three other dispatches in
the same session lost work to the parallel `READY:` (ensure-ready) and bare
`NEEDS-DEFINITION:` (ensure-ready) collisions. Namespacing the markers by
skill slug makes the collision class structurally impossible — two skills
cannot share a slug, so two markers cannot share a prefix.

### When you add a new skill

Pick the slug-screaming-kebab prefix at the same time you pick the skill
slug. Document every terminal marker your skill emits with the prefix
baked in. Don't introduce bare prefixes for "developer convenience"; the
LLM-context-isolation cost is too high.

### When you change an existing skill's markers

Rename across the project in one commit/PR: the skill note, the skill's overlay
in the skill-prose contract (`SKILL_PROSE_REGISTRY` in
`solutions/ontological/lib/services/gate/ops/_skill_prose_contract.ts`, if it pins marker
text), every consumer's parser, and any orchestrator regex that matches the
marker. Sub-skill marker renames
should keep the old prefix as documentation for one version (e.g. "the
2026-05-28 namespacing pass retired the bare `READY:` form") so historical
context is recoverable.

## Don't duplicate prose across skill notes (progressive disclosure)

This is the project's progressive-disclosure rule: keep each skill note lean,
and push shared or detailed content into canonical files referenced on demand
rather than inlining it everywhere.

When the same procedural content (a how-to block, a recurring shell pattern, a naming convention, a
multi-step recipe) would land in **more than one**
`solutions/ontological/plugin/plugins/sdlc/skills/*/<name>.md` note, do NOT inline a verbatim copy
in each. Factor it into a single canonical doc and reference it from each skill.

The canonical pattern:

1. Add the shared content to `solutions/ontological/conventions/<topic>.md` (one file per
   topic; see existing examples there).
2. In each relevant skill note's `## Notes` section (or `References:` block, depending on the file's
   existing convention), add a **one-line bullet** pointing at the canonical doc:

   ```text
   - **<Topic>.** See `${CLAUDE_PLUGIN_ROOT}/conventions/<topic>.md` — <one-sentence summary specific to this skill's role>.
   ```

3. Customize the trailing summary per skill if context differs (e.g. one skill
   creates `task/` branches, another creates `chore/` worktrees). Reference
   the same canonical doc; differentiate in the one-line summary.

## Why

Duplicated prose drifts: when the convention evolves, one site updates and the
others go stale silently. A single canonical doc + per-skill references means
the convention has one source of truth, each skill still surfaces it inline
for readers, and updates land in one place.

## When inlining IS appropriate

The rule is about *shared* content. Inline freely when:

- The procedure is genuinely unique to one skill (e.g. `import-planning`'s
  per-candidate sub-agent contract).
- The content is short enough that a reference would be more friction than
  the inline text.
- The convention is about *that one skill's* internal sequencing (e.g.
  `task-work`'s Step ordering).

If you find yourself copy-pasting prose between two skill notes, stop and
factor.

## Mechanical alternative: shell-out to a script

For mechanical conventions (linting, validation, branch-name checking), a
script under `solutions/ontological/scripts/` that skills invoke is often better than a
prose convention — the script enforces, the prose describes. Pick the shape
that fits: prose for human guidance, script for machine enforcement.

## Co-locate skill-specific scripts; promote when shared

When you add a new script that supports a single skill, put it next to that skill at
`solutions/ontological/plugin/plugins/sdlc/skills/<skill-name>/<script>.ts`, not in
`solutions/ontological/scripts/`. Promotion to `solutions/ontological/scripts/` is an explicit
refactor that happens when a second skill actually needs the script — at that point the move is a
deliberate event (its own commit) and any API tidy-up happens with the eyes of two real callers, not
one imagined one.

The broader principle this rule operationalizes ("co-locate first, promote when shared") is
[[S-0001-co-locate-first-promote-when-shared]].

Practical guidance:

- New scripts default to `solutions/ontological/plugin/plugins/sdlc/skills/<your-skill>/`. The
  shared bucket is the exception, not the default destination.
- If a script would be shared by exactly two skills and is **trivial** (a
  few lines, no public-facing CLI), inlining it twice may still be cheaper
  than promoting; revisit on the third caller.
- Promotion uses `git mv` so history follows. Update every
  `${CLAUDE_PLUGIN_ROOT}/skills/<old>/<x>.ts` reference in skill prose and
  in cross-script defaults; grep before committing.
- `solutions/ontological/scripts/` is reserved for scripts called by 2+ skills today.
  `solutions/ontological/conventions/` is an existing example of the "promoted" pattern.

## Don't pipe commands you gate on

When a skill note shows an example that gates execution on a command's exit
code (e.g. "if this fails, fix and re-run"), do NOT pipe the command's
output to `tail`, `head`, or any other filter — Bash returns the LAST
stage's exit code on a pipeline, so a non-zero command becomes a zero
exit. The skill author following the example proceeds past the failed
gate.

The motivating incident: a frontmatter-validation command piped to `tail -3`
in a task-work step masked a validation failure and the skill committed a
file with invalid frontmatter. That command is
`${CLAUDE_PLUGIN_ROOT}/cli/sdlc entities validate <path>` today; the pipe was
the defect, not the command. See
[[T-T5RB-consolidate-task-status-enum]] for the trace.

Acceptable shapes:

```bash
# Best — no pipe, all output goes through, exit code propagates
${CLAUDE_PLUGIN_ROOT}/cli/sdlc entities validate <path>

# Acceptable — capture stdout for trimming, gate on a fresh invocation
out=$(${CLAUDE_PLUGIN_ROOT}/cli/sdlc entities validate <path>) || exit $?
echo "$out" | tail -3

# Acceptable — set pipefail so the pipeline's first non-zero wins
set -o pipefail
${CLAUDE_PLUGIN_ROOT}/cli/sdlc entities validate <path> | tail -3
```

If you find yourself reaching for a pipe in a gating example, reach for one
of the shapes above instead.

## Per-skill doc house-style

Per-skill docs (one Mermaid-anchored doc per skill at `docs/skills/<slug>.md`)
follow the house-style in [./README.md](./README.md). Read that before
authoring or refreshing a per-skill doc; it covers required shape, flowchart
conventions, and an example.

## Post-mortem follow-ups about plugin code go upstream

When a `/sdlc:task-work` post-mortem (Step 8) surfaces a friction bullet
whose fix would land under `plugin/...` in any installed Claude Code
plugin (most commonly the SDLC plugin itself), the spawned follow-up task
MUST be filed as a PR against **that plugin's source-of-truth repo**, not
as a new task file inside the consuming project. Routing plugin-bugs into
consumer repos accumulates plugin debt in every consumer, fragments the
upstream backlog, and silently duplicates work across repos.

The classifier in `entities/task/spawn-from-post-mortem.md` (Step 2a)
enforces this automatically by labelling each bullet `Local`,
`Upstream-plugin`, or `Cross-project-request`. The label decides the target
repo — the resolved plugin repo for `Upstream-plugin`, the named sibling for
`Cross-project-request`, this repo's own main checkout for `Local`. That
routing is unchanged.

**Batch the follow-ups; one PR per bullet is not the rule.** A
tool-improvement micro-fix accrues on the target process's hardening
checklist, and a work order is cut when the checklist is worth acting on,
carrying that target's accumulated bullets together
([[D-VSLI-distributed-work-runner-architecture]]). A bullet still earns its own
immediate work order when it is not a micro-fix — a real defect, a blocking
gap, anything a reviewer would want to judge on its own merits. Batching is
**per target repo**: bullets routed to different repos never merge into one
work order. Dispatch is still `/sdlc:spawn-task-pr` on a `meta-task/<slug>`
branch; what changed is how many bullets ride one branch. Spawned
upstream-plugin tasks carry a `<plugin-name>-meta` tag (e.g. `sdlc-meta`)
regardless of where they physically land, so downstream readers can
distinguish plugin-meta work from project-domain work.

This rule is the binding contract for both human authors and LLM agents:
if you're editing a skill note and find yourself reaching for a "spawn a
local follow-up about this plugin's behavior" shape, stop — the spawn
flow should route it cross-repo, and any new bypass needs to be a
deliberate design change in `spawn-from-post-mortem.md`, not an inline
exception.

Degenerate case: when the consumer project IS the plugin's dev repo (this
project, today), the cross-repo dispatch collapses to a local task file
plus the `<plugin-name>-meta` tag. The tag still travels with the task,
so the convention is robust to the degenerate case without any special
handling at the call site.

## Project-local extension — don't contaminate general skills

When a consuming project needs a skill to do something only that project ever needs (e.g. an
SDLC-specific path-pattern scan that only fires when the consumer IS the sdlc plugin's own dev
repo), do NOT add the behavior to the upstream skill note. Use the project-local skill extension
convention — see
[`../conventions/project-local-skill-extension.md`](../conventions/project-local-skill-extension.md).

The shape: the upstream skill declares a named extension point
(`.sdlc/skill-ext/<slug>/<event>.sh`) and a documented input/exit-code
contract. The consuming project drops a hook script at that path. The
upstream skill stays general; the project-specific behavior lives under
the consumer's `.sdlc/` (the SDLC plugin's own project-local runtime
directory, distinct from `.claude/` which is Claude Code's home).
