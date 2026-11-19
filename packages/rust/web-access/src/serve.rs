//! Bind a router to the configured addresses behind the guard, and hand back
//! a handle that can stop it.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use axum::Router;
use axum::extract::ConnectInfo;
use tokio::net::TcpListener;
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::config::{Listen, WebAccessConfig};
use crate::conn::{Connections, CutListener, Peer};
use crate::guard::{
    GuardPolicy, GuardState, HostIps, OnDenied, Tokens, guard, normalize_public_host,
};
use crate::interfaces::interfaces;
use crate::permissions::RouteRule;
use crate::token::Token;

/// How long `stop` waits for in-flight requests before it closes their
/// connections. A stream may never end on its own.
const GRACE: Duration = Duration::from_secs(5);

/// How long `stop` waits for the cut connections to wind down before it
/// aborts the server tasks.
const CUT_GRACE: Duration = Duration::from_secs(1);

/// How long the guard reuses the interface list it reads for a `Host` that is
/// not on the allowlist. The `Host` check runs before any token check, so the
/// cache limits what a peer sending unknown `Host` values can cost. An address
/// the machine gains later is admitted within this time.
const HOST_IPS_TTL: Duration = Duration::from_secs(2);

/// Why `serve` refused to start.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum ServeError {
    /// The config's `enabled` is false.
    #[error("web access is not enabled in the config")]
    Disabled,
    /// The config listens beyond loopback and no token was given.
    #[error("listening beyond loopback requires a token")]
    TokenRequired,
    /// `Listen::Interfaces` names no address.
    #[error("the listen setting names no address")]
    NoAddress,
    /// A [`ServeOptions::public_hosts`] entry is not a name
    /// [`normalize_public_host`] keeps.
    #[error("not a public host name: {0:?}")]
    BadPublicHost(String),
    /// [`ServeOptions::admin_public_only`] is set with no public host, so the
    /// admin token could never be used.
    #[error("admin_public_only needs at least one public host")]
    AdminPublicOnlyWithoutPublicHosts,
    /// An address could not be bound.
    #[error("could not bind {addr}: {source}")]
    Bind {
        /// The address.
        addr: SocketAddr,
        /// The operating system's error.
        source: std::io::Error,
    },
}

/// `http://<ip>:<port>/?token=<token>`. An IPv6 address is bracketed. A
/// [`Token`] needs no escaping, so the link carries it as written.
pub fn share_url(addr: SocketAddr, token: &Token) -> String {
    format!("http://{addr}/?token={token}")
}

/// A running server. Dropping it without `stop` stops accepting new
/// connections but leaves open ones running.
pub struct ServerHandle {
    addrs: Vec<SocketAddr>,
    /// The host's interface IPs, for the share links of a wildcard bind.
    host_ips: HostIps,
    /// [`ServeOptions::public_hosts`] as [`normalize_public_host`] keeps them.
    public_names: Vec<String>,
    state: Arc<GuardState>,
    conns: Arc<Connections>,
    stop_tx: watch::Sender<bool>,
    tasks: Vec<JoinHandle<()>>,
}

impl ServerHandle {
    /// The addresses actually bound (port 0 resolved).
    pub fn addrs(&self) -> &[SocketAddr] {
        &self.addrs
    }

    /// Where another device can open the app: one URL per reachable address,
    /// carrying the current tokens' [`Tokens::share_token`] when there is one.
    /// A wildcard bind expands to the host's non-loopback interface addresses
    /// of its family, as the machine has them now (see
    /// [`Listen::AllInterfaces`]). Use [`Self::share_urls_for`] for a particular grant's link.
    pub fn share_urls(&self) -> Vec<String> {
        match self.state.share_token() {
            Some(t) => self.share_urls_for(&t),
            None => self
                .share_addrs()
                .iter()
                .map(|a| format!("http://{a}/"))
                .collect(),
        }
    }

    /// The addresses a peer can open: each bound address, a wildcard one
    /// expanded to the host's non-loopback addresses of its family.
    fn share_addrs(&self) -> Vec<SocketAddr> {
        let wildcard = self.addrs.iter().any(|a| a.ip().is_unspecified());
        let ips = if wildcard {
            (self.host_ips)()
        } else {
            Vec::new()
        };
        reached(&self.addrs, &ips, false)
    }

    /// Accept `tokens` from now on, in place of the ones the server holds, and
    /// close at once every connection a token no longer held was admitted
    /// with, streams and upgraded WebSockets included. Connections admitted
    /// with a token that stays, with the same grant, stay open, and so do
    /// connections let in without a token. The server keeps running on the
    /// same addresses.
    ///
    /// Under the default policy, a loopback-only server is open to loopback
    /// exactly while it holds no token. A server listening beyond loopback,
    /// or one given an explicit [`ServeOptions::policy`], keeps its policy: if
    /// it is handed [`Tokens::none`], it refuses every request that needs a
    /// token.
    pub fn replace_tokens(&self, tokens: Tokens) {
        self.state.replace_tokens(tokens);
    }

