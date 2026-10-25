//! A thin wasm-bindgen surface over `tradecraft-core`.
//!
//! The TypeScript side is a projection of this one Rust implementation, reached
//! over wasm — never a second copy of the compiler. Nothing here decides
//! anything: parsing a skill note, resolving links, choosing a target layout,
//! deciding whether a destination file may be overwritten all live in the core,
//! and this crate exists only to let JavaScript reach them.
//!
//! # The exports, and what each reaches
//!
//! | Export | Core entry point | The verbs over it |
//! |---|---|---|
//! | `publishSkill` | `publish::publish_skill` | `publish` |
//! | `validateNamespace` | `Namespace::new` | every verb, once, at configuration load |
//! | `discoverComponents` | `discover::discover_components` | the vault scan every other verb needs |
//! | `exportSkills` | `export::export_skills` | `build`, and `check` through `mode` |
//! | `adoptSkills` | `adopt::adopt_skills` | `adopt`, and its preview through `mode` |
//! | `knownTargets` | `publish::KNOWN_TARGETS` | every verb that takes a target name |
//! | `statusOf` | `status::status_of` | `status` |
//!
//! Seven exports, six core entry points, seven verbs' worth of behaviour — because
//! a mode is a key on the request rather than an export of its own. See
//! [`publish_skill`]'s "A dry run is one more key" note; `exportSkills` and
//! `adoptSkills` are the same construction, and there is deliberately no
//! `checkSkills` or `previewAdopt` beside them.
//!
//! # Boundary choices
//!
//! - **The filesystem is an argument, not an ambient.** Every export takes the
//!   host's `Vfs` object first. `wasm32-unknown-unknown` has no filesystem, so
//!   there is nothing to reach for; see `js_vfs` for why that is a synchronous
//!   call into JS and what happens when the host throws.
//! - **The request and report cross as JSON strings**, deserialized and
//!   serialized by the same `serde_json` the core is compiled against, through
//!   the core's own derives. The wrappers this crate owns — `WireRequest`,
//!   `WireExportRequest`, `WireAdoptRequest` — `flatten` the core's own
//!   request rather than re-declaring its fields, so there is no second copy of
//!   a request shape here to drift from the core's. `WireDiscoverRequest` is
//!   the one exception and it re-declares nothing either: `discover_components`
//!   takes loose parameters rather than a struct, so there is no core shape to
//!   flatten and none to drift from.
//! - **A `CoreError` becomes a thrown JS `Error`** whose `.name` is the variant,
//!   mirroring what `yaml-splice-wasm` does for `EditError`. `Refused` and
//!   `Conflict` in particular are the safety rails working, and a caller that
//!   wants to tell them from a genuine I/O failure reads `.name` rather than
//!   pattern-matching on a message.
//!
//! # A refusal is not an error
//!
//! Note the asymmetry: a whole publish that a rail stops throws, but a single
//! file the rail declines to overwrite comes back INSIDE the report as a
//! `PublishedFile` with `status: "refused"` and a reason. That is the core's
//! design, not this crate's, and the mapping below must not flatten it.
//!
//! The same asymmetry, exactly, on the newer exports: an adoption a rail stops
//! whole — a symlinked source, a source the skills root contains — throws, and
//! one skill whose vault target already exists comes back inside `AdoptReport`
//! as an `AdoptedSkill` with `status: "refused"`. An export has no per-unit
//! refusal at all: its rails fire before anything is staged, so every refusal
//! it can produce is a throw.

mod js_vfs;

use std::path::PathBuf;
use std::str::FromStr;

use tradecraft_core::CoreError;
use tradecraft_core::EntityKind;
use tradecraft_core::Namespace;
use tradecraft_core::adopt::{AdoptRequest, adopt_skills as core_adopt_skills};
use tradecraft_core::discover::discover_components as core_discover_components;
use tradecraft_core::export::{ExportRequest, export_skills as core_export_skills};
use tradecraft_core::namespace::InvalidStem;
use tradecraft_core::publish::{
    KNOWN_TARGETS, PublishRequest, canonical_target as core_canonical_target, kind_has_renderer,
    publish_skill as core_publish_skill,
};
// By module path, not the crate root: `tradecraft_core::UnitStatus` is
// re-exported there and is the marketplace's four-word status, a different
// type from `status::UnitStatus`.
use serde::{Deserialize, Serialize};
use tradecraft_core::status::{StatusRequest, status_of as core_status_of};
use wasm_bindgen::prelude::*;

