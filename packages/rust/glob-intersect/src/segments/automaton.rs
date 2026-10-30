//! L0 — per-segment glob automaton.
//!
//! Compiles a single glob segment (`*`, `?`, `[...]` classes incl. negated
//! `[!...]`, `{a,b}` alternation) into a character-level NFA, and answers the
//! primitive question the sequence product needs: do two segment matchers share
//! a common concrete string, and if so what is one such string
//! ([`common_segment`])?
//!
//! `*` is a run of characters (zero or more); `?` is exactly one; `{a,b}` is NFA
//! alternation — never eager string expansion. [`Options`] (`case_insensitive`,
//! `dot`) apply at this character level: a leading-dot input is matchable only
//! by a branch that BEGINS WITH A LITERAL DOT TOKEN (or has `dot` set) — carried
//! per edge (`CharEdge::dot_at_start`) and enforced at position 0 of the
//! product, so it survives a zero-width `*` without letting one `{...}` branch
//! decide the question for its siblings.
//!
//! # Ordering is part of the contract
//!
//! The witness a caller gets back is whichever common string the search reaches
//! first, so every traversal here is deliberately order-stable: adjacency lists
//! keep insertion order, the epsilon closure is the same stack walk the
//! TypeScript peer runs, and the candidate-character pool is built in the same
//! sequence (this side's literals, then the other side's, then the fallback
//! alphabet). Two tiers agree on `intersects` for free; they agree on `witness`
//! only because of this.

use std::collections::{HashMap, HashSet, VecDeque};

use crate::{Error, Options};

/// One inclusive character range, e.g. `a-z` → `{ lo: 'a', hi: 'z' }`.
#[derive(Debug, Clone, Copy)]
struct ClassRange {
    lo: char,
    hi: char,
}

/// A predicate over a single input character on an NFA edge.
///
/// - `Any`: any character (`*`/`?`), optionally excluding a leading `.`.
/// - `Lit`: exactly the character `ch` (a leading `.` is always allowed here).
/// - `Class`: a `[...]` set, possibly negated, optionally excluding `.`.
#[derive(Debug, Clone)]
enum CharPred {
    Any {
        exclude_dot: bool,
    },
    Lit {
        ch: char,
    },
    Class {
        negated: bool,
        ranges: Vec<ClassRange>,
        exclude_dot: bool,
    },
}

/// A character NFA edge that consumes one input character satisfying `pred`.
///
/// `dot_at_start` answers, for THIS edge: if it fires as the segment's first
/// character, may that character be a `.`? True only for a literal token that
/// begins its branch (or under `dot`) — the standard glob leading-dot rule. It
/// is per-edge, not per-segment, so a `{.x,*.env}` branch that begins with a
/// literal dot does not unlock dotfiles for the sibling branch beginning `*`.
#[derive(Debug, Clone)]
struct CharEdge {
    pred: CharPred,
    to: usize,
    dot_at_start: bool,
}

/// A compiled single-segment glob as a character NFA.
///
/// States are indices; `eps_out`/`char_out` are per-state adjacency;
/// `start`/`accept` are single states (concatenation and alternation funnel into
/// one accept).
///
/// The leading-dot rule rides on the edges (`CharEdge::dot_at_start`), because
/// it must survive a zero-width `*` — the rule is about the first *emitted*
/// character (position 0), which a zero-width `*` can hand off to a following
/// literal — while still being decided branch by branch. [`common_segment`]
/// enforces it at the segment-start position.
#[derive(Debug, Clone)]
pub(crate) struct SegmentMatcher {
    eps_out: Vec<Vec<usize>>,
    char_out: Vec<Vec<CharEdge>>,
    start: usize,
    accept: usize,
}

// --- Tokenizer -------------------------------------------------------------

#[derive(Debug, Clone)]
enum Token {
    Lit(char),
    Star,
    Any,
    Class {
        negated: bool,
        ranges: Vec<ClassRange>,
    },
    Alt(Vec<Vec<Token>>),
}

