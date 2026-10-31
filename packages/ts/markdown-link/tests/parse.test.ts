import { expect, test } from 'vitest'
import { bodyLinksSpanned, parseInner, targetRange } from '../src/index.ts'

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
