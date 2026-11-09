//! Runs every example, so the suite proves what the examples show.

#[path = "../examples/guard_and_policy.rs"]
mod guard_and_policy;
#[path = "../examples/local_origins.rs"]
mod local_origins;
#[path = "../examples/serve_with_token.rs"]
mod serve_with_token;
#[path = "../examples/sharing_runtime.rs"]
mod sharing_runtime;
#[path = "../examples/tokens_on_disk.rs"]
mod tokens_on_disk;

#[test]
fn serve_with_token_runs() {
    serve_with_token::main().expect("example");
}

#[test]
fn guard_and_policy_runs() {
    guard_and_policy::main();
}

#[test]
fn tokens_on_disk_runs() {
    tokens_on_disk::main().expect("example");
}

#[test]
fn sharing_runtime_runs() {
    sharing_runtime::main().expect("example");
}

#[test]
fn local_origins_runs() {
    local_origins::main();
}
