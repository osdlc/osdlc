---
'@osdlc/system-model': minor
---

**Breaking:** `Detected.facts` is now `ToolFact[]` instead of `unknown[]`. Each entry is `{ dir, fact, evidence }`, so a fact keeps the directory it is about when that directory has no package of its own. Read the old value as `facts.map((f) => f.fact)`.

Fix the package manager for a package that a nested workspace root and an outer root both list. When the nearest root chooses no manager (no lockfile, marker or pin), the walk now tries every further root that covers the package, nearest first. Before, it fell back to npm. A package that no workspace lists still takes no lockfile from above.
