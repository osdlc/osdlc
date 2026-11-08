// Runs the built package under Node. The unit tests resolve the package name to
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
  validateCorpus,
} from '@osdlc/markdown-db'

assert.equal(idProblem('a|b'), 'holds "|"')
assert.equal(fold('Kiro'), fold('KIRO'))
assert.equal(encodePath('a b.md'), 'a%20b.md')
assert.equal(markdownLink('A', 'a b.md'), '[A](a%20b.md)')

const dir = mkdtempSync(join(tmpdir(), 'markdown-db-smoke-'))
const put = (rel, text) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
try {
  put('good/markdown-db.md', '---\nmarkdown-db: 0\n---\n')
  put('good/notes/notes.schema.yaml', 'type: object\nrequired: [status]\n')
  put('good/notes/A.md', '---\nstatus: done\n---\nSee [B](B.md).\n')
  put('good/notes/B.md', '---\nstatus: open\n---\n')
  put('bad/markdown-db.md', '---\nmarkdown-db: 0\n---\nSee [gone](gone.md).\n')

  assert.deepEqual(findCorpora(dir).sort(), [join(dir, 'bad'), join(dir, 'good')])
  const good = validateCorpus(join(dir, 'good'))
  assert.deepEqual(good.errors, [])
  assert.equal(good.files.get('notes')?.get('A'), 'notes/A.md')
  assert.equal(validateCorpus(join(dir, 'bad')).errors.length, 1)

  // The bin, under node and, once installed, as npm links it in node_modules/.bin.
  const bin = join(
    dirname(fileURLToPath(import.meta.resolve('@osdlc/markdown-db'))),
    '..',
    'bin',
    'markdown-db.js',
  )
  const runs = [[process.execPath, [bin]]]
  const installed = join(process.cwd(), 'node_modules', '.bin', 'markdown-db')
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

console.log('markdown-db smoke: OK')
