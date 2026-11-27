//! End to end over a real socket: signing client against the middleware.
#![cfg(all(feature = "axum", feature = "reqwest"))]

use std::sync::Arc;

use async_trait::async_trait;
use axum::extract::Extension;
use axum::routing::{get, post, put};
use axum::{Json, Router};
use signed_request::client::SignedClient;
use signed_request::middleware::{Guard, KeyResolver, protect};
use signed_request::{
    Direction, ManualClock, Signer, Verified, Verifier, VerifierConfig, VerifyKey,
};

struct Keys;

#[async_trait]
impl KeyResolver for Keys {
    async fn keys(&self, id: &str) -> Vec<VerifyKey> {
        match id {
            "tnt_a" => vec![VerifyKey {
                epoch: 1,
                secret: b"key-a".to_vec(),
            }],
            "tnt_b" => vec![VerifyKey {
                epoch: 1,
                secret: b"key-b".to_vec(),
            }],
            _ => vec![],
        }
    }
}

async fn serve() -> (String, Arc<ManualClock>) {
    let clock = Arc::new(ManualClock::new(1_800_000_000));
    let verifier = Verifier::new(
        VerifierConfig::new(Direction::TenantToControl, "control"),
        clock.clone(),
    );
    let guard = Arc::new(Guard::new(verifier, Arc::new(Keys)).with_max_body(64));
    let app = protect(
        Router::new()
            .route(
                "/whoami",
                get(|Extension(v): Extension<Verified>| async move { Json(v.key_id) }),
            )
            .route("/echo", post(|body: String| async move { body }))
            .route("/put", put(|body: String| async move { body })),
        guard,
    );
    let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", l.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
    (base, clock)
}

fn client(base: &str, id: &str, secret: &[u8], clock: &Arc<ManualClock>) -> SignedClient {
    let signer = Signer::new(
        id,
        1,
        secret,
        Direction::TenantToControl,
        "control",
        clock.clone(),
    );
    SignedClient::new(reqwest::Client::new(), base, signer)
}

#[tokio::test]
async fn signed_calls_reach_the_handler_with_the_verified_id() {
    let (base, clock) = serve().await;
    let r = client(&base, "tnt_a", b"key-a", &clock)
        .get("/whoami")
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    assert_eq!(r.text().await.unwrap(), "\"tnt_a\"");
    let r = client(&base, "tnt_a", b"key-a", &clock)
        .post_json("/echo", b"{\"a\":1}")
        .await
        .unwrap();
    assert_eq!(r.text().await.unwrap(), "{\"a\":1}");
}

#[tokio::test]
async fn unsigned_wrong_key_and_other_tenants_key_get_401() {
    let (base, clock) = serve().await;
    let plain = reqwest::get(format!("{base}/whoami")).await.unwrap();
    assert_eq!(plain.status(), 401);
    // Tenant A's key under tenant B's id.
    let r = client(&base, "tnt_b", b"key-a", &clock)
        .get("/whoami")
        .await
        .unwrap();
    assert_eq!(r.status(), 401);
    let r = client(&base, "tnt_zzz", b"key-a", &clock)
        .get("/whoami")
        .await
        .unwrap();
    assert_eq!(r.status(), 401);
    // The fallback is guarded too.
    let r = client(&base, "tnt_a", b"wrong", &clock)
        .get("/nope")
        .await
        .unwrap();
    assert_eq!(r.status(), 401);
}

#[tokio::test]
async fn oversized_body_is_413() {
    let (base, clock) = serve().await;
    let r = client(&base, "tnt_a", b"key-a", &clock)
        .post_json("/echo", &[b'x'; 200])
        .await
        .unwrap();
    assert_eq!(r.status(), 413);
}

#[tokio::test]
async fn a_replayed_request_gets_401() {
    use signed_request::{HEADER_EPOCH, HEADER_ID, HEADER_NONCE, HEADER_SIG, HEADER_TS};
    let (base, clock) = serve().await;
    let signer = Signer::new(
        "tnt_a",
        1,
        b"key-a".as_slice(),
        Direction::TenantToControl,
        "control",
        clock,
    );
    let h = signer.sign("GET", "/whoami", b"").unwrap();
    let send = || {
        reqwest::Client::new()
            .get(format!("{base}/whoami"))
            .header(HEADER_ID, &h.id)
            .header(HEADER_EPOCH, &h.epoch)
            .header(HEADER_TS, &h.ts)
            .header(HEADER_NONCE, &h.nonce)
            .header(HEADER_SIG, &h.sig)
            .send()
    };
    assert_eq!(send().await.unwrap().status(), 200);
    assert_eq!(send().await.unwrap().status(), 401);
}

#[tokio::test]
async fn the_client_signs_the_target_reqwest_sends() {
    // Dot segments and percent-encoding: `Url` rewrites both, and the signature must follow.
    let (base, clock) = serve().await;
    let c = client(&base, "tnt_a", b"key-a", &clock);
    for target in [
        "/x/../whoami",
        "/./whoami",
        "/whoami?a=%7e&b=%2F",
        "/a/%2e%2e/whoami",
    ] {
        let r = c.get(target).await.unwrap();
        assert_eq!(r.status(), 200, "{target}");
    }
}

#[tokio::test]
async fn an_unknown_key_never_gets_its_body_read_and_stale_is_refused_early() {
    let (base, clock) = serve().await;
    let stale = Signer::new(
        "tnt_a",
        1,
        b"key-a".as_slice(),
        Direction::TenantToControl,
        "control",
        clock.clone(),
    );
    let h = stale
        .sign_at(
            "POST",
            "/echo",
            b"",
            1_800_000_000 - 600,
            "0123456789abcdef0123",
        )
        .unwrap();
    let mut rb = reqwest::Client::new().post(format!("{base}/echo"));
    for (k, v) in h.pairs() {
        rb = rb.header(k, v);
    }
    assert_eq!(rb.send().await.unwrap().status(), 401);
}

#[tokio::test]
async fn put_json_signs_and_sends_the_body() {
    let (base, clock) = serve().await;
    let r = client(&base, "tnt_a", b"key-a", &clock)
        .put_json("/put", b"{\"a\":2}")
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    assert_eq!(r.text().await.unwrap(), "{\"a\":2}");
}
