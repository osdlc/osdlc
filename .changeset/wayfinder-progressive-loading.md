---
"@osdlc/wayfinder": minor
---

The terminal UI and the web view draw at once, and with no saved listing they show each runner's tasks as that runner answers.

- **Terminal UI:** the frame appears before anything is read. With no saved listing, each runner's rows arrive as it answers. A runner still loading has `…` in place of its tab's count and a `… moon  loading` line in the list, and the status line names them: `loading 3 of 12: just, mise, moon`. A withheld runner shows its reason as soon as it answers. A failed one gets ` !` on its tab and its reason above the rows. While rows arrive, the cursor stays on its task, so Enter runs the row on screen. Over a saved listing the status line says `refreshing…` until every runner has answered, then the rows update in place; after 3 seconds it names the runners still out. The store is no longer read before the first probe, since that costs as long as the probe's own detection.
- **Web view:** `way serve` prints its address without waiting for a probe. With no saved listing, the page's first read joins the server's probe and draws each runner as it arrives, with a loading tab and row for each runner still out, each in its final place, and the same `loading N of M` count in the status. A live region tells a screen reader when loading starts and ends. The lines stream as NDJSON over the same API, token and Host and Origin checks as every other call. Over rows already shown it says `refreshing…`.
- **Library:** `buildCatalog` takes `progress: { onRunners, onRunner }`, which hears about each runner as it answers. The `CatalogProgress` type is exported. The document it returns is unchanged.
- **CLI:** `list --progress --output jsonl` prints a `catalog-progress` line as each runner answers, before the reports. `way schema` describes it. Over HTTP the same lines stream as NDJSON. A report over about 1 MiB is named in `omitted` instead of sent.
- `list --json` and `list --output jsonl` print what they printed before.
- With a grant for one tool, the trusted and the withheld runners are now collected at the same time.
