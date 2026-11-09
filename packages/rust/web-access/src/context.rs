//! Where a request comes from and how much it may do.
//!
//! The guard resolves both per request and stores them in the request
//! extensions; handlers read them with the extractors below. A missing
//! extension fails closed to [`AccessContext::WebRemote`] / [`Grant::Read`].

use std::convert::Infallible;
use std::net::SocketAddr;

use axum::extract::FromRequestParts;
use axum::http::Extensions;
use axum::http::request::Parts;
use serde::{Deserialize, Serialize};

/// Where a request came from, derived from the canonicalised peer address (so
/// behind a reverse proxy every request looks local).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub enum AccessContext {
    /// The app's own window, over IPC. HTTP never yields it.
    Desktop,
    /// HTTP from a loopback peer.
    WebLocal,
    /// HTTP from any other peer, or one that is unknown.
    WebRemote,
}

impl AccessContext {
    /// `WebLocal` for a loopback peer (IPv4-mapped IPv6 included), else
    /// `WebRemote`; no peer is `WebRemote`.
    pub fn from_peer(peer: Option<SocketAddr>) -> Self {
        match peer {
            Some(p) if p.ip().to_canonical().is_loopback() => Self::WebLocal,
            _ => Self::WebRemote,
        }
    }
}

/// How much a request may do.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub enum Grant {
    /// View only: non-safe methods are refused unless a route is listed read-safe.
    Read,
    /// Everything the context allows.
    Full,
    /// Full, plus what hands a peer a shell on this machine. Declared last:
    /// rank is the declaration order.
    Admin,
}

impl AccessContext {
    /// The context the guard stored, else `WebRemote` (fail closed).
    pub fn from_extensions(ext: &Extensions) -> Self {
        ext.get::<Self>().copied().unwrap_or(Self::WebRemote)
    }
}

impl Grant {
    /// The grant the guard stored, else `Read` (fail closed).
    pub fn from_extensions(ext: &Extensions) -> Self {
        ext.get::<Self>().copied().unwrap_or(Self::Read)
    }
}

impl<S: Send + Sync> FromRequestParts<S> for AccessContext {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Infallible> {
        Ok(Self::from_extensions(&parts.extensions))
    }
}

impl<S: Send + Sync> FromRequestParts<S> for Grant {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Infallible> {
        Ok(Self::from_extensions(&parts.extensions))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(peer: &str) -> AccessContext {
        AccessContext::from_peer(Some(peer.parse().unwrap()))
    }

    #[test]
    fn loopback_is_local_and_everything_else_is_remote() {
        assert_eq!(ctx("127.0.0.1:1"), AccessContext::WebLocal);
        assert_eq!(ctx("[::1]:1"), AccessContext::WebLocal);
        assert_eq!(ctx("[::ffff:127.0.0.1]:1"), AccessContext::WebLocal);
        assert_eq!(ctx("192.168.1.9:1"), AccessContext::WebRemote);
        assert_eq!(ctx("[::ffff:192.168.1.9]:1"), AccessContext::WebRemote);
        assert_eq!(AccessContext::from_peer(None), AccessContext::WebRemote);
    }

    #[test]
    fn serializes_camel_case() {
        let json = |v: serde_json::Value| v.to_string();
        let ctx = serde_json::to_value(AccessContext::WebLocal).unwrap();
        let grant = serde_json::to_value(Grant::Full).unwrap();
        assert_eq!(json(ctx), "\"webLocal\"");
        assert_eq!(json(grant), "\"full\"");
    }

    #[tokio::test]
    async fn extractors_fail_closed_without_an_extension() {
        let (mut parts, ()) = axum::http::Request::new(()).into_parts();
        assert_eq!(
            AccessContext::from_request_parts(&mut parts, &()).await,
            Ok(AccessContext::WebRemote)
        );
        assert_eq!(
            Grant::from_request_parts(&mut parts, &()).await,
            Ok(Grant::Read)
        );
        parts.extensions.insert(Grant::Full);
        assert_eq!(
            Grant::from_request_parts(&mut parts, &()).await,
            Ok(Grant::Full)
        );
    }
}
