//! The older single-key splice functions. They never reserialize.
//!
//! The rule:
//!
//! > To change a key's value, find the bytes that value occupies and replace
//! > only those bytes. Every other byte of the file (comments, key order,
//! > quoting style, indentation quirks, a blank line left in on purpose)
//! > comes through untouched because it is never re-emitted.
//!
//! The alternative is to parse the block into a map, change the map and
//! stringify it back. That looks correct in a unit test and damages real
//! files: comments vanish (no YAML value model carries them), key order
//! changes, `'single'` becomes `"double"`, and a folded scalar becomes a
//! quoted one-liner.
//!
//! [`edit_yaml`](crate::edit::edit_yaml) and
//! [`edit_frontmatter`](crate::edit::edit_frontmatter) are the newer API and
//! cover the same ground with more checks. The functions here match keys
//! exactly (case-sensitive), do not re-parse their output, and return
//! [`SpliceError`] rather than [`EditError`](crate::edit::EditError).
//!
//! **Stability:** unstable. The items in this module may change in any 0.x
//! minor release.
//!
//! # The shape of the returned text
//!
//! Every function here except [`remove_key`] (see its doc) returns the
//! block in split form: the last line is
//! not terminated, because the terminator is the caller's framing and not
//! the block's content. That is the text between the `---` fences of a
//! Markdown file, without the line ending before the closing fence. Under
//! CRLF the last line ends on a bare `\r`, its `\n` having been taken as the
//! separator.
//!
//! A replace already produces split form. An append is the one place these
//! functions write bytes of their own, and it writes them in the same form: it
//! separates entries with the block's line ending but does not terminate the
//! last one. A caller can put the result back between the fences without
//! knowing whether the key it wrote was replaced or appended.
//!
//! A caller editing a standalone `.yaml` file, where the final newline is
//! content rather than framing, appends that newline itself, or uses
//! [`edit_yaml`](crate::edit::edit_yaml), which treats its input as a whole
//! document.

use crate::parse::{self, KeySpan, ParseError};
use crate::render::{self, RenderError};
use crate::value::Value;
use std::ops::Range;

