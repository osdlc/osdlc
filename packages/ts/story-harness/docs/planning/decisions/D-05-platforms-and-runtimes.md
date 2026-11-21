---
id: D-05
type: decision
state: proposed
created: 2026-11-07
---

# D-05: Platforms and runtimes

## Decision

- Node 22 or later, ESM only.
- The Playwright helpers and the perf report run wherever Playwright runs.
- The `story-shots` command needs bash and Docker, and is supported on Linux
  and macOS. Windows is not supported for it.

## Why

- Node 22 is the oldest maintained line.
- The command is a bash script around `docker run`.

## Consequences

- CI tests the package on Linux and macOS on Node 22, 24 and 26, runs the
  browser tests and the command end to end on Linux.
