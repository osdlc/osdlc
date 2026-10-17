//! The YAML 1.2 value emitter: **byte-identical to the npm `yaml` package,
//! version 2 (`yaml@2`), `stringify`**.
//!
//! The edit functions and [`splice`](crate::splice) render the bytes of a new
//! value through it. It never renders the enclosing mapping, which the caller
//! already has. [`render_value`] renders a whole value, for a caller that
//! wants to write a document `yaml@2` would write.
//!
//! **Stability:** unstable. The items in this module may change in any 0.x
//! minor release.
//!
//! The output matches `yaml@2` byte for byte, so files written from Rust and
//! from JavaScript do not differ. A different quoting choice, `1.0` where
//! `yaml@2` writes `1`, or a fold in a different place would show up as a
//! diff on the next write. So this is a reimplementation of one specific
//! emitter: it follows the structure of `yaml@2`'s `stringifyString.js`,
//! `foldFlowLines.js` and `stringifyPair.js`. The expected strings in the tests
//! are captured from `yaml@2.9.0`.
//!
//! ## Limitation: folded block scalars
//!
//! `yaml@2` switches a multi-line string from a literal block (`|`) to a
//! *folded* block (`>`) when some line exceeds `lineWidth`, and falls back to
//! literal again if the fold finds no space to break on. Writing `>` correctly
//! means reproducing three chained regex rewrites and the more-indented-line
//! handling of `FOLD_BLOCK`. That path is unreachable with `line_width: 0`, so
//! rather than ship an approximation, this returns
//! [`RenderError::FoldedBlockUnsupported`].
//!
//! ## UTF-16
//!
//! Line folding counts UTF-16 code units, not bytes or `char`s, because
//! `yaml@2` measures JavaScript string `.length`. Text with non-ASCII
//! characters folds in a different place if you count anything else.

use crate::value::{Mapping, Value, js_float_to_string};

/// Emitter options: the subset of `yaml@2`'s `ToStringOptions` this emitter
/// supports. Everything else is fixed at `yaml@2`'s defaults.
///
/// New options may be added in a minor release. Start from
/// [`EmitOptions::default`], [`EmitOptions::line_width_0`] or
/// [`EmitOptions::line_width_120`] and set fields on it.
#[derive(Debug, Clone, Copy)]
#[non_exhaustive]
pub struct EmitOptions {
    /// `lineWidth`. `0` turns folding off. Default 80.
    pub line_width: usize,
    /// `minContentWidth`. Default 20.
    pub min_content_width: usize,
    /// `doubleQuotedMinMultiLineLength`. Default 40.
    pub double_quoted_min_multi_line_length: usize,
    /// `indent`: spaces per indent level. Default 2.
    pub indent: usize,
}

impl Default for EmitOptions {
    fn default() -> Self {
        EmitOptions {
            line_width: 80,
            min_content_width: 20,
            double_quoted_min_multi_line_length: 40,
            indent: 2,
        }
    }
}

impl EmitOptions {
    /// The defaults with `line_width: 0`, `yaml@2`'s `{ lineWidth: 0 }`: no
    /// folding.
    pub fn line_width_0() -> Self {
        EmitOptions {
            line_width: 0,
            ..Default::default()
        }
    }

    /// The defaults with `line_width: 120`, `yaml@2`'s `{ lineWidth: 120 }`.
    pub fn line_width_120() -> Self {
        EmitOptions {
            line_width: 120,
            ..Default::default()
        }
    }
}

/// Why a value could not be rendered.
///
/// New variants may be added in a minor release, so a `match` needs a
/// wildcard arm.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
#[non_exhaustive]
pub enum RenderError {
    /// See the module docs. Only reachable with `line_width > 0` and a
    /// multi-line string containing a foldable over-long line.
    #[error(
        "canonical emit would need a folded block scalar (`>`), which is not \
         implemented; the value has a line longer than the {line_width}-column \
         limit. Emit it with line_width 0, or shorten the line."
    )]
    FoldedBlockUnsupported {
        /// The `line_width` the value was rendered with.
        line_width: usize,
    },
}

/// Renders a value the way `YAML.stringify(value, { lineWidth })` does in
/// `yaml@2`, trailing newline included.
///
/// ```
/// use yaml_splice::{Mapping, Value, render::{EmitOptions, render_value}};
///
/// let mut m = Mapping::new();
/// m.insert("title", Value::from("Hello: world"));
/// m.insert("tags", Value::from(vec!["a", "b"]));
/// let yaml = render_value(&Value::Map(m), EmitOptions::line_width_0())?;
/// assert_eq!(yaml, "title: \"Hello: world\"\ntags:\n  - a\n  - b\n");
/// # Ok::<(), yaml_splice::render::RenderError>(())
/// ```
///
/// # Errors
///
/// [`RenderError::FoldedBlockUnsupported`] when `line_width > 0` and a
/// multi-line string has a line `yaml@2` would fold.
pub fn render_value(value: &Value, opts: EmitOptions) -> Result<String, RenderError> {
    let ctx = Ctx {
        indent: String::new(),
        indent_at_start: None,
        implicit_key: false,
        in_flow: false,
        opts,
    };
    // `yaml@2` always ends the document with a line break, even after a
    // keep-chomped (`|+`) scalar whose own text already ends in one.
    let mut out = stringify(value, &ctx)?;
    out.push('\n');
    Ok(out)
}

/// Render everything that follows a key's `:` for a `Set`/append — the
/// separator included — with the value re-indented one level under a key at
/// `key_indent`.
///
/// Owning the separator is what lets one code path handle both layouts: a
/// scalar renders as `" v"` and stays on the key's line, while a non-empty
/// collection renders as `"\n  - v"` and moves to the next one. The emitter
/// itself decides the layout; reading it back off the rendered `k: …` wrapper
/// is more reliable than re-deriving the rule here.
pub(crate) fn assignment(value: &Value, key_indent: &str) -> Result<String, RenderError> {
    let mut wrapper = Mapping::new();
    wrapper.insert("k", value.clone());
    let rendered = render_value(&Value::Map(wrapper), EmitOptions::line_width_0())?;
    let body = rendered.strip_prefix("k:").unwrap_or(&rendered);
    // Only the final line break is the emitter's: further ones are the
    // content of a keep-chomped (`|+`) scalar.
    let body = body.strip_suffix('\n').unwrap_or(body);
    let (raw, block) = match body.strip_prefix('\n') {
        Some(rest) => (rest.to_string(), true),
        None => (body.strip_prefix(' ').unwrap_or(body).to_string(), false),
    };

    if !block {
        return Ok(format!(" {raw}"));
    }
    // A block value sits one level in from the key, and the emitter already
    // rendered it at exactly that one level, so only the extra key indent is
    // added.
    let mut out = String::new();
    for line in raw.split('\n') {
        out.push('\n');
        if !line.is_empty() {
            out.push_str(key_indent);
            out.push_str(line);
        }
    }
    Ok(out)
}