/// The deepest `{` nesting the tokenizer accepts. One more is `PATTERN_TOO_DEEP`.
const MAX_BRACE_DEPTH: usize = 64;

/// What earlier segments of one pattern left open: a `{` or `[` that found no
/// closer in its own segment. A later segment that holds a stray closer then
/// shows a group or class that spans a `/`.
pub(crate) struct SyntaxState {
    /// The whole pattern, for error messages.
    pattern: String,
    open_brace: bool,
    open_bracket: bool,
}

impl SyntaxState {
    pub(crate) fn new(pattern: String) -> Self {
        Self {
            pattern,
            open_brace: false,
            open_bracket: false,
        }
    }
}

fn unsupported(what: &str, pattern: &str) -> Error {
    Error::UnsupportedSyntax {
        pattern: pattern.to_string(),
        what: what.to_string(),
    }
}

/// Parse a glob segment into tokens. Unterminated `[`/`{` degrade to literals,
/// except where that hides unsupported syntax: a `{a..b}` number range, an
/// extglob such as `+(a|b)`, and (checked across the segments of one pattern via
/// `state`) a `{...}` group or `[...]` class that holds a `/`.
fn tokenize(glob: &[char], state: &mut SyntaxState) -> Result<Vec<Token>, Error> {
    let mut sc = Scan::new(glob);
    let (tokens, _) = parse_seq(&mut sc, 0, false, 0)?;
    let named = || {
        if state.pattern.is_empty() {
            glob.iter().collect::<String>()
        } else {
            state.pattern.clone()
        }
    };
    if sc.stray_brace && state.open_brace {
        return Err(unsupported("a {...} group cannot contain \"/\"", &named()));
    }
    if sc.stray_bracket && state.open_bracket {
        return Err(unsupported("a [...] class cannot contain \"/\"", &named()));
    }
    state.open_brace |= sc.open_brace;
    state.open_bracket |= sc.open_bracket;
    Ok(tokens)
}

/// The glob plus per-call memo state. `parse_alt(i)` depends only on the glob and
/// `i`, so each `{` is parsed once; without that, unclosed `{` nest the work
/// exponentially. `last_close` lets an unclosed `[` fail without a scan.
struct Scan<'a> {
    s: &'a [char],
    last_close: Option<usize>,
    alts: HashMap<usize, Option<(Token, usize)>>,
    /// A `{` or `[` fell back to a literal.
    open_brace: bool,
    open_bracket: bool,
    /// A `}` outside any group, or a `]` closing no class, was read as a literal.
    stray_brace: bool,
    stray_bracket: bool,
}

impl<'a> Scan<'a> {
    fn new(s: &'a [char]) -> Self {
        Scan {
            s,
            last_close: s.iter().rposition(|&c| c == ']'),
            alts: HashMap::new(),
            open_brace: false,
            open_bracket: false,
            stray_brace: false,
            stray_bracket: false,
        }
    }
}

/// Is there an unescaped `)` at or after `from`? An extglob needs one.
fn has_close_paren(s: &[char], from: usize) -> bool {
    let mut i = from;
    while i < s.len() {
        if s[i] == '\\' {
            i += 1;
        } else if s[i] == ')' {
            return true;
        }
        i += 1;
    }
    false
}

