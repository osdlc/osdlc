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
- The path must normalise, else 400. Deny rules match the normalised path. A
  read-safe rule, which lets a `read` grant use a non-safe method, applies
  only when the raw path is already normalised.

## Why

- The `Host` check is what stops a DNS-rebinding page from reading the app.
- The same-origin policy does not cover WebSocket handshakes, so without the
  upgrade check any page the user visits could open a socket with the
  loopback peer's `full` grant.
- A desktop app's webview loads from its own origin and calls its own server
  on loopback, so the check would refuse it otherwise. No page a browser
  loads from the network can present those origins.
- The router routes the raw path. An exemption matched against the
  normalised path could let `/api/search/` reach a different handler than
  `/api/search`. A deny rule matched that way only refuses more.

## Consequences

- A desktop webview's cross-origin `GET`s to its own server keep working.
- Deny rules are case-sensitive. An app that serves files from a
  case-insensitive file system writes its rules with that in mind;
  [T-06](../tasks/T-06-guard-edge-cases.md) tracks an opt-in.
