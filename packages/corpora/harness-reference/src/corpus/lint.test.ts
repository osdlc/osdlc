import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Ajv2020 } from 'ajv/dist/2020.js'

import { CORPUS_ROOT, loadCorpus } from './corpus.ts'
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
  const corpus = loadCorpus(dir)
  return [...corpus.report.errors, ...lint(corpus)]
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-reference-lint-'))
  cpSync(CORPUS_ROOT, dir, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('lint', () => {
  test('the corpus passes', () => {
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

  test('refuses a statement that supersedes itself', () => {
    edit(
      SESSION,
      'status: current',
      'status: current\nsupersedes: "[x](Claude%20Code%20Session%20environment.md)"',
    )
    assert.ok(problems().some((p) => p === `${SESSION}: supersedes links to itself`))
  })

  test('says so when a supersedes link names a file that is not a statement', () => {
    edit(SESSION, 'status: current', 'status: current\nsupersedes: "[x](../../harnesses/Pi.md)"')
    const found = problems().filter((p) => p.endsWith('not a statement'))
    assert.equal(found.length, 1, found.join('\n'))
    assert.ok(found[0]!.startsWith(`${SESSION}: supersedes `))
    assert.match(found[0]!, /which is a harnesses record, not a statement/)
  })

  describe('strength by rule', () => {
    const RUN = 'study-results/Claude Code/2026-10-10 Claude Code Session environment.md'
    const strength = (list: string[]): string[] =>
      list.filter((p) => p.includes('strength') || p.includes('evidence kinds'))

    test('passes a docs result held at moderate, and a run held at strong', () => {
      assert.deepEqual(strength(problems()), [])
      edit(RUN, 'kind: run', 'kind: docs')
      edit(SESSION, 'strength: strong', 'strength: moderate')
      edit(SESSION, 'strengthOfEvidenceProvided: strong', 'strengthOfEvidenceProvided: moderate')
      assert.deepEqual(problems(), [])
    })

    test('refuses an evidence line stronger than its evidence kinds allow', () => {
      edit(RUN, 'kind: run', 'kind: docs')
      edit(SESSION, 'strength: strong', 'strength: moderate')
      const found = strength(problems())
      assert.deepEqual(found, [
        `${SESSION}: evidence line is strong, but its evidence kinds allow at most moderate`,
      ])
    })

    test('refuses a statement stronger than its strongest supporting line', () => {
      edit(SESSION, 'strengthOfEvidenceProvided: strong', 'strengthOfEvidenceProvided: moderate')
      assert.deepEqual(strength(problems()), [
        `${SESSION}: strength strong is above its strongest supporting evidence line (moderate)`,
      ])
    })

    test('caps a line at its evidence kinds before comparing the statement to it', () => {
      edit(RUN, 'kind: run', 'kind: docs')
      assert.ok(
        strength(problems()).includes(
          `${SESSION}: strength strong is above its strongest supporting evidence line (moderate)`,
        ),
      )
    })

    test('refuses a strength with no supporting evidence line', () => {
      const file = join(dir, SESSION)
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replaceAll(
          'directionOfEvidenceProvided: supports',
          'directionOfEvidenceProvided: disputes',
        ),
      )
      assert.ok(
        strength(problems()).includes(
          `${SESSION}: strength strong has no supporting evidence line`,
        ),
      )
    })
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

  describe('a latest-cardinality subject', () => {
    const PI = (v: string): string => `statements/Pi/Pi Version seen ${v}.md`
    test('refuses a second current statement', () => {
      edit(PI('0.99.1'), 'status: superseded', 'status: current')
      assert.ok(problems().some((p) => p.includes('a latest subject has a second current')))
    })

    test('refuses a superseded statement nothing replaces', () => {
      edit(
        PI('1.1.0'),
        /supersedes: .*\n/u.exec(readFileSync(join(dir, PI('1.1.0')), 'utf8'))![0],
        '',
      )
      assert.ok(
        problems().some(
          (p) => p.startsWith(PI('0.99.1')) && p.includes('must be replaced by exactly one'),
        ),
      )
    })

    const setSupersedesLink = (v: string, href: string): void => {
      const file = join(dir, PI(v))
      const text = readFileSync(file, 'utf8')
      const line = `supersedes: "[x](${href})"`
      writeFileSync(
        file,
        /^supersedes: .*$/mu.test(text)
          ? text.replace(/^supersedes: .*$/mu, line)
          : text.replace(/^status: .*$/mu, (m) => `${m}\n${line}`),
      )
    }
    const setSupersedes = (v: string, target: string): void =>
      setSupersedesLink(v, `Pi%20Version%20seen%20${target}.md`)
    // lint's own reports only: the validator also refuses a link to a record of another type.
    const supersedesProblems = (v: string): string[] =>
      lint(loadCorpus(dir)).filter((p) => p.startsWith(`${PI(v)}: supersedes`))

    test('reports a self-link once', () => {
      setSupersedes('1.1.0', '1.1.0')
      assert.deepEqual(supersedesProblems('1.1.0'), [`${PI('1.1.0')}: supersedes links to itself`])
    })

    test('reports a link to a record that is not a statement once', () => {
      setSupersedesLink('1.1.0', '../../harnesses/Pi.md')
      const found = supersedesProblems('1.1.0')
      assert.equal(found.length, 1, found.join('\n'))
      assert.match(found[0]!, /which is a harnesses record, not a statement/)
    })

    test('refuses a statement replaced twice', () => {
      setSupersedes('0.84.3', '0.99.1')
      assert.ok(problems().some((p) => p.startsWith(PI('0.99.1')) && p.includes('found 2')))
    })

    test('reports a supersedes target that does not resolve, not a wrong count', () => {
      setSupersedes('1.1.0', 'nowhere')
      const found = problems()
      assert.ok(
        found.some((p) => p.startsWith(PI('1.1.0')) && p.includes('does not name a statement')),
      )
      assert.ok(!found.some((p) => p.includes('must be replaced by exactly one')))
    })

    test('refuses a loop', () => {
      setSupersedes('0.84.1', '1.1.0')
      assert.ok(problems().some((p) => p.includes('supersedes chain loops')))
    })
  })

  test('cli/output-format needs formats only when supported', () => {
    const subject = loadCorpus(dir).get('subjects', 'Output format flag') as { valueSchema: object }
    const ok = new Ajv2020({ strict: false }).compile(subject.valueSchema)
    assert.ok(ok({ supported: false }))
    assert.ok(ok({ supported: true, formats: [{ name: 'json', argv: ['--json'] }] }))
    assert.ok(!ok({ supported: true }))
    assert.ok(!ok({ supported: 'partial' }))
  })
})
