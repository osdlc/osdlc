---
"@osdlc/wayfinder": minor
---

The terminal UI and the web view show their first rows at once again, and `list --cached` is fast and says that its rows are cached.

- Each `list`, `query` and refresh saves the catalog it showed in one file under the cache directory (`views/v1/`), one file per trust and settings. The terminal UI and `way serve` draw that file first, then probe and update in place. Reading the stored probes instead detects the project and hashes each runner's files, which took more than two seconds on a large repository before the first frame. A file that is too large or not a saved listing is deleted and the store is read instead. `way clean --cache` removes them all.
- A task from a saved or stored listing is checked before it runs: its runner is probed again, and a task that is gone, or whose command or directory changed, is refused with the command it runs now. This applies to Enter in the terminal UI before its first probe ends, to Run in the web view, and to `way run --cached`. A dry run is a preview and is not checked. A task whose directory is outside the repository is never run.
- `way serve` holds its catalog between the page's requests. The page's first `list --cached` gets the catalog the server read at start, and its first fresh read and its polls join the probe already running. Refresh always starts a probe. A probe stops when the server stops, including when Run hands the terminal to a task, and a tab that closes does not stop a probe other tabs wait on.
- The terminal UI's first frame counts the Skills group, as later frames do.

Breaking changes, and what to do:

- `--cached` on `list`, `query` and `run` now answers from the last saved listing when there is one, and does not check whether files changed since its `storedAt`. stderr says so: `--cached: the last listing, 35s old; files changed since storedAt are not checked`. With no saved listing it reads the stored probes and checks them, as before. If you need files checked, drop `--cached`: a full listing probes every runner.
- The `list` and `query` documents gain two required fields. `source` is `"fresh"` when every runner was probed in this call and `"cached"` when the rows came from the saved listing or the store under `--cached`; `storedAt` is when the oldest stored rows were probed, or null when fresh. `--cached` with nothing stored still probes, and then says `"fresh"`. Code that builds a `CatalogDocument` must set both fields.
