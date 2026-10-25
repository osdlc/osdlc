//! The text-match predicate core and the `text/*` finding area, ported from
//! the TS `text-match.ts`:
//!
//! 1. [`match_text`] — a pure matcher: `(text, spec) → { count, positions }`. A literal
//!    `pattern` (whitespace-run flexible under `normalize`, default true; exact under
//!    `normalize: false`) or a `regex` source, `ignoreCase` folding, every occurrence
//!    counted and pinned to its 1-based line / col (col in UTF-16 units — JS string
//!    indexing — so positions agree with the TS engine byte-for-byte on ASCII and
//!    character-for-character beyond it).
//! 2. [`build_text_findings`] — maps a match result + the entry's `min` / `max` bound to
//!    `text/requires` / `text/forbids` / `text/count` findings.
//! 3. [`synthesize_text_id`] — the stable per-entry id
//!    `text/<kind>/<scopeKey>/<patternHash>`: an FNV-1a 32-bit hash over the normalized
//!    pattern key's UTF-16 code units, rendered base36 — **bit-identical to the TS
//!    `shortHash`**, because the corpus goldens pin these ids.

use crate::finding::{Finding, FindingLevel, SourcePos};
use crate::registry::{Ctx, FindingSpec};
use regex::RegexBuilder;

// ── The match spec & result ───────────────────────────────────────────────────────────

/// One match spec — the closed text-match vocabulary. Exactly
/// one of `pattern` (a literal substring) or `regex` (a regex source) supplies the
/// needle; `normalize` / `ignore_case` tune matching; `min` / `max` bound the count;
/// `id` pins identity; `note` / `level` shape the finding.
#[derive(Debug, Clone, Default)]
pub struct TextMatchSpec {
    /// a literal substring to find
    pub pattern: Option<String>,
    /// a regular expression to find
    pub regex: Option<String>,
    /// collapse whitespace runs before matching, so prose line-wrapping is tolerated (default true)
    pub normalize: Option<bool>,
    /// match without regard to case (default false)
    pub ignore_case: Option<bool>,
    /// the fewest hits allowed
    pub min: Option<f64>,
    /// the most hits allowed
    pub max: Option<f64>,
    /// an explicit, author-supplied finding id — pins identity across pattern edits
    pub id: Option<String>,
    /// author rationale, appended to the finding message
    pub note: Option<String>,
    /// finding severity — overrides the registry default (`error` | `warn`)
    pub level: Option<FindingLevel>,
}

/// The result of [`match_text`]: the occurrence count and each hit's source position.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TextMatchResult {
    /// how many times the needle was found
    pub count: usize,
    /// one entry per hit, in document order (1-based line / col of the match start)
    pub positions: Vec<SourcePos>,
}

/// The entry kind a text constraint is authored as — presence or absence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextKind {
    /// the needle must appear.
    Requires,
    /// the needle must not appear.
    Forbids,
}

/// The finding-id discriminator: the pure presence / absence findings, or a `min`/`max`
/// bound violation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextFindingKind {
    /// the needle is absent but required.
    Requires,
    /// the needle is present but forbidden.
    Forbids,
    /// the hit count is outside `min` / `max`.
    Count,
}

impl TextFindingKind {
    fn as_str(&self) -> &'static str {
        match self {
            TextFindingKind::Requires => "requires",
            TextFindingKind::Forbids => "forbids",
            TextFindingKind::Count => "count",
        }
    }
}

// ── The pure matcher ──────────────────────────────────────────────────────────────────

