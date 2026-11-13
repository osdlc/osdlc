// Runs the built package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. `package-checks ts` copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  encodePath,
  findCorpora,
  fold,
  idProblem,
  markdownLink,
  syncCorpus,
  validateCorpus,
} from '@osdlc/corpus-schema'

assert.equal(idProblem('a|b'), 'holds "|"')
assert.equal(fold('Kiro'), fold('KIRO'))
assert.equal(encodePath('a b.md'), 'a%20b.md')
assert.equal(markdownLink('A', 'a b.md'), '[A](a%20b.md)')

const dir = mkdtempSync(join(tmpdir(), 'corpus-schema-smoke-'))
const put = (rel, text) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
try {
  put('good/good.corpus-schema.md', '---\ncorpus-schema: 0\n---\n')
  put('good/notes/notes.schema.yaml', 'type: object\nrequired: [status]\n')
  put('good/notes/A.md', '---\nstatus: done\n---\nSee [B](B.md).\n')
  put('good/notes/B.md', '---\nstatus: open\n---\n')
  put('bad/bad.corpus-schema.md', '---\ncorpus-schema: 0\n---\nSee [gone](gone.md).\n')

  assert.deepEqual(findCorpora(dir).sort(), [join(dir, 'bad'), join(dir, 'good')])
  const good = validateCorpus(join(dir, 'good'))
  assert.deepEqual(good.errors, [])
  assert.equal(good.files.get('notes')?.get('A'), 'notes/A.md')
  assert.equal(validateCorpus(join(dir, 'bad')).errors.length, 1)

  put(
    'child/child.corpus-schema.md',
    '---\ncorpus-schema: 0\nlevel: 2\nextends:\n  base: ../good\nreferences:\n  good: ../good\n---\n',
  )
  put('child/tasks/tasks.schema.yaml', 'x-extends: base/notes\n')
  put('child/tasks/T.md', '---\nstatus: done\n---\nSee [A](../_references/good/notes/A.md).\n')
  assert.deepEqual(syncCorpus(join(dir, 'child')).errors, [])
  assert.deepEqual(validateCorpus(join(dir, 'child')).errors, [])

  // The bin, under node and, once installed, as npm links it in node_modules/.bin.
  const bin = join(
    dirname(fileURLToPath(import.meta.resolve('@osdlc/corpus-schema'))),
    '..',
    'bin',
    'corpus-schema.js',
  )
  const runs = [[process.execPath, [bin]]]
  const installed = join(process.cwd(), 'node_modules', '.bin', 'corpus-schema')
  if (existsSync(installed)) runs.push([installed, []])
  for (const [command, prefix] of runs) {
    const ok = spawnSync(command, [...prefix, 'validate', 'good'], { cwd: dir, encoding: 'utf8' })
    assert.equal(ok.status, 0, `${command} on a valid corpus: ${ok.stderr}`)
    assert.equal(ok.stdout, 'ok: good: 2 notes\n')
    const bad = spawnSync(command, [...prefix, 'validate', 'bad'], { cwd: dir, encoding: 'utf8' })
    assert.equal(bad.status, 1, `${command} on a broken corpus: ${bad.stderr}`)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('corpus-schema smoke: OK')
