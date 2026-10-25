//! Plans a note move and prints the links it would rewrite. Nothing is written.
//!
//! Run it with
//! `cargo run --example plan_move -- /absolute/path/to/vault Projects/Alpha.md Archive/Alpha.md`.

use std::path::Path;

use markdown_relink::{VaultFacts, plan};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [vault, from, to] = args.as_slice() else {
        eprintln!("usage: plan_move <vault-dir> <from> <to>");
        std::process::exit(2);
    };
    let vault = Path::new(vault);
    let facts = VaultFacts::scan(vault);
    match plan(vault, &facts, from, to) {
        Ok(p) => match &p.conflict {
            Some(reason) => println!("refused: {reason}"),
            None => {
                for file in &p.files {
                    println!("{}: {} edit(s)", file.path, file.edits.len());
                }
            }
        },
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(1);
        }
    }
}
