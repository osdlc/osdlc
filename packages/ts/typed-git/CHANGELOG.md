# @osdlc/typed-git

## 0.9.0

### Minor Changes

- b835ae4: Behaviour change: `mainCheckout()` now answers null for a bare store with no main checkout, instead of the store's parent folder. When the common dir is not `<checkout>/.git` (a submodule, a `--separate-git-dir` clone), it reads `core.worktree`, this checkout when the cwd is the main worktree, or the first non-bare `worktree list` entry.
  `branches()` lists `refs/heads/` names, so a branch that shares its name with a tag is no longer reported as `heads/<name>`. `statusEntries()` skips the source field of a rename or copy in the worktree column too, so the entry after it is no longer misread. `parseRepoRef` reads a GitLab page in a nested group (`…/group/sub/repo/-/…`) as the whole project path, and still reads a GitHub page whose path holds a `-` segment. `parseRemoteUrl` answers null for a `file://` URL and strips `.git` from `repo.git/`. `scanForCheckouts` on a folder that is itself a checkout answers that folder alone.
- fdef74f: New verbs and verb options, on both `Git` and `AsyncGit`, for operations that needed `raw` before:
  
  - `worktreeAdd(path, { branch, resetBranch: true })` is `worktree add -B`: create the branch, or reset an existing one. This is the same shape as `checkout`'s `resetBranch`. `resetBranch` without `branch` throws a `TypeError`.
  - `commit({ ..., paths })` appends `-- <paths…>`, with every message source, so only those paths are committed. An empty `paths` throws a `TypeError`, because git would commit everything staged.
  - `push(remote, refspec, { delete: true })` is `push --delete`, and combines with `forceWithLease`.
  - `hasStagedChanges()` is `diff --cached --quiet`: `true` for exit 1, `false` for exit 0, and a throw for anything else. On an unborn HEAD the index is compared against the empty tree. `git.soft.hasStagedChanges()` falls back to `false`.
  - `showAtRevChecked(rev, path)` runs the same `show` as `showAtRev`, but a missing path throws the classified failure instead of returning `null`.
  - `remoteSetHead(remote, { branch } | { auto: true } | { delete: true })` and `remoteSetBranches(remote, branches, { add })`. An empty `branches` throws a `TypeError`.
  - `gc({ auto, aggressive, prune, quiet })`, where `prune` is a date string or `false` for `--no-prune`.
  
  The new option types `WorktreeAddOptions`, `PushOptions`, `RemoteSetHeadOptions`, `RemoteSetBranchesOptions` and `GcOptions` are exported. `GitRequest` and `GitResults` gain the `hasStagedChanges`, `showAtRevChecked`, `remoteSetHead`, `remoteSetBranches` and `gc` kinds.
  
  Fixed: `worktreeAdd` and `checkout` now refuse a `branch` that starts with `-`, as every other positional value already was. `worktree add` passes the name to a child `git branch`, so `worktreeAdd(path, { branch: '-M', resetBranch: true, startPoint: 'x' })` used to rename the current branch to `x` before failing.

### Patch Changes

- Updated dependencies [b835ae4]
  - @osdlc/command-seam@0.13.0

## 0.8.2

### Patch Changes

- f013f38: The default runners now find `git` and `gh` on absolute `PATH` entries only, and spawn the absolute path found. Before, a bare `git` or `gh` was spawned by name with the child's `cwd` set to the checkout, so a file of that name in the checkout could run in place of the real binary: on Windows, where a bare name is searched in `cwd` first, and on every platform through a relative or empty `PATH` entry. A binary that is not found on an absolute entry fails as a missing binary (`not-installed`). typed-gh's `defaultRunnerFactory` does the same lookup. An injected runner is unchanged.
- Updated dependencies [f013f38]
  - @osdlc/command-seam@0.12.1

## 0.8.1

### Patch Changes

- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
  - @osdlc/command-seam@0.12.0

## 0.8.0

### Minor Changes

- 1a44195: New `pushPorcelain(remote, refspec, { atomic, forceWithLease })` on `Git` and `AsyncGit`. It runs `git push --porcelain` and returns one result per ref: `{ src, dst, flag, summary, rawReason }`. A rejected ref (`flag: '!'`) also has a typed `rejection` and the remote's `detail` line, and checking `flag` narrows the type. `rejection` is one of `stale`, `non-fast-forward`, `tag-exists`, `already-exists`, `ref-conflict`, `lock-failed`, `hook-declined` or `other`, so you no longer read git's stderr to learn why a push failed. The reason is read from git's text, including the remote's `cannot lock ref` line, not from the local git version. So the old and new wordings, such as `(failed to update ref)` from older git and `(refname conflict)` from git 2.53 and 2.54, map to the same value. A failure that reaches no ref, such as an unknown remote, a network or auth problem, or a local pre-push hook, still throws the classified failure. `forceWithLease` also takes one lease per ref. `refspec` takes a list. An empty lease list throws a `TypeError` rather than pushing with no lease.

