/**
 * `detect()` and `readPlugin` read one plugin folder through one reader
 * (`scanPluginArtifacts`), so they list the same skills and commands under the
 * same names. Each case below is one where the two used to disagree.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { readPlugin } from '../src/model/derive.ts'
import { fixture, type Fixture } from './fixture.ts'

let f: Fixture
let install: string

beforeEach(() => {
  f = fixture()
  install = join(f.home, 'plug')
  f.write(install, { '.claude-plugin/plugin.json': { name: 'p', version: '1' } })
  f.write(f.home, {
    '.claude/plugins/installed_plugins.json': {
      plugins: { 'p@m': [{ scope: 'user', installPath: install }] },
    },
    '.claude/settings.json': { enabledPlugins: { 'p@m': true } },
  })
})

afterEach(() => {
  f.cleanup()
})

/** The plugin's skill and command names as `detect()` and as `readPlugin` see them. */
async function bothViews(): Promise<{
  detect: { skills: string[]; commands: string[] }
  model: { skills: string[]; commands: string[] }
}> {
  const r = await f.report('claude')
  const ours = <T extends { origin: string; name: string }>(xs: T[]): string[] =>
    xs
      .filter((x) => x.origin === 'plugin:p@m')
      .map((x) => x.name)
      .sort()
  const m = readPlugin(install)
  const ofKind = (kind: string): string[] =>
    m.capabilities.filter((c) => c.kind === kind).map((c) => c.name)
  return {
    detect: { skills: ours(r.skills), commands: ours(r.commands) },
    model: { skills: ofKind('skill'), commands: ofKind('command') },
  }
}

describe('detect() and readPlugin agree on a plugin', () => {
  test('a skill folder is named by its frontmatter name', async () => {
    f.write(install, { 'skills/plan/SKILL.md': '---\nname: planner\n---\n' })
    const v = await bothViews()
    expect(v.detect.skills).toEqual(['planner'])
    expect(v.model.skills).toEqual(v.detect.skills)
  })

  test('a command folder is named by its frontmatter name and wins over a flat file of that name', async () => {
    f.write(install, {
      'commands/fold/SKILL.md': '---\nname: folded\ndescription: Folder.\n---\n',
      'commands/folded.md': '---\ndescription: Flat.\n---\n',
      'commands/ship.md': '---\nname: other\n---\n',
    })
    const v = await bothViews()
    // A flat command keeps its file name, whatever its frontmatter says.
    expect(v.detect.commands).toEqual(['folded', 'ship'])
    expect(v.model.commands).toEqual(v.detect.commands)
    const folded = readPlugin(install).capabilities.find((c) => c.name === 'folded')!
    expect(folded.description).toBe('Folder.')
  })

  test('a symbolic link to a skill folder or a command file is followed', async () => {
    const elsewhere = join(f.root, 'elsewhere')
    f.write(elsewhere, {
      'linked/SKILL.md': '---\ndescription: Linked.\n---\n',
      'go.md': '---\ndescription: Go.\n---\n',
    })
    mkdirSync(join(install, 'skills'), { recursive: true })
    mkdirSync(join(install, 'commands'), { recursive: true })
    symlinkSync(join(elsewhere, 'linked'), join(install, 'skills', 'linked'))
    symlinkSync(join(elsewhere, 'go.md'), join(install, 'commands', 'go.md'))
    const v = await bothViews()
    expect(v.detect).toEqual({ skills: ['linked'], commands: ['go'] })
    expect(v.model).toEqual(v.detect)
  })

  test('a folder without SKILL.md, and a non-markdown file, are neither skill nor command', async () => {
    f.write(install, {
      'skills/empty/notes.txt': 'x',
      'commands/readme.txt': 'x',
      'commands/nested/deep.md': '---\n---\n',
    })
    const v = await bothViews()
    expect(v.detect).toEqual({ skills: [], commands: [] })
    expect(v.model).toEqual(v.detect)
  })
})
