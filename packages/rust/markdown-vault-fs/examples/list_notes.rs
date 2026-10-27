//! Lists the visible `.md` notes of a vault, with their sizes.
//!
//! Run it with `cargo run --example list_notes -- /path/to/vault`.

use std::path::Path;

use markdown_vault_fs::{WalkOptions, walk};

fn main() {
    let Some(vault) = std::env::args().nth(1) else {
        eprintln!("usage: list_notes <vault-dir>");
        std::process::exit(2);
    };
    for entry in walk(Path::new(&vault), &WalkOptions::content_notes()) {
        println!("{} ({} bytes)", entry.rel, entry.size);
    }
}
