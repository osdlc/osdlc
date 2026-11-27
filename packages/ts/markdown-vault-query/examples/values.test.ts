import { createVaultIndex } from '@osdlc/markdown-vault'
import { expect, test } from 'vitest'

import {
  DateValue,
  DurationValue,
  ErrorValue,
  FileValue,
  HtmlValue,
  IconValue,
  ImageValue,
  LinkValue,
  RegexpValue,
  compareValues,
  formatDateMoment,
  formatRelative,
  fromFrontmatter,
  isEmptyValue,
  isTruthy,
  parseDate,
  parseDuration,
  toDisplayString,
  toNumber,
  typeName,
  valueEquals,
  type LinkResolver,
  type Value,
} from '@osdlc/markdown-vault-query'

test('parseDate and parseDuration read the date and duration strings of a base file', () => {
  const date = parseDate('2026-01-31')!
  const time = parseDate('2026-01-31T09:30:00')!
  const week = parseDuration('1 week')!
  const mixed = parseDuration('1y 2M 3d')!

  expect(date.hasTime).toBe(false)
  expect(time.hasTime).toBe(true)
  expect(week).toBeInstanceOf(DurationValue)
  expect(week.totalMs).toBe(7 * 86400000)
  expect(mixed.months).toBe(14)
  expect(parseDate('not a date')).toBeNull()
  expect(parseDuration('soon')).toBeNull()
})

test('fromFrontmatter converts YAML values, turning wikilinks into links and dates into dates', () => {
  const resolve: LinkResolver = (target) => (target === 'Ada' ? 'people/Ada.md' : null)
  const link = fromFrontmatter('[[Ada|the author]]', resolve) as LinkValue
  const date = fromFrontmatter('2026-01-31', resolve)
  const list = fromFrontmatter(['a', 1, null], resolve)

  expect(link).toBeInstanceOf(LinkValue)
  expect(link.resolvedPath).toBe('people/Ada.md')
  expect(link.display).toBe('the author')
  expect(date).toBeInstanceOf(DateValue)
  expect(list).toEqual(['a', 1, null])
})

test('toDisplayString shows a value as table cell text', () => {
  const vault = createVaultIndex([{ path: 'people/Ada.md' }])
  const file = new FileValue(vault.notes[0]!)
  const values: Value[] = [
    null,
    'text',
    42,
    ['a', 'b'],
    new DateValue(new Date(2026, 0, 31), false),
    new LinkValue('Ada', null, false, null),
    file,
    new RegexpValue(/ab+/i),
    new HtmlValue('<b>x</b>'),
    new ImageValue('cover.png'),
    new IconValue('star'),
    new ErrorValue('bad'),
  ]

  expect(values.map(toDisplayString)).toEqual([
    '',
    'text',
    '42',
    'a, b',
    '2026-01-31',
    'Ada',
    'Ada.md',
    '/ab+/i',
    '<b>x</b>',
    'cover.png',
    'star',
    'Error: bad',
  ])
})

test('typeName, isTruthy and isEmptyValue classify values the way expressions do', () => {
  expect(typeName(parseDate('2026-01-31'))).toBe('date')
  expect(typeName([])).toBe('list')
  expect(isTruthy(0)).toBe(false)
  expect(isTruthy(new ErrorValue('bad'))).toBe(false)
  expect(isTruthy('x')).toBe(true)
  expect(isEmptyValue('')).toBe(true)
  expect(isEmptyValue({})).toBe(true)
  expect(isEmptyValue(0)).toBe(false)
})

test('valueEquals, compareValues and toNumber follow the operator semantics', () => {
  expect(valueEquals(parseDate('2026-01-31'), parseDate('2026-01-31'))).toBe(true)
  expect(valueEquals(null, 0)).toBe(false)
  expect(compareValues(1, 2)).toBeLessThan(0)
  expect(compareValues('b', 'a')).toBeGreaterThan(0)
  expect(toNumber('1.5')).toBe(1.5)
  expect(toNumber(true)).toBe(1)
  expect(() => compareValues(1, 'a')).toThrow(/Cannot compare/)
  expect(() => toNumber('  ')).toThrow(/Cannot convert/)
})

test('formatDateMoment and formatRelative format dates for display', () => {
  const date = new Date(2026, 0, 31, 9, 5)
  const now = new Date(2026, 0, 28, 9, 5)

  expect(formatDateMoment(date, 'YYYY-MM-DD HH:mm')).toBe('2026-01-31 09:05')
  expect(formatDateMoment(date, 'dddd, MMMM Do [at] h:mm A')).toBe(
    'Saturday, January 31st at 9:05 AM',
  )
  expect(formatRelative(now, date)).toBe('3 days ago')
  expect(formatRelative(date, now)).toBe('in 3 days')
})
