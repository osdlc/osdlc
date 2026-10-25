---
"@osdlc/wayfinder": minor
---

wayfinder is now a command tree: `way list`, `way query`, `way run`, `way serve` and `way providers`, with `way help`, `way schema <command>` and `way --version` from `@osdlc/cli-tool`. Every `--json` answer is a document with `schemaVersion` and `kind`, and `@osdlc/wayfinder/schema` exports the JSON Schema of each document plus `documentZod(kind)` to parse one.

New:

- `way run <id> [-- args]` runs one task by its id or command line, binding arguments as the terminal UI does, and exits with the task's exit code. `--dry-run --json` prints the plan.
- `list` and `query` take `--declared` and `--depth N` beside `--services`.
- The `catalog` and `query` documents carry `unknowns`: each withheld runner, task with unknown parameters, stale stored answer and missing tool, with the same `label` the stderr note prints.
- Each `cache` entry has `probeMs` after a fresh probe.

Breaking changes, and what to do:

- `way query --json` prints a `query` document, not a bare array. Read its `tasks` field.
- `way providers --json` prints a `providers` document, not a bare array. Read its `providers` field.
- `--json` always carries `cache`, `unknowns` and `filter`, and `schemaVersion` and `kind`. A strict parser must allow these fields; `documentZod('catalog')` does.
- `--serve`, `--list` and `--json` are aliases for `serve`, `list` and `list --json` in this release and will be removed later. Switch scripts to the commands. Two of them at once is now an error.
- A start directory that does not exist is an error (exit 1) instead of an empty catalog. Check the path.
- Every message on stderr starts with `way:`, not `wayfinder:`: the commands, the terminal UI, the web view server and an uncaught error. Update any pattern that matches the prefix.
- The package has an `exports` map, so deep imports into `dist/` no longer resolve. Use `@osdlc/wayfinder/schema` for the schemas.