/// Render just a key's token (quoted if the emitter would quote it), for an
/// appended entry or a `Rename`. `key: null` is rendered and everything from
/// the final `:` on is dropped; `null` carries no colon of its own, so the
/// split lands on the separator even for a quoted key like `"a: b"`.
pub(crate) fn key_token(key: &str) -> Result<String, RenderError> {
    let mut key_only = Mapping::new();
    key_only.insert(key, Value::Null);
    let rendered = render_value(&Value::Map(key_only), EmitOptions::line_width_0())?;
    let head = rendered
        .rsplit_once(':')
        .map(|(h, _)| h)
        .unwrap_or(&rendered);
    Ok(head.to_string())
}

#[derive(Clone)]
struct Ctx {
    indent: String,
    indent_at_start: Option<usize>,
    implicit_key: bool,
    in_flow: bool,
    opts: EmitOptions,
}

impl Ctx {
    fn indent_step(&self) -> String {
        " ".repeat(self.opts.indent)
    }
}

fn stringify(value: &Value, ctx: &Ctx) -> Result<String, RenderError> {
    match value {
        Value::Null => Ok("null".to_string()),
        Value::Bool(b) => Ok(if *b { "true" } else { "false" }.to_string()),
        Value::Int(i) => Ok(i.to_string()),
        Value::Float(f) => Ok(js_float_to_string(*f)),
        Value::Str(s) => stringify_string(s, ctx),
        Value::Seq(items) => stringify_seq(items, ctx),
        Value::Map(map) => stringify_map(map, ctx),
    }
}

// --- collections -----------------------------------------------------------

fn stringify_map(map: &Mapping, ctx: &Ctx) -> Result<String, RenderError> {
    if map.is_empty() {
        return Ok("{}".to_string());
    }
    // A block map's items sit at the map's OWN indent (`itemIndent:
    // ctx.indent || ''` in YAMLMap.js); the extra level appears on the
    // *value* side, inside stringify_pair.
    let mut lines = Vec::new();
    for (k, v) in map.iter() {
        lines.push(stringify_pair(k, v, ctx)?);
    }
    Ok(join_block_lines(&lines, &ctx.indent))
}

fn stringify_seq(items: &[Value], ctx: &Ctx) -> Result<String, RenderError> {
    if items.is_empty() {
        return Ok("[]".to_string());
    }
    let item_indent = format!("{}{}", ctx.indent, ctx.indent_step());
    let item_ctx = Ctx {
        indent: item_indent,
        indent_at_start: ctx.indent_at_start,
        implicit_key: false,
        in_flow: false,
        opts: ctx.opts,
    };
    let mut lines = Vec::new();
    for item in items {
        lines.push(format!("- {}", stringify(item, &item_ctx)?));
    }
    Ok(join_block_lines(&lines, &ctx.indent))
}

/// `stringifyBlockCollection`'s join: first line bare, the rest prefixed with
/// the collection's indent. Empty lines get no indent (trailing-whitespace
/// hygiene that `yaml@2` is careful about and diffs notice).
fn join_block_lines(lines: &[String], indent: &str) -> String {
    let mut out = String::new();
    for (i, line) in lines.iter().enumerate() {
        if i == 0 {
            out.push_str(line);
        } else if line.is_empty() {
            out.push('\n');
        } else {
            out.push('\n');
            out.push_str(indent);
            out.push_str(line);
        }
    }
    out
}

fn stringify_pair(key: &str, value: &Value, ctx: &Ctx) -> Result<String, RenderError> {
    let child_indent = format!("{}{}", ctx.indent, ctx.indent_step());

    // Keys render as implicit (no `? `) unless they exceed 1024 chars, which
    // is `stringifyPair`'s own escape hatch.
    let key_ctx = Ctx {
        indent: child_indent.clone(),
        indent_at_start: None,
        implicit_key: true,
        in_flow: ctx.in_flow,
        opts: ctx.opts,
    };
    let key_str = stringify_string(key, &key_ctx)?;
    let explicit_key = !ctx.in_flow && utf16_len(&key_str) > 1024;

    let mut str_ = if explicit_key {
        format!("? {key_str}\n{}:", ctx.indent)
    } else {
        format!("{key_str}:")
    };

    let value_ctx = Ctx {
        indent: child_indent.clone(),
        // `ctx.indentAtStart = str.length + 1` — deliberately measured from
        // the KEY text alone, not including the collection indent that gets
        // prepended at join time. That undercount is `yaml@2`'s, and
        // reproducing it is the point.
        indent_at_start: if !explicit_key && !value.is_collection() {
            Some(utf16_len(&str_) + 1)
        } else {
            None
        },
        implicit_key: false,
        in_flow: ctx.in_flow,
        opts: ctx.opts,
    };
    let value_str = stringify(value, &value_ctx)?;

    let ws = if value.is_collection() {
        let has_newline = value_str.contains('\n');
        // `flow` is true for an empty collection, which is why `{}` and `[]`
        // stay on the key's line.
        let flow = value.is_empty_collection();
        if has_newline || !flow {
            format!("\n{child_indent}")
        } else {
            " ".to_string()
        }
    } else if value_str.is_empty() || value_str.starts_with('\n') {
        String::new()
    } else {
        " ".to_string()
    };

    str_.push_str(&ws);
    str_.push_str(&value_str);
    Ok(str_)
}

// --- strings ---------------------------------------------------------------

/// Control characters and surrogates force double quotes regardless of what
/// plain/block analysis would prefer (`stringifyString`'s first branch).
fn forces_double_quote(s: &str) -> bool {
    s.chars().any(|c| {
        let c = c as u32;
        (0x00..=0x08).contains(&c) || (0x0b..=0x1f).contains(&c) || (0x7f..=0x9f).contains(&c)
    })
}

fn stringify_string(value: &str, ctx: &Ctx) -> Result<String, RenderError> {
    if forces_double_quote(value) {
        return Ok(double_quoted_string(value, ctx));
    }
    plain_string(value, ctx)
}

fn contains_document_marker(s: &str) -> bool {
    s.lines()
        .any(|l| l.starts_with('%') || l.starts_with("---") || l.starts_with("..."))
        || s.starts_with('%')
        || s.starts_with("---")
        || s.starts_with("...")
}

