# Taking a library public

The steps from "we have a library" to "it is published and maintained". Each step has a stable id in
its heading. Cite a step by its id, never by its position. Each step says what it reads, what it
does, what it produces, and which gates block it (its `Gate:` line). The owner decides every gate.

The readiness audit, `/skill:craft-lib-publish-ready`, is the `audit` step. It also runs
`name-survey`, `prior-art`, `stability` and `home` for its package, and gathers the API
inventory that `api-review` reads.

After `audit` the work runs on two lines at once, then joins:

```text
audit
  |
  +-- owner line ---------------+-- agent line ----------------
  | api-review                  | bug-scan
  | decisions                   | fixes-safe
  |                             | move
  +-------------- join: both lines done ------------
fixes
move-ready
===== --autonomy-to stops here at the latest =====
release
cutover   (a separate run, after release)
promotion
```

The gates that block each step are in [Gates](#gates). `release` and `promotion` are always a
person's call. `cutover` needs the published package, so it is a separate run after
`release`.

To add a step, insert a section where it belongs, give it a new id and the same four lines.
The order of the sections is the order of the work. The tags after each heading are defined
in [quality-bar](quality-bar.md#source-tags).

## Model and effort per step

For whoever drives the release: the session or caller that runs this skill and the fixes. The
audit skill spawns nothing. Tier names follow the Claude family; map them to your harness's
small (haiku), mid (sonnet) and large (opus) models. The aim is to keep token use down.

Effort is medium unless noted.

| Work | Model |
|---|---|
| The driving session. It delegates and does no deep reads itself. | sonnet |
| Mechanical checks: pack, publint, attw, test runs, registry lookups, grep counts, clean rebases (low effort) | haiku |
| Evidence for the report: API inventory, git history, consumer search, prior-art search | sonnet |
| Audit and re-audit | sonnet |
| `bug-scan`: a correctness review of the package, for edge cases, error paths, races and platform behaviour (medium effort) | opus |
| `fixes-safe`: only the items tagged `safe` | sonnet |
| `move` and `move-ready`: the draft PR in the home repo, then marking it ready | sonnet |
| Judgment: gate verdicts, version choice, owner questions with recommendations, the API review page | opus |
| Fixes that are well specified, and conflict rebases | sonnet |
| Fixes that change public API design | opus |
| Independent review of a docs, data or tracker PR | sonnet |
| Independent review of a code or public-API PR | opus |

`release` and `promotion` are not delegated. A person decides them. `cutover` runs on its own
after `release`.

- Use high effort for judgment only when the public API is large or contested.
- Give each subagent only the files and facts its step needs, not the whole report.
- Prefer one subagent per step over one long-running agent.
- Stay within the harness's parallel-agent limit.
- If a cheaper tier fails a step twice, move that step one tier up. Leave the other steps.

## Gates

| Gate | Decided by | Blocks |
|---|---|---|
| Worthwhile | The owner | Everything after `audit`. A "do not publish" or "merge into X" ends the run. See [Alternatives gate](#alternatives-gate). |
| Name | The owner, as a sign-off | `fixes` and `move-ready`. `move` goes ahead under the current name; a rename is cheap while the PR is a draft. |
| API | The owner, as a sign-off | `fixes` |
| Stable | The owner | `fixes`, which sets the first version |
| Home | The owner | `move-ready`. `move` goes ahead in `--home` or the audit's recommended home; a different home redoes `move`. |
| Ready | The re-audit: no blocker, every gap fixed or recorded | `move-ready` |
| Release | A person | `release` |
| Cutover | The owner, by merging the PR the `cutover` step produces | The consumer switching to the published package |
| Promote | A person | `promotion` |

## Alternatives gate

It is part of the Worthwhile gate. It sits between `audit` and every step after it, except
`decisions`, which may run to record the answer.

`prior-art` records every candidate: each existing library that covers the same job, outside
or in the owner's own libraries. A candidate is suitable when a consumer could use it instead
of ours for the library's core job, and it meets the minimum below.

- Licence: OSI-approved, and usable as a dependency under our licence.
- Maintenance: a release or a merged commit in the last 12 months, and no open security issue
  left unanswered. The evidence is dated, like the name survey.

A candidate that fails the minimum is recorded as not suitable, with that reason.

- A candidate is suitable: the run stops after `audit`. The owner must answer. Nothing else
  is moved, fixed or published until the answer is recorded.
- No candidate is suitable: the report says so, with the evidence per candidate (what it
  lacks). No gate.

The answer is one of `continue`, `adopt <candidate>` or `drop`, plus the reason.

- Record it as a public decision (`decisions`), like a sign-off. A `continue` names the
  candidates it weighed and why ours is still worth having. The reason carries no audit text.
- `continue` lets the run go on. `adopt` and `drop` end it.
- Only the owner answers. `--autonomy-to` and every other driver setting cannot skip or
  assume the answer, and a driver never infers `continue` from silence.
- The report shows the answer as recorded or pending, and asks until it is recorded. A
  re-audit looks for the recorded answer in the decision notes and keeps it unless a new
  suitable candidate appears.

## Fix-list tags

The `audit` tags each fix item `safe` or `needs-decision`.

- `safe`: one reasonable answer, and no effect on design or API. For example: a missing LICENSE
  file for a licence already set in the manifest, a SECURITY or CONTRIBUTING file, package
  metadata, a README section, a missing example or test, a mention of the source repo or an
  internal id, and a bug fix that changes no public name, signature or behaviour.
- `needs-decision`: a rename, hiding an item or marking it experimental, the first version, the
  licence choice (which licence, when the manifest sets none), anything that touches an item
  flagged on the API review page, and a bug fix that changes public behaviour.

Findings from `bug-scan` join the fix list with a tag in the same way.

## Drive a release

For whoever drives the release. The audit skill spawns nothing. The driver runs the steps in
order, runs the two lines after `audit` at the same time, and joins them before `fixes`.

`--autonomy-to <step-id>` names the last step on the agent line that the driver runs before
it stops and reports. The default is `move`. The owner line is not driven by the agent. From
`audit` on, the review page is served and the questions are posted, and the owner answers
whenever. Each value implies that every earlier agent-line step ran.

| Value | Agent-line steps run | The driver stops when |
|---|---|---|
| `audit` | `audit` | The report is written. The questions are posted. |
| `bug-scan` | `audit`, `bug-scan` | The bug scan is done. |
| `fixes-safe` | `audit`, `bug-scan`, `fixes-safe` | The safe fixes are done. |
| `move` | `audit`, `bug-scan`, `fixes-safe`, `move` | The draft PR is up in the home repo. The review page waits for the owner. |
| `fixes` | the above, then `fixes` | The owner's answers are applied and the re-audit is done. The driver waits at the join for the answers `fixes` needs. |
| `move-ready` | the above, then `move-ready` | The PR is marked ready to merge. This is the highest allowed value. |

The [Alternatives gate](#alternatives-gate) stops the driver after `audit` for every value.

Otherwise values up to `move` never wait for answers. `fixes` and `move-ready` wait at the
join, and `move-ready` also waits for the Name and Home sign-offs.

`release`, `cutover` and `promotion` are not allowed values.

`--home <owner/repo or path>` is the repo the library moves to. The default is the project's
documented library home. If the project has none, `move` uses the home the audit recommends
and the driver raises the home as an owner question. When `--home` is set, the `home` step
checks the choice against the consumer evidence instead of recommending one. If the evidence
disagrees, that becomes an owner question. The `move` draft PR opens in the home repo, and its
body says the name and home are not signed off yet.

## Sign-off gates

The Name and API gates are hard to undo after release, so each needs the owner's sign-off.

- The gate passes only when the sign-off is recorded as a public decision (`decisions`). The
  evidence alone never passes it.
- The Name sign-off names the chosen name. The API sign-off names the version it covers and
  the changes agreed.
- A sign-off carries no survey or audit text.
- The report shows each as recorded or pending, and asks for it until it is recorded.

## `name-survey`: name survey `[owner]`

- Reads: the candidate name, the target registries, the code host.
- Does:
  - Exact conflicts: the name on every registry the library will publish to, scoped and
    unscoped where the registry has scopes, and on the code host as a user, organisation or
    repository.
  - Confusing overlaps: names that look alike (other separators, plurals, near spellings),
    names that sound alike, well-known projects with similar names, and packages in the same
    domain whose names could be mistaken for this one.
  - Registries of other languages the library might reach later.
  - A web search for projects or companies in the same space using the name.
  - The registry checks and name rules for each ecosystem are in its file. Domains and social
    handles are out of scope unless the library gets a docs site (`promotion`).
- Produces: a dated table of conflicts and overlaps, a keep-or-rename recommendation, and an
  owner question asking to sign off on the chosen name. Trademark risk is noted, not judged.
- Gate: none.

## `prior-art`: prior-art survey `[owner]`

- Reads: the library's purpose and main identifiers, public registries, and the owner's own
  repos.
- Does:
  - Outside: search the target registries by keyword and category, curated lists for the
    ecosystem, and the web, for libraries that solve the same problem. The ecosystem file
    names the registry searches.
  - Inside, duplicated code: search the owner's repos for code that does the library's job
    by hand, for example by grepping for its main identifiers and operations, or with
    `gh search code --owner <owner> <term>` for each owner.
  - Inside, overlapping libraries: list the owner's other libraries and mark any whose
    purpose overlaps this one. `gh repo list` shows one owner at a time, so run it for every
    account and organisation the owner has (an input to the audit), and read the package
    folders of the repos that hold several libraries.
  - One table row per hit: what it is, the overlap, and what to do about it.
  - For each candidate, outside or inside, record: what it covers, what it lacks, licence,
    maintenance (last release, activity, with dates), fit, and whether it is suitable as the
    [Alternatives gate](#alternatives-gate) defines.
- Produces: the table, the candidate record, and one recommendation: publish, merge with
  another library, contribute upstream instead, adopt an alternative, or do not publish. With a
  suitable candidate, it also raises the Alternatives gate owner question.
- Gate: none.

## `stability`: stability evidence `[bar]`

- Reads: the git history of the public items, and for the floor the target registries, the
  project's library roster and the code host's repos and tags.
- Does: the [version replay](version-replay.md).
- Produces: the replay table, the last breaking change, a version-line recommendation (0.x or
  1.0), which items are stable, and the first public version.
- Gate: none.

## `home`: home evidence `[bar]`

- Reads: the consumers in the owner's repos.
- Does: counts consumers, the public items each uses, and how often a library change came
  with a consumer change. The commands are in the ecosystem file, under Gate evidence.
- Produces: a recommendation for where the library is developed and released from, and with
  which sibling libraries.
- Gate: none.

## `audit`: readiness audit `[bar]`

- Reads: the package, the quality bar, the ecosystem file.
- Does: runs `/skill:craft-lib-publish-ready <package dir>`.
- Produces: the readiness report with its API inventory, owner questions, a tagged fix list
  ([Fix-list tags](#fix-list-tags)) and the [CHANGELOG draft](changelog.md). Where the report
  lives is in [After the audit](../SKILL.md#after-the-audit).
- Gate: none.

## `api-review`: public API review `[owner]`

- Reads: the report's API section and the API owner questions.
- Does: the owner reviews every public item and its example, and answers each flagged item:
  keep, rename, hide or mark experimental. The review is described in
  [api-review](api-review.md).
- Produces: the agreed changes, which `fixes` lands, and the API sign-off. This is the owner
  line; it runs while the agent line works.
- Gate: Worthwhile.

## `decisions`: owner decisions `[lesson]`

- Reads: the owner questions.
- Does: the owner answers each one.
- Produces: a short public note for each owner answer that changes the design or the name,
  and for each sign-off. A note states the decision, not the audit finding. Notes live in the
  package's decisions folder, `<package>/decisions/` by default, or as decision entities in the
  package's own planning folder (bar row Q21).
- Gate: Worthwhile, except that it may run to record the Alternatives gate answer.

## `bug-scan`: bug scan `[lesson]`

- Reads: the package source and tests, and the fix list.
- Does: reviews the package for correctness: edge cases, error paths, races and platform
  behaviour. This is the agent line; it runs while the owner line works.
- Produces: findings added to the fix list, each tagged as
  [Fix-list tags](#fix-list-tags) says.
- Gate: Worthwhile.

## `fixes-safe`: safe fixes `[lesson]`

- Reads: the fix items tagged `safe`.
- Does: lands one change per `safe` item. It never touches an item flagged on the API review
  page. If an item turns out to need the owner, the step retags it `needs-decision` and adds an
  owner question. The step does not stop.
- Produces: the safe fixes.
- Gate: Worthwhile.

## `move`: move to the home repo `[lesson]`

- Reads: the fixes so far, and the home repo from `--home` or the `home` step.
- Does: opens a draft PR in the home repo that carries the library with the fixes so far. The
  home repo's CI runs on it early. The source copy stays in place. It does not wait for the
  Name or Home sign-off.
- Produces: the draft PR.
- Gate: Worthwhile.

## `fixes`: fixes and re-audit `[lesson]`

- Reads: the fix list, and the answers from the owner line.
- Does: runs after both lines are done. Lands the changes on the PR that `move` opened, one
  change per remaining item: the changes agreed at `api-review` and every `needs-decision` item.
  Sets the chosen first version in the manifest and puts the CHANGELOG draft in place, as
  [changelog](changelog.md#release-tools) says for the home's release tool. Then runs
  `/skill:craft-lib-publish-ready <package dir> --re-audit <previous report>`.
- Produces: a report with no blocker.
- Gate: Worthwhile, Name, API and Stable.

## `move-ready`: mark the move ready `[lesson]`

- Reads: the re-audit report and the draft PR.
- Does: marks the PR ready for the owner to merge. The owner merges.
- Produces: a PR ready to merge. This is the last step `--autonomy-to` allows.
- Gate: Worthwhile, Name, Home and Ready.

## `release`: first publish and release `[bar]`, detail `[lesson]`, rule `[owner]`

- Reads: bar row Q22 and the ecosystem file's Q22 checks.
- Does: publishes the first version through the release workflow, on the same path as later
  releases, with no special first-release tag. Then switches to trusted publishing. Sibling
  packages release in dependency order.
- First-publish routes, for a registry that cannot yet trust CI for a new package:
  - a one-purpose credential held in a protected environment (required reviewer, main only);
  - where the registry needs a person, a person uploads the verified artifact the workflow
    built;
  - the home's own documented placeholder route: a person publishes a placeholder pre-release
    that holds a real build, adds the trusted publisher, and CI then publishes the real first
    version with provenance. It is accepted because the real first version still goes through
    CI, and a home whose publish workflow refuses unknown packages has no other way in.
- Produces: the published version, verified from a clean consumer.
- Gate: Worthwhile and Release.

## `cutover`: cut over to the published package `[lesson]`

- Reads: the published version.
- Does: runs as a separate run after `release`. Opens a PR in the consumer repo that switches
  it to the published package and deletes the local copy.
- Produces: the cutover PR. When the owner merges it, consumers use the published package and
  no local copy remains.
- Gate: Worthwhile.

## `promotion`: promotion `[bar]`

- Reads: the `prior-art` table and the audience.
- Does: picks README only, a docs site, or a docs site and announcements.
- Produces: the promotion decision.
- Gate: Worthwhile and Promote.
