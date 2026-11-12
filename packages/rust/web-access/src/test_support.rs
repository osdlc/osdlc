//! Connections the tests hold open, and how they end.

use std::net::SocketAddr;
use std::time::Duration;

use axum::Router;
use axum::routing::get;
use futures_util::StreamExt as _;
use hyper_util::rt::TokioIo;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

/// `/` answers `ok`. `/stream` sends `tick` and never ends. `/up` takes the connection over
/// as a WebSocket handler would, and echoes.
pub(crate) fn long_lived_router() -> Router {
    Router::new()
        .route("/", get(|| async { "ok" }))
        .route(
            "/stream",
            get(|| async {
                let first = futures_util::stream::once(async {
                    Ok::<_, std::io::Error>(axum::body::Bytes::from_static(b"tick"))
                });
                axum::body::Body::from_stream(first.chain(futures_util::stream::pending()))
            }),
        )
        .route("/up", get(echo_upgrade))
}

async fn echo_upgrade(mut req: axum::extract::Request) -> axum::response::Response {
    let on = hyper::upgrade::on(&mut req);
    tokio::spawn(async move {
        let mut io = TokioIo::new(on.await.unwrap());
        let mut buf = [0u8; 64];
        while let Ok(n @ 1..) = io.read(&mut buf).await {
            if io.write_all(&buf[..n]).await.is_err() {
                break;
            }
        }
    });
    switching_protocols()
}

/// The 101 answer to an `Upgrade: echo` request.
pub(crate) fn switching_protocols() -> axum::response::Response {
    axum::response::Response::builder()
        .status(axum::http::StatusCode::SWITCHING_PROTOCOLS)
        .header("connection", "upgrade")
        .header("upgrade", "echo")
        .body(axum::body::Body::empty())
        .unwrap()
}

/// `GET /stream` with `token` in the header, read up to its first chunk.
pub(crate) async fn open_stream(addr: SocketAddr, token: &str) -> TcpStream {
    let req =
        format!("GET /stream HTTP/1.1\r\nHost: {addr}\r\nx-web-access-token: {token}\r\n\r\n");
    open(addr, &req, "tick").await
}

/// `GET <path>` upgraded with `token` in the header, read up to the 101.
pub(crate) async fn open_upgrade(addr: SocketAddr, path: &str, token: &str) -> TcpStream {
    let req = format!(
        "GET {path} HTTP/1.1\r\nHost: {addr}\r\nx-web-access-token: {token}\r\n\
         Connection: upgrade\r\nUpgrade: echo\r\n\r\n"
    );
    open(addr, &req, "\r\n\r\n").await
}

async fn open(addr: SocketAddr, req: &str, until: &str) -> TcpStream {
    let mut s = TcpStream::connect(addr).await.unwrap();
    s.write_all(req.as_bytes()).await.unwrap();
    let mut buf = vec![0u8; 4096];
    let mut seen = String::new();
    while !seen.contains(until) {
        let n = s.read(&mut buf).await.unwrap();
        assert_ne!(n, 0, "closed before {until:?}: {seen}");
        seen.push_str(&String::from_utf8_lossy(&buf[..n]));
    }
    assert!(!seen.starts_with("HTTP/1.1 4"), "{seen}");
    s
}

/// True when `s` reaches EOF or an error within `within`.
pub(crate) async fn closes_within(s: &mut TcpStream, within: Duration) -> bool {
    let mut buf = [0u8; 256];
    tokio::time::timeout(within, async {
        loop {
            match s.read(&mut buf).await {
                Ok(0) | Err(_) => return,
                Ok(_) => {}
            }
        }
    })
    .await
    .is_ok()
}

/// Write `ping` on an upgraded echo connection and read it back.
pub(crate) async fn echoes(s: &mut TcpStream) -> bool {
    let mut buf = [0u8; 4];
    s.write_all(b"ping").await.is_ok()
        && tokio::time::timeout(Duration::from_secs(1), s.read_exact(&mut buf))
            .await
            .is_ok_and(|r| r.is_ok())
        && &buf == b"ping"
}

/// Long enough for a cut, if one were coming, to land.
pub(crate) const STAYS_OPEN: Duration = Duration::from_millis(300);
