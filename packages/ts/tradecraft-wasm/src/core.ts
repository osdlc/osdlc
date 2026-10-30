/**
 * The seam to the Rust core — `tradecraft-core`, reached through the
 * committed WASM binding in `wasm/` (`packages/rust/tradecraft-wasm`).
 *
 * This is the ONLY file in the package that imports the wasm glue. Nothing
 * above this module may decide anything a publish, adopt, or status
 * involves — parsing a skill note, resolving links, choosing a target's
 * layout, deciding whether a destination file may be overwritten all live
 * in the core. This file's job is the JSON boundary and turning a thrown
 * `CoreError` into a typed one, exactly mirroring what
 * `@osdlc/yaml-splice`'s `index.ts` does for `yaml-splice-wasm`.
 *
 * The binding exports seven functions (`packages/rust/tradecraft-wasm/src/lib.rs`):
 *
 * | Export | Reaches | Serves |
 * |---|---|---|
 * | `publishSkill` | one note to one destination for one target | `publish` |
 * | `validateNamespace` | the frontmatter-stem rule | every verb, once, at config load |
 * | `discoverComponents` | the vault scan | `build`, `check`, `list`, and whatever needs a roster |
 * | `exportSkills` | the marketplace renderer | `build`, and `check` through `mode` |
 * | `adoptSkills` | the import direction | `adopt`, and its preview through `mode` |
 * | `knownTargets` | the target vocabulary | every verb that takes a target name |
 * | `statusOf` | one unit's state at one destination | `status` |
 *
 * A mode is a key on a request, never an export of its own — `check` is
 * `exportSkills` with `mode: "check"`, a dry-run adopt is `adoptSkills` with
 * `mode: "dry-run"`. This file never predicts what either would do: the core
 * runs the identical path over a capturing overlay and hands back the report
 * the write would have produced.
 *
 * There is no unpublish export.
 */

import {
  adoptSkills as adoptSkillsWasm,
  canonicalTarget as canonicalTargetWasm,
  discoverComponents as discoverComponentsWasm,
  exportSkills as exportSkillsWasm,
  knownTargets as knownTargetsWasm,
  publishableKinds as publishableKindsWasm,
  publishSkill as publishSkillWasm,
  statusOf as statusOfWasm,
  validateNamespace as validateNamespaceWasm,
} from '#wasm'

import type { Vfs } from './node-vfs.ts'

import type {
  AdoptReport,
  AdoptRequest,
  DiscoverRequest,
  DiscoveryReport,
  EntityKind,
  ExportReport,
  ExportRequest,
  PublishReport,
  PublishRequest,
  PublishOutcome,
  PublishStatus,
  ReasonToken as CoreReasonToken,
} from './core.generated.ts'

/**
 * Every request and report shape, generated from the Rust source by
 * `tradecraft-typegen` and re-exported here so this file stays the package's
 * one door to the core.
 *
 * Re-exported, never re-declared — except for `Target`,
 * `ReasonToken`/`PublishReason`/`PublishedFile` together, and
 * `StatusRequest`/`PublishState`/`PublishUnitStatus` together, each
 * hand-widened or hand-named below for a reason of its own (the status trio
 * exists because `tradecraft_core::status::UnitStatus` and
 * `tradecraft_core::export::UnitStatus` share a name, and the generator
 * resolves the export report's — see {@link PublishUnitStatus}). Everything
 * else here is exactly what `tradecraft-typegen` read off the Rust source.
 * Regenerate with `cargo run -p tradecraft-typegen`; `cargo test -p tradecraft-typegen`
 * fails when the committed file is behind the Rust source, and a test in this
 * package fails when src/core.generated.ts differs from the crate's copy.
 */
export type {
  AdoptedSkill,
  AdoptMode,
  AdoptReport,
  AdoptRequest,
  AdoptStatus,
  ContainerIdentity,
  DiscoveredComponent,
  DiscoverRequest,
  DiscoveryReport,
  EntityKind,
  ExportMode,
  ExportReport,
  ExportRequest,
  ExportUnit,
  KindSource,
  MarketplaceConfig,
  PluginOverrides,
  PublishMode,
  PublishOutcome,
  PublishReport,
  PublishRequest,
  PublishStatus,
  SkippedNote,
  UnitStatus,
  WasmExportsWithoutJson,
  WasmRequests,
  WasmResponses,
} from './core.generated.ts'

/**
 * The target names the core accepts, for completion. Mirrors `KNOWN_TARGETS`
 * in `tradecraft_core::publish`; hand-maintained, so update both together.
 *
 * The core types {@link PublishRequest.target} as a plain `String`, so the
 * generated declaration is `string`. The `(string & {})` tail keeps the union
 * open so an editor still completes the known names; the core rejects a name it does not know.
 */
