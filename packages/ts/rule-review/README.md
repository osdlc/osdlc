# @osdlc/rule-review

Review a code change against the rule files that govern it.

A repository's rules live in `CLAUDE.md` and `AGENTS.md` files at its root and
in its subdirectories. They are read while code is written and forgotten by the
time it is committed. `rule-review` finds every rule file whose directory holds
a changed file and asks a headless coding agent about each one, separately,
over only the files that rule file governs. You get a list of findings, each
quoting the change and naming the rule it breaks.

It is for teams that already keep rules for agents in `CLAUDE.md` or
`AGENTS.md` and want them checked on every pull request or push, in CI or a
git hook. A rule file that governs none of the changed files costs nothing.

Do not use it in place of a linter, a type checker or tests. Rules a tool can
check mechanically belong in that tool, which is faster, cheaper and exact. An
agent's judgement is not deterministic: two runs can differ. Use rule-review
for the rules only a reader can check, and keep it advisory until you trust
it.

```sh
npx @osdlc/rule-review --dry-run --base main   # what would be judged, and the prompt size. Free.
npx @osdlc/rule-review --base main             # judge the branch
```

The [guide](./docs/guide/getting-started.md) walks through it: [getting
started](./docs/guide/getting-started.md), [writing rule
files](./docs/guide/writing-rules.md), [CI and git hooks](./docs/guide/ci-and-hooks.md),
[using the library](./docs/guide/library.md), [check folders](./docs/guide/check-folders.md)
and [how it works](./docs/guide/how-it-works.md).

## Install

```sh
npm install --save-dev @osdlc/rule-review
```

It runs an agent CLI you install and sign in to yourself: Claude Code
(`claude`, the default), Codex (`codex`), Antigravity (`agy`), opencode, or
another engine `@osdlc/agent-call` supports. Pick one with `--engine`. Each
judgement runs the agent read-only, with no session saved.

Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, on Linux or macOS. ESM only.

## How it decides what to judge

Every rule source declares the paths it governs, and the changed files are
matched against those scopes. Matching is glob intersection, so a source whose
scope holds no changed file is dropped before any agent starts.

| Rule source                         | Governs                          |
| ----------------------------------- | -------------------------------- |
| `CLAUDE.md` or `AGENTS.md` at `D/`  | `D/**`, dot paths included       |
| The same at the repository root     | every file                       |
| A source from your own provider     | the patterns it declares         |

For a change to `lib/model/read.ts` and `docs/guide.md`, with rule files at the
root, in `lib/` and in `web/`:

| Judgement           | Files                                 |
| ------------------- | ------------------------------------- |
| `CLAUDE.md` (root)  | `lib/model/read.ts`, `docs/guide.md`  |
| `lib/CLAUDE.md`     | `lib/model/read.ts`                   |
| `web/CLAUDE.md`     | not run: governs no changed file      |

- A rule file is handed to the agent verbatim. `@path` imports in it are
  inlined, as Claude Code reads them, up to two levels deep. An import or
  symlink that leaves the repository is not read.
- When `CLAUDE.md` and `AGENTS.md` in one directory carry the same rules (one
  is a symlink to the other, or imports it whole), the directory is judged
  once.
- A source that governs more than `--max-files` changed files (12 by default)
  is split into shards, judged at the same time against the same rules.
  Findings name the source, not the shard.
- The changeset is the fork point of `--base` and `HEAD`, compared with the
  working tree. Uncommitted and untracked files count. A deleted file is
  judged by its deletion diff.
- A finding that cites a file outside its source's scope is dropped.

Each finding has a severity:

| Severity    | Meaning                                         |
| ----------- | ----------------------------------------------- |
| `violation` | The change contradicts a rule.                  |
| `tension`   | Defensible, but pulls against a rule's intent.  |
| `drift`     | Complies today while moving away from a rule.   |

## The `rule-review` command

```sh
rule-review                   # judge uncommitted work
rule-review --base main       # the whole branch
rule-review --base '@{u}'     # unpushed commits, plus uncommitted work
rule-review --dry-run         # what it would judge, and the prompt size; starts no agent
rule-review --blocking        # exit 1 on a finding at or above the severity floor
rule-review --json            # the run as JSON on stdout
```

