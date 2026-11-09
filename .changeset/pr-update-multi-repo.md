---
"@osdlc/pr-update": minor
---

`update` now names the repository of every PR it reports, and asks for the verify verb list once per repository (#753).

- Each `results` entry carries `repo` (`owner/name`), and so does each `skipped` entry. `repo` is null only for a `--pr` number that no surveyed repository has. The text output names each PR `owner/name#N` once a run spans more than one repository.
- `Ports.resolveVerifyVerbs` receives `repo` and `checkout` (that repository's local checkout path) along with `which` and `trust`, so repositories that build differently can each get their own list. It is called once for each repository the run surveyed in a local checkout, all before the first update, so a list refused for one repository still stops the run before anything is pushed. A port that ignores the new fields keeps working.
- Fixed: in a run over several repositories, `update` matched PRs by number alone. A PR in a base/head cycle in one repository was dropped from `skipped` when another repository had a PR with that number. In branch mode, a PR with the same number in another repository was selected too, and could be shown with the local checkout note meant for the branch's PR.
- Each survey `repos` entry carries its own `cycles`. `selectTargets` takes a `prKey(repo, number)` string as well as a bare number in `only`.

**Breaking:** for library callers. A direct call to `resolveVerifyVerbs` must pass `repo` and `checkout`. A host's `resolveVerifyVerbs` is now called once per surveyed repository, not once per run. `selectTargets` reads cycles from each `repos[].cycles`, so a hand-built `SurveyReport` needs that field on each repository.