    /// [`Self::share_urls`] carrying `token`, e.g. the read-only one.
    pub fn share_urls_for(&self, token: &Token) -> Vec<String> {
        self.share_addrs()
            .iter()
            .map(|a| share_url(*a, token))
            .collect()
    }

    /// `https://<name>/?token=<token>` for each [`ServeOptions::public_hosts`]
    /// name, as the browser opens it through the TLS proxy.
    pub fn public_share_urls_for(&self, token: &Token) -> Vec<String> {
        self.public_names
            .iter()
            .map(|n| format!("https://{n}/?token={token}"))
            .collect()
    }

    /// Close every connection open now or accepted later, without waiting
    /// out the grace period. The tokens are left alone, so a guard that opens
    /// loopback while tokenless is not opened on the way down.
    pub(crate) fn cut_all(&self) {
        self.conns.cut_all();
    }

    /// Stop accepting new connections and let in-flight requests finish, up
    /// to a grace period. Then every connection still open, such as a stream
    /// or an upgraded WebSocket, fails all further reads and writes. The
    /// ports are released. A stream is closed before `stop` returns. An
    /// upgraded connection belongs to its handler. It closes once the handler
    /// sees the error, and a handler waiting on it is woken to see it. To
    /// close the connections of withdrawn tokens without the grace period,
    /// [`Self::replace_tokens`] first.
    pub async fn stop(mut self) {
        let _ = self.stop_tx.send(true);
        // One grace period for all listeners, not one each. The same goes
        // for the cut below.
        let deadline = tokio::time::Instant::now() + GRACE;
        for task in &mut self.tasks {
            let _ = tokio::time::timeout_at(deadline, task).await;
        }
        self.conns.cut_all();
        let cut_deadline = tokio::time::Instant::now() + CUT_GRACE;
        for mut task in self.tasks {
            if !task.is_finished()
                && tokio::time::timeout_at(cut_deadline, &mut task)
                    .await
                    .is_err()
            {
                task.abort();
                let _ = task.await;
            }
        }
    }
}

fn listen_ips(listen: &Listen) -> Vec<IpAddr> {
    match listen {
        Listen::Loopback => vec![IpAddr::V4(Ipv4Addr::LOCALHOST)],
        Listen::AllInterfaces => vec![IpAddr::V4(Ipv4Addr::UNSPECIFIED)],
        Listen::Interfaces(ips) => ips.clone(),
    }
}

/// What `addrs` reach: each bound address, and for a wildcard bind each
/// address in `ips` of its family on its port, loopback ones only with
/// `loopback`. Sorted, without repeats.
fn reached(addrs: &[SocketAddr], ips: &[IpAddr], loopback: bool) -> Vec<SocketAddr> {
    let mut out: Vec<SocketAddr> = Vec::new();
    for a in addrs {
        if a.ip().is_unspecified() {
            let family = ips
                .iter()
                .filter(|ip| (loopback || !ip.is_loopback()) && ip.is_ipv4() == a.is_ipv4());
            out.extend(family.map(|ip| SocketAddr::new(*ip, a.port())));
        } else {
            out.push(*a);
        }
    }
    out.sort();
    out.dedup();
    out
}

fn authority(ip: IpAddr, port: u16) -> String {
    SocketAddr::new(ip, port).to_string()
}

/// [`serve_opts`] under the default options: a loopback peer is open only when
/// there are no tokens.
///
/// # Errors
///
/// As [`serve_opts`].
pub async fn serve(
    router: Router,
    cfg: &WebAccessConfig,
    tokens: Tokens,
) -> Result<ServerHandle, ServeError> {
    serve_opts(router, cfg, tokens, ServeOptions::default()).await
}

/// Guard inputs beyond the tokens, for [`serve_opts`].
#[derive(Clone, Default)]
pub struct ServeOptions {
    /// `None` is [`serve`]'s default: on a loopback-only listen, loopback is
    /// open while the server holds no token, following
    /// [`ServerHandle::replace_tokens`]; on any other listen, never.
    pub policy: Option<GuardPolicy>,
    /// See [`GuardState::with_read_safe`].
    pub read_safe: Vec<RouteRule<()>>,
    /// See [`GuardState::with_on_denied`].
    pub on_denied: Option<Arc<OnDenied>>,
    /// See [`GuardState::with_public_hosts`]. `serve` refuses to start on a
    /// name [`normalize_public_host`] drops.
    pub public_hosts: Vec<String>,
    /// See [`GuardState::with_admin_over_public_only`]. Needs at least one
    /// [`Self::public_hosts`] entry.
    pub admin_public_only: bool,
    /// See [`GuardState::with_cookie_max_age`]. `None` keeps a session cookie.
    pub cookie_max_age: Option<Duration>,
}

