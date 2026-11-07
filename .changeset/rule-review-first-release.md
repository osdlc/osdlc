---
"@osdlc/rule-review": minor
---

**Breaking:** first public release, as `@osdlc/rule-review` with the command `rule-review`. Review a change
against the `CLAUDE.md` and `AGENTS.md` files that govern it: one headless agent judgement per
rule file, over only the files it governs. `rule-review checks <dir>` runs a folder of
path-scoped check scripts (experimental). The package was developed, unpublished, as
`@osdlc/agent-dev` with the command `dfv`; neither name stays as an alias.

**Added**

- Rule sources come from providers. `instructionFiles()` reads `CLAUDE.md` and `AGENTS.md`, each
  governing its own directory, with `@path` imports inlined two levels deep from inside the
  repository. `discoverSources` gathers sources from every provider.
- `planJobs` pairs each source with the changed files its patterns match and splits a broad
  source into shards of at most `maxFilesPerJob` files.
- `review` judges each planned job through `@osdlc/agent-call`, read-only, against a findings
  schema (`FINDINGS_SCHEMA`, `buildSpec`). `meetsFloor` and `exitCodeFor` grade the findings.
  `estimateTokens`, `formatTokens` and `jobLabel` describe a run for a dry-run report.
- `reviewChanges(options)` reads the changeset, the rule sources and the diffs from a checkout and
  runs the review in one call. It throws `ChangesetError` (`kind` `not-a-repository` or
  `bad-base`) when it cannot start.
- `changedFiles`, `stagedFiles`, `trackedFiles`, `fileDiffs`, `resolveBase` and `defaultBase`
  read the changeset from git. Each takes a directory path or a `Git` from `@osdlc/typed-git`.
- `ScopeError`: a scope or `--exclude` pattern the matcher cannot read stops the run and names
  the pattern. The command exits 2.
- `signal` on `review` and `reviewChanges`: aborting kills every running agent. The command
  forwards SIGINT and SIGTERM and exits 130.
- `--strict` exits 2 when a judgement could not complete.
- `rule-review --version` prints the version. `rule-review dev` and `RULE_REVIEW_HOME` run the
  command from a development checkout.
- `rule-review checks <dir>`, and the experimental check-folder exports, run a folder of numbered
  check scripts selected by the changeset.

**Changed**

- Breaking: `verify` is `review`, and `VerifyConfig`, `VerifyJob`, `VerifyRun` and
  `VerifyOptions` are `ReviewConfig`, `ReviewJob`, `ReviewRun` and `ReviewOptions`.
- Breaking: no longer exported: `selectByScope`, `ScopeEntry`, `ScopeSelection`,
  `parseFindings`, `mergeFindings`, `BYTES_PER_TOKEN`, `gitFileLister`, `parseCheckName`,
  `parseTimeoutHeader`, `parseAppliesToHeaders`, `nameSkipReason`, `compareChecks`, `checkEnv`,
  `DEFAULT_SCOPE`, `PROMPT_UNSUPPORTED`, `formatDuration`, `checksMain` and `CHECKS_USAGE`.
- Breaking: `DEFAULT_CONFIG` is frozen. Spread it to change a field.
- Breaking: `Changeset` is `{ files: readonly string[]; base: string }` and is what `planChecks`
  and `RunChecksOptions.changeset` take. The check-folder exports are marked `@experimental`.
- Breaking: the package ships compiled ESM only and runs on Node.js
  `^22.22.2 || ^24.15.0 || >=26.0.0`. The `bun` export condition is gone.
- `review` refuses an unknown engine before any agent starts. The command refuses one as a usage
  error.
- A reply that is not a findings object fails its judgement and marks the run incomplete, instead
  of reading as clean.
- Scope patterns match dot paths, so `**` covers `.github/` and `.env`.
- A renamed file is listed under its old path as well as its new one.
- `rule-review checks` no longer passes deleted files to check scripts.
- `ChangesReview` is named `ReviewChangesResult`. `FINDINGS_SCHEMA` and `SEVERITY_ORDER` are frozen.
- `AgentCallSpec` and `AgentResult` are re-exported, for a custom `Dispatch`.
- `--json` prints the whole run, with `projectRoot`, `changedFiles` and `config`, also when
  nothing changed.

**Fixed**

- `defaultBase` answers `main`, or `master` when only that exists, in a repository with no
  `origin/HEAD`, instead of throwing.
- A changeset can be read before the first commit, so a pre-commit hook does not block it.
- A changed path is read literally, so `pages/[id].vue` is a name and not a character class, and
  a directory named `[id]` scopes to itself.
- A tracked file whose name only ends in `CLAUDE.md` or `AGENTS.md`, such as `SUBAGENTS.md`, is
  not a rule source.
- `@path` imports within the depth limit are inlined whatever their order.
- Findings from two sources at the same depth no longer interleave.
- A `CLAUDE.md` symlinked to, or importing, its sibling `AGENTS.md` is judged once.
- A conflicted path appears once in `trackedFiles`.
- A path git cannot render is left out of `fileDiffs`, and a diff that fails stops the run with
  exit 2 instead of a stack trace.
- A `configFor` that throws rejects the run before any agent starts. A job that rejects aborts
  the jobs still running, and an aborted run starts no more agents.
- A `concurrency` of `NaN` runs one judgement at a time instead of none.
- A check script's headers are read from its first 4 KiB without reading the whole file.
- After an abort, `runChecks` no longer reports skip rows for files that never had a turn.
- `--concurrency` and `--max-files` refuse `1.5`, `1e2` and `0x10`.
- A `-C` directory that does not exist exits 2 as a usage error.