/// Parse a token sequence from `start`. When `inside_brace`, stop at a top-level
/// `,` or `}` (the delimiter is left for the caller). Returns the tokens and the
/// index of the stop character (or the input length). `depth` counts the `{`
/// groups being parsed around this sequence.
fn parse_seq(
    sc: &mut Scan,
    start: usize,
    inside_brace: bool,
    depth: usize,
) -> Result<(Vec<Token>, usize), Error> {
    let s = sc.s;
    let mut tokens = Vec::new();
    let mut i = start;
    while i < s.len() {
        let ch = s[i];
        if inside_brace && (ch == ',' || ch == '}') {
            break;
        }
        if matches!(ch, '?' | '*' | '+' | '@' | '!')
            && s.get(i + 1) == Some(&'(')
            && has_close_paren(s, i + 2)
        {
            return Err(unsupported(
                &format!("'{ch}(...)' is an extglob; escape the \"(\" to match it literally"),
                &s.iter().collect::<String>(),
            ));
        }
        match ch {
            '*' => {
                tokens.push(Token::Star);
                i += 1;
            }
            '?' => {
                tokens.push(Token::Any);
                i += 1;
            }
            '\\' => {
                // Escape: the next character is a literal.
                if i + 1 < s.len() {
                    tokens.push(Token::Lit(s[i + 1]));
                    i += 2;
                } else {
                    tokens.push(Token::Lit('\\'));
                    i += 1;
                }
            }
            '[' => match parse_class(sc, i) {
                Some((token, next)) => {
                    tokens.push(token);
                    i = next;
                }
                None => {
                    sc.open_bracket = true;
                    tokens.push(Token::Lit('['));
                    i += 1;
                }
            },
            '{' => match parse_alt(sc, i, depth + 1)? {
                Some((token, next)) => {
                    tokens.push(token);
                    i = next;
                }
                None => {
                    sc.open_brace = true;
                    tokens.push(Token::Lit('{'));
                    i += 1;
                }
            },
            _ => {
                if ch == '}' {
                    sc.stray_brace = true;
                } else if ch == ']' {
                    sc.stray_bracket = true;
                }
                tokens.push(Token::Lit(ch));
                i += 1;
            }
        }
    }
    Ok((tokens, i))
}

/// Parse a `[...]` class starting at `i` (`s[i] == '['`), or `None` if unterminated.
fn parse_class(sc: &Scan, i: usize) -> Option<(Token, usize)> {
    let s = sc.s;
    let mut j = i + 1;
    let mut negated = false;
    if matches!(s.get(j), Some('!') | Some('^')) {
        negated = true;
        j += 1;
    }
    // A closing `]` is never the first class character, and the scan below always
    // reaches any later `]`, so no `]` after `j` means unterminated.
    if !matches!(sc.last_close, Some(l) if l > j) {
        return None;
    }
    let mut ranges = Vec::new();
    let mut first = true;
    while j < s.len() {
        let c = s[j];
        if c == ']' && !first {
            return Some((Token::Class { negated, ranges }, j + 1));
        }
        first = false;
        if s.get(j + 1) == Some(&'-') && j + 2 < s.len() && s[j + 2] != ']' {
            ranges.push(ClassRange {
                lo: c,
                hi: s[j + 2],
            });
            j += 3;
        } else {
            ranges.push(ClassRange { lo: c, hi: c });
            j += 1;
        }
    }
    None // no closing "]"
}

/// Parse a `{a,b,...}` alternation starting at `i` (`s[i] == '{'`), or `None` if
/// unterminated. The depth is checked before the memo lookup, as the peer does.
fn parse_alt(sc: &mut Scan, i: usize, depth: usize) -> Result<Option<(Token, usize)>, Error> {
    if depth > MAX_BRACE_DEPTH {
        return Err(Error::PatternTooDeep);
    }
    if let Some(hit) = sc.alts.get(&i) {
        return Ok(hit.clone());
    }
    let result = parse_alt_uncached(sc, i, depth)?;
    sc.alts.insert(i, result.clone());
    Ok(result)
}

/// Is `text` a `{a..b}` or `{a..b..c}` number range body (`-?\d+..-?\d+(..-?\d+)?`)?
fn is_number_range(text: &str) -> bool {
    let parts: Vec<&str> = text.split("..").collect();
    (parts.len() == 2 || parts.len() == 3)
        && parts.iter().all(|p| {
            let digits = p.strip_prefix('-').unwrap_or(p);
            !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
        })
}