pub use js_vfs::{HostVfs, JsVfs};

/// What crosses the boundary as `request_json`: the core's `PublishRequest`,
/// plus the one field this layer adds.
///
/// A field on the request rather than a third parameter, so the exported arity
/// does not move: hosts call `publishSkill(vfs, requestJson)`.
/// `#[serde(default)]` makes the field optional, so a request serialized
/// without it still deserializes and publishes under `tc`.
///
/// It is a `String` stem rather than a `Namespace` because the core
/// deliberately gives `Namespace` no `Deserialize`: every construction goes
/// through [`Namespace::new`], so a stem that arrives over the wire is
/// validated at the same gate a stem typed at a terminal is, and the same
/// [`InvalidStem`] comes back.
#[derive(Deserialize)]
struct WireRequest {
    /// Flattened, not re-declared: `skill_path`, `destination_root` and
    /// `target` are read by the core's own derive.
    #[serde(flatten)]
    request: PublishRequest,
    /// The vault's frontmatter namespace, as a stem — `tc`, or whatever the
    /// host configured. Absent means [`Namespace::default`].
    #[serde(default)]
    namespace: Option<String>,
}

/// Publish one skill to one destination.
///
/// `vfs` is the host's filesystem object (see `js_vfs`); `request_json` is a
/// serialized `PublishRequest`, optionally carrying a `namespace` stem (see
/// `WireRequest`). Returns a serialized `PublishReport`.
///
/// Exported to JavaScript as `publishSkill`, in the same camelCase
/// `yaml-splice-wasm` uses for `editYaml`.
///
/// # A dry run is one more key, not one more export
///
/// `PublishRequest` carries a `mode`: `"write"`, or `"dry-run"` to classify
/// every file and write nothing. The key is optional and absent means
/// `"write"`, so a host that has never heard of it keeps publishing exactly as
/// before, and one that wants a preview adds a key to the JSON it already
/// builds.
///
/// There is deliberately no `dryRunSkill` beside this: the core runs one
/// publish path in both modes (see `tradecraft_core::publish`'s module doc),
/// and the mode rides the wire the core's own derives define, so the generated
/// glue and `.d.ts` are unmoved by it.
///
/// # The namespace is read once, here, and handed on once
///
/// The stem off the wire becomes exactly one [`Namespace`], which goes to
/// `publish_skill` as its single `ns` argument — the core then hands that same
/// value to both the read and the emit. There is no second place in this
/// function where a prefix could be spelled.
///
/// # Errors
///
/// A stem the core refuses throws an `Error` whose `.name` is `InvalidStem`,
/// carrying [`InvalidStem`]'s own message. A host should validate its
/// configured stem up front with [`validate_namespace`] rather than discover it
/// one publish at a time — a bad stem is a configuration fault, not a fact
/// about the note in front of it.
#[wasm_bindgen(js_name = publishSkill)]
pub fn publish_skill(vfs: JsValue, request_json: &str) -> Result<String, JsValue> {
    let vfs = JsVfs::adopt(vfs).map_err(|e| core_error_to_js(&e))?;
    let wire: WireRequest = serde_json::from_str(request_json)
        .map_err(|e| throwable(&format!("request is not a valid PublishRequest: {e}")))?;

    let ns = namespace_of(wire.namespace.as_deref())?;

    let report = core_publish_skill(&vfs, &wire.request, &ns).map_err(|e| core_error_to_js(&e))?;

    report_json("publish report", &report)
}

/// Check that `stem` can be a frontmatter namespace, without publishing
/// anything.
///
/// Exists so a host can fail a bad stem where the user set it — at
/// configuration load — instead of once per note, without re-implementing
/// [`Namespace::new`]'s rules in its own language. Those rules decide which of
/// the author's keys get *deleted* at publish, so a TypeScript copy that
/// drifted by one case would accept a stem the core refuses or reads
/// differently.
///
/// Returns nothing on success. There is deliberately nothing to return: the
/// derived forms (`prefix`, `block_key`) stay inside the core, so no host is
/// ever tempted to spell `stem + "-"` for itself.
///
/// # Errors
///
/// An `Error` whose `.name` is `InvalidStem` and whose message is
/// [`InvalidStem`]'s own — the offending stem and the reason, unmodified, so a
/// host prints it rather than re-words it.
#[wasm_bindgen(js_name = validateNamespace)]
pub fn validate_namespace(stem: &str) -> Result<(), JsValue> {
    Namespace::new(stem)
        .map(|_| ())
        .map_err(|e| invalid_stem_to_js(&e))
}

