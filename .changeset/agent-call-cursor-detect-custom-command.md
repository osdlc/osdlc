---
"@osdlc/agent-call": minor
---

`customAdapter` takes a `command` option, as the built-in adapters do: an argv prefix that replaces `binary` when it has at least one element (an empty array is ignored). `planned.argv` starts with it, `binary` is its first element, and `binary` now defaults to `name`. The adapter's `command` is set, so `detectAgents` probes the whole prefix.

`detectAgents` counts `agent`, the default cursor adapter's binary, as the Cursor CLI only when its version is date-stamped, such as `2026.10.01-abc123`, because `agent` is a generic name. Otherwise it tries `cursor-agent`, the CLI's other install name. `AgentAvailability` gains `command`: the command that answered, when available, which `cursorAdapter({ command })` takes.

A claude-style json envelope that is valid JSON but not an object (`42`, `null`, a string) is now an error result ("no parseable envelope") for claude, cursor, qwen and droid, where before it read as a successful empty answer.

- **Breaking:** `customAdapter` now sets `AgentAdapter.command`, so an adapter copied with only a new `binary` (`{ ...customAdapter(options), binary }`) probes the original command in `detectAgents`. Pass `binary` or `command` to `customAdapter` instead.
- **Breaking:** `detectAgents` reports the default cursor adapter unavailable when `agent --version` does not print a date-stamped version and `cursor-agent` is not installed, where before any `agent` that exited 0 counted.
