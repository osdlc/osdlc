//! YAML parsing that keeps byte spans. The splice needs them to replace one
//! value and keep every other byte.
//!
//! `serde_yaml` drops the source text once it has a value, so it cannot say
//! which bytes were the value of `status:`. Without that, the only way to
//! change one key is to reserialize the whole block, which loses comments, key
//! order and quoting style. `saphyr-parser` keeps a [`Span`] per event, so the
//! splice can replace exactly the bytes of one value and leave every other
//! byte of the file untouched.
//!
//! One pass produces both:
//!
//! - a [`Value`] tree, for reads and comparisons, and
//! - [`KeySpan`]s for the top-level mapping, for the splice.
//!
//! Malformed YAML is an `Err` here.
//!
//! **Stability:** unstable. The items in this module may change in any 0.x
//! minor release.
//!
//! # Agreement with the npm `yaml` package
//!
//! The reader agrees with the npm `yaml` package, version 2 (`yaml@2`, the
//! common JavaScript YAML library), about what a document means. The
//! expected values in the tests were captured from `yaml@2.9.0`. Three
//! constructs need care:
//!
//! ## Aliases are resolved
//!
//! An alias is replaced by a copy of its anchored value, so `layout:\n  s: *pos`
//! reads as the value anchored at `pos`, not as null.
//!
//! Two hostile shapes are refused rather than resolved, because this value
//! model is a tree while `yaml@2`'s is a graph:
//!
//! - **Recursive aliases** (`&x [*x]`) are legal YAML and `saphyr` emits them.
//!   `yaml@2` builds a circular object, which its own `JSON.stringify` then
//!   throws on, so there is no round-trip behaviour to match. A tree cannot
//!   hold the cycle at all, so this is [`ParseError::Syntax`].
//! - **Alias bombs** (`&a [x,x]` / `&b [*a,*a]` / …) cost `yaml@2` nothing
//!   because it aliases by reference; copying makes them exponential. A total
//!   expansion budget of 10,000 nodes bounds the work, and a document over it
//!   is [`ParseError::Syntax`].
//!
//! Forward references (`*pos` before `&pos`) never reach the builder:
//! `saphyr` rejects them at the event stage, as `yaml@2` does.
//!
//! ## Explicit tags are honoured, for a documented subset
//!
//! `title: !!str 2024` reads as the string `"2024"`, as in `yaml@2`. The
//! scalar tags `!!str`, `!!int`, `!!float`, `!!bool` and `!!null` are
//! honoured, and any local tag (`!foo`) reads as a string. `!!binary`,
//! `!!timestamp` and every tag on a collection are ignored, so the value
//! resolves by its spelling; `yaml@2` ignores tags on collections too.
//!
//! ## Duplicate keys are reported, not raised
//!
//! `yaml@2` throws `Map keys must be unique`. The default entry points
//! here ([`parse`], [`parse_mapping`], [`parse_with_spans`]) do not: the last
//! value wins, and the duplicates are listed in [`Parsed::duplicate_keys`].
//! [`parse_strict`], [`parse_mapping_strict`] and [`parse_with_spans_strict`]
//! fail with [`ParseError::DuplicateKey`] instead.
//!
//! The lenient default is on purpose. A caller that treats any parse error as
//! "no spans, regenerate the whole block" would, on a duplicate key, take the
//! one path that drops every comment in the file. A caller that counts
//! duplicates itself needs a successful parse to compare against.
//!
//! The report compares the resolved key, before [`Mapping`] turns it into
//! a string, which is `yaml@2`'s rule. `a:`/`'a':` collide and `~:`/`null:`
//! collide; `1:`/`'1':` and `true:`/`'true':` do not.

use saphyr_parser::{Event, Parser, ScalarStyle, Span};

use crate::value::{Mapping, Value};

/// How many `Value` nodes an entire document is allowed to materialise by
/// expanding aliases.
///
/// `yaml@2` aliases by reference, so `&a [x,x] / &b [*a,*a] / [*b,*b]`
/// costs it nothing. This module builds a tree and so copies each alias. The
/// same document then takes exponential memory (the billion-laughs attack).
/// Real frontmatter is far below this limit (a few hundred nodes, usually
/// with no aliases at all), so a fixed budget stops hostile input and costs
/// ordinary documents nothing.
const MAX_ALIAS_EXPANSION_NODES: usize = 10_000;

/// Why a document could not be parsed.
///
/// New variants may be added in a minor release, so a `match` needs a
/// wildcard arm.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum ParseError {
    /// The text is not well-formed YAML, or an alias is recursive or expands
    /// past the budget.
    #[error("yaml parse error: {0}")]
    Syntax(String),
    /// [`parse_mapping`] or [`parse_mapping_strict`] found a root that is not
    /// a mapping: `"a scalar"` or `"a sequence"`.
    #[error("expected a yaml mapping at the top level, found {0}")]
    NotAMapping(&'static str),
    /// A key appears twice in one mapping. Only the `_strict` functions return
    /// it. The message matches `yaml@2`'s own error text.
    #[error("Map keys must be unique (duplicate key {0:?})")]
    DuplicateKey(String),
}

/// A top-level key and the byte ranges around its value in the source.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub struct KeySpan {
    /// The key, decoded (quotes removed, escapes resolved).
    pub key: String,
    /// Byte range of the key token itself.
    pub key_range: std::ops::Range<usize>,
    /// Byte offset just past the `:` that assigns this key.
    ///
    /// The splice replaces from here, not from `value_range.start`, because
    /// the whitespace in between is part of the layout decision: a scalar
    /// wants `key: v` and a block collection wants `key:\n  - v`, and only a
    /// range that owns the separator can change one into the other.
    pub assign_end: usize,
    /// Byte range of the value alone, with the trailing newline and any
    /// trailing comment excluded. Empty (start == end) when the key has no
    /// value (`key:`).
    pub value_range: std::ops::Range<usize>,
}

/// A parsed document: the value tree plus the top-level spans.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct Parsed {
    /// The document's value. An empty or comments-only document is
    /// [`Value::Null`].
    pub root: Value,
    /// One entry per top-level key, in source order. Empty when the root is
    /// not a mapping.
    pub top_level: Vec<KeySpan>,
    /// Keys that appeared more than once in the same mapping, at any depth,
    /// in source order: the documents `yaml@2` refuses to load.
    ///
    /// Reported rather than raised; see the module docs under "Duplicate keys
    /// are reported, not raised". [`parse_strict`] and [`parse_mapping_strict`]
    /// fail instead.
    ///
    /// The comparison is on the resolved key, before it is turned into a
    /// [`Mapping`] string key: `a:`/`'a':` collide and `~:`/`null:` collide,
    /// but `1:`/`'1':` and `true:`/`'true':` do not.
    pub duplicate_keys: Vec<String>,
}

