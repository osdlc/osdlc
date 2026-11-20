---
id: T-03
type: task
state: done
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

## Done

- `serve` gives each connection its own cut switch. The guard notes, on the
  connection, which token let each request in.
- `ServerHandle::replace_tokens` hands the running server new tokens and cuts
  the connections of every token that is gone at once. The others stay open.
- `SharingRuntime` uses it for a rotation, for admin on or off and before
  stopping for sharing off. It restarts only for a new listen setting or port.
- A handler can take `guard::ConnectionCut` to end work it runs apart from
  the socket.
- Tests open an upgraded socket and a stream with each grant, turn admin off,
  rotate a token and turn sharing off, and see the withdrawn ones close within
  one second while the others stay open (`runtime.rs`, `serve.rs`).
