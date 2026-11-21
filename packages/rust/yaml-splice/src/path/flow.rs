//! Path edits inside flow collections (`{a: 1}`, `[x, y]`).
//!
//! A flow element is a bracketed, comma-separated value, so each edit is one
//! replacement or deletion inside the brackets. New values are written on one
//! line in flow style (`render::flow_text`).

use std::ops::Range;

use super::{
    Cx, EditError, Edits, Op, PathSegment, Value, key_eq, mismatch, nest, not_found, offset,
    same_value, unsupported,
};
use crate::parse::{self, EvKind, FlowElem};
use crate::render;

fn flow_text(value: &Value) -> Result<String, EditError> {
    render::flow_text(value).map_err(|e| EditError::UnrenderableValue {
        key: String::new(),
        message: e.to_string(),
    })
}

fn flow_key(key: &str) -> Result<String, EditError> {
    render::flow_key(key).map_err(|e| EditError::UnrenderableValue {
        key: key.to_string(),
        message: e.to_string(),
    })
}

fn elem_start(e: &FlowElem) -> usize {
    e.key.as_ref().map_or(e.value_range.start, |(_, r)| r.start)
}

/// Handles the segment at `depth`, which addresses an element of the flow
/// collection that starts at event `open_idx` and reads as `child`.
pub(super) fn walk_flow(
    cx: &Cx<'_>,
    open_idx: usize,
    child: &Value,
    depth: usize,
) -> Result<Edits, EditError> {
    let is_map = matches!(child, Value::Map(_));
    let Some(elems) = parse::flow_elems(cx.events, cx.src, open_idx, is_map) else {
        return Err(unsupported(
            cx,
            "this flow collection has a shape that is not edited",
        ));
    };
    let last = depth + 1 == cx.path.len();
    let found = match (&cx.path[depth], child) {
        (PathSegment::Key(key), Value::Map(_)) => {
            if key == "<<" {
                return Err(unsupported(cx, "a merge key (`<<`) is not edited"));
            }
            let hits: Vec<usize> = elems
                .iter()
                .enumerate()
                .filter(|(_, e)| {
                    e.key.as_ref().is_some_and(|(k, r)| {
                        parse::range_is_string_key(cx.src, r) && key_eq(k, key, cx.opts)
                    })
                })
                .map(|(i, _)| i)
                .collect();
            if hits.len() > 1 {
                let at = elems[hits[0]].key.as_ref().map(|(_, r)| r.clone());
                return Err(EditError::AmbiguousKey {
                    key: key.clone(),
                    at: offset(at.unwrap_or(0..0), cx.bom_len),
                });
            }
            hits.first().copied()
        }
        (PathSegment::Index(i), Value::Seq(_)) => (*i < elems.len()).then_some(*i),
        (_, Value::Map(_)) => return Err(mismatch(cx, depth, "a mapping")),
        _ => return Err(mismatch(cx, depth, "a sequence")),
    };
    match found {
        None => absent(cx, &elems, depth, last),
        Some(i) if last => leaf(cx, open_idx, &elems, i, child),
        Some(i) => {
            let value = match child {
                Value::Map(m) => elems[i].key.as_ref().and_then(|(k, _)| m.get(k)),
                Value::Seq(v) => v.get(i),
                _ => None,
            }
            .unwrap_or(&Value::Null);
            descend(cx, &elems[i], value, depth)
        }
    }
}

fn descend(cx: &Cx<'_>, elem: &FlowElem, value: &Value, depth: usize) -> Result<Edits, EditError> {
    if matches!(cx.events[elem.value_idx].kind, EvKind::Alias(_)) {
        return Err(unsupported(cx, "the path goes through an alias"));
    }
    let next = depth + 1;
    match value {
        Value::Null => vivify(cx, elem, depth),
        v if v.is_empty_collection() => vivify(cx, elem, depth),
        Value::Map(_) | Value::Seq(_) => walk_flow(cx, elem.value_idx, value, next),
        _ => Err(mismatch(cx, next, "a scalar")),
    }
}

/// An empty value on the way is replaced by the collection the rest of the
/// path asks for.
fn vivify(cx: &Cx<'_>, elem: &FlowElem, depth: usize) -> Result<Edits, EditError> {
    let next = depth + 1;
    match cx.op {
        Op::Set(value) => {
            let nested = nest(cx, next, value)?;
            Ok(vec![(elem.value_range.clone(), flow_text(&nested)?)])
        }
        Op::Remove if next + 1 == cx.path.len() => Ok(Vec::new()),
        Op::Rename(_) if next + 1 == cx.path.len() => match &cx.path[next] {
            PathSegment::Key(k) => Err(EditError::MissingKey { key: k.clone() }),
            PathSegment::Index(_) => Err(mismatch(cx, next, "a mapping")),
        },
        _ => Err(not_found(cx, next)),
    }
}

