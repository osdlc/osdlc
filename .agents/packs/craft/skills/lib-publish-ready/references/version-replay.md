# Version replay

How the audit picks the first public version. It is part of the `stability` step in
[process](process.md). The replay finds the version the library would have reached if every
change had been released under semver. The commands for one ecosystem are in its file, under
Gate evidence, Stable ([rust](rust.md), [npm](npm.md)).

## Strategies

`--first-version` picks the strategy. The default is `max`.

| Strategy | First public version |
|---|---|
| `max` | The highest of the current manifest version, the replayed version and the floor, by semver order, then moved up as The floor says. |
| `replay` | The replayed version, moved up as The floor says. |
| `current` | The current manifest version, moved up as The floor says. |
| `reset` | `0.1.0`, moved up as The floor says: the floor itself when one exists. |
| `X.Y.Z` | That version, the owner's explicit choice. Below the floor, the chosen version stays `X.Y.Z`, the reason says `below floor`, and Q18 gets an owner question (see Rules for the choice). |

The replay runs for every strategy, since the Stable gate and the `replay` changelog use it.

## The floor

The first public version must not collide with, or fall behind, what is already public for this
library. A registry refuses a number the name already holds, and a lower number under a new
name confuses users who knew the old one. The floor is the highest version found under:

- any earlier name or scope of the library, for example `@<old-scope>/<name>` on npm or an older
  crate name on crates.io;
- the current name on every target registry;
- the release tags of any mirror repo.

The chosen version is at least the highest version of an earlier name, and above any version
the current name already holds or a mirror's tags already carry, since those numbers are taken.

Only a version that is, or was, public counts. A yanked, deprecated or unpublished version
still counts, since the registry keeps its number. No published version means no floor; record
`none`.

Find the earlier names and the mirrors:

1. The package's own history of renames and moves: the manifest's `name` field across
   `git log <ref> -p -- <manifest> <old dirs>/<manifest>`, with the `<old dirs>` from the
   Stable step and no `--follow`, and the names the replay's step 1 records.
2. The owner's library roster, if the project keeps one: rows and notes that give the library's
   former names, scopes or mirror.
3. The owner's code host: `gh repo list <owner> --limit 1000 --json name` for each account and
   organisation, to find a mirror repo, then `git ls-remote --tags <mirror>`. A tag without a
   release still holds its number.

Then query each name and scope on its registry, with the commands in the ecosystem file under
Gate evidence, Floor ([rust](rust.md), [npm](npm.md)). Record each name, where it was checked,
the date, and its highest version, in the report's Version section. A name that looks unrelated
but the history shows was this library still counts. If the chain of names is unclear, ask
the owner for it, and say which names were checked.

## Method

1. Trace the full history. List the commits that touched the package, follow the entry files'
   renames, and search for the main public item names to find earlier homes. Record the first
   commit and each move. A port of a library from another language starts at this package's
   first commit; the other library's history is Stable evidence only.
2. List the public API: what the manifest's entry points expose, followed through re-exports.
   The ecosystem file says where to look.
3. Make one row per release unit. A release unit is one commit on the default branch's
   first-parent line. PRs merged into an integration branch count together, at the merge that
   brought them onto the default branch. For each commit:
   - Find its unit: the commit itself if it is on the first-parent line. Otherwise the oldest
     first-parent commit that has it as an ancestor: take
     `git rev-list --ancestry-path <sha>..<default branch>`, keep the commits that are also in
     `git rev-list --first-parent <default branch>`, and pick the oldest. (`--first-parent`
     together with `--ancestry-path` prints nothing for a commit off the first-parent line.)
     Where the `sdlc lib history <dir> --json` command is available (experimental), it does
     this mechanically; the recipe is the fallback.
   - Name the unit by its PR: the number in its squash or merge subject, or
     `gh api repos/<owner>/<repo>/commits/<unit sha>/pulls --jq '.[0].number'`. Ask about the
     unit, never the inner commit, which names a child PR. A unit with no PR is named by its sha.
4. Check the existing CHANGELOG against the rows. An entry with no row is traced to a commit; if
   it traces, add the row, and if it does not, list it as unverified.
