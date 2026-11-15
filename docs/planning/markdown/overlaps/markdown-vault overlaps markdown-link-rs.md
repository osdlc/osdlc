---
from: "[markdown-vault](../components/markdown-vault.md)"
to: "[markdown-link-rs](../components/markdown-link-rs.md)"
overlap: partial
states: [present]
note: >-
  markdown-vault's createLinkResolver decides what a link points to by its own rule (exact path,
  then file name, shortest path wins) instead of the shared resolver (problem F1).
---
