/**
 * The scheme check that stands in for a sanitizer on `data-*` attributes.
 * `data-path` and `data-embed-path` carry URLs the host acts on, and no
 * sanitize schema polices a `data-*` value — so this is the only check there
 * is on that route.
 */

import { describe, expect, test } from 'vitest'
import { isSafeAssetUrl, isSafeLinkPath, urlScheme } from '../src/index.ts'

const LF = String.fromCharCode(10)
const TAB = String.fromCharCode(9)
const NUL = String.fromCharCode(0)
const BS = String.fromCharCode(92)

describe('urlScheme', () => {
  test('reads the scheme of an absolute URL', () => {
    expect(urlScheme('https://example.com')).toBe('https')
    expect(urlScheme('MAILTO:a@b.c')).toBe('mailto')
  })

  test('a colon after the first /, ? or # is not a scheme', () => {
    expect(urlScheme('/apps/notes/a:b.md')).toBeUndefined()
    expect(urlScheme('?q=a:b')).toBeUndefined()
    expect(urlScheme('#a:b')).toBeUndefined()
  })

  test('a relative path has no scheme', () => {
    expect(urlScheme('Projects/Alpha.md')).toBeUndefined()
    expect(urlScheme('')).toBeUndefined()
  })

  test('control characters a browser strips are stripped first', () => {
    expect(urlScheme(`java${LF}script:alert(1)`)).toBe('javascript')
    expect(urlScheme(`java${TAB}script:alert(1)`)).toBe('javascript')
    expect(urlScheme(`  javascript:alert(1)`)).toBe('javascript')
  })
})

describe('isSafeLinkPath', () => {
  test('accepts the three link schemes and same-origin paths', () => {
    for (const value of [
      'https://example.com/a',
      'http://example.com/a',
      'mailto:someone@example.com',
      '/apps/notes/Projects/Alpha.md',
      'Projects/Alpha.md',
      './sibling.md',
      '#heading',
      '?q=1',
    ]) {
      expect(isSafeLinkPath(value)).toBe(true)
    }
  })

  test('refuses every other scheme, however it is spelled', () => {
    for (const value of [
      'javascript:alert(1)',
      'javascript://%0aalert(1)',
      'JaVaScRiPt:alert(1)',
      `java${LF}script:alert(1)`,
      `${TAB}javascript:alert(1)`,
      ' javascript:alert(1)',
      `${NUL}javascript:alert(1)`,
      'data:text/html,evil',
      'vbscript:msgbox',
      'file:///etc/passwd',
      'blob:https://example.com/x',
    ]) {
      expect(isSafeLinkPath(value)).toBe(false)
    }
  })

  test('refuses a protocol-relative URL — a scheme-less off-site jump', () => {
    expect(isSafeLinkPath('//evil.example/x')).toBe(false)
  })

  test('refuses the backslash spellings of a protocol-relative URL', () => {
    // With a special base scheme the WHATWG parser treats a leading backslash
    // as a slash, so all three resolve off-site exactly as `//host` does.
    for (const value of [
      '/' + BS + 'evil.example/x',
      BS + BS + 'evil.example/x',
      BS + '/evil.example/x',
    ]) {
      expect(isSafeLinkPath(value)).toBe(false)
    }
    expect(isSafeAssetUrl('/' + BS + 'evil.example/a.png')).toBe(false)
  })

  test('refuses non-strings and empties', () => {
    expect(isSafeLinkPath(undefined)).toBe(false)
    expect(isSafeLinkPath(null)).toBe(false)
    expect(isSafeLinkPath(123)).toBe(false)
    expect(isSafeLinkPath('')).toBe(false)
  })
})

describe('isSafeAssetUrl', () => {
  test('accepts what a host hands back for an attachment', () => {
    expect(isSafeAssetUrl('blob:https://app.example/9c1')).toBe(true)
    expect(isSafeAssetUrl('https://cdn.example/a.png')).toBe(true)
    expect(isSafeAssetUrl('/apps/notes/a.png')).toBe(true)
  })

  test('refuses script and data URLs, and mailto', () => {
    expect(isSafeAssetUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeAssetUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false)
    expect(isSafeAssetUrl('mailto:a@b.c')).toBe(false)
  })
})
