//! The corpus runner: route a set of documents to contracts by glob, and return the
//! findings and an exit code, mirroring the TS `runner/corpus.ts`.
//!
//! The core does no I/O: [`run_corpus`] takes `(relative posix path, source)` pairs in
//! walk order, and validates each file against the first rule whose `include` matches
//! and whose `exclude` does not. The native layer walks a directory and reads only the
//! files a rule routes.
//!
//! Globs cover the common subset of picomatch with `{ dot: true }`: `*` never crosses
//! `/`, `**/` spans zero or more directories (so `**/*.md` covers the root and nested
//! files), dotfiles match, and `{a,b}` alternation works.
//!
//! The exit code is `0` when no finding has level `error`, else `1`. A host reports a
//! config error (a [`GlobError`] or a `DeclarativeError`) on its own, such as with `2`.

use std::borrow::Cow;

use globset::{GlobBuilder, GlobSet, GlobSetBuilder};

use crate::contract::Contract;
use crate::finding::{Finding, FindingLevel};
use crate::validate::validate;

/// One routing rule: the files that match `include` and not `exclude` are checked
/// against `contract`.
pub struct CorpusRule {
    /// Globs relative to the run root. A file must match at least one.
    pub include: Vec<String>,
    /// Globs that take a file out of the rule.
    pub exclude: Vec<String>,
    /// The contract that checks the matched files.
    pub contract: Contract,
    /// The contract's name when the config refers to it by a string, for a host to
    /// print. The runner does not route on it.
    pub name: Option<String>,
}

/// The directory → contract config: a flat ORDERED list of rules. Rule order is
/// significant — a file is validated against the FIRST rule it matches.
#[derive(Default)]
pub struct CorpusConfig {
    /// the rules, in order; the first match wins
    pub rules: Vec<CorpusRule>,
}

/// Per-run counts returned alongside the findings. Always satisfies
/// `files_matched == matched_by_rule.iter().sum()` and
/// `files_unmatched == files_scanned - files_matched`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunStats {
    /// every file offered to the run
    pub files_scanned: usize,
    /// files routed to a rule (validated)
    pub files_matched: usize,
    /// offered but not routed (pre-filtered out or matching no rule)
    pub files_unmatched: usize,
    /// matched count per rule, parallel to `config.rules` by index
    pub matched_by_rule: Vec<usize>,
}

/// The run outcome: aggregated findings (each already deterministically sorted within
/// its file, stamped with its file path), the exit code, and the run counts.
#[derive(Debug)]
pub struct RunOutcome {
    /// every finding, grouped by file in the order the files were offered
    pub findings: Vec<Finding>,
    /// `0` = no error-level finding; `1` = at least one
    pub exit_code: i32,
    /// how many files were scanned and matched
    pub stats: RunStats,
}

/// An optional global pre-filter, applied before rule matching (AND-narrowing): a file
/// is considered only if it matches at least one `include` glob (when any are given)
/// and no `exclude` glob.
#[derive(Default)]
pub struct RunOptions {
    /// globs a file must match to be considered, when any are given
    pub include: Vec<String>,
    /// globs that take a file out of the run
    pub exclude: Vec<String>,
}

/// A glob set that failed to compile — a config error (exit-code-2 territory for the
/// hosting layer).
#[derive(Debug, thiserror::Error)]
#[error("invalid glob '{glob}': {reason}")]
pub struct GlobError {
    /// the glob that did not compile
    pub glob: String,
    /// why it did not compile
    pub reason: String,
}

/// Compile a glob list into a matcher: `*` never crosses `/`, and dotfiles match.
pub(crate) fn compile_matcher(globs: &[String]) -> Result<GlobSet, GlobError> {
    let mut builder = GlobSetBuilder::new();
    for glob in globs {
        let compiled = GlobBuilder::new(glob)
            .literal_separator(true)
            .build()
            .map_err(|e| GlobError {
                glob: glob.clone(),
                reason: e.to_string(),
            })?;
        builder.add(compiled);
    }
    builder.build().map_err(|e| GlobError {
        glob: globs.join(", "),
        reason: e.to_string(),
    })
}

struct CompiledRule {
    include: GlobSet,
    exclude: Option<GlobSet>,
}

fn compile(config: &CorpusConfig) -> Result<Vec<CompiledRule>, GlobError> {
    config
        .rules
        .iter()
        .map(|r| {
            Ok(CompiledRule {
                include: compile_matcher(&r.include)?,
                exclude: if r.exclude.is_empty() {
                    None
                } else {
                    Some(compile_matcher(&r.exclude)?)
                },
            })
        })
        .collect()
}

/// Index of the FIRST rule whose include matches and exclude does not, or `None`.
fn first_matching_rule(rules: &[CompiledRule], path: &str) -> Option<usize> {
    rules.iter().position(|r| {
        r.include.is_match(path) && !r.exclude.as_ref().is_some_and(|e| e.is_match(path))
    })
}

/// Run a config across a file set and aggregate findings.
///
/// `files` supplies `(relative posix path, source)` pairs in the caller's walk order.
/// Each file is validated by the first rule whose `include` matches and whose `exclude`
/// does not, with its path stamped on every finding. A file that matches no rule is
/// skipped.
pub fn run_corpus<'a>(
    config: &CorpusConfig,
    files: impl IntoIterator<Item = (&'a str, &'a str)>,
    opts: &RunOptions,
) -> Result<RunOutcome, GlobError> {
    run_lazy(
        config,
        files
            .into_iter()
            .map(|(path, source)| (path, move || Ok(Cow::Borrowed(source)))),
        opts,
    )
}

