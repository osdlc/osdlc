---
'@osdlc/pr-update': patch
---

Fixed: `pr-update config set` and `config unset` no longer overwrite an edit saved in an editor while they ran. They write with a compare-and-swap against the text they edited, and when the file changed in between they leave it as it is and exit 1 with code `config-conflict`.
