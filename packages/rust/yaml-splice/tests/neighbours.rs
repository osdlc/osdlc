//! An edit never changes a key it does not address.
//!
//! Builds three-key documents from many value shapes (quoted, plain, flow,
//! block collections, block scalars with every chomping indicator, comments
//! and blank lines between keys), in LF and CRLF, and runs a `Set` and a
//! `Remove` on each key. The result either parses to the original mapping
//! with only that key changed, or is an `InvalidResult` refusal. It is never
//! a silently different document.

use yaml_splice::{EditError, FieldEdit, Value, edit_yaml, parse::parse_mapping};

const VALUES: &[&str] = &[
    "1",
    "'q' # c",
    "\"d\"",
    "plain words # c",
    "[a, 'b'] # c",
    "{x: 1} # c",
    "\n  - a\n  - 'b' # c\n  - |\n    blk\n",
    "\n  k: v\n  k2: |\n    z\n\n",
    "|\n  l1\n\n  l2\n",
    "|-\n  stripped\n",
    ">+\n  f\n\n",
    "",
    "'multi\n  line'",
    "\"esc \\\" q\" #c",
    "!!str 7",
    "|2\n   indented\n",
    "null # c",
    "\n  # only comment\n  a: 1\n",
];

const SEPARATORS: &[&str] = &["", "# between\n", "\n"];

#[test]
fn an_edit_changes_only_the_key_it_addresses() {
    let mut checked = 0;
    let mut failures = Vec::new();
    for eol in ["\n", "\r\n"] {
        for a in VALUES {
            for b in VALUES {
                for sep in SEPARATORS {
                    let src =
                        format!("first: {a}\n{sep}second: {b}\nlast: end # t\n").replace('\n', eol);
                    let Ok(original) = parse_mapping(&src) else {
                        continue;
                    };
                    for key in ["first", "second", "last"] {
                        let mut removed = original.clone();
                        removed.remove(key);
                        let mut set = original.clone();
                        set.insert(key, Value::from("Z"));
                        let cases = [
                            (FieldEdit::Remove { key: key.into() }, removed),
                            (
                                FieldEdit::Set {
                                    key: key.into(),
                                    value: Value::from("Z"),
                                },
                                set,
                            ),
                        ];
                        for (edit, want) in cases {
                            checked += 1;
                            match edit_yaml(src.as_bytes(), std::slice::from_ref(&edit)) {
                                Ok(out) => {
                                    let text = String::from_utf8(out.bytes).unwrap();
                                    if parse_mapping(&text).ok().as_ref() != Some(&want) {
                                        failures.push(format!("{edit:?} on {src:?} gave {text:?}"));
                                    }
                                }
                                Err(EditError::InvalidResult { .. }) => {}
                                Err(e) => failures.push(format!("{edit:?} on {src:?}: {e}")),
                            }
                        }
                    }
                }
            }
        }
    }
    assert!(checked > 5000, "only {checked} cases ran");
    assert!(
        failures.is_empty(),
        "{} of {checked} edits went wrong:\n{}",
        failures.len(),
        failures.join("\n")
    );
}
