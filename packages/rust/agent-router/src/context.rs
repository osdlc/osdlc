//! Context sizes (mirror of `context.ts`, and `checkContext` from `choose.ts`).
//!
//! `ctx=` means "at least this much", and so does a profile's `context:`. The
//! `ctx=` size grammar is shared by references and a profile's `context:`;
//! `context_args` translates a size into each tool's own form; `check_context`
//! is the one place a requirement meets a catalogue size.

use serde::de::{self, Deserializer};
use serde::ser::Serializer;
use serde::{Deserialize, Serialize};

use crate::catalogue::CatalogueQuery;

/// A `ctx=` value: a token count, or `max` (the largest the model offers).
/// JSON: a number, or the string `"max"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ctx {
    /// At least this many tokens.
    Tokens(u64),
    /// The largest the model offers on its tool.
    Max,
}

impl Serialize for Ctx {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match self {
            Ctx::Tokens(n) => s.serialize_u64(*n),
            Ctx::Max => s.serialize_str("max"),
        }
    }
}

impl<'de> Deserialize<'de> for Ctx {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Raw {
            N(u64),
            S(String),
        }
        match Raw::deserialize(d)? {
            Raw::N(n) => Ok(Ctx::Tokens(n)),
            Raw::S(s) if s == "max" => Ok(Ctx::Max),
            Raw::S(s) => Err(de::Error::custom(format!(
                "expected a number or \"max\", got {s:?}"
            ))),
        }
    }
}

/// The largest context size in tokens: JavaScript's `Number.MAX_SAFE_INTEGER`, the
/// TypeScript's `MAX_SIZE`, above which a size is no longer an exact integer there.
pub const MAX_SIZE: u64 = (1 << 53) - 1;

/// Why a size text is not a size.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SizeProblem {
    /// Not `digits` plus `k` or `m` (no leading zero).
    Malformed,
    /// More than [`MAX_SIZE`] tokens.
    TooLarge,
}

/// A context size in tokens, or why `text` is not one. The parsers use it to say
/// which.
pub fn read_size(text: &str) -> Result<u64, SizeProblem> {
    let (digits, unit) = if let Some(digits) = text.strip_suffix('m') {
        (digits, 1_000_000u64)
    } else if let Some(digits) = text.strip_suffix('k') {
        (digits, 1_000u64)
    } else {
        return Err(SizeProblem::Malformed);
    };
    let mut chars = digits.chars();
    if !(matches!(chars.next(), Some('1'..='9')) && chars.all(|c| c.is_ascii_digit())) {
        return Err(SizeProblem::Malformed);
    }
    digits
        .parse::<u64>()
        .ok()
        .and_then(|n| n.checked_mul(unit))
        .filter(|&n| n <= MAX_SIZE)
        .ok_or(SizeProblem::TooLarge)
}

/// A context size in tokens, or `None` when `text` is not `digits` plus `k` or
/// `m` (decimal units; no leading zero), or names more than [`MAX_SIZE`] tokens.
pub fn parse_size(text: &str) -> Option<u64> {
    read_size(text).ok()
}

/// A size in the reference form: `1m`, `200k`. A size neither unit divides is
/// rounded down to whole `k`, so the text parses and, as `ctx=` means "at
/// least", still asks for no more than the size. Under 1k there is no
/// reference form and the digits are returned.
pub fn format_size(tokens: u64) -> String {
    if tokens.is_multiple_of(1_000_000) {
        format!("{}m", tokens / 1_000_000)
    } else if tokens >= 1_000 {
        format!("{}k", tokens / 1_000)
    } else {
        tokens.to_string()
    }
}

/// Claude Code's default window, below which the `[1m]` long-context form is not needed; at or
/// under its default nothing is passed.
const CLAUDE_DEFAULT_CONTEXT: u64 = 200_000;

/// Claude Code's one context variant, `[1m]`: the most a size can ask of it.
const CLAUDE_LONG_CONTEXT: u64 = 1_000_000;

/// Request options carrying a context size, as Ollama takes it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NumCtx {
    /// The context size in tokens.
    pub num_ctx: u64,
}

/// What a tool is given for a context size.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextArgs {
    /// The model string, with the tool's suffix or bracket when the size needs
    /// one (`opus[1m]`, `x[context=1m]`); unchanged when the default window
    /// covers the size; absent when there was no model, for `ollama` (the size goes in
    /// `options.num_ctx`), and whenever the size is `context_unchecked`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Request options, for a runtime that takes the size per request (Ollama's `num_ctx`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<NumCtx>,
    /// Nothing carries the size and nothing shows the run has it.
    pub context_unchecked: bool,
}

/// The context window `model` runs with on `tool` when nothing asks for a
/// size: the catalogue's `default`, the offering's before the model's. A
/// model's `max` is never used here. `None` when the catalogue states no
/// `default`, or when there is no model.
pub fn default_window(catalogue: &CatalogueQuery, tool: &str, model: Option<&str>) -> Option<u64> {
    let found = catalogue.find_model(tool, model?)?;
    found
        .offering
        .context
        .as_ref()
        .and_then(|c| c.default)
        .or_else(|| found.model.row.context.as_ref().and_then(|c| c.default))
}

