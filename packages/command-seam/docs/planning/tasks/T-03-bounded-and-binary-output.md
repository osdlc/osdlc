---
id: T-03
type: task
state: open
created: 2026-10-13
---

# T-03: Bounded and binary output

## Goal

Every capture runner can cap its output, and a caller can ask for bytes
instead of text. This waits until a user needs it
([D-10](../decisions/D-10-output-is-text.md)).

## Today

- Output is decoded as UTF-8 text.
- The sync pipe path caps each stream at 256 MB and reports a kill at the cap
  as `reason: 'output'`.
- The async runner and the `bun test` capture path have no cap.

## Approach

1. Give the async runner and the `bun test` capture path the same cap, with
   `reason: 'output'`.
2. Add an opt-in byte mode.
3. Document both in the README.

## Acceptance criteria

- [ ] Every capture runner enforces one documented cap and reports
      `reason: 'output'` when output passes it.
- [ ] A caller can get stdout and stderr as bytes.
