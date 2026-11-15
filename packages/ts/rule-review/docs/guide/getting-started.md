---
title: Getting started
sidebar:
  order: 1
description: Install rule-review, preview a review for free, run one, and read the result.
---

Your repository already has rules for coding agents: a `CLAUDE.md` or
`AGENTS.md` at the root, and maybe more in subdirectories ("API handlers
validate their input", "never use `any`"). An agent reads them while it
writes code. Nothing checks the finished change against them.

rule-review does that check. For each rule file that governs a changed file,
it asks a coding agent one question: _does this change break these rules?_ It
asks once per rule file, and shows the agent only the files that rule file
covers.

## Before you start

You need:

- Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, and `git`.
- An agent CLI that you can run headless. The default is Claude Code:
  `npm install -g @anthropic-ai/claude-code`, then sign in, or set
  `ANTHROPIC_API_KEY`. Codex, Antigravity, opencode and the other engines
  `@osdlc/agent-call` knows work too; pick one with `--engine`.
- At least one `CLAUDE.md` or `AGENTS.md` in the repository.

## Install

```sh
npm install --save-dev @osdlc/rule-review
```

Or run it without installing: `npx @osdlc/rule-review`.

## Preview first: `--dry-run`

A dry run works out what would be judged and how big each prompt is. It starts
no agent and costs nothing. Here a branch changed `src/math.ts` and
`src/api/users.ts`, and the repository has a root `CLAUDE.md` and an
`src/api/AGENTS.md`:

```text
$ rule-review --base main --dry-run
rule-review --dry-run: would judge 2 changed files against main in 2 jobs, ~813 tokens of prompt total.

    2 files     438 tok  CLAUDE.md (repo root)
    1 file      376 tok  AGENTS.md (src/api)

Nothing was dispatched. Drop --dry-run to run it.
```

The root `CLAUDE.md` governs every file, so it sees both. `src/api/AGENTS.md`
governs only `src/api/`, so it sees only `users.ts`. A rule file whose
directory holds no changed file is not sent at all.

## Run the review

```text
$ rule-review --base main
rule-review: 2/2 judgements over 2 rule sources covered 2 changed files against main.

CLAUDE.md
  violation  src/math.ts:1
      Breaks "Never use the any type": parameter a is typed any.
      > export function add(a: any, b: number)

1 finding (advisory — pass --blocking to gate on these).
```

Each finding names the rule file it came from, the file and line, why it
breaks the rule, and the code it quotes. Findings are grouped by rule file,
repository-wide rules first.

By default a review is **advisory**: it reports findings and exits 0. Add
`--blocking` to exit 1 when a finding is at or above the floor (`violation`
unless you set `--severity`).

## Choose what to compare against

| You want to review | Run |
| --- | --- |
| What you are editing now (uncommitted work) | `rule-review` |
| The whole branch | `rule-review --base main` |
| What you are about to push | `rule-review --base '@{u}'` |
| The last three commits and your edits | `rule-review --base HEAD~3` |

The changeset always includes uncommitted and untracked files, because that is
what you are about to commit.

## Next

- [Writing rule files](writing-rules.md): rules that a reviewer can check.
- [CI and git hooks](ci-and-hooks.md): run it on every pull request or push.
- [Using the library](library.md): call it from your own tool, with your own
  rule sources.
