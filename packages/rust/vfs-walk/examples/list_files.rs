//! Lists the files under a folder with their sizes, skipping `.git` and
//! `node_modules` and anything ending in `.tmp`.
//!
//! Run it with `cargo run --example list_files -- /path/to/folder`.

use std::path::Path;

use vfs_seam::NativeVfs;
use vfs_walk::{Candidate, WalkOptions, walk};

fn main() {
    let Some(root) = std::env::args().nth(1) else {
        eprintln!("usage: list_files <folder>");
        std::process::exit(2);
    };
    let no_tmp = |c: &Candidate<'_>| c.is_dir || !c.name.ends_with(".tmp");
    let opts = WalkOptions {
        prune_dirs: vec![".git".into(), "node_modules".into()],
        filter: Some(&no_tmp),
        ..Default::default()
    };
    for entry in walk(&NativeVfs, Path::new(&root), &opts).unwrap_or_default() {
        println!("{} ({} bytes)", entry.rel, entry.size);
    }
}
