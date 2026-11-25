---
"@osdlc/host-cleaner": minor
---

`clean --plan` refuses a plan whose candidates belong to a plugin this install does not have, and a config entry for an unknown plugin name is now a warning instead of an error (also in `status --format json`'s `warnings`), unless the entry sets `package`, which is still refused.
