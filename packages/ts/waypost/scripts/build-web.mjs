// The web view in dist/: the page skeleton and stylesheet copied, and the
// script bundled once, so the installed package needs no bundler.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { bundleWeb } from './web-bundle.mjs'

const src = (p) => fileURLToPath(new URL(`../src/web/${p}`, import.meta.url))
const out = (p) => fileURLToPath(new URL(`../dist/web/${p}`, import.meta.url))

mkdirSync(out(''), { recursive: true })
copyFileSync(src('page.html'), out('page.html'))
copyFileSync(src('styles.css'), out('styles.css'))
writeFileSync(out('main.js'), await bundleWeb(src('main.ts')))
