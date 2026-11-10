# Changelog

## Unreleased

- The summary reads the report shape of `@osdlc/pr-update` 0.10 as well as
  earlier ones: a repository that could not be listed is read from its `repos`
  entry as well as from `repoFailures`, and a `--pr` that matched no open PR
  from `notFound` as well as from `skipped`.

- PRs authored by a bot (release-plz, Changesets) are excluded, with the reason
  "bot-authored (the bot maintains the branch itself)". New input
  `include-bots` (default `false`) opts back in; a PR named by `pr` is still
  updated.

- A PR updated after the repair agent fixed a conflict gets one comment per
  merge commit with the repaired files, the agent's note, a merge commit link
  and the `git show --remerge-diff` resolution. Deterministic resolution and
  clean updates stay silent.

- First version. Runs `@osdlc/pr-update` over open PRs (merge strategy by
  default), skipping forks and PRs with a skip label, with an optional claude
  repair for conflicts, a persisted failed-attempt record, a conflict label and
  one comment per head and base, a job summary, and a summary comment for a
  single PR.