/// Parses a YAML document and keeps the top-level spans.
///
/// # Errors
///
/// [`ParseError::Syntax`] when the text is not well-formed YAML.
pub fn parse_with_spans(src: &str) -> Result<Parsed, ParseError> {
    parse_with_spans_inner(src, false)
}

/// [`parse_with_spans`], but a duplicate key is [`ParseError::DuplicateKey`].
///
/// # Errors
///
/// [`ParseError::Syntax`] or [`ParseError::DuplicateKey`].
pub fn parse_with_spans_strict(src: &str) -> Result<Parsed, ParseError> {
    parse_with_spans_inner(src, true)
}

fn parse_with_spans_inner(src: &str, strict: bool) -> Result<Parsed, ParseError> {
    let events = collect_events(src)?;
    let mut builder = Builder::new(&events, strict);
    let root = builder.build_document()?;
    let top_level = match &root {
        Value::Map(_) => top_level_spans(&events, src),
        _ => Vec::new(),
    };
    Ok(Parsed {
        root,
        top_level,
        duplicate_keys: builder.duplicate_keys,
    })
}

/// Parses a YAML document into a [`Value`], without spans.
///
/// ```
/// use yaml_splice::{Value, parse::parse};
///
/// let v = parse("title: !!str 2024\ntags: [a, b]\n")?;
/// let m = v.as_mapping().unwrap();
/// assert_eq!(m.get("title"), Some(&Value::from("2024")));
/// # Ok::<(), yaml_splice::parse::ParseError>(())
/// ```
///
/// # Errors
///
/// [`ParseError::Syntax`] when the text is not well-formed YAML.
pub fn parse(src: &str) -> Result<Value, ParseError> {
    Ok(parse_with_spans(src)?.root)
}

/// [`parse`], but a duplicate key is [`ParseError::DuplicateKey`], as in
/// `yaml@2`, for callers that would rather refuse a document than read one
/// where a key was silently overwritten.
///
/// # Errors
///
/// [`ParseError::Syntax`] or [`ParseError::DuplicateKey`].
pub fn parse_strict(src: &str) -> Result<Value, ParseError> {
    Ok(parse_with_spans_strict(src)?.root)
}

/// Parses a document whose root must be a mapping, the shape frontmatter
/// always has. An empty document is an empty mapping.
///
/// # Errors
///
/// [`ParseError::Syntax`], or [`ParseError::NotAMapping`] when the root is a
/// scalar or a sequence.
pub fn parse_mapping(src: &str) -> Result<Mapping, ParseError> {
    require_mapping(parse(src)?)
}

/// [`parse_mapping`], but a duplicate key is [`ParseError::DuplicateKey`].
///
/// # Errors
///
/// [`ParseError::Syntax`], [`ParseError::NotAMapping`] or
/// [`ParseError::DuplicateKey`].
pub fn parse_mapping_strict(src: &str) -> Result<Mapping, ParseError> {
    require_mapping(parse_strict(src)?)
}

fn require_mapping(v: Value) -> Result<Mapping, ParseError> {
    match v {
        Value::Map(m) => Ok(m),
        Value::Null => Ok(Mapping::new()),
        Value::Seq(_) => Err(ParseError::NotAMapping("a sequence")),
        _ => Err(ParseError::NotAMapping("a scalar")),
    }
}

#[derive(Debug, Clone)]
struct Ev {
    kind: EvKind,
    span: Span,
}

#[derive(Debug, Clone)]
enum EvKind {
    /// Text, style, anchor id (0 = none), explicit tag.
    Scalar(String, ScalarStyle, usize, Option<TagKind>),
    /// `*anchor`, carrying the id of the anchor it refers to.
    Alias(usize),
    SeqStart(usize),
    SeqEnd,
    MapStart(usize),
    MapEnd,
    Other,
}

/// What an explicit tag means for scalar resolution.
///
/// # Which tags are honoured
///
/// The `yaml@2` column was observed on `yaml@2.9.0`, not assumed.
///
/// | tag | `yaml@2` | here |
/// |---|---|---|
/// | `!!str` | raw text as a string | [`TagKind::Str`] |
/// | `!!int` | integer, else the raw text | [`TagKind::Int`] |
/// | `!!float` | float, else the raw text | [`TagKind::Float`] |
/// | `!!bool` | boolean, else the raw text | [`TagKind::Bool`] |
/// | `!!null` | null, else the raw text | [`TagKind::Null`] |
/// | `!foo`, `!<verbatim>` | the raw text as a string (warns) | [`TagKind::Str`] |
/// | `!!binary`, `!!timestamp` | `Buffer` / `Date` | not honoured: [`TagKind::Ignored`] |
/// | any tag on a seq or a map | ignored | ignored |
///
/// The two deliberate gaps are `!!binary` and `!!timestamp`: this value model
/// has no variant for a byte string or an instant, so honouring them would
/// mean inventing a representation the canonical emitter could not write back.
/// They fall through to spelling-based resolution.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TagKind {
    Str,
    Int,
    Float,
    Bool,
    Null,
    /// Recognised but not representable here; resolve by spelling instead.
    Ignored,
}

impl TagKind {
    fn from_tag(tag: &saphyr_parser::Tag) -> TagKind {
        if !tag.is_yaml_core_schema() {
            // `yaml@2` cannot resolve a local or verbatim tag either, and its
            // fallback is the unresolved string: `!foo 42` is "42", not 42.
            return TagKind::Str;
        }
        match tag.suffix.as_str() {
            "str" => TagKind::Str,
            "int" => TagKind::Int,
            "float" => TagKind::Float,
            "bool" => TagKind::Bool,
            "null" => TagKind::Null,
            _ => TagKind::Ignored,
        }
    }
}

fn collect_events(src: &str) -> Result<Vec<Ev>, ParseError> {
    let mut out = Vec::new();
    for item in Parser::new_from_str(src) {
        let (event, span) = item.map_err(|e| ParseError::Syntax(e.to_string()))?;
        let kind = match event {
            Event::Scalar(v, style, anchor, tag) => EvKind::Scalar(
                v.into_owned(),
                style,
                anchor,
                tag.as_deref().map(TagKind::from_tag),
            ),
            Event::Alias(id) => EvKind::Alias(id),
            // A tag on a collection is dropped on purpose: `yaml@2` ignores it
            // too (`!!str [1,2]` is still the array), and `!!seq`/`!!map` are
            // already what the events say.
            Event::SequenceStart(anchor, _) => EvKind::SeqStart(anchor),
            Event::SequenceEnd => EvKind::SeqEnd,
            Event::MappingStart(anchor, _) => EvKind::MapStart(anchor),
            Event::MappingEnd => EvKind::MapEnd,
            _ => EvKind::Other,
        };
        out.push(Ev { kind, span });
    }
    Ok(out)
}

