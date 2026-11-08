---
"@osdlc/repo-cleaner": minor
---

Run with no target from a subdirectory of a checkout, `repo-cleaner` now sweeps that checkout instead of finding nothing and exiting 10. The current directory is still searched first, so a directory of checkouts that sits inside a checkout of its own, such as a home directory kept in git, still sweeps the checkouts below it. A subdirectory named as a target is read as written, as before.
