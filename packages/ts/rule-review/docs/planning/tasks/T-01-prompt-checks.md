---
id: T-01
type: task
state: open
created: 2026-11-07
---

# T-01: Run prompt checks

## Goal

A `.md` file in a check folder is judged by an agent, in number order with the
script checks, and one report covers both kinds.

## Today

`readCheckFolder` lists a `.md` check as a `PromptCheck`, and `runChecks`
reports it as `SKIP` with `prompt checks not yet supported`. `planJobs` and
`review` already judge `RuleSource`s.

## Proposed

- The folder turns each `.md` check into a `RuleSource`. Frontmatter
  `applies_to: paths: [...]` gives its patterns, `**` when absent; the body is
  its text.
- A `checkFolder(dir)` provider yields the folder's prompt checks, so any
  `review` caller can use them.
- The run walks checks in number order. A prompt check goes through `review`
  and fails when a finding meets its floor: frontmatter `severity_floor:`, else
  `violation`. Prompt-check failures block by default.
- Under `--all`, a prompt check judges its whole scope; a file with no diff is
  sent whole.
- `--no-prompts` reports every prompt check as skipped and starts no agent.
- Findings print indented under their check, in text and JSON.

## Acceptance criteria

- [ ] A test with an injected `dispatch` runs a folder with a script and a
      prompt check in number order, and the prompt check fails on a finding at
      its floor.
- [ ] `--no-prompts` starts no agent.
