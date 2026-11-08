# web-access guide

This guide explains how web-access works and how to use each part of it. The
[README](../README.md) is the short version; this is the long one, with examples.

- [The problem it solves](#the-problem-it-solves)
- [The pieces](#the-pieces)
- [What happens when a phone opens a share link](#what-happens-when-a-phone-opens-a-share-link)
- [The guard, check by check](#the-guard-check-by-check)
- [Grants and contexts](#grants-and-contexts)
- [Tokens](#tokens)
- [Serving: `serve` and `ServerHandle`](#serving-serve-and-serverhandle)
- [Using the guard without `serve`](#using-the-guard-without-serve)
- [The sharing runtime](#the-sharing-runtime)
- [What each refusal means](#what-each-refusal-means)
- [Security model](#security-model)
- [Common questions](#common-questions)

## The problem it solves

Say you have a desktop app with a web UI. It runs an axum server on
`127.0.0.1:20015`, and the app's window loads its pages from there. Now you want
to open the same UI on your phone, on the same Wi-Fi.

The quick way is to listen on `0.0.0.0` instead of `127.0.0.1`. That works, but:

| Who can now reach the app | How |
|---|---|
| Anyone on the network | They type `http://192.168.1.5:20015/` into a browser. |
| Any web page you visit | A page on `evil.example` makes your browser send requests to `http://192.168.1.5:20015/`, or uses DNS rebinding to read the answers. |
| Another program on your machine | It connects to the port like any other client. |

web-access closes these doors and leaves one open: someone who has your share
link. The link carries a random token. The browser that opens it gets a cookie,
and from then on every request it makes carries the token.

```text
http://192.168.1.5:20015/?token=JTpF4q4LdVU5phq9ecIEm_mMcHleG1IYPhr_0-YiKq0
```

## The pieces

| Piece | What it is | Where |
|---|---|---|
| `WebAccessConfig` | The settings: on or off, which addresses, which port, admin on or off. | crate root |
| `token` module | Mint, store, load and rotate tokens in a directory you choose. | `web_access::token` |
| `Tokens` | The set of tokens a running server accepts, each with a grant. | crate root |
| `guard` | The axum middleware that checks every request. | `web_access::guard` |
| `AccessContext`, `Grant` | Where a request came from and how much it may do. Handlers read them. | crate root |
| `HostPolicy` | Your table of routes and the permission each needs. | crate root |
| `serve`, `ServerHandle` | Bind, wrap your router in the guard, hand back share links and `stop()`. | crate root |
| `SharingRuntime` | Everything above, driven by a settings page. | crate root |

Most apps use either `serve` (one server, you manage the tokens) or
`SharingRuntime` (a settings page turns sharing on and off).

## What happens when a phone opens a share link

The app runs with `Listen::AllInterfaces` on port 20015, and the Mac's address on
the Wi-Fi is `192.168.1.5`.

1. **The phone opens the link.**

   ```text
   GET /?token=JTpF...KiKq0 HTTP/1.1
   Host: 192.168.1.5:20015
   ```

   The guard checks the `Host` (allowed), the path (fine), and finds a valid
   token in the query. It answers with a tiny page instead of the app:

   ```text
   HTTP/1.1 200 OK
   Set-Cookie: web_access_20015=JTpF...KiKq0; HttpOnly; SameSite=Strict; Path=/
   Refresh: 0;url=/
   Cache-Control: no-store
   ```

2. **The page moves to `/`, without the token.** The token is no longer in the
   address bar or the history.

   ```text
   GET / HTTP/1.1
   Host: 192.168.1.5:20015
   Cookie: web_access_20015=JTpF...KiKq0
   ```

   The guard finds the token in the cookie. The request reaches your router
   with `AccessContext::WebRemote` and `Grant::Full` in its extensions.

3. **Every later request carries the cookie.** It is a session cookie, so the
   browser keeps it until it is closed (some phone browsers keep sessions much
   longer). Opening the link again signs the browser in again; rotating the
   token signs it out.

A script or another program skips the link and sends the header instead:

```sh
curl -H 'x-web-access-token: JTpF...KiKq0' http://192.168.1.5:20015/api/notes
```

> **Why a page and not a redirect?** The cookie is `SameSite=Strict`. If the link
> is opened from a chat or a mail page, the browser treats the whole navigation as
> started by that other site, and a 303 redirect would arrive without the cookie:
> the phone would see "missing or wrong token". The landing page starts a new
> navigation from the app's own page, so the cookie is sent.

## The guard, check by check

Every request, whatever its method, goes through these checks in order. The first
one that fails answers the request.

| # | Check | Fails with | Why it exists |
|---|---|---|---|
| 1 | `Host` is on the allowlist, or for a wildcard bind a current interface address on its port | 421 `host not allowed` | Stops DNS rebinding: a page on `evil.example` that points its name at `192.168.1.5` still sends `Host: evil.example`. |
| 2 | A mutating request or a WebSocket upgrade with an `Origin` has an allowed origin | 403 `origin not allowed` | Stops another site from changing data, or opening a socket, through your browser. |
| 3 | The path normalises | 400 `bad path` | Stops `/a/../admin` and `/a%2Fb` tricks from slipping past route rules. |
| 4 | A loopback peer under `loopback_open` | passes with `full` | Lets the app's own window work with no token, when you allow it. |
| 5 | `GET` with a valid `?token=` | 200 landing page | The share link (above). |
| 6 | A valid token in the `web_access_<port>` cookie or the `x-web-access-token` header | 401 `missing or wrong token` | The token check itself. |
| 7 | A `read` grant uses only `GET`, `HEAD`, `OPTIONS` (and no WebSocket), or a read-safe route | 403 `{"error":"read_only"}` | View-only links stay view-only. A WebSocket can carry writes. |

Every response also carries `Referrer-Policy: no-referrer` and
`X-Content-Type-Options: nosniff`.

Some examples, with `Host: 192.168.1.5:20015` unless shown:

| Request | Result |
|---|---|
| `GET /` with no token | 401 |
| `GET /` with `Host: evil.example` and a valid token | 421 |
| `POST /api/save` with a valid token and `Origin: https://evil.example` | 403 |
| `GET /ws` upgrade with `Origin: http://localhost:5173` (another local app) | 403 |
| `GET /ws` upgrade with `Origin: tauri://localhost` (the app's own webview) | passes |
| `GET /a/../secret` | 400 |
| `POST /api/save` with a `read` token | 403 `read_only` |
| `GET /ws` WebSocket upgrade with a `read` token | 403 `read_only`, unless a read-safe rule names `GET /ws` |
| `POST /api/search` with a `read` token, `/api/search` listed as read-safe | passes |
| `POST /api/search/` (trailing slash) with a `read` token | 403 `read_only`, because the router may send that path to another handler |
| `POST /api/notes/my%20note` with a `read` token, `/api/notes/*` listed as read-safe | passes |

## Grants and contexts

Each request that passes carries two values.

**`Grant`: how much it may do.** It comes from the token presented.

| Grant | Meant for | Ranks |
|---|---|---|
| `Read` | Showing data. Non-safe methods are refused unless the route is read-safe. | lowest |
| `Full` | Everything the app lets this context do. | middle |
| `Admin` | What hands a peer power over the host itself, such as a terminal. | highest |

**`AccessContext`: where it came from.**

| Context | Meaning |
|---|---|
| `WebLocal` | HTTP from this machine (a loopback peer). |
| `WebRemote` | HTTP from anywhere else, or a peer the server could not see. |
| `Desktop` | Your app's own in-process calls (IPC). HTTP never produces it. |

Both are axum extractors, so a handler reads them like any other argument:

```rust
use web_access::{AccessContext, Grant};

async fn whoami(context: AccessContext, grant: Grant) -> String {
    format!("{context:?} with {grant:?}")
}
```

They fail closed: with no guard in front, a handler sees `WebRemote` and `Read`.

### Your permission table

What each grant may do in each context is your decision. Write it as a
`HostPolicy`: your own permission type, a route table, and an `allows` function.
Install it with `host_policy_layer`, inside the guard (see
[Using the guard without `serve`](#using-the-guard-without-serve)); the crate
then checks it on every request the guard lets through.

```rust
use axum::http::Method;
use serde::Serialize;
use web_access::{AccessContext, Grant, HostPolicy, RouteRule};

#[derive(Clone, Copy, Serialize)]
enum Permission {
    Write,
    RunCommand,
}

fn allows(context: AccessContext, grant: Grant, permission: Permission) -> bool {
    match permission {
        Permission::Write => grant >= Grant::Full,
        // A shell: fine from this machine, and from elsewhere only with admin.
        Permission::RunCommand => context == AccessContext::WebLocal || grant >= Grant::Admin,
    }
}

let policy = HostPolicy {
    allows,
    routes: vec![
        RouteRule::new(Some(Method::POST), "/api/notes/*", Permission::Write),
        RouteRule::new(None, "/api/terminal/*", Permission::RunCommand),
    ],
};
```

A refused request gets 403 with a body that says why:

```json
{"error":"forbidden_in_context","permission":"RunCommand","context":"webRemote","grant":"full"}
```

Rule paths are matched against the normalised path, and `/*` matches anything
below a prefix. See [`guard_and_policy`](../examples/guard_and_policy.rs) for a
runnable version.

## Tokens

A token is 32 random bytes from the operating system, written as 43 base64url
characters. The `token` module keeps them in files in a directory you choose:

| File | Token | Exists |
|---|---|---|
| `web-access-token` | full | always, once minted |
| `web-access-read-token` | read | always, once minted |
| `web-access-admin-token` | admin | only while admin access is on |

```rust
use std::path::Path;
use web_access::token;

fn tokens(dir: &Path) -> std::io::Result<()> {
    let full = token::load_or_mint(dir)?;        // minted once, then read back
    let read = token::load_or_mint_read(dir)?;   // its own file
    let new_full = token::rotate(dir)?;          // old full links stop working
    let pinned = token::resolve(dir, Some("set-by-env"))?; // an override wins
    let _ = (full, read, new_full, pinned);
    Ok(())
}
```

- On Unix each file is created with mode 0600 before anything is written to it,
  and written through a temporary file that is renamed into place.
- A file that is empty counts as missing and is minted again. A file that cannot
  be read is an error; the crate never quietly replaces a token links may carry.
- `token::mint()` gives a token that is never written anywhere, for a secret that
  lives as long as the process.

`Tokens` is what a running guard accepts:

```rust
use web_access::{Grant, Tokens};

let tokens = Tokens::none()
    .with("read-token", Grant::Read)
    .with("full-token", Grant::Full);
// Shorthand for one full token:
let one = Tokens::full_only("full-token".to_owned());
```

Blank tokens are ignored. Tokens are compared in constant time. If a request
presents tokens for two grants (header and cookie), the higher grant wins.

## Serving: `serve` and `ServerHandle`

`serve` binds the addresses in the config, puts the guard in front of your router
and starts serving.

```rust
use axum::{Router, routing::get};
use web_access::{Listen, Tokens, WebAccessConfig, serve, token};

async fn share() -> Result<(), Box<dyn std::error::Error>> {
    let config = WebAccessConfig {
        enabled: true,
        listen: Listen::AllInterfaces,
        port: 20015,
        admin: false,
    };
    let app = Router::new().route("/", get(|| async { "hello" }));
    let server = serve(app, &config, Tokens::full_only(token::mint()?)).await?;

    for link in server.share_urls() {
        println!("{link}"); // one per network address of this machine
    }
    server.stop().await;
    Ok(())
}
```

| `Listen` | Binds | Share links |
|---|---|---|
| `Loopback` | `127.0.0.1` | `127.0.0.1` only |
| `AllInterfaces` | `0.0.0.0` | one per non-loopback IPv4 address the machine had when the server started |
| `Interfaces(vec![..])` | exactly those addresses | one per address |

What `serve` refuses:

| Situation | Error |
|---|---|
| `config.enabled` is false | `ServeError::Disabled` |
| Listening beyond loopback with no tokens | `ServeError::TokenRequired` |
| An address cannot be bound | `ServeError::Bind { addr, source }` |

With no tokens on loopback, `serve` lets loopback peers in with `full`
(`loopback_open`). Use `serve_opts` with `ServeOptions` to set the policy
yourself, list read-safe routes, or get a callback for each refused request:

```rust
use std::sync::Arc;
use web_access::{Denial, GuardPolicy, ServeOptions};

let options = ServeOptions {
    policy: Some(GuardPolicy { loopback_open: false }),
    on_denied: Some(Arc::new(|d: &Denial| {
        eprintln!("refused {:?} {} {} from {:?}", d.reason, d.method, d.path, d.peer);
    })),
    ..ServeOptions::default()
};
```

`stop()` stops accepting connections and waits up to five seconds for
in-flight requests to finish. It then closes every connection still open, such
as a stream or a WebSocket, and releases the ports. See
[Security model](#security-model).

## Using the guard without `serve`

If you run your own server, put the guard in front of your router yourself.

```rust
use std::sync::Arc;
use axum::{Router, middleware::from_fn_with_state, routing::get};
use web_access::{GuardPolicy, GuardState, Tokens, guard::guard};

let state = Arc::new(GuardState::new(
    Tokens::full_only("full-token".to_owned()),
    ["192.168.1.5:20015".to_owned(), "localhost:20015".to_owned()],
    GuardPolicy::default(),
));
let app: Router = Router::new()
    .route("/", get(|| async { "hello" }))
    .layer(from_fn_with_state(state, guard));
```

- The second argument is the `Host` allowlist: `host:port` values, compared
  without regard to letter case. Include every name a browser will use.
- Serve the router with `into_make_service_with_connect_info::<SocketAddr>()`.
  Without the peer address, every request counts as `WebRemote`.
- Put `host_policy_layer` inside the guard (add it with `.layer` before the
  guard's `.layer`), so it sees the context and grant the guard set.

## The sharing runtime

`SharingRuntime` is for an app with a "Share on network" settings page. You give
it three things:

1. a `ConfigStore`, where the settings are saved;
2. a directory for the token files;
3. a function that builds your router (called on every start, so a rebind gets a
   fresh router).

```rust
use std::path::PathBuf;
use axum::Router;
use web_access::{ConfigStore, Grant, RuntimeError, SharingRuntime, WebAccessConfig};

/// Where your app keeps its settings: a file, a database row...
struct MyStore;

impl ConfigStore for MyStore {
    fn load(&self) -> Result<WebAccessConfig, String> {
        Ok(WebAccessConfig::default()) // read your settings here
    }
    fn save(&self, _cfg: &WebAccessConfig) -> Result<(), String> {
        Ok(()) // write them here
    }
}

async fn settings_page(dir: PathBuf, router: fn() -> Router) -> Result<(), RuntimeError> {
    let runtime = SharingRuntime::new(MyStore, dir, router);

    runtime.start_from_store().await?; // at app start

    // The user turned sharing on.
    let status = runtime
        .set(WebAccessConfig {
            enabled: true,
            ..WebAccessConfig::default()
        })
        .await?;
    println!("view-only link: {}", status.share_urls.read[0]);

    // The user pressed "reset view-only link".
    runtime.rotate(Grant::Read).await?;
    Ok(())
}
```

What the settings page shows comes from `WebAccessStatus`:

```json
{
  "enabled": true,
  "listen": "allInterfaces",
  "port": 20015,
  "admin": false,
  "running": true,
  "shareUrls": {
    "read": ["http://192.168.1.5:20015/?token=..."],
    "full": ["http://192.168.1.5:20015/?token=..."],
    "admin": []
  }
}
```

- `set` saves first, then restarts the server. If the start fails (say the port
  is taken), the setting stays saved, `running` is false and `error` says why.
- `rotate(grant)` mints a new token for that grant only. The other grants' links
  keep working.
- Turning `admin` off deletes the admin token file, so turning it on again makes
  a new link.
- `status.without_tokens()` is the copy to show a remote peer: the links lose
  their tokens and admin is not mentioned.

[`sharing_runtime`](../examples/sharing_runtime.rs) runs the whole cycle.

## What each refusal means

| Status | Body | Meaning | Usual cause |
|---|---|---|---|
| 400 | `bad path` | The path has `.` or `..`, a `\`, or an encoded `/`. | A crafted URL. |
| 401 | `missing or wrong token` | No valid token in the cookie or the header. | A link from before a rotation, or a browser that never opened the link. |
| 403 | `origin not allowed` | A change or WebSocket from another site. | A page on another origin, or a dev server on another port. |
| 403 | `{"error":"read_only"}` | A view-only token tried to change something. | A read link used for an edit. |
| 403 | `{"error":"forbidden_in_context",...}` | Your `HostPolicy` refused it. | For example, a remote `full` grant reaching a terminal route. |
| 421 | `host not allowed` | The `Host` header is not one the server answers to. | A host name the server does not know, another port, or DNS rebinding. |

## Security model

What web-access protects against:

- people on the network without the link;
- web pages you visit (cross-site requests, DNS rebinding, cross-site WebSockets);
- the token leaking through the address bar, history or `Referer`.

What it does not protect against, and what to do instead:

| Limit | What it means | Do instead |
|---|---|---|
| Plain HTTP | Someone who can read the network traffic can read the token. | Use it only on networks you trust, or behind TLS (for example a VPN or Tailscale Serve). |
| Cookies are not kept apart by port | Browsers send a host's cookies to every port on it. Another server on the same address can read `web_access_20015`. The port in the name only stops two servers overwriting each other's cookie. | Do not run untrusted servers on the same address as a shared app, especially with admin on. |
| Open connections survive a revoke in your own server | `serve`'s `stop()` closes open connections, and `SharingRuntime` stops the server when sharing or admin is turned off or a token is rotated. With the guard in your own server, a WebSocket or stream already open keeps going until it closes. | Close long-lived connections yourself when the grant they were opened with is withdrawn. |
| Reverse proxies | Behind a proxy on the same machine, every request comes from loopback, so every request is `WebLocal`. | Do not put a proxy in front, or turn `loopback_open` off and do not trust `WebLocal`. |
| Windows file permissions | Token files get no owner-only mode. | Keep the token directory in the user's profile, such as under `%LOCALAPPDATA%`. |
| One token per grant | Every device shares the same token, so you cannot revoke one device. | Rotate the token, which signs every device out. |

Report a vulnerability as [SECURITY.md](../SECURITY.md) says.

## Common questions

**My old link stopped working after I switched networks.** With
`Listen::AllInterfaces`, the server answers on any address the machine has on
its port, but the share links list the addresses it had when the server
started. Restart sharing (with `SharingRuntime::set`) to get links for the new
address.

**My app's own window gets 401.** Either give it a token, or let loopback in with
`GuardPolicy { loopback_open: true }`. `serve` does that for you only when there
are no tokens.

**A link opened in an in-app browser keeps asking again.** Some in-app browsers
keep no cookies between visits. The header form (`x-web-access-token`) works for
scripts; for people, open the link in the system browser.

**How do I sign every device out?** Rotate the grant's token:
`runtime.rotate(Grant::Full)`. Open WebSockets are not closed by that; see the
security model.

**Can I use my own header name?** Not yet. The header is `x-web-access-token`
(`web_access::guard::TOKEN_HEADER`).
