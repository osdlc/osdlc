//! The edits of the nested corpus, applied to a parsed [`Value`] in memory.
//! The tests compare what the crate writes against what this model says the
//! document should read as. Shared by `tests/nested_corpus.rs` and
//! `tests/real_files.rs`; each uses a part of it.
#![allow(dead_code)]

use yaml_splice::{Mapping, Value, parse::parse};

#[derive(Debug, Clone)]
pub enum Seg {
    Key(String),
    Index(usize),
}

/// An edit as the corpus states it, before it is a `FieldEdit`.
#[derive(Debug, Clone)]
pub enum PathEdit {
    Set(Vec<Seg>, Value),
    Remove(Vec<Seg>),
    Rename(Vec<Seg>, String),
}

/// The document as a reader sees it. A BOM is framing, not content.
pub fn read(src: &str) -> Result<Value, String> {
    parse(src.strip_prefix('\u{feff}').unwrap_or(src)).map_err(|e| e.to_string())
}

pub fn key_eq(a: &str, b: &str, case_sensitive: bool) -> bool {
    if case_sensitive {
        a == b
    } else {
        a.to_lowercase() == b.to_lowercase()
    }
}

/// The existing key `key` addresses in `m`, if any.
pub fn find_key(m: &Mapping, key: &str, cs: bool) -> Option<String> {
    m.keys().find(|k| key_eq(k, key, cs)).map(str::to_string)
}

/// An absent or null node becomes the empty collection the next segment
/// steps into.
pub fn vivify(node: &mut Value, next: &Seg) {
    let empty = matches!(node, Value::Null) || node.is_empty_collection();
    if empty {
        *node = match next {
            Seg::Key(_) => Value::Map(Mapping::new()),
            Seg::Index(_) => Value::Seq(Vec::new()),
        };
    }
}

/// Runs `f` on the child `seg` addresses, in place. `None` when there is no
/// such child.
pub fn with_child<T>(
    node: &mut Value,
    seg: &Seg,
    cs: bool,
    f: impl FnOnce(&mut Value) -> T,
) -> Option<T> {
    match (node, seg) {
        (Value::Map(m), Seg::Key(k)) => {
            // `Mapping` has no `get_mut`. Take the value, edit it and put it
            // back: `insert` on an existing key keeps the key's position.
            let key = find_key(m, k, cs)?;
            let mut child = m.get(&key)?.clone();
            let out = f(&mut child);
            m.insert(key, child);
            Some(out)
        }
        (Value::Seq(items), Seg::Index(i)) => items.get_mut(*i).map(f),
        _ => None,
    }
}

pub fn apply(root: &mut Value, edit: &PathEdit, cs: bool) -> Result<(), String> {
    match edit {
        PathEdit::Set(path, value) => set_at(root, path, value.clone(), cs),
        PathEdit::Remove(path) => {
            remove_at(root, path, cs);
            Ok(())
        }
        PathEdit::Rename(path, to) => rename_at(root, path, to, cs),
    }
}

pub fn set_at(node: &mut Value, path: &[Seg], value: Value, cs: bool) -> Result<(), String> {
    let (seg, rest) = path.split_first().ok_or("empty path")?;
    vivify(node, seg);
    if rest.is_empty() {
        return match (node, seg) {
            (Value::Map(m), Seg::Key(k)) => {
                let key = find_key(m, k, cs).unwrap_or_else(|| k.clone());
                m.insert(key, value);
                Ok(())
            }
            (Value::Seq(items), Seg::Index(i)) if *i < items.len() => {
                items[*i] = value;
                Ok(())
            }
            (Value::Seq(items), Seg::Index(i)) if *i == items.len() => {
                items.push(value);
                Ok(())
            }
            _ => Err(format!("cannot set {seg:?}")),
        };
    }
    if let (Value::Map(m), Seg::Key(k)) = (&mut *node, seg)
        && find_key(m, k, cs).is_none()
    {
        m.insert(k.clone(), Value::Null);
    }
    with_child(node, seg, cs, |child| set_at(child, rest, value, cs))
        .ok_or_else(|| format!("no child at {seg:?}"))?
}

pub fn remove_at(node: &mut Value, path: &[Seg], cs: bool) {
    let Some((seg, rest)) = path.split_first() else {
        return;
    };
    if rest.is_empty() {
        match (node, seg) {
            (Value::Map(m), Seg::Key(k)) => {
                if let Some(key) = find_key(m, k, cs) {
                    m.remove(&key);
                }
            }
            (Value::Seq(items), Seg::Index(i)) if *i < items.len() => {
                items.remove(*i);
            }
            _ => {}
        }
        return;
    }
    with_child(node, seg, cs, |child| remove_at(child, rest, cs));
}

pub fn rename_at(node: &mut Value, path: &[Seg], to: &str, cs: bool) -> Result<(), String> {
    let (seg, rest) = path.split_first().ok_or("empty path")?;
    if !rest.is_empty() {
        return with_child(node, seg, cs, |child| rename_at(child, rest, to, cs))
            .ok_or_else(|| format!("no child at {seg:?}"))?;
    }
    let (Value::Map(m), Seg::Key(from)) = (node, seg) else {
        return Err("rename needs a key in a mapping".to_string());
    };
    let from = find_key(m, from, cs).ok_or("rename source is missing")?;
    *m = m
        .iter()
        .map(|(k, v)| {
            let k = if k == from { to } else { k };
            (k.to_string(), v.clone())
        })
        .collect();
    Ok(())
}
