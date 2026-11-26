import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  BUILT_IN_PLUGINS,
  DEFAULT_SELECTION,
  DELETE_LIMIT_MS,
  FatalRun,
  HOOK_LIMIT_MS,
  HookTimeout,
  DISCARD_USER_DATA,
  PLUGIN_API,
  SelectionError,
  clean,
  decide,
  decidePlan,
  parsePlan,
  plan,
  recheck,
  survey,
  type Candidate,
  type Objection,
  type PathCandidate,
  type Plugin,
  type RefCandidate,
  type RunCtx,
} from '../src/index.ts'

const ctx: RunCtx = { cwd: '/work', targets: [], allow: [] }

/** A ref candidate: the core makes no folder checks on it. */
const cand = (id: string, owner: string, extra: Partial<RefCandidate> = {}): Candidate => ({
  id,
  kind: id.split(':')[0]!,
  ref: id,
  owner,
  why: 'idle',
  evidence: { v: 1 },
  ...extra,
})

const pathCand = (
  id: string,
  owner: string,
  path: string,
  extra: Partial<PathCandidate> = {},
): Candidate => ({
  id,
  kind: id.split(':')[0]!,
  path,
  owner,
  why: 'idle',
  evidence: { v: 1 },
  ...extra,
})

/** A plugin that proposes `items`, deletes what it owns and logs every call. */
function fake(
  name: string,
  items: Candidate[],
  log: string[],
  extra: Partial<Plugin> = {},
): Plugin {
  return {
    name,
    detect: () => true,
    discover: () => items,
    prepare: (c) => void log.push(`${name}:prepare:${c.id}`),
    delete: (c) => {
      log.push(`${name}:delete:${c.id}`)
      return `removed ${c.id}`
    },
    deleted: (c) => void log.push(`${name}:deleted:${c.id}`),
    ...extra,
  }
}

const withoutDelete = (p: Plugin): Plugin => {
  const copy = { ...p }
  delete copy.delete
  return copy
}

/** A selection of exactly `ids`. */
const only = (ids: string[]) => ({ ...DEFAULT_SELECTION, select: ids })

const objection = (candidate: string, level: Objection['level'], code: string): Objection => ({
  by: 'x',
  candidate,
  level,
  code,
  reason: `${code} reason`,
})

const run = async (plugins: Plugin[], opts: { select?: string[]; allow?: string[] } = {}) => {
  const s = await survey(plugins, ctx)
  return await clean(plan(s, opts), plugins, { ...ctx, allow: opts.allow ?? [] })
}

