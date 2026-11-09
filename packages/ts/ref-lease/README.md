# @osdlc/ref-lease

A lock that lives in a git remote. Several workers (CI jobs, agents, cron hosts) that all push to
one repository can use it to make sure only one of them does a job at a time, with no lock server
and no database.

```text
worker A: read refs/locks/deploy (commit C1) ── push C2 "only if still C1" ── ✔ A holds the lease
worker B: read refs/locks/deploy (commit C1) ── push C3 "only if still C1" ── ✘ CasFailed: A got there first
```

A **lease** is a git ref whose commit holds a JSON payload you choose, such as who holds it and
until when. Every change is a compare-and-swap: `git push --force-with-lease=<ref>:<sha-you-read>`.
The remote, the **authority**, accepts exactly one of two racing writers. The library builds the
commits, runs the pushes and fetches, and tells a lost race (`CasFailed`) apart from a broken push
(`GitFailed`).

Do not use it when:

- the workers share a machine and need no remote: a lock file is simpler;
- you need many writes per second on one lease: each write is a push;
- the git host refuses pushes to refs outside `refs/heads` and `refs/tags`. Check your host's ref
  rules first.

## Install

```sh
npm install @osdlc/ref-lease
```

ESM only. Node.js 22.22.2 or later on the 22 line, 24.15.0 or later on the 24 line, or 26 and later.
Bun also works. It runs the `git` CLI, which must be on `PATH`.

## Quick start

From [examples/lease-lifecycle.test.ts](./examples/lease-lifecycle.test.ts):

<!-- snippet: quick-start -->
```ts
import {
  buildLeaseCommit,
  casCreate,
  casDelete,
  casReplace,
  CasFailed,
  fetchNamespace,
  fetchRef,
  RefNotFound,
} from '@osdlc/ref-lease'

interface CacheLease {
  holder: string
  expiresAt: string
}

const decode = (v: unknown): CacheLease => {
  const o = v as Partial<CacheLease>
  if (typeof o.holder !== 'string' || typeof o.expiresAt !== 'string') {
    throw new TypeError('not a cache lease')
  }
  return { holder: o.holder, expiresAt: o.expiresAt }
}

/** Claim `ref` for `holder`, or return the current holder when someone else has it. */
function claim(authority: string, ref: string, holder: string, cwd: string): string {
  const sha = buildLeaseCommit({ holder, expiresAt: '2026-11-07T12:00:00Z' }, { cwd })
  try {
    casCreate(authority, ref, sha, { cwd })
    return holder
  } catch (e) {
    if (!(e instanceof CasFailed)) throw e
    return fetchRef(authority, ref, { cwd, decode }).payload.holder
  }
}
```

The same file renews a lease with `casReplace`, lists leases with `fetchNamespace` and releases one
with `casDelete`.

## Guides

| Guide | Read it when |
|---|---|
| [How it works, in pictures](./docs/guide/how-it-works.md) | You want the idea explained with diagrams, no git knowledge needed. |
| [Getting started](./docs/guide/getting-started.md) | You want to take a first lease, step by step. |
| [Recipes](./docs/guide/recipes.md) | You need claim with expiry, renew, release, list, or an update that retries. |
| [Errors and retries](./docs/guide/errors-and-retries.md) | A call threw and you want to know whether to try again. |
| [Testing](./docs/guide/testing.md) | You are testing code that takes leases. |
| [Git mechanics](./docs/guide/git-mechanics.md) | You want to know what git does underneath. |

Every code block in the README and the guides is a region of a file under `examples/`, which the
test suite runs; `tests/docs-snippets.test.ts` fails when they differ.

## How it works

| Term | Meaning |
|---|---|
| Authority | A git remote name or URL. Its refs are the truth. |
| Lease ref | A ref under a namespace you choose, such as `refs/locks/build-cache`. |
| Lease commit | The commit a lease ref points at. Its tree holds the payload as canonical JSON (`lease.json` by default) and any extra files you add. |
| Local repository | The repository the calls run in (`cwd`). It holds the commits a push sends and the mirror refs a fetch writes. |
| Mirror | The local copy of a lease ref, at the same name. Each write updates it, so a local reader sees the write without a fetch. If another process had moved it, the write leaves it alone, and the next fetch of that ref corrects it. |

| Operation | git | Fails with |
|---|---|---|
| `casCreate(authority, ref, newSha)` | `push --force-with-lease=<ref>:` | `CasFailed` when the ref exists |
| `casReplace(authority, ref, expectedSha, newSha)` | `push --force-with-lease=<ref>:<expected>` | `CasFailed` when the ref moved |
| `casDelete(authority, ref, expectedSha)` | `push --delete --force-with-lease=<ref>:<expected> <ref>` | `CasFailed` when the ref moved or is gone |
| `fetchRef(authority, ref)` | `fetch +<ref>:<ref>`, then read the payload | `RefNotFound`, `PayloadUnreadable` |
| `fetchNamespace(authority, prefix)` | `fetch --prune +<prefix>/*:<prefix>/*` | `GitFailed` |

Any other git failure, such as an unreachable authority or a declined hook, is a `GitFailed`.

