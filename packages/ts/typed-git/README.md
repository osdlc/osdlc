# @osdlc/typed-git

A typed wrapper around the `git` command line for TypeScript, in a synchronous
and an awaitable form. Each verb declares which exit codes mean "not there"
for it, and every other failure throws. `git.try.*` returns the failure
instead of throwing, and `raw()` skips the checks. You can replace what runs
git.

Use it when a Node or Bun program needs to ask git questions and act on typed
answers, without parsing porcelain output by hand. It runs the `git` binary, so
it does not fit a browser, and it is not an implementation of git.

## Install

```sh
npm install @osdlc/typed-git
```

`pnpm add @osdlc/typed-git` and `yarn add @osdlc/typed-git` work too.

The package is ESM only. It needs Node `^22.22.2 || ^24.15.0 || >=26.0.0`, the
range its dependency `hosted-git-info` needs, and a `git` executable on
`PATH`. Its types use the global `AbortSignal`, so a project needs
`@types/node` or the DOM lib.

## Runtimes and platforms

Node.js, on macOS, Linux and Windows. CI runs the tests and the built package
on Linux and macOS, on Node 22 and 24. Windows is supported but not tested in
CI yet.

It needs git 2.34 or later, the git of Ubuntu 22.04 LTS. See [Git versions](#git-versions).

The tests run on Vitest under Node. Bun is not a tested runtime for consumers.

## Git versions

The supported floor is git 2.34, the git of Ubuntu 22.04 LTS. CI tests the
git that the GitHub-hosted runners ship. On 2026-10-20 that was git 2.55.0 on
`ubuntu-latest` (Ubuntu 24.04) and git 2.56.0 on `macos-latest` (macOS 26), as
the checkout step logs it. The behaviour tables below were measured against
git 2.50.1.

Every flag typed-git passes unconditionally is in git 2.34. A few features are
newer, and one table (`GIT_FEATURES`, in `src/features.ts`) lists them:

| Feature | Needs git | Used by | On an older git |
| --- | --- | --- | --- |
| `merge-tree --write-tree` | 2.38 | `mergeTree` | throws `unsupported-git` |
| `merge-tree --merge-base` | 2.40 | `mergeTree({ mergeBase })` | throws `unsupported-git` |
| `worktree list -z` | 2.36 | `worktrees` | newline-split `worktree list --porcelain`: a path with a newline breaks it, and a lock reason comes back C-quoted |

A verb that uses one of these runs `git --version` first, once per runner,
and caches the answer. A client that never calls such a verb never runs it.
`git.version()` (and `await asyncGit.version()`) returns the same parsed
version: `{ major, minor, patch, text }`, where `text` keeps a vendor suffix
such as `2.39.3 (Apple Git-146)` or `2.45.1.windows.1`.

The `gitVersion` option pins the version instead: `new Git(cwd, { runner,
gitVersion: "2.55.0" })`, or `cliBackend({ runner, gitVersion: "2.55.0" })`.
It takes a version string, either `"2.55.0"` or a whole
`"git version 2.39.3 (Apple Git-146)"` line. Gated verbs then use it and
never run `git --version`, `version()` returns it, and `at()` keeps it. An
unparsable value throws a `RangeError` when the client or backend is built.
It is the way to put a fake runner behind a gated verb, and to test either
side of a feature.

On a git older than a feature, a verb with a fallback runs it, and one
without fails as `unsupported-git` before git runs:

```ts
const r = git.try.mergeTree("main", "topic");
if (!r.ok && r.error.kind === "unsupported-git") {
  // r.error.message: "merge-tree --write-tree needs git 2.38 or later; found 2.34.1."
  // r.error.unsupported: { feature, needs, have }
}
```

Below 2.34 every one of these verbs fails that way, with the feature
`typed-git`, and no fallback is tried. Verbs that need no newer feature run
on any git without a version check. A backend other than `cliBackend` has no
git version, so `AsyncGit` checks nothing for it; it answers or rejects each
request itself.

## Stability

The package is on the 0.x line. A breaking change ships only in a new minor
release, with a CHANGELOG entry that starts with `Breaking:`.

- `Git`, `AsyncGit`, `cliBackend`, the verbs, `git.try`, `git.soft`, the
  URL and checkout helpers, and `./testing` are stable in 0.x.
- `GitBackend`, `GitRequest`, `GitResults` and `partialBackend` are
  experimental. Each new verb adds a request kind, so a minor release can
  break a backend written as an exhaustive `switch`. Use `partialBackend`
  rather than an exhaustive switch. Their TSDoc carries `@experimental`.
- `remote()` is deprecated. Use `remotes()`. `remote()` will be removed at
  1.0.

## Similar packages

- [simple-git](https://www.npmjs.com/package/simple-git) wraps the CLI with
  promises. It has no synchronous form and a different failure contract.
- [isomorphic-git](https://www.npmjs.com/package/isomorphic-git) is git in
  pure JavaScript. It needs no `git` binary and runs in browsers.
- [nodegit](https://www.npmjs.com/package/nodegit) binds libgit2 and needs a
  native build.
- [@effected/git](https://www.npmjs.com/package/@effected/git) wraps the CLI
  for programs built on Effect.

This package exists for plain TypeScript callers that want a synchronous form,
typed results and a declared absence value per verb.

The Rust crate `typed-git` is this package's twin. The two keep the same major
and minor version. Their APIs differ. The crate is not on crates.io yet.

## Quick look

```ts
import { Git, AsyncGit } from "@osdlc/typed-git";

const git = new Git(process.cwd());

git.currentBranch();             // "main", or null when detached
git.configGet("no.such.key");    // null — an unset key is an answer
git.worktrees();                 // Worktree[] — throws outside a repository
git.commit({ message: "feat" }); // throws FailureError on a non-zero exit

const r = git.try.worktrees();   // Result<Worktree[], GitFailure>

const asyncGit = new AsyncGit(process.cwd());
await asyncGit.currentBranch();
```

Runnable examples, one per verb family, are in the
[`examples/` folder](https://github.com/osdlc/osdlc/tree/main/packages/ts/typed-git/examples)
of the repository. They are not part of the published package.

## Two clients, one surface

`Git` is synchronous and always runs the `git` CLI. That is on purpose. Git
calls run one after another gain nothing from being awaited, and a
synchronous client does not force its callers to be async.

`AsyncGit` has the same methods and returns promises. Use it when the caller
is a server that must not block, when calls run concurrently, or when git
should come from something other than a subprocess.

Both use the same verb table, which holds the one definition of every argv
and every parser, so they cannot drift apart. The tests check this: they run
the two clients side by side against a recording runner and compare their
argv.

## Absence is an answer; failure is not

A declared absence returns a value. Everything else throws. `try` returns
the failure instead of throwing. `raw` skips the checks.

Every verb names the exit codes that mean "asked and answered: not there" for
that verb. `config --get` exits 1 for an unset key. `check-ignore` exits 1
for "none of these are ignored". `merge-base` exits 1 for unrelated
histories. Those return the absence value: `null`, `[]` or `false`. Any other
non-zero exit throws the classified failure, which carries the argv and the
full result.

| | on a declared absence | on anything else |
| --- | --- | --- |
| **`git.verb()`** | the absence value — `null`, `[]`, `false` | throws the classified failure |
| **`git.try.verb()`** | `{ ok: true, value }` | `{ ok: false, error: GitFailure }` |
| **`git.raw(argv)`** | the raw `CommandResult`; you decide | the same |

Why it matters: a check that runs `status --porcelain` outside a repository
gets a throw, not `[]`. So it cannot report a clean tree when git could not
look.

`git.try.*` is for callers that must tolerate failure, such as a hook that
must not break a commit, or an endpoint that must always answer:

```ts
const r = git.try.topLevel();
if (!r.ok) { console.error(r.error.detail); return; }
use(r.value);
```

The error is a `GitFailure`: a `Failure` from `@osdlc/result` with a `kind` to
branch on, a one-line `message` and a `hint` for a person (`describe(error)`
joins them), git's own output in `detail`, the `argv` and `exitCode`, and the
`CommandFailed` it was read from in `cause`. An `unsupported-git` failure has
no `cause`, because git did not run; it carries `unsupported` instead.

The methods that throw (`git.push()` and the rest) throw the same failure,
wrapped in a `FailureError` (`error.failure`). So a CLI that reports a thrown
failure, such as `runMain` from `@osdlc/cli-tool`, shows "The remote refused
the credentials" and exits 23 for a signed-out `git push`, as it does for a
read. The thrown `message` names the command (`git push: The remote refused
the credentials. …`). `failure.message` is the bare sentence.
`describeGitFailure(failure)` builds the same `git <verb>: <message> <hint>`
line for a failure from `git.try.*`.

| `kind` | When | `message` / `hint` |
| --- | --- | --- |
| `not-installed` | git is not on `PATH` | `` `git` is not installed or not on PATH. `` / `Install git from https://git-scm.com.` |
| `not-a-repo` | stderr says `not a git repository` | `This is not a git repository.` / ``Run it inside a git repository, or create one with `git init`.`` |
| `no-remote` | `No such remote`, or `'x' does not appear to be a git repository` | `The remote 'x' does not exist.` (or `… does not exist or is not a git repository.`) / ``List the remotes with `git remote -v`.`` |
| `remote-unreachable` | `Could not read from remote repository`, `Could not resolve host`, `unable to access` with no HTTP status (a refused connection, a timeout) | `The remote could not be reached.` / `Check your network connection and the remote URL.` |
| `not-authenticated` | `Authentication failed`, `Permission denied (publickey)`, `could not read Username`, `unable to access` with HTTP 401 or 403 | `The remote refused the credentials.` / `Check that you are signed in to the host, or that your SSH key is added.` |
| `not-found` | `unable to access` with HTTP 404 | `The remote repository was not found, or you cannot see it.` / `Check the remote URL, and that your account can see the repository.` |
| `tls` | `unable to access` with `SSL certificate problem` | `The remote's TLS certificate could not be verified.` / `Check the system clock and CA certificates, or the remote's certificate.` |
| `unsupported-git` | the local git is older than the verb needs (see [Git versions](#git-versions)); git did not run, so there is no `cause` | `merge-tree --write-tree needs git 2.38 or later; found 2.34.1.` / `Upgrade git to 2.38 or later from https://git-scm.com.` |
| `not-executable`, `bad-cwd`, `timeout`, `output-cap`, `signal`, `aborted`, `spawn` | as in `@osdlc/command-seam` | command-seam's message, no hint |
| `exit` | any other non-zero exit | git's first stderr line |

The patterns are git's English messages. Under another locale git's words
differ and the failure is a plain `exit` with git's own line, never a wrong
kind. `classifyGitFailure(commandFailed)` makes the same classification for a
`CommandFailed` you caught yourself.

`git.try.*` covers every method, on both clients. Two rules apply. It catches
a thrown git failure and nothing else, so a `TypeError` still propagates. And
a declared absence is `{ ok: true }`, because absence is an answer.

`git.soft.*` is for the narrower case where "could not ask" and "nothing
there" are the same answer to the caller. Each verb that returns `null`, `[]`
or `false` for absence returns that same value when git fails instead of
throwing:

```ts
const sha = git.soft.resolveRef(name);      // string | null — null on a broken repo too
const dirty = git.soft.statusPorcelain();   // string[] — [] on a broken repo too
```

It is short for `const r = git.try.resolveRef(x); return r.ok ? r.value : null`.
Verbs whose absence is not `null`, `[]` or `false` have no soft form: the
outcome verbs such as `merge`, and `checkIgnore`, `aheadBehind` and `diffText`,
plus every mutation. Use `try` for those. Boolean verbs fall back to
`false`, which also means "could not ask". `soft.isDirty` reads a broken repo
as clean, so do not base a destructive action on it. `soft` catches a thrown
git failure only, like `try`. One table (`./soft.ts`, checked against both
clients) defines it for `Git` and `AsyncGit`.

### Exit 128 means two things in git

For `show` and `log`, git uses exit 128 both for "that path/ref is not in the
tree" and for "this is not a repository". So `showAtRev` and `logSubject`
must declare `absent: [128]`, and for those verbs absence and breakage look
the same. This contract cannot separate them there.

Eight verbs declare 128 as absence: `showAtRev`, `topLevel`, `gitCommonDir`,
`gitDir`, `symbolicRef`, `logSubject`, `objectExists` and `configRemoveSection`. `try` and `soft` behave the same, because 128 is a declared absence
there: `git.try.logSubject("HEAD")` outside a repository is `{ ok: true,
value: null }`, not a failure. The contract reduces these cases. It does not
remove them.

Where the difference matters, probe with `hasHistory()` first:

```ts
// false = unborn HEAD; true = there is history; a throw = the store is broken.
if (!git.hasHistory()) return [];
const subject = git.logSubject("HEAD");     // a 128 here is now real breakage
```

Do not use `objectExists("HEAD")` for this. It treats both of git's "no"
codes as `false`, which is right for "does this name resolve?" and wrong for
"does this repo have history?". Measured against real stores, `cat-file -e
HEAD` exits 128 on an empty repository, 1 on a dangling HEAD ref, and 128
with the object directory removed. So `objectExists` answers `false` for all
three, and a corrupt store reads as "nothing here yet". `hasHistory()` calls
`resolveRef("HEAD")`, which separates them: 1 (→ `null`) for unborn, 0 for a
dangling ref, 128 (→ throw) for a missing object store.

## Paths come back NUL-split

`lsFiles`, `lsTree`, `diffNameOnly`, `diffNameStatus` and `diffTree` always
pass `-z`. git's default output quotes a path containing a space, a quote or
a non-ASCII byte (`"docs/a b.md"`), and a caller splitting on newlines reads the
quotes as part of the name. There is no option to turn this off.

`diffNameStatus` and `diffTree` return `{ status, path, from? }` rows. The
status token is verbatim: `R100`, not `R`. A rename or copy reports its
destination in `path` and its source in `from`. `from` is absent on every
other status:

```ts
git.diffNameStatus({ cached: true });
// [{ status: "R100", path: "docs/renamed.md", from: "docs/a.md" },
//  { status: "A", path: "new.txt" }]
```

That record is three NUL fields (`R100`, old path, new path) where every other
record is two. A split written by hand often gets this wrong.

`lsTree` is `-z` for the same reason, and returns
`{ mode, type, sha, sizeBytes, path }` rows. `sizeBytes` is set only for a blob
under `{ long: true }`; a tree or submodule reports `null`, because `--long`
prints `-` there and a fabricated `0` would be worse than nothing.

## Exit codes that are answers

Two verbs carry their answer in the exit code rather than in stdout. Both are
here because a caller reading `exitCode` by hand often gets them wrong:

```ts
git.grep("TODO|FIXME", { extendedRegexp: true, lineNumber: true });
// [] when nothing matched — `git grep` exits 1 for "no matches", and a
// caller that treats non-zero as failure turns every clean scan into an error.
// 128 (not a repository, an unbalanced regex) and 129 (usage) still throw.

git.isAncestor(sha, "origin/main");
// false only when git said so (exit 1) — diverged or unrelated histories
// alike. A rev that does not resolve exits 128 and THROWS, because "not an
// ancestor" is usually the answer that lets a caller delete something.
```

An exit code only answers when git produced it. A `git` missing from PATH, a
timeout kill or an abort leaves the runner with no exit code of its own to
report. Every verb throws the classified failure there. None of them reads
that as "no matches" or "no such key".

`aheadBehind` is here for a different reason: it owns a field order that is
easy to invert. `rev-list --left-right --count base...tip` prints the left
count first, and left is `base`. So that number is behind, not ahead.

```ts
git.aheadBehind("origin/main", "HEAD"); // { ahead: 2, behind: 1 }
```

Two more cases exit 0 with empty output rather than an error: `diffTree` on
a root commit reports nothing unless you pass
`{ root: true }`, and a `grep` pathspec that matches no file is
indistinguishable from "no matches".

`diffTreeNumstat(rev, opts)` is the line-count version of `diffTree`, with the same
options and rows of `{ path, linesAdded, linesDeleted }` (`null` counts for a
binary file). Two verbs rather than one option, because git rejects
`--numstat` together with `--name-status`.

`diffCheck` reports findings through its exit code, so it declares exits 1 and
2 as absence. Findings come back as a value, not a throw:

```ts
git.diffCheck();
// { ok: true, output: "" } when the unstaged diff is clean
// { ok: false, output } on a finding — output is git's report, for example
// a line ending in "trailing whitespace."
```

## Merging: a conflict is a value

`merge`, `rebase` and `rebaseContinue` are the verbs where a non-zero exit is
the answer you asked for. They declare exit 1 as absence and hand back an
outcome:

```ts
const out = git.merge("origin/main");
switch (out.status) {
  case "clean":    return out.fastForward ? "ff" : "merged";
  case "conflict": return resolve(git.lsFilesUnmerged());
}
// git refusing to merge at all still throws.
```

The exit code alone cannot carry this. Measured against git 2.50.1:

| | exit |
| --- | --- |
| `merge`, conflict | `1` — stdout carries the report |
| `merge`, unknown ref | `1` — **stdout empty** |
| `merge`, would overwrite local edits | `2` |
| `merge`, merge already in progress | `128` |
| `merge`, unrelated histories | `128` |
| `rebase`, conflict | `1` |
| `rebase`, unknown ref | `128` |
| `merge` / `rebase --abort`, none running | `128` |
| `merge-tree`, conflict | `1` — stdout carries the tree and paths |
| `merge-tree`, unmergeable name | `1` — **stdout empty** |
| `merge-tree`, unrelated histories | `128` |

A ref git cannot resolve exits 1, exactly like a conflict. What separates
them is that a conflict always writes its report to stdout and a refusal
writes nothing there. The check looks at where the output goes, not at git's
words, because git's messages are translated and a locale must not change
what an outcome means.

`conflicts` on the outcome is that report, so treat it as a summary:
rename/rename and rename/delete have no parseable form in it, and under a
localized git it can be empty on a real conflict. `lsFilesUnmerged()` is the
authoritative list. Its stage detail is also what tells the shapes apart:
all of 1/2/3 is both-modified, 1+3 is we-deleted, 1+2 is they-deleted, 2+3
with no base is add/add. A resolver that assumes both-modified deletes files.
For the paths alone, `diffNameOnly({ diffFilter: "U" })` is cheaper.

`merge`, `rebase` and `rebaseContinue` run with `LC_ALL=C`, over the client,
backend and call `env`, so `fastForward`, `alreadyUpToDate` and `conflicts` do
not change with the caller's locale. `pushPorcelain` does the same for its
reasons. Other verbs keep the caller's locale.

One trap in `checkoutSide`: on a path that is not conflicted, git exits 0 and
does nothing. There is no error to catch, so take the path list from
`lsFilesUnmerged()` just before the call, not from an earlier one. An empty
path list returns without running git.

## Asking without checking out

`mergeTree` answers the same question as `merge` (would this merge, and where
would it conflict) against the object database alone. It uses no index, no
checkout and no worktree, so it needs no clean tree to run in and leaves
nothing to clean up:

```ts
const out = git.mergeTree("main", "origin/topic");
if (out.status === "clean") {
  // `out.tree` is a real object: build the merge commit from it and push,
  // without ever materializing a working copy.
}
```

This helps most when checking many branches. Predicting every open PR's merge
across a large repository takes seconds. Checking each one out to learn the
same thing takes minutes, and most of them merge cleanly anyway.

Two differences from `merge`. Its conflict list is authoritative: git names
the paths in a machine-readable section rather than in prose, so there is no
need to call `lsFilesUnmerged()` after it. And it takes
both sides as arguments rather than merging into the current branch, so
nothing depends on where `HEAD` happens to be.

## Pushing: a rejected ref is a value

`push` throws when git exits non-zero. `pushPorcelain` runs
`git push --porcelain` and returns one result per ref, so a lease that lost a
race is an answer you can branch on, not stderr you grep:

```ts
const report = git.pushPorcelain("origin", `${next}:refs/heads/lease`, {
  forceWithLease: { ref: "refs/heads/lease", expect: seen },
});
const ref = report.refs[0];
// { src, dst, flag, summary, rawReason }, plus { rejection, detail } when flag is "!"
if (ref.flag === "!") {
  switch (ref.rejection) {
    case "stale":           // the lease check failed before anything was sent
    case "lock-failed":     // another writer moved or deleted it at the remote
    case "already-exists":  // a create lost to another writer
      return retry();
    default:                // tag-exists, ref-conflict, hook-declined, non-fast-forward, other
      throw new Error(`${ref.dst}: ${ref.rawReason} ${ref.detail ?? ""}`);
  }
}
```

It takes a refspec or a list, and `{ atomic, forceWithLease }`, where
`forceWithLease` also takes one lease per ref. `flag` is git's status
character: `' '` fast-forward, `'+'` forced, `'-'` deleted, `'*'` new, `'!'`
rejected, `'='` up to date. A failure that reaches no ref still throws the
classified failure: an unknown remote, auth, network, TLS, a refspec that
matches nothing, or a local pre-push hook.

`rejection` is read from the reason text, never from the local git version,
because a `[remote rejected]` reason is written by the remote's git. The
wording has changed across versions:

| Case | git 2.53 / 2.54 | Older git | `rejection` |
| --- | --- | --- | --- |
| lease expects a sha the remote no longer holds | `[rejected] (stale info)` | same | `stale` |
| behind the remote, or the old or new value is not a commit | `(non-fast-forward)`, `(fetch first)`, `(needs force)` | same | `non-fast-forward` |
| existing tag | `[rejected] (already exists)` | same | `tag-exists` |
| another writer moved the ref after the lease check | `(incorrect old value provided)` | `(failed to update ref)` + `… but expected …` | `lock-failed` |
| another writer deleted it | `(reference does not exist)` | `(failed to update ref)` + `unable to resolve reference` | `lock-failed` |
| another writer created it first | `(reference already exists)` | `(failed to update ref)` + `reference already exists` | `already-exists` |
| `<ref>` beside an existing `<ref>/child` | `(refname conflict)` | `(failed to update ref)` + `'<ref>/child' exists; cannot create '<ref>'` | `ref-conflict` |
| a remote hook refused it | `(pre-receive hook declined)`, `(hook declined)` | same | `hook-declined` |
| a `.lock` file in the way, an unwritable refs directory | `(reference already exists)`, `(failed to update refs)` + `Unable to create '….lock'` | `(failed to update ref)` + the same | `other` |
| the other refs of a failed `--atomic` push | `[rejected] (atomic push failed)`, `[remote rejected] (atomic transaction failed)` | same | `other` |

The "+ …" text is the remote's `cannot lock ref '<ref>': …` line. git prints
it on stderr, not on the ref line, and `detail` carries it for the ref it
names. With several push URLs, a ref's lines go to its rejected entries in
order. `(failed to update ref)` alone is never read as a race, because a ref
clash, an unwritable directory and a stale lock all end that way. One case
the text cannot settle: a 2.53 remote prints no detail line, so a stale
`.lock` there reads exactly like a lost create, `already-exists`. A 2.54
remote prints the detail, and that reads as `other`.

This table is the one list of wordings. `tests/push.test.ts` covers each
row, against real git or as a canned row in `CANNED`.

## `log` hands back bytes

```ts
const raw = git.log({ format: "format:%x1e%H%x1f%s", numstat: true });
```

`log` returns stdout unsplit and untrimmed. The format is yours, and callers
frame their own records with `%x1e` / `%x1f` or interleave `--name-status`
blocks. Splitting on newlines would cut those records in half. For a
one-record-per-line format, `logLines(opts)` is `log` plus that split.

It declares no absence code, on purpose. An empty repository exits 128, the
same code a corrupt one gives, so `log` on a store with no commits throws.
Check first, or use `try`:

```ts
if (git.hasHistory()) git.log({ format: "%H" });
const r = git.try.log({ format: "%H" });
```

## Refs, remotes and history

```ts
git.resolveRef("refs/heads/main");  // sha, or null when the ref does not resolve
git.hasHistory();                   // resolveRef("HEAD") !== null
git.headRef();                      // "main", or the literal "HEAD" when detached
git.currentBranch();                // "main", or null when detached
git.remotes();                      // ["origin", …]; [] when there are none
git.remoteGetUrl("origin");         // URL, or null — git exits 2 for an unknown remote
git.remoteGetUrls("origin");        // every URL; [] for an unknown remote
git.remoteHead("origin");           // "refs/heads/main", asked over the network
git.remoteOwnerRepo();              // { owner, repo, host, port } for origin, or null
git.remoteOwnerRepo("upstream");    // …for any remote; AsyncGit awaits the same
git.remoteAdd("origin", url);
```

`remoteOwnerRepo(remote = "origin")` is `remoteGetUrl` plus a parse: `null`
when there is no such remote or its URL names no project. The parse is
not tied to known hosts (`parseRemoteUrl`: scp-style and `scheme://[user@]host[:port]/…`),
so a self-hosted Forgejo or Gitea answers, which `parseGitUrl` would not. Two
limits: a path with groups, `group/sub/repo`, gives owner `sub` and repo
`repo`; and a port is read only from an `http(s)://` URL. The port of an
`ssh://` URL is dropped (`port: null`). It
throws outside a repository like `remoteGetUrl`; use `git.try.remoteOwnerRepo()`
to fold that into a failed outcome.

`resolveRef` passes `--verify --quiet`, so a ref that does not resolve is
`null` and an unreadable store still throws. That is why `hasHistory()` is the
way to check a repository, and `objectExists("HEAD")` is not.

`headRef` and `currentBranch` differ only on a detached HEAD: `headRef` prints
the literal `"HEAD"`, `currentBranch` answers `null`. Pick by what the caller
needs to print.

## The whole surface

Every method exists on both `Git` and `AsyncGit` with the same name and
arguments; the async one returns a promise. Each also mirrors onto
`git.try.*`, which returns a `Result<T, GitFailure>` instead of throwing.
Every method takes call options (`timeoutMs`, `env`, `maxOutputBytes`, and
`signal` on the async side) as its last argument. `revParse` is variadic, so its options are the
trailing argument that is not a string.

### Arguments that start with `-`

A ref, remote, URL, path, ref pattern or config key argument that starts with
`-` could be read by git as an option, for example `--upload-pack=...` or
`--output=<file>`. Forty-two verbs refuse it: they throw a `TypeError`
before git runs. In `log` this covers `rev`, `range` and each `notRefs` entry.
In `diffNameOnly` and `diffStat` it covers each `rangeArgs` token. The message is
`typed-git: <verb>: <param> must not start with "-" (got "...")`. `try` and
`soft` do not catch it, because it is a `TypeError`. On `AsyncGit` with
`cliBackend` it is a rejection. A backend that is not the CLI gets the request
unchecked. `revParse` is not guarded, because it passes flags on by design.
Paths after `--` are not affected. `grep` passes its pattern with `-e`, so a
pattern that starts with `-` is searched for, not refused.

To pass a path that starts with `-`, write `./-name`. For the previous branch,
write `@{-1}` instead of `-` in `checkout` and `merge`.

The three config reads also refuse a key with no section or no name: no `.`,
or a leading or trailing `.`. git exits 1 for such a key, the code the reads
take as unset. `clone` and `fetch` refuse a `depth` that is not a positive
integer. Both checks throw a `TypeError` before git runs.

### Queries

"Absence" is the exit code this verb declares as an answer. Any other non-zero
exit throws the classified failure.

| Method | git | Absence → value |
| --- | --- | --- |
| `showAtRev(rev, path)` | `show <rev>:<path>` | `128` → `null` |
| `revParse(...args)` | `rev-parse <args>` | `1` → `null` — needs `--verify --quiet` |
| `resolveRef(ref)` | `rev-parse --verify --quiet <ref>` | `1` → `null` |
| `hasHistory()` | `resolveRef("HEAD") !== null` | — |
| `headRef()` | `rev-parse --abbrev-ref HEAD` | none — literal `"HEAD"` when detached |
| `version()` | `--version`, once per runner | none — `{ major, minor, patch, text }`; see [Git versions](#git-versions) |
| `topLevel()` | `rev-parse --show-toplevel` | `128` → `null` (not a repository) |
| `gitCommonDir()` | `rev-parse --path-format=absolute --git-common-dir` | `128` → `null` |
| `gitDir()` | `rev-parse --absolute-git-dir` | `128` → `null` — this worktree's own dir, `<common>/worktrees/<name>` in a linked worktree |
| `mainCheckout()` | the parent of `gitCommonDir()` | `null` outside a repository |
| `symbolicRef(ref)` | `symbolic-ref <ref>` | `128` → `null` |
| `currentBranch()` | `branch --show-current` | none — `null` when detached |
| `statusPorcelain({ paths })` | `status --porcelain` | none |
| `statusEntries()` | `status --porcelain -z --untracked-files=all` | none — `{ x, y, path }` rows; a rename is one row, with the source dropped |
| `isDirty({ paths })` | `statusPorcelain().length > 0` | none |
| `branches(pattern)` | `branch --list --format=%(refname:short)` | none |
| `branchExists(name)` | `branches(name).includes(name)` | none |
| `worktrees()` | `worktree list --porcelain -z` (git 2.36; the newline form before) | none — rows carry `locked` and `lockReason` |
| `mergeBase(a, b)` | `merge-base <a> <b>` | `1` → `null` (unrelated histories) |
| `logSubject(ref)` | `log -1 --format=%s <ref>` | `128` → `null` |
| `configGet(key, { scope })` | `config [--local\|--global\|--system] --get <key>` | `1` → `null` (unset) |
| `configGetAll(key, { scope })` | `config --get-all -z <key>` | `1` → `[]` (unset) — every value, verbatim |
| `configGetBool(key, { scope })` | `config --type=bool --get <key>` | `1` → `null` (unset) — a value git cannot read as a boolean throws |
| `objectExists(rev)` | `cat-file -e <rev>` | `1`, `128` → `false` — see the caveat below |
| `lsRemote(remote, pattern, { heads, tags })` | `ls-remote` | none |
| `checkIgnore(paths)` | `check-ignore --stdin -z` | `1` → empty set (none ignored) |
| `checkIgnoreVerbose(paths)` | `check-ignore -v --stdin -z` | `1` → empty list; rows are `{ path, source, line, pattern }`, a `!` pattern is a negation |
| `lsFiles({ cached, others, excludeStandard, directory, paths })` | `ls-files -z` | none |
| `lsFilesTagged()` | `ls-files -v -z` | none — `{ tag, path }` rows; `S` is skip-worktree, lowercase is assume-unchanged |
| `forEachRef(pattern, { format, sort, count })` | `for-each-ref` | none — lines verbatim |
| `refs(pattern)` | `forEachRef` + `parseRefRows` | none |
| `diffNameOnly({ cached, diffFilter, rangeArgs, paths })` | `diff --name-only -z` | none |
| `diffNameStatus({ cached, range, noRenames, paths })` | `diff --name-status -z` | none |
| `diffStat({ rangeArgs, paths })` | `diff --stat` | none — raw stdout |
| `diffCheck({ paths })` | `diff --check` | `1`, `2` → `{ ok: false, output }` |
| `diffText(rev?, { staged, paths })` | `diff [--cached] [rev]` | none — empty string only when nothing differs; a bad rev or a non-repository throws |
| `diffAddedFile(relPath)` | `diff --no-index -- /dev/null <path>` | none — exit 1 with output is success; exit 1 with no output, or exit 2, throws |
| `log(opts)` | `log` | none — raw stdout, unsplit |
| `logLines(opts)` | `log`, split and filtered | none |
| `lsTree(rev, { recursive, long, paths })` | `ls-tree -z` | none |
| `diffTree(rev, { root, noRenames, findRenames, paths })` | `diff-tree --name-status -z` | none — `findRenames` adds `-M` |
| `diffTreeNumstat(rev, opts)` | `diff-tree --numstat -z` | none — takes the same options, and ignores `findRenames` |
| `grep(pattern, { extendedRegexp, lineNumber, noColor, paths })` | `grep` | `1` → `[]` (no match) |
| `isAncestor(a, b)` | `merge-base --is-ancestor` | `1` → `false` |
| `aheadBehind(base, tip)` | `rev-list --left-right --count <base>...<tip>` | none |
| `remotes()` | `remote` | none — names, not remotes |
| `remote()` | `remote` | none — deprecated alias of `remotes()` |
| `remoteGetUrl(name, { push })` | `remote get-url [--push] <name>` | `2` → `null` (unknown remote) — the first URL |
| `remoteGetUrls(name, { push })` | `remote get-url --all [--push] <name>` | `2` → `[]` (unknown remote) |
| `remoteHead(remote)` | `ls-remote --symref <remote> HEAD` | none — the full refname, or `null` when the remote names no default branch; an unreachable remote throws |
| `remoteOwnerRepo(remote = "origin")` | `remote get-url <remote>`, parsed | `2` or an unparseable URL → `null` |

`objectExists` declares both `1` and `128` absent, so `false` cannot tell an
empty repository from a dangling HEAD or a missing object store. Use
`hasHistory()` to ask whether a repository has history.

### Mutations

Every mutation except `configRemoveSection` declares no absence: a non-zero
exit throws the classified failure, because the only sane handling of "the write did
not happen" is to surface it. `configRemoveSection` declares 128 absent and
returns `false` when there is no such section. `pushPorcelain`, listed under
Integration, declares exit 1 absent and returns the rejected refs.

| Method | git |
| --- | --- |
| `fetch(remote, refspec, { prune, quiet, noWriteFetchHead, depth, noTags })` | `fetch` |
| `add(paths, { all, update, intentToAdd })` | `add` (paths go after `--`) |
| `commit({ message, body } \| { messageFile } \| { messageStdin }, { allowEmpty, amend, noVerify, signoff })` | `commit` — one message source, enforced by the types; `messageStdin` is `-F -` with the string on stdin, no temp file |
| `push(remote, refspec, { forceWithLease })` | `push` — `forceWithLease` takes `true` or a pinned `{ ref, expect }` (`expect: null` = ref must be absent); `forceWithLeaseArg(lease)` is the pure formatter. `true` is the bare form: it overwrites whatever is on the remote, so prefer the pinned form. To learn why a push was rejected, use `pushPorcelain` |
| `configSet(key, value, { scope })` | `config` |
| `configRemoveSection(name)` | `config --remove-section` — `false` when there is no such section |
| `init(path, { bare, initialBranch, quiet })` | `init` |
| `clone(url, dest, { depth, branch, bare, mirror, singleBranch, noTags, quiet })` | `clone` — a relative `dest` resolves in the client's working directory; `branch` takes a branch or a tag, not a sha; with `mirror`, `noTags` has no effect and `singleBranch` holds for the clone only |
| `resetHard(rev)` | `reset --hard` |
| `clean({ directories })` | `clean -f`, or `-fd` — ignored files are kept |
| `deleteBranch(name, { force })` | `branch -d` / `-D` |
| `deleteRef(ref, { expected })` | `update-ref -d <ref> <expected>` — refuses when `ref` has moved |
| `worktreeAdd(path, { branch, startPoint, detach })` | `worktree add` |
| `worktreeRemove(path, { force })` | `worktree remove` |
| `worktreeMove(from, to, { force })` | `worktree move` |
| `worktreePrune()` | `worktree prune` |
| `remoteAdd(name, url)` | `remote add` |
| `checkout(ref, { branch, resetBranch, force })` | `checkout` — `resetBranch` picks `-B` |
| `checkoutSide(side, paths)` | `checkout --ours\|--theirs --` |
| `mergeAbort()` / `rebaseAbort()` | `merge --abort` / `rebase --abort` |

### Integration

Exit 1 is declared absence: a conflict or a rejected ref is an answer. Every
other non-zero exit throws.

| Method | git | Returns |
| --- | --- | --- |
| `merge(ref, { noFf, noCommit, ffOnly, message })` | `merge --no-edit` | `MergeOutcome` — with `ffOnly`, a merge that cannot fast-forward throws |
| `rebase(onto, { autostash })` | `rebase` | `RebaseOutcome` |
| `rebaseContinue()` | `-c core.editor=true rebase --continue` | `RebaseOutcome` |
| `mergeTree(ours, theirs, { mergeBase })` | `merge-tree --write-tree --name-only -z` | `MergeTreeOutcome` |
| `lsFilesUnmerged()` | `ls-files -u -z` | `UnmergedEntry[]` — mode, sha, stage, path |
| `pushPorcelain(remote, refspec \| refspecs, { atomic, forceWithLease })` | `push --porcelain` | `PushReport` — `{ refs, stderr }`, one `PushRefResult` per ref; a `'!'` ref also has `rejection` and `detail`; exit 1 without a rejected ref throws |

### Escape hatches and re-rooting

| Method | What |
| --- | --- |
| `raw(argv, opts)` | Run anything. Returns `CommandResult`; you read `exitCode`. |
| `rawChecked(argv, opts)` | Same, but throws the classified failure on a non-zero exit or on output cut short at a cap or a timeout. |
| `at(cwd)` | The same client rooted elsewhere, reusing the runner or backend. |
| `try.*` | The whole surface again, returning `Result<T, GitFailure>` (from `@osdlc/result`) instead of throwing. |
| `soft.*` | Every verb with an absence value, returning it instead of throwing. |

Use `raw` for a one-off command, such as `update-ref`, `tag -a` or a patch
from `diff --unified`. A git command gets its own verb only when it has a
parser worth sharing or an absence worth declaring.

## Driving the CLI, or something else

`AsyncGit` calls a `GitBackend`, which takes a `GitRequest` (a plain,
serializable description of one operation) and returns its typed result. The
request is not argv on purpose. argv is a CLI detail, and a backend built on
a pure-JavaScript git has no argv to receive.

```ts
import { AsyncGit, cliBackend, partialBackend } from "@osdlc/typed-git";

// The default: every request becomes a `git` subprocess.
new AsyncGit(cwd, { backend: cliBackend() });

// Anything else: implement what you can, and say so about the rest.
const backend = partialBackend("in-memory", {
  currentBranch: async () => "main",
  branches: async () => ["main", "topic"],
});
await new AsyncGit(cwd, { backend }).branchExists("topic"); // true
await new AsyncGit(cwd, { backend }).worktrees();           // UnsupportedRequest
```

Because a request is data, it can also be logged, queued, or replayed. The
exception is `raw`, which is argv by definition.

## Injecting the subprocess seam

`Git` takes a `CommandRunner` and `cliBackend` takes an `AsyncCommandRunner`,
both from [`@osdlc/command-seam`](https://www.npmjs.com/package/@osdlc/command-seam).
Replace the runner when you want a real `git` but your own way of spawning
it, such as a fake in tests, a supervised child, or your own timeout policy.

```ts
import { Git, type CommandRunner } from "@osdlc/typed-git";

const calls: string[][] = [];
const recording: CommandRunner = {
  run(argv) {
    calls.push(argv);
    return { exitCode: 0, stdout: "main\n", stderr: "" };
  },
};

const git = new Git("/nowhere", { runner: recording });
git.currentBranch(); // "main"
calls;               // [["branch", "--show-current"]]

// An exit code the verb does not declare as absence throws.
const failing: CommandRunner = {
  run: () => ({ exitCode: 128, stdout: "", stderr: "fatal: not a git repository\n" }),
};
new Git("/nowhere", { runner: failing }).currentBranch(); // throws FailureError (kind "not-a-repo")
```

The default runner finds `git` on absolute `PATH` entries only, so a file named
`git` in the checkout cannot run in its place. A real runner you build yourself
should do the same: `spawnRunner("git", { absolutePathOnly: true })`.

A fake runner behind a version-gated verb (`worktrees`, `mergeTree`; see
[Git versions](#git-versions)) would also be asked for `git --version`. Pin
the version so it is not:

```ts
const git = new Git("/nowhere", { runner: recording, gitVersion: "2.55.0" });
git.worktrees(); // runs `worktree list --porcelain -z`, and no `--version`
```

A fake without the pin must answer `["--version"]` (once per runner) with
`git version <x.y.z>`, or the gated verb fails as `exit`.

`runner: undefined` is the same as omitting it, so a caller holding an optional
runner passes it straight through, without a conditional spread. `cliBackend`
accepts it too.

command-seam's exports are re-exported here, so wiring a runner or catching a
`CommandFailed` needs one import rather than two.

## Also: git references

`parseGitUrl` turns any git reference (https, ssh, scp-style, `owner/repo`
shorthand, `github:owner/repo`) into its host, user, and project, using
`hosted-git-info`. `gitSshUrl` builds the scp-style clone URL from it. Both
return `null` for anything that is not a known git host. They only parse and
never run git, so nothing here throws.

```ts
parseGitUrl("github:acme/widgets#v1");
// { type: "github", domain: "github.com", user: "acme",
//   project: "widgets", committish: "v1" }
parseGitUrl("https://example.invalid/acme/widgets"); // null — not a known host
gitSshUrl("acme/widgets");                           // "git@github.com:acme/widgets.git"
```

`parseRemoteUrl` is the host-agnostic counterpart for a clone URL read out of
a checkout's own config: any host, with its `port`, no `hosted-git-info`. It
is what `remoteOwnerRepo` uses, and it stays on `@osdlc/typed-git/client`.
Use it for a remote read from a checkout (any host); use `parseGitUrl` /
`parseRepoRef` for a URL a person pasted.

`parseRepoRef` answers the question a clone command asks. Given anything a
person might paste (a clone URL, the page of a pull request or a file, a bare
`owner/repo`), which repository is it, and what does `git clone` take? It returns
the host, owner and repo, a clone URL, and any branch the input named. An
explicit `https://…` or `git@…:` input keeps its protocol; shorthand takes
the `protocol` argument (default `https`).

```ts
parseRepoRef("https://github.com/acme/widgets/pull/12");
// { host: "github.com", owner: "acme", repo: "widgets",
//   cloneUrl: "https://github.com/acme/widgets.git", committish: null }
parseRepoRef("acme/widgets", "ssh")?.cloneUrl;
// "git@github.com:acme/widgets.git"
parseRepoRef("./a/local/path"); // null — the input names no repository
```

## Subpath exports

`@osdlc/typed-git/client` is everything above except the URL parsers
(`parseGitUrl`, `gitSshUrl`, `parseRepoRef` and their types) and the checkout
walks (`checkoutRoot`, `discoverCheckouts`, `scanForCheckouts`, their types,
`DEFAULT_MAX_DEPTH` and `DEFAULT_WARN_AFTER`). It has no `hosted-git-info` on
your module graph. That package stays in `dependencies` either way, so this
makes the bundle smaller, not the install.

`@osdlc/typed-git/testing` builds throwaway repositories:

- `makeGitFixture({ dir?, parent?, prefix?, identity?, initialBranch?, bare? })`
  — one initialized repo.
- `makeOriginAndCheckout({ parent?, identity?, initialBranch?, files? })` — an
  origin plus a clone of it. Returns `{ origin, checkout, cleanup }`.
- `makeBareAndWorker({ remoteName?, parent?, identity?, initialBranch? })` — a
  bare store plus a separately initialized worker that names it as a remote.
  Returns `{ bare, worker, remoteName, parent, cleanup }`. It is not a clone:
  the worker starts with no history and no tracking, so its first push is a
  real first push into an empty store.

`cleanup()` is manual. Nothing removes a fixture when the process exits, so
call it in a `finally` block or an `afterEach`. The helpers have named option
and result types: `MakeOriginAndCheckoutOptions`, `OriginAndCheckout`,
`MakeBareAndWorkerOptions` and `BareAndWorker`.

All of them pin an identity and the commit dates through the environment, so a
suite that asserts on a sha gets the same sha every run. Only the identity
(and `commit.gpgsign=false` in the fixture repository) is isolated.
`core.hooksPath`, `commit.template`, `init.templateDir`, `core.autocrlf` and
other global or system git config still apply. To isolate them, set
`GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM` through `identity`. The identity is set
as the fixture client's client-level `env`, so every call through
`fixture.git` carries it, the suite's own calls included, not just the ones
the fixture makes. `IDENTITY` is exported and frozen, so a suite asserting on
dates reads the pinned values instead of re-declaring them. `fixture.commit(msg,
files, { date, env })` overrides them for one commit.

Pass `parent` to put two related repos under one directory (and `dir` to name
one exactly). Use it to have a suite delete a single tree at the end, or to
assert on relative paths between two repositories. `cleanup()` removes the
`dir` you named. The one from `makeBareAndWorker` removes its whole `parent`,
including a `parent` you passed in. `makeOriginAndCheckout` removes only its
two repositories. Do not point either at anything you want to keep.

```ts
import { makeGitFixture } from "@osdlc/typed-git/testing";

const fx = makeGitFixture();
try {
  const head = fx.commit("first", { "a.md": "one\n" });
  fx.git.resolveRef("HEAD") === head; // true
} finally {
  fx.cleanup();
}
```

## Also: finding a checkout without git

`checkoutRoot(path)` finds the git checkout containing `path` by walking up
for a `.git` entry. It reads the filesystem only and runs no git process.
`path` may be a file or a directory. It returns `null` rather than throwing
when there is no checkout. It does not tell a linked worktree (`.git` as a
file) from a main checkout (`.git` as a directory). Callers that need git's
own answer (bare repos, `GIT_DIR` overrides) use `Git#topLevel()` instead.

```ts
import { checkoutRoot } from "@osdlc/typed-git";

checkoutRoot("/repo/src/deep/file.ts"); // "/repo"
checkoutRoot("/tmp/not-a-repo");        // null
```

`discoverCheckouts(dir, { maxDepth, warnAfter, onWarn })` walks the other way.
It returns the sorted checkouts below `dir`. The walk stops at each checkout
and skips directories whose names start with a dot.

- `maxDepth` counts levels below `dir`; the default is 3.
- `warnAfter` is the number of directories read before one warning; the
  default is 10,000. `Infinity` turns the warning off.
- `onWarn` receives the warning message. It defaults to a line on stderr.
  Pass `() => {}` to silence it.

`scanForCheckouts` takes the same arguments and returns
`{ checkouts, directoriesScanned, depthLimited }`. A non-zero `depthLimited`
means `maxDepth` stopped the walk, so a repository may be missing.

A linked worktree has a `.git` entry too, so it counts as a checkout. To get
one row per repository, map each result through `mainCheckout()` and
de-duplicate.

## Limits

- No call has a default timeout. Pass `timeoutMs` where a hung `git` would
  hurt.
- `Git` kills a child that writes more than 256 MB to one stream and throws
  the classified failure. `AsyncGit` has no such cap. The `maxOutputBytes` call
  option sets the cap for one call on either client. Output cut short at a
  cap or a timeout is a failure, never an answer.
- stdout is text. There is no verb or call option that returns raw bytes,
  such as a binary blob. Use command-seam's `spawnRunnerBytes` for that.
  `raw` and `rawChecked` take `input` as a string, so binary stdin, such as
  `hash-object --stdin` on a binary file, needs that runner too.
- Output is captured, never streamed. For live progress from `clone` or
  `fetch`, run git through command-seam's `streamRunner`.
- `Git` cannot cancel a call. `AsyncGit` takes a `signal`.
- A thrown `FailureError` carries the `GitFailure` in `error.failure`, with
  `argv`, `exitCode` and `detail`. Read `detail` for git's message, because
  git writes some failure text to stdout. `error.cause` is the
  `CommandFailed`, with the raw `result`.
- `UnsupportedRequest` is not a git failure, so `try` and `soft` let it
  through.
- `merge`, `rebase`, `rebaseContinue` and `pushPorcelain` run with `LC_ALL=C`. Any other verb
  that reads git's messages assumes English output, so a localized git can
  change what it returns.
- Test fixtures need a manual `cleanup()`.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