describe('plugin order and duplicates', () => {
  test('the shipped plugins are one definition each, in run order: git, cargo, node, orca', () => {
    expect(BUILT_IN_PLUGINS.map((d) => d.name)).toEqual(['git', 'cargo', 'node', 'orca'])
    expect(BUILT_IN_PLUGINS.every((d) => d.api === PLUGIN_API)).toBe(true)
  })

  test('plugins run in the order given', async () => {
    const log: string[] = []
    const items = (name: string) => [cand(`a:${name}`, name)]
    const plugins = ['zzz', 'node', 'git'].map((name) => fake(name, items(name), log))
    const s = await survey(plugins, ctx)
    expect(s.plugins.map((p) => p.name)).toEqual(['zzz', 'node', 'git'])
    await clean(plan(s), plugins, ctx)
    expect(log.filter((l) => l.includes(':prepare:a:zzz'))).toEqual([
      'zzz:prepare:a:zzz',
      'node:prepare:a:zzz',
      'git:prepare:a:zzz',
    ])
  })

  test('a duplicate id keeps the first plugin in the list and warns, naming both', async () => {
    const log: string[] = []
    const s = await survey(
      [
        fake('node', [cand('artifact:/a', 'node')], log),
        fake('git', [cand('artifact:/a', 'git')], log),
      ],
      ctx,
    )
    expect(s.candidates.map((c) => c.owner)).toEqual(['node'])
    expect(s.warnings).toEqual(["duplicate artifact:/a: kept node's, dropped git's"])
  })

  test('two plugins on one folder give one candidate, the first plugin’s, with a warning naming both', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hc-overlap-')))
    const folder = join(dir, 'cache')
    mkdirSync(folder)
    symlinkSync(folder, join(dir, 'link'))
    const s = await survey(
      [
        fake('code', [pathCand(`cache:${folder}`, 'code', folder)], []),
        fake('desc', [pathCand(`dir:${dir}/link`, 'desc', join(dir, 'link'))], []),
      ],
      { ...ctx, targets: [dir] },
    )
    expect(s.candidates.map((c) => c.id)).toEqual([`cache:${folder}`])
    expect(s.warnings).toEqual([
      `duplicate ${folder}: kept code's cache:${folder}, dropped desc's dir:${dir}/link`,
    ])
  })

  test('a second plugin of the same name is left out with a warning', async () => {
    const s = await survey(
      [fake('cache', [cand('a:1', 'cache')], []), fake('cache', [cand('a:2', 'cache')], [])],
      ctx,
    )
    expect(s.candidates.map((c) => c.id)).toEqual(['a:1'])
    expect(s.warnings).toEqual(['cache: a second plugin of that name was left out'])
  })

  test('a plugin that mutates a candidate it returns cannot move the plan under the re-check', async () => {
    const shared = cand('a:1', 'cache', { evidence: { v: 0 } })
    let calls = 0
    const mutating = fake('cache', [], [], {
      discover: () => ((shared.evidence.v = ++calls), [shared]),
    })
    const receipt = await clean(plan(await survey([mutating], ctx)), [mutating], ctx)
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['changed'])
  })

  test('a candidate naming another plugin as owner is dropped', async () => {
    const s = await survey([fake('git', [cand('worktree:/a', 'node')], [])], ctx)
    expect(s.candidates).toEqual([])
    expect(s.warnings[0]).toMatch(/dropped worktree:\/a, which names node/)
  })

  test('a plugin whose detect throws is left out with a warning', async () => {
    const bad = {
      ...fake('node', [], []),
      detect: () => {
        throw new Error('no stat')
      },
    }
    const s = await survey([bad, fake('git', [cand('a:1', 'git')], [])], ctx)
    expect(s.candidates).toHaveLength(1)
    expect(s.warnings).toEqual(['node: detect failed: no stat'])
  })

  test('detect may answer { active, note }: the note is kept on the survey, whether the plugin runs or not', async () => {
    const degraded = fake('orca', [cand('a:1', 'orca')], [], {
      detect: () => ({ active: true, note: 'installed but not running' }),
    })
    const off = fake('cargo', [cand('a:2', 'cargo')], [], {
      detect: async () => ({ active: false, note: 'no cargo on PATH' }),
    })
    const plain = fake('git', [cand('a:3', 'git')], [], { detect: () => ({ active: true }) })
    const s = await survey([degraded, off, plain], ctx)
    expect(s.plugins.map((p) => p.name)).toEqual(['orca', 'git'])
    expect(s.candidates.map((c) => c.id)).toEqual(['a:1', 'a:3'])
    expect(s.notes).toEqual({ orca: 'installed but not running', cargo: 'no cargo on PATH' })
    expect(s.warnings).toEqual([])
    expect(JSON.parse(JSON.stringify(s.notes))).toEqual(s.notes)
  })

  test('a detect answer of another shape leaves the plugin out with a warning', async () => {
    const answers: unknown[] = [1, 'yes', null, { note: 'x' }, { active: true, note: 7 }]
    for (const answer of answers) {
      const odd = fake('odd', [cand('a:1', 'odd')], [], { detect: () => answer as boolean })
      const s = await survey([odd], ctx)
      expect(s.plugins).toEqual([])
      expect(s.notes).toEqual({})
      expect(s.warnings).toEqual([
        `odd: detect answered ${JSON.stringify(answer)}, which is neither a boolean nor { active, note? }; it was left out`,
      ])
    }
  })

  test('every hook sees targetsGiven, false when the run leaves it unset', async () => {
    const seen: boolean[] = []
    const p = fake('git', [], [], {
      detect: (c) => (seen.push(c.targetsGiven), true),
      discover: (c) => (seen.push(c.targetsGiven), []),
    })
    await survey([p], ctx)
    await survey([p], { ...ctx, targetsGiven: true })
    expect(seen).toEqual([false, false, true, true])
  })

  test('scope adds roots before discover, once', async () => {
    const seen: string[][] = []
    const scoping = fake('orca', [], [], {
      scope: () => ['/r1', '/r1'],
      discover: (c) => (seen.push([...c.targets]), []),
    })
    await survey([scoping, fake('git', [], [], { scope: () => ['/r1', '/r2'] })], {
      ...ctx,
      targets: ['/r0'],
    })
    expect(seen).toEqual([['/r0', '/r1', '/r2']])
  })
})