fn parse_alt_uncached(
    sc: &mut Scan,
    i: usize,
    depth: usize,
) -> Result<Option<(Token, usize)>, Error> {
    let s = sc.s;
    let mut j = i + 1;
    let mut alts: Vec<Vec<Token>> = Vec::new();
    loop {
        let (toks, next) = parse_seq(sc, j, true, depth)?;
        alts.push(toks);
        if next >= s.len() {
            return Ok(None); // unterminated
        }
        if s[next] == ',' {
            j = next + 1;
            continue;
        }
        // s[next] == '}'
        if alts.len() == 1 && is_number_range(&s[i + 1..next].iter().collect::<String>()) {
            return Err(unsupported(
                "a {a..b} number range is not expanded",
                &s.iter().collect::<String>(),
            ));
        }
        return Ok(Some((Token::Alt(alts), next + 1)));
    }
}

// --- NFA construction ------------------------------------------------------

#[derive(Debug, Clone, Copy)]
struct Frag {
    start: usize,
    accept: usize,
}

#[derive(Default)]
struct NfaBuilder {
    eps_out: Vec<Vec<usize>>,
    char_out: Vec<Vec<CharEdge>>,
}

impl NfaBuilder {
    fn new_state(&mut self) -> usize {
        self.eps_out.push(Vec::new());
        self.char_out.push(Vec::new());
        self.eps_out.len() - 1
    }

    fn add_eps(&mut self, from: usize, to: usize) {
        self.eps_out[from].push(to);
    }

    fn add_char(&mut self, from: usize, to: usize, pred: CharPred, dot_at_start: bool) {
        self.char_out[from].push(CharEdge {
            pred,
            to,
            dot_at_start,
        });
    }
}

/// Build the NFA fragment for a token sequence. `at_start` marks that the first
/// token sits at the segment start, where wildcards exclude a leading `.` when
/// `dot` is off.
fn build_fragment(b: &mut NfaBuilder, tokens: &[Token], at_start: bool, dot: bool) -> Frag {
    if tokens.is_empty() {
        let s = b.new_state();
        return Frag {
            start: s,
            accept: s,
        };
    }
    let mut cur: Option<Frag> = None;
    for (idx, tok) in tokens.iter().enumerate() {
        let f = build_token(b, tok, at_start && idx == 0, dot);
        cur = Some(match cur {
            None => f,
            Some(prev) => {
                b.add_eps(prev.accept, f.start);
                Frag {
                    start: prev.start,
                    accept: f.accept,
                }
            }
        });
    }
    // `tokens` is non-empty, so the loop ran at least once; the fallback keeps
    // this total without an unwrap.
    cur.unwrap_or(Frag {
        start: 0,
        accept: 0,
    })
}

fn build_token(b: &mut NfaBuilder, tok: &Token, at_start: bool, dot: bool) -> Frag {
    let exclude_dot = at_start && !dot;
    // Position 0 of the segment accepts a `.` only from a literal token that
    // begins this branch (or with `dot` on). Recorded per edge so a sibling
    // `{...}` branch cannot answer for this one.
    let dot_at_start = dot || (matches!(tok, Token::Lit(_)) && at_start);
    match tok {
        Token::Lit(ch) => {
            // A literal (including a literal `.`) always matches its character —
            // this is how `.env` matches a dotfile while `*` does not.
            let s = b.new_state();
            let e = b.new_state();
            b.add_char(s, e, CharPred::Lit { ch: *ch }, dot_at_start);
            Frag {
                start: s,
                accept: e,
            }
        }
        Token::Any => {
            let s = b.new_state();
            let e = b.new_state();
            b.add_char(s, e, CharPred::Any { exclude_dot }, dot_at_start);
            Frag {
                start: s,
                accept: e,
            }
        }
        Token::Class { negated, ranges } => {
            let s = b.new_state();
            let e = b.new_state();
            b.add_char(
                s,
                e,
                CharPred::Class {
                    negated: *negated,
                    ranges: ranges.clone(),
                    exclude_dot,
                },
                dot_at_start,
            );
            Frag {
                start: s,
                accept: e,
            }
        }
        Token::Star => {
            // Zero-or-more characters. `exclude_dot` keeps a *directly*
            // consumed first character off a dot; the zero-width case — where
            // the star consumes nothing and a following literal would otherwise
            // emit position 0 — is covered by that literal's own
            // `dot_at_start` being false.
            let s = b.new_state();
            let e = b.new_state();
            let p = b.new_state();
            b.add_eps(s, e); // zero characters
            b.add_char(s, p, CharPred::Any { exclude_dot }, dot_at_start); // first character
            b.add_char(p, p, CharPred::Any { exclude_dot: false }, dot_at_start); // subsequent characters
            b.add_eps(p, e);
            Frag {
                start: s,
                accept: e,
            }
        }
        Token::Alt(alts) => {
            let s = b.new_state();
            let e = b.new_state();
            for alt_tokens in alts {
                // Each branch's first token is itself at the segment start.
                let f = build_fragment(b, alt_tokens, at_start, dot);
                b.add_eps(s, f.start);
                b.add_eps(f.accept, e);
            }
            Frag {
                start: s,
                accept: e,
            }
        }
    }
}

