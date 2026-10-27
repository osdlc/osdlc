---
'@osdlc/cli-tool': minor
---

Adds `cli-tool-stamp-version`, a bin a CLI's `build` runs to write `src/version.generated.ts` with `VERSION` from its `package.json`, so `--version` is compiled in and matches the published version. `--check` exits 1 when the file is stale. `runMain` takes an optional `version`: a first argument of `--version` prints it and exits 0 without calling `main`.
