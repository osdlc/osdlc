---
id: D-04
type: decision
state: accepted
created: 2026-11-07
---

# D-04: The package keeps its own table of known harnesses

## Decision

- The package does not depend on a model catalogue. `KNOWN_HARNESSES` lists the coding-agent
  CLIs it knows by name, each with its tool id and executable: `antigravity` (`agy`), `claude`,
  `codex`, `cursor` (`cursor-agent`), `opencode` and `pi`.
- `HarnessSchema` accepts any tool id (a lowercase letter, then lowercase letters, digits and
  hyphens), so a caller can run a tool the table does not list. `harnessOrNull` recognises only
  the listed ids.

## Why

The package used a catalogue library for three things: the tool-id pattern, whether an id is a
built-in tool, and the built-in tools' executables. That library is not published, so the
package could not be installed. Six rows do not justify a dependency.

## Consequences

- A new agent CLI is a row here and an interactive argv builder in `harness.ts`.
- A consumer that keeps a catalogue checks it against `KNOWN_HARNESSES` in its own tests.
