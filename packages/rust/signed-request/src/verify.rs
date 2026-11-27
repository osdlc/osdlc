//! The verifying side: strict header parsing, the replay cache and [`Verifier`].

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use subtle::ConstantTimeEq;

use crate::canonical::{Direction, Parts, body_sha256_hex, canonical_string, check_nonce, token};
use crate::clock::Clock;
use crate::sign::{HEADER_EPOCH, HEADER_ID, HEADER_NONCE, HEADER_SIG, HEADER_TS, mac};

/// Why a request was refused. Log it; do not send the reason to the caller (the middleware
/// answers every authentication failure alike).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum VerifyError {
    /// A required header is absent (or not valid text); carries its name.
    #[error("missing header {0}")]
    MissingHeader(&'static str),
    /// A header, or the request as a whole, has a shape the scheme does not allow.
    #[error("malformed request signature: {0}")]
    Malformed(&'static str),
    /// The timestamp is further from the verifier's clock than the window allows.
    #[error("timestamp outside the allowed window")]
    Stale,
    /// No key is known for the key id.
    #[error("unknown key id")]
    UnknownKey,
    /// Keys exist for the key id but none for the presented epoch.
    #[error("no key for the presented epoch")]
    UnknownEpoch,
    /// The MAC does not match.
    #[error("signature does not match")]
    BadSignature,
    /// The same key id and nonce were already accepted inside the window.
    #[error("request already seen")]
    Replay,
    /// The replay cache holds as many live nonces as it may; the request is refused (fail closed).
    #[error("replay cache is full")]
    ReplayCacheFull,
    /// The key id already has as many live nonces as its quota allows.
    #[error("this key id has too many live requests")]
    KeyQuotaExceeded,
}

/// A key the verifier may check the MAC against. The caller (or a key resolver) supplies one per
/// epoch it accepts. `Debug` hides the secret; the secret is a plain `Vec<u8>`, cloneable and not
/// wiped from memory on drop.
#[derive(Clone)]
pub struct VerifyKey {
    /// The key generation this secret belongs to.
    pub epoch: u64,
    /// The shared secret. Use at least 32 random bytes.
    pub secret: Vec<u8>,
}

impl std::fmt::Debug for VerifyKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "VerifyKey(epoch {}, <redacted>)", self.epoch)
    }
}

/// The header values of a request, parsed by [`Presented::parse`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Presented {
    /// The key id the caller claims.
    pub key_id: String,
    /// The key generation the caller claims.
    pub epoch: u64,
    /// The signing time, unix seconds.
    pub ts: i64,
    /// The single-use value.
    pub nonce: String,
    /// The signature, decoded from hex.
    pub sig: Vec<u8>,
}

impl Presented {
    /// Parse from a header lookup (names are lowercase). Strict: the epoch and timestamp are
    /// plain decimal digits (no sign, no spaces), the signature is lowercase hex of even length,
    /// the key id and nonce have the shapes the canonical string allows. A value that parses two
    /// ways would let a captured signature be re-encoded.
    ///
    /// The epoch and timestamp take at most 19 digits, and the timestamp must fit `i64`.
    ///
    /// # Errors
    ///
    /// [`VerifyError::MissingHeader`] for an absent header, [`VerifyError::Malformed`] for a
    /// value of the wrong shape.
    pub fn parse<'a>(get: impl Fn(&str) -> Option<&'a str>) -> Result<Self, VerifyError> {
        let need = |name: &'static str| get(name).ok_or(VerifyError::MissingHeader(name));
        let key_id = need(HEADER_ID)?;
        token(key_id, "key id").map_err(|_| VerifyError::Malformed("key id"))?;
        let epoch = decimal(need(HEADER_EPOCH)?)
            .ok_or(VerifyError::Malformed("epoch is not plain digits"))?;
        let ts = decimal(need(HEADER_TS)?)
            .and_then(|v| i64::try_from(v).ok())
            .ok_or(VerifyError::Malformed("timestamp is not plain digits"))?;
        let nonce = need(HEADER_NONCE)?;
        check_nonce(nonce).map_err(|_| VerifyError::Malformed("nonce"))?;
        let sig = decode_hex(need(HEADER_SIG)?)
            .ok_or(VerifyError::Malformed("signature is not lowercase hex"))?;
        Ok(Self {
            key_id: key_id.to_string(),
            epoch,
            ts,
            nonce: nonce.to_string(),
            sig,
        })
    }
}

/// Plain decimal digits only: no sign, no whitespace, no leading zeros except `0`.
fn decimal(s: &str) -> Option<u64> {
    let ok = !s.is_empty()
        && s.len() <= 19
        && s.bytes().all(|b| b.is_ascii_digit())
        && (s == "0" || !s.starts_with('0'));
    if ok { s.parse().ok() } else { None }
}

