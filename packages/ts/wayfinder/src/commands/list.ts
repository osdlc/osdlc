/**
 * `way list`: the whole catalog. Text is one command line per task, the line
 * Copy puts on the clipboard, then one `/<name>` line per agent skill;
 * `--json` is the catalog document.
 */

import type { Catalog } from '@osdlc/system-model/detect'

import { inDisplayOrder } from '../catalog.ts'
import { documentGroups } from '../groups.ts'
import { filterTasks, type TaskFilter } from '../core/filter.ts'
import { filterSkills, skillLine, type SkillRow } from '../core/skills.ts'
import type { CatalogProgress, CatalogSnapshot, Session } from '../core/session.ts'
import type { Unknown } from '../core/unknowns.ts'
import {
  CATALOG_DOCUMENT_VERSION,
  CatalogOutput,
  CatalogProgressOutput,
  type CatalogDocumentBody,
} from '../documents.ts'
import type { CatalogDocument } from '../index.ts'
import { taskLine } from '../core/copy-text.ts'
import type { CatalogShare, ProgressSink } from '../serve/catalog-share.ts'
import { terminalSafe } from '../terminal-text.ts'
import { FILTER_FLAGS, filterFrom, kit, noteUnknowns, openSession } from './shared.ts'

/** The catalog document without its `schemaVersion` and `kind`. */
export type CatalogBody = Omit<CatalogDocument, 'schemaVersion' | 'kind'>

/**
 * The catalog document for `snapshot`: the catalog with its groups, cache
 * verdicts, unknowns and the tools trusted on their own. With a filter, each
 * report keeps only the tasks that pass it. The CLI and the web view send
 * the same document.
 */
export function catalogDocument(
  snapshot: Pick<CatalogSnapshot, 'catalog' | 'cache' | 'skills' | 'origin'>,
  unknowns: Unknown[],
  filter: TaskFilter = {},
  trustedTools: readonly string[] = [],
): CatalogBody {
  const { kind: _kind, schemaVersion: _version, ...catalog } = snapshot.catalog
  const filtered = Object.keys(filter).length > 0
  const reports = filtered
    ? catalog.reports.map((r) => ({
        ...r,
        tasks: filterTasks([r], filter).map((h) => h.task),
      }))
    : catalog.reports
  const skills = filterSkills(snapshot.skills, filter).map((h) => h.skill)
  return {
    ...catalog,
    ...sourceOf(snapshot),
    reports,
    groups: documentGroups(catalog.reports, skills.length),
    skills,
    cache: snapshot.cache,
    unknowns,
    trustedTools: [...trustedTools],
    filter: {
      ...(filter.servicesOnly === true ? { servicesOnly: true } : {}),
      ...(filter.declaredOnly === true ? { declaredOnly: true } : {}),
      ...(filter.maxDepth !== undefined ? { maxDepth: filter.maxDepth } : {}),
    },
  }
}

/**
 * Whether the rows were probed in this call or came from the store, and when
 * the stored ones were taken: the oldest stored runner's probe time.
 */
export function sourceOf(snapshot: Pick<CatalogSnapshot, 'catalog' | 'origin'>): {
  source: 'fresh' | 'cached'
  storedAt: string | null
} {
  const cached = snapshot.origin === 'store' || snapshot.origin === 'saved'
  return cached
    ? { source: 'cached', storedAt: snapshot.catalog.generatedAt }
    : { source: 'fresh', storedAt: null }
}

/**
 * The largest progress line, in UTF-16 code units of its JSON. A runner
 * whose line would be larger is sent without its report, as `omitted`; its
 * rows come with the catalog document.
 */
export const MAX_PROGRESS_LINE = 1024 * 1024

/**
 * A {@link CatalogProgress} that sends `session`'s probe as progress lines:
 * the runners first, in the order the catalog will list them, then each
 * runner as it answers, with its unknowns, and the agent skills on a line of
 * their own once they are read. Skills read before the runners are known
 * wait for the first line. They pass `filter`, as in the document. No skills,
 * or skills too large for a line, come only with the document.
 */
export function progressLines(
  session: Session,
  emit: ProgressSink,
  maxLine = MAX_PROGRESS_LINE,
  filter: TaskFilter = {},
): CatalogProgress {
  let pending: string[] = []
  let total = 0
  let named = false
  let early: SkillRow[] | null = null
  const sendSkills = (skills: SkillRow[]): void => {
    const line = { pending: [...pending], total, skills }
    if (JSON.stringify(line).length <= maxLine) emit(line)
  }
  return {
    onRunners(runners) {
      pending = inDisplayOrder(
        runners.map((runner) => ({ runner })),
        session.runnerOrder(),
      ).map((r) => r.runner)
      total = runners.length
      named = true
      emit({ pending: [...pending], total })
      if (early !== null) sendSkills(early)
      early = null
    },
    onSkills(all) {
      const skills = filterSkills(all, filter).map((h) => h.skill)
      if (skills.length === 0) return
      if (named) sendSkills(skills)
      else early = skills
    },
    onRunner(report, cache) {
      pending = pending.filter((r) => r !== report.runner)
      const unknowns = session.unknowns({ catalog: { reports: [report] }, cache: [cache] })
      const line = { pending: [...pending], total, report, cache, unknowns }
      emit(
        JSON.stringify(line).length <= maxLine
          ? line
          : { pending: [...pending], total, omitted: report.runner },
      )
    },
  }
}

