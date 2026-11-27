// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit, such as an unrewritten `.ts` import,
// passes every other check and fails on the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. `package-checks ts` copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createLinkResolver,
  createVaultIndex,
  extractInlineTags,
  extractLinks,
  parseFrontmatter,
  scanVault,
} from '@osdlc/markdown-vault'

assert.deepEqual(parseFrontmatter('---\ntitle: T\n---\nbody'), { title: 'T' })
assert.deepEqual(extractInlineTags('a #tag', { tagDialect: 'ascii' }), ['tag'])
assert.equal(extractLinks('[[A|x]] ![[b.png]]').embeds[0]?.target, 'b.png')

const index = createVaultIndex([{ path: 'A.md', links: ['B'] }, { path: 'dir/B.md' }], {
  resolveLinks: true,
})
assert.equal(index.byPath.get('A.md')?.links[0]?.path, 'dir/B.md')
assert.equal(createLinkResolver(index)('b')?.file.path, 'dir/B.md')

// The scanner loads node:fs on first use, so run it against a real folder.
const root = await mkdtemp(join(tmpdir(), 'markdown-vault-smoke-'))
try {
  await mkdir(join(root, 'dir'))
  await writeFile(join(root, 'A.md'), 'see [[B]] #idea\n')
  await writeFile(join(root, 'dir', 'B.md'), 'body\n')
  const vault = await scanVault(root)
  assert.deepEqual(
    vault.notes.map((note) => note.file.path),
    ['A.md', 'dir/B.md'],
  )
  assert.deepEqual(vault.byPath.get('dir/B.md')?.backlinks, ['A.md'])
  assert.deepEqual(vault.byPath.get('A.md')?.tags, ['idea'])
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('markdown-vault smoke: OK')
