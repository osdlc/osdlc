import { describe, expect, test } from 'vitest'

import { linkTargetToCore, toCorePath, toHostPath, UNSUPPORTED_PATH } from '../src/host-path.ts'

/** The `code` a refused conversion throws with. */
function refusal(run: () => unknown): string | undefined {
  try {
    run()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

describe('toCorePath on Windows', () => {
  test.each([
    ['C:\\Users\\me\\vault', '/C:/Users/me/vault'],
    ['c:\\Users\\me\\vault', '/C:/Users/me/vault'],
    ['C:\\', '/C:/'],
    ['C:/Users/me/vault', '/C:/Users/me/vault'],
    ['C:\\Users\\me\\vault/notes/x.md', '/C:/Users/me/vault/notes/x.md'],
    ['\\\\server\\share\\dir', '/UNC/server/share/dir'],
    ['\\\\?\\C:\\long\\path', '/C:/long/path'],
    ['\\\\?\\UNC\\server\\share\\x', '/UNC/server/share/x'],
    ['\\\\?\\unc\\server\\share\\x', '/UNC/server/share/x'],
    ['\\\\.\\UNC\\server\\share\\x', '/UNC/server/share/x'],
    ['\\\\server\\share', '/UNC/server/share'],
  ])('%s', (host, core) => {
    expect(toCorePath(host, 'win32')).toBe(core)
  })

  test('a path already in the core form is unchanged', () => {
    for (const core of ['/C:/Users/me', '/C:/', '/UNC/server/share/x', '/UNC/server/share']) {
      expect(toCorePath(core, 'win32')).toBe(core)
    }
  })

  test('a path relative to the current directory is refused', () => {
    expect(() => toCorePath('C:notes', 'win32')).toThrow(/current directory/)
    expect(() => toCorePath('C:', 'win32')).toThrow(/current directory/)
    expect(() => toCorePath('\\notes', 'win32')).toThrow(/current directory/)
    expect(() => toCorePath('notes\\x.md', 'win32')).toThrow(/current directory/)
    // Root-relative, not UNC: Windows reads it as `<current drive>:\UNC\…`.
    expect(() => toCorePath('\\UNC\\srv\\share\\x', 'win32')).toThrow(/current directory/)
    expect(() => toCorePath('\\C:\\x', 'win32')).toThrow(/current directory/)
  })

  test('a name above a drive or share is refused, so it cannot be a root', () => {
    for (const p of ['\\\\server', '\\\\server\\', '\\\\', '/', '/UNC', '/UNC/server', '\\']) {
      expect(refusal(() => toCorePath(p, 'win32'))).toBe(UNSUPPORTED_PATH)
    }
  })

  test('`.` or `..` as a server or share name is refused', () => {
    for (const p of [
      '\\\\server\\..\\share',
      '\\\\..\\unc',
      '\\\\server\\.\\share',
      '\\\\server\\..',
      '/UNC/server/../share',
      '/UNC/../server/share',
    ]) {
      expect(refusal(() => toCorePath(p, 'win32'))).toBe(UNSUPPORTED_PATH)
    }
  })

  test('a device or volume path that is not a drive or share is refused', () => {
    for (const p of [
      '\\\\?\\Volume{0b6a5c1e-1234-4b2c-9a8e-0123456789ab}\\x',
      '\\\\.\\pipe\\x',
      '\\\\.\\server\\share',
      '\\\\?\\GLOBALROOT\\Device\\x',
      '\\\\?\\',
      '\\\\?\\C:',
    ]) {
      expect(refusal(() => toCorePath(p, 'win32'))).toBe(UNSUPPORTED_PATH)
    }
  })

  test('`..` stops at the drive or share root, as on Windows', () => {
    expect(toCorePath('C:\\a\\..\\..\\x', 'win32')).toBe('/C:/x')
    expect(toCorePath('C:\\a\\.\\b\\..\\c', 'win32')).toBe('/C:/a/c')
    expect(toCorePath('\\\\server\\share\\..\\share2\\out', 'win32')).toBe(
      '/UNC/server/share/share2/out',
    )
    expect(toCorePath('\\\\server\\share\\..\\..\\other\\x', 'win32')).toBe(
      '/UNC/server/share/other/x',
    )
    expect(toCorePath('/C:/../x', 'win32')).toBe('/C:/x')
  })

  test('another platform is untouched', () => {
    expect(toCorePath('C:\\x', 'darwin')).toBe('C:\\x')
    expect(toHostPath('/C:/x', 'linux')).toBe('/C:/x')
  })
})

describe('toHostPath on Windows', () => {
  test.each([
    ['/C:/Users/me/vault', 'C:\\Users\\me\\vault'],
    ['/C:/', 'C:\\'],
    ['/C:', 'C:\\'],
    ['/UNC/server/share', '\\\\server\\share\\'],
    ['/UNC/server/share/dir/x.md', '\\\\server\\share\\dir\\x.md'],
    ['notes/x.md', 'notes\\x.md'],
  ])('%s', (core, host) => {
    expect(toHostPath(core, 'win32')).toBe(host)
  })

  test('the names above a drive or share are not directories', () => {
    expect(toHostPath('/', 'win32')).toBeNull()
    expect(toHostPath('/UNC', 'win32')).toBeNull()
    expect(toHostPath('/UNC/server', 'win32')).toBeNull()
  })

  test('any other absolute path is refused', () => {
    expect(() => toHostPath('/etc/passwd', 'win32')).toThrow(/not a Windows path/)
  })

  test('the two directions round-trip', () => {
    for (const host of ['C:\\a\\b', '\\\\server\\share\\a']) {
      expect(toHostPath(toCorePath(host, 'win32'), 'win32')).toBe(host)
    }
  })
})

describe('linkTargetToCore on Windows', () => {
  test('a relative target stays relative', () => {
    expect(linkTargetToCore('..\\other', '/C:/a/link', 'win32')).toBe('../other')
  })

  test('an absolute target converts', () => {
    expect(linkTargetToCore('D:\\target', '/C:/a/link', 'win32')).toBe('/D:/target')
    expect(linkTargetToCore('\\\\nas\\team\\x', '/C:/a/link', 'win32')).toBe('/UNC/nas/team/x')
  })

  test("a root-relative target takes the link's drive", () => {
    expect(linkTargetToCore('\\target', '/D:/a/link', 'win32')).toBe('/D:/target')
    expect(() => linkTargetToCore('\\target', '/UNC/s/x/link', 'win32')).toThrow()
  })
})
