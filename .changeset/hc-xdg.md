---
"@osdlc/host-cleaner": minor
---

Use the `xdg` folders on macOS as on Linux, so on macOS the config is `~/.config/host-cleaner/config.json` and receipts and the log are under `~/.local/state/host-cleaner/` (Windows keeps its own folders). A config left in `~/Library/Application Support/host-cleaner/` is still read, with a warning to move it, while the new one does not exist. `host-cleaner config` prints the config file it looked for and whether it exists.
