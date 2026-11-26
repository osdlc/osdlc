---
"@osdlc/host-cleaner": minor
---

Add `descriptorPlugin`, which turns a tier 1 descriptor into a plugin built on the plugin kit: its folders per OS, globs, prunes and wipes, `inUse`, `project`, `supersededBy` and `system`, with the home and personal-folder checks. The re-check drops as `changed` a candidate that is held now and was not in the plan.
