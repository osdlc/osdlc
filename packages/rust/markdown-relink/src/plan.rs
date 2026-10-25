//! The planner: what a rename would do, computed without touching anything.
//!
//! The stages, in order, are the pipeline's: validate,
//! detect collisions, build the path map, resolve, re-express — collapsed to
//! the single-entry case:
//!
//! 1. **Guard** both paths (lexical, then symlink-resolved containment), and
//!    refuse the classes a v1 rename must not perform.
//! 2. **Detect the collision** — including the one a case-insensitive
//!    filesystem hides.
//! 3. **Build the path map** and, from it, the *hypothetical* corpus: the
//!    vault's path list as it would be **after** the move. Every rewrite
//!    decision is made against that list.
//! 4. **Enumerate** the inbound links — the [`VaultFacts`] snapshot says which
//!    notes to look at, and each of those notes is then re-read and re-scanned,
//!    because the snapshot is a filter and the file is the truth.
//! 5. **Re-express** each one (the `rewrite` module) and record the byte edit,
//!    or record that no edit is needed.
//!
//! # Scope: bodies, not frontmatter
//!
//! Links are rewritten in note **bodies** only. The link graph this runs over
//! scans bodies (deliberately — the backlinks panel means "linked from the
//! prose"), and a frontmatter value is YAML whose
//! bytes belong to `yaml_splice`'s span-preserving discipline, not to a
//! markdown byte edit. A link-shaped frontmatter value that names the renamed
//! note is therefore **diagnosed**
//! ([`FrontmatterLinkUntouched`](crate::DiagnosticCode::FrontmatterLinkUntouched))
//! rather than quietly ignored.

use std::collections::{BTreeMap, HashMap};
use std::path::Path;

use crate::error::TransformError;
use markdown_link::body_links_spanned;

use crate::facts::VaultFacts;
use crate::rewrite::{self, LinkOutcome};
use crate::{ByteEdit, Diagnostic, DiagnosticCode, FileEdits, FileEtag, RenamePlan};

/// Where each moved item lands: source vault-relative path → destination.
///
/// One entry in v1. It is a map rather than a pair because it is the thing
/// every rewrite decision is looked up in, and the moment a folder move or a
/// bulk restructure arrives the only change is how many
/// entries go in — not how anything reads it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct PathMap {
    entries: BTreeMap<String, String>,
}

impl PathMap {
    /// The one-entry map a single rename produces.
    pub fn single(from: &str, to: &str) -> PathMap {
        let mut entries = BTreeMap::new();
        entries.insert(from.to_string(), to.to_string());
        PathMap { entries }
    }

    /// The N-entry map a bundle rename produces — the entry note plus every
    /// peer file, each source path to its own destination.
    pub fn from_pairs<I: IntoIterator<Item = (String, String)>>(pairs: I) -> PathMap {
        PathMap {
            entries: pairs.into_iter().collect(),
        }
    }

    /// Where `path` went, or `None` when it did not move.
    pub fn get(&self, path: &str) -> Option<&str> {
        self.entries.get(path).map(String::as_str)
    }

    /// The corpus as it will be once the map is applied.
    ///
    /// This is the hypothetical the whole planner runs against: "given the
    /// vault as it would be after the move, what does this link text mean?"
    /// Asking it of the *current* corpus is how a rename decides a bare name
    /// is still fine when the file it names has left the building.
    pub fn apply(&self, paths: &[String]) -> Vec<String> {
        paths
            .iter()
            .map(|p| match self.get(p) {
                Some(dest) => dest.to_string(),
                None => p.clone(),
            })
            .collect()
    }
}

/// What a link target names in one corpus.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Resolution {
    /// Nothing in the corpus answers to it.
    None,
    /// Exactly one file does.
    Unique(String),
    /// Several do. The payload is the one
    /// [`markdown_link::LinkIndex`] would pick — shallowest
    /// path, then collation order — because a link that is ambiguous still
    /// *goes* somewhere and a preview has to say where.
    Ambiguous(String),
}

