/**
 * The descriptor format: the system description's examples, bad files and the
 * field path each names, the YAML reader, and the shipped JSON Schema.
 */

import { Ajv2020 } from 'ajv/dist/2020.js'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'

import { DESCRIPTOR_SCHEMA_FILE, descriptorSchemaText } from '../scripts/write-descriptor-schema.ts'
import {
  DESCRIPTOR_SCHEMA_URL,
  DescriptorError,
  DescriptorSchema,
  descriptorIssues,
  descriptorJsonSchema,
  parseDescriptor,
  readDescriptor,
} from '../src/descriptor/schema.ts'

// The examples as the system description gives them.

const UV = `# yaml-language-server: $schema=https://unpkg.com/@osdlc/host-cleaner@1/schemas/descriptor-1.json
descriptor: 1
store: uv # the research corpus slug it was drafted from; optional
detect:
  any: [{ onPath: uv }, { exists: cache }]
paths:
  cache: { all: ~/.cache/uv }
candidates:
  - path: cache
    costDescription: re-download
    command: [uv, cache, prune, --cache-dir, '{path}']
    removes: unused
inUse:
  processes: [uv]
`

const HUGGING_FACE = `descriptor: 1
store: huggingface-hub
paths:
  hub: { all: ~/.cache/huggingface/hub }
candidates:
  - path: hub
    glob: 'models--*/'
    costDescription: re-download
    idleHours: 720
`

const PNPM = `descriptor: 1
store: pnpm
vars:
  STORE:
    - command: [pnpm, store, path]
    - value: { macos: ~/Library/pnpm/store, linux: '\${XDG_DATA_HOME}/pnpm/store' }
paths:
  store: { all: '\${STORE}' }
candidates:
  - path: store
    costDescription: re-download
    command: [pnpm, store, prune, --store-dir, '{path}']
    removes: unused
inUse:
  processes: [pnpm]
`

const GO = `descriptor: 1
store: go
detect:
  any: [{ onPath: go }, { exists: modcache }]
vars:
  GOPATH:
    - env: GOPATH
    - value: ~/go
  GOMODCACHE:
    - env: GOMODCACHE
    - command: [go, env, GOMODCACHE]
    - value: '\${GOPATH}/pkg/mod'
  GOCACHE:
    - env: GOCACHE
    - command: [go, env, GOCACHE]
    - value: { macos: ~/Library/Caches/go-build, linux: '\${XDG_CACHE_HOME}/go-build' }
paths:
  modcache: { all: '\${GOMODCACHE}' }
  buildcache: { all: '\${GOCACHE}' }
candidates:
  - path: modcache
    costDescription: re-download
    idleHours: 720
    command: [go, clean, -modcache]
    env: { GOMODCACHE: '{path}' }
    removes: all
  - path: buildcache
    costDescription: rebuild
    idleHours: 168
    command: [go, clean, -cache]
    env: { GOCACHE: '{path}' }
    removes: all
`

/** The fragments the description gives, each in the smallest descriptor that holds it. */
const PIP_PER_OS = `descriptor: 1
paths:
  cache: { macos: ~/Library/Caches/pip, linux: ~/.cache/pip }
candidates:
  - { path: cache, costDescription: re-download }
`

const PNPM_TIER_1 = `descriptor: 1
paths: { store: { macos: ~/Library/pnpm/store, linux: ~/.local/share/pnpm/store } }
candidates:
  - { path: store, costDescription: re-download }
`

const DOTNET_PROJECT = `descriptor: 1
paths:
  nuget: { all: ~/.nuget/packages }
candidates:
  - { path: nuget, costDescription: re-download }
project:
  - { dir: bin, marker: '*.csproj', costDescription: rebuild }
  - { dir: obj, marker: '*.csproj', costDescription: rebuild }
`

const TIER_1 = { UV, HUGGING_FACE, PIP_PER_OS, PNPM_TIER_1, DOTNET_PROJECT }
const TIER_2 = { PNPM, GO }

const ajv = new Ajv2020({ allErrors: true, strict: false })
const jsonSchema = ajv.compile(JSON.parse(readFileSync(DESCRIPTOR_SCHEMA_FILE, 'utf8')))

