---
"@osdlc/wayfinder": minor
---

The terminal UI and the web view show their first rows at once again, and `list --cached` says that its rows are cached.

- Each `list`, `query` and refresh saves the catalog it showed in one file under the cache directory (`views/v1/`). The terminal UI and `way serve` draw that file first, then probe and update in place. Reading the stored probes instead detects the project and hashes each runner's files, which took more than two seconds on a large repository before the first frame. The file is drawn only under the same trust and settings that produced it, and `way clean --cache` removes it.
- `way serve` holds its catalog between the page's requests. The page's first `list --cached` gets the catalog the server read at start instead of reading the store again, and its first `list` joins the probe the server started instead of starting another. A Refresh while a probe runs joins that probe. A request under other trust or settings, or with a filter, reads as before.
- The `list` and `query` documents gain `source` and `storedAt`. `source` is `"fresh"` when every runner was probed in this call and `"cached"` when the rows came from the store under `--cached`; `storedAt` is when the oldest stored rows were probed, or null when fresh. `--cached` with nothing stored still probes, and then says `"fresh"`. `list` without `--cached` probes as before.
- The terminal UI's first frame counts the Skills group, as later frames do.
