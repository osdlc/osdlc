---
"@osdlc/pr-update": minor
---

**Breaking:** `survey` and `update` identify every PR by repository and number, in one shape whether a run covers one repository or several (#753).

- Each `update` `results` and `skipped` entry carries `repo` (`owner/name`) next to `number`.
- Text output always names a PR `owner/name#N`, the form GitHub links, in one repository or several. The survey table's `PR` column holds it, and the separate `REPO` column is gone. The base/head cycle line names its PRs the same way.
- `--pr` accepts `owner/name#N` as well as a bare number. A bare number still selects that PR in every repository of the run. A key names one PR of one repository, which must be in the run: a key for any other repository is a usage error (exit `2`).
- `slug` is renamed `repo` everywhere: each survey `repos[]` entry, `RepoTarget`, and the target `SurveyEnv.codeHost` receives (`{ cwd, repo }`).
- `update` output carries `repos`, the same entries `survey` reports, and no longer has `repoFailures`. A repository that could not be listed has `failure` set on its `repos` entry, as in `survey`.
- Base/head cycles are listed on each `repos[]` entry as `cycles`. The top-level `cycles` is gone.
- A `--pr` selector no surveyed PR matched is listed in the new `notFound` (`#N` or `owner/name#N`), with a `notFound` count, and is no longer a `skipped` entry. Every `skipped` entry is a surveyed PR with a `repo`.
- `Ports.resolveVerifyVerbs` receives `repo` and `checkout` (that repository's local checkout) along with `which` and `trust`, so repositories that build differently can each get their own list. It is called once for each repository the run surveyed in a local checkout, all before the first update, so a list refused for one repository stops the run before anything is pushed. A port that ignores the new fields keeps working. A direct call must pass them.
- `prKey`, `parsePrKey`, `selectorLabel`, `PrSelector` and `surveyRepoSchema` are exported. `selectTargets` takes `PrSelector`s and returns `notFound` as well.
- Fixed: in a run over several repositories, PRs were matched by number alone. A PR in a base/head cycle in one repository was dropped when another repository had a PR with that number. In branch mode, a PR with the same number in another repository was selected too, and could be given the local checkout note meant for the branch's PR. A scoped run no longer runs a full `git fetch` in a repository where nothing was selected.
