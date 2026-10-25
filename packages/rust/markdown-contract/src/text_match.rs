//! The text-match core and the `text/*` findings, ported from the TS `text-match.ts`:
//!
//! 1. [`build_regex`] compiles a spec's needle once: a literal `pattern` (any whitespace
//!    run matches any whitespace run under `normalize`, the default; exact under
//!    `normalize: false`) or a `regex` source, with `ignoreCase` folding.
//! 2. [`match_text`] counts every occurrence and pins each to its 1-based line and
//!    column. The column counts UTF-16 units, as JS string indexing does.
//! 3. [`build_text_findings`] maps a match result and the entry's `min` / `max` to
//!    `text/requires`, `text/forbids` and `text/count` findings.
//! 4. [`synthesize_text_id`] gives the stable id `text/<kind>/<scopeKey>/<patternHash>`.
//!    The hash is the TS `shortHash` exactly (FNV-1a 32-bit over UTF-16 units, in
//!    base 36), because the corpus goldens pin these ids.
//!
//! `regex` sources use the `regex` crate's dialect, not JS's: there is no lookaround or
//! backreference, `\w`, `\d` and `\b` are Unicode-aware, matching works on code points
//! rather than UTF-16 units, and `ignoreCase` folds case by Unicode rules.

use regex::{Regex, RegexBuilder};

use crate::finding::{Finding, FindingLevel, SourcePos};
use crate::js;
use crate::registry::{Ctx, FindingSpec};

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

impl TextMatchSpec {
    /// The needle as it reads in a message: `"literal"` or `/source/`.
    pub(crate) fn repr(&self) -> String {
        if let Some(regex) = &self.regex {
            format!("/{regex}/")
        } else {
            format!("\"{}\"", self.pattern.as_deref().unwrap_or(""))
        }
    }
}

/// The result of [`match_text`]: the occurrence count and each hit's source position.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) struct TextMatchResult {
    pub(crate) count: usize,
    /// One entry per hit, in document order: the 1-based line and column of its start.
    pub(crate) positions: Vec<SourcePos>,
}

/// Whether a text constraint requires or forbids its needle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TextKind {
    Requires,
    Forbids,
}

/// The kind part of a text finding id: the presence and absence findings, or `count`
/// when a `min` or `max` is not met.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TextFindingKind {
    Requires,
    Forbids,
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

/// A literal pattern as a regex source in which each whitespace run matches any
/// whitespace run, so a phrase wrapped across lines still matches. Whitespace is JS `\s`.
fn normalized_pattern_source(pattern: &str) -> String {
    js::words(pattern)
        .map(escape_regex)
        .collect::<Vec<_>>()
        .join(&format!("{}+", js::SPACE_CLASS))
}

/// Why a spec's needle could not be compiled.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum NeedleError {
    /// The spec has neither `pattern` nor `regex`.
    Missing,
    /// The `regex` crate rejected the source (a syntax error or the size limit).
    Invalid(String),
}

/// Compile a spec's needle, the one place every caller builds it. `Ok(None)` is an
/// empty needle, which never matches.
pub(crate) fn build_regex(spec: &TextMatchSpec) -> Result<Option<Regex>, NeedleError> {
    let source = if let Some(regex) = &spec.regex {
        regex.clone()
    } else if let Some(pattern) = &spec.pattern {
        if spec.normalize.unwrap_or(true) {
            normalized_pattern_source(pattern)
        } else {
            escape_regex(pattern)
        }
    } else {
        return Err(NeedleError::Missing);
    };
    if source.is_empty() {
        return Ok(None);
    }
    RegexBuilder::new(&source)
        .case_insensitive(spec.ignore_case.unwrap_or(false))
        .build()
        .map(Some)
        .map_err(|e| NeedleError::Invalid(e.to_string()))
}

/// [`build_regex`] for a builder: a contract-authoring error panics, as the TS builders
/// throw.
///
/// # Panics
/// When the spec has no needle or its `regex` does not compile.
pub(crate) fn build_regex_or_panic(spec: &TextMatchSpec) -> Option<Regex> {
    build_regex(spec).unwrap_or_else(|e| match e {
        NeedleError::Missing => panic!("a match spec must supply one of `pattern` or `regex`"),
        NeedleError::Invalid(e) => panic!("invalid regex {}: {e}", spec.repr()),
    })
}

/// Maps increasing byte offsets in `text` to 1-based positions, scanning forward once.
/// The column counts UTF-16 units, as the TS `positionMapper` does.
struct PositionMapper<'a> {
    text: &'a str,
    scanned: usize,
    line: u32,
    col: u32,
}

impl PositionMapper<'_> {
    fn at(&mut self, offset: usize) -> SourcePos {
        for c in self.text[self.scanned..offset].chars() {
            if c == '\n' {
                self.line += 1;
                self.col = 0;
            } else {
                self.col += c.len_utf16() as u32;
            }
        }
        self.scanned = offset;
        SourcePos::at(self.line, self.col + 1)
    }
}

