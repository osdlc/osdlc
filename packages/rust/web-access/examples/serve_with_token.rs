//! Serve a router behind a token on loopback, then send it three requests:
//! one with no token, one through the share link, and one with the cookie the
//! link sets.
//!
//! Run with `cargo run --example serve_with_token`.

use axum::Router;
use axum::routing::get;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use web_access::token::Token;
use web_access::{Listen, Tokens, WebAccessConfig, guard::cookie_name, serve};

/// Runs the example; `tests/examples.rs` runs it too.
#[tokio::main]
pub async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let app = Router::new().route("/", get(|| async { "hello from the app" }));

    // Port 0 asks the OS for a free port.
    let config = WebAccessConfig {
        enabled: true,
        listen: Listen::Loopback,
        port: 0,
        admin: false,
    };
    // A token that lives for this process only. `token::load_or_mint` keeps
    // one in a directory instead, so links survive a restart.
    let secret = Token::mint()?;
    let server = serve(app, &config, Tokens::full_only(secret.clone())).await?;
    let addr = server.addrs()[0];

    // The link to hand to another device.
    let link = &server.share_urls()[0];
    assert_eq!(link, &format!("http://{addr}/?token={secret}"));

    // No token: refused.
    let no_token = get_status(addr, "/", "").await?;
    assert_eq!(no_token.status, 401);

    // The share link sets the cookie and answers with a page that moves to the
    // URL without the token.
    let via_link = get_status(addr, &format!("/?token={secret}"), "").await?;
    assert_eq!(via_link.status, 200);
    let cookie = via_link.set_cookie.expect("the link sets a cookie");
    let pair = cookie.split(';').next().unwrap_or_default().to_owned();
    assert_eq!(pair, format!("{}={secret}", cookie_name(addr.port())));

    // The cookie now carries the token.
    let with_cookie = get_status(addr, "/", &format!("Cookie: {pair}\r\n")).await?;
    assert_eq!(with_cookie.status, 200);

    println!("no token: {}", no_token.status);
    println!(
        "share link: {} (sets {})",
        via_link.status,
        cookie_name(addr.port())
    );
    println!("cookie: {}", with_cookie.status);

    server.stop().await;
    Ok(())
}

struct Reply {
    status: u16,
    set_cookie: Option<String>,
}

/// A bare HTTP/1.1 GET, so the example needs no HTTP client.
async fn get_status(
    addr: std::net::SocketAddr,
    path: &str,
    extra_headers: &str,
) -> std::io::Result<Reply> {
    let mut stream = TcpStream::connect(addr).await?;
    let request =
        format!("GET {path} HTTP/1.1\r\nHost: {addr}\r\n{extra_headers}Connection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).await?;
    let mut raw = String::new();
    stream.read_to_string(&mut raw).await?;
    let status = raw
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let set_cookie = raw
        .lines()
        .find_map(|l| l.strip_prefix("set-cookie: ").map(str::to_owned));
    Ok(Reply { status, set_cookie })
}
