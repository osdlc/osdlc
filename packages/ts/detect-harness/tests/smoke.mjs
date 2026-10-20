// Loads the built package under plain Node: runs detect() on a tiny fixture,
// resolves a location, and reads a tiny plugin through ./model.
// Run after `pnpm run build`: `node tests/smoke.mjs`. The imports go by package name,
// so `exports` resolves them: to dist/ here, to the installed tarball in
// `check:packages`.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { REDACTED, detect } from '@osdlc/detect-harness'
import { resolveConfigDir } from '@osdlc/detect-harness/locations'
import { readPlugin } from '@osdlc/detect-harness/model'

const root = mkdtempSync(join(tmpdir(), 'detect-harness-smoke-'))
try {
  const home = join(root, 'home')
  const project = join(root, 'project')
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(project, { recursive: true })
  writeFileSync(
    join(home, '.claude', 'settings.json'),
    JSON.stringify({ permissions: { allow: ['Read'] } }),
  )
  writeFileSync(
    join(project, '.mcp.json'),
    JSON.stringify({ mcpServers: { api: { command: 'api', env: { KEY: 'secret' } } } }),
  )

  const catalog = await detect({ projectRoot: project, home, systemRoot: root, env: { PATH: '' } })
  const claude = catalog.reports.find((r) => r.harness === 'claude')
  assert.equal(catalog.reports.length, 6)
  assert.equal(claude.status, 'ok')
  assert.deepEqual(
    claude.permissions.rules.map((r) => r.rule),
    ['Read'],
  )
  assert.deepEqual(claude.mcpServers[0].env, { KEY: REDACTED })

  assert.equal(resolveConfigDir('codex', { home, env: {} }), join(home, '.codex'))

  mkdirSync(join(root, 'plugin', '.claude-plugin'), { recursive: true })
  writeFileSync(
    join(root, 'plugin', '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'smoke', version: '1.0.0' }),
  )
  assert.equal(readPlugin(join(root, 'plugin')).metadata.name, 'smoke')

  process.stdout.write('detect-harness smoke: ok\n')
} finally {
  rmSync(root, { recursive: true, force: true })
}
