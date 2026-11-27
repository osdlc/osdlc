//! Send signed requests with reqwest to a protected axum server on a local socket.
//!
//! Run with `cargo run -p signed-request --features axum,reqwest --example signed_client`.

use std::sync::Arc;

use axum::Router;
use axum::extract::Extension;
use axum::routing::{get, put};
use signed_request::client::SignedClient;
use signed_request::middleware::{Guard, StaticKeys, protect};
use signed_request::{
    Direction, Signer, SystemClock, Verified, Verifier, VerifierConfig, VerifyKey,
};

/// Runs the example; `tests/examples.rs` runs it too.
pub fn main() {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
        .block_on(run());
}

async fn run() {
    let clock = Arc::new(SystemClock);
    let secret = b"0123456789abcdef0123456789abcdef".to_vec();

    // The server side.
    let verifier = Verifier::new(
        VerifierConfig::new(Direction::TenantToControl, "control"),
        clock.clone(),
    );
    let keys = StaticKeys::new(
        "acme",
        vec![VerifyKey {
            epoch: 1,
            secret: secret.clone(),
        }],
    );
    let app = protect(
        Router::new()
            .route(
                "/whoami",
                get(|Extension(v): Extension<Verified>| async move { v.key_id }),
            )
            .route("/echo", put(|body: String| async move { body })),
        Arc::new(Guard::new(verifier, Arc::new(keys))),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let base = format!("http://{}", listener.local_addr().expect("addr"));
    let server = tokio::spawn(async move { axum::serve(listener, app).await });

    // The client side. Redirects are off: reqwest would otherwise forward the key id and epoch
    // headers to wherever a redirect points.
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("client");
    let signer = Signer::new(
        "acme",
        1,
        secret,
        Direction::TenantToControl,
        "control",
        clock,
    );
    let client = SignedClient::new(http, base, signer);

    let response = client.get("/whoami").await.expect("sent");
    assert_eq!(response.status(), 200);
    assert_eq!(response.text().await.expect("body"), "acme");

    let response = client
        .put_json("/echo", br#"{"qty":2}"#)
        .await
        .expect("sent");
    assert_eq!(response.text().await.expect("body"), r#"{"qty":2}"#);

    server.abort();
}
