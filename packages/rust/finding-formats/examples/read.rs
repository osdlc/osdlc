//! Read a tool's line-oriented output into findings.
//!
//! Run with `cargo run -p finding-formats --example read`.

use finding_formats::{Format, Options, read};

fn main() -> Result<(), finding_formats::Error> {
    let output = "src/a.rs:3: unused import\nsrc/b.rs:9:4: missing docs\n";
    let report = read(Format::Lines, output, &Options::default())?;
    for finding in &report.findings {
        println!("{:?}:{:?} {}", finding.path, finding.line, finding.message);
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("a report serialises")
    );
    Ok(())
}
