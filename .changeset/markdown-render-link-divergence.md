---
"@osdlc/markdown-render": patch
---

Docs: the README records the shared markdown-link cases where the rendered page differs from the scanner on purpose (self links, code in a target, a table row with no delimiter row, HTML comments, a link in a link). The conformance test now fails when a listed case starts to agree.
