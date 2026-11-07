import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defineStoryConfig } from '../src/playwright/config.ts'

describe('defineStoryConfig', () => {
  it('serves the static build on the given port', () => {
    const config = defineStoryConfig({ port: 14745, mode: 'e2e' })
    const server = config.webServer as { command: string; url: string }
    expect(server.command).toMatch(/runner\/serve-static\.ts" "storybook-static" 14745$/)
    expect(server.url).toBe('http://127.0.0.1:14745/index.json')
    expect(config.use?.baseURL).toBe('http://127.0.0.1:14745')
  })

  it('runs e2e specs in parallel and perf specs on one worker', () => {
    const e2e = defineStoryConfig({ port: 1, mode: 'e2e' })
    const perf = defineStoryConfig({ port: 1, mode: 'perf', storybookDir: 'out' })
    expect(e2e.testMatch).toBe('**/*.e2e.ts')
    expect(e2e.fullyParallel).toBe(true)
    expect(perf.testMatch).toBe('**/*.perf.ts')
    expect(perf.workers).toBe(1)
    expect(perf.retries).toBe(0)
    expect((perf.webServer as { command: string }).command).toContain('"out"')
  })

  describe('STORY_PERF_FILE', () => {
    const saved = process.env.STORY_PERF_FILE
    afterEach(() => {
      if (saved === undefined) delete process.env.STORY_PERF_FILE
      else process.env.STORY_PERF_FILE = saved
    })

    it('points the perf report at test-results under configDir', () => {
      delete process.env.STORY_PERF_FILE
      defineStoryConfig({ port: 1, mode: 'perf', configDir: '/pkg' })
      expect(process.env.STORY_PERF_FILE).toBe(join('/pkg', 'test-results', 'story-perf.json'))
    })

    it('keeps a STORY_PERF_FILE already set', () => {
      process.env.STORY_PERF_FILE = '/custom/perf.json'
      defineStoryConfig({ port: 1, mode: 'perf', configDir: '/pkg' })
      expect(process.env.STORY_PERF_FILE).toBe('/custom/perf.json')
    })
  })
})