/// Bind every listen address and serve `router` behind [`guard`].
///
/// A config that listens beyond loopback with no tokens is refused.
///
/// # Errors
///
/// [`ServeError::Disabled`] for a disabled config, [`ServeError::TokenRequired`] for a config
/// that listens beyond loopback with no tokens, and [`ServeError::Bind`] when an address cannot
/// be bound.
pub async fn serve_opts(
    router: Router,
    cfg: &WebAccessConfig,
    tokens: Tokens,
    opts: ServeOptions,
) -> Result<ServerHandle, ServeError> {
    let host_ips: HostIps = Arc::new(|| interfaces().into_iter().map(|i| i.ip).collect());
    serve_with_ips(
        router,
        cfg,
        tokens,
        opts,
        cached_ips(host_ips, HOST_IPS_TTL),
    )
    .await
}

/// `ips`, called at most once per `ttl`. Callers in between get the last list.
fn cached_ips(ips: HostIps, ttl: Duration) -> HostIps {
    let cache = IpCache {
        ips,
        ttl,
        last: Mutex::new(None),
    };
    Arc::new(move || cache.get(Instant::now()))
}

struct IpCache {
    ips: HostIps,
    ttl: Duration,
    last: Mutex<Option<(Instant, Vec<IpAddr>)>>,
}

impl IpCache {
    /// The lock is held while the list is read, so callers that miss the
    /// cache at the same time read it only once.
    fn get(&self, now: Instant) -> Vec<IpAddr> {
        let mut last = self.last.lock().unwrap_or_else(PoisonError::into_inner);
        match &*last {
            Some((at, list)) if now.saturating_duration_since(*at) < self.ttl => list.clone(),
            _ => {
                let list = (self.ips)();
                *last = Some((now, list.clone()));
                list
            }
        }
    }
}

/// Split `serve`'s connection info into the `ConnectInfo<SocketAddr>` handlers
/// expect and the connection the guard tags. Runs outside the guard.
async fn split_peer(
    mut req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    if let Some(ConnectInfo(peer)) = req.extensions_mut().remove::<ConnectInfo<Peer>>() {
        req.extensions_mut().insert(ConnectInfo(peer.addr));
        req.extensions_mut().insert(peer.conn);
    }
    next.run(req).await
}

