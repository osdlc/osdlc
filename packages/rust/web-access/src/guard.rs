//! The axum request guard: token, Host and Origin checks that stay safe beyond
//! loopback.
//!
//! Every request, whatever its method (GET, SSE and static files included),
//! must pass in this order:
//!
//! 1. The `Host` header is on the allowlist (see [`GuardState::with_public_hosts`]
//!    for public names behind a proxy) or, for a wildcard bind, is a current
//!    interface IP on the bound port, else 421. This holds for loopback peers
//!    too: it is what stops a DNS-rebinding page from reading the app.
//! 2. A mutating request, or a protocol upgrade such as a WebSocket handshake,
//!    with an `Origin` header has an allowed Origin, else 403. A public name
//!    admits only its `https://` Origin, and only on a request whose `Host` is a
//!    public name. An upgrade may also come from a desktop webview's own origin
//!    (`tauri://localhost`, `http(s)://tauri.localhost`).
//! 3. The path normalises (see [`normalize_path`]), else 400: no `.`/`..`
//!    segment, no `\` or encoded `/`. Deny rules ([`crate::HostPolicy`]) match
//!    the normalised path; read-safe rules match the raw path.
//! 4. A loopback peer passes with [`Grant::Full`] when
//!    [`GuardPolicy::loopback_open`] is set.
//! 5. A `GET` carrying a valid `?token=` (as written or percent-decoded; the
//!    cookie is stored percent-encoded) sets the cookie to that token (with
//!    `Secure` when the `Host` is a public name) and answers with a small page
//!    that moves to the same URL without the parameter (a `Refresh` header and
//!    a `<meta>` refresh, not a 303), so the token never stays in the address
//!    bar, history or a `Referer`. The move starts from this origin, so the
//!    `SameSite=Strict` cookie is sent even when the link was opened from
//!    another site. It wins over any cookie of the same name, so opening
//!    another share link replaces it. An
//!    [`Grant::Admin`] token gets its own cookie ([`admin_cookie_name`]), so
//!    opening a full link does not replace it. With
//!    [`GuardState::with_admin_over_public_only`], an admin token on a
//!    non-public `Host` sets no cookie and is refused 401.
//! 6. Otherwise this port's `web_access_<port>` cookie ([`cookie_name`]), its
//!    `web_access_admin_<port>` cookie or the `x-web-access-token` header must
//!    equal one of the [`Tokens`] (constant-time compare against every entry),
//!    else 401. If they match different entries, the highest [`Grant`] wins.
//!    With [`GuardState::with_admin_over_public_only`], an [`Grant::Admin`] on
//!    a non-public `Host` is then lowered to [`Grant::Full`].
//! 7. A [`Grant::Read`] request with a non-safe method, or a protocol upgrade,
//!    is 403 `read_only` unless a [`GuardState::with_read_safe`] rule names the
//!    route.
//!
//! A passing request carries its [`AccessContext`] and [`Grant`] in the request
//! extensions (see [`crate::context`]).
//!
//! The peer address comes from axum's `ConnectInfo<SocketAddr>`; a request
//! without one is treated as non-loopback, so a mis-wired server fails closed.
//! Every response carries `Referrer-Policy: no-referrer` and
//! `X-Content-Type-Options: nosniff`.

use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderValue, Method, Request, StatusCode, header};
use axum::middleware::Next;
use axum::response::Response;
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, percent_decode_str, utf8_percent_encode};
use subtle::ConstantTimeEq;

use crate::context::{AccessContext, Grant};
use crate::origin::is_webview_origin;
use crate::permissions::{RouteRule, normalize_path};
use crate::response::{json_response, refuse};

/// What every share-cookie name starts with; [`cookie_name`] appends the port.
const COOKIE_PREFIX: &str = "web_access_";

/// The cookie that carries the token after the `?token=` bootstrap, for the
/// server on `port`.
///
/// The name carries the port because browsers scope cookies by host, not by
/// port. A plain name would send the token to every other server on the same
/// address: another app's web view, or a dev server running untrusted
/// packages. With the admin grant the cookie is a shell credential. The guard
/// sets and reads only its own port's cookie, so a cookie another server on
/// this address set (or was handed) is ignored.
pub fn cookie_name(port: u16) -> String {
    format!("{COOKIE_PREFIX}{port}")
}

/// Whether `name` is some server's share cookie (`web_access_<port>` or
/// `web_access_admin_<port>`). For an
/// app that forwards requests and must not relay these credentials.
pub fn is_cookie_name(name: &str) -> bool {
    let port = name
        .strip_prefix(ADMIN_COOKIE_PREFIX)
        .or_else(|| name.strip_prefix(COOKIE_PREFIX));
    port.is_some_and(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

/// What the admin-cookie name starts with; [`admin_cookie_name`] appends the port.
const ADMIN_COOKIE_PREFIX: &str = "web_access_admin_";

/// The cookie that carries an [`Grant::Admin`] token for the server on `port`.
/// Apart from [`cookie_name`], so opening the everyday full link does not
/// replace the admin cookie, and the reverse.
pub fn admin_cookie_name(port: u16) -> String {
    format!("{ADMIN_COOKIE_PREFIX}{port}")
}

/// A public host name as [`GuardState::with_public_hosts`] keeps it (trimmed,
/// lowercase), or `None` when it drops it: blank, or carrying a scheme, path,
/// userinfo or space.
pub fn normalize_public_host(name: &str) -> Option<String> {
    let n = name.trim().to_ascii_lowercase();
    (!n.is_empty() && !n.contains(['/', '@', ' '])).then_some(n)
}

/// The port of a normalised `host:port` authority.
fn authority_port(authority: &str) -> Option<u16> {
    authority.rsplit_once(':')?.1.parse().ok()
}

/// What a token keeps unencoded in a share link or cookie: the RFC 3986
/// unreserved set, so a minted base64url token is written as it is.
const TOKEN_ENCODE: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

/// `token` percent-encoded for a `?token=` query value or a cookie value. A
/// hand-set token may hold a space, `&`, `#` or `;`.
pub(crate) fn encode_token(token: &str) -> String {
    utf8_percent_encode(token, TOKEN_ENCODE).to_string()
}

/// A `?token=` or cookie value, percent-decoded; `None` if it is not UTF-8.
fn decode_token(raw: &str) -> Option<String> {
    percent_decode_str(raw)
        .decode_utf8()
        .ok()
        .map(|t| t.into_owned())
}

/// The header a script or another app presents the token in.
pub const TOKEN_HEADER: &str = "x-web-access-token";

/// Denials reported to `on_denied` per [`DENIAL_WINDOW`]. A LAN peer can fail
/// as fast as it likes; the trail only needs enough to show that it is.
const DENIAL_BUDGET: u32 = 30;
const DENIAL_WINDOW: Duration = Duration::from_secs(60);

/// Longest request path copied into a [`Denial`]; the path is attacker-chosen.
const MAX_RECORDED_PATH: usize = 256;

/// Why a request was refused and reported.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum DenialReason {
    /// A token was presented and did not match.
    WrongToken,
    /// The `Host` header is not on the allowlist.
    BadHost,
    /// A mutating request or a protocol upgrade carried a disallowed `Origin`.
    ForeignOrigin,
}

/// What `on_denied` receives. A request with no token at all is the common
/// idle case (a tab that has not been given the token) and is not reported.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct Denial {
    /// Why the request was refused.
    pub reason: DenialReason,
    /// The request method.
    pub method: String,
    /// Path only (never the query, which may hold a token), clamped.
    pub path: String,
    /// The peer address, if the server provided one.
    pub peer: Option<SocketAddr>,
}

/// The denial callback type.
pub type OnDenied = dyn Fn(&Denial) + Send + Sync;

/// A fixed-window counter over reported denials, in memory.
struct DenialBudget {
    window: Mutex<(Instant, u32)>,
}

impl DenialBudget {
    fn new(now: Instant) -> Self {
        Self {
            window: Mutex::new((now, 0)),
        }
    }

    /// True while this window has room; each true spends one.
    fn admit(&self, now: Instant) -> bool {
        let mut w = self.window.lock().unwrap_or_else(|e| e.into_inner());
        if now.duration_since(w.0) >= DENIAL_WINDOW {
            *w = (now, 0);
        }
        if w.1 >= DENIAL_BUDGET {
            return false;
        }
        w.1 += 1;
        true
    }
}

/// One accepted token. Its `Debug` leaves the token out.
#[derive(Clone)]
struct Entry {
    token: String,
    grant: Grant,
    /// Who it was issued to; for audit once tokens are per device.
    #[allow(dead_code)]
    label: Option<String>,
}

impl std::fmt::Debug for Entry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Entry")
            .field("token", &"<redacted>")
            .field("grant", &self.grant)
            .field("label", &self.label)
            .finish()
    }
}

/// The accepted tokens, each with the grant it confers. They are fixed for the
/// life of a [`GuardState`]: rotating a token means building a new state.
#[derive(Debug, Clone, Default)]
pub struct Tokens(Vec<Entry>);

impl Tokens {
    /// No tokens. Empty tokens are dropped: one would match an empty header or
    /// cookie.
    pub fn none() -> Self {
        Self::default()
    }

    /// One [`Grant::Full`] token, or none for `None`.
    pub fn full_only(token: impl Into<Option<String>>) -> Self {
        match token.into() {
            Some(t) => Self::none().with(t, Grant::Full),
            None => Self::none(),
        }
    }

    /// Add `token` with `grant`; blank tokens are ignored.
    pub fn with(self, token: impl Into<String>, grant: Grant) -> Self {
        self.push(token.into(), grant, None)
    }

    /// [`Self::with`], naming who the token was issued to.
    ///
    /// **Experimental.** The label is kept but not read yet; it is meant for
    /// per-device tokens, and its use may change in a patch release.
    pub fn with_label(
        self,
        token: impl Into<String>,
        grant: Grant,
        label: impl Into<String>,
    ) -> Self {
        self.push(token.into(), grant, Some(label.into()))
    }

