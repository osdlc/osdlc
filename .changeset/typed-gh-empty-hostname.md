---
'@osdlc/typed-gh': patch
---

An empty `hostname` now means no host, the same as leaving it out. It used to throw `RangeError`, so a caller that reads the host from its own config had to write `hostname: value || undefined`. Passing `hostname: 'github.com'` is unchanged: it still reaches gh as given, because naming github.com explicitly keeps a call there when `GH_HOST` or gh's default host points at another host. The README now says so.
