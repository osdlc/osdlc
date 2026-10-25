---
'@osdlc/markdown-contract': patch
---

A `forbids` hit (from `forbids` or `textRule`) inside a fenced code block is now reported on its own line. Before, the text of a fenced block was placed from the fence line, so each hit was reported one line too high. Indented code blocks were already right.