## 0.7.2

### Patch Changes

- Updated dependencies [0cf31de]
  - @osdlc/command-seam@0.11.0

## 0.7.1

### Patch Changes

- Updated dependencies [910deca]
  - @osdlc/command-seam@0.10.0

## 0.7.0

### Minor Changes

- b5aac07: When a git call fails and throws a `FailureError`, the error's `message` now starts with the git command, for example `git push: The remote 'origin' does not exist or is not a git repository.`, followed by the hint. Before, the message had no command, so code that ran several git calls in one `try` could not tell which one failed. `failure.message` is unchanged.
  
  The new `describeGitFailure(failure)` builds the same `git <verb>: <message> <hint>` line for a failure returned by `git.try.*`.
  
  If your code matches on the text of a thrown git error's `message`, it will now see the `git <verb>: ` prefix. Match on `error.failure.kind` instead.

### Patch Changes

- 41ef520: Fix two type errors under TypeScript 5.9. The emitted `outcome.d.ts` failed with TS2536, because `Soft<C>` used a key on `Triable<C>` that TS 5.x could not prove valid. The source failed with TS2322, because `Git.soft` and `AsyncGit.soft` inferred `this` instead of the class type. A new `typecheck:ts59` script checks the package under 5.9.

## 0.6.0

### Minor Changes

- d9b0f77: **Breaking:** typed-git's plain door throws the classified failure, as typed-gh's does. A failed git call (any verb, `rawChecked`) now throws a `FailureError` whose `failure` is the `GitFailure` and whose `failure.cause` is the `CommandFailed`, where it threw the `CommandFailed` itself. The bare `CommandFailed` had only command-seam's generic `exit` kind, so a signed-out `git push` exited 1 from `runMain` instead of 23. Read `error.failure.argv` and `error.failure.cause.result` where you read `error.argv` and `error.result`.
  
  New `GitFailureKind` `tls`: `unable to access … SSL certificate problem` is no longer `remote-unreachable`. The host answered, so retrying cannot help until the system clock, the CA certificates or the remote's certificate is fixed. `@osdlc/cli-tool` numbers `tls` 23, with the other "fix it" failures; `@osdlc/pr-update` accounts for it in its exit-table check and reads a push failure through the `FailureError`'s cause.
- d9b0f77: **Breaking:** `git.try.*` returns `Result<T, GitFailure>` from `@osdlc/result`. `GitOutcome` is removed. The error is a classified `GitFailure` (`kind`, `message`, `hint`, `detail`, `argv`, `exitCode`) and its `cause` is the `CommandFailed`; read the raw result at `error.cause.result`. `kind` is a `GitFailureKind`: every `@osdlc/command-seam` failure kind (`not-installed` carries the hint `Install git from https://git-scm.com.`), plus `not-a-repo`, `no-remote`, `remote-unreachable` and `not-authenticated`, read from git's stderr. `classifyGitFailure(commandFailed)` is exported. The plain verb (throws `CommandFailed`) and `git.soft.*` are unchanged. `@osdlc/result` is now a dependency.
- d9b0f77: A git failure with an HTTP status is no longer `remote-unreachable`. `unable to access … The requested URL returned error: 401` or `403` is `not-authenticated`, and `404` is the new kind `not-found` (`GitFailureKind` gains it), so a script that retries on `remote-unreachable` does not loop on a permission or wrong-URL problem. A refused connection, a DNS failure and a timeout stay `remote-unreachable`. The `try` and `soft` doors recognise a thrown `CommandFailed` by shape, so two installed copies of `@osdlc/command-seam` agree.

### Patch Changes

- fb712e0: Ship the compiled `dist/` only. The `bun` export condition and the TypeScript source are no longer in the package, so Bun, Node and every bundler load the same compiled ESM and `.d.ts` files. Bun still works through the compiled `dist/`.
- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [fb712e0]
- Updated dependencies [fb712e0]
- Updated dependencies [d9b0f77]
  - @osdlc/command-seam@0.9.0
  - @osdlc/result@0.1.0

## 0.5.3

### Patch Changes

- 4d13bd9: The Apache-2.0 licence file now names the same copyright holder as the MIT file: sksizer. It said "Sizer LLC".

## 0.5.2

### Patch Changes

- Updated dependencies [ac5f0d1]
  - @osdlc/command-seam@0.8.0

## 0.5.1

### Patch Changes

- e6af15f: The fixes from the first-release review. CI published 0.5.0 from the code as it was moved into this repository, before these fixes. This release changes 0.5.0 as listed below. Some changes break callers of 0.5.0. They are marked `Breaking:`. This is an exception to the rule that breaking changes ship in a new minor: the version stays on 0.5 to match the Rust twin, the crate `typed-git`, which keeps the same major and minor version.
  
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

