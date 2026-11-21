---
'@osdlc/cli-tool': minor
---

A `list` flag can take its value only after `=` (`valueAfterEquals: true`). A bare `--remote` adds an empty entry, `--remote=upstream` adds `upstream`, and in `--remote upstream` the word stays a positional, so a flag whose usual form has no value cannot swallow the next argument. Help shows `--remote[=<name>]`.
