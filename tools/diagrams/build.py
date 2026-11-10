"""Writes the plan's diagrams to docs/diagrams/*.svg.

Run from the repo root: python3 tools/diagrams/build.py
Each SVG is standalone, with concrete colours and a dark-mode block. GitHub
shows SVGs through <img>, so the colours follow the viewer's OS colour
scheme, not the GitHub theme setting.
"""
import html
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "diagrams"

W = 440                    # viewBox width; reads on a phone without zooming
CW, CH, GX, GY = 200, 46, 8, 8
X0 = 16

LIGHT = dict(bg="#fbfaf7", fg="#1d1d1b", mut="#5d5d58", band="#f0eee8", line="#d8d5cc", chip="#ffffff",
             osdlc="#2f855a", md="#b83280", dev="#2b6cb0", ont="#6b46c1", sw="#c05621",
             bad="#c53030", badbg="#fde8e8", acc="#b8741a", accbg="#fde7c8")
DARK = dict(bg="#16161a", fg="#ececea", mut="#a3a39d", band="#222227", line="#3a3a40", chip="#2b2b31",
            osdlc="#68d391", md="#f687b3", dev="#63b3ed", ont="#b794f4", sw="#f6ad55",
            bad="#fc8181", badbg="#3b1d1d", acc="#f6ad55", accbg="#3d2f1c")


def rules(c):
    return f"""
.bg{{fill:{c['bg']}}} .band{{fill:{c['band']}}}
.rl{{font-size:15px;font-weight:650;fill:{c['fg']}}} .rs{{font-size:12px;fill:{c['mut']}}}
.lang{{font-size:10.5px;font-weight:700;letter-spacing:.06em;fill:{c['mut']}}}
.chip rect{{fill:{c['chip']};stroke-width:1.5}} .chip.later rect{{fill:none;stroke-dasharray:5 4}}
.cn{{font-size:13px;font-weight:650;fill:{c['fg']}}} .cs{{font-size:11px;fill:{c['mut']}}}
.r-osdlc rect{{stroke:{c['osdlc']}}} .r-osdlc .dot{{fill:{c['osdlc']}}}
.r-md rect{{stroke:{c['md']}}} .r-md .dot{{fill:{c['md']}}}
.r-dev rect{{stroke:{c['dev']}}} .r-dev .dot{{fill:{c['dev']}}}
.r-ont rect{{stroke:{c['ont']}}} .r-ont .dot{{fill:{c['ont']}}}
.r-sw rect{{stroke:{c['sw']}}} .r-sw .dot{{fill:{c['sw']}}}
.fb rect{{fill:{c['badbg']};stroke:{c['bad']}}} .fb text{{font-size:10.5px;font-weight:700;fill:{c['bad']}}}
.dup{{stroke:{c['bad']};stroke-width:1.6;stroke-dasharray:4 3}}
.edge{{fill:none;stroke:{c['mut']};stroke-width:1.4}} .ahp{{fill:{c['mut']}}}
.lvl rect{{fill:{c['chip']};stroke:{c['line']}}} .prof rect{{fill:{c['accbg']};stroke:{c['acc']}}}
.tie{{stroke:{c['acc']};stroke-width:1.6;fill:none}}
.task rect{{stroke-width:1.6}} .tt{{font-size:11.5px;font-weight:650;fill:{c['fg']}}}
.tn{{fill:{c['fg']}}} .tnt{{font-size:10.5px;font-weight:700;fill:{c['bg']}}}
.t-done rect{{fill:{c['chip']};stroke:{c['osdlc']}}} .t-done .tn{{fill:{c['osdlc']}}}
.t-doing rect{{fill:{c['chip']};stroke:{c['dev']}}} .t-doing .tn{{fill:{c['dev']}}}
.t-owner rect{{fill:{c['accbg']};stroke:{c['acc']}}} .t-owner .tn{{fill:{c['acc']}}}
.t-todo rect{{fill:{c['chip']};stroke:{c['line']}}} .t-todo .tn{{fill:{c['mut']}}}
.group{{fill:none;stroke:{c['line']};stroke-width:1.4;stroke-dasharray:5 4}} .gt{{font-size:11.5px;font-weight:650;fill:{c['mut']}}}"""


