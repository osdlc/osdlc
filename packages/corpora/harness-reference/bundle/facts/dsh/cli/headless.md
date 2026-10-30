---
type: Harness Fact
title: "DeepSeek Harness (dsh): Headless run"
description: "Headless run in DeepSeek Harness (dsh), as observed over time."
tags: [cli]
harness: dsh
subject: cli/headless
observations:
  - value: { command: "dsh --profile headless [--json] [--session-id <id>] <task>", stdin: "omit the task or pass -", one_task_per_run: true }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: "deepseek-ai/deepseek-harness packages/bundle/headless/src/startup.ts:38-52 at 5badb150"
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Headless run](/subjects/cli/headless.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). The flag or subcommand for a one-shot, non-interactive
run.

## Observations

- 2026-10-08: command: dsh --profile headless [--json] [--session-id <id>] <task>; stdin: omit the
  task or pass -; one task per run: `true`.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
