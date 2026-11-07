---
'@osdlc/rule-review': minor
---

**Breaking:** first public release, as `@osdlc/rule-review` with the command `rule-review`. The package was developed, unpublished, as `@osdlc/agent-dev` with the command `dfv`; neither name stays as an alias.

Review a change against the `CLAUDE.md` and `AGENTS.md` files that govern it: one headless agent judgement per rule file, over only the files it governs. `rule-review checks <dir>` runs a folder of path-scoped check scripts (experimental). The README has GitHub Actions, GitLab CI, husky, lefthook, pre-commit and plain git hook examples.

Changes from the unpublished `@osdlc/agent-dev` 0.3.0:

- `reviewChanges(options)` is new: one call that reads the changeset, the rule sources and the diffs from a checkout and runs the review. It throws `ChangesetError` (`kind` `not-a-repository` or `bad-base`) when it cannot start.
- `verify` is `review`, and `VerifyConfig`, `VerifyJob`, `VerifyRun` and `VerifyOptions` are `ReviewConfig`, `ReviewJob`, `ReviewRun` and `ReviewOptions`.
- `DEFAULT_CONFIG` is frozen. Spread it to change a field.
- `review` refuses an unknown engine before any agent starts, instead of failing each judgement. The command refuses one as a usage error.
- `--strict` exits 2 when a judgement could not complete.
- `--json` prints the whole run, with `projectRoot`, `changedFiles` and `config`, also when nothing changed.
- `changedFiles`, `stagedFiles`, `trackedFiles`, `fileDiffs`, `resolveBase` and `defaultBase` take a directory path as well as a `Git`.
- `defaultBase` answers `main`, or `master` when only that exists, in a repository with no `origin/HEAD`, instead of throwing.
- `Changeset` is `{ files: readonly string[]; base: string }` and is what `planChecks` and `RunChecksOptions.changeset` take.
- No longer exported: `selectByScope`, `escapeGlob`, `ScopeEntry`, `ScopeSelection`, `parseFindings`, `mergeFindings`, `BYTES_PER_TOKEN`, `gitFileLister`, `parseCheckName`, `parseTimeoutHeader`, `parseAppliesToHeaders`, `nameSkipReason`, `compareChecks`, `checkEnv`, `DEFAULT_SCOPE`, `PROMPT_UNSUPPORTED`, `formatDuration`, `checksMain` and `CHECKS_USAGE`.
- The check-folder exports are marked `@experimental`.
- A `concurrency` of `NaN` runs one judgement at a time instead of none.
- A check script's headers are read from its first 4 KiB without reading the whole file.
