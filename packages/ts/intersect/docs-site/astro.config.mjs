// @ts-check
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'
import vue from '@astrojs/vue'

// Let interactive components import the library by name (`intersect`) instead
// of a deep relative path. Only the pure L1 surface is aliased — the playground
// runs in the browser, so it never touches `intersect/fs` (node + tinyglobby).
const intersectEntry = fileURLToPath(new URL('../index.ts', import.meta.url))

// https://astro.build/config
export default defineConfig({
  vite: {
    resolve: {
      alias: [{ find: /^intersect$/, replacement: intersectEntry }],
    },
  },
  integrations: [
    vue(),
    starlight({
      title: 'Intersect',
      description: 'Path-pattern overlap engine: do two globs share a common matching path?',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/osdlc/osdlc/tree/main/packages/ts/intersect',
        },
      ],
      plugins: [
        // Auto-generates the TypeScript API reference from the package source
        // and nests it under an "API Reference" sidebar group. Generated
        // markdown lands in src/content/docs/api/ (gitignored).
        starlightTypeDoc({
          entryPoints: ['../index.ts', '../segments/index.ts', '../fs.ts'],
          tsconfig: '../tsconfig.json',
          sidebar: { label: 'API Reference', collapsed: false },
          typeDoc: {
            // Generate the per-module overview pages. starlight-typedoc's
            // default (readme: "none") force-deletes them while the module
            // index still links to them, so /api/<mod>/readme/ all 404. A
            // short dedicated intro avoids duplicating the guide Overview.
            readme: './src/api-intro.md',
            // Drop @internal-tagged symbols from the generated reference.
            excludeInternal: true,
            // Primary surface first — reorders page bodies AND sidebar groups.
            groupOrder: ['Functions', 'Interfaces', 'Type Aliases', '*'],
            // Drop the re-export stubs (Options, SegmentPattern under index).
            excludeReferences: true,
            // Remove the pinned-SHA "Defined in: …" line from every symbol.
            disableSources: true,
            // Compact tables instead of stacked parameter sub-headings.
            parametersFormat: 'table',
            interfacePropertiesFormat: 'table',
            typeDeclarationFormat: 'table',
            // Guardrails (aligned with metaflow): warn on undocumented exports,
            // broken links, and referenced-but-not-exported symbols.
            validation: {
              notExported: true,
              invalidLink: true,
              notDocumented: true,
            },
          },
        }),
      ],
      sidebar: [
        {
          label: 'Guide',
          items: [
            { label: 'Overview', link: '/' },
            { label: 'Getting started', slug: 'guide/getting-started' },
            { label: 'Patterns', slug: 'guide/patterns' },
            { label: 'Overlap, matches, witness', slug: 'guide/overlap-matches-witness' },
            { label: 'The algorithm', slug: 'guide/algorithm' },
          ],
        },
        {
          label: 'Use cases',
          items: [
            { label: 'Conflict detection', slug: 'use-cases/conflict-detection' },
            { label: 'Context assembly', slug: 'use-cases/context-assembly' },
            { label: 'Guideline resolution', slug: 'use-cases/guideline-resolution' },
          ],
        },
        {
          label: 'Playground',
          items: [
            { label: 'Console — minimal', slug: 'playground/console-minimal' },
            { label: 'Console — control panel', slug: 'playground/console-control' },
            { label: 'Console — inline', slug: 'playground/console-inline' },
            { label: 'Match grid', slug: 'playground/grid' },
            { label: 'Scenarios', slug: 'playground/scenarios' },
          ],
        },
        // The generated API-reference group from starlight-typedoc.
        typeDocSidebarGroup,
      ],
    }),
  ],
})
