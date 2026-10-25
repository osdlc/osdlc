---
"@osdlc/wayfinder": minor
---

The terminal UI and the web view draw at once, and with no saved listing they show each runner's tasks as that runner answers.

- **Terminal UI:** the frame appears before anything is read. With no saved listing, each runner's rows arrive as it answers. A runner still loading has `…` in place of its tab's count and a `… moon  loading` line in the list, and the status line names them: `loading 3 of 12: just, mise, moon`. A withheld or failed runner shows its reason as soon as it answers. Over a saved listing the status line says `refreshing…` until every runner has answered, then the rows update in place. The store is no longer read before the first probe, since that costs as long as the probe's own detection.
- **Web view:** `way serve` prints its address without waiting for a probe. With no saved listing, the page's first read joins the server's probe and draws each runner as it arrives, with a loading tab and row for each runner still out and the same `loading N of M` count in the status. The lines stream as NDJSON over the same API, token and Host and Origin checks as every other call. Over rows already shown it says `refreshing…`.
- **Library:** `buildCatalog` takes `progress: { onRunners, onRunner }`, which hears about each runner as it answers. The `CatalogProgress` type is exported. The document it returns is unchanged.
- `list --json` and `list --output jsonl` print what they printed before.
- With a grant for one tool, the trusted and the withheld runners are now collected at the same time.
