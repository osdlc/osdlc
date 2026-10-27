//! Load a YAML contract, validate one document against it and print the
//! findings. Run it with `cargo run --example validate`.

use markdown_contract::{FindingLevel, load_contract, validate};

const CONTRACT: &str = "\
mcVersion: 2
kind: contract
frontmatter:
  type: object
  required: [status]
  properties:
    status: { enum: [open, accepted] }
body:
  order: strict
  additionalSections: false
  sections:
    - section: Context
    - section: Decision
";

const DOCUMENT: &str = "\
---
status: done
---

## Context

Config is checked by hand.
";

fn main() {
    let contract = load_contract(CONTRACT).expect("the contract compiles");
    let findings = validate(DOCUMENT, &contract, "decisions/zod.md");

    for f in &findings {
        let line = f.pos.map_or(0, |p| p.line);
        println!("{}:{line} {:?} {}: {}", f.path, f.level, f.id, f.message);
    }

    // `status: done` is not in the enum and the Decision section is missing.
    let errors = findings
        .iter()
        .filter(|f| f.level == FindingLevel::Error)
        .count();
    assert_eq!(errors, 2);
}