/// Compile one glob segment (e.g. `"*.vue"`, `"handler.ts"`, `"[!a-z]"`) into a
/// matcher. Pass the same `state` for the segments of one pattern, in order, so
/// a `{` or `[` group that spans a `/` is caught.
///
/// # Errors
///
/// [`Error::PatternTooDeep`] or [`Error::UnsupportedSyntax`].
pub(crate) fn compile_segment(
    glob: &str,
    opts: &Options,
    state: &mut SyntaxState,
) -> Result<SegmentMatcher, Error> {
    let mut b = NfaBuilder::default();
    let chars: Vec<char> = glob.chars().collect();
    let tokens = tokenize(&chars, state)?;
    let frag = build_fragment(&mut b, &tokens, true, opts.dot);
    Ok(SegmentMatcher {
        eps_out: b.eps_out,
        char_out: b.char_out,
        start: frag.start,
        accept: frag.accept,
    })
}

/// Check every segment of `pattern` against the supported syntax without
/// building matchers.
///
/// # Errors
///
/// [`Error::PatternTooDeep`] or [`Error::UnsupportedSyntax`].
pub(crate) fn assert_supported<S: AsRef<str>>(pattern: &[S]) -> Result<(), Error> {
    let joined = pattern
        .iter()
        .map(AsRef::as_ref)
        .collect::<Vec<_>>()
        .join("/");
    let mut state = SyntaxState::new(joined);
    for seg in pattern {
        if seg.as_ref() != "**" {
            tokenize(&seg.as_ref().chars().collect::<Vec<_>>(), &mut state)?;
        }
    }
    Ok(())
}

// --- Character-set intersection -------------------------------------------

const FALLBACK: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-";

/// Case-insensitive means ASCII case-insensitive: `Ä` and `ä` are different
/// characters, and the Kelvin sign is not `k`.
fn char_eq(a: char, b: char, ci: bool) -> bool {
    a == b || (ci && a.eq_ignore_ascii_case(&b))
}

/// The other case of an ASCII letter; any other character is returned unchanged.
fn swap_case(ch: char) -> char {
    if ch.is_ascii_uppercase() {
        ch.to_ascii_lowercase()
    } else {
        ch.to_ascii_uppercase()
    }
}

fn in_range(ch: char, lo: char, hi: char, ci: bool) -> bool {
    let (cc, l, h) = (ch as u32, lo as u32, hi as u32);
    if cc >= l && cc <= h {
        return true;
    }
    if ci {
        let alt = swap_case(ch);
        if alt != ch {
            let ac = alt as u32;
            if ac >= l && ac <= h {
                return true;
            }
        }
    }
    false
}

