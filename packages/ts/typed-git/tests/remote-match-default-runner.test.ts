/**
 * The default ssh runner of sshAliasResolver. command-seam is mocked here,
 * in a file of its own, so the spy sees how the runner is built and no ssh
 * runs.
 */

import { expect, test, vi } from 'vitest'

import { spawnRunner } from '@osdlc/command-seam'

import { sshAliasResolver } from '../src/remote-match.ts'

vi.mock('@osdlc/command-seam', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@osdlc/command-seam')>()
  return { ...actual, spawnRunner: vi.fn(actual.spawnRunner) }
})

test('the default runner finds ssh on absolute PATH entries only', () => {
  vi.mocked(spawnRunner).mockClear()
  sshAliasResolver()
  expect(spawnRunner).toHaveBeenCalledExactlyOnceWith('ssh', { absolutePathOnly: true })
})
