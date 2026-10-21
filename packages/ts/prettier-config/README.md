# @osdlc/prettier-config

A shared [Prettier](https://prettier.io) config: no semicolons, single quotes,
trailing commas everywhere, 100 columns, two-space indent. Markdown is left
alone (see below).

## Install

```sh
npm install --save-dev @osdlc/prettier-config prettier
```

`pnpm add -D @osdlc/prettier-config prettier` and `yarn add -D @osdlc/prettier-config prettier` work too.

## Use

Name the package in your Prettier config. In `package.json`:

```json
{ "prettier": "@osdlc/prettier-config" }
```

Or in a `.prettierrc`:

```text
"@osdlc/prettier-config"
```

The quotes are required in `.prettierrc`: it is parsed as YAML, and a bare `@`
leading a plain scalar is reserved.

## Markdown is not formatted

The config has exactly one override, and it exists to hand `.md` away rather
than to style it:

```json
{ "files": "*.md", "options": { "requirePragma": true } }
```

Prettier column-pads markdown tables on every pass, which fights a dedicated
markdown formatter. Prettier has no way to exclude a language from config:
`overrides` sets options, there is no `ignore` key, and `excludeFiles` only
drops a file from that override's options. With `requirePragma` set, Prettier
parses markdown and then declines to reformat any file that lacks a `@format`
or `@prettier` pragma. A file that adds the pragma opts itself back in.

`.mdx` is still Prettier's: `files: "*.md"` does not match it.

## Ignore files

`.prettierignore` is read from the directory Prettier runs in and does not
cascade, so each project keeps its own. This package does not ship one.

## Source and releases

Developed and released in
[osdlc/osdlc](https://github.com/osdlc/osdlc/tree/main/packages/ts/prettier-config),
under `packages/ts/prettier-config`. Report issues at
[osdlc/osdlc/issues](https://github.com/osdlc/osdlc/issues).

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
