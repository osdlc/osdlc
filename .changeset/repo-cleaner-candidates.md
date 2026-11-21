---
"@osdlc/repo-cleaner": minor
---

Add `candidatesOf` and `removeCandidate`, which hand a sweep's rows to a host as plain data and delete one of them with `run`'s checks, verification and archive-first. Export `fingerprint`, `sameFingerprint`, `PlanSchema`, `writeJsonAtomic` and `busyHolders`, and `isGlob` and `globRegExp`, the glob matching `--spare` uses, so a host spares rows the same way.