/// Every target name a note's targets key and a `--target` flag may name,
/// sorted — `tradecraft_core::publish::KNOWN_TARGETS`, verbatim.
///
/// Exported so a host validating a name off a command line checks the same
/// list the core checks a note's frontmatter against. Without it a host has to
/// keep its own copy, and a name added here would be accepted in a note and
/// rejected on the command line by the same build.
///
/// Returns a serialized array of strings, like every other export here: one
/// wire form, and no `Array` marshalling for a list that changes at compile
/// time.
#[wasm_bindgen(js_name = knownTargets)]
pub fn known_targets() -> Result<String, JsValue> {
    report_json("known targets", &KNOWN_TARGETS)
}

/// The one destination a target name folds onto, or `undefined` for a name
/// outside [`KNOWN_TARGETS`] — `tradecraft_core::publish::canonical_target`,
/// verbatim.
///
/// Exported because the fold is not derivable from [`known_targets`] alone:
/// that list carries both spellings of a destination (`claude` and
/// `claude-code`) and says nothing about which pairs name the same place. A
/// host narrowing a run by `--target claude` against a destination configured
/// `claude-code` has to ask the core, or keep a second copy of the table and
/// drift from it.
///
/// # Why this one does not cross as JSON
///
/// Every export above hands back a serialized core structure, because that is
/// the only way a struct crosses. This answers with one name out of a
/// compile-time vocabulary — there is no structure, and no error either, so
/// there is nothing for a `Result<String, JsValue>` to carry. Wrapping it
/// would add a `JSON.parse` to a value that is already a string.
#[wasm_bindgen(js_name = canonicalTarget)]
pub fn canonical_target(name: &str) -> Option<String> {
    core_canonical_target(name).map(ToOwned::to_owned)
}

/// Every entity kind a publish has a projection for, in
/// [`EntityKind::KNOWN`]'s order — the kinds
/// `tradecraft_core::publish::kind_has_renderer` admits.
///
/// Exported so a host can tell a note it should never ask about from one whose
/// state it could not determine. A marketplace and a hook are real vault
/// entities that no destination installs directly; a host that asks anyway
/// gets `no-renderer` back and has to decide whether that is drift (it is not)
/// or the shape of the vault (it is).
///
/// A fixed vocabulary rather than a structure, so it crosses as values — see
/// [`canonical_target`].
#[wasm_bindgen(js_name = publishableKinds)]
pub fn publishable_kinds() -> Vec<String> {
    EntityKind::KNOWN
        .iter()
        .filter(|name| EntityKind::from_str(name).is_ok_and(kind_has_renderer))
        .map(|name| (*name).to_owned())
        .collect()
}

// --- discovery ---------------------------------------------------------------

/// What crosses as `request_json` for [`discover_components`].
///
/// The one wire shape in this crate that does not `flatten` a core struct,
/// because there is no core struct to flatten: `discover_components` takes its
/// vault root and skills root as loose parameters. So this is not a second
/// copy of anything — it is the parameter list, spelled once, in the only
/// place it has to cross a wire.
#[derive(Debug, Deserialize)]
struct WireDiscoverRequest {
    /// Absolute path to the vault.
    vault_root: PathBuf,
    /// The content root to scan. Absent means the vault root, exactly as the
    /// core reads it.
    #[serde(default)]
    skills_root: Option<PathBuf>,
    /// The vault's frontmatter namespace, as a stem. Absent means
    /// [`Namespace::default`].
    #[serde(default)]
    namespace: Option<String>,
}

