import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appendJsonl, jsonlSize, parseJsonl, readJsonl, readJsonlFrom } from '../src/writer.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'log-writer-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('appendJsonl / readJsonl', () => {
  test('creates the directory chain and writes one newline-terminated line per call', () => {
    const path = join(dir, 'a', 'b', 'x.jsonl')
    appendJsonl(path, { n: 1 })
    appendJsonl(path, { n: 2 })
    expect(readFileSync(path, 'utf-8')).toBe('{"n":1}\n{"n":2}\n')
    expect(readJsonl(path)).toEqual([{ n: 1 }, { n: 2 }])
  })

  test('a new file is owner-only', () => {
    const path = join(dir, 'private.jsonl')
    appendJsonl(path, { n: 1 })
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  test('a missing file reads as empty', () => {
    expect(readJsonl(join(dir, 'none.jsonl'))).toEqual([])
  })

  test('a torn last line is dropped, and the next append starts on a fresh line', () => {
    const path = join(dir, 'x.jsonl')
    appendJsonl(path, { n: 1 })
    appendFileSync(path, '{"n":2,"tor')
    expect(readJsonl(path)).toEqual([{ n: 1 }])
    appendJsonl(path, { n: 3 })
    expect(readJsonl(path)).toEqual([{ n: 1 }, { n: 3 }])
  })

  test('a complete line that is not JSON is skipped', () => {
    const path = join(dir, 'x.jsonl')
    writeFileSync(path, '{"n":1}\nnot json\n\n{"n":2}\n')
    expect(readJsonl(path)).toEqual([{ n: 1 }, { n: 2 }])
    expect(parseJsonl('{"a":1}')).toEqual([]) // no trailing newline: torn
  })
})

describe('readJsonlFrom lines', () => {
  test("reports each value's line and how many complete lines were read, blank and bad ones included", () => {
    const path = join(dir, 'lines.jsonl')
    writeFileSync(path, '{"n":1}\nnot json\n\n{"n":2}\n{"n":')
    const tail = readJsonlFrom(path, 0)
    expect(tail.values).toEqual([{ n: 1 }, { n: 2 }])
    expect(tail.lines).toEqual([0, 3])
    expect(tail.lineCount).toBe(4)
  })
})

describe('appendJsonl without sync', () => {
  test('still appends whole lines and repairs a torn tail', () => {
    const path = join(dir, 'nosync.jsonl')
    appendJsonl(path, { n: 1 }, { sync: false })
    appendFileSync(path, '{"n":')
    appendJsonl(path, { n: 2 }, { sync: false })
    expect(readJsonl(path)).toEqual([{ n: 1 }, { n: 2 }])
  })
})

describe('readJsonlFrom', () => {
  test('reads only what was appended after the offset and returns where to resume', () => {
    const path = join(dir, 'x.jsonl')
    appendJsonl(path, { n: 1 })
    const first = readJsonlFrom(path, 0)
    expect(first.values).toEqual([{ n: 1 }])
    expect(first.offset).toBe(jsonlSize(path))
    expect(readJsonlFrom(path, first.offset).values).toEqual([])
    appendJsonl(path, { n: 2 })
    appendJsonl(path, { n: 3 })
    const next = readJsonlFrom(path, first.offset)
    expect(next.values).toEqual([{ n: 2 }, { n: 3 }])
    expect(next.offset).toBe(jsonlSize(path))
  })

  test('a torn final line stays unread until it is whole', () => {
    const path = join(dir, 'x.jsonl')
    appendJsonl(path, { n: 1 })
    appendFileSync(path, '{"n":2,"to')
    const torn = readJsonlFrom(path, 0)
    expect(torn.values).toEqual([{ n: 1 }])
    appendFileSync(path, 'rn":true}\n')
    expect(readJsonlFrom(path, torn.offset).values).toEqual([{ n: 2, torn: true }])
  })

  test('an offset past the end (file replaced or truncated) restarts from 0', () => {
    const path = join(dir, 'x.jsonl')
    appendJsonl(path, { n: 1 })
    const stale = jsonlSize(path) + 100
    expect(readJsonlFrom(path, stale).values).toEqual([{ n: 1 }])
    expect(readJsonlFrom(path, stale).offset).toBe(jsonlSize(path))
  })

  test('a missing file reads nothing and keeps the offset; a size of 0 is returned for it', () => {
    const path = join(dir, 'none.jsonl')
    expect(readJsonlFrom(path, 7)).toEqual({ values: [], lines: [], lineCount: 0, offset: 7 })
    expect(jsonlSize(path)).toBe(0)
  })
})
