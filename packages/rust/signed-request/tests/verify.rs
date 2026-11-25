//! One test per rejection, epochs, and the replay cache bound.

use std::sync::Arc;

use signed_request::{
    Clock, Direction, ManualClock, Presented, ReplayCache, SignedHeaders, Signer, SystemClock,
    Verifier, VerifierConfig, VerifyError, VerifyKey,
};

const NOW: i64 = 1_800_000_000;
const SECRET: &[u8] = b"secret-one";

struct Rig {
    clock: Arc<ManualClock>,
    signer: Signer,
    verifier: Verifier,
    keys: Vec<VerifyKey>,
}

fn rig() -> Rig {
    let clock = Arc::new(ManualClock::new(NOW));
    Rig {
        signer: Signer::new(
            "tnt_a",
            1,
            SECRET,
            Direction::TenantToControl,
            "control",
            clock.clone(),
        ),
        verifier: Verifier::new(
            VerifierConfig::new(Direction::TenantToControl, "control"),
            clock.clone(),
        ),
        keys: vec![VerifyKey {
            epoch: 1,
            secret: SECRET.to_vec(),
        }],
        clock,
    }
}

fn parse(h: &SignedHeaders) -> Presented {
    let p = h.pairs();
    Presented::parse(|n| p.iter().find(|(k, _)| *k == n).map(|(_, v)| *v)).unwrap()
}

impl Rig {
    fn sign(&self, m: &str, pq: &str, body: &[u8]) -> Presented {
        parse(&self.signer.sign(m, pq, body).unwrap())
    }

    fn check(&self, p: &Presented, m: &str, pq: &str, body: &[u8]) -> Result<(), VerifyError> {
        self.verifier.verify(p, m, pq, body, &self.keys).map(|_| ())
    }
}

#[test]
fn accepts_a_good_request() {
    let r = rig();
    let p = r.sign("POST", "/x?b=1&a=2", b"hi");
    assert_eq!(r.check(&p, "POST", "/x?b=1&a=2", b"hi"), Ok(()));
}

#[test]
fn rejects_wrong_key() {
    let r = rig();
    let p = r.sign("GET", "/x", b"");
    let wrong = [VerifyKey {
        epoch: 1,
        secret: b"other".to_vec(),
    }];
    assert_eq!(
        r.verifier.verify(&p, "GET", "/x", b"", &wrong).map(|_| ()),
        Err(VerifyError::BadSignature)
    );
}

#[test]
fn rejects_altered_body() {
    let r = rig();
    let p = r.sign("POST", "/x", b"one");
    assert_eq!(
        r.check(&p, "POST", "/x", b"two"),
        Err(VerifyError::BadSignature)
    );
}

#[test]
fn rejects_altered_path() {
    let r = rig();
    let p = r.sign("GET", "/x", b"");
    assert_eq!(
        r.check(&p, "GET", "/y", b""),
        Err(VerifyError::BadSignature)
    );
}

#[test]
fn rejects_altered_query() {
    let r = rig();
    let p = r.sign("GET", "/x?a=1", b"");
    assert_eq!(
        r.check(&p, "GET", "/x?a=2", b""),
        Err(VerifyError::BadSignature)
    );
}

#[test]
fn the_query_is_signed_as_sent() {
    // A reordered query, a trailing empty pair and a bare `?` are all different requests.
    for other in ["/x?a=2&b=1", "/x?b=1&a=2&", "/x?b=1&&a=2"] {
        let r = rig();
        let p = r.sign("GET", "/x?b=1&a=2", b"");
        assert_eq!(
            r.check(&p, "GET", other, b""),
            Err(VerifyError::BadSignature),
            "{other}"
        );
    }
    let r = rig();
    let p = r.sign("GET", "/x?", b"");
    assert_eq!(
        r.check(&p, "GET", "/x", b""),
        Err(VerifyError::BadSignature)
    );
}

#[test]
fn rejects_altered_method() {
    let r = rig();
    let p = r.sign("GET", "/x", b"");
    assert_eq!(
        r.check(&p, "POST", "/x", b""),
        Err(VerifyError::BadSignature)
    );
}

#[test]
fn window_is_sixty_seconds_either_way() {
    for (offset, ok) in [(-60, true), (-61, false), (60, true), (61, false)] {
        let r = rig();
        let h = r
            .signer
            .sign_at("GET", "/x", b"", NOW + offset, "0123456789abcdef0123")
            .unwrap();
        let got = r.check(&parse(&h), "GET", "/x", b"");
        if ok {
            assert_eq!(got, Ok(()), "offset {offset}");
        } else {
            assert_eq!(got, Err(VerifyError::Stale), "offset {offset}");
        }
    }
}