impl Resolution {
    /// The path this resolves to, ambiguous or not.
    pub fn target(&self) -> Option<&str> {
        match self {
            Resolution::None => None,
            Resolution::Unique(p) | Resolution::Ambiguous(p) => Some(p.as_str()),
        }
    }
}

/// A path-suffix index, keeping **every** candidate per key.
///
/// # Why this is not [`markdown_link::LinkIndex`]
///
/// `LinkIndex` answers "what does this link point at", which needs one winner
/// per key, and it is right not to pay for more — it is built on every graph
/// sweep over the whole vault. The planner asks two questions that a
/// one-winner index cannot answer at all:
///
/// - **"Is this bare name still unambiguous after the move?"** — the difference
///   between leaving `[[Alpha]]` alone and having to write `[[Archive/Alpha]]`.
/// - **"What is the shortest form that unambiguously names this file?"** — the
///   qualified form to write when it is not.
///
/// So the keying is `LinkIndex::build`'s, shared function for shared function
/// ([`markdown_link::suffixes`] and [`markdown_link::normalize_target`], both public for
/// this caller), and the only differences are the two that are the point: the
/// value is a candidate *list*, and [`Self::resolve_strict`] omits the
/// pathed-miss basename fallback. That fallback is correct for *reading* a
/// vault full of collection-alias links, and wrong for deciding whether a link
/// survived a move — it would report `[[Projects/Alpha]]` as still resolving
/// after `Projects/Alpha.md` moved to `Archive/`, and the rename would leave a
/// link naming a folder the note is no longer in.
/// [`Self::resolve_lenient`] keeps the fallback for the one job that wants it:
/// deciding which existing links point at the rename subject.
#[derive(Debug, Clone, Default)]
pub(crate) struct Corpus {
    by_key: HashMap<String, Vec<String>>,
}

/// Whether a vault-relative path is a note, by `LinkIndex::build`'s own rule.
///
/// The char-boundary guard is [`markdown_link::strip_md_ext`]'s, for its reason: the
/// vault has Cyrillic and CJK note names, and `&path[path.len() - 3..]` panics
/// rather than returning false when the last three bytes land mid-character.
/// This is called on every path in the corpus, so one such name would take down
/// the whole plan.
pub(crate) fn is_note(path: &str) -> bool {
    path.len() >= 3
        && path.is_char_boundary(path.len() - 3)
        && path[path.len() - 3..].eq_ignore_ascii_case(".md")
}

/// The string suffixes are taken of: a note without its extension, anything
/// else whole (an attachment is addressed with its extension).
pub(crate) fn key_path(path: &str) -> String {
    if is_note(path) {
        markdown_link::strip_md_ext(path)
    } else {
        path.to_string()
    }
}

impl Corpus {
    /// Builds the corpus from vault-relative note and attachment paths.
    pub fn build(paths: &[String]) -> Corpus {
        // `LinkIndex::build`'s order, so the winner among candidates is the
        // same file the reading experience would have opened: shortest path in
        // CHARACTERS first, then deterministic collation. Not
        // segment count — a deep-but-short path beats a shallow-but-long one,
        // and sorting the two differently is how this planner and the reader
        // come to disagree about which file a bare name means.
        let mut sorted: Vec<&String> = paths.iter().collect();
        sorted.sort_by(|a, b| {
            a.chars()
                .count()
                .cmp(&b.chars().count())
                .then_with(|| slug_collate::compare_paths(a, b))
        });

        let mut by_key: HashMap<String, Vec<String>> = HashMap::new();
        for path in sorted {
            for suffix in markdown_link::suffixes(&key_path(path)) {
                let slot = by_key
                    .entry(markdown_link::normalize_target(&suffix))
                    .or_default();
                if !slot.iter().any(|p| p == path) {
                    slot.push(path.clone());
                }
            }
        }
        Corpus { by_key }
    }

    /// Exact suffix resolution — no basename fallback. See the type docs.
    ///
    /// Source-independent, so a contested name answers with the shortest
    /// candidate. Callers that know where the link was written should prefer
    /// [`Self::resolve_lenient`], which honours the folder preference.
    pub fn resolve_strict(&self, target: &str) -> Resolution {
        self.resolve_key(&markdown_link::normalize_target(target), "")
    }

