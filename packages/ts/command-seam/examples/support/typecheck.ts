/**
 * Typecheck in-memory TypeScript against the package's own compiler options,
 * for the code blocks in the README and the decisions. The `typecheck` script
 * covers files on disk.
 */

import { join } from 'node:path'

import ts from 'typescript'

export const EXAMPLES_DIR = join(import.meta.dirname, '..')
export const PACKAGE_DIR = join(EXAMPLES_DIR, '..')

/** Compiler options from the package tsconfig, adjusted for consumer code. */
function compilerOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(PACKAGE_DIR, 'tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(
          `could not read tsconfig.json: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`,
        )
      },
    },
  )
  if (!parsed) throw new Error('could not read tsconfig.json')
  if (parsed.errors.length > 0) {
    const messages = parsed.errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    throw new Error(`tsconfig.json has errors:\n${messages.join('\n')}`)
  }
  return {
    ...parsed.options,
    // A snippet often imports more than it uses.
    noUnusedLocals: false,
  }
}

/**
 * Typecheck `files` (absolute path to source) together and return the
 * diagnostics for each, formatted one per line. A path with no diagnostics
 * maps to an empty list.
 */
export function typecheck(files: Record<string, string>): Record<string, string[]> {
  const options = compilerOptions()
  const host = ts.createCompilerHost(options)
  // The compiler asks for paths with `/`, also on Windows. Key the sources the same way.
  const slashed = (p: string) => p.replaceAll('\\', '/')
  const sources = new Map(Object.entries(files).map(([p, source]) => [slashed(p), source]))
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  host.readFile = (p) => sources.get(slashed(p)) ?? readFile(p)
  host.fileExists = (p) => sources.has(slashed(p)) || fileExists(p)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (p, lang, ...rest) => {
    const source = sources.get(slashed(p))
    return source === undefined
      ? getSourceFile(p, lang, ...rest)
      : ts.createSourceFile(p, source, lang)
  }

  const program = ts.createProgram(Object.keys(files), options, host)
  const out: Record<string, string[]> = Object.fromEntries(Object.keys(files).map((p) => [p, []]))
  const original = new Map(Object.keys(files).map((p) => [slashed(p), p]))
  for (const d of ts.getPreEmitDiagnostics(program)) {
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
    const file = d.file === undefined ? undefined : original.get(slashed(d.file.fileName))
    if (file === undefined) {
      // A diagnostic outside the checked files (a broken tsconfig, say) fails every file.
      for (const list of Object.values(out)) list.push(message)
      continue
    }
    const { line } = d.file!.getLineAndCharacterOfPosition(d.start ?? 0)
    out[file]!.push(`line ${line + 1}: ${message}`)
  }
  return out
}
