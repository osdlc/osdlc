//! axum/tower middleware for the verifying side (feature `axum`).
//!
//! [`protect`] puts a [`Guard`] in front of every route of a router. A handler behind it reads
//! the [`Verified`] key id and epoch from the request extensions.
//!
//! ```
//! use std::sync::Arc;
//!
//! use axum::body::Body;
//! use axum::extract::Extension;
//! use axum::http::{Request, StatusCode};
//! use axum::routing::get;
//! use axum::Router;
//! use signed_request::middleware::{Guard, StaticKeys, protect};
//! use signed_request::{Direction, Signer, Verified, Verifier, VerifierConfig, VerifyKey, SystemClock};
//! use tower::ServiceExt;
//!
//! # #[tokio::main]
//! # async fn main() {
//! let clock = Arc::new(SystemClock);
//! let secret = b"0123456789abcdef0123456789abcdef".to_vec();
//!
//! // The verifying side: tenant "acme" may call us, with one key at epoch 1.
//! let verifier = Verifier::new(
//!     VerifierConfig::new(Direction::TenantToControl, "control"),
//!     clock.clone(),
//! );
//! let keys = StaticKeys::new("acme", vec![VerifyKey { epoch: 1, secret: secret.clone() }]);
//! let guard = Arc::new(Guard::new(verifier, Arc::new(keys)));
//! let app = protect(
//!     Router::new().route(
//!         "/whoami",
//!         get(|Extension(v): Extension<Verified>| async move { v.key_id }),
//!     ),
//!     guard,
//! );
//!
//! // The signing side.
//! let signer = Signer::new("acme", 1, secret, Direction::TenantToControl, "control", clock);
//! let mut req = Request::get("/whoami");
//! for (name, value) in signer.sign("GET", "/whoami", b"").unwrap().pairs() {
//!     req = req.header(name, value);
//! }
//! let res = app.clone().oneshot(req.body(Body::empty()).unwrap()).await.unwrap();
//! assert_eq!(res.status(), StatusCode::OK);
//!
//! // Without a signature the request never reaches the handler.
//! let res = app.oneshot(Request::get("/whoami").body(Body::empty()).unwrap()).await.unwrap();
//! assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
//! # }
//! ```
//!
//! Every response to a request that fails is the same `401 {"error":"unauthorized"}`, with three
//! exceptions: `413` (empty body) for a body over the guard's limit or one that cannot be read,
//! `429` for a key id at its replay quota and `503` for a full replay cache. The reason goes to
//! the reject hook ([`Guard::with_reject_hook`]) only, and the hook sees every one of these,
//! the `413`s included.
//!
//! # Order of the checks
//!
//! Header shapes, then the timestamp window, then the declared `Content-Length`, then the key
//! lookup (an unknown key id never gets its body read), then the body is read up to the limit,
//! and last the MAC and the replay cache ([`Verifier::verify`]).
//!
//! # Where it applies
//!
//! [`protect`] wraps the router it is given, fallback included. Routes added to the returned
//! router afterwards are not covered. The signature is checked against the request target as the
//! middleware sees it, so do not `nest` the protected router under a prefix: the prefix is
//! stripped before the check and every request would fail. Nest first, then protect the result.
//!
//! The body is buffered in memory, up to the limit (1 MiB by default), for every request whose
//! key id the resolver knows, before the MAC is checked. Rate-limit callers at the edge.

use std::sync::Arc;

