# The page and the answers file

This file says what the reviewer sees on the page, what reaches the agent and when, and what the
answers file holds. The skill text, `/parley` and its `loop.md`, says what to do. The words follow
`glossary.md`.

## The page

- The reading column shows the blocks in order, with every item numbered. The details pane holds
  the details for each item, with its comment box. It shows only what the reading column does not: a
  step's explanation, a table's columns, an operation's lock and rollback. An item the reading
  column shows in full, such as a paragraph or a task, gets a compact row for comments.
- Contents lists the blocks, items and questions. `group` on a question is a heading in it.
- Click or hover any pane and the others highlight. `j` and `k` step through items. `Tab` also
  reaches every item, and `Enter` opens it. `n` and `p` step through questions; with shift, open
  ones only. `u` steps to new replies. `c` comments on the selected words. `Esc` clears. The URL
  hash links to an item.
- The reviewer can select words in the reading column or the details pane. A **Comment** pill
  appears. The comment lands on the item under the selection and quotes the words. The quoted
  words stay highlighted on later renders until they change.
- **About the whole document**, at the end of the details pane, holds comments that are not about
  one item. Their item id is the document id.
- A progress meter under the title has one segment per question: red open, amber asked back or
  out of date, green with a tick answered. Its tally ("1 of 5 answered") is the page's only
  answered count. A closed question counts as answered.
- The line over the title gives the author, the revision and when the document was last written.
- The header shows the threads waiting for a reply, **Finish review** and a menu. The menu holds a
  comment on the whole document, the other documents, the appearance, where source links open,
  and Export. The header says "Agent listening" while `answers --wait` or `--notify` runs on the
  document, and "No agent listening" otherwise. A thread waiting on the agent says "Waiting for a
  reply".
- A first visit shows one line under the header on how to review. It stays dismissed in that
  browser.
- Every figure and diagram has an expand button that opens it full size.
- A story frame loads one at a time. When the document's Storybook does not answer, a banner
  says so and shows `storybookStart`.
- The server's front page lists every document in the folder, newest first, with its block
  types, verdict and counts.
- The page saves on every change. With the server running, it saves to the answers file. While
  the server cannot take a save, the page keeps it in the browser and sends it later. When the
  page can't reach the server, a line under the header says so, and Send and **Finish review**
  queue until it is back. When the answers file is broken, the pill gives the server's reason and
  the file to fix. A static page keeps answers in the browser and has no Send: **Export** is the
  main action and sends everything unsent in the file, and **Finish review** downloads it to give
  to the agent.
- The server watches the folder. Revise the document and the open page updates in place. It keeps
  the reviewer's scroll, selection and unsent text, and a line names the questions that changed or
  are new. A document the server cannot read keeps the page, with a line that says so.

## Files on the page

- Every `source` with a path from the repository root shows the path, a **View** link and, when
  the document sets `repo`, a **GitHub** link pinned to `repo.commit`.
- **View** opens the file in the server's file viewer: markdown rendered, code at its lines,
  images and PDFs as themselves. The reviewer can comment there too. Those comments are on item
  `f:<path>`, and a comment on part of an image quotes `region xywh=…`.
- A `[[name]]` wikilink in prose opens `name.md` in the viewer. It has no GitHub link.
- The reader can set their checkout folder on the page. The path then also opens in the editor
  they pick in the page's editor menu (kept per browser).
- An absolute path shows only the file name. It links as `file://` on a page opened as a file,
  unless the reader chose an editor, which then wins. On a served page it opens in the reader's
  editor (browsers block `file://` there). Its full path is
  still in the page's HTML, so do not use one in a page you commit. A `~` path, a network share or
  a path ending in `/` fails `check`.
- The server serves files only from a git checkout, and only files git lists.

## What the reviewer can send

| The reviewer | Arrives as | When |
|---|---|---|
| Adds a comment and sends it | `[comment] <comment id> on <item id>` | at once |
| Saves a comment as a draft | nothing | when they send it, or finish |
| Chooses "None of these, or I have a question" | `[ask] <question id> on <question id>` | at once |
| Sends a note beside a chosen option | `[note] <question id> on <question id>` | at once |
| Replies in a thread | the thread's line, then a line `reply to “…”` | at once |
| Presses **Reopen question** | `[reopen] <question id> on <question id>` | at once |
| Chooses options, or answers a free-text question | nothing | with the verdict |
| Presses **Finish review** | `[verdict] changes-requested` or `[verdict] approved` | at once |

- A thread is a sent comment, ask back, note or reopen, with every reply under it. "Reply to each
  send" in `loop.md` says which id `--reply` takes.
- A thread is waiting for a reply while its last message is the reviewer's.
- Words typed with no option chosen count as an ask back. A note beside a chosen option stays a
  note.
- Editing a sent ask or note makes a new message to send. Once the agent has replied, it goes
  into the thread as a reply.
- **Finish review** opens a sheet. It lists what is still open and every out-of-date answer. It
  takes an optional finish summary. Then it gives the verdict: **Request changes** or
  **Approve**. Approve is disabled while a question is open or an answer is out of date.
  Finishing sends every draft and every answer.
- After the verdict, **Change verdict** takes it back within the same round.

## Questions on the page

- Every question offers "None of these, or I have a question". That stores an ask back. The
  question stays open until the agent replies and the reviewer chooses.
- A question with options is answered only by a chosen option. A note with no option chosen
  shows in the digest as `open, note with no option chosen`.
- A free-text question's answer opens no thread. It goes with the verdict and shows in the digest
  as `answered: "<text>"`.
- A question edited since the reviewer last looked shows "Changed since you last looked". An
  answer given to the old wording is out of date. It shows amber and does not count as answered.
  The reviewer answers again or presses **Keep answer**. Earlier answers show under the question.
- A closed question collapses and shows its `resolution` and the chosen option.
- **Reopen question** shows on a closed question, and on an answer that was sent or given before
  a verdict. It clears the answer and keeps the old one in its history. The question then stays
  open, even if it has `status: closed`, until the agent settles it.
- A reopen is settled by an agent reply after it, and then one of these: the next revision after
  that reply, or, on a question that was not closed, a new answer from the reviewer. A revision
  with no reply after the reopen does not settle it.

## The answers file

`<id>.answers.json` sits beside the document. The server writes it; never edit it by hand. Read
it with `node parley.mjs answers <id>`, which prints the digest. `--output json` prints the
digest as JSON.

- `verdict`: `reviewing` while the round is open, then `changes-requested` or `approved`.
  `finished` is when it was given. `summary` is the finish summary.
- `comments`: each comment, with the item it is on, its text and, for selected words, a
  `selector` holding the exact words.
- `choices`: the answer to each question, keyed by question id. It holds the chosen options, a
  note or an ask back, the thread, and earlier answers.
- `replies`: the thread under a comment or a question. The agent's replies carry `action`
  (`answered`, `revised` or `declined`), the document `revision` and who sent them.
- `seen`: what each question looked like when the reviewer last looked at it.
- `seenReplies`: the agent replies the reviewer has seen, by message id, each with when the server
  took the mark. A reply missing from it is new to the reviewer, unless the reviewer wrote later in
  the same thread.
- `agentReadAt` is set by `--mark-read`. `roundStartedAt` is set by `--new-round`.
