/**
 * Plugin packages installed in a temporary `node_modules` for the loader's
 * tests. `@osdlc/host-cleaner` there links to this package. Every fixture
 * package's name must hold `host-cleaner-fixture`, so `vitest.config.ts`
 * inlines it and it imports the source, not `dist/`.
 */
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** The fixture plugin's source, `tests/fixtures/package-plugin/index.js`. */
export const FIXTURE_PLUGIN = readFileSync(join(here, 'package-plugin', 'index.js'), 'utf8')

/** The fixture package's name. */
export const FIXTURE = '@acme/host-cleaner-fixture'

/** A plugin package that imports `@osdlc/host-cleaner/plugin` and default-exports `expr`. */
export const exporting = (expr: string): string =>
  `import { PLUGIN_API, definePlugin, z } from '@osdlc/host-cleaner/plugin'\nexport default ${expr}\n`

/** A `node_modules` folder in `dir`, with `@osdlc/host-cleaner` linked to this package. */
export function nodeModules(dir: string): {
  root: string
  /** Installs `name` with `index.js` holding `source`; `manifest` adds to its `package.json`. */
  add: (name: string, source: string, manifest?: Record<string, unknown>) => string
} {
  const root = join(dir, 'node_modules')
  mkdirSync(join(root, '@osdlc'), { recursive: true })
  symlinkSync(join(here, '..', '..'), join(root, '@osdlc', 'host-cleaner'), 'dir')
  return {
    root,
    add(name, source, manifest = {}) {
      const pkg = join(root, ...name.split('/'))
      mkdirSync(pkg, { recursive: true })
      writeFileSync(
        join(pkg, 'package.json'),
        JSON.stringify({
          name,
          version: '1.0.0',
          type: 'module',
          exports: './index.js',
          ...manifest,
        }),
      )
      writeFileSync(join(pkg, 'index.js'), source)
      return pkg
    },
  }
}