/** The issues `parseDescriptor` throws for `text`; empty when it reads. */
function issues(text: string): readonly string[] {
  try {
    parseDescriptor(text, 'x.yaml')
    return []
  } catch (err) {
    if (err instanceof DescriptorError) return err.issues
    throw err
  }
}

describe("the system description's examples", () => {
  test.each(Object.entries({ ...TIER_1, ...TIER_2 }))('%s reads', (_, text) => {
    expect(issues(text)).toEqual([])
  })

  test.each(Object.entries({ ...TIER_1, ...TIER_2 }))(
    '%s validates against the zod schema and the shipped JSON Schema',
    (_, text) => {
      const value: unknown = parse(text)
      expect(DescriptorSchema.safeParse(value).error?.issues).toBeUndefined()
      expect(jsonSchema(value), JSON.stringify(jsonSchema.errors)).toBe(true)
    },
  )

  test('uv reads to what the file says', () => {
    expect(parseDescriptor(UV, 'uv.yaml')).toEqual({
      descriptor: 1,
      store: 'uv',
      detect: { any: [{ onPath: 'uv' }, { exists: 'cache' }] },
      paths: { cache: { all: '~/.cache/uv' } },
      candidates: [
        {
          path: 'cache',
          costDescription: 're-download',
          command: ['uv', 'cache', 'prune', '--cache-dir', '{path}'],
          removes: 'unused',
        },
      ],
      inUse: { processes: ['uv'] },
    })
  })

  test('go reads its variables in the order written', () => {
    expect(parseDescriptor(GO, 'go.yaml').vars).toEqual({
      GOPATH: [{ env: 'GOPATH' }, { value: '~/go' }],
      GOMODCACHE: [
        { env: 'GOMODCACHE' },
        { command: ['go', 'env', 'GOMODCACHE'] },
        { value: '${GOPATH}/pkg/mod' },
      ],
      GOCACHE: [
        { env: 'GOCACHE' },
        { command: ['go', 'env', 'GOCACHE'] },
        { value: { macos: '~/Library/Caches/go-build', linux: '${XDG_CACHE_HOME}/go-build' } },
      ],
    })
  })

  test('a built-in variable needs no declaration', () => {
    expect(issues(PIP_PER_OS.replace('~/.cache/pip', "'${XDG_CACHE_HOME}/pip'"))).toEqual([])
    expect(issues(PIP_PER_OS.replace('~/.cache/pip', "'${HOME}/.pip'"))).toEqual([])
  })

  test('the same descriptor as JSON reads the same', () => {
    const json = JSON.stringify(parse(HUGGING_FACE))
    expect(parseDescriptor(json, 'huggingface-hub.json')).toEqual(
      parseDescriptor(HUGGING_FACE, 'huggingface-hub.yaml'),
    )
  })

  test('a JSON descriptor may name the schema in $schema', () => {
    const json = JSON.stringify({ $schema: DESCRIPTOR_SCHEMA_URL, ...parse(HUGGING_FACE) })
    expect(issues(json)).toEqual([])
    expect(jsonSchema(JSON.parse(json))).toBe(true)
  })
})

/** HUGGING_FACE's candidate with `fields` in place of its own. */
const hfWith = (fields: string): string =>
  `descriptor: 1
paths:
  hub: { all: ~/.cache/huggingface/hub }
candidates:
  - ${fields}
`

