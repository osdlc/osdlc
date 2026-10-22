---
id: D-11
type: decision
state: accepted
created: 2026-10-13
---

# D-11: The `bun test` capture path

## Decision

`spawnRunner` uses a different capture path when two things are true: the
runtime is Bun, and `NODE_ENV` is `test`. It runs the command through
`/bin/sh` with stdin, stdout and stderr redirected to temp files, then reads
the files back. Arguments are still not parsed by the shell. There is no
opt-in switch.

## Why

Under `bun test`, once a large module graph is loaded, Bun can hand child
processes stdio that the parent reads back as empty. The temp-file path
avoids that. An explicit opt-in would add a setting every test setup must
remember.

The upstream report is
[oven-sh/bun#24690](https://github.com/oven-sh/bun/issues/24690), still open.
On macOS, the cause found there is `bun test` holding more than 10240 file
descriptors open, which makes the spawn lose its stdio
([#32067](https://github.com/oven-sh/bun/issues/32067)). Bun now reports that
case as an `EBADF` error instead of empty output. Later fixes cut the open
descriptors ([#42077](https://github.com/oven-sh/bun/issues/42077)), and one
reporter found the problem gone in Bun 1.4.2.

## Consequences

- The README "Known issue: `bun test`" section describes the path.
- The suite used to run under `bun test` and take this path, so a separate test runs
  a child process without `NODE_ENV` to cover the pipe path that production
  users get. Its helper lives in `tests/support/`.
- On Node, every test takes the pipe path. The tests now run on Vitest
  ([T-02](../tasks/T-02-vitest.md)), so the capture path is exercised only by
  a `bun test` run of the package, which CI no longer does.
- Once the pipe path is shown to work under `bun test` on the Bun versions
  the package supports, this path can be removed.
