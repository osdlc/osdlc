//! Protect an axum router and read the verified key id in a handler. Requests are driven through
//! the router in memory, so no socket is opened.
//!
//! Run with `cargo run -p signed-request --features axum --example protect_router`.

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Body;
use axum::extract::Extension;
use axum::http::{Request, StatusCode};
use axum::routing::get;
use signed_request::middleware::{Guard, StaticKeys, protect};
use signed_request::{
    Direction, ManualClock, Signer, Verified, Verifier, VerifierConfig, VerifyKey,
};
use tower::ServiceExt;

/// Runs the example; `tests/examples.rs` runs it too.
pub fn main() {
    tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("runtime")
        .block_on(run());
}

async fn run() {
    let clock = Arc::new(ManualClock::new(1_800_000_000));
    let secret = b"0123456789abcdef0123456789abcdef".to_vec();

    // Reasons for rejections go to the hook (here a list; in a service, your logger).
    let rejected = Arc::new(Mutex::new(Vec::new()));
    let log = rejected.clone();
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
    let guard = Arc::new(
        Guard::new(verifier, Arc::new(keys))
            .with_max_body(1024)
            .with_reject_hook(move |why| log.lock().expect("lock").push(why.to_string())),
    );
    let app =
        protect(
            Router::new().route(
                "/whoami",
                get(|Extension(v): Extension<Verified>| async move {
                    format!("{}@{}", v.key_id, v.epoch)
                }),
            ),
            guard,
        );

    let signer = Signer::new(
        "acme",
        1,
        secret,
        Direction::TenantToControl,
        "control",
        clock,
    );
    let mut request = Request::get("/whoami");
    for (name, value) in signer.sign("GET", "/whoami", b"").expect("signs").pairs() {
        request = request.header(name, value);
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::empty()).expect("request"))
        .await
        .expect("response");
    assert_eq!(response.status(), StatusCode::OK);

    // An unsigned request never reaches the handler; the reason goes to the hook only.
    let response = app
        .oneshot(
            Request::get("/whoami")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("response");
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(rejected.lock().expect("lock").len(), 1);
}
