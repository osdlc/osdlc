---
"@osdlc/typed-git": patch
---

The fixes from the first-release review. CI published 0.5.0 from the code as it was moved into this repository, before these fixes. This release changes 0.5.0 as listed below. Some changes break callers of 0.5.0. They are marked `Breaking:`. This is an exception to the rule that breaking changes ship in a new minor: the version stays on 0.5 to match the Rust twin, the crate `typed-git`, which keeps the same major and minor version.

- Breaking: the licence is now `MIT OR Apache-2.0`, with `LICENSE-MIT` and `LICENSE-APACHE`. 0.5.0 was `MIT`.
- `engines.node` is now `^22.22.2 || ^24.15.0 || >=26.0.0`, the range `hosted-git-info` needs.
- The package is supported on macOS, Linux and Windows. CI runs Linux and macOS. Windows is not tested in CI yet. The tested minimum git is the oldest git CI runs: 2.55.0 on 2026-10-20.
- Breaking: 42 verbs throw a `TypeError` before git runs when a ref, remote, URL, path, ref pattern or config key argument starts with `-`. This stops a value like `--upload-pack=...` or `--output=<file>` from reaching git as an option. In `log` this covers `rev`, `range` and each `notRefs` entry. In `diffNameOnly` and `diffStat` it covers each `rangeArgs` token. The message is `typed-git: <verb>: <param> must not start with "-" (got "...")`. `try` and `soft` do not catch it. On `AsyncGit` with `cliBackend` it is a rejection, and a backend that is not the CLI gets the request unchecked. `revParse` is not guarded, because it passes flags on by design. Paths still go after `--`. To pass a path that starts with `-`, write `./-name`. For the previous branch, write `@{-1}` instead of `-` in `checkout` and `merge`.
- `grep` passes its pattern with `-e`, so a pattern that starts with `-` is searched for. Before, git read it as an option.
- Breaking: `diffText` follows the failure contract. It declares no absent exit codes. A bad rev (exit 128) and a directory outside a repository (exit 129) throw `CommandFailed`, and `git.try.diffText` gives `{ ok: false }`. An empty string now means only that nothing differs. Callers that read `""` as "no diff" on a failure must handle the throw.
- Breaking: `diffAddedFile` follows the contract. Exit 1 with output is success. Exit 1 with empty output (a path git cannot read) and exit 2 throw `CommandFailed`. Before, both gave `""`.
- Breaking: `soft.configRemoveSection` is removed, from the soft table and the `Soft` type. The plain verb still returns `false` when there is no such section.
- Breaking: `gate` and the `GitVerb` type are no longer exported from `.` or `./client`. `REF_FORMAT` and `parseRefRows` stay.
- Breaking: `checkoutSide(side, [])` returns without running git. Before, it threw on git's exit 128.
- `merge`, `rebase` and `rebaseContinue` run with `LC_ALL=C`, over the client, backend and call `env`. `fastForward`, `alreadyUpToDate` and `conflicts` no longer change with the caller's locale.
- `remotes()` on `Git` and `AsyncGit`, soft form too. `remote()` still works and is deprecated. It will be removed at 1.0.
- Call options (`timeoutMs`, `env`, and `signal` on the async side) are now taken by every method: `diffText(rev?, opts)`, `diffAddedFile(relPath, opts)` and `revParse(...args, opts)`, where a trailing non-string argument is the options object.
- New exported types from `.` and `./client`: `StatusEntry`, `CleanOptions`, `DiffCheckOptions`, `DiffCheckResult`, `CommitFlags` and `DiffTextOptions`.
- `./testing` exports `MakeOriginAndCheckoutOptions`, `OriginAndCheckout`, `MakeBareAndWorkerOptions` and `BareAndWorker`.
- `GitBackend`, `GitRequest`, `GitResults` and `partialBackend` are marked `@experimental`. They may change in a minor release, because each new verb adds a request kind. The `configGet` and `remoteGetUrl` requests now carry `scope` and `push`. A backend must honour them or reject.
- The README is rewritten. It now says that `./client` leaves out the URL parsers and the checkout walks, and so does not load `hosted-git-info`.
- `configGet` takes `{ scope }` (`'local'`, `'global'` or `'system'`), the same scope `configSet` takes. The new `ConfigScope` type names it.
- Breaking: `configGet` throws a `TypeError` before git runs when the key has no section or no name: no `.`, or a leading or trailing `.`. git exits 1 for such a key, and 0.5.0 read that as unset and returned `null`. `configGetAll` and `configGetBool` check the same.
- `configGetAll(key, { scope })` returns every value of a key, verbatim, and `[]` when the key is unset.
- `configGetBool(key, { scope })` returns the key read as a boolean by git (`config --type=bool`), and `null` when it is unset. A value git cannot read as a boolean throws.
- `remoteGetUrl` takes `{ push }` for the push URL. `remoteGetUrls(name, { push })` returns every URL of a remote, and `[]` for an unknown remote.
- `remoteHead(remote)` asks the remote for the branch its HEAD points at (`ls-remote --symref`). It returns the full refname, or `null` when the remote names none.
- `gitDir()` returns this worktree's own `.git` directory as an absolute path, or `null` outside a repository.
- `clone` takes `mirror`, `singleBranch` and `noTags`. `fetch` takes `depth` and `noTags`. With `mirror`, `noTags` has no effect and `singleBranch` holds for the clone only.
- Breaking: `clone` and `fetch` throw a `TypeError` before git runs when `depth` is not a positive integer. Before, git refused it and the call threw `CommandFailed`.
- Call options take `maxOutputBytes` on both clients, and `cliBackend` passes it to its runner.
- Breaking: a result whose output was cut short (`outputIncomplete`, at the output cap or a timeout) now throws `CommandFailed`, from every verb and from `rawChecked` on both clients. Before, the cut-short output was parsed as the answer.
- New exported types from `.` and `./client`: `ConfigScope`, `ConfigGetOptions` and `RemoteGetUrlOptions`.
