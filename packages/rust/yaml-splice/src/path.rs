//! Path edits: `SetPath`, `RemovePath` and `RenamePath`.
//!
//! The top-level edits address a key of the root mapping. A path edit walks
//! down from the root, one segment at a time, to a key or an item below it,
//! and rewrites only that node's bytes. The walk reads the spans of each
//! mapping on the way (`parse::map_entries`), so the bytes outside the edit
//! are never touched.
//!
//! An edit is a list of byte-range replacements. Before the result is
//! returned it is parsed and compared with the document as the same edit
//! applied in memory ([`apply_model`]), so a span that is wrong, or a
//! neighbour that changes meaning, is a refusal and never damaged output.

use std::ops::Range;

use crate::edit::{
    EditError, EditOptions, PathSegment, key_eq, offset, path_text, same_value, set, value_eq,
};
use crate::parse::{self, Ev, EvKind, KeySpan, MapEntry, Parsed};
use crate::render;
use crate::splice::{value_assignment, value_edit};
use crate::value::{Mapping, Value};

/// What a path edit does at its last segment.
pub(crate) enum Op<'a> {
    Set(&'a Value),
    Remove,
    Rename(&'a str),
}

/// Byte-range replacements, in ascending order, that do not overlap.
type Edits = Vec<(Range<usize>, String)>;

struct Cx<'a> {
    src: &'a str,
    events: &'a [Ev],
    path: &'a [PathSegment],
    op: &'a Op<'a>,
    opts: &'a EditOptions,
    eol: &'static str,
    bom_len: usize,
}

/// What encloses the mapping being walked, for the one edit that must reach
/// out of it: removing its only key.
enum Parent<'a> {
    /// The value of a mapping entry: `{}` goes after its `:`.
    Entry(&'a KeySpan),
}

/// Applies one path edit to `current`. Returns the new text and whether it
/// changed.
pub(crate) fn apply(
    current: &str,
    parsed: &Parsed,
    path: &[PathSegment],
    op: Op<'_>,
    opts: &EditOptions,
    eol: &'static str,
    bom_len: usize,
) -> Result<(String, bool), EditError> {
    let events =
        parse::collect_events(current).map_err(|e| crate::edit::map_parse_error(e, bom_len))?;
    let cx = Cx {
        src: current,
        events: &events,
        path,
        op: &op,
        opts,
        eol,
        bom_len,
    };
    if path.is_empty() {
        return Err(unsupported(&cx, "the path is empty"));
    }
    let PathSegment::Key(first) = &path[0] else {
        return Err(mismatch(&cx, 0, "a mapping"));
    };

    // An absent first key is the top level's own append, so it adds the key
    // the way `Set` does.
    let top = &parsed.top_level;
    let hits: Vec<&KeySpan> = top
        .iter()
        .filter(|k| parse::is_string_key(current, k) && key_eq(&k.key, first, opts))
        .collect();
    let root_map = events
        .iter()
        .position(|e| matches!(e.kind, EvKind::MapStart(_)));
    let edits = match (hits.len(), root_map) {
        (0, _) => {
            let Op::Set(value) = &op else {
                return Err(not_found(&cx, 0));
            };
            let nested = nest(&cx, 1, value)?;
            let (next, changed) = set(current, parsed, first, &nested, opts, eol, bom_len)?;
            return finish(&cx, parsed, next, changed);
        }
        (_, Some(root)) => {
            let root_value = parsed
                .root
                .as_mapping()
                .ok_or_else(|| mismatch(&cx, 0, "a scalar"))?;
            walk_map(&cx, root, current.len(), None, root_value, 0)?
        }
        _ => return Err(not_found(&cx, 0)),
    };
    if edits.is_empty() {
        return Ok((current.to_string(), false));
    }
    let next = splice_all(current, &edits);
    finish(&cx, parsed, next, true)
}

/// Refuses a result that does not read as the edit asked for.
fn finish(
    cx: &Cx<'_>,
    parsed: &Parsed,
    next: String,
    changed: bool,
) -> Result<(String, bool), EditError> {
    if !changed {
        return Ok((next, false));
    }
    let mut want = parsed.root.clone();
    apply_model(&mut want, cx.path, cx.op, cx.opts)
        .map_err(|e| e.unwrap_or_else(|| invalid("the edit cannot be applied in memory")))?;
    let read_src = crate::edit::as_read(&next, cx.bom_len);
    let after = parse::parse_with_spans(read_src).map_err(|e| EditError::InvalidResult {
        message: e.to_string(),
    })?;
    if value_eq(&after.root, &want, true) {
        Ok((next, true))
    } else {
        Err(invalid(
            "the edited document would not read back as the edit asked",
        ))
    }
}

