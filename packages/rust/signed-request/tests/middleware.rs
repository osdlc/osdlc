//! The middleware's status mappings, reject hook and routing rules, driven in memory.
#![cfg(feature = "axum")]

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Body;
use axum::extract::Extension;
use axum::http::{Request, StatusCode};
use axum::routing::{get, post};
use signed_request::middleware::{Guard, KeyResolver, StaticKeys, protect};
use signed_request::{
    Direction, ManualClock, Signer, Verified, Verifier, VerifierConfig, VerifyError, VerifyKey,
};
use tower::ServiceExt;

const NOW: i64 = 1_800_000_000;
const SECRET: &[u8] = b"0123456789abcdef0123456789abcdef";

fn key() -> VerifyKey {
    VerifyKey {
        epoch: 1,
        secret: SECRET.to_vec(),
    }
}

fn signer(id: &str, clock: &Arc<ManualClock>) -> Signer {
    Signer::new(
        id,
        1,
        SECRET,
        Direction::TenantToControl,
        "control",
        clock.clone(),
    )
}

type Reasons = Arc<Mutex<Vec<VerifyError>>>;

struct Rig {
    clock: Arc<ManualClock>,
    guard: Arc<Guard>,
    reasons: Reasons,
}

fn rig(configure: impl FnOnce(&mut VerifierConfig), max_body: usize) -> Rig {
    let clock = Arc::new(ManualClock::new(NOW));
    let mut cfg = VerifierConfig::new(Direction::TenantToControl, "control");
    configure(&mut cfg);
    let reasons: Reasons = Arc::default();
    let seen = reasons.clone();
    let guard = Guard::new(
        Verifier::new(cfg, clock.clone()),
        Arc::new(StaticKeys::new("tnt_a", vec![key()])),
    )
    .with_max_body(max_body)
    .with_reject_hook(move |why| seen.lock().unwrap().push(why.clone()));
    Rig {
        clock,
        guard: Arc::new(guard),
        reasons,
    }
}

fn app(guard: Arc<Guard>) -> Router {
    protect(
        Router::new()
            .route(
                "/whoami",
                get(|Extension(v): Extension<Verified>| async move { v.key_id }),
            )
            .route("/echo", post(|body: String| async move { body })),
        guard,
    )
}

/// A signed request, with a given body and an optional lie about its length.
fn signed(signer: &Signer, method: &str, target: &str, body: &[u8]) -> Request<Body> {
    let mut req = Request::builder().method(method).uri(target);
    for (name, value) in signer.sign(method, target, body).unwrap().pairs() {
        req = req.header(name, value);
    }
    req.body(Body::from(body.to_vec())).unwrap()
}

async fn status(app: &Router, req: Request<Body>) -> StatusCode {
    app.clone().oneshot(req).await.unwrap().status()
}

#[tokio::test]
async fn a_key_at_its_quota_gets_429_and_the_hook_hears_why() {
    let r = rig(|c| c.replay_per_key = 1, 1024);
    let app = app(r.guard.clone());
    let s = signer("tnt_a", &r.clock);
    assert_eq!(status(&app, signed(&s, "GET", "/whoami", b"")).await, 200);
    assert_eq!(status(&app, signed(&s, "GET", "/whoami", b"")).await, 429);
    assert_eq!(
        r.reasons.lock().unwrap().as_slice(),
        [VerifyError::KeyQuotaExceeded]
    );
}

#[tokio::test]
async fn a_full_replay_cache_gets_503() {
    let r = rig(
        |c| {
            c.replay_capacity = 1;
            c.replay_per_key = 5;
        },
        1024,
    );
    let app = app(r.guard.clone());
    let s = signer("tnt_a", &r.clock);
    assert_eq!(status(&app, signed(&s, "GET", "/whoami", b"")).await, 200);
    assert_eq!(status(&app, signed(&s, "GET", "/whoami", b"")).await, 503);
    assert_eq!(
        r.reasons.lock().unwrap().as_slice(),
        [VerifyError::ReplayCacheFull]
    );
}

#[tokio::test]
async fn every_rejection_reaches_the_hook_and_the_answer_is_the_same_401() {
    let r = rig(|_| {}, 1024);
    let app = app(r.guard.clone());
    // Unsigned: the hook hears which header is missing.
    let res = app
        .clone()
        .oneshot(Request::get("/whoami").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), 401);
    let body = axum::body::to_bytes(res.into_body(), 1024).await.unwrap();
    assert_eq!(&body[..], br#"{"error":"unauthorized"}"#);
    // Unknown key id, then a wrong secret.
    assert_eq!(
        status(
            &app,
            signed(&signer("tnt_zzz", &r.clock), "GET", "/whoami", b"")
        )
        .await,
        401
    );
    let wrong = Signer::new(
        "tnt_a",
        1,
        b"another-secret-another-secret-00".as_slice(),
        Direction::TenantToControl,
        "control",
        r.clock.clone(),
    );
    assert_eq!(
        status(&app, signed(&wrong, "GET", "/whoami", b"")).await,
        401
    );
    let reasons = r.reasons.lock().unwrap();
    assert!(matches!(reasons[0], VerifyError::MissingHeader(_)));
    assert_eq!(reasons[1], VerifyError::UnknownKey);
    assert_eq!(reasons[2], VerifyError::BadSignature);
}

#[tokio::test]
async fn an_oversized_body_is_413_and_the_hook_hears_it() {
    let r = rig(|_| {}, 8);
    let app = app(r.guard.clone());
    let s = signer("tnt_a", &r.clock);
    // The declared length is over the limit.
    let big = vec![b'x'; 64];
    let mut req = signed(&s, "POST", "/echo", &big);
    req.headers_mut()
        .insert("content-length", "64".parse().unwrap());
    assert_eq!(status(&app, req).await, 413);
    assert_eq!(r.reasons.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn a_body_that_outgrows_the_limit_while_being_read_is_413_and_the_hook_hears_it() {
    // No `Content-Length` header: the limit is enforced while the body is read.
    let r = rig(|_| {}, 8);
    let app = app(r.guard.clone());
    let s = signer("tnt_a", &r.clock);
    let req = signed(&s, "POST", "/echo", &[b'x'; 64]);
    assert!(req.headers().get("content-length").is_none());
    assert_eq!(status(&app, req).await, 413);
    assert_eq!(r.reasons.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn static_keys_answer_only_for_their_own_id() {
    let keys = StaticKeys::new("tnt_a", vec![key()]);
    assert_eq!(keys.keys("tnt_a").await.len(), 1);
    assert!(keys.keys("tnt_b").await.is_empty());
}

#[tokio::test]
async fn protect_covers_nested_routes_when_it_wraps_the_nest_and_not_routes_added_later() {
    let r = rig(|_| {}, 1024);
    let inner = Router::new().route("/x", get(|| async { "ok" }));
    let wrap = protect(Router::new().nest("/api", inner.clone()), r.guard.clone());
    let s = signer("tnt_a", &r.clock);
    assert_eq!(status(&wrap, signed(&s, "GET", "/api/x", b"")).await, 200);
    assert_eq!(
        status(&wrap, Request::get("/api/x").body(Body::empty()).unwrap()).await,
        401
    );
    // A route added after `protect` is not covered.
    let late = protect(Router::new(), r.guard.clone()).route("/late", get(|| async { "open" }));
    assert_eq!(
        status(&late, Request::get("/late").body(Body::empty()).unwrap()).await,
        200
    );
}
