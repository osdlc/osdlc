# web-access

Put an [axum](https://crates.io/crates/axum) app on your local network safely:
listen settings, a minted token, a request guard and a server you can stop.

A desktop or local web app often serves its UI over HTTP on loopback. Opening it
to a phone or another computer on the same network takes more than binding
`0.0.0.0`. Anything on the network can then reach it, and so can any web page
the user visits, through DNS rebinding or a cross-site request. web-access gives
the app one settings shape (on or off, which interfaces, which port), a random
token that travels in a share link, and a guard that checks every request
before the app's own handlers see it.

- **Config.** `WebAccessConfig { enabled, listen, port, admin }`, serde
  camelCase, off and on loopback by default.
- **Tokens.** A `Token` type that holds only a well-formed token: at least 32
  characters of `A-Z a-z 0-9 - _`. A minted token is 32 random bytes in
  base64url. Tokens are kept in a directory you choose (file mode 0600 on
  Unix). There is a full token, a view-only token, and an admin token that
  exists only while admin access is on.
- **Guard.** An axum middleware: `Host` allowlist, `Origin` check, path
  normalisation, token from a cookie, a header or a share link, and a grant
  (`read`, `full` or `admin`) and an access context (local or remote) on every
  request that passes.
- **Permissions.** Your table of routes and what each needs, checked against the
  context and the grant.
- **Server.** `serve` binds every address the config names, wraps your router in
  the guard and returns a handle with the share links and `stop()`.
- **Sharing runtime.** `SharingRuntime` applies a stored config, restarts the
  server when it changes, rotates tokens and reports a status for a settings
  page.

## Who it is for

Apps built on axum that run on the user's own machine and want to be reached
from their other devices: a desktop app with a web UI, a local dashboard, a dev
tool's browser view. The crate has no dependency on any desktop framework.

## When not to use it

- **On an untrusted network.** The token travels over plain HTTP, so anyone who
  can read the traffic can take it. Put the app behind TLS or a VPN, or do not
  share it.
- **Behind a reverse proxy on the same machine.** The access context comes from
  the peer address, so every proxied request looks local. A TLS proxy on
  another machine is supported: see [Behind a TLS proxy](#behind-a-tls-proxy).
- **For user accounts.** There are no users, passwords or sessions, only tokens
  with a grant. Use a session or login crate such as `tower-sessions` or
  `axum-login`.
- **For a public server.** This is for a machine's own network, not the
  internet.

## How it compares

Each crate below covers one part of the job; none covers the whole of it.

| Crate | What it does | What web-access adds |
|---|---|---|
| `tower-http` | General middleware, including header-based auth checks | The share link, the `Host` and `Origin` checks, grants and the server |
| `axum-extra` | Cookies and typed headers | The guard built on them |
| `axum-token-auth` | Token authentication middleware | `Host` and `Origin` checks, grants, minted token files, the server |
| `axum_csrf` | A CSRF token for forms | web-access checks `Origin` against `Host` instead, with no form token |
| `tower-sessions`, `axum-login` | Sessions and user login | A different model: no users, only tokens with a grant |

web-access exists because sharing a local app needs all of these at once, in the
right order, with safe defaults.

## Install

```sh
cargo add web-access
```

The guard and the server run on Tokio, through axum.

## Quick start

Serve a router on loopback behind a token. `serve` refuses to listen beyond
loopback without one.

```rust
use axum::{Router, routing::get};
use web_access::{Listen, Tokens, WebAccessConfig, serve, token::Token};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let app = Router::new().route("/", get(|| async { "hello" }));

    let config = WebAccessConfig {
        enabled: true,
        listen: Listen::Loopback, // or Listen::AllInterfaces to share on the network
        port: 0,                  // 0 asks the OS for a free port
        admin: false,
    };
    // Or token::load_or_mint(dir) to keep the token across restarts.
    let secret = Token::mint()?;
    let server = serve(app, &config, Tokens::full_only(secret)).await?;

    // Hand this link to another device: http://<ip>:<port>/?token=<token>
    println!("{}", server.share_urls()[0]);

    server.stop().await;
    Ok(())
}
```

The [guide](https://github.com/osdlc/osdlc/blob/main/packages/rust/web-access/docs/guide.md)
walks through a share link request by request, each guard check with example requests, the
permission table, tokens, the sharing runtime, what each refusal means, and the security model.

The examples run with `cargo run --example <name>`:

- [`serve_with_token`](examples/serve_with_token.rs): serve with a token, and
  what the guard does with no token, the share link and the cookie.
- [`guard_and_policy`](examples/guard_and_policy.rs): the guard and a route
  permission table in front of your own router, and what each grant may do.
- [`tokens_on_disk`](examples/tokens_on_disk.rs): token files, rotation and an
  override.
- [`mint_token`](examples/mint_token.rs): print a new token, for an override
  or a token file.
- [`sharing_runtime`](examples/sharing_runtime.rs): a settings page's view of
  sharing: turn it on, rotate a token, turn it off.
- [`local_origins`](examples/local_origins.rs): the local-origin helpers and
  the interface list.

## What the guard checks

Every request, whatever its method, passes these checks in order:

1. The `Host` header is on the allowlist or is a public name, else 421. With a
   wildcard bind, any current interface address on the bound port also
   passes. This check holds for loopback peers too: it is what stops a
   DNS-rebinding page from reading the app.
2. A mutating request, or a protocol upgrade such as a WebSocket handshake,
   that carries an `Origin` header has an allowed origin, else 403. An upgrade
   may also come from a desktop webview's own origin (`tauri://localhost`,
   `http(s)://tauri.localhost`). A public name passes only as an `https://`
   origin, on a request for a public name.
3. The path normalises, else 400: no `.` or `..` segment, no `\` and no
   encoded `/`.
4. A loopback peer passes with the `full` grant when the policy's
   `loopback_open` is set, unless the `Host` is a public name. `serve` sets it
   only when there are no tokens.
5. A `GET` with a valid `?token=` sets the cookie and answers with a small
   page that moves to the same URL without the token, so the token does not
   stay in the address bar, the history or a `Referer`. An admin token sets
   its own `web_access_admin_<port>` cookie, so opening a full or read link
   does not replace it.
6. Otherwise the `web_access_<port>` cookie, the `web_access_admin_<port>`
   cookie or the `x-web-access-token` header must hold one of the tokens, else
   401. If they hold different tokens, the highest grant wins.
7. A `read` grant may not use a method other than `GET`, `HEAD` or `OPTIONS`,
   or open a WebSocket, else 403 `{"error":"read_only"}`, unless a read-safe
   rule names the route.

## Tokens

Only a `Token` can join a `Tokens` set. Only `Token::mint()` and
`Token::parse(text)` build a `Token`. `parse` accepts at least 32 characters of
`A-Z a-z 0-9 - _` and nothing else. A minted token (43 characters of base64url)
and a 64-character hex digest both pass. A token never needs escaping, so a
link, a cookie and a header all carry it as written.

The token files and an override must hold a valid token too. A file that holds
anything else, for example because it was edited by hand or emptied, is an
error that names the file. The server does not start, and the file is left as
it is. To fix it, delete the file. A new token is minted on the next start. An
override that is set but is not a token is an error that names the variable.
`token::override_from_env` reads an override from an environment variable. To
make a new token, run `cargo run -p web-access --example mint_token` or call
`Token::mint()?.to_string()`. No error ever shows the token text.

`Tokens::with` refuses the same token at two different grants, because the
higher grant would win. The same token at the same grant is ignored.

A request that passes carries its `AccessContext` (`webLocal` or `webRemote`)
and its `Grant` in the request extensions. Both are axum extractors, and both
fail closed: with no guard in front, a handler sees `webRemote` and `read`.

Every response carries `Referrer-Policy: no-referrer` and
`X-Content-Type-Options: nosniff`. Wrong tokens, bad `Host` headers and foreign
origins can be reported to a callback (`GuardState::with_on_denied`), at most
30 a minute.

## Grants and contexts

- `read` may look but not change anything; `full` may do what the context
  allows; `admin` is for what hands a peer a shell on the host. They rank in
  that order.
- The admin token exists only while `WebAccessConfig::admin` is on. While it is
  off, the guard does not hold it, so presenting it grants nothing, and turning
  admin off deletes the file.
- `AccessContext::Desktop` is for your own app's in-process calls (IPC). HTTP
  never produces it.
- What each grant may do in each context is your app's choice: write a
  `HostPolicy` with a route table and an `allows` function, and install
  `host_policy_layer` inside the guard.

## Behind a TLS proxy

An app can run behind a reverse proxy that ends TLS on another machine, such as
a hosting platform's edge. The proxy forwards the public `Host`, and the peer
is the proxy, which is not loopback, so every request still needs a token. Set
these in `ServeOptions`, or on a `GuardState` you build yourself:

- `public_hosts` (`GuardState::with_public_hosts`): the public names. Each one
  is an allowed `Host`, and an allowed `Origin` only as `https://<name>` on a
  request for a public name. A request for a public name needs a token even
  from loopback, so a proxy on the same machine is covered too. The share
  cookie on a public name carries `Secure`, and the request carries
  `PublicHost` in its extensions. `origin_matches_public_host` is the Origin
  check for a handler on such a request. `normalize_public_host` says whether
  a name is kept.
- `admin_public_only` (`GuardState::with_admin_over_public_only`): the admin
  token gives `admin` only on a public name and `full` anywhere else. Its link
  is refused there and sets no cookie, and the admin share links are
  `https://<name>/?token=...` (`ServerHandle::public_share_urls_for`). This
  stops an admin link opened on a private address from carrying a shell
  credential over plain HTTP. The `Host` header is the client's, so this is
  not proof of how a request arrived. The token is the control.
- `cookie_max_age` (`GuardState::with_cookie_max_age`): a lifetime for the
  share cookie, so it outlives the browser session. The default is a session
  cookie. The admin cookie is always a session cookie.

## Security notes

- The token travels over plain HTTP. Use the crate on networks you trust.
- Browsers do not keep cookies apart by port. The `web_access_<port>` cookie
  goes to every server on the same host name or address, so another server
  there can read the token. The port in the name only keeps two servers from
  overwriting each other's cookie. Do not run untrusted servers on the same
  address as a shared app, above all with admin access on.
- `stop()` ends connections that are still open, such as a stream or a
  WebSocket. After a grace period, every further read and write on them fails.
  `SharingRuntime` stops the server when sharing or admin is turned off or a
  token is rotated. If you put the guard in your own server, an open
  connection keeps running until it closes. Close long-lived connections
  yourself when the grant they were opened with is withdrawn.
- On Windows, token files get no owner-only mode. Keep the token directory in
  the user's own profile (for example under `%LOCALAPPDATA%`), where the
  default permissions keep other users out.
- See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Supported versions

Rust 1.89 or newer.

## Platforms

Linux, macOS and Windows. The one platform difference is the token file mode
described above.

## Stability

This is a 0.x crate. Breaking changes are possible between minor versions and
are listed in the [changelog](CHANGELOG.md).

Every public item is stable within the 0.5 line, except these, which are
experimental and may change in a patch release:

- `Tokens::with_label`

## Design decisions

Short notes on settled design choices are in
[docs/planning/decisions](https://github.com/osdlc/osdlc/tree/main/packages/rust/web-access/docs/planning/decisions).

## Source

The crate lives in the [osdlc/osdlc](https://github.com/osdlc/osdlc)
repository, in `packages/rust/web-access`.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT) at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this crate by you, as defined in the Apache-2.0 license, shall
be dual licensed as above, without any additional terms or conditions.
