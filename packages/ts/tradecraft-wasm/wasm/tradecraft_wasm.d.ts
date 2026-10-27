/* tslint:disable */
/* eslint-disable */

/**
 * Import published `SKILL.md` bundles into the vault as notes — or, under
 * `mode: "dry-run"`, report what that would have done and write nothing.
 *
 * `vfs` is the host's filesystem object; `request_json` is a serialized
 * `AdoptRequest` optionally carrying a `namespace` stem (see
 * `WireAdoptRequest`). Returns a serialized `AdoptReport`.
 *
 * # The preview is the core's mode, and a caller may not predict it
 *
 * `mode` is `"write"`, or `"dry-run"` to plan the whole adoption and stop.
 * Absent means `"write"`. The core runs the identical path in both, over a
 * capturing overlay — same names, same collision refusals, same per-skill
 * `refused` where a vault note already exists — so the preview is the report
 * the write would have produced.
 *
 * A host computing its own preview would be a second implementation of
 * adoption's naming and refusal rules, wrong the first time the core's moved.
 *
 * # Errors
 *
 * Everything the core refuses before a byte is written, thrown: `RootNotFound`
 * for a missing source, and `Refused` for the rail (a skills root that is,
 * contains, or sits inside the source), `unknown-target`, `unsafe-path`,
 * `path-collision`; `SkillNotFound` where a requested skill matched nothing.
 *
 * An adoption target that already exists is NOT one of these. It is
 * `status: "refused"` on that skill's report line, with the others proceeding
 * — the same rail-inside-the-report shape `publishSkill` documents.
 */
export function adoptSkills(vfs: any, request_json: string): string;

/**
 * The one destination a target name folds onto, or `undefined` for a name
 * outside [`KNOWN_TARGETS`] — `tradecraft_core::publish::canonical_target`,
 * verbatim.
 *
 * Exported because the fold is not derivable from [`known_targets`] alone:
 * that list carries both spellings of a destination (`claude` and
 * `claude-code`) and says nothing about which pairs name the same place. A
 * host narrowing a run by `--target claude` against a destination configured
 * `claude-code` has to ask the core, or keep a second copy of the table and
 * drift from it.
 *
 * # Why this one does not cross as JSON
 *
 * Every export above hands back a serialized core structure, because that is
 * the only way a struct crosses. This answers with one name out of a
 * compile-time vocabulary — there is no structure, and no error either, so
 * there is nothing for a `Result<String, JsValue>` to carry. Wrapping it
 * would add a `JSON.parse` to a value that is already a string.
 */
export function canonicalTarget(name: string): string | undefined;

/**
 * Every component under a vault's skills root, vetted and sorted, and every
 * note the scan could not read.
 *
 * `vfs` is the host's filesystem object; `request_json` is a
 * `WireDiscoverRequest`. Returns a serialized
 * `tradecraft_core::DiscoveryReport` — the core's own return value, an
 * object with `components` and `skipped`. Both halves cross: a host that saw
 * only the roster could not tell a vault with three skills from a vault with
 * three skills and a note nobody can read.
 *
 * Every other verb here is vault-wide because of this scan.
 *
 * # Errors
 *
 * Only what is not a fact about one note: a missing skills root
 * (`RootNotFound`), a symlink in the tree, a duplicate name, and a bundle
 * containing another component's entry. Everything wrong with a single note
 * is reported in `skipped` and does not throw — one half-written draft must
 * not block every publish out of a shared vault.
 */
export function discoverComponents(vfs: any, request_json: string): string;

/**
 * Render the vault into one marketplace tree per harness — and, per the request's
 * `mode`, either swap the drifted roots into place or report the drift and
 * write nothing.
 *
 * `vfs` is the host's filesystem object; `request_json` is a serialized
 * `ExportRequest` optionally carrying a `namespace` stem (see
 * `WireExportRequest`). Returns a serialized `ExportReport`.
 *
 * # `build` and `check` are one export, because they are one path
 *
 * `mode` is `"build"`, or `"check"` to render into the overlay, compare, and
 * write nothing under any outcome. The key is optional and absent means
 * `"build"` — the same default-to-the-write choice `PublishRequest` makes.
 *
 * `check`'s verdict cannot disagree with `build`'s: there is one render and
 * one comparison behind both. See `tradecraft_core::export`'s module doc.
 *
 * The exit code is the caller's, not this layer's: `ExportReport.changed` is
 * the fact, and a `check` that exits 1 on drift is the CLI reading it.
 *
 * # Errors
 *
 * * `Refused` — the rail (an output root that is, contains, or sits inside the
 *   vault), `empty-marketplace` (a vault with nothing publishable), and
 *   everything discovery and compilation refuse.
 * * `SwapFailed` — the commit failed part-way; the message says what the
 *   rollback restored. Its own `.name`, because a host has to be able to tell
 *   "nothing happened" from "something happened and was undone".
 *
 * There is no per-unit refusal to look for inside the report: an export's
 * rails all fire before anything is staged.
 */
