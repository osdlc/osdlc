# Review proposals as a PR (`--propose`)

The shared recipe a governance review (`/sdlc:principle-review`,
`/sdlc:standard-review`) follows when invoked with `--propose`: after the
report is rendered, land the edits the review recommends on a branch and open
one PR. The report stays the record of every finding; the PR carries the
subset that is a text edit.

## What a review proposes

Propose an edit when the fix is a change to text and changes no runtime
behavior:

- the reviewed entity's own file (a contradiction between two principles or
  two standards, a descriptive-yet-succinct fix, a stale `applies_to.paths`
  glob, a `related:` link that should exist);
- prose the entity contradicts: docs, conventions, `CLAUDE.md` files,
  SKILL.md instruction text, code comments.

Leave a finding out of the PR when the fix changes what code does — a
validator, an op, a gate, a script. List each such finding under
`notProposed` in the report payload and under **Not proposed** in the PR body,
with the task id from **Tracked by** when one exists.

## Steps

1. **Branch.** `<slug>` is the skill slug; `<date>` is the report's
   `meta.date`.

   ```text
   git worktree add .sdlc/worktrees/<slug>-<date> -b chore/<slug>-<date> main
   ```

   If the path or branch already exists, stop and tell the user; a prior
   proposal may be unfinished. Do every following step with absolute paths in
   that worktree.

2. **Edit.** Apply each proposed fix. Keep edits to the finding's own
   location; touch no line the finding does not cite.

3. **Verify.** Run the entity validator on every entity file the PR edits:

   ```text
   ${CLAUDE_PLUGIN_ROOT}/cli/sdlc entities validate <path>
   ```

   A non-zero exit means fix the file and re-run before committing. When a
   SKILL.md was edited, also run `${CLAUDE_PLUGIN_ROOT}/cli/sdlc gate skill-prose`.

4. **Commit.** One commit per reviewed entity whose findings the PR acts on,
   so a reviewer can drop one entity's edits without losing the rest. Subject
   shape: `docs(<plural>): <entity-id> <one-line change>`. Compose messages
   through `${CLAUDE_PLUGIN_ROOT}/cli/sdlc commit create` (see
   `${CLAUDE_PLUGIN_ROOT}/conventions/commit-messages.md`).

5. **Open the PR.**

   ```text
   git push -u origin chore/<slug>-<date>
   sdlc pr create --base main --head chore/<slug>-<date> \
     --title "docs(<plural>): <slug> proposals <date>" --body-file <tmpfile>
   ```

   PR body:

   ```text
   ## Summary

   Edits proposed by /sdlc:<slug> on <date>. <one line on the run: N entities
   reviewed, M findings, K proposed here.>

   ## Proposed

   <one bullet per commit: entity id, what changed, the finding it resolves>

   ## Not proposed

   <one bullet per finding that needs a code change: entity id, location,
   why it is a code change, Tracked by task id or "untracked">

   ## Report

   <the report's html path; it is gitignored, so paste the top issues here>
   ```

6. **Record.** Add `proposal: { branch, prUrl, files, notProposed }` to the
   report payload and re-render the report so the HTML links the PR. Return
   the PR URL with the report link.
