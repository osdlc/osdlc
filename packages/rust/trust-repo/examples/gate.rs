//! Withhold execution from an untrusted repository, then grant it.
//!
//! Run with `cargo run -p trust-repo --example gate`.

use std::path::Path;

use trust_repo::{TrustStore, resolve_exec_gate, trust_store_dir, withheld_hint};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let state = tempfile::tempdir()?;
    let repo = tempfile::tempdir()?;
    let var = |name: &str| (name == "XDG_STATE_HOME").then(|| state.path().display().to_string());
    let store = TrustStore::at(trust_store_dir("tooly", &var, Path::new("/home/u")));

    let gate = resolve_exec_gate(&store, repo.path(), true, None)?;
    assert!(!gate.allow_exec);
    println!("{}", withheld_hint("tooly", "trust", Some("--trust")));

    store.trust(repo.path())?;
    assert!(resolve_exec_gate(&store, repo.path(), true, None)?.allow_exec);
    println!("trusted");
    Ok(())
}