/// Why a splice failed.
///
/// New variants may be added in a minor release, so a `match` needs a
/// wildcard arm.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum SpliceError {
    /// The block is not well-formed YAML.
    #[error(transparent)]
    Parse(#[from] ParseError),
    /// The new value could not be rendered.
    #[error(transparent)]
    Emit(#[from] RenderError),
}

/// How a value should be rendered when it lands in the file.
///
/// `Raw` exists because the caller sometimes already has the exact text it
/// wants (a value copied from another file, a hand-written block scalar), and
/// re-rendering it would change bytes this module exists to keep.
#[derive(Debug, Clone)]
pub enum Replacement {
    /// Render the value through the emitter in [`crate::render`].
    Value(Value),
    /// Insert this text after `key:` as it is. Multi-line text must carry
    /// its own indentation.
    Raw(String),
}

impl From<Value> for Replacement {
    fn from(v: Value) -> Self {
        Replacement::Value(v)
    }
}

/// Replaces one top-level key's value in `yaml`, leaving every other byte
/// alone. An absent key is appended. The key is matched exactly.
///
/// The result is in split form whichever branch ran (see the module docs).
///
/// ```
/// use yaml_splice::{Value, splice::splice_key};
///
/// let out = splice_key("title: 'Draft'  # why\nn: 1", "title", Value::from("Done"))?;
/// assert_eq!(out, "title: Done  # why\nn: 1");
/// # Ok::<(), yaml_splice::splice::SpliceError>(())
/// ```
///
/// # Errors
///
/// [`SpliceError::Parse`] when `yaml` does not parse, and
/// [`SpliceError::Emit`] when the value cannot be rendered.
pub fn splice_key(
    yaml: &str,
    key: &str,
    replacement: impl Into<Replacement>,
) -> Result<String, SpliceError> {
    splice_keys(yaml, vec![(key.to_string(), replacement.into())])
}

/// Replace several top-level keys in one pass.
///
/// Done as one pass rather than repeated [`splice_key`] calls because each
/// splice invalidates every later span; applying edits right-to-left is the
/// only order that does not require reparsing between them.
///
/// The result is in split form whether or not anything was appended (see the
/// module docs).
///
/// A key named more than once is written once: the last edit for it wins.
///
/// # Errors
///
/// The same as [`splice_key`].
pub fn splice_keys(yaml: &str, edits: Vec<(String, Replacement)>) -> Result<String, SpliceError> {
    let parsed = parse::parse_with_spans(yaml)?;
    let eol = block_eol(yaml);

    // One entry per key, the last edit winning, at the key's first position.
    // Every range comes from the one parse above, so two edits for the same
    // key would both be applied at offsets the first one already shifted.
    let mut unique: Vec<(String, Replacement)> = Vec::with_capacity(edits.len());
    for (key, replacement) in edits {
        match unique.iter_mut().find(|(k, _)| *k == key) {
            Some(slot) => slot.1 = replacement,
            None => unique.push((key, replacement)),
        }
    }

    let mut applied: Vec<(std::ops::Range<usize>, String)> = Vec::new();
    let mut appended: Vec<(String, Replacement)> = Vec::new();

    for (key, replacement) in unique {
        match parsed.top_level.iter().find(|k| k.key == key) {
            Some(span) => {
                let key_indent = line_indent(yaml, span.key_range.start);
                let text = render_assignment(&replacement, &key_indent, eol)?;
                applied.push(value_edit(yaml, span, text));
            }
            None => appended.push((key, replacement)),
        }
    }

    // Right-to-left so earlier ranges keep their original offsets.
    applied.sort_by_key(|(r, _)| std::cmp::Reverse(r.start));
    let mut out = yaml.to_string();
    for (range, text) in applied {
        out.replace_range(range, &text);
    }

    if !appended.is_empty() {
        for (key, replacement) in appended {
            // Finish the block's last line so the new entry starts on one of
            // its own. In split form that line is missing exactly its `\n`
            // (under CRLF the `\r` is still there), so a single `\n` completes
            // it in either case, and a block already ending in a terminator
            // needs nothing.
            if !out.is_empty() && !out.ends_with('\n') {
                out.push('\n');
            }
            // Render the key through the emitter so a key needing quotes gets
            // them, then reuse the same assignment renderer as the splice path.
            let key_text = render::key_token(&key)?;
            let assign = render_assignment(&replacement, "", eol)?;
            out.push_str(&key_text);
            out.push(':');
            out.push_str(&assign);
            out.push_str(eol);
        }
        // Back to split form: the terminator on the final entry is the
        // caller's framing to write, not this function's. Under CRLF this
        // leaves the `\r`, which split form keeps.
        debug_assert!(out.ends_with('\n'));
        out.pop();
    }
    Ok(out)
}

/// The line ending a new line in this block has to be written with.
///
/// Distinct from [`crate::edit`]'s whole-document detector because a block in
/// split form can be CRLF while containing no `\n` at all: a one-key block
/// arrives as `title: Ada\r`, its only `\n` having been consumed as the fence
/// separator.
fn block_eol(yaml: &str) -> &'static str {
    match yaml.find('\n') {
        Some(i) if i > 0 && yaml.as_bytes()[i - 1] == b'\r' => "\r\n",
        Some(_) => "\n",
        None if yaml.ends_with('\r') => "\r\n",
        None => "\n",
    }
}

/// Re-point an emitter's always-LF text at the document's own line ending.
fn apply_eol(text: &str, eol: &'static str) -> String {
    if eol == "\n" {
        text.to_string()
    } else {
        text.replace('\n', eol)
    }
}

