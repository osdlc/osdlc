# The pull request queue

Every open pull request in osdlc/osdlc, whether it is still wanted, and the
order to merge them in. Read on 2026-11-14, with 33 open. Update a row when
its pull request merges or closes, and delete this file when the queue is
short enough to read on GitHub.

Merged since: #802, #801, #803, #783, #787, #785 and #805 (2026-11-14). The
order numbers below are as first written.

## Summary

- **All 33 open on 2026-11-14 were still wanted.** None is replaced by work already on `main`.
- **Three need work before review:** #649 and #650 were overtaken by
  releases, and #740 by a change to the CI workflows.
- **Three have failing checks:** #691, #650 and #651.
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

Both are built on `loadCorpus` (#805, merged) and now point at `main`. These
are the first new packages built on what was brought back.

| Order | Pull request                                    | What                              | State | Before it merges                                                                    |
| ----- | ----------------------------------------------- | --------------------------------- | ----- | ----------------------------------------------------------------------------------- |
| 6     | [#806](https://github.com/osdlc/osdlc/pull/806) | New package `@osdlc/corpus-query` | ready | Review findings are answered. Its npm placeholder. It edits `cli-tool`: see group 6 |
| 7     | [#807](https://github.com/osdlc/osdlc/pull/807) | New package `@osdlc/corpus-site`  | ready | Review findings are answered. Its npm placeholder. 16,700 lines: the largest review |

Neither package is on npm yet. Each needs its placeholder version and trusted
publisher before it merges, as `packages/README.md` describes: the release
stops on a package npm does not know.

### 3. The markdown libraries

All three were written before releases that changed their base.

| Order | Pull request                                    | What                                                              | State   | Before it merges                                                                                                                                                  |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8     | [#649](https://github.com/osdlc/osdlc/pull/649) | `markdown-link`: indented code, math, raw HTML, autolinks as code | rework  | It conflicts in the crate and the lockfile. It is titled 0.9, and 0.9.0 is released with other changes, so it becomes the next minor. skillwright needs it (#638) |
| 9     | [#651](https://github.com/osdlc/osdlc/pull/651) | `markdown-link`: link titles, parentheses, every relative link    | failing | Stacked on #649. Update it after #649 is reworked, then point it at `main`                                                                                        |
| 10    | [#650](https://github.com/osdlc/osdlc/pull/650) | `markdown-corpus`, `markdown-vault-fs`: four edge cases           | rework  | Its base, #648, merged on 2026-11-08 and was released. Point it at `main`. Its breaking change now needs vault-fs 0.7.0 and corpus 0.4.0, as its own note says    |

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

| Order | Pull request                                    | What                                              | State    | Before it merges                                                                                   |
| ----- | ----------------------------------------------- | ------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| 19    | [#631](https://github.com/osdlc/osdlc/pull/631) | `survey` and `update` on cli-tool's command model | ready    | No open questions                                                                                  |
| 20    | [#736](https://github.com/osdlc/osdlc/pull/736) | Attempts and the update lease on git refs         | question | Five design questions. After #631: same package                                                    |
| 21    | [#740](https://github.com/osdlc/osdlc/pull/740) | CI: less load from pull requests                  | rework   | It conflicts: `verify` moved into the shared `ts-packages-ci.yml`, which cannot express its change |

#740 is worth doing early if the queue is merged quickly: every merge to
`main` pushes into every open pull request and starts its CI again.

### 6. One package each

Independent of each other, apart from the pairs marked. All have had a review
pass.

| Order | Pull request                                    | What                                           | State    | Before it merges                                                         |
| ----- | ----------------------------------------------- | ---------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| 22    | [#629](https://github.com/osdlc/osdlc/pull/629) | cli-tool: text and choice prompts              | ready    | Nothing. Before #636 and #806, which also edit `cli-tool`                |
| 23    | [#636](https://github.com/osdlc/osdlc/pull/636) | cli-tool: devlink runs a checkout under node   | ready    | Update the branch by hand: pr-update's push was rejected                 |
| 24    | [#630](https://github.com/osdlc/osdlc/pull/630) | typed-git: `hashObject`, `mktree`, `updateRef` | question | One question                                                             |
| 25    | [#633](https://github.com/osdlc/osdlc/pull/633) | typed-git: exact bytes with `rawBytes`         | ready    | After #630: same package                                                 |
| 26    | [#632](https://github.com/osdlc/osdlc/pull/632) | typed-gh: `prActivity`                         | ready    | Nothing                                                                  |
| 27    | [#634](https://github.com/osdlc/osdlc/pull/634) | wayfinder: hand a skill to an agent CLI        | ready    | Update the branch by hand: pr-update's push was rejected                 |
| 28    | [#786](https://github.com/osdlc/osdlc/pull/786) | file-lock: a holder's start time               | question | One remark left for the owner                                            |
| 29    | [#691](https://github.com/osdlc/osdlc/pull/691) | `osdlc-file-lock`, the Rust twin               | failing  | The Rust checks fail. After #786, so the crate follows the same protocol |

### 7. For the owner to decide

| Order | Pull request                                    | What                                                | State    | The decision                                                                                 |
| ----- | ----------------------------------------------- | --------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| 30    | [#744](https://github.com/osdlc/osdlc/pull/744) | New package `@osdlc/agent-router` and its Rust twin | ready    | It moves a library out of sksizer/dev. 59,000 lines, reviewed there. Merging publishes 0.4.1 |
| 31    | [#672](https://github.com/osdlc/osdlc/pull/672) | New package `@osdlc/story-harness`                  | question | It moves a library out of sksizer/dev. Three open questions in its description               |
| 32    | [#514](https://github.com/osdlc/osdlc/pull/514) | Standard: document a feature when it is added       | question | Two questions. It allows standards that review enforces, not a script                        |
| 33    | [#447](https://github.com/osdlc/osdlc/pull/447) | Principle P-0001: normalize equivalent inputs       | question | One question. It starts `docs/planning/principles/`                                          |

## What to do first

1. Merge the Version Packages pull request, which holds #801's patch.
2. Publish the npm placeholders for `@osdlc/corpus-query` and
   `@osdlc/corpus-site`, then merge #806 and #807.
3. Answer the questions on #798 and #797. Each takes one decision and frees
   a pull request behind it.
4. Decide #744 and #672, since the answer is about scope, not code.
