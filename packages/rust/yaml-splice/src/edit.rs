//! The edit functions: `edit_yaml(bytes, edits) -> EditOutcome`.
//!
//! UTF-8 YAML bytes and an ordered list of top-level field edits give new
//! bytes or a typed refusal. The functions do no I/O and are deterministic.
//! Only the edited field's bytes are rewritten.
//!
//! Compared with [`splice`](crate::splice), the older single-key functions,
//! these add case-insensitive key matching, the byte-identical no-op,
//! `Rename`, a re-parse of the whole output before it is returned, and the
//! [`EditError`] type, which carries byte spans.
//!
//! **Stability:** stable in 0.x.
//!
//! # What input is accepted
//!
//! One YAML 1.2 document whose root is a mapping with string keys, optionally
//! led by a UTF-8 BOM. An empty or comments-only document counts as an empty
//! mapping, so a `Set` can add the first key. Multi-document streams,
//! directives, roots that are not a mapping, and malformed input are refused
//! with an [`EditError`]. They are never repaired or reformatted.

use std::ops::Range;

use saphyr_parser::{Event, Parser};

use crate::parse::{self, KeySpan, ParseError, Parsed};
use crate::render;
use crate::splice::{line_indent, value_assignment, value_edit, without_entry};
use crate::value::{Mapping, Value};

/// The UTF-8 byte-order mark, `EF BB BF`.
const BOM: &str = "\u{feff}";

/// One top-level field edit.
///
/// The addressed key is always a string. The value a `Set` writes may be any
/// [`Value`]: string, number, boolean, null, sequence or mapping.
///
/// New kinds of edit may be added in a minor release, so a `match` needs a
/// wildcard arm.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub enum FieldEdit {
    /// Write `value` at `key`. If the current value is equal, nothing changes
    /// and the bytes stay identical. If it differs, only the value's bytes are
    /// replaced. If the key is absent, a new entry is appended.
    Set {
        /// The key to write.
        key: String,
        /// The value to write.
        value: Value,
    },
    /// Remove `key`, its value lines and its trailing comment on the same
    /// line. An absent key is a no-op.
    Remove {
        /// The key to remove.
        key: String,
    },
    /// Rename the key in place. The value, the comments and the key's position
    /// are kept.
    Rename {
        /// The key to rename. It must exist.
        from: String,
        /// The new name. No other key may already have it.
        to: String,
    },
}

/// The result of an edit batch.
///
/// **Stability:** stable in 0.x. New fields may be added in a minor release.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct EditOutcome {
    /// The complete output bytes, returned only after the whole batch
    /// succeeded. On a no-op these are byte-identical to the input.
    pub bytes: Vec<u8>,
    /// Whether any edit changed a byte. `false` means `bytes == input`.
    pub changed: bool,
}

/// How keys are matched.
///
/// Build one with [`EditOptions::default`] and the setter methods, since new
/// options may be added in a minor release:
///
/// ```
/// use yaml_splice::EditOptions;
///
/// let opts = EditOptions::default().case_sensitive(true);
/// assert!(opts.case_sensitive);
/// ```
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, Copy, Default)]
#[non_exhaustive]
pub struct EditOptions {
    /// When `true`, keys are matched by exact string equality. The default,
    /// `false`, matches keys case-insensitively (see [`edit_yaml`]).
    pub case_sensitive: bool,
}

impl EditOptions {
    /// Sets [`EditOptions::case_sensitive`].
    #[must_use]
    pub const fn case_sensitive(mut self, yes: bool) -> Self {
        self.case_sensitive = yes;
        self
    }
}

/// Why an edit batch was refused.
///
/// Every refusal is a value, never a panic, and never a fallback to
/// reformatting the whole document. Byte spans (`at`) are offsets into the
/// input, BOM included, and are given where a location is known.
///
/// New variants may be added in a minor release, so a `match` needs a
/// wildcard arm.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, thiserror::Error, PartialEq, Eq)]
#[non_exhaustive]
pub enum EditError {
    /// The input is not valid UTF-8.
    #[error("input is not valid UTF-8 (valid up to byte {valid_up_to})")]
    InvalidUtf8 {
        /// The length of the longest valid UTF-8 prefix.
        valid_up_to: usize,
    },

    /// The input is not well-formed YAML.
    #[error("malformed YAML: {message}")]
    MalformedYaml {
        /// The parser's message.
        message: String,
        /// Where the problem is, when known.
        at: Option<Range<usize>>,
    },

