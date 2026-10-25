/**
 * `way query <terms>`: the terminal UI's search from a shell. The same
 * matcher and ranking, one command line per match, as `list` prints it.
 */

import { outcome } from '@osdlc/cli-tool/command'
import type { Task } from '@osdlc/system-model/detect'

import { hasQuery } from '../core/filter.ts'
import { skillLine, type SkillRow } from '../core/skills.ts'
import { QueryOutput } from '../documents.ts'
import { taskLine } from '../core/copy-text.ts'
import { terminalSafe } from '../terminal-text.ts'
import { FILTER_FLAGS, filterFrom, kit, noteUnknowns, openSession } from './shared.ts'

/** Make the `query` command. */
export function queryCommand(home: string) {
  return kit.command({
    summary: 'the tasks matching a search, best match first',
    description:
      "Terms are ANDed and matched fuzzily; a leading ' makes one term match exactly, and " +
      '--exact does that to all of them. No terms is every task. Matching agent skills follow ' +
      'the tasks as /<name> lines. Each task line is the one "list" prints. --output jsonl ' +
      'prints one task per line, every task when there are no terms. Exits 1 when terms ' +
      'matched nothing, as grep does.',
    positionals: [{ name: 'terms', variadic: true, help: 'the search terms' }],
    flags: {
      ...FILTER_FLAGS,
      exact: { kind: 'boolean', help: 'terms match as substrings, not subsequences' },
    },
    output: QueryOutput,
    kind: 'query',
    items: { field: 'tasks', kind: 'task' },
    exits: { 1: 'the terms matched nothing' },
    readOnly: true,
    examples: ['query build', "query 'dev web --json", 'query test --services'],
    async run({ flags, globals, positionals }, ctx) {
      const filter = {
        ...filterFrom(flags),
        // Joined, so a quoted "dep env" is two terms.
        query: positionals.join(' '),
        mode: flags.exact ? ('exact' as const) : ('fuzzy' as const),
      }
      const session = await openSession(globals, ctx, home)
      const snapshot = await session.catalog({ cached: flags.cached })
      const unknowns = session.unknowns(snapshot)
      noteUnknowns(ctx, session, snapshot, unknowns)
      const tasks: Task[] = session.search(snapshot.catalog, filter).map((h) => h.task)
      const skills = session.searchSkills(snapshot.skills, filter).map((h) => h.skill)
      const doc = {
        root: snapshot.catalog.root,
        filter: {
          query: filter.query,
          mode: filter.mode,
          ...(filter.servicesOnly === true ? { servicesOnly: true } : {}),
          ...(filter.declaredOnly === true ? { declaredOnly: true } : {}),
          ...(filter.maxDepth !== undefined ? { maxDepth: filter.maxDepth } : {}),
        },
        tasks,
        skills,
        cache: snapshot.cache,
        unknowns,
      }
      const none = tasks.length === 0 && skills.length === 0
      return hasQuery(filter) && none ? outcome(doc, 1) : doc
    },
    text(doc) {
      const lines = [
        ...(doc.tasks as Task[]).map((t) => taskLine(t)),
        ...(doc.skills as SkillRow[]).map((s) => terminalSafe(skillLine(s))),
      ]
      return lines.length > 0 ? `${lines.join('\n')}\n` : ''
    },
  })
}
