import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, test, vi } from 'vitest'

import { main } from '@osdlc/package-checks'

let err = ''
let out = ''
beforeEach(() => {
  err = ''
  out = ''
  vi.spyOn(process.stderr, 'write').mockImplementation((s) => ((err += String(s)), true))
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => ((out += String(s)), true))
})
afterEach(() => vi.restoreAllMocks())

test('a bad command line exits 2 with the usage', async () => {
  assert.equal(await main([]), 2)
  assert.equal(await main(['nope']), 2)
  assert.equal(await main(['semver', 'Cargo.toml']), 2)
  assert.equal(await main(['rust', 'extra']), 2)
  assert.equal(await main(['stage']), 2)
  assert.equal(await main(['stage', '--nope', 'x']), 2)
  assert.match(err, /usage: package-checks ts/)
})

test('rust checks the workspace the settings name', async () => {
  const root = mkdtempSync(join(tmpdir(), 'package-checks-cli-'))
  try {
    mkdirSync(join(root, 'crates', 'demo', 'src'), { recursive: true })
    writeFileSync(join(root, 'package-checks.json'), JSON.stringify({ rustWorkspace: 'crates' }))
    writeFileSync(join(root, 'crates', 'Cargo.toml'), '[workspace]\nmembers = ["demo"]\n')
    writeFileSync(
      join(root, 'crates', 'demo', 'Cargo.toml'),
      '[package]\nname = "demo"\npublish = false\n',
    )
    assert.equal(await main(['rust'], root), 1)
    assert.match(
      err,
      /FAILED: crates\/demo\n {2}package\.edition must be `edition\.workspace = true`/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('affected off a pull request picks every package and writes the outputs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'package-checks-cli-'))
  const output = join(root, 'out.txt')
  const env = { ...process.env }
  try {
    mkdirSync(join(root, 'packages', 'ts', 'a'), { recursive: true })
    writeFileSync(
      join(root, 'packages', 'ts', 'a', 'package.json'),
      JSON.stringify({ name: '@x/a' }),
    )
    writeFileSync(output, '')
    process.env['EVENT'] = 'push'
    process.env['GITHUB_OUTPUT'] = output
    assert.equal(await main(['affected'], root), 0)
    assert.match(
      out,
      /checking every package\npackages=\["packages\/ts\/a"\]\nfilter=--filter \.\/packages\/ts\/a\n/,
    )
  } finally {
    process.env = env
    rmSync(root, { recursive: true, force: true })
  }
})

test('a settings file it cannot read fails the command', async () => {
  const root = mkdtempSync(join(tmpdir(), 'package-checks-cli-'))
  try {
    writeFileSync(join(root, 'package-checks.json'), JSON.stringify({ nope: 1 }))
    assert.equal(await main(['rust'], root), 1)
    assert.match(err, /unknown key nope/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
