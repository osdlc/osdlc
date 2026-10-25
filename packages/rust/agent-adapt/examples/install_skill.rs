//! Installs one skill for Claude Code at project scope, in a temporary
//! directory, and prints what it wrote.
//!
//! Run it with `cargo run --example install_skill`.

use agent_adapt::install::install_skill;
use agent_adapt::runtimes::ClaudeCode;
use agent_adapt::{Scope, Skill};

fn main() {
    let project = tempfile::tempdir().expect("a temporary directory");
    let skill = Skill::new("review-diff", "Review a diff", "Review a diff for defects.");
    let written =
        install_skill(&ClaudeCode, project.path(), Scope::Project, &skill).expect("installs");
    for path in written {
        let relative = path
            .strip_prefix(project.path())
            .expect("under the project");
        println!("wrote {}", relative.display());
    }
}
