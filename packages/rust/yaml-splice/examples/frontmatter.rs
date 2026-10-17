//! Update the frontmatter of a Markdown note without touching anything else.
//!
//! Run with `cargo run --example frontmatter`.

use yaml_splice::{
    EditError, EditOptions, FieldEdit, Mapping, Value, edit_frontmatter, edit_yaml_with,
};

const NOTE: &str = "---
# Reviewed by hand; keep this comment.
title: 'Weekly plan'
Status: draft   # draft | done
tags: [work]
---
# Weekly plan

- Monday: write the report
";

fn main() -> Result<(), EditError> {
    // Split the note into the frontmatter block and the body. The block is
    // the text between the fences, without the line ending before the
    // closing `---` ("split form").
    let rest = NOTE
        .strip_prefix("---\n")
        .expect("the note starts with a fence");
    let (block, body) = rest
        .split_once("\n---\n")
        .expect("the note has a closing fence");

    let mut review = Mapping::new();
    review.insert("by", Value::from("sam"));
    review.insert("score", Value::Int(4));

    let outcome = edit_frontmatter(
        block,
        &[
            // Keys match case-insensitively by default: this finds `Status`.
            FieldEdit::Set {
                key: "status".into(),
                value: Value::from("done"),
            },
            FieldEdit::Rename {
                from: "tags".into(),
                to: "labels".into(),
            },
            // An absent key is appended.
            FieldEdit::Set {
                key: "review".into(),
                value: Value::Map(review),
            },
        ],
    )?;
    assert!(outcome.changed);

    let block = String::from_utf8(outcome.bytes).expect("the edit keeps UTF-8");
    let note = format!("---\n{block}\n---\n{body}");
    print!("{note}");
    assert!(note.contains("# Reviewed by hand; keep this comment."));
    assert!(note.contains("title: 'Weekly plan'"));
    assert!(note.contains("Status: done   # draft | done"));

    // Exact matching, for documents where `Status` and `status` are
    // different keys.
    let exact = EditOptions::default().case_sensitive(true);
    let refused = edit_yaml_with(
        b"Status: a\nstatus: b\n",
        &[FieldEdit::Remove {
            key: "STATUS".into(),
        }],
        &exact,
    )?;
    assert!(
        !refused.changed,
        "no key is spelled STATUS, so nothing changes"
    );

    // Without exact matching the same edit is ambiguous, and is refused.
    match edit_yaml_with(
        b"Status: a\nstatus: b\n",
        &[FieldEdit::Remove {
            key: "STATUS".into(),
        }],
        &EditOptions::default(),
    ) {
        Err(EditError::AmbiguousKey { key, at }) => {
            println!("refused: {key:?} matches more than one key (first at bytes {at:?})");
        }
        other => panic!("expected an ambiguous key, got {other:?}"),
    }
    Ok(())
}
