---
'@osdlc/pr-update': minor
---

`pr_update.restack: true | false` (default `false`) sets `update --restack` from the project config, so a project that always restacks need not pass the flag. The flag still turns it on for one run; there is no flag to turn it off for one run.