/// `plainString`'s reject regex, transcribed:
/// `/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/`
fn plain_is_disallowed(v: &str) -> bool {
    const LEADING: &[char] = &[
        '\n', '\t', ' ', ',', '[', ']', '{', '}', '#', '&', '*', '!', '|', '>', '\'', '"', '%',
        '@', '`',
    ];
    let b: Vec<char> = v.chars().collect();
    if let Some(first) = b.first() {
        if LEADING.contains(first) {
            return true;
        }
        if (*first == '?' || *first == '-') && (b.len() == 1 || matches!(b[1], ' ' | '\t')) {
            return true;
        }
    }
    for i in 0..b.len() {
        let c = b[i];
        let next = b.get(i + 1).copied();
        // `[\n:][ \t]`
        if matches!(c, '\n' | ':') && matches!(next, Some(' ') | Some('\t')) {
            return true;
        }
        // `[ \t]\n`
        if matches!(c, ' ' | '\t') && next == Some('\n') {
            return true;
        }
        // `[\n\t ]#`
        if matches!(c, '\n' | '\t' | ' ') && next == Some('#') {
            return true;
        }
    }
    // `[\n\t :]$`
    matches!(b.last(), Some('\n') | Some('\t') | Some(' ') | Some(':'))
}

/// The core-schema tags with a `test`, from `yaml@2`'s `schema/core/*.js` and
/// `schema/common/null.js`. A plain rendering matching any of these would
/// read back as a non-string, so it gets quoted instead.
fn would_reparse_as_non_string(s: &str) -> bool {
    // null: /^(?:~|[Nn]ull|NULL)?$/  — note it matches the EMPTY string.
    if s.is_empty() || s == "~" || s == "null" || s == "Null" || s == "NULL" {
        return true;
    }
    // bool: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/
    if matches!(s, "true" | "True" | "TRUE" | "false" | "False" | "FALSE") {
        return true;
    }
    // float special: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/
    let inf_body = s.strip_prefix(['-', '+']).unwrap_or(s);
    if matches!(inf_body, ".inf" | ".Inf" | ".INF") || matches!(s, ".nan" | ".NaN" | ".NAN") {
        return true;
    }
    let body = s.strip_prefix(['-', '+']).unwrap_or(s);
    // int: /^[-+]?[0-9]+$/
    if !body.is_empty() && body.bytes().all(|c| c.is_ascii_digit()) {
        return true;
    }
    // int oct/hex: /^0o[0-7]+$/ and /^0x[0-9a-fA-F]+$/ (no sign in yaml@2)
    if s.strip_prefix("0o")
        .is_some_and(|rest| !rest.is_empty() && rest.bytes().all(|c| (b'0'..=b'7').contains(&c)))
    {
        return true;
    }
    if s.strip_prefix("0x")
        .is_some_and(|rest| !rest.is_empty() && rest.bytes().all(|c| c.is_ascii_hexdigit()))
    {
        return true;
    }
    // float exp: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/
    if is_float_exp(body) {
        return true;
    }
    // float: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/
    if is_float_plain(body) {
        return true;
    }
    false
}

fn is_float_plain(body: &str) -> bool {
    if let Some(frac) = body.strip_prefix('.') {
        return !frac.is_empty() && frac.bytes().all(|c| c.is_ascii_digit());
    }
    match body.split_once('.') {
        Some((int, frac)) => {
            !int.is_empty()
                && int.bytes().all(|c| c.is_ascii_digit())
                && frac.bytes().all(|c| c.is_ascii_digit())
        }
        None => false,
    }
}

fn is_float_exp(body: &str) -> bool {
    let idx = body.find(['e', 'E']);
    let Some(idx) = idx else { return false };
    let (mant, exp) = body.split_at(idx);
    let exp = &exp[1..];
    let exp_digits = exp.strip_prefix(['-', '+']).unwrap_or(exp);
    if exp_digits.is_empty() || !exp_digits.bytes().all(|c| c.is_ascii_digit()) {
        return false;
    }
    if let Some(frac) = mant.strip_prefix('.') {
        return !frac.is_empty() && frac.bytes().all(|c| c.is_ascii_digit());
    }
    match mant.split_once('.') {
        Some((int, frac)) => {
            !int.is_empty()
                && int.bytes().all(|c| c.is_ascii_digit())
                && frac.bytes().all(|c| c.is_ascii_digit())
        }
        None => !mant.is_empty() && mant.bytes().all(|c| c.is_ascii_digit()),
    }
}

fn plain_string(value: &str, ctx: &Ctx) -> Result<String, RenderError> {
    if ctx.implicit_key && value.contains('\n') {
        return Ok(quoted_string(value, ctx));
    }
    if ctx.in_flow && value.contains(['[', ']', '{', '}', ',']) {
        return Ok(quoted_string(value, ctx));
    }
    if plain_is_disallowed(value) {
        return if ctx.implicit_key || ctx.in_flow || !value.contains('\n') {
            Ok(quoted_string(value, ctx))
        } else {
            block_string(value, ctx)
        };
    }
    // "Where allowed & type not set explicitly, prefer block style for
    // multiline strings." We never set an explicit scalar type, so every
    // surviving multi-line string lands here.
    if !ctx.implicit_key && !ctx.in_flow && value.contains('\n') {
        return block_string(value, ctx);
    }
    if contains_document_marker(value) {
        if ctx.indent.is_empty() {
            return block_string(value, ctx);
        } else if ctx.implicit_key && ctx.indent == ctx.indent_step() {
            return Ok(quoted_string(value, ctx));
        }
    }
    let str_ = replace_newline_runs_with(value, &format!("\n{}", ctx.indent));
    if would_reparse_as_non_string(&str_) {
        return Ok(quoted_string(value, ctx));
    }
    if ctx.implicit_key {
        Ok(str_)
    } else {
        Ok(fold_flow_lines(
            &str_,
            &ctx.indent,
            FoldMode::Flow,
            ctx.indent_at_start,
            ctx.opts,
        )
        .0)
    }
}

/// `value.replace(/\n+/g, '$&' + suffix)` — append `suffix` after each RUN of
/// newlines, not after each newline.
fn replace_newline_runs_with(value: &str, suffix: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(c) = chars.next() {
        out.push(c);
        if c == '\n' {
            while chars.peek() == Some(&'\n') {
                out.push(chars.next().unwrap());
            }
            out.push_str(suffix);
        }
    }
    out
}

fn quoted_string(value: &str, ctx: &Ctx) -> String {
    // `singleQuote` defaults to null, so: single quotes only when the value
    // contains `"` and no `'`; otherwise double.
    let has_double = value.contains('"');
    let has_single = value.contains('\'');
    if has_double && !has_single {
        single_quoted_string(value, ctx)
    } else {
        double_quoted_string(value, ctx)
    }
}

