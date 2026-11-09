//! The axum request guard: token, Host and Origin checks that stay safe beyond
//! loopback.
//!
//! Every request, whatever its method (GET, SSE and static files included),
//! must pass in this order:
//!
//! 1. The `Host` header is on the allowlist or, for a wildcard bind, is a
//!    current interface IP on the bound port, else 421. This holds for
//!    loopback peers too: it is what stops a DNS-rebinding page from reading
//!    the app.
//! 2. A mutating request, or a protocol upgrade such as a WebSocket handshake,
//!    with an `Origin` header has an allowed Origin, else 403. An upgrade may
//!    also come from a desktop webview's own origin (`tauri://localhost`,
//!    `http(s)://tauri.localhost`).
//! 3. The path normalises (see [`normalize_path`]), else 400: no `.`/`..`
//!    segment, no `\` or encoded `/`. Deny rules ([`crate::HostPolicy`]) match
//!    the normalised path; read-safe rules match the raw path.
//! 4. A loopback peer passes with [`Grant::Full`] when
//!    [`GuardPolicy::loopback_open`] is set.
//! 5. A `GET` carrying a valid `?token=` sets the cookie to that token and
//!    answers with a small page that moves to the same URL without the
//!    parameter (a `Refresh` header and a `<meta>` refresh, not a 303), so the
//!    token never stays in the address bar, history or a `Referer`. The move
//!    starts from this origin, so the `SameSite=Strict` cookie is sent even
//!    when the link was opened from another site. It wins over any cookie, so
//!    opening another share link replaces it.
//! 6. Otherwise this port's `web_access_<port>` cookie ([`cookie_name`]) or
//!    the `x-web-access-token` header must equal one of the [`Tokens`]
//!    (constant-time compare against every entry), else 401. If header and
//!    cookies match different entries, the highest [`Grant`] wins.
//! 7. A [`Grant::Read`] request with a non-safe method, or a protocol upgrade,
//!    is 403 `read_only` unless a [`GuardState::with_read_safe`] rule names the
//!    route.
//!
//! Every token is a [`Token`], whose characters (`A-Z a-z 0-9 - _`) need no
//! escaping, so a token is compared, put in a link and set in a cookie exactly
//! as written.
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
use subtle::ConstantTimeEq;

use crate::context::{AccessContext, Grant};
use crate::origin::is_webview_origin;
use crate::permissions::{RouteRule, normalize_path};
use crate::response::{json_response, refuse};
use crate::token::Token;

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