describe('objection levels', () => {
  const cs = [cand('a:1', 'git'), cand('a:2', 'git'), cand('a:3', 'git'), cand('a:4', 'git')]
  const os = [
    objection('a:2', 'refuse', 'live'),
    objection('a:3', 'protest', 'lossy'),
    objection('a:4', 'note', 'fyi'),
  ]

  test('by default, only candidates with no refuse and no protest run; a note does not gate', () => {
    const d = decide(cs, os, DEFAULT_SELECTION, [])
    expect(d.run.map((c) => c.id)).toEqual(['a:1', 'a:4'])
    expect(d.dropped).toEqual([])
  })

  test('by default, a candidate its owner marked held does not run; a pick adds it', () => {
    const held = [cand('a:1', 'git', { held: true }), cand('a:2', 'git')]
    expect(decide(held, [], DEFAULT_SELECTION, []).run.map((c) => c.id)).toEqual(['a:2'])
    expect(
      decide(held, [], { ...DEFAULT_SELECTION, pick: ['a:1'] }, []).run.map((c) => c.id),
    ).toEqual(['a:2', 'a:1'])
    expect(decide(held, [], only(['a:1']), []).run.map((c) => c.id)).toEqual(['a:1'])
  })

  test('by default, a protest that is granted does not keep a candidate out', () => {
    expect(decide(cs, os, DEFAULT_SELECTION, ['lossy']).run.map((c) => c.id)).toEqual([
      'a:1',
      'a:3',
      'a:4',
    ])
  })

  test('a selected refused candidate is blocked whatever is allowed', () => {
    const d = decide(cs, os, only(['a:2']), ['live', 'lossy'])
    expect(d.dropped).toEqual([{ id: 'a:2', reason: 'blocked', detail: 'x: live reason' }])
  })

  test('a protest needs its code allowed', () => {
    expect(decide(cs, os, only(['a:3']), []).dropped).toEqual([
      { id: 'a:3', reason: 'not-allowed', detail: 'needs --allow lossy' },
    ])
    expect(decide(cs, os, only(['a:3']), ['lossy']).run.map((c) => c.id)).toEqual(['a:3'])
  })

  test('a candidate with both a path and a ref, or neither, is dropped with a warning', async () => {
    const both = { ...pathCand('a:both', 'a', '/x'), ref: 'x' } as unknown as Candidate
    const neither = { ...cand('a:neither', 'a'), ref: undefined } as unknown as Candidate
    const s = await survey([fake('a', [both, neither, cand('a:ok', 'a')], [])], ctx)
    expect(s.candidates.map((c) => c.id)).toEqual(['a:ok'])
    expect(s.warnings).toEqual([
      'a: dropped a:both, which must have one of a path and a ref',
      'a: dropped a:neither, which must have one of a path and a ref',
    ])
  })

  test('a path or ref that is not a string, or a path with an at, is dropped, not thrown on', async () => {
    const odd = [
      { ...cand('a:null-path', 'a'), path: null },
      { ...pathCand('a:null-ref', 'a', '/x'), ref: null },
      { ...pathCand('a:path-at', 'a', '/x'), at: '/x' },
      { ...cand('a:number-at', 'a'), at: 7 },
    ] as unknown as Candidate[]
    const s = await survey([fake('a', [...odd, cand('a:ok', 'a')], [])], ctx)
    expect(s.candidates.map((c) => c.id)).toEqual(['a:ok'])
    expect(s.warnings).toEqual([
      'a: dropped a:null-path, which must have one of a path and a ref',
      'a: dropped a:null-ref, which must have one of a path and a ref',
      'a: dropped a:path-at, a path candidate with an at, which only a ref may have',
      'a: dropped a:number-at, whose at is not a path',
    ])
  })

  test('a scope or discover that answers no list, or a list entry of the wrong kind, is warned of, not thrown on', async () => {
    const none = fake('a', [], [], {
      scope: async () => undefined as unknown as string[],
      discover: async () => undefined as unknown as Candidate[],
    })
    const odd = fake('b', [7, null, cand('b:ok', 'b')] as unknown as Candidate[], [], {
      scope: () => [7] as unknown as string[],
    })
    const s = await survey([none, odd], ctx)
    expect(s.candidates.map((c) => c.id)).toEqual(['b:ok'])
    expect(s.warnings).toEqual([
      'a: scope answered undefined, which is not a list; it proposed nothing',
      'b: scope: left out 7, which is not a path',
      'a: discover answered undefined, which is not a list; it proposed nothing',
      'b: dropped 7, which is not a candidate',
      'b: dropped null, which is not a candidate',
    ])
  })

  test('a lost candidate is held and protested discard-user-data; rebuild and re-download are not', async () => {
    const items = [
      cand('a:lost', 'a', { costDescription: 'lost' }),
      cand('a:built', 'a', { costDescription: 'rebuild' }),
      cand('a:fetched', 'a', { costDescription: 're-download' }),
    ]
    const s = await survey([fake('a', items, [])], ctx)
    expect(s.candidates.map((c) => [c.id, c.held])).toEqual([
      ['a:lost', true],
      ['a:built', undefined],
      ['a:fetched', undefined],
    ])
    expect(s.objections).toEqual([
      {
        by: 'host-cleaner',
        candidate: 'a:lost',
        level: 'protest',
        code: DISCARD_USER_DATA,
        reason: 'deleting it loses data that cannot be fetched or built again',
      },
    ])
    expect(decide(s.candidates, s.objections, DEFAULT_SELECTION, [DISCARD_USER_DATA]).run).toEqual([
      items[1],
      items[2],
    ])
  })

  test('a candidate with an unknown costDescription is dropped with a warning', async () => {
    const odd = cand('a:odd', 'a', { costDescription: 'free' as 'lost' })
    const s = await survey([fake('a', [odd, cand('a:ok', 'a')], [])], ctx)
    expect(s.candidates.map((c) => c.id)).toEqual(['a:ok'])
    expect(s.warnings).toEqual([
      expect.stringMatching(/^a: dropped a:odd, whose costDescription a plan refuses: /),
    ])
  })

  test('a candidate a plan would refuse is dropped, so a plan of the survey reads back', async () => {
    const odd = cand('a:bytes', 'a', { bytes: '10' as unknown as number })
    const s = await survey([fake('a', [odd, cand('a:ok', 'a')], [])], ctx)
    expect(s.candidates.map((c) => c.id)).toEqual(['a:ok'])
    expect(s.warnings).toEqual([
      expect.stringMatching(/^a: dropped a:bytes, whose bytes a plan refuses: /),
    ])
    expect(parsePlan(JSON.stringify(plan(s)), 'plan.json').candidates).toHaveLength(1)
  })

  test('a limit that is not a positive number warns and falls back to the default', async () => {
    const slow: Plugin = {
      ...fake('a', [cand('a:ok', 'a')], []),
      limits: { discover: Number.NaN },
      discover: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return [cand('a:ok', 'a')]
      },
    }
    const s = await survey([slow], ctx)
    expect(s.candidates.map((c) => c.id)).toEqual(['a:ok'])
    expect(s.warnings).toEqual([
      'a: limits.discover is NaN, not a positive number of milliseconds; the default was used',
    ])
  })

  test('a spare of the folder a ref candidate is at spares it', () => {
    const rec = cand('orca:1', 'orca', { at: '/home/me/orca/x' })
    const d = decide([rec], [], { select: null, pick: [], spare: ['/home/me/orca/x'] }, [])
    expect(d.run).toEqual([])
    expect(d.dropped).toEqual([
      { id: 'orca:1', reason: 'spared', detail: '--spare /home/me/orca/x' },
    ])
  })

  test('a saved plan keeps each candidate’s costDescription', async () => {
    const s = await survey([fake('a', [cand('a:lost', 'a', { costDescription: 'lost' })], [])], ctx)
    const back = parsePlan(JSON.stringify(plan(s)), 'plan.json')
    expect(back.candidates[0]).toMatchObject({ costDescription: 'lost', held: true })
  })

  test('a plugin cannot object under another name, or to a candidate nobody proposed', async () => {
    const lying: Plugin = {
      name: 'cargo',
      detect: () => true,
      object: () => [objection('worktree:/a', 'refuse', 'x'), objection('nope', 'refuse', 'x')],
    }
    const s = await survey([fake('git', [cand('worktree:/a', 'git')], []), lying], ctx)
    expect(s.objections).toEqual([
      { by: 'cargo', candidate: 'worktree:/a', level: 'refuse', code: 'x', reason: 'x reason' },
    ])
  })

  test('an objection a plan would refuse refuses its candidate instead, and the plan reads back', async () => {
    const odd: Plugin = {
      name: 'node',
      detect: () => true,
      object: () => [
        { candidate: 'a:1', level: 'warn', code: 'x', reason: 'y' } as unknown as Objection,
        { candidate: 'a:2', level: 'refuse', code: 'x' } as unknown as Objection,
        objection('a:3', 'note', 'fine'),
      ],
    }
    const cs = ['a:1', 'a:2', 'a:3'].map((id) => cand(id, 'git'))
    const s = await survey([fake('git', cs, []), odd], ctx)
    expect(s.objections).toMatchObject([
      { by: 'node', candidate: 'a:1', level: 'refuse', code: 'plugin-error' },
      { by: 'node', candidate: 'a:2', level: 'refuse', code: 'plugin-error' },
      { by: 'node', candidate: 'a:3', level: 'note', code: 'fine' },
    ])
    expect(s.warnings).toEqual([
      expect.stringMatching(
        /^node: object answered an objection to a:1 whose level a plan refuses/,
      ),
      expect.stringMatching(
        /^node: object answered an objection to a:2 whose reason a plan refuses/,
      ),
    ])
    const back = parsePlan(JSON.stringify(plan(s)), 'plan.json')
    expect(decidePlan(back).run.map((c) => c.id)).toEqual(['a:3'])
  })

  test('a plugin whose object throws refuses every candidate', async () => {
    const broken: Plugin = {
      name: 'node',
      detect: () => true,
      object: () => {
        throw new Error('boom')
      },
    }
    const s = await survey([fake('git', [cand('a:1', 'git')], []), broken], ctx)
    expect(s.objections).toMatchObject([{ by: 'node', level: 'refuse', code: 'plugin-error' }])
    expect(s.warnings).toEqual(['node: object failed: boom'])
  })
})

