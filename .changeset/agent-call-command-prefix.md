---
'@osdlc/agent-call': minor
---

The built-in adapters take a `command` option: the command to run as argv, for an agent that runs through a launcher or needs arguments before the adapter's own, such as `['npx', '-y', '@anthropic-ai/claude-code']` or `['codex', '--profile', 'work']`. It replaces `binary` when it has at least one element, and an empty array is ignored. `planned.argv` starts with it, `adapterFor` passes it through, and `detectAgents` runs it with `--version` appended. `AgentAdapter` gains an optional `command` field, which the built-in adapters always set; `binary` is its first element.
