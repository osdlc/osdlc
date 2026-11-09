//! Put an axum app on the local network safely: listen settings, minted tokens,
//! a request guard with grants and access contexts, a route permission table,
//! interface enumeration and a server that can be stopped.
//!
//! Start with [`serve`] for one server behind a token, or [`SharingRuntime`]
//! for an app whose settings page turns sharing on and off. The guard's order
//! of checks is in [`guard`]. The README below has the full picture.
#![forbid(unsafe_code)]

mod config;
pub mod context;
pub mod guard;
mod interfaces;
mod origin;
pub mod permissions;
mod response;
pub mod runtime;
mod serve;
pub mod token;

pub use config::{Listen, WebAccessConfig};
pub use context::{AccessContext, Grant};
pub use guard::{
    Denial, DenialReason, GuardPolicy, GuardState, Tokens, TokensError, origin_matches_host,
};
pub use interfaces::{InterfaceAddr, interfaces};
pub use origin::{is_local_authority, is_local_origin};
pub use permissions::{HostPolicy, RouteRule, host_policy_layer};
pub use runtime::{ConfigStore, RuntimeError, ShareUrls, SharingRuntime, WebAccessStatus};
pub use serve::{ServeError, ServeOptions, ServerHandle, serve, serve_opts, share_url};

// Runs the README's and the guide's code blocks as doc-tests, so they stay true.
#[doc = include_str!("../README.md")]
#[cfg(doctest)]
pub struct ReadmeDoctests;

#[doc = include_str!("../docs/guide.md")]
#[cfg(doctest)]
pub struct GuideDoctests;