| Option               | Meaning                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `--base <rev>`       | Compare against `<rev>`. Default `HEAD`: uncommitted work only.                           |
| `--dry-run`          | Plan and measure. Starts no agent and costs nothing.                                      |
| `--blocking`         | Exit 1 on a finding at or above the floor. Without it findings are advisory.               |
| `--severity <level>` | The floor: `violation` (default), `tension` or `drift`.                                   |
| `--strict`           | Exit 11 when a judgement could not complete. Use it in CI.                                |
| `--engine <name>`    | `claude` (default), `codex`, `antigravity`, `opencode`, and the other agent-call engines. |
| `--model <id>`       | The model to judge with. Default: the engine's own.                                       |
| `--concurrency <n>`  | Judgements in flight at once. Default 32.                                                 |
| `--max-files <n>`    | Files per judgement before a source is sharded. 0 disables. Default 12.                   |
| `--exclude <glob>`   | Drop matching paths from the changeset. Repeatable.                                       |
| `--json`             | Print the run as one JSON document on stdout. The report goes to stderr otherwise.        |
| `-C, --dir <dir>`    | Run in `<dir>`.                                                                           |

A branch name passed to `--base` compares from where the branch forked. When
the local branch is behind `origin/<branch>`, the remote one is used, so a stale
checkout does not pull merged commits into the change. `@{u}`, a sha or
`HEAD~3` is used as written.

| Exit | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| 0    | No finding at or above the floor, or advisory (no `--blocking`)               |
| 1    | A finding at or above the floor, with `--blocking`                             |
| 2    | The command line cannot run as typed                                          |
| 10   | The run could not complete: a base that does not resolve, an unreadable glob  |
| 11   | With `--strict`, a judgement did not complete                                 |
| 22   | `git` is not installed                                                        |
| 24   | The directory is not inside a git repository, or does not exist              |
| 130  | Interrupted by SIGINT or SIGTERM; running agents are killed                   |

`rule-review --version` prints the version.

