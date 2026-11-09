/**
 * The adapters' hard-coded harness facts against the harness-knowledge package.
 *
 * An adapter keeps a fact as a constant until the knowledge file states it at
 * moderate strength or better. Each adapter says which subjects it is waiting
 * on in a `// knowledge:` comment. This test keeps those comments true: a
 * subject the file now states must be wired (and its comment dropped), and a
 * subject the comment leaves out must resolve. Weak and disputed values never
 * count, which is `lookup`'s default.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

// By path, not by package name: agent-call does not depend on the knowledge
// package (tests/exports.test.ts pins its dependencies), it only checks itself
// against the sibling package in this workspace.
import { fact, loadKnowledge } from '../../harness-knowledge/src/index.js'

/** The subjects the adapters take from a harness: binary, flags and the environment they set. */
const SUBJECTS = [
  'cli/binary',
  'cli/output-format',
  'cli/effort',
  'cli/continue',
  'cli/session-id',
  'cli/session-persistence',
  'permissions/modes',
  'cli/context-dirs',
  'instructions/system-prompt-flag',
  'mcp/strict-config',
] as const

/** Adapter file to the harness slug in the knowledge file. droid is not in it. */
const HARNESS: Record<string, string | undefined> = {
  antigravity: 'antigravity',
  claude: 'claude-code',
  codex: 'codex',
  copilot: 'copilot-cli',
  cursor: 'cursor',
  deepseek: 'dsh',
  droid: undefined,
  opencode: 'opencode',
  pi: 'pi',
  qwen: 'qwen-code',
}
const harnessFact = (adapter: string, subject: string): Record<string, unknown> | undefined => {
  const harness = HARNESS[adapter]
  return harness === undefined ? undefined : fact(harness, subject)
}
const knowledgeFile = loadKnowledge

/** The text of the `// knowledge:` comment block in an adapter source, or null. */
function knowledgeComment(source: string): string | null {
  const lines = source.split('\n')
  const start = lines.findIndex((l) => l.startsWith('// knowledge:'))
  if (start < 0) return null
  const block = [lines[start]!]
  for (const l of lines.slice(start + 1)) {
    if (!l.startsWith('//')) break
    block.push(l)
  }
  return block.join('\n')
}

describe('the adapters and the knowledge file agree', () => {
  const k = knowledgeFile()
  test('the file names every harness the adapters map to', () => {
    for (const harness of Object.values(HARNESS)) {
      if (harness !== undefined) expect(k.harnesses[harness], harness).toBeDefined()
    }
    expect(k.harnesses['droid']).toBeUndefined()
  })
  test('the file defines every subject the adapters ask about', () => {
    for (const s of SUBJECTS) expect(k.subjects[s], s).toBeDefined()
  })

  for (const [file, harness] of Object.entries(HARNESS)) {
    test(`${file}: the knowledge comment names exactly the subjects still missing`, () => {
      const source = readFileSync(
        join(import.meta.dirname, '..', 'src', 'adapters', `${file}.ts`),
        'utf-8',
      )
      const comment = knowledgeComment(source)
      expect(comment, `${file}.ts has a "// knowledge:" comment`).not.toBeNull()
      if (harness === undefined) return
      const missing = SUBJECTS.filter((s) => harnessFact(file, s) === undefined)
      const named = SUBJECTS.filter((s) =>
        new RegExp(`(^|\\s)${s}(\\s|$)`).test(comment!.replaceAll('//', '')),
      )
      expect(
        named,
        `${file}.ts: wire what ${harness} now states and drop it from the comment; list what it lacks`,
      ).toEqual(missing)
    })

    test(`${file}: every fact the adapter reads from the file resolves`, () => {
      if (harness === undefined) return
      // No adapter reads a fact at run time yet. When one does, it must resolve.
      const read: string[] = SUBJECTS.filter(
        (s) =>
          !new RegExp(`(^|\\s)${s}(\\s|$)`).test(
            knowledgeComment(
              readFileSync(
                join(import.meta.dirname, '..', 'src', 'adapters', `${file}.ts`),
                'utf-8',
              ),
            )!.replaceAll('//', ''),
          ),
      )
      for (const s of read) expect(harnessFact(file, s), `${harness} ${s}`).toBeDefined()
    })
  }
})
