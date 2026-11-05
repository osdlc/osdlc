//! Writing a link: from one vault-relative file to another, as a relative
//! markdown link a renderer with no vault can follow.
//!
//! The encoding follows JavaScript's `encodeURIComponent` and `encodeURI`, so
//! a link written here reads back the same in a browser and in a TypeScript
//! tool.

use std::fmt::Write;

/// The relative URL from the file `from` to the file `to`, both
/// vault-relative and `/`-separated, with an optional `#fragment`.
///
/// The path is relative to `from`'s folder, `path.posix.relative` style, and
/// each segment is encoded with [`encode_uri_component`]. A file linking
/// itself gets its own name. The fragment is encoded with
/// [`encode_uri_fragment`], so a `#` inside it cannot start a second one.
///
/// # Examples
///
/// ```
/// use markdown_link::relative_link;
///
/// assert_eq!(relative_link("a/b.md", "a/c d.md", None), "c%20d.md");
/// assert_eq!(relative_link("a/b/x.md", "c/y.md", Some("Part 1")), "../../c/y.md#Part%201");
/// assert_eq!(relative_link("a/x.md", "a/x.md", Some("H#2")), "x.md#H%232");
/// ```
pub fn relative_link(from: &str, to: &str, fragment: Option<&str>) -> String {
    let from_dir = from.rfind('/').map_or("", |at| &from[..at]);
    let mut relative = posix_relative(from_dir, to);
    if relative.is_empty() {
        // A file linking itself: the walk yields "", and a link needs a target.
        relative = to.rsplit('/').next().unwrap_or(to).to_owned();
    }
    let encoded: Vec<String> = relative
        .split('/')
        .map(|segment| {
            if segment == ".." || segment == "." {
                segment.to_owned()
            } else {
                encode_uri_component(segment)
            }
        })
        .collect();
    match fragment {
        Some(fragment) => format!("{}#{}", encoded.join("/"), encode_uri_fragment(fragment)),
        None => encoded.join("/"),
    }
}

/// `path.posix.relative` for `/`-separated paths: up out of `from_dir`'s
/// unshared segments, then down `to`'s.
fn posix_relative(from_dir: &str, to: &str) -> String {
    let from: Vec<&str> = from_dir.split('/').filter(|s| !s.is_empty()).collect();
    let to: Vec<&str> = to.split('/').filter(|s| !s.is_empty()).collect();
    let shared = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let mut out: Vec<&str> = vec![".."; from.len() - shared];
    out.extend(&to[shared..]);
    out.join("/")
}

/// JavaScript's `encodeURIComponent`: every byte of the UTF-8 text except
/// `A-Z a-z 0-9 - _ . ! ~ * ' ( )` is percent-encoded.
///
/// # Examples
///
/// ```
/// use markdown_link::encode_uri_component;
///
/// assert_eq!(encode_uri_component("a b/c#d"), "a%20b%2Fc%23d");
/// assert_eq!(encode_uri_component("é"), "%C3%A9");
/// ```
pub fn encode_uri_component(text: &str) -> String {
    percent_encode(text, |b| {
        b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            )
    })
}

/// JavaScript's `encodeURI`, with `#` also encoded, for a fragment. URI
/// structure characters (`/ ? : @ & = + $ ; ,`) are kept, so a fragment such
/// as `page=2` reads back as written.
///
/// # Examples
///
/// ```
/// use markdown_link::encode_uri_fragment;
///
/// assert_eq!(encode_uri_fragment("page=2"), "page=2");
/// assert_eq!(encode_uri_fragment("A heading #2"), "A%20heading%20%232");
/// ```
pub fn encode_uri_fragment(fragment: &str) -> String {
    percent_encode(fragment, |b| {
        b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'-' | b'_'
                    | b'.'
                    | b'!'
                    | b'~'
                    | b'*'
                    | b'\''
                    | b'('
                    | b')'
                    | b';'
                    | b','
                    | b'/'
                    | b'?'
                    | b':'
                    | b'@'
                    | b'&'
                    | b'='
                    | b'+'
                    | b'$'
            )
    })
}

/// Markdown link text with `\`, `[` and `]` escaped, so a label cannot end or
/// nest the link it sits in.
///
/// # Examples
///
/// ```
/// use markdown_link::escape_label;
///
/// assert_eq!(escape_label("a [b] \\ c"), "a \\[b\\] \\\\ c");
/// ```
pub fn escape_label(label: &str) -> String {
    let mut out = String::with_capacity(label.len());
    for c in label.chars() {
        if matches!(c, '\\' | '[' | ']') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

fn percent_encode(text: &str, keep: impl Fn(u8) -> bool) -> String {
    let mut out = String::with_capacity(text.len());
    for byte in text.bytes() {
        if keep(byte) {
            out.push(byte as char);
        } else {
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_link_climbs_out_of_unshared_folders_only() {
        assert_eq!(relative_link("x.md", "a/b.md", None), "a/b.md");
        assert_eq!(relative_link("a/x.md", "b.md", None), "../b.md");
        assert_eq!(relative_link("a/b/x.md", "a/c/y.md", None), "../c/y.md");
    }

    #[test]
    fn segments_are_encoded_and_dot_segments_are_not() {
        assert_eq!(
            relative_link("a/x.md", "My Notes/(draft) é.md", None),
            "../My%20Notes/(draft)%20%C3%A9.md"
        );
    }

    #[test]
    fn a_self_link_uses_its_own_name() {
        assert_eq!(relative_link("x.md", "x.md", None), "x.md");
        assert_eq!(relative_link("a/x.md", "a/x.md", Some("^b1")), "x.md#%5Eb1");
    }

    #[test]
    fn the_two_encodings_differ_on_uri_structure() {
        assert_eq!(encode_uri_component("a/b?c=d"), "a%2Fb%3Fc%3Dd");
        assert_eq!(encode_uri_fragment("a/b?c=d"), "a/b?c=d");
        assert_eq!(encode_uri_fragment("#"), "%23");
    }
}
