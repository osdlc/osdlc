---
name: pr-mermaid-comment
description: |-
  Post or update a GitHub pull request comment (or PR body) that carries
  Mermaid diagrams, and prove the diagrams render before it goes up. Drafts
  the Markdown in a scratch file, renders every fenced mermaid block through
  the same pipeline GitHub's viewer uses (GitHub's Markdown API, then Mermaid
  in headless Chromium at the default security level), screenshots the
  result, then posts with `gh`. Use when asked to add diagrams, an
  architecture summary, or a flow to a PR, or to check whether a Mermaid
  block on GitHub will render.
allowed-tools:
- Bash
- Read
- Write
trigger: /pr-mermaid-comment
sw-kind: skill
sw-plugin: dev-agent
---

# /[[pr-mermaid-comment]]

Usage:

- `/[[pr-mermaid-comment]] <PR number> <what to diagram>` — draft, verify, post.
- `/[[pr-mermaid-comment]] <PR number> --update <comment id>` — rework an
  existing comment in place.
- `/[[pr-mermaid-comment]] --check <file.md>` — only render a Markdown file's
  mermaid blocks and report.

GitHub renders ```` ```mermaid ```` fences in PR bodies, comments, issues
and committed `.md` files. It runs Mermaid on the client inside a sandboxed
iframe and passes the viewer's light or dark theme in.

## 1. Draft into a scratch file

Write the whole comment to one Markdown file in the scratchpad and keep it:
later edits to the comment come from re-posting this file, never from
editing on GitHub.

Rules that decide whether a diagram renders and reads:

- **Diagram types.** `flowchart` for structure and data flow,
  `sequenceDiagram` for a call path, `stateDiagram-v2` for a state machine.
  Prefer several small diagrams over one large one; a diagram wider than
  about 1000 px shrinks to unreadable text at comment width.
- **Line breaks in a label** are a literal `<br/>` inside a quoted label:
  `a["Vault<br/>notes/"]`. Markdown does not work in labels.
- **Quote every label** that holds a space, slash, dot, colon, parenthesis
  or angle bracket. Write `<` and `>` inside a label as `&lt;` and `&gt;`.
- **Links.** Flowchart nodes take `click id "https://…" "tooltip"`. Use full
  URLs; a relative link resolves against GitHub's viewer iframe, not the
  page. Link targets (`_blank`) and JavaScript callbacks are dropped at the
  default security level, so links open in the same tab. Sequence and state
  diagrams have no links.
- **Colour** comes from `classDef` with fixed hex values. It does not follow
  dark mode; keep fills light enough to read on both grounds or skip colour.
- **Tables and field lists stay Markdown.** Diagrams carry structure; prose
  and tables carry detail.
- Every PR mention in the prose is a link:
  `[#<number>](https://github.com/<owner>/<repo>/pull/<number>)`.

## 2. Verify with the render script

Run the script that sits next to this skill:

```text
bun <skill dir>/render_mermaid.mjs <file.md> --github <owner/repo>
```

`--github` sends the file through GitHub's Markdown API so the blocks
checked are the ones GitHub's own Markdown emits. The script renders each
block with the repo's Mermaid in headless Chromium at Mermaid's default
security level, prints one row per block (rendered or not, type, size,
link count), writes a full-page screenshot beside the input, and exits
non-zero if any block failed.

Non-zero exit → fix the block and re-run. Zero exit → open the screenshot
with Read and look at every diagram: cramped text, a subgraph laid out in
the wrong place, or overlapping edges mean the diagram needs splitting or
reshaping even though it parsed.

The screenshot shows "Loading" placeholders under each diagram. Those are
GitHub's own viewer placeholders from the API HTML and do not appear on
GitHub.

## 3. Post or update

New comment:

```text
gh pr comment <N> --body-file <file.md>
```

Update in place (the comment id is the number after `issuecomment-` in the
comment's URL):

```text
gh api -X PATCH repos/<owner>/<repo>/issues/comments/<id> -F body=@<file.md>
```

PR body instead of a comment: `gh pr edit <N> --body-file <file.md>`.

No attribution footer. Never a bare PR number.

## 4. Report

Give the comment URL and the local path of the screenshot. Name anything
the screenshot showed that parsing could not: a diagram that should be
split, a colour that will not survive dark mode. If the repository is
private, say that the screenshot is the local render, not GitHub's page.

## Notes

- **The script** is [[render_mermaid.mjs]] beside this note. It resolves
  `mermaid` from any package in the repo that depends on it and
  `playwright` from the repo root, so it runs from the repo root without
  setup. `--out <png>` names the screenshot; `--json` prints the result as
  data.
- **Security levels.** Mermaid's `strict` (the default) renders links but
  drops targets and callbacks; `sandbox` renders no links at all; `loose`
  keeps everything and is what no hosted viewer uses. The script uses
  `strict`. If the linked diagram is inert on GitHub, GitHub is in
  `sandbox` mode and links are unavailable there.
- **Without Playwright.** `mmdc -i <file.md> -o <out.md>` (mermaid-cli)
  rewrites each block to an image file and fails on a parse error. It does
  not go through GitHub's Markdown and produces no single screenshot.
- **Private repositories** cannot be screenshotted headlessly without a
  session; do not sign in from a script. The local render is the check.
