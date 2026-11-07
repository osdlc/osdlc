//! Bind a router to the configured addresses behind the guard, and hand back
//! a handle that can stop it.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use tokio::net::TcpListener;
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::config::{Listen, WebAccessConfig};
use crate::guard::{GuardPolicy, GuardState, OnDenied, Tokens, guard};
use crate::interfaces::interfaces;
use crate::permissions::RouteRule;

/// How long `stop` waits for in-flight requests (an SSE stream never ends on
/// its own) before the server tasks are aborted.
const GRACE: Duration = Duration::from_secs(5);

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
    /// An address could not be bound.
    #[error("could not bind {addr}: {source}")]
    Bind {
        /// The address.
        addr: SocketAddr,
        /// The operating system's error.
        source: std::io::Error,
    },
}

/// `http://<ip>:<port>/?token=<token>`; an IPv6 address is bracketed, and any
/// character of the token outside `A-Z a-z 0-9 - . _ ~` is percent-encoded
/// (a minted token has none).
pub fn share_url(addr: SocketAddr, token: &str) -> String {
    let token = percent_encoding::utf8_percent_encode(token, TOKEN_ESCAPES);
    format!("http://{addr}/?token={token}")
}

/// Everything but the URL-unreserved characters `A-Z a-z 0-9 - . _ ~`.
const TOKEN_ESCAPES: &percent_encoding::AsciiSet = &percent_encoding::NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

/// A running server. Dropping it without `stop` leaves the server running
/// until the runtime shuts down.
pub struct ServerHandle {
    addrs: Vec<SocketAddr>,
    /// The addresses a peer can open, before a token is attached.
    share_addrs: Vec<SocketAddr>,
    share_urls: Vec<String>,
    stop_tx: watch::Sender<bool>,
    tasks: Vec<JoinHandle<()>>,
}

impl ServerHandle {
    /// The addresses actually bound (port 0 resolved).
    pub fn addrs(&self) -> &[SocketAddr] {
        &self.addrs
    }

    /// Where another device can open the app: one URL per reachable address,
    /// carrying [`Tokens::share_token`] when tokens are set. A wildcard bind
    /// expands to the host's non-loopback IPv4 interfaces. Use
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
    /// and release the ports.
    pub async fn stop(self) {
        let _ = self.stop_tx.send(true);
        // One grace period for all listeners, not one each.
        let deadline = tokio::time::Instant::now() + GRACE;
        for mut task in self.tasks {
            if tokio::time::timeout_at(deadline, &mut task).await.is_err() {
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
    if !cfg.enabled {
        return Err(ServeError::Disabled);
    }
    if tokens.is_empty() && !cfg.listen.is_loopback_only() {
        return Err(ServeError::TokenRequired);
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
    let host_ifaces = interfaces();
    let mut reachable: Vec<IpAddr> = Vec::new();
    for a in &addrs {
        if a.ip().is_unspecified() {
            reachable.extend(
                host_ifaces
                    .iter()
                    .filter(|i| i.ip.is_ipv4() == a.ip().is_ipv4())
                    .map(|i| i.ip),
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

    let mut state = GuardState::new(tokens, hosts, policy).with_read_safe(opts.read_safe);
    if let Some(cb) = opts.on_denied {
        state = state.with_shared_on_denied(cb);
    }
    let app = router.layer(axum::middleware::from_fn_with_state(Arc::new(state), guard));

    let (stop_tx, stop_rx) = watch::channel(false);
    let tasks = listeners
        .into_iter()
        .map(|listener| {
            let app = app.clone();
            let mut rx = stop_rx.clone();
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
        let mut s = TcpStream::connect(addr).await.unwrap();
        let req = format!("GET / HTTP/1.1\r\nHost: {host}\r\n{extra}Connection: close\r\n\r\n");
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