use async_trait::async_trait;
use axum::Router;
use axum::body::{Body, to_bytes};
use axum::extract::{Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{Next, from_fn_with_state};
use axum::response::{IntoResponse, Response};

use crate::verify::{Presented, Verified, Verifier, VerifyError, VerifyKey};

/// Looks up the keys a key id may sign with right now. Returning several epochs is how a
/// rotation's grace window is expressed; returning none means the id is unknown.
///
/// The trait is declared with `#[async_trait]`, so implement it with that attribute from the
/// `async-trait` crate.
#[async_trait]
pub trait KeyResolver: Send + Sync {
    /// The keys `key_id` may sign with now, one per accepted epoch; empty if the id is unknown.
    async fn keys(&self, key_id: &str) -> Vec<VerifyKey>;
}

/// A [`KeyResolver`] with one fixed key id and its keys: for a party that only ever hears from
/// one peer. Any other key id resolves to no keys.
pub struct StaticKeys {
    key_id: String,
    keys: Vec<VerifyKey>,
}

impl StaticKeys {
    /// Resolve `key_id` to `keys` (one per accepted epoch).
    pub fn new(key_id: impl Into<String>, keys: Vec<VerifyKey>) -> Self {
        Self {
            key_id: key_id.into(),
            keys,
        }
    }
}

#[async_trait]
impl KeyResolver for StaticKeys {
    async fn keys(&self, key_id: &str) -> Vec<VerifyKey> {
        if key_id == self.key_id {
            self.keys.clone()
        } else {
            Vec::new()
        }
    }
}

type RejectHook = Arc<dyn Fn(&VerifyError) + Send + Sync>;

/// A [`Verifier`] and a [`KeyResolver`] with a body limit and an optional reject hook: the state
/// [`protect`] and [`require_signature`] share.
pub struct Guard {
    verifier: Verifier,
    resolver: Arc<dyn KeyResolver>,
    max_body: usize,
    on_reject: Option<RejectHook>,
}

impl Guard {
    /// A guard that checks with `verifier` against the keys `resolver` returns. Bodies over 1 MiB
    /// are refused; change with [`Guard::with_max_body`].
    pub fn new(verifier: Verifier, resolver: Arc<dyn KeyResolver>) -> Self {
        Self {
            verifier,
            resolver,
            max_body: 1 << 20,
            on_reject: None,
        }
    }

    /// Refuse bodies over `bytes` with `413`, judged by the declared `Content-Length` and again
    /// while reading.
    pub fn with_max_body(mut self, bytes: usize) -> Self {
        self.max_body = bytes;
        self
    }

    /// Called with the reason for every rejection, the `413`s included (log it; never send it to
    /// the caller). A body over the limit, or one that cannot be read, reaches the hook as
    /// [`VerifyError::Malformed`].
    pub fn with_reject_hook(mut self, f: impl Fn(&VerifyError) + Send + Sync + 'static) -> Self {
        self.on_reject = Some(Arc::new(f));
        self
    }

    fn notify(&self, e: &VerifyError) {
        if let Some(h) = &self.on_reject {
            h(e);
        }
    }

    /// `413` with no body, after telling the hook why.
    fn too_large(&self, why: &'static str) -> Response {
        self.notify(&VerifyError::Malformed(why));
        StatusCode::PAYLOAD_TOO_LARGE.into_response()
    }

    fn reject(&self, e: &VerifyError) -> Response {
        self.notify(e);
        let status = match e {
            VerifyError::ReplayCacheFull => StatusCode::SERVICE_UNAVAILABLE,
            VerifyError::KeyQuotaExceeded => StatusCode::TOO_MANY_REQUESTS,
            _ => StatusCode::UNAUTHORIZED,
        };
        (
            status,
            [(header::CONTENT_TYPE, "application/json")],
            r#"{"error":"unauthorized"}"#,
        )
            .into_response()
    }
}

/// The middleware function behind [`protect`]. Buffers the body (up to the guard's limit),
/// verifies, rebuilds the request with the same body and adds [`Verified`] to its extensions.
/// Use [`protect`] unless you build the layer yourself with `from_fn_with_state`.
pub async fn require_signature(
    State(guard): State<Arc<Guard>>,
    req: Request,
    next: Next,
) -> Response {
    let (mut parts, body) = req.into_parts();
    // Cheap checks first, none of which touches the key store or reads the body: header shapes,
    // the timestamp window and the declared body size.
    let presented = match Presented::parse(|n| parts.headers.get(n).and_then(|v| v.to_str().ok())) {
        Ok(p) => p,
        Err(e) => return guard.reject(&e),
    };
    if let Err(e) = guard.verifier.precheck(&presented) {
        return guard.reject(&e);
    }
    let declared = parts
        .headers
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok());
    if declared.is_some_and(|n| n > guard.max_body) {
        return guard.too_large("declared body size over the limit");
    }
    // Then the key lookup, so an unknown id never gets its body read.
    let keys = guard.resolver.keys(&presented.key_id).await;
    if keys.is_empty() {
        return guard.reject(&VerifyError::UnknownKey);
    }
    let bytes = match to_bytes(body, guard.max_body).await {
        Ok(b) => b,
        Err(_) => return guard.too_large("body over the limit or unreadable"),
    };
    let target = parts.uri.path_and_query().map_or_else(
        || parts.uri.path().to_string(),
        |pq| pq.as_str().to_string(),
    );
    match guard
        .verifier
        .verify(&presented, parts.method.as_str(), &target, &bytes, &keys)
    {
        Ok(v) => {
            parts.extensions.insert::<Verified>(v);
            next.run(Request::from_parts(parts, Body::from(bytes)))
                .await
        }
        Err(e) => guard.reject(&e),
    }
}

/// Put [`require_signature`] in front of every route of `router`, fallback included. Routes
/// added to the result afterwards are not protected, and a router protected here must not be
/// `nest`ed (see the module docs).
pub fn protect<S: Clone + Send + Sync + 'static>(
    router: Router<S>,
    guard: Arc<Guard>,
) -> Router<S> {
    router.layer(from_fn_with_state(guard, require_signature))
}