    /// A multi-document stream, a directive, or other syntax the crate does
    /// not edit.
    #[error("unsupported document: {message}")]
    UnsupportedDocument {
        /// What is unsupported.
        message: String,
        /// Where it is, when known.
        at: Option<Range<usize>>,
    },

    /// The document root is a scalar or a sequence, not a mapping.
    #[error("the document root is {found}, not a mapping")]
    RootNotMapping {
        /// `"a scalar"` or `"a sequence"`.
        found: &'static str,
        /// The span of the root.
        at: Range<usize>,
    },

    /// The key matches more than one existing top-level key: a literal
    /// duplicate, or two keys that are equal ignoring case.
    #[error("key {key:?} is ambiguous: it resolves to more than one existing top-level key")]
    AmbiguousKey {
        /// The key as given in the edit.
        key: String,
        /// The span of the first matching key.
        at: Range<usize>,
    },

    /// The key a `Rename` names is not present.
    #[error("key {key:?} is not present")]
    MissingKey {
        /// The key as given in the edit.
        key: String,
    },

    /// The new name a `Rename` gives already exists.
    #[error("rename destination key {key:?} already exists")]
    KeyConflict {
        /// The new name as given in the edit.
        key: String,
        /// The span of the existing key.
        at: Range<usize>,
    },

    /// The emitter refused to render a `Set` value, or a key a `Set` adds or
    /// a `Rename` writes.
    ///
    /// The edit functions render at `line_width` 0. The only emitter error,
    /// [`RenderError::FoldedBlockUnsupported`](crate::render::RenderError::FoldedBlockUnsupported),
    /// needs a `line_width` above 0, so this release never returns this
    /// variant. It is kept so a new emitter error can be reported without a
    /// breaking change.
    #[error("value for key {key:?} cannot be rendered: {message}")]
    UnrenderableValue {
        /// The key whose value failed.
        key: String,
        /// Why it failed.
        message: String,
    },

    /// The edited document no longer parses, an edit would change a key it
    /// does not address, or the edited key would not read back as asked. The
    /// batch is discarded rather than returning damaged bytes. The Display
    /// text says "no longer parses" in every case.
    #[error("the edited document no longer parses: {message}")]
    InvalidResult {
        /// Why the result was refused: the parser's message, or the check
        /// that failed.
        message: String,
    },
}

/// Edits `source` with case-insensitive key matching.
///
/// The edits run in order, and each one sees the result of the ones before
/// it. Either the whole batch applies or none of it does.
///
/// Keys are matched case-insensitively by default: `Title` and `title` are
/// the same key. The comparison lowercases both sides with
/// [`str::to_lowercase`] and applies no other normalization. Use
/// [`edit_yaml_with`] for exact matching.
///
/// The line ending of new lines follows the document's first line ending
/// (LF or CRLF). A BOM stays at byte zero. A new key is appended after the
/// last top-level entry, before a `...` document-end line if there is one.
///
/// **Stability:** stable in 0.x.
///
/// # Errors
///
/// Returns an [`EditError`] when the input is not UTF-8 or not a supported
/// YAML document, when a key is ambiguous, when a `Rename` source is missing
/// or its destination exists, when a value cannot be rendered, or when the
/// edited document would not parse.
pub fn edit_yaml(source: &[u8], edits: &[FieldEdit]) -> Result<EditOutcome, EditError> {
    edit_yaml_with(source, edits, &EditOptions::default())
}

