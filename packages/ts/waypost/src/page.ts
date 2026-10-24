/**
 * The page builder: assemble `web/` into one self-contained HTML response.
 *
 * The web view is authored as parts (a skeleton, a stylesheet, TypeScript
 * modules) and served as one document, with no request beyond the catalog
 * API. The installed package reads the script the build bundled into
 * `dist/web/main.js`. A checkout running the source bundles it per request,
 * so an edit is a browser reload, not a restart.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { APP } from './app.ts'

const DIR = new URL('./web/', import.meta.url)
const path = (name: string): string => fileURLToPath(new URL(name, DIR))

/**
 * @param sessionToken handed to the page so its fetches can authenticate. It
 * is JSON-encoded into an inline script rather than put in a URL or a cookie:
 * the page keeps it in module state only.
 */
export async function buildPage(sessionToken: string): Promise<string> {
  const [skeleton, styles, script] = await Promise.all([
    readFile(path('page.html'), 'utf8'),
    readFile(path('styles.css'), 'utf8'),
    buildScript(),
  ])

  // `<\/` keeps a token that somehow contained "</script>" from closing the
  // tag early; JSON.stringify handles the rest.
  const token = JSON.stringify(sessionToken).replaceAll('</', '<\\/')

  return skeleton
    .replace('<!-- @STYLE@ -->', `<style>\n${styles}</style>`)
    .replace('<!-- @TOKEN@ -->', `<script>window.__WAYPOST_TOKEN__ = ${token};</script>`)
    .replace(
      '<!-- @SCRIPT@ -->',
      `<script type="module">\n${script.replaceAll('</script>', '<\\/script>')}</script>`,
    )
}

async function buildScript(): Promise<string> {
  const built = path('main.js')
  if (existsSync(built)) return readFile(built, 'utf8')
  try {
    // A checkout: the bundler is a dev dependency, reached only from source.
    const bundler = '../scripts/web-bundle.mjs'
    const { bundleWeb } = (await import(bundler)) as {
      bundleWeb: (entry: string) => Promise<string>
    }
    return await bundleWeb(path('main.ts'))
  } catch (err) {
    // Fail loudly in the page rather than serve a stale or empty script.
    const detail = err instanceof Error ? err.message : String(err)
    return `document.body.innerHTML = "<pre></pre>";document.querySelector("pre").textContent = ${JSON.stringify(
      `${APP}: the page script failed to build\n\n${detail}`,
    )};`
  }
}