/// Lowercase hex digits only, even length. `u8::from_str_radix` would accept a leading `+`.
fn decode_hex(s: &str) -> Option<Vec<u8>> {
    let digit = |b: u8| match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        _ => None,
    };
    let b = s.as_bytes();
    if b.is_empty() || !b.len().is_multiple_of(2) {
        return None;
    }
    b.chunks(2)
        .map(|p| Some(digit(p[0])? << 4 | digit(p[1])?))
        .collect()
}

/// What a verified request proved: it was signed by the holder of this key id's secret at this
/// epoch. The middleware puts it in the request's extensions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Verified {
    /// The key id whose secret signed the request.
    pub key_id: String,
    /// The epoch of the secret that verified.
    pub epoch: u64,
}

/// How a [`Verifier`] checks: which direction and audience it accepts, how far the clock may
/// differ and how much the replay cache may hold. Build it with [`VerifierConfig::new`], then set
/// fields by assignment.
#[derive(Debug, Clone)]
pub struct VerifierConfig {
    /// The one direction this verifier accepts.
    pub direction: Direction,
    /// Who this verifier is: `"control"` on the control plane, the tenant id on a tenant.
    pub audience: String,
    /// Accepted distance between the request's timestamp and now, either way. 60 by default.
    /// A negative value counts as 0 everywhere (the window check and how long a nonce is kept).
    pub window_secs: i64,
    /// Most nonces remembered at once. 10 000 by default (roughly 1 MB with short key ids and
    /// nonces; up to about 4 MB with 128-character key ids).
    pub replay_capacity: usize,
    /// Most live nonces for one key id, so one key holder cannot fill the cache for the rest.
    /// 1 250 by default whatever `replay_capacity` is: lower it together with the capacity.
    pub replay_per_key: usize,
}

impl VerifierConfig {
    /// A config for `direction` and `audience` with the defaults: a 60 second window, room for
    /// 10 000 nonces and at most 1 250 of them for one key id.
    pub fn new(direction: Direction, audience: impl Into<String>) -> Self {
        Self {
            direction,
            audience: audience.into(),
            window_secs: 60,
            replay_capacity: 10_000,
            replay_per_key: 10_000 / 8,
        }
    }
}

/// Remembers `(key id, nonce)` until its timestamp can no longer pass the window. Memory is
/// bounded overall and per key id: expired entries are dropped first, and a cache (or a key id) full
/// of live entries refuses new requests (fail closed) instead of forgetting one that could then be
/// replayed. In memory, per process: see the crate docs.
///
/// [`Verifier`] owns one; use this type directly only to share or inspect a cache.
#[derive(Debug)]
pub struct ReplayCache {
    capacity: usize,
    per_key: usize,
    seen: HashMap<(String, String), i64>,
    counts: HashMap<String, usize>,
    last_purge: i64,
}

impl ReplayCache {
    /// A cache for at most `capacity` live nonces, at most `per_key` of them for one key id. Both
    /// are raised to at least 1.
    pub fn new(capacity: usize, per_key: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            per_key: per_key.max(1),
            seen: HashMap::new(),
            counts: HashMap::new(),
            last_purge: i64::MIN,
        }
    }

    /// How many nonces are held, expired ones included until the next purge.
    pub fn len(&self) -> usize {
        self.seen.len()
    }

    /// Whether no nonce is held.
    pub fn is_empty(&self) -> bool {
        self.seen.is_empty()
    }

    fn purge(&mut self, now: i64) {
        self.seen.retain(|_, exp| *exp >= now);
        self.counts.clear();
        for (k, _) in self.seen.keys() {
            *self.counts.entry(k.clone()).or_default() += 1;
        }
        self.last_purge = now;
    }

    /// Record the nonce at time `now`, kept until `expires` (both unix seconds). Expired entries
    /// are purged only when the cache or the key's quota is full.
    ///
    /// # Errors
    ///
    /// [`VerifyError::Replay`] if the nonce is already live for this key id,
    /// [`VerifyError::KeyQuotaExceeded`] if the key id is at its quota and
    /// [`VerifyError::ReplayCacheFull`] if the cache is full of live entries.
    pub fn insert(
        &mut self,
        key_id: &str,
        nonce: &str,
        now: i64,
        expires: i64,
    ) -> Result<(), VerifyError> {
        let k = (key_id.to_string(), nonce.to_string());
        if let Some(&exp) = self.seen.get(&k)
            && exp >= now
        {
            return Err(VerifyError::Replay);
        }
        let full = self.seen.len() >= self.capacity
            || self.counts.get(key_id).copied().unwrap_or(0) >= self.per_key;
        if full && now != self.last_purge {
            self.purge(now);
        }
        if self.counts.get(key_id).copied().unwrap_or(0) >= self.per_key {
            return Err(VerifyError::KeyQuotaExceeded);
        }
        if self.seen.len() >= self.capacity {
            return Err(VerifyError::ReplayCacheFull);
        }
        // An expired entry for the same nonce is overwritten, not counted twice.
        if self.seen.insert(k, expires).is_none() {
            *self.counts.entry(key_id.to_string()).or_default() += 1;
        }
        Ok(())
    }
}