## 0.5.0

Published to npm on 2026-10-20 by CI, from the code as it was moved into
osdlc/osdlc. Licence `MIT`. It was the first npm release. The package was
first called `easy-git` and was never published under that name.

Two additions were made at the move:

- `checkIgnoreVerbose(paths)` (sync and async): the matching ignore rule for each path, as
  `{ path, source, line, pattern }` (`git check-ignore -v --stdin -z`).
- `diffTree` option `findRenames` (`-M`): report a move as one rename record with its source
  path. Off by default, so existing calls are unchanged.

The rest of 0.5.0 was made before the move:

### Changed

- **BREAKING:** `push` `forceWithLease` takes a structured `ForceLease` (`{ ref, expect }`,
  `expect: null` for "ref must be absent") instead of a pre-formatted
  `<ref>:<sha>` string; callers no longer build the lease spelling, and an
  empty ref or oid is refused. `forceWithLeaseArg(lease)` is the exported pure
  formatter. Hard cutover: the string form is gone.

- **BREAKING:** `add` always puts `--` before the paths, so a path starting with `-` is
  staged as a path, not read as an option. Before, `--` came only with
  `intentToAdd`. A caller that passed a flag in the list (`['-A', '.']`) must
  now use the `all` option instead.

### Added

`runner` on `Git` and `backend` on `AsyncGit` accept an explicit `undefined`
(same as omitting), so an optional runner passes straight through.

`git.soft.*` — the tolerant door. Every verb that returns `null`, `[]` or
`false` for absence returns that value when git fails instead of throwing, on
both `Git` and `AsyncGit`, from one shared table. `false` is the fallback for
boolean verbs too, so `soft.isDirty` reads a broken repo as clean; do not gate a
destructive action on it. `statusPorcelain()` strips a trailing `\r` from each
line, for every caller: the plain verb, `try` and `soft` alike.

`remoteOwnerRepo(remote = 'origin')` on `Git` and `AsyncGit` — the
`{ owner, repo, host, port }` a remote's URL names, or null when there is no
such remote or the URL names no project. Backed by `parseRemoteUrl`, a
host-agnostic clone-URL parser (self-hosted hosts included, port carried)
that, unlike `parseGitUrl`, is on the `./client` entry.

`commit({ messageStdin })` — `git commit -F -` with the message on stdin, so
no temp file is needed. `CommitOptions` is now a union: `message`/`body`,
`messageFile` and `messageStdin` are mutually exclusive in the types (a
`messageFile` with `body` no longer type-checks; it was silently ignored).

`configRemoveSection(name)` — `git config --remove-section`, returning false
when the section was absent rather than failing.

`lsFilesTagged()` — tracked files with their `ls-files -v` tag. The tag is
the only place git shows the skip-worktree (`S`) and assume-unchanged
(lowercase) flags, which hide edits from `status`. `lsFiles` takes
`directory` for `--directory`. `Worktree` rows carry `locked` and
`lockReason`, read from the porcelain `locked` line.
`deleteRef(ref, { expected })` — `update-ref -d <ref> <expected>`, which
deletes `ref` only while it still points at `expected`. A branch delete
judged minutes earlier then cannot take commits pushed in between.

`statusEntries()` — every changed or untracked file from
`status --porcelain -z --untracked-files=all`, as `{ x, y, path }`. A rename
yields one entry with its destination path.

`diffCheck({ paths })` — `git diff --check` as `{ ok, output }`. Findings come
back as `ok: false`; only a git failure throws.

`clean({ directories })` — `git clean -f`, or `-fd` with `directories`.

`add(paths, { intentToAdd })` — `--intent-to-add`.

`diffStat({ rangeArgs, paths })` — the `git diff --stat` summary as raw
stdout, on both clients.

## History before the first npm release

These versions were not published.

### [0.4.0] - 2026-09-12 (unpublished)

#### Added

`mainCheckout()` — the primary checkout that owns this working directory, or
null outside a repository. Correct from inside a linked worktree, which is
the whole reason it is worth a method: `gitCommonDir()` is worktree-aware and
absolute, so its parent is the answer in both cases. Three consumers had
worked that out separately and written the same two lines, each with its own
comment explaining why the dedicated verb rather than `revParse`.

`symbolicRef(ref)` — what a symbolic ref points at, or null when it is not
one. `absent: [128]` because "not a symbolic ref" is the ordinary answer for
`refs/remotes/<remote>/HEAD`, which is unset in any clone whose remote HEAD
was never fetched. Callers were reaching for `raw()` and reading the exit
code, which is the escape hatch this package tells them to avoid.

