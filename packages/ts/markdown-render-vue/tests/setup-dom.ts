/**
 * Where the Vue component tests get Vue from, and the package's Vue entry.
 *
 * `@vue/runtime-dom` captures `document` at module-init time, so Vue must be
 * evaluated after the DOM exists. each test file opts into jsdom with
 * `// @vitest-environment jsdom`, which installs `document` before it loads. Loading Vue through a
 * dynamic import here keeps the one place Vue is imported from.
 */

/** Vue, guaranteed to have initialized against a DOM. */
export const vue = await import('vue')

/** The package's Vue entry, likewise. */
export const markdownVue = await import('../src/index.ts')