/// Every occurrence of `re` in `text`, as JS's global `exec` loop finds them in BMP text:
/// after an empty match the search moves on one character. Before a character outside
/// the BMP, JS steps one UTF-16 unit and counts one more empty match; this does not.
/// `None` (an empty needle) never matches.
pub(crate) fn match_text(text: &str, re: Option<&Regex>) -> TextMatchResult {
    let Some(re) = re else {
        return TextMatchResult::default();
    };
    let mut mapper = PositionMapper {
        text,
        scanned: 0,
        line: 1,
        col: 0,
    };
    let mut positions = Vec::new();
    let mut start = 0;
    while start <= text.len() {
        let Some(m) = re.find_at(text, start) else {
            break;
        };
        positions.push(mapper.at(m.start()));
        start = if m.end() > m.start() {
            m.end()
        } else {
            m.end() + text[m.end()..].chars().next().map_or(1, char::len_utf8)
        };
    }
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
        js::words(pattern).collect::<Vec<_>>().join(" ")
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
pub(crate) fn synthesize_text_id(
    kind: TextFindingKind,
    scope_key: &str,
    spec: &TextMatchSpec,
) -> String {
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

/// The inputs to [`build_text_findings`]: one entry's match result plus its scope.
pub(crate) struct TextFindingInput<'a> {
    pub(crate) kind: TextKind,
    pub(crate) spec: &'a TextMatchSpec,
    pub(crate) result: TextMatchResult,
    /// The scope's stable key for the finding id (`doc` for the whole document).
    pub(crate) scope_key: &'a str,
    /// The scope's name in messages (defaults from `scope_key`).
    pub(crate) scope: Option<&'a str>,
    /// The scope's heading position, where a miss or count finding pins; `None` is
    /// document-level.
    pub(crate) scope_pos: Option<SourcePos>,
}

/// Turn one entry's match result into its findings:
/// a `requires` miss at the scope heading (document-level when unscoped), a
/// `forbids` hit PER occurrence at the offending line, a bound violation as one
/// `text/count` at the heading. Each message carries the spec's `note`; `level` rides
/// from the spec when set, else the registry default.
pub(crate) fn build_text_findings(input: TextFindingInput<'_>, ctx: &Ctx) -> Vec<Finding> {
    let (min, max) = bounds_for(input.kind, input.spec);
    let repr = input.spec.repr();
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
                return vec![count_finding(format!("at least {}", js::num(min)))];
            }
            if let Some(max) = max
                && (count as f64) > max
            {
                return vec![count_finding(format!("at most {}", js::num(max)))];
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
            vec![count_finding(format!("at most {}", js::num(max)))]
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

    fn run(text: &str, spec: &TextMatchSpec) -> TextMatchResult {
        match_text(text, build_regex(spec).unwrap().as_ref())
    }

    fn regex(source: &str) -> TextMatchSpec {
        TextMatchSpec {
            regex: Some(source.into()),
            ..Default::default()
        }
    }

    // JS's global exec loop: an empty match counts, then the search moves on one
    // character, so `x*` over "ab" matches at 0, 1 and 2.
    #[test]
    fn empty_matches_count_as_in_js() {
        assert_eq!(run("ab", &regex("x*")).count, 3);
        assert_eq!(run("ab", &regex("a*")).count, 3);
        assert_eq!(run("é", &regex("")).count, 0); // an empty needle never matches
        assert_eq!(run("éa", &regex("x?")).count, 3);
    }

    #[test]
    fn columns_count_utf16_units_across_lines() {
        let r = run("😀 x\n y x", &pattern("x"));
        assert_eq!(r.positions, vec![SourcePos::at(1, 4), SourcePos::at(2, 4)]);
    }

    #[test]
    fn normalize_uses_js_whitespace() {
        // U+FEFF is JS whitespace; U+0085 is not.
        assert_eq!(run("a\u{FEFF}b", &pattern("a b")).count, 1);
        assert_eq!(run("a\u{85}b", &pattern("a b")).count, 0);
    }

    #[test]
    fn a_needle_the_regex_crate_rejects_is_an_error() {
        assert!(matches!(
            build_regex(&regex("(")),
            Err(NeedleError::Invalid(_))
        ));
        assert!(matches!(
            build_regex(&regex(r"(?=x)")),
            Err(NeedleError::Invalid(_))
        ));
        // Past the compiled-size limit.
        assert!(matches!(
            build_regex(&regex(r"\w{1000}{1000}")),
            Err(NeedleError::Invalid(_))
        ));
        assert_eq!(
            build_regex(&TextMatchSpec::default()).unwrap_err(),
            NeedleError::Missing
        );
    }

    // Contract first: a literal matches, counts, and pins 1-based line/col.
    #[test]
    fn literal_pattern_counts_and_positions() {
        let r = run("alpha beta\ngamma beta", &pattern("beta"));
        assert_eq!(r.count, 2);
        assert_eq!(r.positions, vec![SourcePos::at(1, 7), SourcePos::at(2, 7)]);
    }

    #[test]
    fn normalize_lets_a_wrapped_phrase_match() {
        let spec = pattern("the decision outcome");
        assert_eq!(run("we name the decision\noutcome here", &spec).count, 1);
        let exact = TextMatchSpec {
            normalize: Some(false),
            ..pattern("the decision outcome")
        };
        assert_eq!(run("we name the decision\noutcome here", &exact).count, 0);
    }

    #[test]
    fn ignore_case_folds_and_regex_sources_pass_through() {
        let spec = TextMatchSpec {
            ignore_case: Some(true),
            ..pattern("done")
        };
        assert_eq!(run("DONE and Done", &spec).count, 2);
        let re = TextMatchSpec {
            regex: Some("LEASE-(CONFLICT|MISSING) ref=".into()),
            ..Default::default()
        };
        assert_eq!(run("saw LEASE-CONFLICT ref=42", &re).count, 1);
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
                result: run("nothing here", &pattern("outcome")),
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
                result: run("TODO a\nb TODO", &spec),
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
                result: run("DONE once", &spec),
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