    /// The lookup itself, over a key that has **already** been normalised.
    ///
    /// Separate from [`Self::resolve_strict`] so the fallback below cannot
    /// normalise twice. `normalize_target` strips one trailing `.md`, so a
    /// second pass over its own output strips a second one — and
    /// `[[Projects/Alpha.md.md]]` would resolve here while `LinkIndex::resolve`
    /// (which indexes `by_key` with the sub-key directly) says it resolves
    /// nowhere. The two disagreeing about what a link points at is the one
    /// thing this type is keyed function-for-function to prevent.
    fn resolve_key(&self, key: &str, from: &str) -> Resolution {
        match self.by_key.get(key) {
            None => Resolution::None,
            Some(candidates) => match candidates.split_first() {
                Some((first, [])) => Resolution::Unique(first.clone()),
                // Contested. WHICH file it means depends on where the link was
                // written, and `prefer_in_folder` is the same rule the reading
                // view resolves by — shared rather than restated.
                Some((_, _)) => Resolution::Ambiguous(
                    markdown_link::prefer_in_folder(candidates, from)
                        .unwrap_or(&candidates[0])
                        .to_string(),
                ),
                None => Resolution::None,
            },
        }
    }

    /// `LinkIndex::resolve_from`'s relative `./` / `../` step, then
    /// [`Self::resolve_strict`], then `LinkIndex::resolve`'s pathed-miss
    /// basename fallback — what the app considers this link to point at right
    /// now, which is what "does this link point at the rename subject" has to
    /// mean.
    pub fn resolve_lenient(&self, target: &str, from: &str) -> Option<String> {
        // A `./` / `../` target names one path from `from`'s folder — the
        // same step `LinkIndex::resolve_from` takes first.
        if let Some(joined) = markdown_link::join_relative(target, from) {
            let key = markdown_link::normalize_target(&joined);
            if let Some(hit) = self
                .by_key
                .get(&key)
                .and_then(|c| c.iter().find(|p| markdown_link::normalize_target(p) == key))
            {
                return Some(hit.clone());
            }
        }
        let key = markdown_link::normalize_target(target);
        if let Some(hit) = self.resolve_key(&key, from).target() {
            return Some(hit.to_string());
        }
        let slash = key.rfind('/')?;
        if slash == 0 {
            return None;
        }
        self.resolve_key(&key[slash + 1..], from)
            .target()
            .map(str::to_string)
    }

    /// How many trailing path segments are needed before `path` is the only
    /// candidate. `1` means the bare name is enough.
    ///
    /// Returns the path's own segment count when **no** suffix isolates it —
    /// two files whose paths differ only by case are one key and two
    /// candidates, and there is no longer form to reach for. The caller cannot
    /// tell that case from a genuine answer by the number alone, which is why
    /// [`Self::qualified_form`] re-asks the corpus rather than trusting it.
    pub fn minimum_unambiguous_depth(&self, path: &str) -> usize {
        let kp = key_path(path);
        let total = kp.split('/').count();
        for (i, suffix) in markdown_link::suffixes(&kp).into_iter().enumerate() {
            let key = markdown_link::normalize_target(&suffix);
            if self
                .by_key
                .get(&key)
                .is_some_and(|c| c.len() == 1 && c[0] == path)
            {
                return i + 1;
            }
        }
        total
    }

    /// The shortest suffix of `path` that names it and nothing else.
    #[cfg(test)]
    pub fn shortest_unambiguous(&self, path: &str) -> String {
        suffix_at_depth(&key_path(path), self.minimum_unambiguous_depth(path))
    }

