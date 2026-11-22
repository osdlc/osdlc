//! The direct match a compiled pattern runs over a concrete path, checked
//! against the product search over the path quoted into a literal pattern
//! ([`super::matches_by_search`]), on generated patterns and paths under every
//! [`Options`] value.
//!
//! The generator is a fixed-seed SplitMix64, so every run checks the same
//! cases. Paths are drawn partly by sampling a pattern (so many match) and
//! partly at random from an alphabet that holds glob characters, dots, upper
//! case and non-ASCII letters.

use super::*;

/// SplitMix64: small, deterministic, good enough to spread test cases.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A number in `0..n`.
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }

    fn chance(&mut self, percent: usize) -> bool {
        self.below(100) < percent
    }

    fn pick<T: Copy>(&mut self, items: &[T]) -> T {
        items[self.below(items.len())]
    }
}

/// Characters a literal or a path segment is built from: plain letters in both
/// cases, a dot, separators-in-names, non-ASCII letters (one whose case does
/// not fold under ASCII rules, the Kelvin sign, `ß`), and every glob
/// character, so a path can hold text a pattern would read as syntax.
const TEXT: &[char] = &[
    'a', 'a', 'a', 'b', 'b', 'A', 'B', 'z', '.', '.', '-', '_', ' ', '0', 'é', 'É', 'ä', 'Ä', '日',
    '\u{212a}', 'k', 'ß', 's', '*', '?', '[', ']', '{', '}', '(', ')', ',', '!', '^', '\\', '+',
    '@', '|',
];

/// The narrow alphabet most generated text uses, so patterns and paths meet.
const NARROW: &[char] = &['a', 'a', 'b', 'A', '.'];

/// One token of a generated segment, kept as a tree so a path can be sampled
/// from it as well as the pattern text rendered.
#[derive(Clone, Debug)]
enum Tok {
    /// A literal character; a glob character is escaped when rendered.
    Lit(char),
    Star,
    Any,
    Class {
        negated: char,
        ranges: Vec<(char, char)>,
    },
    Alt(Vec<Vec<Tok>>),
    /// Text rendered verbatim: unterminated groups, stray closers, a trailing
    /// backslash, a `**` inside a segment, and syntax the crate refuses.
    Raw(&'static str),
}

/// Verbatim fragments, chosen to reach every tokenizer branch.
const RAW: &[&str] = &[
    "[ab",
    "{a,b",
    "]",
    "}",
    "\\",
    "**",
    "a**",
    "(",
    ")",
    "[]a]",
    "[!]",
    "[a-]",
    "[-a]",
    "{}",
    "{,}",
    "{a}",
    ",",
    "!",
    "^",
    "[^a-zA-Z0-9._-]",
    "[\\]]",
    "[.]",
    "[z-a]",
    "+(a|b)",
    "!(b)",
    "{1..3}",
    "@(",
    "?(x)",
    "*(y)",
    "{a..b}",
    "{-1..2..1}",
];

#[derive(Clone, Debug)]
enum Seg {
    Globstar,
    Toks(Vec<Tok>),
}

fn gen_char(rng: &mut Rng) -> char {
    if rng.chance(80) {
        rng.pick(NARROW)
    } else {
        rng.pick(TEXT)
    }
}

fn gen_toks(rng: &mut Rng, depth: usize) -> Vec<Tok> {
    let n = rng.below(4) + usize::from(rng.chance(60));
    (0..n).map(|_| gen_tok(rng, depth)).collect()
}

fn gen_tok(rng: &mut Rng, depth: usize) -> Tok {
    match rng.below(100) {
        0..=34 => Tok::Lit(gen_char(rng)),
        35..=54 => Tok::Star,
        55..=64 => Tok::Any,
        65..=74 => {
            let negated = rng.pick(&['\0', '\0', '!', '^']);
            let ranges = (0..rng.below(3) + 1)
                .map(|_| {
                    let lo = gen_char(rng);
                    if rng.chance(40) {
                        let hi = rng.pick(&['b', 'z', 'Z', '日', '.', 'é']);
                        (lo, hi)
                    } else {
                        (lo, lo)
                    }
                })
                .collect();
            Tok::Class { negated, ranges }
        }
        75..=91 if depth < 3 => {
            let alts = (0..rng.below(3) + 1)
                .map(|_| gen_toks(rng, depth + 1))
                .collect();
            Tok::Alt(alts)
        }
        75..=91 => Tok::Star,
        _ => Tok::Raw(rng.pick(RAW)),
    }
}

fn gen_pattern(rng: &mut Rng) -> (Vec<Seg>, bool) {
    let n = rng.below(5) + 1;
    let segs = (0..n)
        .map(|_| {
            if rng.chance(25) {
                Seg::Globstar
            } else {
                Seg::Toks(gen_toks(rng, 0))
            }
        })
        .collect();
    (segs, rng.chance(10))
}

fn render_toks(toks: &[Tok], inside_brace: bool, out: &mut String) {
    for t in toks {
        match t {
            Tok::Lit(c) => {
                let meta = matches!(c, '\\' | '*' | '?' | '[' | ']' | '{' | '}' | '(')
                    || (inside_brace && *c == ',');
                if meta {
                    out.push('\\');
                }
                out.push(*c);
            }
            Tok::Star => out.push('*'),
            Tok::Any => out.push('?'),
            Tok::Class { negated, ranges } => {
                out.push('[');
                if *negated != '\0' {
                    out.push(*negated);
                }
                // Verbatim: a class has no escapes, so a `]` member may close
                // it early, which is one more shape to check.
                for &(lo, hi) in ranges {
                    out.push(lo);
                    if lo != hi {
                        out.push('-');
                        out.push(hi);
                    }
                }
                out.push(']');
            }
            Tok::Alt(alts) => {
                out.push('{');
                for (i, a) in alts.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    render_toks(a, true, out);
                }
                out.push('}');
            }
            Tok::Raw(s) => out.push_str(s),
        }
    }
}

