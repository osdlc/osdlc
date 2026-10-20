/**
 * Every `ts` code block in README.md type-checks against the package. The
 * blocks show snippets, so each one is checked in a small wrapper: its own
 * `import` lines stay at the top, the rest goes inside an async function, and
 * the names the README leaves out (`gh`, `options`, `runner` and so on) are
 * declared in a prelude. A block that drifts from the API fails here.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'bun:test'
import ts from 'typescript'

const PACKAGE_DIR = join(import.meta.dir, '..')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')

interface Block {
  /** The 1-based README line of the first line of code. */
  line: number
  code: string
}

function tsBlocks(): Block[] {
  const blocks: Block[] = []
  const lines = README.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== '```ts') continue
    const start = i + 1
    let end = start
    while (lines[end] !== '```') end++
    blocks.push({ line: start + 1, code: lines.slice(start, end).join('\n') })
    i = end
  }
  return blocks
}

/** Value and type names the package exports, taken from its entry point. */
function exportedNames(program: ts.Program): { values: string[]; types: string[] } {
  const checker = program.getTypeChecker()
  const entry = program.getSourceFile(join(PACKAGE_DIR, 'index.ts'))!
  const values: string[] = []
  const types: string[] = []
  for (const exported of checker.getExportsOfModule(checker.getSymbolAtLocation(entry)!)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    if (symbol.flags & ts.SymbolFlags.Value) values.push(exported.name)
    else types.push(exported.name)
  }
  return { values, types }
}

/** Names the README leaves undeclared in its snippets. */
const AMBIENT = `
declare const gh: Gh
declare const options: CreatePrOptions
declare const payload: unknown
declare const runner: AsyncCommandRunner
declare const branches: string[]
`

function compilerOptions(): ts.CompilerOptions {
  const file = join(PACKAGE_DIR, 'tsconfig.json')
  const read = ts.readConfigFile(file, ts.sys.readFile)
  return ts.parseJsonConfigFileContent(read.config, ts.sys, PACKAGE_DIR).options
}

test('the README has ts blocks to check', () => {
  expect(tsBlocks().length).toBeGreaterThan(10)
})

test('every ts block in the README type-checks against the package', () => {
  const options = { ...compilerOptions(), noEmit: true, noUnusedLocals: false }
  const base = ts.createProgram([join(PACKAGE_DIR, 'index.ts')], options)
  const { values, types } = exportedNames(base)

  const sources = new Map<string, string>()
  const blocks = tsBlocks()
  blocks.forEach((block, n) => {
    const all = block.code.split('\n')
    const imports = all.filter((l) => l.startsWith('import '))
    const body = all.filter((l) => !l.startsWith('import '))
    const own = new Set(imports.flatMap((l) => Array.from(l.matchAll(/\b(\w+)\b/g), (m) => m[1]!)))
    const prelude = [
      `import { ${[
        ...values.filter((v) => !own.has(v)),
        ...types.filter((t) => !own.has(t)).map((t) => `type ${t}`),
      ].join(', ')} } from './index.ts'`,
    ]
    const ambient = AMBIENT.split('\n').filter(
      (l) => !own.has(l.split(' ')[2]?.replace(':', '') ?? ''),
    )
    sources.set(
      join(PACKAGE_DIR, `readme-block-${n}.ts`),
      [
        ...imports,
        ...prelude,
        ...ambient,
        'async function block() {',
        ...body,
        '}',
        'void block',
      ].join('\n'),
    )
  })

  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (name, ...rest) => {
    const text = sources.get(name)
    return text === undefined
      ? getSourceFile(name, ...rest)
      : ts.createSourceFile(name, text, rest[0])
  }
  host.fileExists = (
    (exists) => (name: string) =>
      sources.has(name) || exists(name)
  )(host.fileExists)
  const program = ts.createProgram([...sources.keys()], options, host)

  const problems: string[] = []
  for (const [name] of sources) {
    const n = Number(name.match(/readme-block-(\d+)\.ts$/)![1])
    for (const d of ts.getPreEmitDiagnostics(program, program.getSourceFile(name))) {
      problems.push(
        `README.md line ${blocks[n]!.line}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`,
      )
    }
  }
  expect(problems).toEqual([])
})
