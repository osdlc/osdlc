//! References: `tool/model[qualifiers]@effort` (mirror of `ref.ts`).

use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::context::{Ctx, MAX_SIZE, SizeProblem, format_size, read_size};
use crate::effort::EFFORT_LEVELS;

/// A model tier, which a reference can name in place of a model. The one tier set; the README's
/// "Adding a trait or tier" lists what a new tier touches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    /// The fast tier, the least capable.
    Fast,
    /// The standard tier.
    Standard,
    /// The max tier, the most capable.
    Max,
}

/// Every tier, in the order the classifier tries them (`TIERS`).
pub const TIERS: &[Tier] = &[Tier::Fast, Tier::Standard, Tier::Max];

impl Tier {
    /// The tier's word, as a reference writes it.
    pub fn as_str(self) -> &'static str {
        match self {
            Tier::Fast => "fast",
            Tier::Standard => "standard",
            Tier::Max => "max",
        }
    }

    /// The tier a word names; the words are reserved (`isTier`).
    pub fn parse(s: &str) -> Option<Tier> {
        TIERS.iter().copied().find(|t| t.as_str() == s)
    }
}

/// A model trait, which a qualifier filters on. The one trait set; the
/// README's "Adding a trait or tier" lists what a new trait touches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Trait {
    /// Served by a local runtime.
    Local,
    /// Calls tools.
    Agent,
    /// An embedding model.
    Embedding,
    /// Reasons before answering.
    Reasoning,
    /// Has a long context window.
    LongContext,
    /// Accepts image input.
    Vision,
    /// Produces images.
    ImageOut,
}

/// Every trait, in the order messages list them (`TRAITS`).
pub const TRAITS: &[Trait] = &[
    Trait::Local,
    Trait::Agent,
    Trait::Embedding,
    Trait::Reasoning,
    Trait::LongContext,
    Trait::Vision,
    Trait::ImageOut,
];

impl Trait {
    /// The trait's name, as a qualifier writes it.
    pub fn as_str(self) -> &'static str {
        match self {
            Trait::Local => "local",
            Trait::Agent => "agent",
            Trait::Embedding => "embedding",
            Trait::Reasoning => "reasoning",
            Trait::LongContext => "long-context",
            Trait::Vision => "vision",
            Trait::ImageOut => "image-out",
        }
    }

    /// The trait a name names, or `None`.
    pub fn parse(s: &str) -> Option<Trait> {
        TRAITS.iter().copied().find(|t| t.as_str() == s)
    }
}

/// The wildcard tool `*`: every tool, for one tier. Allowed in profile entries only.
pub const WILDCARD: &str = "*";

/// The `[...]` group of a reference: `ctx` asks for at least that many tokens
/// of context (`max`: the largest the model offers); `traits` filter a tier or
/// a wildcard to the models that carry every one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Qualifiers {
    /// At least this much context; `max` asks for the largest the model offers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ctx: Option<Ctx>,
    /// The traits a tier or wildcard filters to.
    pub traits: Vec<Trait>,
}

/// A parsed reference. Only `tool` is required; `qualifiers` is present only
/// when the reference has a `[...]` group.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ref {
    /// The tool id, or the wildcard `*`.
    pub tool: String,
    /// A model name or a tier word.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// The `[...]` group, when the reference has one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub qualifiers: Option<Qualifiers>,
    /// The effort after `@`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
}

impl Ref {
    /// A reference to `tool` alone, with no model, qualifiers or effort.
    pub fn tool(tool: &str) -> Ref {
        Ref {
            tool: tool.to_string(),
            model: None,
            qualifiers: None,
            effort: None,
        }
    }
}