fn test_char(pred: &CharPred, ch: char, ci: bool) -> bool {
    match pred {
        CharPred::Any { exclude_dot } => !(*exclude_dot && ch == '.'),
        CharPred::Lit { ch: want } => char_eq(ch, *want, ci),
        CharPred::Class {
            negated,
            ranges,
            exclude_dot,
        } => {
            if *exclude_dot && ch == '.' {
                return false;
            }
            let in_set = ranges.iter().any(|r| in_range(ch, r.lo, r.hi, ci));
            if *negated { !in_set } else { in_set }
        }
    }
}

/// Push a predicate's own characters onto the candidate pool, preserving
/// insertion order and skipping duplicates (the peer's `Set` semantics).
fn collect_candidates(pred: &CharPred, into: &mut Vec<char>, seen: &mut HashSet<char>) {
    let push = |c: char, into: &mut Vec<char>, seen: &mut HashSet<char>| {
        if seen.insert(c) {
            into.push(c);
        }
    };
    match pred {
        CharPred::Lit { ch } => push(*ch, into, seen),
        CharPred::Class { ranges, .. } => {
            for r in ranges {
                push(r.lo, into, seen);
                push(r.hi, into, seen);
            }
        }
        CharPred::Any { .. } => {}
    }
}

/// A single character both predicates accept, or `None`.
///
/// Tests every literal / range endpoint mentioned by either side plus a fixed
/// fallback alphabet — that pool covers literals, classes, negated classes, and
/// the any∩any case. When `disallow_dot` is set (the segment-start position
/// where a leading `.` is not permitted), `.` is skipped as a candidate so a
/// non-dot common character is still found when one exists.
///
/// If none is accepted, the characters just outside each class range are tried
/// ([`boundary_chars`]). That finds a common character for negated classes that
/// exclude the whole fallback alphabet.
fn common_char(p1: &CharPred, p2: &CharPred, ci: bool, disallow_dot: bool) -> Option<char> {
    let mut cands: Vec<char> = Vec::new();
    let mut seen: HashSet<char> = HashSet::new();
    collect_candidates(p1, &mut cands, &mut seen);
    collect_candidates(p2, &mut cands, &mut seen);
    for c in FALLBACK.chars() {
        if seen.insert(c) {
            cands.push(c);
        }
    }
    let ok = |c: char| !(disallow_dot && c == '.') && test_char(p1, c, ci) && test_char(p2, c, ci);
    cands
        .into_iter()
        .find(|&c| ok(c))
        .or_else(|| boundary_chars(p1, p2).into_iter().find(|&c| ok(c)))
}

/// Characters that cannot appear in a returned segment, or would be read back as
/// glob syntax.
const GLOB_SPECIAL: &[char] = &['/', '*', '?', '[', ']', '{', '}', ',', '\\'];

/// The characters just above and below each class range of either predicate. A
/// set of intervals that has a common point has one at such a boundary or at an
/// endpoint, so these decide the cases the fixed alphabet cannot. Plain
/// characters come first, so a witness avoids glob syntax when it can.
fn boundary_chars(p1: &CharPred, p2: &CharPred) -> Vec<char> {
    let mut plain = Vec::new();
    let mut special = Vec::new();
    let mut add = |cp: Option<u32>| {
        // `from_u32` rejects out-of-range code points and lone surrogates.
        if let Some(c) = cp.and_then(char::from_u32) {
            if GLOB_SPECIAL.contains(&c) {
                special.push(c);
            } else {
                plain.push(c);
            }
        }
    };
    for p in [p1, p2] {
        if let CharPred::Class { ranges, .. } = p {
            for r in ranges {
                add((r.hi as u32).checked_add(1));
                add((r.lo as u32).checked_sub(1));
            }
        }
    }
    plain.extend(special.into_iter().filter(|&c| c != '/'));
    plain
}

// --- Segment-matcher intersection -----------------------------------------

