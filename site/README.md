# osdlc site

The documentation site and blog, built with [Astro](https://astro.build) and
[Starlight](https://starlight.astro.build), published to GitHub Pages at
https://osdlc.github.io/osdlc/ by `.github/workflows/site.yml` on each push to
`main`.

## Run it

`site/` is not part of the packages workspace, so install it on its own:

```sh
cd site
pnpm install --ignore-workspace
pnpm run dev       # http://localhost:4321/osdlc/
pnpm run build     # into dist/
```

## Where the content comes from

- **Standards** are written in `../standards/` and copied in by
  `scripts/sync-standards.mjs` before every `dev` and `build`. Edit the files
  in `standards/`, never the copies under `src/content/docs/standards/`
  (they are not committed).
- **Blog posts** are markdown files in `src/content/docs/blog/`, each with a
  `title`, `date` and `authors` in its frontmatter. Authors are listed in
  `astro.config.mjs`.
- **Other pages** go in `src/content/docs/`.