The codes follow the osdlc [CLI standard](https://github.com/osdlc/osdlc/blob/main/standards/cli-interface.md):
0, 1 and 2 mean the same in every osdlc tool, 24 is the shared "no repository"
code, 22 the shared "a program it needs is not installed" code, and 10 and
11 are this tool's own.

A judgement that fails (the agent is missing, signed out, times out, or replies
with something other than findings) is reported and marks the run incomplete.
Without `--strict` an incomplete run still exits 0 or 1, because an agent that
could not be reached is not evidence of a violation. In CI, where a missing
key would otherwise pass every change, add `--strict`.

### Cost

Each judgement is one agent call. A run costs about one call per rule file in
scope, plus one per extra shard, and they run at the same time. `--dry-run`
prints the judgements and an estimate of each prompt's size in tokens before
you pay for them. A prompt over about 100k tokens is flagged: a judge reasons
worse about each file when it is handed many.

## In CI

Set the agent's API key as a secret. A pull request from a fork gets no
secrets, so there every judgement fails: with `--strict` the job fails too.
Run the job only for branches in the repository if that is a problem.

GitHub Actions. Findings become annotations on the pull request's diff:

<!-- example: examples/ci/github-actions.yml -->

```yaml
# .github/workflows/rule-review.yml
# Review each pull request against the CLAUDE.md and AGENTS.md files that
# govern the files it changes. Findings become annotations on the diff.
name: rule-review

on:
  pull_request:

permissions:
  contents: read

jobs:
  rule-review:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
        with:
          # The review diffs against the fork point, so it needs the history.
          fetch-depth: 0
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      # The agent that judges each rule file. Codex, Antigravity and opencode
      # work too: install that CLI and pass --engine.
      - run: npm install -g @anthropic-ai/claude-code
      - name: Review the change against its rule files
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          BASE: ${{ github.base_ref }}
        # --blocking fails the job on a violation. --strict also fails it
        # when a judgement could not complete, such as a missing API key.
        run: npx -y @osdlc/rule-review@0.4 --base "$BASE" --blocking --strict --json > rule-review.json
      # Findings hold model text, so it is escaped before it reaches a
      # workflow command: a newline or "::" in it cannot start another one.
      - name: Annotate the findings
        if: always()
        run: |
          jq -r '
            def msg: gsub("%"; "%25") | gsub("\r"; "%0D") | gsub("\n"; "%0A");
            def prop: msg | gsub(":"; "%3A") | gsub(","; "%2C");
            .findings[]?
            | "::\(if .severity == "violation" then "error" else "warning" end)"
              + " file=\(.file | prop)\(if .line then ",line=\(.line)" else "" end)"
              + ",title=\(.sourcePath | prop)::\(.why | msg)"
          ' rule-review.json
```

GitLab CI:

<!-- example: examples/ci/gitlab-ci.yml -->

```yaml
# .gitlab-ci.yml
# Review each merge request against the CLAUDE.md and AGENTS.md files that
# govern the files it changes. Set ANTHROPIC_API_KEY as a masked CI/CD variable.
rule-review:
  image: node:24
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  variables:
    # The review diffs against the fork point, so it needs the history.
    GIT_DEPTH: 0
  script:
    - npm install -g @anthropic-ai/claude-code
    - git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
    - npx -y @osdlc/rule-review@0.4 --base "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" --blocking --strict
```

Pin the version (`@0.4` above) so a new minor release does not change your CI
unasked.

## In git hooks

An agent review takes tens of seconds, so run it once per push rather than on
every commit. Check scripts (below) are fast enough for pre-commit. Each hook
below expects the package installed in the repository
(`npm install --save-dev @osdlc/rule-review`). `git push --no-verify` skips a
hook once.

A plain hook. Copy it to `.git/hooks/pre-push` and make it executable:

<!-- example: examples/hooks/pre-push -->

```sh
#!/bin/sh
# .git/hooks/pre-push: review what this branch changes before it is pushed.
#
# Compares against the upstream branch when there is one, else main. Advisory:
# findings are printed and the push goes ahead. Add --blocking to stop the push
# on a violation; `git push --no-verify` skips the hook once.
if git rev-parse --verify --quiet '@{u}' >/dev/null; then
  base='@{u}'
else
  base=main
fi
exec npx --no-install rule-review --base "$base"
```

[Husky](https://typicode.github.io/husky/):

<!-- example: examples/hooks/husky-pre-push -->

```sh
# .husky/pre-push
npx --no-install rule-review --base main --blocking
```

[Lefthook](https://lefthook.dev):

<!-- example: examples/hooks/lefthook.yml -->

```yaml
# lefthook.yml
# The check scripts are fast, so they run on every commit, on the staged files.
# The agent review takes longer, so it runs once per push, on the whole branch.
pre-commit:
  commands:
    checks:
      run: npx --no-install rule-review checks checks.d --staged
pre-push:
  commands:
    rule-review:
      run: npx --no-install rule-review --base main --blocking
```

[pre-commit](https://pre-commit.com):

<!-- example: examples/hooks/pre-commit-config.yaml -->

```yaml
# .pre-commit-config.yaml (https://pre-commit.com)
# Install both stages: pre-commit install -t pre-commit -t pre-push
repos:
  - repo: local
    hooks:
      - id: rule-review-checks
        name: rule-review checks
        entry: npx --yes @osdlc/rule-review@0.4 checks checks.d --staged
        language: system
        pass_filenames: false
        always_run: true
        stages: [pre-commit]
      - id: rule-review
        name: rule-review
        entry: npx --yes @osdlc/rule-review@0.4 --base main --blocking
        language: system
        pass_filenames: false
        always_run: true
        stages: [pre-push]
```

## Check folders: `rule-review checks`

`rule-review checks <folder>` runs a folder of numbered check scripts, each only
when the changeset touches its scope. It is the deterministic half of a review:
scripts for what a command can check, rule files for what it cannot. This
command is [experimental](#stability).

```sh
rule-review checks checks.d             # checks whose scope holds uncommitted work
rule-review checks checks.d --staged    # ... or the staged files: for pre-commit
rule-review checks checks.d --base main # ... or the files changed against main
rule-review checks checks.d --all       # ... or every tracked file
rule-review checks checks.d --dry-run   # what would run and what is skipped
rule-review checks checks.d --json      # the results as JSON
```

An executable file named `<number>-<name>` is a check, where the name matches
`[a-z0-9][a-z0-9._-]*`. Checks run one at a time, by number and then name, so
`9-a` runs before `10-a`. Two sample checks:

<!-- example: examples/checks.d/10-no-conflict-markers -->

```sh
#!/bin/sh
# Fail when a changed file still holds a merge conflict marker.
# No applies_to line, so every changed file is in scope.
status=0
while IFS= read -r file; do
  [ -f "$file" ] || continue
  if grep -nE '^(<<<<<<<|>>>>>>>)( |$)' "$file"; then
    echo "conflict marker in $file" >&2
    status=1
  fi
done
exit $status
```

<!-- example: examples/checks.d/20-shell-syntax -->

```sh
#!/bin/sh
# applies_to: **/*.sh
# timeout: 60
# Parse each changed shell script without running it.
status=0
while IFS= read -r file; do
  sh -n "$file" || status=1
done
exit $status
```

- `# applies_to: <glob>` lines in the leading comments set the scope. Several
  add up; none means every file. A script reads its in-scope changed files on
  stdin, one per line. A script whose scope holds no changed file is skipped.
- `# timeout: <seconds>` sets the time limit. The default is 600. A timeout
  kills the script's whole process group.
- Exit 0 passes and any other exit fails. A timeout or a signal is an error.
- Each script runs from the project root with `CHECK_ROOT`, `CHECK_NAME`
  (the name after the number), `CHECK_ORDER`, `CHECK_DIR` and `CHECK_BASE`
  set. `CHECK_BASE` is the commit the changeset was measured from: `HEAD`,
  the fork point of `--base` and `HEAD` (so `git diff "$CHECK_BASE"` shows the
  same change), or empty with `--all`.
- A `.md` file is a prompt check. It is listed and reported as skipped: prompt
  checks do not run yet.
- Anything else is skipped with its reason: no number prefix, a bad name, a
  leading `.` or `_`, a `.disabled` suffix, no executable bit, a directory, a
  broken symlink, or a file that cannot be read.
- `--base`, `--staged` and `--all` are exclusive. Outside git every script runs,
  with empty stdin.

| Exit | Meaning                                     |
| ---- | ------------------------------------------- |
| 0    | Every check passed or was skipped           |
| 1    | A check failed or errored                   |
| 2    | The command line cannot run as typed        |
| 10   | The folder or the changed files cannot be read |
| 22   | `git` is not installed                      |
| 24   | The directory does not exist, or a changeset flag was given outside git |
| 130  | Interrupted; the running check is killed    |

## As a library

`reviewChanges` does what the command does and returns the run:

<!-- example: examples/review-a-branch.ts -->

```ts
/** Review the current branch against main and print each finding. */
import { reviewChanges } from '@osdlc/rule-review'

const run = await reviewChanges({ base: 'main' })

for (const f of run.findings) {
  const where = f.line === undefined ? f.file : `${f.file}:${f.line}`
  console.log(`${f.severity} ${where} (${f.sourcePath}): ${f.why}`)
}
if (run.degraded) console.error('Some rule files could not be judged.')
process.exitCode = run.findings.some((f) => f.severity === 'violation') ? 1 : 0
```

The run holds `findings` (merged, ordered from repository-wide rules to local
ones, worst first under each), `jobs` and `outcomes` (one per judgement, with
its error, duration, cost and prompt size), `skipped` (sources a provider
returned that matched no changed file; the built-in provider does not return
instruction files outside the change), `degraded` (a judgement failed, or in a dry run would not be dispatched) and the changeset it
judged. Pass `dryRun: true` to plan without starting an agent, `config` to
change any [setting](#settings), and `signal` to stop the run: aborting kills
every running agent.

### Your own rule sources

`CLAUDE.md` and `AGENTS.md` come from the one provider the package ships,
`instructionFiles()`. A standards folder, a style guide or rules kept in a
database come from a `RuleSourceProvider` you write. A source is an id, the
rule text, and the glob patterns it governs:

<!-- example: examples/custom-provider.ts -->

```ts
/**
 * Add a rule source of your own beside CLAUDE.md and AGENTS.md: here, a style
 * guide that governs every Markdown file wherever it sits.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { instructionFiles, reviewChanges, type RuleSourceProvider } from '@osdlc/rule-review'

const styleGuide: RuleSourceProvider = {
  id: 'style-guide',
  async discover({ projectRoot }) {
    return [
      {
        id: 'style:docs/STYLE.md',
        kind: 'style',
        path: 'docs/STYLE.md',
        depth: 0,
        patterns: ['**/*.md'],
        text: readFileSync(join(projectRoot, 'docs/STYLE.md'), 'utf8'),
        label: 'Style guide (Markdown files)',
      },
    ]
  },
}

const run = await reviewChanges({ base: 'main', providers: [instructionFiles(), styleGuide] })
console.log(`${run.findings.length} findings from ${run.jobs.length} judgements`)
```

`review` is the same run with every input supplied: the sources, the changed
files and their diffs. Use it when the changeset does not come from a git
checkout, or to set `configFor`, which picks the engine, model, effort or
timeout per judgement. `dispatch` replaces the agent call, for tests.

### Check folders

The command's check runner is a library too (experimental):

<!-- example: examples/run-checks.ts -->

```ts
/** Run the check scripts in checks.d against the staged files, as a pre-commit hook would. */
import {
  checksExitCode,
  formatReport,
  readCheckFolder,
  runChecks,
  stagedFiles,
} from '@osdlc/rule-review'

const root = process.cwd()
const folder = await readCheckFolder(`${root}/checks.d`)
const run = await runChecks(folder, {
  projectRoot: root,
  changeset: { files: stagedFiles(root), base: 'HEAD' },
})

process.stdout.write(formatReport(run))
process.exitCode = checksExitCode(run.results)
```

`runChecks` takes `runnerFor`, so a test can supply its own process runner, and
`signal`, which kills the running check. `planChecks` answers what would run
without running it.

### Settings

`DEFAULT_CONFIG` holds the defaults. It is frozen; spread it to change a field.
A run checks its settings before any agent starts and rejects one out of range,
naming it.

| Field            | Default      | Meaning                                                                |
| ---------------- | ------------ | ---------------------------------------------------------------------- |
| `engine`         | `'claude'`   | The agent CLI. Unknown names are refused before any agent starts.      |
| `binary`         | the engine's | The agent's executable.                                                |
| `model`          | the engine's | The model.                                                             |
| `effort`         | the engine's | Reasoning effort.                                                      |
| `extraArgs`      | none         | Flags passed to the agent before the prompt.                           |
| `concurrency`    | `32`         | Judgements in flight at once.                                          |
| `blocking`       | `false`      | Whether `exitCodeFor` returns 1 for a finding at or above the floor.   |
| `severityFloor`  | `'violation'`| The floor for `blocking`.                                              |
| `exclude`        | `[]`         | Globs removed from the changeset before planning.                      |
| `timeoutMs`      | `600000`     | Wall clock per judgement.                                              |
| `maxPromptBytes` | `400000`     | Prompt size past which a judgement is flagged. Nothing is cut.         |
| `maxFilesPerJob` | `12`         | Files per judgement before sharding. 0 disables.                       |

## API

Every export, from the one entry point `@osdlc/rule-review`. Each has TSDoc in
the shipped `.d.ts`; the [examples](./examples) run each one.

| Export | What it is |
| --- | --- |
| `reviewChanges(options?)` | Review a checkout's changes. Returns a `ReviewChangesResult`. |
| `ReviewChangesOptions`, `ReviewChangesResult` | Its input, and its run plus the changeset judged. |
| `ChangesetError` | `reviewChanges` could not start: `kind` is `not-a-repository` or `bad-base`. |
| `review(options)` | The same run with sources, files and diffs supplied. Takes `ReviewOptions`, returns `ReviewRun`. |
| `discoverSources(providers, ctx)` | Every provider's rule sources; refuses a duplicate id. |
| `planJobs(sources, files, config)` | The judgements a run would make, and the sources skipped. Returns `PlanResult`. |
| `buildSpec(job, diffs, config, cwd)`, `FINDINGS_SCHEMA` | The agent call one judgement makes, and the reply schema. |
| `Dispatch`, `AgentCallSpec`, `AgentResult` | The agent-call seam, for a test or another transport. |
| `ScopeError` | A scope or exclude pattern the matcher cannot read. |
| `exitCodeFor(findings, config)`, `meetsFloor(severity, floor)` | Grading findings against the floor. |
| `estimateTokens(bytes)`, `formatTokens(tokens)`, `jobLabel(job)` | Sizes and names for a report. |
| `RuleSource`, `RuleSourceProvider`, `DiscoveryContext` | What a provider returns and is given. |
| `ReviewJob`, `JobOutcome`, `Finding`, `Severity`, `SEVERITY_ORDER` | A judgement, what came of it, and the findings. |
| `ReviewConfig`, `DEFAULT_CONFIG` | The [settings](#settings). |
| `instructionFiles(options?)`, `InstructionFilesOptions`, `FileLister`, `INSTRUCTION_KIND` | The built-in provider. |
| `changedFiles`, `stagedFiles`, `trackedFiles`, `fileDiffs`, `resolveBase`, `defaultBase`, `Repo`, `FileDiff` | Reading a changeset from git, given a directory or a typed-git `Git`. |
| `readCheckFolder`, `planChecks`, `runChecks`, … | The check-folder runner; see [Stability](#stability). |

## Compared with other tools

| Tool                                              | What it does                                         | What rule-review adds                                     |
| ------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| Linters, type checkers, Danger                    | Check rules written as code                          | Rules written as prose, checked by a reader               |
| AI review bots (CodeRabbit, Copilot review, …)    | Review the whole diff against general best practice  | Only your rule files, each over only the files it governs |
| Claude Code `/review`, Codex review               | One agent reviews the change in a session            | One judgement per rule file, scoped, in CI or a hook      |
| Instruction-file linters                          | Check the rule files themselves                      | Check the code against them                               |

The scoping is the point: a judge given one rule file and the dozen files it
governs reasons better than one given every rule and every file, and a rule
file the change does not touch is never sent.

## Stability

The version is 0.x: a minor release may break the API, and the CHANGELOG says
how. The items below are experimental. They may change in any minor release,
and each carries `@experimental` in its documentation.

- The `rule-review checks` command.
- `readCheckFolder`, `planChecks`, `runChecks`, `formatPlan`, `formatReport`,
  `runToJson`, `summarize`, `checksExitCode` and `DEFAULT_TIMEOUT_SEC`.
- The types `Check`, `CheckFolder`, `ScriptCheck`, `PromptCheck`,
  `SkippedEntry`, `CheckResult`, `CheckStatus`, `ChecksRun`, `ChecksPlan`,
  `RunChecksOptions` and `Changeset`.

Everything else exported is stable within a minor version. The JSON that
`--json` prints is the run as the library returns it, with `schemaVersion: 1`
and `kind: "review"` in front (`"checks"` and `"checks-plan"` for
`rule-review checks`). `schemaVersion` rises when a field is removed, renamed
or retyped. A failure under `--json` prints an error document instead:
`{ "schemaVersion": 1, "kind": "error", "code": "bad-base", "message": "…", "exit": 10 }`.

## Runtimes and platforms

Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of the git client it
uses, on Linux and macOS. It needs `git` on the PATH. Windows is not tested: the
check runner relies on the executable bit and process groups. Bun runs the
built package but is not tested.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
