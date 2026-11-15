---
from: "[markdown-render](../components/markdown-render.md)"
to: "[markdown-link](../components/markdown-link.md)"
overlap: partial
states: [present]
note: >-
  markdown-render finds `[[...]]` and `![[...]]` with its own regexes and uses markdown-link only
  for the attachment list; draft osdlc/osdlc#720 switches it.
---
