// Runs the built package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { corpusSite, defineCorpusSite, filterRecords, parseState } =
  await import('@osdlc/corpus-site')
const client = await import('@osdlc/corpus-site/client')
const components = await import('@osdlc/corpus-site/components')

assert.equal(corpusSite({ root: './corpus' }).name, '@osdlc/corpus-site')
assert.deepEqual(defineCorpusSite({ title: 'x' }), { title: 'x' })
assert.equal(typeof filterRecords, 'function')
assert.equal(parseState('page=3', []).page, 3)
assert.equal(typeof client.useTypeData, 'function')
assert.ok(components.TypeExplorer)

// The Astro components and the stylesheet ship beside the compiled code.
const dist = fileURLToPath(new URL('.', import.meta.resolve('@osdlc/corpus-site')))
for (const file of ['astro/Layout.astro', 'astro/pages/record.astro', 'corpus-site.css'])
  assert.ok(existsSync(`${dist}${file}`), `${file} is in dist/`)

console.log('corpus-site smoke: OK')