    /// The form to write for `path`, never less qualified than the author's own
    /// spelling was. Also reports whether ambiguity — rather than the author's
    /// taste — is what forced the qualification, which is the difference
    /// between a silent rewrite and an `ambiguous_link` diagnostic.
    pub fn qualified_form(&self, path: &str, author_depth: usize) -> (String, bool) {
        let minimum = self.minimum_unambiguous_depth(path);
        let text = suffix_at_depth(&key_path(path), minimum.max(author_depth.max(1)));
        // Two different reasons to say `ambiguous_link`, and the second is the
        // one a depth alone cannot express. `minimum > 1` is the ordinary case:
        // the bare name would collide, so the form is qualified. The other is
        // that the form written is ambiguous *anyway* — when no suffix isolates
        // the file, `minimum_unambiguous_depth` has nothing to return but the
        // total, and qualifying further is not available. The link still goes
        // somewhere and is still worth writing; writing it silently is the only
        // thing worse.
        let settled = matches!(self.resolve_strict(&text), Resolution::Unique(hit) if hit == path);
        (text, minimum > 1 || !settled)
    }
}

/// The last `depth` segments of a path, capped at the whole thing.
pub(crate) fn suffix_at_depth(path_no_ext: &str, depth: usize) -> String {
    let segs: Vec<&str> = path_no_ext.split('/').collect();
    let take = depth.clamp(1, segs.len());
    segs[segs.len() - take..].join("/")
}

/// Compute the rewrite set for renaming `from` to `to`. Writes nothing.
///
/// `facts` must describe the vault as it is on disk **now** — a caller passing
/// a cached snapshot is responsible for having refreshed it, because a plan
/// computed against the vault as it was half a second ago is exactly the window
/// a user who just saved a note is standing in.
pub fn plan(
    vault_dir: &Path,
    facts: &VaultFacts,
    from: &str,
    to: &str,
) -> Result<RenamePlan, TransformError> {
    let from = markdown_vault_fs::path::lexical::validate_relative(from)?;
    let to = markdown_vault_fs::path::lexical::validate_relative(to)?;
    let from_abs = markdown_vault_fs::Guard::std().resolve(vault_dir, &from)?;
    let to_abs = markdown_vault_fs::Guard::std().resolve(vault_dir, &to)?;

    let refuse = |reason: String| {
        Ok(RenamePlan {
            from: from.clone(),
            to: to.clone(),
            conflict: Some(reason),
            ..RenamePlan::default()
        })
    };

    if let Some(reason) = refusal(&from, &to, &from_abs) {
        return refuse(reason);
    }

    // A case-only rename is not a collision even though the destination
    // "exists": on macOS's default filesystem `Alpha.md` and `ALPHA.md` are
    // one file, so the ordinary existence check would refuse the one operation
    // a user most often wants from a rename dialog. What it must still catch
    // is a case-SENSITIVE filesystem where both really are there, which is
    // what the directory listing below establishes.
    let case_only = from != to && from.to_lowercase() == to.to_lowercase();
    let occupied = if case_only {
        dir_has_exact_name(vault_dir, &to)
    } else {
        to_abs.exists()
    };
    if occupied {
        return refuse(format!("{to} already exists"));
    }

    let map = PathMap::single(&from, &to);
    let pre = Corpus::build(&facts.paths);
    let post = Corpus::build(&map.apply(&facts.paths));

    let mut diagnostics: Vec<Diagnostic> = Vec::new();
    if case_only {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::CaseOnlyRename,
            note_path: String::new(),
            detail: format!(
                "{from} and {to} differ only by case; link resolution is \
                 case-insensitive, so inbound links keep working untouched"
            ),
        });
    }

    // The snapshot is the FILTER. Which notes carry a link the app currently
    // considers a link to `from` is exactly what a link graph caches, and
    // asking it costs a lookup rather than a walk. What it is NOT is the source
    // of truth for where the bytes are — see `VaultFacts::links`.
    let files_scanned = facts.notes_scanned();
    let candidates = linking_notes(facts, &pre, &from);

    // A link that *spells* the subject's name but does not resolve to it is
    // the exact link a text-substituting rename would have rewritten, and
    // rewriting it would repoint somebody's link at a file it never named. It
    // is reported and left alone.
    //
    // In practice this is nearly always the shadowed-name case — two
    // `Alpha.md`, one shallower, and a bare `[[Alpha]]` that means the other
    // one — rather than a link resolving to nothing, because the basename
    // fallback means a name the subject answers to usually resolves *somewhere*.
    // Both are the same finding from the user's side ("this looked like a link
    // to the note and it is not"), so they share a code and differ in detail.
    let subject_stem = markdown_link::normalize_target(&key_path(&from));
    let subject_base = subject_stem
        .rsplit('/')
        .next()
        .unwrap_or(&subject_stem)
        .to_string();
    for (path, links) in facts.links.iter() {
        for link in links.iter() {
            let hit = pre.resolve_lenient(&link.target, path);
            if hit.as_deref() == Some(from.as_str()) {
                continue;
            }
            let key = markdown_link::normalize_target(&link.target);
            if key.rsplit('/').next() != Some(subject_base.as_str()) {
                continue;
            }
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::PreBrokenLink,
                note_path: path.clone(),
                detail: match hit {
                    Some(other) => format!(
                        "`{}` spells this note's name but already resolves to {other} — \
                         left untouched",
                        link.raw
                    ),
                    None => format!(
                        "`{}` spells this note's name and resolves to nothing — left untouched",
                        link.raw
                    ),
                },
            });
        }
    }

    // Frontmatter, from the snapshot's already-parsed values. See the module
    // docs on why these are diagnosed rather than rewritten.
    for (path, refs) in facts.frontmatter.iter() {
        for reference in refs.iter() {
            if pre.resolve_lenient(&reference.target, path).as_deref() == Some(from.as_str()) {
                diagnostics.push(Diagnostic {
                    code: DiagnosticCode::FrontmatterLinkUntouched,
                    note_path: path.clone(),
                    detail: format!(
                        "frontmatter `{}` names this note; frontmatter is not rewritten",
                        reference.field.as_deref().unwrap_or("(value)")
                    ),
                });
            }
        }
    }

    let (files, mut expect) = inbound_rewrites(
        vault_dir,
        &candidates,
        &from,
        &to,
        &pre,
        &post,
        &mut diagnostics,
    )?;

    // The subject is always in the CAS set, edits or none: "the note I am about
    // to move is the one you previewed" is a claim worth checking even when the
    // note itself contains nothing to rewrite.
    if !expect.iter().any(|e| e.path == from) {
        expect.push(FileEtag {
            path: from.clone(),
            etag: etag_write::etag_of_file(&from_abs)
                .map_err(|e| TransformError::Io(format!("reading {from}: {}", e.source)))?
                .unwrap_or_default(),
        });
    }
    expect.sort_by(|a, b| a.path.cmp(&b.path));
    diagnostics.sort_by(|a, b| {
        a.note_path
            .cmp(&b.note_path)
            .then_with(|| a.code.as_str().cmp(b.code.as_str()))
            .then_with(|| a.detail.cmp(&b.detail))
    });

    Ok(RenamePlan {
        from,
        to,
        conflict: None,
        files,
        diagnostics,
        files_scanned,
        expect,
        peers: Vec::new(),
    })
}