/// Checks requests against candidate keys and remembers the nonces it accepted. Share one per
/// accepted direction and audience (for example in an `Arc`): the replay cache lives inside it.
pub struct Verifier {
    cfg: VerifierConfig,
    clock: Arc<dyn Clock>,
    replay: Mutex<ReplayCache>,
}

impl Verifier {
    /// A verifier with an empty replay cache sized from `cfg`, reading time from `clock`.
    pub fn new(cfg: VerifierConfig, clock: Arc<dyn Clock>) -> Self {
        let replay = Mutex::new(ReplayCache::new(cfg.replay_capacity, cfg.replay_per_key));
        Self { cfg, clock, replay }
    }

    /// The configuration this verifier was built with.
    pub fn config(&self) -> &VerifierConfig {
        &self.cfg
    }

    /// The window, never negative: the one value used to judge a timestamp and to expire a nonce.
    fn window(&self) -> i64 {
        self.cfg.window_secs.max(0)
    }

    fn check_window(&self, presented: &Presented, now: i64) -> Result<(), VerifyError> {
        if presented.ts.abs_diff(now) > self.window().unsigned_abs() {
            return Err(VerifyError::Stale);
        }
        Ok(())
    }

    /// The cheap check, before any key lookup or body read: the timestamp must lie in the window.
    /// [`Verifier::verify`] repeats it, so calling this first only refuses early.
    ///
    /// # Errors
    ///
    /// [`VerifyError::Stale`] if the timestamp is further from now than the window.
    pub fn precheck(&self, presented: &Presented) -> Result<(), VerifyError> {
        self.check_window(presented, self.clock.now_unix())
    }

    /// Check one request against the candidate `keys` (the epochs the caller accepts for
    /// `presented.key_id`). `path_and_query` is the request target as received.
    ///
    /// The checks run in this order: keys given, timestamp in the window, a key for the
    /// presented epoch, the MAC (constant time), and only then is the nonce recorded, so a forged
    /// request never reaches the replay cache. The clock is read once, and that reading is used
    /// both for the window and for the replay cache.
    ///
    /// # Errors
    ///
    /// [`VerifyError::UnknownKey`] if `keys` is empty, [`VerifyError::Stale`],
    /// [`VerifyError::UnknownEpoch`], [`VerifyError::Malformed`] if the request does not
    /// canonicalise (for example a lowercase method), [`VerifyError::BadSignature`], and from the
    /// replay cache [`VerifyError::Replay`], [`VerifyError::KeyQuotaExceeded`] or
    /// [`VerifyError::ReplayCacheFull`].
    pub fn verify(
        &self,
        presented: &Presented,
        method: &str,
        path_and_query: &str,
        body: &[u8],
        keys: &[VerifyKey],
    ) -> Result<Verified, VerifyError> {
        if keys.is_empty() {
            return Err(VerifyError::UnknownKey);
        }
        let now = self.clock.now_unix();
        self.check_window(presented, now)?;
        let key = keys
            .iter()
            .find(|k| k.epoch == presented.epoch)
            .ok_or(VerifyError::UnknownEpoch)?;
        let body_hash = body_sha256_hex(body);
        let canonical = canonical_string(&Parts {
            direction: self.cfg.direction,
            audience: &self.cfg.audience,
            key_id: &presented.key_id,
            epoch: presented.epoch,
            method,
            path_and_query,
            ts: presented.ts,
            nonce: &presented.nonce,
            body_sha256_hex: &body_hash,
        })
        .map_err(|_| VerifyError::Malformed("request does not canonicalise"))?;
        let expected = mac(&key.secret, &canonical);
        // Lengths are public (SHA-256 output); the contents are compared in constant time.
        let ok = expected.len() == presented.sig.len()
            && bool::from(expected.as_slice().ct_eq(&presented.sig));
        if !ok {
            return Err(VerifyError::BadSignature);
        }
        // Only a request that proved the key reaches the cache, so strangers cannot fill it.
        let expires = presented.ts.saturating_add(self.window());
        self.replay
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert(&presented.key_id, &presented.nonce, now, expires)?;
        Ok(Verified {
            key_id: presented.key_id.clone(),
            epoch: presented.epoch,
        })
    }
}
