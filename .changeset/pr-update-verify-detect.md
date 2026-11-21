---
"@osdlc/pr-update": minor
---

`pr_update.verify: detect`: a run that detects nothing is reported as a failed PR but not recorded as a failed attempt (`NothingDetectedError`, exported), and `config set pr_update.verify` and `config set pr_update.repair.mode` are command-line only, as the other command keys are.