/// [`edit_yaml`] with explicit [`EditOptions`].
///
/// **Stability:** stable in 0.x.
///
/// # Errors
///
/// The same as [`edit_yaml`].
pub fn edit_yaml_with(
    source: &[u8],
    edits: &[FieldEdit],
    opts: &EditOptions,
) -> Result<EditOutcome, EditError> {
    // UTF-8, optionally led by a BOM. The BOM is framing, not content: it stays
    // at byte zero and is outside every field span, so we edit the body and
    // reattach it verbatim.
    let text = std::str::from_utf8(source).map_err(|e| EditError::InvalidUtf8 {
        valid_up_to: e.valid_up_to(),
    })?;
    let (bom_len, body) = match text.strip_prefix(BOM) {
        Some(rest) => (BOM.len(), rest),
        None => (0, text),
    };

    // The source must be a supported document before any edit is planned.
    check_document_profile(body, bom_len)?;
    let eol = detect_eol(body);

    // Apply the edits in order. Each one runs on a fresh parse of the result
    // of the ones before it, so later edits see earlier ones. That costs a
    // reparse per edit, which does not matter for the few keys a frontmatter
    // block holds.
    let mut current = body.to_string();
    let mut changed = false;
    for edit in edits {
        let (next, did_change) = apply_one(&current, edit, opts, eol, bom_len)?;
        changed |= did_change;
        current = next;
    }

    // An edit that changes nothing is a byte-identical no-op. Return the original bytes
    // untouched (BOM included) rather than a reconstructed copy.
    if !changed {
        return Ok(EditOutcome {
            bytes: source.to_vec(),
            changed: false,
        });
    }

    // The complete output must parse before it is returned.
    validate_output(&current)?;

    let mut bytes = Vec::with_capacity(bom_len + current.len());
    if bom_len > 0 {
        bytes.extend_from_slice(BOM.as_bytes());
    }
    bytes.extend_from_slice(current.as_bytes());
    Ok(EditOutcome {
        bytes,
        changed: true,
    })
}

/// [`edit_yaml`] over a frontmatter block in split form, with
/// case-insensitive key matching.
///
/// A frontmatter block in split form is the text between the `---` fences of
/// a Markdown file, without the line ending before the closing fence: the
/// last line is not terminated. Under CRLF the last line ends in a bare `\r`,
/// because its `\n` was taken as the separator before the fence.
///
/// [`edit_yaml`] treats its input as a whole document, so appending a key, or
/// removing the last one, can add a final `\n`. This function removes that one
/// byte again, so the result is in split form too and can be put back between
/// the fences as it is. A no-op returns `block` unchanged.
///
/// ```
/// use yaml_splice::{FieldEdit, Value, edit_frontmatter};
///
/// let out = edit_frontmatter(
///     "title: Draft",
///     &[FieldEdit::Set { key: "status".into(), value: Value::from("done") }],
/// )?;
/// assert_eq!(out.bytes, b"title: Draft\nstatus: done");
/// # Ok::<(), yaml_splice::EditError>(())
/// ```
///
/// **Stability:** stable in 0.x.
///
/// # Errors
///
/// The same as [`edit_yaml`].
pub fn edit_frontmatter(block: &str, edits: &[FieldEdit]) -> Result<EditOutcome, EditError> {
    edit_frontmatter_with(block, edits, &EditOptions::default())
}

/// [`edit_frontmatter`] with explicit [`EditOptions`].
///
/// **Stability:** stable in 0.x.
///
/// # Errors
///
/// The same as [`edit_yaml`].
pub fn edit_frontmatter_with(
    block: &str,
    edits: &[FieldEdit],
    opts: &EditOptions,
) -> Result<EditOutcome, EditError> {
    // A block that already ends in a line break reads the same framed or not,
    // and an empty one has no last value to protect, so neither gets one.
    if block.is_empty() || block.ends_with('\n') {
        let mut outcome = edit_yaml_with(block.as_bytes(), edits, opts)?;
        if outcome.changed && block.is_empty() && outcome.bytes.last() == Some(&b'\n') {
            outcome.bytes.pop();
        }
        return Ok(outcome);
    }
    // Edit the block with the line break its framing adds back, so the result
    // check reads the block as a reader of the whole file will: the trailing
    // line breaks of a keep-chomped (`|+`) last value depend on it.
    let mut framed = String::with_capacity(block.len() + 1);
    framed.push_str(block);
    framed.push('\n');
    let mut outcome = edit_yaml_with(framed.as_bytes(), edits, opts)?;
    if outcome.changed {
        if outcome.bytes.last() == Some(&b'\n') {
            outcome.bytes.pop();
        }
    } else {
        outcome.bytes = block.as_bytes().to_vec();
    }
    Ok(outcome)
}

// --- document profile ------------------------------------------------------

fn check_document_profile(body: &str, bom_len: usize) -> Result<(), EditError> {
    if let Some(range) = leading_directive(body) {
        return Err(EditError::UnsupportedDocument {
            message: "YAML directives are not supported".to_string(),
            at: Some(offset(range, bom_len)),
        });
    }
    if count_documents(body)? > 1 {
        return Err(EditError::UnsupportedDocument {
            message: "multi-document stream: exactly one document is supported".to_string(),
            at: None,
        });
    }
    let parsed = parse::parse_with_spans(body).map_err(|e| map_parse_error(e, bom_len))?;
    root_is_editable(&parsed.root, body, bom_len)
}

