---
'@osdlc/system-model': minor
---

**Breaking:** `Detected.facts` is now `ToolFact[]` instead of `unknown[]`. Each entry is `{ dir, fact, evidence }`, so a fact records which directory it describes, even when that directory has no package of its own. To get the old value, use `facts.map((f) => f.fact)`.

Fix the package manager chosen for a package that both a nested workspace root and an outer root list. If the nearest root has no lockfile, marker or pin, detection now checks each outer root that lists the package, nearest first. Before, it fell back to npm. A package that no workspace lists still does not take a lockfile from a parent directory.
