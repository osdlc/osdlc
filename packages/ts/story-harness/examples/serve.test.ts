// A package's own screenshot script serves its build with serveStatic on a
// fixed port, then points a browser at it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { selectStories, serveStatic, type StoryIndex } from '@osdlc/story-harness/runner'

const build = fileURLToPath(new URL('../tests/fixtures/storybook-static', import.meta.url))

test('serveStatic serves a build on the loopback interface', async () => {
  const port = 16107
  const close = await serveStatic(build, port)
  try {
    const index = await fetch(`http://127.0.0.1:${port}/index.json`).then((r) => r.json())
    expect(Object.keys(index.entries)).toContain('demo-card--plain')
  } finally {
    close()
  }
})

test('selectStories picks story ids from the build index', () => {
  const index: StoryIndex = JSON.parse(readFileSync(`${build}/index.json`, 'utf8'))
  expect(selectStories(index, { include: ['demo-card--'], exclude: ['demo-card--perf'] })).toEqual([
    'demo-card--plain',
    'demo-card--wide',
  ])
})
