---
'@osdlc/typed-git': minor
---

Byte-exact output. `rawBytes(argv, opts)` and `rawBytesChecked(argv, opts)` on `Git` and `AsyncGit` return stdout as a `Buffer`, the bytes git wrote, for output that is hashed or replayed: a blob, `status -z` with names that are not UTF-8, `diff --binary` of a file in another encoding. `rawBytesChecked` fails as `rawChecked` does. They run on a new `bytesRunner` option on `Git` and `cliBackend`, which defaults to command-seam's bytes runner when no `runner` is given. A client given a `runner` and no `bytesRunner` throws `UnsupportedRequest` from both, so an injected runner is never bypassed. All three are experimental, as command-seam's bytes runners are. `input` is still a string.

`statusEntries({ ignored: true })` adds `--ignored` and reports each ignored file as a `{ x: '!', y: '!' }` entry. `diffText(rev, { binary: true })` adds `--binary`, so a binary file's change is a patch `git apply` replays. `StatusEntriesOptions` is exported, and so are `spawnRunnerBytes`, `spawnRunnerBytesAsync`, `BytesCommandRunner` and `AsyncBytesCommandRunner` from command-seam.

The experimental backend seam gets a `rawBytes` request kind, and the `statusEntries` and `diffText` requests take the optional `ignored` and `binary` fields. A backend that ignores them answers without ignored files and without binary patches.