/// Compute the rewrite set that points every inbound link of `from` at `to`,
/// a note that already exists, for when `from` is about to be deleted — a
/// duplicate removed in favour of the copy that is kept. Writes nothing and
/// moves nothing; the caller splices the edits ([`crate::splice`]) and removes
/// `from` itself.
///
/// Refused on the same grounds as [`plan`], and when `to` does not exist.
/// Links are resolved against the vault as it will be, with `from` gone.
pub fn plan_redirect(
    vault_dir: &Path,
    facts: &VaultFacts,
    from: &str,
    to: &str,
) -> Result<RenamePlan, TransformError> {
    let from = markdown_vault_fs::path::lexical::validate_relative(from)?;
    let to = markdown_vault_fs::path::lexical::validate_relative(to)?;
    let from_abs = markdown_vault_fs::Guard::std().resolve(vault_dir, &from)?;
    let to_abs = markdown_vault_fs::Guard::std().resolve(vault_dir, &to)?;

    let refused = refusal(&from, &to, &from_abs)
        .or_else(|| (!to_abs.is_file()).then(|| format!("no note at {to}")));
    if let Some(reason) = refused {
        return Ok(RenamePlan {
            from,
            to,
            conflict: Some(reason),
            ..RenamePlan::default()
        });
    }

    let pre = Corpus::build(&facts.paths);
    let remaining: Vec<String> = facts
        .paths
        .iter()
        .filter(|p| **p != from)
        .cloned()
        .collect();
    let post = Corpus::build(&remaining);

    let mut diagnostics: Vec<Diagnostic> = Vec::new();
    let candidates = linking_notes(facts, &pre, &from);
    let (files, mut expect) = inbound_rewrites(
        vault_dir,
        &candidates,
        &from,
        &to,
        &pre,
        &post,
        &mut diagnostics,
    )?;
    expect.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(RenamePlan {
        from,
        to,
        conflict: None,
        files,
        diagnostics,
        files_scanned: facts.notes_scanned(),
        expect,
        peers: Vec::new(),
    })
}

