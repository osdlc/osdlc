// The shape every packages/ts/* package keeps, as checks over data that
// check-packages.mjs reads from disk and from the packed tarball:
//
//   - `exports` has no `bun` condition. Every entry is `types` and `default`,
//     both under dist/.
//   - The tarball ships no TypeScript source. A hand-written `.d.ts` is fine.
//   - No script invokes bun, and `@types/bun` is not a dependency.
//   - tsconfig.json and tsconfig.build.json set no `customConditions`, map no
//     `paths` entry to a file outside the package, and do not add bun types.
//     Packages resolve each other through their built dist/, so a typecheck
//     runs after the build.
//
// Each check returns a list of problems, empty when the package is fine.
// package-shape.test.mjs tests them.
import { posix } from 'node:path'

/** `text` as JSON: strips line and block comments (not inside strings) and trailing commas. */
export function parseJsonc(text) {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 2
    } else {
      out += c
      i++
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

/** The `exports` paths at which a `bun` condition appears. */
export function bunConditions(exportsField, path = 'exports') {
  if (exportsField === null || typeof exportsField !== 'object') return []
  const found = []
  for (const [key, value] of Object.entries(exportsField)) {
    if (key === 'bun') found.push(`${path}.bun`)
    found.push(...bunConditions(value, `${path}[${JSON.stringify(key)}]`))
  }
  return found
}

/** The packed files that are TypeScript source: `.ts`, `.mts`, `.cts`, `.tsx`, but not `.d.ts`. */
export function shippedSource(packedFiles) {
  return packedFiles.filter((f) => /\.(ts|mts|cts|tsx)$/.test(f) && !/\.d\.[mc]?ts$/.test(f))
}

/** The scripts that invoke bun, as `name: command`. */
export function bunScripts(scripts = {}) {
  return Object.entries(scripts)
    .filter(([, command]) => /(^|[\s;&|(])(bun|bunx)(\s|$)/.test(command))
    .map(([name, command]) => `${name}: ${command}`)
}

/** What is wrong with one parsed tsconfig, named `file` in the messages. */
export function tsconfigProblems(file, config) {
  const options = config?.compilerOptions ?? {}
  const problems = []
  if ('customConditions' in options) {
    problems.push(`${file} sets customConditions; workspace packages resolve through dist/`)
  }
  for (const [alias, targets] of Object.entries(options.paths ?? {})) {
    for (const target of Array.isArray(targets) ? targets : []) {
      if (posix.normalize(target).startsWith('..')) {
        problems.push(`${file} maps ${alias} to ${target}, outside the package`)
      }
    }
  }
  if ((options.types ?? []).includes('bun')) problems.push(`${file} adds the bun types`)
  return problems
}

/**
 * Every problem with the package's shape.
 *
 * @param {object} input
 * @param {object} input.pkg the parsed package.json
 * @param {string[]} input.packedFiles the paths in the tarball, relative to the package
 * @param {Record<string, object>} input.tsconfigs the parsed tsconfig files, by file name
 */
export function shapeProblems({ pkg, packedFiles, tsconfigs }) {
  const problems = []
  for (const path of bunConditions(pkg.exports)) {
    problems.push(`${path}: remove the bun condition; exports is { types, default } under dist/`)
  }
  for (const f of shippedSource(packedFiles)) problems.push(`the tarball ships TypeScript source: ${f}`)
  for (const s of bunScripts(pkg.scripts)) problems.push(`script invokes bun, use Node: ${s}`)
  if (pkg.devDependencies?.['@types/bun'] !== undefined) {
    problems.push('@types/bun is a devDependency; tests run on Vitest under Node')
  }
  for (const [file, config] of Object.entries(tsconfigs)) {
    problems.push(...tsconfigProblems(file, config))
  }
  return problems
}
