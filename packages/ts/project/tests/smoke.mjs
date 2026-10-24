// Runs the BUILT package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { createProject, tasks } from '@osdlc/project'
import { builtins, BUILTIN_TOOL_IDS } from '@osdlc/project/builtins'
import { humanMs } from '@osdlc/project/duration'
import { terms } from '@osdlc/project/match'
import { nodeTools } from '@osdlc/project/node'
import { paramShape } from '@osdlc/project/params'
import { just } from '@osdlc/project/runners'
import { lefthook } from '@osdlc/project/tools'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'project-smoke-')))
const write = (path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
try {
  write(
    'package.json',
    JSON.stringify({ packageManager: 'pnpm@9.1.0', scripts: { test: 'vitest' } }),
  )
  write('pnpm-lock.yaml', '')
  write('justfile', 'build:\n    echo build\n')
  write('lefthook.yml', 'pre-commit:\n  commands: {}\n')
  write('Cargo.toml', '[package]\nname = "smoke"\nversion = "0.1.0"\n')

  assert.deepEqual(
    builtins.map((t) => t.id),
    [...BUILTIN_TOOL_IDS],
  )
  const project = createProject({ tools: builtins })
  const profile = await project.detect(root, { discovery: 'walk' })
  assert.deepEqual(profile.ecosystems, ['node', 'rust'])
  assert.equal(profile.packages[0].manifests.cargo.name, 'smoke')

  const catalog = await project.runners.collect(profile)
  const displays = tasks(catalog).map((t) => t.display)
  assert.ok(displays.includes('just build'))
  assert.ok(displays.includes('pnpm run test'))
  assert.ok(displays.includes('pnpm install --frozen-lockfile'))
  assert.ok(displays.includes('lefthook run pre-commit'))
  assert.deepEqual(project.armHooks(profile)[0].argv, ['lefthook', 'install'])

  const small = createProject({ tools: [...nodeTools, just, lefthook] })
  assert.deepEqual((await small.detect(root, { discovery: 'walk' })).ecosystems, ['node'])

  assert.deepEqual(terms('Build Web'), ['build', 'web'])
  assert.equal(paramShape([{ name: 'env', required: true, variadic: false }]), '<env>')
  assert.match(humanMs(1500), /s/)
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('project smoke: OK')
