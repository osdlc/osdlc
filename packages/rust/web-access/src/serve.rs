//! Bind a router to the configured addresses behind the guard, and hand back
//! a handle that can stop it.

use std::future::Future;
use std::io;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Duration;

use axum::Router;
use axum::serve::{Listener, ListenerExt as _};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::config::{Listen, WebAccessConfig};
use crate::guard::{GuardPolicy, GuardState, HostIps, OnDenied, Tokens, encode_token, guard};
use crate::interfaces::interfaces;
use crate::permissions::RouteRule;

/// How long `stop` waits for in-flight requests (an SSE stream never ends on
/// its own) before it closes their connections.
const GRACE: Duration = Duration::from_secs(5);

/// How long `stop` waits for the cut connections to wind down before it
/// aborts the server tasks.
const CUT_GRACE: Duration = Duration::from_secs(1);

/// A [`TcpListener`] whose connections all fail once `cut` turns true.
///
/// axum runs each connection in a task of its own, so aborting the serve task
/// leaves open streams (SSE, an upgraded WebSocket) running on the old guard.
/// Failing their reads and writes is what ends them.
struct CutListener {
    inner: TcpListener,
    cut: watch::Receiver<bool>,
}

impl Listener for CutListener {
    type Io = CutStream;
    type Addr = SocketAddr;

    async fn accept(&mut self) -> (Self::Io, Self::Addr) {
        let (io, addr) = Listener::accept(&mut self.inner).await;
        let mut cut = self.cut.clone();
        let cut = Box::pin(async move {
            // A dropped handle closes the channel; that is not a cut.
            if cut.wait_for(|c| *c).await.is_err() {
                std::future::pending::<()>().await;
            }
        });
        (CutStream { io, cut: Some(cut) }, addr)
    }

    fn local_addr(&self) -> io::Result<Self::Addr> {
        self.inner.local_addr()
    }
}

/// One connection of a [`CutListener`].
struct CutStream {
    io: TcpStream,
    /// `None` once the cut has fired: a finished future must not be polled again.
    cut: Option<Pin<Box<dyn Future<Output = ()> + Send>>>,
}

impl CutStream {
    /// An error once cut, and on every call after. Polling registers the waker,
    /// so a connection idle on a pending body is woken to see it.
    fn check(&mut self, cx: &mut Context<'_>) -> io::Result<()> {
        let fired = match &mut self.cut {
            None => true,
            Some(cut) => cut.as_mut().poll(cx).is_ready(),
        };
        if fired {
            self.cut = None;
            return Err(io::ErrorKind::ConnectionAborted.into());
        }
        Ok(())
    }
}

impl AsyncRead for CutStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        self.check(cx)?;
        Pin::new(&mut self.io).poll_read(cx, buf)
    }
}

impl AsyncWrite for CutStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        self.check(cx)?;
        Pin::new(&mut self.io).poll_write(cx, buf)
    }

    fn poll_write_vectored(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        bufs: &[io::IoSlice<'_>],
    ) -> Poll<io::Result<usize>> {
        self.check(cx)?;
        Pin::new(&mut self.io).poll_write_vectored(cx, bufs)
    }

    fn is_write_vectored(&self) -> bool {
        self.io.is_write_vectored()
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        self.check(cx)?;
        Pin::new(&mut self.io).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.io).poll_shutdown(cx)
    }
}

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
    /// An address could not be bound.
    #[error("could not bind {addr}: {source}")]
    Bind {
        /// The address.
        addr: SocketAddr,
        /// The operating system's error.
        source: std::io::Error,
    },
}

/// `http://<ip>:<port>/?token=<token>`; an IPv6 address is bracketed and the
/// token is percent-encoded.
pub fn share_url(addr: SocketAddr, token: &str) -> String {
    format!("http://{addr}/?token={}", encode_token(token))
}

