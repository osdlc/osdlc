//! Publish one vault note to a Claude Code project, in memory.
//!
//! Run with `cargo run -p tradecraft-core --example publish`.

use std::path::{Path, PathBuf};

use tradecraft_core::{MemVfs, Namespace, PublishMode, PublishRequest, Vfs, publish_skill};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // A vault with one skill note. `MemVfs` is an in-memory filesystem;
    // `NativeVfs` is the same calls over `std::fs`.
    let vfs = MemVfs::new();
    vfs.create_dir_all(Path::new("/vault/skills"))?;
    vfs.write_file(
        Path::new("/vault/skills/code-review.md"),
        b"---\ndescription: Reviews the current diff.\n---\nReview the diff.\n",
    )?;

    let request = PublishRequest {
        skill_path: PathBuf::from("/vault/skills/code-review.md"),
        destination_root: PathBuf::from("/project"),
        target: "claude-code".to_owned(),
        mode: PublishMode::Write,
        skills_root: None,
        published_at: None,
        overwrite: Vec::new(),
    };
    let report = publish_skill(&vfs, &request, &Namespace::default())?;
    for file in &report.files {
        println!("{}  {:?}", file.path, file.status);
    }
    Ok(())
}
