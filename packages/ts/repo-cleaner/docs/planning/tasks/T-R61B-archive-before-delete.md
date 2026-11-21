---
id: T-R61B
type: task
state: done
created: 2026-10-07
---

# T-R61B: Archive unlanded work to the remote before clean deletes it

## Goal

`clean --archive` pushes unlanded commits and uncommitted files to an archive branch, checks it, then deletes. Today the only choices are to keep the row or to allow the work to be lost.

## Spec

[#661](https://github.com/osdlc/osdlc/issues/661) holds the full spec: today's code with links, the proposal and the acceptance criteria. Discuss and refine it there. When the issue closes, set this task's `state` to `done` and add an Outcome section.

## Outcome

Shipped in [#941](https://github.com/osdlc/osdlc/pull/941). `clean --archive`
pushes each repository's unlanded commits and a snapshot of uncommitted files
to `refs/heads/archive/<repo>-local-<YYYY-MM-DD>` on the default remote,
checks it with `ls-remote`, and only then deletes. `--allow discard-archived`
stands for `abandon-unmerged` and `discard-changes` on what the archive holds;
files the snapshot leaves out (secret-shaped, `--archive-exclude`, over
10 MiB) keep `discard-changes`. The code is `src/archive.ts`.
