---
'@osdlc/agent-seat': patch
---

First public release. Opens an interactive coding-agent session (`claude`, `codex`, `cursor`, `pi`, `opencode`, `antigravity`) in the terminal app, multiplexer or editor a person already uses: the caller's own terminal, tmux, WezTerm, cmux, herdr, Orca, otty, VS Code or a JetBrains IDE. One host contract in optional parts (`session`, `terminal`, `send`, `find`, `focus`, `capture`, `close`, `openWorkspace`); `requirePart` returns the part or throws `HostPartMissing`. `hostRegistry({ runtimeDir })` builds every host, and hosts that keep state keep it under that directory. Every shell-out goes through an injected `@osdlc/command-seam` runner. The `vscode` and `jetbrains` hosts, their companion plumbing, the tmux attach helpers and `hostCanWait` are experimental. The versions before 0.7.1 were never published; the history in this file rebuilds them from the git history.