describe('a bad descriptor names the field path', () => {
  test.each([
    [
      'a version other than 1',
      UV.replace('descriptor: 1', 'descriptor: 2'),
      'line 2: descriptor: must be 1',
    ],
    ['no version', HUGGING_FACE.replace('descriptor: 1\n', ''), 'line 1: descriptor: required'],
    [
      'no paths',
      'descriptor: 1\ncandidates: [{ path: hub, costDescription: rebuild }]\n',
      'line 1: paths: required',
    ],
    ['an unknown top-level field', `${HUGGING_FACE}name: hf\n`, 'line 10: name: unknown field'],
    [
      'an unknown candidate field',
      hfWith('{ path: hub, costDescription: rebuild, idleDays: 30 }'),
      'line 5: candidates.0.idleDays: unknown field',
    ],
    [
      'a candidate naming no folder in paths',
      hfWith('{ path: models, costDescription: rebuild }'),
      'line 5: candidates.0.path: no folder named "models" in paths',
    ],
    [
      'no costDescription',
      hfWith('{ path: hub }'),
      'line 5: candidates.0.costDescription: required',
    ],
    [
      'an unknown costDescription',
      hfWith('{ path: hub, costDescription: cheap }'),
      'line 5: candidates.0.costDescription: Invalid option: expected one of "re-download"|"rebuild"|"lost"',
    ],
    [
      'idleHours below 0',
      hfWith('{ path: hub, costDescription: rebuild, idleHours: -1 }'),
      'line 5: candidates.0.idleHours: Too small: expected number to be >=0',
    ],
    [
      'idleHours as a duration string',
      hfWith("{ path: hub, costDescription: rebuild, idleHours: '30d' }"),
      'line 5: candidates.0.idleHours: Invalid input: expected number, received string',
    ],
    [
      'a glob that climbs out',
      hfWith("{ path: hub, costDescription: rebuild, glob: '../*/' }"),
      'line 5: candidates.0.glob: must stay inside the path: no .. segment, not absolute',
    ],
    [
      'maxEntries without a glob',
      hfWith('{ path: hub, costDescription: rebuild, maxEntries: 10 }'),
      'line 5: candidates.0.maxEntries: only with glob',
    ],
    [
      'a command that names no folder (D13)',
      hfWith(
        '{ path: hub, costDescription: rebuild, command: [uv, cache, prune], removes: unused }',
      ),
      'line 5: candidates.0.command: must name the checked folder, as a {path} argument or in env (D13)',
    ],
    [
      'a command with no removes',
      hfWith("{ path: hub, costDescription: rebuild, command: [uv, cache, prune, '{path}'] }"),
      'line 5: candidates.0.removes: required with command: unused or all',
    ],
    [
      'a command with a glob',
      hfWith(
        "{ path: hub, costDescription: rebuild, glob: '*/', command: [rm, '{path}'], removes: all }",
      ),
      "line 5: candidates.0.glob: can't be combined with command",
    ],
    [
      'a command whose program is a path',
      hfWith("{ path: hub, costDescription: rebuild, command: [/bin/rm, '{path}'], removes: all }"),
      'line 5: candidates.0.command: the program must be a name on PATH, not a path',
    ],
    [
      'removes without a command',
      hfWith('{ path: hub, costDescription: rebuild, removes: all }'),
      'line 5: candidates.0.removes: only with command',
    ],
    [
      'env without a command',
      hfWith("{ path: hub, costDescription: rebuild, env: { HF_HOME: '{path}' } }"),
      'line 5: candidates.0.env: only with command',
    ],
    [
      'a relative folder',
      HUGGING_FACE.replace('~/.cache/huggingface/hub', '.cache/huggingface/hub'),
      'line 4: paths.hub.all: must start with ~/, be absolute, or start with a ${VAR}',
    ],
    [
      'a folder that climbs out',
      HUGGING_FACE.replace('~/.cache/huggingface/hub', '~/.cache/../..'),
      'line 4: paths.hub.all: must not have a .. segment',
    ],
    [
      'the home folder itself, which YAML reads as null',
      HUGGING_FACE.replace('~/.cache/huggingface/hub', '~'),
      'line 4: paths.hub.all: Invalid input: expected string, received null',
    ],
    [
      'all beside a per-OS folder',
      HUGGING_FACE.replace('{ all: ~/.cache/huggingface/hub }', '{ all: ~/a, macos: ~/b }'),
      'line 4: paths.hub: set all or per-OS folders, not both',
    ],
    [
      'an unknown OS',
      HUGGING_FACE.replace('{ all: ~/.cache/huggingface/hub }', '{ linux: ~/a, darwin: ~/b }'),
      'line 4: paths.hub.darwin: unknown field',
    ],
    [
      'detect naming no folder in paths',
      UV.replace('{ exists: cache }', '{ exists: store }'),
      'line 5: detect.any.1.exists: no folder named "store" in paths',
    ],
    [
      'detect with both any and all',
      UV.replace(
        'any: [{ onPath: uv }, { exists: cache }]',
        '{ any: [{ onPath: uv }], all: [{ onPath: uv }] }',
      ),
      'line 4: detect: set one of any or all',
    ],
    [
      'a detect condition with two tests',
      UV.replace('{ onPath: uv }', '{ onPath: uv, exists: cache }'),
      'line 5: detect.any.0: set one of onPath or exists',
    ],
    [
      'a lock that is a folder',
      UV.replace('processes: [uv]', 'locks: [~/.cache/uv/]'),
      'line 14: inUse.locks.0: must be a file, not a folder',
    ],
    [
      'a project dir that is a path',
      `${HUGGING_FACE}project:\n  - { dir: build/obj, marker: '*.csproj', costDescription: rebuild }\n`,
      'line 11: project.0.dir: must be a folder name, not a path',
    ],
    [
      'a store that is not a slug',
      HUGGING_FACE.replace('huggingface-hub', 'Hugging Face Hub'),
      'line 2: store: must be a corpus slug, such as huggingface-hub',
    ],
    [
      'a top level that is a list',
      '- descriptor: 1\n',
      'line 1: (top): Invalid input: expected object, received array',
    ],
    [
      'a path using an undeclared variable',
      PIP_PER_OS.replace('~/.cache/pip', "'${PIP_CACHE_DIR}'"),
      'line 3: paths.cache.linux: no variable ${PIP_CACHE_DIR}: declare it in vars',
    ],
    [
      'a variable written without braces',
      PIP_PER_OS.replace('~/.cache/pip', "'${XDG_CACHE_HOME/pip'"),
      'line 3: paths.cache.linux: write a variable as ${NAME}',
    ],
    [
      'a value using an undeclared variable',
      PNPM.replace('${XDG_DATA_HOME}/pnpm/store', '${DATA}/pnpm/store'),
      'line 6: vars.STORE.1.value.linux: no variable ${DATA}: declare it in vars',
    ],
    [
      'a file source using an undeclared variable',
      PNPM.replace('- command: [pnpm, store, path]', "- { file: '${RC}/pnpm.yaml', key: store }"),
      'line 5: vars.STORE.0.file: no variable ${RC}: declare it in vars',
    ],
    [
      'a lock using an undeclared variable',
      PNPM.replace('processes: [pnpm]', "locks: ['${LOCKS}/pnpm.lock']"),
      'line 15: inUse.locks.0: no variable ${LOCKS}: declare it in vars',
    ],
    [
      'a built-in declared again',
      PNPM.replace('  STORE:', '  XDG_DATA_HOME:\n    - env: DATA\n  STORE:'),
      'line 4: vars.XDG_DATA_HOME: XDG_DATA_HOME is built in; use it without declaring it',
    ],
    [
      'a variable that refers to itself',
      PNPM.replace('${XDG_DATA_HOME}/pnpm/store', '${STORE}/v10'),
      'line 4: vars.STORE: STORE refers back to itself: STORE -> STORE',
    ],
    [
      'a value that climbs out',
      GO.replace('- value: ~/go', "- value: '${HOME}/../go'"),
      'line 8: vars.GOPATH.1.value: must not have a .. segment',
    ],
    [
      'a file source that is not TOML, JSON or YAML',
      PNPM.replace('- command: [pnpm, store, path]', '- { file: ~/.npmrc, key: store-dir }'),
      'line 5: vars.STORE.0.file: must be a .toml, .json, .yaml, .yml file',
    ],
    [
      'a relative value',
      GO.replace('- value: ~/go', '- value: go'),
      'line 8: vars.GOPATH.1.value: must start with ~/, be absolute, or start with a ${VAR}',
    ],
    [
      'a command source whose program is a path',
      PNPM.replace('[pnpm, store, path]', '[/usr/bin/pnpm, store, path]'),
      'line 5: vars.STORE.0.command: the program must be a name on PATH, not a path',
    ],
    [
      'a variable name that is no environment variable name',
      PNPM.replace('  STORE:', '  pnpm-store:'),
      'line 4: vars.pnpm-store: Invalid key in record',
    ],
  ])('%s', (_, text, issue) => {
    expect(issues(text)).toEqual([issue])
  })

  test('a cycle through several variables is named once, with its chain', () => {
    const text = GO.replace('- value: ~/go', "- value: '${GOMODCACHE}/go'")
    expect(issues(text)).toEqual([
      'line 6: vars.GOPATH: GOPATH refers back to itself: GOPATH -> GOMODCACHE -> GOPATH',
    ])
  })

  test('every problem is listed, not only the first', () => {
    expect(issues(hfWith('{ path: models, costDescription: rebuild }\n  - { path: hub }'))).toEqual(
      ['line 6: candidates.1.costDescription: required'],
    )
    expect(
      issues(
        hfWith(
          '{ path: models, costDescription: rebuild }\n  - { path: blobs, costDescription: rebuild }',
        ),
      ),
    ).toEqual([
      'line 5: candidates.0.path: no folder named "models" in paths',
      'line 6: candidates.1.path: no folder named "blobs" in paths',
    ])
  })

  test('descriptorIssues gives the same paths, without lines', () => {
    expect(descriptorIssues(parse(hfWith('{ path: models, costDescription: rebuild }')))).toEqual([
      'candidates.0.path: no folder named "models" in paths',
    ])
    expect(descriptorIssues(parse(HUGGING_FACE))).toEqual([])
  })

  test('the shipped JSON Schema refuses the shape errors too, at the same path', () => {
    const bad: [string, string][] = [
      [UV.replace('descriptor: 1', 'descriptor: 2'), '/descriptor'],
      [hfWith('{ path: hub, costDescription: cheap }'), '/candidates/0/costDescription'],
      [hfWith("{ path: hub, costDescription: rebuild, command: [rm, '{path}'] }"), '/candidates/0'],
      [
        hfWith(
          "{ path: hub, costDescription: rebuild, glob: '*/', command: [rm, '{path}'], removes: all }",
        ),
        '/candidates/0',
      ],
      [
        HUGGING_FACE.replace('{ all: ~/.cache/huggingface/hub }', '{ all: ~/a, macos: ~/b }'),
        '/paths/hub',
      ],
      [HUGGING_FACE.replace('~/.cache/huggingface/hub', '.cache/hub'), '/paths/hub/all'],
    ]
    for (const [text, path] of bad) {
      expect(jsonSchema(parse(text)), text).toBe(false)
      expect(jsonSchema.errors?.map((e) => e.instancePath)).toContain(path)
    }
  })
})

