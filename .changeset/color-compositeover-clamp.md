---
'@osdlc/color': patch
---

`compositeOver` clamps a finite source alpha to 0-1, so `a: 2` is treated as opaque and `a: -1` as transparent, as `withAlpha` does.