/// A running server. Dropping it without `stop` stops accepting new
/// connections but leaves open ones running.
pub struct ServerHandle {
    addrs: Vec<SocketAddr>,
    /// The addresses a peer can open, before a token is attached.
    share_addrs: Vec<SocketAddr>,
    share_urls: Vec<String>,
    stop_tx: watch::Sender<bool>,
    cut_tx: watch::Sender<bool>,
    tasks: Vec<JoinHandle<()>>,
}

impl ServerHandle {
    /// The addresses actually bound (port 0 resolved).
    pub fn addrs(&self) -> &[SocketAddr] {
        &self.addrs
    }

    /// Where another device can open the app: one URL per reachable address,
    /// carrying [`Tokens::share_token`] when tokens are set. A wildcard bind
    /// expands to the host's non-loopback IPv4 interfaces as of start. Use
    /// [`Self::share_urls_for`] for a particular grant's link.
    pub fn share_urls(&self) -> &[String] {
        &self.share_urls
    }

    /// [`Self::share_urls`] carrying `token`, e.g. the read-only one.
    pub fn share_urls_for(&self, token: &str) -> Vec<String> {
        self.share_addrs
            .iter()
            .map(|a| share_url(*a, token))
            .collect()
    }

    /// Stop accepting, let in-flight requests finish (up to a grace period),
    /// then close every connection still open and release the ports.
    pub async fn stop(mut self) {
        let _ = self.stop_tx.send(true);
        let deadline = tokio::time::Instant::now() + GRACE;
        for task in &mut self.tasks {
            let _ = tokio::time::timeout_at(deadline, task).await;
        }
        let _ = self.cut_tx.send(true);
        for mut task in self.tasks {
            if !task.is_finished() && tokio::time::timeout(CUT_GRACE, &mut task).await.is_err() {
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
    /// `None` is [`serve`]'s default: loopback is open only without tokens.
    pub policy: Option<GuardPolicy>,
    /// See [`GuardState::with_read_safe`].
    pub read_safe: Vec<RouteRule<()>>,
    /// See [`GuardState::with_on_denied`].
    pub on_denied: Option<Arc<OnDenied>>,
    /// See [`GuardState::with_public_hosts`].
    pub public_hosts: Vec<String>,
    /// See [`GuardState::with_cookie_max_age`]. `None` keeps a session cookie.
    pub cookie_max_age: Option<std::time::Duration>,
    /// See [`GuardState::with_admin_over_public_only`].
    pub admin_public_only: bool,
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
    let host_ips = || interfaces().into_iter().map(|i| i.ip).collect();
    serve_with_ips(router, cfg, tokens, opts, Arc::new(host_ips)).await
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

    let policy = opts.policy.unwrap_or(GuardPolicy {
        loopback_open: tokens.is_empty(),
    });

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

    // Reachable IPs: what was bound, or every interface for a wildcard bind.
    let host_ifaces = host_ips();
    let mut reachable: Vec<IpAddr> = Vec::new();
    for a in &addrs {
        if a.ip().is_unspecified() {
            reachable.extend(
                host_ifaces
                    .iter()
                    .copied()
                    .filter(|ip| ip.is_ipv4() == a.ip().is_ipv4()),
            );
        } else {
            reachable.push(a.ip());
        }
    }
    reachable.sort();
    reachable.dedup();

    let mut hosts = Vec::new();
    for a in &addrs {
        let port = a.port();
        hosts.push(format!("localhost:{port}"));
        hosts.push(authority(IpAddr::V4(Ipv4Addr::LOCALHOST), port));
        hosts.push(authority(IpAddr::V6(std::net::Ipv6Addr::LOCALHOST), port));
        hosts.extend(reachable.iter().map(|ip| authority(*ip, port)));
    }

    let share_addrs: Vec<SocketAddr> = addrs
        .iter()
        .flat_map(|a| {
            let ips: Vec<IpAddr> = if a.ip().is_unspecified() {
                reachable
                    .iter()
                    .copied()
                    .filter(|ip| !ip.is_loopback() && ip.is_ipv4() == a.ip().is_ipv4())
                    .collect()
            } else {
                vec![a.ip()]
            };
            ips.into_iter().map(move |ip| SocketAddr::new(ip, a.port()))
        })
        .collect();
    let share_urls = share_addrs
        .iter()
        .copied()
        .map(|a| match tokens.share_token() {
            Some(t) => share_url(a, t),
            None => format!("http://{a}/"),
        })
        .collect();

    let mut state = GuardState::new(tokens, hosts, policy)
        .with_read_safe(opts.read_safe)
        .with_public_hosts(&opts.public_hosts);
    if let Some(age) = opts.cookie_max_age {
        state = state.with_cookie_max_age(age);
    }
    if opts.admin_public_only {
        state = state.with_admin_over_public_only();
    }
    let wildcards: Vec<SocketAddr> = addrs
        .iter()
        .copied()
        .filter(|a| a.ip().is_unspecified())
        .collect();
    if !wildcards.is_empty() {
        state = state.with_live_hosts(wildcards, host_ips);
    }
    if let Some(cb) = opts.on_denied {
        state = state.with_shared_on_denied(cb);
    }
    let app = router.layer(axum::middleware::from_fn_with_state(Arc::new(state), guard));

    let (stop_tx, stop_rx) = watch::channel(false);
    let (cut_tx, cut_rx) = watch::channel(false);
    let tasks = listeners
        .into_iter()
        .map(|listener| {
            let app = app.clone();
            let mut rx = stop_rx.clone();
            let listener = CutListener {
                inner: listener,
                cut: cut_rx.clone(),
            }
            // A no-op tap: axum gives `ConnectInfo<SocketAddr>` to a tapped
            // listener of any type, but to an untapped one only for TcpListener.
            .tap_io(|_| {});
            tokio::spawn(async move {
                let shutdown = async move {
                    let _ = rx.wait_for(|stopped| *stopped).await;
                };
                let svc = app.into_make_service_with_connect_info::<SocketAddr>();
                let _ = axum::serve(listener, svc)
                    .with_graceful_shutdown(shutdown)
                    .await;
            })
        })
        .collect();

    Ok(ServerHandle {
        addrs,
        share_addrs,
        share_urls,
        stop_tx,
        cut_tx,
        tasks,
    })
}

#[cfg(test)]
mod tests {
    use axum::routing::get;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    use super::*;
    use crate::guard::Denial;

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

    /// One raw HTTP/1.1 GET; returns the status line and the whole response.
    async fn raw_get(addr: SocketAddr, host: &str, extra: &str) -> String {
        let req = format!("GET / HTTP/1.1\r\nHost: {host}\r\n{extra}Connection: close\r\n\r\n");
        raw_request(addr, &req).await
    }

    /// Send `req` as written and read the response to EOF.
    async fn raw_request(addr: SocketAddr, req: &str) -> String {
        let mut s = TcpStream::connect(addr).await.unwrap();
        s.write_all(req.as_bytes()).await.unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).await.unwrap();
        out
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
            serve(router(), &cfg(ips), Tokens::full_only(String::new()))
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
        use futures::StreamExt as _;
        let app = Router::new().route(
            "/stream",
            get(|| async {
                let first = futures::stream::once(async {
                    Ok::<_, std::io::Error>(axum::body::Bytes::from_static(b"tick"))
                });
                axum::body::Body::from_stream(first.chain(futures::stream::pending()))
            }),
        );
        let handle = serve(
            app,
            &cfg(Listen::Loopback),
            Tokens::full_only("tok".to_owned()),
        )
        .await
        .unwrap();
        let addr = handle.addrs()[0];
        let mut s = TcpStream::connect(addr).await.unwrap();
        let req =
            format!("GET /stream HTTP/1.1\r\nHost: {addr}\r\nx-web-access-token: tok\r\n\r\n");
        s.write_all(req.as_bytes()).await.unwrap();
        let mut buf = vec![0u8; 4096];
        let mut seen = String::new();
        while !seen.contains("tick") {
            let n = s.read(&mut buf).await.unwrap();
            assert_ne!(n, 0, "closed before the first chunk: {seen}");
            seen.push_str(&String::from_utf8_lossy(&buf[..n]));
        }

        handle.stop().await;
        // Once stop returns the connection is closed: EOF or a reset.
        let after = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                match s.read(&mut buf).await {
                    Ok(0) | Err(_) => return,
                    Ok(_) => {}
                }
            }
        })
        .await;
        assert!(after.is_ok(), "the stream outlived stop");
    }

    #[tokio::test]
    async fn a_cut_stream_keeps_failing_without_a_panic() {
        let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = l.local_addr().unwrap();
        let (cut_tx, cut_rx) = watch::channel(false);
        let mut cl = CutListener {
            inner: l,
            cut: cut_rx,
        };
        let (_client, accepted) = tokio::join!(TcpStream::connect(addr), cl.accept());
        let (mut io, _) = accepted;
        cut_tx.send(true).unwrap();
        let mut buf = [0u8; 8];
        let aborted = |e: std::io::Error| e.kind() == std::io::ErrorKind::ConnectionAborted;
        assert!(io.read(&mut buf).await.is_err_and(aborted));
        // hyper writes a reply (or a WebSocket a Close frame) after a read error.
        assert!(io.write(b"x").await.is_err_and(aborted));
        assert!(io.flush().await.is_err_and(aborted));
        assert!(io.read(&mut buf).await.is_err_and(aborted));
    }

    #[tokio::test]
    async fn token_is_enforced_on_loopback_when_set() {
        let handle = serve(
            router(),
            &cfg(Listen::Loopback),
            Tokens::full_only("tok".to_owned()),
        )
        .await
        .unwrap();
        let addr = handle.addrs()[0];
        assert_eq!(handle.share_urls(), [format!("http://{addr}/?token=tok")]);
        assert!(
            raw_get(addr, &addr.to_string(), "")
                .await
                .starts_with("HTTP/1.1 401")
        );
        let ok = raw_get(addr, &addr.to_string(), "x-web-access-token: tok\r\n").await;
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
            Tokens::full_only("tok".to_owned()),
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
            Tokens::full_only("tok".to_owned()),
        )
        .await
        .unwrap();
        assert_eq!(handle.share_urls_for("tok"), handle.share_urls());
        assert!(handle.share_urls().iter().all(|u| !u.contains("0.0.0.0")));
        assert!(
            handle
                .share_urls_for("other")
                .iter()
                .all(|u| u.ends_with("?token=other"))
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
            Tokens::full_only("tok".to_owned()),
            ServeOptions::default(),
            Arc::new(move || list.lock().unwrap().clone()),
        )
        .await
        .unwrap();
        let port = handle.addrs()[0].port();
        let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
        let tok = "x-web-access-token: tok\r\n";
        let new_host = format!("10.0.0.7:{port}");
        let get = raw_get(addr, &new_host, tok).await;
        assert!(
            get.starts_with("HTTP/1.1 421"),
            "not yet an interface: {get}"
        );

        // The network changes: the host gains 10.0.0.7.
        ips.lock().unwrap().push("10.0.0.7".parse().unwrap());
        let get = raw_get(addr, &new_host, tok).await;
        assert!(get.starts_with("HTTP/1.1 200"), "{get}");
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
    fn share_url_percent_encodes_the_token() {
        assert_eq!(
            share_url("192.168.1.5:80".parse().unwrap(), "a b&c#d;e%f+g"),
            "http://192.168.1.5:80/?token=a%20b%26c%23d%3Be%25f%2Bg"
        );
        // A minted base64url token is left as it is.
        assert_eq!(
            share_url("192.168.1.5:80".parse().unwrap(), "aZ09-_"),
            "http://192.168.1.5:80/?token=aZ09-_"
        );
    }

    #[test]
    fn share_url_brackets_ipv6() {
        assert_eq!(
            share_url("192.168.1.5:80".parse().unwrap(), "t"),
            "http://192.168.1.5:80/?token=t"
        );
        assert_eq!(
            share_url("[::1]:80".parse().unwrap(), "t"),
            "http://[::1]:80/?token=t"
        );
    }
}
