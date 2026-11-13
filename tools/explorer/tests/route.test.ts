import { describe, expect, it } from 'vitest'
import { formatHash, parseHash } from '../src/model/route'

describe('parseHash', () => {
  it('reads the Components view and its node', () => {
    expect(parseHash('#node=markdown-link')).toEqual({ view: 'components', node: 'markdown-link' })
    expect(parseHash('')).toEqual({ view: 'components', node: null })
    expect(parseHash('#something')).toEqual({ view: 'components', node: null })
  })

  it('reads the Work view, its level and its selection', () => {
    expect(parseHash('#view=work&task=27')).toEqual({ view: 'work', level: 'detail', task: 27, milestone: null })
    expect(parseHash('#view=work&level=overview&milestone=m-npm')).toEqual({
      view: 'work',
      level: 'overview',
      task: null,
      milestone: 'm-npm',
    })
    expect(parseHash('#view=work&task=x')).toMatchObject({ task: null })
  })

  it('round-trips through formatHash', () => {
    for (const hash of ['', '#node=markdown-link', '#view=work', '#view=work&task=27', '#view=work&level=overview&milestone=m-npm']) {
      expect(formatHash(parseHash(hash))).toBe(hash)
    }
  })
})
