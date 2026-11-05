import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const CLI = join(import.meta.dirname, 'cli.ts')

let dir = ''
const put = (rel: string, text: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
const read = (rel: string): string => readFileSync(join(dir, rel), 'utf8')
const cli = (...args: string[]): { status: number | null; stdout: string; stderr: string } => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}
const corpus = (rel: string, id: string): void => {
  put(`${rel}/markdown-db.yaml`, `markdown-db: 0\nid: ${id}\nformats: [md, yaml, json]\n`)
  put(`${rel}/notes/notes.schema.json`, '{}')
  put(`${rel}/notes/A.md`, '---\n---\nA.\n')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'markdown-db-cli-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('cli.ts validate', () => {
  test('passes every valid corpus and warns when two share an id', () => {
    corpus('one', 'shared')
    corpus('two', 'shared')
    const r = cli('validate', '.')
    assert.equal(r.status, 0)
    assert.equal(r.stdout, 'ok: one: 1 notes\nok: two: 1 notes\n')
    assert.match(r.stderr, /^warning: two: id: "shared" is also one's id$/m)
  })

  test('exits 1 when one of several corpora fails', () => {
    corpus('one', 'a')
    corpus('two', 'b')
    put('two/notes/B.md', 'See [x](Gone.md).\n')
    const r = cli('validate', '.')
    assert.equal(r.status, 1)
    assert.match(r.stdout, /^ok: one: 1 notes$/m)
    assert.match(r.stderr, /^notes\/B\.md: body: Gone\.md: no such file$/m)
    assert.match(r.stderr, /^two: 1 error\(s\)$/m)
  })

  test('exits 1 when no root file is at or below the folder', () => {
    put('notes/A.md', 'A.\n')
    const r = cli('validate', '.')
    assert.equal(r.status, 1)
    assert.equal(r.stderr, '.: no markdown-db root file at or below it\n')
    assert.equal(cli('validate', 'missing').status, 1)
  })

  test('exits 2 on bad usage', () => {
    for (const args of [[], ['check', '.'], ['validate'], ['validate', '.', 'extra']]) {
      const r = cli(...args)
      assert.equal(r.status, 2, args.join(' '))
      assert.equal(r.stderr, 'usage: cli.ts validate [--fix] <folder>\n')
    }
  })

  test('--fix rewrites wikilinks in .json and .yaml records', () => {
    corpus('c', 'c')
    put('c/notes/B.json', '{"see": "[[A]]"}\n')
    put('c/notes/C.yaml', 'see: "[[notes/A|the A note]]"\n')
    const r = cli('validate', '--fix', 'c')
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, 'fixed: notes/B.json\nfixed: notes/C.yaml\nok: c: 3 notes\n')
    assert.equal(r.stderr, '')
    assert.equal(read('c/notes/B.json'), '{"see": "[A](A.md)"}\n')
    assert.equal(read('c/notes/C.yaml'), 'see: "[the A note](A.md)"\n')
  })
})
