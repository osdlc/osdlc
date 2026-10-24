---
'@osdlc/typed-gh': patch
---

An empty `hostname` now means no host, the same as leaving it out. It used to throw `RangeError`, so callers read from config had to write `hostname: value || undefined`. `github.com` is still passed to gh as given, because an explicit `github.com` keeps a call on github.com when `GH_HOST` points elsewhere. The README now says so.