/// Every component under a vault's skills root, vetted and sorted, and every
/// note the scan could not read.
///
/// `vfs` is the host's filesystem object; `request_json` is a
/// `WireDiscoverRequest`. Returns a serialized
/// `tradecraft_core::DiscoveryReport` — the core's own return value, an
/// object with `components` and `skipped`. Both halves cross: a host that saw
/// only the roster could not tell a vault with three skills from a vault with
/// three skills and a note nobody can read.
///
/// Every other verb here is vault-wide because of this scan.
///
/// # Errors
///
/// Only what is not a fact about one note: a missing skills root
/// (`RootNotFound`), a symlink in the tree, a duplicate name, and a bundle
/// containing another component's entry. Everything wrong with a single note
/// is reported in `skipped` and does not throw — one half-written draft must
/// not block every publish out of a shared vault.
#[wasm_bindgen(js_name = discoverComponents)]
pub fn discover_components(vfs: JsValue, request_json: &str) -> Result<String, JsValue> {
    let vfs = JsVfs::adopt(vfs).map_err(|e| core_error_to_js(&e))?;
    let wire: WireDiscoverRequest = serde_json::from_str(request_json)
        .map_err(|e| throwable(&format!("request is not a valid discovery request: {e}")))?;
    let ns = namespace_of(wire.namespace.as_deref())?;

    let report = core_discover_components(&vfs, &wire.vault_root, wire.skills_root.as_deref(), &ns)
        .map_err(|e| core_error_to_js(&e))?;

    report_json("discovery report", &report)
}

// --- the marketplace ---------------------------------------------------------

/// What crosses as `request_json` for [`export_skills`]: the core's
/// [`ExportRequest`], flattened, plus the namespace stem this layer adds.
#[derive(Deserialize)]
struct WireExportRequest {
    /// Flattened, not re-declared: every field the core's own derive reads
    /// arrives here untouched, so a field added there needs no change here.
    #[serde(flatten)]
    request: ExportRequest,
    /// The vault's frontmatter namespace, as a stem. Absent means
    /// [`Namespace::default`], exactly as on [`WireRequest`].
    #[serde(default)]
    namespace: Option<String>,
}

/// Render the vault into one marketplace tree per harness — and, per the request's
/// `mode`, either swap the drifted roots into place or report the drift and
/// write nothing.
///
/// `vfs` is the host's filesystem object; `request_json` is a serialized
/// `ExportRequest` optionally carrying a `namespace` stem (see
/// `WireExportRequest`). Returns a serialized `ExportReport`.
///
/// # `build` and `check` are one export, because they are one path
///
/// `mode` is `"build"`, or `"check"` to render into the overlay, compare, and
/// write nothing under any outcome. The key is optional and absent means
/// `"build"` — the same default-to-the-write choice `PublishRequest` makes.
///
/// `check`'s verdict cannot disagree with `build`'s: there is one render and
/// one comparison behind both. See `tradecraft_core::export`'s module doc.
///
/// The exit code is the caller's, not this layer's: `ExportReport.changed` is
/// the fact, and a `check` that exits 1 on drift is the CLI reading it.
///
/// # Errors
///
/// * `Refused` — the rail (an output root that is, contains, or sits inside the
///   vault), `empty-marketplace` (a vault with nothing publishable), and
///   everything discovery and compilation refuse.
/// * `SwapFailed` — the commit failed part-way; the message says what the
///   rollback restored. Its own `.name`, because a host has to be able to tell
///   "nothing happened" from "something happened and was undone".
///
/// There is no per-unit refusal to look for inside the report: an export's
/// rails all fire before anything is staged.
#[wasm_bindgen(js_name = exportSkills)]
pub fn export_skills(vfs: JsValue, request_json: &str) -> Result<String, JsValue> {
    let vfs = JsVfs::adopt(vfs).map_err(|e| core_error_to_js(&e))?;
    let wire: WireExportRequest = serde_json::from_str(request_json)
        .map_err(|e| throwable(&format!("request is not a valid ExportRequest: {e}")))?;
    let ns = namespace_of(wire.namespace.as_deref())?;

    let report = core_export_skills(&vfs, &wire.request, &ns).map_err(|e| core_error_to_js(&e))?;

    report_json("export report", &report)
}

// --- adoption ----------------------------------------------------------------

/// What crosses as `request_json` for [`adopt_skills`]: the core's
/// [`AdoptRequest`], flattened, plus the namespace stem this layer adds.
#[derive(Debug, Deserialize)]
struct WireAdoptRequest {
    /// Flattened, not re-declared — including `adopted_at`, which is required
    /// because the core has no clock and will not invent one.
    #[serde(flatten)]
    request: AdoptRequest,
    /// The vault's frontmatter namespace, as a stem. Absent means
    /// [`Namespace::default`]. It decides how the provenance keys the adoption
    /// stamps are spelled, so a vault configured to `x` gets `x-source` and
    /// reads it back as its own.
    #[serde(default)]
    namespace: Option<String>,
}

