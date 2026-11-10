---
"@osdlc/markdown-link": minor
---

Fixed: under `'commonmark'` a fenced code block inside a list item or a block quote is code, so the links after it are found. A fence opens when it is indented to its item's content column (`10. item` then a fence at column 4), and an unclosed fence runs to the end of its container, not of the body. A code span inside a table row now stays in its cell: a `|` that is not escaped as `\|` ends the cell, backticks or not, so ``| `a | [[x]] | b` |`` finds `[[x]]` where the scan took the rest of the body for code. `'skill-export'` is unchanged. Lazy continuation lines are not tracked, so a paragraph line that is not indented to its list item ends the item here.

Changed: `\![[Note]]`, an escaped `!` before a wikilink, is a `'wikilink'` whose span starts at the `[[`, with `embed: false` on an abandoned one, so a renderer can show a literal `!` and a normal link. It was an `'embed'` starting at the `!`. `\\![[Note]]` is still an embed.

New: `codeRules: 'none'` in `ScanOptions` and `stripCodeWith` finds no code, for a caller that has already parsed it, such as remark, and scans a run of text. `CodeRules` gains `'none'`. The shared suite moves to `packages/conformance/markdown-link/suite.json`, with cases for all three, and matches the `markdown-link` crate.
