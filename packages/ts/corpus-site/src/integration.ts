/** The Astro integration: load the corpus once, inject the routes, and serve the components. */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { AstroIntegration } from 'astro'
import type { CorpusSiteConfig } from './config.ts'
import { getSite, setSiteContext } from './context.ts'
import { loadSite } from './site.ts'

/** The Astro components a consumer can replace, by name. */
export const COMPONENT_NAMES = [
  'Layout',
  'Header',
  'Sidebar',
  'Footer',
  'Home',
  'TypeIndex',
  'RecordPage',
  'SearchPage',
  'FieldValue',
] as const

/** The name of a replaceable Astro component. */
export type ComponentName = (typeof COMPONENT_NAMES)[number]

/** Options for `corpusSite`. */
export interface CorpusSiteOptions {
  /** The corpus folder: the one that holds the root file. Relative to the Astro project root. */
  root: string
  /**
   * The path the corpus pages sit under, inside the Astro site's own `base`. Default `/`, so
   * the home page is the site's home page.
   */
  base?: string
  /** The site's title. The same as `config.title`, which it overrides. */
  title?: string
  /** The site's description. The same as `config.description`, which it overrides. */
  description?: string
  /**
   * The publisher's config, or the path of a file that holds it: `.json`, or a module whose
   * default export is the config. Default: `corpus-site.config.json`, `.mjs`, `.js` or `.ts`
   * in the Astro project root, when one is there.
   */
  config?: CorpusSiteConfig | string
  /**
   * Replace Astro components of the site, by name: the path of an `.astro` file for each,
   * relative to the Astro project root.
   */
  components?: Partial<Record<ComponentName, string>>
  /** Stylesheets loaded after the site's own, such as one that sets the `--cs-*` properties. */
  customCss?: string[]
  /** Build the search page and its index. Default true. */
  search?: boolean
  /** Fail the build when the validator reports an error in the corpus. Default false. */
  strict?: boolean
}

const CONFIG_FILES = ['json', 'mjs', 'js', 'ts'].map((ext) => `corpus-site.config.${ext}`)

/** The config of `options`: the inline one, or the file's, or the one found in `projectRoot`. */
export async function readConfig(
  options: Pick<CorpusSiteOptions, 'config'>,
  projectRoot: string,
): Promise<{ config: CorpusSiteConfig; file: string | null }> {
  if (typeof options.config === 'object') return { config: options.config, file: null }
  const file =
    options.config === undefined
      ? CONFIG_FILES.map((name) => join(projectRoot, name)).find((path) => existsSync(path))
      : resolve(projectRoot, options.config)
  if (file === undefined) return { config: {}, file: null }
  if (!existsSync(file)) throw new Error(`@osdlc/corpus-site: config file not found: ${file}`)
  if (file.endsWith('.json'))
    return { config: JSON.parse(readFileSync(file, 'utf8')) as CorpusSiteConfig, file }
  // The time makes a dev server read an edited file again.
  const loaded = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)) as {
    default?: CorpusSiteConfig
  }
  if (typeof loaded.default !== 'object' || loaded.default === null)
    throw new Error(`@osdlc/corpus-site: ${file} has no default export that is a config`)
  return { config: loaded.default, file }
}

const COMPONENTS_ID = 'virtual:corpus-site/components'
const CSS_ID = 'virtual:corpus-site/user-css'

const TYPES = `declare module 'virtual:corpus-site/components' {
  type AstroComponent = (props: Record<string, any>) => any
${COMPONENT_NAMES.map((name) => `  export const ${name}: AstroComponent`).join('\n')}
}
`

/**
 * Publish a corpus-schema corpus as pages of an Astro site. Add it to `integrations` beside
 * `@astrojs/vue`:
 *
 * ```js
 * export default defineConfig({
 *   integrations: [vue(), corpusSite({ root: './corpus' })],
 * })
 * ```
 *
 * It loads the corpus once, checks the config against it, and injects a home page, an index
 * page per type, a page per record, a search page and the data files under `data/`.
 */
