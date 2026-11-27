---
"@osdlc/host-cleaner": minor
---

Add the `@osdlc/host-cleaner/plugin` entry for writing a plugin, with `z` and `CommandFailed` re-exported (the main entry exports all of it too), and a guide to writing, testing and publishing one; `create` no longer gets `only`, which the `git` plugin now takes as an option: `gitDefinitionWith({ sweep: { only } })`, exported from the main entry.
