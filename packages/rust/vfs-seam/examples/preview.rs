//! Runs a small "write two files" job against a preview of a directory, then
//! prints what it would have written, without touching the directory.
//!
//! Run it with `cargo run --example preview -- /path/to/dir`.

use std::path::Path;

use vfs_seam::{NativeVfs, PreviewVfs, Vfs};

fn job(vfs: &dyn Vfs, dir: &Path) -> vfs_seam::Result<()> {
    vfs.create_dir_all(&dir.join("out"))?;
    vfs.write_file(&dir.join("out/a.txt"), b"alpha\n")?;
    vfs.write_file(&dir.join("out/b.txt"), b"bravo\n")?;
    Ok(())
}

fn main() {
    let Some(dir) = std::env::args().nth(1) else {
        eprintln!("usage: preview <dir>");
        std::process::exit(2);
    };
    let native = NativeVfs;
    let preview = PreviewVfs::over(&native);
    if let Err(e) = job(&preview, Path::new(&dir)) {
        eprintln!("{e}");
        std::process::exit(1);
    }
    for (path, write) in preview.into_writes() {
        println!(
            "would write {} ({} bytes)",
            path.display(),
            write.bytes.len()
        );
    }
}