/// [`serve_opts`] with the interface list as a parameter, so a test can change it.
async fn serve_with_ips(
    router: Router,
    cfg: &WebAccessConfig,
    tokens: Tokens,
    opts: ServeOptions,
    host_ips: HostIps,
) -> Result<ServerHandle, ServeError> {
    if !cfg.enabled {
        return Err(ServeError::Disabled);
    }
    if tokens.is_empty() && !cfg.listen.is_loopback_only() {
        return Err(ServeError::TokenRequired);
    }
    if matches!(&cfg.listen, Listen::Interfaces(ips) if ips.is_empty()) {
        return Err(ServeError::NoAddress);
    }
    let mut public_names: Vec<String> = Vec::new();
    for raw in &opts.public_hosts {
        let n = normalize_public_host(raw).ok_or_else(|| ServeError::BadPublicHost(raw.clone()))?;
        if !public_names.contains(&n) {
            public_names.push(n);
        }
    }
    if opts.admin_public_only && public_names.is_empty() {
        return Err(ServeError::AdminPublicOnlyWithoutPublicHosts);
    }

    let loopback_follows_tokens = opts.policy.is_none() && cfg.listen.is_loopback_only();
    let policy = opts.policy.unwrap_or_default();

    let mut listeners = Vec::new();
    for ip in listen_ips(&cfg.listen) {
        let addr = SocketAddr::new(ip, cfg.port);
        let l = TcpListener::bind(addr)
            .await
            .map_err(|source| ServeError::Bind { addr, source })?;
        listeners.push(l);
    }
    let addrs: Vec<SocketAddr> = listeners
        .iter()
        .filter_map(|l| l.local_addr().ok())
        .collect();

    let mut hosts = Vec::new();
    for a in &addrs {
        let port = a.port();
        hosts.push(format!("localhost:{port}"));
        hosts.push(authority(IpAddr::V4(Ipv4Addr::LOCALHOST), port));
        hosts.push(authority(IpAddr::V6(std::net::Ipv6Addr::LOCALHOST), port));
    }
    hosts.extend(
        reached(&addrs, &host_ips(), true)
            .iter()
            .map(SocketAddr::to_string),
    );

    let mut state = GuardState::new(tokens, hosts, policy)
        .with_read_safe(opts.read_safe)
        .with_public_hosts(&public_names);
    if loopback_follows_tokens {
        state = state.open_while_tokenless();
    }
    if opts.admin_public_only {
        state = state.with_admin_over_public_only();
    }
    if let Some(age) = opts.cookie_max_age {
        state = state.with_cookie_max_age(age);
    }
    let wildcards: Vec<SocketAddr> = addrs
        .iter()
        .copied()
        .filter(|a| a.ip().is_unspecified())
        .collect();
    if !wildcards.is_empty() {
        state = state.with_live_hosts(wildcards, host_ips.clone());
    }
    if let Some(cb) = opts.on_denied {
        state = state.with_shared_on_denied(cb);
    }
    let conns = Arc::new(Connections::default());
    let state = Arc::new(state.with_connections(conns.clone()));
    let app = router
        .layer(axum::middleware::from_fn_with_state(state.clone(), guard))
        .layer(axum::middleware::from_fn(split_peer));

    let (stop_tx, stop_rx) = watch::channel(false);
    let tasks = listeners
        .into_iter()
        .map(|listener| {
            let app = app.clone();
            let mut rx = stop_rx.clone();
            let listener = CutListener {
                inner: listener,
                conns: conns.clone(),
            };
            tokio::spawn(async move {
                let shutdown = async move {
                    let _ = rx.wait_for(|stopped| *stopped).await;
                };
                let svc = app.into_make_service_with_connect_info::<Peer>();
                let _ = axum::serve(listener, svc)
                    .with_graceful_shutdown(shutdown)
                    .await;
            })
        })
        .collect();

    Ok(ServerHandle {
        addrs,
        host_ips,
        public_names,
        state,
        conns,
        stop_tx,
        tasks,
    })
}

#[cfg(test)]
mod tests {
    use axum::routing::get;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    use super::*;
    use crate::context::Grant;
    use crate::guard::{ConnectionCut, Denial};
    use crate::test_support::{
        STAYS_OPEN, closes_within, echoes, long_lived_router, open_stream, open_upgrade, raw_get,
        raw_request, switching_protocols,
    };

    const TOK: &str = "tok-0123456789abcdefghijklmnopqrstu";

    fn tok(text: &str) -> Token {
        Token::parse(text).unwrap()
    }

    fn cfg(listen: Listen) -> WebAccessConfig {
        WebAccessConfig {
            enabled: true,
            listen,
            port: 0,
            admin: false,
        }
    }

    fn router() -> Router {
        Router::new().route("/", get(|| async { "hello" }))
    }

    #[tokio::test]
    async fn all_interfaces_without_a_token_is_refused() {
        let err = serve(router(), &cfg(Listen::AllInterfaces), Tokens::none())
            .await
            .err()
            .unwrap();
        assert!(matches!(err, ServeError::TokenRequired));
        let ips = Listen::Interfaces(vec!["192.168.1.5".parse().unwrap()]);
        assert!(matches!(
            serve(router(), &cfg(ips), Tokens::full_only(None))
                .await
                .err(),
            Some(ServeError::TokenRequired)
        ));
    }

    #[tokio::test]
    async fn an_empty_interface_list_is_refused() {
        let cfg = WebAccessConfig {
            enabled: true,
            listen: Listen::Interfaces(Vec::new()),
            port: 0,
            admin: false,
        };
        let r = serve(Router::new(), &cfg, Tokens::none()).await;
        assert!(matches!(r, Err(ServeError::NoAddress)));
    }

    #[tokio::test]
    async fn a_disabled_config_is_refused() {
        let off = WebAccessConfig::default();
        assert!(matches!(
            serve(router(), &off, Tokens::none()).await.err(),
            Some(ServeError::Disabled)
        ));
    }

    #[tokio::test]
    async fn serves_on_loopback_and_stop_releases_the_port() {
        let handle = serve(router(), &cfg(Listen::Loopback), Tokens::none())
            .await
            .unwrap();
        let addr = handle.addrs()[0];
        assert_ne!(addr.port(), 0);
        assert_eq!(handle.share_urls(), [format!("http://{addr}/")]);

        let res = raw_get(addr, &addr.to_string(), "").await;
        assert!(res.starts_with("HTTP/1.1 200"), "{res}");
        assert!(res.ends_with("hello"));
        // A foreign Host is refused even from loopback.
        assert!(
            raw_get(addr, "evil.example", "")
                .await
                .starts_with("HTTP/1.1 421")
        );

        handle.stop().await;
        let rebound = TcpListener::bind(addr).await;
        assert!(
            rebound.is_ok(),
            "port {} still held after stop",
            addr.port()
        );
    }

