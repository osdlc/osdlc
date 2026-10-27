//! Keys and values built from the characters YAML makes hard: indicators,
//! odd whitespace, line breaks, control characters, multi-byte and combining
//! text, bidi controls, case-folding traps, noncharacters, and scalars that
//! read as another type.
//!
//! Three tests, all deterministic. A failure prints the seed, so it replays.
//!
//! - [`every_sample_is_written_and_read_back`]: each sample of each category,
//!   alone, as a value and as a key, on a few host documents.
//! - [`random_mixes_are_written_and_read_back`]: random strings mixed from
//!   all categories. `YAML_SPLICE_FUZZ_ITERS` and `YAML_SPLICE_FUZZ_SEED`
//!   change the run.
//! - [`mutated_documents_never_panic`]: corpus documents with category
//!   characters spliced in at random places. Any result is fine except a
//!   panic, or output that does not parse.
//!
//! # Known failures
//!
//! One failure is known and pinned, not fixed: a U+FEFF (byte-order mark)
//! that an edit puts at byte zero (a key or value that starts with it, written
//! first, or a line that starts with it moved up by a `Remove`). The next
//! reader takes it for a BOM and drops it, so `"\u{feff}#c": x` reads back as
//! a comment. The crate's own result check misses it because it strips a BOM
//! only from the original input. [`BOM_AT_BYTE_ZERO`] counts these; the fix is
//! an open decision.
//!
//! One refusal is known: a string whose first non-empty line holds only
//! spaces, such as `" \n"` or `"\n \n"`. The emitter writes it as a `|+` block whose first line is blank to
//! a reader, so the spaces would be lost, and the result check refuses the
//! edit. npm `yaml` 2.9.0 writes the same text and loses the spaces.
//! [`BLANK_FIRST_LINE_REFUSED`] counts these.
//!
//! The oracle for the first two is the in-memory model in `tests/model`: an
//! edit on a document whose keys are plain must succeed and read back as the
//! model says. These run against the top-level edits that exist today; the
//! nested variants join when the path edits do.

mod model;

use std::collections::BTreeMap;
use std::panic::{AssertUnwindSafe, catch_unwind};

use model::{PathEdit, Seg, apply, read};
use yaml_splice::{EditError, FieldEdit, Value, edit_yaml};

const CATEGORIES: &[(&str, &[&str])] = &[
    (
        "indicator",
        &[
            ":", ": ", " #", "#", "-", "- ", "?", "? ", "[", "]", "{", "}", ",", "&", "*", "!",
            "|", ">", "'", "\"", "%", "@", "`", "\\", "<<", "&a", "*a", "!!str",
        ],
    ),
    (
        "whitespace",
        &[
            " ", "  ", "\t", "\u{a0}", "\u{2003}", "\u{3000}", "\u{200b}", "\u{feff}", "\u{2060}",
        ],
    ),
    (
        "line-break",
        &[
            "\n", "\r\n", "\r", "\n\n", "\u{85}", "\u{2028}", "\u{2029}", "\u{b}", "\u{c}",
        ],
    ),
    ("blank-line", &[" \n", "  \n\n", "\t\n", " \n x"]),
    (
        "control",
        &[
            "\0", "\u{1}", "\u{7}", "\u{8}", "\u{1b}", "\u{7f}", "\u{80}", "\u{9f}",
        ],
    ),
    (
        "multi-byte",
        &[
            "é",
            "ж",
            "中",
            "日本語",
            "𝔘",
            "😀",
            "👩\u{200d}👩\u{200d}👧",
            "🏳\u{fe0f}\u{200d}🌈",
        ],
    ),
    (
        "combining",
        &["e\u{301}", "\u{301}", "a\u{20dd}", "Z\u{324}\u{308}"],
    ),
    (
        "bidi",
        &["\u{202e}", "\u{200f}", "\u{200e}", "\u{2066}", "ש", "مرحبا"],
    ),
    (
        "case-trap",
        &[
            "ß", "SS", "İ", "ı", "ς", "σ", "Σ", "\u{212a}", "ﬁ", "Ǆ", "ǅ",
        ],
    ),
    (
        "nonchar",
        &["\u{fffe}", "\u{ffff}", "\u{e000}", "\u{10ffff}", "\u{fffd}"],
    ),
    (
        "lookalike",
        &[
            "",
            "true",
            "False",
            "null",
            "~",
            "NULL",
            "1e3",
            "0x1F",
            "0o17",
            ".inf",
            "-.Inf",
            ".nan",
            "+1",
            "1_000",
            "2026-10-26",
            "yes",
            "on",
            "-",
            "---",
            "...",
            "- a",
            "a: b",
            "#c",
            "@x",
            "%YAML",
            "=",
        ],
    ),
];