`discoverCheckouts(dir, opts?)` and `scanForCheckouts(dir, opts?)` — the
checkouts under a directory, sorted; the second also reports what the walk
cost. A pure filesystem walk beside `checkoutRoot`: it descends through
directories that are not checkouts and stops at the ones that are, which is
the shape of "where a person keeps their repositories" — an owner directory
per GitHub org, a folder per client. Stopping at a checkout is also what
keeps it cheap, since `node_modules` and vendored trees sit below one.

Three bounds keep a search root pointed at the wrong place from becoming a
full-disk walk: dotted children are skipped, `maxDepth` (default 3) stops the
descent, and past `warnAfter` directories (default 10,000) `onWarn` fires
once — a line on stderr unless the host passes its own. The warning is
mid-walk on purpose: a walk that takes a noticeable amount of time should say
why while it is still happening. `CheckoutScan` carries `directoriesScanned`
and `depthLimited` alongside the results, so a caller can report the cost or
notice that the depth cap is why a repository is missing.

A linked worktree answers like a checkout, since both carry a `.git` entry; a
caller wanting one row per repository resolves each through `mainCheckout()`
and de-duplicates.
`parseRepoRef` — any reference a person might paste (a clone URL, the page
of a pull request or a file, a bare `owner/repo`) reduced to one coordinate
and one clone URL. `parseGitUrl` refuses web pages because it reads
`/pull/12` as part of the project path; this retries an http(s) input with
its path cut to `/<owner>/<repo>`, so the repository survives whatever page
it was copied from. An explicit protocol is kept; shorthand takes the
`protocol` argument.

`mergeTree` — `git merge-tree --write-tree`, which answers "would this merge,
and where would it conflict" against the object database alone: no index, no
checkout, no worktree. Predicting every open PR's merge across a large
repository costs seconds; checking each one out to learn the same thing costs
minutes, and most of them merge cleanly. The `tree` it returns is a real
object, so a clean prediction is also the answer — a caller that only needs
the merge commit never checks anything out.

Its conflict list is authoritative, unlike `merge`'s: git names the paths in a
machine-readable section rather than in translatable prose, so there is no
follow-up `lsFilesUnmerged` to make. The verb passes `-z` because git
otherwise C-quotes any path that needs it, and a caller matching those strings
against real paths silently misses the files most worth attention.

`merge-tree` sets the same trap as `merge`: measured against git 2.50.1, a
conflict and a name it cannot merge both exit 1, and only stdout separates
them.

#### Changed

- `Git.push` / `AsyncGit.push` accept `forceWithLease: string`, matching the
  verb, which has taken the pinned `<ref>:<sha>` form since it was written.
  The clients narrowed it to `boolean`, so the only form that actually
  protects against a concurrent push was unreachable through them: a bare
  `--force-with-lease` compares against the remote-tracking ref, which a fetch
  earlier in the same process may have just updated.

#### Fixed

A git that never ran read as a declared absence. The subprocess seam reports
`exitCode: 1` for a child that never gave one — `git` missing from PATH, a
timeout kill, an abort — and 1 is the absence code of half the verb table, so
`configGet` answered null, `checkIgnore` an empty set, `isAncestor` and
`hasHistory` false, for a git that had not been consulted. `gate` now throws
`CommandFailed` on any result the seam flagged `neverExited`, whatever the
verb declares.

`diffTreeNumstat` truncated a path containing a TAB. The `--numstat -z` record
is `<added>\t<deleted>\t<path>` with the path half raw — `-z` turns off git's
quoting — and the parser split on every tab, so a file named `a<TAB>b.txt` came
back as `a`. It now splits at the first two tabs only.

`AsyncGit.merge`, `.rebase` and `.checkout` spread their whole option bag into
the `GitRequest`, so `signal`, `timeoutMs` and `env` rode into a value that is
documented as serializable data — a backend that clones or logs a request threw
`DataCloneError` on the `AbortSignal`. They now split the bag like every other
method.

A `CommandFailed` raised from inside a verb's `parse` — `aheadBehind` on
unreadable stdout, `merge`/`rebase`/`rebaseContinue` on a refusal — reported the
verb's bare argv, dropping a repository-bound client's `--git-dir`/`--work-tree`
prefix that every exit-code failure already reports. `GitVerb.parse` now takes
the argv that ran as its second argument and those sites report it.

### [0.3.0] - 2026-09-01 (unpublished)

#### Added — integration verbs, and a fourth thing an exit code can mean

`merge`, `mergeAbort`, `rebase`, `rebaseAbort`, `rebaseContinue`,
`lsFilesUnmerged`, `checkout`, `checkoutSide`.

The client could ask where a branch stood but not move it, so every caller
that needed a merge reached for `raw()` and hand-parsed git's prose.

`merge` and `rebase` declare `absent: [1]`: a conflict is the outcome the
caller asked about, not a failure to report. They return
`{ status: "clean", … } | { status: "conflict", conflicts }`.