/// Resolve a scalar, honouring an explicit tag when there is one.
///
/// A tag beats both the spelling and the quoting: `!!int '42'` is the integer
/// 42 in `yaml@2` even though a quoted scalar is otherwise always a string, and
/// `!!str 2024` is the string `"2024"` even though the spelling says integer.
/// A tag that does not fit its value is not an error. `yaml@2` warns and yields
/// the raw text, so every typed arm falls back to [`Value::Str`].
fn resolve_scalar(text: &str, style: ScalarStyle, tag: Option<TagKind>) -> Value {
    let as_str = || Value::Str(text.to_string());
    match tag {
        Some(TagKind::Str) => return as_str(),
        Some(TagKind::Int) => return parse_int(text).map_or_else(as_str, Value::Int),
        Some(TagKind::Float) => return parse_float(text).map_or_else(as_str, Value::Float),
        Some(TagKind::Bool) => {
            return match text {
                "true" | "True" | "TRUE" => Value::Bool(true),
                "false" | "False" | "FALSE" => Value::Bool(false),
                _ => as_str(),
            };
        }
        Some(TagKind::Null) => {
            return match text {
                "" | "~" | "null" | "Null" | "NULL" => Value::Null,
                _ => as_str(),
            };
        }
        // `!!binary` / `!!timestamp` and every tag on a collection: fall
        // through to the untagged rules. See [`TagKind`] for why.
        Some(TagKind::Ignored) | None => {}
    }
    resolve_plain(text, style)
}

/// YAML 1.2 core-schema resolution for an untagged scalar. A quoted scalar is
/// always a string, which is why the style is part of the decision — getting
/// this backwards is how `version: "1.0"` silently becomes the float `1`.
fn resolve_plain(text: &str, style: ScalarStyle) -> Value {
    if style != ScalarStyle::Plain {
        return Value::Str(text.to_string());
    }
    match text {
        "" | "~" | "null" | "Null" | "NULL" => return Value::Null,
        "true" | "True" | "TRUE" => return Value::Bool(true),
        "false" | "False" | "FALSE" => return Value::Bool(false),
        _ => {}
    }
    if let Some(i) = parse_int(text) {
        return Value::Int(i);
    }
    if let Some(f) = parse_float(text).or_else(|| parse_wide_radix_int(text)) {
        return Value::Float(f);
    }
    Value::Str(text.to_string())
}

/// Whether a plain scalar spelled `text` reads back as anything but a string
/// under the core schema. [`render`](crate::render) quotes a string exactly
/// when this holds, so the emitter and this parser share one resolver.
pub(crate) fn plain_is_non_string(text: &str) -> bool {
    !matches!(resolve_plain(text, ScalarStyle::Plain), Value::Str(_))
}

/// Does this top-level [`KeySpan`] address a string key?
///
/// Non-string keys (a plain scalar that resolves to int/float/
/// bool/null, like `123:` or `true:`) are kept untouched but cannot be
/// targeted by the edit API. The stored `KeySpan::key` is the decoded key
/// text, which does not distinguish `1:` (an integer key) from `'1':` (a
/// string key), so the source token is inspected: a quoted token is always a
/// string, and a plain token is a string only if it does not resolve to a
/// scalar of another type.
pub(crate) fn is_string_key(src: &str, span: &KeySpan) -> bool {
    let raw = src[span.key_range.clone()].trim();
    if raw.starts_with('\'') || raw.starts_with('"') {
        return true;
    }
    matches!(resolve_plain(raw, ScalarStyle::Plain), Value::Str(_))
}

/// The integer spellings the core schema accepts: signed decimal, and unsigned
/// `0x` / `0o` (yaml@2 takes no sign on those, so `-0x1F` is a string).
/// Those too wide for `i64` are [`parse_wide_radix_int`]'s.
fn parse_int(text: &str) -> Option<i64> {
    let unsigned = text.strip_prefix(['-', '+']).unwrap_or(text);
    if !unsigned.is_empty()
        && unsigned.bytes().all(|c| c.is_ascii_digit())
        && let Ok(i) = text.parse::<i64>()
    {
        return Some(i);
    }
    for (prefix, radix) in [("0x", 16), ("0o", 8)] {
        let Some(digits) = text.strip_prefix(prefix) else {
            continue;
        };
        // Checked here so `from_str_radix`'s own sign handling (`0x-1`) never runs.
        if digits.is_empty() || !digits.chars().all(|c| c.is_digit(radix)) {
            continue;
        }
        if let Ok(i) = i64::from_str_radix(digits, radix) {
            return Some(i);
        }
    }
    None
}

/// A `0x` / `0o` integer too wide for `i64`, as the nearest `f64`.
///
/// yaml@2 reads such a spelling with `parseInt`, so it is a number there, not
/// a string. Digits past the 128 bits a `u128` holds are dropped and counted
/// as a power of the radix; the radix is a power of two, so scaling is exact.
fn parse_wide_radix_int(text: &str) -> Option<f64> {
    for (prefix, radix) in [("0x", 16u32), ("0o", 8)] {
        let Some(digits) = text.strip_prefix(prefix) else {
            continue;
        };
        if digits.is_empty() || !digits.chars().all(|c| c.is_digit(radix)) {
            continue;
        }
        let mut acc: u128 = 0;
        let mut dropped: i32 = 0;
        for c in digits.chars() {
            let d = u128::from(c.to_digit(radix).unwrap_or(0));
            match acc
                .checked_mul(u128::from(radix))
                .and_then(|a| a.checked_add(d))
            {
                Some(next) if dropped == 0 => acc = next,
                _ => dropped = dropped.saturating_add(1),
            }
        }
        // Rounds to nearest, as `parseInt` does.
        #[allow(clippy::cast_precision_loss)]
        let base = acc as f64;
        return Some(base * f64::from(radix).powi(dropped));
    }
    None
}

/// The float spellings the core schema accepts, `.inf` / `.nan` included.
fn parse_float(text: &str) -> Option<f64> {
    if matches!(text, ".nan" | ".NaN" | ".NAN") {
        return Some(f64::NAN);
    }
    let unsigned = text.strip_prefix(['-', '+']).unwrap_or(text);
    let negative = text.starts_with('-');
    if matches!(unsigned, ".inf" | ".Inf" | ".INF") {
        return Some(if negative {
            f64::NEG_INFINITY
        } else {
            f64::INFINITY
        });
    }
    if looks_like_float(unsigned) {
        return text.parse::<f64>().ok();
    }
    None
}

fn looks_like_float(s: &str) -> bool {
    let (mant, exp) = match s.find(['e', 'E']) {
        Some(i) => (&s[..i], Some(&s[i + 1..])),
        None => (s, None),
    };
    if let Some(exp) = exp {
        let d = exp.strip_prefix(['-', '+']).unwrap_or(exp);
        if d.is_empty() || !d.bytes().all(|c| c.is_ascii_digit()) {
            return false;
        }
    }
    if mant.is_empty() {
        return false;
    }
    let dots = mant.bytes().filter(|c| *c == b'.').count();
    if dots > 1 {
        return false;
    }
    let digits = mant.bytes().filter(|c| c.is_ascii_digit()).count();
    digits > 0 && mant.bytes().all(|c| c.is_ascii_digit() || c == b'.')
}

