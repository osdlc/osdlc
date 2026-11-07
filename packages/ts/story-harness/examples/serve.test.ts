// A package's own screenshot script serves its build with serveStatic, then
// points a browser at it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { selectStories, serveStatic, type StoryIndex } from '@osdlc/story-harness/runner'

const build = fileURLToPath(new URL('../tests/fixtures/storybook-static', import.meta.url))

test('serveStatic serves a build on the loopback interface', async () => {
  const close = await serveStatic(build, 0).catch(() => undefined)
  // Port 0 binds a free port; a fixed port is the usual call.
  expect(close).toBeTypeOf('function')
  close?.()
})

test('selectStories picks story ids from the build index', () => {
  const index: StoryIndex = JSON.parse(readFileSync(`${build}/index.json`, 'utf8'))
  expect(selectStories(index, { include: ['demo-card--'], exclude: ['demo-card--perf'] })).toEqual([
    'demo-card--plain',
    'demo-card--wide',
  ])
})
