# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `token::Token`: a token that is always well formed. It is built only by
  `Token::mint()` (32 random bytes, base64url) or `Token::parse`, which accepts
  at least `token::MIN_TOKEN_LEN` (32) characters of `A-Z a-z 0-9 - _` and
  nothing else, so minted tokens and 64-character hex digests pass. `Display`
  and `as_str` give the text, `Debug` leaves it out, and equality compares in
  constant time.
- `token::TokenError`, which never holds token text: `Malformed`, `BadFile`
  (names the file), `BadOverride` (names the override) and `Io`.
- `token::override_from_env` and `token::parse_override`, which read an
  override and refuse one that is set but is not a token.
- The `mint_token` example prints a new token.

### Changed

- Breaking: tokens must be well formed; hand-set tokens of any other form are
  refused. Only a `Token` can join a `Tokens` set: `Tokens::with`,
  `Tokens::with_label` and `Tokens::full_only` take a `Token`, and
  `Tokens::share_token` returns one. A token file or override that holds
  anything else, an empty or whitespace-only file included, is an error naming
  the file or variable, and `SharingRuntime` does not start; the file is left
  as it is. Before, an empty file was minted over, and any text was a token.
- Breaking: the `token` file helpers (`load_or_mint*`, `resolve*`,
  `rotate*`) return `Result<Token, TokenError>`, and `resolve` and
  `SharingRuntime::with_full_token_override` take an `Option<Token>`.
  `RuntimeError::Token` holds a `TokenError`. `share_url` and
  `ServerHandle::share_urls_for` take a `&Token`.
- Breaking: `token::mint` is removed; use `Token::mint`.
- Breaking: `Tokens::with` and `Tokens::with_label` return
  `Result<Tokens, TokensError>`. They refuse a token already in the set with a
  different grant, with `TokensError::Duplicate`: the guard gives a token its
  highest grant, so matching read and admin files made the Read link grant
  Admin. The same token with the same grant is ignored. Chain with `?` or
  `and_then`; `Tokens::full_only` cannot fail.
- A share link carries the token as written, and a `?token=` or cookie value
  is compared as written. A token needs no escaping, so nothing is
  percent-encoded or decoded any more.

### Fixed

- `ServerHandle::stop` now ends connections that are still open, such as a
  stream or an upgraded WebSocket, after the grace period for in-flight
  requests: every further read and write on them fails. Before, they kept
  running on the old guard after `stop` returned, so turning sharing off or
  rotating a token through `SharingRuntime` did not end them.
- With `Listen::AllInterfaces`, the guard admits an interface address the
  machine gains after the server started, on the bound port. Before, it
  answered 421 until sharing was restarted. `serve` rereads the interface
  list at most every two seconds. Share links still list the addresses present
  at start.

## [0.4.1] - 2026-11-07

First public release. web-access puts an axum app on the local network
safely: listen settings, minted tokens, a request guard with grants and access
contexts, a route permission table, and a server that can be stopped.

### Added

- `origin_matches_host(origin, host)`, for a handler that must refuse a
  cross-origin request the guard lets through.
- `WebAccessStatus::stopped(&config)`, the status of a config with no server
  running.
- Examples: `serve_with_token`, `guard_and_policy`, `tokens_on_disk`,
  `sharing_runtime` and `local_origins`.

### Changed

- Breaking: the token header is `x-web-access-token`, renamed from
  `x-platform-token`. Send the token in the new header.
- Breaking: a valid `?token=` link now answers 200 with a page that moves to
  the clean URL, instead of a 303 redirect. The `SameSite=Strict` cookie is
  then sent even when the link was opened from another site; with the 303 it
  was not, and the page answered 401.
- Breaking: a protocol upgrade (such as a WebSocket handshake) with a foreign
  `Origin` is refused with 403, as a mutating request is. A desktop webview's
  own origin (`tauri://localhost`, `http(s)://tauri.localhost`) may upgrade.
- Breaking: a read-safe rule is matched against the raw request path, the one
  the router routes. `POST /api/search/` or `/api/%73earch` no longer counts as
  a read-safe `/api/search`, because the router may send it to another
  handler. Below a `/*` rule, an encoded name such as `my%20note` still
  matches.
- Breaking: `Listen`, `AccessContext`, `Grant`, `DenialReason`, `ServeError`,
  `RuntimeError`, `Denial`, `InterfaceAddr`, `ShareUrls` and
  `WebAccessStatus` are `#[non_exhaustive]`. A `match` needs a wildcard arm;
  build a `WebAccessStatus` with `WebAccessStatus::stopped` and set its fields.