/// Builds the [`Value`] tree, resolving aliases as it goes.
struct Builder<'a> {
    events: &'a [Ev],
    /// Completed anchor values, keyed by `saphyr`'s anchor id.
    ///
    /// Populated when a node finishes, never before, which is what makes a
    /// recursive alias detectable: `&x [*x]` reaches its `*x` while id `x` is
    /// still absent, and `saphyr` has already rejected the only other way an
    /// id can be missing (a genuine forward reference is
    /// "found unknown anchor" at the event stage). Ids are unique per
    /// definition, so a redefined anchor gets a fresh id and the "latest
    /// definition wins" rule follows from that.
    anchors: Vec<(usize, Value)>,
    /// Remaining node budget for alias expansion; see
    /// [`MAX_ALIAS_EXPANSION_NODES`].
    budget: usize,
    strict: bool,
    duplicate_keys: Vec<String>,
}

impl<'a> Builder<'a> {
    fn new(events: &'a [Ev], strict: bool) -> Self {
        Builder {
            events,
            anchors: Vec::new(),
            budget: MAX_ALIAS_EXPANSION_NODES,
            strict,
            duplicate_keys: Vec::new(),
        }
    }

    fn build_document(&mut self) -> Result<Value, ParseError> {
        let mut i = 0;
        // Skip stream/document preamble.
        while i < self.events.len() && matches!(self.events[i].kind, EvKind::Other) {
            i += 1;
        }
        if i >= self.events.len() {
            return Ok(Value::Null);
        }
        Ok(self.build_node(i)?.0)
    }

    fn build_node(&mut self, i: usize) -> Result<(Value, usize), ParseError> {
        match &self.events[i].kind {
            EvKind::Scalar(text, style, anchor, tag) => {
                let v = resolve_scalar(text, *style, *tag);
                self.record_anchor(*anchor, &v);
                Ok((v, i + 1))
            }
            EvKind::Alias(id) => Ok((self.resolve_alias(*id)?, i + 1)),
            EvKind::SeqStart(anchor) => {
                let anchor = *anchor;
                let mut items = Vec::new();
                let mut j = i + 1;
                while j < self.events.len() && !matches!(self.events[j].kind, EvKind::SeqEnd) {
                    let (v, next) = self.build_node(j)?;
                    items.push(v);
                    j = next;
                }
                let v = Value::Seq(items);
                self.record_anchor(anchor, &v);
                Ok((v, j + 1))
            }
            EvKind::MapStart(anchor) => {
                let anchor = *anchor;
                let mut map = Mapping::new();
                // Resolved keys, kept unstringified so duplicate detection can
                // use `yaml@2`'s rule rather than this module's storage rule.
                let mut seen: Vec<Value> = Vec::new();
                let mut j = i + 1;
                while j < self.events.len() && !matches!(self.events[j].kind, EvKind::MapEnd) {
                    let (k, after_key) = self.build_node(j)?;
                    let (v, after_val) = self.build_node(after_key)?;
                    // Non-string keys are stringified: frontmatter has no use
                    // for complex keys, and dropping them would lose data
                    // silently. This is a separate collapse from the one
                    // above: `1:` and `'1':` are distinct keys to `yaml@2` and to
                    // `seen`, and only become one entry here.
                    let key = match &k {
                        Value::Str(s) => s.clone(),
                        other => other.to_string(),
                    };
                    if seen.contains(&k) {
                        if self.strict {
                            return Err(ParseError::DuplicateKey(key));
                        }
                        self.duplicate_keys.push(key.clone());
                    } else {
                        seen.push(k);
                    }
                    map.insert(key, v);
                    j = after_val;
                }
                let v = Value::Map(map);
                self.record_anchor(anchor, &v);
                Ok((v, j + 1))
            }
            _ => Ok((Value::Null, i + 1)),
        }
    }

    fn record_anchor(&mut self, anchor: usize, value: &Value) {
        // 0 is `saphyr`'s "no anchor"; real ids start at 1.
        if anchor != 0 {
            self.anchors.push((anchor, value.clone()));
        }
    }

    fn resolve_alias(&mut self, id: usize) -> Result<Value, ParseError> {
        let Some((_, value)) = self.anchors.iter().find(|(a, _)| *a == id) else {
            return Err(ParseError::Syntax(
                "recursive yaml alias: an anchor cannot contain an alias to itself".to_string(),
            ));
        };
        // Charge the budget before cloning, so a bomb is refused rather than
        // materialised and then complained about. The stored value is itself
        // budget-bounded, which keeps this count cheap.
        let cost = count_nodes(value);
        let Some(remaining) = self.budget.checked_sub(cost) else {
            return Err(ParseError::Syntax(format!(
                "yaml alias expansion exceeded {MAX_ALIAS_EXPANSION_NODES} nodes"
            )));
        };
        self.budget = remaining;
        Ok(value.clone())
    }
}

fn count_nodes(v: &Value) -> usize {
    match v {
        Value::Seq(items) => 1 + items.iter().map(count_nodes).sum::<usize>(),
        Value::Map(m) => 1 + m.iter().map(|(_, v)| count_nodes(v)).sum::<usize>(),
        _ => 1,
    }
}

/// Advance past one node without building it. The span walk needs only that.
///
/// Deliberately not [`Builder::build_node`]: the span pass discards every
/// value it produces, so running the alias resolver here would spend the
/// expansion budget on work nobody reads, and could fail a parse that the
/// value pass had already accepted.
fn skip_node(events: &[Ev], i: usize) -> usize {
    match events[i].kind {
        EvKind::SeqStart(_) => {
            let mut j = i + 1;
            while j < events.len() && !matches!(events[j].kind, EvKind::SeqEnd) {
                j = skip_node(events, j);
            }
            j + 1
        }
        EvKind::MapStart(_) => {
            let mut j = i + 1;
            while j < events.len() && !matches!(events[j].kind, EvKind::MapEnd) {
                let after_key = skip_node(events, j);
                if after_key >= events.len() || matches!(events[after_key].kind, EvKind::MapEnd) {
                    j = after_key;
                    break;
                }
                j = skip_node(events, after_key);
            }
            j + 1
        }
        _ => i + 1,
    }
}

