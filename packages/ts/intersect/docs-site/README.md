# Intersect docs site

Astro Starlight site for `@osdlc/intersect`, with a guide, a playground and a
generated API reference. It is private and not published to npm. It is not
deployed yet.

It is not a pnpm workspace member (the workspace globs match `packages/ts/*`
only). Install its dependencies from this folder to run it:

```sh
cd packages/ts/intersect/docs-site
pnpm install --ignore-workspace
pnpm dev
```