    #[tokio::test]
    async fn stop_cuts_a_stream_that_never_ends() {
        let handle = serve(
            long_lived_router(),
            &cfg(Listen::Loopback),
            Tokens::full_only(tok(TOK)),
        )
        .await
        .unwrap();
        let mut s = open_stream(handle.addrs()[0], TOK).await;
        handle.stop().await;
        // Once stop returns the connection is closed: EOF or a reset.
        assert!(
            closes_within(&mut s, Duration::from_secs(2)).await,
            "the stream outlived stop"
        );
    }

    #[tokio::test]
    async fn stop_cuts_an_upgraded_connection() {
        let handle = serve(
            long_lived_router(),
            &cfg(Listen::Loopback),
            Tokens::full_only(tok(TOK)),
        )
        .await
        .unwrap();
        let mut s = open_upgrade(handle.addrs()[0], "/up", TOK).await;
        assert!(echoes(&mut s).await);
        // The handler is parked on a read; the cut must wake it.
        handle.stop().await;
        assert!(
            closes_within(&mut s, Duration::from_secs(2)).await,
            "the upgraded connection outlived stop"
        );
    }

    const ADMIN: &str = "adm-0123456789abcdefghijklmnopqrstu";
    const READ: &str = "red-0123456789abcdefghijklmnopqrstu";

    fn full_and_admin() -> Tokens {
        Tokens::full_only(tok(TOK))
            .with(tok(ADMIN), Grant::Admin)
            .unwrap()
    }

    /// Withdrawing the admin token closes its WebSocket at once, wakes the
    /// handler's [`ConnectionCut`], and leaves the full token's socket open.
    #[tokio::test]
    async fn replace_tokens_closes_only_a_withdrawn_tokens_connections() {
        let fired = Arc::new(tokio::sync::Notify::new());
        let notify = fired.clone();
        let watched = move |cut: ConnectionCut, mut req: axum::extract::Request| async move {
            let on = hyper::upgrade::on(&mut req);
            tokio::spawn(async move {
                // Held, as a WebSocket handler holds its socket.
                let _io = on.await.unwrap();
                cut.wait().await;
                notify.notify_one();
            });
            switching_protocols()
        };
        let app = long_lived_router().route("/watched", get(watched));
        let handle = serve(app, &cfg(Listen::Loopback), full_and_admin())
            .await
            .unwrap();
        let addr = handle.addrs()[0];
        let mut admin = open_upgrade(addr, "/up", ADMIN).await;
        let admin_watched = open_upgrade(addr, "/watched", ADMIN).await;
        let mut full = open_upgrade(addr, "/up", TOK).await;
        let mut full_stream = open_stream(addr, TOK).await;
        assert!(echoes(&mut admin).await && echoes(&mut full).await);

        handle.replace_tokens(Tokens::full_only(tok(TOK)));
        assert!(closes_within(&mut admin, Duration::from_secs(1)).await);
        tokio::time::timeout(Duration::from_secs(1), fired.notified())
            .await
            .expect("the handler's ConnectionCut did not fire");
        assert!(echoes(&mut full).await, "the full socket was closed");
        assert!(!closes_within(&mut full_stream, STAYS_OPEN).await);

        // The withdrawn token no longer opens anything; the kept one does.
        let res = raw_get(
            addr,
            &addr.to_string(),
            &format!("x-web-access-token: {ADMIN}\r\n"),
        )
        .await;
        assert!(res.starts_with("HTTP/1.1 401"), "{res}");
        let res = raw_get(
            addr,
            &addr.to_string(),
            &format!("x-web-access-token: {TOK}\r\n"),
        )
        .await;
        assert!(res.starts_with("HTTP/1.1 200"), "{res}");
        // Closed first, so stop need not wait out its grace period.
        drop((admin_watched, full, full_stream));
        handle.stop().await;
    }

    /// The same token under a different grant is a new entry: what the old
    /// grant opened is closed.
    #[tokio::test]
    async fn a_token_whose_grant_changes_counts_as_withdrawn() {
        let tokens = Tokens::full_only(tok(TOK))
            .with(tok(READ), Grant::Read)
            .unwrap();
        let handle = serve(long_lived_router(), &cfg(Listen::Loopback), tokens)
            .await
            .unwrap();
        let addr = handle.addrs()[0];
        let mut full = open_stream(addr, TOK).await;
        let mut read = open_stream(addr, READ).await;

        handle.replace_tokens(
            Tokens::full_only(tok(READ))
                .with(tok(TOK), Grant::Read)
                .unwrap(),
        );
        assert!(closes_within(&mut full, Duration::from_secs(1)).await);
        assert!(closes_within(&mut read, Duration::from_secs(1)).await);
        handle.stop().await;
    }