/// How many edits of the default runs put a U+FEFF at byte zero: every
/// sample, random mixes, mutated documents. Only checked when the seed and the
/// iteration count are the defaults.
const BOM_AT_BYTE_ZERO: [usize; 3] = [3, 6, 1];

/// How many edits of the default runs are refused for a first non-empty
/// line of only spaces: every sample, random mixes.
const BLANK_FIRST_LINE_REFUSED: [usize; 2] = [16, 34];

/// A string the emitter cannot write: its first line that is not empty
/// holds only spaces or tabs, and a line break follows it.
fn blank_first_line(edit: &FieldEdit) -> bool {
    let FieldEdit::Set {
        value: Value::Str(s),
        ..
    } = edit
    else {
        return false;
    };
    let mut lines = s.split('\n');
    let first = lines.by_ref().find(|l| !l.is_empty());
    first.is_some_and(|l| l.trim_matches([' ', '\t']).is_empty()) && lines.next().is_some()
}

/// Whether `out` gained a U+FEFF at byte zero that `src` did not have.
fn bom_moved_to_byte_zero(src: &str, out: &str) -> bool {
    out.starts_with('\u{feff}') && !src.starts_with('\u{feff}')
}

/// Documents the edits run on. Their keys fold to distinct lowercase forms,
/// so no fuzzed key can be ambiguous with two of them.
const HOSTS: &[&str] = &[
    "title: Draft\nn: 1\n",
    "# c\ntitle: 'q' # t\nlist: [a, b]\nbody: |\n  l1\n",
    "title: Draft\r\nn: 1\r\n",
    "",
];

#[test]
fn every_sample_is_written_and_read_back() {
    let mut report = Report::default();
    for (category, samples) in CATEGORIES {
        for sample in *samples {
            for host in HOSTS {
                for edit in edits_for(host, sample, sample) {
                    report.check(category, host, &edit);
                }
            }
        }
    }
    report.finish(
        "every sample",
        Some((BOM_AT_BYTE_ZERO[0], BLANK_FIRST_LINE_REFUSED[0])),
    );
}

#[test]
fn random_mixes_are_written_and_read_back() {
    let seed = env_u64("YAML_SPLICE_FUZZ_SEED").unwrap_or(0x5eed_1a71);
    let iters = env_u64("YAML_SPLICE_FUZZ_ITERS").unwrap_or(3_000);
    let mut rng = Rng(seed);
    let mut report = Report::default();
    for _ in 0..iters {
        let key = rng.mix(4);
        let value = rng.mix(6);
        let host = HOSTS[rng.below(HOSTS.len())];
        for edit in edits_for(host, &key, &value) {
            report.check("mix", host, &edit);
        }
    }
    let defaults = std::env::var_os("YAML_SPLICE_FUZZ_SEED").is_none()
        && std::env::var_os("YAML_SPLICE_FUZZ_ITERS").is_none();
    report.finish(
        &format!("random mixes (seed {seed:#x}, {iters} iterations)"),
        defaults.then_some((BOM_AT_BYTE_ZERO[1], BLANK_FIRST_LINE_REFUSED[1])),
    );
}

