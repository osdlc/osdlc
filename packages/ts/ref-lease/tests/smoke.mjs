// Runs the built package under Node. The unit tests run the TypeScript source
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
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildLeaseCommit,
  canonicalJson,
  casCreate,
  casDelete,
  casReplace,
  CasFailed,
  checkNamespaceConflict,
  fetchNamespace,
  fetchRef,
  RefLeaseError,
  RefNotFound,
} from '@osdlc/ref-lease'

assert.equal(canonicalJson({ b: 1, a: [true, null] }), '{"a":[true,null],"b":1}')

const root = mkdtempSync(join(tmpdir(), 'ref-lease-smoke-'))
// Only to set up the fixture; the package itself runs git through typed-git.
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
try {
  const authority = join(root, 'authority.git')
  const worker = join(root, 'worker')
  git(root, 'init', '-q', '--bare', authority)
  git(root, 'init', '-q', worker)

  const ref = 'refs/locks/smoke'
  checkNamespaceConflict(authority, 'refs/locks', { cwd: worker })
  const first = buildLeaseCommit({ holder: 'a' }, { cwd: worker })
  casCreate(authority, ref, first, { cwd: worker })
  assert.throws(() => casCreate(authority, ref, first, { cwd: worker }), CasFailed)

  const second = buildLeaseCommit({ holder: 'b' }, { cwd: worker, parentSha: first })
  casReplace(authority, ref, first, second, { cwd: worker })
  assert.deepEqual(fetchRef(authority, ref, { cwd: worker }), {
    sha: second,
    payload: { holder: 'b' },
  })
  assert.deepEqual(fetchNamespace(authority, 'refs/locks', { cwd: worker }), { [ref]: second })

  casDelete(authority, ref, second, { cwd: worker })
  assert.throws(() => fetchRef(authority, ref, { cwd: worker }), RefNotFound)
  assert.ok(new RefNotFound({ ref }) instanceof RefLeaseError)
} finally {
  rmSync(root, { recursive: true, force: true })
}
