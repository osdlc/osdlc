import { describe, expect, test } from 'vitest'
import { exact, fuzzy, matchEntry, terms, type Matchable } from '../src/match.ts'

// Every surface over this catalog ranks with these functions, so a change here
// moves results under all of them at once.

const entry = (over: Partial<Matchable> = {}): Matchable => ({
  path: ['moon', 'solutions/determined/apps', 'photo-review', 'dev'],
  display: 'moon run photo-review:dev',
  detail: 'bun run tauri dev',
  tags: ['moon', 'run', 'application'],
  ...over,
})

describe('terms', () => {
  test('splits on whitespace and drops empties', () => {
    expect(terms('  moon   dev ')).toEqual(['moon', 'dev'])
    expect(terms('   ')).toEqual([])
  })

  test('lowercases, so matching never has to', () => {
    expect(terms('Moon DEV')).toEqual(['moon', 'dev'])
  })
})

describe('fuzzy', () => {
  test('matches a subsequence and reports where', () => {
    const hit = fuzzy('check-markdown', 'mkdwn')
    expect(hit).not.toBeNull()
    expect(hit!.idx.length).toBe(5)
  })

  test('rejects a subsequence smeared across a long string', () => {
    // "photo" is a subsequence of the absolute path moon expands into sdf:dev's
    // command line. A match spread that thin must be rejected.
    const path =
      'bun run /Users/someone/Developer/dev/solutions/ontological/cli/sdlc.ts dashboard start'
    expect(fuzzy(path, 'photo')).toBeNull()
  })

  test('scores a word-boundary run above a scattered one', () => {
    const boundary = fuzzy('photo-review', 'photo')!
    const scattered = fuzzy('pahsoltso', 'phots')!
    expect(boundary.score).toBeGreaterThan(scattered.score)
  })

  test('returns null when a character is missing', () => {
    expect(fuzzy('check', 'checkz')).toBeNull()
  })
})

describe('exact', () => {
  test('is case-insensitive and reports the span', () => {
    const hit = exact('moon run photo-review:dev', 'PHOTO')!
    expect(hit.idx[0]).toBe(9)
    expect(hit.idx.length).toBe(5)
  })

  test('outranks any fuzzy hit on the same text', () => {
    const text = 'photo-review'
    expect(exact(text, 'photo')!.score).toBeGreaterThan(fuzzy(text, 'photo')!.score)
  })

  test('returns null when the substring is absent', () => {
    expect(exact('photo-review', 'pohto')).toBeNull()
  })
})

describe('matchEntry', () => {
  test('requires every term to match somewhere', () => {
    expect(matchEntry(entry(), terms('photo dev'), 'fuzzy')).not.toBeNull()
    expect(matchEntry(entry(), terms('photo nonesuch'), 'fuzzy')).toBeNull()
  })

  test('a leading quote forces one term exact even in fuzzy mode', () => {
    // "pohto" is a subsequence of `p-o-h-t-o` but not a substring of it. The
    // quoted form must not fall back to subsequence matching.
    expect(matchEntry(entry(), terms("'photo"), 'fuzzy')).not.toBeNull()
    expect(
      matchEntry(entry({ path: ['moon', 'x', 'p-o-h-t-o', 'dev'] }), terms("'pohto"), 'fuzzy'),
    ).toBeNull()
  })

  test('exact mode refuses a subsequence the fuzzy mode accepts', () => {
    const e = entry({
      path: ['moon', 'x', 'check-markdown', 'fmt'],
      display: 'moon run check-markdown:fmt',
      tags: [],
    })
    expect(matchEntry(e, terms('mkdwn'), 'fuzzy')).not.toBeNull()
    expect(matchEntry(e, terms('mkdwn'), 'exact')).toBeNull()
  })

  test('reports chain offsets only when the chain is what matched', () => {
    const onChain = matchEntry(entry(), terms('photo'), 'exact')!
    expect(onChain.labelHits).not.toBeNull()
    // "tauri" appears only in `detail`, so there is nothing to highlight in the
    // chain and the row renders unmarked rather than mis-marked.
    const offChain = matchEntry(entry(), terms('tauri'), 'exact')!
    expect(offChain.labelHits).toBeNull()
  })

  test('ranks a name hit above the same text buried in a later field', () => {
    const inName = matchEntry(
      entry({ path: ['moon', 'x', 'tauri', 'dev'] }),
      terms('tauri'),
      'exact',
    )!
    const inDetail = matchEntry(entry(), terms('tauri'), 'exact')!
    expect(inName.score).toBeGreaterThan(inDetail.score)
  })

  test('an empty query matches nothing, since callers skip matching entirely', () => {
    // terms("") is [], so every term trivially passes. The views treat an empty
    // query as "show all" and never call this.
    expect(matchEntry(entry(), terms(''), 'fuzzy')).toEqual({ score: 0, labelHits: null })
  })
})
