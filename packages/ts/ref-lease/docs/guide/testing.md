---
title: Testing
description: "Testing code that takes leases: a real git fixture, stable commit ids, simulating a race, keeping the clock out."
sidebar:
  order: 5
---

Test against real git: a bare repository as the authority and a working repository to run from.
Both are temp directories, so the tests need no network.

[`@osdlc/typed-git/testing`](https://www.npmjs.com/package/@osdlc/typed-git) makes the pair. From
[examples/recipes.test.ts](../../examples/recipes.test.ts):

<!-- snippet: test-fixture -->
```ts
const { bare, worker, cleanup } = makeBareAndWorker()
worker.commit('init', { '.gitkeep': '' })
afterAll(cleanup)
const authority = bare.dir
const cwd = worker.dir
```

The working repository needs one commit before it can fetch into itself; `worker.commit` makes it.

## The same sha on every run

A commit's sha depends on its date. Pass `DETERMINISTIC_EPOCH` when a test compares shas across
runs. From [examples/commit-options.test.ts](../../examples/commit-options.test.ts):

<!-- snippet: deterministic -->
```ts
const opts = { cwd: repo.dir, commitDate: DETERMINISTIC_EPOCH }
expect(buildLeaseCommit({ holder: 'a' }, opts)).toBe(buildLeaseCommit({ holder: 'a' }, opts))
```

## Simulating a race

To test what your code does when it loses, change the lease between your read and your write.
Calling another writer from inside your own read-modify-write step is enough: the test for
`updateWithRetry` in [examples/recipes.test.ts](../../examples/recipes.test.ts) does this.

To test a race lost at the authority itself (after git's own client-side check passed), install a
`pre-receive` hook on the bare repository that sleeps, and move the ref from another process while
it sleeps. `tests/primitives.test.ts` has an example.

## Time

Keep the clock out of your lease logic: pass `now` in, as the recipes do. Then a test can claim at
`12:00`, try again at `12:05` and take over at `12:11` without waiting.
