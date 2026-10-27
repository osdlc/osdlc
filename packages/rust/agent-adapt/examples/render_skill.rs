//! Renders one skill for Claude Code and prints the files it would write.
//!
//! Run it with `cargo run --example render_skill`.

use agent_adapt::{RuntimeId, Skill, runtimes};

fn main() {
    let skill = Skill::new("review-diff", "Review a diff", "Review a diff for defects.");
    let renderer =
        runtimes::skill_renderer_for(RuntimeId::ClaudeCode).expect("Claude Code renders skills");
    let files = renderer.render_skill(&skill).expect("the skill renders");
    for file in files {
        println!("{}", file.path.display());
    }
}
