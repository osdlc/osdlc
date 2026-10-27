# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce. A minimal
contract and document help.

## Supported versions

Only the latest release gets security fixes. Upgrade to it.

## What to expect

This is a small project. We aim to reply within a week. We will tell you
whether we accept the report and keep you updated until a fix is released.
We will credit you in the release notes if you want that.

## What to trust

- **Configs that are code.** The command loads a `.js` or `.mjs` config with
  `import()`. That runs the file's code with your permissions. Run the command
  only on configs you trust. A `.yaml` config or contract runs no code.
- **Regular expressions from contracts.** A `regex` in a text check, and a
  `pattern` in a YAML frontmatter schema, run on every document checked. A
  badly written expression can take a very long time on some input. Check
  contracts you did not write before you run them on large or untrusted
  documents.
- **Files the command writes.** `markdown-contract init` writes a config and
  contract files under the folder it reads, under `--out`, or, with several
  folders and no `--out`, under the current directory. It refuses to
  overwrite an existing file unless you pass `--force`. `migrate --write`
  rewrites the contract files you name, in place.
- **Symbolic links.** The folder walk in `runCorpus`, `validate` and
  `inferConfig` does not follow symbolic links. A linked file or folder is
  skipped.
- **Documents are data.** Checking a document never runs code from it. The
  parser reads frontmatter as YAML data and the body as markdown.