/// Epsilon closure of `from`, in the peer's stack-walk insertion order (the
/// order product expansion iterates, so it is part of the witness contract).
fn eps_closure(m: &SegmentMatcher, from: usize) -> Vec<usize> {
    let mut set = Vec::new();
    let mut seen = HashSet::new();
    let mut stack = vec![from];
    while let Some(s) = stack.pop() {
        if !seen.insert(s) {
            continue;
        }
        set.push(s);
        for &t in &m.eps_out[s] {
            stack.push(t);
        }
    }
    set
}

/// One concrete string accepted by BOTH segment matchers, or `None` when they
/// share none.
///
/// Runs a BFS over the synchronized product of the two character NFAs, recording
/// predecessors so the shortest common string is reconstructed. A literal on
/// either side pins the character, so common substrings driven by a literal are
/// exact (which is what witness reconstruction relies on).
///
/// The shortest common string is preferred EXCEPT for the empty one: two
/// zero-width-capable matchers (`*` ∩ `*`) both accept `""`, but no real path
/// segment is empty, and an empty FINAL witness segment round-trips through
/// [`crate::parse`] and vanishes — yielding a path that matches neither side. So
/// `""` is held back as a fallback and returned only when the two share nothing
/// else (which a pattern segment that can only be empty, such as `{,x}` or the
/// empty segment of `a//b`, still needs).
pub(crate) fn common_segment(
    m1: &SegmentMatcher,
    m2: &SegmentMatcher,
    opts: &Options,
) -> Option<String> {
    let ci = opts.case_insensitive;
    let stride = m2.eps_out.len();
    let key = |a: usize, b: usize| a * stride + b;
    let start = key(m1.start, m2.start);
    let mut visited: HashSet<usize> = HashSet::from([start]);
    let mut queue: VecDeque<usize> = VecDeque::from([start]);
    let mut pred: HashMap<usize, (usize, char)> = HashMap::new();
    let mut empty_accepted = false;

    while let Some(st) = queue.pop_front() {
        let a = st / stride;
        let b = st % stride;
        let ca = eps_closure(m1, a);
        let cb = eps_closure(m2, b);

        if ca.contains(&m1.accept) && cb.contains(&m2.accept) {
            if st == start {
                // Both sides accept the empty string. Note it and keep searching
                // for a non-empty common string, which every real path segment
                // is.
                empty_accepted = true;
            } else {
                let mut chars: Vec<char> = Vec::new();
                let mut cur = st;
                while cur != start {
                    let Some(&(prev, ch)) = pred.get(&cur) else {
                        break;
                    };
                    chars.push(ch);
                    cur = prev;
                }
                chars.reverse();
                return Some(chars.into_iter().collect());
            }
        }

        // At the segment-start product state nothing has been consumed yet, so
        // the next character emitted is position 0 of the shared segment. A
        // leading `.` is permitted there only when BOTH edges about to fire
        // allow one — otherwise a zero-width `*` on either side could let a
        // following literal `.` slip a dotfile through (`*.env` must not match
        // `.env` under `dot: false`, and must not start doing so because a
        // sibling brace branch begins with a dot).
        let at_segment_start = st == start;

        for &ua in &ca {
            for e1 in &m1.char_out[ua] {
                for &ub in &cb {
                    for e2 in &m2.char_out[ub] {
                        let disallow_dot =
                            at_segment_start && !(e1.dot_at_start && e2.dot_at_start);
                        let Some(c) = common_char(&e1.pred, &e2.pred, ci, disallow_dot) else {
                            continue;
                        };
                        let nk = key(e1.to, e2.to);
                        if visited.insert(nk) {
                            pred.insert(nk, (st, c));
                            queue.push_back(nk);
                        }
                    }
                }
            }
        }
    }
    if empty_accepted {
        Some(String::new())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn common(a: &str, b: &str, opts: Options) -> Option<String> {
        let compile = |glob: &str| {
            compile_segment(glob, &opts, &mut SyntaxState::new(String::new()))
                .expect("a supported test glob")
        };
        common_segment(&compile(a), &compile(b), &opts)
    }

    #[test]
    fn two_stars_share_a_real_segment_not_the_empty_one() {
        // `*` accepts zero characters, so the empty string IS common — but no
        // real path segment is empty, and an empty final witness segment does
        // not survive `parse`. The search therefore prefers a non-empty common
        // string and only falls back to `""`.
        assert_eq!(common("*", "*", Options::default()), Some("a".to_string()));
    }

    #[test]
    fn the_empty_segment_is_still_the_answer_when_it_is_the_only_one() {
        // A segment that can ONLY be empty (the middle segment of `a//b`, or an
        // empty brace branch) still overlaps a star. Collapsing this to "no
        // overlap" would make `a//b` unmatchable by `a/*/b`.
        assert_eq!(common("", "*", Options::default()), Some(String::new()));
        assert_eq!(
            common("{,.a}", "*", Options::default()),
            Some(String::new())
        );
    }

    #[test]
    fn a_dotted_brace_branch_does_not_license_its_siblings() {
        // The `.x` branch begins with a literal dot; the `*.env` branch does
        // not, and must keep excluding `.env` under the default `dot: false`.
        assert_eq!(common("{*.env,.x}", ".env", Options::default()), None);
        assert_eq!(
            common("{*.env,.x}", ".x", Options::default()),
            Some(".x".to_string())
        );
    }

    #[test]
    fn a_literal_pins_the_common_string() {
        assert_eq!(
            common("*.ts", "handler.ts", Options::default()),
            Some("handler.ts".to_string())
        );
    }

    #[test]
    fn an_unterminated_class_or_brace_degrades_to_a_literal() {
        assert_eq!(
            common("[abc", "[abc", Options::default()),
            Some("[abc".into())
        );
        assert_eq!(
            common("{a,b", "{a,b", Options::default()),
            Some("{a,b".into())
        );
    }

    #[test]
    fn many_unclosed_braces_tokenize_in_linear_time() {
        let glob = "{".repeat(28);
        let start = std::time::Instant::now();
        assert_eq!(common(&glob, &glob, Options::default()), Some(glob.clone()));
        let mixed = format!("{}[", "{a".repeat(28));
        assert!(common(&mixed, &mixed, Options::default()).is_some());
        assert!(start.elapsed() < std::time::Duration::from_secs(1));
    }

    #[test]
    fn a_negated_class_that_excludes_the_fallback_alphabet_still_meets_any() {
        let class = "[^a-zA-Z0-9._-]";
        assert!(common(class, "?", Options::default()).is_some());
        assert!(common(class, class, Options::default()).is_some());
    }

    #[test]
    fn an_escape_makes_the_next_character_literal() {
        assert!(common(r"\*", "*", Options::default()).is_some());
        assert!(common(r"\*", "x", Options::default()).is_none());
    }

    #[test]
    fn the_leading_dot_guard_survives_a_zero_width_star() {
        assert_eq!(common("*.env", ".env", Options::default()), None);
        assert_eq!(
            common(
                "*.env",
                ".env",
                Options {
                    dot: true,
                    ..Options::default()
                }
            ),
            Some(".env".to_string())
        );
    }

    #[test]
    fn a_negated_class_excludes_its_members() {
        assert!(common("[!0-9]", "5", Options::default()).is_none());
        assert!(common("[!0-9]", "a", Options::default()).is_some());
    }

    #[test]
    fn case_folding_is_ascii_only() {
        let ci = Options {
            case_insensitive: true,
            ..Options::default()
        };
        assert!(common("a", "A", ci).is_some());
        assert!(common("\u{e4}", "\u{c4}", ci).is_none());
        assert!(common("k", "\u{212a}", ci).is_none());
        assert!(common("[S]", "\u{df}", ci).is_none());
    }

    #[test]
    fn case_insensitivity_reaches_class_ranges() {
        let ci = Options {
            case_insensitive: true,
            ..Options::default()
        };
        assert!(common("[a-z]", "Q", ci).is_some());
        assert!(common("[a-z]", "Q", Options::default()).is_none());
    }
}
