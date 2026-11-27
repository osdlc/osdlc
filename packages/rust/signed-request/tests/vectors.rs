//! The golden vectors: the canonical string, body hash and signature must match byte for byte,
//! every vector must verify, and a signature never verifies in the other direction.

use std::sync::Arc;

use serde_json::Value;
use signed_request::{
    Direction, ManualClock, Presented, Signer, Verifier, VerifierConfig, VerifyError, VerifyKey,
    body_sha256_hex,
};

fn vectors() -> Value {
    serde_json::from_str(include_str!("vectors.json")).unwrap()
}

fn dir(v: &Value) -> Direction {
    Direction::parse(v.as_str().unwrap()).unwrap()
}

fn s(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap().to_string()
}

fn signer(c: &Value, clock: Arc<ManualClock>) -> Signer {
    Signer::new(
        s(c, "key_id"),
        c["epoch"].as_u64().unwrap(),
        s(c, "secret").into_bytes(),
        dir(&c["direction"]),
        s(c, "audience"),
        clock,
    )
}

fn presented(h: &signed_request::SignedHeaders) -> Presented {
    let pairs = h.pairs();
    Presented::parse(|n| pairs.iter().find(|(k, _)| *k == n).map(|(_, v)| *v)).unwrap()
}

#[test]
fn signatures_match_the_vectors() {
    let doc = vectors();
    let clock = Arc::new(ManualClock::new(doc["now"].as_i64().unwrap()));
    for c in doc["signing"].as_array().unwrap() {
        let body = s(c, "body");
        assert_eq!(
            body_sha256_hex(body.as_bytes()),
            s(c, "body_sha256"),
            "{}",
            c["name"]
        );
        let h = signer(c, clock.clone())
            .sign_at(
                &s(c, "method"),
                &s(c, "path_and_query"),
                body.as_bytes(),
                c["ts"].as_i64().unwrap(),
                &s(c, "nonce"),
            )
            .unwrap();
        assert_eq!(h.sig, s(c, "signature"), "{}", c["name"]);
    }
}

#[test]
fn every_vector_verifies_and_replays_once() {
    let doc = vectors();
    let clock = Arc::new(ManualClock::new(doc["now"].as_i64().unwrap()));
    for c in doc["signing"].as_array().unwrap() {
        let v = Verifier::new(
            VerifierConfig::new(dir(&c["direction"]), s(c, "audience")),
            clock.clone(),
        );
        let body = s(c, "body");
        let h = signer(c, clock.clone())
            .sign_at(
                &s(c, "method"),
                &s(c, "path_and_query"),
                body.as_bytes(),
                c["ts"].as_i64().unwrap(),
                &s(c, "nonce"),
            )
            .unwrap();
        let keys = [VerifyKey {
            epoch: c["epoch"].as_u64().unwrap(),
            secret: s(c, "secret").into_bytes(),
        }];
        let p = presented(&h);
        let (m, pq) = (s(c, "method"), s(c, "path_and_query"));
        let ok = v.verify(&p, &m, &pq, body.as_bytes(), &keys).unwrap();
        assert_eq!(ok.key_id, s(c, "key_id"));
        assert_eq!(
            v.verify(&p, &m, &pq, body.as_bytes(), &keys),
            Err(VerifyError::Replay)
        );
    }
}

#[test]
fn cross_direction_is_rejected_both_ways() {
    let doc = vectors();
    let clock = Arc::new(ManualClock::new(doc["now"].as_i64().unwrap()));
    let cases = doc["cross_direction"].as_array().unwrap();
    // One tenant-to-control and one control-to-tenant signature, each tried at the wrong listener.
    let dirs: std::collections::HashSet<_> =
        cases.iter().map(|x| s(x, "verifier_direction")).collect();
    assert_eq!(dirs.len(), 2, "both directions are covered");
    for x in cases {
        let c = doc["signing"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["name"] == x["signed_by"])
            .unwrap();
        // The same secret on both sides: only the signed direction/audience can tell them apart.
        let v = Verifier::new(
            VerifierConfig::new(dir(&x["verifier_direction"]), s(x, "verifier_audience")),
            clock.clone(),
        );
        let h = signer(c, clock.clone())
            .sign_at(
                &s(c, "method"),
                &s(c, "path_and_query"),
                s(c, "body").as_bytes(),
                c["ts"].as_i64().unwrap(),
                &s(c, "nonce"),
            )
            .unwrap();
        let keys = [VerifyKey {
            epoch: c["epoch"].as_u64().unwrap(),
            secret: s(c, "secret").into_bytes(),
        }];
        let got = v.verify(
            &presented(&h),
            &s(c, "method"),
            &s(c, "path_and_query"),
            s(c, "body").as_bytes(),
            &keys,
        );
        assert_eq!(got, Err(VerifyError::BadSignature), "{}", x["name"]);
    }
}
