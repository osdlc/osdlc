---
id: D-01
type: decision
state: accepted
created: 2026-11-07
---

# D-01: Name and scope

## Decision

- The package is `@osdlc/agent-router` on npm, and its Rust twin is the `agent-router` crate.
- It answers one question: given a reference or an ordered profile of references, which
  coding-agent tool, model and effort should run. It holds the model catalogue that question
  needs.
- It does not launch anything, detect availability, read files or reach the network. Launching
  belongs to `@osdlc/agent-call`, and availability arrives as a callback.

## Why

- "Tool router" is the common name for routing a model's tool calls (function calling and MCP).
  Several packages and products use it in that sense, and `toolrouter` on npm differs by one
  hyphen. A reader looking for this library would be misled by it, and a reader looking for
  tool-call routing would find this one.
- "Agent router" says what is routed: the choice of coding agent to launch. The name was free
  on npm and crates.io when it was chosen.
- The prose keeps the word "tool" for a program the router can launch, such as `claude` or
  `codex`, because that is what each reference names.

## Consequences

- The package was developed under other names first. None of them was published, so no caller
  has an old name to move from.
