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
- **Rotating while sharing is off does nothing.** `SharingRuntime::rotate`
  returns `Ok` and leaves the token files as they are while sharing is
  disabled, so a link that leaked keeps working once sharing is turned on
  again. Rotate the files even while sharing is off.
- **IPv6 link-local addresses cannot be used.** A zone id does not survive in
  a `Host` header, so a link-local address never matches the allowlist. Allow
  it, or document the limit.

## Done when

- Each case has a test, and the README says what each does.
