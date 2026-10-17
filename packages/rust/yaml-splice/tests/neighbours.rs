//! An edit never changes a key it does not address.
//!
//! Builds three-key documents from many value shapes (quoted, plain, flow,
//! block collections, block scalars with every chomping indicator, comments
//! and blank lines between keys, comments indented less than a block's
//! content), in LF and CRLF, and runs a `Remove` and several `Set`s on each
//! key. The new values include ones that render as block scalars, `|+` with
//! trailing blank lines among them. The result either parses to the original
//! mapping with only that key changed, or is an `InvalidResult` refusal. It
//! is never a silently different document, and refusals stay rare.

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
    "|",
    "| # c\n  x\n",
    "|\n    x\n  # note",
    ">-\n    deep\n # one space\n",
    "\n    - a\n  # less\n    - b\n",
];

/// Values a `Set` writes: plain, and ones that render as block scalars
/// (`|`, `|-`, `|+` with trailing blank lines) and block collections.
fn new_values() -> Vec<Value> {
    let mut map = yaml_splice::Mapping::new();
    map.insert("k", Value::from("two\nlines"));
    vec![
        Value::from("Z"),
        Value::from("line1\nline2\n"),
        Value::from("no final break\nend"),
        Value::from("kept\n\n\n"),
        Value::Seq(vec![Value::from("a\n\n"), Value::Int(1)]),
        Value::Map(map),
        Value::Float(1.5),
    ]
}

const SEPARATORS: &[&str] = &["", "# between\n", "\n"];

#[test]
fn an_edit_changes_only_the_key_it_addresses() {
    let mut checked = 0;
    let mut failures = Vec::new();
    let mut refused = Vec::new();
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
                        let mut cases = vec![(FieldEdit::Remove { key: key.into() }, removed)];
                        for value in new_values() {
                            let mut set = original.clone();
                            set.insert(key, value.clone());
                            cases.push((
                                FieldEdit::Set {
                                    key: key.into(),
                                    value,
                                },
                                set,
                            ));
                        }
                        for (edit, want) in cases {
                            checked += 1;
                            match edit_yaml(src.as_bytes(), std::slice::from_ref(&edit)) {
                                Ok(out) => {
                                    let text = String::from_utf8(out.bytes).unwrap();
                                    if parse_mapping(&text).ok().as_ref() != Some(&want) {
                                        failures.push(format!("{edit:?} on {src:?} gave {text:?}"));
                                    }
                                }
                                Err(EditError::InvalidResult { .. }) => {
                                    refused.push(format!("{edit:?} on {src:?}"))
                                }
                                Err(e) => failures.push(format!("{edit:?} on {src:?}: {e}")),
                            }
                        }
                    }
                }
            }
        }
    }
    assert!(checked > 5000, "only {checked} cases ran");
    // Some shapes are refused, and should be: blank lines after a new `|+`
    // value would join it, and a comment indented less than the old block
    // lands at the new block's indent. A jump in refusals means a regression.
    assert!(
        refused.len() * 12 < checked,
        "{} of {checked} edits were refused, for example:\n{}",
        refused.len(),
        refused
            .iter()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
    assert!(
        failures.is_empty(),
        "{} of {checked} edits went wrong:\n{}",
        failures.len(),
        failures.join("\n")
    );
}
