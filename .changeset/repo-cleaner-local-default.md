---
"@osdlc/repo-cleaner": minor
---

**Breaking:** a sweep is local and offline by default. Every sweeping command now reads worktrees and local branches only, fetches nothing and never calls `gh`, which is much faster. `--remotes` (or `--only remotes`, or `--remote-url`) turns on all three: the fetch, the `gh` pull-request lookup and remote branches. `--no-fetch` and `--no-gh` still turn one off again. A local text report ends with a line saying what it left out. A plan written from a local sweep records `no_gh`, so `apply` does not call `gh` either. `--branch` follows the same rule: its remote branch is included only with `--remotes`.

`apply` re-checks only the categories its selected rows are in, so applying local rows from a plan no longer compares every remote branch again.

On a terminal, the report, the counts and the apply preview are colored: red for delete, blue for prune, yellow for review and skipped rows, green for keep. `NO_COLOR` turns it off; a pipe or file gets none unless `FORCE_COLOR` asks for it. The preview shown before `Delete N items?` now lists, per repository, each row to delete or prune with its command beneath, each skipped row with its reason, and the counts, with terminal controls stripped from paths, names and commands.

On a terminal, a long sweep step draws a progress bar on the status line. `apply` draws its steps as a vertical list redrawn in place: each row has its own bar, empty while waiting, half full while running, full with `✓` or `✗` when done, plus a bar for the whole run; a list taller than the terminal keeps the running step in view, and a failed step's error follows in full. It does not list the steps again under the counts. `ApplyOptions.onStart` (the planned steps, updated in place as they run) and `ApplyOptions.onStepDone` (each step after it finishes) are new.
