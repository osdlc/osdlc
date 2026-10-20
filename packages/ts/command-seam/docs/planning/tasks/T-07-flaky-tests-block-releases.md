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
`verify`. Some `command-seam` tests fail now and then on CI runners and pass
on a later run. Each failure below is in a `verify` job, and a later run of the same
branch or of `main` passed. Only run 39371522600 was re-run on the same
commit; its sixth attempt passed.

The tests run on Bun (`bun test`). The "job" column is the CI job label: the
runner and the Node version set up beside Bun, which the tests do not use.

This list comes from a sweep of the failed `packages-ci.yml` and
`packages-publish.yml` runs from 2026-10-18 to 2026-10-20. It may not be
complete.

| Test | File | Failing job | Run |
| --- | --- | --- | --- |
| the managed runner registers a group until the leader exits | `tests/group-signals.test.ts:82` | ubuntu, node 22 | [run](https://github.com/osdlc/osdlc/actions/runs/39309487282/job/118255066807) |
| the managed runner registers a group until the leader exits | `tests/group-signals.test.ts:82` | ubuntu, node 24 | [run](https://github.com/osdlc/osdlc/actions/runs/39317594973/job/118285273854) |
| the managed runner registers a group until the leader exits | `tests/group-signals.test.ts:82` | ubuntu, node 22 (publish) | [run](https://github.com/osdlc/osdlc/actions/runs/39322491374/job/118300259732) |
| the managed runner registers a group until the leader exits | `tests/group-signals.test.ts:82` | ubuntu, node 22 (publish) | [run](https://github.com/osdlc/osdlc/actions/runs/39362624809/job/118432088230) |
| the managed runner registers a group until the leader exits | `tests/group-signals.test.ts:82` | ubuntu, node 24 (publish) | [run](https://github.com/osdlc/osdlc/actions/runs/39362624809/job/118432088429) |
| the managed runner registers a group until the leader exits | `tests/group-signals.test.ts:82` | ubuntu, node 22 (publish) | [run](https://github.com/osdlc/osdlc/actions/runs/39371522600/job/118460302535) |
| the managed runner registers a group until the leader exits | `tests/group-signals.test.ts:82` | ubuntu, node 22 (publish) | [run](https://github.com/osdlc/osdlc/actions/runs/39425734626/job/118637766499) |
| a real step logs both streams in the order it wrote them | `examples/16-launch-and-log.test.ts:130` | macos, node 22 (5 s timeout) | [run](https://github.com/osdlc/osdlc/actions/runs/39315089525/job/118274350130) |
| real git: the hash matches the file’s bytes, sync and async | `examples/17-binary-output.test.ts:118` | macos, node 22 (15 s timeout, publish) | [run](https://github.com/osdlc/osdlc/actions/runs/39307572221/job/118248514041) |
| real git: the hash matches the file’s bytes, sync and async | `examples/17-binary-output.test.ts:118` | macos, node 24 (15 s timeout, publish) | [run](https://github.com/osdlc/osdlc/actions/runs/39423341879/job/118629624481) |
| a verb that starts with ${verb[0]} runs as a command, not an option (${name}) | `tests/shell.test.ts:48` | macos, node 22 (4 s run cap) | [run](https://github.com/osdlc/osdlc/actions/runs/39190768936/job/117862829055) |
| a verb that starts with ${verb[0]} runs as a command, not an option (${name}) | `tests/shell.test.ts:48` | macos, node 24 (5 s timeout, publish) | [run](https://github.com/osdlc/osdlc/actions/runs/39133129996/job/117692188844) |
| a timeout after a group-gone child exited keeps the exit code | `tests/contract.test.ts:531` | ubuntu, node 22 (publish) | [run](https://github.com/osdlc/osdlc/actions/runs/39181794567/job/117835920355) |
| a timeout after a group-gone child exited keeps the exit code | `tests/contract.test.ts:531` | macos, node 24 (publish) | [run](https://github.com/osdlc/osdlc/actions/runs/39193123342/job/117870022024) |

The `shell.test.ts:48` title is a template. The older failing runs name it
"a verb that starts with - or + runs as a command, not an option".

The `group-signals.test.ts:82` test fails in 1.7 to 12 ms. That points at a
race in what the test observes, not a slow runner. The group-gone test
fails in 270 to 540 ms. The other rows hit a timeout.

Two more tests came up in review with no failing run in the sweep:
`tests/output-cap.test.ts:63` ("passing the cap after the child exited
keeps its exit code") and `tests/reason.test.ts:188`. Check them in the
reproduction step. Add a run link if one shows up.

Eleven `packages-publish.yml` runs on `main` failed in `verify`, so
`publish` did not run and the release waited for a later run:
[39133129996](https://github.com/osdlc/osdlc/actions/runs/39133129996),
[39179458575](https://github.com/osdlc/osdlc/actions/runs/39179458575),
[39181794567](https://github.com/osdlc/osdlc/actions/runs/39181794567),
[39193123342](https://github.com/osdlc/osdlc/actions/runs/39193123342),
[39307572221](https://github.com/osdlc/osdlc/actions/runs/39307572221),
[39322491374](https://github.com/osdlc/osdlc/actions/runs/39322491374),
[39326048602](https://github.com/osdlc/osdlc/actions/runs/39326048602),
[39362624809](https://github.com/osdlc/osdlc/actions/runs/39362624809),
[39371522600](https://github.com/osdlc/osdlc/actions/runs/39371522600),
[39423341879](https://github.com/osdlc/osdlc/actions/runs/39423341879),
[39425734626](https://github.com/osdlc/osdlc/actions/runs/39425734626).
All eleven failed on a `command-seam` test.

## Fixes

- [x] `tests/group-signals.test.ts:82` ("the managed runner registers a
      group until the leader exits"). The test checked the registry right
      after `exited`. The runner releases the group only once the group is
      empty. The group can still answer `kill(-pid, 0)` for a moment after
      the leader's exit is reported, and the release then waits for the
      next 250 ms poll. The likely cause is that the killed members
      (`sleep` under `sh`) linger as zombies until they are reaped. This
      was not reproduced. The test now polls the registry until the group
      is released, with a 3 s cap. The runner is right: it keeps a group
      registered until it is empty, as documented.
- [x] `tests/group-signals.test.ts:43` ("the async runner registers a
      group and unregisters it once the group is empty") and
      `examples/09-managed-process.test.ts:205`. Both read the registry
      right after the run settled, the same race. No failing run yet. Both
      now poll until the group is released.
- [ ] `examples/16-launch-and-log.test.ts:130`
- [ ] `examples/17-binary-output.test.ts:118`
- [ ] `tests/shell.test.ts:48`
- [ ] `tests/contract.test.ts:531`

## Approach

1. Reproduce each one: run the file in a loop under load (for example
   `bun test --rerun-each 50 <file>`, or a shell loop with `stress`) on
   Linux and macOS.
2. For each, find what the test waits on. Replace a fixed sleep or a check
   of state that may not be set yet with a wait on the event that sets it.
3. For the timeouts, check whether the work is slow on CI (a real `git`
   or a real child) and raise the timeout only with a reason in the test.
4. Do not retry tests in CI to hide the problem.

## Acceptance criteria

- [ ] Each test in the table passes in a loop of 50 runs under load on
      Linux and on macOS.
- [ ] A fixed sleep or an early state check is replaced by a wait on the
      event it needs. A raised timeout has a reason in the test.
- [ ] The sweep is repeated after the fix: no `command-seam` `(fail)` line
      in `verify` for a week of `packages-ci.yml` and
      `packages-publish.yml` runs.

## Out of scope

- Retries in CI. They hide the problem.
- Other packages' tests.
