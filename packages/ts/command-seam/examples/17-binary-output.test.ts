/**
 * Need: read image blobs out of git, hash their exact bytes, and keep the
 * text of the ones that are valid UTF-8.
 *
 * The capture runners decode stdout as UTF-8, and decoding replaces bytes
 * that are not UTF-8 with U+FFFD, which changes the hash.
 * `spawnRunnerBytes` and `spawnRunnerBytesAsync` return stdout as a
 * `Buffer` instead (`CommandResult<Buffer>`), and stderr as text, so
 * `runChecked` and `CommandFailed` read as they do for text. Code takes a
 * `BytesCommandRunner` (or `AsyncBytesCommandRunner`), and tests pass
 * `fakeRunner`'s `bytesRunner` (or `asyncBytesRunner`).
 */

import { createHash } from 'node:crypto'
import { isUtf8 } from 'node:buffer'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import {
  mapFailed,
  runChecked,
  runCheckedAsync,
  spawnRunner,
  spawnRunnerBytes,
  spawnRunnerBytesAsync,
  type AsyncBytesCommandRunner,
  type BytesCommandRunner,
} from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

class AssetError extends Error {}

interface Asset {
  sha256: string
  /** The blob as text, when it is valid UTF-8. */
  text?: string
}

/** Hash the bytes first: a decoded string would hash differently. */
function toAsset(bytes: Buffer): Asset {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return isUtf8(bytes) ? { sha256, text: bytes.toString() } : { sha256 }
}

/** Read blob `sha` from `repo`. */
function readAsset(
  repo: string,
  sha: string,
  git: BytesCommandRunner = spawnRunnerBytes('git'),
): Asset {
  return mapFailed(
    () => toAsset(runChecked(git, ['cat-file', 'blob', sha], { cwd: repo }).stdout),
    (e) => new AssetError(`cannot read blob ${sha}: ${e.detail}`),
  )
}

/** Read many blobs at once. */
async function readAssets(
  repo: string,
  shas: string[],
  git: AsyncBytesCommandRunner = spawnRunnerBytesAsync('git'),
): Promise<Asset[]> {
  return Promise.all(
    shas.map(async (sha) => {
      const r = await runCheckedAsync(git, ['cat-file', 'blob', sha], { cwd: repo })
      return toAsset(r.stdout)
    }),
  )
}

// ---- Tests -----------------------------------------------------------------

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00])
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

test('a binary blob is hashed as bytes and has no text; a text blob keeps its text', () => {
  const { bytesRunner, calls } = fakeRunner({
    'cat-file blob a1': { stdout: PNG },
    'cat-file blob b2': { stdout: '# Notes\n' },
  })

  expect(readAsset('/repo', 'a1', bytesRunner)).toEqual({ sha256: sha256(PNG) })
  expect(readAsset('/repo', 'b2', bytesRunner)).toEqual({
    sha256: sha256(Buffer.from('# Notes\n')),
    text: '# Notes\n',
  })
  expect(calls.map((c) => c.opts.cwd)).toEqual(['/repo', '/repo'])
})

test('a missing blob fails with git’s own message', () => {
  const { bytesRunner } = fakeRunner({
    'cat-file blob dead': { exitCode: 128, stderr: 'fatal: Not a valid object name dead\n' },
  })

  expect(() => readAsset('/repo', 'dead', bytesRunner)).toThrow(
    new AssetError('cannot read blob dead: fatal: Not a valid object name dead'),
  )
})

test('blobs read in parallel through the async fake', async () => {
  const { asyncBytesRunner } = fakeRunner((argv) => ({ stdout: Buffer.from(argv[2]!) }))

  const assets = await readAssets('/repo', ['x', 'y'], asyncBytesRunner)

  expect(assets.map((a) => a.text)).toEqual(['x', 'y'])
})

// ---- The real runners ------------------------------------------------------

const repo = mkdtempSync(join(tmpdir(), 'examples-blobs-'))
afterAll(() => rmSync(repo, { recursive: true, force: true }))

test('real git: the hash matches the file’s bytes, sync and async', async () => {
  const git = spawnRunner('git')
  runChecked(git, ['init', '-q'], { cwd: repo })
  writeFileSync(join(repo, 'logo.png'), PNG)
  const sha = runChecked(git, ['hash-object', '-w', 'logo.png'], { cwd: repo }).stdout.trim()

  expect(readAsset(repo, sha)).toEqual({ sha256: sha256(PNG) })
  expect(await readAssets(repo, [sha])).toEqual([{ sha256: sha256(PNG) }])
  expect(() => readAsset(repo, '0000000')).toThrow(AssetError)
}, 15_000)
