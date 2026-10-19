# Parley glossary

- [People and programs](#people-and-programs): who and what takes part: agent, reviewer, server,
  listener.
- [Files and versions](#files-and-versions): the document, the page, the static page, the markdown
  export, the answers file and revisions.
- [What a document holds](#what-a-document-holds): blocks, items, the reading column, the contents
  and sections.
- [Questions](#questions): questions, answer styles, options, answers, notes, asks back and their
  states.
- [Comments and threads](#comments-and-threads): comments, drafts, sends, threads and replies.
- [Rounds and the verdict](#rounds-and-the-verdict): rounds, finishing a review, the verdict and new
  rounds.
- [Rename table](#rename-table): each old name in the page, CLI, fields, prose and code, and its
  new name.
- [Field conflicts](#field-conflicts): field names that clash with the glossary today.
- [Retired words](#retired-words): words that must be gone from page, CLI, skill and README text.

This file gives each parley idea one name. The page, the CLI, the skill text, the README and the
JSON are to use these names.

**Not all of these names are in the code yet.** The rename tasks apply them. Until those land,
the code, `check` and the examples use the old names in the [rename table](#rename-table): for
example question `kind`. Write documents with the names `check` accepts today.

Each entry gives:

- **Means**: one sentence.
- **Shows as**: where the word appears. Page is a label on the review page. CLI is a flag or a
  line the CLI prints. Document is a field in the document JSON. Answers file is a field in
  `<id>.answers.json`. Prose is the skill text, the README and code comments.
- **Replaces**: old words that now mean this. The rename tasks remove them.
- **Not**: words it is easy to mix up with it.

Every entry describes what parley does today, under its new name. The glossary changes names
only, never behaviour.

Renames have no aliases. Parley is alpha, so old answers files and old documents are not
supported: after a rename, the old name is simply gone. The same change updates every example and
test document.

## People and programs

### Agent

- **Means**: the AI session that writes the document, waits for the reviewer and replies.
- **Shows as**: page "Agent" on agent messages; Answers file `replies[].from: agent`; Document
  `author.agent`.
- **Not**: the listener, which is a process the agent starts.

### Reviewer

- **Means**: the person who reads the page, comments, answers questions and gives the verdict.
- **Shows as**: Answers file `replies[].from: reviewer`; prose "the reviewer". The page says "you".

### Server

- **Means**: the local process that `parley serve` starts; it serves pages and writes answers files.
- **Shows as**: CLI `parley serve`; page "saved to server"; prose "the server".
- **Replaces**: servlet. Retired everywhere, including code comments and the package description.
- **Not**: the listener.

### Listener

- **Means**: the agent's `parley answers <id> --wait` or `--notify` process, which tells the agent
  when the reviewer sends something.
- **Shows as**: CLI `--wait`, `--notify`; page header "Agent listening" or "No agent listening";
  prose "listener".
- **Not**: the server. A server can run with no listener.

## Files and versions

### Document

- **Means**: the JSON file an agent writes, `<id>.json`, holding blocks and questions.
- **Shows as**: CLI `check <doc.json>`, `render <doc.json>`; prose "document".
- **Replaces**: "doc" in prose (fine in code), and "page" when it meant the JSON.
- **Not**: the page.

### Page

- **Means**: the HTML a document becomes, served by the server or written by
  `render --format html`.
- **Shows as**: CLI `render --out <page.html>`; prose "page" or "review page".
- **Not**: the document. Never call the JSON a page.

### Static page

- **Means**: a page written by `render --format html` and opened with no server; answers stay in
  the browser until exported.
- **Shows as**: page Export; prose "static page".

### Markdown export

- **Means**: the same document written as markdown by `render --format markdown` (or
  `--out <file.md>`), for a PR body or a README.
- **Shows as**: CLI `render --format markdown`; prose "markdown export".
- **Not**: a page. It has no answers, threads or verdict.

### Answers file

- **Means**: `<id>.answers.json` beside the document, where the page saves the reviewer's comments,
  answers and verdict, and the agent's replies land.
- **Shows as**: page Export, "saved to server"; CLI `parley answers <id>`; prose "answers file".
- **Replaces**: sidecar. Retired everywhere, including developer docs and code comments.
- **Not**: an answer. One answers file holds every answer for one document.

### Revision

- **Means**: the version number of a document; the agent raises it each time it revises the
  questions.
- **Shows as**: Document `revision`; page "revision 3"; CLI `(revision 3)`.
- **Replaces**: "rewrite" as a noun. The agent revises the document.
- **Not**: round. One round can see several revisions.

### Explanatory document

- **Means**: a document with no questions; finishing it means the reviewer has read it.
- **Shows as**: Document with no `questions` and no `question` blocks; prose "explanatory
  document". The page offers the same verdicts as for any document.

## What a document holds

### Block

- **Means**: one typed part of a document, such as `prose`, `schema` or `diff`.
- **Shows as**: Document `blocks[]`; page block heading (the block `title`); prose "block".
- **Not**: item. A block holds one or more items.

### Block type

- **Means**: which kind of block it is, the value of its `type` field.
- **Shows as**: Document `type`; prose "block type".
- **Replaces**: "block kind" and "block kinds" (the index page and the skill say "block kinds").
- **Not**: answer style.

### Item

- **Means**: anything on the page a reviewer can select and comment on: a step, a table, a column,
  a finding, a question, an option, a file in the viewer, or the whole document.
- **Shows as**: page numbered entries; Document `id` on each one; Answers file `comments[].item`;
  CLI `on <item id>`; prose "item".
- **Replaces**: node, in all prose and in the answers file field `comments[].node`.
- **Not**: block. Not the digest's pending list, which lists threads.

### Reading column

- **Means**: the centre of the page, where blocks are read top to bottom.
- **Shows as**: no page label; prose "reading column". Code calls it `#left` and `BlockOut.left`.
- **Replaces**: "left pane" and "left" in prose.
- **Not**: contents.

### Contents

- **Means**: the pane at the side that lists blocks, items and questions.
- **Shows as**: page "Contents".
- **Replaces**: nav, navigation (in prose). Never "left pane".
- **Not**: reading column.

### Details

- **Means**: the extra text for an item, shown in the side pane when the item is selected.
- **Shows as**: page pane heading "Details"; Document `detail` (the field keeps its name);
  prose "details".
- **Replaces**: walkthrough, walkthrough section, section (for that pane).
- **Not**: summary, the one line shown beside the item.

### Section

- **Means**: not a parley term today. Reserved for a later heading that groups blocks into
  chapters.
- **Shows as**: nothing reviewer-facing. The code type `Section` is internal.
- **Not**: details.

### About the whole document

- **Means**: the part of the page for feedback that is not about one item; its item id is the
  document id.
- **Shows as**: page heading "About the whole document"; Answers file `comments[]` with
  `item: <document id>`. Feedback on the whole document that goes with the verdict is the
  finish summary.
- **Replaces**: General notes, "Notes" in the contents.

## Questions

### Question

- **Means**: a decision the agent needs from the reviewer.
- **Shows as**: Document `questions[]` or a `question` block; page question card; prose
  "question".
- **Not**: ask back, which is the reviewer asking the agent.

### Answer style

- **Means**: how a question is answered: one option, several options, or free text.
- **Shows as**: Document `style: single | multi | text` (values unchanged); prose "one option",
  "several options", "free text".
- **Replaces**: question `kind` (the field and the word). "Single" and "multi" in prose.
- **Not**: `kind` on operations, code-flow steps and workflow steps, which keeps its name and
  means a category.

### Option

- **Means**: one of the answers a question offers.
- **Shows as**: Document `options[]`, each with `id` and `title`; page radio or checkbox.
- **Replaces**: option `label`; "pick" and "choice" as nouns for an option.
- **Not**: answer. An option is offered; an answer is given.

### Recommended

- **Means**: the option the agent suggests; shown first and marked.
- **Shows as**: Document `recommended`; page "recommended" badge.

### Answer

- **Means**: what the reviewer gives a question: the options they chose, or their free text.
- **Shows as**: Answers file `choices[<question id>]` (the field keeps its name), with `selected`
  for options and `text` for free text; page "Your answer" on a free-text question; CLI
  `answered: …`.
- **Replaces**: "choice" in prose; "note" for a free-text answer (the field `note` on a free-text
  question becomes `text`).
- **Not**: reply.
- **Sending**: an answer, options chosen with no words or free text, goes to the agent with the
  verdict. It opens no thread; finishing stamps it `sent`.

### Note

- **Means**: optional words beside the options a reviewer chose.
- **Shows as**: Answers file `choices[<question id>].note`; page "Optional note" under a
  one-option or several-options question; CLI `[note]` once sent.
- **Replaces**: nothing. It loses its other meanings: a free-text answer is an **answer**,
  General notes become **About the whole document** and the **finish summary**, and the
  menu's "Comment on the whole document" is a **comment**.
- **Sending**: a note is sent to the agent with "Send to agent". Once sent it opens a thread and
  waits for a reply; `--wait` reports it as `[note]`, and the agent replies into it.
- **Not**: ask back, which keeps the question open.

### Ask back

- **Means**: the reviewer chooses "None of these, or I have a question" and writes what is
  missing; the question stays open until the agent replies.
- **Shows as**: page "None of these, or I have a question", state "Asked back"; Answers file
  `choices[<question id>].ask`; CLI `[ask]`, digest "asked back".
- **Replaces**: "Asked the agent", "asked-back", the digest's `ASKED`.

### Changed

- **Means**: the agent edited a question since the reviewer last looked at it.
- **Shows as**: page "Changed since you last looked"; CLI digest flag "changed since the reviewer
  looked"; digest JSON `questions[<id>].status: changed`; Answers file `seen` (question id to
  hash).
- **Not**: out of date, which is about the answer. Not the reply action `revised` (was `changed`).

### Out of date

- **Means**: the reviewer's answer was given to an earlier wording of the question.
- **Shows as**: page "Out of date"; CLI digest state line `out of date: …` and flag "answer out of
  date"; digest JSON `questions[<id>].status: out-of-date` and `questions[<id>].outOfDate`;
  Answers file `choices[<id>].hash` differs from the question's. Only an answer can be out of
  date: a chosen option or free text, not an ask or a note with no option chosen.
- **Replaces**: stale, "answered before the change", "answer predates an edit", `staleAnswer`.
- **Counts**: an out-of-date answer does not count as answered. It shows amber and is listed in
  the Finish sheet until the reviewer answers again or keeps it (page "Keep answer").
- **Not**: changed, which is about the question.

### Closed

- **Means**: the agent settled a question and gave a one-line resolution.
- **Shows as**: Document `status: closed`, `resolution`; page "Closed", "Chosen: <option>"; CLI
  `closed:`.
- **Replaces**: "Decided".
- **Not**: approved. Closing settles one question; approving ends a round.

### Reopen question

- **Means**: the reviewer asks the agent to look again at a closed question or one they answered. It
  shows only on a closed question or an answer that was sent or given before a verdict.
- **Shows as**: page button "Reopen question", state "Reopened"; Answers file
  `choices[<id>].reopened`; CLI `[reopen]`.
- **Replaces**: the "Reopen" button on a question. "Reopen" now means only this.
- **Not**: change verdict, new round.

## Comments and threads

### Comment

- **Means**: words the reviewer writes on an item, on selected words, on a region of an image, on
  a file in the viewer, or on the whole document.
- **Shows as**: page "Comment"; Answers file `comments[]` with `item`, `text`, `at`, `selector`;
  CLI `[comment] <thread id> on <item id>`.
- **Not**: answer, note.

### Draft

- **Means**: a comment the reviewer saved but has not sent.
- **Shows as**: page "Save draft"; Answers file comment with no `sent`; CLI "unsent comments".

### Send

- **Means**: deliver something to the agent now: a comment, an ask back, a note or a reply.
- **Shows as**: page "Send to agent", "Send N to agent", and "Queue N to agent" while the page
  can't reach the server; Answers file `sent`. A static page has no Send: exporting the answers
  file sends everything unsent.
- **Not**: finish review, though finishing sends every unsent comment, note and ask back with the
  verdict. Answers go with the verdict, not with Send. The page says so under the question meter:
  "Comments and asks go to the agent now. Answers go when you finish."

### Thread

- **Means**: a sent comment, ask back, note or reopen question, together with every reply under
  it.
- **Shows as**: page thread under the item; Answers file `replies[]`; CLI `--reply <thread id>`.
  A thread id is the comment id, or the question id for anything on a question.
- **Not**: item. One item can have several threads.

### Reply

- **Means**: any message added to a thread after the first one, by the agent or the reviewer.
- **Shows as**: page "Reply"; Answers file `replies[]` with `from`, `text`, `at`, `action`; CLI
  `answers --reply`, digest "reply to".
- **Replaces**: "follow-up" for a reviewer's reply (also digest JSON `followUpTo`).
- **Not**: answer.

### Reply action

- **Means**: what the agent did about a thread: `answered`, `revised` or `declined`.
- **Shows as**: CLI `--action answered | revised | declined`; Answers file `replies[].action`.
- **Replaces**: the value `changed`.
- **Not**: changed, which is about a question.

### New reply

- **Means**: an agent reply the reviewer has not seen yet. It counts as seen once it has been
  shown on the page for a second, with at least half of it on screen or, for a reply taller than
  the screen, at least half the screen full of it. It also counts as seen when the reviewer wrote
  later in the same thread.
- **Shows as**: a dot on the reply, its item and its contents entry; "New reply" on a
  question; the header count "N new replies"; the `u` key steps to the next one. Answers file
  `seenReplies` (message id to when it was seen).
- **Not**: changed, which is a question the agent edited. Not the CLI's new answers, which the
  agent has not read.

### Waiting for a reply

- **Means**: a thread whose last message is the reviewer's, sent, with no agent reply after it.
- **Shows as**: page "Waiting for a reply"; CLI digest "waiting for a reply: N".
- **Replaces**: "awaiting the agent", "awaiting a reply from the agent", "sent, awaiting reply",
  "Waiting for the agent to reply".

## Rounds and the verdict

### Round

- **Means**: one pass of review, from the agent starting it to the reviewer finishing it.
- **Shows as**: prose "round"; Answers file `roundStartedAt`.

### Finish review

- **Means**: the reviewer's act that ends a round by giving the verdict.
- **Shows as**: page button "Finish review" and its sheet; CLI `[verdict]`.
- **Sending**: before it records the verdict, it sends every unsent comment, note and ask back,
  and stamps every answer `sent`. The sheet says so ("finishing sends them").
- **Replaces**: "finish" alone in prose when it means this.

### Verdict

- **Means**: the outcome of a round: request changes or approve, with an optional finish summary.
- **Shows as**: page buttons "Request changes" and "Approve"; page states "Changes requested" and
  "Approved"; Answers file `verdict: reviewing | changes-requested | approved` and `finished`; CLI
  `[verdict]`, digest `verdict <value>`.
- **Replaces**: answers file `status`.
- **`reviewing`**: means no verdict yet. It is the value while a round is open.
- **Not**: closed. Not a question's `status`.

### Approve

- **Means**: the verdict that says the work can go ahead; allowed only when every question is
  answered.
- **Shows as**: page "Approve", state "Approved"; Answers file `verdict: approved`.
- **Not**: finish review, which also covers request changes.

### Request changes

- **Means**: the verdict that asks the agent to revise and start a new round.
- **Shows as**: page "Request changes", state "Changes requested"; Answers file
  `verdict: changes-requested`.

### Finish summary

- **Means**: the reviewer's optional text on the whole document for one round, given with the
  verdict. It is the one whole-document input that goes with the verdict; comments on the whole
  document go under About the whole document.
- **Shows as**: page box "About the whole document" in the Finish review sheet; Answers file
  `summary`; CLI digest first line.
- **Lifetime**: a new round deletes it.
- **Replaces**: General notes' "Notes on the whole document" box, and Answers file `notes`.
- **Not**: the document `summary`, which the agent writes.

### Change verdict

- **Means**: the reviewer takes back the verdict within the same round and can finish again.
- **Shows as**: page action "Change verdict" on the verdict chip; notice "Verdict cleared".
- **Replaces**: "Reopen" on the verdict chip and the notice "Review reopened".
- **Not**: new round.

### New round

- **Means**: the agent starts the next round after revising: verdict back to `reviewing`, finish
  summary cleared, answers kept.
- **Shows as**: CLI `answers --new-round`, which prints `new round <id>`; Answers file
  `roundStartedAt`.
- **Replaces**: `--reopen`, the output `reopened <id>`, and `reopenedAt`.
- **Not**: reopen question, change verdict.

## Rename table

The rename tasks apply these rows.

Each row changes a name only. The old name is not read after the rename.

### Page labels

| Old | New | File |
|---|---|---|
| "Reopen" (question button) | "Reopen question" | `src/lib/question.ts` |
| "Reopen" (verdict chip) | "Change verdict" | `src/lib/page/finish.ts` |
| "Review reopened" (notice after undoing the verdict) | "Verdict cleared" | `src/lib/page/finish.ts` |
| "Walkthrough" (pane heading) | "Details" | `src/lib/shell.ts` |
| "Open the walkthrough" (rail tooltip) | "Open details" | `src/lib/shell.ts` |
| "Click a section to highlight it. j / k step sections…" | "Click an item to highlight it. j / k step items…" | `src/lib/shell.ts` |
| "General notes" (heading and contents), "Notes" (contents group) | "About the whole document" | `src/lib/shell.ts`, `src/lib/page/comments.ts` |
| "Anything that is not about one node…" | "Anything that is not about one item…" | `src/lib/shell.ts` |
| "Leave a note for the agent…" | "Comment for the agent…" | `src/lib/page/comments.ts` |
| "Decided: <option>" | "Chosen: <option>" | `src/lib/question.ts` |
| "Answered before the change" | "Out of date" | `src/lib/page/questions.ts` |
| "Asked the agent" | "Asked back" | `src/lib/page/questions.ts` |
| "N awaiting the agent" (header) | "N waiting for a reply" | `src/lib/page/finish.ts` |
| "N threads awaiting a reply from the agent" (Finish sheet) | "N threads waiting for a reply" | `src/lib/page/finish.ts` |
| `aria-label` "Waiting for the agent to reply" | "Waiting for a reply" | `src/lib/page/comments.ts` |
| "Request changes: rewrite and come back" (Finish sheet) | "Request changes: revise and come back" | `src/lib/page/finish.ts` |
| "Changes requested. The agent rewrites and comes back." | "Changes requested. The agent revises and starts a new round." | `src/lib/page/finish.ts` |

### CLI

| Old | New |
|---|---|
| `answers --reopen` | `answers --new-round` |
| output `reopened <id>` | `new round <id>` |
| help "status back to reviewing, verdict cleared, answers kept" | "start a new round: verdict back to reviewing, answers kept" |
| `--action changed` | `--action revised` |
| `--reply <comment or question id>` in help | `--reply <thread id>` |
| digest first line `status <x>` | `verdict <x>` |
| digest "answer predates an edit" | "answer out of date" |
| digest `ASKED` | `asked back` |
| digest `open, note with no pick:` | `open, note with no option chosen:` |
| digest `follow-up to "…"` | `reply to "…"` |
| digest `sent, awaiting reply: N` | `waiting for a reply: N` |
| digest JSON `questions[<id>].staleAnswer` | `outOfDate` |
| digest JSON `pending[].node` | `pending[].item` |
| digest JSON `pending[].followUpTo` | `pending[].replyTo` |
| digest JSON fields copied from the answers file | the answers file names below |

### Document fields

| Old | New | Where |
|---|---|---|
| `kind` | `style` | question |
| `label` | `title` | option |
| `label` | `title` | story reference (`stories[]` objects, on a `story` block, a question or an option) |
| `label` | `title` | trace step |
| `label` | `title` | precedence rung and example |
| `label` | `title` | plan phase, workstream and task |
| `label` | `title` | workflow lane |
| `label` | `title` | matrix row and column |
| `cols` | `columns` | matrix |
| `col` | `column` | matrix cell |
| `rowLabel`, `colLabel` | `rowsTitle`, `columnsTitle` | matrix |
| `note` | `reason` | matrix cell |
| `note` | `reason` | precedence example |
| `note` | `detail` | schema relation |
| `cost.note` | `cost.detail` | annotated-text step |
| `label` | `title` | metrics column and measure |
| `label` | `title` | tradeoffs criterion |
| `note` | `reason` | tradeoffs score |

Removed: `repo.root`. Each reader sets their checkout folder on the page.

Kept as they are: schema table `notes[]`; schema table, column and index `name` (the SQL name);
`detail` everywhere; question `style` values `single`, `multi`, `text`. The rule behind the
`title` rows: every item's heading is `title`. `check` messages that quote a field (such as the
"recommended" warning on option and story labels in `src/lib/compose.ts`) change with it.

### Answers file fields

| Old | New | Note |
|---|---|---|
| `status` | `verdict` | values unchanged; `reviewing` means no verdict yet |
| `reopenedAt` | `roundStartedAt` | written by `--new-round` |
| `choices[<id>].note` on a free-text question | `choices[<id>].text` | `note` stays for words beside chosen options |
| `choices[<id>].history[].note` on a free-text question | `choices[<id>].history[].text` | same rule as the row above; `note` stays for words beside chosen options |
| `comments[].node` | `comments[].item` | includes `f:<path>` file items |
| `replies[].action: changed` | `replies[].action: revised` | |

Kept as they are: `choices`, `summary`, `seen`, `agentReadAt`, `choices[<id>].reopened`.

### Document index rows

The server's index rows (`IndexEntry`, built by `readEntry` in `src/commands/serve.ts`, shown by
`src/lib/index-page.ts`) carry two of these names.

| Old | New | Note |
|---|---|---|
| `status` | `verdict` | copied from the answers file; `reviewing` means no verdict yet |
| `kinds` | `blockTypes` | the document's block types |

### Prose (skill, README, package description, code comments)

| Old | New |
|---|---|
| servlet | server |
| sidecar, answer sidecar | answers file |
| node (a selectable thing) | item |
| walkthrough, walkthrough section, section (side pane) | details |
| left pane, left (the centre column) | reading column |
| nav, navigation | contents |
| stale, predates an edit, answered before the change | out of date |
| block kind, block kinds | block type, block types |
| question kind, single, multi | answer style: one option, several options, free text |
| choice (meaning an answer), pick (as a noun) | answer, chosen option |
| follow-up | reply |
| rewrite (noun, the document) | revision; the agent revises |
| page (meaning the JSON) | document |
| General notes, notes on the whole document | About the whole document, finish summary |
| Reopen (verdict), `--reopen` | change verdict, new round |
| status (of the review) | verdict |
| Decided | closed, chosen |

### Code identifiers

Rename these when the file is touched for another reason.

| Old | New | File | Note |
|---|---|---|---|
| `Servlet` | `Server` | `src/commands/serve.ts` | exported from `src/index.ts` |
| `Item` (a sent thread in the digest) | `PendingThread` | `src/lib/answers.ts` | exported from `src/index.ts` |
| `staleAnswer` | `outOfDate` | `src/lib/lifecycle.ts` | also digest JSON, above |
| `Node` (type) | `Item` | `src/lib/doc.ts` | internal; after `Item` becomes `PendingThread` |

## Field conflicts

These clash with field names in use today, or leave a word with two meanings.

- **`note` in blocks.** The glossary keeps "note" for words beside chosen options. The renames
  above move matrix cell, precedence example, schema relation and annotated-text step `cost` off
  `note`. Schema table `notes[]` stays: a list of facts about a table, in a different block.
- **`columns` in two shapes.** Matrix `columns` (after the rename) is a list of matrix columns,
  each with `id` and `title`. Schema table `columns` is a list of SQL columns, and schema index
  `columns` is a list of names. They live in different blocks, so the JSON does not clash, but
  `check` messages must name the block.
- **`column` in two shapes.** Matrix cell `column` (after the rename) is a matrix column id.
  Schema `Ref.column` is a SQL column name.
- **`title` on the block and on its items.** Every block has an optional `title`, its heading.
  After the rename its items have `title` too. No object has both `label` and `title` today, so no
  field is lost.
- **`kind` stays elsewhere.** After question `kind` becomes `style`, `kind` remains on operations,
  code-flow steps and workflow steps, where it means a category. The digest's internal item `kind`
  (`comment`, `ask`, `note`, `reopen`, `verdict`) also stays.
- **`status` after the rename.** Answers file `status` becomes `verdict`. Question `status` (open
  or closed) and plan `status` (todo, doing, done, blocked) keep the name.
- **`summary` means two things.** The document `summary` is the agent's lead. The answers file
  `summary` is the finish summary. Items also have a one-line `summary`.
- **`reason` is new on two blocks.** Trace steps already use `reason` for why a step has its
  outcome. Matrix cell and precedence example `reason` mean the same kind of thing.
- **`detail` and Details.** The page heading is "Details"; the field stays `detail`.
- **`Item` in code.** `src/lib/answers.ts` uses `Item` for a sent thread. Rename it before `Node`
  becomes `Item`.
- **`choices`.** The answers file field keeps the name, while "choice" is retired in prose.

## Retired words

Later checks search page, CLI, skill and README text for these. Each must be gone once its rename
lands.

A script can search for these:

- servlet, `Servlet`
- sidecar
- walkthrough
- "General notes", "Notes on the whole document"
- "Answered before the change", "predates an edit"
- "Asked the agent", `ASKED`
- "awaiting the agent", "awaiting a reply", "awaiting reply"
- "Decided"
- "note with no pick"
- "block kind", "block kinds"
- "follow-up", `followUpTo`
- `staleAnswer`
- "Review reopened"
- `--reopen`, `reopenedAt`
- `--action changed`
- "left pane"

A person must check these, because the word has other uses:

- stale (only about an answer)
- node (only in prose; CSS classes and `data-node` attributes are not reviewer text)
- "Reopen" on its own (allowed as "Reopen question" and the state "Reopened")
- note (only for words beside chosen options)
- pick and choice as nouns
- page meaning the JSON
- rewrite as a noun
- status meaning the verdict
