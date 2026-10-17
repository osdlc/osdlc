# Domain: ui

Read by `/craft:propose-solution` for a UI or UX change with choices the reviewer must make: a mock,
a prototype or a redesign. Non-UI questions about the same work sit in the same document, with no
media.

## Blocks

A `prose` block that names the problem and points to the spec. A `story` block for today's
behaviour when the comparison needs it. A `question` block per decision, at the point in the
reading it belongs to, each question with a `group` (Layout, Viewers, Behaviour).

## Stories

- Start the package's Storybook if it is not running, and note its URL. Set the document's
  `storybook` to that URL and `storybookStart` to the command that starts it.
- Take story ids from `<storybook>/index.json` only; an id is the story's title and export name
  in kebab case, such as `explore-file-view--tabs-today`.
- Give each option the stories that show it; the page lays such options out side by side. Show
  today's behaviour as question-level media when it helps the comparison.
- Add `globals: theme:dark` for a dark variant when the Storybook supports it. Set `width` when
  the story lays out at other than 1440 pixels and `height` when 480 crops it.
- Use `shots` for states a story cannot reach, as paths from the repository root.

## Serving

If the Storybook runs on another port than the document's `storybook`, serve with
`--storybook <url>`. Open the Storybook URL with `curl` before handing over the page, and give the
reviewer both URLs.

## Revising

When the next revision of the UI lands, update the document in the same change: point options at
the new stories, close what is settled, add new questions, bump `revision`. Commit the document
and its sidecar on the prototype's branch.

## Safety test

A question is unsafe to ratify as written when the reviewer could approve it without seeing
what they approve:

- An option has no story or shot showing it, so it is judged by its label alone.
- The recommendation is in a label, a story name or the prompt rather than in `recommended`.
- One question settles two decisions, such as layout and what a click selects.
- Its media shows more than the choice, so the reviewer cannot tell what differs.

Split: give each option a story or shot of its own, or say in its `detail` that none exists yet.
Move the recommendation to `recommended`. Make one question per decision, each in its own
`group`. Narrow the media to the state that differs.

## Grouping

Each question carries a `group` named for the part of the UI it decides: Layout, Viewers,
Behaviour. A question that only makes sense after another names it in its prompt, in the same
group.

## Questions

One for every visible choice: layout, what a click selects, what a state shows, how much of an
error to show.

Ids: a word or two for the choice, such as `window-tabs`.