def svg(body, height, label):
    style = rules(LIGHT) + "\n@media (prefers-color-scheme: dark) {" + rules(DARK) + "\n}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {height}" width="{W * 2}" '
            f'font-family="system-ui, -apple-system, Segoe UI, sans-serif" role="img" aria-label="{esc(label)}">'
            f'<style>{style}</style><rect class="bg" width="{W}" height="{height}"/>{body}</svg>\n')


def esc(s):
    return html.escape(s, quote=True)


ARROW = ('<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" '
         'orient="auto"><path d="M0,0L10,5L0,10z" class="ahp"/></marker></defs>')


def chip(x, y, name, sub, repo, later=False, faults=(), w=CW):
    cls = f"chip r-{repo}" + (" later" if later else "")
    out = [f'<g class="{cls}"><rect x="{x}" y="{y}" width="{w}" height="{CH}" rx="7"/>',
           f'<circle cx="{x + 12}" cy="{y + 16}" r="4.5" class="dot"/>',
           f'<text x="{x + 22}" y="{y + 20}" class="cn">{esc(name)}</text>',
           f'<text x="{x + 10}" y="{y + 37}" class="cs">{esc(sub)}</text></g>']
    for i, f in enumerate(faults):
        bx = x + w - 14 - i * 27
        out.append(f'<g class="fb"><rect x="{bx - 12}" y="{y - 9}" width="25" height="17" rx="8.5"/>'
                   f'<text x="{bx + 0.5}" y="{y + 3.5}" text-anchor="middle">{esc(f)}</text></g>')
    return "".join(out)