#[test]
fn mutated_documents_never_panic() {
    let seed = env_u64("YAML_SPLICE_FUZZ_SEED").unwrap_or(0x5eed_1a71);
    let iters = env_u64("YAML_SPLICE_FUZZ_ITERS").unwrap_or(3_000);
    let mut rng = Rng(seed);
    let sources: Vec<String> = corpus_sources();
    let mut failures = Vec::new();
    let mut known = 0;
    for i in 0..iters {
        let mut src = sources[rng.below(sources.len())].clone();
        for _ in 0..=rng.below(3) {
            let at = rng.char_boundary(&src);
            src.insert_str(at, rng.sample());
        }
        let edits = [
            FieldEdit::Set {
                key: rng.mix(2),
                value: Value::from(rng.mix(3)),
            },
            FieldEdit::Remove { key: "a".into() },
            FieldEdit::Rename {
                from: "title".into(),
                to: rng.mix(2),
            },
        ];
        for edit in edits {
            let run = catch_unwind(AssertUnwindSafe(|| {
                edit_yaml(src.as_bytes(), std::slice::from_ref(&edit))
            }));
            match run {
                Err(_) => failures.push(format!("  #{i} panicked: {edit:?} on {src:?}")),
                Ok(Ok(out)) if out.changed => {
                    let text = String::from_utf8(out.bytes).expect("UTF-8 output");
                    if bom_moved_to_byte_zero(&src, &text) {
                        known += 1;
                    } else if read(&text).is_err() {
                        failures.push(format!("  #{i} unparseable output for {edit:?} on {src:?}"));
                    }
                }
                Ok(_) => {}
            }
        }
    }
    assert!(
        failures.is_empty(),
        "seed {seed:#x}: {} failures:\n{}",
        failures.len(),
        failures
            .iter()
            .take(30)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
    let defaults = std::env::var_os("YAML_SPLICE_FUZZ_SEED").is_none()
        && std::env::var_os("YAML_SPLICE_FUZZ_ITERS").is_none();
    if defaults {
        assert_eq!(
            known, BOM_AT_BYTE_ZERO[2],
            "edits that put a U+FEFF at byte zero"
        );
    }
}

// --- edits and oracle ------------------------------------------------------

/// A `Set` of a new key, a `Set` of an existing key, and a `Rename` of an
/// existing key to the fuzzed name.
fn edits_for(host: &str, key: &str, value: &str) -> Vec<FieldEdit> {
    let mut edits = vec![
        FieldEdit::Set {
            key: key.to_string(),
            value: Value::from(value),
        },
        FieldEdit::Set {
            key: "title".to_string(),
            value: Value::from(value),
        },
    ];
    if host.contains("title") {
        edits.push(FieldEdit::Rename {
            from: "title".to_string(),
            to: key.to_string(),
        });
    }
    edits
}

fn as_path_edit(edit: &FieldEdit) -> PathEdit {
    match edit {
        FieldEdit::Set { key, value } => PathEdit::Set(vec![Seg::Key(key.clone())], value.clone()),
        FieldEdit::Remove { key } => PathEdit::Remove(vec![Seg::Key(key.clone())]),
        FieldEdit::Rename { from, to } => {
            PathEdit::Rename(vec![Seg::Key(from.clone())], to.clone())
        }
        other => unreachable!("not built here: {other:?}"),
    }
}

/// Whether a refusal is the right answer: a rename onto a key the host
/// already has (case-folded) is a conflict.
fn refusal_expected(host: &str, edit: &FieldEdit, err: &EditError) -> bool {
    let FieldEdit::Rename { from, to } = edit else {
        return false;
    };
    let Ok(Value::Map(m)) = read(host) else {
        return false;
    };
    let fold = |s: &str| s.to_lowercase();
    matches!(err, EditError::KeyConflict { .. })
        && fold(to) != fold(from)
        && m.keys().any(|k| fold(k) == fold(to))
}

#[derive(Default)]
struct Report {
    checked: usize,
    bom_at_byte_zero: usize,
    blank_first_line: usize,
    by_category: BTreeMap<String, usize>,
    examples: Vec<String>,
}

impl Report {
    fn check(&mut self, category: &str, host: &str, edit: &FieldEdit) {
        self.checked += 1;
        let result = outcome(host, edit);
        if let Err(Failure::BomAtByteZero) = result {
            self.bom_at_byte_zero += 1;
        } else if let Err(Failure::BlankFirstLine) = result {
            self.blank_first_line += 1;
        } else if let Err(Failure::Other(msg)) = result {
            *self.by_category.entry(category.to_string()).or_insert(0) += 1;
            if self.examples.len() < 40 {
                self.examples
                    .push(format!("  [{category}] {edit:?} on {host:?}: {msg}"));
            }
        }
    }

    fn finish(self, what: &str, pinned: Option<(usize, usize)>) {
        let failed: usize = self.by_category.values().sum();
        assert!(
            failed == 0,
            "{what}: {failed} of {} edits failed, by category {:?}:\n{}",
            self.checked,
            self.by_category,
            self.examples.join("\n")
        );
        if let Some((bom, blank)) = pinned {
            assert_eq!(
                self.bom_at_byte_zero, bom,
                "{what}: edits that put a U+FEFF at byte zero"
            );
            assert_eq!(
                self.blank_first_line, blank,
                "{what}: edits refused for a first non-empty line of only spaces"
            );
        }
    }
}

enum Failure {
    /// The known failure: see the module docs.
    BomAtByteZero,
    /// The known refusal: see the module docs.
    BlankFirstLine,
    Other(String),
}

impl From<String> for Failure {
    fn from(msg: String) -> Self {
        Failure::Other(msg)
    }
}

impl From<&str> for Failure {
    fn from(msg: &str) -> Self {
        Failure::Other(msg.to_string())
    }
}

fn outcome(host: &str, edit: &FieldEdit) -> Result<(), Failure> {
    let run = catch_unwind(AssertUnwindSafe(|| {
        edit_yaml(host.as_bytes(), std::slice::from_ref(edit))
    }))
    .map_err(|_| "panicked".to_string())?;
    let out = match run {
        Ok(out) => out,
        Err(e) if refusal_expected(host, edit, &e) => return Ok(()),
        Err(EditError::InvalidResult { .. }) if blank_first_line(edit) => {
            return Err(Failure::BlankFirstLine);
        }
        Err(e) => return Err(format!("refused: {e}").into()),
    };
    let text = String::from_utf8(out.bytes).map_err(|_| "output is not UTF-8")?;
    if bom_moved_to_byte_zero(host, &text) {
        return Err(Failure::BomAtByteZero);
    }
    let mut want = read(host).map_err(|e| format!("host does not parse: {e}"))?;
    apply(&mut want, &as_path_edit(edit), false)?;
    let got = read(&text).map_err(|e| format!("output does not parse: {e}; output {text:?}"))?;
    if got != want {
        return Err(format!("output {text:?} reads as {got:?}").into());
    }
    Ok(())
}

// --- inputs ----------------------------------------------------------------

fn corpus_sources() -> Vec<String> {
    let mut out = Vec::new();
    for json in [
        include_str!("fixtures/conformance.json"),
        include_str!("fixtures/nested.json"),
    ] {
        let root: serde_json::Value = serde_json::from_str(json).expect("valid JSON");
        for fx in root.as_array().expect("an array") {
            if let Some(s) = fx.get("source").and_then(serde_json::Value::as_str) {
                out.push(s.to_string());
            }
        }
    }
    out
}

fn env_u64(name: &str) -> Option<u64> {
    let v = std::env::var(name).ok()?;
    match v.strip_prefix("0x") {
        Some(hex) => u64::from_str_radix(hex, 16).ok(),
        None => v.parse().ok(),
    }
}

/// SplitMix64: small, fast, and the same sequence on every platform.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }

    fn sample(&mut self) -> &'static str {
        let (_, samples) = CATEGORIES[self.below(CATEGORIES.len())];
        samples[self.below(samples.len())]
    }

    /// One to `max` samples, with plain letters between some of them.
    fn mix(&mut self, max: usize) -> String {
        let mut s = String::new();
        for _ in 0..=self.below(max) {
            if self.below(2) == 0 {
                s.push_str("ab");
            }
            s.push_str(self.sample());
        }
        s
    }

    fn char_boundary(&mut self, s: &str) -> usize {
        let bounds: Vec<usize> = s.char_indices().map(|(i, _)| i).chain([s.len()]).collect();
        bounds[self.below(bounds.len())]
    }
}
