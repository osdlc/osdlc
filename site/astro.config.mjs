import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import starlightBlog from 'starlight-blog'

// Served from https://osdlc.github.io/osdlc/ until the site has its own domain.
export default defineConfig({
  site: 'https://osdlc.github.io',
  base: '/osdlc',
  integrations: [
    starlight({
      title: 'Open SDLC',
      description: 'Defaults and standards for the software development lifecycle.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/osdlc/osdlc' }],
      editLink: { baseUrl: 'https://github.com/osdlc/osdlc/edit/main/site/' },
      plugins: [
        starlightBlog({
          title: 'Blog',
          authors: {
            sksizer: { name: 'sksizer', url: 'https://github.com/sksizer' },
          },
        }),
      ],
      sidebar: [
        { label: 'Standards', items: [{ autogenerate: { directory: 'standards' } }] },
        {
          label: 'Libraries',
          items: [
            { label: 'Overview', link: '/libraries/' },
            { label: 'TypeScript', items: [{ autogenerate: { directory: 'libraries/ts' } }] },
            { label: 'Rust', items: [{ autogenerate: { directory: 'libraries/rust' } }] },
          ],
        },
      ],
    }),
  ],
})