describe('pick, select and spare', () => {
  const branch = cand('branch:/r:feat/x', 'git', { ref: 'feat/x', at: '/r', name: 'feat/x' })
  const tree = pathCand('worktree:/w/x', 'git', '/w/x', { name: 'feat/x' })
  const other = pathCand('artifact:/r/target', 'cargo', '/r/target')
  const cs = [branch, tree, other]
  const ran = (sel: Partial<typeof DEFAULT_SELECTION>) =>
    decide(cs, [], { ...DEFAULT_SELECTION, ...sel }, [])

  test('a pick adds to the default; a selection replaces it', () => {
    const held = [...cs, cand('orca-record:9', 'orca', { held: true })]
    const pick = decide(held, [], { ...DEFAULT_SELECTION, pick: ['orca-record:9'] }, [])
    expect(pick.run.map((c) => c.id)).toEqual([...cs.map((c) => c.id), 'orca-record:9'])
    const select = decide(held, [], { ...DEFAULT_SELECTION, select: ['orca-record:9'] }, [])
    expect(select.run.map((c) => c.id)).toEqual(['orca-record:9'])
  })

  test('a name spares every candidate of that name, a branch and the worktree that has it', () => {
    const d = ran({ spare: ['feat/x'] })
    expect(d.run.map((c) => c.id)).toEqual(['artifact:/r/target'])
    expect(d.dropped).toEqual([
      { id: 'branch:/r:feat/x', reason: 'spared', detail: '--spare feat/x' },
      { id: 'worktree:/w/x', reason: 'spared', detail: '--spare feat/x' },
    ])
  })

  test('an id or a path spares that candidate; a glob matches ids, paths and names', () => {
    expect(ran({ spare: ['worktree:/w/x'] }).run.map((c) => c.id)).toEqual([
      'branch:/r:feat/x',
      'artifact:/r/target',
    ])
    expect(ran({ spare: ['/r/target'] }).run.map((c) => c.id)).toEqual([
      'branch:/r:feat/x',
      'worktree:/w/x',
    ])
    expect(ran({ spare: ['feat/*'] }).run.map((c) => c.id)).toEqual(['artifact:/r/target'])
    expect(ran({ spare: ['/r/**'] }).run.map((c) => c.id)).toEqual([
      'branch:/r:feat/x',
      'worktree:/w/x',
    ])
    expect(ran({ spare: ['nothing-*'] }).dropped).toEqual([])
  })

  test('a branch is spared by its old path, `<repo>:<branch>`, and a glob over it', () => {
    expect(ran({ spare: ['/r:feat/x'] }).dropped).toEqual([
      { id: 'branch:/r:feat/x', reason: 'spared', detail: '--spare /r:feat/x' },
    ])
    expect(ran({ spare: ['/r:feat/*'] }).run.map((c) => c.id)).toEqual([
      'worktree:/w/x',
      'artifact:/r/target',
    ])
  })

  test('a spare wins over a pick of something it matches', () => {
    const d = ran({ pick: ['worktree:/w/x'], spare: ['feat/*'] })
    expect(d.run.map((c) => c.id)).toEqual(['artifact:/r/target'])
  })

  test('a plan refuses an id both picked and spared', () => {
    const s = { candidates: cs, objections: [], warnings: [] }
    expect(() => plan(s, { pick: ['worktree:/w/x'], spare: ['worktree:/w/x'] })).toThrow(
      new SelectionError('worktree:/w/x is both picked and spared'),
    )
  })

  test('a dependent of a spared candidate is blocked', () => {
    const dependent = cand('branch:/r:y', 'git', { requires: ['worktree:/w/x'] })
    const d = decide([...cs, dependent], [], { ...DEFAULT_SELECTION, spare: ['/w/x'] }, [])
    expect(d.dropped.map((x) => [x.id, x.reason])).toEqual([
      ['worktree:/w/x', 'spared'],
      ['branch:/r:y', 'blocked'],
    ])
  })
})