    fn push(mut self, token: String, grant: Grant, label: Option<String>) -> Self {
        if !token.is_empty() {
            self.0.push(Entry {
                token,
                grant,
                label,
            });
        }
        self
    }

    /// True when no token was added (blank tokens are never added).
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// The token to put in a share link: the first full one, else the first.
    /// An admin token is never picked over a full one, so the default link
    /// never carries a shell credential.
    pub fn share_token(&self) -> Option<&str> {
        let pick = self.0.iter().find(|e| e.grant == Grant::Full);
        pick.or(self.0.first()).map(|e| e.token.as_str())
    }

    /// The entry equal to `presented`; the highest grant if several are.
    /// Compares against every entry, so timing does not reveal which one
    /// matched. `ct_eq` returns early on a length mismatch, so a token's length
    /// can leak (minted tokens are all the same length).
    fn find(&self, presented: &str) -> Option<&Entry> {
        let mut found: Option<&Entry> = None;
        for entry in &self.0 {
            if bool::from(presented.as_bytes().ct_eq(entry.token.as_bytes()))
                && found.is_none_or(|f| entry.grant > f.grant)
            {
                found = Some(entry);
            }
        }
        found
    }

    fn grant_for(&self, presented: &str) -> Option<Grant> {
        self.find(presented).map(|e| e.grant)
    }

    /// [`Self::find`] for a `?token=` or cookie value: as written, then
    /// percent-decoded. The raw match keeps a link or cookie that predates
    /// encoding working for a hand-set token holding a literal `%XX`.
    fn find_encoded(&self, raw: &str) -> Option<&Entry> {
        self.find(raw)
            .or_else(|| decode_token(raw).and_then(|t| self.find(&t)))
    }
}

/// Guard behaviour toggles.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct GuardPolicy {
    /// Let a loopback peer skip the token. Do not use this behind a reverse
    /// proxy: every proxied request then appears to come from loopback.
    pub loopback_open: bool,
}

/// Middleware state. Build once, share in an `Arc`, hand to
/// `axum::middleware::from_fn_with_state(state, guard)`.
pub struct GuardState {
    tokens: Tokens,
    read_safe: Vec<RouteRule<()>>,
    allowed_hosts: Vec<String>,
    /// Public, HTTPS-fronted names, as `Host` authorities (kept apart from
    /// `allowed_hosts`, which also serves as the Origin allowlist).
    public_hosts: Vec<String>,
    /// The same names as `Origin` authorities: the HTTPS port, or the port
    /// written. They match only an `https://` Origin.
    public_origins: Vec<String>,
    /// See [`Self::with_admin_over_public_only`].
    admin_public_only: bool,
    live_hosts: Option<LiveHosts>,
    policy: GuardPolicy,
    /// `Max-Age` on the `?token=` cookie. `None`: a session cookie.
    cookie_max_age: Option<std::time::Duration>,
    on_denied: Option<Arc<OnDenied>>,
    denials: DenialBudget,
}

impl GuardState {
    /// `allowed_hosts` are `host:port` authorities (`localhost:3000`,
    /// `[::1]:3000`, `192.168.1.5:3000`), compared case-insensitively. With no
    /// token, only a loopback peer under `loopback_open` is let through.
    pub fn new(
        tokens: Tokens,
        allowed_hosts: impl IntoIterator<Item = String>,
        policy: GuardPolicy,
    ) -> Self {
        let mut hosts: Vec<String> = Vec::new();
        for h in allowed_hosts {
            let h = h.to_ascii_lowercase();
            if !hosts.contains(&h) {
                hosts.push(h);
            }
        }
        Self {
            tokens,
            read_safe: Vec::new(),
            allowed_hosts: hosts,
            public_hosts: Vec::new(),
            public_origins: Vec::new(),
            admin_public_only: false,
            live_hosts: None,
            policy,
            cookie_max_age: None,
            on_denied: None,
            denials: DenialBudget::new(Instant::now()),
        }
    }

    /// Make the `?token=` cookie persistent: it carries `Max-Age` of `age` (whole seconds, at
    /// least one), so it survives closing the browser. The default is no `Max-Age`, a session
    /// cookie, as before. A zero age is ignored: `Max-Age=0` would delete the cookie. The admin
    /// token's cookie never gets a `Max-Age`: a shell credential ends with the browser session.
    pub fn with_cookie_max_age(mut self, age: std::time::Duration) -> Self {
        self.cookie_max_age = (age.as_secs() > 0).then_some(age);
        self
    }

    /// Public names this server answers to behind a TLS-terminating reverse
    /// proxy (`app.fly.dev`). The proxy forwards the public `Host`, with no
    /// port for the scheme's default, and browsers send `Origin: https://name`.
    /// Each name is allowed as a `Host` on ports 80 and 443 (a name written with
    /// a port, on that port only), but as an `Origin` only as `https://name` (or
    /// `https://name:port`), and only on a request whose `Host` is a public
    /// name. A request whose `Host` is one of these gets the token cookie with
    /// `Secure`.
    ///
    /// Blank names and any carrying a scheme, path or userinfo are ignored
    /// ([`normalize_public_host`]). This widens only what is reachable by name:
    /// a non-loopback peer still needs a token. The `Host` header is chosen by
    /// the client, so a public name is a convenience and a guard against a
    /// mis-pasted link, not proof of how a request arrived; see
    /// [`Self::with_admin_over_public_only`].
    pub fn with_public_hosts<S: AsRef<str>>(mut self, names: impl IntoIterator<Item = S>) -> Self {
        for name in names {
            let Some(n) = normalize_public_host(name.as_ref()) else {
                continue;
            };
            let has_port = !n.starts_with('[') && n.contains(':');
            let (hosts, origin) = if has_port {
                (vec![n.clone()], n)
            } else {
                (
                    vec![format!("{n}:80"), format!("{n}:443")],
                    format!("{n}:443"),
                )
            };
            for h in hosts {
                if !self.public_hosts.contains(&h) {
                    self.public_hosts.push(h);
                }
            }
            if !self.public_origins.contains(&origin) {
                self.public_origins.push(origin);
            }
        }
        self
    }

    /// Honour a [`Grant::Admin`] token only on a request whose `Host` is a
    /// public name (see [`Self::with_public_hosts`]). On any other `Host` the
    /// same token confers [`Grant::Full`], and `?token=` sets no cookie for it.
    ///
    /// This is defence in depth against an admin link pasted with a private
    /// name (a LAN or private-network address, which would travel over plain
    /// HTTP). It is not a transport proof: the `Host` header is the client's,
    /// so a peer that can reach the port directly can write the public name.
    /// The admin token is the control.
    pub fn with_admin_over_public_only(mut self) -> Self {
        self.admin_public_only = true;
        self
    }

    /// `grant`, lowered to `Full` when an admin grant may not be used here.
    fn effective_grant(&self, grant: Grant, public: bool) -> Grant {
        if grant == Grant::Admin && self.admin_public_only && !public {
            Grant::Full
        } else {
            grant
        }
    }

    /// Also allow `<ip>:<port>` for a wildcard bind in `binds` (same port and
    /// address family) when `ips` lists `ip` at request time, so an interface
    /// address that appears after start is not refused. `ips` runs only when
    /// such a Host misses the allowlist.
    pub(crate) fn with_live_hosts(mut self, binds: Vec<SocketAddr>, ips: HostIps) -> Self {
        self.live_hosts = Some(LiveHosts { binds, ips });
        self
    }

    /// Whether a normalised `host:port` authority may be served.
    fn host_allowed(&self, authority: &str) -> bool {
        if self.allowed_hosts.iter().any(|h| h == authority) {
            return true;
        }
        let Some(live) = &self.live_hosts else {
            return false;
        };
        let Ok(addr) = authority.parse::<SocketAddr>() else {
            return false;
        };
        live.binds
            .iter()
            .any(|b| b.port() == addr.port() && b.is_ipv4() == addr.is_ipv4())
            && (live.ips)().contains(&addr.ip())
    }

    /// Routes a [`Grant::Read`] request may use with a non-safe method or a
    /// protocol upgrade (a POST that only reads, a read-only WebSocket). They
    /// match the raw request path. Any other non-safe method or upgrade from a
    /// `Read` grant is refused 403 `read_only`.
    pub fn with_read_safe(mut self, rules: impl IntoIterator<Item = RouteRule<()>>) -> Self {
        self.read_safe.extend(rules);
        self
    }

    /// Call `f` for each budgeted denial (wrong token, bad Host, foreign
    /// Origin), e.g. to write an audit record. `read_only` and bad-path
    /// refusals are not reported. It runs inline in the request
    /// path, so keep it cheap.
    pub fn with_on_denied(mut self, f: impl Fn(&Denial) + Send + Sync + 'static) -> Self {
        self.on_denied = Some(Arc::new(f));
        self
    }

    /// As [`Self::with_on_denied`], for a callback already behind an `Arc`.
    pub fn with_shared_on_denied(mut self, f: Arc<OnDenied>) -> Self {
        self.on_denied = Some(f);
        self
    }

    fn deny(&self, req_parts: (&Method, &str, Option<SocketAddr>), reason: DenialReason) {
        let Some(cb) = &self.on_denied else { return };
        if !self.denials.admit(Instant::now()) {
            return;
        }
        cb(&Denial {
            reason,
            method: req_parts.0.to_string(),
            path: clamp_path(req_parts.1),
            peer: req_parts.2,
        });
    }

    /// Stamp the resolved context and grant on `req`, then enforce read-only.
    async fn admit(
        &self,
        mut req: Request<Body>,
        context: AccessContext,
        grant: Grant,
        next: Next,
    ) -> Response {
        // A read-safe rule is an exemption, so it is matched against the raw
        // path, the one axum routes: `/api/search/` or `/api/%73earch` may
        // reach another handler than `/api/search`. Below a `/*` prefix, an
        // encoded character (`/api/notes/my%20note`) still matches. A protocol
        // upgrade (a WebSocket) can carry writes, so for a `read` grant it
        // counts as non-safe like a mutating method.
        let upgrade = req.headers().contains_key(header::UPGRADE);
        let read_only = grant == Grant::Read
            && (is_mutating(req.method()) || upgrade)
            && !self
                .read_safe
                .iter()
                .any(|r| r.matches(req.method(), req.uri().path()));
        if read_only {
            let body = serde_json::json!({ "error": "read_only" });
            return json_response(StatusCode::FORBIDDEN, &body);
        }
        req.extensions_mut().insert(context);
        req.extensions_mut().insert(grant);
        next.run(req).await
    }
}

