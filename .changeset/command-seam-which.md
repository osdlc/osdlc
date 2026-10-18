---
'@osdlc/command-seam': minor
---

Add `which(binary, opts?)`, experimental: the absolute path a spawn of `binary` would run, or `undefined`, without running it. It uses the runners' lookup rules: a name with a `/` resolves against `cwd`, a bare name is searched on `PATH`, and a match must be an executable file. `opts` takes `cwd` and `env` (merged over the parent's, as the runners take it), typed `WhichOptions`. ([#236](https://github.com/osdlc/osdlc/issues/236))
