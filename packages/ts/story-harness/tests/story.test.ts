import { describe, expect, it } from 'vitest'
import { isNarrowOnly, selectStories, splitList } from '../src/runner/story.ts'

const index = {
  entries: {
    'ui-button--primary': { type: 'story' },
    'ui-button--docs': { type: 'docs' },
    'ui-button--ghost': { type: 'story' },
    'ui-grid--wide': { type: 'story' },
    'demo-explore--list-narrow': { type: 'story' },
  },
}

describe('selectStories', () => {
  it('keeps every story in index order and drops docs entries', () => {
    expect(selectStories(index)).toEqual([
      'ui-button--primary',
      'ui-button--ghost',
      'ui-grid--wide',
      'demo-explore--list-narrow',
    ])
  })

  it('keeps ids with an include prefix', () => {
    expect(selectStories(index, { include: ['ui-button', 'demo'] })).toEqual([
      'ui-button--primary',
      'ui-button--ghost',
      'demo-explore--list-narrow',
    ])
  })

  it('drops ids with an exclude prefix, after include', () => {
    expect(selectStories(index, { include: ['ui-'], exclude: ['ui-button--ghost'] })).toEqual([
      'ui-button--primary',
      'ui-grid--wide',
    ])
  })

  it('keeps ids that contain a substring', () => {
    expect(selectStories(index, { contains: 'wide' })).toEqual(['ui-grid--wide'])
    expect(selectStories(index, { contains: 'nothing' })).toEqual([])
  })
})

describe('splitList', () => {
  it('splits on commas, trims and drops empty items', () => {
    expect(splitList(' a, b ,,c,')).toEqual(['a', 'b', 'c'])
  })

  it('gives an empty list for undefined or blank input', () => {
    expect(splitList(undefined)).toEqual([])
    expect(splitList('')).toEqual([])
    expect(splitList(' , ')).toEqual([])
  })
})

describe('isNarrowOnly', () => {
  it('is true only for the -narrow id suffix', () => {
    expect(isNarrowOnly('demo-explore--list-narrow')).toBe(true)
    expect(isNarrowOnly('demo-explore--narrow-list')).toBe(false)
    expect(isNarrowOnly('ui-grid--wide')).toBe(false)
  })
})
