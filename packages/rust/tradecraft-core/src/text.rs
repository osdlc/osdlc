//! String helpers shared by the renderers.

/// Replaces each `needle` in `text` with `with`, except where the next
/// character `continues` it into a longer token. Returns the text and whether
/// anything was replaced.
pub(crate) fn replace_bounded(
    text: &str,
    needle: &str,
    with: &str,
    continues: impl Fn(char) -> bool,
) -> (String, bool) {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    let mut replaced = false;
    while let Some(offset) = rest.find(needle) {
        let (head, tail) = rest.split_at(offset);
        let after = &tail[needle.len()..];
        out.push_str(head);
        if after.chars().next().is_some_and(&continues) {
            out.push_str(needle);
        } else {
            out.push_str(with);
            replaced = true;
        }
        rest = after;
    }
    out.push_str(rest);
    (out, replaced)
}