/// Removes a top-level key and the whole lines it occupied. An absent key
/// returns `yaml` unchanged. The key is matched exactly.
///
/// Unlike the rest of this module, the result is not always in split form:
/// removing the last key leaves the line ending of the line before it.
///
/// # Errors
///
/// [`SpliceError::Parse`] when `yaml` does not parse.
pub fn remove_key(yaml: &str, key: &str) -> Result<String, SpliceError> {
    let parsed = parse::parse_with_spans(yaml)?;
    let Some(span) = parsed.top_level.iter().find(|k| k.key == key) else {
        return Ok(yaml.to_string());
    };
    Ok(without_entry(yaml, span))
}

/// `src` with the whole lines of one top-level entry cut out. Shared with
/// [`crate::edit`]'s `Remove`.
///
/// From the start of the key's line to the end of the value's last line, so
/// a trailing inline comment goes with it; standalone comments above the key
/// sit before the cut and are kept.
pub(crate) fn without_entry(src: &str, span: &KeySpan) -> String {
    let start = line_start(src, span.key_range.start);
    let after = span.value_range.end.max(span.key_range.end);
    let end = match src[after..].find('\n') {
        Some(i) => after + i + 1,
        None => src.len(),
    };
    let mut out = String::with_capacity(src.len());
    out.push_str(&src[..start]);
    out.push_str(&src[end..]);
    out
}

/// A typed value rendered as everything after its key's `:`, in the
/// document's line ending. Shared with [`crate::edit`]'s `Set`.
///
/// The emitter always writes `\n`; a line written into a CRLF block has to
/// arrive as CRLF or the block gains a lone LF line.
pub(crate) fn value_assignment(
    value: &Value,
    key_indent: &str,
    eol: &'static str,
) -> Result<String, RenderError> {
    Ok(apply_eol(&render::assignment(value, key_indent)?, eol))
}

/// The range of `src` an assignment for `span` replaces, and the text that
/// goes there. Shared with [`crate::edit`]'s `Set`.
///
/// The range starts just past the `:`: see `KeySpan::assign_end` for why the
/// separator has to be part of it. [`fit_assignment`] may widen it.
pub(crate) fn value_edit(src: &str, span: &KeySpan, text: String) -> (Range<usize>, String) {
    fit_assignment(
        src,
        span.assign_end..span.value_range.end.max(span.assign_end),
        text,
    )
}

/// Render everything that follows the `:`, the separator included.
///
/// Owning the separator is what lets one code path handle both layouts:
/// a scalar renders as `" v"` and stays on the key's line, while a non-empty
/// collection renders as `"\n  - v"` and moves to the next one, each
/// re-indented under the key. A renderer that only produced the value would
/// have to leave `key: ` intact and could never turn `tags: []` into a block
/// list without leaving a trailing space behind.
fn render_assignment(
    replacement: &Replacement,
    key_indent: &str,
    eol: &'static str,
) -> Result<String, RenderError> {
    match replacement {
        // Raw text is inserted verbatim on the key's line, line endings and
        // all; a caller passing multi-line raw text is responsible for its
        // own indentation.
        Replacement::Raw(s) => Ok(format!(" {s}")),
        // A typed value goes through the shared value emitter, which owns the
        // scalar-vs-block layout decision.
        Replacement::Value(v) => value_assignment(v, key_indent, eol),
    }
}

/// Where a rendered assignment goes: `range` of `src`, widened when needed.
///
/// A block value (a first line that is empty, as for a block collection, or
/// ends in a block scalar header such as `|` or `>-`) cannot keep the text
/// that follows the old value on its line (a trailing `# comment`): left there
/// it would land on the new value's last line and become content. That text
/// is moved to the end of the first line, where a comment is allowed. Any
/// other multi-line text (a quoted or plain scalar that continues on the next
/// line) is left as it is, since its first line is not a place for a comment.
fn fit_assignment(src: &str, range: Range<usize>, text: String) -> (Range<usize>, String) {
    let Some((head, rest)) = text.split_once('\n') else {
        return (range, text);
    };
    let (head, eol) = head
        .strip_suffix('\r')
        .map_or((head, "\n"), |h| (h, "\r\n"));
    if !opens_a_block(head) {
        return (range, text);
    }
    let line_end = src[range.end..]
        .find(['\r', '\n'])
        .map_or(src.len(), |i| range.end + i);
    let tail = &src[range.end..line_end];
    // Trailing spaces alone are dropped: kept, they would become the end of
    // the new value's last line.
    if tail.trim().is_empty() {
        return (range.start..line_end, text);
    }
    (range.start..line_end, format!("{head}{tail}{eol}{rest}"))
}

