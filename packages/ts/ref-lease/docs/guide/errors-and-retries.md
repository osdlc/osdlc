---
title: Errors and retries
description: "What each error kind means, whether to retry, and a ready-made handler."
sidebar:
  order: 4
---

Every error the library throws is a `RefLeaseError`. Branch on the class, or on `kind`.

| `kind` | Class | What happened | Retry? |
|---|---|---|---|
| `cas-failed` | `CasFailed` | Another writer changed the lease after you read it (or, for a create, it already existed). | Yes, after reading the lease again. |
| `ref-not-found` | `RefNotFound` | There is no lease at that ref. | No. Create it if you meant to. |
| `git-failed` | `GitFailed` | git failed for another reason: the authority is unreachable, a hook declined the push, the URL is wrong, you lack permission. `stderr` has git's message. | No, until the cause is fixed. |
| `payload-unreadable` | `PayloadUnreadable` | The lease commit has no payload file, or it is not JSON. | No. Something wrote that ref without this library. |
| `namespace-conflict` | `NamespaceConflict` | A literal ref sits at the namespace path. | No. Delete that ref. |
| `other` | `RefLeaseError` | Your own code's lease error, if you extend the base class. | Your call. |

A `decode` function's own error is passed through unchanged, and `buildLeaseCommit` throws a
`TypeError` for a payload that is not JSON (`undefined`, a function, `NaN`).

## Handling them

From [examples/errors.test.ts](../../examples/errors.test.ts):

<!-- snippet: examples/errors.test.ts#handle-errors -->
```ts
/** What to tell an operator, and whether trying again can help. */
function explain(e: unknown): { message: string; retry: boolean } {
  if (!(e instanceof RefLeaseError)) throw e // not ours: a bug, let it surface
  switch (e.kind) {
    case 'cas-failed':
      return { message: 'someone else changed the lease first; read it again', retry: true }
    case 'ref-not-found':
      return { message: 'there is no such lease', retry: false }
    case 'git-failed':
      return { message: `git failed: ${(e as GitFailed).stderr}`, retry: false }
    case 'payload-unreadable':
      return { message: `the lease commit is damaged: ${e.message}`, retry: false }
    case 'namespace-conflict':
      return { message: e.message, retry: false }
    default:
      return { message: e.message, retry: false }
  }
}
```

## Why a lost race and a broken push are different errors

A caller retries a lost race and reports anything else. Mixing them up is costly both ways: a hook
that rejects every push, read as a race, gets retried forever with no message; a real race, read as
a failure, stops a worker that only needed to re-read.

The library tells them apart by git's output. A push that loses a race prints a ref-level
rejection (`[rejected] … (stale info)`, or `cannot lock ref … but expected …` when the race is lost
at the authority). A declined hook prints `(pre-receive hook declined)`; a bad URL prints
`URL rejected`. The cases are listed as data in
[tests/conformance/push.json](../../tests/conformance/push.json).

git's messages are matched in English. If your users run git in another language, give the library
a client with `LC_ALL=C`:

```ts
import { Git } from '@osdlc/typed-git'

const git = new Git(repo, { env: { LC_ALL: 'C' } })
casReplace(authority, ref, expected, next, { git })
```

## Each call is one attempt

The library never retries a write for you. Whether to retry depends on what you read next: a
heartbeat should give up at once, a claim may try again, an update re-applies its change. See
[Update with retry](./recipes.md#update-with-retry).

The one retry it does do is local: a fetch that collides with another process on the same local
ref lock waits a few milliseconds and tries again.
