//! The canonical signing string: what the MAC covers, and the checks that keep it unambiguous.

use sha2::{Digest, Sha256};

/// Which way a message travels between the two parties of a pair. Part of the signed string, so
/// a signature made for one direction never verifies in the other.
///
/// The two roles are called "tenant" (the many) and "control" (the one they call). Which of your
/// services plays which role is your choice.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Direction {
    /// The tenant calling the control side.
    TenantToControl,
    /// The control side calling a tenant.
    ControlToTenant,
}

impl Direction {
    /// The name that goes into the signed string: `tenant-to-control` or `control-to-tenant`.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TenantToControl => "tenant-to-control",
            Self::ControlToTenant => "control-to-tenant",
        }
    }

    /// The inverse of [`Direction::as_str`]. `None` for any other text, including a different
    /// letter case.
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "tenant-to-control" => Some(Self::TenantToControl),
            "control-to-tenant" => Some(Self::ControlToTenant),
            _ => None,
        }
    }
}

/// A field of a request cannot be put into the signed string, because it could not be told apart
/// from the lines around it (a newline, a control character, a wrong shape).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum CanonicalError {
    /// The field is refused; the text says which one and why.
    #[error("{0}")]
    Invalid(&'static str),
}

/// Lowercase hex of the body's SHA-256: the last line of the signed string.
pub fn body_sha256_hex(body: &[u8]) -> String {
    hex(&Sha256::digest(body))
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        })
}

/// Check a request target (`/path` or `/path?query`) and return it unchanged. The target is
/// signed exactly as sent: not sorted, not decoded, and a `?` with an empty query differs from no
/// `?`. Signer and verifier both see the bytes on the wire, so nothing needs normalising, and
/// nothing an on-path party reorders (duplicate keys) can pass. A fragment is not part of a
/// request target and is refused.
///
/// # Errors
///
/// [`CanonicalError::Invalid`] if the target holds a `#`, does not start with `/`, or holds a
/// control character or a space.
pub fn check_target(path_and_query: &str) -> Result<&str, CanonicalError> {
    if path_and_query.contains('#') {
        return Err(CanonicalError::Invalid("a request target has no fragment"));
    }
    if !path_and_query.starts_with('/') {
        return Err(CanonicalError::Invalid("path must start with '/'"));
    }
    if path_and_query.chars().any(|c| c.is_control() || c == ' ') {
        return Err(CanonicalError::Invalid(
            "control character or space in the request target",
        ));
    }
    Ok(path_and_query)
}

pub(crate) fn token(s: &str, what: &'static str) -> Result<(), CanonicalError> {
    if s.is_empty() || s.len() > 128 || !s.bytes().all(|b| b.is_ascii_graphic()) {
        return Err(CanonicalError::Invalid(what));
    }
    Ok(())
}

/// Everything the signature covers, by reference. [`canonical_string`] turns it into the string
/// the MAC is computed over.
#[derive(Debug, Clone, Copy)]
pub struct Parts<'a> {
    /// Which way the message travels.
    pub direction: Direction,
    /// Who the message is for (1 to 128 printable ASCII characters).
    pub audience: &'a str,
    /// The key id (1 to 128 printable ASCII characters).
    pub key_id: &'a str,
    /// The key generation.
    pub epoch: u64,
    /// The HTTP method, upper-case letters.
    pub method: &'a str,
    /// The request target as sent, checked by [`check_target`].
    pub path_and_query: &'a str,
    /// Unix seconds.
    pub ts: i64,
    /// A single-use value of 16 to 64 characters of `[A-Za-z0-9_-]`.
    pub nonce: &'a str,
    /// The body's SHA-256 as 64 hex digits (see [`body_sha256_hex`]).
    pub body_sha256_hex: &'a str,
}

pub(crate) fn check_nonce(nonce: &str) -> Result<(), CanonicalError> {
    if !(16..=64).contains(&nonce.len())
        || !nonce
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(CanonicalError::Invalid(
            "nonce must be 16 to 64 of [A-Za-z0-9_-]",
        ));
    }
    Ok(())
}

/// The string the MAC covers: ten lines joined by `\n`, no trailing newline. Every variable
/// field is checked so it cannot hold a newline, which is what makes the string parse one way.
///
/// # Errors
///
/// [`CanonicalError::Invalid`] naming the first field that is refused: the audience or key id
/// (not 1 to 128 printable ASCII characters), the method (not upper-case letters), the nonce, the
/// body hash (not 64 hex digits) or the target (see [`check_target`]).
pub fn canonical_string(p: &Parts<'_>) -> Result<String, CanonicalError> {
    token(
        p.audience,
        "audience must be 1 to 128 printable ASCII characters",
    )?;
    token(
        p.key_id,
        "key id must be 1 to 128 printable ASCII characters",
    )?;
    if p.method.is_empty() || !p.method.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(CanonicalError::Invalid("method must be upper-case letters"));
    }
    check_nonce(p.nonce)?;
    if p.body_sha256_hex.len() != 64 || !p.body_sha256_hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(CanonicalError::Invalid(
            "body hash must be 64 hex characters",
        ));
    }
    let target = check_target(p.path_and_query)?;
    Ok(format!(
        "det-signed-request/v1\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}",
        p.direction.as_str(),
        p.audience,
        p.key_id,
        p.epoch,
        p.method,
        target,
        p.ts,
        p.nonce,
        p.body_sha256_hex.to_ascii_lowercase(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_target_is_signed_as_sent() {
        assert_eq!(
            check_target("/a/b?z=1&&a=2&a=1&").unwrap(),
            "/a/b?z=1&&a=2&a=1&"
        );
        assert_ne!(check_target("/a?").unwrap(), check_target("/a").unwrap());
        assert_ne!(
            check_target("/a?x=%41").unwrap(),
            check_target("/a?x=A").unwrap()
        );
    }

    #[test]
    fn bad_targets_are_refused() {
        assert!(check_target("a").is_err());
        assert!(check_target("/a#frag").is_err());
        assert!(check_target("/a\nb").is_err());
        assert!(check_target("/a b").is_err());
    }
}