The exit code alone cannot carry that. Measured against git 2.50.1: **`git
merge` on an unresolvable ref exits 1, exactly like a conflict** (`rebase` exits
128 there, so the two verbs do not even agree); "would overwrite local changes"
exits 2; a merge already in progress, unrelated histories, and being outside a
repository all exit 128.
What separates a conflict from a refusal is that a conflict writes its report
to stdout and a refusal writes nothing there — a structural signal, not a
string match, because git's messages are translatable and a locale must not
change what an outcome means. An exit-1 refusal throws like any other broken
invocation.

The outcome's `conflicts` is git's own report and is documented as a summary:
rename/rename and rename/delete have no parseable form in it. `lsFilesUnmerged()`
is the authoritative list, and its stage detail is what distinguishes
both-modified (1/2/3) from we-deleted (1+3) and they-deleted (1+2) — a
resolver that assumes both-modified deletes files.

`checkoutSide` documents the edge git leaves: on a path that is not conflicted
it exits 0 and does nothing, so there is no error to catch.

#### Changed

- **`push` accepts a pinned lease.** `forceWithLease` widened from `boolean`
  to `boolean | string`; a string becomes `--force-with-lease=<ref>:<sha>`.
  The bare flag trusts whatever the local remote-tracking ref says, and a
  background fetch can quietly bring that up to date — after which the lease
  vetoes nothing and a concurrent push is erased.

### [0.2.0] - 2026-09-01 (unpublished)

#### Breaking — queries now throw on failure

A query used to fold every non-zero exit into its absence value (`null`, `[]`,
`false`). That made "git broke" indistinguishable from "nothing there", and
turned a failing guard into a passing one.

Every verb now declares the exit codes that mean *absence* for that verb —
`config --get` exits 1 for an unset key, `check-ignore` exits 1 for "none
ignored", `merge-base` exits 1 for unrelated histories. Those still return the absence
value. **Any other non-zero exit now throws `CommandFailed`**, carrying the
argv and the full result.

Call sites that read a value are unchanged: `git.currentBranch() ?? "detached"`
still reads exactly the same. Call sites that *tolerated* failure must move to
the new inspection door:

```ts
const r = git.try.topLevel();          // { ok: true, value } | { ok: false, error }
if (!r.ok) return fallback;            // r.error is a CommandFailed
```

`git.try.*` mirrors the whole client surface, sync and async (async returns a
promise of the same union). It reports **failures only** — a declared absence
is `{ ok: true, value: null }`, because absence is an answer.

`raw()` and `rawChecked()` are unchanged.

Specific behaviour changes to check for at your call sites:

- `revParse()` **throws** on a rev that does not resolve, unless you pass
  `--verify --quiet` (the flags under which git reports a missing ref as exit
  1 rather than 128). Those flags are about **refs**: for a non-ref query
  (`--is-inside-work-tree`, `--git-common-dir`) they mean nothing, so outside a
  repository `revParse` throws there too. `topLevel()` and `gitCommonDir()` are
  unaffected — they are their own verbs and still return `null` outside a
  repository, because for those two questions "not a repository" is a genuine
  answer.
- `lsRemote()` **throws** when the remote is unreachable (previously `null`).
  Its return type is now `RemoteRef[]`, not `RemoteRef[] | null`.
- `checkIgnore()` **throws** outside a repository (previously an empty `Set`).
  Exit 1 — "none of these paths are ignored" — still returns an empty `Set`.
- `statusPorcelain()`, `branches()`, `worktrees()`, `currentBranch()`
  **throw** outside a repository (previously `[]` / `null`).
- `mergeBase()` returns `null` only for unrelated histories (exit 1); a rev
  that does not resolve now throws.
- `objectExists()` is unchanged: it is a predicate, and both "missing object"
  (exit 1) and "unparseable name" (exit 128) remain `false`. **Do not use it as
  a repository-health probe** — see *Known limits*.
- `gitCommonDir()` now returns an **absolute** path (it passes
  `--path-format=absolute`). Bare `--git-common-dir` answers relative to the
  cwd — literally `.git` from a primary checkout — and every caller was
  re-anchoring it with `resolve(base, common)`. A caller that still wraps it in
  `resolve()` is correct but redundant; `resolve()` on an absolute path is
  idempotent.
- `Worktree` gains **`bare: boolean`**, read from the literal `bare` line
  `worktree list --porcelain` prints. Consumers were inferring it from
  `head === null`; that agrees with the porcelain today, but only by accident
  of what else prints a HEAD line (an unborn-HEAD checkout reports an all-zero
  HEAD, a prunable entry keeps the one it had). A structural type match on
  `Worktree` needs the new field.
