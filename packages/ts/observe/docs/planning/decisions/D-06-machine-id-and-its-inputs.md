---
id: D-06
type: decision
state: accepted
created: 2026-10-18
---

# D-06: Machine id and its inputs

## Decision

- `machineId()` has side effects. It reads `OBSERVE_MACHINE_ID` (or
  `SDLC_MACHINE_ID`). If that is unset, it reads the cache file. If the file
  holds no id, it probes the platform, which can spawn `ioreg` or `reg`, and
  writes the cache file. It resolves once per process.
- `sessionEnv`, the reconcile run and `isThisMachine` take an optional
  `machine` input. When it is given, they do not call `machineId()`.

## Why

- A stable id needs a probe and a cache, so the side effects cannot be
  avoided in the default path.
- A caller that tests or embeds the package needs a way to avoid reading and
  writing a file on the machine. An input does that without a global switch.
- The id is a hash. It never contains the hardware UUID or the hostname.

## Consequences

- The README and the TSDoc list the side effects.
- The default stays the same. A caller that passes nothing gets the machine
  id from `machineId()`.
