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
use crate::parse::{self, Ev, EvKind, ItemSpan, KeySpan, MapEntry, Parsed};
use crate::render::{self, EmitOptions};
use crate::splice::{apply_eol, value_assignment, value_edit};
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

/// What encloses the collection being walked, for the one edit that must
/// reach out of it: removing its only key or item.
#[derive(Clone, Copy)]
enum Parent<'a> {
    /// The value of a mapping entry: `{}` or `[]` goes after its `:`.
    Entry(&'a KeySpan),
    /// An item of a sequence, given by the offset of its `-`.
    Item(usize),
}

impl Parent<'_> {
    /// Where an emptied collection's `{}` or `[]` is written.
    fn after(self) -> usize {
        match self {
            Parent::Entry(k) => k.assign_end,
            Parent::Item(dash) => dash + 1,
        }
    }

    /// The offset of the key or `-` the collection hangs from.
    fn at(self) -> usize {
        match self {
            Parent::Entry(k) => k.key_range.start,
            Parent::Item(dash) => dash,
        }
    }
}

/// A place that holds a value: where a path vivifies or replaces one.
#[derive(Clone, Copy)]
enum Slot<'a> {
    Entry(&'a KeySpan),
    Item(&'a ItemSpan),
}

impl<'a> Slot<'a> {
    fn parent(self) -> Parent<'a> {
        match self {
            Slot::Entry(k) => Parent::Entry(k),
            Slot::Item(i) => Parent::Item(i.dash),
        }
    }

    fn value_start(self) -> usize {
        match self {
            Slot::Entry(k) => k.value_range.start,
            Slot::Item(i) => i.value_range.start,
        }
    }
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
        return absent(cx, &entries, key, parent, depth, last);
    };
    if last {
        return leaf(cx, &entries, i, parent, m);
    }
    let child_stop = entries
        .get(i + 1)
        .map_or(hard_stop, |n| n.span.key_range.start);
    let span = &entries[i].span;
    let child = m.get(&span.key).unwrap_or(&Value::Null);
    step_into(
        cx,
        Slot::Entry(span),
        entries[i].value_idx,
        child_stop,
        child,
        depth,
    )
}

/// The key is not in the mapping.
fn absent(
    cx: &Cx<'_>,
    entries: &[MapEntry],
    key: &str,
    parent: Option<Parent<'_>>,
    depth: usize,
    last: bool,
) -> Result<Edits, EditError> {
    match cx.op {
        Op::Set(value) => {
            let nested = nest(cx, depth + 1, value)?;
            append_entry_line(cx, entries, key, &nested, parent)
        }
        Op::Remove if last => Ok(Vec::new()),
        Op::Rename(_) if last => Err(EditError::MissingKey {
            key: key.to_string(),
        }),
        _ => Err(not_found(cx, depth)),
    }
}

/// The slot is there and more segments follow: step into its value.
/// `depth` is the segment that named the slot.
fn step_into(
    cx: &Cx<'_>,
    slot: Slot<'_>,
    value_idx: usize,
    child_stop: usize,
    child: &Value,
    depth: usize,
) -> Result<Edits, EditError> {
    if matches!(cx.events[value_idx].kind, EvKind::Alias(_)) {
        return Err(unsupported(cx, "the path goes through an alias"));
    }
    let next = depth + 1;
    match child {
        // Nothing to lose: an empty value is replaced by the collection the
        // next segment needs.
        Value::Null => vivify(cx, slot, depth),
        c if c.is_empty_collection() => vivify(cx, slot, depth),
        Value::Map(child_map) => {
            if starts_with(cx.src, slot.value_start(), b'{') {
                return Err(unsupported(cx, "flow mappings are not edited yet"));
            }
            walk_map(
                cx,
                value_idx,
                child_stop,
                Some(slot.parent()),
                child_map,
                next,
            )
        }
        Value::Seq(items) => match cx.path[next] {
            PathSegment::Key(_) => Err(mismatch(cx, next, "a sequence")),
            PathSegment::Index(_) => {
                if starts_with(cx.src, slot.value_start(), b'[') {
                    return Err(unsupported(cx, "flow sequences are not edited yet"));
                }
                walk_seq(cx, value_idx, child_stop, slot.parent(), items, next)
            }
        },
        _ => Err(mismatch(cx, next, "a scalar")),
    }
}