/// The notes whose snapshot links resolve to `from`. The snapshot is a filter;
/// [`inbound_rewrites`] re-reads each one.
fn linking_notes<'a>(facts: &'a VaultFacts, pre: &Corpus, from: &str) -> Vec<&'a String> {
    facts
        .links
        .iter()
        .filter(|(path, links)| {
            links
                .iter()
                .any(|l| pre.resolve_lenient(&l.target, path).as_deref() == Some(from))
        })
        .map(|(path, _)| path)
        .collect()
}

/// The byte edits that repoint every link in `candidates` resolving to
/// `from` (against `pre`) at `to` (as `post` resolves it), and the etags they
/// were computed against. Shared by [`plan`] and [`plan_redirect`].
fn inbound_rewrites(
    vault_dir: &Path,
    candidates: &[&String],
    from: &str,
    to: &str,
    pre: &Corpus,
    post: &Corpus,
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<(Vec<FileEdits>, Vec<FileEtag>), TransformError> {
    let mut files: Vec<FileEdits> = Vec::new();
    let mut expect: Vec<FileEtag> = Vec::new();

    for note_path in candidates {
        let note_path = (*note_path).clone();
        let abs = markdown_vault_fs::Guard::std().resolve(vault_dir, &note_path)?;
        let Ok(bytes) = std::fs::read(&abs) else {
            // Unreadable now, cached a moment ago. Not an error — a plan over
            // thousands of notes must not die on one, and the file is simply
            // absent from the rewrite set (and so from `expect`, which is what
            // makes `execute` skip rather than guess) — but not silence either.
            // A note that links here and is not in the plan will still name the
            // old path afterwards, and the whole point of a preview is that
            // nothing about it is discovered later.
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::UnreadableCandidate,
                note_path: note_path.clone(),
                detail: "links to this note but could not be read, so it is not in this \
                         plan and its links are left as they are"
                    .to_string(),
            });
            continue;
        };
        let etag = etag_write::etag(&bytes);
        // `from_utf8`, never `from_utf8_lossy`. Every offset below indexes
        // THESE bytes; a lossy decode indexes a different string, because each
        // undecodable byte widens into a three-byte U+FFFD — so every edit after
        // the first bad byte would splice three bytes further along than it
        // meant to, in a file the user cannot then repair. Skipped, and said out
        // loud. (Every producer of `facts.links` reads notes as UTF-8, so this
        // is the file having changed since the snapshot — the same staleness
        // window the read above stands in.)
        let Ok(content) = std::str::from_utf8(&bytes) else {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::InvalidUtf8Candidate,
                note_path: note_path.clone(),
                detail: "links to this note but is not valid UTF-8, so its byte offsets \
                         cannot be trusted — left untouched"
                    .to_string(),
            });
            continue;
        };
        let split = frontmatter_lossless::split(content);
        let body = split.body;
        let body_start = split.body_start;

        let mut edits: Vec<ByteEdit> = Vec::new();
        for link in body_links_spanned(body) {
            if pre.resolve_lenient(&link.target, &note_path).as_deref() != Some(from) {
                continue;
            }
            if note_path == from {
                diagnostics.push(Diagnostic {
                    code: DiagnosticCode::SelfLink,
                    note_path: note_path.clone(),
                    detail: format!("`{}` points at this note", link.raw),
                });
            }
            let Some(span) = rewrite::target_span(body, &link) else {
                diagnostics.push(Diagnostic {
                    code: DiagnosticCode::UnmappableLinkSpan,
                    note_path: note_path.clone(),
                    detail: format!("could not locate the target inside `{}`", link.raw),
                });
                continue;
            };
            let current = &body[span.clone()];
            match rewrite::plan_link(post, to, &link, current) {
                LinkOutcome::Unchanged => {}
                LinkOutcome::Rewrite { text, qualified } => {
                    if qualified {
                        diagnostics.push(Diagnostic {
                            code: DiagnosticCode::AmbiguousLink,
                            note_path: note_path.clone(),
                            detail: format!(
                                "`{current}` would be ambiguous after the move; qualified to `{text}`"
                            ),
                        });
                    }
                    let offset = body_start + span.start;
                    edits.push(ByteEdit {
                        offset,
                        delete_count: span.len(),
                        insert: text,
                        old_text: current.to_string(),
                        line: line_of(content, offset),
                    });
                }
            }
        }

        edits.sort_by_key(|e| e.offset);
        expect.push(FileEtag {
            path: note_path.clone(),
            etag: etag.clone(),
        });
        files.push(FileEdits {
            path: note_path,
            etag,
            edits,
        });
    }
    Ok((files, expect))
}

