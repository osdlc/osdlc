# freeform-vault

**The awkward one.** Everything legal that is not the shape the docs show, so
the support answers can be tested here.

```text
skills/house-style.md              promoted above every marketplace
references/                        a peer directory: no kind folder, untouched
  tone.md                          reached by wikilink, copied at publish
  ideas.md                         no name, no description — skipped in silence
marketplaces/
├─ acme/                           has a note, carrying owner and author
│  ├─ acme.md
│  ├─ skills/shared-check.md       promoted to the marketplace
│  └─ plugins/
│     ├─ core/
│     │  ├─ core.md
│     │  ├─ skills/
│     │  │  ├─ review.md           narrowed to one target · foreign `license` key
│     │  │  ├─ secret.md           `tc-targets: []` — publishes nowhere
│     │  │  ├─ stray.md            `tc-plugin: side` — joins a plugin it is not in
│     │  │  └─ bundled/            owns a directory · embeds, links, dangles
│     │  │     ├─ bundled.md
│     │  │     └─ scripts/run.sh   the execute bit travels
│     │  ├─ commands/
│     │  │  ├─ ship.md             a command — discovered, never published
│     │  │  └─ oddity.md           `tc-kind: skill` overrules the folder
│     │  └─ agents/scout.md        an agent — same
│     └─ noteless/skills/quick.md  a plugin with no note of its own
└─ labs/plugins/spike/skills/probe.md   a marketplace with no note either
```

## What each one is here to prove

**Promotion, at both levels.** `house-style` is shared by every marketplace;
`shared-check` by acme's plugins. Same `skills/` folder, different height, and
the height is the scope.

**A container need not carry a note.** `noteless/` is a plugin and `labs/` is a
marketplace because of what they hold, not because anything says so. The tree
draws both.

**Both directions of the ranking.** `oddity` sits in `commands/` and declares
itself a skill; `stray` sits in `core/` and files itself under `side/`. The note
wins each time, and the folder it overruled is still reported — where a note
actually sits is the one fact a resolved row cannot otherwise recover.

**`side/` is a plugin that owns no directory**, named into being by one note's
`tc-plugin` and nothing else.

**`tc-targets`, all three readings.** Absent on most (`all`), an empty list on
`secret` (`none`), one name on `review`. The badge cannot separate them alone,
which is why the row carries the reading as a hover.

**Kinds that never publish.** `ship` and `scout` are in the vocabulary with no
renderer, so both are listed and both are refused by name rather than written
wrongly.

**Everything a note can reach.** `bundled` embeds `review`, links `ship` and
the peer note `tone`, and names `house-rules`, which nothing answers to. Those
are the four things the Related tree groups — an embed, a link, a peer file and
a dangling name — plus the plugin and marketplace holding it.

**Frontmatter the model does not own.** `review` carries `license: MIT`, which
survives a round trip untouched and is re-emitted at publish — the `tc-` prefix
is what gets stripped, not everything unrecognised.

## Nothing here is malformed

Break one by hand — set `tc-kind: skil` — and that note alone drops out of the
tree. The others still list. Worth seeing once, because a note that is simply
absent is easy to miss.

To see a scan refuse outright, give two notes in one plugin the same published
name. Two components cannot claim one publish directory, so the whole tree is
replaced by the refusal's diagnosis. That and a missing root are the only
things that stop a scan.
