---
'@osdlc/agent-seat': minor
---

Add the `window` host: it opens a new GUI terminal window running the harness (Terminal.app through `osascript` by default, or a caller-supplied `WindowOpener`) and returns as soon as the window is open. `makeWindowHost`, `windowHost`, `terminalAppArgv`, `windowShellCommand` and `WindowOpener` are exported, and `'window'` joins `HOST_NAMES`. It cannot wait for the window's process to exit.
