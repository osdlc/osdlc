//! Run the `list` verb in-process over a small vault.
//!
//! Run with `cargo run -p skillwright --example list`. The binary does the same
//! through `skillwright::cli::run`, with the process's own argv and streams.

fn main() -> std::io::Result<()> {
    let vault = std::env::temp_dir().join(format!("skillwright-example-{}", std::process::id()));
    std::fs::create_dir_all(vault.join("skills"))?;
    std::fs::write(
        vault.join("skills/code-review.md"),
        "---\ndescription: Reviews a diff for correctness bugs.\n---\nReview the diff.\n",
    )?;

    let argv = ["list", "--vault", &vault.display().to_string()].map(String::from);
    let (mut out, mut err) = (Vec::new(), Vec::new());
    let code = skillwright::cli::run(&argv, &mut out, &mut err);
    print!("{}", String::from_utf8_lossy(&out));
    eprint!("{}", String::from_utf8_lossy(&err));
    std::fs::remove_dir_all(&vault)?;
    std::process::exit(code);
}
