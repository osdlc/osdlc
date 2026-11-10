---
id: D-05
type: decision
state: accepted
created: 2026-11-07
---

# D-05: Host and Origin checks

## Decision

- Every request's `Host` must be on the allowlist, else 421, loopback peers
  included. `serve` builds the list from the addresses it binds and the
  host's interfaces.
- A mutating request (any method but `GET`, `HEAD` and `OPTIONS`) and a
  protocol upgrade, such as a WebSocket handshake, that carry an `Origin` must
  name an allowed host, else 403. An upgrade may also come from a desktop
  webview's own origin: `tauri://localhost`, `http://tauri.localhost` or
  `https://tauri.localhost`.
- A plain `GET` with a foreign `Origin` is left to the browser's CORS rules.
  `origin_matches_host` is there for a handler that must refuse one.
- An app behind a TLS-terminating proxy on another machine lists its public
  names (`with_public_hosts`). Each is an allowed `Host`. It is an allowed
  `Origin` only as `https://<name>`, and only on a request whose `Host` is a
  public name. The guard marks such a request with `PublicHost`. A request
  for a public name needs a token even from a loopback peer.
- `with_admin_over_public_only` gives the admin token `admin` only on a public
  name, and `full` elsewhere. Its share link is refused elsewhere.
- The path must normalise, else 400. Deny rules match the normalised path. A
  read-safe rule, which lets a `read` grant use a non-safe method, matches the
  raw path instead.

## Why

- The `Host` check is what stops a DNS-rebinding page from reading the app.
- The same-origin policy does not cover WebSocket handshakes, so without the
  upgrade check any page the user visits could open a socket with the
  loopback peer's `full` grant.
- A proxy forwards the public name, not an address on the allowlist, so the
  `Host` check would refuse every proxied request otherwise. A proxy on the
  same machine makes the peer loopback, so `loopback_open` does not apply to
  a public name: the token is always required. A plain `http://`
  origin of a public name is refused: the page is served over HTTPS.
- The `Host` header is the client's, so a public name does not prove a request
  came through the proxy. `with_admin_over_public_only` only stops an admin
  link opened on a private address from carrying a shell credential over
  plain HTTP. The admin token stays the control. Trusting the Host only from
  known proxy addresses would be stronger, and is left for later.
- A desktop app's webview loads from its own origin and calls its own server
  on loopback, so the check would refuse it otherwise. No page a browser
  loads from the network can present those origins.
- The router routes the raw path. An exemption matched against the
  normalised path could let `/api/search/` reach a different handler than
  `/api/search`, so an exemption matches what the router sees. A deny rule
  matched against the normalised path only refuses more.

## Consequences

- A desktop webview's cross-origin `GET`s to its own server keep working.
- Deny rules are case-sensitive. An app that serves files from a
  case-insensitive file system writes its rules with that in mind;
  [T-06](../tasks/T-06-guard-edge-cases.md) tracks an opt-in.
