/**
 * The wire payload, as `buildSystemGraph` assembles it.
 *
 * The crate-level pieces have their own tests; this covers the DTO mapping on
 * top of them, which had none — and the label rule that lives there is exactly
 * what drew a card called `.` on the real repo for as long as it did.
 *
 * Peer of the `node_label` tests in
 * the `system-model` crate's `system_graph` module. The two
 * walkers are held to byte-for-byte agreement, so this rule has to be asserted
 * on both sides or one can drift.
 */

import { expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_WALK_FILES } from '../src/discovery.ts'
import { buildSystemGraph } from '../src/system-graph-build.ts'
import { walkManifests } from '../src/manifest-walk.ts'

const here = dirname(fileURLToPath(import.meta.url))
const VIRTUAL_WORKSPACE = join(here, 'fixtures/virtual-workspace')

/**
 * A `[workspace]` with no `[package]` has no name and sits at the walk root,
 * so its directory is `''` — the one case the name-then-directory fallback
 * cannot answer. It used to fall through to the id and draw as `.`.
 */
test('a virtual cargo workspace root is named for what it is', async () => {
  const graph = await buildSystemGraph(VIRTUAL_WORKSPACE)
  const root = graph.nodes.find((n) => n.dir === '' && n.kind === 'crate')

  expect(root).toBeDefined()
  expect(root!.label).toBe('Rust workspace')
  expect(root!.ecosystem).toBe('rust')
  // Still on the map, and still a crate: it declares workspace-wide
  // dependencies that its members inherit, and folding it into the repo node
  // would attribute those to a directory that never declared them.
  expect(root!.id).toBe('.')
})

test('a named manifest is called by its name, and the members survive', async () => {
  const graph = await buildSystemGraph(VIRTUAL_WORKSPACE)
  const engine = graph.nodes.find((n) => n.id === 'engine')

  expect(engine).toBeDefined()
  expect(engine!.label).toBe('engine')
  expect(engine!.dir).toBe('crates/engine')
})

/** The repo node is the checkout's directory name, not a manifest at all. */
test('the containment root is labelled from the directory it walked', async () => {
  const graph = await buildSystemGraph(VIRTUAL_WORKSPACE)
  const repo = graph.nodes.find((n) => n.kind === 'repo')

  expect(repo!.label).toBe('virtual-workspace')
  expect(graph.root_label).toBe('virtual-workspace')
})

/**
 * The files cap: system-model's walk stops after `MAX_WALK_FILES` files, so a
 * manifest past it is not seen. The walk fails rather than return a partial
 * list (the depth cap is in `walk-limit.test.ts`).
 */
test('a walk cut short by the files cap throws instead of dropping manifests', async () => {
  const root = mkdtempSync(join(tmpdir(), 'system-model-files-cap-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'root' }))
  // Listed in name order, so `a/` fills the cap before `z/` is reached.
  mkdirSync(join(root, 'a'))
  for (let i = 0; i <= MAX_WALK_FILES; i++) writeFileSync(join(root, 'a', String(i)), '')
  mkdirSync(join(root, 'z'))
  writeFileSync(join(root, 'z', 'package.json'), JSON.stringify({ name: 'zed' }))

  try {
    await expect(walkManifests(root)).rejects.toThrow(`stopped after ${MAX_WALK_FILES} files`)
    await expect(buildSystemGraph(root)).rejects.toThrow(`stopped after ${MAX_WALK_FILES} files`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 120_000)

/** `"name": ""` is no name: the label falls back to the directory, as the id does. */
test('a manifest with an empty name is labelled by its directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'system-model-empty-name-'))
  mkdirSync(join(root, 'a'))
  writeFileSync(join(root, 'a', 'package.json'), JSON.stringify({ name: '' }))

  try {
    const graph = await buildSystemGraph(root)
    const node = graph.nodes.find((n) => n.dir === 'a')

    expect(node).toBeDefined()
    expect(node!.id).toBe('a')
    expect(node!.label).toBe('a')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
