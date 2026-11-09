// Runs the BUILT package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_CONFIG_NAME,
  loadConfig,
  slugify,
  transform,
  wikilinkRef,
} from '@osdlc/markdown-astro'
import { remarkWikilinks } from '@osdlc/markdown-astro/remark'

assert.equal(slugify('Maple Street School'), 'maple-street-school')
assert.equal(typeof remarkWikilinks, 'function')
assert.equal(wikilinkRef('location').safeParse('[[location/city-library]]').success, true)

const dir = mkdtempSync(join(tmpdir(), 'markdown-astro-smoke-'))
try {
  mkdirSync(join(dir, 'vault/Posts'), { recursive: true })
  mkdirSync(join(dir, 'vault/_attachments'), { recursive: true })
  writeFileSync(join(dir, 'vault/_attachments/photo.png'), 'png')
  writeFileSync(join(dir, 'vault/Posts/hello.md'), 'Hi ![[photo.png]]\n')
  writeFileSync(
    join(dir, DEFAULT_CONFIG_NAME),
    [
      'vault: vault',
      'assets: { publicDir: public/_media, publicBase: /_media, vaultDir: _attachments }',
      'collections:',
      '  - { name: posts, vaultDir: Posts, contentDir: src/content/posts, route: /posts/:slug }',
      '',
    ].join('\n'),
  )

  const stats = transform(loadConfig(join(dir, DEFAULT_CONFIG_NAME)), { verbose: false })
  assert.equal(stats.files, 1)
  assert.equal(
    readFileSync(join(dir, 'src/content/posts/hello.md'), 'utf8'),
    'Hi ![photo.png](/_media/photo.png)\n',
  )

  // The bin, through a symlink: npm and npx start it from node_modules/.bin.
  // The link to bin/ runs under node; the link npm installs is executable and runs as a command.
  const bin = join(dirname(fileURLToPath(import.meta.resolve('@osdlc/markdown-astro'))), 'cli.js')
  const link = join(dir, 'markdown-astro')
  symlinkSync(bin, link)
  const runs = [[process.execPath, [link]]]
  const installed = join(process.cwd(), 'node_modules', '.bin', 'markdown-astro')
  if (existsSync(installed)) runs.push([installed, []])

  for (const [command, prefix] of runs) {
    const help = spawnSync(command, [...prefix, '--help'], { cwd: dir, encoding: 'utf8' })
    assert.equal(help.status, 0, `${command} --help: ${help.stderr}`)
    assert.match(help.stdout, /Usage:/)
    const check = spawnSync(command, [...prefix, 'check', '--quiet'], {
      cwd: dir,
      encoding: 'utf8',
    })
    assert.equal(check.status, 0, `${command} check: ${check.stderr}`)
    assert.match(check.stdout, /\[dry-run\]/)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
