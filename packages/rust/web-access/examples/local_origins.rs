//! The helpers a handler uses to decide whether a page or a peer is local, and
//! the interfaces a listen picker offers.
//!
//! Run with `cargo run --example local_origins`.

use web_access::{interfaces, is_local_authority, is_local_origin, origin_matches_host};

/// Runs the example; `tests/examples.rs` runs it too.
pub fn main() {
    // A page served from this machine, or a desktop webview.
    assert!(is_local_origin("http://localhost:3000"));
    assert!(is_local_origin("http://[::1]:8080"));
    assert!(is_local_origin("tauri://localhost"));
    // A lookalike is not local.
    assert!(!is_local_origin("http://localhost.example.com"));

    // A `Host` header value.
    assert!(is_local_authority("127.0.0.1:8080"));
    assert!(!is_local_authority("localhost@example.com"));

    // A WebSocket upgrade is a GET, which the guard's Origin check leaves
    // alone; a handler compares the Origin with the Host itself.
    assert!(origin_matches_host(
        "http://192.168.1.5:8080",
        "192.168.1.5:8080"
    ));
    assert!(origin_matches_host("http://example.com", "EXAMPLE.com:80"));
    assert!(!origin_matches_host(
        "http://example.com",
        "192.168.1.5:8080"
    ));
    assert!(!origin_matches_host("null", "192.168.1.5:8080"));

    // What a listen picker can offer. There is always a loopback address.
    let all = interfaces();
    assert!(all.iter().any(|i| i.is_loopback));
    for i in &all {
        println!("{} {} loopback={}", i.name, i.ip, i.is_loopback);
    }
}