/// [`run_corpus`] with each source loaded only when a rule routes its file.
pub(crate) fn run_lazy<'a, E, F>(
    config: &CorpusConfig,
    files: impl IntoIterator<Item = (&'a str, F)>,
    opts: &RunOptions,
) -> Result<RunOutcome, E>
where
    E: From<GlobError>,
    F: FnOnce() -> Result<Cow<'a, str>, E>,
{
    let rules = compile(config)?;
    let include = if opts.include.is_empty() {
        None
    } else {
        Some(compile_matcher(&opts.include)?)
    };
    let exclude = if opts.exclude.is_empty() {
        None
    } else {
        Some(compile_matcher(&opts.exclude)?)
    };

    let mut findings = Vec::new();
    let mut matched_by_rule = vec![0usize; config.rules.len()];
    let mut files_scanned = 0usize;
    let mut files_matched = 0usize;

    for (path, source) in files {
        files_scanned += 1;
        if exclude.as_ref().is_some_and(|e| e.is_match(path)) {
            continue;
        }
        if include.as_ref().is_some_and(|i| !i.is_match(path)) {
            continue;
        }
        let Some(idx) = first_matching_rule(&rules, path) else {
            continue;
        };
        matched_by_rule[idx] += 1;
        files_matched += 1;
        findings.extend(validate(&source()?, &config.rules[idx].contract, path));
    }

    let has_error = findings.iter().any(|f| f.level == FindingLevel::Error);
    Ok(RunOutcome {
        findings,
        exit_code: i32::from(has_error),
        stats: RunStats {
            files_scanned,
            files_matched,
            files_unmatched: files_scanned - files_matched,
            matched_by_rule,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{Contract, LevelOpts, section, sections};

    fn overview_contract() -> Contract {
        Contract::new().body(sections(LevelOpts::default(), vec![section("Overview")]))
    }

    fn rule(include: &[&str], exclude: &[&str]) -> CorpusRule {
        CorpusRule {
            include: include.iter().map(|s| s.to_string()).collect(),
            exclude: exclude.iter().map(|s| s.to_string()).collect(),
            contract: overview_contract(),
            name: None,
        }
    }

    // Contract first: one rule, two files — the matching file validates, the other is
    // skipped, and the exit code reflects the error.
    #[test]
    fn routes_by_glob_and_returns_a_ci_exit_code() {
        let config = CorpusConfig {
            rules: vec![rule(&["**/*.md"], &[])],
        };
        let files = [
            ("docs/bad.md", "## Wrong\n\nprose\n"),
            ("notes.txt", "not markdown"),
        ];
        let out = run_corpus(&config, files, &RunOptions::default()).unwrap();
        assert_eq!(out.exit_code, 1);
        assert_eq!(out.findings.len(), 1);
        assert_eq!(out.findings[0].path, "docs/bad.md");
        assert_eq!(
            out.stats,
            RunStats {
                files_scanned: 2,
                files_matched: 1,
                files_unmatched: 1,
                matched_by_rule: vec![1],
            }
        );
    }

    #[test]
    fn clean_corpus_exits_zero() {
        let config = CorpusConfig {
            rules: vec![rule(&["**/*.md"], &[])],
        };
        let out = run_corpus(
            &config,
            [("a.md", "## Overview\n\nfine\n")],
            &RunOptions::default(),
        )
        .unwrap();
        assert_eq!(out.exit_code, 0);
        assert_eq!(out.findings, vec![]);
    }

    // First-match routing: the specific rule ahead of the catch-all wins.
    #[test]
    fn first_match_routing_is_by_rule_order() {
        let config = CorpusConfig {
            rules: vec![rule(&["**/A-*.md"], &[]), rule(&["**/*.md"], &[])],
        };
        let files = [
            ("A-1.md", "## Overview\n\nok\n"),
            ("b.md", "## Overview\n\nok\n"),
        ];
        let out = run_corpus(&config, files, &RunOptions::default()).unwrap();
        assert_eq!(out.stats.matched_by_rule, vec![1, 1]);
    }

    #[test]
    fn per_rule_exclude_and_global_pre_filter_narrow() {
        let config = CorpusConfig {
            rules: vec![rule(&["**/*.md"], &["**/skip-*.md"])],
        };
        let out = run_corpus(
            &config,
            [("skip-1.md", "x"), ("keep.md", "## Overview\n\nok\n")],
            &RunOptions::default(),
        )
        .unwrap();
        assert_eq!(out.stats.files_matched, 1);

        let out = run_corpus(
            &config,
            [
                ("keep.md", "## Overview\n\nok\n"),
                ("docs/keep.md", "## Overview\n\nok\n"),
            ],
            &RunOptions {
                include: vec!["docs/**".into()],
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(out.stats.files_matched, 1);
    }

    // The picomatch parity cases the TS runner pins: a single `**/`-glob spans the run
    // root and nested files; `*` never crosses a separator; dotfiles match.
    #[test]
    fn glob_semantics_match_picomatch() {
        let m = compile_matcher(&["**/*.md".into()]).unwrap();
        assert!(m.is_match("a.md")); // root level
        assert!(m.is_match("docs/deep/a.md")); // nested
        assert!(m.is_match(".hidden.md")); // dot: true
        let single = compile_matcher(&["docs/*.md".into()]).unwrap();
        assert!(single.is_match("docs/a.md"));
        assert!(!single.is_match("docs/deep/a.md")); // * does not cross /
        let brace = compile_matcher(&["**/{a,b}.md".into()]).unwrap();
        assert!(brace.is_match("x/a.md"));
        assert!(brace.is_match("b.md"));
        assert!(!brace.is_match("c.md"));
    }

    #[test]
    fn an_invalid_glob_is_a_config_error() {
        assert!(compile_matcher(&["a[".into()]).is_err());
    }
}