    #[tokio::test]
    async fn replace_tokens_leaves_a_connection_let_in_without_a_token() {
        let handle = serve(long_lived_router(), &cfg(Listen::Loopback), Tokens::none())
            .await
            .unwrap();
        let addr = handle.addrs()[0];
        let mut s = open_stream(addr, "none").await;
        assert_eq!(handle.share_urls(), [format!("http://{addr}/")]);

        handle.replace_tokens(Tokens::full_only(tok(TOK)));
        assert!(!closes_within(&mut s, STAYS_OPEN).await);
        assert_eq!(handle.share_urls(), [format!("http://{addr}/?token={TOK}")]);
        // Closed first, so stop need not wait out its grace period.
        drop(s);
        handle.stop().await;
    }

    /// Under the default policy a loopback-only server is open exactly while
    /// it holds no token.
    #[tokio::test]
    async fn the_default_loopback_opening_follows_the_tokens() {
        let handle = serve(long_lived_router(), &cfg(Listen::Loopback), Tokens::none())
            .await
            .unwrap();
        let addr = handle.addrs()[0];
        let host = addr.to_string();
        assert!(raw_get(addr, &host, "").await.starts_with("HTTP/1.1 200"));
        handle.replace_tokens(Tokens::full_only(tok(TOK)));
        assert!(raw_get(addr, &host, "").await.starts_with("HTTP/1.1 401"));
        handle.replace_tokens(Tokens::none());
        assert!(raw_get(addr, &host, "").await.starts_with("HTTP/1.1 200"));
        handle.stop().await;
    }

    /// A keep-alive connection carries the token of its latest request: one
    /// that served a read request, then a full stream, survives rotating the
    /// read token.
    #[tokio::test]
    async fn a_connection_is_cut_for_the_token_of_its_latest_request() {
        let tokens = Tokens::full_only(tok(TOK))
            .with(tok(READ), Grant::Read)
            .unwrap();
        let handle = serve(long_lived_router(), &cfg(Listen::Loopback), tokens)
            .await
            .unwrap();
        let addr = handle.addrs()[0];
        let mut s = TcpStream::connect(addr).await.unwrap();
        let first = format!("GET / HTTP/1.1\r\nHost: {addr}\r\nx-web-access-token: {READ}\r\n\r\n");
        s.write_all(first.as_bytes()).await.unwrap();
        let mut buf = vec![0u8; 4096];
        let mut seen = String::new();
        while !seen.ends_with("ok") {
            let n = s.read(&mut buf).await.unwrap();
            assert_ne!(n, 0, "{seen}");
            seen.push_str(&String::from_utf8_lossy(&buf[..n]));
        }
        let second =
            format!("GET /stream HTTP/1.1\r\nHost: {addr}\r\nx-web-access-token: {TOK}\r\n\r\n");
        s.write_all(second.as_bytes()).await.unwrap();
        let n = s.read(&mut buf).await.unwrap();
        assert!(String::from_utf8_lossy(&buf[..n]).contains("HTTP/1.1 200"));

        handle.replace_tokens(Tokens::full_only(tok(TOK)));
        assert!(!closes_within(&mut s, STAYS_OPEN).await);
        // Closed first, so stop need not wait out its grace period.
        drop(s);
        handle.stop().await;
    }

    /// An admin cookie lowered to `full` off a public name does not tag the
    /// connection over a full cookie sent with it: admin off leaves it open.
    #[tokio::test]
    async fn a_lowered_admin_grant_tags_the_full_token_it_sits_beside() {
        let opts = ServeOptions {
            public_hosts: vec!["app.example.com".to_owned()],
            admin_public_only: true,
            ..ServeOptions::default()
        };
        let handle = serve_opts(
            long_lived_router(),
            &cfg(Listen::Loopback),
            full_and_admin(),
            opts,
        )
        .await
        .unwrap();
        let addr = handle.addrs()[0];
        let port = addr.port();
        let mut s = TcpStream::connect(addr).await.unwrap();
        let req = format!(
            "GET /stream HTTP/1.1\r\nHost: {addr}\r\n\
             Cookie: web_access_admin_{port}={ADMIN}; web_access_{port}={TOK}\r\n\r\n"
        );
        s.write_all(req.as_bytes()).await.unwrap();
        let mut buf = vec![0u8; 4096];
        let n = s.read(&mut buf).await.unwrap();
        assert!(String::from_utf8_lossy(&buf[..n]).contains("HTTP/1.1 200"));

        handle.replace_tokens(Tokens::full_only(tok(TOK)));
        assert!(!closes_within(&mut s, STAYS_OPEN).await);
        // Closed first, so stop need not wait out its grace period.
        drop(s);
        handle.stop().await;
    }

