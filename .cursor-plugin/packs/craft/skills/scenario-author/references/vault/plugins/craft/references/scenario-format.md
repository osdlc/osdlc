# Scenario format

A scenario is an end-to-end test written in prose. A simulated user, the persona, carries it
out against a real build. It fits any kind of app: web, desktop, CLI or API. The project's
scenario README holds its own fields, ids, personas and fixtures, and wins where it differs.

## Known kinds

A new corpus stores its records as these four kinds, exactly as written here. A trial is one persona
attempting one scenario. A round is one batch of trials against one build. Do not invent other
kinds, prefixes or folders for them. They follow [sdlc-compatible-records.md](sdlc-compatible-records.md).

| Kind | `type` | Id | Folder | File name | Required frontmatter |
| --- | --- | --- | --- | --- | --- |
| Scenario | `scenario` | `SC-XXXX` | `scenarios/` | `SC-XXXX-<goal-slug>.md` | `type`, `id`, `title`, `persona`, `fixture`, `status`, `created` |
| Persona | `persona` | `PE-XXXX` | `personas/` | `PE-XXXX-<name-slug>.md` | `type`, `id`, `title`, `created` |
| Trial | `trial` | `TL-XXXX` | `trials/` | `TL-XXXX-<date>-<scenario-slug>.md` | `type`, `id`, `title`, `scenario`, `persona`, `round`, `build`, `result`, `created` |
| Round | `round` | `RD-XXXX` | `rounds/` | `RD-XXXX-<date>-<slug>.md` | `type`, `id`, `title`, `build`, `created` |

- **Ids.** `XXXX` is four base-36 characters (`0-9`, `A-Z`), picked at random; pick again if a
  file already has that id. Random ids make a clash across parallel branches unlikely, so no one
  numbers in order. If a merge brings two files with one id, the later one picks again.
- **Prefixes.** `S` is taken by standards. The four prefixes clash with none that sdlc uses or
  reserves, listed in [sdlc-compatible-records.md](sdlc-compatible-records.md).
- **Folders.** The four folders sit under `docs/planning/`, or together under one corpus folder
  that the README names. Keep the folder names either way.
- **Trials are their own kind**, not a note genre: each must point to one scenario, persona and
  round, and findings point back to it, which a free-form note cannot require.
- **Rounds are their own kind**, not a note genre: trials point to a round by id, and a round
  must name its build.
- **Links point up**, as wikilinks to the id: a scenario's `persona: '[[PE-XXXX]]'`; a trial's
  `scenario`, `persona` and `round`; a finding names its trial as `[[TL-XXXX]]` in its text. A
  round lists no trials; tools find them by their `round` field. Anything else goes in `related`.
- **`result`** is `done`, `stuck` or `stopped`. `status` is as below.
- **Legacy corpora.** A corpus that already has its own id scheme or record names, such as
  sessions and runs, keeps them, and the README says so. Only a new corpus uses these kinds.

## Persona

A persona is a named kind of user, defined once and reused. The corpus README says where: a
Personas table in the README, or one file per persona. A new corpus uses one `PE-XXXX` file per
persona, from [Known kinds](#known-kinds). It says:

- **Knows:** what they already know about the domain, the app and its tools.
- **Works:** how they work: how often, with what data, with mouse or keyboard, in a hurry or
  with care.
- **Limits:** what they do not know or cannot do.

Whoever runs a scenario stays in the persona. When the persona would not know how to go on, that
gap is a finding, not a reason to step out of character.

## Scenario

One file per scenario. The frontmatter carries at least:

- `type`: `scenario`.
- `id`: stable and never reused, even after the scenario is retired. A new corpus uses
  `SC-XXXX` from [Known kinds](#known-kinds); an existing corpus keeps its own scheme.
- `title`: the goal, in the persona's words.
- `persona`: one of the corpus's personas; a `'[[PE-XXXX]]'` wikilink in the Known kinds.
- `fixture`: the data or state it starts from.
- `status`: `draft`, `reviewed` or `retired`.
- `created`: the date it was written, `YYYY-MM-DD`.
- `needs` (optional): ids of tasks for features not built yet. Rounds skip the scenario until they
  land. Never list a gap you only expect.

The body has these sections:

1. **Who and why.** The persona's situation and goal, in their words.
2. **Starting point.** The state of the app and its data before they begin. All of it is setup.
3. **What they try to do.** The goal and the outcome. Never a button, screen, command or
   endpoint.
4. **They would call it done when.** Outcomes someone could check.
5. **Things to watch.** Questions for the trial, with no answers.
6. **Related.** Findings, tasks and design docs it touches.

A trial reads sections 1 to 4 before the attempt and section 5 after it.
