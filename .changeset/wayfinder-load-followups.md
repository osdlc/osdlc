---
"@osdlc/wayfinder": minor
---

Loading finishes sooner and a hung tool no longer holds it up.

- New setting `runners.timeout`: how many seconds one runner may take to list its tasks, its subprocesses included. Set it in your user config (`way config set --user runners.timeout 20`), from 1 to 3600. A project file, or the web view's settings page, can only lower the limit: each runner takes the smaller of the project value and its own limit (or your user value). A project value above your user value is ignored with a warning. A runner still running then is stopped, the processes it started are killed, and it shows `timed out after 20 s` in place, in the terminal UI, the web view and `list --json`, like any failed runner. Unset or `null`, each runner has its own limit (10 s for just, 120 s for moon, 60 s for most). That limit now bounds the whole probe, not only each subprocess.
- The agent skills and the Skills tab appear while the runners load, not at the end. `list --progress` sends them on a `catalog-progress` line of their own, with `skills`, filtered like the final document. The terminal UI shows them with the first task rows, below them.
- The final status shows as soon as the last runner answers. The store is written after that, in the background, and every normal exit waits for it. A kill during the write leaves the old entry in place.
- Library: `CatalogProgress.onSkills`, called once as soon as the skills are read.
- The config file's `$schema` URL moves to `@osdlc/wayfinder@0.10`.
