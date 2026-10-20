---
id: D-04
type: decision
state: accepted
created: 2026-10-19
---

# D-04: The six harnesses and their ids

## Decision

The package knows six harnesses. `BUILTIN_HARNESSES` lists them, in report
order, with these ids:

| Id            | Harness     |
| ------------- | ----------- |
| `claude`      | Claude Code |
| `codex`       | Codex       |
| `cursor`      | Cursor      |
| `opencode`    | opencode    |
| `pi`          | pi          |
| `antigravity` | Antigravity |

- Ids are short and lower-case. They are the keys of the location table and
  the `harness` field of each report.
- Other spellings map to the ids through `HARNESS_ALIASES`: `claude-code`,
  `codex-cli`, `cursor-agent`, `open-code` and `agy`. `harnessId(name)` takes
  an id or an alias and returns the id, or `undefined`.
- `detect()` returns one report for each harness, in the fixed order, also
  when the harness is absent. The report's `status` says `absent`.
- Depth differs by harness. Claude Code, Codex and Cursor are read for
  plugins, skills, hooks, MCP servers and instructions as far as each has
  them. opencode, pi and Antigravity are read for install, folders and
  sign-in evidence only.
- A caller adds or replaces a harness with a `HarnessProvider`, passed as the
  `providers` option. The package's own `builtinProviders` is the default.

## Why

- A fixed list gives a stable result shape. A caller can index the catalogue
  by id without checking which harnesses were found.
- The six cover the harnesses in common use that keep their configuration in
  readable files.
- Reading less for three of them is honest. An empty field means "none found",
  and the README lists what is not read yet, so no report claims a depth it
  does not have.

## Consequences

- Adding a built-in harness adds an id and a report in every catalogue. That
  is a minor change before 1.0.
- An id is never reused for another harness. Removing an id is breaking.
