# @osdlc/rule-review

## History before the first public release

These versions were never published. They are rebuilt from the git history, under the
development name `@osdlc/agent-dev` and the command `dfv`.

### [0.3.1] - 2026-10-18 (unpublished)

#### Fixed

- The error text of a failed judgement carries more detail. A nonzero exit joins the parser's
  text and the stderr tail, and a caller abort reads `aborted by the caller`.

### [0.3.0] - 2026-10-17 (unpublished)

#### Changed

- Breaking: `defaultBase`, `resolveBase`, `changedFiles`, `stagedFiles`, `trackedFiles` and
  `fileDiffs` take a `Git` from `@osdlc/typed-git`.

### [0.2.5] - 2026-10-14 (unpublished)

#### Fixed

- `dfv checks` says why a script check errored: `timed out after <n>s`, `interrupted`,
  `failed to start` or `terminated by <signal>`, and the runner's own message when the script
  wrote nothing to stderr.

### [0.2.4] - 2026-10-11 (unpublished)

#### Added

- `dfv checks` selects script checks by the changeset: `--base <rev>`, `--staged` and `--all`,
  `# applies_to: <glob>` script headers, the in-scope files on stdin and `CHECK_BASE` in the
  environment. A script with no matching file is skipped with `no changed files in scope`.
- `selectByScope`, `stagedFiles` and `trackedFiles` are exported.

### [0.2.3] - 2026-10-11 (unpublished)

#### Added

- `extraArgs` in the settings: flags handed to the agent before the prompt.

### [0.2.2] - 2026-10-11 (unpublished)

#### Added

- `dfv checks` runs a folder of numbered script checks one at a time and reports a verdict for
  each.

### [0.2.1] - 2026-10-11 (unpublished)

#### Fixed

- Instruction files and their `@path` imports are read only from inside the project root.

### [0.2.0] - 2026-10-10 (unpublished)

#### Changed

- Breaking: `--engine gemini` is now `--engine antigravity`.

### [0.1.1] - 2026-09-28 (unpublished)

#### Added

- `resolveBase` is exported, and `--json` carries `resolvedBase`.

#### Fixed

- A branch ahead of or diverged from its remote is diffed against the local branch, not the
  remote's older tip. The remote is preferred only when the local branch is behind it.

### [0.1.0] - 2026-09-05 (unpublished)

#### Added

- Review a changeset against the `CLAUDE.md` and `AGENTS.md` files whose scope covers it, one
  agent judgement per file, with rule sources from providers. The `dfv` command with
  `--base`, `--engine`, `--model`, `--json`, `--dry-run`, `--blocking`, `--exclude`,
  `--severity`, `--concurrency`, `--max-files` and `-C`.
