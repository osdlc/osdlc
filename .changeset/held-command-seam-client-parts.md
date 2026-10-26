---
'@osdlc/command-seam': minor
---

New: the parts of a typed client over one program that do not depend on the program, moved down from `@osdlc/typed-git` and `@osdlc/typed-gh`. `runFailed(result, isAnswer?)` says whether a result must be read as a failure: it never exited, its output was cut short (`outputIncomplete`, even at exit 0), or it exited non-zero with a code `isAnswer` does not accept. `classifyFailed(failed, { binary, installHint? })` returns a `CommandFailed`'s failure with the `CommandFailed` as its `cause`, named for `binary` when the runner named none, with `installHint` as a `not-installed` failure's hint. `tryMethods` and `tryMethodsAsync` (types `TriedMethods`, `TriedMethodsAsync`) wrap a client so every method returns a `Result`, catching only what `recognize` turns into a failure. `methodFacade` is the proxy under them. `notAnOption(value, reject)` throws `reject(value)` for a positional argument that starts with `-`.
