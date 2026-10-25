/**
 * `../src/paths.ts`. The Windows rules are pure and take `platform`, so they
 * run on every platform. The fs-backed cases use the real platform.
 */

import { afterEach, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  expandTilde,
  expandTrustPath,
  normalizeTrustPath,
  pathGlobToRegExp,
  resolveTrustRoot,
} from '../src/index.ts'

const dirs: string[] = []
function tmp(): string {
  // `.native` gives the long form of a Windows 8.3 name, as the store's resolve does.
  const d = realpathSync.native(mkdtempSync(join(tmpdir(), 'trust-repo-paths-')))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A resolver that changes nothing: the Windows cases need no filesystem. */
const asIs = (p: string): string => p

describe('normalizeTrustPath', () => {
  test('on Windows: forward slashes and a lower-case drive letter', () => {
    expect(normalizeTrustPath('C:\\Users\\Me\\Work', 'win32')).toBe('c:/Users/Me/Work')
    expect(normalizeTrustPath('c:/Users/Me/Work', 'win32')).toBe('c:/Users/Me/Work')
    expect(normalizeTrustPath('\\\\server\\share\\x', 'win32')).toBe('//server/share/x')
  })

  test('elsewhere the path is unchanged, backslashes included', () => {
    expect(normalizeTrustPath('/home/Me/a\\b', 'linux')).toBe('/home/Me/a\\b')
    expect(normalizeTrustPath('C:\\x', 'darwin')).toBe('C:\\x')
  })
})

describe('expandTilde', () => {
  test('~ and ~/ expand everywhere; ~\\ only on Windows', () => {
    expect(expandTilde('~', '/home/me', 'linux')).toBe('/home/me')
    expect(expandTilde('~/w', '/home/me', 'linux')).toBe('/home/me/w')
    expect(expandTilde('~\\w', '/home/me', 'linux')).toBe('~\\w')
    expect(expandTilde('~\\w', 'C:\\Users\\me', 'win32')).toBe('C:\\Users\\me\\w')
    expect(expandTilde('~/w', 'C:\\Users\\me', 'win32')).toBe('C:\\Users\\me\\w')
    expect(expandTilde('~other/w', '/home/me', 'linux')).toBe('~other/w')
  })
})

describe('expandTrustPath on Windows', () => {
  const win = { platform: 'win32' as const, resolveRoot: asIs }

  test('~\\ expands and the result is in key form', async () => {
    expect(await expandTrustPath('~\\work\\**', 'C:\\Users\\me', win)).toBe('c:/Users/me/work/**')
    expect(await expandTrustPath('~/work/*', 'C:\\Users\\me', win)).toBe('c:/Users/me/work/*')
  })

  test('a drive-letter pattern matches a root of either drive case and separator', async () => {
    const pattern = await expandTrustPath('D:\\src\\**', 'C:\\Users\\me', win)
    expect(pattern).toBe('d:/src/**')
    const re = pathGlobToRegExp(pattern)
    expect(re.test(normalizeTrustPath('D:\\src\\app', 'win32'))).toBe(true)
    expect(re.test(normalizeTrustPath('d:/src/app', 'win32'))).toBe(true)
    expect(re.test(normalizeTrustPath('C:\\src\\app', 'win32'))).toBe(false)
  })

  test('a glob right after the drive keeps the drive root', async () => {
    expect(await expandTrustPath('C:\\*', 'C:\\Users\\me', win)).toBe('c:/*')
  })

  test('the static prefix goes through the resolver; the glob tail does not', async () => {
    const seen: string[] = []
    const resolveRoot = (p: string): string => {
      seen.push(p)
      return p.replace('c:/Short~1', 'C:\\LongName')
    }
    expect(
      await expandTrustPath('C:\\Short~1\\x\\**', 'C:\\Users\\me', {
        platform: 'win32',
        resolveRoot,
      }),
    ).toBe('c:/LongName/x/**')
    expect(seen).toEqual(['c:/Short~1/x'])
  })
})

describe('expandTrustPath on this platform', () => {
  test('expands a leading ~ against home before resolving', async () => {
    const home = tmp()
    mkdirSync(join(home, 'work'))
    expect(await expandTrustPath('~/work/**', home)).toBe(
      `${await resolveTrustRoot(join(home, 'work'))}/**`,
    )
  })

  test('a pattern with no glob character is resolved outright', async () => {
    const target = tmp()
    expect(await expandTrustPath(target, tmp())).toBe(await resolveTrustRoot(target))
  })

  test('resolves symlinks in the static prefix only', async () => {
    const base = tmp()
    mkdirSync(join(base, 'real'))
    symlinkSync(join(base, 'real'), join(base, 'link'))
    expect(await expandTrustPath(`${base}/link/sub/**`, base)).toBe(
      `${normalizeTrustPath(base)}/real/sub/**`,
    )
  })

  test('a glob at the filesystem root keeps a single slash', async () => {
    if (process.platform === 'win32') return
    expect(await expandTrustPath('/*', '/home/me')).toBe('/*')
  })
})