/// Whether an assignment's first line (after the `:`) opens a block: it is
/// empty, or it is a block scalar header, that is zero or more tags (`!…`)
/// and anchors (`&…`) and then one `[|>][-+1-9]*` token, before any comment.
/// A scalar that only ends in ` |` or ` >` (`'a |`, or a folded plain line)
/// is not a header.
fn opens_a_block(head: &str) -> bool {
    let bytes = head.as_bytes();
    let code_end = (1..bytes.len())
        .find(|&i| bytes[i] == b'#' && matches!(bytes[i - 1], b' ' | b'\t'))
        .unwrap_or(bytes.len());
    let tokens: Vec<&str> = head[..code_end].split_whitespace().collect();
    let Some((last, props)) = tokens.split_last() else {
        return true;
    };
    let mut chars = last.chars();
    props.iter().all(|t| t.starts_with(['!', '&']))
        && matches!(chars.next(), Some('|' | '>'))
        && chars.all(|c| matches!(c, '-' | '+' | '1'..='9'))
}

/// The leading whitespace of the line `pos` sits on.
pub(crate) fn line_indent(yaml: &str, pos: usize) -> String {
    let ls = line_start(yaml, pos);
    yaml[ls..]
        .chars()
        .take_while(|c| *c == ' ' || *c == '\t')
        .collect()
}

