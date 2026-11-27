// `DeepPartial`, `FieldType`, `CodecOptions` and `SpecEntry`: the types a caller names.
import { expect, test } from 'vitest'
import {
  decode,
  diff,
  encodeEntries,
  type CodecOptions,
  type DeepPartial,
  type FieldType,
  type SpecEntry,
} from '@osdlc/spec-query'

interface View {
  title: string
  focus: { hops: number | null }
  tags: string[]
}
const DEFAULTS: View = { title: '', focus: { hops: null }, tags: [] }

test('DeepPartial types a diff: nested leaves optional, arrays whole', () => {
  const patch: DeepPartial<View> = diff({ ...DEFAULTS, focus: { hops: 2 } }, DEFAULTS)
  expect(patch).toEqual({ focus: { hops: 2 } })
})

test('FieldType and CodecOptions declare the type a null default cannot imply', () => {
  const hops: FieldType = 'number'
  const options: CodecOptions = { types: { 'focus.hops': hops }, omit: ['title'] }
  expect(decode('focus.hops=3&title=ignored', DEFAULTS, options)).toEqual({
    ...DEFAULTS,
    focus: { hops: 3 },
  })
})

test('SpecEntry is one raw pair', () => {
  const entries: SpecEntry[] = encodeEntries({ ...DEFAULTS, title: 'x' }, DEFAULTS)
  expect(entries[0]).toEqual({ key: 'title', value: 'x' })
})