fn render(segs: &[Seg], trailing: bool) -> String {
    let mut out = String::new();
    for (i, s) in segs.iter().enumerate() {
        if i > 0 {
            out.push('/');
        }
        match s {
            Seg::Globstar => out.push_str("**"),
            Seg::Toks(t) => render_toks(t, false, &mut out),
        }
    }
    if trailing {
        out.push('/');
    }
    out
}

fn random_text(rng: &mut Rng, max: usize) -> String {
    (0..rng.below(max + 1)).map(|_| gen_char(rng)).collect()
}

fn sample_toks(rng: &mut Rng, toks: &[Tok], out: &mut String) {
    for t in toks {
        match t {
            Tok::Lit(c) => {
                // Sometimes the other ASCII case, to exercise `case_insensitive`.
                if rng.chance(15) {
                    out.push(if c.is_ascii_uppercase() {
                        c.to_ascii_lowercase()
                    } else {
                        c.to_ascii_uppercase()
                    });
                } else {
                    out.push(*c);
                }
            }
            Tok::Star => out.push_str(&random_text(rng, 3)),
            Tok::Any => out.push(gen_char(rng)),
            Tok::Class { ranges, .. } => {
                let (lo, hi) = ranges[rng.below(ranges.len())];
                out.push(if rng.chance(50) { lo } else { hi });
            }
            Tok::Alt(alts) => {
                let branch = rng.below(alts.len());
                sample_toks(rng, &alts[branch], out);
            }
            Tok::Raw(s) => out.push_str(s),
        }
    }
}

/// A path drawn from the pattern, then perhaps nudged off it.
fn sample_path(rng: &mut Rng, segs: &[Seg]) -> String {
    let mut parts: Vec<String> = Vec::new();
    for s in segs {
        match s {
            Seg::Globstar => {
                for _ in 0..rng.below(3) {
                    parts.push(random_text(rng, 3));
                }
            }
            Seg::Toks(t) => {
                let mut p = String::new();
                sample_toks(rng, t, &mut p);
                parts.push(p);
            }
        }
    }
    let mut path = parts.join("/");
    match rng.below(10) {
        0 => path.insert(0, '.'),
        1 => path.push('/'),
        2 => path.push_str("/x"),
        3 if !path.is_empty() => {
            let at = path.char_indices().map(|(i, _)| i).collect::<Vec<_>>();
            path.remove(at[rng.below(at.len())]);
        }
        _ => {}
    }
    path
}

