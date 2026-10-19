/**
 * Need: read a file's bytes out of git (`git cat-file blob <sha>`), hash
 * them, and only then decide whether they are text. Images and other assets
 * are not UTF-8, and decoding first turns each invalid sequence into U+FFFD,
 * which changes the hash.
 *
 * `spawnBytesRunner` and `spawnBytesRunnerAsync` return stdout and stderr as
 * a `Buffer`, exactly as the child wrote them. `runChecked`,
 * `runCheckedAsync` and `CommandFailed` take their results and decode stderr
 * for the message. `fakeBytesRunner` is `fakeRunner` with Buffer answers.
 */

import { createHash } from 'node:crypto'

import { expect, test } from 'bun:test'

import {
  CommandFailed,
  runChecked,
  runCheckedAsync,
  spawnBytesRunner,
  spawnBytesRunnerAsync,
  type AsyncBytesCommandRunner,
  type BytesCommandRunner,
  type CommandOutput,
} from '@osdlc/command-seam'
import { fakeBytesRunner, type FakeBytesRunner } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

interface Asset {
  sha256: string
  /** The content as text, when it is strict UTF-8. */
  text: string | undefined
}

/** Strict UTF-8, or `undefined` for bytes that are not. */
function strictUtf8(bytes: Buffer): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

/** Hash a blob's bytes, then decode it if it is text. */
function readAsset(
  repo: string,
  sha: string,
  git: BytesCommandRunner = spawnBytesRunner('git'),
): Asset {
  const blob = runChecked(git, ['cat-file', 'blob', sha], { cwd: repo }).stdout
  return { sha256: createHash('sha256').update(blob).digest('hex'), text: strictUtf8(blob) }
}

/** Several blobs at once, without blocking. */
async function readAssets(
  repo: string,
  shas: string[],
  git: AsyncBytesCommandRunner = spawnBytesRunnerAsync('git'),
): Promise<Map<string, number>> {
  const sizes = await Promise.all(
    shas.map(async (sha) => {
      const r = await runCheckedAsync(git, ['cat-file', 'blob', sha], { cwd: repo })
      return [sha, r.stdout.length] as const
    }),
  )
  return new Map(sizes)
}

/** A one-line reason for a failed read. `message` is text for either runner. */
function whyNot(e: CommandFailed<CommandOutput>): string {
  return e.message.split('\n').at(-1) ?? ''
}

// ---- Scenarios -------------------------------------------------------------

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff])

/** A git whose blobs are `blobs`, by sha. */
function fakeGit(blobs: Record<string, Buffer>): FakeBytesRunner {
  return fakeBytesRunner((argv) => {
    const blob = argv[0] === 'cat-file' ? blobs[argv[2] ?? ''] : undefined
    return blob === undefined ? undefined : { stdout: blob }
  })
}

test('an image is hashed from its bytes and is not text', () => {
  const { runner } = fakeGit({ a1: PNG })

  const asset = readAsset('/repo', 'a1', runner)

  expect(asset.sha256).toBe(createHash('sha256').update(PNG).digest('hex'))
  expect(asset.text).toBeUndefined()
})

test('a text blob hashes the same and comes back decoded', () => {
  const svg = Buffer.from('<svg>é</svg>\n')
  const { runner } = fakeGit({ b2: svg })

  expect(readAsset('/repo', 'b2', runner)).toEqual({
    sha256: createHash('sha256').update(svg).digest('hex'),
    text: '<svg>é</svg>\n',
  })
})

test('a missing blob throws CommandFailed with git’s message decoded', () => {
  const { runner } = fakeBytesRunner({
    'cat-file blob zz': {
      exitCode: 128,
      stderr: Buffer.from('fatal: Not a valid object name zz\n'),
    },
  })

  let reason = ''
  try {
    readAsset('/repo', 'zz', runner)
  } catch (e) {
    if (!(e instanceof CommandFailed)) throw e
    reason = whyNot(e)
  }

  expect(reason).toBe('fatal: Not a valid object name zz')
})

test('the async runner reads several blobs at once', async () => {
  const { asyncRunner, calls } = fakeGit({ a1: PNG, b2: Buffer.from('hi') })

  const sizes = await readAssets('/repo', ['a1', 'b2'], asyncRunner)

  expect(sizes).toEqual(
    new Map([
      ['a1', PNG.length],
      ['b2', 2],
    ]),
  )
  expect(calls.map((c) => c.argv[2])).toEqual(['a1', 'b2'])
})
