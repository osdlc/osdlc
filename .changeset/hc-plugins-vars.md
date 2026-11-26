---
"@osdlc/host-cleaner": minor
---

`host-cleaner plugins` shows each descriptor's variables, with the value, the source that gave it and why each source before it failed, and names where each descriptor came from. A `detect` answer may carry `vars`, which `inspect` returns on each `PluginState`, and `inspect` says in `rootsFailed` why a detected plugin with a `roots` hook has no roots. A disabled plugin's JSON `reason` is `plugins.<name>.enabled is false`. A descriptor that can't be used has a row in `plugins`, and `DescriptorProblem` says where its file was found in `source`.
