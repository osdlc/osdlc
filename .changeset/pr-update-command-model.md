---
"@osdlc/pr-update": minor
---

`survey` and `update` now run on `@osdlc/cli-tool`'s command model, in one tree with `config` and `trust`; the hand dispatch on the first argument is gone. Every flag, exit code and text report is unchanged, and a bare `--branch` still means the checked-out branch. What a reader sees differently:

- `--json` (and `--output json`) prints the same fields with `schemaVersion: 1` and `kind` (`survey` or `update`) in front, and `update --report` writes that same document. The `{ error }` report of a run that threw is unchanged.
- Help is generated: `pr-update <command> --help`, `--help --all` for the long form (the `--repair-agent` agents, one per line, are there now), `pr-update help` and `pr-update schema`. `pr-update` alone still lists the commands and exits 0.
- Errors read `pr-update: <message>` with the usage line, and under `--json` also print the error document on stdout. An unexpected error is reported by the app (exit 1) rather than thrown out of `main`.
- `--output jsonl` and `--json --output text` are refused (exit 2).
- For an adapter: `survey` is read-only, `update` is destructive, and an `update` call that passes `trust`, `repairAgent`, `repairCommand` or `report` is command-line only.