/// Whether `name` is some server's share cookie (`web_access_<port>`). For an
/// app that forwards requests and must not relay these credentials.
pub fn is_cookie_name(name: &str) -> bool {
    name.strip_prefix(COOKIE_PREFIX)
        .is_some_and(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

/// The port of a normalised `host:port` authority.
fn authority_port(authority: &str) -> Option<u16> {
    authority.rsplit_once(':')?.1.parse().ok()
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

/// One accepted token.
#[derive(Debug, Clone)]
struct Entry {
    token: Token,
    grant: Grant,
    /// Who it was issued to; for audit once tokens are per device.
    #[allow(dead_code)]
    label: Option<String>,
}

/// Why [`Tokens::with`] or [`Tokens::with_label`] refused a token. It never
/// holds a token, only grants.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[non_exhaustive]
pub enum TokensError {
    /// The added token is already in the set with a different grant. The
    /// guard gives a token its highest grant, so the lower one would grant
    /// the higher. The same token with the same grant is ignored.
    #[error(
        "the same token was added as {existing:?} and as {added:?}; use a different token for each grant"
    )]
    Duplicate {
        /// The grant of the token already in the set.
        existing: Grant,
        /// The grant it was added with again.
        added: Grant,
    },
}

/// The accepted tokens, each with the grant it confers. They are fixed for the
/// life of a [`GuardState`]: rotating a token means building a new state.
///
/// Only a [`Token`] can join a set, and no token is in it with two grants
/// (see [`TokensError::Duplicate`]).
#[derive(Debug, Clone, Default)]
pub struct Tokens(Vec<Entry>);

impl Tokens {
    /// No tokens.
    pub fn none() -> Self {
        Self::default()
    }

    /// One [`Grant::Full`] token, or none for `None`.
    pub fn full_only(token: impl Into<Option<Token>>) -> Self {
        match token.into() {
            Some(token) => Self(vec![Entry {
                token,
                grant: Grant::Full,
                label: None,
            }]),
            None => Self::none(),
        }
    }

    /// Add `token` with `grant`. A token already in the set with the same
    /// grant is ignored.
    ///
    /// # Errors
    ///
    /// [`TokensError::Duplicate`] when `token` is already in the set with a
    /// different grant.
    pub fn with(self, token: Token, grant: Grant) -> Result<Self, TokensError> {
        self.push(token, grant, None)
    }

    /// [`Self::with`], naming who the token was issued to.
    ///
    /// **Experimental.** The label is kept but not read yet; it is meant for
    /// per-device tokens, and its use may change in a patch release.
    ///
    /// # Errors
    ///
    /// As [`Self::with`].
    pub fn with_label(
        self,
        token: Token,
        grant: Grant,
        label: impl Into<String>,
    ) -> Result<Self, TokensError> {
        self.push(token, grant, Some(label.into()))
    }

    fn push(
        mut self,
        token: Token,
        grant: Grant,
        label: Option<String>,
    ) -> Result<Self, TokensError> {
        if let Some(e) = self.0.iter().find(|e| e.token == token) {
            return if e.grant == grant {
                Ok(self)
            } else {
                Err(TokensError::Duplicate {
                    existing: e.grant,
                    added: grant,
                })
            };
        }
        self.0.push(Entry {
            token,
            grant,
            label,
        });
        Ok(self)
    }

    /// True when no token was added.
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// The token to put in a share link: the first full one, else the first.
    /// An admin token is never picked over a full one, so the default link
    /// never carries a shell credential.
    pub fn share_token(&self) -> Option<&Token> {
        let pick = self.0.iter().find(|e| e.grant == Grant::Full);
        pick.or(self.0.first()).map(|e| &e.token)
    }

    /// The grant of the entry equal to `presented`; the highest if several
    /// are. Compares against every entry, so timing does not reveal which one
    /// matched. `ct_eq` returns early on a length mismatch, so a token's
    /// length can leak.
    fn grant_for(&self, presented: &str) -> Option<Grant> {
        let mut found: Option<Grant> = None;
        for entry in &self.0 {
            if bool::from(presented.as_bytes().ct_eq(entry.token.as_str().as_bytes())) {
                found = found.max(Some(entry.grant));
            }
        }
        found
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
    live_hosts: Option<LiveHosts>,
    policy: GuardPolicy,
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
            live_hosts: None,
            policy,
            on_denied: None,
            denials: DenialBudget::new(Instant::now()),
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
        // encoded character (`/api/notes/my%20note`) still matches.
        // A protocol upgrade (a WebSocket) can carry writes, so for a `read`
        // grant it counts as non-safe like a mutating method.
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

/// Every cookie named `name`: another app on the same host can set a stale
/// one (cookies are not port-isolated), so the first must not shadow a valid
/// one.
fn cookie_values<'a>(req: &'a Request<Body>, name: &'a str) -> impl Iterator<Item = &'a str> + 'a {
    req.headers()
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .filter_map(move |(k, v)| (k == name).then_some(v))
}

/// The value of `?token=`, as written, and the query with that
/// parameter removed; `None` when the query has no `token` parameter.
pub(crate) fn split_token_param(query: &str) -> Option<(&str, String)> {
    let is_token = |p: &&str| *p == "token" || p.starts_with("token=");
    // The last `token` wins, as browsers and form parsers read a repeated key.
    let raw = query.split('&').rfind(is_token)?;
    let token = raw.strip_prefix("token=").unwrap_or("");
    let rest: Vec<&str> = query
        .split('&')
        .filter(|p| !p.is_empty() && !is_token(p))
        .collect();
    Some((token, rest.join("&")))
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

async fn check(state: &GuardState, req: Request<Body>, next: Next) -> Response {
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
    let allowed = authority.as_ref().filter(|h| state.host_allowed(h));
    // The allowed port the browser reached us on names the cookie.
    let Some(cookie) = allowed.and_then(|h| authority_port(h)).map(cookie_name) else {
        state.deny(parts, DenialReason::BadHost);
        return refuse(StatusCode::MISDIRECTED_REQUEST, "host not allowed");
    };

    // 2. Origin on mutating methods and protocol upgrades (a WebSocket
    // handshake is a GET, and the same-origin policy does not cover it).
    let upgrade = req.headers().contains_key(header::UPGRADE);
    if (is_mutating(&method) || upgrade)
        && let Some(origin) = req.headers().get(header::ORIGIN)
    {
        let origin = origin.to_str().ok();
        let ok = origin
            .and_then(origin_authority)
            .is_some_and(|o| state.host_allowed(&o))
            || (upgrade && origin.is_some_and(is_webview_origin));
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
        if state.tokens.grant_for(tok).is_some() {
            // Exactly one leading slash: browsers read `//host` as a
            // protocol-relative, off-origin redirect.
            let safe = format!("/{}", path.trim_start_matches('/'));
            let location = if rest.is_empty() {
                safe
            } else {
                format!("{safe}?{rest}")
            };
            // `tok` equals a `Token`, so it holds nothing that breaks the header.
            let set_cookie = format!("{cookie}={tok}; HttpOnly; SameSite=Strict; Path=/");
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
    for t in cookie_values(&req, &cookie) {
        presented_wrong = true;
        grant = grant.max(state.tokens.grant_for(t));
    }
    if let Some(grant) = grant {
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

    const TOKEN: &str = "s3cret-token-0123456789abcdefghij";
    const HOST: &str = "192.168.1.5:3000";

    fn tok(text: &str) -> Token {
        Token::parse(text).unwrap()
    }

    fn app(policy: GuardPolicy, on_denied: Option<Arc<AtomicUsize>>) -> Router {
        let mut state = GuardState::new(
            Tokens::full_only(tok(TOKEN)),
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
        let c = [(
            "cookie",
            "a=b; web_access_3000=s3cret-token-0123456789abcdefghij; c=d",
        )];
        let res = status(app(GuardPolicy::default(), None), req("GET", "/", LAN, &c)).await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn token_query_sets_cookie_and_redirects_without_the_token() {
        let uri = "/?a=1&token=s3cret-token-0123456789abcdefghij&b=2";
        let res = status(app(GuardPolicy::default(), None), req("GET", uri, LAN, &[])).await;
        let loc = bounce_target(&res);
        assert_eq!(loc, "/?a=1&b=2");
        assert_eq!(res.headers()[header::CACHE_CONTROL], "no-store");
        assert!(!res.headers().contains_key(header::LOCATION));
        assert!(!loc.contains("token"));
        let cookie = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(cookie.starts_with("web_access_3000=s3cret-token-0123456789abcdefghij"));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Strict"));
        assert_eq!(res.headers()[header::REFERRER_POLICY], "no-referrer");
    }

    #[tokio::test]
    async fn token_query_with_no_other_params_redirects_to_the_bare_path() {
        let res = status(
            app(GuardPolicy::default(), None),
            req("GET", "/?token=s3cret-token-0123456789abcdefghij", LAN, &[]),
        )
        .await;
        assert_eq!(bounce_target(&res), "/");
    }

    #[tokio::test]
    async fn token_redirect_never_leaves_the_origin() {
        let res = status(
            app(GuardPolicy::default(), None),
            req(
                "GET",
                "//evil.example/?token=s3cret-token-0123456789abcdefghij",
                LAN,
                &[],
            ),
        )
        .await;
        assert_eq!(bounce_target(&res), "/evil.example/");
    }

    #[tokio::test]
    async fn backslash_path_is_refused_before_the_token_redirect() {
        let res = status(
            app(GuardPolicy::default(), None),
            req(
                "GET",
                "/\\evil.example/?token=s3cret-token-0123456789abcdefghij",
                LAN,
                &[],
            ),
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
            "web_access_3000=stale; web_access_3000=s3cret-token-0123456789abcdefghij",
        )];
        let res = status(app(GuardPolicy::default(), None), req("GET", "/", LAN, &c)).await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn empty_token_behaves_as_no_token() {
        let state = GuardState::new(
            Tokens::full_only(None),
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

    const READ_TOKEN: &str = "view-only-token-0123456789abcdefg";

    /// Echoes the grant and context the handler sees; POST /x is a mutation,
    /// POST /q a read-only query.
    fn two_token_app(policy: GuardPolicy) -> Router {
        let state = GuardState::new(
            Tokens::none()
                .with(tok(READ_TOKEN), Grant::Read)
                .and_then(|t| t.with(tok(TOKEN), Grant::Full))
                .unwrap(),
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
        let tokens = |full: Token, read: Token| {
            Tokens::none()
                .with(read, Grant::Read)
                .and_then(|t| t.with(full, Grant::Full))
                .unwrap()
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
            token::load_or_mint(dir.path()).unwrap(),
            token::load_or_mint_read(dir.path()).unwrap(),
        ));
        assert_eq!(
            get_with(app.clone(), full.as_str()).await.status(),
            StatusCode::OK
        );
        assert_eq!(
            get_with(app.clone(), rotated.as_str()).await.status(),
            StatusCode::OK
        );
        assert_eq!(
            get_with(app, read.as_str()).await.status(),
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
        assert!(is_cookie_name("web_access_3000"));
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

    const ADMIN_TOKEN: &str = "admin-token-0123456789abcdefghijk";

    fn admin_app(admin_on: bool) -> Router {
        let mut tokens = Tokens::full_only(tok(TOKEN));
        if admin_on {
            tokens = tokens.with(tok(ADMIN_TOKEN), Grant::Admin).unwrap();
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
        let c = format!("web_access_3000={ADMIN_TOKEN}");
        let both = [(TOKEN_HEADER, TOKEN), ("cookie", c.as_str())];
        let res = status(admin_app(true), req("GET", "/", LAN, &both)).await;
        assert_eq!(body(res).await, "Admin");
    }

    #[test]
    fn the_default_share_token_is_never_the_admin_one() {
        let t = Tokens::none()
            .with(tok(ADMIN_TOKEN), Grant::Admin)
            .and_then(|t| t.with(tok(TOKEN), Grant::Full))
            .unwrap();
        assert_eq!(t.share_token().map(Token::as_str), Some(TOKEN));
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
            req(
                "POST",
                "/x?token=s3cret-token-0123456789abcdefghij",
                LAN,
                &[],
            ),
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
            req(
                "GET",
                "/a%22b?x=%3C&token=s3cret-token-0123456789abcdefghij",
                LAN,
                &[],
            ),
        )
        .await;
        assert_eq!(bounce_target(&res), "/a%22b?x=%3C");
        assert_eq!(res.headers()[header::CACHE_CONTROL], "no-store");
        let html = body(res).await;
        assert!(html.contains(r#"content="0;url=/a%22b?x=%3C""#), "{html}");
        assert!(!html.contains("token"), "{html}");
    }

    /// The share link carries the token as written, and the cookie it sets
    /// holds the same text and admits the next request.
    #[tokio::test]
    async fn a_share_link_sets_the_token_as_written_and_the_cookie_admits() {
        let token = Token::mint().unwrap();
        let state = GuardState::new(
            Tokens::full_only(token.clone()),
            [HOST.to_owned()],
            GuardPolicy::default(),
        );
        let app = Router::new()
            .route("/", get(|| async { "ok" }))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard));
        let link = crate::share_url("192.168.1.5:3000".parse().unwrap(), &token);
        let path = link.strip_prefix("http://192.168.1.5:3000").unwrap();
        assert_eq!(path, format!("/?token={token}"));
        let res = status(app.clone(), req("GET", path, LAN, &[])).await;
        assert_eq!(bounce_target(&res), "/");
        let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
        let pair = set.split(';').next().unwrap();
        assert_eq!(pair, format!("web_access_3000={token}"));
        let res = status(app, req("GET", "/", LAN, &[("cookie", pair)])).await;
        assert_eq!(res.status(), StatusCode::OK);
    }

    /// The guard gives a token its highest grant, so the same token added as
    /// Read and as Admin would make the Read link an Admin credential. That is
    /// refused in both orders; the same token with the same grant is ignored.
    #[test]
    fn the_same_token_with_two_grants_is_refused() {
        let x = Token::mint().unwrap();
        for (g1, g2) in [(Grant::Read, Grant::Admin), (Grant::Admin, Grant::Read)] {
            let err = Tokens::none()
                .with(x.clone(), g1)
                .and_then(|t| t.with_label(x.clone(), g2, "phone"))
                .unwrap_err();
            assert_eq!(
                err,
                TokensError::Duplicate {
                    existing: g1,
                    added: g2
                }
            );
            assert!(!err.to_string().contains(x.as_str()), "{err}");
        }
        let set = Tokens::none()
            .with(x.clone(), Grant::Read)
            .and_then(|t| t.with(x.clone(), Grant::Read))
            .unwrap();
        assert_eq!(set.0.len(), 1);
        assert_eq!(set.grant_for(x.as_str()), Some(Grant::Read));
    }

    /// A guard on `HOST` with a wildcard bind on :3000 whose interface list
    /// holds 10.0.0.7; `calls` counts how often the list is read.
    fn live_host_app(calls: Arc<AtomicUsize>) -> Router {
        let state = GuardState::new(
            Tokens::full_only(tok(TOKEN)),
            [HOST.to_owned()],
            GuardPolicy::default(),
        )
        .with_live_hosts(
            vec!["0.0.0.0:3000".parse().unwrap()],
            Arc::new(move || {
                calls.fetch_add(1, Ordering::SeqCst);
                vec!["10.0.0.7".parse().unwrap()]
            }),
        );
        Router::new()
            .route("/", get(|| async { "ok" }).post(|| async { "posted" }))
            .layer(axum::middleware::from_fn_with_state(Arc::new(state), guard))
    }

    fn req_on(method: &str, uri: &str, host: &str, extra: &[(&str, &str)]) -> Request<Body> {
        let mut r = req(method, uri, LAN, extra);
        r.headers_mut()
            .insert(header::HOST, HeaderValue::from_str(host).unwrap());
        r
    }

    #[tokio::test]
    async fn a_live_interface_host_is_served_on_the_bound_port_only() {
        const LIVE: &str = "10.0.0.7:3000";
        let calls = Arc::new(AtomicUsize::new(0));
        let app = || live_host_app(calls.clone());
        let h = [(TOKEN_HEADER, TOKEN)];
        // An allowlisted Host never reads the interface list.
        let res = status(app(), req_on("GET", "/", HOST, &h)).await;
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        let res = status(app(), req_on("GET", "/", LIVE, &h)).await;
        assert_eq!(res.status(), StatusCode::OK);
        // Its share link sets this port's cookie.
        let res = status(
            app(),
            req_on(
                "GET",
                "/?token=s3cret-token-0123456789abcdefghij",
                LIVE,
                &[],
            ),
        )
        .await;
        let set = res.headers()[header::SET_COOKIE].to_str().unwrap();
        assert!(set.starts_with("web_access_3000="), "{set}");
        // Its own Origin passes a mutation; another address's does not.
        let own = [(TOKEN_HEADER, TOKEN), ("origin", "http://10.0.0.7:3000")];
        let res = status(app(), req_on("POST", "/", LIVE, &own)).await;
        assert_eq!(res.status(), StatusCode::OK);
        let foreign = [(TOKEN_HEADER, TOKEN), ("origin", "http://10.0.0.8:3000")];
        let res = status(app(), req_on("POST", "/", LIVE, &foreign)).await;
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        // Another port, an address not on an interface, or a name is 421.
        for host in ["10.0.0.7:3001", "10.0.0.8:3000", "evil.example:3000"] {
            let res = status(app(), req_on("GET", "/", host, &h)).await;
            assert_eq!(res.status(), StatusCode::MISDIRECTED_REQUEST, "{host}");
        }
    }

    #[tokio::test]
    async fn a_wildcard_read_safe_rule_matches_an_encoded_name_below_it() {
        let state = GuardState::new(
            Tokens::none().with(tok(READ_TOKEN), Grant::Read).unwrap(),
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
        let tokens = Tokens::full_only(tok(TOKEN))
            .with(tok(READ_TOKEN), Grant::Read)
            .unwrap();
        let shown = format!("{tokens:?}");
        assert!(
            !shown.contains(TOKEN) && !shown.contains(READ_TOKEN),
            "{shown}"
        );
        assert!(shown.contains("Full"), "{shown}");
    }
}