fn invalid(message: &str) -> EditError {
    EditError::InvalidResult {
        message: message.to_string(),
    }
}

fn splice_all(src: &str, edits: &Edits) -> String {
    let mut out = src.to_string();
    for (range, text) in edits.iter().rev() {
        out.replace_range(range.clone(), text);
    }
    out
}

// --- errors -----------------------------------------------------------------

fn not_found(cx: &Cx<'_>, segment: usize) -> EditError {
    EditError::PathNotFound {
        path: path_text(cx.path),
        segment,
    }
}

fn mismatch(cx: &Cx<'_>, segment: usize, found: &'static str) -> EditError {
    EditError::PathTypeMismatch {
        path: path_text(cx.path),
        segment,
        found,
    }
}

fn unsupported(cx: &Cx<'_>, message: &str) -> EditError {
    EditError::UnsupportedPath {
        path: path_text(cx.path),
        message: message.to_string(),
    }
}

// --- the walk ---------------------------------------------------------------

/// Handles the segment at `depth`, which names a key of the block mapping
/// that starts at event `map_idx`.
fn walk_map(
    cx: &Cx<'_>,
    map_idx: usize,
    hard_stop: usize,
    parent: Option<Parent<'_>>,
    m: &Mapping,
    depth: usize,
) -> Result<Edits, EditError> {
    let PathSegment::Key(key) = &cx.path[depth] else {
        return Err(mismatch(cx, depth, "a mapping"));
    };
    if key == "<<" {
        return Err(unsupported(cx, "a merge key (`<<`) is not edited"));
    }
    let entries = parse::map_entries(cx.events, cx.src, map_idx, hard_stop);
    let hits: Vec<usize> = entries
        .iter()
        .enumerate()
        .filter(|(_, e)| parse::is_string_key(cx.src, &e.span) && key_eq(&e.span.key, key, cx.opts))
        .map(|(i, _)| i)
        .collect();
    if hits.len() > 1 {
        return Err(EditError::AmbiguousKey {
            key: key.clone(),
            at: offset(entries[hits[0]].span.key_range.clone(), cx.bom_len),
        });
    }
    let last = depth + 1 == cx.path.len();
    let Some(&i) = hits.first() else {
        return absent(cx, &entries, key, m, depth, last);
    };
    if last {
        return leaf(cx, &entries, i, parent, m);
    }
    let child_stop = entries
        .get(i + 1)
        .map_or(hard_stop, |n| n.span.key_range.start);
    descend(cx, &entries[i], child_stop, m, depth)
}

/// The key is not in the mapping.
fn absent(
    cx: &Cx<'_>,
    entries: &[MapEntry],
    key: &str,
    m: &Mapping,
    depth: usize,
    last: bool,
) -> Result<Edits, EditError> {
    match cx.op {
        Op::Set(value) => {
            let nested = nest(cx, depth + 1, value)?;
            append(cx, entries, key, &nested, m)
        }
        Op::Remove if last => Ok(Vec::new()),
        Op::Rename(_) if last => Err(EditError::MissingKey {
            key: key.to_string(),
        }),
        _ => Err(not_found(cx, depth)),
    }
}

/// The key is there and more segments follow: step into its value.
fn descend(
    cx: &Cx<'_>,
    entry: &MapEntry,
    child_stop: usize,
    m: &Mapping,
    depth: usize,
) -> Result<Edits, EditError> {
    let span = &entry.span;
    if matches!(cx.events[entry.value_idx].kind, EvKind::Alias(_)) {
        return Err(unsupported(cx, "the path goes through an alias"));
    }
    let child = m.get(&span.key).unwrap_or(&Value::Null);
    let next = depth + 1;
    match child {
        // Nothing to lose: an empty value is replaced by the collection the
        // next segment needs.
        Value::Null => vivify(cx, entry, depth),
        c if c.is_empty_collection() => vivify(cx, entry, depth),
        Value::Map(child_map) => {
            if starts_with(cx.src, entry.span.value_range.start, b'{') {
                return Err(unsupported(cx, "flow mappings are not edited yet"));
            }
            walk_map(
                cx,
                entry.value_idx,
                child_stop,
                Some(Parent::Entry(span)),
                child_map,
                next,
            )
        }
        Value::Seq(_) => match cx.path[next] {
            PathSegment::Key(_) => Err(mismatch(cx, next, "a sequence")),
            PathSegment::Index(_) => Err(unsupported(cx, "sequences are not edited yet")),
        },
        _ => Err(mismatch(cx, next, "a scalar")),
    }
}

