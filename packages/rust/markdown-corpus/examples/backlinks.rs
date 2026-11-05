//! Prints the notes that link to one note of a corpus, with the linking lines.
//!
//! Run it with `cargo run --example backlinks -- /path/to/notes Note`.

use std::path::Path;

use markdown_corpus::vfs_seam::NativeVfs;
use markdown_corpus::{Corpus, LoadOptions};

fn main() {
    let mut args = std::env::args().skip(1);
    let (Some(dir), Some(note)) = (args.next(), args.next()) else {
        eprintln!("usage: backlinks <corpus-dir> <note>");
        std::process::exit(2);
    };
    let root = std::path::absolute(Path::new(&dir)).unwrap_or_else(|_| dir.clone().into());
    let corpus = Corpus::load(&NativeVfs, root, LoadOptions::default());
    let mut page = corpus.backlinks(&note);
    corpus.fill_contexts(&NativeVfs, &mut page.backlinks);
    for backlink in &page.backlinks {
        for ctx in &backlink.contexts {
            println!("{}:{}: {}", backlink.source_path, ctx.line, ctx.text);
        }
    }
    if page.truncated() {
        println!("({} of {} linking notes)", page.backlinks.len(), page.total);
    }
}
