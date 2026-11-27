//! Sign a request on one side and verify it on the other, with no HTTP stack in between.
//!
//! Run with `cargo run -p signed-request --example sign_and_verify`.

use std::sync::Arc;

use signed_request::{
    Direction, ManualClock, Presented, Signer, Verifier, VerifierConfig, VerifyError, VerifyKey,
};

/// Read the five signing headers back the way a server reads them from a request.
fn presented(headers: &signed_request::SignedHeaders) -> Presented {
    let pairs = headers.pairs();
    Presented::parse(|name| pairs.iter().find(|(n, _)| *n == name).map(|(_, v)| *v))
        .expect("headers made by the signer parse")
}

/// Runs the example; `tests/examples.rs` runs it too.
pub fn main() {
    // A manual clock keeps the example deterministic; production code passes `SystemClock`.
    let clock = Arc::new(ManualClock::new(1_800_000_000));
    let secret = b"0123456789abcdef0123456789abcdef".to_vec();

    let signer = Signer::new(
        "acme",
        1,
        secret.clone(),
        Direction::TenantToControl,
        "control",
        clock.clone(),
    );
    let verifier = Verifier::new(
        VerifierConfig::new(Direction::TenantToControl, "control"),
        clock.clone(),
    );
    let keys = [VerifyKey { epoch: 1, secret }];

    let body = br#"{"qty":2}"#;
    let headers = signer.sign("POST", "/orders?id=7", body).expect("signs");
    let request = presented(&headers);

    let verified = verifier
        .verify(&request, "POST", "/orders?id=7", body, &keys)
        .expect("a fresh, untampered request verifies");
    println!("verified {} at epoch {}", verified.key_id, verified.epoch);

    // The same request again is refused: its nonce was recorded.
    assert_eq!(
        verifier.verify(&request, "POST", "/orders?id=7", body, &keys),
        Err(VerifyError::Replay)
    );

    // A changed body, target or method does not verify.
    let other = presented(&signer.sign("POST", "/orders?id=7", body).expect("signs"));
    assert_eq!(
        verifier.verify(&other, "POST", "/orders?id=8", body, &keys),
        Err(VerifyError::BadSignature)
    );

    // A request signed a few minutes ago is outside the 60 second window.
    let old = presented(&signer.sign("GET", "/status", b"").expect("signs"));
    clock.advance(300);
    assert_eq!(
        verifier.verify(&old, "GET", "/status", b"", &keys),
        Err(VerifyError::Stale)
    );
}
