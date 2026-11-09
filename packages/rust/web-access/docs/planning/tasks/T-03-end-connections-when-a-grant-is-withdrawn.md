---
id: T-03
type: task
state: open
created: 2026-11-07
---

# T-03: End a withdrawn grant's connections at once, and only those

## Goal

`ServerHandle::stop` closes every connection still open once its grace period
ends, streams and upgraded WebSockets included. Turning sharing or admin off,
or rotating a token, restarts the server through `stop`, so a device whose
grant was withdrawn loses its open socket within about six seconds
([D-03](../decisions/D-03-grants-and-access-contexts.md)).

Two gaps remain. The socket of a withdrawn admin grant can still be used for
those seconds. And every connection is closed, those of grants still valid
included, so every other device reconnects.

## Proposed

- Track each connection the server accepts, with the grant and the token
  generation it was admitted under.
- On admin off and on a token rotation, close the connections whose grant or
  token is no longer valid at once, and leave the others open.
- Give apps that upgrade connections themselves a signal they can wait on, so
  they can close their side cleanly.

## Done when

- A test opens a WebSocket with the admin token, turns admin off, and sees the
  socket close within one second while a full-grant socket stays open.
- The same for a rotated token and for sharing turned off.
