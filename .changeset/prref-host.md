---
'@osdlc/code-host': minor
---

Breaking: `PrRef` has a required `host`, the lower-cased host its URL names. `parsePrInput` and both adapters' `parsePrUrl` fill it, so a GitHub Enterprise PR URL keeps its host and a caller can refuse a PR on a host it did not expect. Code that builds a `PrRef` by hand must add `host`.
