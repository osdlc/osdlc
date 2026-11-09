---
id: D-01
type: decision
state: accepted
created: 2026-10-18
---

# D-01: Hosts declare what they can do

## Decision

- A host fulfils the contract in parts (`session`, `terminal`, `send`, `find`,
  `focus`, `capture`, `close`, `openWorkspace`), each an optional method on
  `Host`. A host has a part only when its app supports it.
- A caller asks for the part it needs with `requirePart(host, part)`. A
  missing part is a `HostPartMissing` error that names the host and the part,
  never a silent fallback to another host: the person chose this one.
- Facts about a host that are not parts are declared on the host itself:
  `platforms` (where it runs, with `supportsPlatform`), `platformHint` (how to
  get it elsewhere) and `acksSend` (whether `send` can confirm delivery).
  Callers read these declarations; they do not compare host names.

## Why

A declaration sits with the host. A branch on the host name sits with every
caller, and is missed when a host is added: the new host silently gets the
wrong behaviour. With declarations, adding a host changes one file and no
caller.

## Options considered

- **Per-host branches in callers.** Simple at first. Knowledge of each host
  spreads across callers, and a new host gets wrong behaviour wherever a branch
  was not updated.
- **Capability declarations (chosen).** One declaration per host; callers stay
  unchanged when a host is added.

## Consequences

- `hostCanWait(name)` still decides by name (only `tmux` can hold a launch
  until the session exits). It is the one remaining name check in the package,
  and it becomes a declaration on the host when the next host learns to wait.
- A caller that needs a behaviour no part or declaration covers adds a
  declaration here rather than a name check of its own.
