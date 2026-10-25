---
"@osdlc/wayfinder": minor
---

Loading finishes sooner and a hung tool no longer holds it up.

- New setting `runners.timeout`: how many seconds one runner may take to list its tasks, its subprocesses included. Either config file may set it (`way config set runners.timeout 20`). A runner still running then is stopped, the processes it started are killed, and it shows `timed out after 20 s` in place, in the terminal UI, the web view and `list --json`, like any failed runner. Unset or `null`, each runner has its own limit (10 s for just, 120 s for moon, 60 s for most). That limit now bounds the whole probe, not only each subprocess.
- The agent skills and the Skills tab appear while the runners load, not at the end. `list --progress` sends them on a `catalog-progress` line of their own, with `skills`. The terminal UI shows them with the first task rows, below them.
- The final status shows as soon as the last runner answers. The store is written after that, in the background, and every way out waits for it, so nothing is lost on quit.
- Library: `CatalogProgress.onSkills`, called once as soon as the skills are read.