/// The host's interface IPs, listed when asked.
pub(crate) type HostIps = Arc<dyn Fn() -> Vec<IpAddr> + Send + Sync>;

/// See [`GuardState::with_live_hosts`].
struct LiveHosts {
    binds: Vec<SocketAddr>,
    ips: HostIps,
}

/// `path` cut to at most [`MAX_RECORDED_PATH`] bytes on a char boundary, with
/// a marker when something was dropped.
fn clamp_path(path: &str) -> String {
    if path.len() <= MAX_RECORDED_PATH {
        return path.to_owned();
    }
    let mut end = MAX_RECORDED_PATH;
    while !path.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &path[..end])
}

/// Lowercased `host:port`, with `default_port` when none is written.
fn normalize_authority(authority: &str, default_port: u16) -> String {
    let a = authority.trim().to_ascii_lowercase();
    let has_port = if a.starts_with('[') {
        a.rfind(']').is_some_and(|i| a[i + 1..].starts_with(':'))
    } else {
        a.contains(':')
    };
    if has_port {
        a
    } else {
        format!("{a}:{default_port}")
    }
}

/// Authority of an `Origin` value (`scheme://authority`), with the scheme's
/// default port filled in. `None` for `null` or anything unparseable.
fn origin_authority(origin: &str) -> Option<String> {
    let (scheme, rest) = origin.split_once("://")?;
    let authority = rest.split('/').next()?;
    let default = match scheme.to_ascii_lowercase().as_str() {
        "http" => 80,
        "https" => 443,
        _ => return None,
    };
    (!authority.is_empty()).then(|| normalize_authority(authority, default))
}

/// True when `origin` names the same authority as the request's `Host`, both
/// normalised exactly as the guard normalises them (lowercased, scheme or
/// port-80 default filled in). `null`, an unparseable origin and a differing
/// authority are false. For a handler that must refuse a cross-origin GET,
/// which the guard's own Origin check (mutating methods and upgrades) lets
/// through.
pub fn origin_matches_host(origin: &str, host: &str) -> bool {
    origin_authority(origin).is_some_and(|o| o == normalize_authority(host, 80))
}

/// Set in the request extensions by the guard when the request's `Host` is one
/// of the configured public names (see [`GuardState::with_public_hosts`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PublicHost;

/// [`origin_matches_host`] for a request whose `Host` is a public name, which
/// the proxy forwards without a port: only an `https://` Origin matches, and a
/// portless `Host` is on 443. Use it when the request carries [`PublicHost`].
pub fn origin_matches_public_host(origin: &str, host: &str) -> bool {
    origin
        .get(..8)
        .is_some_and(|p| p.eq_ignore_ascii_case("https://"))
        && origin_authority(origin).is_some_and(|o| o == normalize_authority(host, 443))
}

/// Every cookie named `name`: another app on the same host can set a stale one
/// (cookies are not port-isolated), so the first must not shadow a valid one.
fn cookie_values<'a>(req: &'a Request<Body>, name: &'a str) -> impl Iterator<Item = &'a str> {
    req.headers()
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .filter_map(move |(k, v)| (k == name).then_some(v))
}

/// The raw (still encoded) value of `?token=` and the query with that
/// parameter removed; `None` when the query has no `token` parameter. The last
/// `token` wins, as browsers and form parsers read a repeated key.
pub(crate) fn split_token_param(query: &str) -> Option<(&str, String)> {
    let is_token = |p: &&str| *p == "token" || p.starts_with("token=");
    let raw = query.split('&').rfind(is_token)?;
    let rest: Vec<&str> = query
        .split('&')
        .filter(|p| !p.is_empty() && !is_token(p))
        .collect();
    Some((raw.strip_prefix("token=").unwrap_or(""), rest.join("&")))
}

/// The share-link landing page: set the cookie, then move to `location`.
///
/// A 303 would keep the navigation the other site started, and the browser
/// withholds a `SameSite=Strict` cookie from it, so a link opened from a chat
/// or a mail page would land on 401. A refresh is a new navigation started by
/// this page, so the cookie goes with it.
fn bounce(location: &str, set_cookie: &str) -> Response {
    let html_target = html_attr_escape(location);
    let body = format!(
        "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"0;url={html_target}\"><title>Opening</title><a href=\"{html_target}\">Continue</a>\n"
    );
    // `location` came from the request path. It is ASCII apart from what the
    // client sent; a value that is not a valid header is left to the meta tag.
    let mut res = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::SET_COOKIE, set_cookie);
    if let Ok(v) = HeaderValue::from_str(&format!("0;url={location}")) {
        res = res.header(header::REFRESH, v);
    }
    res.body(Body::from(body)).expect("bounce response")
}

