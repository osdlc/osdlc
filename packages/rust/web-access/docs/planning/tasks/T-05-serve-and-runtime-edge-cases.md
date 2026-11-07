---
id: T-05
type: task
state: open
created: 2026-11-07
---

# T-05: Edge cases in `serve` and the sharing runtime

## Goal

Three cases where the server or the runtime does something a caller would not
expect.

## Cases

- **Port 0 moves on every restart.** With `port: 0`, rotating one grant's token
  restarts the server on a new port, so every grant's links and cookies stop
  working, not only the rotated one's. Keep the port the running server holds
  across a restart of the same config.
- **An empty interface list starts nothing.** `Listen::Interfaces(vec![])`
  binds no address, yet the status says `running: true`. Refuse it with a new
  `ServeError` variant.
- **The host list is taken once.** With `Listen::AllInterfaces`, the allowed
  `Host` list is built from the interfaces present when the server starts, so
  an address that appears later is refused with 421, although the docs say
  "present and future". IPv6 link-local addresses cannot be used at all,
  because a zone id does not survive in a `Host` header. Rebuild the list when
  the interfaces change, or document the limit.

## Done when

- Each case has a test, and the README says what each does.
