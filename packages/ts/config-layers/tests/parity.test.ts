/**
 * The shared parity fixture, driven from this side.
 *
 * `packages/rust/config-layers/tests/fixtures/parity.json` is the contract
 * between this package and the Rust crate `config-layers`, which reads the same
 * file in `tests/parity.rs`: same input, same result. A case added on either side
 * goes in the fixture, never in one twin's own suite. What the twins do
 * differently is listed in the README, not here.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { z } from 'zod'

import { envVars } from '../src/dirs.ts'
import { readMappingFile } from '../src/loader.ts'
import { machineConfigFile } from '../src/machine.ts'
import { configNeeds } from '../src/needs.ts'
import { resolveConfigPath, substitutePathNames } from '../src/paths.ts'
import { valueAt, valueIsSet } from '../src/value.ts'

interface Fixture {
  value_is_set: { name: string; missing?: boolean; value?: unknown; expected: boolean }[]
  value_at: { name: string; obj: unknown; key: string; found: boolean; value?: unknown }[]
  yaml: { name: string; yaml: string; expected?: unknown; error?: boolean }[]
  resolve_config_path: {
    name: string
    value: string
    base_dir: string
    home: string
    expected: string
  }[]
  substitute_path_names: {
    name: string
    value: string
    names: Record<string, string>
    setting: string
    define_hint?: string
    expected?: string
    error?: string
  }[]
  needs: {
    name: string
    tool: string
    project_file: string
    machine_path: string
    scaffold_hint?: string
    keys: { key: string; scope: 'project' | 'machine' | 'both'; description: string }[]
    cases: {
      name: string
      config: string
      unless_input?: string
      command: string[]
      project_file_exists: boolean
      expected: string
    }[]
  }[]
}

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../rust/config-layers/tests/fixtures/parity.json', import.meta.url),
    ),
    'utf-8',
  ),
) as Fixture

let tmp: string
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'config-layers-parity-'))
})
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('valueIsSet', () => {
  for (const c of FIXTURE.value_is_set) {
    test(c.name, () => {
      expect(valueIsSet(c.missing === true ? undefined : c.value)).toBe(c.expected)
    })
  }
})

describe('valueAt', () => {
  for (const c of FIXTURE.value_at) {
    test(c.name, () => {
      const got = valueAt(c.obj, c.key)
      if (c.found) expect(got).toEqual(c.value)
      else expect(got).toBeUndefined()
    })
  }
})

describe('YAML reading', () => {
  FIXTURE.yaml.forEach((c, i) => {
    test(c.name, () => {
      const file = join(tmp, `yaml-${i}.yaml`)
      writeFileSync(file, c.yaml)
      const read = readMappingFile(file)
      if (c.error === true) {
        expect(read.problem).not.toBeNull()
      } else {
        expect(read.problem).toBeNull()
        expect(read.data).toEqual(c.expected)
      }
    })
  })
})

describe('resolveConfigPath', () => {
  for (const c of FIXTURE.resolve_config_path) {
    test(c.name, () => {
      expect(resolveConfigPath(c.value, c.base_dir, { home: c.home })).toBe(c.expected)
    })
  }
})

describe('substitutePathNames', () => {
  for (const c of FIXTURE.substitute_path_names) {
    test(c.name, () => {
      const opts = c.define_hint === undefined ? {} : { defineHint: c.define_hint }
      const run = (): string => substitutePathNames(c.value, c.names, c.setting, opts)
      if (c.error !== undefined) expect(run).toThrow(new Error(c.error))
      else expect(run()).toBe(c.expected)
    })
  }
})

describe('the unmet-need message', () => {
  for (const group of FIXTURE.needs) {
    describe(group.name, () => {
      const schema = (scopes: string[]): z.ZodObject =>
        z.object(
          Object.fromEntries(
            group.keys
              .filter((k) => scopes.includes(k.scope))
              .map((k) => [k.key, z.string().default('').describe(k.description)]),
          ),
        )
      const machine = machineConfigFile({
        tool: group.tool,
        schema: schema(['machine', 'both']),
        vendorDirs: { vendor: 'com.example', envVars: envVars('MYTOOL') },
      })
      const needs = configNeeds({
        tool: group.tool,
        projectFile: group.project_file,
        projectSchema: schema(['project', 'both']),
        machine,
        ...(group.scaffold_hint === undefined ? {} : { scaffoldHint: group.scaffold_hint }),
      })

      beforeAll(() => {
        process.env[machine.env] = group.machine_path
      })
      afterAll(() => {
        delete process.env[machine.env]
      })

      group.cases.forEach((c, i) => {
        test(c.name, () => {
          const root = join(tmp, `needs-${group.name.replaceAll(' ', '-')}-${i}`)
          mkdirSync(root, { recursive: true })
          if (c.project_file_exists) writeFileSync(join(root, group.project_file), '')
          const need =
            c.unless_input === undefined
              ? { config: c.config }
              : { config: c.config, unlessInput: c.unless_input }
          expect(needs.message(need, { projectRoot: root, command: c.command })).toBe(
            c.expected.replaceAll('{project_root}', root),
          )
        })
      })
    })
  }
})
