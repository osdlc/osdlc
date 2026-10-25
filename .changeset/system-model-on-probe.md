---
"@osdlc/system-model": minor
---

`CollectOptions.onProbe` is called once for each runner that was probed, with how long the probe took in ms. A host can report the time of a fresh probe without reading the cache again. It is not called for a runner withheld because execution is not allowed.
