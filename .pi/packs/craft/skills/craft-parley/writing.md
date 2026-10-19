# Writing a parley document

How to write blocks and questions, and how to revise the document between rounds.
`node parley.mjs schema <type> --md` prints the fields; this file has the rules for using them.

- [Blocks](#blocks): linking the files you name, and what to do when no block type fits.
- [Questions](#questions): answer styles, placement, `recommended`, and closing a question.
- [Revising](#revising): what to change on each pass, and what never to change.
- [Reopened questions](#reopened-questions): replying to a `[reopen]` and keeping or closing it.

## Blocks

- **Link every file you name.** Give the item or block that names it a `source` with a path from
  the repository root. Set the document `repo` to the GitHub remote and the commit you read. The
  page then shows a link to the file viewer and a GitHub link.
- If no block type fits, use the nearest one. Say in the first `prose` block which type would have
  fit, and its fields.

## Questions

A question has an `id`, a `prompt`, an answer style and, unless it is free text, `options`.

- **Answer style** is the field `kind`: `single` for one option, `multi` for several options,
  `text` for free text with no options. Use `multi` only when the options are not alternatives.
- **Where it shows.** In a `question` block, at that place. In the document `questions`, under the
  `about` item, else at the end. `check` warns if `about` names an item with no section of its own;
  `node parley.mjs schema questions --md` lists them.
- **`group`** is a heading the contents list the question under.
- **`recommended`** is the id of the option you suggest. Say why in that option's `detail`. Leave
  it off when you have no view. Never write "recommended" in a title; `check` warns.
- **One decision per question.** Put the facts in prose; put each option's cost in its `detail`.
- **Closing.** When a question is settled, set `status: closed` and a one-line `resolution`.

`loop.md` says when answers, asks back and notes reach you.

## Revising

The document is the running record of the review. On each pass:

- Raise `revision` by one.
- Never change or reuse an id. Answers and comments key on ids.
- Add new questions with new ids. Close settled ones.
- Reword a question the reviewer found unclear. An answer to the old wording becomes out of date.
- Run `check`, commit the document with its answers file, and tell the reviewer what changed.

## Reopened questions

A `[reopen] <question id>` means the reviewer reopened a question. Reply first, with
`--reply <question id>`, then raise `revision`. To leave it open, drop `status: closed` and
`resolution`; to close it again, keep them. `answers.md` says when a reopen is settled.
