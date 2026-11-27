---
"@osdlc/host-cleaner": minor
---

Add the `ollama` plugin, which proposes models not pulled or changed for `idleHours`, refuses a loaded one, protests every other one `ollama-use-unknown` (ollama does not record when a model was last run) and removes them with `ollama rm`.
