/**
 * The story parameters and the `--include` filter that the README documents,
 * for the accessibility check, the keyboard walk and the screenshot modes. Each
 * test runs the built runner's own Playwright config on host Chromium over a
 * fixture build whose stories set the parameters, and reads the status of every
 * story's test: passed, failed or skipped. The container wrapper adds only the
 * environment, which these tests set themselves. Needs the built `dist/`.
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const RUNNER = join(PACKAGE_DIR, 'dist', 'runner')
const PLAYWRIGHT = join(PACKAGE_DIR, 'node_modules', '.bin', 'playwright')

// Large enough that axe's target-size rule has nothing to say.
const SIZE = 'style="min-width:48px;min-height:48px;margin:24px"'
const BAD = `<button ${SIZE}></button>`
const GOOD = `<button ${SIZE}>Save</button>`

interface Story {
  html: string
  parameters?: Record<string, unknown>
  playError?: boolean
}

const STORIES: Record<string, Story> = {
  't--bad': { html: BAD },
  't--good': { html: GOOD },
  't--off': { html: BAD, parameters: { a11y: { test: 'off' } } },
  't--todo': { html: BAD, parameters: { a11y: { test: 'todo' } } },
  't--todo-error': { html: BAD, parameters: { a11y: { test: 'todo' } }, playError: true },
  't--config': {
    html: BAD,
    parameters: {
      a11y: { config: { rules: [{ id: 'button-name', selector: '.matches-nothing' }] } },
    },
  },
  't--options': {
    html: BAD,
    parameters: { a11y: { options: { rules: { 'button-name': { enabled: false } } } } },
  },
  't--context': {
    html: `${BAD}<div id="scanned">${GOOD}</div>`,
    parameters: { a11y: { context: '#scanned' } },
  },
  't--shot-skip': { html: BAD, parameters: { screenshot: { skip: 'a perf scene' } } },
  't--walk-skip': { html: GOOD, parameters: { walk: { skip: 'a canvas' } } },
}

// A stand-in for a built Storybook's iframe, as the fixtures beside it are:
// it emits the events the runner waits for and serves each story's parameters.
const iframe = (stories: Record<string, Story>) => `<!doctype html>
<html lang="en"><head><title>story</title></head><body style="margin:0">
<div id="storybook-root"></div>
<script>
  const stories = ${JSON.stringify(stories)}
  const id = new URLSearchParams(location.search).get('id')
  const story = stories[id]
  document.getElementById('storybook-root').innerHTML = story.html
  const listeners = {}
  window.__STORYBOOK_PREVIEW__ = {
    channel: { on: (name, fn) => (listeners[name] ||= []).push(fn) },
    currentRender: { story: { parameters: { screenshot: { settleMs: 0 }, ...story.parameters } } },
  }
  const emit = (name, event) => (listeners[name] ?? []).forEach((fn) => fn(event))
  setTimeout(() => {
    if (story.playError) emit('playFunctionThrewException', { message: 'play threw' })
    emit('storyFinished', { storyId: id, status: 'success' })
  }, 10)
</script></body></html>`

type Status = 'passed' | 'failed' | 'skipped'

interface Suite {
  specs?: Array<{ title: string; tests: Array<{ results: Array<{ status: Status }> }> }>
  suites?: Suite[]
}

let work: string
let build: string

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'modes-'))
  build = join(work, 'storybook-static')
  mkdirSync(build)
  writeFileSync(join(build, 'iframe.html'), iframe(STORIES))
  const entries = Object.fromEntries(Object.keys(STORIES).map((id) => [id, { type: 'story' }]))
  writeFileSync(join(build, 'index.json'), JSON.stringify({ v: 5, entries }))
})

afterAll(() => rmSync(work, { recursive: true, force: true }))

/** Runs one mode as the container does, and returns each test's status by title. */
function run(mode: string, env: Record<string, string> = {}, args: string[] = []) {
  const artifacts = mkdtempSync(join(work, `${mode}-`))
  const result = spawnSync(
    PLAYWRIGHT,
    ['test', '-c', 'playwright.config.js', '--reporter=json', ...args],
    {
      cwd: RUNNER,
      encoding: 'utf8',
      env: {
        ...process.env,
        MODE: mode,
        STORYBOOK_DIR: build,
        BASELINE_DIR: join(artifacts, 'baselines'),
        ARTIFACTS_DIR: join(artifacts, 'test-results'),
        SHOTS_LIST: join(artifacts, 'shots.txt'),
        SHOT_WORKERS: '4',
        SETTLE_MS: '0',
        STORY_INCLUDE: '',
        STORY_EXCLUDE: '',
        ...env,
      },
    },
  )
  const report = JSON.parse(result.stdout) as Suite
  const statuses = new Map<string, Status>()
  const visit = (suite: Suite) => {
    for (const spec of suite.specs ?? [])
      statuses.set(spec.title, spec.tests[0]!.results[0]!.status)
    for (const child of suite.suites ?? []) visit(child)
  }
  visit(report)
  return { statuses, artifacts, exitCode: result.status }
}