describe('requires', () => {
  const tree = cand('worktree:/w', 'git')
  const branch = cand('branch:b', 'git', { requires: ['worktree:/w'] })

  test('a requirement is deleted before its dependent, whatever the discovery order', async () => {
    const log: string[] = []
    const receipt = await run([fake('git', [branch, tree], log)])
    expect(receipt.steps.map((s) => s.id)).toEqual(['worktree:/w', 'branch:b'])
    expect(receipt.status).toBe('complete')
  })

  test('a dependent of a refused candidate is blocked, and so is its own dependent', () => {
    const leaf = cand('leaf:l', 'git', { requires: ['branch:b'] })
    const d = decide(
      [tree, branch, leaf],
      [objection('worktree:/w', 'refuse', 'live')],
      only(['branch:b', 'leaf:l']),
      [],
    )
    expect(d.run).toEqual([])
    expect(d.dropped.map((x) => [x.id, x.reason])).toEqual([
      ['branch:b', 'blocked'],
      ['leaf:l', 'blocked'],
    ])
  })

  test('a dependent whose requirement is not selected is blocked, and says to pick it', () => {
    const d = decide([tree, branch], [], only(['branch:b']), [])
    expect(d.dropped).toEqual([
      {
        id: 'branch:b',
        reason: 'blocked',
        detail: 'requires worktree:/w, which needs --pick worktree:/w',
      },
    ])
  })

  test('a blocked dependent says what would let each requirement run', () => {
    const held = cand('a:held', 'git', { held: true })
    const lost = cand('a:lost', 'git', { held: true })
    const protested = cand('a:protested', 'git')
    const refused = cand('a:refused', 'git')
    const spared = cand('a:spared', 'git')
    const ids = [held, lost, protested, refused, spared].map((c) => c.id)
    const outer = cand('a:outer', 'git', { requires: [...ids, 'a:missing'] })
    const top = cand('a:top', 'git', { requires: [outer.id] })
    const objections = [
      objection(lost.id, 'protest', 'discard-user-data'),
      objection(protested.id, 'protest', 'unmeasured'),
      objection(refused.id, 'refuse', 'live-process'),
    ]
    const d = decide(
      [held, lost, protested, refused, spared, outer, top],
      objections,
      { ...DEFAULT_SELECTION, spare: [spared.id] },
      [],
    )
    const why = [
      'requires a:held, which needs --pick a:held',
      'requires a:lost, which needs --pick a:lost --allow discard-user-data',
      'requires a:protested, which needs --allow unmeasured',
      'requires a:refused, which is refused (x: live-process reason)',
      'requires a:spared, which is spared (--spare a:spared)',
      'requires a:missing, which is gone',
    ].join('; ')
    expect(d.dropped).toEqual([
      { id: spared.id, reason: 'spared', detail: `--spare ${spared.id}` },
      { id: outer.id, reason: 'blocked', detail: why },
      { id: top.id, reason: 'blocked', detail: `requires a:outer, which is blocked: ${why}` },
    ])
  })

  test('requirements that form a cycle are blocked, with whatever requires them', () => {
    const a = cand('a:a', 'git', { requires: ['a:b'] })
    const b = cand('a:b', 'git', { requires: ['a:a'] })
    const c = cand('a:c', 'git', { requires: ['a:a'] })
    const d = decide([a, b, c, cand('a:d', 'git')], [], DEFAULT_SELECTION, [])
    expect(d.run.map((x) => x.id)).toEqual(['a:d'])
    expect(d.dropped.map((x) => x.id).sort()).toEqual(['a:a', 'a:b', 'a:c'])
  })

  test('a failed requirement skips its dependent and leaves the rest', async () => {
    const log: string[] = []
    const other = cand('artifact:/o', 'git')
    const git = fake('git', [tree, branch, other], log, {
      delete: (c) => {
        if (c.id === 'worktree:/w') throw new Error('directory busy')
        return 'ok'
      },
    })
    const receipt = await run([git])
    expect(receipt.steps.map((s) => [s.id, s.result])).toEqual([
      ['worktree:/w', 'failed'],
      ['branch:b', 'skipped'],
      ['artifact:/o', 'ok'],
    ])
    expect(receipt.steps[0]!.error).toBe('directory busy')
    expect(receipt.steps[1]!.error).toBe('requires worktree:/w, which did not complete')
    expect(receipt.status).toBe('failed')
  })
})