/// An empty parent (`a:`, `a: ~`, `a: {}`, `a: []`) on the way: a `SetPath`
/// writes the collection the rest of the path asks for in its place. The
/// others find nothing below it.
fn vivify(cx: &Cx<'_>, slot: Slot<'_>, depth: usize) -> Result<Edits, EditError> {
    let next = depth + 1;
    match cx.op {
        Op::Set(value) => {
            let nested = nest(cx, next, value)?;
            Ok(vec![replace_slot(cx, slot, &nested)?])
        }
        Op::Remove if next + 1 == cx.path.len() => Ok(Vec::new()),
        Op::Rename(_) if next + 1 == cx.path.len() => match &cx.path[next] {
            PathSegment::Key(k) => Err(EditError::MissingKey { key: k.clone() }),
            PathSegment::Index(_) => Err(mismatch(cx, next, "a mapping")),
        },
        _ => Err(not_found(cx, next)),
    }
}

/// Handles the segment at `depth`, which names an item of the block sequence
/// that starts at event `seq_idx`.
fn walk_seq(
    cx: &Cx<'_>,
    seq_idx: usize,
    hard_stop: usize,
    parent: Parent<'_>,
    vals: &[Value],
    depth: usize,
) -> Result<Edits, EditError> {
    let PathSegment::Index(i) = cx.path[depth] else {
        return Err(mismatch(cx, depth, "a sequence"));
    };
    let Some(items) = parse::seq_items(cx.events, cx.src, seq_idx, hard_stop) else {
        return Err(unsupported(
            cx,
            "a sequence with an empty, anchored or tagged item is not edited",
        ));
    };
    let last = depth + 1 == cx.path.len();
    if let Some(item) = items.get(i) {
        if !last {
            let stop = items.get(i + 1).map_or(hard_stop, |n| n.dash);
            let child = vals.get(i).unwrap_or(&Value::Null);
            return step_into(cx, Slot::Item(item), item.value_idx, stop, child, depth);
        }
        return match cx.op {
            Op::Set(value) => {
                if vals.get(i).is_some_and(|e| same_value(e, value)) {
                    return Ok(Vec::new());
                }
                Ok(vec![replace_item(cx, item, value)?])
            }
            Op::Remove => remove_item(cx, &items, i, parent),
            Op::Rename(_) => Err(mismatch(cx, depth, "a sequence")),
        };
    }
    match cx.op {
        // One past the end appends. Anything further is a gap.
        Op::Set(value) if i == items.len() => {
            let nested = nest(cx, depth + 1, value)?;
            append_item(cx, &items, &nested, parent)
        }
        Op::Remove if last => Ok(Vec::new()),
        _ => Err(not_found(cx, depth)),
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

fn replace_slot(
    cx: &Cx<'_>,
    slot: Slot<'_>,
    value: &Value,
) -> Result<(Range<usize>, String), EditError> {
    match slot {
        Slot::Entry(span) => replace_value(cx, span, value),
        Slot::Item(item) => replace_item(cx, item, value),
    }
}

/// The text of a sequence item's value, as it follows `- ` for a `-` at
/// `dash_col`: a collection is compact, its lines under the first.
fn item_text(cx: &Cx<'_>, dash_col: usize, value: &Value) -> Result<String, EditError> {
    let rendered = render::render_value(value, EmitOptions::line_width_0()).map_err(|e| {
        EditError::UnrenderableValue {
            key: String::new(),
            message: e.to_string(),
        }
    })?;
    let rendered = rendered.strip_suffix('\n').unwrap_or(&rendered);
    // Every line after the first sits two columns in from the `-`: the
    // content of a block scalar, or the next key of a compact collection.
    let pad = dash_col + 2;
    let pad = " ".repeat(pad);
    let mut out = String::with_capacity(rendered.len() + pad.len());
    for (n, line) in rendered.split('\n').enumerate() {
        if n > 0 {
            out.push('\n');
            if !line.is_empty() {
                out.push_str(&pad);
            }
        }
        out.push_str(line);
    }
    Ok(apply_eol(&out, cx.eol))
}

fn replace_item(
    cx: &Cx<'_>,
    item: &ItemSpan,
    value: &Value,
) -> Result<(Range<usize>, String), EditError> {
    let text = item_text(cx, item.dash - line_start(cx.src, item.dash), value)?;
    // The value replaces what follows the `-` on its line. `KeySpan` already
    // carries what `value_edit` needs to keep a trailing comment.
    let span = KeySpan {
        key: String::new(),
        key_range: item.dash..item.dash + 1,
        assign_end: item.value_range.start,
        value_range: item.value_range.clone(),
    };
    Ok(value_edit(cx.src, &span, text))
}

/// A new key after the last entry of a block mapping, at the keys' column.
fn append_entry_line(
    cx: &Cx<'_>,
    entries: &[MapEntry],
    key: &str,
    value: &Value,
    parent: Option<Parent<'_>>,
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
    let line = format!("{indent}{}:{assign}", key_text(key)?);
    let after = last.span.value_range.end.max(last.span.key_range.end);
    Ok(insert_line(
        cx,
        after,
        last.value_idx,
        indent.len(),
        parent,
        line,
    ))
}

/// A new item after the last item of a block sequence, at the `-` column.
fn append_item(
    cx: &Cx<'_>,
    items: &[ItemSpan],
    value: &Value,
    parent: Parent<'_>,
) -> Result<Edits, EditError> {
    let (Some(first), Some(last)) = (items.first(), items.last()) else {
        return Err(unsupported(cx, "the sequence has no editable item"));
    };
    let col = first.dash - line_start(cx.src, first.dash);
    let line = format!("{}- {}", " ".repeat(col), item_text(cx, col, value)?);
    Ok(insert_line(
        cx,
        last.value_range.end,
        last.value_idx,
        col,
        Some(parent),
        line,
    ))
}

/// Inserts `line` (without its line break) after the block whose last value
/// ends at `after` and starts at event `last_idx`, in a collection whose
/// children sit at column `child_col` under `parent`.
///
/// It goes after the lines of the last value and after the comment lines at
/// the children's column or deeper, and deeper than the parent, that follow
/// it: they belong to the block. Blank lines and less indented comments after
/// the block stay after the new line. A keep-chomped (`|+`) last value owns
/// its trailing blank lines, so the line goes after them. A document with no
/// final line break gets none.
fn insert_line(
    cx: &Cx<'_>,
    after: usize,
    last_idx: usize,
    child_col: usize,
    parent: Option<Parent<'_>>,
    line: String,
) -> Edits {
    let parent_col = parent.map_or(0, |p| p.at() - line_start(cx.src, p.at()));
    let mut p = line_end_after(cx.src, after);
    if keeps_trailing_blanks(cx, last_idx) {
        while is_blank_line(cx.src, p) {
            p = line_end_after(cx.src, p);
        }
    }
    let mut q = p;
    while q < cx.src.len() {
        let line_end = line_end_after(cx.src, q);
        let text = &cx.src[q..line_end];
        let trimmed = text.trim_start();
        let indent = text.len() - trimmed.len();
        if trimmed.is_empty() {
            q = line_end;
        } else if trimmed.starts_with('#') && indent >= child_col && indent > parent_col {
            p = line_end;
            q = line_end;
        } else {
            break;
        }
    }
    let text = if p >= cx.src.len() && !cx.src.ends_with('\n') {
        format!("{}{line}", cx.eol)
    } else {
        format!("{line}{}", cx.eol)
    };
    vec![(p..p, text)]
}

/// Whether anything but blanks precedes `pos` on its line.
fn shares_line(src: &str, pos: usize) -> bool {
    !src[line_start(src, pos)..pos].trim().is_empty()
}

fn is_blank_line(src: &str, pos: usize) -> bool {
    pos < src.len() && src[pos..line_end_after(src, pos)].trim().is_empty()
}

/// Whether the last scalar of the value that starts at event `value_idx` is a
/// block scalar with the keep (`+`) chomping indicator.
fn keeps_trailing_blanks(cx: &Cx<'_>, value_idx: usize) -> bool {
    let end = parse::skip_node(cx.events, value_idx);
    let Some(ev) = cx.events[value_idx..end]
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
/// the parent's `:` (or `-`).
fn remove(
    cx: &Cx<'_>,
    entries: &[MapEntry],
    i: usize,
    parent: Option<Parent<'_>>,
    m: &Mapping,
) -> Result<Edits, EditError> {
    let span = &entries[i].span;
    let key_start = span.key_range.start;
    let after = span.value_range.end.max(span.key_range.end);
    let only = entries.len() == 1 && m.len() == 1;
    // The first key of a `- key:` item shares its line with the `-`, so the
    // line cannot go.
    if shares_line(cx.src, key_start) {
        if only {
            return Ok(vec![(key_start..after, "{}".to_string())]);
        }
        let Some(next) = entries.get(i + 1) else {
            return Err(unsupported(cx, "the first key of a list item"));
        };
        let gap = &cx.src[after..next.span.key_range.start];
        let (_, rest) = gap.split_once('\n').unwrap_or((gap, ""));
        if rest.trim().is_empty() {
            // Only blanks lie between: the next key moves up to follow the
            // `-`.
            return Ok(vec![(key_start..next.span.key_range.start, String::new())]);
        }
        // A comment line lies between, and it has to stay. The key's text goes
        // and the `-` is left alone on its line, over the comment.
        let dash = cx.src[..key_start].trim_end().len();
        let line_end = line_end_after(cx.src, after);
        let end = cx.src[..line_end].trim_end_matches(['\r', '\n']).len();
        return Ok(vec![(dash..end, String::new())]);
    }
    Ok(cut_lines(
        cx,
        key_start,
        after,
        parent.filter(|_| only),
        "{}",
    ))
}

/// The whole lines from the one holding `from` to the end of the one holding
/// `to`, cut out. With a parent whose last child this was, `empty` (`{}` or
/// `[]`) is written after the parent's `:` or `-`.
fn cut_lines(
    cx: &Cx<'_>,
    from: usize,
    to: usize,
    emptied: Option<Parent<'_>>,
    empty: &str,
) -> Edits {
    let start = line_start(cx.src, from);
    let end = line_end_after(cx.src, to);
    let Some(parent) = emptied else {
        return vec![(start..end, String::new())];
    };
    // A document without a final line break loses the break before the
    // removed line too, or `a: {}` would gain one.
    let start = if end == cx.src.len() && !cx.src.ends_with('\n') {
        start - cx.eol.len().min(start)
    } else {
        start
    };
    let at = parent.after();
    vec![
        (at..at, format!(" {empty}")),
        (start.max(at)..end, String::new()),
    ]
}

/// Removes a sequence item and its lines. The only item leaves `[]`.
fn remove_item(
    cx: &Cx<'_>,
    items: &[ItemSpan],
    i: usize,
    parent: Parent<'_>,
) -> Result<Edits, EditError> {
    let item = &items[i];
    if shares_line(cx.src, item.dash) {
        return Err(unsupported(
            cx,
            "an item that shares its line with another `-`",
        ));
    }
    let only = items.len() == 1;
    Ok(cut_lines(
        cx,
        item.dash,
        item.value_range.end.max(item.dash),
        only.then_some(parent),
        "[]",
    ))
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

#[cfg(test)]
mod tests {
    use crate::{FieldEdit, PathSegment, edit_yaml};

    fn remove(src: &str, path: &[PathSegment]) -> String {
        let edit = FieldEdit::RemovePath {
            path: path.to_vec(),
        };
        String::from_utf8(edit_yaml(src.as_bytes(), &[edit]).unwrap().bytes).unwrap()
    }

    fn at(first: &str, index: usize, key: &str) -> Vec<PathSegment> {
        vec![first.into(), index.into(), key.into()]
    }

    #[test]
    fn removing_the_first_key_of_a_list_item_moves_the_next_key_up() {
        let src = "s:\n  - id: 1 # c\n    t: 2\n  - id: 3\n";
        assert_eq!(remove(src, &at("s", 0, "id")), "s:\n  - t: 2\n  - id: 3\n");
    }

    #[test]
    fn removing_the_first_key_keeps_a_comment_line_after_it() {
        let src = "s:\n  - id: 1\n    # about t\n    t: 2\n";
        assert_eq!(
            remove(src, &at("s", 0, "id")),
            "s:\n  -\n    # about t\n    t: 2\n"
        );
    }

    #[test]
    fn removing_the_only_key_of_a_list_item_leaves_an_empty_mapping() {
        assert_eq!(
            remove("s:\n  - id: 1 # c\n", &at("s", 0, "id")),
            "s:\n  - {} # c\n"
        );
    }

    #[test]
    fn removing_the_last_item_leaves_an_empty_sequence() {
        let path: Vec<PathSegment> = vec!["s".into(), 0usize.into()];
        assert_eq!(remove("s:\n  - a\nz: 1\n", &path), "s: []\nz: 1\n");
    }
}
