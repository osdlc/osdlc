import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  atomicWrite,
  atomicWriteAsync,
  etag,
  etagOfFile,
  writeCas,
  WriteConflictError,
  writeIfChanged,
} from '../src/index.ts'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'etag-write-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const conflictReason = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    if (e instanceof WriteConflictError) return e.reason
    throw e
  }
  throw new Error('expected a WriteConflictError')
}

describe('etag', () => {
  test('is lowercase hex sha256, the same for a string and its UTF-8 bytes', () => {
    const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    expect(etag('abc')).toBe(abc)
    expect(etag(new TextEncoder().encode('abc'))).toBe(abc)
  })

  test('a Uint8Array view hashes only its own bytes', () => {
    const view = new TextEncoder().encode('xxabcxx').subarray(2, 5)
    expect(etag(view)).toBe(etag('abc'))
  })

  test('etagOfFile reads the file, and is null when it is absent', () => {
    const p = join(root, 'x.md')
    expect(etagOfFile(p)).toBeNull()
    writeFileSync(p, 'abc')
    expect(etagOfFile(p)).toBe(etag('abc'))
  })
})

describe.each([
  [
    'atomicWrite',
    (p: string, d: string | Uint8Array, mode?: number) => atomicWrite(p, d, { mode }),
  ],
  [
    'atomicWriteAsync',
    (p: string, d: string | Uint8Array, mode?: number) => atomicWriteAsync(p, d, { mode }),
  ],
] as const)('%s', (_name, write) => {
  test('creates parents, replaces the content and leaves no temp file', async () => {
    const p = join(root, 'a', 'b', 'f.json')
    await write(p, 'one')
    await write(p, new TextEncoder().encode('two'))
    expect(readFileSync(p, 'utf8')).toBe('two')
    expect(readdirSync(join(root, 'a', 'b'))).toEqual(['f.json'])
  })

  test('a Uint8Array view writes only its own bytes', async () => {
    const p = join(root, 'view.txt')
    await write(p, new TextEncoder().encode('xxabcxx').subarray(2, 5))
    expect(readFileSync(p, 'utf8')).toBe('abc')
  })

  test('a failed rename removes the temp file and keeps the target', async () => {
    const dir = join(root, 'occupied')
    mkdirSync(dir)
    writeFileSync(join(dir, 'child'), 'in the way')
    await expect((async () => write(dir, 'y'))()).rejects.toThrow()
    expect(readdirSync(root)).toEqual(['occupied'])
    expect(readFileSync(join(dir, 'child'), 'utf8')).toBe('in the way')
  })

  test.skipIf(process.getuid?.() === 0)(
    'a write that fails over an existing file leaves its old content',
    async () => {
      const dir = join(root, 'locked')
      const p = join(dir, 'state.json')
      mkdirSync(dir)
      writeFileSync(p, 'old')
      chmodSync(dir, 0o555)
      try {
        await expect((async () => write(p, 'new'))()).rejects.toThrow()
      } finally {
        chmodSync(dir, 0o755)
      }
      expect(readFileSync(p, 'utf8')).toBe('old')
      expect(readdirSync(dir)).toEqual(['state.json'])
    },
  )

  test('mode is exact, whatever the umask, and replaces a looser one', async () => {
    const p = join(root, 'secret.json')
    writeFileSync(p, 'old', { mode: 0o644 })
    await write(p, 'new', 0o600)
    expect(statSync(p).mode & 0o777).toBe(0o600)
  })

  test.skipIf(process.platform === 'win32')(
    'an overwrite without mode keeps the old permission bits',
    async () => {
      const p = join(root, 'secret.json')
      writeFileSync(p, 'old')
      chmodSync(p, 0o600)
      await write(p, 'new')
      expect(statSync(p).mode & 0o777).toBe(0o600)
      expect(readFileSync(p, 'utf8')).toBe('new')
    },
  )

  test.skipIf(process.platform === 'win32')(
    'an overwrite drops setuid, setgid and sticky',
    async () => {
      const p = join(root, 'tool')
      writeFileSync(p, 'old')
      chmodSync(p, 0o4755)
      await write(p, 'new')
      expect(statSync(p).mode & 0o7777).toBe(0o755)
    },
  )

  test.skipIf(process.platform === 'win32')(
    'a new file gets the mode writeFileSync would give it',
    async () => {
      const p = join(root, 'new.txt')
      const q = join(root, 'plain.txt')
      await write(p, 'x')
      writeFileSync(q, 'x')
      expect(statSync(p).mode & 0o777).toBe(statSync(q).mode & 0o777)
    },
  )

  test.skipIf(process.platform === 'win32')(
    'a target that is not a regular file gives the temp file a new file mode',
    async () => {
      // A looping link cannot be read with stat, so its write takes a new
      // file's mode instead of failing.
      const loop = join(root, 'loop')
      symlinkSync(loop, loop)
      const plain = join(root, 'plain.txt')
      writeFileSync(plain, 'x')
      // A directory target fails at the rename whatever the mode, so this
      // part guards only the cleanup: the directory is left as it was and no
      // temp file stays behind.
      const dir = join(root, 'dir')
      mkdirSync(dir)
      const before = readdirSync(root).sort()
      await expect((async () => write(dir, 'y'))()).rejects.toThrow()
      expect(statSync(dir).isDirectory()).toBe(true)
      expect(readdirSync(dir)).toEqual([])
      expect(readdirSync(root).sort()).toEqual(before)
      await write(loop, 'new')
      expect(lstatSync(loop).isSymbolicLink()).toBe(false)
      expect(statSync(loop).mode & 0o777).toBe(statSync(plain).mode & 0o777)
    },
  )

  test.skipIf(process.platform === 'win32')(
    'a symlink is replaced, not written through, and takes its target mode',
    async () => {
      const target = join(root, 'target.txt')
      const link = join(root, 'link.txt')
      writeFileSync(target, 'target')
      chmodSync(target, 0o640)
      symlinkSync(target, link)
      await write(link, 'new')
      expect(lstatSync(link).isSymbolicLink()).toBe(false)
      expect(statSync(link).mode & 0o777).toBe(0o640)
      expect(readFileSync(target, 'utf8')).toBe('target')
    },
  )
})

