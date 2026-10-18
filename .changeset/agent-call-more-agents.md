---
"@osdlc/agent-call": minor
---

**Breaking:** `AgentName` and `BUILTIN_AGENTS` gain six built-in agents:
`copilot` (GitHub Copilot CLI), `pi`, `qwen` (Qwen Code), `droid` (Factory
Droid), `cursor` (Cursor CLI) and `deepseek` (DeepSeek Harness, `dsh`). Each
has an adapter factory and options type (`copilotAdapter`, `piAdapter`,
`qwenAdapter`, `droidAdapter`, `cursorAdapter`, `deepseekAdapter`), and takes
`binary` or a `command` prefix like the other four. An exhaustive `switch`
over `AgentName` needs the new cases. Their `effort` handles the `none` and
`minimal` levels: pi and DeepSeek Harness have an `off` level for `none`, and
the others raise `none` and `minimal` to `low`. The README's
capability map lists every mapping.

The conversation of a claude run no longer lifts sub-agent events (those with
a `parent_tool_use_id`) into the main thread; they stay in `raw`.
