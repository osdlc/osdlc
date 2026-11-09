//! Put the guard and a host policy in front of a router by hand, without
//! `serve`, and see what a read token and a full token may do from a remote
//! peer.
//!
//! Run with `cargo run --example guard_and_policy`.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Method, Request, StatusCode};
use axum::middleware::from_fn_with_state;
use axum::routing::{get, post};
use serde::Serialize;
use tower::ServiceExt;
use web_access::guard::{TOKEN_HEADER, guard};
use web_access::{
    AccessContext, Grant, GuardPolicy, GuardState, HostPolicy, RouteRule, Tokens, host_policy_layer,
};

/// The app's own permissions. The crate never looks inside them.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
enum Permission {
    RunCommand,
}

/// The app's rule: running a command needs the admin grant from a remote peer.
fn allows(context: AccessContext, grant: Grant, permission: Permission) -> bool {
    match permission {
        Permission::RunCommand => context == AccessContext::WebLocal || grant >= Grant::Admin,
    }
}

/// Runs the example; `tests/examples.rs` runs it too.
#[tokio::main]
pub async fn main() {
    let policy = Arc::new(HostPolicy {
        allows,
        routes: vec![RouteRule::new(
            Some(Method::POST),
            "/api/run",
            Permission::RunCommand,
        )],
    });
    // `with` refuses a token that differs from another only in
    // percent-encoding; these three are distinct.
    let tokens = Tokens::none()
        .with("read-token", Grant::Read)
        .and_then(|t| t.with("full-token", Grant::Full))
        .and_then(|t| t.with("admin-token", Grant::Admin))
        .expect("distinct tokens");
    let state = Arc::new(GuardState::new(
        tokens,
        ["192.168.1.5:8080".to_owned()],
        GuardPolicy::default(),
    ));

    // The guard runs first (outermost), then the policy, then the handler,
    // which reads what the guard decided.
    let app = Router::new()
        .route("/", get(|grant: Grant| async move { format!("{grant:?}") }))
        .route("/api/save", post(|| async { "saved" }))
        .route("/api/run", post(|| async { "ran" }))
        .layer(from_fn_with_state(policy, host_policy_layer::<Permission>))
        .layer(from_fn_with_state(state, guard));

    let read_get = send(&app, Method::GET, "/", "read-token").await;
    let read_post = send(&app, Method::POST, "/api/save", "read-token").await;
    let full_post = send(&app, Method::POST, "/api/save", "full-token").await;
    let full_run = send(&app, Method::POST, "/api/run", "full-token").await;
    let admin_run = send(&app, Method::POST, "/api/run", "admin-token").await;

    // A read token may look but not change anything.
    assert_eq!(read_get, StatusCode::OK);
    assert_eq!(read_post, StatusCode::FORBIDDEN);
    // A full token may change things, but this app keeps commands for admin.
    assert_eq!(full_post, StatusCode::OK);
    assert_eq!(full_run, StatusCode::FORBIDDEN);
    assert_eq!(admin_run, StatusCode::OK);

    println!("read GET /: {read_get}");
    println!("read POST /api/save: {read_post}");
    println!("full POST /api/save: {full_post}");
    println!("full POST /api/run: {full_run}");
    println!("admin POST /api/run: {admin_run}");
}

/// One request from a LAN peer, with the token in the header.
async fn send(app: &Router, method: Method, path: &str, token: &str) -> StatusCode {
    let peer: SocketAddr = "192.168.1.20:50000".parse().expect("peer address");
    let mut req = Request::builder()
        .method(method)
        .uri(path)
        .header("host", "192.168.1.5:8080")
        .header(TOKEN_HEADER, token)
        .body(Body::empty())
        .expect("request");
    // `serve` gets the peer address from the connection; here it is set by hand.
    req.extensions_mut().insert(ConnectInfo(peer));
    app.clone().oneshot(req).await.expect("infallible").status()
}
