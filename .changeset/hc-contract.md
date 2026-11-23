---
"@osdlc/host-cleaner": minor
---

The plugin contract for the first version: every hook may return a promise and runs under a time limit with its own `ctx.signal`, so `survey`, `recheck`, `clean` and the command line's `main` now return promises; each plugin is one `definePlugin` value holding its settings schema and factory, with the shipped ones in `BUILT_IN_PLUGINS`, whose order is the run order (replacing `PLUGIN_ORDER` and `orderPlugins`); and a candidate is a path, which must sit inside its owner's roots or the targets whatever the plugin, or a ref with no folder (git's branches and Orca's records), with plans at version 2 (version 1 plans still read), `~` for the home folder in ids, and no run as root; and a candidate may say what deleting it costs (`costDescription`: `re-download`, `rebuild` or `lost`), where `lost` is held and needs `--allow discard-user-data`, and `status` shows the cost.
