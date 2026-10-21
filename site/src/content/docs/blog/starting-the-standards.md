---
title: Starting an open SDLC standard
date: 2026-10-20
authors: sksizer
excerpt: Why we are writing down the defaults most software projects already share, and what the first drafts cover.
---

Most software projects answer the same questions. How do I set it up? How do
I run the tests? Where are the docs? What has to pass before a change merges?
Each project answers them in its own words, in its own places, so every new
project has to be read before anyone, or any agent, can work on it.

Open SDLC writes down defaults for those answers. The first drafts cover:

- **[Verbs](/osdlc/standards/verbs/):** one set of task names (`setup`,
  `fmt`, `lint`, `test`, `build`, `deploy` and a few more) that mean the same
  thing in every project and every language.
- **[sdlc.yaml](/osdlc/standards/sdlc-yaml/):** a structured README. The
  facts a README states in prose, as data a tool can act on.
- **[Documentation locations](/osdlc/standards/doc-locations/):** one
  standard place for each kind of document.
- **[Review](/osdlc/standards/review/):** how deeply to review a change,
  scaled by its risk.

They are drafts. Each one ends with the decisions it made, so they can be
argued with. Comments are welcome on
[GitHub](https://github.com/osdlc/osdlc).
