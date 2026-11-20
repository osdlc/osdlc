/**
 * The terminal UI's Skills tab, its tool info and its per-tool trust, over a
 * real session in a throwaway repository and HOME.
 */

import { chmod, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { COPY_REFUSED } from '../src/core/copy-text.ts'
import { SKILLS_TAB } from '../src/tui/app.ts'
import { toolNote } from '../src/tui/settings.ts'
import type { ToolSummary } from '../src/tool-info.ts'
import { cleanupAll, screen, temp, testTui } from './tui-support.ts'

afterAll(cleanupAll)

const SKILL = [
  '---',
  'name: review',
  'description: Review a pull request',
  'argument-hint: "[pr-number]"',
  '---',
  'Body.',
  '',
].join('\n')

const WITH_SKILL = {
  'package.json': JSON.stringify({ name: 'p', scripts: { build: 'echo b' } }),
  '.claude/skills/review/SKILL.md': SKILL,
}

/** mise as a runner and a tool manager, and moon, which mise wraps. No PATH, so nothing runs. */
const MISE_AND_MOON = {
  'mise.toml': '[tasks.hello]\nrun = "echo hi"\n',
  '.moon/workspace.yml': 'projects: {}\n',
}

async function booted(opts: Parameters<typeof testTui>[0]) {
  const t = await testTui(opts)
  await t.tui.boot()
  await t.tui.idle()
  return t
}

describe('the Skills tab', () => {
  test('skills follow the tasks in all and have their own tab', async () => {
    const { tui } = await booted({ files: WITH_SKILL })
    const lines = screen(tui)
    expect(lines[0]).toMatch(/│ skills 1 /)
    expect(lines).toContainEqual(expect.stringMatching(/^ {4}\/review \[pr-number\] {2}project$/))
    tui.handle('\t')
    tui.handle('\t')
    tui.handle('\t')
    tui.recompute()
    expect(tui.state.runner).toBe(SKILLS_TAB)
    expect(tui.state.rows).toEqual([])
    expect(tui.entries().map((e) => e.skill?.skill.name)).toEqual(['review'])
  })

  test('the query matches skills as it matches tasks', async () => {
    const { tui } = await booted({ files: WITH_SKILL })
    tui.feed('revi')
    expect(tui.state.rows).toEqual([])
    expect(tui.state.skillRows.map((h) => h.skill.name)).toEqual(['review'])
    tui.feed('\x15zzzz')
    expect(tui.state.skillRows).toEqual([])
  })

  test('services only hides skills', async () => {
    const { tui } = await booted({ files: WITH_SKILL })
    tui.feed('\x14')
    expect(tui.state.skillRows).toEqual([])
  })

  test('Enter on a skill copies /<name> and hands nothing off', async () => {
    const { tui, host } = await booted({ files: WITH_SKILL })
    tui.feed('review')
    tui.handle('\r')
    await tui.idle()
    expect(host.copied).toEqual(['/review'])
    expect(host.handedOff).toEqual([])
    expect(host.exits).toEqual([])
    expect(tui.state.message?.text).toContain('copied /review; type it in claude')
  })

  test('^y on a skill copies /<name>, and a clipboard failure is a warning', async () => {
    const { tui, host } = await booted({ files: WITH_SKILL })
    host.clipboardOk = false
    tui.feed('review')
    tui.handle('\x19')
    await tui.idle()
    expect(host.copied).toEqual(['/review'])
    expect(tui.state.message).toEqual({ text: 'clipboard unavailable', tone: 'warning' })
  })

  test('a skill name with a control character is not copied', async () => {
    const hostile = ['---', 'name: "ok\\e[201~\\necho PWNED\\n"', '---', 'Body.', ''].join('\n')
    const { tui, host } = await booted({
      files: { ...WITH_SKILL, '.claude/skills/ok/SKILL.md': hostile },
    })
    tui.feed('ok')
    tui.handle('\x19')
    await tui.idle()
    expect(tui.state.skillRows.map((h) => h.skill.invoke)).toContain('/ok\u001b[201~\necho PWNED')
    expect(host.copied).toEqual([])
    expect(tui.state.message).toEqual({ text: COPY_REFUSED, tone: 'warning' })
  })

  test('the line under a skill shows its description, and control characters are filtered', async () => {
    const files = {
      ...WITH_SKILL,
      '.claude/skills/review/SKILL.md': SKILL.replace(
        'Review a pull request',
        'Review \x1b[31mred\x1b[0m',
      ),
    }
    const { tui } = await booted({ files })
    tui.feed('review')
    const text = screen(tui).join('\n')
    expect(text).toContain('/review [pr-number]')
    expect(text).toContain('skill for claude')
    expect(text).toContain('Review �')
    // eslint-disable-next-line no-control-regex
    expect(tui.frame(100, 24)).not.toMatch(/\x1b\[31m/)
  })

  test('with skills off there is no Skills tab', async () => {
    const { tui } = await booted({ files: WITH_SKILL, userConfig: { skills: 'off' } })
    expect(screen(tui)[0]).not.toContain('skills')
    expect(tui.state.skills).toEqual([])
  })
})

describe.skipIf(process.platform === 'win32')('^g: a skill handed to an agent CLI', () => {
  /** A PATH directory holding a fake `claude`, which nothing runs: the host records hand-offs. */
  async function agentPath(): Promise<string> {
    const dir = await temp('wayfinder-agent-bin-')
    await writeFile(join(dir, 'claude'), '#!/bin/sh\nexit 0\n', 'utf-8')
    await chmod(join(dir, 'claude'), 0o755)
    return dir
  }

  const NO_HINT = SKILL.replace('argument-hint: "[pr-number]"\n', '')

  test('a skill with a hint asks for its arguments, then hands the prompt to claude', async () => {
    const path = await agentPath()
    const { tui, host, root } = await booted({ files: WITH_SKILL, env: { PATH: path } })
    tui.feed('review')
    expect(screen(tui).join('\n')).toContain('skill for claude · ^g starts claude')
    expect(screen(tui).at(-1)).toContain('^g agent')
    tui.feed('\x07')
    expect(tui.state.entering?.skill?.name).toBe('review')
    expect(host.handedOff).toEqual([])
    tui.feed('12 please')
    const text = screen(tui).join('\n')
    expect(text).toContain('claude ▸ /review 12 please█')
    expect(text).toContain('takes [pr-number]; type any, or none')
    tui.feed('\r')
    expect(host.released).toBe(1)
    expect(host.handedOff).toEqual([
      {
        skill: expect.anything(),
        harness: 'claude',
        prompt: '/review 12 please',
        argv: [join(path, 'claude'), '/review 12 please'],
        env: {},
        cwd: root,
      },
    ])
    expect(host.written.join('')).toContain(`$ ${join(path, 'claude')} '/review 12 please'`)
    expect(host.exits).toEqual([0])
  })

  test('esc on the entry line goes back and starts nothing', async () => {
    const { tui, host } = await booted({ files: WITH_SKILL, env: { PATH: await agentPath() } })
    tui.feed('review')
    tui.feed('\x07')
    tui.feed('\x1b')
    expect(tui.state.entering).toBeNull()
    expect(host.handedOff).toEqual([])
    expect(host.exits).toEqual([])
  })

  test('a skill with no hint starts at once, with its name alone', async () => {
    const path = await agentPath()
    const files = { ...WITH_SKILL, '.claude/skills/review/SKILL.md': NO_HINT }
    const { tui, host } = await booted({ files, env: { PATH: path } })
    tui.feed('review')
    tui.feed('\x07')
    expect(host.handedOff.map((p) => p.argv)).toEqual([[join(path, 'claude'), '/review']])
    expect(host.exits).toEqual([0])
  })

  test('the agent exit code and a failure to start are passed on', async () => {
    const files = { ...WITH_SKILL, '.claude/skills/review/SKILL.md': NO_HINT }
    const { tui, host } = await booted({ files, env: { PATH: await agentPath() } })
    host.handOffResult = { exit: 1, error: 'spawn EACCES' }
    tui.feed('review')
    tui.feed('\x07')
    expect(host.written.join('')).toContain('claude: spawn EACCES')
    expect(host.exits).toEqual([1])
  })

  test('with no agent CLI on PATH it says why, and the UI stays', async () => {
    const { tui, host } = await booted({ files: WITH_SKILL, env: { PATH: '' } })
    tui.feed('review')
    expect(screen(tui).join('\n')).not.toContain('^g starts')
    tui.feed('\x07')
    expect(tui.state.entering).toBeNull()
    expect(tui.state.message).toEqual({
      text: '/review: no agent CLI that reads it is on PATH — looked for claude; type /review in claude',
      tone: 'error',
    })
    expect(host.handedOff).toEqual([])
    expect(host.released).toBe(0)
    expect(host.exits).toEqual([])
  })

  test('^g on a task does nothing but say so; Enter on a skill still copies', async () => {
    const { tui, host } = await booted({ files: WITH_SKILL, env: { PATH: await agentPath() } })
    tui.feed('build')
    tui.feed('\x07')
    expect(tui.state.message?.text).toBe('^g starts an agent with a skill; this is a task')
    expect(screen(tui).at(-1)).not.toContain('^g')
    tui.feed('\x15review\r')
    await tui.idle()
    expect(host.copied).toEqual(['/review'])
    expect(host.handedOff).toEqual([])
  })
})

describe('tool info on the settings screen', () => {
  const summary = (over: Partial<ToolSummary>): ToolSummary => ({
    id: 'acme',
    homepage: null,
    description: null,
    ecosystem: null,
    language: 'any language',
    runnerKind: 'parse',
    ...over,
  })

  test('language, homepage and description, in that order', () => {
    const tools = [
      summary({
        ecosystem: 'node',
        language: 'JavaScript',
        homepage: 'https://acme.dev',
        description: 'Acme tasks',
      }),
    ]
    expect(toolNote(tools, 'acme')).toBe('JavaScript  https://acme.dev  Acme tasks')
  })

  test('a tool of no one language and no homepage shows only its description', () => {
    expect(toolNote([summary({ description: 'Acme tasks' })], 'acme')).toBe('Acme tasks')
    expect(toolNote([], 'acme')).toBe('')
  })

  test('a description with control characters is filtered', () => {
    expect(toolNote([summary({ description: 'a\x1b]8;;x\x07b' })], 'acme')).not.toMatch(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1f]/,
    )
  })

  test('a built-in runner shows its homepage', async () => {
    const { tui } = await booted({})
    tui.handle(',')
    await tui.idle()
    expect(screen(tui).join('\n')).toMatch(/on {3}node-scripts {2}JavaScript {2}https:\/\//)
  })
})

describe('per-tool trust on the settings screen', () => {
  async function settingsOver() {
    const t = await booted({ files: MISE_AND_MOON, env: {} })
    t.tui.handle(',')
    await t.tui.idle()
    return t
  }

  /** Move the cursor to the tool trust line for `tool`. */
  function toTool(tui: Awaited<ReturnType<typeof settingsOver>>['tui'], tool: string): void {
    for (let i = 0; i < 40; i++) tui.handle('\x1b[A')
    for (let i = 0; i < 40; i++) {
      const at = tui.state.settings?.at
      if (at?.kind === 'tool' && at.tool === tool) return
      tui.handle('\x1b[B')
    }
    throw new Error(`no tool line for ${tool}`)
  }

  test('lists each scope a withheld runner needs', async () => {
    const { tui } = await settingsOver()
    const text = screen(tui, 100, 60).join('\n')
    expect(text).toContain('TOOL TRUST')
    expect(text).toMatch(/not trusted {2}mise {2}needed by .*mise.*moon.* \(t trusts it\)/)
    expect(text).toMatch(/not trusted {2}moon {2}needed by moon/)
  })

  test('t asks first; y grants that tool only, and the runner reads as trusted', async () => {
    const { tui } = await settingsOver()
    toTool(tui, 'mise')
    tui.handle('t')
    expect(tui.state.confirmingTrust).toBe(true)
    expect(screen(tui)[2]).toContain('trust mise here? y/n')
    tui.handle('y')
    await tui.idle()
    expect(tui.session.settings().trustedTools).toEqual(['mise'])
    expect(tui.state.message?.text ?? '').not.toContain('failed')
    const text = screen(tui, 100, 60).join('\n')
    expect(text).toMatch(/trusted {6}mise {2}\(u removes\)/)
    // moon still needs its own grant.
    expect(text).toMatch(/not trusted {2}moon/)
    expect(tui.session.gate.trusted).toBe(false)
  })

  test('any key but y cancels the tool grant', async () => {
    const { tui } = await settingsOver()
    toTool(tui, 'mise')
    tui.handle('t')
    tui.handle('n')
    await tui.idle()
    expect(tui.state.confirmingTrust).toBe(false)
    expect(tui.state.trustScope).toBeNull()
    expect(tui.session.settings().trustedTools).toEqual([])
  })

  test('u on a trusted tool removes its grant', async () => {
    const { tui } = await settingsOver()
    toTool(tui, 'mise')
    tui.handle('t')
    tui.handle('y')
    await tui.idle()
    toTool(tui, 'mise')
    tui.handle('u')
    await tui.idle()
    expect(tui.session.settings().trustedTools).toEqual([])
    expect(tui.state.message?.text).toContain('removed trust for mise')
  })

  test('under --no-exec no tool trust is offered', async () => {
    const t = await booted({ files: MISE_AND_MOON, env: {}, flags: { allowExec: false } })
    t.tui.handle(',')
    await t.tui.idle()
    expect(screen(t.tui, 100, 60).join('\n')).not.toContain('TOOL TRUST')
  })
})
