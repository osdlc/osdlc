---
"@osdlc/path-guard": patch
---

Add a `@osdlc/path-guard/lexical` entry for code that cannot load Node. It holds `validateRelative`, `PathError`, `PathErrorKind`, `toRelative` and a new text-only check, `isUnder(root, path)`. Nothing it loads imports `node:*`. The main entry exports what it did before.