export function corpusSite(options: CorpusSiteOptions): AstroIntegration {
  const astroDir = fileURLToPath(new URL('./astro/', import.meta.url))
  const page = (name: string): string => join(astroDir, 'pages', name)

  return {
    name: '@osdlc/corpus-site',
    hooks: {
      'astro:config:setup': async ({ config, injectRoute, updateConfig, addWatchFile, logger }) => {
        const projectRoot = fileURLToPath(config.root)
        const root = isAbsolute(options.root) ? options.root : resolve(projectRoot, options.root)
        const prefix = (options.base ?? '/').replace(/^\/+|\/+$/g, '')
        const base = `/${[config.base, prefix].join('/')}/`.replace(/\/+/g, '/')

        const read = await readConfig(options, projectRoot)
        if (read.file !== null) addWatchFile(read.file)
        const siteConfig: CorpusSiteConfig = { ...read.config }
        if (options.title !== undefined) siteConfig.title = options.title
        if (options.description !== undefined) siteConfig.description = options.description

        const load = (): void => {
          const started = performance.now()
          const site = loadSite(root, { base, config: siteConfig, search: options.search ?? true })
          const { errors, warnings } = site.model
          logger.info(
            `${site.model.name}: ${site.pages().length} records in ${site.types.length} types, loaded in ${Math.round(performance.now() - started)} ms`,
          )
          if (errors.length > 0 || warnings.length > 0)
            logger.warn(
              `the validator reports ${errors.length} error(s) and ${warnings.length} warning(s)`,
            )
          if (options.strict === true && errors.length > 0)
            throw new Error(
              `@osdlc/corpus-site: the corpus has errors, and strict is on:\n${errors.slice(0, 20).join('\n')}`,
            )
          setSiteContext({ site })
        }
        load()

        const components = Object.fromEntries(
          COMPONENT_NAMES.map((name) => {
            const override = options.components?.[name]
            return [
              name,
              override === undefined
                ? join(astroDir, `${name}.astro`)
                : resolve(projectRoot, override),
            ]
          }),
        )
        for (const name of Object.keys(options.components ?? {}))
          if (!(COMPONENT_NAMES as readonly string[]).includes(name))
            throw new Error(
              `@osdlc/corpus-site: components.${name} is not a component. Components: ${COMPONENT_NAMES.join(', ')}`,
            )
        const customCss = (options.customCss ?? []).map((path) =>
          path.startsWith('.') ? resolve(projectRoot, path) : path,
        )

        const at = (path: string): string => `/${[prefix, path].filter(Boolean).join('/')}`
        injectRoute({ pattern: at(''), entrypoint: page('home.astro'), prerender: true })
        injectRoute({ pattern: at('[type]'), entrypoint: page('type.astro'), prerender: true })
        injectRoute({
          pattern: at('[type]/[record]'),
          entrypoint: page('record.astro'),
          prerender: true,
        })
        if (Object.keys(getSite().model.corpora).length > 0)
          injectRoute({
            pattern: at('ref/[...ref]'),
            entrypoint: page('ref.astro'),
            prerender: true,
          })
        injectRoute({ pattern: at('data/[...file]'), entrypoint: page('data.js'), prerender: true })
        if (options.search ?? true)
          injectRoute({ pattern: at('search'), entrypoint: page('search.astro'), prerender: true })

        updateConfig({
          vite: {
            plugins: [
              {
                name: '@osdlc/corpus-site',
                resolveId(id: string) {
                  return id === COMPONENTS_ID || id === CSS_ID ? `\0${id}` : undefined
                },
                load(id: string) {
                  if (id === `\0${COMPONENTS_ID}`)
                    return Object.entries(components)
                      .map(
                        ([name, path]) =>
                          `export { default as ${name} } from ${JSON.stringify(path)}`,
                      )
                      .join('\n')
                  if (id === `\0${CSS_ID}`)
                    return customCss.map((path) => `import ${JSON.stringify(path)}`).join('\n')
                  return undefined
                },
                // Dev: load the corpus again when one of its files changes, then reload the page.
                configureServer(server: {
                  watcher: {
                    add: (path: string) => void
                    on: (event: string, fn: (path: string) => void) => void
                  }
                  hot: { send: (payload: { type: 'full-reload' }) => void }
                }) {
                  server.watcher.add(root)
                  let timer: ReturnType<typeof setTimeout> | undefined
                  const changed = (path: string): void => {
                    if (!resolve(path).startsWith(root)) return
                    clearTimeout(timer)
                    timer = setTimeout(() => {
                      try {
                        load()
                        server.hot.send({ type: 'full-reload' })
                      } catch (error) {
                        logger.error(error instanceof Error ? error.message : String(error))
                      }
                    }, 150)
                  }
                  for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, changed)
                },
              },
            ],
          },
        })
      },
      'astro:config:done': ({ injectTypes }) => {
        injectTypes({ filename: 'corpus-site.d.ts', content: TYPES })
      },
    },
  }
}
