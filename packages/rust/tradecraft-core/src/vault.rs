//! Reading a skill *as the vault stores it* — a note, not a folder.
//!
//! The vault spec keeps a skill in a note named for it:
//! `skills/code-review.md` alone, or `skills/code-review/code-review.md` when
//! it carries files. The name is on the note either way, because Obsidian keys
//! its quick-switcher, graph, and backlinks on note names: a vault where forty
//! notes are all called `SKILL` breaks every one of those, and `[[SKILL]]`
//! cannot address anything. The standard's folder layout is what we *publish*,
//! never what we store: [`crate::skill::read_detail`] opens a `SKILL.md` inside
//! a directory named for the skill — the shape on the far side of a publish,
//! not a shape any vault holds.
//!
//! # What is modeled, and what is merely carried
//!
//! Three classes of key, not two. **Ours** — anything in the `sw-` namespace —
//! is lifted into [`VaultNote::frontmatter`] by [`crate::frontmatter`] and
//! never reaches [`SkillContent`] *through this function* — it is
//! configuration about *this vault* and a destination has no business reading
//! it. `sw-arguments` is the one exception, and it is not this function's:
//! `SkillContent::arguments` stays empty here, and `publish` and `export` are
//! the ones that carry it over, once, after this read — see
//! [`SkillContent::apply_arguments`].
//!
//! Of what is left, [`SkillContent`] has a field for a key only when
//! `agent-adapt` renders that key back out. Everything else lands in
//! `annotations` and is re-emitted verbatim, which is the acceptance criterion
//! The vault spec states and the failure that motivated it: deriving a live
//! plugin tree through a model that could not represent it lost 89 of 148
//! files.
//!
//! Two consequences of the carry rule look like oversights:
//!
//! * **`tags` is carried, not modeled**, even though [`SkillContent`] has a
//!   `tags` field. `agent-adapt`'s skill renderer emits no `tags:` key, so
//!   lifting it out of the frontmatter would delete it from every published
//!   `SKILL.md`. Left in `annotations` it survives the round trip.
//! * **A modeled key whose value is the wrong shape stays put.** `name: [a]`
//!   does not become an empty name and a dropped key; it falls back to the
//!   default and the note's own bytes travel on. The model bends to the note.
//!   `metadata:` holding a nested map is that rule's live case: the Agent Skills spec
//!   types it `dict[str, str]`, so a nested one is carried whole and the
//!   renderer folds it in with the other keys it cannot type.
//!
//! Key spellings are the standard's: `allowed-tools`, `argument-hint`,
//! `arguments`, `disable-model-invocation`, `license`, `compatibility`,
//! `metadata`. A snake_case spelling is simply an unknown key and is
//! carried — normalising it would rewrite bytes the author wrote. The
//! standard's `license:` is not our `sw-license:`: the first is what a
//! skill publishes under, the second a container note's package identity,
//! and they are read by different halves of this function.
//!
//! # Transclusion and link rewriting live in [`crate::compile`], not here
//!
//! Steps 1–3 of the vault spec's five (`![[embed]]`
//! expansion, `[[link]]` collection, reference-file emission) are
//! [`crate::compile`]'s pass, applied *between* this read and the
//! projection. **The body here passes through verbatim** — the vault's bytes
//! are canonical, and a read must not rewrite them. A caller that wants the
//! flattened form runs [`crate::compile::compile_projection`] over what this
//! read returns.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::content::{SkillContent, SkillProjection};
use crate::error::CoreError;
use crate::frontmatter::VaultFrontmatter;
use crate::namespace::Namespace;
use crate::skill::{forward_slashed, read_utf8, split_frontmatter};
use crate::vfs::Vfs;

