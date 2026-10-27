// Tests for crates-io-index.ts. fetch is stubbed, so nothing reaches the network.
//
//   node --test scripts/crates-io-index.test.ts
import { strict as assert } from 'node:assert'
import { afterEach, test } from 'node:test'

import { type CargoPackage, indexEntries, indexPath, publishesToCratesIo } from './crates-io-index.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Answer every fetch with `body` and `status`, and record the URLs asked for. */
function stubFetch(status: number, body = ''): string[] {
  const urls: string[] = []
  globalThis.fetch = (async (url: string | URL) => {
    urls.push(String(url))
    return new Response(status === 404 || status >= 500 ? null : body, { status })
  }) as typeof fetch
  return urls
}

test('indexPath follows the sparse-index layout and lowercases', () => {
  assert.equal(indexPath('a'), '1/a')
  assert.equal(indexPath('ab'), '2/ab')
  assert.equal(indexPath('abc'), '3/a/abc')
  assert.equal(indexPath('Serde'), 'se/rd/serde')
  assert.equal(indexPath('slug-collate'), 'sl/ug/slug-collate')
})

test('indexEntries reads one entry per line, skipping blanks; yanked defaults to false', async () => {
  const urls = stubFetch(200, '{"vers":"0.1.0"}\n\n{"vers":"0.2.0","yanked":true}\n')
  assert.deepEqual(await indexEntries('Serde'), [
    { vers: '0.1.0', yanked: false },
    { vers: '0.2.0', yanked: true },
  ])
  assert.deepEqual(urls, ['https://index.crates.io/se/rd/serde'])
})

test('indexEntries is null for a crate not on crates.io, and throws on another error', async () => {
  stubFetch(404)
  assert.equal(await indexEntries('nope'), null)
  stubFetch(500)
  await assert.rejects(indexEntries('nope'), /crates.io index returned 500 for nope/)
})

test('publishesToCratesIo: unset or listing crates-io publishes, [] and other registries do not', () => {
  const pkg = (publish: string[] | null): CargoPackage => ({
    id: 'x',
    name: 'x',
    version: '0.1.0',
    manifest_path: 'Cargo.toml',
    publish,
  })
  assert.equal(publishesToCratesIo(pkg(null)), true)
  assert.equal(publishesToCratesIo(pkg(['crates-io'])), true)
  assert.equal(publishesToCratesIo(pkg([])), false)
  assert.equal(publishesToCratesIo(pkg(['other'])), false)
})