test('concurrent writers to one path never leave a torn file', async () => {
  const p = join(root, 'shared.txt')
  const payloads = Array.from({ length: 8 }, (_, i) =>
    String.fromCharCode(97 + i).repeat(256 * 1024),
  )
  atomicWrite(p, payloads[0]!)

  let reading = true
  const seen: string[] = []
  const reader = (async () => {
    while (reading) {
      seen.push(readFileSync(p, 'utf8'))
      await new Promise((r) => setTimeout(r, 0))
    }
  })()
  await Promise.all(
    Array.from({ length: 5 }, () =>
      Promise.all(payloads.map((data) => atomicWriteAsync(p, data))),
    ).flat(),
  )
  for (let i = 0; i < 20; i++) payloads.forEach((data) => atomicWrite(p, data))
  reading = false
  await reader

  expect(seen.length).toBeGreaterThan(0)
  for (const content of [...seen, readFileSync(p, 'utf8')]) expect(payloads).toContain(content)
  expect(readdirSync(root)).toEqual(['shared.txt'])
})

describe('writeCas follows the contract table', () => {
  test('exists, etag matches: writes and returns the new etag', () => {
    const p = join(root, 'x.md')
    atomicWrite(p, 'v1')
    expect(writeCas(p, 'v2', etag('v1'))).toBe(etag('v2'))
    expect(readFileSync(p, 'utf8')).toBe('v2')
  })

  test('exists, etag differs: changed, and the file is untouched', () => {
    const p = join(root, 'x.md')
    atomicWrite(p, 'v2-from-someone-else')
    expect(conflictReason(() => writeCas(p, 'v2-from-us', etag('v1')))).toBe('changed')
    expect(readFileSync(p, 'utf8')).toBe('v2-from-someone-else')
  })

  test('exists, no etag: refuses the blind overwrite', () => {
    const p = join(root, 'x.md')
    atomicWrite(p, 'original')
    expect(conflictReason(() => writeCas(p, 'clobber', null))).toBe('exists-without-etag')
    expect(readFileSync(p, 'utf8')).toBe('original')
  })

  test('absent, no etag: creates', () => {
    const p = join(root, 'new.md')
    expect(writeCas(p, 'body', null)).toBe(etag('body'))
    expect(readFileSync(p, 'utf8')).toBe('body')
  })

  test('absent, some etag: creates, since the file was deleted since it was read', () => {
    const p = join(root, 'gone.md')
    expect(writeCas(p, 'body', 'stale-etag-for-a-file-that-is-gone')).toBe(etag('body'))
    expect(readFileSync(p, 'utf8')).toBe('body')
  })

  test.skipIf(process.getuid?.() === 0)(
    'an existing file it cannot read is not absent: the read error is thrown',
    () => {
      const p = join(root, 'unreadable.md')
      writeFileSync(p, 'original')
      chmodSync(p, 0o000)
      try {
        expect(() => writeCas(p, 'clobber', null)).toThrow(
          expect.objectContaining({ code: 'EACCES' }),
        )
        expect(() => etagOfFile(p)).toThrow(expect.objectContaining({ code: 'EACCES' }))
      } finally {
        chmodSync(p, 0o644)
      }
      expect(readFileSync(p, 'utf8')).toBe('original')
    },
  )

  test("the error message matches the crate's wording", () => {
    const p = join(root, 'x.md')
    atomicWrite(p, 'a')
    expect(() => writeCas(p, 'b', null)).toThrow(`${p} exists — send its etag to overwrite`)
    expect(() => writeCas(p, 'b', etag('z'))).toThrow(`${p} changed on disk since it was read`)
  })
})