- Each call is one attempt. After a `CasFailed`, read the ref again and decide whether to retry.
- A fetch that collides with another local process on a ref lock retries a few times with a short
  backoff. That is the only retry.
- `buildLeaseCommit` writes the commit with git plumbing. It touches no index, work tree or branch.
  Pass `parentSha` to chain each write to the one before, so `git log <ref>` is the lease's history.
- Equal payloads encode to equal bytes (`canonicalJson`), so they give equal blobs on every host.
- Expiry, renewal and ownership rules belong to your payload. The library does not read the payload.
- Call `checkNamespaceConflict(authority, 'refs/locks')` once before the first write. A literal ref
  at the namespace path itself blocks every ref under it, and git's own error for that is hard to
  read.

## API

Every item has TSDoc in the source. The entry point is `@osdlc/ref-lease`.

| Item | What it is |
|---|---|
| `casCreate`, `casReplace`, `casDelete` | The three compare-and-swap writes. Options: `cwd`, `env` and `onMirrorSkip`. |
| `fetchRef<T>` | Read one lease. Options: `payloadFile`, and `decode` to turn the JSON into your type. |
| `fetchNamespace` | Every lease ref under a prefix, mapped to its sha. |
| `buildLeaseCommit` | Write a lease commit. Options: `parentSha`, `extraParentShas`, `payloadFile`, `files`, `identity`, `commitDate`, `message`. |
| `DEFAULT_PAYLOAD_FILE`, `DEFAULT_IDENTITY`, `DETERMINISTIC_EPOCH` | The defaults, and a fixed date for tests that need stable shas. |
| `checkNamespaceConflict` | Fail early when a literal ref blocks the namespace. |
| `canonicalJson` | The payload encoding. |
| `RefLeaseError` and `CasFailed`, `RefNotFound`, `NamespaceConflict`, `GitFailed`, `PayloadUnreadable` | The errors. Each has a `kind` string. |

Every option object takes `cwd`, the local repository (default `process.cwd()`), and `env`, merged
over the process environment for each git call, for settings such as `GIT_SSH_COMMAND`.

Refs and namespaces must be paths under `refs/` outside `refs/heads`, `refs/tags` and
`refs/remotes`, and shas full object ids; anything else throws a `TypeError` before git runs. A
fetch force-updates your local copy of the refs it reads, and `fetchNamespace` deletes local refs
under the prefix that the authority no longer has, so a lease namespace must be one of its own.

### Errors

| Class | `kind` | When |
|---|---|---|
| `CasFailed` | `cas-failed` | A write lost: the ref was not at the expected sha, or a create found it existing. |
| `RefNotFound` | `ref-not-found` | The authority has no such ref. |
| `PayloadUnreadable` | `payload-unreadable` | The lease commit has no payload file, or it is not JSON. |
| `NamespaceConflict` | `namespace-conflict` | A literal ref sits at the namespace path. |
| `GitFailed` | `git-failed` | Any other git failure. It carries `op`, `exitCode` and `stderr`. |
| `RefLeaseError` | `other` | The base class. Your own lease errors may extend it. |

Which ones to retry, with an example handler:
[Errors and retries](./docs/guide/errors-and-retries.md). A `decode` function's own error is not
wrapped: it propagates as thrown. `buildLeaseCommit` throws a `TypeError` for a payload JSON cannot
hold or a bad file name, and a `GitFailed` when the local repository cannot write objects. A
`GitFailed` keeps the underlying git failure as its `cause`.

git runs in the C locale for every push and fetch, so its messages are read the same way whatever
language the user's git speaks.

## Stability

0.x: a minor release may break the API. No item is experimental; every export is stable within a
minor line. Experimental items, when there are any, are listed here as `- \`name\`` lines, and
`tests/tiers.test.ts` checks this list against the `@experimental` tags in the source.

## Platforms

Linux and macOS, where the tests run. Windows is not tested yet. The library itself has no
platform branches. It needs git 2.29 or later, for `fetch --no-write-fetch-head`.

## Conformance cases

[`tests/conformance/`](./tests/conformance/) holds the protocol's cases as data: what each push
result (git's status for the ref and its rejection kind, as `@osdlc/typed-git` reads it) and each
failed fetch means, and the canonical JSON of each value. Another implementation of the
protocol checks itself against the same files.

## Alternatives

| Library | Why not |
|---|---|
| A lock file, `proper-lockfile` | One machine only. |
| Git LFS file locking | A server API on the LFS host, for files, not a general lease. |
| Redis, etcd, a database row | Another service to run and secure. |
| Leases in the issue tracker of a git host | Tied to one host's API, and rate limited. |
| [`@osdlc/typed-git`](https://www.npmjs.com/package/@osdlc/typed-git)'s `push` with `forceWithLease` | One guarded push. This library is built on it and adds the protocol: create, replace and delete semantics, the payload commit, the fetches and the error kinds. |

This library needs nothing but a git remote every participant can push to.

## Design

[docs/planning/](./docs/planning/README.md) records why the package has the shape it has, one
decision per topic.

## Licence

`MIT OR Apache-2.0`: dual-licensed under [MIT](./LICENSE-MIT) or [Apache-2.0](./LICENSE-APACHE), at
your option.
