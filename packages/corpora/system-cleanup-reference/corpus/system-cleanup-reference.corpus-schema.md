---
corpus-schema: 0
level: 2
extends:
  system-cleanup: "@osdlc/corpus-profile-system-cleanup"
uses: [system-cleanup/*]
---

# System cleanup reference

A cited record of where developer tools and apps keep data that can be reclaimed from disk, and
how to reclaim it without breaking anything. Its types come from the system cleanup profile, which builds
on the claims profile: every value is a statement backed by study results that quote a page.

- [Stores](stores/): one note per tool or app that fills a disk, such as [pnpm](stores/pnpm.md)
  or [Ollama](stores/Ollama.md).
- [Subjects](subjects/): one note per question asked of every store: where its data lives, what
  moves it, how it cleans itself, how to list it, how to tell it is in use, and what it leaves
  inside a project.
- [Statements](statements/): one note per answer for a store and a subject, with its evidence
  lines and its verdict.
- [Study results](study-results/): one note per observation: what a page said, and when we
  looked.
- [Documents](documents/): one note per page quoted, in a folder per publisher.
