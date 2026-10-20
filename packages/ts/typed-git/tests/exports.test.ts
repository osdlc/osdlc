/**
 * Exported values that no other suite names: the scan defaults and the
 * command-seam runners the entry point re-exports.
 */

import { describe, expect, test } from 'bun:test'

import { tmpdir } from 'node:os'

import {
  asAsync,
  CommandFailed,
  DEFAULT_MAX_DEPTH,
  DEFAULT_WARN_AFTER,
  runChecked,
  runCheckedAsync,
  spawnRunner,
  spawnRunnerAsync,
} from '../index.ts'

const CWD = tmpdir()

describe('scan defaults', () => {
  test('DEFAULT_MAX_DEPTH is 3', () => {
    expect(DEFAULT_MAX_DEPTH).toBe(3)
  })

  test('DEFAULT_WARN_AFTER is 10_000', () => {
    expect(DEFAULT_WARN_AFTER).toBe(10_000)
  })
})

describe('re-exported runners', () => {
  test('spawnRunner runs a real binary', () => {
    const r = spawnRunner('git').run(['--version'], { cwd: CWD })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toStartWith('git version')
  })

  test('spawnRunnerAsync runs a real binary', async () => {
    const r = await spawnRunnerAsync('git').run(['--version'], { cwd: CWD })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toStartWith('git version')
  })

  test('runChecked returns the result on exit 0 and throws CommandFailed otherwise', () => {
    const ok = { run: () => ({ exitCode: 0, stdout: 'out', stderr: '' }) }
    const bad = { run: () => ({ exitCode: 2, stdout: '', stderr: 'boom' }) }
    expect(runChecked(ok, ['x'], { cwd: CWD }).stdout).toBe('out')
    expect(() => runChecked(bad, ['x'], { cwd: CWD })).toThrow(CommandFailed)
  })

  test('runCheckedAsync resolves on exit 0 and rejects with CommandFailed otherwise', async () => {
    const ok = { run: async () => ({ exitCode: 0, stdout: 'out', stderr: '' }) }
    const bad = { run: async () => ({ exitCode: 2, stdout: '', stderr: 'boom' }) }
    expect((await runCheckedAsync(ok, ['x'], { cwd: CWD })).stdout).toBe('out')
    await expect(runCheckedAsync(bad, ['x'], { cwd: CWD })).rejects.toBeInstanceOf(CommandFailed)
  })

  test('asAsync gives a sync runner an async run with the same arguments', async () => {
    const seen: string[][] = []
    const sync = {
      run: (argv: string[]) => {
        seen.push(argv)
        return { exitCode: 0, stdout: 'wrapped', stderr: '' }
      },
    }
    const r = await asAsync(sync).run(['a', 'b'], { cwd: CWD })
    expect(r.stdout).toBe('wrapped')
    expect(seen).toEqual([['a', 'b']])
  })
})
