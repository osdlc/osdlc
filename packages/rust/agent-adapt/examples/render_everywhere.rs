//! Renders one skill for every runtime that supports skills, and prints the
//! files each runtime would get.
//!
//! Run it with `cargo run --example render_everywhere`.

use agent_adapt::{RuntimeId, Skill, runtimes};

fn main() {
    let skill = Skill::new("review-diff", "Review a diff", "Review a diff for defects.");
    for &id in RuntimeId::ALL {
        let Some(renderer) = runtimes::skill_renderer_for(id) else {
            println!("{}: no skill support", id.as_str());
            continue;
        };
        let files = renderer.render_skill(&skill).expect("the skill renders");
        for file in files {
            println!("{}: {}", id.as_str(), file.path.display());
        }
    }
}