/// Why a reference failed to parse; [`RefParseError`] carries one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RefParseErrorKind {
    /// The reference is empty.
    EmptyRef,
    /// The tool is empty.
    EmptyTool,
    /// The tool is not a tool id or `*`.
    InvalidTool,
    /// The model after `/` is empty.
    EmptyModel,
    /// The effort after `@` is empty.
    EmptyEffort,
    /// An effort that is not one of `EFFORT_LEVELS` (`@hgih`).
    UnknownEffort,
    /// A model that starts with `-` (a CLI would read it as a flag) or holds a control or
    /// invisible character.
    InvalidModel,
    /// The reference contains whitespace.
    Whitespace,
    /// The `[...]` group is malformed or misplaced, or names an unknown qualifier.
    InvalidQualifiers,
    /// A qualifier appears twice.
    DuplicateQualifier,
    /// A tool's own bracket (`opus[1m]`, `[context=1m]`); the message gives the reference form.
    NativeBracket,
    /// A trait on a named model or the tool default: only tiers and wildcards filter.
    TraitsNeedTier,
    /// `*` without a tier, or with a model name.
    WildcardNeedsTier,
}

/// A reference that did not parse: the `kind` of failure, the offending
/// `text`, and a `message` that quotes it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, thiserror::Error)]
#[error("{message}")]
pub struct RefParseError {
    /// The kind of failure.
    pub kind: RefParseErrorKind,
    /// The offending text.
    pub text: String,
    /// A human-readable explanation that quotes the text.
    pub message: String,
}

/// Whether a ref names every tool: the wildcard tool `*` with a tier.
pub fn is_wildcard(r: &Ref) -> bool {
    r.tool == WILDCARD
}

/// Whether a ref's model is a tier word or a concrete name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelKind {
    /// A tier word.
    Tier,
    /// A concrete model name.
    Name,
}

/// The kind of a ref's model, or `None` when it names none.
pub fn model_kind(r: &Ref) -> Option<ModelKind> {
    let model = r.model.as_deref()?;
    Some(if Tier::parse(model).is_some() {
        ModelKind::Tier
    } else {
        ModelKind::Name
    })
}

/// Tool ids are lower-case identifiers: `^[a-z][a-z0-9-]*$`.
pub const TOOL_ID_PATTERN: &str = "^[a-z][a-z0-9-]*$";

/// Whether `s` is a valid tool id, that is, matches [`TOOL_ID_PATTERN`].
pub fn is_tool_id(s: &str) -> bool {
    let mut chars = s.chars();
    matches!(chars.next(), Some('a'..='z'))
        && chars.all(|c| matches!(c, 'a'..='z' | '0'..='9' | '-'))
}

/// JavaScript's `\s`, which is not Unicode `White_Space` (it has U+FEFF, lacks U+0085).
pub(crate) fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

/// Whether `effort` is one of `EFFORT_LEVELS`, the only levels a launcher passes (`isEffortLevel`).
pub fn is_effort_level(effort: &str) -> bool {
    EFFORT_LEVELS.contains(&effort)
}

/// The message for an effort off `EFFORT_LEVELS`.
pub fn unknown_effort_message(effort: &str) -> String {
    format!(
        "effort '{effort}' is not a level (levels: {})",
        EFFORT_LEVELS.join(", ")
    )
}

/// Control (`Cc`), format (`Cf`: zero-width, bidi) and separator (`Z`) characters; with
/// [`is_js_whitespace`], the TypeScript's `[\s\p{Cc}\p{Cf}\p{Z}]`.
static INVISIBLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\p{Cc}\p{Cf}\p{Z}]").expect("static regex"));

/// Why `model` may not be handed to a tool as its model string, or `None` when it may
/// (`modelProblem`): it, or a `/`-separated part of it, starts with `-`, or it holds whitespace
/// or a control, format or separator character. Any other punctuation passes (`qwen3:4b`).
pub fn model_problem(model: &str) -> Option<&'static str> {
    if model.split('/').any(|part| part.starts_with('-')) {
        return Some("model must not start with '-', nor have a part after '/' that does");
    }
    if model.chars().any(is_js_whitespace) || INVISIBLE.is_match(model) {
        return Some("model holds whitespace, a control character or an invisible character");
    }
    None
}