def grid(y, items):
    out = []
    for i, it in enumerate(items):
        r, c = divmod(i, 2)
        name, sub, repo, *rest = it
        later = "later" in rest
        faults = next((x for x in rest if isinstance(x, tuple)), ())
        out.append(chip(X0 + c * (CW + GX), y + r * (CH + GY + 6), name, sub, repo, later, faults))
    return "".join(out), ((len(items) + 1) // 2) * (CH + GY + 6)


KEY = [("osdlc", "osdlc"), ("dev", "dev"), ("ont", "rust-ontogen"), ("sw", "skillwright")]
TARGET_KEY = [("md", "markdown")] + KEY


def key(y, repos, label="Repo:"):
    out, x = [f'<text class="cs" x="{X0}" y="{y + 4}">{label}</text>'], X0 + 40
    for repo, name in repos:
        out.append(f'<g class="chip r-{repo}"><circle cx="{x}" cy="{y}" r="4.5" class="dot"/></g>'
                   f'<text class="cs" x="{x + 8}" y="{y + 4}">{name}</text>')
        x += 22 + len(name) * 6.6
    return "".join(out)


def layers(rows, label, repos=KEY):
    y, out = 26, [key(12, repos)]
    for name, sub, ts, rs in rows:
        top, body, yy = y, [], y + 52
        for lang, items in (("TYPESCRIPT", ts), ("RUST", rs)):
            if not items:
                continue
            body.append(f'<text class="lang" x="{X0 + 2}" y="{yy + 4}">{lang}</text>')
            g, h = grid(yy + 16, items)
            body.append(g)
            yy += 16 + h
        h = yy - top + 2
        out.append(f'<rect class="band" x="6" y="{top}" width="{W - 12}" height="{h}" rx="10"/>')
        out.append(f'<text class="rl" x="{X0}" y="{top + 24}">{esc(name)}</text>'
                   f'<text class="rs" x="{X0}" y="{top + 39}">{esc(sub)}</text>')
        out.extend(body)
        y = top + h + 10
    return svg("".join(out), y, label)


PRESENT = [
    ("Apps and tools", "who reads notes",
     [("sdlc", "planning corpus", "dev"), ("skillwright build", "skills → plugins", "sw"),
      ("harness-reference", "typed corpus", "sw")],
     [("determined", "notes app", "dev"), ("skillwright CLI", "renames", "sw")]),
    ("Render, edit, sites", "show notes to people",
     [("markdown-render", "Obsidian dialect → HTML", "dev"), ("markdown-editor", "CodeMirror live edit", "dev"),
      ("markdown-astro", "vault → Astro site", "dev", ("F1",)), ("markdown-ui", "Nuxt viewing chrome", "dev", ("F11",))], []),
    ("Query and store", "a db over notes",
     [("markdown-vault-query", "Obsidian Bases engine", "dev", ("F9",)),
      ("query loader", "planned", "osdlc", "later", ("F9",))],
     [("markdown-store", "typed CRUD, lossless", "ont", ("F6", "F7")), ("ontogen", "Rust structs → notes", "ont")]),
    ("Types", "what a record must hold",
     [("model-schema", "packs; dev, open PRs", "dev", ("F5",)), ("pack-intent, -sdlc", "sdlc's 14 kinds", "dev", ("F5",)),
      ("corpus-schema", "validator, on npm", "md", ("F5", "F8"))], []),
    ("Corpus model", "every note, link, backlink",
     [("markdown-vault", "scan + resolve + backlinks", "dev", ("F1", "F4")),
      ("vault-graph-core", "resolve + nodes/edges", "dev", ("F1", "F11"))],
     [("markdown-corpus", "graph, backlinks, refresh", "osdlc", ("F4",)),
      ("markdown-relink", "move notes, fix links", "osdlc")]),
    ("Note parts", "one note's pieces",
     [("markdown-link", "parse; no resolver", "osdlc", ("F2", "F3")), ("frontmatter-lossless", "split, rewrite", "osdlc"),
      ("markdown-contract", "one doc's structure", "osdlc"), ("markdown-tags", "#tags, 3 dialects", "osdlc"),
      ("gfm-table", "pipe tables", "osdlc"), ("yaml-splice", "edit YAML in place", "osdlc"),
      ("markdown-link copy", "dev, private 0.1.0", "dev", ("F11",))],
     [("markdown-link", "parse + LinkIndex", "osdlc"), ("frontmatter-lossless", "twin", "osdlc"),
      ("markdown-contract", "twin", "osdlc"), ("markdown-tags", "twin", "osdlc"),
      ("gfm-pipe-table", "twin", "osdlc"), ("yaml-splice", "twin + wasm", "osdlc")]),
    ("Files", "walk, read, write",
     [("etag-write", "atomic writes", "osdlc"), ("path-guard", "safe paths", "osdlc")],
     [("markdown-vault-fs", "walk, exclusions", "osdlc"), ("vfs-walk", "walk a folder", "osdlc"),
      ("vfs-seam", "file system seam", "osdlc"), ("etag-write", "twin", "osdlc"),
      ("path-guard", "twin", "osdlc")]),
]

TARGET = [
    ("Apps and tools", "read only through osdlc packages",
     [("sdlc", "types from profiles", "dev"), ("skillwright, harness-ref", "spec corpora", "sw")],
     [("determined", "corpus model", "dev"), ("skillwright CLI", "corpus model", "sw")]),
    ("Render, edit, sites", "in osdlc/osdlc for now",
     [("markdown-render", "", "osdlc"), ("markdown-editor", "", "osdlc"),
      ("markdown-astro", "", "osdlc"), ("markdown-ui", "", "osdlc")], []),
    ("Query: the db layer (D5)", "one read layer over the model",
     [("query layer", "Bases + loader, one model", "osdlc")],
     [("markdown-store", "writes the spec layout", "ont")]),
    ("The spec and profiles", "in this repo, one type format",
     [("corpus-schema", "levels 0–2, reads the model", "md"), ("profiles (D4)", "claims, sdlc, ...", "md")],
     []),
    ("Corpus model", "one per language, one family",
     [("markdown-corpus", "vault + graph merged", "osdlc")],
     [("markdown-corpus", "twin", "osdlc"), ("markdown-relink", "", "osdlc")]),
    ("Note parts", "twins, one resolver rule",
     [("markdown-link", "+ LinkIndex, all links", "osdlc"), ("other parts", "unchanged twins", "osdlc")],
     [("markdown-link", "LinkIndex, twin", "osdlc"), ("other parts", "unchanged twins", "osdlc")]),
    ("Files", "unchanged", [("etag-write, path-guard", "", "osdlc")], [("vault-fs, walk, seam", "", "osdlc")]),
]



# The task graph. Status: done, doing, owner (waiting on the owner), todo.
TASKS = {
    1: ("corpus-schema", "rename, levels", "done"),
    2: ("Record folders", "osdlc PR 729", "done"),
    3: ("Publish 0.2.0", "on npm", "done"),
    4: ("Claims example", "profiles/claims", "doing"),
    5: ("Project writes", "evidence as records", "todo"),
    6: ("x-warn", "soft schema rules", "todo"),
    7: ("Obsidian", "dialect: wikilinks", "todo"),
    8: ("Use npm", "skillwright, root file", "todo"),
    9: ("Profiles", "extends: types", "todo"),
    10: ("Store layout", "markdown-store", "todo"),
    11: ("Link resolver", "after PRs 649, 651", "todo"),
    12: ("One TS model", "vault + graph", "todo"),
    13: ("Switch users", "query, astro, apps", "todo"),
    14: ("Validator", "reads model; needs 3", "todo"),
    15: ("Query layer", "one, on the model", "todo"),
    16: ("JSON / SQLite", "after query layer", "todo"),
    17: ("Render/sites", "PRs 719 720", "doing"),
    18: ("This plan", "markdown PR 4", "owner"),
    19: ("Point repos", "here, after 18", "todo"),
    20: ("Arch doc", "markdown PR 5", "doing"),
    21: ("Release here", "markdown PR 9", "doing"),
    22: ("Capture", "writes study results", "todo"),
    26: ("Adopt claims", "harness-reference", "todo"),
    27: ("Extends", "parents, pinned", "todo"),
    28: ("Refine, waive", "local vs inherited", "todo"),
    29: ("Sync", "_inherited copy", "todo"),
    30: ("Org principles", "first real case", "todo"),
    23: ("Claims profile", "after 9, 21, 31", "todo"),
    33: ("Spec details", "YAML, format, codes", "todo"),
    34: ("Ids and move", "slug ids, move verb", "todo"),
    31: ("Nested x-ref", "any depth; after 3, 4", "todo"),
    32: ("Rust validator", "after 12 and 14", "todo"),
    24: ("Name overrides", "own folder names", "todo"),
    25: ("Testing profile", "extends claims", "todo"),
}
STATUS = [("done", "done"), ("doing", "in progress"), ("owner", "waiting on owner"), ("todo", "not started")]


def task_graph():
    tw, th, pitch = 132, 46, 78
    cols = [14, 154, 294]
    top = 52

    def at(r, c):
        return cols[c], top + r * pitch

    def node(n, x, y):
        t, sub, st = TASKS[n]
        return (f'<g class="task t-{st}"><rect x="{x}" y="{y}" width="{tw}" height="{th}" rx="8"/>'
                f'<circle cx="{x + 13}" cy="{y + 16}" r="9" class="tn"/>'
                f'<text x="{x + 13}" y="{y + 19.5}" text-anchor="middle" class="tnt">{n}</text>'
                f'<text x="{x + 26}" y="{y + 20}" class="tt">{esc(t)}</text>'
                f'<text x="{x + 9}" y="{y + 37}" class="cs">{esc(sub)}</text></g>')

    def edge(x1, y1, x2, y2):
        my = (y1 + y2) / 2
        return f'<path class="edge" d="M{x1},{y1} C{x1},{my} {x2},{my} {x2},{y2 - 5}" marker-end="url(#ah)"/>'

    out = [ARROW]
    x = X0
    for st, name in STATUS:
        out.append(f'<g class="task t-{st}"><rect x="{x}" y="6" width="12" height="12" rx="3"/></g>'
                   f'<text class="cs" x="{x + 17}" y="16">{name}</text>')
        x += 30 + len(name) * 6.1
    for c, name in enumerate(["EVIDENCE PROJECT", "THE SPEC", "CORPUS MODEL"]):
        out.append(f'<text class="lang" x="{cols[c] + 2}" y="40">{name}</text>')
    cx = lambda c: cols[c] + tw / 2
    place = {4: (3, 0), 1: (0, 1), 11: (0, 2), 2: (1, 1), 12: (1, 2), 3: (2, 1)}
    edges = [(1, 2), (11, 12), (2, 3), (3, 4)]
    # groups: (column, first row, title, members, fed by)
    groups = [(1, 3, "After 0.2.0", [6, 7, 8, 10, 33, 34, 21, 31, 9], 3),
              (2, 2, "After the TS model", [13, 15, 16, 14, 32], 12)]
    gpitch = 62
    bodies = []
    node_pos = []
    bottom = 0
    for c, r, title, members, src in groups:
        gx, gy = cols[c] - 3, top + r * pitch - 4
        gh = 24 + len(members) * gpitch
        out.append(f'<rect class="group" x="{gx}" y="{gy}" width="{tw + 6}" height="{gh}" rx="10"/>'
                   f'<text class="gt" x="{gx + 10}" y="{gy + 16}">{esc(title)}</text>')
        for i, n in enumerate(members):
            bodies.append(node(n, cols[c], gy + 24 + i * gpitch))
            node_pos.append((gy + 24 + i * gpitch, n))
        sx, sy = at(*place[src])
        out.append(edge(sx + tw / 2, sy + th, cx(c), gy))
        bottom = max(bottom, gy + gh)
    # arrows inside the TS-model box: 15 -> 16 and 14 -> 32
    ys_all = {n: g_y for g_y, n in node_pos}
    for a, b in ((15, 16), (14, 32)):
        out.append(edge(cx(2), ys_all[a] + th, cx(2), ys_all[b]))
    # evidence column: 26, 22 and 5 sit below 4, with 26 level with task 9
    ys = {n: g_y for g_y, n in node_pos}
    y9 = ys[9]
    ev = {26: y9, 22: y9 + pitch, 5: y9 + 2 * pitch}
    x4, y4 = at(*place[4])
    chain_nodes = [4, 26, 22, 5]
    ev_y = {4: y4, **ev}
    for n in (26, 22, 5):
        bodies.append(node(n, cols[0], ev_y[n]))
    for n1, n2 in zip(chain_nodes, chain_nodes[1:]):
        out.append(edge(cx(0), ev_y[n1] + th, cx(0), ev_y[n2]))
    # 8 feeds 26 from the side of its box
    sx, sy = cols[1] - 3, ys[8] + th / 2
    out.append(f'<path class="edge" d="M{sx},{sy} C{sx - 40},{sy} {cols[0] + 100},{sy} {cols[0] + 100},{y9 - 5}" marker-end="url(#ah)"/>')
    # 4 feeds 31 down the gap between the columns
    x4r, y4r = cols[0] + tw, at(*place[4])[1] + th / 2
    out.append(f'<path class="edge" d="M{x4r},{y4r} C{x4r + 4},{y4r + 20} {x4r + 4},{ys[31] + th / 2 - 20} {cols[1] - 3},{ys[31] + th / 2}" marker-end="url(#ah)"/>')
    # profile chain: below the TS-model group in the last column, fed by 9, 21 and 31
    gx, gy = cols[2] - 3, bottom + 20
    cpitch = 66
    gh = 24 + 3 * cpitch - 20
    out.append(f'<rect class="group" x="{gx}" y="{gy}" width="{tw + 6}" height="{gh}" rx="10"/>'
               f'<text class="gt" x="{gx + 10}" y="{gy + 16}">After profiles</text>')
    chain = [(23, gy + 24), (24, gy + 24 + cpitch), (25, gy + 24 + 2 * cpitch)]
    for n, ny in chain:
        bodies.append(node(n, cols[2], ny))
    for (_, y1), (_, y2) in zip(chain, chain[1:]):
        out.append(edge(cols[2] + tw / 2, y1 + th, cols[2] + tw / 2, y2))
    for n, tx in ((21, cols[2] + 100), (31, cols[2] + 70), (9, cols[2] + 40)):
        sx, sy = cols[1] + tw, ys[n] + th / 2
        out.append(f'<path class="edge" d="M{sx},{sy} C{sx + 40},{sy} {tx},{sy + 10} {tx},{gy - 5}" marker-end="url(#ah)"/>')
    bottom1 = gy + gh
    # inheritance tasks: below everything in the evidence and middle columns, fed by 9
    gx, gy = cols[0] - 3, max(bottom, ev_y[5] + th) + 20
    rows = [gy + 24, gy + 104, gy + 184]
    gh = rows[2] + th + 14 - gy
    out.append(f'<rect class="group" x="{gx}" y="{gy}" width="{cols[1] + tw + 3 - gx}" height="{gh}" rx="10"/>'
               f'<text class="gt" x="{gx + 10}" y="{gy + 16}">After 9</text>')
    for n, c, ny in ((27, 1, rows[0]), (28, 1, rows[1]), (29, 0, rows[1]), (30, 1, rows[2])):
        bodies.append(node(n, cols[c], ny))
    out.append(edge(cx(1), rows[0] + th, cx(1), rows[1]))
    out.append(edge(cx(1), rows[1] + th, cx(1), rows[2]))
    out.append(edge(cx(1), rows[0] + th, cx(0), rows[1]))
    out.append(edge(cx(1), y9 + th, cx(1), gy))
    bottom = max(bottom1, gy + gh)
    for a, b in edges:
        (ax, ay), (bx, by) = at(*place[a]), at(*place[b])
        out.append(edge(ax + tw / 2, ay + th, bx + tw / 2, by))
    for n, (r, c) in place.items():
        out.append(node(n, *at(r, c)))
    out.extend(bodies)
    y = bottom + 22
    band_h = 32 + 2 * th + 12 + 14  # label, two rows, gap, bottom padding
    out.append(f'<rect class="band" x="6" y="{y}" width="{W - 12}" height="{band_h}" rx="10"/>'
               f'<text class="lang" x="{X0}" y="{y + 20}">SEPARATE WORK</text>')
    r0 = y + 32
    out.append(node(18, cols[0], r0))
    out.append(f'<line class="edge" x1="{cols[0] + tw + 1}" y1="{r0 + th / 2}" x2="{cols[1] - 2}" y2="{r0 + th / 2}" marker-end="url(#ah)"/>')
    out.append(node(19, cols[1], r0))
    out.append(node(20, cols[2], r0))
    out.append(node(17, cols[0], r0 + th + 12))
    return svg("".join(out), y + band_h + 8, "The task graph, with status and what must come first")


def resolvers():
    rows = [("markdown-vault", "own shortest-path rule", "dev"),
            ("vault-graph-core", "port of the Rust LinkIndex", "dev"),
            ("markdown-astro", "first match; embeds by name", "dev"),
            ("corpus-schema", "own walk and link check", "md"),
            ("markdown-store", "own [[id]] wikilink code", "ont")]
    out = [f'<text class="rl" x="{X0}" y="26">Who decides what a link points to</text>']
    y = 44
    for n, s, r in rows:
        out.append(chip(X0, y, n, s, r, w=250))
        out.append(f'<line class="dup" x1="{X0 + 252}" y1="{y + 23}" x2="300" y2="{y + 23}"/>')
        y += 58
    mid = 44 + (len(rows) * 58 - 12) / 2
    out.append(f'<line class="dup" x1="300" y1="67" x2="300" y2="{44 + (len(rows) - 1) * 58 + 23}"/>')
    out.append(f'<g class="fb"><rect x="308" y="{mid - 34}" width="118" height="68" rx="10"/>'
               f'<text x="367" y="{mid - 12}" text-anchor="middle">5 rules for</text>'
               f'<text x="367" y="{mid + 6}" text-anchor="middle">one question</text>'
               f'<text x="367" y="{mid + 24}" text-anchor="middle">F1 F2 F7 F8</text></g>')
    return svg("".join(out), y + 4, "Five places resolve links")


def levels_profiles():
    out = [f'<text class="rl" x="{X0}" y="26">Levels and profiles: two separate axes</text>',
           f'<text class="rs" x="{X0}" y="44">Levels: how much a corpus declares. Profiles: whose types it uses.</text>']
    lv = [("2 · Typed", "every type has a JSON Schema"),
          ("1 · Records", "a root file, type folders, ids"),
          ("0 · Linked notes", "declares nothing; any vault")]
    y = 62
    for t, s in lv:
        out.append(f'<g class="lvl"><rect x="{X0}" y="{y}" width="230" height="50" rx="8"/></g>'
                   f'<text class="cn" x="{X0 + 12}" y="{y + 21}">{esc(t)}</text>'
                   f'<text class="cs" x="{X0 + 12}" y="{y + 38}">{esc(s)}</text>')
        y += 60
    py = 62
    for t, s in [("claims profile", "statements, study results"), ("sdlc profile", "today's sdlc kinds"),
                 ("your profile", "any shared set of types")]:
        out.append(f'<g class="prof"><rect x="276" y="{py}" width="150" height="50" rx="8"/></g>'
                   f'<text class="cn" x="288" y="{py + 21}">{esc(t)}</text>'
                   f'<text class="cs" x="288" y="{py + 38}">{esc(s)}</text>')
        out.append(f'<path class="tie" d="M276,{py + 25} C262,{py + 25} 262,87 {X0 + 231},87"/>')
        py += 60
    out.append(f'<text class="cs" x="{X0}" y="{y + 10}">A corpus can use several profiles, next to its own types.</text>')
    return svg("".join(out), y + 22, "Levels 0 to 2, and profiles that supply level-2 types")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        "tasks.svg": task_graph(),
        "present.svg": layers(PRESENT, "Present state by layer", TARGET_KEY),
        "resolvers.svg": resolvers(),
        "levels-profiles.svg": levels_profiles(),
        "target.svg": layers(TARGET, "Target state by layer", TARGET_KEY),
    }
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8")
        print(OUT / name)


if __name__ == "__main__":
    main()