#[test]
fn rejects_a_replayed_signature_and_forgets_it_after_the_window() {
    let r = rig();
    let p = r.sign("GET", "/x", b"");
    assert_eq!(r.check(&p, "GET", "/x", b""), Ok(()));
    assert_eq!(r.check(&p, "GET", "/x", b""), Err(VerifyError::Replay));
    // Past the window the timestamp check refuses it, so forgetting the nonce is safe.
    r.clock.advance(61);
    assert_eq!(r.check(&p, "GET", "/x", b""), Err(VerifyError::Stale));
}

#[test]
fn a_forged_request_does_not_burn_the_nonce() {
    let r = rig();
    let p = r.sign("GET", "/x", b"");
    assert_eq!(
        r.check(&p, "GET", "/y", b""),
        Err(VerifyError::BadSignature)
    );
    assert_eq!(r.check(&p, "GET", "/x", b""), Ok(()));
}

#[test]
fn another_key_id_cannot_reuse_a_signature() {
    let r = rig();
    let mut p = r.sign("GET", "/x", b"");
    p.key_id = "tnt_b".into();
    assert_eq!(
        r.check(&p, "GET", "/x", b""),
        Err(VerifyError::BadSignature)
    );
}

#[test]
fn epoch_must_be_offered() {
    let r = rig();
    let mut p = r.sign("GET", "/x", b"");
    p.epoch = 2;
    assert_eq!(
        r.check(&p, "GET", "/x", b""),
        Err(VerifyError::UnknownEpoch)
    );
    assert_eq!(
        r.verifier.verify(&p, "GET", "/x", b"", &[]).map(|_| ()),
        Err(VerifyError::UnknownKey)
    );
}

#[test]
fn the_epoch_is_signed() {
    // Epoch 2 offered with the epoch-1 secret: relabelling a signature fails.
    let r = rig();
    let mut p = r.sign("GET", "/x", b"");
    p.epoch = 2;
    let keys = [VerifyKey {
        epoch: 2,
        secret: SECRET.to_vec(),
    }];
    assert_eq!(
        r.verifier.verify(&p, "GET", "/x", b"", &keys).map(|_| ()),
        Err(VerifyError::BadSignature)
    );
}

fn headers<'a>(over: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<&'a str> {
    move |name: &str| {
        over.iter()
            .find(|(k, _)| *k == name)
            .map(|(_, v)| *v)
            .or(match name {
                "x-det-id" => Some("tnt_a"),
                "x-det-epoch" => Some("1"),
                "x-det-ts" => Some("1800000000"),
                "x-det-nonce" => Some("0123456789abcdef0123"),
                "x-det-sig" => Some("00ff"),
                _ => None,
            })
    }
}

#[test]
fn strict_parsing_accepts_the_canonical_shapes() {
    let p = Presented::parse(headers(&[])).unwrap();
    assert_eq!(
        (p.epoch, p.ts, p.sig.clone()),
        (1, 1_800_000_000, vec![0, 255])
    );
}

#[test]
fn strict_parsing_refuses_other_encodings() {
    for (name, bad) in [
        ("x-det-sig", "+f"),
        ("x-det-sig", "00FF"),
        ("x-det-sig", "0"),
        ("x-det-sig", "0x"),
        ("x-det-sig", " 0f"),
        ("x-det-sig", ""),
        ("x-det-epoch", "+1"),
        ("x-det-epoch", "01"),
        ("x-det-epoch", "-1"),
        ("x-det-epoch", " 1"),
        ("x-det-epoch", "1.0"),
        ("x-det-ts", "+1800000000"),
        ("x-det-ts", "-5"),
        ("x-det-ts", "0x10"),
        ("x-det-nonce", "short"),
        ("x-det-nonce", "0123456789abcdef!!!!"),
        ("x-det-id", "has space"),
    ] {
        let over = [(name, bad)];
        assert!(
            matches!(
                Presented::parse(headers(&over)),
                Err(VerifyError::Malformed(_))
            ),
            "{name}={bad:?}"
        );
    }
}

#[test]
fn malformed_headers_are_refused() {
    assert_eq!(
        Presented::parse(|_| None),
        Err(VerifyError::MissingHeader("x-det-id"))
    );
}