fn fail(kind: RefParseErrorKind, text: &str, message: &str) -> RefParseError {
    RefParseError {
        kind,
        text: text.to_string(),
        // `JSON.stringify(text)`.
        message: format!(
            "{message}: {}",
            serde_json::to_string(text).unwrap_or_default()
        ),
    }
}

/// `^[0-9]+[a-z]*$`
fn looks_like_native_size(item: &str) -> bool {
    let digits = item.chars().take_while(char::is_ascii_digit).count();
    digits > 0 && item[digits..].chars().all(|c| c.is_ascii_lowercase())
}

fn trait_list() -> String {
    TRAITS
        .iter()
        .map(|t| t.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}

fn parse_qualifiers(text: &str, group: &str) -> Result<Qualifiers, RefParseError> {
    use RefParseErrorKind::*;
    let mut q = Qualifiers {
        ctx: None,
        traits: Vec::new(),
    };
    for item in group.split(',') {
        if item.is_empty() {
            return Err(fail(InvalidQualifiers, text, "empty qualifier"));
        }
        let Some(eq) = item.find('=') else {
            if looks_like_native_size(item) {
                return Err(fail(
                    NativeBracket,
                    text,
                    &format!("a context size is written [ctx={item}], not a tool's own [{item}]"),
                ));
            }
            let Some(t) = Trait::parse(item) else {
                return Err(fail(
                    InvalidQualifiers,
                    text,
                    &format!("unknown trait '{item}'; known: {}", trait_list()),
                ));
            };
            if q.traits.contains(&t) {
                return Err(fail(
                    DuplicateQualifier,
                    text,
                    &format!("trait '{item}' appears twice"),
                ));
            }
            q.traits.push(t);
            continue;
        };
        let (key, value) = (&item[..eq], &item[eq + 1..]);
        if key == "context" {
            return Err(fail(
                NativeBracket,
                text,
                &format!(
                    "a context size is written [ctx={value}], not a tool's own [context={value}]"
                ),
            ));
        }
        if key != "ctx" {
            return Err(fail(
                InvalidQualifiers,
                text,
                &format!("unknown qualifier '{key}'; the only key is ctx"),
            ));
        }
        if q.ctx.is_some() {
            return Err(fail(DuplicateQualifier, text, "'ctx' appears twice"));
        }
        let size = if value == "max" {
            Ok(Ctx::Max)
        } else {
            read_size(value).map(Ctx::Tokens)
        };
        let size = size.map_err(|problem| {
            let message = match problem {
                SizeProblem::TooLarge => {
                    format!("ctx={value} is above the largest size, {MAX_SIZE} tokens")
                }
                SizeProblem::Malformed => {
                    format!("ctx must be digits plus k or m, or max; got '{value}'")
                }
            };
            fail(InvalidQualifiers, text, &message)
        })?;
        q.ctx = Some(size);
    }
    q.traits.sort_by_key(|t| t.as_str());
    Ok(q)
}

/// Parse `tool/model[qualifiers]@effort`, as `parseRef` in `ref.ts` does:
/// split off the effort at the last `@` that follows the last `]`, then a
/// trailing `[...]` group, then the tool at the first `/`. The model is passed
/// through unchanged, unless [`model_problem`] refuses it; the effort must be
/// one of `EFFORT_LEVELS`. A model holds an `@` only when an effort follows and
/// there are no qualifiers (`foo@v1@high`). The full rules are under "Parsing
/// rules" in `packages/ts/agent-router/README.md`.
pub fn parse_ref(text: &str) -> Result<Ref, RefParseError> {
    use RefParseErrorKind::*;
    if text.is_empty() {
        return Err(fail(EmptyRef, text, "empty model reference"));
    }
    if text.chars().any(is_js_whitespace) {
        return Err(fail(
            Whitespace,
            text,
            "model reference contains whitespace",
        ));
    }

    let close = text.rfind(']').map_or(-1, |i| i as i64);
    let at = text.rfind('@').map_or(-1, |i| i as i64);
    let has_effort = at > close;
    let body = if has_effort {
        &text[..at as usize]
    } else {
        text
    };
    let effort = has_effort.then(|| &text[at as usize + 1..]);
    if effort == Some("") {
        return Err(fail(EmptyEffort, text, "empty effort after '@'"));
    }

    let mut head = body;
    let mut qualifiers = None;
    if body.ends_with(']') {
        let Some(open) = body.rfind('[') else {
            return Err(fail(InvalidQualifiers, text, "']' without '['"));
        };
        let group = &body[open + 1..body.len() - 1];
        if group.is_empty() {
            return Err(fail(InvalidQualifiers, text, "empty qualifiers"));
        }
        qualifiers = Some(parse_qualifiers(text, group)?);
        head = &body[..open];
    }
    if head.contains(['[', ']']) {
        return Err(fail(
            InvalidQualifiers,
            text,
            "qualifiers are one trailing '[...]' group",
        ));
    }
    if qualifiers.is_some() && head.contains('@') {
        return Err(fail(
            InvalidQualifiers,
            text,
            "qualifiers go before '@effort'",
        ));
    }

    let (tool, model) = match head.find('/') {
        Some(slash) => (&head[..slash], Some(&head[slash + 1..])),
        None => (head, None),
    };
    if tool.is_empty() {
        return Err(fail(EmptyTool, text, "empty tool"));
    }
    if tool != WILDCARD && !is_tool_id(tool) {
        return Err(fail(
            InvalidTool,
            text,
            &format!("tool must match {TOOL_ID_PATTERN} or be '*'"),
        ));
    }
    if model == Some("") {
        return Err(fail(EmptyModel, text, "empty model after '/'"));
    }
    if let Some(problem) = model.and_then(model_problem) {
        return Err(fail(InvalidModel, text, problem));
    }
    let tier = model.is_some_and(|m| Tier::parse(m).is_some());
    if tool == WILDCARD && !tier {
        let tiers = TIERS
            .iter()
            .map(|t| t.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        return Err(fail(
            WildcardNeedsTier,
            text,
            &format!("'*' needs a tier ({tiers}), as in '*/fast'"),
        ));
    }
    if qualifiers.as_ref().is_some_and(|q| !q.traits.is_empty()) && !tier {
        return Err(fail(
            TraitsNeedTier,
            text,
            "traits only filter, so they need a tier or a wildcard (claude/fast[local], */fast[local])",
        ));
    }

    if let Some(e) = effort.filter(|e| !is_effort_level(e)) {
        return Err(fail(UnknownEffort, text, &unknown_effort_message(e)));
    }

    Ok(Ref {
        tool: tool.to_string(),
        model: model.map(str::to_string),
        qualifiers,
        effort: effort.map(str::to_string),
    })
}

/// The `[...]` group in canonical order: `ctx` first, then traits sorted.
pub fn format_qualifiers(q: &Qualifiers) -> String {
    let mut items: Vec<String> = Vec::new();
    match q.ctx {
        Some(Ctx::Max) => items.push("ctx=max".to_string()),
        Some(Ctx::Tokens(n)) => items.push(format!("ctx={}", format_size(n))),
        None => {}
    }
    let mut traits: Vec<&str> = q.traits.iter().map(|t| t.as_str()).collect();
    traits.sort_unstable();
    items.extend(traits.into_iter().map(str::to_string));
    if items.is_empty() {
        String::new()
    } else {
        format!("[{}]", items.join(","))
    }
}

/// A reference as text, `tool/model[qualifiers]@effort`, with the qualifiers
/// in canonical order: `ctx` first, then traits sorted.
pub fn format_ref(r: &Ref) -> String {
    let mut out = r.tool.clone();
    if let Some(model) = &r.model {
        out.push('/');
        out.push_str(model);
    }
    if let Some(q) = &r.qualifiers {
        out.push_str(&format_qualifiers(q));
    }
    if let Some(effort) = &r.effort {
        out.push('@');
        out.push_str(effort);
    }
    out
}