/// A directive is a whole line beginning with `%` before any document content;
/// the first non-blank, non-comment line settles it. A top-level key cannot
/// begin with an unquoted `%`, so this never fires on real frontmatter.
fn leading_directive(body: &str) -> Option<Range<usize>> {
    let mut offset = 0usize;
    for line in body.split_inclusive('\n') {
        let trimmed = line.trim_start();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            offset += line.len();
            continue;
        }
        // A directive begins with `%` at column zero. The first non-blank,
        // non-comment line decides the question either way.
        if line.starts_with('%') {
            let end = offset + line.trim_end_matches(['\n', '\r']).len();
            return Some(offset..end);
        }
        return None;
    }
    None
}

fn count_documents(body: &str) -> Result<usize, EditError> {
    let mut count = 0usize;
    for item in Parser::new_from_str(body) {
        let (event, _span) = item.map_err(|e| EditError::MalformedYaml {
            message: e.to_string(),
            at: None,
        })?;
        if matches!(event, Event::DocumentStart(_)) {
            count += 1;
        }
    }
    Ok(count)
}

fn root_is_editable(root: &Value, body: &str, bom_len: usize) -> Result<(), EditError> {
    match root {
        // A mapping, or an empty/comments-only document (parsed as Null), which
        // counts as an empty mapping a `Set` can insert into.
        Value::Map(_) | Value::Null => Ok(()),
        Value::Seq(_) => Err(EditError::RootNotMapping {
            found: "a sequence",
            at: offset(0..body.len(), bom_len),
        }),
        _ => Err(EditError::RootNotMapping {
            found: "a scalar",
            at: offset(0..body.len(), bom_len),
        }),
    }
}

// --- per-edit application -------------------------------------------------

fn apply_one(
    current: &str,
    edit: &FieldEdit,
    opts: &EditOptions,
    eol: &'static str,
    bom_len: usize,
) -> Result<(String, bool), EditError> {
    let parsed = parse::parse_with_spans(current).map_err(|e| map_parse_error(e, bom_len))?;
    let (next, changed) = match edit {
        FieldEdit::Set { key, value } => set(current, &parsed, key, value, opts, eol, bom_len)?,
        FieldEdit::Remove { key } => remove(current, &parsed, key, opts, bom_len)?,
        FieldEdit::Rename { from, to } => rename(current, &parsed, from, to, opts, bom_len)?,
    };
    if changed {
        check_result(&parsed.root, &next, edit, opts)?;
    }
    Ok((next, changed))
}

/// Refuses an edit whose parsed result is not what the edit asked for: the
/// addressed key must hold the new value (`Set`), be gone (`Remove`) or hold
/// its old value under the new name (`Rename`), and every other key must keep
/// its value and order.
///
/// The span arithmetic is meant to make a wrong result impossible, but YAML
/// has corners where bytes left in place change meaning once a neighbour
/// moves: blank lines after a keep-chomped block scalar (`|+`) belong to it,
/// so removing the next key can hand that scalar the removed value's trailing
/// blank line. Checking the parsed result turns such a case into a refusal
/// rather than a silent change.
fn check_result(
    before: &Value,
    after_src: &str,
    edit: &FieldEdit,
    opts: &EditOptions,
) -> Result<(), EditError> {
    let after = parse::parse_with_spans(after_src).map_err(|e| EditError::InvalidResult {
        message: e.to_string(),
    })?;
    let empty = Mapping::new();
    let before = before.as_mapping().unwrap_or(&empty);
    let after = after.root.as_mapping().unwrap_or(&empty);
    let addressed: &[&str] = match edit {
        FieldEdit::Set { key, .. } | FieldEdit::Remove { key } => &[key.as_str()],
        FieldEdit::Rename { from, to } => &[from.as_str(), to.as_str()],
    };
    let others = |m: &'_ Mapping| -> Vec<(String, Value)> {
        m.iter()
            .filter(|(k, _)| !addressed.iter().any(|a| key_eq(k, a, opts)))
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect()
    };
    let (b, a) = (others(before), others(after));
    let others_kept = b.len() == a.len()
        && b.iter()
            .zip(&a)
            .all(|((kb, vb), (ka, va))| kb == ka && same_value(vb, va));
    let matching = |m: &Mapping, key: &str| -> Vec<Value> {
        m.iter()
            .filter(|(k, _)| key_eq(k, key, opts))
            .map(|(_, v)| v.clone())
            .collect()
    };
    let addressed_ok = match edit {
        FieldEdit::Set { key, value } => {
            matches!(matching(after, key).as_slice(), [v] if reads_back_as(v, value))
        }
        FieldEdit::Remove { key } => matching(after, key).is_empty(),
        FieldEdit::Rename { from, to } => {
            let old = matching(before, from);
            let new: Vec<Value> = after
                .iter()
                .filter(|(k, _)| *k == to.as_str())
                .map(|(_, v)| v.clone())
                .collect();
            let from_gone = key_eq(from, to, opts) || matching(after, from).is_empty();
            from_gone && matches!((old.as_slice(), new.as_slice()), ([o], [n]) if same_value(o, n))
        }
    };
    if !others_kept {
        Err(EditError::InvalidResult {
            message: "the edit would change a key it does not address".to_string(),
        })
    } else if !addressed_ok {
        Err(EditError::InvalidResult {
            message: "the edited key would not read back as the edit asked".to_string(),
        })
    } else {
        Ok(())
    }
}

