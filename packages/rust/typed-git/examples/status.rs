//! Prints the status of the repository at the given path, or the current
//! directory: `cargo run --example status -- <path>`.

use std::path::PathBuf;

use typed_git::query::{self, FileState};

fn main() -> Result<(), typed_git::GitError> {
    let repo = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));

    if !query::is_repo(&repo)? {
        eprintln!("{} is not inside a git work tree", repo.display());
        std::process::exit(1);
    }

    let report = query::status_report(&repo)?;
    let branch = report.branch.as_deref().unwrap_or("(detached)");
    match (&report.upstream, report.ahead, report.behind) {
        (Some(upstream), Some(ahead), Some(behind)) => {
            println!("{branch} -> {upstream}: {ahead} ahead, {behind} behind");
        }
        _ => println!("{branch}: no upstream"),
    }
    for entry in &report.entries {
        let state = match entry.state {
            FileState::Conflicted => "conflicted",
            FileState::Untracked => "untracked",
            FileState::Modified => "modified",
            FileState::Staged => "staged",
            _ => "changed",
        };
        println!("{state:>10}  {}", entry.path);
    }
    if report.entries.is_empty() {
        println!("clean");
    }
    Ok(())
}
