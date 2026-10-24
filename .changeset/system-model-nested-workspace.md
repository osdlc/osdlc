---
"@osdlc/system-model": patch
---

Fix the package manager for a package that a nested workspace root and an outer root both list. When the nearest root chooses no manager (no lockfile, marker or pin), the walk now tries every further root that covers the package, nearest first. Before, it fell back to npm. A package that no workspace lists still takes no lockfile from above.

Add `Detected.described` (experimental): the `describe` facts as `ToolFact`s, in the same order as `Detected.facts`, each with the directory it is about and its evidence. A fact's directory is no longer lost when that directory has no package of its own.
