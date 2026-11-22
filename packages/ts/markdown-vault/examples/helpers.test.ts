import { expect, test } from 'vitest'

import { extractInlineTags, extractLinks, parseFrontmatter } from '@osdlc/markdown-vault'

test('parseFrontmatter returns the YAML mapping, or {} when there is none', () => {
  // #region frontmatter
  expect(parseFrontmatter('---\ntitle: Plan\ndraft: true\n---\nBody')).toEqual({
    title: 'Plan',
    draft: true,
  })
  expect(parseFrontmatter('No frontmatter')).toEqual({})
  expect(parseFrontmatter('---\nkey: [unclosed\n---\n')).toEqual({})
  // #endregion frontmatter
})

test('extractLinks lists wikilinks and embeds, unresolved and outside code', () => {
  // #region links
  const { links, embeds } = extractLinks(
    'See [[Plan#Goals|the goals]] and ![[logo.png]] `[[code]]`',
  )

  expect(links).toEqual([{ target: 'Plan', path: null, display: 'the goals' }])
  expect(embeds).toEqual([{ target: 'logo.png', path: null, display: null }])
  // #endregion links
})

test('extractInlineTags reads inline tags by dialect', () => {
  // #region tags
  const body = '#2024 (#draft) #santé'

  expect(extractInlineTags(body)).toEqual(['draft', 'santé'])
  expect(extractInlineTags(body, { tagDialect: 'unicode' })).toEqual(['2024', 'santé'])
  expect(extractInlineTags(body, { tagDialect: 'ascii' })).toEqual(['draft', 'sant'])
  // #endregion tags
})
