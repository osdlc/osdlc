---
"@osdlc/config-layers": minor
---

Fixed: `machineConfigFile(...).write` writes through a symlinked config file. The link stays, and the new text and the `.bak` go to the file it points to (through a chain of links; a link to a missing file creates it). Before, the write replaced the link with a regular file and left the target as it was.

Fixed: `unsetPath` on a key that was never set returns the text unchanged when its parent is a flow mapping. Before, `unsetPath('hosts: {}\n', ['hosts', 'wezterm'])` removed `hosts`.

New: a `defineMigrations` step takes `before(raw, warn)`, which runs ahead of its `moves`, so a clean-up the moves depend on no longer forces a hand-written step.
