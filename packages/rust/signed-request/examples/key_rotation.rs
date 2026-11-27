//! Rotate a key without refusing in-flight requests: the verifier accepts the old and the new
//! epoch for a grace window, then only the new one.
//!
//! Run with `cargo run -p signed-request --example key_rotation`.

use std::sync::Arc;

use signed_request::{
    Direction, ManualClock, Presented, SignedHeaders, Signer, Verifier, VerifierConfig,
    VerifyError, VerifyKey,
};

fn presented(headers: &SignedHeaders) -> Presented {
    let pairs = headers.pairs();
    Presented::parse(|name| pairs.iter().find(|(n, _)| *n == name).map(|(_, v)| *v))
        .expect("headers made by the signer parse")
}

fn signer_for(epoch: u64, secret: &[u8], clock: &Arc<ManualClock>) -> Signer {
    Signer::new(
        "acme",
        epoch,
        secret,
        Direction::ControlToTenant,
        "acme",
        clock.clone(),
    )
}

/// Runs the example; `tests/examples.rs` runs it too.
pub fn main() {
    let clock = Arc::new(ManualClock::new(1_800_000_000));
    let old_secret = b"old-secret-0123456789abcdef01234".to_vec();
    let new_secret = b"new-secret-0123456789abcdef01234".to_vec();
    let verifier = Verifier::new(
        VerifierConfig::new(Direction::ControlToTenant, "acme"),
        clock.clone(),
    );

    let old = VerifyKey {
        epoch: 1,
        secret: old_secret.clone(),
    };
    let new = VerifyKey {
        epoch: 2,
        secret: new_secret.clone(),
    };

    // Grace window: the key store hands the verifier both epochs. The request's epoch header
    // picks the key, so a sender that has not switched yet still verifies.
    let both = [old, new.clone()];
    for (epoch, secret) in [(1, &old_secret), (2, &new_secret)] {
        let headers = signer_for(epoch, secret, &clock)
            .sign("POST", "/hook", b"{}")
            .expect("signs");
        let verified = verifier
            .verify(&presented(&headers), "POST", "/hook", b"{}", &both)
            .expect("both epochs verify during the grace window");
        assert_eq!(verified.epoch, epoch);
    }

    // After the grace window the store hands over only the new key: the old epoch is refused.
    let stale_sender = signer_for(1, &old_secret, &clock)
        .sign("POST", "/hook", b"{}")
        .expect("signs");
    assert_eq!(
        verifier.verify(&presented(&stale_sender), "POST", "/hook", b"{}", &[new]),
        Err(VerifyError::UnknownEpoch)
    );
}