/// Walk the event stream and produce a [`KeySpan`] per top-level key.
fn top_level_spans(events: &[Ev], src: &str) -> Vec<KeySpan> {
    let mut i = 0;
    while i < events.len() && !matches!(events[i].kind, EvKind::MapStart(_)) {
        i += 1;
    }
    if i >= events.len() {
        return Vec::new();
    }
    i += 1;

    // First pass: (key text, key range, value start, the two end estimates).
    struct Raw {
        key: String,
        key_range: std::ops::Range<usize>,
        value_start: usize,
        /// End of the last scalar or alias in the value. Exact for scalars,
        /// and a safe floor for collections: nothing before it is a comment.
        value_scalar_end: usize,
        /// End of the furthest event in the value, which for a flow
        /// collection covers the closing bracket and for a block collection
        /// can overshoot into the next key.
        value_event_end: usize,
    }
    let mut raws: Vec<Raw> = Vec::new();

    while i < events.len() && !matches!(events[i].kind, EvKind::MapEnd) {
        let key_ev = &events[i];
        let key = match &key_ev.kind {
            EvKind::Scalar(t, ..) => t.clone(),
            _ => {
                // A complex key: skip its whole subtree. Splicing one is out
                // of scope, and trying would corrupt the file.
                let next = skip_node(events, i);
                i = skip_node(events, next);
                continue;
            }
        };
        let key_range = byte_range(src, key_ev.span);
        let value_idx = i + 1;
        if value_idx >= events.len() {
            break;
        }
        let mut value_start = byte_index(src, events[value_idx].span.start.index());
        let after_value = skip_node(events, value_idx);
        let subtree = &events[value_idx..after_value];
        // An alias is a leaf with source text, exactly like a scalar, so it
        // counts towards the floor that protects real `#` content from being
        // trimmed as a comment.
        let mut value_scalar_end = subtree
            .iter()
            .filter(|e| matches!(e.kind, EvKind::Scalar(..) | EvKind::Alias(_)))
            .map(|e| scalar_end(src, e))
            .max()
            .unwrap_or(value_start);
        // An empty block scalar (`a: |` and no content lines) has an empty
        // span at the start of the next line. Its source text is the header
        // line after the colon (a tag or anchor included), up to a comment.
        if subtree.len() == 1 && is_empty_block_scalar(&subtree[0]) {
            let bytes = src.as_bytes();
            let mut s = assign_end(src, key_range.end, value_start);
            while s < bytes.len() && matches!(bytes[s], b' ' | b'\t') {
                s += 1;
            }
            let mut e = s;
            while e < bytes.len() && !matches!(bytes[e], b'\r' | b'\n') {
                if bytes[e] == b'#' && matches!(bytes[e - 1], b' ' | b'\t') {
                    break;
                }
                e += 1;
            }
            while e > s && matches!(bytes[e - 1], b' ' | b'\t') {
                e -= 1;
            }
            value_start = s;
            value_scalar_end = e;
        }
        let value_event_end = subtree
            .iter()
            .map(|e| byte_index(src, e.span.end.index()))
            .max()
            .unwrap_or(value_start);
        raws.push(Raw {
            key,
            key_range,
            value_start,
            value_scalar_end,
            value_event_end,
        });
        i = after_value;
    }

    // Second pass: bound each value by where the next key begins, then trim
    // the trailing whitespace and comments that belong to the file.
    let mut out = Vec::with_capacity(raws.len());
    for (idx, raw) in raws.iter().enumerate() {
        let hard_stop = raws
            .get(idx + 1)
            .map(|n| n.key_range.start)
            .unwrap_or(src.len());
        let end = trim_value_end(src, hard_stop, raw.value_scalar_end, raw.value_event_end);
        out.push(KeySpan {
            key: raw.key.clone(),
            key_range: raw.key_range.clone(),
            assign_end: assign_end(src, raw.key_range.end, raw.value_start),
            value_range: raw.value_start..end.max(raw.value_start),
        });
    }
    out
}

/// The byte offset just past a scalar or alias event's source text.
///
/// `saphyr-parser`'s span end is not always that offset, and [`trim_value_end`]
/// never trims below it, so two styles are corrected here:
///
/// - A quoted scalar's span runs on past the closing quote, over the
///   whitespace and comment that follow it on the line. Taken as is, a `Set`
///   would delete that trailing `# comment`. The end is found by scanning for
///   the closing quote instead.
/// - A block scalar's (`|` or `>`) span ends after its final line break, and
///   after any trailing blank lines. Taken as is, the value would own the
///   line break before the next key: a `Set` would join the next key onto the
///   new value's line, and a `Remove` would delete the next line too. The end
///   is moved back to the end of the last line with content.
fn scalar_end(src: &str, ev: &Ev) -> usize {
    let span_end = byte_index(src, ev.span.end.index());
    let start = byte_index(src, ev.span.start.index());
    let quote = match ev.kind {
        EvKind::Scalar(_, ScalarStyle::SingleQuoted, ..) => b'\'',
        EvKind::Scalar(_, ScalarStyle::DoubleQuoted, ..) => b'"',
        EvKind::Scalar(_, ScalarStyle::Literal | ScalarStyle::Folded, ..) => {
            return block_scalar_end(src.as_bytes(), start, span_end);
        }
        _ => return span_end,
    };
    closing_quote_end(src.as_bytes(), start, quote)
        .filter(|end| *end <= span_end)
        .unwrap_or(span_end)
}

fn is_empty_block_scalar(ev: &Ev) -> bool {
    matches!(
        ev.kind,
        EvKind::Scalar(_, ScalarStyle::Literal | ScalarStyle::Folded, ..)
    ) && ev.span.start.index() == ev.span.end.index()
}

/// Moves `end` back over trailing line breaks and blank lines, but never
/// before `start`. Spaces at the end of the last content line are content and
/// are kept.
///
/// The span can also end part-way into the next line: the parser consumes up
/// to the scalar's indent of a following, less indented line (a comment, say)
/// before it sees that the scalar is over. Spaces and tabs that run back to a
/// line break are stepped over first.
fn block_scalar_end(bytes: &[u8], start: usize, end: usize) -> usize {
    let mut end = end.min(bytes.len());
    loop {
        let mut ws = end;
        while ws > start && matches!(bytes[ws - 1], b' ' | b'\t') {
            ws -= 1;
        }
        if ws < end && ws > start && bytes[ws - 1] == b'\n' {
            end = ws;
        }
        let mut e = end;
        if e > start && bytes[e - 1] == b'\n' {
            e -= 1;
        }
        if e > start && bytes[e - 1] == b'\r' {
            e -= 1;
        }
        if e == end {
            return end;
        }
        // `e` is now the end of a line. Keep going only if that line is blank.
        let line_start = bytes[start..e]
            .iter()
            .rposition(|b| *b == b'\n')
            .map_or(start, |i| start + i + 1);
        if bytes[line_start..e]
            .iter()
            .all(|b| matches!(b, b' ' | b'\t'))
            && line_start > start
        {
            end = line_start;
        } else {
            return e;
        }
    }
}

/// The offset just past the quote that closes the quoted scalar opening at or
/// after `from`. In single quotes `''` is an escaped quote; in double quotes a
/// backslash escapes the next byte. Neither quote byte occurs inside a
/// multi-byte UTF-8 character, so scanning bytes is safe.
fn closing_quote_end(bytes: &[u8], from: usize, quote: u8) -> Option<usize> {
    let open = from + bytes.get(from..)?.iter().position(|b| *b == quote)?;
    let mut i = open + 1;
    while i < bytes.len() {
        let b = bytes[i];
        if quote == b'"' && b == b'\\' {
            i += 2;
            continue;
        }
        if b == quote {
            if quote == b'\'' && bytes.get(i + 1) == Some(&b'\'') {
                i += 2;
                continue;
            }
            return Some(i + 1);
        }
        i += 1;
    }
    None
}

