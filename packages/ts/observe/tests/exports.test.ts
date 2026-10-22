/**
 * Checks on the public surface as a whole: every export of both entry points
 * is used in examples/, is documented, and has the stability tier the README
 * lists; the functions that can throw say so; the README's code blocks come
 * from examples/; and the shipped files stay clean.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { describe, expect, test } from 'vitest'

import * as core from '../src/index.ts'
import * as session from '../src/session.ts'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')
const CHANGELOG = readFileSync(join(PACKAGE_DIR, 'CHANGELOG.md'), 'utf-8')
const MANIFEST: { name: string; files: string[]; [field: string]: unknown } = JSON.parse(
  readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8'),
)
const PACKAGE_NAME = MANIFEST.name

interface ExportInfo {
  experimental: boolean
  documented: boolean
  throws: boolean
}

/** Every export of an entry point, with its tier, its doc and whether it carries `@throws`. */
function exportInfo(entry: string): Map<string, ExportInfo> {
  const program = ts.createProgram([entry], {
    allowImportingTsExtensions: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!
  const out = new Map<string, ExportInfo>()
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    const tags = (symbol.declarations ?? []).flatMap((d) => ts.getJSDocTags(d))
    out.set(exported.name, {
      experimental: tags.some((t) => t.tagName.text === 'experimental'),
      documented: ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim() !== '',
      throws: tags.some((t) => t.tagName.text === 'throws'),
    })
  }
  return out
}

const CORE = exportInfo(join(PACKAGE_DIR, 'src', 'index.ts'))
const SESSION = exportInfo(join(PACKAGE_DIR, 'src', 'session.ts'))
const EXPORTS = new Map([...CORE, ...SESSION])

/** Whitespace, line comments and trailing commas removed, so reflowed code compares equal. */
function squash(code: string): string {
  return code
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '')
    .replace(/,([)\]}])/g, '$1')
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

function readmeBlocks(): string[] {
  return [...README.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!)
}

test('the two entry points export 30 and 82 names, and share none', () => {
  expect([CORE.size, SESSION.size]).toEqual([30, 82])
  expect([...CORE.keys()].filter((name) => SESSION.has(name))).toEqual([])
})

test('the runtime exports of the core entry are its functions and constants, no more', () => {
  expect(Object.keys(core).sort()).toEqual(
    [
      'appendJsonl',
      'correlationFromEnv',
      'deriveMachineId',
      'INVOCATION_ENV_VAR',
      'INVOCATION_PID_ENV_VAR',
      'isThisMachine',
      'jsonlSize',
      'LOG_ENVELOPE_VERSION',
      'LOG_SOURCES',
      'LogEnvelopeSchema',
      'LogSourceSchema',
      'MACHINE_ENV_VAR',
      'machineId',
      'newRunId',
      'newSortableId',
      'parseJsonl',
      'readJsonl',
      'readJsonlFrom',
      'resolveOriginator',
      'RUN_ENV_VAR',
      'SESSION_ENV_VAR',
      'SUBJECT_ENV_VAR',
    ].sort(),
  )
})

test('the runtime exports of the session entry are its functions and constants, no more', () => {
  expect(Object.keys(session).sort()).toEqual(
    [
      'AUTHOR_ENV_VAR',
      'authorFromEnv',
      'BACKFILL_STATUSES',
      'decideReconcile',
      'DEFAULT_GRACE_MS',
      'defineSessionModel',
      'endedAsLost',
      'endSession',
      'EVENTS_FILE',
      'isLegalTransition',
      'liveSessionIds',
      'looseSessionModel',
      'PINNED_CMD_ENV_VAR',
      'processScanSupported',
      'PROJECT_ROOT_ENV_VAR',
      'reconcileSessions',
      'RECORD_FILE',
      'resolveLineage',
      'resolveRun',
      'runHeadlessSession',
      'runInteractiveSession',
      'runStateForStatus',
      'scanTaggedProcesses',
      'SESSION_CAPTURES',
      'SESSION_DONE_OUTCOMES',
      'SESSION_ID_RE',
      'SESSION_OUTCOMES',
      'SESSION_RUN_STATES',
      'SessionCaptureSchema',
      'SessionDoneOutcomeSchema',
      'SessionDoneSchema',
      'sessionEnv',
      'sessionEventsPath',
      'SessionKindSchema',
      'SessionLaunchedSchema',
      'SessionLogError',
      'SessionNameSourceSchema',
      'SessionOriginSchema',
      'SessionOutcomeSchema',
      'SessionParentSchema',
      'SessionRunStateSchema',
      'TASK_ENV_VAR',
      'UsageSampleSchema',
    ].sort(),
  )
})

test('the internal helpers are not exported from either entry', () => {
  const hidden = [
    'reconcileCause',
    'parseJsonlLines',
    'lineageFromEnv',
    'parsePsEnvironment',
    'resolveMachineId',
    'readTag',
    'withLegacyNames',
    'LOST_HOOK_NOTE',
    'types',
  ]
  expect(hidden.filter((name) => EXPORTS.has(name))).toEqual([])
})