/// One vault note, read: what publishing renders, and what our own namespace
/// said about it.
///
/// The two halves are separate types rather than one flat struct because the
/// separation is the strip. [`SkillProjection`] is everything that may reach a
/// destination, and it has nowhere to put an `sw-` key —
/// [`crate::projection::project_skill`] takes only that half, so our fields
/// cannot travel by accident. [`VaultNote::frontmatter`] is everything that
/// must not travel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VaultNote {
    /// The content and peers, ready to project. Carries no `sw-` data by
    /// construction.
    pub projection: SkillProjection,
    /// What the `sw-` namespace declared: the kind, the targets, provenance,
    /// and any key inside the prefix this build does not model.
    pub frontmatter: VaultFrontmatter,
}

/// Reads the note at `skill_path` and its peer resources.
///
/// `ns` is the vault's frontmatter namespace — [`Namespace::default`] is the
/// documented `sw`. Whatever is passed here must also be passed to the emit
/// side ([`crate::projection::project_skill`]), because these two are the
/// halves of one strip: a key this read did not claim is a key that publishes.
/// [`crate::publish::publish_skill`] takes one namespace and hands the same
/// value to both.
///
/// Order matters. Our namespace is claimed **first**, so a note that mixes the
/// two frontmatter shapes, or names a kind we do not know, is refused as that
/// rather than misdiagnosed a line later as a note with no `description`.
///
/// A `description` or a `name` is then required — either makes a note
/// publish — and a note with neither is an error naming the path, so a caller
/// holding several is told which one was not. A `name` alone reads with
/// [`crate::discover::MISSING_DESCRIPTION`] as its description. `name`
/// defaults to the filename slugified — via [`crate::discover::default_name`],
/// the one derivation the scan uses too — so the ordinary note needs no
/// frontmatter beyond a `description`.
///
/// # The kind is read, not enforced
///
/// `sw-kind` is parsed and reported through
/// [`crate::frontmatter::VaultFrontmatter::declared_kind`]; nothing here
/// refuses a note whose kind this reader cannot publish. A caller wanting the
/// kind resolved against a flag or a configured directory mapping passes that
/// field to [`crate::frontmatter::resolve_kind`] with its hints; this function
/// takes none.
pub fn read_vault_skill(
    vfs: &dyn Vfs,
    skill_path: &Path,
    ns: &Namespace,
) -> Result<VaultNote, CoreError> {
    let source = read_utf8(vfs, skill_path)?;
    let (frontmatter, body) = split_frontmatter(&source);
    let mut fields = frontmatter_map(frontmatter, skill_path)?;

    // Ours, out of the map before anything else looks at it. What survives
    // this line is the note's own frontmatter and nothing of ours.
    let ours = VaultFrontmatter::take_from(&mut fields, skill_path, ns)?;

    let name = take_string(&mut fields, "name").filter(|n| !n.trim().is_empty());
    // A `name` alone opts in, as it does for the scan, which reports the
    // filler — see `crate::discover::MISSING_DESCRIPTION`.
    let description = take_string(&mut fields, "description")
        .filter(|d| !d.trim().is_empty())
        .or_else(|| {
            name.is_some()
                .then(|| crate::discover::MISSING_DESCRIPTION.to_owned())
        })
        .ok_or_else(|| {
            CoreError::malformed(
                skill_path,
                "not a skill: frontmatter carries no `description`",
            )
        })?;

    let content = SkillContent {
        name: name.unwrap_or_else(|| crate::discover::default_name(skill_path)),
        description,
        argument_hint: take_string(&mut fields, "argument-hint"),
        // Claude Code's own key, hand-written. Empty and absent both read as
        // `None` — see `SkillContent::argument_names`'s own doc for why that
        // simplification is fine here where it is not for `sw-targets`: an
        // author has no reason to write `arguments: []` on purpose the way
        // they would `sw-targets: []`, so there is no second outcome worth
        // keeping distinct from "derive it".
        argument_names: {
            let names = take_string_list(&mut fields, "arguments");
            (!names.is_empty()).then_some(names)
        },
        // Never `sw-arguments` here — see the module doc's three classes.
        // `publish` and `export` call `SkillContent::apply_arguments` after
        // this read, with `ours.arguments`, once the kind is resolved.
        arguments: Vec::new(),
        // Nor `sw-overrides`, and for the same reason twice over: the block's
        // target names have not been folded yet and its keys have not been
        // put to the capability matrix. `SkillContent::apply_overrides` is
        // called after both, by the same two callers.
        overrides: Default::default(),
        body: body.to_owned(),
        allowed_tools: take_string_list(&mut fields, "allowed-tools"),
        // The Agent Skills spec's three optional keys. `license` here is the standard's
        // own, never `sw-license` — that one is a container's package
        // identity and was lifted out with the rest of our namespace above.
        license: take_string(&mut fields, "license"),
        compatibility: take_string(&mut fields, "compatibility"),
        metadata: take_string_map(&mut fields, "metadata"),
        model_override: take_string(&mut fields, "model"),
        context_mode: take_string(&mut fields, "context"),
        user_invocable: take_bool(&mut fields, "user-invocable").unwrap_or(true),
        disable_model_invocation: take_bool(&mut fields, "disable-model-invocation")
            .unwrap_or(false),
        // See the module doc: modeling this would delete it at publish.
        tags: Vec::new(),
        // Genuinely foreign keys only. Not an Agent Skills spec field, not ours.
        annotations: fields,
    };

    Ok(VaultNote {
        projection: SkillProjection {
            content,
            resources: read_resources(vfs, bundle_root(skill_path), skill_path)?,
        },
        frontmatter: ours,
    })
}