/// Value equality where `.nan` equals `.nan`, at any depth.
fn same_value(a: &Value, b: &Value) -> bool {
    value_eq(a, b, false)
}

/// [`same_value`], and also a float with an integer value equals that
/// integer. Only for reading back a `Set`: `1.0` renders as `1`, which parses
/// back as an integer.
fn reads_back_as(read: &Value, written: &Value) -> bool {
    value_eq(read, written, true)
}

fn value_eq(a: &Value, b: &Value, int_is_float: bool) -> bool {
    match (a, b) {
        (Value::Float(x), Value::Float(y)) => x == y || (x.is_nan() && y.is_nan()),
        // The cast is the comparison: an integer equals the float it converts to.
        #[allow(clippy::cast_precision_loss)]
        (Value::Int(i), Value::Float(f)) | (Value::Float(f), Value::Int(i)) => {
            int_is_float && *i as f64 == *f
        }
        (Value::Seq(x), Value::Seq(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(x, y)| value_eq(x, y, int_is_float))
        }
        (Value::Map(x), Value::Map(y)) => {
            x.len() == y.len()
                && x.iter()
                    .zip(y.iter())
                    .all(|((kx, vx), (ky, vy))| kx == ky && value_eq(vx, vy, int_is_float))
        }
        _ => a == b,
    }
}

fn set(
    current: &str,
    parsed: &Parsed,
    key: &str,
    value: &Value,
    opts: &EditOptions,
    eol: &'static str,
    bom_len: usize,
) -> Result<(String, bool), EditError> {
    let hits = find_keys(current, &parsed.top_level, key, opts);
    match hits.len() {
        0 => Ok((append_entry(current, key, value, eol, bom_len)?, true)),
        1 => {
            let span = hits[0];
            let existing = parsed.root.as_mapping().and_then(|m| m.get(&span.key));
            // A `Set` of an equal value changes no byte: no quoting is
            // normalized, no collection reordered, no scalar re-spelled.
            if existing.is_some_and(|e| same_value(e, value)) {
                Ok((current.to_string(), false))
            } else {
                Ok((
                    replace_value(current, span, value, key, eol, bom_len)?,
                    true,
                ))
            }
        }
        _ => Err(EditError::AmbiguousKey {
            key: key.to_string(),
            at: offset(hits[0].key_range.clone(), bom_len),
        }),
    }
}

fn remove(
    current: &str,
    parsed: &Parsed,
    key: &str,
    opts: &EditOptions,
    bom_len: usize,
) -> Result<(String, bool), EditError> {
    let hits = find_keys(current, &parsed.top_level, key, opts);
    match hits.len() {
        0 => Ok((current.to_string(), false)),
        1 => Ok((without_entry(current, hits[0]), true)),
        _ => Err(EditError::AmbiguousKey {
            key: key.to_string(),
            at: offset(hits[0].key_range.clone(), bom_len),
        }),
    }
}

