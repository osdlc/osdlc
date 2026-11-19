---
id: TM-01
type: term
state: accepted
created: 2026-11-07
---

# TM-01: Agent router

## Definition

The code that decides which [tool](TM-02-tool.md), model and [effort](TM-07-effort.md) run a piece
of work. It reads a [reference](TM-04-reference.md) or a [profile](TM-05-profile.md), checks each
choice against the model catalogue and the caller's availability check, and picks the first that
can run. This package is the agent router; a host such as a CLI mounts it and supplies the
availability check and its configuration.

## Contrast

Not a launcher. The agent router chooses; the launch code (for example `@osdlc/agent-call`) starts
the chosen tool.

Not a tool-call router. It does not route a model's function calls or MCP requests to tools.

## Notes

Decided in [D-06](../decisions/D-06-catalogue-mapping-table-and-resolver.md). Words it uses:
[tool](TM-02-tool.md), [provider](TM-03-provider.md), [reference](TM-04-reference.md),
[profile](TM-05-profile.md), [tier](TM-06-tier.md), [effort](TM-07-effort.md).