- `CommandFailed` from a client bound with `gitDir` / `workTree` now reports
  the **prefixed** argv (`--git-dir=… --work-tree=… add -A .`), not the bare
  verb argv. A failure from such a client used to name no repository at all,
  which is the one thing the reader needs when several clients drive several
  stores. `gate(verb, result, argv?)` takes the argv to report; both clients
  pass what they actually ran.
- `GitVerb.checked` is **gone**. A mutation is exactly a verb with
  `absent: []`, so the two fields could contradict each other and one of them
  had to go. A custom `GitVerb` sets `absent` instead.
- `GitRequest` gains `topLevel` and `gitCommonDir` kinds. They were `revParse`
  with fixed args, which can no longer be right: 128 is an answer for them and
  a failure for `revParse`. A `partialBackend` that answered `revParse` on
  their behalf must handle the new kinds.

#### Added

- **Tier 1 verbs**, all declaring `absent: []` — no exit code is an answer, so
  a failure cannot read as an empty result:
  - `lsFiles({ cached, others, excludeStandard, paths })` — always `-z`, so no
    caller inherits git's quoting of unusual paths.
  - `forEachRef(pattern, { format, sort, count })` returning lines verbatim,
    plus the composed `refs(pattern)` giving `{ sha, ref }` rows in
    `ls-remote`'s shape. `pattern` takes one string or many.
  - `diffNameOnly({ cached, diffFilter, rangeArgs, paths })` — `rangeArgs` is
    argv tokens, so both `[base, "HEAD"]` and `["base...HEAD"]` are sayable.
    Named `rangeArgs`, not `range`, because `range` is a single string on
    `diffNameStatus` and `log`.
  - `diffNameStatus({ cached, range, noRenames, paths })` returning
    `DiffEntry[]`. The status token is verbatim (`R100`, not `R`) and a
    rename reports its DESTINATION path — a rename record is three NUL fields,
    not two, and a parser that pairs fields mislabels everything after the
    first one.
  - `log(opts)` returning **raw stdout, unsplit and untrimmed**. Callers frame
    their own records with `%x1e` / `%x1f` and interleave `--name-status`
    blocks, so line-splitting would destroy their data. `absent: []` is
    deliberate: an empty repository exits 128, the same code a corrupt one
    gives, so probe `hasHistory()` first or use `git.try.log()`.
- **Tier 2 verbs.** Two declare an absence code; the rest declare `absent: []`:
  - `lsTree(rev, { recursive, long, paths })` returning `TreeEntry[]`
    (`{ mode, type, sha, sizeBytes, path }`). Always `-z`. `sizeBytes` is set
    only for a blob under `long`. A rev that does not resolve throws, so an
    unreadable rev cannot read as "the tree is empty".
  - `diffTree(rev, { root, noRenames, paths })` — one commit's changes, sharing
    `diffNameStatus`'s parser and its `DiffEntry` rows exactly. Pass `root` for
    a commit that may be the first: without it a root commit reports **nothing**
    at exit 0.
  - `grep(pattern, { extendedRegexp, lineNumber, noColor, paths })` —
    **`absent: [1]`**, because `git grep` exits 1 for "no matches". A real
    failure is 128 (not a repository, an unbalanced regex) or 129 (a usage
    error) and throws. A pathspec matching no file also exits 1; git offers
    nothing to separate that from "no matches".
  - `isAncestor(a, b)` — **`absent: [1]`**. A genuine "no", whether the two
    have diverged or share no history, is 1; a rev that does not resolve is 128
    and throws, so a typo can no longer read as "not an ancestor".
  - `aheadBehind(base, tip)` returning `{ ahead, behind }`. The verb owns the
    field order: git prints the LEFT count first, and left is `base`, so that
    number is *behind*.
  - `configSet(key, value, { scope })` — the missing twin of `configGet`.
  - `init(path?, { bare, initialBranch, quiet })`; `path` defaults to the
    client's `cwd`.
  - `worktreeMove(from, to, { force })` — the one gap in the worktree family.
- **Options on existing verbs**, all leaving the previous argv byte-identical
  when they are absent:
  - `statusPorcelain({ paths })`.
  - `add(paths, { all, update })` — the verb could not express `git add -A`.
  - `commit({ body, amend, noVerify, signoff })`. `body` emits a second `-m`,
    which git renders after a blank line; it is ignored under `messageFile`,
    since git rejects `-F` with `-m`.
  - `lsRemote(remote, pattern?, { heads, tags })`.
- `DiffEntry` gains **`from`** — the SOURCE path of a rename or copy, set only
  on an `R`/`C` record. git already emitted it as the third field of those
  records; dropping it threw away the only half a caller reconciling paths
  across a rename can use. `diffTree` reports it too.
- `fetch` gains `quiet` and `noWriteFetchHead`, and takes an array of
  refspecs.
