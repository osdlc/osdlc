import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { configNeeds } from '../needs.ts'
import { PROJECT_FILE, ProjectSchema, sandbox, type Sandbox } from './support.ts'

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

const project = (over: Record<string, unknown> = {}) => ProjectSchema.parse(over)
const need = { config: 'authority', unlessInput: 'authority' }

describe('key lookup across both schemas', () => {
  test('scopes, existence and description', () => {
    expect(sb.needs.keyScopes('authority')).toEqual({ project: true, machine: false })
    expect(sb.needs.keyScopes('repos')).toEqual({ project: false, machine: true })
    expect(sb.needs.keyScopes('paths.dev')).toEqual({ project: true, machine: true })
    expect(sb.needs.keyScopes('nope')).toEqual({ project: false, machine: false })
    expect(sb.needs.keyExists('repos')).toBe(true)
    expect(sb.needs.keyExists('nope')).toBe(false)
    // The project schema's prose wins when both describe a key.
    expect(sb.needs.keyDescription('checkout.layout')).toBe('Where a checkout lands.')
    expect(sb.needs.keyDescription('repos')).toBe('Directories that hold checkouts.')
    expect(sb.needs.keyDescription('nope')).toBeNull()
  })
})

describe('met', () => {
  test('the setting, the stand-in input, or the machine file each satisfy it', () => {
    expect(sb.needs.met(need, { project: project({ authority: 'origin' }) })).toBe(true)
    expect(sb.needs.met(need, { project: project() })).toBe(false)
    expect(sb.needs.met(need, { project: project(), input: { authority: '/x' } })).toBe(true)
    expect(sb.needs.met(need, { project: project(), input: { authority: '' } })).toBe(false)

    const m = join(sb.root, 'machine.yaml')
    writeFileSync(m, 'paths:\n  dev: ~/Developer\n')
    process.env[sb.machine.env] = m
    expect(sb.needs.met({ config: 'paths.dev' }, { project: project() })).toBe(true)
    expect(sb.needs.met({ config: 'paths.other' }, { project: project() })).toBe(false)
  })

  test('an empty list or map counts as unset', () => {
    expect(sb.needs.met({ config: 'paths' }, { project: project({ paths: {} }) })).toBe(false)
    expect(sb.needs.met({ config: 'repos' }, { project: project() })).toBe(false)
  })
})

describe('message', () => {
  test('names the command, the key, its purpose, the stand-in and the project file', () => {
    const dir = sb.project('in')
    writeFileSync(join(dir, PROJECT_FILE), 'paths: {}\n')
    const msg = sb.needs.message(need, { projectRoot: dir, command: ['upload', 'run'] })
    expect(msg).toBe(
      '`tooly upload run` needs `authority`, and it is not set (or pass --authority). ' +
        'The remote server the tool talks to. ' +
        `Set it in ${join(dir, PROJECT_FILE)}; \`tooly config scaffold\` shows the full shape.`,
    )
    // authority is project-only: the machine file is not offered.
    expect(msg).not.toContain('machine config')
  })

  test('a camelCase stand-in renders as a kebab-case flag; no command → "this command"', () => {
    const dir = sb.project('flag')
    const msg = sb.needs.message({ config: 'repos', unlessInput: 'repoDir' }, { projectRoot: dir })
    expect(msg).toMatch(/^this command needs `repos`, and it is not set \(or pass --repo-dir\)\./)
    const empty = sb.needs.message({ config: 'repos' }, { projectRoot: dir, command: [] })
    expect(empty).toMatch(/^this command needs `repos`/)
    // repos is machine-only: the project file is not offered.
    expect(msg).toContain(`Set it in the machine config (${sb.machine.path()});`)
    expect(msg).not.toContain(PROJECT_FILE)
  })

  test('a key both files carry: the file you stand in leads, the other follows', () => {
    const inside = sb.project('inside')
    writeFileSync(join(inside, PROJECT_FILE), '')
    expect(sb.needs.whereToSet('paths.dev', inside)).toBe(
      `${join(inside, PROJECT_FILE)} or the machine config (${sb.machine.path()})`,
    )
    const outside = sb.project('outside')
    expect(sb.needs.whereToSet('paths.dev', outside)).toBe(
      `the machine config (${sb.machine.path()}) or an ${PROJECT_FILE} at the project root (none above ${outside})`,
    )
  })

  test('without a scaffold hint the sentence ends at the location', () => {
    const bare = configNeeds({
      tool: 'tooly',
      projectFile: PROJECT_FILE,
      projectSchema: ProjectSchema,
      machine: sb.machine,
    })
    const dir = sb.project('bare')
    writeFileSync(join(dir, PROJECT_FILE), '')
    const suffix = `Set it in ${join(dir, PROJECT_FILE)}.`
    const message = bare.message({ config: 'authority' }, { projectRoot: dir })
    expect(message.slice(-suffix.length)).toBe(suffix)
  })
})