/// Escape every JS regex metacharacter in a literal so it matches itself (the TS
/// `escapeRegex` set — also safe Rust regex escapes).
fn escape_regex(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(
            c,
            '.' | '*' | '+' | '?' | '^' | '$' | '{' | '}' | '(' | ')' | '|' | '[' | ']' | '\\'
        ) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// A literal pattern as a regex source whose internal whitespace runs match any run of
/// whitespace — so a phrase wrapped across a line still matches.
fn normalized_pattern_source(pattern: &str) -> String {
    let trimmed = pattern.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    trimmed
        .split_whitespace()
        .map(escape_regex)
        .collect::<Vec<_>>()
        .join(r"\s+")
}

/// Map a byte offset in `text` to a 1-based `{ line, col }`, `col` counted in UTF-16
/// code units (JS string indexing) so the TS `offsetToPos` agrees exactly.
fn offset_to_pos(text: &str, offset: usize) -> SourcePos {
    let before = &text[..offset];
    let line = before.bytes().filter(|&b| b == b'\n').count() as u32 + 1;
    let line_start = before.rfind('\n').map_or(0, |i| i + 1);
    let col = text[line_start..offset].encode_utf16().count() as u32 + 1;
    SourcePos::at(line, col)
}

/// Match a spec against `text`, returning the occurrence count and each hit's position.
/// Matching runs over the raw text including code spans and fenced blocks.
///
/// # Panics
/// When the spec supplies neither `pattern` nor `regex`, or a `regex` source the regex
/// engine rejects — both authoring errors the declarative compiler screens out.
pub fn match_text(text: &str, spec: &TextMatchSpec) -> TextMatchResult {
    let source = if let Some(regex) = &spec.regex {
        regex.clone()
    } else if let Some(pattern) = &spec.pattern {
        if spec.normalize.unwrap_or(true) {
            normalized_pattern_source(pattern)
        } else {
            escape_regex(pattern)
        }
    } else {
        panic!("match_text: a spec must supply one of `pattern` or `regex`");
    };
    // An empty needle never matches (avoids a zero-width regex looping over every position).
    if source.is_empty() {
        return TextMatchResult::default();
    }

    let re = RegexBuilder::new(&source)
        .case_insensitive(spec.ignore_case.unwrap_or(false))
        .build()
        .unwrap_or_else(|e| panic!("match_text: invalid regex /{source}/: {e}"));
    let positions: Vec<SourcePos> = re
        .find_iter(text)
        .map(|m| offset_to_pos(text, m.start()))
        .collect();
    TextMatchResult {
        count: positions.len(),
        positions,
    }
}

// ── Stable finding-id synthesis ───────────────────────────────────────────────────────

/// A short, stable, deterministic hash: FNV-1a 32-bit over the string's UTF-16 code
/// units (the TS `charCodeAt` walk), rendered base36 — the exact TS `shortHash`.
fn short_hash(s: &str) -> String {
    let mut h: u32 = 0x811c9dc5;
    for unit in s.encode_utf16() {
        h ^= unit as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    to_base36(h)
}

fn to_base36(mut n: u32) -> String {
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".into();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).expect("base36 digits are ascii")
}

/// The canonical identity of a spec's *matcher* — the needle plus the flags that change
/// what matches. The count bound is deliberately NOT part of the key.
pub(crate) fn pattern_key(spec: &TextMatchSpec) -> String {
    let fold = if spec.ignore_case.unwrap_or(false) {
        "i"
    } else {
        ""
    };
    if let Some(regex) = &spec.regex {
        return format!("regex|{regex}|{fold}");
    }
    let normalize = spec.normalize.unwrap_or(true);
    let pattern = spec.pattern.as_deref().unwrap_or("");
    let needle = if normalize {
        pattern.split_whitespace().collect::<Vec<_>>().join(" ")
    } else {
        pattern.to_string()
    };
    format!(
        "pattern|{}|{needle}|{fold}",
        if normalize { "n" } else { "x" }
    )
}

/// The stable finding id for one text-constraint entry:
/// `text/<kind>/<scopeKey>/<patternHash>` — stable across entry reordering, unique
/// across scopes. An entry with an explicit `id` gets exactly that id back.
pub fn synthesize_text_id(kind: TextFindingKind, scope_key: &str, spec: &TextMatchSpec) -> String {
    if let Some(id) = &spec.id {
        return id.clone();
    }
    format!(
        "text/{}/{scope_key}/{}",
        kind.as_str(),
        short_hash(&pattern_key(spec))
    )
}

// ── The finding-builder ───────────────────────────────────────────────────────────────

/// The needle as it reads in a finding message — `"literal"` / `/source/`.
fn spec_repr(spec: &TextMatchSpec) -> String {
    if let Some(regex) = &spec.regex {
        format!("/{regex}/")
    } else {
        format!("\"{}\"", spec.pattern.as_deref().unwrap_or(""))
    }
}

/// A human label for the scope a finding fires in — `doc` renders as `document`.
fn scope_label<'a>(scope_key: &'a str, scope: Option<&'a str>) -> &'a str {
    if let Some(scope) = scope {
        return scope;
    }
    if scope_key == "doc" {
        "document"
    } else {
        scope_key
    }
}

/// The count bound the builder evaluates against, with the kind's defaults applied.
fn bounds_for(kind: TextKind, spec: &TextMatchSpec) -> (f64, Option<f64>) {
    match kind {
        TextKind::Requires => (spec.min.unwrap_or(1.0), spec.max),
        TextKind::Forbids => (spec.min.unwrap_or(0.0), Some(spec.max.unwrap_or(0.0))),
    }
}

/// The inputs to [`build_text_findings`] — one entry's match result plus its scope.
pub struct TextFindingInput<'a> {
    /// presence or absence
    pub kind: TextKind,
    /// the entry being checked
    pub spec: &'a TextMatchSpec,
    /// what matching found
    pub result: TextMatchResult,
    /// the scope's stable key, for id synthesis (`doc` for the whole document)
    pub scope_key: &'a str,
    /// a human label for the scope in messages (defaults from `scope_key`)
    pub scope: Option<&'a str>,
    /// the scope's heading position — a miss / count violation pins here; `None` ⇒ document-level
    pub scope_pos: Option<SourcePos>,
}

/// Render a bound as JS `String(n)` would (no trailing `.0` on an integral bound).
fn render_bound(n: f64) -> String {
    if n.fract() == 0.0 && n.is_finite() {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

/// Turn one entry's match result into its findings:
/// a `requires` miss at the scope heading (document-level when unscoped), a
/// `forbids` hit PER occurrence at the offending line, a bound violation as one
/// `text/count` at the heading. Each message carries the spec's `note`; `level` rides
/// from the spec when set, else the registry default.
pub fn build_text_findings(input: TextFindingInput<'_>, ctx: &Ctx) -> Vec<Finding> {
    let (min, max) = bounds_for(input.kind, input.spec);
    let repr = spec_repr(input.spec);
    let note = input
        .spec
        .note
        .as_deref()
        .map(|n| format!(" — {n}"))
        .unwrap_or_default();
    let count = input.result.count;

    let count_finding = |expected: String| -> Finding {
        let mut spec = FindingSpec::new(
            synthesize_text_id(TextFindingKind::Count, input.scope_key, input.spec),
            format!("{repr} found {count} times, expected {expected}{note}"),
        );
        if let Some(level) = input.spec.level {
            spec = spec.level(level);
        }
        if let Some(pos) = input.scope_pos {
            spec = spec.pos(pos);
        }
        ctx.finding(spec)
    };

    match input.kind {
        TextKind::Requires => {
            if (count as f64) < min {
                if min == 1.0 {
                    let mut spec = FindingSpec::new(
                        synthesize_text_id(TextFindingKind::Requires, input.scope_key, input.spec),
                        format!(
                            "required phrase {repr} not found in {}{note}",
                            scope_label(input.scope_key, input.scope)
                        ),
                    );
                    if let Some(level) = input.spec.level {
                        spec = spec.level(level);
                    }
                    if let Some(pos) = input.scope_pos {
                        spec = spec.pos(pos);
                    }
                    return vec![ctx.finding(spec)];
                }
                return vec![count_finding(format!("at least {}", render_bound(min)))];
            }
            if let Some(max) = max
                && (count as f64) > max
            {
                return vec![count_finding(format!("at most {}", render_bound(max)))];
            }
            vec![]
        }
        TextKind::Forbids => {
            let max = max.unwrap_or(0.0);
            if (count as f64) <= max {
                return vec![];
            }
            if max == 0.0 {
                return input
                    .result
                    .positions
                    .iter()
                    .map(|pos| {
                        let mut spec = FindingSpec::new(
                            synthesize_text_id(
                                TextFindingKind::Forbids,
                                input.scope_key,
                                input.spec,
                            ),
                            format!("forbidden phrase {repr} present{note}"),
                        );
                        if let Some(level) = input.spec.level {
                            spec = spec.level(level);
                        }
                        ctx.finding(spec.pos(*pos))
                    })
                    .collect();
            }
            vec![count_finding(format!("at most {}", render_bound(max)))]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::Registry;

    fn pattern(p: &str) -> TextMatchSpec {
        TextMatchSpec {
            pattern: Some(p.into()),
            ..Default::default()
        }
    }

    // Contract first: a literal matches, counts, and pins 1-based line/col.
    #[test]
    fn literal_pattern_counts_and_positions() {
        let r = match_text("alpha beta\ngamma beta", &pattern("beta"));
        assert_eq!(r.count, 2);
        assert_eq!(r.positions, vec![SourcePos::at(1, 7), SourcePos::at(2, 7)]);
    }

    #[test]
    fn normalize_lets_a_wrapped_phrase_match() {
        let spec = pattern("the decision outcome");
        assert_eq!(
            match_text("we name the decision\noutcome here", &spec).count,
            1
        );
        let exact = TextMatchSpec {
            normalize: Some(false),
            ..pattern("the decision outcome")
        };
        assert_eq!(
            match_text("we name the decision\noutcome here", &exact).count,
            0
        );
    }

    #[test]
    fn ignore_case_folds_and_regex_sources_pass_through() {
        let spec = TextMatchSpec {
            ignore_case: Some(true),
            ..pattern("done")
        };
        assert_eq!(match_text("DONE and Done", &spec).count, 2);
        let re = TextMatchSpec {
            regex: Some("LEASE-(CONFLICT|MISSING) ref=".into()),
            ..Default::default()
        };
        assert_eq!(match_text("saw LEASE-CONFLICT ref=42", &re).count, 1);
    }

    // The load-bearing contract: hashes must equal the TS engine's — the corpus goldens
    // pin these exact ids.
    #[test]
    fn synthesized_ids_match_the_ts_goldens() {
        assert_eq!(
            synthesize_text_id(TextFindingKind::Requires, "summary", &pattern("outcome")),
            "text/requires/summary/1tc7itx"
        );
        assert_eq!(
            synthesize_text_id(
                TextFindingKind::Forbids,
                "doc",
                &TextMatchSpec {
                    normalize: Some(false),
                    ..pattern("}scripts/")
                }
            ),
            "text/forbids/doc/o9pijh"
        );
        assert_eq!(
            synthesize_text_id(TextFindingKind::Count, "checklist", &pattern("DONE")),
            "text/count/checklist/9ms6i7"
        );
        assert_eq!(
            synthesize_text_id(
                TextFindingKind::Requires,
                "failureModes",
                &TextMatchSpec {
                    regex: Some("LEASE-(CONFLICT|MISSING) ref=".into()),
                    ..Default::default()
                }
            ),
            "text/requires/failureModes/17j7bdw"
        );
    }

    #[test]
    fn explicit_id_wins_over_synthesis() {
        let spec = TextMatchSpec {
            id: Some("my/id".into()),
            ..pattern("x")
        };
        assert_eq!(
            synthesize_text_id(TextFindingKind::Requires, "s", &spec),
            "my/id"
        );
    }

    #[test]
    fn requires_miss_forbids_hits_and_count_violations() {
        let registry = Registry::default();
        let ctx = Ctx::new("doc.md", &registry);
        // A requires miss pins the scope heading.
        let out = build_text_findings(
            TextFindingInput {
                kind: TextKind::Requires,
                spec: &pattern("outcome"),
                result: match_text("nothing here", &pattern("outcome")),
                scope_key: "summary",
                scope: Some("Summary"),
                scope_pos: Some(SourcePos::at(1, 1)),
            },
            &ctx,
        );
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].id, "text/requires/summary/1tc7itx");
        assert_eq!(
            out[0].message,
            "required phrase \"outcome\" not found in Summary"
        );
        assert_eq!(out[0].pos, Some(SourcePos::at(1, 1)));

        // Forbids emits one finding per hit at the offending line.
        let spec = pattern("TODO");
        let out = build_text_findings(
            TextFindingInput {
                kind: TextKind::Forbids,
                spec: &spec,
                result: match_text("TODO a\nb TODO", &spec),
                scope_key: "doc",
                scope: None,
                scope_pos: None,
            },
            &ctx,
        );
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].pos, Some(SourcePos::at(1, 1)));
        assert_eq!(out[1].pos, Some(SourcePos::at(2, 3)));

        // A shortfall against min: 2 is one text/count at the heading.
        let spec = TextMatchSpec {
            min: Some(2.0),
            ..pattern("DONE")
        };
        let out = build_text_findings(
            TextFindingInput {
                kind: TextKind::Requires,
                spec: &spec,
                result: match_text("DONE once", &spec),
                scope_key: "checklist",
                scope: Some("Checklist"),
                scope_pos: Some(SourcePos::at(1, 1)),
            },
            &ctx,
        );
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].id, "text/count/checklist/9ms6i7");
        assert_eq!(
            out[0].message,
            "\"DONE\" found 1 times, expected at least 2"
        );
    }
}