#[test]
fn replay_cache_is_bounded_and_fails_closed() {
    let mut c = ReplayCache::new(3, 3);
    for i in 0..3 {
        c.insert("k", &format!("n{i}"), 100, 160).unwrap();
    }
    assert_eq!(
        c.insert("k", "n3", 100, 160),
        Err(VerifyError::KeyQuotaExceeded)
    );
    assert_eq!(
        c.insert("j", "n3", 100, 160),
        Err(VerifyError::ReplayCacheFull)
    );
    assert_eq!(c.len(), 3);
    // Once the entries expire the room comes back and memory stays at the bound.
    c.insert("k", "n3", 161, 221).unwrap();
    assert_eq!(c.len(), 1);
    for i in 0..100 {
        let _ = c.insert("k", &format!("m{i}"), 161, 221);
    }
    assert!(c.len() <= 3);
}

#[test]
fn one_key_at_its_quota_does_not_block_another() {
    let mut c = ReplayCache::new(100, 4);
    for i in 0..4 {
        c.insert("tnt_a", &format!("n{i}"), 100, 160).unwrap();
    }
    assert_eq!(
        c.insert("tnt_a", "n4", 100, 160),
        Err(VerifyError::KeyQuotaExceeded)
    );
    for i in 0..4 {
        c.insert("tnt_b", &format!("n{i}"), 100, 160).unwrap();
    }
}

#[test]
fn the_verifier_applies_the_per_key_quota() {
    let clock = Arc::new(ManualClock::new(NOW));
    let mut cfg = VerifierConfig::new(Direction::TenantToControl, "control");
    cfg.replay_per_key = 3;
    let v = Verifier::new(cfg, clock.clone());
    let sign = |id: &str, n: u32| {
        let s = Signer::new(
            id,
            1,
            SECRET,
            Direction::TenantToControl,
            "control",
            clock.clone(),
        );
        parse(
            &s.sign_at("GET", "/x", b"", NOW, &format!("nonce-{id}-{n:010}"))
                .unwrap(),
        )
    };
    let keys = vec![VerifyKey {
        epoch: 1,
        secret: SECRET.to_vec(),
    }];
    for n in 0..3 {
        v.verify(&sign("tnt_a", n), "GET", "/x", b"", &keys)
            .unwrap();
    }
    assert_eq!(
        v.verify(&sign("tnt_a", 3), "GET", "/x", b"", &keys)
            .map(|_| ()),
        Err(VerifyError::KeyQuotaExceeded)
    );
    v.verify(&sign("tnt_b", 0), "GET", "/x", b"", &keys)
        .unwrap();
}

/// A clock that moves on every read, so a verifier that reads it twice sees two times.
struct TickingClock {
    now: std::sync::atomic::AtomicI64,
    step: i64,
}

impl Clock for TickingClock {
    fn now_unix(&self) -> i64 {
        self.now
            .fetch_add(self.step, std::sync::atomic::Ordering::SeqCst)
    }
}

#[test]
fn verify_reads_the_clock_once_so_a_request_in_the_last_second_cannot_be_replayed() {
    // The request is signed `window` seconds ago: its last second to pass the window is `NOW`.
    // The clock moves one second on every read. If verify() read it twice (window check, then
    // the replay insert), the nonce would be stored as already expired and a replay accepted.
    let signer = Signer::new(
        "tnt_a",
        1,
        SECRET,
        Direction::TenantToControl,
        "control",
        Arc::new(ManualClock::new(NOW)),
    );
    let clock = Arc::new(TickingClock {
        now: std::sync::atomic::AtomicI64::new(NOW),
        step: 1,
    });
    let verifier = Verifier::new(
        VerifierConfig::new(Direction::TenantToControl, "control"),
        clock.clone(),
    );
    let keys = [VerifyKey {
        epoch: 1,
        secret: SECRET.to_vec(),
    }];
    let h = signer
        .sign_at("GET", "/x", b"", NOW - 60, "0123456789abcdef0123")
        .unwrap();
    let p = parse(&h);
    assert!(verifier.verify(&p, "GET", "/x", b"", &keys).is_ok());
    // The same second again: the request must be refused as a replay.
    clock.now.store(NOW, std::sync::atomic::Ordering::SeqCst);
    assert_eq!(
        verifier.verify(&p, "GET", "/x", b"", &keys).map(|_| ()),
        Err(VerifyError::Replay)
    );
}

