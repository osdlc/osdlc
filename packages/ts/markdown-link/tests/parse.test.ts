import { expect, test } from 'vitest'
import { bodyLinksSpanned, parseInner, percentDecode, targetRange } from '../src/index.ts'

test('targetRange matches the parsed target', () => {
  for (const inner of [
    'Note',
    ' Note |a',
    'Note\\|a',
    'Note \\|a',
    'Note#H\\|a',
    'Note\\\\|a',
    'Note\\',
    'a#b|c#d',
  ]) {
    const range = targetRange(inner)!
    expect(inner.slice(range.start, range.end)).toBe(parseInner(inner, false)!.target)
  }
  expect(targetRange('Note\\|a')).toEqual({ start: 0, end: 4 })
  expect(targetRange('\\|a')).toBeNull()
  expect(targetRange('#H')).toBeNull()
})

test('parseInner passes the embed flag through', () => {
  expect(parseInner('img.png|100', true)).toEqual({
    target: 'img.png',
    heading: null,
    alias: '100',
    embed: true,
  })
})

test('spans are UTF-16 offsets into the body', () => {
  const body = '📝 é [[x]]'
  const [link] = bodyLinksSpanned(body)
  expect(link).toMatchObject({ start: 5, end: 10 })
  expect(body.slice(link!.start, link!.end)).toBe('[[x]]')
})

test('percentDecode decodes UTF-8 and keeps what does not decode', () => {
  expect(percentDecode('My%20Note')).toBe('My Note')
  expect(percentDecode('caf%C3%A9')).toBe('café')
  expect(percentDecode('plain')).toBe('plain')
  // Not hex, or a `%` too near the end: kept as written, the rest still decodes.
  expect(percentDecode('%zz')).toBe('%zz')
  expect(percentDecode('100%')).toBe('100%')
  expect(percentDecode('100% of%20it')).toBe('100% of it')
  // Not UTF-8: the whole string is kept as written.
  expect(percentDecode('%FF')).toBe('%FF')
  expect(percentDecode('a%20b%FF')).toBe('a%20b%FF')
})
