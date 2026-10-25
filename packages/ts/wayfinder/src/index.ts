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
import { createSession, type CacheState, type SessionFlags } from './core/session.ts'
import type { SkillRow } from './core/skills.ts'
import type { Unknown } from './core/unknowns.ts'
import { CATALOG_DOCUMENT_VERSION } from './documents.ts'
import type { DocumentGroup } from './groups.ts'

export { SessionError, type CacheState, type SessionFlags } from './core/session.ts'
export { filterTasks, hasQuery, keepsTask, sourceDepth } from './core/filter.ts'
export type { TaskFilter, TaskHit } from './core/filter.ts'
export { filterSkills, skillLine, SKILLS_SETTING_VALUES } from './core/skills.ts'
export type { SkillHit, SkillRow, SkillsSetting } from './core/skills.ts'
export { unknownLine, unknownsOf, type Unknown } from './core/unknowns.ts'
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
export type { Catalog, DiscoveryMode, Param, RunnerReport, Task } from '@osdlc/system-model/detect'

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
  /** Answer from the stored probe, probing only the runners missing from it, as `--cached`. */
  cached?: boolean | undefined
  /** Keep only some tasks and skills, as `--services`, `--declared` and `--depth`. */
  filter?: TaskFilter | undefined
  /** Stops every probe. */
  signal?: AbortSignal | undefined
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
  /** Grouped, and in the configured runner order. */
  reports: RunnerReport[]
  /** The groups with rows, in display order. */
  groups: DocumentGroup[]
  /** The agent skills, as the `skills` setting chooses. */
  skills: SkillRow[]
  cache: CacheState[]
  /** What could not be read, each with the label every surface shows. */
  unknowns: Unknown[]
  /** The filter applied. Absent fields were not given. */
  filter: Pick<TaskFilter, 'servicesOnly' | 'declaredOnly' | 'maxDepth'>
}

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
  const snapshot = await session.catalog({ cached: options.cached === true })
  const body = catalogDocument(
    snapshot,
    session.unknowns(snapshot),
    options.filter ?? {},
    session.settings().trustedTools,
  )
  return { schemaVersion: CATALOG_DOCUMENT_VERSION, kind: 'catalog', ...body } as CatalogDocument
}