/// Byte offset just past the `:` between a key and its value.
fn assign_end(src: &str, key_end: usize, value_start: usize) -> usize {
    let limit = value_start.max(key_end).min(src.len());
    match src[key_end.min(limit)..limit].find(':') {
        Some(i) => key_end + i + 1,
        // Quoted or unusual keys can push the colon past `value_start`
        // (empty values, mostly); scan the rest of the line for it.
        None => match src[key_end..].find(':') {
            Some(i) => key_end + i + 1,
            None => key_end,
        },
    }
}

/// Pull `end` back off trailing whitespace and trailing comments.
///
/// `floor` is why this is safe: it is the end of the last scalar the parser
/// reported inside the value. A `#` that is content (a literal block scalar
/// containing `# heading`) sits below the floor and is never
/// mistaken for a comment.
fn trim_value_end(src: &str, hard_stop: usize, floor: usize, event_end: usize) -> usize {
    let hard_stop = hard_stop.min(src.len());
    let floor = floor.min(hard_stop);
    let mut end = event_end.max(floor).min(hard_stop);
    let bytes = src.as_bytes();
    loop {
        while end > floor && matches!(bytes[end - 1], b' ' | b'\t' | b'\r' | b'\n') {
            end -= 1;
        }
        // A comment on the last retained line, entirely above the floor.
        let line_start = src[..end]
            .rfind('\n')
            .map(|i| i + 1)
            .unwrap_or(0)
            .max(floor);
        let Some(rel) = src[line_start..end].find('#') else {
            break;
        };
        let hash = line_start + rel;
        let preceded_by_space = hash == line_start
            || matches!(
                bytes.get(hash.wrapping_sub(1)),
                Some(b' ') | Some(b'\t') | Some(b'\n')
            );
        if hash < floor || !preceded_by_space {
            break;
        }
        end = hash;
    }
    end
}

fn byte_range(src: &str, span: Span) -> std::ops::Range<usize> {
    byte_index(src, span.start.index())..byte_index(src, span.end.index())
}

