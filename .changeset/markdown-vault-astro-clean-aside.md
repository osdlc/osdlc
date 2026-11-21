---
'@osdlc/markdown-vault-astro': minor
---

`--clean` builds each destination aside and swaps it in, so a run that fails partway leaves the destination as it was. Destination files with no counterpart in the build are reported; `--clean` now refuses to remove them (exit non-zero, names listed) unless `--yes` is passed. New `--dry-run` for `transform` and `export-vault`, new `yes`, `added`, `changed`, `removed` and `orphans` in the API, and a warning about orphans without `--clean`.
