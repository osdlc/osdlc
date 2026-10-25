/**
 * `way list`: the whole catalog. Text is one command line per task; `--json`
 * is the catalog document.
 */

import type { Catalog } from '@osdlc/system-model/detect'

import { catalogGroups } from '../groups.ts'
import { filterTasks, type TaskFilter } from '../core/filter.ts'
import type { CatalogSnapshot, Session } from '../core/session.ts'
import type { Unknown } from '../core/unknowns.ts'
import { CATALOG_DOCUMENT_VERSION, CatalogOutput, type CatalogDocumentBody } from '../documents.ts'
import { terminalSafe } from '../terminal-text.ts'
import { FILTER_FLAGS, filterFrom, kit, noteUnknowns, openSession } from './shared.ts'

/**
 * The catalog document for `snapshot`: the catalog with its groups, cache
 * verdicts and unknowns. With a filter, each report keeps only the tasks
 * that pass it. The CLI and the web view send the same document.
 */
export function catalogDocument(
  snapshot: Pick<CatalogSnapshot, 'catalog' | 'cache'>,
  unknowns: Unknown[],
  filter: TaskFilter = {},
): CatalogDocumentBody {
  const { kind: _kind, schemaVersion: _version, ...catalog } = snapshot.catalog
  const filtered = Object.keys(filter).length > 0
  const reports = filtered
    ? catalog.reports.map((r) => ({
        ...r,
        tasks: filterTasks([r], filter).map((h) => h.task),
      }))
    : catalog.reports
  return {
    ...catalog,
    reports,
    groups: catalogGroups(catalog.reports),
    cache: snapshot.cache,
    unknowns,
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
      'under --json the same notes are in "unknowns".',
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
      return catalogDocument(snapshot, unknowns, filter)
    },
    text(doc) {
      const lines = documentTasks(doc).map((t) => terminalSafe(t.display))
      return lines.length > 0 ? `${lines.join('\n')}\n` : ''
    },
  })
}
