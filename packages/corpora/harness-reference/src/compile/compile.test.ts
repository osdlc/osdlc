import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Ajv2020 } from 'ajv/dist/2020.js'

import { BETA, loadBeta } from '../beta/corpus.ts'
import { compile, dirtyFiles, permalink, sliceKnowledge, writeKnowledge } from './compile.ts'
import { KNOWLEDGE_SCHEMA } from './knowledge.ts'
import { lookup } from './lookup.ts'

const SHA = '0123456789abcdef0123456789abcdef01234567'
const STATEMENT = 'statements/Claude Code/Claude Code Fork a session.md'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-reference-compile-'))
  cpSync(BETA, dir, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('sliceKnowledge', () => {
  test('keeps only the listed harnesses and subjects, without valueSchema', () => {
    const full = compile(loadBeta(BETA), SHA)
    const sliced = sliceKnowledge(full, { harnesses: ['claude-code'], subjects: ['cli/fork'] })
    assert.deepEqual(Object.keys(sliced.harnesses), ['claude-code'])
    assert.deepEqual(Object.keys(sliced.subjects), ['cli/fork'])
    assert.ok(sliced.values.length > 0)
    for (const v of sliced.values)
      assert.deepEqual([v.harness, v.subject], ['claude-code', 'cli/fork'])
    assert.ok(!('valueSchema' in sliced.subjects['cli/fork']!))
    assert.equal(sliced.corpus.commit, SHA)
  })

  test('writes compact JSON on request', () => {
    const sliced = sliceKnowledge(compile(loadBeta(BETA), SHA), {
      harnesses: ['claude-code'],
      subjects: ['cli/fork'],
    })
    const [file, ...rest] = writeKnowledge(dir, sliced, { schema: false, compact: true })
    assert.deepEqual(rest, [])
    const text = readFileSync(file!, 'utf8')
    assert.equal(text.trimEnd().includes('\n'), false)
    assert.deepEqual(JSON.parse(text), sliced)
  })
})

describe('compile', () => {
  test('writes the cli slice, validated against its own schema', () => {
    const k = compile(loadBeta(BETA), SHA)
    assert.equal(k.schema, 1)
    assert.deepEqual(k.corpus, {
      repo: 'osdlc/skillwright',
      path: 'harness-reference/corpora/beta',
      commit: SHA,
    })
    assert.ok(k.values.length >= 30)
    assert.equal(Object.keys(k.harnesses).length, 17)
    assert.equal(k.harnesses['claude-code']?.kind, 'harness')
    assert.equal(k.harnesses['agent-skills']?.kind, 'standard')
    assert.equal(k.harnesses['claude-code']?.title, 'Claude Code')
    assert.equal(k.harnesses['claude-code']?.cli, 'claude')
    assert.equal(k.subjects['cli/session-env']?.category, 'cli')
    const validate = new Ajv2020({ strict: false, formats: { uri: true } }).compile(
      KNOWLEDGE_SCHEMA,
    )
    assert.ok(validate(k), JSON.stringify(validate.errors))
  })

  test('each value links to its statement at the commit', () => {
    const k = compile(loadBeta(BETA), SHA)
    const v = k.values.find((x) => x.harness === 'claude-code' && x.subject === 'cli/session-env')
    assert.equal(
      v?.basis,
      `https://github.com/osdlc/skillwright/blob/${SHA}/harness-reference/corpora/beta/statements/Claude%20Code/Claude%20Code%20Session%20environment.md`,
    )
    assert.equal(
      permalink('c', 'a b/c.md'),
      'https://github.com/osdlc/skillwright/blob/c/harness-reference/corpora/beta/a%20b/c.md',
    )
    assert.deepEqual(v?.value, { vars: ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID'] })
    assert.equal(v?.strength, 'strong')
  })

  test('is deterministic and feeds lookup', () => {
    const a = compile(loadBeta(BETA), SHA)
    const b = compile(loadBeta(BETA), SHA)
    assert.equal(JSON.stringify(a), JSON.stringify(b))
    const found = lookup(a, 'pi', 'cli/headless')
    assert.deepEqual(found?.value, { flag: '-p/--print', note: 'text output by default' })
    assert.equal(lookup(a, 'pi', 'cli/nothing'), undefined)
  })

  test('keeps disputed values flagged and leaves superseded and open ones out', () => {
    const before = compile(loadBeta(dir), SHA).values.length
    const text = readFileSync(join(dir, STATEMENT), 'utf8')
    writeFileSync(join(dir, STATEMENT), text.replace('status: current', 'status: disputed'))
    const second = 'statements/Pi/Pi Fork a session.md'
    writeFileSync(
      join(dir, second),
      readFileSync(join(dir, second), 'utf8')
        .replace('status: current', 'status: superseded')
        .replace('  until: null', '  until: 1.0.0'),
    )
    const k = compile(loadBeta(dir), SHA)
    const fork = k.values.find((v) => v.harness === 'claude-code' && v.subject === 'cli/fork')
    assert.equal(fork?.disputed, true)
    assert.equal(
      k.values.some((v) => v.harness === 'pi' && v.subject === 'cli/fork'),
      false,
    )
    assert.equal(k.values.length, before - 1)
  })

  test('a current statement that disputes its proposition cannot be compiled into a value', () => {
    writeFileSync(
      join(dir, STATEMENT),
      readFileSync(join(dir, STATEMENT), 'utf8').replace(
        'direction: supports',
        'direction: disputes',
      ),
    )
    assert.throws(() => compile(loadBeta(dir), SHA), /must have direction supports/)
  })

  test('an open, neutral statement is not a value', () => {
    const open = 'statements/Claude Code/Claude Code Open with a chosen session id.md'
    writeFileSync(
      join(dir, open),
      readFileSync(join(dir, open), 'utf8')
        .replace('direction: supports\nstrength: strong\n', 'direction: neutral\n')
        .replace('status: current', 'status: open\nopen:\n  - Does it?'),
    )
    const k = compile(loadBeta(dir), SHA)
    assert.equal(
      k.values.some((v) => v.harness === 'claude-code' && v.subject === 'cli/open-with-id'),
      false,
    )
    assert.ok(k.values.every((v) => v.strength !== undefined))
  })

  test('warns about a dirty corpus tree', () => {
    const repo = join(dir, 'repo')
    mkdirSync(repo)
    const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' })
    git('init', '-q')
    writeFileSync(join(repo, 'a.md'), 'x')
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x')
    assert.deepEqual(dirtyFiles(repo), [])
    writeFileSync(join(repo, 'a.md'), 'y')
    writeFileSync(join(repo, 'b.md'), 'z')
    assert.equal(dirtyFiles(repo).length, 2)
  })

  test('refuses a corpus that fails lint', () => {
    writeFileSync(
      join(dir, STATEMENT),
      readFileSync(join(dir, STATEMENT), 'utf8').replace('supported: true', 'supported: nope'),
    )
    assert.throws(() => compile(loadBeta(dir), SHA), /does not pass lint/)
  })

  test('writes the file and its schema', () => {
    const out = join(dir, 'out')
    const files = writeKnowledge(out, compile(loadBeta(BETA), SHA))
    assert.deepEqual(
      files.map((f) => f.slice(out.length + 1)),
      ['harness-knowledge.json', 'harness-knowledge.schema.json'],
    )
    assert.equal(JSON.parse(readFileSync(files[1] as string, 'utf8')).title, 'Harness knowledge')
    assert.ok(readFileSync(files[0] as string, 'utf8').endsWith('}\n'))
  })
})
