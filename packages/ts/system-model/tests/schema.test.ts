/**
 * The JSON Schemas in `./schema` against what the package prints: a real
 * catalog, and every built-in's `toolInfo`. A field the code emits but the
 * schema does not list fails the drift check.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { z } from 'zod'

import { builtins } from '../src/builtins.ts'
import { CATALOG_SCHEMA_VERSION } from '../src/model.ts'
import { toolInfo } from '../src/registry.ts'
import {
  catalogSchema,
  paramSchema,
  runnerReportSchema,
  taskSchema,
  toolInfoSchema,
  type JsonSchema,
} from '../src/schema.ts'
import { collect, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

const FILES = {
  justfile: 'test: build\nbuild:\n',
  'package.json': JSON.stringify({ name: 'x', scripts: { dev: 'vite' } }),
  'package-lock.json': '{}',
  'turbo.json': JSON.stringify({ tasks: { build: { dependsOn: ['^build'] } } }),
  '.github/workflows/ci.yml': 'on: workflow_dispatch\n',
  Rakefile: 'task default: :test\ntask :test\n',
}

/** The paths of keys in `value` that `schema` does not list. */
function unlisted(value: unknown, schema: JsonSchema, at = '$'): string[] {
  if (Array.isArray(value)) {
    const items = schema['items'] as JsonSchema | undefined
    return items === undefined ? [] : value.flatMap((v, i) => unlisted(v, items, `${at}[${i}]`))
  }
  if (typeof value !== 'object' || value === null) return []
  const variants = schema['oneOf'] as JsonSchema[] | undefined
  if (variants !== undefined) {
    const fits = variants.map((v) => unlisted(value, v, at))
    return fits.find((f) => f.length === 0) ?? fits[0]!
  }
  const props = (schema['properties'] ?? {}) as Record<string, JsonSchema>
  return Object.entries(value).flatMap(([key, v]) =>
    key in props ? unlisted(v, props[key]!, `${at}.${key}`) : [`${at}.${key}`],
  )
}

function validate(schema: JsonSchema, value: unknown): void {
  const json = JSON.parse(JSON.stringify(value)) as unknown
  z.fromJSONSchema(schema as never).parse(json)
  expect(unlisted(json, schema)).toEqual([])
}

describe('the catalog schema', () => {
  test('a real catalog validates, with no field the schema leaves out', async () => {
    const dir = await fixtureRoot(FILES)
    roots.push(dir)
    const catalog = await collect(dir, { discovery: 'walk' })
    expect(catalog.kind).toBe('catalog')
    expect(catalog.schemaVersion).toBe(CATALOG_SCHEMA_VERSION)
    expect(catalog.reports.length).toBeGreaterThan(4)

    validate(catalogSchema, catalog)
    validate(runnerReportSchema, catalog.reports[0])
    for (const task of catalog.reports.flatMap((r) => r.tasks)) validate(taskSchema, task)
  })

  test('a task with every optional field validates', () => {
    validate(taskSchema, {
      id: 'x:y:z',
      runner: 'x',
      path: ['x', 'z'],
      argv: ['x', 'z'],
      cwd: '.',
      display: 'x z',
      parameters: [
        {
          name: 'env',
          required: true,
          variadic: false,
          default: 'dev',
          binding: { kind: 'flag', flag: '-f', key: 'env' },
          doc: 'where',
          choices: ['dev', 'prod'],
        },
      ],
      parametersUnknown: 'not-read',
      source: 'x',
      origin: 'declared',
      doc: 'd',
      detail: 'e',
      dependsOn: ['x:y:a'],
      dependsOnUnresolved: ['^b'],
      tags: [],
      persistent: { value: false, declared: false },
      executes: 'remote',
    })
  })

  test('rejects a value that does not fit', () => {
    const parse = (schema: JsonSchema, v: unknown) => z.fromJSONSchema(schema as never).safeParse(v)
    expect(parse(paramSchema, { name: 'x', required: 'yes', variadic: false }).success).toBe(false)
    expect(
      parse(paramSchema, { name: 'x', required: true, variadic: false, binding: { kind: 'env' } })
        .success,
    ).toBe(false)
    expect(parse(catalogSchema, { kind: 'catalog', schemaVersion: 99 }).success).toBe(false)
  })
})

describe('the tool schema', () => {
  test('every built-in toolInfo validates, with no field the schema leaves out', () => {
    for (const tool of builtins) validate(toolInfoSchema, toolInfo(tool))
  })

  test('toolInfo keeps the data and drops the functions', () => {
    const info = toolInfo(builtins.find((t) => t.id === 'just')!)
    expect(info).toMatchObject({
      id: 'just',
      homepage: 'https://just.systems',
      binary: 'just',
      roles: ['runner'],
      runner: { kind: 'parse', probe: { timeoutMs: 10_000, cost: 'cheap' } },
    })
    expect(info.markers.map((m) => m.files)).toContain('justfile')
    expect(JSON.parse(JSON.stringify(info))).toEqual(info)
  })
})