#[test]
fn a_negative_window_acts_as_zero_for_replay_protection_too() {
    let clock = Arc::new(ManualClock::new(NOW));
    let mut cfg = VerifierConfig::new(Direction::TenantToControl, "control");
    cfg.window_secs = -5;
    let verifier = Verifier::new(cfg, clock.clone());
    let signer = Signer::new(
        "tnt_a",
        1,
        SECRET,
        Direction::TenantToControl,
        "control",
        clock,
    );
    let keys = [VerifyKey {
        epoch: 1,
        secret: SECRET.to_vec(),
    }];
    let p = parse(&signer.sign("GET", "/x", b"").unwrap());
    // Window 0: a request signed this second passes once, then is a replay.
    assert!(verifier.verify(&p, "GET", "/x", b"", &keys).is_ok());
    assert_eq!(
        verifier.verify(&p, "GET", "/x", b"", &keys).map(|_| ()),
        Err(VerifyError::Replay)
    );
    // And a request from the previous second is stale.
    let old = Signer::new(
        "tnt_a",
        1,
        SECRET,
        Direction::TenantToControl,
        "control",
        Arc::new(ManualClock::new(NOW - 1)),
    );
    let p = parse(&old.sign("GET", "/y", b"").unwrap());
    assert_eq!(
        verifier.verify(&p, "GET", "/y", b"", &keys).map(|_| ()),
        Err(VerifyError::Stale)
    );
}

#[test]
fn precheck_alone_judges_the_window_and_config_reports_it() {
    let r = rig();
    assert_eq!(r.verifier.config().window_secs, 60);
    let p = r.sign("GET", "/x", b"");
    assert_eq!(r.verifier.precheck(&p), Ok(()));
    r.clock.advance(61);
    assert_eq!(r.verifier.precheck(&p), Err(VerifyError::Stale));
}

#[test]
fn the_system_clock_reads_the_current_time() {
    let now = SystemClock.now_unix();
    // After 2020-01-01 and before the year 2200: a sanity bound, not a calendar.
    assert!(now > 1_577_836_800 && now < 7_258_118_400, "{now}");
}

#[test]
fn a_manual_clock_can_be_set_and_moved_both_ways() {
    let c = ManualClock::new(100);
    c.set(500);
    assert_eq!(c.now_unix(), 500);
    c.advance(-20);
    assert_eq!(c.now_unix(), 480);
}

#[test]
fn secrets_are_redacted_in_debug_output() {
    let key = VerifyKey {
        epoch: 7,
        secret: b"super-secret-bytes".to_vec(),
    };
    let shown = format!("{key:?}");
    assert!(shown.contains("redacted") && shown.contains('7'), "{shown}");
    assert!(!shown.contains("super-secret"), "{shown}");
    let r = rig();
    let shown = format!("{:?}", r.signer);
    assert!(
        shown.contains("redacted") && shown.contains("tnt_a"),
        "{shown}"
    );
    assert!(!shown.contains("secret-one"), "{shown}");
}

#[test]
fn the_replay_cache_reports_its_size() {
    let mut cache = ReplayCache::new(4, 4);
    assert!(cache.is_empty());
    cache
        .insert("k", "0123456789abcdef", NOW, NOW + 60)
        .unwrap();
    assert_eq!((cache.len(), cache.is_empty()), (1, false));
}

#[test]
fn sixteen_concurrent_copies_of_one_request_are_accepted_once() {
    let r = rig();
    let p = r.sign("GET", "/x", b"");
    let accepted = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..16)
            .map(|_| scope.spawn(|| r.check(&p, "GET", "/x", b"").is_ok()))
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .filter(|ok| *ok)
            .count()
    });
    assert_eq!(accepted, 1);
}

#[test]
fn the_signer_accepts_what_the_verifier_refuses_at_the_edges() {
    // Documented on `Signer::sign_at`: a negative timestamp signs, but the headers do not parse.
    let r = rig();
    let h = r
        .signer
        .sign_at("GET", "/x", b"", -5, "0123456789abcdef0123")
        .unwrap();
    let pairs = h.pairs();
    let parsed = Presented::parse(|n| pairs.iter().find(|(k, _)| *k == n).map(|(_, v)| *v));
    assert!(
        matches!(parsed, Err(VerifyError::Malformed(_))),
        "{parsed:?}"
    );
}