/// The classes of rename v1 refuses outright, each for a stated reason.
///
/// `pub(crate)` for [`crate::bundle`]: a bundle rename's entry note is refused
/// on exactly the same grounds a single file's `from`/`to` are — same path,
/// `_system/`, a hidden directory, not markdown, source missing — one
/// predicate for both shapes rather than a second copy that could drift from
/// this one.
pub(crate) fn refusal(from: &str, to: &str, from_abs: &Path) -> Option<String> {
    if from == to {
        return Some("the source and the destination are the same path".to_string());
    }
    for (label, path) in [("source", from), ("destination", to)] {
        if markdown_vault_fs::path::is_system_path(path) {
            // `_system/**` is the one path where a write runs
            // contract validation, and a contract routes on the note's path.
            // Renaming one out of `_system/` strips it of the validation it is
            // held to; renaming one in gives it a contract it has never been
            // checked against. Neither is a rename — both are migrations.
            //
            // The predicate is `markdown_vault_fs`'s, not a `starts_with`: it folds case, so
            // `_System/x.md` cannot walk past this refusal on macOS or Windows, where
            // it IS `_system/x.md`.
            return Some(format!(
                "{label} is under _system/, where a note's path is part of its contract"
            ));
        }
        if path.split('/').any(|seg| seg.starts_with('.')) {
            return Some(format!("{label} is inside a hidden directory"));
        }
        if !is_note(path) {
            return Some(format!("{label} is not a markdown note"));
        }
    }
    if !from_abs.exists() {
        return Some(format!("no note at {from}"));
    }
    None
}

/// Whether the destination's basename exists in its directory **exactly** as
/// spelled.
///
/// `Path::exists` cannot answer this on a case-insensitive filesystem, where it
/// says yes for `ALPHA.md` because `Alpha.md` is there. Listing the directory
/// and comparing byte for byte is the portable way to ask "is there a second,
/// distinct file", which is the only thing a case-only rename has to refuse.
///
/// `pub(crate)` for [`crate::apply`]: the case-only branch there cannot reserve
/// its destination (on a case-insensitive filesystem the destination *is* the
/// source), so it re-asks this question instead.
pub(crate) fn dir_has_exact_name(vault_dir: &Path, rel: &str) -> bool {
    let (dir, name) = match rel.rsplit_once('/') {
        Some((d, n)) => (vault_dir.join(d), n),
        None => (vault_dir.to_path_buf(), rel),
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return false;
    };
    entries
        .filter_map(Result::ok)
        .any(|e| e.file_name().to_string_lossy() == name)
}

/// 1-indexed line of a byte offset within the whole file.
pub(crate) fn line_of(content: &str, byte: usize) -> u64 {
    1 + content[..byte.min(content.len())]
        .bytes()
        .filter(|b| *b == b'\n')
        .count() as u64
}
