---
'@osdlc/agent-call': minor
---

**Breaking:** `AgentName` and `BUILTIN_AGENTS` gain six built-in agents:
`copilot` (GitHub Copilot CLI), `pi`, `qwen` (Qwen Code), `droid` (Factory
Droid), `cursor` (Cursor CLI) and `deepseek` (DeepSeek Harness, `dsh`). Each
has an adapter factory and options type (`copilotAdapter`, `piAdapter`,
`qwenAdapter`, `droidAdapter`, `cursorAdapter`, `deepseekAdapter`). An
exhaustive `switch` over `AgentName` needs the new cases. The README's
capability map lists every mapping.