- **Ref, remote and line-count verbs**, on both clients:
  - `resolveRef(ref)` — `rev-parse --verify --quiet`, **`absent: [1]`**: a ref
    that does not resolve is `null`, an unreadable store still throws. Callers
    were spelling those two flags by hand.
  - `hasHistory()` — `resolveRef("HEAD") !== null`, the repository-health
    probe. **Not** `objectExists("HEAD")`, which folds a corrupt store into
    "nothing here yet".
  - `headRef()` — `rev-parse --abbrev-ref HEAD`, `absent: []`. Reports the
    literal `"HEAD"` on a detached HEAD, where `currentBranch()` answers
    `null`; an unborn HEAD exits 128 and throws.
  - `remote()` — configured remote names; `[]` when there are none.
  - `remoteGetUrl(name)` — **`absent: [2]`**, which is git's code for an
    unknown remote (not 1, not 128), so a missing remote is `null`.
  - `remoteAdd(name, url)`.
  - `logLines(opts)` — `log` plus a non-blank-line split, for a
    one-record-per-line format. `log` itself is unchanged and still returns
    raw bytes.
  - `diffTreeNumstat(rev, opts)` — `diff-tree --numstat -z`, returning
    `NumstatEntry[]` (`{ path, linesAdded, linesDeleted }`, `null` counts for a
    binary file). A separate verb rather than a `diffTree` option because git
    rejects `--numstat` together with `--name-status`.
- `git.try.*` — the inspection door, on both `Git` and `AsyncGit`.
- `GitOutcome<T>` — `{ ok: true; value: T } | { ok: false; error: CommandFailed }`.
- `GitVerb.absent` — the per-verb declaration of legitimate absence codes.
- `gate(verb, result, argv?)` — the library's single throw site, exported so a
  custom backend enforces the same contract the CLI one does. `argv` overrides
  what a `CommandFailed` reports, so a repository-bound client names the store
  it hit.
- `env` on `raw()` / `rawChecked()`, on `GitCallOptions`, and on every
  client method.
- **Client-level `env`** — `new Git(cwd, { env })` and `cliBackend({ env })`.
  Entries merged over the parent environment on *every* call the client makes,
  under any per-call `env`, and carried through `at()`. Binding an identity or
  a `GIT_SSH_COMMAND` once beats threading it through every call site, which is
  how one call quietly gets missed.
- `gitDir` / `workTree` on the `Git` constructor and on `cliBackend()`.
- `Worktree.bare`, read from the porcelain's literal `bare` line.
- **`./testing` grew the options that let it serve its own purpose.** It could
  not previously build the fixtures two consuming packages needed, and both
  hand-rolled instead:
  - `IDENTITY` is exported, so a date-asserting suite reads the pinned values
    rather than re-declaring an identity and hoping the two agree.
  - The identity is bound as the fixture client's **client-level `env`** rather
    than threaded per call. That fixes a real bug: `commit()`'s internal
    `rev-parse` did not get it, unlike the `add` / `commit` above it.
  - `makeGitFixture({ dir, parent, identity, prefix, initialBranch, bare })` —
    `dir` / `parent` let two related repositories share a directory, which
    `mkdtemp` into `os.tmpdir()` could not. `makeOriginAndCheckout` takes
    `parent` / `identity` too.
  - `makeBareAndWorker({ remoteName, parent, identity, initialBranch })` — a
    bare store plus an independently-inited worker with a named remote. **Not**
    a clone: the worker starts with no history and no tracking, so its first
    push is a genuine publish into an empty store — the shape a control plane
    keeping its state in refs on a shared store needs.
  - `fixture.commit(message, files, { date, env })` for a per-commit date.
  - It builds through the `configSet` and `init` verbs rather than
    `rawChecked(["config"|"init", …])`, and no longer writes `commit.gpgsign`
    on a bare store, where nothing is ever signed.
- Call options (`timeoutMs`, `signal`, `env`) on every client method, not just
  `lsRemote` / `fetch` / `push`.
- Subpath exports: `easy-git/client` (the clients without
  `hosted-git-info`) and `easy-git/testing` (a git fixture builder).

#### Known limits

- **Exit 128 is overloaded.** For `showAtRev` and `logSubject`, git spells both "not there" and "not
  a repository" as 128, so those two verbs must declare it absent and cannot separate absence from
  breakage. The contract narrows the failure surface; it does not eliminate it. Probe with
  `hasHistory()` when the difference matters — **not** `objectExists("HEAD")`. Measured against real
  stores, `cat-file -e HEAD` exits 128 on an empty repository, 1 on a dangling HEAD ref, and 128
  with the object directory removed, so `objectExists` answers `false` for all three and folds a
  corrupt store into "nothing here yet". `resolveRef("HEAD")` separates them: 1 (→ `null`) unborn, 0
  for a dangling ref, 128 (→ throw) for a missing object store.