/// A path unrelated to any pattern: empty segments, leading and trailing
/// separators, dot segments, glob characters, sometimes long.
fn random_path(rng: &mut Rng) -> String {
    let n = if rng.chance(5) {
        rng.below(40) + 10
    } else {
        rng.below(5)
    };
    let mut parts: Vec<String> = Vec::new();
    for _ in 0..n {
        parts.push(match rng.below(10) {
            0 => String::new(),
            1 => ".".to_string(),
            2 => "..".to_string(),
            3 => format!(".{}", random_text(rng, 3)),
            4 => (0..rng.below(8)).map(|_| rng.pick(TEXT)).collect(),
            5 => "a".repeat(rng.below(30)),
            _ => random_text(rng, 4),
        });
    }
    parts.join("/")
}

fn all_options() -> Vec<Options> {
    let mut all = Vec::new();
    for bits in 0..8 {
        all.push(Options {
            case_insensitive: bits & 1 != 0,
            dot: bits & 2 != 0,
            globstar_matches_zero: bits & 4 != 0,
        });
    }
    all
}

/// An error as the caller sees it: its code and its message.
fn outcome<T: std::fmt::Debug>(result: Result<T, Error>) -> Result<T, (String, String)> {
    result.map_err(|e| (e.code().to_string(), e.to_string()))
}