test('every export is used by examples/, which imports the package names only', () => {
  const allowed = new Set([
    PACKAGE_NAME,
    `${PACKAGE_NAME}/session`,
    'vitest',
    'zod',
    '@osdlc/command-seam',
  ])
  const dir = join(PACKAGE_DIR, 'examples')
  const imported = { [PACKAGE_NAME]: new Set<string>(), [`${PACKAGE_NAME}/session`]: new Set() }
  const specifiers = new Set<string>()
  for (const file of sourceFiles(dir)) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest)
    for (const statement of sf.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text
      specifiers.add(specifier)
      const named = statement.importClause?.namedBindings
      const into = imported[specifier]
      if (!into || !named || !ts.isNamedImports(named)) continue
      for (const element of named.elements) into.add((element.propertyName ?? element.name).text)
    }
  }
  expect([...specifiers].filter((s) => !allowed.has(s) && !s.startsWith('node:'))).toEqual([])
  expect([...CORE.keys()].filter((name) => !imported[PACKAGE_NAME]!.has(name))).toEqual([])
  expect(
    [...SESSION.keys()].filter((name) => !imported[`${PACKAGE_NAME}/session`]!.has(name)),
  ).toEqual([])
})

test('every export has TSDoc', () => {
  expect([...EXPORTS].filter(([, info]) => !info.documented).map(([name]) => name)).toEqual([])
})

test('the README experimental list matches the @experimental tags', () => {
  const start = README.indexOf('The experimental exports:')
  expect(start).toBeGreaterThan(-1)
  const list = README.slice(start).split('\n\n')[1] ?? ''
  const listed = [...list.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!)
  const tagged = [...EXPORTS].filter(([, info]) => info.experimental).map(([name]) => name)

  expect(listed.filter((name) => !EXPORTS.has(name))).toEqual([])
  expect([...listed].sort()).toEqual([...tagged].sort())
  expect([...CORE].filter(([, info]) => info.experimental)).toEqual([])
  expect([...tagged].sort()).toEqual(
    [
      // the reconcile run
      'BACKFILL_STATUSES',
      'BackfillStatus',
      'ReconcileDeps',
      'ReconcileReport',
      'ReconcileRow',
      'reconcileSessions',
      // the lifecycle runner
      'endSession',
      'HostOpened',
      'InteractiveResult',
      'InteractiveRun',
      'LifecycleEvent',
      'LifecyclePorts',
      'resolveLineage',
      'resolveRun',
      'RunContext',
      'runHeadlessSession',
      'runInteractiveSession',
    ].sort(),
  )
})

test('the functions that can throw say so with @throws, and no others do', () => {
  const throwing = [...EXPORTS].filter(([, info]) => info.throws).map(([name]) => name)
  expect(throwing.sort()).toEqual(
    ['appendJsonl', 'readJsonl', 'runHeadlessSession', 'runInteractiveSession'].sort(),
  )
})

test('the README names every export', () => {
  // A code span that starts with the name, such as `sessionEnv(...)`, names it.
  const named = new Set([...README.matchAll(/`([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!))
  expect([...EXPORTS.keys()].filter((name) => !named.has(name))).toEqual([])
})

test('every README ts block, minus its imports, appears in examples/', () => {
  const blocks = readmeBlocks()
  expect(blocks.length).toBeGreaterThan(0)
  const examples = squash(
    sourceFiles(join(PACKAGE_DIR, 'examples'))
      .map((f) => readFileSync(f, 'utf-8'))
      .join('\n'),
  )
  for (const block of blocks) {
    const sf = ts.createSourceFile('block.ts', block, ts.ScriptTarget.Latest)
    const body = sf.statements
      .filter((s) => !ts.isImportDeclaration(s))
      .map((s) => s.getFullText(sf))
      .join('\n')
    expect(body.trim()).not.toBe('')
    expect(examples).toContain(squash(body))
  }
})

test('the README imports the published names', () => {
  const blocks = readmeBlocks().join('\n')
  expect(blocks).toContain(`from '${PACKAGE_NAME}'`)
  expect(blocks).toContain(`from '${PACKAGE_NAME}/session'`)
})

test('zod is a peer dependency, and command-seam the one runtime dependency', () => {
  expect(Object.keys((MANIFEST['dependencies'] as object | undefined) ?? {})).toEqual([
    '@osdlc/command-seam',
  ])
  expect(MANIFEST['peerDependencies']).toEqual({ zod: '^4' })
  expect(MANIFEST['optionalDependencies']).toBeUndefined()
})

describe('what the package ships', () => {
  const sources = [
    ...readdirSync(join(PACKAGE_DIR, 'src'))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => join(PACKAGE_DIR, 'src', f)),
    join(PACKAGE_DIR, 'README.md'),
    join(PACKAGE_DIR, 'CHANGELOG.md'),
  ]

  test('the tests and examples import only the names of this package', () => {
    const files = [
      ...sourceFiles(join(PACKAGE_DIR, 'tests')),
      ...sourceFiles(join(PACKAGE_DIR, 'examples')),
    ].filter((f) => !f.endsWith('exports.test.ts'))
    for (const file of files) {
      const text = readFileSync(file, 'utf-8')
      const specs = [...text.matchAll(/@osdlc\/[\w-]+(\/[\w-]+)?/g)].map((m) => m[0])
      for (const spec of specs) {
        expect([PACKAGE_NAME, `${PACKAGE_NAME}/session`, '@osdlc/command-seam']).toContain(spec)
      }
    }
  })

  test('no source file or document names the pre-release package scope', () => {
    for (const file of sources) {
      expect([file, readFileSync(file, 'utf-8').includes('@' + 'sksizer')]).toEqual([file, false])
    }
  })

  test('the changelog links no pull request and names no repository', () => {
    expect(CHANGELOG).not.toMatch(/#\d{2,}\b/)
    expect(CHANGELOG).not.toMatch(/github\.com/)
  })

  test('the manifest ships compiled files only, with no bun condition', () => {
    expect(MANIFEST.files.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))).toEqual([])
    expect(JSON.stringify(MANIFEST['exports'])).not.toContain('"bun"')
  })
})
