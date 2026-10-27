/**
 * `@osdlc/wayfinder`: build the catalog `way` shows, from code. The answer is
 * the document `way list --json` prints: the runner reports with their
 * tasks, the groups, the agent skills, the cache verdicts and what could not
 * be read.
 *
 * Detection is `@osdlc/system-model`'s. This entry adds what wayfinder layers
 * on top: configuration, trust, the probe store, groups and skills. It runs
 * on Node; it is not for a browser.
 *
 * The exported names follow semver from 1.0. Before 1.0 a minor release may
 * change them, and the changelog says how.
 */

import type { DiscoveryMode, RunnerReport } from '@osdlc/system-model/detect'

import { catalogDocument } from './commands/list.ts'
import type { TaskFilter } from './core/filter.ts'
import { flushWrites } from './core/writes.ts'
import {
  createSession,
  type CacheState,
  type CatalogProgress,
  type SessionFlags,
} from './core/session.ts'
import type { SkillRow } from './core/skills.ts'
import type { Unknown } from './core/unknowns.ts'
import { CATALOG_DOCUMENT_VERSION, type CatalogDocumentBody } from './documents.ts'
import type { DocumentGroup } from './groups.ts'

export {
  SessionError,
  type CacheState,
  type CatalogProgress,
  type SessionFlags,
} from './core/session.ts'
export { filterTasks, hasQuery, keepsTask, sourceDepth } from './core/filter.ts'
export type { TaskFilter, TaskHit } from './core/filter.ts'
export { filterSkills, skillLine, SKILLS_SETTING_VALUES } from './core/skills.ts'
export type { SkillHit, SkillRow, SkillsSetting } from './core/skills.ts'
export { unknownLine, unknownsOf, type Unknown, type UnknownsInput } from './core/unknowns.ts'
export {
  GROUPS,
  SKILLS_GROUP,
  catalogGroups,
  documentGroups,
  groupOf,
  type DocumentGroup,
  type Group,
  type GroupId,
} from './groups.ts'
export { jsonText, terminalSafe } from './terminal-text.ts'
export { toolSummary, type ToolSummary } from './tool-info.ts'
export { ANY_LANGUAGE, languageLabel, runnerLabel, withheldLabel } from './vocabulary.ts'
export type { WithheldReason } from './vocabulary.ts'
export type {
  Catalog,
  DiscoveryMode,
  Param,
  ParametersUnknownReason,
  RunnerCacheState,
  RunnerReport,
  StaleReason,
  Task,
  ToolDef,
} from '@osdlc/system-model/detect'
export type { Mode } from '@osdlc/system-model/match'

/** What {@link buildCatalog} reads, and the choices the CLI makes with flags. */
export interface BuildCatalogOptions {
  /** The directory to read: absolute, or relative to `cwd`. It must exist. */
  dir: string
  /** The base for a relative `dir` and tool module paths. Default `process.cwd()`. */
  cwd?: string | undefined
  /** Where config, trust and the probe store are found. Default `process.env`. */
  env?: Record<string, string | undefined> | undefined
  /** The home directory. Default: the OS account's. */
  home?: string | undefined
  /**
   * What the CLI's flags choose: `allowExec` is `--exec` or `--no-exec`,
   * `toolModules` is `--config`. Absent fields come from the config files.
   */
  flags?: SessionFlags | undefined
  /**
   * Answer as `--cached` does: from the last saved listing, which checks no
   * files, else from the stored probe, probing only the runners missing from it.
   */
  cached?: boolean | undefined
  /** Keep only some tasks and skills, as `--services`, `--declared` and `--depth`. */
  filter?: TaskFilter | undefined
  /** Stops every probe. */
  signal?: AbortSignal | undefined
  /**
   * Hears about each runner the call probes as it answers: `onRunners`
   * once, then `onRunner` per runner. An answer from the saved listing or
   * the store probes none. The document is still the answer to use.
   */
  progress?: CatalogProgress | undefined
  /**
   * Called with each warning from the config files and tool modules, such
   * as a project file key that is ignored. The CLI prints these on stderr.
   */
  onWarning?: ((message: string) => void) | undefined
}

/** The catalog document: what `way list --json` prints. */
export interface CatalogDocument {
  schemaVersion: number
  kind: 'catalog'
  /** Absolute. Every `cwd` and `source` is relative to it. */
  root: string
  generatedAt: string
  discovery: DiscoveryMode
  /** Whether every runner was allowed to run subprocesses. */
  allowExec: boolean
  /**
   * `fresh`: every runner was probed in this call. `cached` (under `cached:
   * true`): the rows came from the last saved listing, which checks no
   * files, or else from the stored probes, where `cache` says which runners
   * were stale or probed now.
   */
  source: 'fresh' | 'cached'
  /** With `source: "cached"`, when the oldest stored rows were probed (ISO 8601). Null when fresh. */
  storedAt: string | null
  /** Grouped, and in the configured runner order. */
  reports: RunnerReport[]
  /** The groups with rows, in display order. */
  groups: DocumentGroup[]
  /** The agent skills, as the `skills` setting chooses. */
  skills: SkillRow[]
  cache: CacheState[]
  /** What could not be read, each with the label every surface shows. */
  unknowns: Unknown[]
  /**
   * The tool ids trusted on their own here. Empty when the repository is
   * trusted as a whole, or trust does not decide execution.
   */
  trustedTools: string[]
  /** The filter applied. Absent fields were not given. */
  filter: Pick<TaskFilter, 'servicesOnly' | 'declaredOnly' | 'maxDepth'>
}

/** True when `A` and `B` have the same field names. */
type SameKeys<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never]
  ? true
  : false
// Fails to compile when CatalogDocument and the document schema name different fields.
const catalogFieldsMatch: SameKeys<
  CatalogDocument,
  CatalogDocumentBody & { schemaVersion: number; kind: 'catalog' }
> = true
void catalogFieldsMatch

/**
 * The catalog for `dir`, as `way list --json` builds it: the same config,
 * trust gate and probe store. Nothing in the repository runs unless the
 * repository (or the tool) is trusted and execution is allowed. A probe
 * writes the store, as `way list` does.
 *
 * Throws {@link SessionError}: `no-such-directory`, `config` for a config
 * file that cannot be used, `tool-module` for a tool module that cannot be
 * loaded.
 *
 * Task names, skill text and other strings come from the repository. Pass
 * them through {@link terminalSafe} before printing them to a terminal.
 */
export async function buildCatalog(options: BuildCatalogOptions): Promise<CatalogDocument> {
  const session = await createSession({
    dir: options.dir,
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    home: options.home,
    flags: options.flags,
    signal: options.signal,
  })
  for (const warning of session.warnings) options.onWarning?.(warning)
  const snapshot = await session.catalog({
    cached: options.cached === true,
    progress: options.progress,
  })
  // A library caller gets a call whose writes are done.
  await flushWrites()
  const body = catalogDocument(
    snapshot,
    session.unknowns(snapshot),
    options.filter ?? {},
    session.settings().trustedTools,
  )
  return { schemaVersion: CATALOG_DOCUMENT_VERSION, kind: 'catalog', ...body }
}
