---
"@osdlc/host-cleaner": minor
---

The `host-cleaner` command: `host-cleaner [target...]` reports, `host-cleaner plan` saves one plan, and `host-cleaner clean` re-checks, asks and runs it into one receipt, with `--adapter`, `--skip-adapter`, `--pick`, `--spare`, `--allow`, `--plan`, `--yes`, `--dry-run` and `--receipt`. A `config.json` in the config directory names default targets and each adapter's settings; receipts go to the state directory and a one-line log of each run to the logs directory, all under `@osdlc/tiered-dirs`' `host-cleaner` tier. The binary ships no adapter yet.
