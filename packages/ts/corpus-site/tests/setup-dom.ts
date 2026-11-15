/**
 * Where the component tests get Vue and the components from.
 *
 * `@vue/runtime-dom` captures `document` when it loads, so Vue must load after the DOM exists.
 * Each component test file opts into jsdom with `// @vitest-environment jsdom`, which installs
 * `document` first. Loading Vue through a dynamic import here keeps one place it comes from.
 */

/** Vue, loaded against a DOM. */
export const vue = await import('vue')

/** The package's components, likewise. */
export const components = await import('../src/components/index.ts')