describe('nested candidates', () => {
  // A real target, so containment passes and only the objections below gate.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hc-nested-')))
  const at: RunCtx = { ...ctx, targets: [dir] }
  const w = join(dir, 'w')
  const tree = pathCand(`worktree:${w}`, 'git', w, { name: 'feat' })
  const target = pathCand(`artifact:${w}/target`, 'cargo', join(w, 'target'))
  const deps = pathCand(`artifact:${w}/a/node_modules`, 'node', join(w, 'a', 'node_modules'))
  const plugins = (...extra: Plugin[]) => [
    fake('git', [tree], []),
    fake('cargo', [target], []),
    fake('node', [deps], []),
    ...extra,
  ]

  test('both stay, and the outer requires every candidate inside it, with no warning', async () => {
    const branch = cand('branch:b', 'git', { requires: [tree.id] })
    const s = await survey(
      [fake('git', [branch, tree], []), fake('cargo', [target], []), fake('node', [deps], [])],
      at,
    )
    expect(s.candidates.map((c) => [c.id, c.requires])).toEqual([
      ['branch:b', [tree.id]],
      [tree.id, [target.id, deps.id]],
      [target.id, undefined],
      [deps.id, undefined],
    ])
    expect(s.warnings).toEqual([])
    expect(s.objections).toEqual([])
    expect(tree.requires).toBeUndefined()
  })

  test('the inner ones are deleted first', async () => {
    const receipt = await clean(plan(await survey(plugins(), at)), plugins(), at)
    expect(receipt.steps.map((s) => s.id)).toEqual([target.id, deps.id, tree.id])
  })

  test('a refused target/ refuses its worktree', async () => {
    const live: Plugin = {
      name: 'live',
      detect: () => true,
      object: () => [objection(target.id, 'refuse', 'live-process')],
    }
    const s = await survey(plugins(live), at)
    const d = decide(s.candidates, s.objections, DEFAULT_SELECTION, [])
    expect(d.run.map((c) => c.id)).toEqual([deps.id])
    const d2 = decide(s.candidates, s.objections, only([tree.id, target.id]), [])
    expect(d2.run).toEqual([])
    expect(d2.dropped).toEqual([
      { id: target.id, reason: 'blocked', detail: 'live: live-process reason' },
      {
        id: tree.id,
        reason: 'blocked',
        detail:
          `requires ${target.id}, which is refused (live: live-process reason); ` +
          `requires ${deps.id}, which needs --pick ${deps.id}`,
      },
    ])
  })

  test('a spared inner one keeps its outer one too', async () => {
    const s = await survey(plugins(), at)
    const d = decide(s.candidates, [], { ...DEFAULT_SELECTION, spare: [join(w, 'target')] }, [])
    expect(d.run.map((c) => c.id)).toEqual([deps.id])
    expect(d.dropped.map((x) => [x.id, x.reason])).toEqual([
      [target.id, 'spared'],
      [tree.id, 'blocked'],
    ])
  })
})

describe('re-check', () => {
  const planWith = async (plugin: Plugin, opts: { select?: string[]; allow?: string[] } = {}) =>
    plan(await survey([plugin], ctx), opts)
  const mutable = (items: Candidate[], objections: () => Objection[] = () => []): Plugin => ({
    name: 'git',
    detect: () => true,
    discover: () => items,
    object: objections,
  })

  test('gone: no plugin proposes it now', async () => {
    const items = [cand('a:1', 'git')]
    const p = await planWith(mutable(items))
    const r = await recheck(p, [mutable([])], ctx)
    expect(r.decision.dropped).toEqual([
      { id: 'a:1', reason: 'gone', detail: 'no plugin proposes it now' },
    ])
  })

  test('blocked: a refusal appeared since the plan', async () => {
    const p = await planWith(mutable([cand('a:1', 'git')]))
    const r = await recheck(
      p,
      [mutable([cand('a:1', 'git')], () => [objection('a:1', 'refuse', 'live')])],
      ctx,
    )
    expect(r.decision.dropped.map((d) => d.reason)).toEqual(['blocked'])
  })

  test('not-allowed: a protest appeared that nobody granted', async () => {
    const p = await planWith(mutable([cand('a:1', 'git')]))
    const r = await recheck(
      p,
      [mutable([cand('a:1', 'git')], () => [objection('a:1', 'protest', 'lossy')])],
      ctx,
    )
    expect(r.decision.dropped.map((d) => d.reason)).toEqual(['not-allowed'])
  })

  test('changed: the evidence moved; a missing key counts as null', async () => {
    const p = await planWith(mutable([cand('a:1', 'git', { evidence: { sha: 'a', pr: null } })]))
    const same = await recheck(p, [mutable([cand('a:1', 'git', { evidence: { sha: 'a' } })])], ctx)
    expect(same.decision.run.map((c) => c.id)).toEqual(['a:1'])
    const moved = await recheck(p, [mutable([cand('a:1', 'git', { evidence: { sha: 'b' } })])], ctx)
    expect(moved.decision.dropped.map((d) => d.reason)).toEqual(['changed'])
  })

  test('a candidate that changed drops its dependents', async () => {
    const items = (sha: string) => [
      cand('worktree:/w', 'git', { evidence: { sha } }),
      cand('branch:b', 'git', { requires: ['worktree:/w'] }),
    ]
    const p = await planWith(mutable(items('a')))
    const r = await recheck(p, [mutable(items('b'))], ctx)
    expect(r.decision.dropped.map((d) => [d.id, d.reason])).toEqual([
      ['worktree:/w', 'changed'],
      ['branch:b', 'blocked'],
    ])
    // The receipt names the requirement and why it no longer runs.
    const receipt = await clean(p, [mutable(items('b'))], ctx)
    expect(receipt.dropped[1]).toEqual({
      id: 'branch:b',
      reason: 'blocked',
      detail: 'requires worktree:/w, which is changed: its evidence moved since the plan',
    })
  })

  test('clean deletes nothing it dropped', async () => {
    const log: string[] = []
    const p = await planWith(fake('git', [cand('a:1', 'git')], []))
    const receipt = await clean(p, [fake('git', [], log)], ctx)
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['gone'])
    expect(log).toEqual([])
  })
})