fn rename(
    current: &str,
    parsed: &Parsed,
    from: &str,
    to: &str,
    opts: &EditOptions,
    bom_len: usize,
) -> Result<(String, bool), EditError> {
    let from_hits = find_keys(current, &parsed.top_level, from, opts);
    let from_span = match from_hits.len() {
        0 => {
            return Err(EditError::MissingKey {
                key: from.to_string(),
            });
        }
        1 => from_hits[0],
        _ => {
            return Err(EditError::AmbiguousKey {
                key: from.to_string(),
                at: offset(from_hits[0].key_range.clone(), bom_len),
            });
        }
    };

    // A destination that matches a different existing key is a conflict.
    // One that folds to the source key itself (a re-spelling, such as
    // `title` → `Title`) is not.
    if let Some(conflict) = parsed.top_level.iter().find(|k| {
        parse::is_string_key(current, k)
            && key_eq(&k.key, to, opts)
            && k.key_range != from_span.key_range
    }) {
        return Err(EditError::KeyConflict {
            key: to.to_string(),
            at: offset(conflict.key_range.clone(), bom_len),
        });
    }

    let key_text = render::key_token(to).map_err(|e| EditError::UnrenderableValue {
        key: to.to_string(),
        message: e.to_string(),
    })?;
    let changed = current[from_span.key_range.clone()] != *key_text;
    let mut out = String::with_capacity(current.len());
    out.push_str(&current[..from_span.key_range.start]);
    out.push_str(&key_text);
    out.push_str(&current[from_span.key_range.end..]);
    Ok((out, changed))
}

// --- span edits ------------------------------------------------------------

fn replace_value(
    current: &str,
    span: &KeySpan,
    value: &Value,
    key: &str,
    eol: &'static str,
    _bom_len: usize,
) -> Result<String, EditError> {
    let key_indent = line_indent(current, span.key_range.start);
    let text =
        value_assignment(value, &key_indent, eol).map_err(|e| EditError::UnrenderableValue {
            key: key.to_string(),
            message: e.to_string(),
        })?;
    let (range, text) = value_edit(current, span, text);
    let mut out = String::with_capacity(current.len());
    out.push_str(&current[..range.start]);
    out.push_str(&text);
    out.push_str(&current[range.end..]);
    Ok(out)
}

fn append_entry(
    current: &str,
    key: &str,
    value: &Value,
    eol: &'static str,
    _bom_len: usize,
) -> Result<String, EditError> {
    let key_text = render::key_token(key).map_err(|e| EditError::UnrenderableValue {
        key: key.to_string(),
        message: e.to_string(),
    })?;
    let assign = value_assignment(value, "", eol).map_err(|e| EditError::UnrenderableValue {
        key: key.to_string(),
        message: e.to_string(),
    })?;
    let entry = format!("{key_text}:{assign}");

    // Appended after the existing top-level entries, before any explicit
    // document-end marker.
    let insert_at = doc_end_marker_start(current).unwrap_or(current.len());
    let (head, tail) = current.split_at(insert_at);

    let mut out = String::with_capacity(current.len() + entry.len() + 2 * eol.len());
    out.push_str(head);
    if !head.is_empty() && !head.ends_with('\n') {
        out.push_str(eol);
    }
    out.push_str(&entry);
    out.push_str(eol);
    out.push_str(tail);
    Ok(out)
}

/// The byte offset of a `...` document-end marker line, if the document has
/// one. Only a line that is exactly `...` (bar its line ending) counts.
fn doc_end_marker_start(s: &str) -> Option<usize> {
    let mut offset = 0usize;
    for line in s.split_inclusive('\n') {
        if line.trim_end_matches(['\n', '\r']) == "..." {
            return Some(offset);
        }
        offset += line.len();
    }
    None
}

// --- addressing ------------------------------------------------------------

fn find_keys<'a>(src: &str, top: &'a [KeySpan], key: &str, opts: &EditOptions) -> Vec<&'a KeySpan> {
    top.iter()
        .filter(|k| parse::is_string_key(src, k) && key_eq(&k.key, key, opts))
        .collect()
}

fn key_eq(a: &str, b: &str, opts: &EditOptions) -> bool {
    if opts.case_sensitive {
        a == b
    } else {
        fold(a) == fold(b)
    }
}

/// The case-insensitive key comparison: `to_lowercase` on both sides, with no
/// other normalization. It covers ASCII `Title`/`title` and Unicode-aware
/// lowercasing for accented Latin, Greek and Cyrillic keys.
fn fold(s: &str) -> String {
    s.to_lowercase()
}

// --- output validation -----------------------------------------------------

