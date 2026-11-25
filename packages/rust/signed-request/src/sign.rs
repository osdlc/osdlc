//! The signing side: header names, the MAC and [`Signer`].

use std::sync::Arc;

use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::canonical::{CanonicalError, Direction, Parts, body_sha256_hex, canonical_string, hex};
use crate::clock::Clock;

/// Header carrying the key id: `x-det-id`.
pub const HEADER_ID: &str = "x-det-id";
/// Header carrying the key generation as plain decimal digits: `x-det-epoch`.
pub const HEADER_EPOCH: &str = "x-det-epoch";
/// Header carrying the signing time in unix seconds: `x-det-ts`.
pub const HEADER_TS: &str = "x-det-ts";
/// Header carrying the single-use nonce: `x-det-nonce`.
pub const HEADER_NONCE: &str = "x-det-nonce";
/// Header carrying the signature as lowercase hex: `x-det-sig`.
pub const HEADER_SIG: &str = "x-det-sig";

/// Lowercase hex HMAC-SHA256 of `canonical` under `secret`. Any key length is accepted,
/// including an empty one: choosing a long random secret is the caller's job.
pub fn sign_canonical(secret: &[u8], canonical: &str) -> String {
    hex(&mac(secret, canonical))
}

pub(crate) fn mac(secret: &[u8], canonical: &str) -> Vec<u8> {
    let mut m = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC takes any key length");
    m.update(canonical.as_bytes());
    m.finalize().into_bytes().to_vec()
}

/// The five header values to attach to a request, as returned by [`Signer::sign`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignedHeaders {
    /// Value for [`HEADER_ID`].
    pub id: String,
    /// Value for [`HEADER_EPOCH`].
    pub epoch: String,
    /// Value for [`HEADER_TS`].
    pub ts: String,
    /// Value for [`HEADER_NONCE`].
    pub nonce: String,
    /// Value for [`HEADER_SIG`].
    pub sig: String,
}

impl SignedHeaders {
    /// `(name, value)` pairs for the five headers, names lowercase, in the order id, epoch, ts,
    /// nonce, sig.
    pub fn pairs(&self) -> [(&'static str, &str); 5] {
        [
            (HEADER_ID, &self.id),
            (HEADER_EPOCH, &self.epoch),
            (HEADER_TS, &self.ts),
            (HEADER_NONCE, &self.nonce),
            (HEADER_SIG, &self.sig),
        ]
    }
}

/// Signs requests for one key, one direction and one audience. Cheap to clone (the secret is
/// shared); its `Debug` output hides the secret.
#[derive(Clone)]
pub struct Signer {
    key_id: String,
    epoch: u64,
    secret: Arc<Vec<u8>>,
    direction: Direction,
    audience: String,
    clock: Arc<dyn Clock>,
}

impl std::fmt::Debug for Signer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Signer")
            .field("key_id", &self.key_id)
            .field("epoch", &self.epoch)
            .field("direction", &self.direction)
            .field("audience", &self.audience)
            .field("secret", &"<redacted>")
            .finish()
    }
}

impl Signer {
    /// A signer for `key_id` at `epoch` with `secret`, for messages that travel `direction` to
    /// `audience`.
    ///
    /// The secret is not length-checked: an empty one signs and verifies. Use at least 32 random
    /// bytes. `key_id` and `audience` are checked when a request is signed, not here.
    pub fn new(
        key_id: impl Into<String>,
        epoch: u64,
        secret: impl Into<Vec<u8>>,
        direction: Direction,
        audience: impl Into<String>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            key_id: key_id.into(),
            epoch,
            secret: Arc::new(secret.into()),
            direction,
            audience: audience.into(),
            clock,
        }
    }

    /// Sign now, with the signer's clock and a fresh random nonce (32 hex characters).
    ///
    /// # Errors
    ///
    /// [`CanonicalError::Invalid`] if the key id, audience, method or target cannot be put in the
    /// signed string (see [`canonical_string`]).
    ///
    /// # Panics
    ///
    /// If the operating system's random source fails.
    pub fn sign(
        &self,
        method: &str,
        path_and_query: &str,
        body: &[u8],
    ) -> Result<SignedHeaders, CanonicalError> {
        let mut raw = [0u8; 16];
        getrandom::fill(&mut raw).expect("OS randomness");
        self.sign_at(
            method,
            path_and_query,
            body,
            self.clock.now_unix(),
            &hex(&raw),
        )
    }

    /// Sign with a given timestamp and nonce, for test vectors and tests. In production use
    /// [`Signer::sign`]: a verifier refuses a nonce it has seen, so reusing one makes the second
    /// request fail.
    ///
    /// Accepted ranges: the signer takes any `ts` (even a negative one) and any `u64` epoch, but a
    /// [`Verifier`](crate::Verifier) parses the headers strictly and refuses a request whose
    /// timestamp is negative or whose epoch or timestamp has more than 19 decimal digits
    /// ([`VerifyError::Malformed`](crate::VerifyError::Malformed)). Stay within `0..=i64::MAX` for
    /// `ts` and below `10^19` for the epoch if the request is to verify.
    ///
    /// # Errors
    ///
    /// [`CanonicalError::Invalid`] if a field cannot be put in the signed string, including a
    /// nonce that is not 16 to 64 characters of `[A-Za-z0-9_-]`.
    pub fn sign_at(
        &self,
        method: &str,
        path_and_query: &str,
        body: &[u8],
        ts: i64,
        nonce: &str,
    ) -> Result<SignedHeaders, CanonicalError> {
        let body_hash = body_sha256_hex(body);
        let canonical = canonical_string(&Parts {
            direction: self.direction,
            audience: &self.audience,
            key_id: &self.key_id,
            epoch: self.epoch,
            method,
            path_and_query,
            ts,
            nonce,
            body_sha256_hex: &body_hash,
        })?;
        Ok(SignedHeaders {
            id: self.key_id.clone(),
            epoch: self.epoch.to_string(),
            ts: ts.to_string(),
            nonce: nonce.to_string(),
            sig: sign_canonical(&self.secret, &canonical),
        })
    }
}
