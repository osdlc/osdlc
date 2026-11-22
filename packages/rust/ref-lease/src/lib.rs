//! The protocol half of compare-and-swap leases on git refs.
//!
//! `@osdlc/ref-lease` (TypeScript) writes a lease by pushing a commit to a ref
//! with `git push --force-with-lease`, and reads one by fetching it. The remote
//! is the authority. This crate holds the parts of that protocol that are
//! pure functions, so a Rust caller reads git's answers and encodes a payload
//! exactly as the TypeScript package does:
//!
//! - [`push_outcome`] says what a push's per-ref result means.
//! - [`fetch_failure`] says what a failed fetch's stderr means.
//! - [`canonical_json`] encodes a payload to deterministic bytes.
//!
//! ```
//! use ref_lease::{PushFlag, PushOutcome, canonical_json, push_outcome};
//! use serde_json::json;
//!
//! // The authority already held the sha we pushed, and we expected it to.
//! let up_to_date = PushFlag { flag: '=', rejection: None };
//! assert_eq!(push_outcome(up_to_date, true), PushOutcome::Ok);
//!
//! // Keys are sorted at every depth, with no whitespace.
//! let payload = json!({ "owner": "a", "expires": 1.5 });
//! assert_eq!(canonical_json(&payload), r#"{"expires":1.5,"owner":"a"}"#);
//! ```
//!
//! Both implementations run one conformance suite,
//! `packages/conformance/ref-lease/suite.json`. This crate does not run git:
//! the push and fetch themselves are not here yet.

#![forbid(unsafe_code)]
#![warn(missing_docs, clippy::missing_errors_doc, clippy::missing_panics_doc)]

mod canonical;
mod classify;

pub use canonical::canonical_json;
pub use classify::{FetchFailure, PushFlag, PushOutcome, fetch_failure, push_outcome};
