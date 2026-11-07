import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import {
  recallSessionPane,
  rememberSessionPane,
  sessionIdSlug,
} from '../src/hosts/session-panes.ts'

import { startChild } from './fixtures/child.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))

describe('session pane memory', () => {
  test('remembers pane and cwd per session id, null for an unknown id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'panes-'))
    rememberSessionPane(dir, 's-1', 'term_1', '/w')
    expect(recallSessionPane(dir, 's-1')).toEqual({ pane: 'term_1', cwd: '/w' })
    expect(recallSessionPane(dir, 's-2')).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  test('ids differing only in case get files whose names differ ignoring case', () => {
    const dir = mkdtempSync(join(tmpdir(), 'panes-'))
    rememberSessionPane(dir, 'Abc', 'p-upper', '/w')
    rememberSessionPane(dir, 'abc', 'p-lower', '/w')
    const names = readdirSync(join(dir, 'sessions'))
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(2)
    expect(recallSessionPane(dir, 'Abc')?.pane).toBe('p-upper')
    expect(recallSessionPane(dir, 'abc')?.pane).toBe('p-lower')
    rmSync(dir, { recursive: true, force: true })
  })

  test('an id with characters invalid in Windows file names gets a portable file name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'panes-'))
    rememberSessionPane(dir, 'run*1:a/b', 'p', '/w')
    const [name] = readdirSync(join(dir, 'sessions'))
    expect(name).toMatch(/^[A-Za-z0-9_-]+\.json$/)
    expect(name).toBe(`${sessionIdSlug('run*1:a/b', 32)}.json`)
    expect(recallSessionPane(dir, 'run*1:a/b')).toEqual({ pane: 'p', cwd: '/w' })
    rmSync(dir, { recursive: true, force: true })
  })

  test('a file that records another id is not recalled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'panes-'))
    rememberSessionPane(dir, 's-1', 'p', '/w')
    const [name] = readdirSync(join(dir, 'sessions'))
    const file = join(dir, 'sessions', name!)
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toMatchObject({ id: 's-1' })
    writeFileSync(file, JSON.stringify({ id: 's-other', pane: 'p', cwd: '/w' }))
    expect(recallSessionPane(dir, 's-1')).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  test('concurrent remembers from separate processes keep every entry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'panes-'))
    const mod = join(HERE, '..', 'src', 'hosts', 'session-panes.ts')
    const ids = Array.from({ length: 12 }, (_, i) => `s-${i}`)
    const procs = ids.map((id) =>
      startChild([
        process.execPath,
        '--input-type=module',
        '-e',
        `import { rememberSessionPane } from ${JSON.stringify(mod)}; rememberSessionPane(${JSON.stringify(dir)}, ${JSON.stringify(id)}, 'p-${id}', '/w')`,
      ]),
    )
    await Promise.all(procs.map((p) => p.exited))
    for (const id of ids) expect(recallSessionPane(dir, id)?.pane).toBe(`p-${id}`)
    rmSync(dir, { recursive: true, force: true })
  })

  test('a write failure is reported on stderr, not thrown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'panes-'))
    const original = process.stderr.write
    let written = ''
    process.stderr.write = ((chunk: string) => ((written += chunk), true)) as typeof original
    try {
      // The "directory" is a file, so the sessions/ subdirectory cannot be created.
      writeFileSync(join(dir, 'blocker'), 'x')
      expect(() => rememberSessionPane(join(dir, 'blocker'), 's-1', 'p', '/w')).not.toThrow()
    } finally {
      process.stderr.write = original
    }
    expect(written).toContain('could not remember the pane of session s-1')
    rmSync(dir, { recursive: true, force: true })
  })
})
