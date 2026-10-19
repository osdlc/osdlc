# Publishable library quality bar

A library meets every row before its first public release, and keeps meeting it after. A row
it cannot meet is a recorded exception in its README or CHANGELOG, not a silent gap.

Each row is stated for any language and any registry. The checks for one ecosystem are in its
own file beside this one ([rust](rust.md), [npm](npm.md)). To add a language, add one file
that maps every row below to a check.

## Verdicts

An audit gives each row pass, gap, blocker, n/a or owner. A **blocker** is a row whose failure would
ship something broken, misleading or impossible to withdraw, or would leave no way to release by the
normal path. **owner** means the audit cannot grade the row, because the answer is the owner's
choice and not a checkable fact, or because the package makes a choice that departs from a stated
default (for example a custom licence), or because the target home's documented process
conflicts with the row. The report gathers these rows into owner questions, each with a
recommendation; a conflict names both paths.

## Row ids

Row ids are fixed once published. A new row is appended with a new id. A retired row keeps its
id and is marked retired. Rows are never renumbered.

## Audit target

The audit checks what the release pipeline packs, packing the way the release workflow does,
not the source manifest alone. The report states which artifact it audited. When the package is
not in its target home yet, the audit packs the current manifest with the home's pack and check
commands, says so, and adds the move as a fix item.

## Source tags

The tags on the rows here and on the steps in [process](process.md) say where each came from.
They are a review aid for the prototype, and are removed before the skill is final, since
they name ids in the repo it was written in.

- `[bar]`: Publishable library quality bar (S-0022).
- `[lesson]`: a lesson listed in Finalize S-0022 with the lessons from command-seam's first
  release (T-2T38).
- `[owner]`: added at the owner's request during the prototype review.
- `[new]`: added with this skill.

## Rows

Each row states what is graded. The file in the last column explains how, where it needs more
than the ecosystem checks.

| Row | Requirement | Explained in |
|---|---|---|
| Q1 Name | The name is free on every target registry and on the code host, and no name looks, sounds or reads like it; the checks are dated. It is the Name gate's evidence. `[owner]` | [process](process.md) `name-survey`, sign-off gates |
| Q2 Purpose | The README opens with the problem, who it is for, and when not to use it, before any API. `[bar]` | |
| Q3 Prior art | The README or docs compare it with the main alternatives, the owner's own libraries included, and say why it exists anyway. `[bar]`, owner's libraries `[owner]` | [process](process.md) `prior-art` |
| Q4 API surface | Every public item is intended, typed where the language allows, named consistently and documented; no internal helper is public; a public error or option type can grow without breaking callers. It is the API gate's evidence. `[bar]`, error type `[new]`, API gate `[owner]` | [api-review](api-review.md) |
| Q5 Stability tiers | Each public item's tier is declared in its docs, the README lists the items that are not stable, and a test checks that the list and the markers agree. `[lesson]` | |
| Q6 Functional tests | Tests cover each public item's behaviour and error paths, and coverage is reported. `[bar]` | |
| Q7 Contract tests | Each behavioural claim in the README has a test that proves it. `[bar]` | |
| Q8 Usage tests | Every stable public item has at least one runnable example that uses only the public entry; the test suite runs the examples, and README snippets come from them. `[bar]`, per-item examples `[owner]` | [api-review](api-review.md#examples) |
| Q9 Test reliability | The suite passes on repeated runs; a test that measures time warms up first or allows a margin. `[lesson]` | |
| Q10 Docs | Install, quick start, an API reference or a pointer to one, and a CHANGELOG. Runtimes and platforms are graded under Q11 and Q12. `[bar]` | |
| Q11 Runtimes | The supported runtimes and the oldest supported version are declared in the manifest, the tests pass on each, and a CI job runs them on the oldest. `[bar]`, `[owner]` | |
| Q12 Platforms | Supported operating systems are stated, behaviour off them is documented or guarded, and tests run on each. `[bar]` | |
| Q13 Package contents | What ships is exactly what is intended, and the packed artifact builds, installs and works in a clean consumer with every dependency from a public registry. `[bar]` | |
| Q14 Package metadata | The registry entry has a description, licence, repository, docs link, keywords and categories, and every URL resolves for an anonymous request. A failing URL is a blocker where the registry keeps each version's metadata as published. `[new]` | |
| Q15 Independence | Nothing in code, comments, README, CHANGELOG or tests refers to the source repo: no internal ids, paths, tool names, wikilinks, app names or call sites. `[bar]` | |
| Q16 Licence | The licence is an SPDX expression, the files it names ship and agree with it, and no code is copied without compatible terms. The default is `MIT OR Apache-2.0`; any other expression is owner, and a custom or non-SPDX one also fails consumers' licence checks. `[bar]`, `[owner]` | |
| Q17 Security | Injection surfaces, temp files and file permissions are reviewed, a SECURITY file names a reporting route, and dependencies have no known advisories. `[bar]` | |
| Q18 Versioning | Semver, with the first version chosen by the version replay; 0.x until the evidence supports 1.0; from the second release on, a tool checks breaking changes where the ecosystem has one. `[bar]` | [version-replay](version-replay.md) |
| Q19 Changelog release entry | Graded as the changelog reference says. `[lesson]` | [changelog](changelog.md#release-entry) |
| Q20 Community | A CONTRIBUTING file says where changes go and whether pull requests are taken. `[bar]` | |
| Q21 Public decisions | The package keeps short public design-decision notes for outside readers, with no audit text and no internal ids. `[lesson]` | [process](process.md) `decisions` |
| Q22 Publish path | The first real version publishes through the release workflow on the same path as later releases, by an accepted first-publish route, then switches to trusted publishing; dependents release in order; the registry's withdrawal route is known. `[lesson]`, `[owner]` | [process](process.md) `release` |
| Q23 Unsafe code | Unsafe escape hatches are forbidden in the build, unless each one is justified and documented where it is used. `[owner]` | |
| Q24 Twin parity | Conditional: n/a when the package has no twin in another language, or is a binding built from the other's source (one implementation). Otherwise a behaviour change ships in both twins in the same PR, or in a linked PR in the twin's repo, or the PR says why not; behaviour driven by data shares one parity fixture that both test suites read; the twins share major.minor (a minor or major bump in one bumps the other, released together (in the same PR, or a linked PR in the twin's repo), even with no code change there; patch versions are independent); and each CHANGELOG names the twin version it matches. `[owner]` | [api-review](api-review.md#twin-parity) |

## Rules for API work

A process rule, not a row. The audit checks only that its evidence exists.

- An API addition or change starts from an example of the code a user would write, and is
  judged by how that code reads. `[lesson]`

## Anti-examples

- A README that starts with a code block and never says what problem the library solves.
- A comment that cites an internal task id or names the app that calls the function.
- A suite that passes only under one runtime while the manifest claims another.
- An example that imports from a source file instead of the package entry.
- A manifest whose entry for one runtime points at source that runtime cannot load once
  installed.
