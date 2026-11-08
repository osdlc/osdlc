---
"@osdlc/markdown-link": patch
---

`stripCode`: under `'commonmark'` a backtick after an odd run of `\` is a literal backtick and opens no code span, so a link in ``See \`[[Note]]\` here`` is found. `'skill-export'` does not honour the escape, as before. `displayText` shows a link into the same note, `[[#Setup|steps]]` or `[[#Setup]]`, as its alias, or else its heading or `^block`, where it dropped the link. Both match the `markdown-link` crate, and the shared `conformance.json` has cases for them.