/// An empty parent (`a:`, `a: ~`, `a: {}`, `a: []`) on the way: a `SetPath`
/// writes the collection the rest of the path asks for in its place. The
/// others find nothing below it.
fn vivify(cx: &Cx<'_>, entry: &MapEntry, depth: usize) -> Result<Edits, EditError> {
    let next = depth + 1;
    match cx.op {
        Op::Set(value) => {
            let nested = nest(cx, next, value)?;
            Ok(vec![replace_value(cx, &entry.span, &nested)?])
        }
        Op::Remove if next + 1 == cx.path.len() => Ok(Vec::new()),
        Op::Rename(_) if next + 1 == cx.path.len() => match &cx.path[next] {
            PathSegment::Key(k) => Err(EditError::MissingKey { key: k.clone() }),
            PathSegment::Index(_) => Err(mismatch(cx, next, "a mapping")),
        },
        _ => Err(not_found(cx, next)),
    }
}

/// The last segment names an existing key.
fn leaf(
    cx: &Cx<'_>,
    entries: &[MapEntry],
    i: usize,
    parent: Option<Parent<'_>>,
    m: &Mapping,
) -> Result<Edits, EditError> {
    let span = &entries[i].span;
    match cx.op {
        Op::Set(value) => {
            if m.get(&span.key).is_some_and(|e| same_value(e, value)) {
                return Ok(Vec::new());
            }
            Ok(vec![replace_value(cx, span, value)?])
        }
        Op::Remove => remove(cx, entries, i, parent, m),
        Op::Rename(to) => {
            if let Some(c) = entries.iter().enumerate().find(|(j, e)| {
                *j != i && parse::is_string_key(cx.src, &e.span) && key_eq(&e.span.key, to, cx.opts)
            }) {
                return Err(EditError::KeyConflict {
                    key: (*to).to_string(),
                    at: offset(c.1.span.key_range.clone(), cx.bom_len),
                });
            }
            let text = key_text(to)?;
            if cx.src[span.key_range.clone()] == *text {
                return Ok(Vec::new());
            }
            Ok(vec![(span.key_range.clone(), text)])
        }
    }
}

// --- writing ----------------------------------------------------------------

fn key_text(key: &str) -> Result<String, EditError> {
    render::key_token(key).map_err(|e| EditError::UnrenderableValue {
        key: key.to_string(),
        message: e.to_string(),
    })
}

/// The spaces before the line's content at `pos`: a key's own column, which
/// differs from its line's indent for the first key of a `- key:` item.
fn column(src: &str, pos: usize) -> String {
    " ".repeat(pos - line_start(src, pos))
}

fn line_start(src: &str, pos: usize) -> usize {
    src[..pos].rfind('\n').map_or(0, |i| i + 1)
}

/// The offset just past the line break that ends the line holding `pos`, or
/// the end of the source.
fn line_end_after(src: &str, pos: usize) -> usize {
    src[pos..].find('\n').map_or(src.len(), |i| pos + i + 1)
}

fn starts_with(src: &str, pos: usize, byte: u8) -> bool {
    src.as_bytes().get(pos) == Some(&byte)
}

/// The assignment that replaces the value of an existing key.
fn replace_value(
    cx: &Cx<'_>,
    span: &KeySpan,
    value: &Value,
) -> Result<(Range<usize>, String), EditError> {
    let indent = column(cx.src, span.key_range.start);
    let text =
        value_assignment(value, &indent, cx.eol).map_err(|e| EditError::UnrenderableValue {
            key: span.key.clone(),
            message: e.to_string(),
        })?;
    Ok(value_edit(cx.src, span, text))
}

