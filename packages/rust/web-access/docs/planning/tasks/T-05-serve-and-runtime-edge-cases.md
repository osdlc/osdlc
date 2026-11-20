---
id: T-05
type: task
state: open
created: 2026-11-07
---

# T-05: Edge cases in `serve` and the sharing runtime

## Goal

Two cases where the server or the runtime does something a caller would not
expect.

The port-0 case is closed: a rotation no longer restarts the server
([T-03](T-03-end-connections-when-a-grant-is-withdrawn.md)), so the port and
the other grants' links stay. The guard now admits an interface address that
appears after start.

## Cases

- **Rotating while sharing is off does nothing.** `SharingRuntime::rotate`
  returns `Ok` and leaves the token files as they are while sharing is
  disabled, so a link that leaked keeps working once sharing is turned on
  again. Rotate the files even while sharing is off.
- **IPv6 link-local addresses cannot be used.** A zone id does not survive in
  a `Host` header. Document the limit, or serve them some other way.

## Done when

- Each case has a test, and the README says what each does.
