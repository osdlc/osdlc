# Coding agents in CI

Plan for running headless coding agents (claude, codex, cursor and later
others) from GitHub Actions, starting with answering `@claude` on pull
requests. Started 2026-11-08.

## Where it stands

- `.github/workflows/claude.yml` answers `@claude` on pull requests by
  running `claude -p` directly (#710). anthropics/claude-code-action was
  dropped: the API refused its comment-mode runs with `billing_error` while
  the same credential worked from the CLI.
- #711 switched it to `ANTHROPIC_API_KEY`.
- #712 (claude-setup and claude-pr-answer composite actions) was closed
  unmerged in favour of the generic layout below. Its branch,
  `sksizer/actions-package`, is the starting point for `agent-pr-answer`
  (`post.sh`, the prompt, the README and license layout).
- A parley, agent-gh-actions-design, discussed packaging first. It was
  retired unanswered on 2026-11-08; this plan supersedes it.

## Roadmap

Arrows mean "needs"; a dotted arrow means "reuses code from".

| Colour       | Status                                                        |
| ------------ | ------------------------------------------------------------- |
| Green        | Done                                                          |
| Purple       | PR ready to merge (approved, checks green)                    |
| Teal         | PR in review                                                  |
| Red          | Blocked on sksizer: a decision or input is needed             |
| Pink         | Blocked by something external (conflict, failing CI, another team) |
| Amber        | In progress by the agent                                      |
| Light orange | In progress by sksizer                                        |
| Blue         | Next                                                          |
| Grey         | Later                                                         |

Update the classes at the bottom as items move.

```mermaid
flowchart LR
  subgraph done["Done"]
    W710["PR 710: claude.yml runs claude -p"]
    P711["PR 711: claude.yml on ANTHROPIC_API_KEY"]
    P707["PR 707: closed as moot"]
    P712["PR 712: closed; branch kept as a starting point"]
    PLAN["Plan + investigations I1–I5"]
  end
  subgraph house["Housekeeping"]
    PLANPR["PR 713: this plan, merged"]
    PARLEY["Retire the packaging parley"]
  end
  subgraph facts["Facts · harness-reference (skillwright repo)"]
    UP["Upload your harness-reference work"]
    PERM["permissions/ category: claude, codex, cursor"]
    PROBE["Cursor clean-config probe"]
  end
  subgraph call["One call · @osdlc/agent-call"]
    RUN["PR 715: run CLI with maxTurns, merged"]
    CHECK["Check permission rows against the facts"]
    STRICT["Backlog: enforced read-only mappings (claude tool denies + sandbox, cursor cli.json) so strict passes"]
    CUR["PR 721: cursor allow and deny via .cursor/cli.json"]
    REL["Release agent-call with the run CLI and maxTurns"]
  end
  subgraph gate["Gate"]
    ARCH["API and architecture review 1: approved"]
  end
  subgraph acts["CI glue · packages/gh-actions"]
    SETUP["PR 716: agent-setup and release workflow"]
    ANS["agent-pr-answer: prefetch, run, post"]
  end
  subgraph roll["Rollout"]
    SPEC["claude.yml on the spec"]
    MULTI["Same spec on codex and cursor"]
  end
  subgraph later["Later"]
    MCP["MCP and hooks via skillwright"]
    PUB["Move to osdlc/actions + Marketplace"]
    DATA["harness-reference as agent-call's data"]
    PIN["skillwright: agent-adapt 0.19.2 → 0.19.3"]
  end

  PLAN --> PLANPR
  PLAN --> PARLEY
  UP --> PERM
  PLAN --> PERM
  PERM --> PROBE
  PERM --> CHECK
  CHECK --> STRICT
  RUN --> STRICT
  PROBE --> CHECK
  P712 -.-> ANS
  RUN --> ARCH
  SETUP --> ARCH
  ARCH --> REL
  REL --> ANS
  ARCH --> SPEC
  ANS --> SPEC
  SPEC --> MULTI
  CUR --> MULTI
  MULTI --> MCP
  MULTI --> PUB
  CHECK --> DATA

  classDef done fill:#2e8b57,stroke:#1f6640,color:#ffffff
  classDef review fill:#0f8a8a,stroke:#0a6666,color:#ffffff
  classDef ready fill:#7a4fc2,stroke:#5a3596,color:#ffffff
  classDef blocked fill:#c0392b,stroke:#8e2a20,color:#ffffff
  classDef external fill:#e88fb4,stroke:#b8628a,color:#1b2230
  classDef active fill:#c77d0a,stroke:#94600a,color:#ffffff
  classDef yours fill:#f5c27a,stroke:#c99545,color:#1b2230
  classDef next fill:#2f5bd3,stroke:#2144a3,color:#ffffff
  classDef later fill:#8a93a3,stroke:#6b7384,color:#ffffff
  class W710,P711,P707,P712,PLAN,PARLEY,PLANPR,ARCH,RUN done
  class UP yours
  class SETUP active
  class PERM,PROBE,CHECK,ANS,SPEC,MULTI next
  class REL active
  class CUR active
  class MCP,PUB,DATA,PIN,STRICT later
```

## Review queue

What is ready for your review, in the order to review it. Rewritten as PRs
move; merged PRs drop off.

| Order | PR | What | Why this order | Status |
| --- | --- | --- | --- | --- |
| 1 | [#723](https://github.com/osdlc/osdlc/pull/723) | agent-call `run`: forward SIGINT and SIGTERM to the agent | Small fix from the codex review of #715; can ship in the same agent-call release | draft; gate running |
| 2 | [#721](https://github.com/osdlc/osdlc/pull/721) | agent-call: cursor allow and deny via `.cursor/cli.json` | Same package as #715 (merged); can ship in the same agent-call release | draft; /craft:pr-review running; behind main |
| 3 | [#716](https://github.com/osdlc/osdlc/pull/716) | `agent-setup` action and `gh-actions release` workflow | Independent of agent-call; needed before `agent-pr-answer` | draft; /craft:pr-review running |

## PR tracker

Checked 2026-11-08. A periodic check refreshes this table and the graph.

| PR   | Title                                    | State | Review | Merge          | Blocker                                                              | Plan                     |
| ---- | ---------------------------------------- | ----- | ------ | -------------- | -------------------------------------------------------------------- | ------------------------ |
| [#723](https://github.com/osdlc/osdlc/pull/723) | fix(agent-call): forward signals in run | draft | none | — | pre-review gate running | merge |
| [#721](https://github.com/osdlc/osdlc/pull/721) | feat(agent-call): allow and deny tools on cursor | draft | none   | —              | pre-review gate running: /simplify, /code-review, responses | merge                    |
| [#716](https://github.com/osdlc/osdlc/pull/716) | feat(gh-actions): agent-setup action  | draft | none   | —              | pre-review gate running: /simplify, /code-review, responses | merge                    |
| [#715](https://github.com/osdlc/osdlc/pull/715) | feat(agent-call): agent-call run command | merged | — | — | — | merged 2026-11-08 |
| [#717](https://github.com/osdlc/osdlc/pull/717) | docs(planning): status and API review 1 | merged | — | — | — | merged 2026-11-08 |
| [#713](https://github.com/osdlc/osdlc/pull/713) | docs(planning): plan coding agents in CI | merged | — | — | — | merged 2026-11-08 |
| [#712](https://github.com/osdlc/osdlc/pull/712) | gh-actions: claude-setup, claude-pr-answer | closed | none  | —              | —                                                                    | closed 2026-11-08; branch kept as a starting point |
| [#711](https://github.com/osdlc/osdlc/pull/711) | claude.yml: ANTHROPIC_API_KEY            | merged | none  | —              | —                                                                    | merged 2026-11-08        |
| [#622](https://github.com/osdlc/osdlc/pull/622) | Proposal: transcripts in agent-call and observe | draft | none   | —              | —                                                                    | related to agent-call, not on this plan's path |
| [#707](https://github.com/osdlc/osdlc/pull/707) | claude: hide full output again           | closed | none   | —              | —                                                                    | closed as moot 2026-11-08 |

## Principle

Each kind of harness difference has one owner, and the facts behind all of
them live in one place.

| Layer        | Owner                                         | Owns                                                                                                   |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Facts        | harness-reference (osdlc/skillwright)         | Cited, dated data on how harnesses differ. Gains a `permissions` category.                             |
| Files        | skillwright, over agent-adapt's renderers     | Skills, plugins, MCP config, hooks, and installing them into a harness (`skillwright harness install`) |
| One call     | `@osdlc/agent-call` (`packages/ts/agent-call`) | Prompt, model, permissions, turns, output parsing. Gains a `run` CLI over a spec file.                 |
| CI glue      | the actions (`packages/gh-actions/`)          | Fetch the pull request's context, call the two tools, post the answer. Translates nothing itself.     |

## The job, as a reviewed spec

A spec file in the calling repository, for example
`.github/agents/pr-answer.yml`, says what the agent gets. The setup half goes
to skillwright, the run half to `agent-call run`.

```yaml
setup:
  harness: claude # the workflow may override: claude | codex | cursor
  plugins: [craft@osdlc]
run:
  model: claude-sonnet-5-5
  strict: true # fail instead of approximating a permission
  permissions: { mode: read-only, allowTools: [Read, Grep, Glob] }
  prompt:
    - file: .github/agents/prompts/pr-answer.md
    - input: request
  context:
    - input: pr-context
```

Rules:

- Prompt and spec files are read from the default branch's checkout, never
  the pull request's: a pull request must not change the instructions that
  run with the secret.
- The agent gets no shell and no `gh`. The action fetches the description,
  comments and diff first and passes them as context.
- Prose is the default prompt. A skill is either referenced as prose with
  `file:` or installed as a plugin when it bundles scripts.
- `agent-call run --explain` prints the exact command line in the run log.
- Credentials reach the harness through the step's `env`, never the spec.

## Investigations

All five are answered; the findings follow the sections below.

| Id  | Question                                                                                                      | Status |
| --- | ------------------------------------------------------------------------------------------------------------- | ------ |
| I1  | How far do agent-adapt and skillwright / tradecraft-core overlap, and which should own asset rendering?       | answered: layered, not rivals |
| I2  | What permission controls does cursor's headless CLI really have (read-only, allowlist, sandbox)?              | answered: `--mode ask` plus `.cursor/cli.json` denies |
| I3  | Does `claude -p` expand a leading `/plugin:skill` the way an interactive session does?                        | answered: yes |
| I4  | Does `codex exec` pick a skill from prose, and does `$plugin:skill` work in exec mode?                        | answered: yes (project skill; plugin namespace not run) |
| I5  | What does harness-reference need in a `permissions` category, and does agent-call's capability map agree with it? | answered: subjects proposed; one agent-call note contradicted |

## API and architecture review

An ongoing gate, not a one-off. Before a library change merges, and before
any significant refactor, review:

- **Dependencies**: which package depends on which, and whether each
  dependency points the right way (facts ← files ← call ← actions; nothing
  in agent-call depends on skillwright or agent-adapt).
- **Public APIs**: the `agent-call run` CLI and spec format, the
  `agent-setup` and `agent-pr-answer` inputs and outputs, and anything
  exported for other packages.
- **Duplication**: harness facts encoded in more than one place.

The first round covers `agent-call run` and `agent-setup` while they are
built, and gates `agent-pr-answer` and the move of `claude.yml` to the
spec. Its output is a review document with a decision per question.

Review 1 ([agent-ci-review-1](../parley/agent-ci-review-1.json)) was
approved on 2026-11-08. Decisions:

| Question | Decision |
| --- | --- |
| strict | Keep as built: fail, the caller relaxes with `strict: false`. Enforced read-only mappings are backlogged. |
| Turn limit | Add `limits.maxTurns` to `AgentCallSpec` (#715). |
| Cursor allow and deny rules | agent-call writes `.cursor/cli.json` for the length of the call, then restores it. |
| `yaml` dependency | Keep it in `@osdlc/agent-call`, loaded only by the CLI. |
| Cursor install | The pinned build tarball from Cursor's download server, checked against SHA-256. |
| Cursor plugins | Fail when plugins are requested on cursor. |
| `v1` release | Add a release workflow now (#716). |
| `marketplaces` input | Keep `name=url [ref]`. |
| Order | Merge #715 with these decisions, release agent-call, then build `agent-pr-answer`. |

## Known issues

- `claude.yml`: when checkout or the CLI install fails, the "Post the answer"
  step is skipped (`steps.claude.outcome != 'skipped'`), so the pull request
  gets no reply. `agent-pr-answer` replaces this workflow; it must post an
  error on every failure path. Found in the #717 pre-review.

## PR process

Every PR opens as a draft. Before it is marked ready for review it goes
through /simplify and /code-review, and every finding gets a response (fixed,
or declined with a reason) in one PR comment. Then it moves out of draft.

## Work, in order

1. Add the `permissions` category to harness-reference for claude, codex
   and cursor (I5).
2. `agent-call run`: spec file, `file` / `text` / `input` prompt parts,
   `--explain`. `strict` follows once its capability map is checked against
   harness-reference.
3. Generic actions in `packages/gh-actions/`, one shared `v1`:
   `agent-setup` over skillwright's install, `agent-pr-answer` as fetch,
   `agent-call run`, post, starting from #712's branch.
4. Move `claude.yml` to the spec; then run the same spec on codex and
   cursor.
5. Later: MCP and hooks through skillwright; move the actions to
   `osdlc/actions` with a Marketplace listing once something outside osdlc
   uses them.

## Findings

Run 2026-11-08 with claude 2.1.319, codex-cli 0.162.0 and cursor `agent`
2026.10.19. Each skill test used a throwaway skill, `probe-marker`, whose
body says to reply `PROBE-7Q3` plus its arguments.

### I1: agent-adapt and skillwright are layered, not rivals

- agent-adapt (`packages/rust/agent-adapt`, 0.19.3) is the rendering
  library: model in, files out. It renders skills, plugin manifests,
  commands, subagents, hooks and MCP config (claude JSON, codex TOML,
  antigravity JSON) for ten runtimes, and holds the skill-call table
  (`src/skill_call.rs`).
- tradecraft-core (osdlc/skillwright, 0.45.0) is the vault and marketplace
  layer on top. It depends on agent-adapt (`packages/rust/tradecraft-core/Cargo.toml:35`),
  takes skill-call syntax from it, and adds harness profiles, translators,
  marketplaces, publish, adopt and `harness install`. tradecraft-wasm gives
  it a JS binding.
- skillwright's decision D-FDLQ already settles the split: harness profiles
  and translators in tradecraft-core, "frontmatter dialects and tool names
  stay in agent-adapt". It rejected generating the profile from
  harness-reference; tests check the profile against it instead.
- agent-adapt's skill-call table agrees with every
  `skills/user-invocation` fact in harness-reference (claude, codex, cursor,
  pi). It does not read the corpus; it cites its own survey.
- Gaps: skillwright pins agent-adapt 0.19.2 from crates.io while osdlc is at
  0.19.3. Nothing in osdlc depends on agent-adapt directly.

**Consequence:** no merge. The files layer is agent-adapt (rendering) under
skillwright (vaults, marketplaces, install). The CI work uses skillwright
for setup and adds nothing to agent-adapt. "Checked against
harness-reference" (D-FDLQ's rule) replaces "generated from" in this plan.

### I2: cursor has real permission controls

| Test (`agent -p --trust`)                                     | Result                                   |
| ------------------------------------------------------------- | ---------------------------------------- |
| `--mode ask`, asked to write a file                           | refused, nothing written                 |
| `--mode ask`, asked to run `touch`                            | refused, nothing written                 |
| no mode, asked to write a file                                | file written                             |
| no mode, asked to run `touch`                                 | ran it, file written                     |
| project `.cursor/cli.json` denying `Write(**)` and `Shell(*)` | write and shell both refused             |
| the same deny file with `--force`                             | still refused: denies beat `--force`     |

- `--mode ask` is a working read-only mode, not just a hint.
- `.cursor/cli.json` `permissions.allow` / `deny` (`Read(...)`,
  `Write(...)`, `Shell(cmd)`) is a real allowlist. agent-call drops
  `allowTools` and `denyTools` on cursor today; it could write this file
  instead.
- Plain `-p` runs shell commands. agent-call's cursor adapter says print
  mode "rejects shell commands" (`src/adapters/cursor.ts:143`); that did not
  hold here. The local user config has the sandbox disabled, which may
  explain it; check under a clean config before fixing the note.
- For CI: run cursor with `--mode ask` and a deny file written by setup, so
  read-only holds even if one of the two is bypassed.

### I3: `claude -p` expands skill calls

- `/probe-marker hello` (project skill) and `/probeplug:probe-marker hello`
  (plugin loaded with `--plugin-dir`) both answered `PROBE-7Q3 hello` in one
  turn: the harness expands the skill before the model runs.
- Prose ("Use the probe-marker skill with the argument hello") also worked,
  in three turns: the model called the `Skill` tool itself. It needs `Skill`
  allowed.

### I4: codex and cursor pick skills from prose too

- codex (`codex exec --sandbox read-only`, skill in `.agents/skills/`):
  `$probe-marker hello` and the prose request both answered correctly.
- cursor (`agent -p --mode ask`, same `.agents/skills/` folder):
  `/probe-marker hello` and the prose request both answered correctly.
- Not run: a plugin-namespaced call on codex (`$plugin:skill`).
  harness-reference cites codex's source for it.

**Consequence:** prose is a reliable default on all three harnesses. An
explicit call guarantees the skill loads; its syntax comes from agent-adapt's
table, which matches the corpus.

### I5: a `permissions` category for harness-reference

harness-reference has no permissions facts. agent-call's capability map holds
them, uncited, and I2 found one of its notes wrong. Proposed subjects:

- `permissions/read-only`: the flag or mode, and what it blocks (writes,
  shell, network).
- `permissions/tool-allowlist` and `permissions/tool-denylist`: flags or
  config files, and their rule syntax.
- `permissions/config-file`: where per-project rules live (cursor
  `.cursor/cli.json`, claude `settings.json` `permissions`, codex
  `config.toml`).
- `permissions/precedence`: whether denies beat force or bypass flags.
- `permissions/print-mode-default`: what a headless run may do with no
  flags.

agent-call's permission rows should then be checked against these facts the
way tradecraft-core's profile is (D-FDLQ).

## Later: harness-reference as agent-call's data

agent-call's flag and permission tables could come from a compiled snapshot
of harness-reference, selected by the installed harness's version, with
output parsers and approximations staying in code. Steps: check against the
corpus first (as above), then give execution-relevant subjects
machine-usable value shapes, then generate the tables. Its probes could
double as agent-call adapter tests.

## Changes to the plan from the findings

- Files layer: skillwright over agent-adapt, no merge (I1).
- Cursor joins v1 alongside claude and codex: it has a real read-only mode
  and allowlist (I2).
- agent-call: write `.cursor/cli.json` for `allowTools` / `denyTools`
  instead of dropping them, and correct the print-mode note after a
  clean-config check (I2).
- Skills: prose by default, an explicit call when a request names a skill
  (I3, I4).