5. Classify each row by its effect on the public API or documented behaviour:
   - **breaking**: an item removed or renamed, a signature changed incompatibly, a default or
     documented behaviour changed so existing callers break, or a required runtime or peer
     dependency raised. A behaviour change that breaks callers reading a field is breaking.
   - **feature**: a new item, a new optional parameter or option, or a new capability.
   - **fix**: a bug fix, a performance change, or a refactor that keeps the API.
   - **none**: tests, docs, formatting or build config only.
6. When a class is in doubt, read the diff. If doubt remains, mark the row `uncertain`, keep the
   class that fits best, and record the version the other class would give.
7. Replay. Start at `0.1.0` at the first commit where the package had a usable public API; earlier
   rows fold into it. Walk the rows in date order, up to the cut (below). A breaking row bumps the
   minor version (`0.N.x` to `0.N+1.0`). A feature or fix row bumps the patch version. A row
   bumps once, by its largest change. A `none` row does not bump. The last version is the
   replayed version.
8. Record the stability figures: the length of the history, the date of the last breaking
   change, and the breaking rows in the last 30 and 90 days.
9. Find the floor as above, and choose the first public version by the strategy and the rules below.

The replay stays in 0.x. Do not inflate: a refactor that keeps the API is a fix. The Stable gate
recommends 1.0 only when all of these hold, and the owner sets it with `--first-version 1.0.0`:

- no breaking change in the last 90 days, in a history at least 90 days long;
- at least two consumers;
- the API gate's sign-off is recorded, or asked for in the same report.

## The cut

The cut is the commit the first audit ran on. A re-audit reads it, and the chosen version, from
the previous report, and keeps both unless `--first-version` is given.

Rows after the cut do not bump. They are the fixes and the API changes agreed at the API review,
made to get ready for the first release. They belong to the first public version and go in its
Unreleased entry. A rename or removal agreed at the API review is a breaking change, but no
version with the old API was ever public, so it costs no bump.

## Rules for the choice

- The chosen version follows The floor. When the strategy's own result does not, the floor
  rule wins and the reason says `floor` with the name and registry or mirror that set it.
- An explicit `X.Y.Z` that breaks The floor stays `X.Y.Z`. Q18 gets an owner question that names
  the version and the floor, and recommends the floor or the next version above it.
- Release mode (`--release X`): the chosen version is X. When the strategy gives another
  version, add an owner question naming both, and no fix item. When X breaks The floor, the
  question also names the floor.
- A chosen version of 1.0.0 or higher, from any strategy but an explicit `X.Y.Z`, gets an owner
  question under row Q18. Recommend the replayed 0.x version, or the floor if that is higher,
  unless the Stable gate supports 1.0. Skip the question when the floor alone made the version
  1.0.0 or higher. A manifest left at a scaffold default, such as `1.0.0`, is the usual cause.
- An uncertain row that changes the chosen version gets an owner question.
- Twins (row Q24): an explicit `--first-version X.Y.Z` or `--release X` wins. When alignment
  would change that version, keep it and add an owner question under Q24 that names both
  twins' versions. When alignment would lift a twin to 1.0.0 or higher, also ask the Q18
  question above.

## Twins

Twins (row Q24) share major.minor. A minor or major bump in one twin bumps the other, released
together (in the same PR, or a linked PR in the twin's repo), even when the other has no code
change. Patch releases are independent, so a twin with no change needs no patch release.

The twin's input is its highest public version when it has one. Otherwise run the same
strategy, floor and manifest steps on the twin's own history. A one-package audit does this for
the twin too, only to read its version; it writes nothing there. Then both take the higher
major.minor of the two. Each keeps its own patch, and a twin whose major.minor was raised resets
its patch to 0. Record both inputs and the aligned result in the Version section's `Twin:` line.

Example: twin A computes `0.2.1` and twin B computes `0.1.0`. The higher major.minor is `0.2`.
A stays `0.2.1`. B moves up to `0.2.0`, with the line `Aligned with A 0.2.1.` from
[changelog](changelog.md).

## Table

The report's Version section holds one table row per replay row, `none` rows included:

```markdown
| Change | Date | Class | Summary | Version after |
|---|---|---|---|---|
| <PR or short sha> | <date> | <class, and uncertain if so> | <what changed, for a consumer> | <version> |
```

The table is private audit evidence. It may name source paths and private PRs. The
[changelog](changelog.md) draft is built from it and sanitized.
