# Changelog

## Unreleased

- First version. Runs `@osdlc/pr-update` over open PRs (merge strategy by
  default), skipping forks and PRs with a skip label, with an optional claude
  repair for conflicts, a persisted failed-attempt record, a conflict label and
  one comment per head and base, a job summary, and a summary comment for a
  single PR.