export function exportSkills(vfs: any, request_json: string): string;

/**
 * Every target name a note's targets key and a `--target` flag may name,
 * sorted — `tradecraft_core::publish::KNOWN_TARGETS`, verbatim.
 *
 * Exported so a host validating a name off a command line checks the same
 * list the core checks a note's frontmatter against. Without it a host has to
 * keep its own copy, and a name added here would be accepted in a note and
 * rejected on the command line by the same build.
 *
 * Returns a serialized array of strings, like every other export here: one
 * wire form, and no `Array` marshalling for a list that changes at compile
 * time.
 */
export function knownTargets(): string;

/**
 * Publish one skill to one destination.
 *
 * `vfs` is the host's filesystem object (see `js_vfs`); `request_json` is a
 * serialized `PublishRequest`, optionally carrying a `namespace` stem (see
 * `WireRequest`). Returns a serialized `PublishReport`.
 *
 * Exported to JavaScript as `publishSkill`, in the same camelCase
 * `yaml-splice-wasm` uses for `editYaml`.
 *
 * # A dry run is one more key, not one more export
 *
 * `PublishRequest` carries a `mode`: `"write"`, or `"dry-run"` to classify
 * every file and write nothing. The key is optional and absent means
 * `"write"`, so a host that has never heard of it keeps publishing exactly as
 * before, and one that wants a preview adds a key to the JSON it already
 * builds.
 *
 * There is deliberately no `dryRunSkill` beside this: the core runs one
 * publish path in both modes (see `tradecraft_core::publish`'s module doc),
 * and the mode rides the wire the core's own derives define, so the generated
 * glue and `.d.ts` are unmoved by it.
 *
 * # The namespace is read once, here, and handed on once
 *
 * The stem off the wire becomes exactly one [`Namespace`], which goes to
 * `publish_skill` as its single `ns` argument — the core then hands that same
 * value to both the read and the emit. There is no second place in this
 * function where a prefix could be spelled.
 *
 * # Errors
 *
 * A stem the core refuses throws an `Error` whose `.name` is `InvalidStem`,
 * carrying [`InvalidStem`]'s own message. A host should validate its
 * configured stem up front with [`validate_namespace`] rather than discover it
 * one publish at a time — a bad stem is a configuration fault, not a fact
 * about the note in front of it.
 */
export function publishSkill(vfs: any, request_json: string): string;

/**
 * Every entity kind a publish has a projection for, in
 * [`EntityKind::KNOWN`]'s order — the kinds
 * `tradecraft_core::publish::kind_has_renderer` admits.
 *
 * Exported so a host can tell a note it should never ask about from one whose
 * state it could not determine. A marketplace and a hook are real vault
 * entities that no destination installs directly; a host that asks anyway
 * gets `no-renderer` back and has to decide whether that is drift (it is not)
 * or the shape of the vault (it is).
 *
 * A fixed vocabulary rather than a structure, so it crosses as values — see
 * [`canonical_target`].
 */
export function publishableKinds(): string[];

/**
 * One unit's publish state at one destination, for one target.
 *
 * `vfs` is the host's filesystem object; `request_json` is a serialized
 * `StatusRequest` optionally carrying a `namespace` stem (see
 * `WireStatusRequest`). Returns a serialized `status::UnitStatus`.
 *
 * # A status is a publish that writes nothing
 *
 * The core runs the classification a publish performs, in
 * `PublishMode::DryRun` over the capturing overlay, and reads its report. No
 * host may compute a state for itself: the five words come back from here
 * already decided.
 *
 * Nothing is written and no clock is read, which is why this export takes no
 * timestamp where [`publish_skill`] does.
 *
 * # Errors
 *
 * Everything a publish of the same unit would throw, unchanged: an unreadable
 * note, an unknown target, the destination rail. A destination whose manifest
 * cannot be read is NOT one of these — it comes back inside the report as
 * `state: "unknown"` with the reason, because "we could not determine a
 * state" is an answer rather than a failure.
 */
export function statusOf(vfs: any, request_json: string): string;

/**
 * Check that `stem` can be a frontmatter namespace, without publishing
 * anything.
 *
 * Exists so a host can fail a bad stem where the user set it — at
 * configuration load — instead of once per note, without re-implementing
 * [`Namespace::new`]'s rules in its own language. Those rules decide which of
 * the author's keys get *deleted* at publish, so a TypeScript copy that
 * drifted by one case would accept a stem the core refuses or reads
 * differently.
 *
 * Returns nothing on success. There is deliberately nothing to return: the
 * derived forms (`prefix`, `block_key`) stay inside the core, so no host is
 * ever tempted to spell `stem + "-"` for itself.
 *
 * # Errors
 *
 * An `Error` whose `.name` is `InvalidStem` and whose message is
 * [`InvalidStem`]'s own — the offending stem and the reason, unmodified, so a
 * host prints it rather than re-words it.
 */
export function validateNamespace(stem: string): void;
