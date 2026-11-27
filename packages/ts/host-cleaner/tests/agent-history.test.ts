/** The `agent-history` plugin over a temporary Claude Code folder and two project paths, one live and one gone. */

import { afterEach, describe, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs, { existsSync, mkdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
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

/** Whether `pid` exists, by `kill(pid, 0)`. */
const exists = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** No process works in any folder; a pid is alive while it exists. */
const idle: ProcessProbe = { alive: exists, holders: () => [] }

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
        env,
        kit: pluginKit(AGENT_HISTORY_PLUGIN, { probe, env }),
      }),
    ctx: fakeContext({ cwd: home, home, targets: [] }),
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
    expect(claudeConfigDir({}, '/w', '/h')).toBe('/h/.claude')
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '/c' }, '/w', '/h')).toBe('/c')
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '' }, '/w', '/h')).toBe('/h/.claude')
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: 'c' }, '/w', '/h')).toBe('/w/c')
    // The home folder is the one given, not HOME.
    expect(claudeConfigDir({ HOME: '/other' }, '/w', '/h')).toBe('/h/.claude')
    expect(claudeConfigDir({ HOME: '/other' }, '/w')).toBe(join(homedir(), '.claude'))
  })

  test('a name past 200 characters is its first 200 and a hash', () => {
    const path = `/${'d'.repeat(250)}`
    const name = `${projectFolderName(path).slice(0, 200)}-1a2b3c`
    expect(isFolderOf(path, name)).toBe(true)
    expect(isFolderOf(path, projectFolderName(path).slice(0, 200))).toBe(false)
    expect(isFolderOf(`/${'e'.repeat(250)}`, name)).toBe(false)
    expect(isFolderOf('/a/b', '-a-b')).toBe(true)
  })

  test('a name past 200 characters written whole, as a Claude Code that did not shorten it did', () => {
    const path = `/${'d'.repeat(210)}/x-y`
    expect(isFolderOf(path, projectFolderName(path))).toBe(true)
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

  test('a mount point written with a trailing slash is the folder', () => {
    const text = 'UUID=4 /mnt/data/ ext4 defaults 0 2\nUUID=5 // ext4 defaults 0 1'
    expect(fstabMounts(text)).toEqual(['/mnt/data'])
  })

  test.skipIf(process.platform === 'win32')(
    'a gone path on a volume that is mounted is not taken for one that is away',
    () => {
      // /dev is a volume mounted on the root's.
      expect(unmounted('/dev/host-cleaner-no-such/app', new Set(), ['/'])).toBe(false)
      expect(unmounted('/dev/host-cleaner-no-such/app', new Set(['/dev']), [])).toBe(false)
      // The mount folder itself is on the root's volume.
      expect(unmounted('/dev/host-cleaner-no-such/app', new Set(), ['/dev'])).toBe(true)
    },
  )

  test('a gone path whose nearest folder is a listed mount point may be unmounted', () => {
    const t = tempHome()
    cleanups.push(t.cleanup)
    const data = join(t.home, 'data')
    mkdirSync(data)
    const path = join(data, 'dev', 'app')
    expect(unmounted(path, new Set())).toBe(false)
    expect(unmounted(path, new Set([data]))).toBe(true)
  })

  test('a gone path whose nearest folder is an empty mount folder that fstab does not list may be unmounted', () => {
    const t = tempHome()
    cleanups.push(t.cleanup)
    const mnt = join(t.home, 'mnt')
    const usb = join(mnt, 'usb')
    mkdirSync(join(usb, 'someone'), { recursive: true })
    for (const above of [mnt, usb, join(usb, 'someone'), join(mnt, 'away')]) {
      expect(unmounted(join(above, 'dev', 'app'), new Set(), [mnt])).toBe(true)
    }
    expect(unmounted(join(usb, 'dev', 'app'), new Set(), [])).toBe(false)
    mkdirSync(`${mnt}-not`)
    expect(unmounted(join(`${mnt}-not`, 'dev', 'app'), new Set(), [mnt])).toBe(false)
  })

  test('a link above a gone path is followed to the mount folder', () => {
    const t = tempHome()
    cleanups.push(t.cleanup)
    const usb = join(t.home, 'mnt', 'usb')
    mkdirSync(usb, { recursive: true })
    symlinkSync(usb, join(t.home, 'linked'))
    symlinkSync(join(t.home, 'mnt', 'away'), join(t.home, 'dangling'))
    const path = join(t.home, 'linked', 'dev', 'app')
    expect(unmounted(path, new Set(), [])).toBe(false)
    expect(unmounted(path, new Set(), [join(t.home, 'mnt')])).toBe(true)
    expect(unmounted(path, new Set([usb]), [])).toBe(true)
    expect(unmounted(join(t.home, 'dangling', 'dev', 'app'), new Set(), [])).toBe(true)
    // A link in a mount folder that leads out of it still counts.
    symlinkSync(t.home, join(t.home, 'mnt', 'out'))
    expect(
      unmounted(join(t.home, 'mnt', 'out', 'dev', 'app'), new Set(), [join(t.home, 'mnt')]),
    ).toBe(true)
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

  test('a first cwd past a long first line is read, one past the read limit skips the folder', () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const long = (bytes: number, cwd: string): string =>
      [{ type: 'summary', text: 'x'.repeat(bytes) }, { cwd }]
        .map((r) => JSON.stringify(r))
        .join('\n')
    const file = join(dir, 'a.jsonl')
    for (const bytes of [40 * 1024, 300 * 1024, 3 * 1024 * 1024]) {
      writeFileSync(file, long(bytes, fx.gone))
      expect(decodeFolder(dir)?.paths).toEqual([fx.gone])
      // The folder is not deleted without a later `cwd` being checked.
      writeFileSync(file, long(bytes, fx.live))
      expect(decodeFolder(dir)).toBeNull()
    }
    writeFileSync(file, long(5 * 1024 * 1024, fx.gone))
    expect(decodeFolder(dir)).toBeNull()
  })

  test('a cwd line that ends with no line end right at the read limit is read', () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const last = JSON.stringify({ cwd: fx.gone })
    const pad = 4 * 1024 * 1024 - last.length - 1 - JSON.stringify({ text: '' }).length
    writeFileSync(join(dir, 'a.jsonl'), `${JSON.stringify({ text: 'x'.repeat(pad) })}\n${last}`)
    expect(decodeFolder(dir)?.paths).toEqual([fx.gone])
  })

  test('a transcript that gives no cwd beside one that does skips the folder', () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    writeFileSync(join(dir, 'b.jsonl'), JSON.stringify({ type: 'summary', summary: 'x' }))
    expect(decodeFolder(dir)).toBeNull()
  })

  test('a transcript is read no further than the part that gives its cwd', () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const file = join(dir, '0a1b2c3d-0000-4000-8000-000000000001.jsonl')
    fs.appendFileSync(file, `\n${'x'.repeat(1024 * 1024)}\n`)
    const read = vi.spyOn(fs, 'readSync')
    syncBuiltinESMExports()
    try {
      expect(decodeFolder(dir)?.paths).toEqual([fx.gone])
      const bytes = read.mock.results.map((r) => r.value as number)
      expect(bytes).toEqual([16 * 1024])
    } finally {
      read.mockRestore()
      syncBuiltinESMExports()
    }
  })

  test('a long first line that gives the cwd itself, and a last line with no line end, are read', () => {
    const fx = fixture()
    const dir = join(fx.projects, projectFolderName(fx.gone))
    mkdirSync(dir)
    const row = JSON.stringify({ cwd: fx.gone, text: 'x'.repeat(300 * 1024) })
    for (const text of [row, `${row}\n`, `${'x'.repeat(16 * 1024 - 1)}\n${row}`]) {
      writeFileSync(join(dir, 's.jsonl'), text)
      expect(decodeFolder(dir)?.paths).toEqual([fx.gone])
    }
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
    await expect(Promise.resolve(fx.plugin().discover!(ctx))).rejects.toThrow(/abort/i)
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

  test("~/.claude is in the run's home folder, not HOME's", async () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const plugin = fx.plugin(idle, { HOME: join(fx.home, 'decoy') })
    expect((await survey([plugin], fx.ctx)).candidates.map((c) => c.path)).toEqual([dir])
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

  test('a relative CLAUDE_CONFIG_DIR is under the folder the command runs in', async () => {
    const fx = fixture()
    const dir = join(fx.home, 'other-config', 'projects', projectFolderName(fx.gone))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 's.jsonl'), JSON.stringify({ cwd: fx.gone }))
    const plugin = fx.plugin(idle, { HOME: fx.home, CLAUDE_CONFIG_DIR: 'other-config' })
    const s = await survey([plugin], fx.ctx)
    expect(s.candidates.map((c) => c.path)).toEqual([dir])
    const elsewhere = { ...fx.ctx, cwd: join(fx.home, 'dev') }
    await expect(deleting(plugin, s.candidates[0]!, elsewhere)).rejects.toThrow(
      /not a Claude Code project folder/,
    )
    expect(existsSync(dir)).toBe(true)
  })

  test('not detected without a projects folder', async () => {
    const t = tempHome()
    cleanups.push(t.cleanup)
    const plugin = agentHistoryDefinition.create({
      settings: {},
      env: t.env,
      kit: pluginKit(AGENT_HISTORY_PLUGIN, { probe: idle }),
    })
    expect(await plugin.detect(fakeContext({ home: t.home }))).toBe(false)
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

  test('past 200 characters, a live session in a path the folder records refuses it, and one in another path with the same start does not', async () => {
    const fx = fixture()
    const base = join(fx.home, 'dev', 'x'.repeat(240))
    const gone = join(base, 'feature-a')
    const dir = join(fx.projects, `${projectFolderName(gone).slice(0, 200)}-k3j9x2`)
    mkdirSync(dir)
    writeFileSync(join(dir, 's.jsonl'), JSON.stringify({ cwd: gone }))
    const id = `claude-history:${dir}`
    fx.session(process.pid, { sessionId: 'x', cwd: join(base, 'feature-b') })
    expect(refusals(await survey([fx.plugin()], fx.ctx), id)).toEqual([])

    // `feature_a` gives the same name as `feature-a`.
    for (const cwd of [gone, join(base, 'feature_a')]) {
      fx.session(process.pid, { sessionId: 'x', cwd })
      expect(refusals(await survey([fx.plugin()], fx.ctx), id)).toEqual(['live-session'])
    }
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

  test('the process table is asked once per recorded path', async () => {
    const fx = fixture()
    fx.history(fx.gone)
    const asked: string[] = []
    const probe: ProcessProbe = {
      alive: exists,
      holders: (path) => {
        asked.push(path)
        return []
      },
    }
    await survey([fx.plugin(probe)], fx.ctx)
    expect(asked).toEqual([fx.gone])
  })

  test('a pid that started after its session record is another process, whatever the record says', async () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const started = Date.parse('2026-11-01T00:00:00Z')
    /** A pid that exists and started at `started`. */
    const probe: ProcessProbe = {
      alive: (pid, at) => exists(pid) && (at === undefined || Number(at) >= started),
      holders: () => [],
    }
    const refused = async (body: Record<string, unknown> | string, at: number) => {
      fx.session(process.pid, body)
      const when = new Date(at)
      utimesSync(join(fx.home, '.claude', 'sessions', `${process.pid}.json`), when, when)
      return refusals(await survey([fx.plugin(probe)], fx.ctx), `claude-history:${dir}`)
    }
    const before = started - 60_000
    const after = started + 1000
    const own = { sessionId: 'x', cwd: fx.gone }
    expect(await refused({ ...own, startedAt: before }, before)).toEqual([])
    expect(await refused(own, before)).toEqual([])
    expect(await refused('{not json', before)).toEqual([])
    expect(await refused({ ...own, startedAt: after }, before)).toEqual(['live-session'])
    // Written by the process since it started, though its `startedAt` is older.
    expect(await refused({ ...own, startedAt: before }, after)).toEqual(['live-session'])
    expect(await refused('{not json', after)).toEqual(['session-state-unreadable'])
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

  test('checks only the pids of sessions that may be the folder', async () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const other = deadPid()
    fx.session(other, { sessionId: 'y', cwd: fx.live })
    const asked: number[] = []
    const probe: ProcessProbe = {
      alive: (pid) => {
        asked.push(pid)
        return false
      },
      holders: () => [],
    }
    const plugin = fx.plugin(probe)
    const s = await survey([plugin], fx.ctx)
    expect(asked).toEqual([other])
    asked.length = 0
    const id = `claude-history:${dir}`
    const ctx = { ...fx.ctx, allow: [DISCARD_USER_DATA] }
    const receipt = await clean(plan(s, { pick: [id], allow: [DISCARD_USER_DATA] }), [plugin], ctx)
    expect(receipt.steps.map((st) => [st.id, st.result])).toEqual([[id, 'ok']])
    // Once by the re-check's survey of every folder, and not by `delete`.
    expect(asked).toEqual([other])
  })

  test('a transcript added since the plan stops it', async () => {
    const fx = fixture()
    const dir = fx.history(fx.gone)
    const plugin = fx.plugin()
    const s = await survey([plugin], fx.ctx)
    fx.history(fx.gone, { session: '0a1b2c3d-0000-4000-8000-000000000002' })
    await expect(deleting(plugin, s.candidates[0]!, fx.ctx)).rejects.toThrow(
      /changed since it was proposed/,
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
