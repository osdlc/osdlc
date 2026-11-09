---
id: T-04
type: task
state: open
created: 2026-11-07
---

# T-04: A per-browser session in the cookie, not the token

## Goal

Browsers send a host's cookies to every port on it, so another server on the
same address can read the `web_access_<port>` cookie and replay the long-lived
token ([D-04](../decisions/D-04-token-transport.md)). With admin access on, that
token is a shell credential.

## Proposed

- On the share-link bootstrap, mint a per-browser session id, keep it in the
  server's memory with the grant, and put the session id in the cookie instead
  of the token.
- A session ends with the server, and can be revoked on its own.
- Consider refusing the admin grant from a cookie altogether and requiring the
  header for it.

## Done when

- The cookie never holds a token, in a test.
- A session id taken from the cookie stops working when the server restarts
  or the session is revoked.
