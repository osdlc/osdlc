---
id: T-01
type: task
state: open
created: 2026-11-07
---

# T-01: Serve over an encrypted connection

## Goal

A token sent over plain HTTP can be read by anyone on the network who sees the
traffic ([D-04](../decisions/D-04-token-transport.md)). An app should be able
to share itself over an encrypted connection with no browser certificate
warning.

## Proposed

- Document running the app on loopback behind a tunnel that terminates TLS,
  such as Tailscale Serve, so the crate needs no change for that path.
- Then let `serve` take a certificate and key the app provides, and listen
  with TLS. A self-signed certificate comes after that.
- When TLS is on, set `Secure` on the share cookie.

## Done when

- A documented path serves the app to another machine over an encrypted
  connection with no certificate warning.
- With TLS on, the cookie carries `Secure`, and a test shows it.
