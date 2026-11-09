import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BETA, loadBeta } from './corpus.ts'
import { lint } from './lint.ts'

const SESSION = 'statements/Claude Code/Claude Code Session environment.md'
const FORK = 'statements/Claude Code/Claude Code Fork a session.md'

let dir: string
const edit = (rel: string, from: string, to: string): void => {
  const file = join(dir, rel)
  const text = readFileSync(file, 'utf8')
  assert.ok(text.includes(from), `${rel} has no "${from}"`)
  writeFileSync(file, text.replace(from, to))
}
const problems = (): string[] => {
  const beta = loadBeta(dir)
  return [...beta.report.errors, ...lint(beta)]
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-reference-lint-'))
  cpSync(BETA, dir, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('lint', () => {
  test('the beta corpus passes', () => {
    assert.deepEqual(problems(), [])
  })

  test('refuses a value that does not fit the subject valueSchema', () => {
    edit(SESSION, '    vars:\n      - CLAUDE_CODE_SESSION_ID\n      - CLAUDE_PID', '    vars: 5')
    assert.deepEqual(problems(), [
      `${SESSION}: proposition.object/vars must be array (valueSchema)`,
    ])
  })

  test('refuses a proposition that differs from harness and subject', () => {
    edit(SESSION, 'predicate: cli/session-env', 'predicate: cli/fork')
    edit(
      SESSION,
      'subject: "[Claude Code](../../harnesses/Claude%20Code.md)"\n  predicate',
      'subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"\n  predicate',
    )
    const found = problems()
    assert.ok(found.some((p) => p.includes('proposition.subject must link the same harness')))
    assert.ok(found.some((p) => p.includes('proposition.predicate must be the subject')))
  })

  test('refuses scope.model on a subject that is not model dependent', () => {
    edit(SESSION, '  model: null', '  model: some-model')
    assert.ok(problems().some((p) => p.includes('is not model_dependent')))
  })

  test('refuses a version scope on a harness with no known versioning, and a malformed one', () => {
    edit(SESSION, '  since: null', '  since: 1.0.0')
    edit('harnesses/Claude Code.md', 'versioning: semver', 'versioning: unknown')
    assert.ok(problems().some((p) => p.includes('Claude Code has no known versioning')))
    edit('harnesses/Claude Code.md', 'versioning: unknown', 'versioning: semver')
    edit(SESSION, '  since: 1.0.0', '  since: v1')
    assert.ok(problems().some((p) => p.includes('scope.since "v1" is not a semver version')))
  })

  test('refuses two current statements that overlap, and allows disjoint ranges', () => {
    const text = readFileSync(join(dir, FORK), 'utf8')
    const copy = 'statements/Claude Code/Claude Code Fork again.md'
    writeFileSync(join(dir, copy), text)
    assert.ok(
      problems().some((p) =>
        p.startsWith(`${copy}: a second current or disputed statement overlaps`),
      ),
    )
    edit(FORK, '  until: null', '  until: 2.0.0')
    edit(copy, '  since: null', '  since: 2.0.0')
    assert.deepEqual(problems(), [])
  })

  test('refuses a supersedes target that is not superseded', () => {
    edit(
      FORK,
      'status: current',
      'status: current\nsupersedes: "[x](Claude%20Code%20Headless%20run.md)"',
    )
    assert.ok(
      problems().some((p) => p.includes('which does not have status superseded')),
      problems().join('\n'),
    )
  })

  test('refuses a run whose method does not list the harness', () => {
    edit(
      'study-results/Claude Code/2026-10-10 Claude Code Session environment.md',
      '../../methods/Session%20environment/Session%20environment.md',
      '../../methods/pi%20model%20selection/pi%20model%20selection.md',
    )
    assert.ok(problems().some((p) => p.includes('does not list harness Claude Code')))
  })

  test('refuses evidence about another harness and a home path in a command', () => {
    edit(
      FORK,
      'study-results/Claude%20Code/2026-09-25%20Claude%20Code%20Fork%20a%20session.md',
      'study-results/Codex%20CLI/2026-09-25%20Codex%20CLI%20Fork%20a%20session.md',
    )
    edit('methods/pi model selection/pi model selection.md', 'pi --', 'cat ~/x; pi --')
    const found = problems()
    assert.ok(found.some((p) => p.includes('is about another harness')))
    assert.ok(found.some((p) => p.includes('names a home directory')))
  })

  test('refuses a current or disputed statement that does not support its proposition', () => {
    edit(FORK, 'direction: supports', 'direction: disputes')
    assert.ok(
      problems().some((p) => p.includes('a current statement must have direction supports')),
    )
    edit(FORK, 'status: current', 'status: disputed')
    assert.ok(
      problems().some((p) => p.includes('a disputed statement must have direction supports')),
    )
  })

  test('refuses overlap with a disputed statement', () => {
    const text = readFileSync(join(dir, FORK), 'utf8')
    const copy = 'statements/Claude Code/Claude Code Fork again.md'
    writeFileSync(join(dir, copy), text.replace('status: current', 'status: disputed'))
    assert.ok(problems().some((p) => p.includes('a second current or disputed statement overlaps')))
    edit(FORK, 'status: current', 'status: disputed')
    assert.ok(problems().some((p) => p.includes('a second current or disputed statement overlaps')))
  })

  test('a subject slug with more than one slash is refused', () => {
    // The subjects schema pattern already refuses it; lint repeats the rule for a loaded record.
    edit('subjects/cli/Session environment.md', 'slug: cli/session-env', 'slug: cli/session/env')
    assert.ok(problems().some((p) => p.includes('slug')))
  })

  test('refuses a scope boundary that is not a real version', () => {
    edit(FORK, '  since: null', '  since: 1.0.0-01')
    assert.ok(problems().some((p) => p.includes('"1.0.0-01" is not a semver version')))
  })
})
