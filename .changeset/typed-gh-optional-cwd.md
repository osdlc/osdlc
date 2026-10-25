---
"@osdlc/typed-gh": minor
---

`Gh` and `AsyncGh` take a second constructor form, `new Gh({ repo, hostname?, runner? })`, for a client that names a repository and needs no directory. `repo` is required in that form: `new Gh({})` does not typecheck and throws `TypeError`, so clone-relative use still names its directory. Each call runs in `process.cwd()`, read when the call is made. `cwd` is now a getter that returns that directory, still typed `readonly string`. `at(cwd)` on such a client gives one rooted at `cwd`, and `withRepo` keeps the form. `new Gh(cwd, options?)` is unchanged. New types `GhRepoOptions` and `AsyncGhRepoOptions` are `GhOptions` and `AsyncGhOptions` with `repo` required.