export type Target =
  | 'amp'
  | 'antigravity'
  | 'claude'
  | 'claude-code'
  | 'codex'
  | 'codex-cli'
  | 'copilot'
  | 'cursor'
  | 'github-copilot'
  | 'opencode'
  | 'pi'
  | 'portable'
  | (string & {})

/**
 * `tradecraft_core::publish::ReasonToken`'s closed set, plus the three
 * tokens `compile.rs` raises through a thrown `CoreError::Refused` rather
 * than an in-report refusal — the closed set's documentation does not
 * carry them, and demoting one to `io` would print a token the run never
 * raised.
 *
 * Hand-widened, like {@link Target}: a `PublishedFile.reason` read off the
 * wire never carries one of the three, but a `PublishReason` this package
 * assembles from a throw can, and
 * there is one closed set for both rather than a second type for the
 * difference.
 */
export type ReasonToken =
  CoreReasonToken | 'fragment-unresolved' | 'link-ambiguous' | 'unresolved-syntax'

/**
 * Mirrors `tradecraft_core::publish::PublishReason`, widened to this
 * package's own {@link ReasonToken} rather than the core's narrower one.
 *
 * `detail` is absent from the wire when there is none (the core marks it
 * `skip_serializing_if`), hence optional rather than `string | null`.
 */
export interface PublishReason {
  token: ReasonToken
  detail?: string
}

/**
 * Mirrors `tradecraft_core::publish::PublishedFile`, widened the same way
 * {@link PublishReason} is: `reason` is this package's own `PublishReason`,
 * so a line assembled from a thrown refusal is the same type as one read
 * straight off a report.
 */
export interface PublishedFile {
  /** Destination-root-relative, forward-slashed. */
  path: string
  status: PublishStatus
  /** Which rule decided {@link PublishedFile.status}. */
  outcome: PublishOutcome
  /** Set on every refusal, and on a file claimed into the manifest. */
  reason: PublishReason | null
}

/**
 * The `CoreError` variant names, exhaustively — see
 * `packages/rust/tradecraft-core/src/error.rs`. A thrown wasm `Error`'s `.name` is
 * set to one of these by `packages/rust/tradecraft-wasm/src/lib.rs::variant_name`.
 */
export type CoreErrorName =
  | 'RootNotFound'
  | 'PathEscapesRoot'
  | 'SkillNotFound'
  | 'Io'
  | 'Refused'
  | 'Conflict'
  | 'Projection'
  /**
   * The marketplace commit failed part-way through its root swaps and rolled
   * back. Its own name, not a `Refused`, because a caller has to be able to
   * tell "nothing happened" from "something happened and was undone".
   */
  | 'SwapFailed'

const CORE_ERROR_NAMES: ReadonlySet<string> = new Set<CoreErrorName>([
  'RootNotFound',
  'PathEscapesRoot',
  'SkillNotFound',
  'Io',
  'Refused',
  'Conflict',
  'Projection',
  'SwapFailed',
])

/**
 * A typed refusal or failure from the Rust core, thrown by {@link publishSkill}
 * in place of the raw bindgen error. `coreName` is `"Unknown"` for a boundary
 * failure that never reached the core (bad JSON in, unserializable report
 * out) — see `packages/rust/tradecraft-wasm/src/lib.rs`'s `throwable`.
 */
export class CoreError extends Error {
  readonly coreName: CoreErrorName | 'Unknown'

  constructor(message: string, coreName: CoreErrorName | 'Unknown') {
    super(message)
    this.name = 'CoreError'
    this.coreName = coreName
  }
}

/**
 * A configured frontmatter stem the core will not accept, thrown by
 * {@link validateNamespace}.
 *
 * Deliberately NOT a {@link CoreError}: `tradecraft_core::InvalidStem` is not
 * a `CoreError` variant, and it is not one for a reason the caller cares about
 * — nothing was read, no note is involved, and no publish was attempted. It is
 * a fault in the configuration, so a caller reports it as a configuration
 * error rather than a per-file refusal.
 *
 * `message` is the core's own, verbatim: it already names the offending stem
 * and why it was rejected, and re-wording it here would give the user a second
 * vocabulary for one rule.
 */
export class InvalidNamespaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidNamespaceError'
  }
}

function toCoreError(raw: unknown): CoreError {
  if (raw instanceof Error) {
    const coreName: CoreErrorName | 'Unknown' = CORE_ERROR_NAMES.has(raw.name)
      ? (raw.name as CoreErrorName)
      : 'Unknown'
    return new CoreError(raw.message, coreName)
  }
  return new CoreError(String(raw), 'Unknown')
}

