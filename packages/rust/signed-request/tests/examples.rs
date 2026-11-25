//! Runs every example, so the suite proves what the examples show.

#[path = "../examples/key_rotation.rs"]
mod key_rotation;
#[cfg(feature = "axum")]
#[path = "../examples/protect_router.rs"]
mod protect_router;
#[path = "../examples/sign_and_verify.rs"]
mod sign_and_verify;
#[cfg(all(feature = "axum", feature = "reqwest"))]
#[path = "../examples/signed_client.rs"]
mod signed_client;

#[test]
fn sign_and_verify_runs() {
    sign_and_verify::main();
}

#[test]
fn key_rotation_runs() {
    key_rotation::main();
}

#[cfg(feature = "axum")]
#[test]
fn protect_router_runs() {
    protect_router::main();
}

#[cfg(all(feature = "axum", feature = "reqwest"))]
#[test]
fn signed_client_runs() {
    signed_client::main();
}