    /// Handlers behind `serve` still read the peer as `ConnectInfo<SocketAddr>`.
    #[tokio::test]
    async fn handlers_get_the_peer_address() {
        let app = Router::new().route(
            "/",
            get(
                |axum::extract::ConnectInfo(peer): axum::extract::ConnectInfo<SocketAddr>| async move {
                    peer.ip().to_string()
                },
            ),
        );
        let handle = serve(app, &cfg(Listen::Loopback), Tokens::none())
            .await
            .unwrap();
        let addr = handle.addrs()[0];
        let res = raw_get(addr, &addr.to_string(), "").await;
        assert!(res.ends_with("127.0.0.1"), "{res}");
        handle.stop().await;
    }

    #[test]
    fn the_interface_list_is_reused_for_its_ttl() {
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let n = calls.clone();
        let cache = IpCache {
            ips: Arc::new(move || {
                let i = n.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                vec![IpAddr::V4(Ipv4Addr::new(10, 0, 0, i as u8))]
            }),
            ttl: Duration::from_secs(2),
            last: Mutex::new(None),
        };
        let t0 = Instant::now();
        let first = cache.get(t0);
        assert_eq!(cache.get(t0 + Duration::from_millis(1999)), first);
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        // Once it is stale the list is read again, so a new address shows up.
        assert_ne!(cache.get(t0 + Duration::from_secs(2)), first);
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn a_bad_public_host_or_admin_public_only_without_one_is_refused() {
        let bad = ServeOptions {
            public_hosts: vec!["https://x.example.com".to_owned()],
            ..ServeOptions::default()
        };
        let err = serve_opts(
            router(),
            &cfg(Listen::Loopback),
            Tokens::full_only(tok(TOK)),
            bad,
        )
        .await
        .err()
        .unwrap();
        assert!(
            matches!(&err, ServeError::BadPublicHost(n) if n == "https://x.example.com"),
            "{err}"
        );
        let no_public = ServeOptions {
            admin_public_only: true,
            ..ServeOptions::default()
        };
        let err = serve_opts(
            router(),
            &cfg(Listen::Loopback),
            Tokens::full_only(tok(TOK)),
            no_public,
        )
        .await
        .err()
        .unwrap();
        assert!(
            matches!(err, ServeError::AdminPublicOnlyWithoutPublicHosts),
            "{err}"
        );
    }

    #[tokio::test]
    async fn serve_options_reach_the_guard() {
        const ADMIN: &str = "admin-0123456789abcdefghijklmnopqrstu";
        let app = Router::new().route("/", get(|g: crate::Grant| async move { format!("{g:?}") }));
        let tokens = Tokens::full_only(tok(TOK))
            .with(tok(ADMIN), crate::Grant::Admin)
            .unwrap();
        let opts = ServeOptions {
            public_hosts: vec!["X.example.com:443".to_owned(), "x.example.com".to_owned()],
            admin_public_only: true,
            cookie_max_age: Some(Duration::from_secs(60)),
            ..ServeOptions::default()
        };
        let handle = serve_opts(app, &cfg(Listen::Loopback), tokens, opts)
            .await
            .unwrap();
        let addr = handle.addrs()[0];
        assert_eq!(
            handle.public_share_urls_for(&tok(ADMIN)),
            [format!("https://x.example.com/?token={ADMIN}")]
        );
        let admin = format!("x-web-access-token: {ADMIN}\r\n");
        let res = raw_get(addr, "x.example.com", &admin).await;
        assert!(res.ends_with("Admin"), "{res}");
        let res = raw_get(addr, &addr.to_string(), &admin).await;
        assert!(res.ends_with("Full"), "{res}");
        let link = format!(
            "GET /?token={TOK} HTTP/1.1\r\nHost: x.example.com\r\nConnection: close\r\n\r\n"
        );
        let res = raw_request(addr, &link).await;
        assert!(res.contains("; Secure; Max-Age=60\r\n"), "{res}");
        handle.stop().await;
    }

    #[tokio::test]
    async fn token_is_enforced_on_loopback_when_set() {
        let handle = serve(
            router(),
            &cfg(Listen::Loopback),
            Tokens::full_only(tok(TOK)),
        )
        .await
        .unwrap();
        let addr = handle.addrs()[0];
        assert_eq!(handle.share_urls(), [format!("http://{addr}/?token={TOK}")]);
        assert!(
            raw_get(addr, &addr.to_string(), "")
                .await
                .starts_with("HTTP/1.1 401")
        );
        let ok = raw_get(
            addr,
            &addr.to_string(),
            &format!("x-web-access-token: {TOK}\r\n"),
        )
        .await;
        assert!(ok.starts_with("HTTP/1.1 200"), "{ok}");
        handle.stop().await;
    }

    #[tokio::test]
    async fn on_denied_reaches_the_callback() {
        let seen = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let n = seen.clone();
        let cb: Arc<dyn Fn(&Denial) + Send + Sync> = Arc::new(move |_| {
            n.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        let opts = ServeOptions {
            on_denied: Some(cb),
            ..ServeOptions::default()
        };
        let handle = serve_opts(
            router(),
            &cfg(Listen::Loopback),
            Tokens::full_only(tok(TOK)),
            opts,
        )
        .await
        .unwrap();
        let addr = handle.addrs()[0];
        raw_get(addr, &addr.to_string(), "x-web-access-token: wrong\r\n").await;
        assert_eq!(seen.load(std::sync::atomic::Ordering::SeqCst), 1);
        handle.stop().await;
    }

    #[tokio::test]
    async fn share_urls_for_expands_a_wildcard_bind_like_share_urls() {
        let handle = serve(
            router(),
            &cfg(Listen::AllInterfaces),
            Tokens::full_only(tok(TOK)),
        )
        .await
        .unwrap();
        assert_eq!(handle.share_urls_for(&tok(TOK)), handle.share_urls());
        assert!(handle.share_urls().iter().all(|u| !u.contains("0.0.0.0")));
        let other = Token::mint().unwrap();
        assert!(
            handle
                .share_urls_for(&other)
                .iter()
                .all(|u| u.ends_with(&format!("?token={other}")))
        );
        handle.stop().await;
    }

    #[tokio::test]
    async fn a_wildcard_bind_admits_an_interface_address_that_appears_later() {
        let ips = Arc::new(std::sync::Mutex::new(vec![
            IpAddr::V4(Ipv4Addr::LOCALHOST),
            "192.168.1.5".parse().unwrap(),
        ]));
        let list = ips.clone();
        let handle = serve_with_ips(
            router(),
            &cfg(Listen::AllInterfaces),
            Tokens::full_only(tok(TOK)),
            ServeOptions::default(),
            Arc::new(move || list.lock().unwrap().clone()),
        )
        .await
        .unwrap();
        let port = handle.addrs()[0].port();
        let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
        let tok = &format!("x-web-access-token: {TOK}\r\n");
        let new_host = format!("10.0.0.7:{port}");
        let get = raw_get(addr, &new_host, tok).await;
        assert!(
            get.starts_with("HTTP/1.1 421"),
            "not yet an interface: {get}"
        );

        assert_eq!(
            handle.share_urls(),
            [format!("http://192.168.1.5:{port}/?token={TOK}")]
        );

        // The network changes: the host gains 10.0.0.7.
        ips.lock().unwrap().push("10.0.0.7".parse().unwrap());
        let get = raw_get(addr, &new_host, tok).await;
        assert!(get.starts_with("HTTP/1.1 200"), "{get}");
        // The share links list it too.
        assert!(
            handle
                .share_urls()
                .contains(&format!("http://{new_host}/?token={TOK}"))
        );
        // Its Origin passes the mutating-request check too (405: no POST route).
        let post = raw_request(
            addr,
            &format!(
                "POST / HTTP/1.1\r\nHost: {new_host}\r\nOrigin: http://{new_host}\r\n{tok}\
                 Content-Length: 0\r\nConnection: close\r\n\r\n"
            ),
        )
        .await;
        assert!(post.starts_with("HTTP/1.1 405"), "{post}");
        // Only on the bound port, and never for a name.
        let other = format!("10.0.0.7:{}", port.wrapping_add(1));
        assert!(raw_get(addr, &other, tok).await.starts_with("HTTP/1.1 421"));
        let name = format!("evil.example:{port}");
        assert!(raw_get(addr, &name, tok).await.starts_with("HTTP/1.1 421"));
        handle.stop().await;
    }

    #[test]
    fn share_url_carries_the_token_as_written() {
        assert_eq!(
            share_url("192.168.1.5:80".parse().unwrap(), &tok(TOK)),
            format!("http://192.168.1.5:80/?token={TOK}")
        );
    }

    #[test]
    fn share_url_brackets_ipv6() {
        assert_eq!(
            share_url("[::1]:80".parse().unwrap(), &tok(TOK)),
            format!("http://[::1]:80/?token={TOK}")
        );
    }
}