fn single_quoted_string(value: &str, ctx: &Ctx) -> String {
    // A single-quoted scalar cannot carry whitespace adjacent to a newline.
    let bad_ws = value.char_indices().any(|(i, c)| {
        (matches!(c, ' ' | '\t') && value[i..].chars().nth(1) == Some('\n'))
            || (c == '\n' && matches!(value[i..].chars().nth(1), Some(' ') | Some('\t')))
    });
    if (ctx.implicit_key && value.contains('\n')) || bad_ws {
        return double_quoted_string(value, ctx);
    }
    let indent = if ctx.indent.is_empty() && contains_document_marker(value) {
        "  ".to_string()
    } else {
        ctx.indent.clone()
    };
    let escaped = value.replace('\'', "''");
    let res = format!(
        "'{}'",
        replace_newline_runs_with(&escaped, &format!("\n{indent}"))
    );
    if ctx.implicit_key {
        res
    } else {
        fold_flow_lines(&res, &indent, FoldMode::Flow, ctx.indent_at_start, ctx.opts).0
    }
}

/// `JSON.stringify` of a string, then `yaml@2`'s escape rewrites.
fn double_quoted_string(value: &str, ctx: &Ctx) -> String {
    let json = json_stringify_str(value);
    let indent = if ctx.indent.is_empty() && contains_document_marker(value) {
        "  ".to_string()
    } else {
        ctx.indent.clone()
    };
    let min_multi = ctx.opts.double_quoted_min_multi_line_length;

    let j: Vec<char> = json.chars().collect();
    let mut out = String::new();
    let mut start = 0usize;
    let mut i = 0usize;
    while i < j.len() {
        let mut ch = j[i];
        // "space before newline needs to be escaped to not be folded"
        if ch == ' ' && j.get(i + 1) == Some(&'\\') && j.get(i + 2) == Some(&'n') {
            out.extend(&j[start..i]);
            out.push_str("\\ ");
            i += 1;
            start = i;
            ch = '\\';
        }
        if ch == '\\' {
            match j.get(i + 1) {
                Some('u') => {
                    out.extend(&j[start..i]);
                    let code: String = j[i + 2..(i + 6).min(j.len())].iter().collect();
                    match code.as_str() {
                        "0000" => out.push_str("\\0"),
                        "0007" => out.push_str("\\a"),
                        "000b" => out.push_str("\\v"),
                        "001b" => out.push_str("\\e"),
                        "0085" => out.push_str("\\N"),
                        "00a0" => out.push_str("\\_"),
                        "2028" => out.push_str("\\L"),
                        "2029" => out.push_str("\\P"),
                        _ => match code.strip_prefix("00") {
                            // `\u00XX` collapses to yaml's shorter `\xXX`.
                            Some(low) => {
                                out.push_str("\\x");
                                out.push_str(low);
                            }
                            None => out.extend(&j[i..(i + 6).min(j.len())]),
                        },
                    }
                    i += 5;
                    start = i + 1;
                }
                Some('n') => {
                    if ctx.implicit_key || j.get(i + 2) == Some(&'"') || j.len() < min_multi {
                        i += 1;
                    } else {
                        out.extend(&j[start..i]);
                        out.push_str("\n\n");
                        while j.get(i + 2) == Some(&'\\')
                            && j.get(i + 3) == Some(&'n')
                            && j.get(i + 4) != Some(&'"')
                        {
                            out.push('\n');
                            i += 2;
                        }
                        out.push_str(&indent);
                        if j.get(i + 2) == Some(&' ') {
                            out.push('\\');
                        }
                        i += 1;
                        start = i + 1;
                    }
                }
                _ => i += 1,
            }
        }
        i += 1;
    }
    let s = if start > 0 {
        out.extend(&j[start.min(j.len())..]);
        out
    } else {
        json
    };
    if ctx.implicit_key {
        s
    } else {
        fold_flow_lines(&s, &indent, FoldMode::Quoted, ctx.indent_at_start, ctx.opts).0
    }
}