const only = (statuses: Map<string, Status>, status: Status) =>
  [...statuses].filter(([, s]) => s === status).map(([title]) => title)

describe('story-shots --a11y', () => {
  let a11y: ReturnType<typeof run>
  beforeAll(() => {
    a11y = run('a11y')
  })

  it('fails a story with a violation', () => {
    expect(a11y.statuses.get('t--bad light')).toBe('failed')
    expect(a11y.statuses.get('t--good light')).toBe('passed')
  })

  it('skips a story whose parameters.a11y.test is off', () => {
    expect(a11y.statuses.get('t--off light')).toBe('skipped')
    expect(a11y.statuses.get('t--off dark')).toBe('skipped')
  })

  it('reports a todo story without failing it, and still fails it when it errors', () => {
    expect(a11y.statuses.get('t--todo light')).toBe('passed')
    expect(a11y.statuses.get('t--todo-error light')).toBe('failed')
    const report = join(a11y.artifacts, 'test-results', 'a11y', 't--todo--light.json')
    expect(JSON.parse(readFileSync(report, 'utf8')).violations[0].id).toBe('button-name')
  })

  it('applies parameters.a11y.config to axe.configure', () => {
    expect(a11y.statuses.get('t--config light')).toBe('passed')
  })

  it('merges parameters.a11y.options over the shared options', () => {
    expect(a11y.statuses.get('t--options light')).toBe('passed')
  })

  it('scans only parameters.a11y.context', () => {
    expect(a11y.statuses.get('t--context light')).toBe('passed')
  })

  it('leaves out a story with parameters.screenshot.skip', () => {
    expect(a11y.statuses.get('t--shot-skip light')).toBe('skipped')
  })

  it('runs only the stories --include leaves', () => {
    const included = run('a11y', { STORY_INCLUDE: 't--good,t--todo-error' })
    expect([...included.statuses.keys()].sort()).toEqual([
      't--good dark',
      't--good light',
      't--todo-error dark',
      't--todo-error light',
    ])
  })
})

describe('story-shots --walk', () => {
  it('skips parameters.walk.skip and parameters.screenshot.skip, and walks the rest', () => {
    const walk = run('walk')
    expect(only(walk.statuses, 'skipped').sort()).toEqual([
      't--shot-skip walk',
      't--walk-skip walk',
    ])
    expect(walk.statuses.get('t--good walk')).toBe('passed')
    const walked = readdirSync(join(walk.artifacts, 'test-results', 'walk')).sort()
    expect(walked).not.toContain('t--walk-skip')
    expect(walked).not.toContain('t--shot-skip')
    expect(walked).toContain('t--good')
  })

  it('fails only on a story that errors', () => {
    const walk = run('walk')
    expect(only(walk.statuses, 'failed')).toEqual(['t--todo-error walk'])
    expect(walk.statuses.get('t--bad walk')).toBe('passed')
  })

  it('runs only the stories --include leaves', () => {
    const included = run('walk', { STORY_INCLUDE: 't--good' })
    expect([...included.statuses.keys()]).toEqual(['t--good walk'])
  })
})

describe.each(['check', 'update'])('story-shots screenshot mode %s', (mode) => {
  // The check has no baselines to compare with here, so its shots fail; what
  // these tests read is which stories a run takes at all.
  const args = mode === 'update' ? ['--update-snapshots=changed'] : ['--update-snapshots=none']

  it('leaves out a story with parameters.screenshot.skip', () => {
    const shots = run(mode, {}, args)
    expect(shots.statuses.get('t--shot-skip light')).toBe('skipped')
    expect(shots.statuses.get('t--shot-skip dark')).toBe('skipped')
    expect(shots.statuses.get('t--good light')).not.toBe('skipped')
    if (mode === 'update') {
      const listed = readFileSync(join(shots.artifacts, 'shots.txt'), 'utf8')
      expect(listed).toContain('t--good--light.png')
      expect(existsSync(join(shots.artifacts, 'baselines', 't--shot-skip--light.png'))).toBe(false)
    }
  })

  it('shoots only the stories --include leaves', () => {
    const shots = run(mode, { STORY_INCLUDE: 't--good' }, args)
    expect([...shots.statuses.keys()].sort()).toEqual(['t--good dark', 't--good light'])
  })
})