/// Import published `SKILL.md` bundles into the vault as notes — or, under
/// `mode: "dry-run"`, report what that would have done and write nothing.
///
/// `vfs` is the host's filesystem object; `request_json` is a serialized
/// `AdoptRequest` optionally carrying a `namespace` stem (see
/// `WireAdoptRequest`). Returns a serialized `AdoptReport`.
///
/// # The preview is the core's mode, and a caller may not predict it
///
/// `mode` is `"write"`, or `"dry-run"` to plan the whole adoption and stop.
/// Absent means `"write"`. The core runs the identical path in both, over a
/// capturing overlay — same names, same collision refusals, same per-skill
/// `refused` where a vault note already exists — so the preview is the report
/// the write would have produced.
///
/// A host computing its own preview would be a second implementation of
/// adoption's naming and refusal rules, wrong the first time the core's moved.
///
/// # Errors
///
/// Everything the core refuses before a byte is written, thrown: `RootNotFound`
/// for a missing source, and `Refused` for the rail (a skills root that is,
/// contains, or sits inside the source), `unknown-target`, `unsafe-path`,
/// `path-collision`; `SkillNotFound` where a requested skill matched nothing.
///
/// An adoption target that already exists is NOT one of these. It is
/// `status: "refused"` on that skill's report line, with the others proceeding
/// — the same rail-inside-the-report shape `publishSkill` documents.
#[wasm_bindgen(js_name = adoptSkills)]
pub fn adopt_skills(vfs: JsValue, request_json: &str) -> Result<String, JsValue> {
    let vfs = JsVfs::adopt(vfs).map_err(|e| core_error_to_js(&e))?;
    let wire: WireAdoptRequest = serde_json::from_str(request_json)
        .map_err(|e| throwable(&format!("request is not a valid AdoptRequest: {e}")))?;
    let ns = namespace_of(wire.namespace.as_deref())?;

    let report = core_adopt_skills(&vfs, &wire.request, &ns).map_err(|e| core_error_to_js(&e))?;

    report_json("adopt report", &report)
}

// --- tracking ----------------------------------------------------------------

/// What crosses as `request_json` for [`status_of`]: the core's
/// [`StatusRequest`], flattened, plus the namespace stem this layer adds.
#[derive(Deserialize)]
struct WireStatusRequest {
    /// Flattened, not re-declared — `skill_path`, `destination_root`,
    /// `target` and `skills_root` are read by the core's own derive, so a
    /// field added to the core's request reaches the boundary with no edit
    /// here.
    #[serde(flatten)]
    request: StatusRequest,
    /// The vault's frontmatter namespace, as a stem. Absent means
    /// [`Namespace::default`], exactly as on [`WireRequest`].
    #[serde(default)]
    namespace: Option<String>,
}

/// One unit's publish state at one destination, for one target.
///
/// `vfs` is the host's filesystem object; `request_json` is a serialized
/// `StatusRequest` optionally carrying a `namespace` stem (see
/// `WireStatusRequest`). Returns a serialized `status::UnitStatus`.
///
/// # A status is a publish that writes nothing
///
/// The core runs the classification a publish performs, in
/// `PublishMode::DryRun` over the capturing overlay, and reads its report. No
/// host may compute a state for itself: the five words come back from here
/// already decided.
///
/// Nothing is written and no clock is read, which is why this export takes no
/// timestamp where [`publish_skill`] does.
///
/// # Errors
///
/// Everything a publish of the same unit would throw, unchanged: an unreadable
/// note, an unknown target, the destination rail. A destination whose manifest
/// cannot be read is NOT one of these — it comes back inside the report as
/// `state: "unknown"` with the reason, because "we could not determine a
/// state" is an answer rather than a failure.
#[wasm_bindgen(js_name = statusOf)]
pub fn status_of(vfs: JsValue, request_json: &str) -> Result<String, JsValue> {
    let vfs = JsVfs::adopt(vfs).map_err(|e| core_error_to_js(&e))?;
    let wire: WireStatusRequest = serde_json::from_str(request_json)
        .map_err(|e| throwable(&format!("request is not a valid StatusRequest: {e}")))?;
    let ns = namespace_of(wire.namespace.as_deref())?;

    let status = core_status_of(&vfs, &wire.request, &ns).map_err(|e| core_error_to_js(&e))?;

    report_json("status report", &status)
}

