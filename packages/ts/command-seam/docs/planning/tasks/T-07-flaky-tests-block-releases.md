---
id: T-07
type: task
state: open
created: 2026-10-19
---

# T-07: Flaky tests that block releases

## Goal

The `command-seam` suite passes on every run in CI, so an unrelated pull
request or a release never fails on it.

## Today

`packages-ci.yml` and `packages-publish.yml` run every package's tests in
`verify`. Five `command-seam` tests fail now and then on CI runners and pass
on a re-run. On 2026-10-19 they failed `verify` on several branches with no
`command-seam` change, and twice stopped a Version Packages publish run
before `publish`, so other packages' releases waited on a re-run.

| Test | File | Seen failing on |
| --- | --- | --- |
| the managed runner registers a group until the leader exits | `tests/group-signals.test.ts:82` | ubuntu, Node 22 and 24 |
| a failed stdin write keeps the exit code, with the error and no reason | `tests/reason.test.ts:188` | macos, Node 22 |
| the cap applies to stderr on its own | `tests/output-cap.test.ts:43` | ubuntu, Node 24 |
| a real step logs both streams in the order it wrote them | `examples/16-launch-and-log.test.ts:130` | macos, Node 22 (5 s timeout) |
| real git: the hash matches the file's bytes, sync and async | `examples/17-binary-output.test.ts:118` | macos, Node 24 (15 s timeout) |

The first three fail in a few milliseconds, which points at a race in what
the test observes, not a slow runner. The last two hit their timeouts.

## Approach

1. Reproduce each one: run the file in a loop under load (for example
   `--repeat` or a shell loop with `stress`) on Linux and macOS.
2. For each, find what the test waits on. Replace a fixed sleep or a check
   of state that may not be set yet with a wait on the event that sets it.
3. For the two timeouts, check whether the work is slow on CI (a real `git`
   or a real child) and raise the timeout only with a reason in the test.
4. Do not retry tests in CI to hide the problem.
