/**
 * The descriptor format: the system description's examples, bad files and the
 * field path each names, the YAML reader, and the shipped JSON Schema.
 */

import { Ajv2020 } from 'ajv/dist/2020.js'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { tempHome } from '../src/testing.ts'

// The examples as the system description gives them.

const UV = `# yaml-language-server: $schema=${DESCRIPTOR_SCHEMA_URL}
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
const shippedText = readFileSync(DESCRIPTOR_SCHEMA_FILE, 'utf8')
const jsonSchema = ajv.compile(JSON.parse(shippedText))

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
  test.each(Object.entries(TIER_1))('%s reads', (_, text) => {
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

  test('the tier 2 examples are refused by the reader until variables are built', () => {
    expect(issues(PNPM)).toEqual([
      'line 3: vars: variables (tier 2) are not supported yet',
      'line 8: paths.store.all: variables (tier 2) are not supported yet',
    ])
    expect(issues(GO)[0]).toBe('line 5: vars: variables (tier 2) are not supported yet')
  })

  test('a ${VAR} in a tier 1 path is refused too', () => {
    expect(issues(PIP_PER_OS.replace('~/.cache/pip', "'${XDG_CACHE_HOME}/pip'"))).toEqual([
      'line 3: paths.cache.linux: variables (tier 2) are not supported yet',
    ])
  })

  test('a ${VAR} in a lock is refused too', () => {
    expect(issues(UV.replace('processes: [uv]', "locks: ['${HOME}/.cache/uv/.lock']"))).toEqual([
      'line 14: inUse.locks.0: variables (tier 2) are not supported yet',
    ])
  })

  test('a ${VAR} in a command argument, an env value or a glob is refused too', () => {
    expect(
      issues(
        hfWith(
          "{ path: hub, costDescription: rebuild, command: [go, clean, '${GOCACHE}/x', '{path}'], env: { A: '${B}' }, removes: all }",
        ),
      ),
    ).toEqual([
      'line 5: candidates.0.command.2: variables (tier 2) are not supported yet',
      'line 5: candidates.0.env.A: variables (tier 2) are not supported yet',
    ])
    expect(issues(hfWith("{ path: hub, costDescription: rebuild, glob: '${X}/*' }"))).toEqual([
      'line 5: candidates.0.glob: variables (tier 2) are not supported yet',
    ])
  })

  test('vars is reported beside the schema problems, not after they are fixed', () => {
    expect(
      issues(`${hfWith("{ path: hub, costDescription: rebuild, idleHours: 'x' }")}vars: {}\n`),
    ).toEqual([
      'line 5: candidates.0.idleHours: Invalid input: expected number, received string',
      'line 6: vars: variables (tier 2) are not supported yet',
    ])
  })

  test('a glob or marker whose every {a,b} alternative names an entry is accepted', () => {
    expect(
      issues(hfWith("{ path: hub, costDescription: rebuild, glob: '{models,datasets}--*/' }")),
    ).toEqual([])
    expect(issues(hfWith("{ path: hub, costDescription: rebuild, glob: 'a/{,b}' }"))).toEqual([])
    expect(
      issues(
        `${HUGGING_FACE}project:\n  - { dir: obj, marker: '*.{csproj,fsproj}', costDescription: rebuild }\n`,
      ),
    ).toEqual([])
  })

  test.each([11, 20_000])('a glob or marker with %i {a,b} braces is refused, not a crash', (n) => {
    const glob = '{a,b}'.repeat(n)
    expect(issues(hfWith(`{ path: hub, costDescription: rebuild, glob: '${glob}' }`))).toEqual([
      'line 5: candidates.0.glob: must have no more than 1024 {a,b} alternatives',
    ])
    expect(
      issues(
        `${HUGGING_FACE}project:\n  - { dir: obj, marker: '${glob}', costDescription: rebuild }\n`,
      ),
    ).toEqual(['line 11: project.0.marker: must have no more than 1024 {a,b} alternatives'])
  })

  test('a glob with two wide {a,b} groups is refused before they are expanded', () => {
    const group = `{${Array(20_000).fill('a').join(',')}}`
    expect(
      issues(hfWith(`{ path: hub, costDescription: rebuild, glob: '${group}${group}' }`)),
    ).toEqual(['line 5: candidates.0.glob: must have no more than 1024 {a,b} alternatives'])
  })

  test('a glob may start with ~ when it names an entry, such as ~$*', () => {
    expect(issues(hfWith("{ path: hub, costDescription: rebuild, glob: '~$*' }"))).toEqual([])
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
      'a glob that names no entry, only the path itself',
      hfWith("{ path: hub, costDescription: rebuild, glob: './' }"),
      'line 5: candidates.0.glob: must name entries under the path, in every {a,b} alternative, such as models--*/',
    ],
    ...['{.,x}', '{x,.}/', '{,x}', '{b,{.,c}}', '{x,{,y}}'].map(
      (glob): [string, string, string] => [
        `a glob with an alternative that names the path itself, ${glob}`,
        hfWith(`{ path: hub, costDescription: rebuild, glob: '${glob}' }`),
        'line 5: candidates.0.glob: must name entries under the path, in every {a,b} alternative, such as models--*/',
      ],
    ),
    ...['{..,x}', '.{.,x}', '{x,a/b}', '{,x}', '{x,{.,y}}'].map(
      (marker): [string, string, string] => [
        `a project marker with an alternative that is not a name, ${marker}`,
        `${HUGGING_FACE}project:\n  - { dir: obj, marker: '${marker}', costDescription: rebuild }\n`,
        'line 11: project.0.marker: must be a file name or glob, not a path',
      ],
    ),
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
    ...['~/', '~/.', '~//', '/', '/.', 'C:\\'].map((root): [string, string, string] => [
      `${root} alone, which would make the whole of it a root`,
      HUGGING_FACE.replace('~/.cache/huggingface/hub', `'${root}'`),
      'line 4: paths.hub.all: must name a folder below the home folder or a root, not the home folder or a root itself',
    ]),
    ...[
      '/home/alice',
      '/Users/alice/',
      '/root',
      'C:\\Users\\alice',
      '/home/alice/.',
      '//home/alice',
      '/home//alice',
      'C:/Users//alice',
      '/home/./alice',
      '/Users\\alice',
      '/var\\root',
      '/var/root',
      '/private/var/root/',
      '/var/home/alice',
      '/usr/home/alice',
      '/export/home/alice/',
      '/mnt/c/Users/alice',
    ].map((home): [string, string, string] => [
      `a home folder written out, ${home}`,
      HUGGING_FACE.replace('~/.cache/huggingface/hub', `'${home}'`),
      'line 4: paths.hub.all: must name a folder below a home folder, not a home folder itself',
    ]),
    ...[
      '{..,x}/*',
      '{/etc,x}',
      'a/{x,~/y}',
      '{x,C:/y}',
      '.{.,x}/*',
      '{.,x}./*',
      'a/.{.,x}',
      '{,x}/etc',
      '{,x}~/y',
      '{C,x}:/y',
    ].map((glob): [string, string, string] => [
      `a glob with an alternative that leaves the path, ${glob}`,
      hfWith(`{ path: hub, costDescription: rebuild, glob: '${glob}' }`),
      'line 5: candidates.0.glob: must stay inside the path: no .. segment, not absolute',
    ]),
    [
      'a numeric unknown key names its own line',
      `${HUGGING_FACE}1: x\n`,
      'line 10: 1: unknown field',
    ],
    [
      'a detect onPath that is a path',
      UV.replace('{ onPath: uv }', '{ onPath: /usr/local/bin/uv }'),
      'line 5: detect.any.0.onPath: the program must be a name on PATH, not a path',
    ],
    [
      'a glob that starts at the home folder',
      hfWith("{ path: hub, costDescription: rebuild, glob: '~/x' }"),
      'line 5: candidates.0.glob: must stay inside the path: no .. segment, not absolute',
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
    ...['~/.cache/uv/', '~/.cache/uv/.'].map((lock): [string, string, string] => [
      `a lock that is a folder, ${lock}`,
      UV.replace('processes: [uv]', `locks: ['${lock}']`),
      'line 14: inUse.locks.0: must be a file, not a folder',
    ]),
    ...['PATH', 'Path', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'NODE_OPTIONS', 'BASH_ENV'].map(
      (name): [string, string, string] => [
        `an env entry that redirects the program, ${name}`,
        hfWith(
          `{ path: hub, costDescription: rebuild, command: [rm, -rf, x], env: { ${name}: '{path}' }, removes: all }`,
        ),
        `line 5: candidates.0.env.${name}: must not change which program runs or what it loads`,
      ],
    ),
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
  ])('%s', (_, text, issue) => {
    expect(issues(text)).toEqual([issue])
  })

  test('${HOME} alone is a home folder too, and a variable', () => {
    expect(issues(HUGGING_FACE.replace('~/.cache/huggingface/hub', "'${HOME}'"))).toEqual([
      'line 4: paths.hub.all: must name a folder below a home folder, not a home folder itself',
      'line 4: paths.hub.all: variables (tier 2) are not supported yet',
    ])
  })

  test('every problem is listed, not only the first', () => {
    expect(issues(hfWith('{ path: models, costDescription: rebuild }\n  - { path: hub }'))).toEqual(
      [
        'line 6: candidates.1.costDescription: required',
        'line 5: candidates.0.path: no folder named "models" in paths',
      ],
    )
    // The candidate's and the paths entry's own cross-field checks, beside a type error.
    expect(
      issues(hfWith('{ path: hub, costDescription: rebuild, command: [uv, prune], idleHours: x }')),
    ).toEqual([
      'line 5: candidates.0.idleHours: Invalid input: expected number, received string',
      'line 5: candidates.0.removes: required with command: unused or all',
      'line 5: candidates.0.command: must name the checked folder, as a {path} argument or in env (D13)',
    ])
    expect(
      issues(HUGGING_FACE.replace('{ all: ~/.cache/huggingface/hub }', '{ all: ~/a, linux: 1 }')),
    ).toEqual([
      'line 4: paths.hub.linux: Invalid input: expected string, received number',
      'line 4: paths.hub: set all or per-OS folders, not both',
    ])
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

  test('too many aliases expanded is a DescriptorError, not a crash', () => {
    const lines = ['a: &a [x, x, x, x, x, x, x, x, x, x]']
    for (let i = 1; i < 8; i++) {
      const prev = String.fromCharCode(96 + i)
      const next = String.fromCharCode(97 + i)
      lines.push(`${next}: &${next} [${Array(10).fill(`*${prev}`).join(', ')}]`)
    }
    expect(issues(`${lines.join('\n')}\n`)).toEqual([expect.stringMatching(/^\(top\): .*alias/i)])
  })

  test('the error names the file and every issue', () => {
    expect(() => parseDescriptor(hfWith('{ path: hub, glob: 1 }'), 'hf.yaml')).toThrow(
      'bad descriptor hf.yaml: line 5: candidates.0.glob: Invalid input: expected string, received number; line 5: candidates.0.costDescription: required',
    )
  })

  test('readDescriptor reads a file, and names one it cannot read', () => {
    const dir = tempHome('hc-descriptor-')
    try {
      const file = join(dir.home, 'uv.yaml')
      writeFileSync(file, UV)
      expect(readDescriptor(file)).toEqual(parseDescriptor(UV, file))
      const missing = join(dir.home, 'gone.yaml')
      expect(() => readDescriptor(missing)).toThrow(`bad descriptor ${missing}: cannot read:`)
    } finally {
      dir.cleanup()
    }
  })
})

describe('the shipped JSON Schema', () => {
  test('schemas/descriptor-1.json is what write-descriptor-schema writes', () => {
    const stale = 'stale: run `pnpm run write:descriptor-schema` and commit the result'
    expect(shippedText, stale).toBe(descriptorSchemaText())
  })

  test('write-descriptor-schema writes it from a checkout under a symlink too', () => {
    const dir = tempHome('hc-descriptor-')
    try {
      // A copy, so the run writes to the temp folder and not to this checkout.
      const real = join(dir.home, 'real')
      const pkg = fileURLToPath(new URL('..', import.meta.url))
      for (const part of ['package.json', 'scripts', 'src'])
        cpSync(join(pkg, part), join(real, part), { recursive: true })
      symlinkSync(join(pkg, 'node_modules'), join(real, 'node_modules'))
      mkdirSync(join(real, 'schemas'))
      symlinkSync(real, join(dir.home, 'link'))
      execFileSync(process.execPath, [
        join(dir.home, 'link', 'scripts', 'write-descriptor-schema.ts'),
      ])
      expect(readFileSync(join(real, 'schemas', 'descriptor-1.json'), 'utf8')).toBe(
        descriptorSchemaText(),
      )
    } finally {
      dir.cleanup()
    }
  })

  test('its $id is the URL the README names, on no release', () => {
    expect(DESCRIPTOR_SCHEMA_URL).toBe(
      'https://unpkg.com/@osdlc/host-cleaner/schemas/descriptor-1.json',
    )
    expect(descriptorJsonSchema()['$id']).toBe(DESCRIPTOR_SCHEMA_URL)
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    expect(readme).toContain(`$schema=${DESCRIPTOR_SCHEMA_URL}`)
  })

  test('the package ships it, and exports it', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      files: string[]
      exports: Record<string, unknown>
    }
    expect(pkg.files).toContain('schemas/')
    expect(pkg.exports['./schemas/descriptor-1.json']).toBe('./schemas/descriptor-1.json')
  })
})