fn validate_output(current: &str) -> Result<(), EditError> {
    match parse::parse_with_spans(current) {
        Ok(parsed) => match parsed.root {
            Value::Map(_) | Value::Null => Ok(()),
            _ => Err(EditError::InvalidResult {
                message: "edited document no longer has a mapping root".to_string(),
            }),
        },
        Err(e) => Err(EditError::InvalidResult {
            message: e.to_string(),
        }),
    }
}

// --- small helpers ---------------------------------------------------------

/// The document's own line ending, from the first line that has one.
///
/// `splice`'s [`block_eol`](crate::splice) answers the same question for a
/// frontmatter block in split form, which can be CRLF without containing a
/// single `\n`. This one sees whole documents, where that shape cannot occur.
fn detect_eol(body: &str) -> &'static str {
    match body.find('\n') {
        Some(i) if i > 0 && body.as_bytes()[i - 1] == b'\r' => "\r\n",
        _ => "\n",
    }
}

fn offset(range: Range<usize>, bom_len: usize) -> Range<usize> {
    (range.start + bom_len)..(range.end + bom_len)
}

fn map_parse_error(e: ParseError, _bom_len: usize) -> EditError {
    match e {
        ParseError::Syntax(message) => EditError::MalformedYaml { message, at: None },
        ParseError::NotAMapping(found) => EditError::RootNotMapping { found, at: 0..0 },
        ParseError::DuplicateKey(message) => EditError::MalformedYaml { message, at: None },
    }
}

#[cfg(test)]
mod frontmatter_tests {
    use super::*;

    fn out(r: Result<EditOutcome, EditError>) -> String {
        String::from_utf8(r.unwrap().bytes).unwrap()
    }

    #[test]
    fn appending_to_an_unterminated_block_returns_split_form() {
        let edits = [FieldEdit::Set {
            key: "b".to_string(),
            value: Value::Int(2),
        }];
        assert_eq!(out(edit_frontmatter("a: 1", &edits)), "a: 1\nb: 2");
    }

    #[test]
    fn removing_the_last_key_leaves_no_trailing_newline() {
        let edits = [FieldEdit::Remove {
            key: "b".to_string(),
        }];
        assert_eq!(out(edit_frontmatter("a: 1\nb: 2", &edits)), "a: 1");
    }

    #[test]
    fn a_semantically_equal_set_keeps_the_original_quoting() {
        let edits = [FieldEdit::Set {
            key: "version".to_string(),
            value: Value::Str("0.2.0".to_string()),
        }];
        let result = edit_frontmatter("version: '0.2.0'", &edits).unwrap();
        assert!(!result.changed);
        assert_eq!(result.bytes, b"version: '0.2.0'");
    }

    #[test]
    fn a_crlf_block_keeps_its_bare_cr() {
        let edits = [FieldEdit::Set {
            key: "a".to_string(),
            value: Value::Int(9),
        }];
        assert_eq!(
            out(edit_frontmatter("a: 1\r\nb: 2\r", &edits)),
            "a: 9\r\nb: 2\r"
        );
    }

    #[test]
    fn a_no_op_on_an_empty_block_returns_an_empty_string() {
        let result = edit_frontmatter("", &[]).unwrap();
        assert!(!result.changed);
        assert_eq!(result.bytes, Vec::<u8>::new());
    }

    #[test]
    fn a_set_on_an_empty_block_returns_just_the_entry() {
        let edits = [FieldEdit::Set {
            key: "kind".to_string(),
            value: Value::from("note"),
        }];
        assert_eq!(out(edit_frontmatter("", &edits)), "kind: note");
    }

    #[test]
    fn appending_to_a_crlf_block_in_split_form_keeps_crlf() {
        let edits = [FieldEdit::Set {
            key: "b".to_string(),
            value: Value::Int(2),
        }];
        assert_eq!(out(edit_frontmatter("a: 1\r", &edits)), "a: 1\r\nb: 2\r");
    }

    #[test]
    fn an_already_terminated_block_keeps_its_terminator() {
        let set = |v: i64| {
            [FieldEdit::Set {
                key: "a".to_string(),
                value: Value::Int(v),
            }]
        };
        assert_eq!(out(edit_frontmatter("a: 1\n", &set(2))), "a: 2\n");
        let same = edit_frontmatter("a: 1\n", &set(1)).unwrap();
        assert!(!same.changed);
        assert_eq!(same.bytes, b"a: 1\n");
        let remove = [FieldEdit::Remove {
            key: "b".to_string(),
        }];
        assert_eq!(out(edit_frontmatter("a: 1\nb: 2\n", &remove)), "a: 1\n");
    }

