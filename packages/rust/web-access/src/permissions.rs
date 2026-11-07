//! Route rules and the host policy: which permission a route needs, and
//! whether an access context and grant may use it.
//!
//! The crate enforces; the app declares the table. Apps pick their own
//! permission type `P`.

use std::sync::Arc;

use axum::body::Body;
use axum::extract::State;
use axum::http::{Method, Request, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use serde::Serialize;

use crate::context::{AccessContext, Grant};
use crate::response::{json_response, refuse};

/// A route and what it needs. `path` is exact, or a prefix when it ends in
/// `/*` (`/api/files/*` matches below `/api/files` only, never `/api/files`
/// itself). It is matched against the [`normalize_path`]d request path, so
/// write it in that form (no `//`, no trailing `/`). A `GET` rule also matches
/// `HEAD`, which axum serves from the `GET` handler.
#[derive(Debug, Clone)]
pub struct RouteRule<P> {
    /// `None` matches every method.
    pub method: Option<Method>,
    /// The normalised path, exact or ending in `/*`.
    pub path: String,
    /// What the route needs, in the app's own permission type.
    pub permission: P,
}

impl<P> RouteRule<P> {
    /// A rule for `method` (or every method, for `None`) on `path`.
    pub fn new(method: Option<Method>, path: impl Into<String>, permission: P) -> Self {
        Self {
            method,
            path: path.into(),
            permission,
        }
    }

    /// `path` must already be normalised.
    pub fn matches(&self, method: &Method, path: &str) -> bool {
        let method_ok = self
            .method
            .as_ref()
            .is_none_or(|m| m == method || (*m == Method::GET && *method == Method::HEAD));
        if !method_ok {
            return false;
        }
        match self.path.strip_suffix("/*") {
            Some(prefix) => path
                .strip_prefix(prefix)
                .is_some_and(|rest| rest.starts_with('/')),
            None => self.path == path,
        }
    }
}

/// The request path as handlers and fallbacks see it: percent-decoded per
/// segment, empty segments (`//`) dropped, no trailing `/`. `None` for a path
/// that cannot be normalised safely: a `.` or `..` segment, a `\` (literal or
/// escaped), an escaped `/` or NUL, a malformed or truncated escape (`%zz`,
/// `%+f`, `%4`), or invalid UTF-8. The guard answers those with 400, so rules
/// never see them.
pub fn normalize_path(raw: &str) -> Option<String> {
    let mut out = String::new();
    for seg in raw.split('/').filter(|s| !s.is_empty()) {
        let decoded = percent_decode(seg)?;
        if decoded == "." || decoded == ".." || decoded.contains('/') || decoded.contains('\\') {
            return None;
        }
        out.push('/');
        out.push_str(&decoded);
    }
    Some(if out.is_empty() { "/".to_owned() } else { out })
}

fn percent_decode(seg: &str) -> Option<String> {
    let bytes = seg.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = bytes.get(i + 1..i + 3)?;
            if !hex.iter().all(u8::is_ascii_hexdigit) {
                return None;
            }
            let hex = std::str::from_utf8(hex).ok()?;
            let byte = u8::from_str_radix(hex, 16).ok()?;
            if byte == b'\\' || byte == 0 {
                return None;
            }
            out.push(byte);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// The app's permission table and its decision function.
pub struct HostPolicy<P> {
    /// Whether `permission` may be used from `context` under `grant`.
    pub allows: fn(AccessContext, Grant, P) -> bool,
    /// The routes and what each needs. A route no rule matches is allowed.
    pub routes: Vec<RouteRule<P>>,
}

/// Middleware: refuse with 403 `forbidden_in_context` at the first matching
/// rule whose permission is denied; otherwise pass. Install it inside
/// [`guard`](crate::guard::guard) with `from_fn_with_state(Arc<HostPolicy<P>>, ..)`.
pub async fn host_policy_layer<P>(
    State(policy): State<Arc<HostPolicy<P>>>,
    req: Request<Body>,
    next: Next,
) -> Response
where
    P: Serialize + Copy + Send + Sync + 'static,
{
    let context = AccessContext::from_extensions(req.extensions());
    let grant = Grant::from_extensions(req.extensions());
    let Some(path) = normalize_path(req.uri().path()) else {
        return refuse(StatusCode::BAD_REQUEST, "bad path");
    };
    let denied = policy
        .routes
        .iter()
        .filter(|r| r.matches(req.method(), &path))
        .find(|r| !(policy.allows)(context, grant, r.permission));
    let Some(rule) = denied else {
        return next.run(req).await;
    };
    let body = serde_json::json!({
        "error": "forbidden_in_context",
        "permission": rule.permission,
        "context": context,
        "grant": grant,
    });
    json_response(StatusCode::FORBIDDEN, &body)
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use axum::http::header;
    use axum::routing::{get, post};
    use tower::ServiceExt;

    use super::*;

    #[derive(Debug, Clone, Copy, Serialize)]
    #[serde(rename_all = "camelCase")]
    enum Perm {
        Shell,
    }

    fn rule(method: Option<Method>, path: &str) -> RouteRule<()> {
        RouteRule::new(method, path, ())
    }

    #[test]
    fn rules_match_exact_prefix_and_method() {
        let exact = rule(None, "/api/a");
        assert!(exact.matches(&Method::GET, "/api/a"));
        assert!(!exact.matches(&Method::GET, "/api/a/b"));
        let prefix = rule(Some(Method::POST), "/api/files/*");
        assert!(prefix.matches(&Method::POST, "/api/files/a/b"));
        assert!(!prefix.matches(&Method::GET, "/api/files/a"));
        assert!(!prefix.matches(&Method::POST, "/api/files"));
        assert!(!prefix.matches(&Method::POST, "/api/filesx/a"));
    }

    #[test]
    fn a_get_rule_also_matches_head() {
        let get = RouteRule::new(Some(Method::GET), "/a", ());
        assert!(get.matches(&Method::HEAD, "/a"));
        assert!(!get.matches(&Method::POST, "/a"));
        let post = RouteRule::new(Some(Method::POST), "/a", ());
        assert!(!post.matches(&Method::HEAD, "/a"));
    }

    #[test]
    fn paths_normalise_and_unsafe_ones_are_rejected() {
        let n = normalize_path;
        assert_eq!(n("/").as_deref(), Some("/"));
        assert_eq!(
            n("/api/openers//open-file").as_deref(),
            Some("/api/openers/open-file")
        );
        assert_eq!(
            n("/api/openers/open-file/").as_deref(),
            Some("/api/openers/open-file")
        );
        assert_eq!(
            n("/api/%6Fpeners/open-file").as_deref(),
            Some("/api/openers/open-file")
        );
        assert_eq!(n("/a/../b"), None);
        assert_eq!(n("/a/./b"), None);
        assert_eq!(n("/a/%2e%2E/b"), None);
        assert_eq!(n("/a%2Fb"), None);
        assert_eq!(n("/a/%zz"), None);
        assert_eq!(n("/a/%ff"), None);
        assert_eq!(n("/a/%+f"), None);
        assert_eq!(n("/a/%5Cb"), None);
        assert_eq!(n("/a/%00"), None);
        assert_eq!(n("/a\\b"), None);
        assert_eq!(n("/a/%"), None);
        assert_eq!(n("/a/%4"), None);
        assert_eq!(n("/a%2fb"), None);
    }

    fn app() -> Router {
        let policy = HostPolicy {
            // Only a full or admin grant from a local web client may use the shell.
            allows: |ctx, grant, _: Perm| ctx != AccessContext::WebRemote && grant >= Grant::Full,
            routes: vec![
                RouteRule::new(Some(Method::POST), "/shell/*", Perm::Shell),
                RouteRule::new(Some(Method::GET), "/secret", Perm::Shell),
            ],
        };
        Router::new()
            .route("/shell/run", post(|| async { "ran" }))
            .route("/open", get(|| async { "open" }))
            .layer(axum::middleware::from_fn_with_state(
                Arc::new(policy),
                host_policy_layer::<Perm>,
            ))
    }

    fn req(method: Method, uri: &str, ctx: AccessContext, grant: Grant) -> Request<Body> {
        let mut r = Request::builder()
            .method(method)
            .uri(uri)
            .body(Body::empty())
            .unwrap();
        r.extensions_mut().insert(ctx);
        r.extensions_mut().insert(grant);
        r
    }

    #[tokio::test]
    async fn denied_rule_returns_the_forbidden_body_and_others_pass() {
        let res = app()
            .oneshot(req(
                Method::POST,
                "/shell/run",
                AccessContext::WebRemote,
                Grant::Full,
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        assert_eq!(res.headers()[header::CONTENT_TYPE], "application/json");
        let bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            body,
            serde_json::json!({
                "error": "forbidden_in_context",
                "permission": "shell",
                "context": "webRemote",
                "grant": "full",
            })
        );

        for (method, uri, ctx) in [
            (Method::POST, "/shell/run", AccessContext::WebLocal),
            (Method::GET, "/open", AccessContext::WebRemote),
        ] {
            let res = app()
                .oneshot(req(method, uri, ctx, Grant::Full))
                .await
                .unwrap();
            assert_eq!(res.status(), StatusCode::OK, "{uri}");
        }
    }

    #[tokio::test]
    async fn rules_apply_to_head_and_to_normalised_paths() {
        for (method, uri) in [
            (Method::HEAD, "/secret"),
            (Method::GET, "/secret/"),
            (Method::GET, "//secret"),
            (Method::GET, "/%73ecret"),
        ] {
            let r = req(method, uri, AccessContext::WebRemote, Grant::Full);
            let res = app().oneshot(r).await.unwrap();
            assert_eq!(res.status(), StatusCode::FORBIDDEN, "{uri}");
        }
        let r = req(
            Method::GET,
            "/a/../secret",
            AccessContext::WebLocal,
            Grant::Full,
        );
        let res = app().oneshot(r).await.unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    }

    /// Denies only a remote context or only a read grant, so the status tells
    /// which fail-closed default was applied.
    #[tokio::test]
    async fn missing_context_defaults_to_remote_and_to_read_separately() {
        let policy = |allows: fn(AccessContext, Grant, ()) -> bool| {
            let policy = HostPolicy {
                allows,
                routes: vec![RouteRule::new(None, "/x", ())],
            };
            Router::new().route("/x", get(|| async { "x" })).layer(
                axum::middleware::from_fn_with_state(Arc::new(policy), host_policy_layer::<()>),
            )
        };
        let bare = || Request::builder().uri("/x").body(Body::empty()).unwrap();
        // Allowed unless the context is WebRemote: the default is WebRemote.
        let res = policy(|c, _, ()| c != AccessContext::WebRemote)
            .oneshot(bare())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        // Allowed unless the grant is Read: the default is Read.
        let res = policy(|_, g, ()| g != Grant::Read)
            .oneshot(bare())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
        // Allowed only when remote and read: both defaults confirmed.
        let res = policy(|c, g, ()| c == AccessContext::WebRemote && g == Grant::Read)
            .oneshot(bare())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }
}
