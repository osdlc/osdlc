/**
 * Capture stories of a built Storybook to PNG files, with no comparison. This
 * is the host-side tool for documentation shots (an exploration direction's
 * README images); the baseline check is the `story-shots` command.
 *
 * By default shots are taken in the light theme at 1440x900. A story id
 * containing `-dark` is shot dark; an id ending in `-narrow` is shot at
 * 1024x720; a story with `parameters.screenshot.narrow` gets a second
 * `--narrow` shot. Each file is named after the story id with the prefix
 * removed. {@link CaptureOptions.themes}, {@link CaptureOptions.viewport} and
 * {@link CaptureOptions.outLayout} replace those defaults.
 *
 * Console errors are printed. A page error or a story that ends in an error
 * fails the run once every story is shot; the failed story's shot is still
 * written. A story with `parameters.screenshot.skip` is left out.
 *
 * A package calls {@link captureCli} from a small script that supplies its
 * defaults.
 */
import { chromium } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { parseArgs } from 'node:util'
import { serveStatic } from './serve-static.ts'
import {
  isNarrowOnly,
  NARROW_VIEWPORT,
  openStory,
  preparePage,
  selectStories,
  type Theme,
  VIEWPORT,
} from './story.ts'

export interface CaptureOptions {
  /** The built Storybook directory. */
  storybookDir: string
  /** Story id prefix to capture; stripped from file names. */
  prefix: string
  /** Output folder. */
  outDir: string
  /** Port for the static server. */
  port: number
  /** Only ids containing this. */
  contains?: string | undefined
  /**
   * Shoot each story in each of these themes. Default: one shot, dark for an
   * id containing `-dark`, light otherwise.
   */
  themes?: readonly Theme[] | undefined
  /** Viewport for every shot, also for `-narrow` ids and the `--narrow` extra shot (which is then left out). Default 1440x900. */
  viewport?: { width: number; height: number } | undefined
  /**
   * `flat` (default) writes `<outDir>/<name>.png`, or `<outDir>/<name>--<theme>.png`
   * when {@link CaptureOptions.themes} has more than one theme; `by-theme` writes
   * `<outDir>/<name>/<theme>.png`.
   */
  outLayout?: 'flat' | 'by-theme' | undefined
}

/** Shoot every matching story. Resolves to false if any story failed. */
export async function captureStories(opts: CaptureOptions): Promise<boolean> {
  const index = JSON.parse(await readFile(join(opts.storybookDir, 'index.json'), 'utf8'))
  const ids = selectStories(index, { include: [opts.prefix], contains: opts.contains })
  const close = await serveStatic(opts.storybookDir, opts.port)
  let browser: Awaited<ReturnType<typeof chromium.launch>>
  try {
    browser = await chromium.launch()
  } catch (err) {
    close()
    throw err
  }
  const baseURL = `http://127.0.0.1:${opts.port}`
  let ok = true
  try {
    await mkdir(opts.outDir, { recursive: true })
    for (const id of ids) {
      const page = await browser.newPage({
        viewport: opts.viewport ?? (isNarrowOnly(id) ? NARROW_VIEWPORT : VIEWPORT),
      })
      page.on('console', (msg) => {
        if (msg.type() === 'error') console.warn(`  [${id}] console: ${msg.text()}`)
      })
      page.on('pageerror', (err) => {
        ok = false
        console.error(`  [${id}] page error: ${err.message}`)
      })
      try {
        await preparePage(page)
        const themes = opts.themes ?? [id.includes('-dark') ? 'dark' : 'light']
        const name = id.slice(opts.prefix.length)
        // Shoot a story whose `play` failed anyway, so a doc set keeps its
        // image, but report it and fail the run.
        const onStoryError = (message: string) => {
          ok = false
          console.error(`  [${id}] ${message}`)
        }
        // Write one shot (creating the by-theme folder first) and log it.
        const shoot = async (theme: Theme, suffix: string) => {
          const byTheme = opts.outLayout === 'by-theme'
          if (byTheme) await mkdir(join(opts.outDir, name), { recursive: true })
          // In the flat layout, several themes each need their own file.
          const themed = themes.length > 1 ? `--${theme}` : ''
          const file = byTheme ? `${name}/${theme}${suffix}.png` : `${name}${themed}${suffix}.png`
          await page.screenshot({ path: join(opts.outDir, file) })
          console.log(`captured ${file}`)
        }
        for (const theme of themes) {
          const params = await openStory(page, baseURL, id, theme, { onStoryError })
          if (params.skip) {
            console.log(`skipped ${name}: ${params.skip}`)
            break
          }
          await shoot(theme, '')
          if (params.narrow && !isNarrowOnly(id) && !opts.viewport) {
            await page.setViewportSize(NARROW_VIEWPORT)
            await openStory(page, baseURL, id, theme, { onStoryError })
            await shoot(theme, '--narrow')
            await page.setViewportSize(VIEWPORT)
          }
        }
      } catch (err) {
        ok = false
        console.error(`  [${id}] ${(err as Error).message}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
    close()
  }
  return ok
}

/** A package's defaults for {@link captureCli}; each flag of the same name overrides one. */
export interface CaptureCliDefaults {
  /** The package directory: it holds `storybook-static/`, and `out` is relative to it. */
  packageDir: string
  /** Story id prefix to capture (`--prefix`). */
  prefix: string
  /** Output folder (`--out`), relative to `packageDir` unless absolute. */
  out: string
  /** Port for the static server (`--port`). */
  port: number
}

/**
 * Parse `[contains] --prefix <p> --out <dir> --port <n>` against a package's
 * defaults, capture, and exit non-zero on failure. `--out` is relative to
 * `packageDir`.
 */
export async function captureCli(defaults: CaptureCliDefaults): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { prefix: { type: 'string' }, out: { type: 'string' }, port: { type: 'string' } },
  })
  const out = values.out ?? defaults.out
  const ok = await captureStories({
    storybookDir: join(defaults.packageDir, 'storybook-static'),
    prefix: values.prefix ?? defaults.prefix,
    outDir: isAbsolute(out) ? out : join(defaults.packageDir, out),
    port: Number(values.port ?? defaults.port),
    contains: positionals[0],
  })
  if (!ok) process.exit(1)
}