describe('prepare, delete and deleted', () => {
  test('a plugin that throws in the re-check leaves a failed receipt and rethrows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-recheck-'))
    const receiptPath = join(dir, 'receipt.json')
    let reads = 0
    const flaky = fake('git', [cand('a:1', 'git')], [], {
      discover: () => {
        if (++reads > 1) throw new FatalRun('cannot read')
        return [cand('a:1', 'git')]
      },
    })
    const p = plan(await survey([flaky], ctx), {})
    await expect(clean(p, [flaky], ctx, { receiptPath })).rejects.toThrow('cannot read')
    expect(JSON.parse(readFileSync(receiptPath, 'utf8'))).toMatchObject({
      status: 'failed',
      steps: [],
    })
  })

  test('every plugin prepares, the owner deletes, the others are told', async () => {
    const log: string[] = []
    const receipt = await run([
      fake('git', [cand('worktree:/w', 'git')], log),
      withoutDelete(fake('orca', [], log)),
    ])
    expect(log).toEqual([
      'git:prepare:worktree:/w',
      'orca:prepare:worktree:/w',
      'git:delete:worktree:/w',
      'orca:deleted:worktree:/w',
    ])
    expect(receipt.steps).toEqual([
      {
        id: 'worktree:/w',
        owner: 'git',
        preparedBy: ['git', 'orca'],
        result: 'ok',
        delete: 'removed worktree:/w',
        error: null,
        notified: [{ plugin: 'orca', error: null }],
      },
    ])
  })

  test('a prepare failure stops only that candidate; the next one runs', async () => {
    const log: string[] = []
    const orca = fake('orca', [], log, {
      prepare: (c) => {
        if (c.id === 'a:1') throw new Error('terminal would not close')
      },
    })
    const receipt = await run([fake('git', [cand('a:1', 'git'), cand('a:2', 'git')], log), orca])
    expect(receipt.steps.map((s) => [s.id, s.result, s.delete])).toEqual([
      ['a:1', 'failed', null],
      ['a:2', 'ok', 'removed a:2'],
    ])
    expect(receipt.steps[0]).toMatchObject({
      preparedBy: ['git'],
      error: 'orca: prepare failed: terminal would not close',
    })
    expect(log).not.toContain('git:delete:a:1')
    expect(log).not.toContain('git:deleted:a:1')
  })

  test('a FatalRun in prepare stops the run: the rest are skipped, nothing more is deleted', async () => {
    const log: string[] = []
    const git = fake('git', [cand('a:1', 'git'), cand('a:2', 'git')], log, {
      prepare: () => {
        throw new FatalRun('archive push failed')
      },
    })
    const receipt = await run([git])
    expect(receipt.steps.map((s) => [s.id, s.result])).toEqual([
      ['a:1', 'failed'],
      ['a:2', 'skipped'],
    ])
    expect(receipt.steps[1]!.error).toBe(
      'the run stopped: git: prepare failed: archive push failed',
    )
    expect(receipt.status).toBe('failed')
    expect(log).toEqual([])
  })

  test('a FatalRun in delete stops the run too', async () => {
    const git = fake('git', [cand('a:1', 'git'), cand('a:2', 'git')], [], {
      delete: () => {
        throw new FatalRun('disk gone')
      },
    })
    const receipt = await run([git])
    expect(receipt.steps.map((s) => s.result)).toEqual(['failed', 'skipped'])
  })

  test('deleted failures are recorded and neither fail the step nor stop the others', async () => {
    const log: string[] = []
    const receipt = await run([
      fake('git', [cand('a:1', 'git')], log),
      fake('cargo', [], log),
      fake('orca', [], log, {
        deleted: () => {
          throw new Error('forget failed')
        },
      }),
    ])
    expect(receipt.steps[0]).toMatchObject({ result: 'ok', error: null })
    expect(receipt.steps[0]!.notified).toEqual([
      { plugin: 'cargo', error: null },
      { plugin: 'orca', error: 'forget failed' },
    ])
    expect(receipt.status).toBe('complete')
  })

  test('a dry run plans the steps and runs no phase', async () => {
    const log: string[] = []
    const git = fake('git', [cand('a:1', 'git')], log)
    const receipt = await clean(plan(await survey([git], ctx)), [git], ctx, { dryRun: true })
    expect(receipt.status).toBe('dry-run')
    expect(receipt.steps.map((s) => s.result)).toEqual(['would-run'])
    expect(log).toEqual([])
  })
})