/// A new key after the last entry of a block mapping, at the keys' column.
///
/// It goes after the lines of the last value and after the comment lines at
/// the keys' column or deeper that follow it, which belong to the block. Blank
/// lines and less indented comments after the block stay after the new key. A
/// keep-chomped (`|+`) last value owns its trailing blank lines, so the key
/// goes after them.
fn append(
    cx: &Cx<'_>,
    entries: &[MapEntry],
    key: &str,
    value: &Value,
    _m: &Mapping,
) -> Result<Edits, EditError> {
    let (Some(first), Some(last)) = (entries.first(), entries.last()) else {
        return Err(unsupported(cx, "the mapping has no editable key"));
    };
    let indent = column(cx.src, first.span.key_range.start);
    let assign =
        value_assignment(value, &indent, cx.eol).map_err(|e| EditError::UnrenderableValue {
            key: key.to_string(),
            message: e.to_string(),
        })?;
    let entry = format!("{indent}{}:{assign}", key_text(key)?);

    let after = last.span.value_range.end.max(last.span.key_range.end);
    let mut p = line_end_after(cx.src, after);
    if keeps_trailing_blanks(cx, last) {
        while is_blank_line(cx.src, p) {
            p = line_end_after(cx.src, p);
        }
    }
    let mut q = p;
    while q < cx.src.len() {
        let line_end = line_end_after(cx.src, q);
        let line = &cx.src[q..line_end];
        let trimmed = line.trim_start();
        if trimmed.is_empty() {
            q = line_end;
        } else if trimmed.starts_with('#') && line.len() - trimmed.len() >= indent.len() {
            p = line_end;
            q = line_end;
        } else {
            break;
        }
    }
    let text = if p >= cx.src.len() && !cx.src.ends_with('\n') {
        format!("{}{entry}", cx.eol)
    } else {
        format!("{entry}{}", cx.eol)
    };
    Ok(vec![(p..p, text)])
}

fn is_blank_line(src: &str, pos: usize) -> bool {
    pos < src.len() && src[pos..line_end_after(src, pos)].trim().is_empty()
}

/// Whether the last scalar of an entry's value is a block scalar with the
/// keep (`+`) chomping indicator.
fn keeps_trailing_blanks(cx: &Cx<'_>, entry: &MapEntry) -> bool {
    let end = parse::skip_node(cx.events, entry.value_idx);
    let Some(ev) = cx.events[entry.value_idx..end]
        .iter()
        .rev()
        .find(|e| matches!(e.kind, EvKind::Scalar(..) | EvKind::Alias(_)))
    else {
        return false;
    };
    if !matches!(
        ev.kind,
        EvKind::Scalar(
            _,
            saphyr_parser::ScalarStyle::Literal | saphyr_parser::ScalarStyle::Folded,
            ..
        )
    ) {
        return false;
    }
    // The span starts at the content, so the header is the last non-blank
    // line before it.
    let start = parse::byte_index(cx.src, ev.span.start.index());
    let mut end = line_start(cx.src, start);
    while end > 0 {
        let from = line_start(cx.src, end - 1);
        let line = cx.src[from..end].trim_end_matches(['\r', '\n']);
        if !line.trim().is_empty() {
            let code = line.split(" #").next().unwrap_or(line);
            return code.trim_end().ends_with('+') || code.contains("+ ");
        }
        end = from;
    }
    false
}

/// Removes a key and its lines. The only key of a mapping leaves `{}` after
/// the parent's `:`.
fn remove(
    cx: &Cx<'_>,
    entries: &[MapEntry],
    i: usize,
    parent: Option<Parent<'_>>,
    m: &Mapping,
) -> Result<Edits, EditError> {
    let span = &entries[i].span;
    let start = line_start(cx.src, span.key_range.start);
    let after = span.value_range.end.max(span.key_range.end);
    let end = line_end_after(cx.src, after);
    let only = entries.len() == 1 && m.len() == 1;
    let Some(Parent::Entry(owner)) = parent.filter(|_| only) else {
        return Ok(vec![(start..end, String::new())]);
    };
    // A document without a final line break loses the break before the
    // removed line too, or `a: {}` would gain one.
    let start = if end == cx.src.len() && !cx.src.ends_with('\n') {
        start - cx.eol.len().min(start)
    } else {
        start
    };
    let at = owner.assign_end;
    Ok(vec![
        (at..at, " {}".to_string()),
        (start.max(at)..end, String::new()),
    ])
}