/**
 * Publish one skill note to one destination for one target — the whole of
 * the core's exposed publish capability today. Loops over notes and
 * destinations belong to the caller, never to this
 * module: fan-out is argument parsing and reporting, not a second opinion
 * about what publishing means.
 *
 * Throws {@link CoreError} rather than returning a `Result`-shaped value —
 * the core itself only throws when the WHOLE request fails before any file
 * is enumerated (an unreadable note, an unrenderable target, a bad path);
 * a partial refusal — one file the destination-guard rail declines — comes
 * back inside `PublishReport.files` with `status: "refused"`, never thrown.
 */
export function publishSkill(vfs: Vfs, request: PublishRequest): PublishReport {
  return callCore<PublishReport>(() => publishSkillWasm(vfs, JSON.stringify(request)))
}

/**
 * Every target name this build knows — `tradecraft_core::publish::KNOWN_TARGETS`,
 * verbatim and sorted.
 *
 * The one list. A `--target` typed on the command line and a name in a note's
 * targets key are checked against the same values, so a target added to the
 * core is accepted by both without a second edit here.
 */
export function knownTargets(): string[] {
  return callCore<string[]>(() => knownTargetsWasm())
}

/**
 * The one destination a target name folds onto — `claude` and `claude-code`
 * both answer `claude` — or `null` for a name outside {@link knownTargets}.
 *
 * One name out of a compile-time vocabulary, so it crosses as a value rather
 * than as a JSON document — there is no structure to serialize and no error to
 * carry. `tradecraft_core::publish::canonical_target`, asked rather than
 * reproduced:
 * which spellings name the same destination is not derivable from the flat
 * target list, and a copy of the fold table here would drift from the one the
 * core publishes against.
 */
export function canonicalTarget(name: string): string | null {
  return canonicalTargetWasm(name) ?? null
}

/**
 * Every entity kind a publish has a projection for, sorted — the kinds the
 * core's own gate admits before it reaches a renderer.
 *
 * A vault holds kinds no destination installs: a marketplace names a
 * distribution, a hook is carried by whatever reads it. Asking the core about
 * one gets `no-renderer` back forever, which is the shape of the vault rather
 * than drift, so a caller reporting state needs this list to tell the two
 * apart.
 */
export function publishableKinds(): EntityKind[] {
  return publishableKindsWasm() as EntityKind[]
}

// --- discovery ---------------------------------------------------------------

/**
 * Every publishable note under the vault's content root, vetted and sorted by
 * name — the vault scan the boundary could not reach before — and every note
 * the scan could not read.
 *
 * A bad note stops itself, not the scan: one half-written draft in a shared
 * vault must not block everybody else's publish. What still throws is what is
 * not a fact about one note — a duplicate name, a bundle overlap, a symlink,
 * a missing root. A caller that ignores `skipped` is claiming the vault holds
 * nothing but what it listed, so every one of them reports it.
 */
export function discoverComponents(vfs: Vfs, request: DiscoverRequest): DiscoveryReport {
  return callCore<DiscoveryReport>(() => discoverComponentsWasm(vfs, JSON.stringify(request)))
}

// --- tracking ----------------------------------------------------------------

/** Mirrors `WireStatusRequest` in `packages/rust/tradecraft-wasm/src/lib.rs`. */
export interface StatusRequest {
  /** Absolute path to the vault note. */
  skill_path: string
  /** Absolute path to the destination root. */
  destination_root: string
  target: Target
  /** The content root the note lives under. Omitted means no structural layer. */
  skills_root?: string
  /** This vault's frontmatter namespace stem. Omitted means `sw`. */
  namespace?: string
}

/**
 * Mirrors `tradecraft_core::status::PublishState` — the closed five
 * the status documentation specifies, spelled once in the core and copied verbatim here.
 *
 * Named `PublishState`, not `State`, because {@link UnitStatus} above is
 * already the marketplace's four-word status and the two must not be mistaken
 * for each other.
 */
export type PublishState = 'never-published' | 'current' | 'stale' | 'conflict' | 'unknown'

/**
 * Mirrors `tradecraft_core::status::UnitStatus` — one unit's state at one
 * destination, and enough of the working to act on it.
 *
 * Named `PublishUnitStatus` for the same reason {@link PublishState} is:
 * `UnitStatus` in this module is the export report's status token.
 */
