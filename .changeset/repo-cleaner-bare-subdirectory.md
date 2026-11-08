---
"@osdlc/repo-cleaner": minor
---

Run with no target from a subdirectory of a checkout, `repo-cleaner` now sweeps that checkout instead of finding nothing and exiting 10. It widens only when the search below finds no checkout and the checkout around tracks files in the directory, so `~/Developer` under a home directory kept in git still sweeps the checkouts below it. A subdirectory named as a target is read as written, as before.