test('writeIfChanged skips identical content and leaves mtime alone', () => {
  const p = join(root, 'x.md')
  expect(writeIfChanged(p, 'same')).toBe(true)
  // Whole seconds: a millisecond time can come back from stat as a float a
  // hair off (…829.999 for …830), since Node converts through seconds.
  const past = new Date(Math.floor((Date.now() - 60_000) / 1000) * 1000)
  utimesSync(p, past, past)
  expect(writeIfChanged(p, 'same')).toBe(false)
  expect(statSync(p).mtimeMs).toBe(past.getTime())
  expect(writeIfChanged(p, 'different')).toBe(true)
  expect(readFileSync(p, 'utf8')).toBe('different')
})

test('writeIfChanged compares only the bytes of a Uint8Array view', () => {
  const p = join(root, 'x.md')
  writeIfChanged(p, 'abc')
  expect(writeIfChanged(p, new TextEncoder().encode('xxabcxx').subarray(2, 5))).toBe(false)
})

test.skipIf(process.getuid?.() === 0)(
  'writeIfChanged refuses to overwrite a file it cannot read',
  () => {
    const p = join(root, 'unreadable.md')
    writeFileSync(p, 'original')
    chmodSync(p, 0o000)
    try {
      expect(() => writeIfChanged(p, 'clobber')).toThrow(
        expect.objectContaining({ code: 'EACCES' }),
      )
    } finally {
      chmodSync(p, 0o644)
    }
    expect(readFileSync(p, 'utf8')).toBe('original')
  },
)

test.skipIf(process.platform === 'win32')(
  'writeIfChanged leaves an unchanged file its permissions, even given a mode',
  () => {
    const p = join(root, 'x.md')
    writeFileSync(p, 'same', { mode: 0o644 })
    chmodSync(p, 0o644)
    expect(writeIfChanged(p, 'same', { mode: 0o600 })).toBe(false)
    expect(statSync(p).mode & 0o777).toBe(0o644)
  },
)

test.skipIf(process.platform === 'win32')('writeCas passes its mode to the write', () => {
  const p = join(root, 'x.md')
  writeFileSync(p, 'v1')
  chmodSync(p, 0o644)
  writeCas(p, 'v2', etag('v1'), { mode: 0o600 })
  expect(statSync(p).mode & 0o777).toBe(0o600)
})