/// How many patterns the differential test generates: 1,000 by default
/// (10,000 path checks), or `GLOB_INTERSECT_DIFF_PATTERNS` for a longer run.
fn pattern_count() -> usize {
    std::env::var("GLOB_INTERSECT_DIFF_PATTERNS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(1_000)
}

#[test]
fn the_direct_match_agrees_with_the_product_search() {
    let mut rng = Rng(0x005E_ED0F_6105);
    let options = all_options();
    let mut per_option = [0usize; 8];
    let (mut matched, mut refused) = (0usize, 0usize);
    let mut set: Vec<String> = Vec::new();
    for round in 0..pattern_count() {
        let (segs, trailing) = gen_pattern(&mut rng);
        let pattern = render(&segs, trailing);
        let paths: Vec<String> = (0..5)
            .map(|i| {
                if i < 3 {
                    sample_path(&mut rng, &segs)
                } else {
                    random_path(&mut rng)
                }
            })
            .collect();
        set.push(pattern.clone());
        if set.len() > 3 {
            set.remove(0);
        }
        // Two `Options` values per pattern, rotating through all eight. The
        // old route costs about a millisecond a call in a debug build, which
        // is what bounds the case count.
        for which in [(2 * round) % 8, (2 * round + 1) % 8] {
            let opts = options[which];
            let compiled = outcome(Matcher::new(&[&pattern], opts));
            for path in &paths {
                let old = outcome(matches_by_search(path, &pattern, opts));
                let new = compiled
                    .as_ref()
                    .map(|m| m.matches(path))
                    .map_err(Clone::clone);
                assert_eq!(new, old, "pattern {pattern:?}, path {path:?}, {opts:?}");
                assert_eq!(
                    outcome(matches(path, &[&pattern], opts)),
                    old,
                    "free matches: pattern {pattern:?}, path {path:?}, {opts:?}"
                );
                per_option[which] += 1;
                match old {
                    Ok(true) => matched += 1,
                    Err(_) => refused += 1,
                    Ok(false) => {}
                }
            }
        }
        // `which_match` over the last few patterns, against the old route run
        // pattern by pattern: the hits in order, or the first refusal.
        let (path, opts) = (&paths[0], options[round % 8]);
        let mut expected: Result<Vec<String>, (String, String)> = Ok(Vec::new());
        for p in &set {
            match outcome(matches_by_search(path, p, opts)) {
                Ok(true) => {
                    if let Ok(hits) = expected.as_mut() {
                        hits.push(p.clone());
                    }
                }
                Ok(false) => {}
                Err(e) => {
                    expected = Err(e);
                    break;
                }
            }
        }
        assert_eq!(
            outcome(which_match(path, &set, opts)),
            expected,
            "which_match: patterns {set:?}, path {path:?}, {opts:?}"
        );
    }
    // The generator must reach both answers and the refusals, under every
    // `Options` value, or it checks little.
    let checked: usize = per_option.iter().sum();
    assert!(
        per_option.iter().all(|&n| n * 10 >= checked),
        "{per_option:?}"
    );
    assert!(matched * 10 > checked, "{matched} of {checked} matched");
    assert!(
        refused > 0 && refused * 4 < checked,
        "{refused} of {checked} refused"
    );
    eprintln!("{checked} cases: {matched} matched, {refused} refused");
}

#[test]
fn many_wildcards_against_a_long_path_finish_quickly() {
    let opts = Options::default();
    let pattern = "**/a*a*a*a*a*b";
    let m = Matcher::new(&[pattern], opts).unwrap();
    let long_segment = "a".repeat(5_000);
    let deep = vec!["a"; 2_000].join("/");
    let mixed = format!("{deep}/{long_segment}");
    let start = std::time::Instant::now();
    for path in [&long_segment, &deep, &mixed] {
        assert!(!m.matches(path));
    }
    assert!(m.matches(&format!("{deep}/{long_segment}b")));
    let many = Matcher::new(&["**/*/**/*a*/**/*a*a*/**/b"], opts).unwrap();
    assert!(!many.matches(&deep));
    // Linear work: a few milliseconds even in a debug build. The bound is
    // loose so a slow machine does not fail it; exponential backtracking
    // would take far longer.
    assert!(start.elapsed() < std::time::Duration::from_secs(5));
    // The old route agrees on a short form of the same inputs.
    let short = "a".repeat(12);
    assert_eq!(
        matches_by_search(&short, pattern, opts).unwrap(),
        m.matches(&short)
    );
}

/// Realistic repository paths: nested folders, mixed extensions.
fn repository_paths(count: usize) -> Vec<String> {
    let mut rng = Rng(36_000);
    let roots = [
        "packages", "apps", "scripts", "docs", "src", "tools", ".github",
    ];
    let dirs = [
        "src",
        "lib",
        "components",
        "pages",
        "utils",
        "tests",
        "capabilities",
        "src-tauri",
        "app-frame",
        "ts",
        "rust",
        "assets",
        "styles",
        "node_modules",
        ".cache",
    ];
    let names = [
        "index", "main", "App", "button", "util", "package", "README", "config",
    ];
    let exts = [
        "ts", "tsx", "vue", "css", "json", "md", "rs", "js", "toml", "yaml", "png", "d.ts",
    ];
    (0..count)
        .map(|_| {
            let mut parts = vec![rng.pick(&roots).to_string()];
            for _ in 0..rng.below(6) {
                parts.push(rng.pick(&dirs).to_string());
            }
            parts.push(format!(
                "{}{}.{}",
                rng.pick(&names),
                rng.below(50),
                rng.pick(&exts)
            ));
            if rng.chance(3) {
                *parts.last_mut().unwrap() = "package.json".to_string();
            }
            parts.join("/")
        })
        .collect()
}

/// Times the direct match and the old product search over 36,000 generated
/// paths. Not a pass/fail check: run it in release with
/// `cargo test --release -p glob-intersect -- --ignored --nocapture time_`.
/// `GLOB_INTERSECT_OLD_PATHS` sets how many paths the old route times (all of
/// them by default).
#[test]
#[ignore = "a timing run, not a check"]
fn time_matching_repository_paths() {
    let paths = repository_paths(36_000);
    let old_count = std::env::var("GLOB_INTERSECT_OLD_PATHS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(paths.len());
    let sets: [&[&str]; 3] = [
        &["**/*.{vue,css,ts,tsx}"],
        &["**/package.json"],
        &[
            "scripts/a.ts",
            "packages/ts/app-frame/capabilities/*.json",
            "**/src-tauri/capabilities/*.json",
        ],
    ];
    let opts = Options::default();
    for set in sets {
        let start = std::time::Instant::now();
        let m = Matcher::new(set, opts).unwrap();
        let hits = paths.iter().filter(|p| m.matches(p)).count();
        let new = start.elapsed();
        let start = std::time::Instant::now();
        let old_hits = paths[..old_count]
            .iter()
            .filter(|p| set.iter().any(|q| matches_by_search(p, q, opts).unwrap()))
            .count();
        let old = start.elapsed();
        let new_hits = paths[..old_count].iter().filter(|p| m.matches(p)).count();
        assert_eq!(old_hits, new_hits);
        eprintln!(
            "{set:?}: {} paths, {hits} match; direct {new:?}; product search {old:?} for {old_count} paths",
            paths.len()
        );
    }
}