fn line_start(s: &str, pos: usize) -> usize {
    s[..pos].rfind('\n').map(|i| i + 1).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(x: &str) -> Value {
        Value::Str(x.to_string())
    }

    #[test]
    fn a_splice_keeps_comments_key_order_and_quoting_style() {
        let src = "\
# The note's own header comment.
title: 'Single quoted on purpose'
status: draft   # why it is a draft
zeta: 1
alpha: 2
";
        let out = splice_key(src, "status", s("published")).unwrap();
        assert_eq!(
            out,
            "\
# The note's own header comment.
title: 'Single quoted on purpose'
status: published   # why it is a draft
zeta: 1
alpha: 2
"
        );
    }

    #[test]
    fn every_untouched_byte_is_identical() {
        let src = "a: 1\nb: 2\nc: 3\n";
        let out = splice_key(src, "b", Value::Int(20)).unwrap();
        assert_eq!(out, "a: 1\nb: 20\nc: 3\n");
        // The bytes before and after the spliced range are the same bytes.
        assert_eq!(&out[..5], &src[..5]);
        assert_eq!(&out[out.len() - 5..], &src[src.len() - 5..]);
    }

    #[test]
    fn splicing_a_missing_key_appends_it() {
        // Split form: the entry is written, its terminator is not. The `\n`
        // in the output is the one the input already had.
        let src = "a: 1\n";
        assert_eq!(splice_key(src, "b", s("two")).unwrap(), "a: 1\nb: two");
    }

    #[test]
    fn splicing_into_a_file_without_a_trailing_newline_still_works() {
        assert_eq!(
            splice_key("a: 1", "b", Value::Int(2)).unwrap(),
            "a: 1\nb: 2"
        );
    }

    #[test]
    fn an_append_returns_the_same_form_a_replace_does() {
        // Both the replace and append branches return split form, so a
        // caller composes blind without checking which branch ran.
        let replaced = splice_key("a: 1\nb: 2", "b", Value::Int(20)).unwrap();
        let appended = splice_key("a: 1\nb: 2", "c", Value::Int(3)).unwrap();
        assert_eq!(replaced, "a: 1\nb: 20");
        assert_eq!(appended, "a: 1\nb: 2\nc: 3");
        for out in [&replaced, &appended] {
            assert!(!out.ends_with('\n'), "not split form: {out:?}");
        }
    }

    #[test]
    fn appending_into_an_empty_block_writes_just_the_entry() {
        // The no-frontmatter case: there is no block to splice against, so the
        // result is the entry alone, with no leading or trailing newline.
        assert_eq!(splice_key("", "kind", s("note")).unwrap(), "kind: note");
    }

    #[test]
    fn several_appends_are_separated_but_the_last_is_not_terminated() {
        let out = splice_keys(
            "a: 1",
            vec![
                ("b".into(), Value::Int(2).into()),
                ("c".into(), Value::Int(3).into()),
            ],
        )
        .unwrap();
        assert_eq!(out, "a: 1\nb: 2\nc: 3");
    }

    #[test]
    fn an_appended_collection_is_written_as_a_block_list() {
        let out = splice_key("a: 1", "tags", Value::Seq(vec![s("one"), s("two")])).unwrap();
        assert_eq!(out, "a: 1\ntags:\n  - one\n  - two");
    }

    #[test]
    fn a_crlf_block_gets_its_appended_line_in_crlf() {
        // A one-key CRLF block in split form contains no `\n` at all (the
        // only one it had was consumed as the fence separator), so a detector
        // that looks for line endings the usual way concludes LF and leaves the
        // single LF line of a CRLF note behind.
        let out = splice_key("title: Ada\r", "kind", s("human")).unwrap();
        assert_eq!(out, "title: Ada\r\nkind: human\r");

        let out = splice_key("a: 1\r\nb: 2\r", "tags", Value::Seq(vec![s("x")])).unwrap();
        assert_eq!(out, "a: 1\r\nb: 2\r\ntags:\r\n  - x\r");
        assert!(
            !out.replace("\r\n", "").contains('\n'),
            "a lone LF leaked into a CRLF block: {out:?}"
        );
    }

    #[test]
    fn a_collection_value_is_reindented_under_its_key() {
        let src = "name: x\ntags:\n  - old\nafter: y\n";
        let out = splice_key(src, "tags", Value::Seq(vec![s("one"), s("two")])).unwrap();
        assert_eq!(out, "name: x\ntags:\n  - one\n  - two\nafter: y\n");
    }

    #[test]
    fn several_keys_splice_in_one_pass() {
        let src = "# hi\na: 1\nb: 2\nc: 3\n";
        let out = splice_keys(
            src,
            vec![
                ("a".into(), Value::Int(10).into()),
                ("c".into(), s("three").into()),
            ],
        )
        .unwrap();
        assert_eq!(out, "# hi\na: 10\nb: 2\nc: three\n");
    }

    #[test]
    fn a_key_named_twice_is_written_once_with_the_last_value() {
        let out = splice_keys(
            "a: 1\nb: 2",
            vec![
                ("a".into(), Value::Int(10).into()),
                ("a".into(), Value::Int(2000).into()),
            ],
        )
        .unwrap();
        assert_eq!(out, "a: 2000\nb: 2");

        // A multi-byte first value must not leave a stale range behind.
        let out = splice_keys(
            "a: 1\nb: 2",
            vec![
                ("a".into(), s("éé").into()),
                ("a".into(), Value::Int(3).into()),
            ],
        )
        .unwrap();
        assert_eq!(out, "a: 3\nb: 2");

        let out = splice_keys(
            "a: 1",
            vec![
                ("z".into(), Value::Int(1).into()),
                ("z".into(), Value::Int(2).into()),
            ],
        )
        .unwrap();
        assert_eq!(out, "a: 1\nz: 2");
    }

    #[test]
    fn a_crlf_block_gets_a_replaced_collection_in_crlf() {
        let src = "a: 1\r\ntags: []\r\nb: 2\r";
        let out = splice_key(src, "tags", Value::Seq(vec![s("x")])).unwrap();
        assert_eq!(out, "a: 1\r\ntags:\r\n  - x\r\nb: 2\r");
        assert!(
            !out.replace("\r\n", "").contains('\n'),
            "a lone LF leaked into a CRLF block: {out:?}"
        );
    }

    #[test]
    fn a_block_scalar_neighbour_is_left_alone() {
        let src = "\
desc: |
  first line
  # looks like a comment but is not
status: draft
";
        let out = splice_key(src, "status", s("done")).unwrap();
        assert!(out.contains("# looks like a comment but is not"));
        assert!(out.contains("status: done"));
        assert_eq!(out.lines().count(), src.lines().count());
    }

    #[test]
    fn crlf_files_keep_their_line_endings_outside_the_spliced_range() {
        let src = "a: 1\r\nb: 2\r\nc: 3\r\n";
        let out = splice_key(src, "b", Value::Int(9)).unwrap();
        assert_eq!(out, "a: 1\r\nb: 9\r\nc: 3\r\n");
    }

    #[test]
    fn unicode_neighbours_are_not_disturbed() {
        let src = "имя: Вася\nstatus: draft\nemoji: 🎉\n";
        let out = splice_key(src, "status", s("готов")).unwrap();
        assert_eq!(out, "имя: Вася\nstatus: готов\nemoji: 🎉\n");
    }

    #[test]
    fn raw_replacements_are_inserted_verbatim() {
        let src = "a: 1\nb: 2\n";
        let out = splice_key(src, "b", Replacement::Raw("'kept as-is'".into())).unwrap();
        assert_eq!(out, "a: 1\nb: 'kept as-is'\n");
    }

    #[test]
    fn removing_a_key_removes_its_whole_line() {
        let src = "a: 1\nb: 2\nc: 3\n";
        assert_eq!(remove_key(src, "b").unwrap(), "a: 1\nc: 3\n");
        assert_eq!(remove_key(src, "nope").unwrap(), src);
    }

    #[test]
    fn a_block_scalar_value_is_replaced_and_removed_without_its_neighbours() {
        let src = "body: |\n  first\n  second\nnext: 2";
        assert_eq!(splice_key(src, "body", s("x")).unwrap(), "body: x\nnext: 2");
        assert_eq!(remove_key(src, "body").unwrap(), "next: 2");
    }

    #[test]
    fn a_less_indented_comment_after_a_block_scalar_is_kept() {
        let src = "a: |\n    x\n  # note\nb: 1";
        assert_eq!(
            splice_key(src, "a", s("Z")).unwrap(),
            "a: Z\n  # note\nb: 1"
        );
        assert_eq!(remove_key(src, "a").unwrap(), "  # note\nb: 1");
    }

    #[test]
    fn an_empty_block_scalar_with_a_tag_or_anchor_is_replaced() {
        assert_eq!(
            splice_key("a: !!str | # c\nb: 1", "a", s("Z")).unwrap(),
            "a: Z # c\nb: 1"
        );
        assert_eq!(
            splice_key("a: &x >-\nb: 1", "a", s("Z")).unwrap(),
            "a: Z\nb: 1"
        );
        assert_eq!(remove_key("a: !!str |\nb: 1", "a").unwrap(), "b: 1");
    }

    #[test]
    fn a_trailing_comment_moves_to_the_header_of_a_new_block_value() {
        let src = "a: x # why\nb: 1";
        assert_eq!(
            splice_key(src, "a", s("l1\nl2\n")).unwrap(),
            "a: | # why\n  l1\n  l2\nb: 1"
        );
    }

    #[test]
    fn raw_multi_line_text_keeps_the_trailing_comment_where_it_was() {
        let src = "title: done # c\nn: 1";
        assert_eq!(
            splice_key(src, "title", Replacement::Raw("'multi\n  line'".into())).unwrap(),
            "title: 'multi\n  line' # c\nn: 1"
        );
        assert_eq!(
            splice_key(src, "title", Replacement::Raw("plain\n  more".into())).unwrap(),
            "title: plain\n  more # c\nn: 1"
        );
        let out = splice_key(
            "title: done\nn: 1",
            "title",
            Replacement::Raw("plain\n  more".into()),
        )
        .unwrap();
        assert_eq!(out, "title: plain\n  more\nn: 1");
        assert!(parse::parse_mapping(&out).is_ok());
    }

    #[test]
    fn a_scalar_ending_in_a_bar_is_not_a_block_header() {
        let src = "title: done # c\nn: 1";
        assert_eq!(
            splice_key(src, "title", Replacement::Raw("'a |\n  b'".into())).unwrap(),
            "title: 'a |\n  b' # c\nn: 1"
        );
    }

    #[test]
    fn a_folded_plain_line_ending_in_a_greater_than_sign_is_not_a_block_header() {
        // `assignment` never folds (line width 0), but a caller can pass the
        // emitter's folded output as Raw text. Fold right after ` >`.
        let head = "word ".repeat(15);
        let long = format!("{head}> {}", "tail ".repeat(12).trim_end());
        let mut m = crate::value::Mapping::new();
        m.insert("t", s(&long));
        let rendered =
            render::render_value(&Value::Map(m), render::EmitOptions::default()).unwrap();
        let raw = rendered.strip_prefix("t: ").unwrap().trim_end_matches('\n');
        let first = raw.split('\n').next().unwrap();
        assert!(
            first.ends_with(" >"),
            "the fold lands after the sign: {raw:?}"
        );

        let out = splice_key("t: x # c\nn: 1", "t", Replacement::Raw(raw.to_string())).unwrap();
        assert!(out.ends_with(" # c\nn: 1"), "{out:?}");
        assert_eq!(
            parse::parse_mapping(&out).unwrap().get("t"),
            Some(&s(&long))
        );
    }

    #[test]
    fn a_raw_header_with_its_own_comment_is_a_block() {
        assert!(opens_a_block(" | # x"));
        assert!(opens_a_block(" !!str &a >-"));
        assert!(opens_a_block(""));
        assert!(!opens_a_block(" 'a |"));
        assert!(!opens_a_block(" a >"));
        assert_eq!(
            splice_key("t: x # c\nn: 1", "t", Replacement::Raw("| # x\n  a".into())).unwrap(),
            "t: | # x # c\n  a\nn: 1"
        );
    }

    #[test]
    fn raw_block_text_moves_the_trailing_comment_to_its_header() {
        let src = "title: done # c\nn: 1";
        assert_eq!(
            splice_key(src, "title", Replacement::Raw("|-\n  a\n  b".into())).unwrap(),
            "title: |- # c\n  a\n  b\nn: 1"
        );
    }

    #[test]
    fn trailing_spaces_after_an_old_value_are_dropped_for_a_block_value() {
        assert_eq!(
            splice_key("a: x   \nb: 1", "a", s("l1\nl2\n")).unwrap(),
            "a: |\n  l1\n  l2\nb: 1"
        );
    }

    #[test]
    fn a_keep_chomped_value_keeps_its_trailing_line_breaks() {
        let src = "a: x\nb: 1";
        assert_eq!(
            splice_key(src, "a", s("kept\n\n")).unwrap(),
            "a: |+\n  kept\n\nb: 1"
        );
    }

    #[test]
    fn an_empty_block_scalar_is_replaced_and_removed() {
        let src = "a: |\nb: 1";
        assert_eq!(splice_key(src, "a", s("Z")).unwrap(), "a: Z\nb: 1");
        assert_eq!(remove_key(src, "a").unwrap(), "b: 1");
    }

    #[test]
    fn a_quoted_value_keeps_its_trailing_comment() {
        let src = "title: 'Draft'  # why\nn: 1";
        assert_eq!(
            splice_key(src, "title", s("Done")).unwrap(),
            "title: Done  # why\nn: 1"
        );
    }
}