export interface PublishUnitStatus {
  state: PublishState
  /** What makes the state what it is, when there is something to name. */
  reason: string | null
  /** When we last wrote anything here, from the destination's manifest. */
  published_at: string | null
  /** Every projected file, classified — the drift, per file. */
  files: PublishedFile[]
  /** The notes that fed this unit's output, as the manifest recorded them. */
  contributing_notes: string[]
  /** Recorded contributors no longer in the vault. */
  missing_notes: string[]
  /**
   * Set when the note's targets key excludes this destination — the `n/a`
   * cell, which the status documentation is explicit is not one of the five states.
   */
  not_published: string | null
}

/**
 * One unit's publish state at one destination, for one target.
 *
 * A status is a publish that writes nothing: the core runs the identical
 * classification in `dry-run` over a capturing overlay and reads its report,
 * so a status that says `current` cannot disagree with the publish that
 * follows it. Nothing in this package may compute a state for itself.
 *
 * Throws {@link CoreError} for everything a publish of the same unit would
 * throw — an unreadable note, an unknown target, the destination rail, a
 * target with no renderer for this unit's kind. A destination whose manifest
 * cannot be read is NOT one of those: it comes back as `state: "unknown"`
 * with the reason, because "we could not determine a state" is an answer.
 */
export function statusOf(vfs: Vfs, request: StatusRequest): PublishUnitStatus {
  return callCore<PublishUnitStatus>(() => statusOfWasm(vfs, JSON.stringify(request)))
}

// --- the marketplace ---------------------------------------------------------

/**
 * Render the vault into one marketplace tree per harness — and, per `mode`, either
 * swap the drifted roots into place or report the drift and write nothing.
 *
 * `build` and `check` are this one call with one key different, because in the
 * core they are one render and one comparison. That is the whole reason their
 * verdicts cannot disagree, and it is why there is no second function here to
 * keep pointed at the first.
 *
 * Throws {@link CoreError} for everything an export refuses — the rail, an
 * empty marketplace, a failed swap. There is no per-unit refusal to look for
 * inside the report: an export's rails all fire before anything is staged.
 */
export function exportSkills(vfs: Vfs, request: ExportRequest): ExportReport {
  return callCore<ExportReport>(() => exportSkillsWasm(vfs, JSON.stringify(request)))
}

// --- adoption ----------------------------------------------------------------

/**
 * Import published `SKILL.md` bundles into the vault as notes — or, under
 * `mode: "dry-run"`, report what that would have done and write nothing.
 *
 * The preview is the core's mode, and this package may not predict it: a
 * TypeScript preview would be a second implementation of adoption's naming and
 * refusal rules, wrong the first time the core's moved. Set the key and render
 * what comes back.
 *
 * Throws {@link CoreError} for what a rail stops whole — a symlinked source, a
 * content root that contains it, an unknown target, a colliding pair. One skill
 * whose vault target already exists is NOT a throw: it is `"unchanged"`,
 * `"updated"`, or `"refused"` on that skill's line, with the others
 * proceeding.
 */
export function adoptSkills(vfs: Vfs, request: AdoptRequest): AdoptReport {
  return callCore<AdoptReport>(() => adoptSkillsWasm(vfs, JSON.stringify(request)))
}

/**
 * One call into the binding: run it, parse the report it hands back, and turn
 * whatever it threw into a {@link CoreError}.
 *
 * The shape every export above shares, said once. Nothing decided here — the
 * generic is the report's type, and the only judgement in the function is that
 * a thrown value is an error rather than a result.
 */
function callCore<T>(call: () => string): T {
  let resultJson: string
  try {
    resultJson = call()
  } catch (raw) {
    throw toCoreError(raw)
  }
  return JSON.parse(resultJson) as T
}

/**
 * Ask the core whether `stem` can be this vault's frontmatter namespace.
 *
 * Returns nothing on success and throws {@link InvalidNamespaceError} on
 * refusal. It is a round trip into Rust for what looks like a string check
 * precisely because it is not one: the rules decide which of the author's
 * frontmatter keys get **deleted** at publish, and a copy of them in TypeScript
 * that drifted by a single case would accept a stem the core then reads
 * differently. There is one implementation of that rule, and this reaches it.
 *
 * Callers ask once, where the value was configured — not once per note.
 */
export function validateNamespace(stem: string): void {
  try {
    validateNamespaceWasm(stem)
  } catch (raw) {
    // The only refusal this export has. Anything else is a boundary failure
    // and must not be dressed up as the user's stem being wrong.
    if (raw instanceof Error && raw.name === 'InvalidStem') {
      throw new InvalidNamespaceError(raw.message)
    }
    throw toCoreError(raw)
  }
}
