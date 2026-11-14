// Copies what tsc does not emit into dist/: the Astro components and the stylesheet.
import { cpSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../src/', import.meta.url))
const dist = fileURLToPath(new URL('../dist/', import.meta.url))

for (const file of readdirSync(src, { recursive: true }))
  if (file.endsWith('.astro') || file.endsWith('.css')) cpSync(`${src}${file}`, `${dist}${file}`)
