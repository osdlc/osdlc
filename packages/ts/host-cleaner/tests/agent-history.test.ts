/** The `agent-history` plugin over a temporary Claude Code folder and two project paths, one live and one gone. */

import { afterEach, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { ProcessProbe } from '@osdlc/repo-cleaner'

import {
  AGENT_HISTORY_PLUGIN,
  DISCARD_USER_DATA,
  clean,
  plan,
  pluginKit,
  survey,
  type Candidate,
  type Ctx,
  type PathCandidate,
  type Plugin,
} from '../src/index.ts'
import {
  agentHistoryDefinition,
  claudeConfigDir,
  decodeFolder,
  fstabMounts,
  isFolderOf,
  projectFolderName,
  unmounted,
} from '../src/agent-history.ts'
import { contractSuite, fakeContext, tempHome } from '../src/testing.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

const idle: ProcessProbe = { alive: () => false, holders: () => [] }

/** A pid no process has: a child's, after it exited. */
const deadPid = (): number => spawnSync('true').pid!

interface Fixture {
  home: string
  projects: string
  live: string
  gone: string
  /** The project folder of `path`, with one transcript whose first `cwd` is `cwd` (default `path`). */
  history(path: string, opts?: { cwd?: string | null; session?: string }): string
  /** A session record in `<config>/sessions/<pid>.json`. */
  session(pid: number, body: Record<string, unknown> | string): void
  plugin(probe?: ProcessProbe, env?: Record<string, string>): Plugin
  ctx: Ctx
}

/** A home with `~/.claude/projects` and two project paths: `live`, which exists, and `gone`, which does not. */
function fixture(): Fixture {
  const t = tempHome('host-cleaner-agent-history-')
  cleanups.push(t.cleanup)
  const home = t.home
  const live = join(home, 'dev', 'app.wt', 'live')
  const gone = join(home, 'dev', 'app.wt', 'gone_one')
  mkdirSync(live, { recursive: true })
  const config = join(home, '.claude')
  const projects = join(config, 'projects')
  mkdirSync(projects, { recursive: true })
  return {
    home,
    projects,
    live,
    gone,
    history(path, { cwd = path, session = '0a1b2c3d-0000-4000-8000-000000000001' } = {}) {
      const dir = join(projects, projectFolderName(path))
      mkdirSync(dir, { recursive: true })
      const rows = [
        { type: 'last-prompt', sessionId: session },
        ...(cwd === null ? [] : [{ type: 'user', cwd, sessionId: session }]),
      ]
      writeFileSync(join(dir, `${session}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n'))
      return dir
    },
    session(pid, body) {
      mkdirSync(join(config, 'sessions'), { recursive: true })
      writeFileSync(
        join(config, 'sessions', `${pid}.json`),
        typeof body === 'string' ? body : JSON.stringify({ pid, ...body }),
      )
    },
    plugin: (probe = idle, env = t.env) =>
      agentHistoryDefinition.create({
        settings: {},
        only: [],
        env,
        kit: pluginKit(AGENT_HISTORY_PLUGIN, { probe, env }),
      }),
    ctx: fakeContext({ cwd: home, targets: [] }),
  }
}

/** `plugin.delete` on `c`, a throw as a rejection. */
const deleting = async (plugin: Plugin, c: Candidate, ctx: Ctx): Promise<string> =>
  plugin.delete!(c, ctx)

const refusals = (s: Awaited<ReturnType<typeof survey>>, id: string): string[] =>
  s.objections.filter((o) => o.candidate === id && o.level === 'refuse').map((o) => o.code)

describe('the project folder name', () => {
  test('every character but a letter or a digit becomes -', () => {
    expect(projectFolderName('/Users/me/dev/.worktrees/app_1.x')).toBe(
      '-Users-me-dev--worktrees-app-1-x',
    )
  })

  test('the config folder is CLAUDE_CONFIG_DIR, else .claude in the home folder', () => {
    expect(claudeConfigDir({ HOME: '/h' })).toBe('/h/.claude')
    expect(claudeConfigDir({ HOME: '/h', CLAUDE_CONFIG_DIR: '/c' })).toBe('/c')
    expect(claudeConfigDir({ HOME: '/h', CLAUDE_CONFIG_DIR: '' })).toBe('/h/.claude')
    expect(claudeConfigDir({ HOME: '' })).toBe(join(homedir(), '.claude'))
  })

  test('a name past 200 characters is its first 200 and a hash', () => {
    const path = `/${'d'.repeat(250)}`
    const name = `${projectFolderName(path).slice(0, 200)}-1a2b3c`
    expect(isFolderOf(path, name)).toBe(true)
    expect(isFolderOf(path, projectFolderName(path).slice(0, 200))).toBe(false)
    expect(isFolderOf(`/${'e'.repeat(250)}`, name)).toBe(false)
    expect(isFolderOf('/a/b', '-a-b')).toBe(true)
  })
})

describe('mount points', () => {
  test('fstab names its mount points, but the root, swap and comments', () => {
    const text = [
      '# /etc/fstab',
      'UUID=1 / ext4 defaults 0 1',
      'UUID=2 /mnt/data ext4 defaults 0 2',
      'srv:/home /home/shared\\040disk nfs defaults 0 0',
      'UUID=3 none swap sw 0 0',
      '',
    ].join('\n')
    expect(fstabMounts(text)).toEqual(['/mnt/data', '/home/shared disk'])
  })

  test('a gone path whose nearest folder is a listed mount point may be unmounted', () => {
    const t = tempHome()
    cleanups.push(t.cleanup)
    const data = join(t.home, 'data')
    mkdirSync(data)
    const path = join(data, 'dev', 'app')
    expect(unmounted(path, new Set())).toBe(false)
    expect(unmounted(path, new Set([data]))).toBe(true)
  })
})

describe('discover', () => {
  test('a live and a gone worktree: only the gone one is proposed, held and lost', async () => {
    const fx = fixture()
    fx.history(fx.live)
    const dir = fx.history(fx.gone)
    const s = await survey([fx.plugin()], fx.ctx)
    expect(s.warnings).toEqual([])
    expect(s.candidates).toHaveLength(1)
    expect(s.candidates[0]).toMatchObject({
      id: `claude-history:${dir}`,
      owner: AGENT_HISTORY_PLUGIN,
      path: dir,
      held: true,
      costDescription: 'lost',
      evidence: {
        kind: 'claude-history',
        path: dir,
        project: [fx.gone],
        sessions: ['0a1b2c3d-0000-4000-8000-000000000001.jsonl'],
      },
    })
    expect(s.objections).toContainEqual(
      expect.objectContaining({ candidate: `claude-history:${dir}`, code: DISCARD_USER_DATA }),
    )
    expect(refusals(s, `claude-history:${dir}`)).toEqual([])
  })

  test('is deleted only when picked and allowed discard-user-data', async () => {
    const fx = fixture()
    const keep = fx.history(fx.live)
    const dir = fx.history(fx.gone)
    const plugin = fx.plugin()
    const s = await survey([plugin], fx.ctx)
    const id = `claude-history:${dir}`

    const unpicked = await clean(plan(s), [plugin], fx.ctx)
    expect(unpicked.steps).toEqual([])
    const unallowed = await clean(plan(s, { pick: [id] }), [plugin], fx.ctx)
    expect(unallowed.steps).toEqual([])
    expect(existsSync(dir)).toBe(true)

    const ctx = { ...fx.ctx, allow: [DISCARD_USER_DATA] }
    const receipt = await clean(plan(s, { pick: [id], allow: [DISCARD_USER_DATA] }), [plugin], ctx)
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((st) => [st.id, st.result])).toEqual([[id, 'ok']])
    expect(receipt.steps[0]!.delete).toMatch(/^removed /)
    expect(existsSync(dir)).toBe(false)
    expect(existsSync(keep)).toBe(true)
  })

  test('the paths in sessions-index.json count as well as the transcripts', async () => {
    const fx = fixture()
    const dir = join(fx.projects, projectFolderName(fx.gone))
    mkdirSync(dir)
    writeFileSync(
      join(dir, 'sessions-index.json'),
      JSON.stringify({ version: 1, entries: [{ projectPath: fx.gone }] }),
    )
    const s = await survey([fx.plugin()], fx.ctx)
    expect(s.candidates.map((c) => c.id)).toEqual([`claude-history:${dir}`])
  })

  test('a folder whose name does not decode to a path is skipped, never guessed', async () => {
    const fx = fixture()
    // No transcript records a cwd.
    fx.history(join(fx.home, 'no-cwd'), { cwd: null })
    // Only Claude Code's memory, no transcript.
    mkdirSync(join(fx.projects, projectFolderName(join(fx.home, 'memory-only')), 'memory'), {
      recursive: true,
    })
    // Moved: its transcript names another path.
    fx.history(join(fx.home, 'moved'), { cwd: join(fx.home, 'elsewhere') })
    // A relative cwd.
    mkdirSync(join(fx.projects, 'a-b'))
    writeFileSync(join(fx.projects, 'a-b', 's.jsonl'), JSON.stringify({ cwd: 'a/b' }))
    // One transcript matches, another does not.
    const mixed = fx.history(fx.gone)
    writeFileSync(join(mixed, 's2.jsonl'), JSON.stringify({ cwd: fx.live }))

    const s = await survey([fx.plugin()], fx.ctx)
    expect(s.candidates).toEqual([])
    expect(decodeFolder(mixed)).toBeNull()
  })

  test('two gone paths that share a name are one candidate; one still there keeps it', async () => {
    const fx = fixture()
    const other = fx.gone.replace('gone_one', 'gone.one')
    const dir = fx.history(fx.gone)
    fx.history(other, { session: '0a1b2c3d-0000-4000-8000-000000000002' })
    expect(decodeFolder(dir)).toEqual({
      paths: [fx.gone, other].sort(),
      sessions: [
        '0a1b2c3d-0000-4000-8000-000000000001.jsonl',
        '0a1b2c3d-0000-4000-8000-000000000002.jsonl',
      ],
    })
    expect((await survey([fx.plugin()], fx.ctx)).candidates).toHaveLength(1)
    mkdirSync(other, { recursive: true })
    expect((await survey([fx.plugin()], fx.ctx)).candidates).toEqual([])
  })

  test('a path on a volume that is not mounted is not taken for gone', async () => {
    const fx = fixture()
    fx.history('/Volumes/host-cleaner-no-such-volume/dev/app')
    expect((await survey([fx.plugin()], fx.ctx)).candidates).toEqual([])
  })

  test('a gone path whose folder name Claude Code shortened is proposed', async () => {
    const fx = fixture()
    const gone = join(fx.home, 'dev', 'x'.repeat(240))
    const dir = join(fx.projects, `${projectFolderName(gone).slice(0, 200)}-k3j9x2`)
    mkdirSync(dir)
    writeFileSync(join(dir, 's.jsonl'), JSON.stringify({ cwd: gone }))
    expect((await survey([fx.plugin()], fx.ctx)).candidates.map((c) => c.path)).toEqual([dir])
  })

  test('stops when its signal has aborted', async () => {
    const fx = fixture()
    fx.history(fx.gone)
    const ctx = { ...fx.ctx, signal: AbortSignal.abort() }
    await expect(Promise.resolve(fx.plugin().discover(ctx))).rejects.toThrow(/stopped/)
  })

  test('a projects folder that is a link is read', async () => {
    const fx = fixture()
    const config = join(fx.home, 'linked-config')
    const synced = join(fx.home, 'synced-projects')
    mkdirSync(join(synced, projectFolderName(fx.gone)), { recursive: true })
    writeFileSync(
      join(synced, projectFolderName(fx.gone), 's.jsonl'),
      JSON.stringify({ cwd: fx.gone }),
    )
    mkdirSync(config)
    symlinkSync(synced, join(config, 'projects'))
    const plugin = fx.plugin(idle, { HOME: fx.home, CLAUDE_CONFIG_DIR: config })
    expect(await plugin.detect(fx.ctx)).toBe(true)
    expect((await survey([plugin], fx.ctx)).candidates).toHaveLength(1)
  })

  test('a path with no folder above it but the root is not taken for gone', async () => {
    const fx = fixture()
    fx.history('/host-cleaner-no-such-root/dev/app')
    expect((await survey([fx.plugin()], fx.ctx)).candidates).toEqual([])
  })

  test('a project folder that is a link is skipped', async () => {
    const fx = fixture()
    const real = join(fx.home, 'real-history')
    mkdirSync(real)
    writeFileSync(join(real, 's.jsonl'), JSON.stringify({ cwd: fx.gone }))
    symlinkSync(real, join(fx.projects, projectFolderName(fx.gone)))
    expect((await survey([fx.plugin()], fx.ctx)).candidates).toEqual([])
  })

  test('CLAUDE_CONFIG_DIR is read instead of ~/.claude', async () => {
    const fx = fixture()
    const config = join(fx.home, 'other-config')
    mkdirSync(join(config, 'projects', projectFolderName(fx.gone)), { recursive: true })
    writeFileSync(
      join(config, 'projects', projectFolderName(fx.gone), 's.jsonl'),
      JSON.stringify({ cwd: fx.gone }),
    )
    fx.history(fx.gone)
    const s = await survey([fx.plugin(idle, { HOME: fx.home, CLAUDE_CONFIG_DIR: config })], fx.ctx)
    expect(s.candidates.map((c) => c.path)).toEqual([
      join(config, 'projects', projectFolderName(fx.gone)),
    ])
  })

  test('not detected without a projects folder', async () => {
    const t = tempHome()
    cleanups.push(t.cleanup)
    const plugin = agentHistoryDefinition.create({
      settings: {},
      only: [],
      env: t.env,
      kit: pluginKit(AGENT_HISTORY_PLUGIN, { probe: idle }),
    })
    expect(await plugin.detect(fakeContext())).toBe(false)
  })
})

describe('a running session refuses its folder', () => {
  test('a live session whose cwd is the gone path, or whose transcript is in the folder', async () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const id = `claude-history:${dir}`
    fx.session(process.pid, { sessionId: 'x', cwd: fx.gone })
    expect(refusals(await survey([fx.plugin()], fx.ctx), id)).toEqual(['live-session'])

    fx.session(process.pid, { sessionId: '0a1b2c3d-0000-4000-8000-000000000001', cwd: '/x' })
    expect(refusals(await survey([fx.plugin()], fx.ctx), id)).toEqual(['live-session'])
  })

  test('a session record whose process is gone, or of another project, refuses nothing', async () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    fx.session(deadPid(), { sessionId: 'x', cwd: fx.gone })
    fx.session(process.pid, { sessionId: 'y', cwd: fx.live })
    expect(refusals(await survey([fx.plugin()], fx.ctx), `claude-history:${dir}`)).toEqual([])
  })

  test('a live session record that cannot be read refuses every folder', async () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    fx.session(process.pid, '{not json')
    expect(refusals(await survey([fx.plugin()], fx.ctx), `claude-history:${dir}`)).toEqual([
      'session-state-unreadable',
    ])
  })

  test('a process still in the gone folder, or a process table that cannot be read', async () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const id = `claude-history:${dir}`
    const holding: ProcessProbe = {
      alive: () => true,
      holders: (path) =>
        path === fx.gone ? [{ pid: 42, command: 'claude', hasChildren: false }] : [],
    }
    expect(refusals(await survey([fx.plugin(holding)], fx.ctx), id)).toEqual(['live-process'])
    const broken: ProcessProbe = {
      alive: () => true,
      holders: () => {
        throw new Error('lsof failed')
      },
    }
    expect(refusals(await survey([fx.plugin(broken)], fx.ctx), id)).toEqual([
      'process-table-unreadable',
    ])
    // A second recorded path still gives one refusal for the table.
    fx.history(fx.gone.replace('gone_one', 'gone.one'), {
      session: '0a1b2c3d-0000-4000-8000-000000000002',
    })
    expect(refusals(await survey([fx.plugin(broken)], fx.ctx), id)).toEqual([
      'process-table-unreadable',
    ])
  })

  test('a process whose working folder Linux reports as deleted', async () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const holding: ProcessProbe = {
      alive: () => true,
      holders: (path) =>
        path === `${fx.gone} (deleted)` ? [{ pid: 42, command: 'node', hasChildren: false }] : [],
    }
    const s = await survey([fx.plugin(holding)], fx.ctx)
    expect(refusals(s, `claude-history:${dir}`)).toEqual(['live-process'])
  })
})

describe('delete', () => {
  test('reads the folder again: a session started since the plan stops it', async () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const plugin = fx.plugin()
    const s = await survey([plugin], fx.ctx)
    fx.session(process.pid, { sessionId: 'x', cwd: fx.gone })
    await expect(deleting(plugin, s.candidates[0]!, fx.ctx)).rejects.toThrow(
      /is refused: a Claude Code session is running in it/,
    )
    expect(existsSync(dir)).toBe(true)
  })

  test('a folder recreated at the gone path makes it no longer a candidate', async () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const plugin = fx.plugin()
    const s = await survey([plugin], fx.ctx)
    mkdirSync(fx.gone, { recursive: true })
    await expect(deleting(plugin, s.candidates[0]!, fx.ctx)).rejects.toThrow(
      /no longer a candidate/,
    )
    expect(existsSync(dir)).toBe(true)
  })

  test('refuses a folder outside the projects folder, and leaves it', async () => {
    const fx = fixture()
    fx.history(fx.gone)
    const plugin = fx.plugin()
    const s = await survey([plugin], fx.ctx)
    const outside = join(fx.home, 'outside', projectFolderName(fx.gone))
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 's.jsonl'), JSON.stringify({ cwd: fx.gone }))
    const own = s.candidates[0] as PathCandidate
    const c: PathCandidate = { ...own, id: `claude-history:${outside}`, path: outside }
    await expect(deleting(plugin, c, fx.ctx)).rejects.toThrow(/not a Claude Code project folder/)
    expect(existsSync(join(outside, 's.jsonl'))).toBe(true)
  })

  test('passes the contract suite', async () => {
    const fx = fixture()
    fx.history(fx.live)
    fx.history(fx.gone)
    expect(await contractSuite(fx.plugin(), fx.ctx)).toEqual([])
  })
})
