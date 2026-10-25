/**
 * The page builder: assemble `web/` into one self-contained HTML response.
 *
 * The web view is authored as parts (a skeleton, a stylesheet, TypeScript
 * modules) and served as one document, with no request beyond the API. The
 * colours come from `@osdlc/ux`'s tokens, as `--wf-*` custom properties. The
 * installed package reads the script the build bundled into
 * `dist/web/main.js`. A checkout running the source bundles it per request,
 * so an edit is a browser reload, not a restart.
 *
 * The page holds no secret. It gets its token from `POST /session` (see
 * `serve/auth.ts`).
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { cssSheet } from '@osdlc/ux'

import { APP } from './app.ts'
import type { Theme } from './config-keys.ts'

const DIR = new URL('./web/', import.meta.url)
const path = (name: string): string => fileURLToPath(new URL(name, DIR))

/** The custom-property prefix of the page's tokens: `--wf-bg-base`. */
export const TOKEN_PREFIX = 'wf'

/** What the page is built with. */
export interface PageOptions {
  /** The `theme` setting. `system` leaves the choice to the browser. */
  theme?: Theme | undefined
  /** The server's platform, which picks the shell Copy quotes for. Default `process.platform`. */
  platform?: NodeJS.Platform | undefined
  /** The `nonce` on the script tag, which the page's content security policy names. */
  nonce?: string | undefined
}

/** Build the page. Each replacement is a function, so a `$` in a part is kept as it is. */
export async function buildPage(options: PageOptions = {}): Promise<string> {
  const [skeleton, styles, script] = await Promise.all([
    readFile(path('page.html'), 'utf8'),
    readFile(path('styles.css'), 'utf8'),
    buildScript(),
  ])
  const theme = options.theme ?? 'system'
  const platform = (options.platform ?? process.platform).replace(/[^a-z0-9]/g, '')
  const nonce = (options.nonce ?? '').replace(/[^A-Za-z0-9+/=]/g, '')
  return (
    skeleton
      // The template has no <html> tag, which keeps it plain for the
      // formatter. The theme goes on the element so it applies before the
      // first paint.
      .replace(
        '<!doctype html>\n',
        () =>
          '<!doctype html>\n<html lang="en"' +
          (theme === 'system' ? '' : ` data-theme="${theme}"`) +
          ` data-platform="${platform}"` +
          '>\n',
      )
      .replaceAll('@APP@', () => APP)
      .replace(
        '<!-- @STYLE@ -->',
        () => `<style>\n${cssSheet({ prefix: TOKEN_PREFIX })}${styles}</style>`,
      )
      .replace(
        '<!-- @SCRIPT@ -->',
        () =>
          `<script type="module"${nonce === '' ? '' : ` nonce="${nonce}"`}>\n` +
          `${script.replaceAll('</script>', '<\\/script>')}</script>`,
      )
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