    #[test]
    fn a_rename_that_only_changes_case_is_a_re_spelling() {
        let rename = |from: &str, to: &str| {
            [FieldEdit::Rename {
                from: from.to_string(),
                to: to.to_string(),
            }]
        };
        let r = edit_yaml(b"title: x\n", &rename("title", "Title")).unwrap();
        assert!(r.changed);
        assert_eq!(r.bytes, b"Title: x\n");

        let same = edit_yaml(b"a: 1\n", &rename("a", "a")).unwrap();
        assert!(!same.changed);
        assert_eq!(same.bytes, b"a: 1\n");

        // A destination that folds to a different key conflicts by default ...
        assert!(matches!(
            edit_yaml(b"a: 1\nB: 2\n", &rename("a", "b")),
            Err(EditError::KeyConflict { ref key, .. }) if key == "b"
        ));
        // ... and not when keys match exactly.
        let exact = EditOptions::default().case_sensitive(true);
        let r = edit_yaml_with(b"a: 1\nB: 2\n", &rename("a", "b"), &exact).unwrap();
        assert_eq!(r.bytes, b"b: 1\nB: 2\n");
    }

    #[test]
    fn an_edit_that_would_change_a_neighbour_is_refused() {
        // The blank line after `b`'s block scalar would join `a`'s keep-chomped
        // (`|+`) value once `b` is gone, changing `a`.
        let src = "a: |+\n  kept\n\nb: |\n  x\n\nc: 1\n";
        let edits = [FieldEdit::Remove {
            key: "b".to_string(),
        }];
        assert!(matches!(
            edit_yaml(src.as_bytes(), &edits),
            Err(EditError::InvalidResult { .. })
        ));
    }

    #[test]
    fn a_nan_neighbour_does_not_block_an_edit() {
        let src = "n: .nan\nm: [1, .nan, {x: .NaN}]\nt: a\n";
        let set = [FieldEdit::Set {
            key: "t".to_string(),
            value: Value::from("b"),
        }];
        let out = edit_yaml(src.as_bytes(), &set).unwrap();
        assert_eq!(
            String::from_utf8(out.bytes).unwrap(),
            "n: .nan\nm: [1, .nan, {x: .NaN}]\nt: b\n"
        );
        let remove = [FieldEdit::Remove {
            key: "t".to_string(),
        }];
        assert!(edit_yaml(src.as_bytes(), &remove).unwrap().changed);
    }

    #[test]
    fn a_keep_chomped_last_value_can_be_set_in_split_form() {
        let edits = [FieldEdit::Set {
            key: "b".to_string(),
            value: Value::from("kept\n\n"),
        }];
        let out = edit_frontmatter("a: 1\nb: x", &edits).unwrap();
        let block = String::from_utf8(out.bytes).unwrap();
        assert_eq!(block, "a: 1\nb: |+\n  kept\n");
        // Framed as a file, the block reads back as the value that was set.
        let note = format!("{block}\n");
        assert_eq!(
            parse::parse_mapping(&note).unwrap().get("b"),
            Some(&Value::from("kept\n\n"))
        );
    }

    #[test]
    fn values_compare_as_a_reader_sees_them() {
        assert!(same_value(&Value::Float(f64::NAN), &Value::Float(f64::NAN)));
        assert!(!same_value(&Value::Float(1.0), &Value::Int(1)));
        assert!(reads_back_as(&Value::Int(1), &Value::Float(1.0)));
        assert!(!reads_back_as(&Value::Int(1), &Value::Float(1.5)));
        assert!(same_value(
            &Value::Seq(vec![Value::Float(f64::NAN)]),
            &Value::Seq(vec![Value::Float(f64::NAN)])
        ));
        assert!(!same_value(&Value::from("1"), &Value::Int(1)));
    }

    #[test]
    fn a_float_with_an_integer_value_can_be_set() {
        let edits = [FieldEdit::Set {
            key: "f".to_string(),
            value: Value::Float(2.0),
        }];
        let out = edit_yaml(b"f: 1\n", &edits).unwrap();
        assert_eq!(out.bytes, b"f: 2\n");
    }
}
