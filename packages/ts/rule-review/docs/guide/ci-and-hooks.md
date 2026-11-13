---
title: CI and git hooks
sidebar:
  order: 3
description: Where to run rule-review, which flags to use there, and what it costs.
---

The README has copy-ready files for GitHub Actions, GitLab CI, a plain git
hook, husky, lefthook and pre-commit. This page explains the choices in them.

## Where to run it

| Place | When | Flags | Why |
| --- | --- | --- | --- |
| Pull request CI | every push to a PR | `--base <target branch> --blocking --strict` | The gate everyone sees. |
| pre-push hook | before each push | `--base main` (add `--blocking` to stop the push) | Catches it before CI, on your machine. |
| pre-commit hook | every commit | none: run `rule-review checks --staged` instead | An agent review takes tens of seconds; check scripts take milliseconds. |
| By hand | mid-change | none, or `--dry-run` | Uncommitted work is the default changeset. |

## Advisory, blocking and strict

Three exit behaviours, from the flags:

| Situation | Default | `--blocking` | `--blocking --strict` |
| --- | --- | --- | --- |
| No findings | 0 | 0 | 0 |
| A finding at or above the floor | 0 | **1** | **1** |
| A judgement could not run (no agent, no key, timeout) | 0 | 0 | **11** |

Without `--strict`, a judgement that fails is reported and the run is marked
incomplete, but the exit code ignores it. That is right on a laptop: a missing
login is not evidence of a broken rule. In CI it would let every change pass
when the API key is missing, so CI should add `--strict`.

Start advisory. Read the findings for a few weeks, fix the rule files that
produce noise, then turn on `--blocking`.

## Pull requests from forks

GitHub gives a pull request from a fork no secrets, so the agent has no key
and every judgement fails. With `--strict` the job fails. Either run the job
only for branches in the repository:

```yaml
if: github.event.pull_request.head.repo.full_name == github.repository
```

or drop `--strict` for forks and treat the result as missing.

## Fetch the history

The review diffs from where the branch forked, so CI needs the history:
`fetch-depth: 0` with `actions/checkout`, `GIT_DEPTH: 0` on GitLab. In a
shallow clone the fork point may be missing: the review then fails with exit 10
(`could not diff against …`) or compares against the wrong commit.

## Pin the version

Use `npx -y @osdlc/rule-review@0.4` rather than `@latest`. Before 1.0 a minor
release may change flags or output.

## Cost

Each judgement is one agent call. A run makes one call per rule file that
governs a changed file, plus one per extra shard, all at the same time.

- `--dry-run` prints the number of calls and each prompt's size before you pay.
- `--model` picks a cheaper or faster model for the engine.
- `--exclude` keeps generated files and lock files out.
- A prompt over about 100k tokens is flagged in the report: a judgement at that
  size is less reliable.

## Reading the result in CI

`--json` prints the whole run on stdout as one document. The fields a CI step
needs:

```json
{
  "schemaVersion": 1,
  "kind": "review",
  "base": "main",
  "resolvedBase": "origin/main",
  "changedFiles": ["src/api/users.ts", "src/math.ts"],
  "degraded": false,
  "findings": [
    {
      "sourcePath": "CLAUDE.md",
      "file": "src/math.ts",
      "line": 1,
      "severity": "violation",
      "why": "Breaks \"Never use the any type\": parameter a is typed any.",
      "evidence": "export function add(a: any, b: number)"
    }
  ]
}
```

`degraded` is true when a judgement failed. `outcomes` (not shown) has one
entry per judgement, with its error, duration, cost and prompt size. The
GitHub Actions example turns `findings` into annotations on the diff with
`jq`, escaping the model's text so it cannot inject a workflow command.

Treat findings as review comments, not a security gate: the agent reads the
change, and a change can try to talk it out of reporting. See
[SECURITY.md](../../SECURITY.md).
