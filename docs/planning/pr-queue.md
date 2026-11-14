# The pull request queue

Every open pull request in osdlc/osdlc, whether it is still wanted, and the
order to merge them in. Read on 2026-11-14, with 33 open. Update a row when
its pull request merges or closes, and delete this file when the queue is
short enough to read on GitHub.

Merged since, all on 2026-11-14: #802, #801, #803, #783, #787, #785, #805,
#806, #807, #631 and #630. The order numbers below are as first written.

## Summary

- **All 33 open on 2026-11-14 were still wanted.** None is replaced by work already on `main`.
- **One needs work before review:** #740, overtaken by a change to the CI
  workflows. #649, #650 and #651 were reworked on 2026-11-14.
- **Two have a failing check:** #691 (Rust) and #651 (the perf gate).
- **None is approved.** Most have had a review pass that left one or more
  questions for the owner. Those questions are the main thing holding the
  queue.
- **Two bring a package from sksizer/dev** (#744, #672). Both were opened
  before D-SM4K said nothing moves out of sksizer/dev yet, so the owner
  decides them.

## Rules for the order

1. Finish what is released and wrong first: docs and data that name a version
   or a repository that is no longer true.
2. Within one package, merge in the order that keeps the later pull request's
   diff small. Two pull requests on one package are never merged in the same
   Version Packages release unless they are a stack.
3. Merge a stack from the bottom. Once the bottom merges, point the next one
   at `main`.
4. Small and independent pull requests fill the gaps while a larger one is in
   review.
5. Merge the Version Packages pull request after each group, so a release
   holds one group's changes.

## The queue

State is one of: **ready** (checks pass, behind `main` only), **question**
(a review pass left a question for the owner), **failing** (a check fails),
**rework** (overtaken by `main`), **draft**.

### 1. Finish the repatriation

Done. #785 is merged, and `packages-publish.yml` passes `package-globs`, so
the "not on npm yet" check covers `packages/profiles` and `packages/corpora`.

### 2. The corpus tools

Done. #806 (`@osdlc/corpus-query`) and #807 (`@osdlc/corpus-site`) are
merged, and both packages have their placeholder on npm. Their first release
is the next Version Packages pull request.

### 3. The markdown libraries

All three were reworked on 2026-11-14: `main` is merged in and the versions
are the next ones.

| Order | Pull request                                    | What                                                              | State    | Before it merges                                                                                                    |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| 8     | [#649](https://github.com/osdlc/osdlc/pull/649) | `markdown-link`: indented code, math, raw HTML, autolinks as code | question | The crate is 0.10.0. The scanner is about three times slower: speed it up or accept it. skillwright needs it (#638) |
| 9     | [#651](https://github.com/osdlc/osdlc/pull/651) | `markdown-link`: link titles, parentheses, every relative link    | failing  | Stacked on #649. The perf gate fails. Point it at `main` once #649 merges                                           |
| 10    | [#650](https://github.com/osdlc/osdlc/pull/650) | `markdown-corpus`, `markdown-vault-fs`: four edge cases           | question | It targets `main`, at vault-fs 0.7.0 and corpus 0.4.0. One review finding (a dead `Outside` arm) is for the owner   |

### 4. Agents in CI

`docs/planning/agent-ci.md` is the plan for this group, and #722 updates it.

| Order | Pull request                                    | What                                          | State    | Before it merges                                          |
| ----- | ----------------------------------------------- | --------------------------------------------- | -------- | --------------------------------------------------------- |
| 13    | [#798](https://github.com/osdlc/osdlc/pull/798) | agent-call: `inheritEnv`, `unsetEnv`          | question | One design question                                       |
| 14    | [#799](https://github.com/osdlc/osdlc/pull/799) | agent-call: why a run failed                  | ready    | After #798: same package                                  |
| 15    | [#797](https://github.com/osdlc/osdlc/pull/797) | harness-knowledge: short-id map               | question | Two design questions. After #799: it edits agent-call     |
| 16    | [#764](https://github.com/osdlc/osdlc/pull/764) | Run any skill from a PR comment               | draft    | Three remarks left for the owner                          |
| 17    | [#622](https://github.com/osdlc/osdlc/pull/622) | Proposal: session meta and native transcripts | draft    | A design to accept or change. No code                     |
| 18    | [#722](https://github.com/osdlc/osdlc/pull/722) | The agents-in-CI plan and its review queue    | draft    | Last in the group, so its tracker is right when it merges |

### 5. pr-update

| Order | Pull request                                    | What                                      | State    | Before it merges                                                                                   |
| ----- | ----------------------------------------------- | ----------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| 20    | [#736](https://github.com/osdlc/osdlc/pull/736) | Attempts and the update lease on git refs | question | Five design questions                                                                              |
| 21    | [#740](https://github.com/osdlc/osdlc/pull/740) | CI: less load from pull requests          | rework   | It conflicts: `verify` moved into the shared `ts-packages-ci.yml`, which cannot express its change |

#740 is worth doing early if the queue is merged quickly: every merge to
`main` pushes into every open pull request and starts its CI again.

### 6. One package each

Independent of each other, apart from the pairs marked. All have had a review
pass.

| Order | Pull request                                    | What                                         | State    | Before it merges                                                         |
| ----- | ----------------------------------------------- | -------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| 22    | [#629](https://github.com/osdlc/osdlc/pull/629) | cli-tool: text and choice prompts            | question | One naming question (`isTerminal`). Before #636: same package            |
| 23    | [#636](https://github.com/osdlc/osdlc/pull/636) | cli-tool: devlink runs a checkout under node | ready    | Update the branch by hand: pr-update's push was rejected                 |
| 25    | [#633](https://github.com/osdlc/osdlc/pull/633) | typed-git: exact bytes with `rawBytes`       | ready    | Nothing                                                                  |
| 26    | [#632](https://github.com/osdlc/osdlc/pull/632) | typed-gh: `prActivity`                       | ready    | Nothing                                                                  |
| 27    | [#634](https://github.com/osdlc/osdlc/pull/634) | wayfinder: hand a skill to an agent CLI      | ready    | Update the branch by hand: pr-update's push was rejected                 |
| 28    | [#786](https://github.com/osdlc/osdlc/pull/786) | file-lock: a holder's start time             | question | One remark left for the owner                                            |
| 29    | [#691](https://github.com/osdlc/osdlc/pull/691) | `osdlc-file-lock`, the Rust twin             | failing  | The Rust checks fail. After #786, so the crate follows the same protocol |

### 7. For the owner to decide

| Order | Pull request                                    | What                                                | State    | The decision                                                                                 |
| ----- | ----------------------------------------------- | --------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| 30    | [#744](https://github.com/osdlc/osdlc/pull/744) | New package `@osdlc/agent-router` and its Rust twin | ready    | It moves a library out of sksizer/dev. 59,000 lines, reviewed there. Merging publishes 0.4.1 |
| 31    | [#672](https://github.com/osdlc/osdlc/pull/672) | New package `@osdlc/story-harness`                  | question | It moves a library out of sksizer/dev. Three open questions in its description               |
| 32    | [#514](https://github.com/osdlc/osdlc/pull/514) | Standard: document a feature when it is added       | question | Two questions. It allows standards that review enforces, not a script                        |
| 33    | [#447](https://github.com/osdlc/osdlc/pull/447) | Principle P-0001: normalize equivalent inputs       | question | One question. It starts `docs/planning/principles/`                                          |

## What to do first

1. Merge #825, which compiles the harness knowledge data again after #823
   and #824 added and corrected answers. `corpus-schema` 0.5.0 and the first
   releases of `corpus-query` and `corpus-site` are on npm.
2. Merge the ones with nothing open: #633 and #632.
3. Answer the questions on #798, #629, #786 and #797. Each takes one decision
   and frees a pull request behind it.
4. Decide the scanner's speed on #649, which also holds #651.
5. Decide #744 and #672, since the answer is about scope, not code.
