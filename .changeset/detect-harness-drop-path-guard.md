---
'@osdlc/detect-harness': patch
---

Drop the dependency on `@osdlc/path-guard`. The one function it used, `isInside`, is removed in `@osdlc/path-guard` 0.3.0, so the package now carries the same text check itself. Nothing changes for callers.
