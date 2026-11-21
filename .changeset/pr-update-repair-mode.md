---
"@osdlc/pr-update": minor
---

Repair with the person watching: `repair.mode: interactive` runs the repair agent's own CLI in this terminal (stdio inherited, needs a terminal), and `repair.mode: terminal` opens it in a detached tmux session through `@osdlc/agent-seat` and waits for it to end. `--repair-mode <mode>` sets it for one run. The prompt is the same, given as the first message, and after the session ends the same checks as a headless repair decide the result. A mode other than `headless` in the project file is trust-gated like `repair.agent`.
