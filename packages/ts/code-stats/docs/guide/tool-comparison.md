---
title: Tool comparison
sidebar:
  order: 6
description: Where scc, tokei, cloc, GitClear and other tools stop, and when to use one of them instead.
---

Line counters, diff stats and code-analysis services already exist. This page shows where each
one stops, why code-stats was built anyway, and when you should use something else.

## The short answer

No existing tool does all of this at once:

- gives **every line a kind**: logic, boilerplate, comment, doc or blank;
- says **what happened to each line in a change**: added, removed, changed in place, or moved;
- keeps tests, docs, agent instructions, generated and vendored files **apart from source**;
- runs as a **TypeScript library** with a JSON schema, deterministically, on your own machine.

Several tools do part of it well, and code-stats reuses those parts instead of rebuilding them.

## Side by side

| Tool | What it does well | Where it stops for this job |
| --- | --- | --- |
| [scc](https://github.com/boyter/scc) | Fast code, comment and blank totals per file and language. Covers 366 languages, with a rough complexity estimate. | Totals only: it never says which line is which. It doesn't separate doc comments from comments, imports from logic, or count a change. |
| [tokei](https://github.com/XAMPPRocky/tokei) | Fast code, comment and blank totals, and it knows docstrings for a few languages. Usable as a Rust library. | Totals only, with no changes, no boilerplate, and fewer languages than scc. |
| [cloc](https://github.com/AlDanial/cloc) | Totals, plus `--diff` between two trees or git refs: code, comment and blank lines that were the same, modified, added or removed. | The closest match, but no doc vs comment and no boilerplate. A moved function counts as removed and added, and its numbers are per file and language, never per line. It's a Perl command-line tool, not a library. |
| GitHub's `+/−`, `git diff --stat` | Instant and everywhere. | Added and removed only. A rename or a moved function looks like new code. |
| [GitClear](https://www.gitclear.com/) | Classifies changed lines as moved, updated, deleted and so on, which is the idea behind code-stats' operations. | A hosted commercial service that reads your repositories; not a library you can run locally. |
| [GitHub linguist](https://github.com/github-linguist/linguist) | Which language a file is in, and whether it's generated, vendored or documentation. | Works per file, not per line, and counts nothing. |
| [lizard](https://github.com/terryyin/lizard), ESLint `complexity` | Cyclomatic complexity per function. | Function-level only, not tied to what kinds of lines a change touched. |
| [difftastic](https://difftastic.wilfred.me.uk/) | A diff that follows the syntax, so it's easier to read. | Shows a change, but produces no numbers. |

## What code-stats reuses

Building on these keeps code-stats small and its behaviour familiar:

| From | What |
| --- | --- |
| scc | Its language table: comment and string syntax for 366 languages, vendored and pinned. |
| cloc, tokei, scc | Their counting rules: whole files, per line, and a line holding both code and a comment counts as code. `count` matches them. |
| GitHub linguist | Its `.gitattributes` attributes, so files you already marked as generated for GitHub are treated as generated here. |
| git `--color-moved` | The 20-character minimum before a run of lines counts as moved, so a lone `}` never does. |
| GitClear | The idea of recording what happened to a line separately from what kind of line it is. |
| lizard | Complexity for languages other than TypeScript and JavaScript, when it's installed. |
| tree-sitter | The optional syntax-tree scanners, through web-tree-sitter and the official grammar packages. |

## When to use something else

- **You only need folder totals.** scc or tokei are native programs built for speed, and give
  code, comment and blank counts you can trust. `code-stats count` gives the same kind of totals
  split further, but does more work per line.
- **You want one diff summary for a release.** `cloc --git --diff v1 v2` gives modified, added and
  removed counts by language with nothing to install beyond cloc.
- **You want team-level engineering analytics.** Dashboards, trends and per-author views are
  what hosted services such as GitClear are for. code-stats measures one folder or change at a
  time, and leaves trends to whatever you feed its JSON into.

Reach for code-stats when the question is what *kind* of code a folder holds, or what a change
*actually did*. It also suits code that needs those answers as data: a PR bot, a review gate or a
report.

## Sources

The comparison was made for decision [D-K7CS][d-k7cs] against scc 4.1.0, tokei 15.0.0, cloc's
manual and linguist's override documentation. Check the tools' own pages for anything newer.

[d-k7cs]: https://github.com/osdlc/osdlc/tree/main/packages/ts/code-stats/docs/planning/decisions/D-K7CS-line-kinds-operations-and-file-groups.md
