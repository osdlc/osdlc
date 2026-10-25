/**
 * `way list`: the whole catalog. Text is one command line per task, then one
 * `/<name>` line per agent skill; `--json` is the catalog document.
 */

import type { Catalog } from '@osdlc/system-model/detect'

import { documentGroups } from '../groups.ts'
import { filterTasks, type TaskFilter } from '../core/filter.ts'
import { filterSkills, skillLine, type SkillRow } from '../core/skills.ts'
import type { CatalogSnapshot, Session } from '../core/session.ts'
import type { Unknown } from '../core/unknowns.ts'
import { CATALOG_DOCUMENT_VERSION, CatalogOutput, type CatalogDocumentBody } from '../documents.ts'
import type { CatalogDocument } from '../index.ts'
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
  snapshot: Pick<CatalogSnapshot, 'catalog' | 'cache' | 'skills'>,
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

/** Every task in the document, in catalog order. */
function documentTasks(doc: CatalogDocumentBody): Catalog['reports'][number]['tasks'] {
  return (doc.reports as Catalog['reports']).flatMap((r) => r.tasks)
}

/** Make the `list` command. `home` is the base for config, trust and cache paths. */
export function listCommand(home: string) {
  return kit.command({
    summary: 'the whole catalog: one command line per task, or the catalog document with --json',
    description:
      'Probes every runner, so a script gets what the repository has now. --cached answers from ' +
      'the last stored probe and names the stale runners on stderr. --services, --declared and ' +
      '--depth keep only some tasks; with --json each report keeps only those tasks. Notes on what ' +
      'could not be read (withheld runners, unknown parameters, missing tools) go to stderr; ' +
      'under --json the same notes are in "unknowns". Agent skills follow the tasks as /<name> ' +
      'lines; the skills setting chooses which (project, all or off).',
    positionals: [{ name: 'dir', help: 'the directory to inspect (beats -C)' }],
    flags: FILTER_FLAGS,
    output: CatalogOutput,
    kind: 'catalog',
    schemaVersion: CATALOG_DOCUMENT_VERSION,
    items: { field: 'reports', kind: 'report' },
    readOnly: true,
    examples: ['list', 'list --json', 'list --services', '-C ../repo list --cached --json'],
    async run({ flags, globals, positionals }, ctx) {
      const filter = filterFrom(flags)
      const session: Session = await openSession(globals, ctx, home, positionals[0])
      const snapshot = await session.catalog({ cached: flags.cached })
      const unknowns = session.unknowns(snapshot)
      noteUnknowns(ctx, session, snapshot, unknowns)
      return catalogDocument(snapshot, unknowns, filter, session.settings().trustedTools)
    },
    text(doc) {
      const lines = [
        ...documentTasks(doc).map((t) => terminalSafe(t.display)),
        ...(doc.skills as SkillRow[]).map((s) => terminalSafe(skillLine(s))),
      ]
      return lines.length > 0 ? `${lines.join('\n')}\n` : ''
    },
  })
}
