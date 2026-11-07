# @osdlc/ref-lease

Compare-and-swap leases on git refs. A lease is a ref whose commit holds a JSON payload. Every
write is a `git push --force-with-lease` to one git remote, the authority, so the authority decides
who wins a race. Nothing else needs to run: no lock server, no database, no network service beyond
the git host you already have.

It is for tools that coordinate several workers, machines or CI jobs through a repository they all
push to: claiming a task, holding a deploy slot, electing one writer. The payload is yours; the
library stores, reads and swaps it.

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

## How it works

| Term | Meaning |
|---|---|
| Authority | A git remote name or URL. Its refs are the truth. |
| Lease ref | A ref under a namespace you choose, such as `refs/locks/build-cache`. |
| Lease commit | The commit a lease ref points at. Its tree holds the payload as canonical JSON (`lease.json` by default) and any extra files you add. |
| Local repository | The repository the calls run in (`cwd`). It holds the commits a push sends and the mirror refs a fetch writes. |
| Mirror | The local copy of a lease ref, at the same name. Each write updates it, so a local reader sees the write without a fetch. |

| Operation | git | Fails with |
|---|---|---|
| `casCreate(authority, ref, newSha)` | `push --force-with-lease=<ref>:` | `CasFailed` when the ref exists |
| `casReplace(authority, ref, expectedSha, newSha)` | `push --force-with-lease=<ref>:<expected>` | `CasFailed` when the ref moved |
| `casDelete(authority, ref, expectedSha)` | `push --force-with-lease=<ref>:<expected> :<ref>` | `CasFailed` when the ref moved |
| `fetchRef(authority, ref)` | `fetch +<ref>:<ref>`, then read the payload | `RefNotFound`, `PayloadUnreadable` |
| `fetchNamespace(authority, prefix)` | `fetch --prune +<prefix>/*:<prefix>/*` | |

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
| `casCreate`, `casReplace`, `casDelete` | The three compare-and-swap writes. Options: `cwd` or `git`, and `onMirrorSkip`. |
| `fetchRef<T>` | Read one lease. Options: `payloadFile`, and `decode` to turn the JSON into your type. |
| `fetchNamespace` | Every lease ref under a prefix, mapped to its sha. |
| `buildLeaseCommit` | Write a lease commit. Options: `parentSha`, `extraParentShas`, `payloadFile`, `files`, `identity`, `commitDate`, `message`. |
| `DEFAULT_PAYLOAD_FILE`, `DEFAULT_IDENTITY`, `DETERMINISTIC_EPOCH` | The defaults, and a fixed date for tests that need stable shas. |
| `checkNamespaceConflict` | Fail early when a literal ref blocks the namespace. |
| `canonicalJson` | The payload encoding. |
| `RefLeaseError` and `CasFailed`, `RefNotFound`, `NamespaceConflict`, `GitFailed`, `PayloadUnreadable` | The errors. Each has a `kind` string. |
| `classifyPush`, `classifyFetchFailure` and the marker lists | How git's output is read. Experimental. |

Every option object takes `cwd` (default `process.cwd()`) or `git`, a `Git` client from
[`@osdlc/typed-git`](https://www.npmjs.com/package/@osdlc/typed-git), for a custom runner or
environment such as `GIT_SSH_COMMAND`.

### Errors

| Class | `kind` | When |
|---|---|---|
| `CasFailed` | `cas-failed` | A write lost: the ref was not at the expected sha, or a create found it existing. |
| `RefNotFound` | `ref-not-found` | The authority has no such ref. |
| `PayloadUnreadable` | `payload-unreadable` | The lease commit has no payload file, or it is not JSON. |
| `NamespaceConflict` | `namespace-conflict` | A literal ref sits at the namespace path. |
| `GitFailed` | `git-failed` | Any other git failure. It carries `op`, `exitCode` and `stderr`. |
| `RefLeaseError` | `other` | The base class. Your own lease errors may extend it. |

A `decode` function's own error is not wrapped: it propagates as thrown. `buildLeaseCommit` throws
a `TypeError` for a payload JSON cannot hold or a bad file name, and `@osdlc/typed-git`'s
`FailureError` when the local repository cannot write objects.

git's messages are matched in English. Under a translated git, a lost race reads as `GitFailed`.
Run git with `LC_ALL=C` (through a `git` client with that environment) if your users run a
translated git.

## Stability

0.x: a minor release may break the API. The items below are experimental: they may change in a
patch release.

- `classifyPush`
- `classifyFetchFailure`
- `CAS_REJECTION_MARKERS`
- `NOT_FOUND_MARKERS`
- `LOCAL_LOCK_MARKERS`
- `PushOutcome`
- `FetchFailure`
- `GitOutput`

Everything else is stable within a minor line. `tests/tiers.test.ts` checks this list against the
`@experimental` tags in the source.

## Platforms

Linux and macOS, where the tests run. Windows is not tested yet. The library itself has no
platform branches. It needs git 2.29 or later, for `fetch --no-write-fetch-head`.

## Conformance cases

[`tests/conformance/`](./tests/conformance/) holds the protocol's cases as data: what each push or
fetch output means, and the canonical JSON of each value. Another implementation of the protocol
checks itself against the same files.

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
decision per topic. [docs/guide/git-mechanics.md](./docs/guide/git-mechanics.md) explains the git model for
readers new to refs.

## Licence

`MIT OR Apache-2.0`: dual-licensed under [MIT](./LICENSE-MIT) or [Apache-2.0](./LICENSE-APACHE), at
your option.