/// `saphyr-parser`'s `Marker` documents its index inconsistently: "in chars"
/// on the field, "in bytes" on the accessor. It is chars, verified by
/// `unicode_keys_produce_valid_byte_ranges` below, which slices a Cyrillic
/// key and fails loudly if this is ever wrong again. Treating the index as
/// bytes does not merely misalign: it panics on a char boundary, and real
/// frontmatter has non-ASCII keys and titles.
fn byte_index(src: &str, char_idx: usize) -> usize {
    if src.is_ascii() {
        return char_idx.min(src.len());
    }
    src.char_indices()
        .nth(char_idx)
        .map(|(b, _)| b)
        .unwrap_or(src.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scalars_resolve_with_the_core_schema() {
        let v = parse("a: 1\nb: true\nc: null\nd: 1.5\ne: 'yes'\nf: \"1.0\"\ng: yes\n").unwrap();
        let m = v.as_mapping().unwrap();
        assert_eq!(m.get("a"), Some(&Value::Int(1)));
        assert_eq!(m.get("b"), Some(&Value::Bool(true)));
        assert_eq!(m.get("c"), Some(&Value::Null));
        assert_eq!(m.get("d"), Some(&Value::Float(1.5)));
        // Quoted scalars stay strings: the `version: "1.0"` case.
        assert_eq!(m.get("e"), Some(&Value::Str("yes".into())));
        assert_eq!(m.get("f"), Some(&Value::Str("1.0".into())));
        // `yes` is a string in YAML 1.2, not a boolean.
        assert_eq!(m.get("g"), Some(&Value::Str("yes".into())));
    }

    #[test]
    fn hex_and_octal_take_no_sign() {
        // yaml@2's core schema: /^0x[0-9a-fA-F]+$/ and /^0o[0-7]+$/, unsigned.
        let v = parse("a: 0x1F\nb: 0o17\nc: -0x1F\nd: +0o7\ne: 0x-1\nf: -12\n").unwrap();
        let m = v.as_mapping().unwrap();
        assert_eq!(m.get("a"), Some(&Value::Int(31)));
        assert_eq!(m.get("b"), Some(&Value::Int(15)));
        assert_eq!(m.get("c"), Some(&Value::Str("-0x1F".into())));
        assert_eq!(m.get("d"), Some(&Value::Str("+0o7".into())));
        assert_eq!(m.get("e"), Some(&Value::Str("0x-1".into())));
        assert_eq!(m.get("f"), Some(&Value::Int(-12)));
    }

    #[test]
    fn hex_and_octal_too_wide_for_i64_read_as_numbers() {
        // yaml@2 reads these with `parseInt`: a number, not a string.
        let v = parse("a: 0xFFFFFFFFFFFFFFFF\nb: 0o7777777777777777777777777\nc: 0x1G\n").unwrap();
        let m = v.as_mapping().unwrap();
        assert_eq!(
            m.get("a"),
            Some(&Value::Float(18_446_744_073_709_551_615.0))
        );
        assert_eq!(
            m.get("b"),
            Some(&Value::Float(f64::from(8u8).powi(25) - 1.0))
        );
        assert_eq!(m.get("c"), Some(&Value::Str("0x1G".into())));
        // Wider than 128 bits: the dropped digits scale the value.
        let wide = format!("0x1{}", "0".repeat(40));
        let v = parse(&format!("a: {wide}\n")).unwrap();
        assert_eq!(
            v.as_mapping().unwrap().get("a"),
            Some(&Value::Float(16f64.powi(40)))
        );
        assert!(plain_is_non_string(&wide));
    }

    #[test]
    fn key_order_survives_parsing() {
        let v = parse("z: 1\na: 2\nm: 3\n").unwrap();
        assert_eq!(
            v.as_mapping().unwrap().keys().collect::<Vec<_>>(),
            vec!["z", "a", "m"]
        );
    }

    #[test]
    fn top_level_spans_point_at_the_value_bytes() {
        let src = "title: Hello\ncount: 3\n";
        let p = parse_with_spans(src).unwrap();
        assert_eq!(p.top_level.len(), 2);
        assert_eq!(&src[p.top_level[0].value_range.clone()], "Hello");
        assert_eq!(&src[p.top_level[1].value_range.clone()], "3");
        assert_eq!(&src[p.top_level[0].key_range.clone()], "title");
    }

    #[test]
    fn spans_survive_comments_and_blank_lines() {
        let src = "# leading\ntitle: Hello   # trailing\n\n# between\ncount: 3\n";
        let p = parse_with_spans(src).unwrap();
        assert_eq!(&src[p.top_level[0].value_range.clone()], "Hello");
        assert_eq!(&src[p.top_level[1].value_range.clone()], "3");
    }

    #[test]
    fn spans_cover_nested_collections() {
        let src = "a: 1\nlist:\n  - one\n  - two\nb: 2\n";
        let p = parse_with_spans(src).unwrap();
        let list = p.top_level.iter().find(|k| k.key == "list").unwrap();
        assert_eq!(&src[list.value_range.clone()], "- one\n  - two");
    }

    #[test]
    fn a_hash_inside_a_block_scalar_is_not_mistaken_for_a_comment() {
        let src = "desc: |\n  intro\n  # not a comment\nnext: x\n";
        let p = parse_with_spans(src).unwrap();
        let desc = p.top_level.iter().find(|k| k.key == "desc").unwrap();
        let got = &src[desc.value_range.clone()];
        assert!(
            got.contains("# not a comment"),
            "block scalar was truncated: {got:?}"
        );
    }

    #[test]
    fn unicode_keys_produce_valid_byte_ranges() {
        let src = "ключ: значение\nemoji: 🎉\n";
        let p = parse_with_spans(src).unwrap();
        assert_eq!(&src[p.top_level[0].key_range.clone()], "ключ");
        assert_eq!(&src[p.top_level[0].value_range.clone()], "значение");
        assert_eq!(&src[p.top_level[1].value_range.clone()], "🎉");
    }

    #[test]
    fn malformed_yaml_is_an_error_here() {
        assert!(parse("a: [1, 2\nb: 3\n").is_err());
    }

    // --- alias resolution -------------------------------------------------
    //
    // Every expectation below was captured from the real `yaml@2.9.0`, not
    // assumed.

    #[test]
    fn an_alias_resolves_to_the_anchored_value() {
        // `yaml@2`: layout is {s: {x: 10, y: 20}}. Read as {s: null}, the
        // splice would delete the whole `layout:` block on rewrite.
        let src = "anchors: &pos {x: 10, y: 20}\nsteps: [{id: s, title: S, type: task}]\nlayout:\n  s: *pos\n";
        let m = parse_mapping(src).unwrap();
        let layout = m.get("layout").unwrap().as_mapping().unwrap();
        let s = layout.get("s").unwrap().as_mapping().unwrap();
        assert_eq!(s.get("x"), Some(&Value::Int(10)));
        assert_eq!(s.get("y"), Some(&Value::Int(20)));
    }

    #[test]
    fn an_alias_inside_a_sequence_keeps_the_element() {
        // `yaml@2`: {"a":"hello","list":["hello","other"]}.
        let m = parse_mapping("a: &v hello\nlist:\n  - *v\n  - other\n").unwrap();
        assert_eq!(
            m.get("list").unwrap().as_seq(),
            Some(&[Value::Str("hello".into()), Value::Str("other".into())][..])
        );
    }

    #[test]
    fn an_alias_can_be_a_mapping_key() {
        // `yaml@2`: {"a":"kk","kk":2}. The alias resolves, then the two `kk`
        // entries collapse and the last one wins.
        let m = parse_mapping("a: &k kk\n*k : 1\nkk: 2\n").unwrap();
        assert_eq!(m.get("kk"), Some(&Value::Int(2)));
    }

    #[test]
    fn a_redefined_anchor_resolves_to_its_latest_definition() {
        // `yaml@2`: {"a":1,"b":2,"c":2}.
        let m = parse_mapping("a: &v 1\nb: &v 2\nc: *v\n").unwrap();
        assert_eq!(m.get("c"), Some(&Value::Int(2)));
    }

    #[test]
    fn a_merge_key_alias_resolves_but_is_not_expanded() {
        // `yaml@2` does not apply merge-key semantics: `<<` stays a literal
        // key whose value is the aliased mapping.
        // `yaml@2`: {"base":{"x":1},"derived":{"<<":{"x":1},"y":2}}.
        let m = parse_mapping("base: &b {x: 1}\nderived:\n  <<: *b\n  y: 2\n").unwrap();
        let derived = m.get("derived").unwrap().as_mapping().unwrap();
        assert_eq!(
            derived.get("<<").unwrap().as_mapping().unwrap().get("x"),
            Some(&Value::Int(1))
        );
        assert_eq!(derived.get("y"), Some(&Value::Int(2)));
    }

    #[test]
    fn a_recursive_alias_is_rejected_rather_than_hanging() {
        // YAML permits `&x [*x]`, and `saphyr` emits it. Our `Value` is a
        // tree and cannot hold a cycle, and `yaml@2`'s own `JSON.stringify`
        // throws on the circular object it builds, so there is nothing to be
        // faithful to. Reject, deterministically, instead of recursing.
        assert!(parse("a: &x [*x]\n").is_err());
        assert!(parse("a: &x {self: *x}\n").is_err());
    }

    #[test]
    fn an_alias_bomb_is_rejected_rather_than_exhausting_memory() {
        // Each level squares the expansion. `yaml@2` survives this because it
        // aliases by reference; we copy, so an unbounded resolver is an OOM
        // on hostile input.
        let mut src = String::from("a0: &a0 [x, x, x, x, x, x, x, x, x, x]\n");
        for i in 1..12 {
            src.push_str(&format!(
                "a{i}: &a{i} [*a{}, *a{}, *a{}, *a{}, *a{}, *a{}, *a{}, *a{}, *a{}, *a{}]\n",
                i - 1,
                i - 1,
                i - 1,
                i - 1,
                i - 1,
                i - 1,
                i - 1,
                i - 1,
                i - 1,
                i - 1
            ));
        }
        assert!(parse(&src).is_err(), "alias bomb must not be expanded");
    }

    #[test]
    fn a_forward_alias_reference_is_still_an_error() {
        // `saphyr` rejects this before we ever see it, and `yaml@2` throws too.
        // Pinned so the recursion guard is never mistaken for this case.
        assert!(parse("layout:\n  s: *pos\nanchors: &pos {x: 1, y: 2}\n").is_err());
    }

    // --- explicit tags ----------------------------------------------------

    #[test]
    fn an_explicit_str_tag_forces_a_string() {
        // `yaml@2`: title is the string "2024", not Int(2024), so `as_str()`
        // returns it.
        let m = parse_mapping("title: !!str 2024\n").unwrap();
        assert_eq!(m.get("title"), Some(&Value::Str("2024".into())));
        assert_eq!(m.get("title").and_then(Value::as_str), Some("2024"));
    }

    #[test]
    fn core_schema_tags_override_the_spelling_and_the_quoting() {
        // A tag beats the quote style: `!!int '42'` is 42 in `yaml@2` even though
        // a quoted scalar is otherwise always a string.
        let m = parse_mapping(
            "a: !!int '42'\nb: !!float '1.5'\nc: !!bool 'true'\nd: !!null ''\ne: !!str true\nf: !!int '0x1f'\n",
        )
        .unwrap();
        assert_eq!(m.get("a"), Some(&Value::Int(42)));
        assert_eq!(m.get("b"), Some(&Value::Float(1.5)));
        assert_eq!(m.get("c"), Some(&Value::Bool(true)));
        assert_eq!(m.get("d"), Some(&Value::Null));
        assert_eq!(m.get("e"), Some(&Value::Str("true".into())));
        assert_eq!(m.get("f"), Some(&Value::Int(31)));
    }

    #[test]
    fn a_core_schema_tag_that_does_not_fit_falls_back_to_the_string() {
        // `yaml@2` warns and yields the raw text rather than throwing:
        // `!!int 'abc'` is "abc", `!!null 'stuff'` is "stuff".
        let m = parse_mapping("a: !!int 'abc'\nb: !!bool 'xyz'\nc: !!null 'stuff'\n").unwrap();
        assert_eq!(m.get("a"), Some(&Value::Str("abc".into())));
        assert_eq!(m.get("b"), Some(&Value::Str("xyz".into())));
        assert_eq!(m.get("c"), Some(&Value::Str("stuff".into())));
    }

    #[test]
    fn a_non_core_tag_reads_as_a_string_the_way_yaml2_reads_it() {
        // `yaml@2`: `!foo 42` is the string "42". An unresolved tag turns off
        // core-schema resolution entirely.
        let m = parse_mapping("x: !foo 42\ny: !<tag:example.com,2000:t> 42\n").unwrap();
        assert_eq!(m.get("x"), Some(&Value::Str("42".into())));
        assert_eq!(m.get("y"), Some(&Value::Str("42".into())));
    }

    #[test]
    fn a_tag_on_a_collection_is_ignored_exactly_as_yaml2_ignores_it() {
        // `yaml@2`: `!!str [1,2]` is still the array [1,2].
        let m = parse_mapping("x: !!str [1, 2]\n").unwrap();
        assert_eq!(
            m.get("x").and_then(Value::as_seq),
            Some(&[Value::Int(1), Value::Int(2)][..])
        );
    }

    // --- duplicate keys ---------------------------------------------------

    #[test]
    fn the_lenient_parse_reports_a_duplicate_key_instead_of_failing() {
        // The last value still wins. The report only adds information.
        // See the module docs for why this cannot be an error by default.
        let p = parse_with_spans("title: First\ntitle: Second\n").unwrap();
        assert_eq!(p.duplicate_keys, vec!["title".to_string()]);
        assert_eq!(
            p.root.as_mapping().unwrap().get("title"),
            Some(&Value::Str("Second".into()))
        );
    }

    #[test]
    fn duplicate_keys_are_reported_at_every_depth() {
        let p = parse_with_spans("steps:\n  - id: s\n    id: t\n    title: S\n").unwrap();
        assert_eq!(p.duplicate_keys, vec!["id".to_string()]);
        let p = parse_with_spans("x: {a: 1, a: 2}\n").unwrap();
        assert_eq!(p.duplicate_keys, vec!["a".to_string()]);
    }

    #[test]
    fn the_strict_parse_refuses_a_duplicate_key_the_way_yaml2_does() {
        for src in [
            "title: First\ntitle: Second\n",
            "steps:\n  - id: s\n    id: t\n",
            "x: {a: 1, a: 2}\n",
        ] {
            let err = parse_mapping_strict(src).expect_err("yaml@2 throws on {src}");
            assert!(matches!(err, ParseError::DuplicateKey(_)), "{err}");
            // `yaml@2`'s own wording, so a caller that wraps it in its own
            // message reads the same as a JavaScript caller would.
            assert!(err.to_string().contains("Map keys must be unique"), "{err}");
        }
    }

    #[test]
    fn duplicate_detection_uses_yaml2s_key_equality_not_the_stringified_one() {
        // Observed in `yaml@2.9.0`: `a`/`'a'` and `~`/`null` collide, but
        // `1`/`'1'` and `true`/`'true'` do not: an Int key and a Str key are
        // different keys. Comparing the resolved key rather than the
        // stringified one is what reproduces that.
        assert_eq!(
            parse_with_spans("a: 1\n'a': 2\n").unwrap().duplicate_keys,
            vec!["a".to_string()]
        );
        assert_eq!(
            parse_with_spans("~: 1\nnull: 2\n").unwrap().duplicate_keys,
            vec!["null".to_string()]
        );
        assert!(
            parse_with_spans("1: a\n'1': b\n")
                .unwrap()
                .duplicate_keys
                .is_empty()
        );
        assert!(
            parse_with_spans("true: 1\n'true': 2\n")
                .unwrap()
                .duplicate_keys
                .is_empty()
        );
    }

    #[test]
    fn a_clean_document_reports_no_duplicates() {
        let p = parse_with_spans(
            "kind: workflow\nid: a\nsteps:\n  - id: s\n    title: S\nlayout:\n  s: {x: 1, y: 2}\n",
        )
        .unwrap();
        assert!(p.duplicate_keys.is_empty(), "{:?}", p.duplicate_keys);
    }

    #[test]
    fn the_strict_parse_still_accepts_everything_the_lenient_one_does() {
        // The two entry points differ on duplicates and nothing else.
        for src in [
            "a: 1\nb: [1, 2]\n",
            "anchors: &pos {x: 1}\nlayout:\n  s: *pos\n",
            "title: !!str 2024\n",
            "",
        ] {
            assert_eq!(
                parse(src).unwrap(),
                parse_strict(src).unwrap(),
                "diverged on {src:?}"
            );
        }
    }

    // --- end to end: an alias is not lost on rewrite ----------------------

    #[test]
    fn a_splice_no_longer_deletes_the_block_an_alias_points_into() {
        // Read the frontmatter, hand the same value back for an unrelated
        // key, and re-emit. If `layout.s` read as null, the aliased mapping
        // would be written back as `null` and the block would be gone.
        let src = "anchors: &pos {x: 10, y: 20}\nsteps: [{id: s, title: S, type: task}]\nlayout:\n  s: *pos\n";
        let m = parse_mapping(src).unwrap();
        let layout = m.get("layout").unwrap().clone();
        let out = crate::splice::splice_key(src, "layout", layout).unwrap();

        let reread = parse_mapping(&out).unwrap();
        let s = reread
            .get("layout")
            .and_then(Value::as_mapping)
            .and_then(|l| l.get("s"))
            .and_then(Value::as_mapping)
            .expect("the aliased mapping survived the round trip");
        assert_eq!(s.get("x"), Some(&Value::Int(10)));
        assert_eq!(s.get("y"), Some(&Value::Int(20)));
        assert!(
            !out.contains("s: null"),
            "alias was flattened to null:\n{out}"
        );
    }

    #[test]
    fn an_empty_value_yields_an_empty_span() {
        let src = "a:\nb: 2\n";
        let p = parse_with_spans(src).unwrap();
        assert!(p.top_level[0].value_range.is_empty());
    }
}
