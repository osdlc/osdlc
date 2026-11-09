---
id: D-01
type: decision
state: accepted
created: 2026-11-07
---

# D-01: Name, scope and home

## Decision

- The crate is `web-access`, published to crates.io from this repository,
  `packages/rust/web-access`.
- It does one job: put an axum router on the local network behind a token,
  with the checks that make that safe. That covers the listen settings, the
  token files, the request guard, the access context and grant of each
  request, a route permission table the app fills in, the host's interfaces,
  the server handle and a sharing runtime for a settings page.
- It depends on no desktop framework. An app embeds it in its own process and
  passes its own router; one app runs one server, on its own port, with its
  own tokens.
- It has no twin in another language. The settings pages that drive it are
  apps' own code.

## Why

- On 2026-11-07 the name was free on crates.io (`web-access` and
  `web_access`) and on npm, and no crate with a similar name does this job.
  The nearest name, `rpi-web-access`, fetches web pages for an agent.
- No existing crate covers the job. `tower-http`, `axum-extra`,
  `axum-token-auth`, `axum_csrf`, `tower-sessions` and `axum-login` each cover
  one part (header auth, cookies, a token check, CSRF, sessions), and none
  adds the share link, the `Host` and `Origin` checks, grants and a stoppable
  server together.
- Keeping desktop frameworks out lets a headless entry point and a desktop
  app call the same `serve`.

## Consequences

- Features that need user accounts, passwords or sessions belong in another
  crate.
- The crate does not know which application it serves; per-application
  defaults, such as a fixed port per app, stay in the application.
