# The parley loop

The rules for each step of the loop in `/skill:craft-parley`. The commands write the bundle as
`node parley.mjs`; run it from the project root as `node <skill folder>/parley.mjs`.

- [Check](#check): run `check` and fix what it prints.
- [Serve](#serve): start the server, `--root`, and who can read through it.
- [Listen](#listen): the background listener, and `--notify` when your harness cannot wake you.
- [Hand over the link](#hand-over-the-link): which link to give, and when.
- [Reply to each send](#reply-to-each-send): reply ids, `--action revised` and `--action declined`.
- [New round or render](#new-round-or-render): the verdict, `--mark-read`, `--new-round` and
  `render`.
- [A failed reply](#a-failed-reply): sending a `--reply` again with `--id`.

## Check

Run `node parley.mjs check <doc.json>`. Fix every line it prints and run it again. A warning can
follow `ok`; fix it too, or say why in the document.

## Serve

Run `node parley.mjs serve [dir]` in the background. `dir` defaults to `docs/parley`. Leave it
running: it watches the folder and updates the open page.

- Pass `--root <path>` when `dir` is outside the checkout.
- The page can open any file git lists in the checkout, so anyone with the link can read a tracked
  secret.
- `serve --host 0.0.0.0` opens the server to the LAN and puts a token in the link. Share that link
  only with people who may read the repo.

## Listen

Run `node parley.mjs answers <id> [dir] --wait` as a background command your harness tells you
about when it exits. It exits when the reviewer sends something and prints it.

- Do not poll the answers file, and do not hand the wait to a subagent.
- If your harness cannot wake you on exit, use `--notify "<command>"` instead; it runs the command
  on every send. For sdlc hosts, the command is `sdlc session send`.

## Hand over the link

Once a listener runs, give the reviewer the address `serve` printed, with `d/<id>` after its last
`/` and any `?t=` token kept. Never give a link while no listener runs.

`serve --host 0.0.0.0` opens the server to the LAN and puts a token in the link. Share that link
only with people who may read the repo.

## Reply to each send

Each send prints as `[<kind>] <thread id> on <item id>`, then the reviewer's words. Reply with
`node parley.mjs answers <id> [dir] --reply <thread id> --text "…" --model <your model id>`.

- The thread id is the word right after `[comment]`, `[ask]`, `[note]` or `[reopen]`; on a question
  it is the question id. A wrong id fails and lists the ids that wait.
- Every sent item stays pending until you `--reply` to it.
- If a revision fixed it, reply with `--action revised`. If you will not do it, reply with
  `--action declined` and say why.
- Then start the listener again. A `--wait` that returns at once means a send is still pending.

Answers to questions reach you with the verdict, not one by one. An ask back or a note beside a
chosen option reaches you at once, as `[ask]` or `[note]`. A `[reopen]` is handled in
[writing.md](writing.md#reopened-questions).

## New round or render

The round ends when the wait prints `[verdict] …`. Run
`node parley.mjs answers <id> [dir] --mark-read` for the digest: the verdict, the finish summary,
each question's state and each answer. Quote the summary when you act on it.

- `changes-requested`: run `node parley.mjs answers <id> [dir] --new-round`, revise the document
  (see [writing.md](writing.md#revising)), and go back to [Check](#check).
- `approved`: every question is answered. Run
  `node parley.mjs render <doc.json> --out docs/parley/<id>.html` and commit the document, the
  answers file and the page together. For a PR body, also render `--out <id>.md`, and strip its
  leading frontmatter block before you paste it.

## A failed reply

If `--reply` fails saying the change may still land, send the same text again with the `--id` it
printed. The reply is stored once.
