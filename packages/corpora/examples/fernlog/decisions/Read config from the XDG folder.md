---
status: accepted
decided: 2026-04-10
follows:
  - "[Prefer standard locations](../_references/org/principles/Prefer%20standard%20locations.md)"
  - "[Write decisions down](../_references/org/principles/Write%20decisions%20down.md)"
checkedBy:
  - "[fernlog config path](../statements/fernlog%20config%20path.md)"
---

fernlog reads its config from `$XDG_CONFIG_HOME/fernlog/config.toml`, by default
`~/.config/fernlog/config.toml`. Earlier versions read `~/.fernlogrc`, which put a dot file in the
home folder.
