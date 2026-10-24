import { afterAll, describe, expect, test } from 'vitest'

import { builtins } from '../src/builtins.ts'
import type { ProviderResult } from '../src/model.ts'
import { nodeEcosystem } from '../src/plugins/node/index.ts'
import { markersOf } from '../src/registry.ts'
import { createProject } from '../src/project.ts'
import type { EcosystemDef, ToolDef } from '../src/tool.ts'
import { collect, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

const empty: ProviderResult = { status: 'absent', tasks: [], diagnostics: [] }

describe('registry', () => {
  test('a tool id registered twice throws', () => {
    const a: ToolDef = { id: 'dup', roles: {} }
    expect(() => createProject({ tools: [a, { ...a }] })).toThrow(/"dup" is registered twice/)
  })

  test('two different ecosystems with one id throw', () => {
    const copy: EcosystemDef = { ...nodeEcosystem }
    const tools: ToolDef[] = [
      { id: 'a', ecosystem: nodeEcosystem, roles: {} },
      { id: 'b', ecosystem: copy, roles: {} },
    ]
    expect(() => createProject({ tools })).toThrow(/ecosystems are named "node"/)
  })

  test('the built-ins have unique ids', () => {
    const ids = builtins.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('each built-in file pattern belongs to exactly one tool or ecosystem', () => {
    const owners = new Map<string, string[]>()
    const own = (pattern: string, owner: string) =>
      owners.set(pattern, [...(owners.get(pattern) ?? []), owner])
    for (const tool of builtins) for (const m of markersOf(tool)) own(m.files, tool.id)
    for (const eco of createProject({ tools: builtins }).ecosystems) {
      for (const m of eco.manifests) own(m.files, `ecosystem:${eco.id}`)
    }
    const shared = [...owners].filter(([, list]) => list.length > 1)
    expect(shared).toEqual([])
  })

  test('every ecosystem precedence names a registered tool', () => {
    const project = createProject({ tools: builtins })
    const ids = new Set(project.tools.map((t) => t.id))
    for (const eco of project.ecosystems) {
      expect(eco.tools.filter((id) => !ids.has(id))).toEqual([])
      if (eco.fallback !== undefined) expect(ids.has(eco.fallback)).toBe(true)
      for (const m of eco.manifests) if (m.tool !== undefined) expect(ids.has(m.tool)).toBe(true)
    }
  })
})

describe('marker gating', () => {
  test('a runner whose tool was not detected never runs', async () => {
    let calls = 0
    const tool: ToolDef = {
      id: 'gated',
      markers: [{ files: 'gated.yml', tier: 'files' }],
      roles: {
        runner: {
          kind: 'parse',
          async collect() {
            calls++
            return empty
          },
        },
      },
    }
    const absent = await collect(await root({ 'README.md': '' }), {
      discovery: 'walk',
      tools: [tool],
    })
    expect(absent.reports).toEqual([])
    expect(calls).toBe(0)

    const present = await collect(await root({ 'sub/gated.yml': '' }), {
      discovery: 'walk',
      tools: [tool],
    })
    expect(present.reports.map((r) => r.runner)).toEqual(['gated'])
    expect(calls).toBe(1)
  })

  test('a runner receives only the packages where its tool was found', async () => {
    const seen: string[][] = []
    const tool: ToolDef = {
      id: 'probe',
      markers: [{ files: 'probe.txt', tier: 'files' }],
      roles: {
        runner: {
          kind: 'parse',
          async collect(_ctx, packages) {
            seen.push(packages.map((p) => p.dir))
            return empty
          },
        },
      },
    }
    const dir = await root({
      'a/package.json': '{}',
      'a/probe.txt': '',
      'b/package.json': '{}',
    })
    await collect(dir, {
      discovery: 'walk',
      tools: [tool, ...builtins.filter((t) => t.id === 'node-scripts')],
    })
    expect(seen).toEqual([['a']])
  })

  test('an exec runner is withheld, with a row, only when its tool was detected', async () => {
    const tool: ToolDef = {
      id: 'execy',
      binary: 'execy',
      markers: [{ files: '/execy.toml', tier: 'files' }],
      roles: { runner: { kind: 'exec', collect: async () => empty } },
    }
    const none = await collect(await root({ 'x.txt': '' }), { discovery: 'walk', tools: [tool] })
    expect(none.reports).toEqual([])
    const found = await collect(await root({ 'execy.toml': '' }), {
      discovery: 'walk',
      tools: [tool],
    })
    expect(found.reports.map((r) => [r.runner, r.skippedForExec])).toEqual([['execy', true]])
  })

  test('a detect function adds evidence a file name cannot give', async () => {
    const tool: ToolDef = {
      id: 'shebang',
      async detect(ctx) {
        const text = await ctx.readText('run')
        return text?.startsWith('#!/bin/bash')
          ? [{ kind: 'content', tier: 4, source: 'run', found: '#!/bin/bash' }]
          : []
      },
      roles: {},
    }
    const project = createProject({ tools: [tool] })
    const profile = await project.detect(await root({ run: '#!/bin/bash\necho hi\n' }), {
      discovery: 'walk',
    })
    expect(profile.tools).toEqual(['shebang'])
    expect(profile.packages[0]!.tools[0]!.evidence[0]!.kind).toBe('content')
  })
})

describe('browser-safe entries', () => {
  test('./match, ./params, ./duration and the wire-contract entries import no runtime module', async () => {
    const { readFileSync } = await import('node:fs')
    for (const name of ['match', 'params', 'duration', 'graph', 'aspect', 'client', 'saved-view']) {
      const text = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf-8')
      const runtime = [...text.matchAll(/^import (?!type )[^\n]*$/gm)].map((m) => m[0])
      expect(runtime, name).toEqual([])
    }
  })
})
