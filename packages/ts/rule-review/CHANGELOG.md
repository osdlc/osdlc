# @osdlc/rule-review

## History before the first public release

The package was developed as `@osdlc/agent-dev`, with the command `dfv`, and
was never published under that name. These versions are rebuilt from its
history.

### 0.3.0 (unpublished)

- **Breaking:** `--engine gemini` is now `--engine antigravity`.
- `dfv checks` runs a folder of numbered check scripts, each selected by the
  changeset through `# applies_to:` headers, with `--base`, `--staged` and
  `--all`.
- `extraArgs` in the settings passes flags to the agent before the prompt.
- Scope patterns match dot paths, so `**` covers `.github/`.
- A path is read literally, so `pages/[id].vue` is not a character class. A
  scope pattern the matcher rejects exits 2 with a `ScopeError` that names it.
- SIGINT and SIGTERM kill the running agents and exit 130.
- A reply that is not a findings object fails its judgement instead of reading
  as clean.
- A `CLAUDE.md` symlinked to, or importing, its sibling `AGENTS.md` is judged
  once.
- A changeset can be read before the first commit, so a pre-commit hook does
  not block it.
- A renamed file is listed under its old path as well as its new one.

### 0.2.0 (unpublished)

- A branch ahead of or diverged from its remote is diffed against the local
  branch, not the remote's older tip. The remote is preferred only when the
  local branch is behind it. `resolveBase` is exported, and `--json` carries
  `resolvedBase`.

### 0.1.0 (unpublished)

- Review a changeset against the `CLAUDE.md` and `AGENTS.md` files whose scope
  covers it, one agent judgement per file. Rule sources come from providers.
  `--dry-run`, `--blocking`, `--severity`, `--json`, `--exclude`,
  `--concurrency` and `--max-files`.
