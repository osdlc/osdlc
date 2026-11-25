//! A reqwest client that signs every request it sends (feature `reqwest`).

use crate::canonical::CanonicalError;
use crate::sign::Signer;

/// Why a signed request was not sent or did not complete.
#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    /// The target or another field cannot be put in the signed string; nothing was sent.
    #[error(transparent)]
    Sign(#[from] CanonicalError),
    /// reqwest failed to send the request or read the response.
    #[error(transparent)]
    Http(#[from] reqwest::Error),
}

/// A client for one base URL that signs every request it sends with one [`Signer`]. Cheap to
/// clone.
///
/// The signature covers the method, the target and the body, and nothing else: headers such as
/// `Content-Type` or an idempotency key are not signed.
#[derive(Debug, Clone)]
pub struct SignedClient {
    http: reqwest::Client,
    /// Scheme and authority, no trailing slash, e.g. `http://[fdaa::1]:8081`.
    base: String,
    signer: Signer,
}

impl SignedClient {
    /// A client that sends through `http` to `base` (scheme and authority, for example
    /// `http://127.0.0.1:8081`; trailing slashes are dropped), signing with `signer`.
    ///
    /// Build `http` with `redirect::Policy::none()`: reqwest follows redirects by default and
    /// would send the `x-det-*` headers (key id and epoch) to wherever the server points.
    ///
    /// Paths passed to the request methods must start with `/`. The base and the path are joined
    /// as text, so a path that does not (such as `@other-host/x`) can change the destination:
    /// pass only paths your own code produced.
    pub fn new(http: reqwest::Client, base: impl Into<String>, signer: Signer) -> Self {
        Self {
            http,
            base: base.into().trim_end_matches('/').to_string(),
            signer,
        }
    }

    /// Build the URL first and sign what reqwest will put on the wire: `Url` resolves dot
    /// segments and normalises percent-encoding, so signing the string given would sign a target
    /// the server never sees.
    fn prepare(
        &self,
        method: &str,
        path_and_query: &str,
        body: &[u8],
    ) -> Result<(reqwest::Url, crate::SignedHeaders), ClientError> {
        let url = reqwest::Url::parse(&format!("{}{path_and_query}", self.base))
            .map_err(|_| CanonicalError::Invalid("not a valid URL"))?;
        let target = match url.query() {
            Some(q) => format!("{}?{q}", url.path()),
            None => url.path().to_string(),
        };
        let signed = self.signer.sign(method, &target, body)?;
        Ok((url, signed))
    }

    async fn dispatch(
        &self,
        method: reqwest::Method,
        path_and_query: &str,
        body: Vec<u8>,
        json: bool,
    ) -> Result<reqwest::Response, ClientError> {
        let (url, signed) = self.prepare(method.as_str(), path_and_query, &body)?;
        let mut rb = self.http.request(method, url).body(body);
        if json {
            rb = rb.header("content-type", "application/json");
        }
        for (name, value) in signed.pairs() {
            rb = rb.header(name, value);
        }
        Ok(rb.send().await?)
    }

    /// Send `method path_and_query` with `body`, signed now.
    ///
    /// # Errors
    ///
    /// [`ClientError::Sign`] if the URL or a signed field is invalid, [`ClientError::Http`] if
    /// the request fails.
    pub async fn send(
        &self,
        method: reqwest::Method,
        path_and_query: &str,
        body: Vec<u8>,
    ) -> Result<reqwest::Response, ClientError> {
        self.dispatch(method, path_and_query, body, false).await
    }

    /// `GET path_and_query` with no body, signed now.
    ///
    /// # Errors
    ///
    /// As [`SignedClient::send`].
    pub async fn get(&self, path_and_query: &str) -> Result<reqwest::Response, ClientError> {
        self.send(reqwest::Method::GET, path_and_query, Vec::new())
            .await
    }

    /// POST `json` (already serialised) with a JSON content type.
    ///
    /// # Errors
    ///
    /// As [`SignedClient::send`].
    pub async fn post_json(
        &self,
        path_and_query: &str,
        json: &[u8],
    ) -> Result<reqwest::Response, ClientError> {
        self.dispatch(reqwest::Method::POST, path_and_query, json.to_vec(), true)
            .await
    }

    /// PUT `json` (already serialised) with a JSON content type.
    ///
    /// # Errors
    ///
    /// As [`SignedClient::send`].
    pub async fn put_json(
        &self,
        path_and_query: &str,
        json: &[u8],
    ) -> Result<reqwest::Response, ClientError> {
        self.dispatch(reqwest::Method::PUT, path_and_query, json.to_vec(), true)
            .await
    }
}
