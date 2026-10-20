---
"@osdlc/typed-git": minor
---

First public release, as `@osdlc/typed-git`. The package was called `@sksizer/easy-git` and was never published under that name. A typed wrapper around the `git` command line for TypeScript, in a sync form (`Git`) and an awaitable form (`AsyncGit`). Each verb declares what absence means for it, and every other failure throws `CommandFailed`. `git.try.*` returns the failure as a value, `git.soft.*` folds it into the absence value, and `raw()` bypasses both. The awaitable client runs over a `GitBackend`, which drives the git CLI by default. The package is dual licensed `MIT OR Apache-2.0`, and `engines.node` is `^22.22.2 || ^24.15.0 || >=26.0.0`, the range `hosted-git-info` needs. It is supported on macOS, Linux and Windows. CI runs Linux and macOS.

Changes for anyone who used the in-repository 0.4.x:

- Breaking: 29 verbs throw a `TypeError` before git runs when a ref, remote, URL or path argument starts with `-`. This stops a value like `--upload-pack=...` from reaching git as an option. The message is `typed-git: <verb>: <param> must not start with "-" (got "...")`. `try` and `soft` do not catch it. On `AsyncGit` with `cliBackend` it is a rejection, and a backend that is not the CLI gets the request unchecked. `revParse` is not guarded, because it passes flags on by design. Paths still go after `--`. To pass a path that starts with `-`, write `./-name`. For the previous branch, write `@{-1}` instead of `-` in `checkout` and `merge`.
- Breaking: `diffText` follows the failure contract. Its absence value is now `[]`. A bad rev (exit 128) and a directory outside a repository (exit 129) throw `CommandFailed`, and `git.try.diffText` gives `{ ok: false }`. An empty string now means only that nothing differs. Callers that read `""` as "no diff" on a failure must handle the throw.
- Breaking: `diffAddedFile` follows the contract. Exit 1 with output is success. Exit 1 with empty output (a path git cannot read) and exit 2 throw `CommandFailed`. Before, both gave `""`.
- Breaking: `soft.configRemoveSection` is removed, from the soft table and the `Soft` type. The plain verb still returns `false` when there is no such section.
- Breaking: `gate` and the `GitVerb` type are no longer exported from `.` or `./client`. `REF_FORMAT` and `parseRefRows` stay.
- Breaking: `checkoutSide(side, [])` returns without running git. Before, it threw on git's exit 128.
- `merge`, `rebase` and `rebaseContinue` run with `LC_ALL=C`, over the client, backend and call `env`. `fastForward`, `alreadyUpToDate` and `conflicts` no longer change with the caller's locale.
- Breaking: `push` `forceWithLease` takes a structured `{ ref, expect }` (`expect: null` means the ref must be absent) in place of a `<ref>:<sha>` string. `true` is still accepted. It is the unsafe bare form and overwrites whatever is there, so pin with `{ ref, expect }`. `forceWithLeaseArg(lease)` formats a lease.
- Breaking: `add` always puts `--` before the paths. A flag in the list, such as `['-A', '.']`, must use the `all` option.

Additions:

- `remotes()` on `Git` and `AsyncGit`, soft form too. `remote()` still works and is deprecated. It will be removed at 1.0.
- `checkIgnoreVerbose(paths)`, sync and async: the matching ignore rule for each path, as `{ path, source, line, pattern }`.
- A `findRenames` option on `diffTree` (`-M`) reports a move as one rename record with its source path. It is off by default.
- Call options (`timeoutMs`, `env`, and `signal` on the async side) are now taken by every method: `diffText(rev?, opts)`, `diffAddedFile(relPath, opts)` and `revParse(...args, opts)`, where a trailing non-string argument is the options object.
- New exported types from `.` and `./client`: `StatusEntry`, `CleanOptions`, `DiffCheckOptions`, `DiffCheckResult`, `CommitFlags` and `DiffTextOptions`.
- `./testing` exports `MakeOriginAndCheckoutOptions`, `OriginAndCheckout`, `MakeBareAndWorkerOptions` and `BareAndWorker`.
- `GitBackend`, `GitRequest`, `GitResults` and `partialBackend` are marked `@experimental`. They may change in a minor release, because each new verb adds a request kind.
- `./client` leaves out the URL parsers (`parseGitUrl`, `gitSshUrl`, `parseRepoRef`) and the checkout walks (`checkoutRoot`, `discoverCheckouts`, `scanForCheckouts`), and so does not load `hosted-git-info`.
- `@osdlc/command-seam` is a dependency at the current npm minor (`^0.7.0`) and is raised with each seam minor.
