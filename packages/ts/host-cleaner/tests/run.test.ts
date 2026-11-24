import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  DEFAULT_SELECTION,
  FatalRun,
  SelectionError,
  clean,
  decide,
  orderPlugins,
  plan,
  recheck,
  survey,
  type Candidate,
  type Ctx,
  type Objection,
  type Plugin,
} from '../src/index.ts'

const ctx: Ctx = { cwd: '/work', targets: [], allow: [] }

const cand = (id: string, owner: string, extra: Partial<Candidate> = {}): Candidate => ({
  id,
  kind: id.split(':')[0]!,
  path: id,
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

const run = (plugins: Plugin[], opts: { select?: string[]; allow?: string[] } = {}) => {
  const s = survey(plugins, ctx)
  return clean(plan(s, opts), plugins, { ...ctx, allow: opts.allow ?? [] })
}

describe('plugin order and duplicates', () => {
  test('git is first, known built-ins in their order, unknown plugins after', () => {
    const names = ['zzz', 'node', 'claude-code', 'git', 'cargo'].map((name) => fake(name, [], []))
    expect(orderPlugins(names).map((p) => p.name)).toEqual([
      'git',
      'cargo',
      'node',
      'claude-code',
      'zzz',
    ])
  })

  test('a duplicate id keeps the first plugin in order and warns, naming both', () => {
    const log: string[] = []
    const s = survey(
      [
        fake('node', [cand('artifact:/a', 'node')], log),
        fake('git', [cand('artifact:/a', 'git')], log),
      ],
      ctx,
    )
    expect(s.candidates.map((c) => c.owner)).toEqual(['git'])
    expect(s.warnings).toEqual(["duplicate artifact:/a: kept git's, dropped node's"])
  })

  test('a second plugin of the same name is left out with a warning', () => {
    const s = survey(
      [fake('cache', [cand('a:1', 'cache')], []), fake('cache', [cand('a:2', 'cache')], [])],
      ctx,
    )
    expect(s.candidates.map((c) => c.id)).toEqual(['a:1'])
    expect(s.warnings).toEqual(['cache: a second plugin of that name was left out'])
  })

  test('a plugin that mutates a candidate it returns cannot move the plan under the re-check', () => {
    const shared = cand('a:1', 'cache', { evidence: { v: 0 } })
    let calls = 0
    const mutating = fake('cache', [], [], {
      discover: () => ((shared.evidence.v = ++calls), [shared]),
    })
    const receipt = clean(plan(survey([mutating], ctx)), [mutating], ctx)
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['changed'])
  })

  test('a candidate naming another plugin as owner is dropped', () => {
    const s = survey([fake('git', [cand('worktree:/a', 'node')], [])], ctx)
    expect(s.candidates).toEqual([])
    expect(s.warnings[0]).toMatch(/dropped worktree:\/a, which names node/)
  })

  test('a plugin whose detect throws is left out with a warning', () => {
    const bad = {
      ...fake('node', [], []),
      detect: () => {
        throw new Error('no stat')
      },
    }
    const s = survey([bad, fake('git', [cand('a:1', 'git')], [])], ctx)
    expect(s.candidates).toHaveLength(1)
    expect(s.warnings).toEqual(['node: detect failed: no stat'])
  })

  test('scope adds roots before discover, once', () => {
    const seen: string[][] = []
    const scoping = fake('orca', [], [], {
      scope: () => ['/r1', '/r1'],
      discover: (c) => (seen.push([...c.targets]), []),
    })
    survey([scoping, fake('git', [], [], { scope: () => ['/r1', '/r2'] })], {
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

  test('a plugin cannot object under another name, or to a candidate nobody proposed', () => {
    const lying: Plugin = {
      name: 'cargo',
      detect: () => true,
      object: () => [objection('worktree:/a', 'refuse', 'x'), objection('nope', 'refuse', 'x')],
    }
    const s = survey([fake('git', [cand('worktree:/a', 'git')], []), lying], ctx)
    expect(s.objections).toEqual([
      { by: 'cargo', candidate: 'worktree:/a', level: 'refuse', code: 'x', reason: 'x reason' },
    ])
  })

  test('a plugin whose object throws refuses every candidate', () => {
    const broken: Plugin = {
      name: 'node',
      detect: () => true,
      object: () => {
        throw new Error('boom')
      },
    }
    const s = survey([fake('git', [cand('a:1', 'git')], []), broken], ctx)
    expect(s.objections).toMatchObject([{ by: 'node', level: 'refuse', code: 'plugin-error' }])
    expect(s.warnings).toEqual(['node: object failed: boom'])
  })
})

describe('pick, select and spare', () => {
  const branch = cand('branch:/r:feat/x', 'git', { path: '/r:feat/x', name: 'feat/x' })
  const tree = cand('worktree:/w/x', 'git', { path: '/w/x', name: 'feat/x' })
  const other = cand('artifact:/r/target', 'cargo', { path: '/r/target' })
  const cs = [branch, tree, other]
  const ran = (sel: Partial<typeof DEFAULT_SELECTION>) =>
    decide(cs, [], { ...DEFAULT_SELECTION, ...sel }, [])

  test('a pick adds to the default; a selection replaces it', () => {
    const held = [...cs, cand('session:9', 'claude-code', { held: true })]
    const pick = decide(held, [], { ...DEFAULT_SELECTION, pick: ['session:9'] }, [])
    expect(pick.run.map((c) => c.id)).toEqual([...cs.map((c) => c.id), 'session:9'])
    const select = decide(held, [], { ...DEFAULT_SELECTION, select: ['session:9'] }, [])
    expect(select.run.map((c) => c.id)).toEqual(['session:9'])
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

  test('a requirement is deleted before its dependent, whatever the discovery order', () => {
    const log: string[] = []
    const receipt = run([fake('git', [branch, tree], log)])
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

  test('a dependent whose requirement is not selected is blocked', () => {
    const d = decide([tree, branch], [], only(['branch:b']), [])
    expect(d.dropped).toEqual([
      { id: 'branch:b', reason: 'blocked', detail: 'requires worktree:/w, which does not run' },
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

  test('a failed requirement skips its dependent and leaves the rest', () => {
    const log: string[] = []
    const other = cand('artifact:/o', 'git')
    const git = fake('git', [tree, branch, other], log, {
      delete: (c) => {
        if (c.id === 'worktree:/w') throw new Error('directory busy')
        return 'ok'
      },
    })
    const receipt = run([git])
    expect(receipt.steps.map((s) => [s.id, s.result])).toEqual([
      ['worktree:/w', 'failed'],
      ['branch:b', 'skipped'],
      ['artifact:/o', 'ok'],
    ])
    expect(receipt.steps[0]!.error).toBe('directory busy')
    expect(receipt.status).toBe('failed')
  })
})

describe('re-check', () => {
  const planWith = (plugin: Plugin, opts: { select?: string[]; allow?: string[] } = {}) =>
    plan(survey([plugin], ctx), opts)
  const mutable = (items: Candidate[], objections: () => Objection[] = () => []): Plugin => ({
    name: 'git',
    detect: () => true,
    discover: () => items,
    object: objections,
  })

  test('gone: no plugin proposes it now', () => {
    const items = [cand('a:1', 'git')]
    const p = planWith(mutable(items))
    const r = recheck(p, [mutable([])], ctx)
    expect(r.decision.dropped).toEqual([
      { id: 'a:1', reason: 'gone', detail: 'no plugin proposes it now' },
    ])
  })

  test('blocked: a refusal appeared since the plan', () => {
    const p = planWith(mutable([cand('a:1', 'git')]))
    const r = recheck(
      p,
      [mutable([cand('a:1', 'git')], () => [objection('a:1', 'refuse', 'live')])],
      ctx,
    )
    expect(r.decision.dropped.map((d) => d.reason)).toEqual(['blocked'])
  })

  test('not-allowed: a protest appeared that nobody granted', () => {
    const p = planWith(mutable([cand('a:1', 'git')]))
    const r = recheck(
      p,
      [mutable([cand('a:1', 'git')], () => [objection('a:1', 'protest', 'lossy')])],
      ctx,
    )
    expect(r.decision.dropped.map((d) => d.reason)).toEqual(['not-allowed'])
  })

  test('changed: the evidence moved; a missing key counts as null', () => {
    const p = planWith(mutable([cand('a:1', 'git', { evidence: { sha: 'a', pr: null } })]))
    const same = recheck(p, [mutable([cand('a:1', 'git', { evidence: { sha: 'a' } })])], ctx)
    expect(same.decision.run.map((c) => c.id)).toEqual(['a:1'])
    const moved = recheck(p, [mutable([cand('a:1', 'git', { evidence: { sha: 'b' } })])], ctx)
    expect(moved.decision.dropped.map((d) => d.reason)).toEqual(['changed'])
  })

  test('a candidate that changed drops its dependents', () => {
    const items = (sha: string) => [
      cand('worktree:/w', 'git', { evidence: { sha } }),
      cand('branch:b', 'git', { requires: ['worktree:/w'] }),
    ]
    const p = planWith(mutable(items('a')))
    const r = recheck(p, [mutable(items('b'))], ctx)
    expect(r.decision.dropped.map((d) => [d.id, d.reason])).toEqual([
      ['worktree:/w', 'changed'],
      ['branch:b', 'blocked'],
    ])
  })

  test('clean deletes nothing it dropped', () => {
    const log: string[] = []
    const p = planWith(fake('git', [cand('a:1', 'git')], []))
    const receipt = clean(p, [fake('git', [], log)], ctx)
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['gone'])
    expect(log).toEqual([])
  })
})

describe('prepare, delete and deleted', () => {
  test('a plugin that throws in the re-check leaves a failed receipt and rethrows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-recheck-'))
    const receiptPath = join(dir, 'receipt.json')
    let reads = 0
    const flaky = fake('git', [cand('a:1', 'git')], [], {
      discover: () => {
        if (++reads > 1) throw new FatalRun('cannot read')
        return [cand('a:1', 'git')]
      },
    })
    const p = plan(survey([flaky], ctx), {})
    expect(() => clean(p, [flaky], ctx, { receiptPath })).toThrow('cannot read')
    expect(JSON.parse(readFileSync(receiptPath, 'utf8'))).toMatchObject({
      status: 'failed',
      steps: [],
    })
  })

  test('every plugin prepares, the owner deletes, the others are told', () => {
    const log: string[] = []
    const receipt = run([
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

  test('a prepare failure stops only that candidate; the next one runs', () => {
    const log: string[] = []
    const orca = fake('orca', [], log, {
      prepare: (c) => {
        if (c.id === 'a:1') throw new Error('terminal would not close')
      },
    })
    const receipt = run([fake('git', [cand('a:1', 'git'), cand('a:2', 'git')], log), orca])
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

  test('a FatalRun in prepare stops the run: the rest are skipped, nothing more is deleted', () => {
    const log: string[] = []
    const git = fake('git', [cand('a:1', 'git'), cand('a:2', 'git')], log, {
      prepare: () => {
        throw new FatalRun('archive push failed')
      },
    })
    const receipt = run([git])
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

  test('a FatalRun in delete stops the run too', () => {
    const git = fake('git', [cand('a:1', 'git'), cand('a:2', 'git')], [], {
      delete: () => {
        throw new FatalRun('disk gone')
      },
    })
    const receipt = run([git])
    expect(receipt.steps.map((s) => s.result)).toEqual(['failed', 'skipped'])
  })

  test('deleted failures are recorded and neither fail the step nor stop the others', () => {
    const log: string[] = []
    const receipt = run([
      fake('git', [cand('a:1', 'git')], log),
      fake('orca', [], log, {
        deleted: () => {
          throw new Error('forget failed')
        },
      }),
      fake('claude-code', [], log),
    ])
    expect(receipt.steps[0]).toMatchObject({ result: 'ok', error: null })
    expect(receipt.steps[0]!.notified).toEqual([
      { plugin: 'claude-code', error: null },
      { plugin: 'orca', error: 'forget failed' },
    ])
    expect(receipt.status).toBe('complete')
  })

  test('a dry run plans the steps and runs no phase', () => {
    const log: string[] = []
    const git = fake('git', [cand('a:1', 'git')], log)
    const receipt = clean(plan(survey([git], ctx)), [git], ctx, { dryRun: true })
    expect(receipt.status).toBe('dry-run')
    expect(receipt.steps.map((s) => s.result)).toEqual(['would-run'])
    expect(log).toEqual([])
  })
})