/// The folder whose files travel with this note: the one named for it and
/// holding it. `skills/release/release.md` owns `skills/release/`, and so does
/// `skills/release/SKILL.md`; `skills/loose.md` owns nothing, which is the
/// common case.
///
/// This is the rule [`crate::discover`] already places a component by, spelled
/// again here because this function has one path and no scan to consult. They
/// must not diverge: while they did, a component in the canonical layout
/// published its `SKILL.md` alone and reported it written, because the peers
/// this side went looking for were in a sibling folder that layout does not
/// have.
pub fn bundle_root(skill_path: &Path) -> Option<&Path> {
    let file = skill_path.file_name()?.to_str()?;
    let parent = skill_path.parent()?;
    if crate::discover::is_skill_entry(file) {
        return parent.file_name().is_some().then_some(parent);
    }
    let stem = skill_path.file_stem()?.to_str()?;
    (parent.file_name()?.to_str()? == stem).then_some(parent)
}

/// Every file under the bundle root except the entry note itself, recursively,
/// with its execute bit.
///
/// The note is excluded because it is *inside* what it owns: the renderer
/// writes it as `SKILL.md`, and carrying it a second time under its vault name
/// would publish the same content twice, once with the `sw-` frontmatter this
/// crate exists to strip.
///
/// Unlike [`crate::skill`]'s supporting-file listing — an aid to a view, which
/// skips what it cannot read — this feeds a publish, so an unreadable peer is
/// raised rather than dropped: under-publishing silently is what the
/// verbatim-carry rule exists to prevent.
///
/// The walk is unbounded in depth on purpose. [`crate::vfs::Vfs::read_dir`]
/// reports a symlinked directory as a non-directory, so there is no cycle to
/// terminate, and any depth bound would silently drop the peers below it.
fn read_resources(
    vfs: &dyn Vfs,
    dir: Option<&Path>,
    entry: &Path,
) -> Result<Vec<(String, Vec<u8>, bool)>, CoreError> {
    let Some(dir) = dir else {
        return Ok(Vec::new());
    };
    if !vfs.exists(dir) {
        return Ok(Vec::new());
    }

    fn collect(
        vfs: &dyn Vfs,
        base: &Path,
        entry: &Path,
        dir: &Path,
        out: &mut Vec<(String, Vec<u8>, bool)>,
    ) -> Result<(), CoreError> {
        for child in vfs.read_dir(dir)? {
            let path = dir.join(&child.name);
            if child.is_dir {
                collect(vfs, base, entry, &path, out)?;
                continue;
            }
            if path == entry {
                continue;
            }
            let relative = path
                .strip_prefix(base)
                .map_err(|_| CoreError::PathEscapesRoot(path.clone()))?;
            let bytes = vfs.read_file(&path)?;
            out.push((forward_slashed(relative), bytes, vfs.is_executable(&path)));
        }
        Ok(())
    }

    let mut out = Vec::new();
    collect(vfs, dir, entry, dir, &mut out)?;
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

/// The frontmatter as a JSON object — the form `annotations` is already in,
/// so unmodeled keys need no second representation on the way through.
///
/// An absent frontmatter block is an empty map rather than an error: the
/// missing `description` is the diagnosis worth reporting, and it is reported
/// one line later against the same path.
///
/// `pub(crate)` for [`crate::discover`], which reads the same notes to a
/// different question — one reader, so a note cannot parse for the publish
/// path and fail for the scan.
pub(crate) fn frontmatter_map(
    frontmatter: &str,
    path: &Path,
) -> Result<Map<String, Value>, CoreError> {
    if frontmatter.trim().is_empty() {
        return Ok(Map::new());
    }
    let yaml: serde_yaml::Value = serde_yaml::from_str(frontmatter)
        .map_err(|e| CoreError::malformed(path, format!("invalid frontmatter: {e}")))?;
    // YAML this crate cannot re-emit — non-string mapping keys, tagged values —
    // is refused here rather than quietly flattened, because carrying it
    // verbatim is the promise and a lossy conversion would break it.
    let json = serde_json::to_value(&yaml).map_err(|e| {
        CoreError::malformed(path, format!("frontmatter is not representable: {e}"))
    })?;
    match json {
        Value::Object(map) => Ok(map),
        Value::Null => Ok(Map::new()),
        _ => Err(CoreError::malformed(path, "frontmatter is not a mapping")),
    }
}

/// Removes `key` and returns it as a string — but only when it *is* a string.
/// A wrong-shaped value is left in the map so it is carried verbatim instead
/// of being consumed and discarded.
fn take_string(fields: &mut Map<String, Value>, key: &str) -> Option<String> {
    let matches = fields.get(key).is_some_and(Value::is_string);
    matches
        .then(|| fields.remove(key))
        .flatten()
        .and_then(|v| v.as_str().map(str::to_owned))
}

fn take_bool(fields: &mut Map<String, Value>, key: &str) -> Option<bool> {
    let matches = fields.get(key).is_some_and(Value::is_boolean);
    matches
        .then(|| fields.remove(key))
        .flatten()
        .and_then(|v| v.as_bool())
}

/// A string-to-string map, all-or-nothing for the same reason
/// [`take_string_list`] is: a mapping holding a non-string value is left in
/// place whole. The Agent Skills spec types `metadata` `dict[str, str]`, so a nested map
/// under it is not a `metadata` this reader can model — it stays an
/// annotation and the renderer folds it in with everything else it cannot
/// type.
fn take_string_map(
    fields: &mut Map<String, Value>,
    key: &str,
) -> std::collections::BTreeMap<String, String> {
    let matches = fields
        .get(key)
        .and_then(Value::as_object)
        .is_some_and(|map| map.values().all(Value::is_string));
    if !matches {
        return Default::default();
    }
    fields
        .remove(key)
        .and_then(|v| match v {
            Value::Object(map) => Some(
                map.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_owned())))
                    .collect(),
            ),
            _ => None,
        })
        .unwrap_or_default()
}

