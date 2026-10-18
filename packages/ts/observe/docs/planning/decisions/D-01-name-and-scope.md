---
id: D-01
type: decision
state: accepted
created: 2026-10-18
---

# D-01: Name and scope

## Decision

- The package is `@osdlc/observe`, published to npm from this repository,
  `packages/ts/observe`.
- It has two entry points. `@osdlc/observe` holds the core: the log envelope,
  correlation ids and their env tags, sortable ids, the JSONL writer and
  readers, the machine id and the originator. `@osdlc/observe/session` holds
  the session record, its state machine, the session env tags, the process
  scan, hook status, reconcile and the lifecycle runner.

## Why

- The package lets you see what a running system of tools and agents did, so
  the name says what it is for. The unscoped `agent-session` is an unrelated
  project.
- The session parts use the core: the envelope, the writer, the env tags and
  the machine id. Two packages would need a shared version and a release for
  each. One package with a subpath keeps one version.
- A user of the log envelope alone does not load the session code, because
  the root never imports the subpath.

## Consequences

- Launching agents, talking to terminals, installing hooks and reading
  transcripts stay out of scope. The launcher supplies them through ports.
- Moving an export between the two entry points is a breaking change.
