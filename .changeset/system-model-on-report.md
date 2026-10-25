---
"@osdlc/system-model": minor
---

`CollectOptions` has two new callbacks, so a host can show each runner as it answers instead of waiting for the whole catalog. `onRunners` is called once, before any probe, with the runners the collect will report. `onReport` is called once per runner as its report is ready, withheld runners included. `collect` and `collectAndCache` still return the whole catalog.