/// The last segment names an element that exists.
fn leaf(
    cx: &Cx<'_>,
    open_idx: usize,
    elems: &[FlowElem],
    i: usize,
    child: &Value,
) -> Result<Edits, EditError> {
    let elem = &elems[i];
    match cx.op {
        Op::Set(value) => {
            let current = match child {
                Value::Map(m) => elem.key.as_ref().and_then(|(k, _)| m.get(k)),
                Value::Seq(v) => v.get(i),
                _ => None,
            };
            if current.is_some_and(|c| same_value(c, value)) {
                return Ok(Vec::new());
            }
            Ok(vec![(elem.value_range.clone(), flow_text(value)?)])
        }
        Op::Remove => remove(cx, open_idx, elems, i),
        Op::Rename(to) => {
            let Some((_, range)) = &elem.key else {
                return Err(mismatch(cx, cx.path.len() - 1, "a mapping"));
            };
            let conflict = elems.iter().enumerate().find(|(j, e)| {
                *j != i
                    && e.key.as_ref().is_some_and(|(k, r)| {
                        parse::range_is_string_key(cx.src, r) && key_eq(k, to, cx.opts)
                    })
            });
            if let Some((_, e)) = conflict {
                let at = e.key.as_ref().map_or(0..0, |(_, r)| r.clone());
                return Err(EditError::KeyConflict {
                    key: (*to).to_string(),
                    at: offset(at, cx.bom_len),
                });
            }
            let text = flow_key(to)?;
            if cx.src[range.clone()] == *text {
                return Ok(Vec::new());
            }
            Ok(vec![(range.clone(), text)])
        }
    }
}

/// The last segment names an element that is not there.
fn absent(cx: &Cx<'_>, elems: &[FlowElem], depth: usize, last: bool) -> Result<Edits, EditError> {
    let seg = &cx.path[depth];
    match (cx.op, seg) {
        (Op::Set(value), PathSegment::Key(key)) => {
            let nested = nest(cx, depth + 1, value)?;
            append(
                cx,
                elems,
                format!("{}: {}", flow_key(key)?, flow_text(&nested)?),
            )
        }
        (Op::Set(value), PathSegment::Index(i)) if *i == elems.len() => {
            let nested = nest(cx, depth + 1, value)?;
            append(cx, elems, flow_text(&nested)?)
        }
        (Op::Remove, _) if last => Ok(Vec::new()),
        (Op::Rename(_), PathSegment::Key(key)) if last => {
            Err(EditError::MissingKey { key: key.clone() })
        }
        _ => Err(not_found(cx, depth)),
    }
}

/// A new element after the last one. A collection written one element to a
/// line gets its new element on a line of its own, at the same indent.
fn append(cx: &Cx<'_>, elems: &[FlowElem], text: String) -> Result<Edits, EditError> {
    let Some(last) = elems.last() else {
        return Err(unsupported(
            cx,
            "the flow collection has no editable element",
        ));
    };
    let start = elem_start(last);
    let line_start = cx.src[..start].rfind('\n').map_or(0, |i| i + 1);
    let lead = &cx.src[line_start..start];
    let sep = if lead.trim().is_empty() && line_start > 0 {
        format!(",{}{lead}", cx.eol)
    } else {
        ", ".to_string()
    };
    let at = last.value_range.end;
    let before_close = cx.src[at..]
        .split([']', '}', '\n', '\r'])
        .next()
        .unwrap_or("");
    if before_close.contains('#') {
        return Err(unsupported(cx, "a comment after the last element"));
    }
    Ok(vec![(at..at, format!("{sep}{text}"))])
}

/// Removes an element and one separator. The only element leaves `{}` or
/// `[]`. A comment inside the removed stretch is a refusal, so none is lost.
fn remove(cx: &Cx<'_>, open_idx: usize, elems: &[FlowElem], i: usize) -> Result<Edits, EditError> {
    let elem = &elems[i];
    let range: Range<usize> = if elems.len() == 1 {
        let open = parse::root_start(cx.events, cx.src, open_idx) + 1;
        let close = parse::byte_index(
            cx.src,
            cx.events[parse::skip_node(cx.events, open_idx) - 1]
                .span
                .end
                .index(),
        ) - 1;
        let rest = format!(
            "{}{}",
            &cx.src[open..elem_start(elem)],
            &cx.src[elem.value_range.end..close]
        );
        if rest.trim_matches([' ', '\t', '\r', '\n', ',']).is_empty() {
            open..close
        } else {
            return Err(unsupported(cx, "a comment inside the flow collection"));
        }
    } else if i == 0 {
        elem_start(elem)..elem_start(&elems[1])
    } else {
        elems[i - 1].value_range.end..elem.value_range.end
    };
    // A `#` in the value's own text is a comment only inside a nested collection.
    let gap_has_comment = |gap: Range<usize>| cx.src[gap].contains('#');
    let comment = if elems.len() == 1 {
        false
    } else if i == 0 {
        gap_has_comment(elem.value_range.end..elem_start(&elems[1]))
    } else {
        gap_has_comment(elems[i - 1].value_range.end..elem_start(elem))
    } || (elems.len() > 1
        && !matches!(cx.events[elem.value_idx].kind, EvKind::Scalar(..))
        && cx.src[elem.value_range.clone()].contains('#'));
    if comment {
        return Err(unsupported(cx, "a comment inside the flow collection"));
    }
    Ok(vec![(range, String::new())])
}
