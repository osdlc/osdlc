/**
 * Publish one skill note to a Claude destination, then ask for its status.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, test } from 'vitest'

import { createNodeVfs, knownTargets, publishSkill, statusOf } from '@osdlc/tradecraft-wasm'

test('publish a skill note, then see that it is current', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tradecraft-example-'))
  try {
    // A vault with one skill note.
    const vault = path.join(root, 'vault')
    const folder = path.join(vault, 'marketplaces/house/plugins/tools/skills/review')
    mkdirSync(folder, { recursive: true })
    const note = path.join(folder, 'review.md')
    writeFileSync(
      path.join(vault, 'marketplaces/house/house.md'),
      '---\nname: house\ndescription: The house marketplace.\nsw-owner: acme\n---\n',
    )
    writeFileSync(note, '---\nname: review\ndescription: Reviews a diff.\n---\n\n# Review\n')

    // The binding does no file access of its own. It is handed a `Vfs`.
    const vfs = createNodeVfs()
    const destination = path.join(root, 'project')
    mkdirSync(destination)

    // Any name from `knownTargets()` works: `claude`, `codex`, `cursor`, ...
    expect(knownTargets()).toContain('claude')
    const request = {
      skill_path: note,
      destination_root: destination,
      target: 'claude',
      skills_root: vault,
    }

    const report = publishSkill(vfs, request)
    expect(report.files.map((f) => f.status)).toEqual(['written', 'written'])
    expect(
      readFileSync(path.join(destination, '.claude/skills/review/SKILL.md'), 'utf-8'),
    ).toContain('Reviews a diff.')

    // A status is a publish that writes nothing.
    expect(
      statusOf(vfs, { ...request, skill_path: note, destination_root: destination }).state,
    ).toBe('current')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