- **`CommandFailed.message` interpolates stderr only.** Several git commands
  write the sentence that explains the failure to **stdout** — a rejecting
  hook, `commit` on a clean tree, `apply --check`. Report `e.detail`, which is
  both trimmed streams, newline-joined, empty ones dropped.
- **`checkIgnore` is a fail-closed caller's verb, and the default door
  throws.** A guard deciding whether a path may be read or published must use
  `git.try.checkIgnore` with an explicit `!ok` branch that refuses: it must
  neither let the `CommandFailed` escape nor read it as "not ignored".
- **Adjacent verbs disagree about "outside a repository".** `topLevel()` and
  `gitCommonDir()` return `null` there; `lsFiles()`, `checkIgnore()` and a
  variadic `revParse()` throw. Both are right — "not a repository" answers
  *where is the root?* but not *which files are here?* — but a null-check on
  the first does not make the second line safe.

### [0.1.0] - 2026-08-29 (unpublished)

Version 0.1.0 has never been published. Entries below are dated by commit.

The client and its subprocess seam were written in-place inside an
application (`lib/services/git/easy.ts` and `lib/util/command.ts`) and
promoted into a standalone package on 2026-07-20.

#### Added

- **`AsyncGit`, the awaitable client.** Same surface as `Git`, promised.
  For callers that must not block — a server, or work that fans out
  concurrently (2026-08-29).
- **The backend seam.** `AsyncGit` talks to a `GitBackend`, which takes a
  `GitRequest` — a plain, serializable description of one operation — and
  returns its typed result. Deliberately not argv: a backend built on a
  pure-JavaScript git has no argv to receive, so describing the operation
  rather than the invocation is what lets one client drive either.
  `cliBackend()` is the default and runs the CLI; `partialBackend(name,
  impl)` wraps an implementation that covers some operations and rejects
  the rest with `UnsupportedRequest` rather than failing as `undefined`.
  Because a request is data it can also be logged, queued, or replayed;
  `raw` is the one request that cannot cross that line, being argv by
  definition (2026-08-29).
- **The verb table.** Every argv and every parser is defined once in
  `verbs.ts`, and both clients drive it, so the sync and async surfaces
  cannot drift apart. The suite asserts it directly: the two clients run
  side by side against a recording runner and their argv are compared
  (2026-08-29).
- **The easyGit client.** One `Git` instance binds a cwd and a runner.
  The surface is tri-modal, drawn from a ~20-verb call-site survey:
  queries return parsed values and never throw (`null` / `[]` / `false`
  on absence), mutations throw `CommandFailed` on a non-zero exit, and
  `raw()` / `rawChecked()` are the unchecked escape hatches. Includes
  `worktree list --porcelain` parsing (2026-07-19).
- **Git reference parsing.** `parseGitUrl` and `gitSshUrl` turn any git
  reference — https, ssh, scp-style, `owner/repo` shorthand,
  `github:owner/repo` — into its host, owner, and project, and build the
  scp-style SSH clone URL from it. Built on `hosted-git-info`, which
  ships no usable types; `hosted-git-info.d.ts` declares the surface used
  here and the wrapper normalizes two upstream quirks (`undefined` on no
  match, `""` for an absent committish) to `null`, matching the query
  contract (2026-08-26).

#### Changed

- **The subprocess seam moved to `command-seam` (now `@osdlc/command-seam`)**, which this
  package now depends on and re-exports. The seam is not git-specific, and
  the sync and async doors living in separate homes was an accident of
  extraction order. Callers importing `CommandRunner`, `spawnRunner`,
  `runChecked`, or `CommandFailed` from `easy-git` are
  unaffected — the re-export keeps one `CommandFailed` class end-to-end
  (2026-08-29).
- Optional fields across the public API are spelled `?: T | undefined`
  rather than `?: T`, so options built by spreading a caller's own
  optionals typecheck under `exactOptionalPropertyTypes` (2026-08-29).
- Promoted from application-internal modules into the standalone package
  `easy-git`, with no re-export shim at the old paths
  (2026-07-20).
- The package tsconfig now extends a shared base rather than standing
  alone, so its strictness matches its consumers (2026-08-23).

#### Fixed

- **`timeoutMs` was plumbed in an `exactOptionalPropertyTypes`-unsafe way**
  through the client (2026-07-19).

The subprocess-level fixes — Bun's `bun test` stdio corruption, timeouts
that never fired, a failed spawn reported as a silent exit 1 — moved with
the seam and are recorded in `@osdlc/command-seam`'s changelog.

#### Known issues

- `hosted-git-info` types are declared locally rather than taken from
  DefinitelyTyped, whose copy predates the current API.
- `cliBackend` is the only backend shipped. A pure-JavaScript backend is
  what `partialBackend` exists to make writable, but none is provided.
