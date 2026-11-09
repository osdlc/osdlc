/**
 * The migration code the README shows, run. `tests/readme.test.ts` checks
 * that the README holds each `// #region` block word for word.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'
import { z } from 'zod'

import { envVars, machineConfigFile, migrateConfigRaw, setPath } from '@osdlc/config-layers'

// #region migrations
import { defineMigrations } from '@osdlc/config-layers'

const migrations = defineMigrations([
  { to: 2, moves: [['agent.claude.command', 'agents.claude.command']] },
  {
    to: 3,
    moves: [['dirs', 'repos']],
    run: (raw, warn) => {
      if ('legacy' in raw) warn('legacy is no longer read; removed')
      delete raw.legacy
      return raw
    },
  },
])
// #endregion migrations

test('the migrations snippet moves, prunes and warns as the README says', () => {
  const out = migrateConfigRaw(
    { agent: { claude: { command: 'claude' } }, dirs: ['~/dev'], legacy: 1 },
    migrations,
  )
  expect(out.raw).toEqual({
    agents: { claude: { command: 'claude' } },
    repos: ['~/dev'],
    version: 3,
  })
  expect(out.warnings.map((w) => w.message)).toEqual([
    "moved 'agent.claude.command' to 'agents.claude.command'",
    "moved 'dirs' to 'repos'",
    'legacy is no longer read; removed',
  ])
})

const root = mkdtempSync(join(tmpdir(), 'migrations-example-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const machine = machineConfigFile({
  tool: 'tooly',
  schema: z.object({ repos: z.array(z.string()).default([]) }).strict(),
  vendorDirs: { vendor: 'com.example', envVars: envVars('TOOLY') },
  env: 'TOOLY_EXAMPLE_MACHINE_CONFIG',
})
process.env[machine.env] = join(root, 'config.yaml')
writeFileSync(machine.path(), '# mine\nrepos: []\n')

// #region machine-cas
const seen = machine.read()
const text = setPath(seen?.text ?? '', ['repos'], ['~/dev'])
machine.write(text, { etag: seen?.etag ?? null }) // WriteConflictError if it changed since
// #endregion machine-cas

test('the compare-and-swap snippet writes once, then refuses a stale etag', () => {
  expect(readFileSync(machine.path(), 'utf8')).toBe('# mine\nrepos:\n  - ~/dev\n')
  expect(() => machine.write(text, { etag: seen?.etag ?? null })).toThrow(
    expect.objectContaining({ name: 'WriteConflictError' }),
  )
})
