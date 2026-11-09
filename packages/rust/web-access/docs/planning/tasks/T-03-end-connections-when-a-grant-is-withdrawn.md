---
id: T-03
type: task
state: open
created: 2026-11-07
---

# T-03: End open connections when a grant is withdrawn

## Goal

Turning sharing off, turning admin off or rotating a token stops new requests,
but a connection that is already open keeps running until it closes
([D-03](../decisions/D-03-grants-and-access-contexts.md)). `ServerHandle::stop`
ends the accept loop and waits for in-flight requests, but each connection runs
in its own task, and a WebSocket that was upgraded is not reached at all. A
device whose admin access was withdrawn keeps an open shell.

## Proposed

- Track each connection the server accepts, with the grant and the token
  generation it was admitted under.
- On `stop`, on admin off and on a token rotation, close the connections whose
  grant or token is no longer valid, upgraded ones included, after the grace
  period at most.
- Give apps that upgrade connections themselves a signal they can wait on, so
  they can close their side cleanly.

## Done when

- A test opens a WebSocket with the admin token, turns admin off, and sees the
  socket close within one second.
- The same for a rotated token and for sharing turned off.