/// Translate a context size into `tool`'s own form: Claude needs nothing at or
/// under its 200k default and `[1m]` above, up to 1m (above 1m nothing reaches the
/// size, so it is `context_unchecked`); Cursor takes `model[context=1m]`;
/// an Ollama runtime takes `num_ctx`. Any other tool has no verified form: a
/// size the default window covers needs none, a larger one (or no known
/// window) is `context_unchecked`.
pub fn context_args(
    tool: &str,
    model: Option<&str>,
    ctx: u64,
    default_context: Option<u64>,
) -> ContextArgs {
    let unchecked = || ContextArgs {
        model: None,
        options: None,
        context_unchecked: true,
    };
    let unchanged = || ContextArgs {
        model: model.map(str::to_string),
        options: None,
        context_unchecked: false,
    };
    match tool {
        "claude" => {
            if ctx <= CLAUDE_DEFAULT_CONTEXT {
                return unchanged();
            }
            match model {
                None => unchecked(),
                Some(_) if ctx > CLAUDE_LONG_CONTEXT => unchecked(),
                Some(m) => ContextArgs {
                    model: Some(format!("{m}[1m]")),
                    options: None,
                    context_unchecked: false,
                },
            }
        }
        "cursor" => match model {
            None => unchecked(),
            Some(m) => ContextArgs {
                model: Some(format!("{m}[context={}]", format_size(ctx))),
                options: None,
                context_unchecked: false,
            },
        },
        "ollama" => ContextArgs {
            model: None,
            options: Some(NumCtx { num_ctx: ctx }),
            context_unchecked: false,
        },
        _ => match default_context {
            Some(d) if ctx <= d => unchanged(),
            _ => unchecked(),
        },
    }
}

/// The outcome of comparing an entry's context requirement to the catalogue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ContextCheck {
    /// The requirement is met, or cannot be checked.
    Ok {
        /// The size the entry runs with, in tokens; absent when nothing asks for one.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        context: Option<u64>,
        /// Set when the catalogue knows no size for the model, so the requirement is not checked.
        unchecked: bool,
    },
    /// `message` says how far the model falls short.
    Skip {
        /// How far the model falls short.
        message: String,
    },
    /// The entry asks for more than its model offers anywhere.
    Error {
        /// How far the request exceeds the model.
        message: String,
    },
}

/// The context sizes of a model: on its tool (the offering's size, else the
/// model's) and anywhere (the largest over the model and every offering).
struct Sizes {
    here: u64,
    anywhere: u64,
    key: String,
}

fn sizes_of(tool: &str, model: Option<&str>, catalogue: &CatalogueQuery) -> Option<Sizes> {
    let found = catalogue.find_model(tool, model?)?;
    let size = |c: Option<&crate::catalogue::ContextSizes>| c.and_then(|c| c.max.or(c.default));
    let model_size = size(found.model.row.context.as_ref());
    let here = size(found.offering.context.as_ref()).or(model_size)?;
    let mut anywhere = here;
    anywhere = anywhere.max(model_size.unwrap_or(0));
    for o in catalogue.offerings() {
        if o.model == found.model.row.key {
            anywhere = anywhere.max(size(o.context.as_ref()).unwrap_or(0));
        }
    }
    Some(Sizes {
        here,
        anywhere,
        key: found.model.row.key.clone(),
    })
}

/// The one place a context requirement meets a catalogue size. `want` is the
/// entry's own `[ctx=]`, `required` the profile's `context:`; each means "at
/// least". An entry asking for more than its model offers anywhere is an
/// error; a model that offers less than asked on this tool is a skip; a model
/// with no known size passes `unchecked`. `ctx=max` is the model's size on the
/// tool. `tool` and `model` are the resolved entry's.
pub fn check_context(
    tool: &str,
    model: Option<&str>,
    want: Option<Ctx>,
    required: Option<u64>,
    catalogue: &CatalogueQuery,
) -> ContextCheck {
    if want.is_none() && required.is_none() {
        return ContextCheck::Ok {
            context: None,
            unchecked: false,
        };
    }
    let want_tokens = match want {
        Some(Ctx::Tokens(n)) => Some(n),
        _ => None,
    };
    let floor = want_tokens.unwrap_or(0).max(required.unwrap_or(0));
    let Some(sizes) = sizes_of(tool, model, catalogue) else {
        return ContextCheck::Ok {
            context: (floor > 0).then_some(floor),
            unchecked: true,
        };
    };
    if let Some(w) = want_tokens
        && w > sizes.anywhere
    {
        return ContextCheck::Error {
            message: format!(
                "ctx={} is more than {} offers anywhere ({})",
                format_size(w),
                sizes.key,
                format_size(sizes.anywhere)
            ),
        };
    }
    if sizes.here < floor {
        let asked = match required {
            Some(r) if r >= want_tokens.unwrap_or(0) => {
                format!("the profile's context: {}", format_size(r))
            }
            _ => format!("ctx={}", format_size(floor)),
        };
        return ContextCheck::Skip {
            message: format!(
                "{} offers {} on {tool}, below {asked}",
                sizes.key,
                format_size(sizes.here)
            ),
        };
    }
    ContextCheck::Ok {
        context: Some(if want == Some(Ctx::Max) {
            sizes.here
        } else {
            floor
        }),
        unchecked: false,
    }
}
