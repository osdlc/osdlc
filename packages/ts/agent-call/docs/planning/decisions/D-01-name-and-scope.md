---
id: D-01
type: decision
state: accepted
created: 2026-10-18
---

# D-01: Name and scope

## Decision

- The package is `@osdlc/agent-call`, published to npm from this repository,
  `packages/ts/agent-call`.
- It does one job: one call spec for headless coding-agent CLIs. A caller
  describes the prompt, permissions, context, output shape and session once.
  An adapter turns the spec into a `claude`, `codex`, `agy` or `opencode`
  command line and records every approximation. The result comes back
  normalized, with the raw output kept.
- It runs one call and reads the answer. It holds no session open, does not
  stream output to the caller, and does not call a model API.
- It is published. No package found maps one spec onto several agent CLIs.

## Why

- The name says what it does: make one call to an agent. The `typed-*` names
  are for a library that mirrors one tool's commands as typed methods. This
  library wraps four CLIs, plus custom and template adapters for any other.
  Its API is one agent-agnostic spec, not any one tool's commands.
- acpx drives agents through Agent Client Protocol adapters, not through the
  CLIs. It keeps sessions on disk and has dependencies. Callers that need the
  CLIs' own flags, such as `--plugin-dir`, `--settings` and `--resume=<id>`,
  need a call over the CLI itself. The README says when to pick acpx.

## Consequences

- Orchestration, trace backends and live steering stay out of scope.
- An adapter that speaks the Agent Client Protocol is a possible later
  addition inside this package, not a replacement for it.
