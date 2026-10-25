// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name and the wasm glue to it), so a
// broken emit, or a dist/ without the wasm, could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CoreError,
  InvalidNamespaceError,
  createNodeVfs,
  knownTargets,
  publishSkill,
  validateNamespace,
} from '@osdlc/tradecraft-wasm'

assert.ok(knownTargets().includes('claude'))
validateNamespace('tc')
assert.throws(() => validateNamespace(''), InvalidNamespaceError)

const root = mkdtempSync(join(tmpdir(), 'tradecraft-smoke-'))
try {
  const vault = join(root, 'vault')
  const folder = join(vault, 'marketplaces/house/plugins/tools/skills/review')
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(vault, 'marketplaces/house/house.md'),
    '---\nname: house\ndescription: The house marketplace.\ntc-owner: acme\n---\n',
  )
  const note = join(folder, 'review.md')
  writeFileSync(note, '---\nname: review\ndescription: Reviews a diff.\n---\n\n# Review\n')
  const destination = join(root, 'project')
  mkdirSync(destination)

  const report = publishSkill(createNodeVfs(), {
    skill_path: note,
    destination_root: destination,
    target: 'claude',
    skills_root: vault,
  })
  assert.deepEqual(
    report.files.map((f) => f.status),
    ['written', 'written'],
  )
  assert.match(
    readFileSync(join(destination, '.claude/skills/review/SKILL.md'), 'utf-8'),
    /Reviews a diff/,
  )

  assert.throws(
    () =>
      publishSkill(createNodeVfs(), {
        skill_path: join(root, 'missing.md'),
        destination_root: destination,
        target: 'claude',
      }),
    (error) => error instanceof CoreError,
  )
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('tradecraft-wasm smoke: OK')