// --- the shared half of every export ---------------------------------------

/// The stem off the wire as exactly one [`Namespace`].
///
/// One function rather than four copies: a second place where a prefix could
/// be spelled is the only way the read-once guarantee breaks.
fn namespace_of(stem: Option<&str>) -> Result<Namespace, JsValue> {
    match stem {
        Some(stem) => Namespace::new(stem).map_err(|e| invalid_stem_to_js(&e)),
        None => Ok(Namespace::default()),
    }
}

/// A core report as the JSON string that crosses back.
///
/// `what` names the report in the failure message, because an unserializable
/// report is a bug in this crate and the message is what says which one.
fn report_json<T: Serialize>(what: &str, report: &T) -> Result<String, JsValue> {
    serde_json::to_string(report).map_err(|e| throwable(&format!("serializing the {what}: {e}")))
}

// --- CoreError -> thrown JS Error ------------------------------------------

fn core_error_to_js(e: &CoreError) -> JsValue {
    let err = js_sys::Error::new(&e.to_string());
    err.set_name(variant_name(e));
    err.into()
}

/// A configured stem that cannot be a namespace, as a thrown `Error`.
///
/// `.name` is `InvalidStem` — the core's type, not a `CoreError` variant, and
/// not one either: nothing was read, no note is involved, and a host that
/// matched this against the `CoreError` names would be told a publish failed
/// when in fact it never started. The message is `InvalidStem`'s `Display`
/// verbatim, which already names the stem and the reason.
fn invalid_stem_to_js(e: &InvalidStem) -> JsValue {
    let err = js_sys::Error::new(&e.to_string());
    err.set_name("InvalidStem");
    err.into()
}

/// A boundary failure that never reached the core — bad JSON in, unserializable
/// report out. Deliberately left with JavaScript's own `Error` name, because it
/// is not any `CoreError` variant and claiming one would be a lie.
fn throwable(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}

/// The variant name, as `.name` on the thrown `Error`. Exhaustive on purpose:
/// a new `CoreError` variant should fail to compile here rather than silently
/// inherit a neighbour's name.
fn variant_name(e: &CoreError) -> &'static str {
    match e {
        CoreError::RootNotFound(_) => "RootNotFound",
        CoreError::PathEscapesRoot(_) => "PathEscapesRoot",
        CoreError::SkillNotFound(_) => "SkillNotFound",
        CoreError::Io { .. } => "Io",
        CoreError::Refused(_) => "Refused",
        CoreError::Conflict(_) => "Conflict",
        CoreError::Projection(_) => "Projection",
        CoreError::SwapFailed(_) => "SwapFailed",
    }
}

/// The wire, and only the wire.
///
/// What these pin is the half of the boundary that fails silently: a
/// `#[serde(flatten)]` envelope whose optional key is spelled wrong parses
/// fine and drops the value, so a `mode: "check"` that never reached the core
/// would write a marketplace a caller asked it not to. The exports themselves
/// need a JS engine, so they are tested end to end against the artifact
/// `build.sh` produces, not here.
#[cfg(test)]
mod tests {
    use tradecraft_core::{AdoptMode, ExportMode};

    use super::*;

    #[test]
    fn an_export_request_flattens_and_its_absences_are_the_core_defaults() {
        let wire: WireExportRequest = serde_json::from_str(
            r#"{
                "vault_root": "/vault",
                "out_root": "/out",
                "config": { "name": "market", "default_plugin": "tools" }
            }"#,
        )
        .unwrap();

