---
'@osdlc/typed-git': patch
---

`diffText` and `diffNameStatus` pass `--no-color`, so a `color.ui=always` or `color.diff=always` setting no longer puts escape codes in the diff text.