/// The value the rest of the path builds, from the segment at `from`.
fn nest(cx: &Cx<'_>, from: usize, value: &Value) -> Result<Value, EditError> {
    let mut out = value.clone();
    for (n, seg) in cx.path.iter().enumerate().skip(from).rev() {
        out = match seg {
            PathSegment::Key(k) => {
                let mut map = Mapping::new();
                map.insert(k.clone(), out);
                Value::Map(map)
            }
            PathSegment::Index(0) => Value::Seq(vec![out]),
            PathSegment::Index(_) => return Err(not_found(cx, n)),
        };
    }
    Ok(out)
}

// --- the edit applied in memory ---------------------------------------------

/// `edit` applied to the parsed document, to compare the written bytes with.
/// `Err(None)` is an edit that cannot be applied; `Err(Some(e))` is a refusal.
fn apply_model(
    root: &mut Value,
    path: &[PathSegment],
    op: &Op<'_>,
    opts: &EditOptions,
) -> Result<(), Option<EditError>> {
    match op {
        Op::Set(value) => model_set(root, path, (*value).clone(), opts),
        Op::Remove => {
            model_remove(root, path, opts);
            Ok(())
        }
        Op::Rename(to) => model_rename(root, path, to, opts),
    }
}

fn find_key(m: &Mapping, key: &str, opts: &EditOptions) -> Option<String> {
    m.keys().find(|k| key_eq(k, key, opts)).map(str::to_string)
}

fn model_child<'a>(
    node: &'a mut Value,
    seg: &PathSegment,
    opts: &EditOptions,
) -> Option<&'a mut Value> {
    match (node, seg) {
        (Value::Map(m), PathSegment::Key(k)) => {
            let key = find_key(m, k, opts)?;
            m.get_mut(&key)
        }
        (Value::Seq(items), PathSegment::Index(i)) => items.get_mut(*i),
        _ => None,
    }
}

fn model_set(
    node: &mut Value,
    path: &[PathSegment],
    value: Value,
    opts: &EditOptions,
) -> Result<(), Option<EditError>> {
    let Some((seg, rest)) = path.split_first() else {
        return Err(None);
    };
    if matches!(node, Value::Null) || node.is_empty_collection() {
        *node = match seg {
            PathSegment::Key(_) => Value::Map(Mapping::new()),
            PathSegment::Index(_) => Value::Seq(Vec::new()),
        };
    }
    if rest.is_empty() {
        return match (node, seg) {
            (Value::Map(m), PathSegment::Key(k)) => {
                let key = find_key(m, k, opts).unwrap_or_else(|| k.clone());
                m.insert(key, value);
                Ok(())
            }
            (Value::Seq(items), PathSegment::Index(i)) if *i < items.len() => {
                items[*i] = value;
                Ok(())
            }
            (Value::Seq(items), PathSegment::Index(i)) if *i == items.len() => {
                items.push(value);
                Ok(())
            }
            _ => Err(None),
        };
    }
    if let (Value::Map(m), PathSegment::Key(k)) = (&mut *node, seg)
        && find_key(m, k, opts).is_none()
    {
        m.insert(k.clone(), Value::Null);
    }
    model_child(node, seg, opts).map_or(Err(None), |child| model_set(child, rest, value, opts))
}

fn model_remove(node: &mut Value, path: &[PathSegment], opts: &EditOptions) {
    let Some((seg, rest)) = path.split_first() else {
        return;
    };
    if rest.is_empty() {
        match (node, seg) {
            (Value::Map(m), PathSegment::Key(k)) => {
                if let Some(key) = find_key(m, k, opts) {
                    m.remove(&key);
                }
            }
            (Value::Seq(items), PathSegment::Index(i)) if *i < items.len() => {
                items.remove(*i);
            }
            _ => {}
        }
        return;
    }
    if let Some(child) = model_child(node, seg, opts) {
        model_remove(child, rest, opts);
    }
}

fn model_rename(
    node: &mut Value,
    path: &[PathSegment],
    to: &str,
    opts: &EditOptions,
) -> Result<(), Option<EditError>> {
    let Some((seg, rest)) = path.split_first() else {
        return Err(None);
    };
    if !rest.is_empty() {
        return model_child(node, seg, opts)
            .map_or(Err(None), |child| model_rename(child, rest, to, opts));
    }
    let (Value::Map(m), PathSegment::Key(from)) = (node, seg) else {
        return Err(None);
    };
    let from = find_key(m, from, opts).ok_or(None)?;
    *m = m
        .iter()
        .map(|(k, v)| (if k == from { to } else { k }.to_string(), v.clone()))
        .collect();
    Ok(())
}