        assert_eq!(wire.request.vault_root, PathBuf::from("/vault"));
        assert_eq!(wire.request.out_root, PathBuf::from("/out"));
        assert_eq!(wire.request.config.default_plugin, "tools");
        // Every absence, at its documented default.
        assert_eq!(wire.request.mode, ExportMode::Build);
        assert_eq!(wire.request.skills_root, None);
        assert_eq!(wire.namespace, None);
        assert!(wire.request.config.plugins.is_empty());
    }

    #[test]
    fn check_mode_and_a_stem_cross_beside_the_flattened_request() {
        let wire: WireExportRequest = serde_json::from_str(
            r#"{
                "vault_root": "/vault",
                "skills_root": "/vault/skills",
                "out_root": "/out",
                "mode": "check",
                "namespace": "x",
                "config": { "name": "market", "default_plugin": "tools" }
            }"#,
        )
        .unwrap();

        assert_eq!(wire.request.mode, ExportMode::Check);
        assert_eq!(wire.namespace.as_deref(), Some("x"));
        assert_eq!(
            wire.request.skills_root,
            Some(PathBuf::from("/vault/skills"))
        );
    }

    #[test]
    fn an_adopt_request_flattens_and_dry_run_reaches_the_core_mode() {
        let write: WireAdoptRequest = serde_json::from_str(
            r#"{
                "source": "/src",
                "vault_root": "/vault",
                "adopted_at": "2026-08-22T00:00:00Z"
            }"#,
        )
        .unwrap();
        assert_eq!(write.request.mode, AdoptMode::Write);
        assert!(write.request.overwrite.is_empty());
        assert_eq!(write.request.plugin, None);
        assert_eq!(write.request.targets, None);

        let preview: WireAdoptRequest = serde_json::from_str(
            r#"{
                "source": "/src",
                "vault_root": "/vault",
                "adopted_at": "2026-08-22T00:00:00Z",
                "mode": "dry-run",
                "plugin": "adopted",
                "targets": ["claude"],
                "skills": ["code-review"],
                "overwrite": ["/vault/plugins/adopted/skills/code-review/code-review.md"],
                "namespace": "x"
            }"#,
        )
        .unwrap();
        assert_eq!(preview.request.mode, AdoptMode::DryRun);
        assert_eq!(preview.request.plugin.as_deref(), Some("adopted"));
        assert_eq!(
            preview.request.targets.as_deref(),
            Some(&["claude".to_string()][..])
        );
        assert_eq!(
            preview.request.skills.as_deref(),
            Some(&["code-review".to_string()][..])
        );
        assert_eq!(
            preview.request.overwrite,
            ["/vault/plugins/adopted/skills/code-review/code-review.md"]
        );
        assert_eq!(preview.namespace.as_deref(), Some("x"));
    }

    #[test]
    fn an_adoption_without_a_timestamp_is_refused_at_the_wire() {
        // The core has no clock, so `adopted_at` is required rather than
        // defaulted: a stamp this layer invented would be a fact about the
        // adoption that nothing on the wire agreed to.
        let err = serde_json::from_str::<WireAdoptRequest>(
            r#"{ "source": "/src", "vault_root": "/vault" }"#,
        )
        .unwrap_err();
        assert!(err.to_string().contains("adopted_at"), "{err}");
    }

    #[test]
    fn a_status_request_flattens_and_its_namespace_defaults() {
        let wire: WireStatusRequest = serde_json::from_str(
            r#"{
                "skill_path": "/vault/skills/code-review.md",
                "destination_root": "/dest",
                "target": "claude"
            }"#,
        )
        .unwrap();

        assert_eq!(
            wire.request.skill_path,
            PathBuf::from("/vault/skills/code-review.md")
        );
        assert_eq!(wire.request.destination_root, PathBuf::from("/dest"));
        assert_eq!(wire.request.target, "claude");
        // Absence has one meaning, and it is the documented default rather
        // than a failure.
        assert_eq!(wire.request.skills_root, None);
        assert_eq!(wire.namespace, None);

        let stemmed: WireStatusRequest = serde_json::from_str(
            r#"{
                "skill_path": "/vault/skills/code-review.md",
                "destination_root": "/dest",
                "target": "claude",
                "skills_root": "/vault",
                "namespace": "x"
            }"#,
        )
        .unwrap();
        assert_eq!(stemmed.request.skills_root, Some(PathBuf::from("/vault")));
        assert_eq!(stemmed.namespace.as_deref(), Some("x"));
    }

    #[test]
    fn a_discovery_request_defaults_its_two_optional_fields() {
        let wire: WireDiscoverRequest =
            serde_json::from_str(r#"{ "vault_root": "/vault" }"#).unwrap();
        assert_eq!(wire.skills_root, None);
        assert_eq!(wire.namespace, None);

        // And the one required field is required. It is the only one left:
        // grouping a scan by plugin moved out to the build that renders one,
        // and took the request's `default_plugin` with it.
        let err = serde_json::from_str::<WireDiscoverRequest>(r#"{}"#).unwrap_err();
        assert!(err.to_string().contains("vault_root"), "{err}");
    }
}
