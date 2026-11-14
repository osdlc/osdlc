---
type: decision
schema_version: '2'
id: D-0003
title: survey and update run on cli-tool's command model
state: open/accepted
created: '2026-11-05'
last_reviewed: '2026-11-05'
tags:
  - pr-update
  - cli
  - cli-tool
---
# survey and update run on cli-tool's command model

## Summary

`pr-update survey` and `pr-update update` are declared with `defineCommand`
from `@osdlc/cli-tool/command`, beside the shared `config` and `trust`, in one
`defineApp` tree. The hand dispatch on `argv[0]` and the two separate
`defineCli` parsers are gone. Flags, exit codes and the text output are kept.
The JSON document gains `schemaVersion` and `kind`, and help is generated.

^summary

## Context

pr-update was half on the command model: `config` and `trust` ran in a
`defineApp` tree, while `survey` and `update` were their own `defineCli`
calls, reached by an `if (sub === ...)` chain with a hand-written top-level
help (osdlc/osdlc#423). Each command parsed `--output text|json` and `--json`
itself and printed the engine's report as it stood.

## Decision

- **One tree.** `createApp(seams)` in `src/cli.ts` holds `survey`, `update`,
  `config` and `trust`. `main` builds it and runs the command line. The
  commands live in `src/commands.ts`, and their output schemas are the
  engine's own (`survey.ts` `output`, `update.ts` `output`).
- **The flags stay.** Every flag keeps its name, value and default.
  `--output` and `--json` are now the app's own, so `--output` also takes
  `jsonl`, which both commands refuse (exit 2): each prints one document.
- **A bare `--branch` stays.** The flag parser has no optional value, so
  `main` rewrites a bare `--branch` of `survey` or `update` to the hidden
  `--current-branch` flag, which the command resolves to the checked-out
  branch. It is a real flag, so an adapter call can ask for the current
  branch too (`currentBranch: true`).
- **`pr-update` alone** still prints the command list on stdout and exits 0.
  It runs the generated `help`.
- **The JSON document** is the engine's report with `schemaVersion: 1` and
  `kind` (`survey`, `update`) in front, as every command-model tool prints.
  The fields are unchanged. `update --report` writes the same document, so the
  README's "the same document `--json` prints" stays true. The `{ error }`
  report of a run that threw is unchanged.
- **Errors** print `pr-update: <message>` and the command's usage line, and
  under `--json` also the error document on stdout. An unexpected error is
  caught by the app (one line, exit 1) instead of escaping `main` to
  `runMain`, which printed the same line.
- **Exposure.** `survey` is `readOnly`. `update` is `destructive` (it can
  force-push), and a call that gives consent on the command line (`--trust`,
  `--repair-agent`, `--repair-command`, `--report`) is `cli-only`: an agent
  calling through an adapter must not grant itself trust, name the command to
  run, or pick a file for the run to remove and write.

## Why

The issue's goal is that no tool hand-routes `argv[0]`, and that help,
`--json`, `schema` and the adapters come from one declaration. With all four
commands in one tree, `pr-update help`, `pr-update schema` and
`App.call` cover the whole tool. Keeping every flag and exit code means no
script that runs pr-update today has to change. The envelope is the one
additive change a JSON reader sees, and it is the contract every other
command-model tool already prints.

## Options considered

### `--report` with or without the envelope

Leaving the report as the bare output would make it differ from `--json`
by two keys and break the README's promise that they are the same. Adding
them is additive for a reader that parses with the `update` output schema,
which ignores unknown keys. Chosen: the same document.

### A bare `--branch`: rewrite to a value, or to a flag

The old code asked git for the branch before parsing and put the name in.
That ran git before `--help` and reported its errors outside the command.
Rewriting to `--current-branch` leaves the lookup to the command, where a
missing git (exit 22) and a detached HEAD (exit 2) are reported like every
other failure, and an adapter can ask for it.

### Per-agent lines in `update --help`

Generated help fills each flag's text into one paragraph, so the
`--repair-agent` list of agents, one per line, moved to the command's long
description: `update --help --all` (or `help update --full`). `--help` still
names the choices.

## Consequences

- `pr-update schema` prints the input and output JSON Schema of `survey` and
  `update`.
- Help text and stderr wording follow the command model. A script that
  matched the old `pr-update survey: <message>` prefix sees
  `pr-update: <message>`.
- `--json --output text` is now refused as two forms (exit 2). Before,
  `--output` won.
