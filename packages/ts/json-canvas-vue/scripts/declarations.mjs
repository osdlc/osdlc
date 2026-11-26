// Makes the declarations in dist/ resolve the way Node resolves ES modules.
//
// vue-tsc writes each relative specifier as the source has it, and three kinds
// do not resolve from dist/:
//
//   './markdown.ts'                    -> './markdown.js'
//   './components/Canvas/index.vue'    -> './components/Canvas/index.vue.js'
//   import './index.css'               -> removed
//
// TypeScript reads a `.js` specifier as the declaration beside it, so
// `index.vue.js` finds the `index.vue.d.ts` that vue-tsc wrote. The stylesheet
// is built to dist/style.css and has its own export, so the declarations must
// not import it.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))

const STYLESHEET_IMPORT = /^import '\.\/[^']+\.css';\n/gm
// A relative specifier that ends in `.ts` or `.vue`, after `from` or `import(`.
const SPECIFIER = /(\bfrom |\bimport\()(['"])(\.\.?\/[^'"]+)\.(ts|vue)\2/g

let rewritten = 0
for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.d.ts')) continue
  const file = join(entry.parentPath, entry.name)
  const before = readFileSync(file, 'utf8')
  const after = before
    .replace(STYLESHEET_IMPORT, '')
    .replace(
      SPECIFIER,
      (_match, lead, quote, path, extension) =>
        `${lead}${quote}${path}.${extension === 'ts' ? 'js' : 'vue.js'}${quote}`,
    )
  if (after !== before) {
    writeFileSync(file, after)
    rewritten += 1
  }
}

// The entry always has component and module specifiers to rewrite. None found
// means vue-tsc wrote nothing, or changed how it writes them.
if (rewritten === 0) {
  throw new Error(`no declaration in ${dist} had a specifier to rewrite`)
}
