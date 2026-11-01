---
"@osdlc/cli-tool": minor
---

`askYesNo` throws away input typed before the question when it reads from a terminal, so a key pressed during a long step cannot answer it. A line still being typed is thrown away too: the terminal leaves canonical mode for a moment through `stty`, and its saved mode is put back. The question says so when something was thrown away. Pass `discardTypeAhead: false` for the old behaviour. `discardTypeAhead()` is exported on its own. Without `stty` (Windows) nothing changes.
