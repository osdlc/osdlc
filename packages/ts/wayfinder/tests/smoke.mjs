// Runs the BUILT binary under Node. The unit tests run the TypeScript source,
// so dist/ is compiled but never run anywhere else.
//
// `pnpm run smoke` runs it here. check-packages.ts copies it into a clean
// project that installed the tarball, so it must not import other repo files.
// It is not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Installed, the package resolves by name. In this repo nothing installs it,
// so fall back to the directory above.
function packageDir() {
  try {
    return dirname(fileURLToPath(import.meta.resolve('@osdlc/wayfinder/package.json')))
  } catch {
    return fileURLToPath(new URL('..', import.meta.url))
  }
}

const bin = join(packageDir(), 'bin', 'way.js')
const base = mkdtempSync(join(tmpdir(), 'wayfinder-smoke-'))
// Keep the cache, config and trust store out of the real home.
const env = {
  ...process.env,
  HOME: join(base, 'home'),
  XDG_CACHE_HOME: join(base, 'cache'),
  XDG_CONFIG_HOME: join(base, 'config'),
  XDG_STATE_HOME: join(base, 'state'),
}
const way = (args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env })

try {
  const help = way(['--help'])
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /^usage: way /m)

  const dir = join(base, 'project')
  mkdirSync(dir)
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'p', scripts: { build: 'tsc', dev: 'vite' } }),
  )

  const list = way(['list', '-C', dir])
  assert.equal(list.status, 0, list.stderr)
  assert.match(list.stdout, /^npm run build$/m)

  const json = way(['list', '--json', '-C', dir])
  assert.equal(json.status, 0, json.stderr)
  const catalog = JSON.parse(json.stdout)
  assert.equal(catalog.groups[0].id, 'tasks')

  const providers = way(['providers', '--json', '-C', dir])
  assert.equal(providers.status, 0, providers.stderr)
  assert.ok(
    JSON.parse(providers.stdout).providers.some((p) => p.id === 'npm' && p.source === 'built-in'),
  )

  // The web view's page, built from dist/ the way `way serve` builds it.
  const { buildPage } = await import(pathToFileURL(join(packageDir(), 'dist', 'page.js')).href)
  const html = await buildPage({ theme: 'dark' })
  assert.ok(html.includes('<html lang="en" data-theme="dark">'))
  assert.ok(!html.includes('<!-- @SCRIPT@ -->') && !html.includes('<!-- @STYLE@ -->'))
  assert.ok(!html.includes('the page script failed to build'), 'dist/web/main.js is missing')
  assert.match(html, /<script type="module">\n.{1000,}/s)

  // The library entry, built: the same catalog document as `way list --json`.
  const { buildCatalog } = await import(pathToFileURL(join(packageDir(), 'dist', 'index.js')).href)
  const doc = await buildCatalog({ dir, env, home: env.HOME })
  assert.equal(doc.kind, 'catalog')
  assert.ok(doc.reports.some((r) => r.tasks.some((t) => t.display === 'npm run dev')))
} finally {
  rmSync(base, { recursive: true, force: true })
}

console.log('@osdlc/wayfinder: smoke ok')
