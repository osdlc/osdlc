---
id: D-03
type: decision
state: accepted
created: 2026-11-07
---

# D-03: Grants and access contexts

## Decision

- Each request that passes the guard carries a `Grant` and an
  `AccessContext`.
- The grant comes from the token presented. `read` may look but not change
  anything, `full` may do what the context allows, and `admin` is for what
  hands a peer a shell on the host. They rank in that order. A loopback peer
  under `GuardPolicy::loopback_open` gets `full`.
- The admin token exists only while `WebAccessConfig::admin` is on. While it
  is off the guard does not hold it and no admin link is published. Turning
  admin off deletes the file, so turning it on again mints a new token.
- The context comes from the peer address: loopback (IPv4-mapped included) is
  `webLocal`, anything else `webRemote`. `desktop` is for an app's own
  in-process calls; HTTP never produces it.
- What each grant may do in each context is the app's choice. The app writes a
  `HostPolicy`: a route table and an `allows(context, grant, permission)`
  function over its own permission type. The crate enforces it.
- Both extractors fail closed: a handler with no guard in front sees
  `webRemote` and `read`.

## Why

- One shared token cannot tell a viewer from an editor, and a link that only
  shows data should not be able to change it.
- A shell on the host is a different kind of power from editing app data, so
  it needs its own grant, off by default, whose token does not exist while it
  is off.
- Only the app knows which routes reach the host, so the permission table is
  the app's; the crate keeps the order of checks the same everywhere.

## Consequences

- Behind a reverse proxy every request looks local. The README says not to use
  the crate there.
- Withdrawing a grant restarts the server, and `stop` closes every open
  connection after its grace period, so a withdrawn grant's socket ends within
  about six seconds, and so do the others.
  [T-03](../tasks/T-03-end-connections-when-a-grant-is-withdrawn.md) tracks
  ending only the withdrawn grant's, at once.