/// The subset of `JSON.stringify` that applies to a lone string.
fn json_stringify_str(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// `lineLengthOverLimit` — does any line exceed `lineWidth - indentLength`?
fn line_length_over_limit(s: &str, line_width: usize, indent_len: usize) -> bool {
    if line_width == 0 {
        return false;
    }
    let limit = line_width.saturating_sub(indent_len);
    let units: Vec<u16> = s.encode_utf16().collect();
    if units.len() <= limit {
        return false;
    }
    let mut start = 0usize;
    for (i, u) in units.iter().enumerate() {
        if *u == u16::from(b'\n') {
            if i - start > limit {
                return true;
            }
            start = i + 1;
            if units.len() - start <= limit {
                return false;
            }
        }
    }
    true
}

fn block_string(value: &str, ctx: &Ctx) -> Result<String, RenderError> {
    // "Block can't end in whitespace unless the last line is non-empty."
    let ends_with_nl_then_ws = {
        match value.rfind('\n') {
            Some(idx) => {
                let tail = &value[idx + 1..];
                !tail.is_empty() && tail.chars().all(|c| c == ' ' || c == '\t')
            }
            None => false,
        }
    };
    if ends_with_nl_then_ws {
        return Ok(quoted_string(value, ctx));
    }

    let indent = if ctx.indent.is_empty() && contains_document_marker(value) {
        "  ".to_string()
    } else {
        ctx.indent.clone()
    };

    let literal = !line_length_over_limit(value, ctx.opts.line_width, indent.chars().count());
    if !literal {
        // See the module docs: `>` is deliberately not implemented. But
        // `yaml@2` itself falls back to `|` when the fold finds nothing to
        // break on, and that fallback IS reachable with ordinary data
        // (a long unbroken token), so check for it before erroring.
        if folded_would_overflow_to_literal(value, &indent, ctx.opts) {
            // fall through to the literal emit below
        } else {
            return Err(RenderError::FoldedBlockUnsupported {
                line_width: ctx.opts.line_width,
            });
        }
    }

    if value.is_empty() {
        return Ok("|\n".to_string());
    }

    let chars: Vec<char> = value.chars().collect();
    // Chomping indicator, from the whitespace at the value's end.
    let mut end_start = chars.len();
    while end_start > 0 {
        let ch = chars[end_start - 1];
        if ch != '\n' && ch != '\t' && ch != ' ' {
            break;
        }
        end_start -= 1;
    }
    let mut end: String = chars[end_start..].iter().collect();
    let end_nl_pos = end.find('\n');
    let chomp = match end_nl_pos {
        None => "-",
        Some(pos) => {
            let is_last = pos == end.chars().count() - 1;
            if end.chars().count() == chars.len() || !is_last {
                "+"
            } else {
                ""
            }
        }
    };

    let mut body: Vec<char> = chars.clone();
    if !end.is_empty() {
        body.truncate(chars.len() - end.chars().count());
        if end.ends_with('\n') {
            end.pop();
        }
        end = indent_inner_newline_runs(&end, &indent);
    }

    // Indent indicator, from the whitespace at the value's start.
    let mut start_with_space = false;
    let mut start_end = 0usize;
    let mut start_nl_pos: isize = -1;
    while start_end < body.len() {
        let ch = body[start_end];
        if ch == ' ' {
            start_with_space = true;
        } else if ch == '\n' {
            start_nl_pos = start_end as isize;
        } else {
            break;
        }
        start_end += 1;
    }
    let start_take = if start_nl_pos < start_end as isize {
        (start_nl_pos + 1) as usize
    } else {
        start_end
    };
    let mut start: String = body[..start_take].iter().collect();
    if !start.is_empty() {
        body.drain(..start_take);
        start = replace_newline_runs_with(&start, &indent);
    }

    let indent_size = if indent.is_empty() { "1" } else { "2" };
    let header = format!(
        "{}{}",
        if start_with_space { indent_size } else { "" },
        chomp
    );
    let body: String = body.into_iter().collect();
    let body = replace_newline_runs_with(&body, &indent);
    Ok(format!("|{header}\n{indent}{start}{body}{end}"))
}

/// `blockEndNewlines` — `(^|(?<!\n))\n+(?!\n|$)`: indent after each newline
/// run that is neither at the very end nor followed by another newline.
fn indent_inner_newline_runs(s: &str, indent: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\n' {
            let run_start = i;
            while i < chars.len() && chars[i] == '\n' {
                i += 1;
            }
            out.extend(&chars[run_start..i]);
            if i < chars.len() {
                out.push_str(indent);
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// Would `yaml@2`'s folded-block attempt overflow (i.e. find no space to
/// break on) and therefore fall back to a literal block?
///
/// Conservative on purpose: it answers "yes" only when no line of the value
/// contains a foldable space at all, which is the case that provably falls
/// back. Anything less clear-cut takes the error path rather than guessing.
fn folded_would_overflow_to_literal(value: &str, indent: &str, opts: EmitOptions) -> bool {
    let limit = opts.line_width.saturating_sub(indent.chars().count());
    value.split('\n').all(|line| {
        if line.encode_utf16().count() <= limit {
            return true;
        }
        // A foldable point is a space with non-space, non-tab neighbours.
        let c: Vec<char> = line.chars().collect();
        !(1..c.len().saturating_sub(1)).any(|i| {
            c[i] == ' '
                && !matches!(c[i - 1], ' ' | '\t' | '\n')
                && !matches!(c[i + 1], ' ' | '\t' | '\n')
        })
    })
}

// --- folding ---------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum FoldMode {
    Flow,
    Quoted,
    #[allow(dead_code)]
    Block,
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// `foldFlowLines`, transcribed. Operates on UTF-16 code units because
/// `yaml@2` measures JavaScript string length.
///
/// Returns `(text, overflowed)`.
fn fold_flow_lines(
    text: &str,
    indent: &str,
    mode: FoldMode,
    indent_at_start: Option<usize>,
    opts: EmitOptions,
) -> (String, bool) {
    let line_width = opts.line_width;
    if line_width == 0 {
        return (text.to_string(), false);
    }
    let mut min_content_width = opts.min_content_width;
    if line_width < min_content_width {
        min_content_width = 0;
    }
    let t: Vec<u16> = text.encode_utf16().collect();
    let ind: Vec<u16> = indent.encode_utf16().collect();

    let end_step = (1 + min_content_width).max(1 + line_width.saturating_sub(ind.len()));
    if t.len() <= end_step {
        return (text.to_string(), false);
    }

    const NL: u16 = b'\n' as u16;
    const SP: u16 = b' ' as u16;
    const TAB: u16 = b'\t' as u16;
    const BSLASH: u16 = b'\\' as u16;

    let mut folds: Vec<usize> = Vec::new();
    let mut escaped_folds: std::collections::HashSet<usize> = std::collections::HashSet::new();
    let mut end: isize = line_width as isize - ind.len() as isize;
    if let Some(ias) = indent_at_start {
        if ias as isize > line_width as isize - 2.max(min_content_width) as isize {
            folds.push(0);
        } else {
            end = line_width as isize - ias as isize;
        }
    }

    let mut split: Option<usize> = None;
    let mut prev: Option<u16> = None;
    let mut overflow = false;
    let mut i: isize = -1;
    let mut esc_start: isize = -1;
    let mut esc_end: isize = -1;

    loop {
        i += 1;
        if i as usize >= t.len() {
            break;
        }
        let mut ch = t[i as usize];
        if mode == FoldMode::Quoted && ch == BSLASH {
            esc_start = i;
            match t.get((i + 1) as usize).copied() {
                Some(c) if c == b'x' as u16 => i += 3,
                Some(c) if c == b'u' as u16 => i += 5,
                Some(c) if c == b'U' as u16 => i += 9,
                _ => i += 1,
            }
            esc_end = i;
        }
        if i as usize >= t.len() {
            break;
        }
        ch = t[i as usize];
        if ch == NL {
            end = i + ind.len() as isize + end_step as isize;
            split = None;
        } else {
            if ch == SP
                && matches!(prev, Some(p) if p != SP && p != NL && p != TAB)
                && t.get((i + 1) as usize)
                    .is_some_and(|next| *next != SP && *next != NL && *next != TAB)
            {
                split = Some(i as usize);
            }
            if i >= end {
                if let Some(s) = split {
                    folds.push(s);
                    end = s as isize + end_step as isize;
                    split = None;
                } else if mode == FoldMode::Quoted {
                    while matches!(prev, Some(SP) | Some(TAB)) {
                        prev = Some(ch);
                        i += 1;
                        match t.get(i as usize) {
                            Some(c) => ch = *c,
                            None => break,
                        }
                        overflow = true;
                    }
                    let j = if i > esc_end + 1 {
                        i - 2
                    } else {
                        esc_start - 1
                    };
                    if j < 0 || escaped_folds.contains(&(j as usize)) {
                        return (text.to_string(), overflow);
                    }
                    folds.push(j as usize);
                    escaped_folds.insert(j as usize);
                    end = j + end_step as isize;
                    split = None;
                } else {
                    overflow = true;
                }
            }
        }
        prev = Some(ch);
    }

    if folds.is_empty() {
        return (text.to_string(), overflow);
    }

    let mut res: Vec<u16> = t[..folds[0]].to_vec();
    for k in 0..folds.len() {
        let fold = folds[k];
        let stop = folds.get(k + 1).copied().unwrap_or(t.len());
        if fold == 0 {
            res = Vec::new();
            res.push(NL);
            res.extend_from_slice(&ind);
            res.extend_from_slice(&t[..stop]);
        } else {
            if mode == FoldMode::Quoted && escaped_folds.contains(&fold) {
                res.push(t[fold]);
                res.push(BSLASH);
            }
            res.push(NL);
            res.extend_from_slice(&ind);
            res.extend_from_slice(&t[fold + 1..stop]);
        }
    }
    (String::from_utf16_lossy(&res), overflow)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::value::{Mapping, Value};

    fn m(pairs: Vec<(&str, Value)>) -> Value {
        let mut map = Mapping::new();
        for (k, v) in pairs {
            map.insert(k, v);
        }
        Value::Map(map)
    }
    fn s(x: &str) -> Value {
        Value::Str(x.to_string())
    }

    /// Every `expected` here was produced by running
    /// `YAML.stringify(input, { lineWidth })` against `yaml@2.9.0`. They are
    /// asserted
    /// byte-for-byte on purpose — see the module docs for what drifts if
    /// they stop matching.
    #[test]
    fn scalars_match_js_yaml_byte_for_byte() {
        let v = m(vec![
            ("a", Value::Int(1)),
            ("b", Value::Bool(true)),
            ("c", Value::Null),
            ("d", s("plain")),
            ("e", s("")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "a: 1\nb: true\nc: null\nd: plain\ne: \"\"\n"
        );
    }

    #[test]
    fn numbers_match_js_yaml_byte_for_byte() {
        let v = m(vec![
            ("i", Value::Int(42)),
            ("neg", Value::Int(-7)),
            ("f", Value::Float(1.5)),
            ("zero", Value::Int(0)),
            ("big", Value::Float(1e21)),
            ("small", Value::Float(0.000001)),
            ("nan", Value::Float(f64::NAN)),
            ("inf", Value::Float(f64::INFINITY)),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "i: 42\nneg: -7\nf: 1.5\nzero: 0\nbig: 1e+21\nsmall: 0.000001\nnan: .nan\ninf: .inf\n"
        );
    }

    #[test]
    fn quoting_decisions_match_js_yaml() {
        let v = m(vec![
            ("colon", s("a: b")),
            ("hash", s("a #b")),
            ("at", s("@foo")),
            ("star", s("*foo")),
            ("amp", s("&foo")),
            ("pct", s("%foo")),
            ("bang", s("!foo")),
            ("gt", s(">foo")),
            ("pipe", s("|foo")),
            ("q", s("?foo")),
            ("dash", s("-foo")),
            ("dashword", s("-foo bar")),
            ("brace", s("{foo}")),
            ("brack", s("[foo]")),
            ("comma", s("a,b")),
            ("quote", s("it's")),
            ("dquote", s("say \"hi\"")),
            ("bslash", s("a\\b")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "colon: \"a: b\"\nhash: \"a #b\"\nat: \"@foo\"\nstar: \"*foo\"\namp: \"&foo\"\n\
             pct: \"%foo\"\nbang: \"!foo\"\ngt: \">foo\"\npipe: \"|foo\"\nq: ?foo\ndash: -foo\n\
             dashword: -foo bar\nbrace: \"{foo}\"\nbrack: \"[foo]\"\ncomma: a,b\nquote: it's\n\
             dquote: say \"hi\"\nbslash: a\\b\n"
        );
    }

    #[test]
    fn reserved_words_are_quoted_but_yaml11_booleans_are_not() {
        // `yes`/`no`/`on`/`off` are NOT booleans in the YAML 1.2 core schema,
        // so `yaml@2` leaves them plain. A serializer that quotes them (many
        // do) would churn every note that has `draft: no` in frontmatter.
        let v = m(vec![
            ("t", s("true")),
            ("f", s("false")),
            ("n", s("null")),
            ("tilde", s("~")),
            ("y", s("yes")),
            ("no", s("no")),
            ("on", s("on")),
            ("off", s("off")),
            ("num", s("123")),
            ("numf", s("1.5")),
            ("empty", s("")),
            ("space", s(" lead")),
            ("trail", s("trail ")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "t: \"true\"\nf: \"false\"\nn: \"null\"\ntilde: \"~\"\ny: yes\nno: no\non: on\n\
             off: off\nnum: \"123\"\nnumf: \"1.5\"\nempty: \"\"\nspace: \" lead\"\n\
             trail: \"trail \"\n"
        );
    }

    #[test]
    fn multiline_strings_become_literal_blocks() {
        let v = m(vec![
            ("block", s("line1\nline2\n")),
            ("noTrail", s("line1\nline2")),
            ("trailingWs", s("line1 \nline2\n")),
            ("embedded", s("a\n\nb\n")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "block: |\n  line1\n  line2\nnoTrail: |-\n  line1\n  line2\n\
             trailingWs: |\n  line1 \n  line2\nembedded: |\n  a\n\n  b\n"
        );
    }

    #[test]
    fn block_scalar_chomping_and_indent_indicators() {
        let v = m(vec![
            ("onlyNl", s("\n")),
            ("twoNl", s("\n\n")),
            ("leadSpace", s("  indented\nnext\n")),
            ("tabLine", s("\tx\ny\n")),
            ("endSpace", s("a\nb \n")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "onlyNl: |+\n  \ntwoNl: |+\n  \n\nleadSpace: |2\n    indented\n  next\n\
             tabLine: |\n  \tx\n  y\nendSpace: |\n  a\n  b \n"
        );
    }

    #[test]
    fn nested_collections_indent_like_js_yaml() {
        let v = m(vec![
            ("kind", s("workflow")),
            ("id", s("w1")),
            (
                "steps",
                Value::Seq(vec![
                    m(vec![
                        ("id", s("s1")),
                        ("title", s("One")),
                        ("type", s("manual")),
                    ]),
                    m(vec![
                        ("id", s("s2")),
                        ("title", s("Two")),
                        ("type", s("auto")),
                        ("ref", s("x/y.md")),
                    ]),
                ]),
            ),
            (
                "edges",
                Value::Seq(vec![m(vec![("from", s("s1")), ("to", s("s2"))])]),
            ),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "kind: workflow\nid: w1\nsteps:\n  - id: s1\n    title: One\n    type: manual\n  \
             - id: s2\n    title: Two\n    type: auto\n    ref: x/y.md\nedges:\n  - from: s1\n    to: s2\n"
        );
    }

    #[test]
    fn empty_collections_stay_inline() {
        let v = m(vec![
            ("m", Value::Map(Mapping::new())),
            ("s", Value::Seq(vec![])),
            (
                "nested",
                m(vec![
                    ("a", Value::Map(Mapping::new())),
                    ("b", Value::Seq(vec![])),
                ]),
            ),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "m: {}\ns: []\nnested:\n  a: {}\n  b: []\n"
        );
    }

    #[test]
    fn nested_sequences_and_deep_maps() {
        let v = m(vec![
            (
                "m",
                Value::Seq(vec![
                    Value::Seq(vec![Value::Int(1), Value::Int(2)]),
                    Value::Seq(vec![Value::Int(3), Value::Int(4)]),
                ]),
            ),
            (
                "deep",
                Value::Seq(vec![m(vec![(
                    "x",
                    Value::Seq(vec![Value::Int(1), Value::Int(2)]),
                )])]),
            ),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "m:\n  - - 1\n    - 2\n  - - 3\n    - 4\ndeep:\n  - x:\n      - 1\n      - 2\n"
        );
    }

    #[test]
    fn unicode_keys_and_values_stay_plain() {
        let v = m(vec![
            ("ключ", s("значение")),
            ("emoji", s("🎉 party")),
            ("accents", s("café")),
            ("zh", s("中文")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "ключ: значение\nemoji: 🎉 party\naccents: café\nzh: 中文\n"
        );
    }

    #[test]
    fn document_marker_prefixes_stay_plain_when_indented() {
        let v = m(vec![
            ("a", s("- item")),
            ("b", s(": value")),
            ("c", s("# comment")),
            ("d", s("- ")),
            ("e", s("a - b")),
            ("f", s("--- x")),
            ("g", s("...")),
            ("h", s("...x")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "a: \"- item\"\nb: \": value\"\nc: \"# comment\"\nd: \"- \"\ne: a - b\nf: --- x\n\
             g: ...\nh: ...x\n"
        );
    }

    #[test]
    fn control_characters_force_double_quotes() {
        let v = m(vec![
            ("tab", s("a\tb")),
            ("nul", s("a\u{0}b")),
            ("esc", s("a\u{1b}b")),
            ("cr", s("a\rb")),
            ("crlf", s("a\r\nb")),
            ("nbsp", s("a\u{a0}b")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "tab: a\tb\nnul: \"a\\0b\"\nesc: \"a\\eb\"\ncr: \"a\\rb\"\ncrlf: \"a\\r\\nb\"\n\
             nbsp: a\u{a0}b\n"
        );
    }

    #[test]
    fn roots_that_are_not_maps() {
        assert_eq!(
            render_value(
                &Value::Seq(vec![s("a"), s("b"), m(vec![("c", s("d"))])]),
                EmitOptions::line_width_0()
            )
            .unwrap(),
            "- a\n- b\n- c: d\n"
        );
        assert_eq!(
            render_value(&s("just a string"), EmitOptions::line_width_0()).unwrap(),
            "just a string\n"
        );
        assert_eq!(
            render_value(&Value::Map(Mapping::new()), EmitOptions::line_width_0()).unwrap(),
            "{}\n"
        );
        assert_eq!(
            render_value(&Value::Seq(vec![]), EmitOptions::line_width_0()).unwrap(),
            "[]\n"
        );
        assert_eq!(
            render_value(&Value::Null, EmitOptions::line_width_0()).unwrap(),
            "null\n"
        );
    }

    #[test]
    fn line_width_0_never_folds() {
        let long = "the quick brown fox jumps over the lazy dog and keeps running far past the \
                    end of the line to force wrapping behaviour indeed it does keep going for \
                    quite a while longer";
        let v = m(vec![("s", s(long))]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            format!("s: {long}\n")
        );
    }

    #[test]
    fn line_width_120_folds_where_js_yaml_folds() {
        let long = "the quick brown fox jumps over the lazy dog and keeps running far past the \
                    end of the line to force wrapping behaviour indeed it does keep going for \
                    quite a while longer";
        assert_eq!(
            render_value(&m(vec![("s", s(long))]), EmitOptions::line_width_120()).unwrap(),
            "s: the quick brown fox jumps over the lazy dog and keeps running far past the end \
             of the line to force wrapping\n  behaviour indeed it does keep going for quite a \
             while longer\n"
        );
        // Nested: the continuation indent grows, but the FOLD POINT does not
        // move — `yaml@2` measures `indentAtStart` from the key text alone.
        assert_eq!(
            render_value(
                &m(vec![("a", m(vec![("b", m(vec![("s", s(long))]))]))]),
                EmitOptions::line_width_120()
            )
            .unwrap(),
            "a:\n  b:\n    s: the quick brown fox jumps over the lazy dog and keeps running far \
             past the end of the line to force wrapping\n      behaviour indeed it does keep \
             going for quite a while longer\n"
        );
        // Inside a sequence the continuation indent is the item indent.
        assert_eq!(
            render_value(
                &m(vec![("items", Value::Seq(vec![s(long)]))]),
                EmitOptions::line_width_120()
            )
            .unwrap(),
            "items:\n  - the quick brown fox jumps over the lazy dog and keeps running far past \
             the end of the line to force wrapping\n    behaviour indeed it does keep going for \
             quite a while longer\n"
        );
    }

    #[test]
    fn folding_counts_utf16_units_not_bytes() {
        let v = m(vec![("s", s(&"ключ ".repeat(40)))]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_120()).unwrap(),
            "s: \"ключ ключ ключ ключ ключ ключ ключ ключ ключ ключ ключ ключ ключ ключ ключ \
             ключ ключ ключ ключ ключ ключ ключ ключ\n  ключ ключ ключ ключ ключ ключ ключ ключ \
             ключ ключ ключ ключ ключ ключ ключ ключ ключ \"\n"
        );
    }

    #[test]
    fn double_quoted_values_fold_too() {
        let v = m(vec![("s", s(&format!("a\"b'c {}", "word ".repeat(40))))]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_120()).unwrap(),
            "s: \"a\\\"b'c word word word word word word word word word word word word word word \
             word word word word word word word word\n  word word word word word word word word \
             word word word word word word word word word word \"\n"
        );
    }

    #[test]
    fn a_long_unbreakable_line_falls_back_to_a_literal_block() {
        // `yaml@2` tries `>`, finds no space to fold on, and reverts to `|`.
        let v = m(vec![(
            "s",
            s(&format!("{}\nsecond line\n", "x".repeat(150))),
        )]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_120()).unwrap(),
            format!("s: |\n  {}\n  second line\n", "x".repeat(150))
        );
    }

    #[test]
    fn a_foldable_over_long_block_line_errors_rather_than_guessing() {
        let v = m(vec![("s", s(&format!("{}\nsecond\n", "word ".repeat(40))))]);
        let err = render_value(&v, EmitOptions::line_width_120()).unwrap_err();
        assert!(matches!(err, RenderError::FoldedBlockUnsupported { .. }));
        // …and the same value is fine at lineWidth 0.
        assert!(render_value(&v, EmitOptions::line_width_0()).is_ok());
    }

    #[test]
    fn graph_view_minimal_spec_shape() {
        let v = m(vec![
            ("kind", s("graph-view")),
            ("filter", m(vec![("tags", Value::Seq(vec![s("x")]))])),
            ("layout", m(vec![("charge", Value::Int(-300))])),
            ("label", s("My View")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_120()).unwrap(),
            "kind: graph-view\nfilter:\n  tags:\n    - x\nlayout:\n  charge: -300\nlabel: My View\n"
        );
    }

    #[test]
    fn keys_get_quoted_on_the_same_rules_as_values() {
        let v = m(vec![
            ("a: b", Value::Int(1)),
            ("# k", Value::Int(2)),
            ("- k", Value::Int(3)),
            ("", Value::Int(4)),
            ("true", Value::Int(5)),
            ("1", Value::Int(6)),
            ("k ", Value::Int(7)),
            (" k", Value::Int(8)),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "\"a: b\": 1\n\"# k\": 2\n\"- k\": 3\n\"\": 4\n\"true\": 5\n\"1\": 6\n\"k \": 7\n\" k\": 8\n"
        );
    }

    #[test]
    fn block_scalars_nest_inside_sequences_and_maps() {
        assert_eq!(
            render_value(
                &m(vec![(
                    "steps",
                    Value::Seq(vec![s("line1\nline2\n"), s("plain")])
                )]),
                EmitOptions::line_width_0()
            )
            .unwrap(),
            "steps:\n  - |\n    line1\n    line2\n  - plain\n"
        );
        assert_eq!(
            render_value(
                &m(vec![("a", m(vec![("b", s("x\ny\n"))]))]),
                EmitOptions::line_width_0()
            )
            .unwrap(),
            "a:\n  b: |\n    x\n    y\n"
        );
        assert_eq!(
            render_value(
                &m(vec![
                    ("desc", s("para one\n\npara two\n")),
                    ("tags", Value::Seq(vec![s("a")])),
                ]),
                EmitOptions::line_width_0()
            )
            .unwrap(),
            "desc: |\n  para one\n\n  para two\ntags:\n  - a\n"
        );
    }

    #[test]
    fn sequence_items_are_quoted_on_the_same_rules_as_values() {
        let v = m(vec![(
            "l",
            Value::Seq(vec![
                s("- dash"),
                s("#hash"),
                s("plain"),
                s(""),
                s("null"),
                s("123"),
            ]),
        )]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "l:\n  - \"- dash\"\n  - \"#hash\"\n  - plain\n  - \"\"\n  - \"null\"\n  - \"123\"\n"
        );
    }

    #[test]
    fn strings_that_would_reparse_as_numbers_are_quoted() {
        let v = m(vec![
            ("a", s("0x1f")),
            ("b", s("0o17")),
            ("c", s("1e5")),
            ("d", s(".5")),
            ("e", s("5.")),
            ("f", s("+3")),
            ("g", s("-0")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "a: \"0x1f\"\nb: \"0o17\"\nc: \"1e5\"\nd: \".5\"\ne: \"5.\"\nf: \"+3\"\ng: \"-0\"\n"
        );
    }

    #[test]
    fn lone_indicator_characters_are_quoted_but_pairs_are_not() {
        let v = m(vec![
            ("a", s("-")),
            ("b", s("?")),
            ("c", s(":")),
            ("d", s("--")),
            ("e", s("?x")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "a: \"-\"\nb: \"?\"\nc: \":\"\nd: --\ne: ?x\n"
        );
    }

    #[test]
    fn colons_only_force_quotes_when_followed_by_a_space_or_at_the_end() {
        let v = m(vec![
            ("a", s("ends with colon:")),
            ("b", s("a:b:c")),
            ("c", s("x: ")),
            ("d", s("tab\tinside")),
        ]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "a: \"ends with colon:\"\nb: a:b:c\nc: \"x: \"\nd: tab\tinside\n"
        );
    }

    #[test]
    fn empty_and_whitespace_strings_in_sequences() {
        let v = m(vec![("l", Value::Seq(vec![s(""), s(" "), s("  ")]))]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "l:\n  - \"\"\n  - \" \"\n  - \"  \"\n"
        );
        assert_eq!(
            render_value(
                &m(vec![(
                    "a",
                    Value::Seq(vec![Value::Map(Mapping::new()), Value::Seq(vec![])])
                )]),
                EmitOptions::line_width_0()
            )
            .unwrap(),
            "a:\n  - {}\n  - []\n"
        );
        assert_eq!(
            render_value(
                &m(vec![(
                    "a",
                    Value::Seq(vec![Value::Seq(vec![m(vec![("b", Value::Int(1))])])])
                )]),
                EmitOptions::line_width_0()
            )
            .unwrap(),
            "a:\n  - - b: 1\n"
        );
    }

    #[test]
    fn yaml_11_booleans_stay_plain_inside_sequences_too() {
        let v = m(vec![(
            "l",
            Value::Seq(vec![
                s("yes"),
                s("no"),
                s("True"),
                s("off"),
                s("~"),
                s("Null"),
            ]),
        )]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_0()).unwrap(),
            "l:\n  - yes\n  - no\n  - \"True\"\n  - off\n  - \"~\"\n  - \"Null\"\n"
        );
    }

    #[test]
    fn folding_respects_the_early_return_at_the_boundary() {
        // A value one character either side of the fold threshold. `yaml@2`
        // returns early when the text fits `endStep`, so none of these fold
        // even though two of them exceed `lineWidth` once the key is counted.
        for n in [114usize, 115, 116] {
            let value = format!("{} b", "a".repeat(n));
            assert_eq!(
                render_value(&m(vec![("s", s(&value))]), EmitOptions::line_width_120()).unwrap(),
                format!("s: {value}\n"),
                "n={n}"
            );
        }
    }

    #[test]
    fn a_scalar_deep_in_a_sequence_folds_at_the_item_indent() {
        let value = format!("{} {} tail", "x".repeat(60), "y".repeat(60));
        let v = m(vec![("a", m(vec![("b", Value::Seq(vec![s(&value)]))]))]);
        assert_eq!(
            render_value(&v, EmitOptions::line_width_120()).unwrap(),
            format!(
                "a:\n  b:\n    - {}\n      {} tail\n",
                "x".repeat(60),
                "y".repeat(60)
            )
        );
    }
}