describe('async hooks and time limits', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Never settles. */
  const hang = <T>(): Promise<T> => new Promise<T>(() => {})
  const later = <T>(ms: number, value: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(value), ms))

  test('a hook that never resolves is stopped at its limit, warned about, and the run finishes', async () => {
    let signal: AbortSignal | undefined
    const stuck = fake('node', [], [], {
      limits: { discover: 20 },
      discover: (x) => ((signal = x.signal), hang()),
    })
    const s = await survey([fake('git', [cand('a:1', 'git')], []), stuck], ctx)
    expect(s.candidates.map((c) => c.id)).toEqual(['a:1'])
    expect(s.warnings).toEqual(['node: discover failed: timed out after 20 ms'])
    expect(signal?.aborted).toBe(true)
    expect(signal?.reason).toBeInstanceOf(HookTimeout)
  })

  test('a detect that never resolves leaves the plugin out; an object that never resolves refuses every candidate', async () => {
    const lost = fake('cargo', [cand('a:2', 'cargo')], [], { limits: { detect: 20 }, detect: hang })
    const silent = fake('node', [], [], { limits: { object: 20 }, object: hang })
    const s = await survey([fake('git', [cand('a:1', 'git')], []), lost, silent], ctx)
    expect(s.plugins.map((p) => p.name)).toEqual(['git', 'node'])
    expect(s.objections).toMatchObject([
      { by: 'node', candidate: 'a:1', level: 'refuse', code: 'plugin-error' },
    ])
    expect(s.warnings).toEqual([
      'cargo: detect failed: timed out after 20 ms',
      'node: object failed: timed out after 20 ms',
    ])
  })

  test('a delete that never resolves fails its step; the next candidate still runs', async () => {
    const log: string[] = []
    const git = fake('git', [cand('a:1', 'git'), cand('a:2', 'git')], log, {
      limits: { delete: 20 },
      delete: (c) => (c.id === 'a:1' ? hang() : `removed ${c.id}`),
    })
    const receipt = await run([git])
    expect(receipt.steps.map((x) => [x.id, x.result, x.error])).toEqual([
      ['a:1', 'failed', 'timed out after 20 ms'],
      ['a:2', 'ok', null],
    ])
    expect(receipt.status).toBe('failed')
  })

  test('promised answers are awaited, one plugin at a time, in the order given', async () => {
    const log: string[] = []
    const slow = (name: string, ms: number): Plugin =>
      fake(name, [], log, {
        detect: () => later(ms, true),
        discover: async () => {
          log.push(`${name}:start`)
          await later(ms, null)
          log.push(`${name}:end`)
          return [cand(`a:${name}`, name)]
        },
        delete: async (c) => later(ms, `removed ${c.id}`),
      })
    const plugins = [slow('git', 15), slow('node', 1)]
    const s = await survey(plugins, ctx)
    expect(log).toEqual(['git:start', 'git:end', 'node:start', 'node:end'])
    const receipt = await clean(plan(s), plugins, ctx)
    expect(receipt.steps.map((x) => x.delete)).toEqual(['removed a:git', 'removed a:node'])
  })

  /** Works synchronously for `ms`, so no timer can fire meanwhile. */
  const block = (ms: number): void => {
    const end = performance.now() + ms
    while (performance.now() < end);
  }

  test('a synchronous hook that answers past its limit is timed out then, and its signal aborted', async () => {
    let signal: AbortSignal | undefined
    const slow = fake('node', [], [], {
      limits: { discover: 20 },
      discover: (x) => {
        signal = x.signal
        block(40)
        return [cand('a:2', 'node')]
      },
    })
    const s = await survey([fake('git', [cand('a:1', 'git')], []), slow], ctx)
    expect(s.candidates.map((c) => c.id)).toEqual(['a:1'])
    expect(s.warnings).toEqual(['node: discover failed: timed out after 20 ms'])
    expect(signal?.aborted).toBe(true)
    expect(signal?.reason).toBeInstanceOf(HookTimeout)
  })

  test('a synchronous hook that throws past its limit keeps its own error, so a FatalRun still stops the run', async () => {
    let signal: AbortSignal | undefined
    const git = fake('git', [cand('a:1', 'git'), cand('a:2', 'git')], [], {
      limits: { delete: 20 },
      delete: (_c, x) => {
        signal = x.signal
        block(40)
        throw new FatalRun('archive failed')
      },
    })
    const receipt = await run([git])
    expect(receipt.steps.map((x) => [x.result, x.error])).toEqual([
      ['failed', 'archive failed'],
      ['skipped', 'the run stopped: archive failed'],
    ])
    expect(signal?.aborted).toBe(true)
  })

  test('a delete that answers past its limit has deleted: its step is ok, the others are told, and what requires it runs', async () => {
    const log: string[] = []
    let signal: AbortSignal | undefined
    const git = fake('git', [cand('a:1', 'git'), cand('a:2', 'git', { requires: ['a:1'] })], log, {
      limits: { delete: 20 },
      delete: (c, x) => {
        log.push(`git:delete:${c.id}`)
        if (c.id === 'a:1') {
          signal = x.signal
          block(40)
        }
        return `removed ${c.id}`
      },
    })
    const receipt = await run([git, fake('node', [], log)])
    expect(receipt.steps.map((x) => [x.id, x.result, x.delete, x.error])).toEqual([
      ['a:1', 'ok', 'removed a:1', null],
      ['a:2', 'ok', 'removed a:2', null],
    ])
    expect(log).toContain('node:deleted:a:1')
    expect(receipt.status).toBe('complete')
    expect(signal?.aborted).toBe(false)
  })

  test('a synchronous hook works unchanged, and one that answers at once is never timed out', async () => {
    const log: string[] = []
    const quick = fake('git', [cand('a:1', 'git')], log, {
      limits: { detect: 0, discover: 0, prepare: 0, delete: 0, deleted: 0 },
    })
    const receipt = await run([quick, fake('node', [], log, { limits: { deleted: 0 } })])
    expect(receipt.status).toBe('complete')
    expect(log).toEqual([
      'git:prepare:a:1',
      'node:prepare:a:1',
      'git:delete:a:1',
      'node:deleted:a:1',
    ])
  })

  test('the default limits: short for discover, long for delete', async () => {
    vi.useFakeTimers()
    const git = fake('git', [cand('a:1', 'git')], [], {
      delete: () => later(HOOK_LIMIT_MS * 2, 'removed a:1'),
    })
    const stuck = fake('node', [], [], { discover: hang })
    const surveyed = survey([git, stuck], ctx)
    await vi.advanceTimersByTimeAsync(HOOK_LIMIT_MS)
    const s = await surveyed
    expect(s.warnings).toEqual([`node: discover failed: timed out after ${HOOK_LIMIT_MS} ms`])
    const cleaned = clean(plan(s), [git], ctx)
    await vi.advanceTimersByTimeAsync(HOOK_LIMIT_MS * 2)
    expect((await cleaned).steps).toMatchObject([{ result: 'ok', delete: 'removed a:1' }])
    expect(DELETE_LIMIT_MS).toBeGreaterThan(HOOK_LIMIT_MS * 2)
  })
})