describe('the YAML reader', () => {
  test('a YAML syntax error names its line', () => {
    expect(issues('descriptor: 1\npaths: { hub: [\n')).toEqual([
      expect.stringMatching(/^line \d+: /),
    ])
  })

  test('a key given twice is an error, not the last one winning', () => {
    expect(issues(`${HUGGING_FACE}descriptor: 1\n`)).toEqual([
      expect.stringMatching(/^line 10: .*unique/i),
    ])
  })

  test('the error names the file and every issue', () => {
    expect(() => parseDescriptor(hfWith('{ path: hub, glob: 1 }'), 'hf.yaml')).toThrow(
      'bad descriptor hf.yaml: line 5: candidates.0.glob: Invalid input: expected string, received number; line 5: candidates.0.costDescription: required',
    )
  })

  test('readDescriptor reads a file, and names one it cannot read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-descriptor-'))
    try {
      const file = join(dir, 'uv.yaml')
      writeFileSync(file, UV)
      expect(readDescriptor(file)).toEqual(parseDescriptor(UV, file))
      const missing = join(dir, 'gone.yaml')
      expect(() => readDescriptor(missing)).toThrow(`bad descriptor ${missing}: cannot read:`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('the shipped JSON Schema', () => {
  test('schemas/descriptor-1.json is what write-descriptor-schema writes', () => {
    const stale = 'stale: run `pnpm run write:descriptor-schema` and commit the result'
    expect(readFileSync(DESCRIPTOR_SCHEMA_FILE, 'utf8'), stale).toBe(descriptorSchemaText())
  })

  test('its $id is the URL the examples name, pinned to descriptor-1', () => {
    expect(descriptorJsonSchema()['$id']).toBe(DESCRIPTOR_SCHEMA_URL)
    expect(UV).toContain(`$schema=${DESCRIPTOR_SCHEMA_URL}`)
  })

  test('the package ships it', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      files: string[]
    }
    expect(pkg.files).toContain('schemas/')
  })
})