/** Every task in the document, in catalog order. */
function documentTasks(doc: CatalogDocumentBody): Catalog['reports'][number]['tasks'] {
  return (doc.reports as Catalog['reports']).flatMap((r) => r.tasks)
}

/**
 * Make the `list` command. `home` is the base for config, trust and cache
 * paths. `share` is the web view's held catalog (see `catalog-share.ts`).
 */
export function listCommand(home: string, share?: CatalogShare) {
  return kit.command({
    summary:
      'the whole catalog: one pasteable command line per task, or the catalog document with --json',
    description:
      'Each task line is the command Copy gives, quoted and with a cd when the task runs from ' +
      'its own directory, so it pastes into a shell; "run" takes that line or the task id, which ' +
      '--json shows. --output jsonl prints one runner report per line; with --progress it first ' +
      'prints a catalog-progress line as each runner answers. "query" with no terms ' +
      'prints one task per line. ' +
      'Probes every runner, so a script gets what the repository has now. --cached answers at ' +
      'once with the last listing saved under the same trust and settings, and does not check ' +
      'whether files changed since its storedAt. With no saved listing it reads the stored ' +
      'probes, checks their files and names the stale runners on stderr; a runner with nothing ' +
      'stored is probed now, and with nothing stored at all it probes every runner. The document ' +
      'says which it was: "source" is "fresh" or "cached", and "storedAt" is when the oldest ' +
      'stored rows were probed. --services, --declared and ' +
      '--depth keep only some tasks; with --json each report keeps only those tasks. Notes on what ' +
      'could not be read (withheld runners, unknown parameters, missing tools) go to stderr; ' +
      'under --json the same notes are in "unknowns". Agent skills follow the tasks as /<name> ' +
      'lines; the skills setting chooses which (project, all or off).',
    positionals: [{ name: 'dir', help: 'the directory to inspect (beats -C)' }],
    flags: {
      ...FILTER_FLAGS,
      join: {
        kind: 'boolean',
        hidden: true,
        help: 'in the web view, answer with a probe already running for the same catalog',
      },
      progress: {
        kind: 'boolean',
        help:
          'send a catalog-progress line as each runner answers, before the document: with ' +
          '--output jsonl, or as NDJSON over HTTP',
      },
    },
    output: CatalogOutput,
    kind: 'catalog',
    schemaVersion: CATALOG_DOCUMENT_VERSION,
    events: { schema: CatalogProgressOutput, kind: 'catalog-progress' },
    items: { field: 'reports', kind: 'report' },
    readOnly: true,
    examples: ['list', 'list --json', 'list --services', '-C ../repo list --cached --json'],
    async run({ flags, globals, positionals }, ctx) {
      const filter = filterFrom(flags)
      const sharing =
        share?.active === true && ctx.surface === 'http' && Object.keys(filter).length === 0
      // A shared probe outlives the request that started it, so the session
      // runs on the share's signal; this request's own is passed to the share.
      const session: Session = await openSession(
        globals,
        sharing ? { ...ctx, signal: share.signal } : ctx,
        home,
        positionals[0],
      )
      // Progress lines only when asked for, so --output jsonl is unchanged.
      const own: ProgressSink | undefined = flags.progress ? (line) => ctx.emit(line) : undefined
      const read = async (
        cached: boolean,
        signal?: AbortSignal,
        emit?: ProgressSink,
      ): Promise<CatalogBody> => {
        const snapshot = await session.catalog({
          cached,
          signal,
          ...(emit !== undefined
            ? { progress: progressLines(session, emit, MAX_PROGRESS_LINE, filter) }
            : {}),
        })
        const unknowns = session.unknowns(snapshot)
        noteUnknowns(ctx, session, snapshot, unknowns)
        return catalogDocument(snapshot, unknowns, filter, session.settings().trustedTools)
      }
      if (sharing) {
        const key = session.viewKey()
        const shared = (join: boolean): Promise<CatalogBody> =>
          share.fresh(key, (signal, emit) => read(false, signal, emit), {
            join,
            signal: ctx.signal,
            onEvent: own,
          })
        if (flags.cached) {
          // With nothing held yet, the probe serve started is the answer.
          const held = share.cached(key)
          if (held !== null) return held
          return share.probing(key) ? shared(true) : read(true, ctx.signal, own)
        }
        return shared(flags.join)
      }
      return read(flags.cached, undefined, own)
    },
    text(doc) {
      const lines = [
        ...documentTasks(doc).map((t) => taskLine(t)),
        ...(doc.skills as SkillRow[]).map((s) => terminalSafe(skillLine(s))),
      ]
      return lines.length > 0 ? `${lines.join('\n')}\n` : ''
    },
  })
}