/// `s` safe inside a double-quoted HTML attribute.
fn html_attr_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn is_mutating(method: &Method) -> bool {
    !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

/// Add the headers every response carries.
fn harden(mut res: Response) -> Response {
    let h = res.headers_mut();
    h.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    h.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    res
}

/// The guard. See the module docs for the order of checks.
pub async fn guard(
    State(state): State<Arc<GuardState>>,
    req: Request<Body>,
    next: Next,
) -> Response {
    harden(check(&state, req, next).await)
}

async fn check(state: &GuardState, mut req: Request<Body>, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_owned();
    let peer = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|c| c.0);
    let parts = (&method, path.as_str(), peer);
    let context = AccessContext::from_peer(peer);

    // 1. Host allowlist.
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .or_else(|| req.uri().authority().map(|a| a.as_str()));
    let authority = host.map(|h| normalize_authority(h, 80));
    let allowed = authority
        .as_ref()
        .filter(|h| state.host_allowed(h) || state.public_hosts.contains(h));
    // A request whose Host is a public name. Host is client-chosen, so this is
    // defence in depth (a mis-pasted admin link on a private name), not proof
    // of HTTPS arrival; the token is the control.
    let public = authority
        .as_ref()
        .is_some_and(|h| state.public_hosts.contains(h));
    if public {
        req.extensions_mut().insert(PublicHost);
    }
    // The allowlisted port the browser reached us on names the cookie.
    let Some(port) = allowed.and_then(|h| authority_port(h)) else {
        state.deny(parts, DenialReason::BadHost);
        return refuse(StatusCode::MISDIRECTED_REQUEST, "host not allowed");
    };
    let cookie = cookie_name(port);
    let admin_cookie = admin_cookie_name(port);

    // 2. Origin on mutating methods and protocol upgrades (a WebSocket
    // handshake is a GET, and the same-origin policy does not cover it).
    let upgrade = req.headers().contains_key(header::UPGRADE);
    if (is_mutating(&method) || upgrade)
        && let Some(origin) = req.headers().get(header::ORIGIN)
    {
        let origin = origin.to_str().ok();
        let https = origin.is_some_and(|o| {
            o.get(..8)
                .is_some_and(|p| p.eq_ignore_ascii_case("https://"))
        });
        let ok = origin.and_then(origin_authority).is_some_and(|o| {
            state.host_allowed(&o) || (public && https && state.public_origins.contains(&o))
        }) || (upgrade && origin.is_some_and(is_webview_origin));
        if !ok {
            state.deny(parts, DenialReason::ForeignOrigin);
            return refuse(StatusCode::FORBIDDEN, "origin not allowed");
        }
    }

    // 3. Normalisable path.
    if normalize_path(&path).is_none() {
        return refuse(StatusCode::BAD_REQUEST, "bad path");
    }

    // 4. Loopback peer without a token.
    if state.policy.loopback_open && context == AccessContext::WebLocal {
        return state.admit(req, context, Grant::Full, next).await;
    }

    // 5. `?token=` bootstrap on GET; a valid one wins over any cookie.
    let mut presented_wrong = false;
    if method == Method::GET
        && let Some((tok, rest)) = req.uri().query().and_then(split_token_param)
    {
        let tok_entry = state.tokens.find_encoded(tok);
        let tok_grant = tok_entry.map(|e| e.grant);
        // An admin token on a non-public Host would be lowered to Full
        // anyway; do not let it cross a plain-HTTP hop into a cookie.
        let admin_refused = tok_grant.is_some_and(|g| state.effective_grant(g, public) != g);
        if let Some(entry) = tok_entry
            && !admin_refused
        {
            // Exactly one leading slash: browsers read `//host` as a
            // protocol-relative, off-origin redirect.
            let safe = format!("/{}", path.trim_start_matches('/'));
            let location = if rest.is_empty() {
                safe
            } else {
                format!("{safe}?{rest}")
            };
            let secure = if public { "; Secure" } else { "" };
            let name = if tok_grant == Some(Grant::Admin) {
                &admin_cookie
            } else {
                &cookie
            };
            // The admin cookie stays a session cookie whatever `cookie_max_age` says: a
            // shell credential should not outlive the browser.
            let max_age = match state.cookie_max_age {
                Some(a) if tok_grant != Some(Grant::Admin) => {
                    format!("; Max-Age={}", a.as_secs())
                }
                _ => String::new(),
            };
            let set_cookie = format!(
                "{name}={}; HttpOnly; SameSite=Strict; Path=/{secure}{max_age}",
                encode_token(&entry.token)
            );
            return bounce(&location, &set_cookie);
        }
        presented_wrong = true;
    }

    // 6. Token: header, then cookie.
    let header_tok = req
        .headers()
        .get(TOKEN_HEADER)
        .and_then(|v| v.to_str().ok());
    let mut grant = header_tok.and_then(|t| state.tokens.grant_for(t));
    for name in [&cookie, &admin_cookie] {
        for t in cookie_values(&req, name) {
            presented_wrong = true;
            grant = grant.max(state.tokens.find_encoded(t).map(|e| e.grant));
        }
    }
    if let Some(grant) = grant {
        let grant = state.effective_grant(grant, public);
        return state.admit(req, context, grant, next).await;
    }
    presented_wrong |= header_tok.is_some();

    // A request that presented nothing is the idle case and is not reported.
    if presented_wrong {
        state.deny(parts, DenialReason::WrongToken);
    }
    refuse(StatusCode::UNAUTHORIZED, "missing or wrong token")
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use axum::Router;
    use axum::routing::{get, post};
    use tower::ServiceExt;

    use super::*;

    const TOKEN: &str = "s3cret-token";
    const HOST: &str = "192.168.1.5:3000";

    fn app(policy: GuardPolicy, on_denied: Option<Arc<AtomicUsize>>) -> Router {
        let mut state = GuardState::new(
            Tokens::full_only(TOKEN.to_owned()),
            ["localhost:3000".to_owned(), HOST.to_owned()],
            policy,
        );
        if let Some(n) = on_denied {
            state = state.with_on_denied(move |_| {
                n.fetch_add(1, Ordering::SeqCst);
            });
        }
        Router::new()
            .route("/", get(|| async { "ok" }))
            .route("/x", post(|| async { "posted" }))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard))
    }

    fn req(method: &str, uri: &str, peer: &str, extra: &[(&str, &str)]) -> Request<Body> {
        let mut b = Request::builder()
            .method(method)
            .uri(uri)
            .header("host", HOST);
        for (k, v) in extra {
            b = b.header(*k, *v);
        }
        let mut r = b.body(Body::empty()).unwrap();
        r.extensions_mut()
            .insert(ConnectInfo(peer.parse::<SocketAddr>().unwrap()));
        r
    }

    const LAN: &str = "192.168.1.9:50000";

    async fn status(app: Router, r: Request<Body>) -> Response {
        app.oneshot(r).await.unwrap()
    }

    /// Where a share-link landing page moves to, from its `Refresh` header.
    fn bounce_target(res: &Response) -> String {
        assert_eq!(res.status(), StatusCode::OK);
        let refresh = res.headers()[header::REFRESH].to_str().unwrap();
        refresh.strip_prefix("0;url=").unwrap().to_owned()
    }

    #[tokio::test]
    async fn missing_token_is_401() {
        let res = status(app(GuardPolicy::default(), None), req("GET", "/", LAN, &[])).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(res.headers()[header::REFERRER_POLICY], "no-referrer");
        assert_eq!(res.headers()[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
    }

    #[tokio::test]
    async fn valid_header_passes_on_every_method() {
        let h = [(TOKEN_HEADER, TOKEN)];
        let res = status(app(GuardPolicy::default(), None), req("GET", "/", LAN, &h)).await;
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(res.headers()[header::REFERRER_POLICY], "no-referrer");
        let res = status(
            app(GuardPolicy::default(), None),
            req("POST", "/x", LAN, &h),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn wrong_header_is_401() {
        let h = [(TOKEN_HEADER, "nope")];
        let res = status(app(GuardPolicy::default(), None), req("GET", "/", LAN, &h)).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn valid_cookie_passes() {
        let c = [("cookie", "a=b; web_access_3000=s3cret-token; c=d")];
        let res = status(app(GuardPolicy::default(), None), req("GET", "/", LAN, &c)).await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn token_query_sets_cookie_and_redirects_without_the_token() {
        let uri = "/?a=1&token=s3cret-token&b=2";
        let res = status(app(GuardPolicy::default(), None), req("GET", uri, LAN, &[])).await;
        assert_eq!(res.status(), StatusCode::OK);
        let loc = bounce_target(&res);
        assert_eq!(loc, "/?a=1&b=2");
        assert!(!loc.contains("token"));
        let cookie = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(cookie.starts_with("web_access_3000=s3cret-token"));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Strict"));
        // The default is a session cookie: no lifetime.
        assert!(!cookie.contains("Max-Age"), "{cookie}");
        assert_eq!(res.headers()[header::REFERRER_POLICY], "no-referrer");
    }

    #[tokio::test]
    async fn cookie_max_age_is_opt_in() {
        let with = |age: std::time::Duration| {
            let state = GuardState::new(
                Tokens::full_only(TOKEN.to_owned()),
                ["localhost:3000".to_owned(), HOST.to_owned()],
                GuardPolicy::default(),
            )
            .with_cookie_max_age(age);
            Router::new()
                .route("/", get(|| async { "ok" }))
                .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard))
        };
        let set_cookie = |app: Router| async move {
            let r = req("GET", &format!("/?token={TOKEN}"), LAN, &[]);
            let res = status(app, r).await;
            res.headers()[header::SET_COOKIE]
                .to_str()
                .unwrap()
                .to_string()
        };
        let c = set_cookie(with(std::time::Duration::from_secs(30 * 86_400))).await;
        assert!(c.ends_with("; Max-Age=2592000"), "{c}");
        assert!(
            c.contains("HttpOnly") && c.contains("SameSite=Strict"),
            "{c}"
        );
        // A zero age would delete the cookie, so it is ignored.
        let c = set_cookie(with(std::time::Duration::ZERO)).await;
        assert!(!c.contains("Max-Age"), "{c}");
    }

    #[tokio::test]
    async fn token_query_with_no_other_params_redirects_to_the_bare_path() {
        let res = status(
            app(GuardPolicy::default(), None),
            req("GET", "/?token=s3cret-token", LAN, &[]),
        )
        .await;
        assert_eq!(bounce_target(&res), "/");
    }

    #[tokio::test]
    async fn token_redirect_never_leaves_the_origin() {
        let res = status(
            app(GuardPolicy::default(), None),
            req("GET", "//evil.example/?token=s3cret-token", LAN, &[]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(bounce_target(&res), "/evil.example/");
    }

    #[tokio::test]
    async fn backslash_path_is_refused_before_the_token_redirect() {
        let res = status(
            app(GuardPolicy::default(), None),
            req("GET", "/\\evil.example/?token=s3cret-token", LAN, &[]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn origin_without_a_port_gets_the_scheme_default() {
        assert_eq!(origin_authority("http://Host"), Some("host:80".into()));
        assert_eq!(origin_authority("https://host"), Some("host:443".into()));
        assert_eq!(
            origin_authority("http://host:80"),
            origin_authority("http://host")
        );
    }

    #[tokio::test]
    async fn any_matching_cookie_passes_even_after_a_stale_one() {
        let c = [(
            "cookie",
            "web_access_3000=stale; web_access_3000=s3cret-token",
        )];
        let res = status(app(GuardPolicy::default(), None), req("GET", "/", LAN, &c)).await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn empty_token_behaves_as_no_token() {
        let state = GuardState::new(
            Tokens::full_only(String::new()),
            [HOST.to_owned()],
            GuardPolicy::default(),
        );
        let app = Router::new()
            .route("/", get(|| async { "ok" }))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard));
        for extra in [
            vec![(TOKEN_HEADER, "")],
            vec![("cookie", "web_access_3000=")],
        ] {
            let res = status(app.clone(), req("GET", "/", LAN, &extra)).await;
            assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        }
        let res = status(app, req("GET", "/?token=", LAN, &[])).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn ipv4_mapped_loopback_counts_as_loopback() {
        let open = GuardPolicy {
            loopback_open: true,
        };
        let res = status(
            app(open, None),
            req("GET", "/", "[::ffff:127.0.0.1]:40000", &[]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    const READ_TOKEN: &str = "view-only-token";

    /// Echoes the grant and context the handler sees; POST /x is a mutation,
    /// POST /q a read-only query.
    fn two_token_app(policy: GuardPolicy) -> Router {
        let state = GuardState::new(
            Tokens::none()
                .with(READ_TOKEN, Grant::Read)
                .with(TOKEN, Grant::Full),
            [HOST.to_owned()],
            policy,
        )
        .with_read_safe([RouteRule::new(Some(Method::POST), "/q", ())]);
        let who = |c: AccessContext, g: Grant| async move { format!("{c:?}/{g:?}") };
        Router::new()
            .route("/", get(who))
            .route("/x", post(who))
            .route("/q", post(who))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard))
    }

    async fn body(res: Response) -> String {
        let bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    #[tokio::test]
    async fn either_token_passes_and_the_handler_sees_its_grant() {
        for (tok, want) in [(READ_TOKEN, "WebRemote/Read"), (TOKEN, "WebRemote/Full")] {
            let r = req("GET", "/", LAN, &[(TOKEN_HEADER, tok)]);
            let res = status(two_token_app(GuardPolicy::default()), r).await;
            assert_eq!(res.status(), StatusCode::OK);
            assert_eq!(body(res).await, want);
        }
        let r = req("GET", "/", LAN, &[(TOKEN_HEADER, "nope")]);
        let res = status(two_token_app(GuardPolicy::default()), r).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn read_grant_is_refused_on_unlisted_mutations_only() {
        let h = [(TOKEN_HEADER, READ_TOKEN)];
        let app = || two_token_app(GuardPolicy::default());
        let res = status(app(), req("POST", "/x", LAN, &h)).await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        assert_eq!(body(res).await, r#"{"error":"read_only"}"#);
        let res = status(app(), req("POST", "/q", LAN, &h)).await;
        assert_eq!(res.status(), StatusCode::OK);
        // A full grant may mutate anywhere.
        let full = [(TOKEN_HEADER, TOKEN)];
        let res = status(app(), req("POST", "/x", LAN, &full)).await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn context_comes_from_the_peer() {
        let open = GuardPolicy {
            loopback_open: false,
        };
        let h = [(TOKEN_HEADER, TOKEN)];
        for (peer, want) in [
            ("127.0.0.1:40000", "WebLocal/Full"),
            ("[::ffff:127.0.0.1]:40000", "WebLocal/Full"),
            (LAN, "WebRemote/Full"),
        ] {
            let res = status(two_token_app(open), req("GET", "/", peer, &h)).await;
            assert_eq!(body(res).await, want, "{peer}");
        }
    }

    #[tokio::test]
    async fn loopback_open_yields_a_full_grant() {
        let open = GuardPolicy {
            loopback_open: true,
        };
        let res = status(
            two_token_app(open),
            req("POST", "/x", "127.0.0.1:40000", &[]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(body(res).await, "WebLocal/Full");
    }

    #[tokio::test]
    async fn bootstrap_sets_the_cookie_to_the_matched_token() {
        let uri = format!("/?token={READ_TOKEN}");
        let res = status(
            two_token_app(GuardPolicy::default()),
            req("GET", &uri, LAN, &[]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        let cookie = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(
            cookie.starts_with(&format!("web_access_3000={READ_TOKEN};")),
            "{cookie}"
        );
        // The cookie then confers that token's grant; the other link replaces it.
        let c = format!("web_access_3000={READ_TOKEN}");
        let res = status(
            two_token_app(GuardPolicy::default()),
            req("GET", "/", LAN, &[("cookie", &c)]),
        )
        .await;
        assert_eq!(body(res).await, "WebRemote/Read");
    }

    #[tokio::test]
    async fn rotating_the_read_token_keeps_the_full_token_valid() {
        use crate::token;
        let dir = tempfile::tempdir().unwrap();
        let full = token::load_or_mint(dir.path()).unwrap();
        let read = token::load_or_mint_read(dir.path()).unwrap();
        let tokens = |full: &str, read: &str| {
            Tokens::none()
                .with(read, Grant::Read)
                .with(full, Grant::Full)
        };
        let app = |t| {
            let state = GuardState::new(t, [HOST.to_owned()], GuardPolicy::default());
            Router::new()
                .route("/", get(|| async { "ok" }))
                .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard))
        };
        let get_with =
            |app: Router, tok: &str| status(app, req("GET", "/", LAN, &[(TOKEN_HEADER, tok)]));
        let rotated = token::rotate_read(dir.path()).unwrap();
        let app = app(tokens(
            &token::load_or_mint(dir.path()).unwrap(),
            &token::load_or_mint_read(dir.path()).unwrap(),
        ));
        assert_eq!(get_with(app.clone(), &full).await.status(), StatusCode::OK);
        assert_eq!(
            get_with(app.clone(), &rotated).await.status(),
            StatusCode::OK
        );
        assert_eq!(
            get_with(app, &read).await.status(),
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn a_valid_link_replaces_the_cookie_in_either_direction() {
        for (cookie_tok, link_tok, want) in
            [(TOKEN, READ_TOKEN, READ_TOKEN), (READ_TOKEN, TOKEN, TOKEN)]
        {
            let c = format!("web_access_3000={cookie_tok}");
            let uri = format!("/?token={link_tok}");
            let r = req("GET", &uri, LAN, &[("cookie", &c)]);
            let res = status(two_token_app(GuardPolicy::default()), r).await;
            assert_eq!(res.status(), StatusCode::OK);
            let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
            assert!(
                set.starts_with(&format!("web_access_3000={want};")),
                "{set}"
            );
        }
        // A wrong link does not displace a valid cookie.
        let c = format!("web_access_3000={TOKEN}");
        let r = req("GET", "/?token=bad", LAN, &[("cookie", &c)]);
        let res = status(two_token_app(GuardPolicy::default()), r).await;
        assert_eq!(body(res).await, "WebRemote/Full");
    }

    #[tokio::test]
    async fn header_and_cookie_disagreeing_resolve_to_the_highest_grant() {
        let c = format!("web_access_3000={TOKEN}");
        for (h, c) in [
            (READ_TOKEN, c),
            (TOKEN, format!("web_access_3000={READ_TOKEN}")),
        ] {
            let r = req("GET", "/", LAN, &[(TOKEN_HEADER, h), ("cookie", &c)]);
            let res = status(two_token_app(GuardPolicy::default()), r).await;
            assert_eq!(body(res).await, "WebRemote/Full");
        }
    }

    #[test]
    fn cookie_name_carries_the_port() {
        assert_eq!(cookie_name(3000), "web_access_3000");
        assert_eq!(admin_cookie_name(3000), "web_access_admin_3000");
        assert!(is_cookie_name("web_access_3000"));
        assert!(is_cookie_name("web_access_admin_3000"));
        for other in [
            "web_access",
            "web_access_",
            "web_access_x",
            "web_access_1x",
            "sid",
        ] {
            assert!(!is_cookie_name(other), "{other}");
        }
    }

    #[tokio::test]
    async fn only_this_ports_cookie_is_read() {
        // A cookie another server on this address set carries this port's
        // valid token under another port's name: ignored.
        for name in ["web_access_3001", "web_access"] {
            let c = format!("{name}={TOKEN}");
            let res = status(
                two_token_app(GuardPolicy::default()),
                req("GET", "/", LAN, &[("cookie", &c)]),
            )
            .await;
            assert_eq!(res.status(), StatusCode::UNAUTHORIZED, "{name}");
        }
        // The bootstrap sets the cookie of the port the request came in on.
        let r = req("GET", &format!("/?token={TOKEN}"), LAN, &[]);
        let res = status(two_token_app(GuardPolicy::default()), r).await;
        let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(
            set.starts_with(&format!("web_access_3000={TOKEN};")),
            "{set}"
        );
    }

    const ADMIN_TOKEN: &str = "admin-token";

    fn admin_app(admin_on: bool) -> Router {
        let mut tokens = Tokens::full_only(TOKEN.to_owned());
        if admin_on {
            tokens = tokens.with(ADMIN_TOKEN, Grant::Admin);
        }
        let state = GuardState::new(tokens, [HOST.to_owned()], GuardPolicy::default());
        let who = |g: Grant| async move { format!("{g:?}") };
        Router::new()
            .route("/", get(who))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard))
    }

    #[tokio::test]
    async fn the_admin_token_grants_admin_only_while_it_is_loaded() {
        let h = [(TOKEN_HEADER, ADMIN_TOKEN)];
        let res = status(admin_app(true), req("GET", "/", LAN, &h)).await;
        assert_eq!(body(res).await, "Admin");
        let res = status(admin_app(false), req("GET", "/", LAN, &h)).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        // Admin outranks full when both are presented, and is not read-only.
        let both = [
            (TOKEN_HEADER, TOKEN),
            ("cookie", "web_access_3000=admin-token"),
        ];
        let res = status(admin_app(true), req("GET", "/", LAN, &both)).await;
        assert_eq!(body(res).await, "Admin");
    }

    #[test]
    fn the_default_share_token_is_never_the_admin_one() {
        let t = Tokens::none()
            .with(ADMIN_TOKEN, Grant::Admin)
            .with(TOKEN, Grant::Full);
        assert_eq!(t.share_token(), Some(TOKEN));
    }

    #[tokio::test]
    async fn head_and_options_are_safe_for_a_read_grant() {
        let h = [(TOKEN_HEADER, READ_TOKEN)];
        let res = status(
            two_token_app(GuardPolicy::default()),
            req("HEAD", "/", LAN, &h),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        let res = status(
            two_token_app(GuardPolicy::default()),
            req("OPTIONS", "/x", LAN, &h),
        )
        .await;
        assert_ne!(res.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn read_safe_matches_method_and_only_the_canonical_path() {
        let h = [(TOKEN_HEADER, READ_TOKEN)];
        let app = || two_token_app(GuardPolicy::default());
        let res = status(app(), req("PUT", "/q", LAN, &h)).await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        // axum routes the raw path, so a spelling that only normalises to the
        // read-safe route could reach another handler: refused.
        for raw in ["/q/", "//q", "/%71"] {
            let res = status(app(), req("POST", raw, LAN, &h)).await;
            assert_eq!(res.status(), StatusCode::FORBIDDEN, "{raw}");
        }
        let res = status(app(), req("POST", "/x/../q", LAN, &h)).await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn read_only_refusal_is_json() {
        let h = [(TOKEN_HEADER, READ_TOKEN)];
        let res = status(
            two_token_app(GuardPolicy::default()),
            req("DELETE", "/x", LAN, &h),
        )
        .await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        assert_eq!(res.headers()[header::CONTENT_TYPE], "application/json");
        assert_eq!(res.headers()[header::REFERRER_POLICY], "no-referrer");
    }

    #[test]
    fn duplicate_hosts_are_collapsed() {
        let s = GuardState::new(
            Tokens::none(),
            ["A:1".to_owned(), "a:1".to_owned()],
            GuardPolicy::default(),
        );
        assert_eq!(s.allowed_hosts, ["a:1"]);
    }

    /// A token with URL and cookie metacharacters, as a hand-set override may be.
    const ODD_TOKEN: &str = "pass phrase;a&b#c%d+e=f\u{e9}";

    fn odd_token_app() -> Router {
        let state = GuardState::new(
            Tokens::full_only(ODD_TOKEN.to_owned()),
            [HOST.to_owned()],
            GuardPolicy::default(),
        );
        Router::new()
            .route("/", get(|| async { "ok" }))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard))
    }

    #[tokio::test]
    async fn a_share_link_for_any_token_bootstraps_a_working_cookie() {
        let url = crate::serve::share_url(HOST.parse().unwrap(), ODD_TOKEN);
        let target = url.strip_prefix(&format!("http://{HOST}")).unwrap();
        let res = status(odd_token_app(), req("GET", target, LAN, &[])).await;
        assert_eq!(res.status(), StatusCode::OK, "{target}");
        assert_eq!(bounce_target(&res), "/");
        // A browser keeps the cookie pair up to the first `;`.
        let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
        let pair = set.split(';').next().unwrap().to_owned();
        let res = status(odd_token_app(), req("GET", "/", LAN, &[("cookie", &pair)])).await;
        assert_eq!(res.status(), StatusCode::OK, "{pair}");
    }

    /// A link or cookie written before tokens were percent-encoded carries a
    /// hand-set token raw; one holding `%41` must still match itself.
    #[tokio::test]
    async fn a_raw_link_and_cookie_for_a_token_holding_a_percent_still_work() {
        const RAW: &str = "ab%41cdef-hand-set";
        let app = || {
            let state = GuardState::new(
                Tokens::full_only(RAW.to_owned()),
                [HOST.to_owned()],
                GuardPolicy::default(),
            );
            Router::new()
                .route("/", get(|| async { "ok" }))
                .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard))
        };
        let link = format!("/?token={RAW}");
        let res = status(app(), req("GET", &link, LAN, &[])).await;
        assert_eq!(res.status(), StatusCode::OK);
        let cookie = format!("{}={RAW}", cookie_name(3000));
        let res = status(app(), req("GET", "/", LAN, &[("cookie", &cookie)])).await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn a_percent_encoded_token_query_is_decoded() {
        let res = status(
            app(GuardPolicy::default(), None),
            req("GET", "/?token=s3cret%2Dtoken", LAN, &[]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn wrong_token_query_is_401() {
        let res = status(
            app(GuardPolicy::default(), None),
            req("GET", "/?token=bad", LAN, &[]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        assert!(res.headers().get(header::SET_COOKIE).is_none());
    }

    #[tokio::test]
    async fn token_query_does_not_bootstrap_on_post() {
        let res = status(
            app(GuardPolicy::default(), None),
            req("POST", "/x?token=s3cret-token", LAN, &[]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn bad_host_is_421_even_with_a_valid_token() {
        let h = [(TOKEN_HEADER, TOKEN)];
        let mut r = req("GET", "/", LAN, &h);
        r.headers_mut()
            .insert("host", HeaderValue::from_static("evil.example:3000"));
        let res = status(app(GuardPolicy::default(), None), r).await;
        assert_eq!(res.status(), StatusCode::MISDIRECTED_REQUEST);
    }

    #[tokio::test]
    async fn host_match_is_case_insensitive_and_port_exact() {
        let h = [(TOKEN_HEADER, TOKEN)];
        let mut r = req("GET", "/", LAN, &h);
        r.headers_mut()
            .insert("host", HeaderValue::from_static("LocalHost:3000"));
        assert_eq!(
            status(app(GuardPolicy::default(), None), r).await.status(),
            StatusCode::OK
        );
        let mut r = req("GET", "/", LAN, &h);
        r.headers_mut()
            .insert("host", HeaderValue::from_static("localhost:3001"));
        assert_eq!(
            status(app(GuardPolicy::default(), None), r).await.status(),
            StatusCode::MISDIRECTED_REQUEST
        );
    }

    #[tokio::test]
    async fn foreign_origin_on_post_is_403_but_allowed_origin_passes() {
        let tok = (TOKEN_HEADER, TOKEN);
        let res = status(
            app(GuardPolicy::default(), None),
            req("POST", "/x", LAN, &[tok, ("origin", "http://evil.example")]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        let res = status(
            app(GuardPolicy::default(), None),
            req(
                "POST",
                "/x",
                LAN,
                &[tok, ("origin", "http://192.168.1.5:3000")],
            ),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        // GET with a foreign Origin is not blocked (navigations and fetches send it).
        let res = status(
            app(GuardPolicy::default(), None),
            req("GET", "/", LAN, &[tok, ("origin", "http://evil.example")]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        let res = status(
            app(GuardPolicy::default(), None),
            req("POST", "/x", LAN, &[tok, ("origin", "null")]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn loopback_open_passes_a_loopback_peer_with_no_token() {
        let open = GuardPolicy {
            loopback_open: true,
        };
        let res = status(app(open, None), req("GET", "/", "127.0.0.1:40000", &[])).await;
        assert_eq!(res.status(), StatusCode::OK);
        // A LAN peer still needs the token under the same policy.
        let res = status(app(open, None), req("GET", "/", LAN, &[])).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        // And a loopback peer needs it when the policy is closed.
        let res = status(
            app(GuardPolicy::default(), None),
            req("GET", "/", "127.0.0.1:40000", &[]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn loopback_open_still_checks_host() {
        let open = GuardPolicy {
            loopback_open: true,
        };
        let mut r = req("GET", "/", "127.0.0.1:40000", &[]);
        r.headers_mut()
            .insert("host", HeaderValue::from_static("rebind.example:3000"));
        assert_eq!(
            status(app(open, None), r).await.status(),
            StatusCode::MISDIRECTED_REQUEST
        );
    }

    #[tokio::test]
    async fn no_connect_info_fails_closed() {
        let open = GuardPolicy {
            loopback_open: true,
        };
        let mut r = req("GET", "/", "127.0.0.1:1", &[]);
        r.extensions_mut().remove::<ConnectInfo<SocketAddr>>();
        assert_eq!(
            status(app(open, None), r).await.status(),
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn on_denied_sees_wrong_token_and_bad_host_but_not_idle_requests() {
        let n = Arc::new(AtomicUsize::new(0));
        let a = || app(GuardPolicy::default(), Some(n.clone()));
        status(a(), req("GET", "/", LAN, &[])).await; // idle: no report
        assert_eq!(n.load(Ordering::SeqCst), 0);
        status(a(), req("GET", "/", LAN, &[(TOKEN_HEADER, "bad")])).await;
        assert_eq!(n.load(Ordering::SeqCst), 1);
        let mut r = req("GET", "/", LAN, &[]);
        r.headers_mut()
            .insert("host", HeaderValue::from_static("evil.example"));
        status(a(), r).await;
        assert_eq!(n.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn denial_budget_caps_a_window_and_reopens_after_it() {
        let t0 = Instant::now();
        let budget = DenialBudget::new(t0);
        for _ in 0..DENIAL_BUDGET {
            assert!(budget.admit(t0));
        }
        assert!(!budget.admit(t0));
        assert!(budget.admit(t0 + DENIAL_WINDOW));
    }

    #[test]
    fn recorded_path_is_capped_on_a_char_boundary() {
        assert_eq!(clamp_path("/api/x"), "/api/x");
        let clamped = clamp_path(&format!("/api/{}", "é".repeat(MAX_RECORDED_PATH)));
        assert!(clamped.len() <= MAX_RECORDED_PATH + '…'.len_utf8());
        assert!(clamped.ends_with('…'));
    }

    #[test]
    fn authority_normalisation() {
        assert_eq!(normalize_authority("LocalHost", 80), "localhost:80");
        assert_eq!(normalize_authority("[::1]:3000", 80), "[::1]:3000");
        assert_eq!(normalize_authority("[::1]", 80), "[::1]:80");
        assert_eq!(origin_authority("https://a.b").as_deref(), Some("a.b:443"));
        assert_eq!(origin_authority("null"), None);
    }

    #[test]
    fn an_origin_matches_only_the_hosts_normalised_authority() {
        assert!(origin_matches_host("http://LAN:3000", "lan:3000"));
        assert!(origin_matches_host("http://lan", "lan"));
        assert!(!origin_matches_host("http://lan:3001", "lan:3000"));
        assert!(!origin_matches_host("http://evil.example", "lan:3000"));
        assert!(!origin_matches_host("null", "lan:3000"));
    }

    // --- public hosts behind a TLS-terminating proxy ---

    const PUBLIC: &str = "x.fly.dev";

    fn public_app(configured: bool) -> Router {
        let mut state = GuardState::new(
            Tokens::full_only(TOKEN.to_owned()),
            ["localhost:3000".to_owned()],
            GuardPolicy::default(),
        );
        if configured {
            state = state.with_public_hosts([PUBLIC]);
        }
        Router::new()
            .route("/", get(|| async { "ok" }))
            .route("/x", post(|| async { "posted" }))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard))
    }

    /// A request as the proxy forwards it: public `Host`, a non-loopback peer.
    fn proxied(method: &str, uri: &str, host: &str, extra: &[(&str, &str)]) -> Request<Body> {
        let mut b = Request::builder()
            .method(method)
            .uri(uri)
            .header("host", host);
        for (k, v) in extra {
            b = b.header(*k, *v);
        }
        let mut r = b.body(Body::empty()).unwrap();
        r.extensions_mut().insert(ConnectInfo(
            "172.16.0.2:40000".parse::<SocketAddr>().unwrap(),
        ));
        r
    }

    #[tokio::test]
    async fn public_host_passes_only_when_configured() {
        let h = [(TOKEN_HEADER, TOKEN)];
        let off = status(public_app(false), proxied("GET", "/", PUBLIC, &h)).await;
        assert_eq!(off.status(), StatusCode::MISDIRECTED_REQUEST);
        let on = status(public_app(true), proxied("GET", "/", PUBLIC, &h)).await;
        assert_eq!(on.status(), StatusCode::OK);
        // Case-insensitive, and an explicit default port is the same authority.
        for host in ["X.Fly.Dev", "x.fly.dev:443", "x.fly.dev:80"] {
            let res = status(public_app(true), proxied("GET", "/", host, &h)).await;
            assert_eq!(res.status(), StatusCode::OK, "{host}");
        }
    }

    #[tokio::test]
    async fn an_unconfigured_host_is_still_421_beside_a_public_one() {
        let h = [(TOKEN_HEADER, TOKEN)];
        for host in ["evil.example", "x.fly.dev.evil.example", "y.fly.dev"] {
            let res = status(public_app(true), proxied("GET", "/", host, &h)).await;
            assert_eq!(res.status(), StatusCode::MISDIRECTED_REQUEST, "{host}");
        }
    }

    #[tokio::test]
    async fn https_origin_of_the_public_host_passes_a_post_and_others_do_not() {
        let post = |origin: &'static str| {
            proxied(
                "POST",
                "/x",
                PUBLIC,
                &[(TOKEN_HEADER, TOKEN), ("origin", origin)],
            )
        };
        let ok = status(public_app(true), post("https://x.fly.dev")).await;
        assert_eq!(ok.status(), StatusCode::OK);
        for bad in ["https://evil.example", "https://x.fly.dev.evil.example"] {
            let res = status(public_app(true), post(bad)).await;
            assert_eq!(res.status(), StatusCode::FORBIDDEN, "{bad}");
        }
        // Without the option the same Origin is foreign.
        let res = status(
            public_app(false),
            proxied(
                "POST",
                "/x",
                "localhost:3000",
                &[(TOKEN_HEADER, TOKEN), ("origin", "https://x.fly.dev")],
            ),
        )
        .await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }

    fn admin_public_app(public_only: bool) -> Router {
        let mut state = GuardState::new(
            Tokens::full_only(TOKEN.to_owned()).with(ADMIN_TOKEN, Grant::Admin),
            ["localhost:3000".to_owned(), HOST.to_owned()],
            GuardPolicy::default(),
        )
        .with_public_hosts([PUBLIC]);
        if public_only {
            state = state.with_admin_over_public_only();
        }
        let who = |g: Grant| async move { format!("{g:?}") };
        Router::new()
            .route("/", get(who))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard))
    }

    #[tokio::test]
    async fn admin_over_public_only_keeps_admin_on_the_public_host_and_lowers_it_elsewhere() {
        let h = [(TOKEN_HEADER, ADMIN_TOKEN)];
        // On the public name the admin token is Admin.
        let res = status(admin_public_app(true), proxied("GET", "/", PUBLIC, &h)).await;
        assert_eq!(body(res).await, "Admin");
        // On the private-network address the same token is only Full, whether
        // it is sent as a header or as the cookie.
        let res = status(admin_public_app(true), proxied("GET", "/", HOST, &h)).await;
        assert_eq!(body(res).await, "Full");
        let cookie = [("cookie", "web_access_3000=admin-token")];
        let res = status(admin_public_app(true), proxied("GET", "/", HOST, &cookie)).await;
        assert_eq!(body(res).await, "Full");
        // Without the option it is Admin everywhere, as before.
        let res = status(admin_public_app(false), proxied("GET", "/", HOST, &h)).await;
        assert_eq!(body(res).await, "Admin");
        // The full token is Full either way.
        let full = [(TOKEN_HEADER, TOKEN)];
        let res = status(admin_public_app(true), proxied("GET", "/", PUBLIC, &full)).await;
        assert_eq!(body(res).await, "Full");
    }

    #[test]
    fn a_portless_https_origin_matches_only_a_public_host() {
        // The general check is unchanged: a portless Host is on 80.
        assert!(!origin_matches_host("https://192.168.1.5", "192.168.1.5"));
        assert!(!origin_matches_host("https://x.fly.dev", "x.fly.dev"));
        // For a public name the proxy forwards no port, and the page is on 443.
        assert!(origin_matches_public_host("https://x.fly.dev", "x.fly.dev"));
        assert!(origin_matches_public_host(
            "https://x.fly.dev:8443",
            "x.fly.dev:8443"
        ));
        assert!(!origin_matches_public_host(
            "https://x.fly.dev",
            "x.fly.dev:8443"
        ));
        assert!(!origin_matches_public_host("http://x.fly.dev", "x.fly.dev"));
        assert!(!origin_matches_public_host(
            "http://x.fly.dev",
            "x.fly.dev:443"
        ));
        assert!(!origin_matches_public_host(
            "https://evil.example",
            "x.fly.dev"
        ));
    }

    #[tokio::test]
    async fn the_guard_marks_public_host_requests_only() {
        let state = GuardState::new(
            Tokens::full_only(TOKEN.to_owned()),
            [HOST.to_owned()],
            GuardPolicy::default(),
        )
        .with_public_hosts([PUBLIC]);
        let app = Router::new()
            .route(
                "/",
                get(|req: Request<Body>| async move {
                    if req.extensions().get::<PublicHost>().is_some() {
                        "public"
                    } else {
                        "private"
                    }
                }),
            )
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard));
        let h = [(TOKEN_HEADER, TOKEN)];
        let res = status(app.clone(), proxied("GET", "/", PUBLIC, &h)).await;
        assert_eq!(body(res).await, "public");
        let res = status(app, proxied("GET", "/", HOST, &h)).await;
        assert_eq!(body(res).await, "private");
    }

    #[tokio::test]
    async fn cookie_max_age_never_applies_to_the_admin_cookie() {
        let state = GuardState::new(
            Tokens::full_only(TOKEN.to_owned()).with(ADMIN_TOKEN, Grant::Admin),
            [HOST.to_owned()],
            GuardPolicy::default(),
        )
        .with_public_hosts([PUBLIC])
        .with_admin_over_public_only()
        .with_cookie_max_age(std::time::Duration::from_secs(30 * 86_400));
        let app = Router::new()
            .route("/", get(|| async { "ok" }))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard));
        let set_cookie = |uri: String| {
            let app = app.clone();
            async move {
                let res = status(app, proxied("GET", &uri, PUBLIC, &[])).await;
                res.headers()[header::SET_COOKIE]
                    .to_str()
                    .unwrap()
                    .to_string()
            }
        };
        let admin = set_cookie(format!("/?token={ADMIN_TOKEN}")).await;
        assert!(admin.starts_with("web_access_admin_80="), "{admin}");
        assert!(!admin.contains("Max-Age"), "{admin}");
        let full = set_cookie(format!("/?token={TOKEN}")).await;
        assert!(full.ends_with("; Max-Age=2592000"), "{full}");
    }

    #[tokio::test]
    async fn the_admin_token_gets_its_own_cookie_and_the_full_link_does_not_replace_it() {
        let uri = format!("/?token={ADMIN_TOKEN}");
        let res = status(admin_public_app(true), proxied("GET", &uri, PUBLIC, &[])).await;
        assert_eq!(res.status(), StatusCode::OK);
        let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(set.starts_with("web_access_admin_80=admin-token;"), "{set}");
        assert!(set.contains("Secure"));
        // The everyday full link sets a different cookie.
        let uri = format!("/?token={TOKEN}");
        let res = status(admin_public_app(true), proxied("GET", &uri, PUBLIC, &[])).await;
        let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(set.starts_with("web_access_80=s3cret-token;"), "{set}");
        // A request carrying both resolves to the highest grant.
        let both = [(
            "cookie",
            "web_access_80=s3cret-token; web_access_admin_80=admin-token",
        )];
        let res = status(admin_public_app(true), proxied("GET", "/", PUBLIC, &both)).await;
        assert_eq!(body(res).await, "Admin");
        // The admin cookie alone is Admin; the full cookie alone is Full.
        let admin = [("cookie", "web_access_admin_80=admin-token")];
        let res = status(admin_public_app(true), proxied("GET", "/", PUBLIC, &admin)).await;
        assert_eq!(body(res).await, "Admin");
        let full = [("cookie", "web_access_80=s3cret-token")];
        let res = status(admin_public_app(true), proxied("GET", "/", PUBLIC, &full)).await;
        assert_eq!(body(res).await, "Full");
    }

    #[tokio::test]
    async fn an_admin_link_on_a_non_public_host_sets_no_cookie() {
        let uri = format!("/?token={ADMIN_TOKEN}");
        let res = status(admin_public_app(true), proxied("GET", &uri, HOST, &[])).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        assert!(res.headers().get(header::SET_COOKIE).is_none());
        // Without the option the admin cookie is set as usual.
        let res = status(admin_public_app(false), proxied("GET", &uri, HOST, &[])).await;
        assert_eq!(res.status(), StatusCode::OK);
        // The full link on a non-public host still works.
        let uri = format!("/?token={TOKEN}");
        let res = status(admin_public_app(true), proxied("GET", &uri, HOST, &[])).await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[test]
    fn public_host_names_normalise_as_with_public_hosts_keeps_them() {
        assert_eq!(
            normalize_public_host(" X.Fly.dev ").as_deref(),
            Some("x.fly.dev")
        );
        for bad in [
            "",
            "  ",
            "https://x.fly.dev",
            "a@b.dev",
            "x.fly.dev/p",
            "a b",
        ] {
            assert_eq!(normalize_public_host(bad), None, "{bad}");
        }
    }

    #[tokio::test]
    async fn a_public_host_request_still_needs_the_token() {
        let res = status(public_app(true), proxied("GET", "/", PUBLIC, &[])).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn cookie_is_secure_on_a_public_host_and_not_on_a_local_one() {
        let uri = format!("/?token={TOKEN}");
        let res = status(public_app(true), proxied("GET", &uri, PUBLIC, &[])).await;
        assert_eq!(res.status(), StatusCode::OK);
        let cookie = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(cookie.ends_with("; Secure"), "{cookie}");
        assert!(cookie.contains("HttpOnly") && cookie.contains("SameSite=Strict"));

        let res = status(
            public_app(true),
            proxied("GET", &uri, "localhost:3000", &[]),
        )
        .await;
        let cookie = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(!cookie.contains("Secure"), "{cookie}");
    }

    #[test]
    fn malformed_public_host_names_are_ignored() {
        let state = GuardState::new(Tokens::none(), [], GuardPolicy::default())
            .with_public_hosts(["", "https://x.fly.dev", "a@b.dev", "x.fly.dev/p"]);
        assert!(state.public_hosts.is_empty() && state.public_origins.is_empty());
    }

    #[tokio::test]
    async fn plain_http_origin_of_a_public_host_is_403_and_https_passes() {
        let post = |host: &'static str, origin: &'static str| {
            proxied(
                "POST",
                "/x",
                host,
                &[(TOKEN_HEADER, TOKEN), ("origin", origin)],
            )
        };
        let res = status(public_app(true), post(PUBLIC, "http://x.fly.dev")).await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        let res = status(public_app(true), post(PUBLIC, "https://x.fly.dev")).await;
        assert_eq!(res.status(), StatusCode::OK);
        // The public Origin does not carry over to a request for a local Host.
        let res = status(
            public_app(true),
            post("localhost:3000", "https://x.fly.dev"),
        )
        .await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn a_public_name_with_a_port_still_refuses_a_plain_http_origin() {
        let state = GuardState::new(
            Tokens::full_only(TOKEN.to_owned()),
            ["localhost:3000".to_owned()],
            GuardPolicy::default(),
        )
        .with_public_hosts(["x.fly.dev:8443"]);
        let app = Router::new()
            .route("/x", post(|| async { "posted" }))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard));
        let post = |origin: &'static str| {
            proxied(
                "POST",
                "/x",
                "x.fly.dev:8443",
                &[(TOKEN_HEADER, TOKEN), ("origin", origin)],
            )
        };
        let res = status(app.clone(), post("http://x.fly.dev:8443")).await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        let res = status(app, post("https://x.fly.dev:8443")).await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    // --- combinations of public hosts, admin rules, cookie lifetime, encoded
    // tokens and live interface hosts ---

    const ODD_ADMIN: &str = "admin phrase;x&y#z%";

    /// Odd full and admin tokens, a public name, admin-over-public-only, a
    /// cookie lifetime, and a wildcard bind on :3000 whose interface list holds
    /// 10.0.0.7.
    fn combined_app() -> Router {
        let state = GuardState::new(
            Tokens::full_only(ODD_TOKEN.to_owned()).with(ODD_ADMIN, Grant::Admin),
            [HOST.to_owned()],
            GuardPolicy::default(),
        )
        .with_public_hosts([PUBLIC])
        .with_admin_over_public_only()
        .with_cookie_max_age(std::time::Duration::from_secs(60))
        .with_live_hosts(
            vec!["0.0.0.0:3000".parse().unwrap()],
            Arc::new(|| vec!["10.0.0.7".parse().unwrap()]),
        );
        let who = |g: Grant| async move { format!("{g:?}") };
        Router::new()
            .route("/", get(who).post(|| async { "posted" }))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard))
    }

    fn link(token: &str) -> String {
        format!("/?token={}", encode_token(token))
    }

    /// The `name=value` pair a browser keeps from a `Set-Cookie`.
    fn cookie_pair(res: &Response) -> String {
        let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
        set.split(';').next().unwrap().to_owned()
    }

    #[tokio::test]
    async fn an_encoded_link_on_a_public_host_keeps_the_lifetime_and_admin_rules() {
        // Full: encoded value, Secure, Max-Age.
        let res = status(
            combined_app(),
            proxied("GET", &link(ODD_TOKEN), PUBLIC, &[]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(
            set.starts_with(&format!("web_access_80={}", encode_token(ODD_TOKEN))),
            "{set}"
        );
        assert!(
            set.contains("; Secure") && set.ends_with("; Max-Age=60"),
            "{set}"
        );
        let full = cookie_pair(&res);
        let res = status(
            combined_app(),
            proxied("GET", "/", PUBLIC, &[("cookie", &full)]),
        )
        .await;
        assert_eq!(body(res).await, "Full");

        // Admin: its own cookie, encoded, Secure, never a Max-Age.
        let res = status(
            combined_app(),
            proxied("GET", &link(ODD_ADMIN), PUBLIC, &[]),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(
            set.starts_with(&format!("web_access_admin_80={}", encode_token(ODD_ADMIN))),
            "{set}"
        );
        assert!(
            set.contains("; Secure") && !set.contains("Max-Age"),
            "{set}"
        );
        let admin = cookie_pair(&res);
        let res = status(
            combined_app(),
            proxied("GET", "/", PUBLIC, &[("cookie", &admin)]),
        )
        .await;
        assert_eq!(body(res).await, "Admin");
    }

    #[tokio::test]
    async fn an_encoded_admin_link_or_cookie_off_the_public_host_is_not_admin() {
        // The encoded admin link on a private Host sets no cookie.
        let res = status(combined_app(), proxied("GET", &link(ODD_ADMIN), HOST, &[])).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        assert!(res.headers().get(header::SET_COOKIE).is_none());
        // An encoded admin cookie carried to a private Host is only Full.
        let cookie = format!("web_access_admin_3000={}", encode_token(ODD_ADMIN));
        let res = status(
            combined_app(),
            proxied("GET", "/", HOST, &[("cookie", &cookie)]),
        )
        .await;
        assert_eq!(body(res).await, "Full");
    }

    #[tokio::test]
    async fn a_live_interface_host_is_a_private_host() {
        const LIVE: &str = "10.0.0.7:3000";
        // It is served, but an admin token there is only Full ...
        let h = [(TOKEN_HEADER, ODD_ADMIN)];
        let res = status(combined_app(), proxied("GET", "/", LIVE, &h)).await;
        assert_eq!(body(res).await, "Full");
        // ... an admin link there sets no cookie ...
        let res = status(combined_app(), proxied("GET", &link(ODD_ADMIN), LIVE, &[])).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        assert!(res.headers().get(header::SET_COOKIE).is_none());
        // ... a full link gets the lifetime but not Secure ...
        let res = status(combined_app(), proxied("GET", &link(ODD_TOKEN), LIVE, &[])).await;
        let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(
            set.starts_with("web_access_3000=") && set.ends_with("; Max-Age=60"),
            "{set}"
        );
        assert!(!set.contains("Secure"), "{set}");
        // ... and the public name's Origin does not pass a mutation on it.
        let full = [(TOKEN_HEADER, ODD_TOKEN), ("origin", "https://x.fly.dev")];
        let res = status(combined_app(), proxied("POST", "/", LIVE, &full)).await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        // A live address on another port, or one not on an interface, is 421.
        for host in ["10.0.0.7:3001", "10.0.0.8:3000"] {
            let res = status(combined_app(), proxied("GET", "/", host, &h)).await;
            assert_eq!(res.status(), StatusCode::MISDIRECTED_REQUEST, "{host}");
        }
    }

    #[tokio::test]
    async fn a_foreign_origin_cannot_open_a_websocket_even_on_open_loopback() {
        let open = GuardPolicy {
            loopback_open: true,
        };
        let upgrade = |origin: &'static str| {
            req(
                "GET",
                "/",
                "127.0.0.1:40000",
                &[
                    ("upgrade", "websocket"),
                    ("connection", "upgrade"),
                    ("origin", origin),
                ],
            )
        };
        let res = status(app(open, None), upgrade("https://evil.example")).await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        // Another server on this machine is foreign too.
        let res = status(app(open, None), upgrade("http://localhost:5173")).await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        // The app's own origin and its desktop webview pass the Origin check.
        for ok in [
            "http://192.168.1.5:3000",
            "tauri://localhost",
            "http://tauri.localhost",
        ] {
            let res = status(app(open, None), upgrade(ok)).await;
            assert_ne!(res.status(), StatusCode::FORBIDDEN, "{ok}");
        }
        // A plain GET with a foreign Origin is left to CORS, as before.
        let r = req(
            "GET",
            "/",
            "127.0.0.1:40000",
            &[("origin", "https://evil.example")],
        );
        assert_eq!(status(app(open, None), r).await.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn the_landing_page_escapes_the_target_and_is_not_cached() {
        let res = status(
            app(GuardPolicy::default(), None),
            req("GET", "/a%22b?x=%3C&token=s3cret-token", LAN, &[]),
        )
        .await;
        assert_eq!(bounce_target(&res), "/a%22b?x=%3C");
        assert_eq!(res.headers()[header::CACHE_CONTROL], "no-store");
        let html = body(res).await;
        assert!(html.contains(r#"content="0;url=/a%22b?x=%3C""#), "{html}");
        assert!(!html.contains("token"), "{html}");
    }

    #[tokio::test]
    async fn a_wildcard_read_safe_rule_matches_an_encoded_name_below_it() {
        let state = GuardState::new(
            Tokens::none().with(READ_TOKEN, Grant::Read),
            [HOST.to_owned()],
            GuardPolicy::default(),
        )
        .with_read_safe([RouteRule::new(Some(Method::POST), "/notes/*", ())]);
        let app = Router::new()
            .route("/notes/{*name}", post(|| async { "read" }))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard));
        let h = [(TOKEN_HEADER, READ_TOKEN)];
        let res = status(app.clone(), req("POST", "/notes/my%20note", LAN, &h)).await;
        assert_eq!(res.status(), StatusCode::OK);
        // The prefix itself must be spelled as the rule spells it.
        let res = status(app, req("POST", "/n%6ftes/a", LAN, &h)).await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn a_token_with_cookie_breaking_characters_round_trips_through_the_cookie() {
        let token = "ab;c d\u{7f}";
        let state = GuardState::new(
            Tokens::full_only(token.to_owned()),
            [HOST.to_owned()],
            GuardPolicy::default(),
        );
        let app = Router::new()
            .route("/", get(|| async { "ok" }))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard));
        let link = crate::share_url("192.168.1.5:3000".parse().unwrap(), token);
        let path = link.strip_prefix("http://192.168.1.5:3000").unwrap();
        let res = status(app.clone(), req("GET", path, LAN, &[])).await;
        let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
        let pair = set.split(';').next().unwrap();
        assert_eq!(pair, "web_access_3000=ab%3Bc%20d%7F");
        let res = status(app, req("GET", "/", LAN, &[("cookie", pair)])).await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn a_read_grant_cannot_open_a_websocket_unless_the_route_is_read_safe() {
        let h = [
            (TOKEN_HEADER, READ_TOKEN),
            ("upgrade", "websocket"),
            ("connection", "upgrade"),
        ];
        let res = status(
            two_token_app(GuardPolicy::default()),
            req("GET", "/", LAN, &h),
        )
        .await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        // `/q` is read-safe for POST only, so a GET upgrade there is refused too.
        let res = status(
            two_token_app(GuardPolicy::default()),
            req("GET", "/q", LAN, &h),
        )
        .await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        // A full grant may upgrade.
        let h = [
            (TOKEN_HEADER, TOKEN),
            ("upgrade", "websocket"),
            ("connection", "upgrade"),
        ];
        let res = status(
            two_token_app(GuardPolicy::default()),
            req("GET", "/", LAN, &h),
        )
        .await;
        assert_ne!(res.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn debug_output_never_shows_a_token() {
        let tokens = Tokens::full_only("s3cret".to_owned()).with("r3ad", Grant::Read);
        let shown = format!("{tokens:?}");
        assert!(
            !shown.contains("s3cret") && !shown.contains("r3ad"),
            "{shown}"
        );
        assert!(shown.contains("Full"), "{shown}");
    }
}
