/**
 * The README's opening example, run through the package name: an adapter's own
 * row is picked, checked and run, and the receipt records the adapter's
 * verification.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import { Git } from '@osdlc/typed-git'
import { IDENTITY } from '@osdlc/typed-git/testing'
import { hostCheck, hostPlan, hostRun, hostSweep, type HostAdapter } from '@osdlc/host-cleaner'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-readme-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const git = (args: string[]): string =>
  new Git(root, { env: { ...IDENTITY } }).rawChecked(args).stdout.trim()

const cache: HostAdapter = {
  name: 'cache',
  detect: () => true,
  gather: () => [
    {
      id: 'artifact:build-cache',
      adapter: 'cache',
      kind: 'artifact',
      name: 'build-cache',
      verdict: 'delete',
      action: 'remove',
      why: 'idle for a week',
      risks: [],
      blockers: [],
      commands: ['rm -r build-cache'],
      notes: [],
      evidence: { bytes: 4096 },
    },
  ],
  execute: (step) => `removed ${step.row.name}`,
}

test("an adapter's row goes through plan, check and run, and the receipt keeps its verification", () => {
  git(['init', '-q', '-b', 'main'])
  git(['commit', '--allow-empty', '-q', '-m', 'initial'])

  const opts = { adapters: [cache], cwd: root }
  const swept = hostSweep([root], opts)
  const preview = hostCheck(hostPlan(swept), { pick: ['artifact:build-cache'] }, opts)
  const receiptPath = join(root, '.git', 'receipt.json')
  const receipt = hostRun(preview, { ...opts, receiptPath })

  expect(receipt.status).toBe('complete')
  expect(receipt.host.steps[0]).toMatchObject({
    row: 'artifact:build-cache',
    result: 'ok',
    verification: 'removed build-cache',
  })
  expect(JSON.parse(readFileSync(receiptPath, 'utf-8')).status).toBe('complete')
})