- Breaking: the `*_named` token functions refuse a file name that is not a bare
  file name (empty, `.`, `..`, or one with a path separator).
- Breaking: an existing token file that cannot be read (for example, not
  UTF-8) is an error. It used to be replaced with a new token.
- Breaking: a `read` grant may not open a WebSocket (or any protocol upgrade)
  unless a read-safe rule names the route, since a socket can carry writes.
- Breaking: `serve` refuses `Listen::Interfaces` with no address
  (`ServeError::NoAddress`); it used to report the server as running with
  nothing bound.
- Breaking: `guard::COOKIE_PREFIX` is no longer public. Use `cookie_name` and
  `is_cookie_name`.
- `is_local_authority` and `is_local_origin` accept any letter case and refuse
  a port that is not 1 to 5 digits, so `localhost:3000.evil.com` and
  `[::1].evil.com` are not local.
- `share_url` and the share cookie percent-encode characters of the token
  outside `A-Z a-z 0-9 - . _ ~`, and the guard decodes them, so a token with
  `;` or a space works. A minted token has no such character.
- `ServerHandle::stop` waits one grace period in total, not one per listener.
  Its docs now say that it does not end connections already open.
- `Tokens` and its entries leave the tokens out of their `Debug` output.
- The crate uses axum without its default features (`http1` and `tokio`
  only), so it no longer pulls in axum's JSON, form, query or tracing support.

### Removed

- Breaking: `default_port`, a table of application-specific ports.

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.4.0] - 2026-10-28 (unpublished)

#### Added

- `Grant::Admin`, ranked above `Full`, for a peer allowed to run commands on
  the host. `WebAccessConfig::admin` (off by default) mints and loads the admin
  token file and publishes `ShareUrls::admin`. While it is off the guard never
  holds the admin token, so presenting it grants nothing, and turning it off
  deletes the file. `token::load_or_mint_admin`, `rotate_admin` and
  `forget_admin`; `SharingRuntime::rotate(Grant::Admin)` works only while admin
  is on (`RuntimeError::AdminOff` otherwise); `WebAccessStatus::admin` reports
  the switch.
- `guard::cookie_name(port)` and `guard::is_cookie_name`.

#### Changed

- Breaking: the share cookie is `web_access_<port>` instead of one fixed name,
  and the guard reads only its own port's cookie, so two servers on one
  address do not overwrite each other's cookie. `guard::COOKIE_NAME` is
  removed.

### [0.3.2] - 2026-10-27 (unpublished)

#### Added

- `is_local_origin` and `is_local_authority`.
- `token::mint` is public: a token that lives for one process and is never
  written.

### [0.3.1] - 2026-10-27 (unpublished)

#### Added

- `SharingRuntime::with_full_token_file`, `with_full_token_override` and
  `with_min_override_len`. Rotating the full token follows the overridden
  token file.

### [0.3.0] - 2026-10-27 (unpublished)

#### Added

- The `runtime` module: `SharingRuntime`, `ConfigStore`, `WebAccessStatus`,
  `ShareUrls` and `RuntimeError`.
- `ServerHandle::share_urls_for(token)`. `InterfaceAddr` is `Serialize`.

#### Changed

- Breaking: `serve_with` is replaced by `serve_opts(router, config, tokens,
  ServeOptions)`.

### [0.2.0] - 2026-10-27 (unpublished)

#### Added

- The `context` module: `AccessContext` and `Grant`, stored on each request
  and read with extractors.
- The `permissions` module: `RouteRule`, `HostPolicy` and `host_policy_layer`.
- `Tokens`, any number of tokens each with a grant;
  `token::load_or_mint_read`, `rotate_read` and `rotate_named`.

#### Changed

- Breaking: `serve`, `serve_with` and `GuardState::new` take `Tokens` instead
  of an optional token.

### [0.1.2] - 2026-10-26 (unpublished)

#### Added

- `token::load_or_mint_named` and `token::resolve_named`, for an app whose
  token file already has a name of its own.

### [0.1.1] - 2026-10-26 (unpublished)

#### Added

- `default_port(app)`, a table of default ports.

### [0.1.0] - 2026-10-26 (unpublished)

#### Added

- `WebAccessConfig` and `Listen`, the guard (`GuardState`, `GuardPolicy`,
  `guard`, `Denial`), `serve`, `serve_with`, `ServerHandle`, `share_url`,
  `interfaces`, and the `token` module (`load_or_mint`, `resolve`, `rotate`).
