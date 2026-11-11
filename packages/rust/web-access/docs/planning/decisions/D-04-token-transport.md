---
id: D-04
type: decision
state: accepted
created: 2026-11-07
---

# D-04: How the token travels

## Decision

- A token is 32 random bytes, base64url, minted from the operating system's
  random source and kept in a file in a directory the app chooses, created
  owner-only (0600) on Unix.
- Every accepted token is a `Token`: at least 32 characters of
  `A-Z a-z 0-9 - _`. It travels as written in a link, a cookie and a header,
  with no escaping. Tokens are never free text. A token file or override that
  holds anything else is an error at startup.
- A share link is `http://<address>:<port>/?token=<token>`. Opening it sets an
  `HttpOnly; SameSite=Strict; Path=/` cookie named `web_access_<port>` and
  answers with a small page that moves to the same URL without the token. An
  admin token's link sets `web_access_admin_<port>` instead.
- The cookie is a session cookie unless the app sets a lifetime
  (`with_cookie_max_age`). The admin cookie is always a session cookie. On a
  public name behind a TLS proxy the cookie carries `Secure`.
- After that the browser presents the cookie. A script or another program
  presents the `x-web-access-token` header instead.
- The token travels over plain HTTP. That is accepted for networks the user
  trusts, and the README says so.

## Why

- A link is the simplest way to hand access to a phone: scan or tap it.
- The landing page, not a 303, moves to the clean URL. A `SameSite=Strict`
  cookie is not sent on a redirect of a navigation another site started, so
  with a 303 a link opened from a chat or mail page landed on 401. A refresh
  is a new navigation started by the app's own page, so the cookie goes with
  it.
- Removing the token from the URL keeps it out of the address bar, the
  history and any `Referer`.
- A separate admin cookie means opening the everyday full link does not drop
  the admin grant, and the reverse. A shell credential should not outlive the
  browser session, so it never gets a lifetime.
- The port in the cookie name stops two servers on one address from
  overwriting each other's cookie. It does not keep the cookie from them:
  browsers send a host's cookies to every port on it. The README warns about
  this.

## Consequences

- Another server on the same host can read the cookie.
  [T-04](../tasks/T-04-session-cookie.md) tracks a per-browser session id that
  would limit what such a leak exposes.
- Encryption comes later: [T-01](../tasks/T-01-encrypted-transport.md).