/// A list of strings, all-or-nothing: a sequence with a non-string in it is
/// left in place whole rather than partially lifted.
fn take_string_list(fields: &mut Map<String, Value>, key: &str) -> Vec<String> {
    let matches = fields
        .get(key)
        .and_then(Value::as_array)
        .is_some_and(|items| items.iter().all(Value::is_string));
    if !matches {
        return Vec::new();
    }
    fields
        .remove(key)
        .and_then(|v| match v {
            Value::Array(items) => Some(
                items
                    .iter()
                    .filter_map(|i| i.as_str().map(str::to_owned))
                    .collect(),
            ),
            _ => None,
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frontmatter::EntityKind;
    use crate::vfs::MemVfs;
    use std::path::PathBuf;

    /// The default namespace — every test but the configured one reads a vault
    /// that declared no stem, exactly as this reader did before it took one.
    fn sw() -> Namespace {
        Namespace::default()
    }

    /// A vault with one note at `skills/<name>.md`.
    fn vault(name: &str, source: &str) -> (MemVfs, PathBuf) {
        let vfs = MemVfs::new();
        let path = PathBuf::from("/vault/skills").join(format!("{name}.md"));
        vfs.create_dir_all(Path::new("/vault/skills")).unwrap();
        vfs.write_file(&path, source.as_bytes()).unwrap();
        (vfs, path)
    }

    #[test]
    fn a_note_is_read_as_a_skill() {
        let (vfs, path) = vault(
            "code-review",
            "---\ndescription: reviews code\nallowed-tools:\n  - Read\n  - Grep\n---\nBody prose.\n",
        );
        let note = read_vault_skill(&vfs, &path, &sw()).unwrap();
        let content = &note.projection.content;

        // The stem names the skill; the note carries no `name`.
        assert_eq!(content.name, "code-review");
        assert_eq!(content.description, "reviews code");
        assert_eq!(content.allowed_tools, vec!["Read", "Grep"]);
        assert_eq!(content.body, "Body prose.\n");
        assert!(content.user_invocable);
        assert!(note.projection.resources.is_empty());

        // A note that declares nothing of ours reads as the ordinary vault.
        assert_eq!(note.frontmatter.kind(), EntityKind::Skill);
        assert_eq!(note.frontmatter.declared_kind, None);
        assert_eq!(note.frontmatter.targets, None);
        assert!(note.frontmatter.provenance.is_hand_authored());
        assert!(note.frontmatter.unknown_ours.is_empty());
    }

    #[test]
    fn frontmatter_name_wins_over_the_stem() {
        let (vfs, path) = vault(
            "code-review",
            "---\nname: reviewer\ndescription: d\n---\nb\n",
        );
        assert_eq!(
            read_vault_skill(&vfs, &path, &sw())
                .unwrap()
                .projection
                .content
                .name,
            "reviewer"
        );
    }

    #[test]
    fn a_name_alone_reads_with_the_filler() {
        let (vfs, path) = vault("nameless", "---\nname: nameless\n---\nBody.\n");
        let note = read_vault_skill(&vfs, &path, &sw()).unwrap();
        assert_eq!(
            note.projection.content.description,
            crate::discover::MISSING_DESCRIPTION
        );
    }

    #[test]
    fn a_missing_description_names_the_path() {
        let (vfs, path) = vault("nameless", "---\ntags:\n  - x\n---\nBody.\n");
        let err = read_vault_skill(&vfs, &path, &sw()).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("/vault/skills/nameless.md"), "{message}");
        assert!(message.contains("description"), "{message}");

        // A note with no frontmatter at all fails the same way.
        let (vfs, path) = vault("bare", "Just prose.\n");
        assert!(
            read_vault_skill(&vfs, &path, &sw())
                .unwrap_err()
                .to_string()
                .contains("/vault/skills/bare.md")
        );
    }

    #[test]
    fn unknown_keys_are_carried_verbatim() {
        let (vfs, path) = vault(
            "carrier",
            "---\ndescription: d\nowner: kelly\ntags:\n  - review\n---\nb\n",
        );
        let annotations = read_vault_skill(&vfs, &path, &sw())
            .unwrap()
            .projection
            .content
            .annotations;

        assert_eq!(annotations["owner"], serde_json::json!("kelly"));
        // `tags` rides in annotations because agent-adapt renders no `tags:`
        // key — modeling it would delete it at publish.
        assert_eq!(annotations["tags"], serde_json::json!(["review"]));
        // Modeled keys are consumed, not doubled.
        assert!(!annotations.contains_key("description"));
    }

    #[test]
    fn the_three_optional_spec_keys_are_modeled_not_carried() {
        let (vfs, path) = vault(
            "spec-fields",
            "---\ndescription: d\nlicense: MIT\ncompatibility: Requires bash\n\
             metadata:\n  author: kelly\n---\nb\n",
        );
        let content = read_vault_skill(&vfs, &path, &sw())
            .unwrap()
            .projection
            .content;

        assert_eq!(content.license.as_deref(), Some("MIT"));
        assert_eq!(content.compatibility.as_deref(), Some("Requires bash"));
        assert_eq!(content.metadata["author"], "kelly");
        // Once each: modeled, not also carried.
        assert!(content.annotations.is_empty(), "{:?}", content.annotations);
    }

    /// The whole round trip for the three: a note carrying all of them
    /// publishes each exactly once, as a modeled field rather than as a
    /// modeled field and an annotation both.
    #[test]
    fn the_three_optional_spec_keys_publish_once_each() {
        let (vfs, path) = vault(
            "code-review",
            "---\ndescription: d\nlicense: MIT\ncompatibility: Requires bash\n\
             metadata:\n  author: kelly\nowner: kelly\n---\nb\n",
        );
        let note = read_vault_skill(&vfs, &path, &sw()).unwrap();
        // A dialect that omits every Claude Code extension key, so what is
        // left is the Agent Skills spec's six and nothing else.
        let files =
            crate::projection::project_skill(&note.projection, &["antigravity".to_owned()], &sw())
                .unwrap();
        let text = String::from_utf8(files[0].content.clone()).unwrap();

        assert_eq!(text.matches("license:").count(), 1, "{text}");
        assert_eq!(text.matches("compatibility:").count(), 1, "{text}");
        assert_eq!(text.matches("metadata:").count(), 1, "{text}");
        assert!(text.contains("license: MIT"), "{text}");
        assert!(text.contains("compatibility: Requires bash"), "{text}");
        // The author's map and the unmodeled top-level key share the block.
        assert!(text.contains("  author: kelly"), "{text}");
        assert!(text.contains("  owner: kelly"), "{text}");
    }

    /// Guards the fallback [`take_string_map`]'s doc describes: a nested
    /// map stays an annotation instead of being half-lifted.
    #[test]
    fn a_nested_metadata_map_stays_an_annotation() {
        let (vfs, path) = vault(
            "nested",
            "---\ndescription: d\nmetadata:\n  outer:\n    inner: v\n---\nb\n",
        );
        let content = read_vault_skill(&vfs, &path, &sw())
            .unwrap()
            .projection
            .content;

        assert!(content.metadata.is_empty());
        assert_eq!(
            content.annotations["metadata"],
            serde_json::json!({"outer": {"inner": "v"}})
        );
    }

    #[test]
    fn our_namespace_is_typed_and_never_lands_in_annotations() {
        // A bare `targets:` used to ride here as an unknown key. Under the
        // contract it is `sw-targets`, it is ours, and it is typed —
        // annotations holds genuinely foreign keys only.
        let (vfs, path) = vault(
            "adopted",
            "---\n\
             description: d\n\
             owner: kelly\n\
             sw-kind: skill\n\
             sw-targets:\n  - claude-code\n\
             sw-plugin: tools\n\
             sw-source: /src/review\n\
             sw-format: claude\n\
             sw-source-hash: \"3f9a\"\n\
             sw-adopted-hash: \"b17c\"\n\
             sw-adopted-at: 2026-08-11\n\
             sw-also-at:\n  - /elsewhere/review\n\
             sw-not-modeled-yet: keep me\n\
             ---\nb\n",
        );
        let note = read_vault_skill(&vfs, &path, &sw()).unwrap();

        assert_eq!(note.frontmatter.kind(), EntityKind::Skill);
        assert_eq!(
            note.frontmatter.targets,
            Some(vec!["claude-code".to_owned()])
        );
        assert_eq!(note.frontmatter.plugin.as_deref(), Some("tools"));
        assert_eq!(
            note.frontmatter.provenance.source.as_deref(),
            Some("/src/review")
        );
        assert_eq!(
            note.frontmatter.provenance.adopted_at.as_deref(),
            Some("2026-08-11"),
            "an unquoted date stays a string through the YAML/JSON hop"
        );
        assert_eq!(
            note.frontmatter.unknown_ours["sw-not-modeled-yet"],
            serde_json::json!("keep me")
        );

        // The whole point: annotations is foreign keys only.
        let annotations = note.projection.content.annotations;
        assert_eq!(annotations["owner"], serde_json::json!("kelly"));
        assert!(
            annotations.keys().all(|k| !k.starts_with("sw")),
            "our namespace leaked into annotations: {annotations:?}"
        );
        assert_eq!(annotations.len(), 1);
    }

    #[test]
    fn a_configured_vault_types_its_own_prefix_and_carries_the_default_one() {
        // The structural strip under a configured stem: `x-` is lifted off the
        // note before a `SkillContent` exists, and `sw-kind` — which this
        // vault never claimed — lands in `annotations` with every other key
        // that is the author's own.
        let (vfs, path) = vault(
            "configured",
            "---\n\
             description: d\n\
             x-kind: skill\n\
             x-source: /src/review\n\
             x-not-modeled-yet: keep me\n\
             sw-kind: somebody-elses-key\n\
             ---\nb\n",
        );
        let note = read_vault_skill(&vfs, &path, &Namespace::new("x").unwrap()).unwrap();

        assert_eq!(note.frontmatter.declared_kind, Some(EntityKind::Skill));
        assert_eq!(
            note.frontmatter.provenance.source.as_deref(),
            Some("/src/review")
        );
        assert_eq!(
            note.frontmatter.unknown_ours["x-not-modeled-yet"],
            serde_json::json!("keep me")
        );

        let annotations = note.projection.content.annotations;
        assert_eq!(
            annotations["sw-kind"],
            serde_json::json!("somebody-elses-key")
        );
        assert_eq!(annotations.len(), 1, "{annotations:?}");
    }

    #[test]
    fn the_nested_shape_reads_the_same_as_the_flat_one() {
        // the plugin writes this shape; the CLI has to read it from day
        // one, because both surfaces edit one vault.
        let (vfs, path) = vault(
            "nested",
            "---\ndescription: d\nsw:\n  kind: plugin\n  targets:\n    - claude-code\n  source: /src\n---\nb\n",
        );
        let note = read_vault_skill(&vfs, &path, &sw()).unwrap();

        assert_eq!(note.frontmatter.declared_kind, Some(EntityKind::Plugin));
        assert_eq!(
            note.frontmatter.targets,
            Some(vec!["claude-code".to_owned()])
        );
        assert_eq!(note.frontmatter.provenance.source.as_deref(), Some("/src"));
        assert!(note.projection.content.annotations.is_empty());
    }

    #[test]
    fn a_note_carrying_both_shapes_is_refused() {
        let (vfs, path) = vault(
            "mixed",
            "---\ndescription: d\nsw:\n  kind: skill\nsw-targets:\n  - claude-code\n---\nb\n",
        );
        let message = read_vault_skill(&vfs, &path, &sw())
            .unwrap_err()
            .to_string();

        assert!(message.contains("mixed-frontmatter-shape"), "{message}");
        assert!(message.contains("/vault/skills/mixed.md"), "{message}");
        assert!(message.contains("`sw-targets`"), "{message}");
    }

    #[test]
    fn an_unknown_kind_is_refused_before_the_description_check() {
        // Two diagnoses compete on this note, and the right one has to win:
        // "your kind is a typo" rather than "this is not a skill".
        let (vfs, path) = vault("typo", "---\nsw-kind: skil\n---\nb\n");
        let message = read_vault_skill(&vfs, &path, &sw())
            .unwrap_err()
            .to_string();

        assert!(message.contains("unknown-kind"), "{message}");
        assert!(message.contains("skil"), "{message}");
        assert!(
            !message.contains("description"),
            "the kind refusal must not be masked by the description check: {message}"
        );
    }

    #[test]
    fn a_wrong_shaped_modeled_key_is_carried_rather_than_swallowed() {
        let (vfs, path) = vault(
            "odd",
            "---\ndescription: d\nallowed-tools: Read\nuser-invocable: yes-please\n---\nb\n",
        );
        let content = read_vault_skill(&vfs, &path, &sw())
            .unwrap()
            .projection
            .content;

        assert!(content.allowed_tools.is_empty());
        assert!(content.user_invocable, "falls back to the default");
        assert_eq!(
            content.annotations["allowed-tools"],
            serde_json::json!("Read")
        );
        assert_eq!(
            content.annotations["user-invocable"],
            serde_json::json!("yes-please")
        );
    }

    /// The folder a note owns is the one holding it, and the note itself is
    /// not one of its own resources.
    #[test]
    fn peers_come_from_the_folder_holding_the_note_with_their_exec_bits() {
        let vfs = MemVfs::new();
        let bundle = Path::new("/vault/skills/code-review");
        let path = bundle.join("code-review.md");
        vfs.create_dir_all(&bundle.join("scripts")).unwrap();
        vfs.create_dir_all(&bundle.join("references")).unwrap();
        vfs.write_file(&path, b"---\ndescription: d\n---\nb\n")
            .unwrap();
        vfs.write_file(&bundle.join("scripts/check.py"), b"print()\n")
            .unwrap();
        vfs.set_executable(&bundle.join("scripts/check.py"), true)
            .unwrap();
        vfs.write_file(&bundle.join("references/style.md"), b"# Style\n")
            .unwrap();

        let resources = read_vault_skill(&vfs, &path, &sw())
            .unwrap()
            .projection
            .resources;
        assert_eq!(
            resources,
            vec![
                (
                    "references/style.md".to_owned(),
                    b"# Style\n".to_vec(),
                    false
                ),
                ("scripts/check.py".to_owned(), b"print()\n".to_vec(), true),
            ],
            "the entry note is inside the bundle and is not carried twice"
        );
    }

    #[test]
    fn a_note_that_owns_no_folder_has_no_resources_rather_than_an_error() {
        let (vfs, path) = vault("lonely", "---\ndescription: d\n---\nb\n");
        assert!(
            read_vault_skill(&vfs, &path, &sw())
                .unwrap()
                .projection
                .resources
                .is_empty()
        );
    }

    /// Guards the divergence [`bundle_root`]'s doc warns against: a sibling
    /// folder named after the note is not its bundle, only a folder the note
    /// itself sits atop is.
    #[test]
    fn a_sibling_folder_named_after_the_note_is_not_the_note_s_bundle() {
        let (vfs, path) = vault("code-review", "---\ndescription: d\n---\nb\n");
        let sibling = Path::new("/vault/skills/code-review");
        vfs.create_dir_all(sibling).unwrap();
        vfs.write_file(&sibling.join("style.md"), b"# Style\n")
            .unwrap();

        assert!(
            read_vault_skill(&vfs, &path, &sw())
                .unwrap()
                .projection
                .resources
                .is_empty()
        );
    }

    #[test]
    fn malformed_frontmatter_names_the_path() {
        let (vfs, path) = vault("broken", "---\ndescription: [unclosed\n---\nb\n");
        let message = read_vault_skill(&vfs, &path, &sw())
            .unwrap_err()
            .to_string();
        assert!(message.contains("/vault/skills/broken.md"), "{message}");
        assert!(message.contains("invalid frontmatter"), "{message}");
    }

    #[test]
    fn the_body_passes_through_verbatim_wikilinks_and_all() {
        // Transclusion and link rewriting are a later phase; this pins that
        // nothing here pretends they ran.
        let (vfs, path) = vault(
            "linky",
            "---\ndescription: d\n---\nSee ![[house-style]] and [[glossary]].\n",
        );
        assert_eq!(
            read_vault_skill(&vfs, &path, &sw())
                .unwrap()
                .projection
                .content
                .body,
            "See ![[house-style]] and [[glossary]].\n"
        );
    }
}
