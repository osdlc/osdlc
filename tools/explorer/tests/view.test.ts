import { describe, expect, it } from 'vitest'
import { changeOf, inView, languageName, movesRepo, repoInView, repoLabel, reposOf } from '../src/model/view'
import { fixture, node } from './fixture'

describe('changeOf', () => {
  it('classifies the three state combinations', () => {
    expect(changeOf(['present', 'target'])).toBe('both')
    expect(changeOf(['present'])).toBe('removed')
    expect(changeOf(['target'])).toBe('added')
  })
})

describe('inView', () => {
  it('shows everything in compare and one state otherwise', () => {
    expect(inView(['present'], 'compare')).toBe(true)
    expect(inView(['present'], 'present')).toBe(true)
    expect(inView(['present'], 'target')).toBe(false)
    expect(inView(['target'], 'target')).toBe(true)
  })
})

describe('repos', () => {
  it('detects a node that moves repo', () => {
    expect(movesRepo(node('corpus-schema'))).toBe(true)
    expect(movesRepo(node('markdown-link'))).toBe(false)
    expect(movesRepo(node('markdown-db'))).toBe(false)
  })

  it('picks the repo for each view', () => {
    const moving = node('corpus-schema')
    expect(repoInView(moving, 'present')).toBe('osdlc/osdlc')
    expect(repoInView(moving, 'target')).toBe('osdlc/markdown')
    expect(repoInView(moving, 'compare')).toBe('osdlc/markdown')
    expect(repoInView(node('markdown-db'), 'compare')).toBe('sksizer/dev')
    expect(repoInView(node('markdown-db'), 'target')).toBeNull()
  })

  it('reads a null repo in a state the node is in as not decided', () => {
    const undecided = { ...node('markdown-link'), repo: { present: 'osdlc/osdlc', target: null } }
    expect(repoInView(undecided, 'target')).toBeNull()
    expect(repoInView(undecided, 'compare')).toBeNull()
    expect(repoLabel(fixture.repos, null)).toBe('repo not decided')
    expect(movesRepo(undecided)).toBe(false)
  })

  it('lists each repo once', () => {
    expect(reposOf(node('corpus-schema'))).toEqual(['osdlc/osdlc', 'osdlc/markdown'])
    expect(reposOf(node('markdown-link'))).toEqual(['osdlc/osdlc'])
  })
})

describe('languageName', () => {
  it('names each language in words, and nothing for none', () => {
    expect(languageName('ts')).toBe('TypeScript')
    expect(languageName('rust')).toBe('Rust')
    expect(languageName('none')).toBe('')
  })
})
