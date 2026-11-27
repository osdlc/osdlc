#![doc = include_str!("../README.md")]
//!
//! # Headers are not covered
//!
//! The signature covers the method, the target, the body and the five signing headers, and
//! nothing else. No other HTTP header (`Content-Type`, `Host`, an idempotency key, ...) is
//! protected: a value that matters must be sent in the body or the query.
//!
//! # Order of the checks
//!
//! [`Verifier::verify`] checks, in this order: keys given, timestamp in the window, a key for the
//! presented epoch, the MAC in constant time, and only then records the nonce, so a forged
//! request never reaches the replay cache. The axum middleware does its cheap checks before
//! asking for keys: header shapes, the window, the declared body size, the key lookup, and only
//! then the body and the MAC.
#![forbid(unsafe_code)]
#![warn(missing_docs)]

mod canonical;
mod clock;
mod sign;
mod verify;

#[cfg(feature = "reqwest")]
pub mod client;
#[cfg(feature = "axum")]
pub mod middleware;

pub use canonical::{
    CanonicalError, Direction, Parts, body_sha256_hex, canonical_string, check_target,
};
pub use clock::{Clock, ManualClock, SystemClock};
pub use sign::{
    HEADER_EPOCH, HEADER_ID, HEADER_NONCE, HEADER_SIG, HEADER_TS, SignedHeaders, Signer,
    sign_canonical,
};
pub use verify::{
    Presented, ReplayCache, Verified, Verifier, VerifierConfig, VerifyError, VerifyKey,
};
