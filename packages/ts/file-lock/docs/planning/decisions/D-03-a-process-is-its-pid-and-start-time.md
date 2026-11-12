---
id: D-03
type: decision
state: proposed
created: 2026-11-12
---

# D-03: A process is its pid and its start time

## Decision

- The package tells a holder from a later process that reuses its pid by the
  process's start time. `processStartedAt(pid)` reads it, and
  `sameProcess(pid, startedAt)` compares it with what a lock recorded.
  `holderGone` uses `sameProcess` for a holder returned as
  `{ pid, startedAt }`.
- A start time is read as a number, never as clock text in the local zone or
  language: on Linux from `/proc/<pid>/stat` and the boot time in
  `/proc/stat`, with no subprocess; elsewhere from `ps -o lstart` run with
  `LC_ALL=C` and `TZ=UTC0`, read as UTC. Windows has no reading.
- A recorded start may be an instant (ms or seconds since the epoch, or
  ISO-8601 with a zone), or zoneless `ps -o lstart` text, which matches when
  it is the real start time in some real time-zone offset. Against an
  instant, only a process that started more than two seconds after it counts
  as a different one: a pid is reused only after its holder exits, so a
  reuser always starts later, and a writer that recorded something later
  than its start (when it took the lock) is not mistaken for a reuser.
- When either start time cannot be read, `sameProcess` answers true. A lock
  held a little too long costs less than a live holder's work taken over.
- The `ps` call is the caller's to replace (`PsRunner`), so a host that runs
  every subprocess through its own seam can keep doing so. The default is
  Node's `spawnSync`, since the package has no dependencies.
- The new exports are experimental until a second consumer, repo-cleaner's
  process probe, has used them.

## Why

- `pidAlive` alone keeps a lock held by a reused pid, and the staleness guide
  told callers to write their own start-time rule. repo-cleaner, sdlc, and
  `@osdlc/agent-seat` each needed one, and the two that existed read
  `ps -o lstart` as local time. That text names two moments in the repeated
  hour of a daylight-saving change, and cannot be read at all in a locale
  whose day and month names are not English
  ([osdlc#679](https://github.com/osdlc/osdlc/issues/679)).
- The design follows `@rushstack/node-core-library`'s `LockFile` (MIT), which
  solves the same problem for Rush. Its helpers are exported "for unit tests
  only", so depending on them is not an option, and the package brings eight
  dependencies.
- Matching zoneless text in any time zone lets a lock written by another
  program, in a zone this process does not know, still be checked. The
  repeated hour of a daylight-saving change is two offsets of one moment, so
  it matches too.
- No npm package does this: `pidusage` reads a process's age the same way but
  is asynchronous and built for CPU and memory sampling, and `ps-list` and
  `process-exists` give no start time.

## Consequences

- A live process that reuses a holder's pid at a start time a whole number of
  quarter hours from the recorded zoneless text (within twelve to fourteen
  hours) is taken for the holder. An instant has no such gap, so writers
  should record `processStartedAt(process.pid)` rather than `ps` text.
- A clock set back by more than two seconds while a holder runs can make an
  instant-recorded holder look replaced on Linux, where the start time is
  boot time plus ticks.
- A start time in a form `sameProcess` cannot read gives no protection: the
  holder is judged on its pid alone.
