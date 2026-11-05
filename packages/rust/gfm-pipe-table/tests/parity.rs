//! The shared conformance fixture, `tests/fixtures/parity.json`.
//!
//! This file is the contract between this crate and the TypeScript package in
//! `packages/ts/gfm-table`, which reads it in place: same input, same result.
//! A case added on either side goes in the fixture, never in one package's
//! own suite. Every section is read here, and an unknown section fails the
//! run, as does a case key its section's `_inputs` entry does not list.
//!
//! Each runner below takes a case's inputs and builds the JSON value the
//! case's `expected` holds. Offsets in the fixture are UTF-8 byte offsets,
//! this crate's own; the TypeScript runner converts its UTF-16 indices to
//! them. A refusal is `{"error": kind}`: `invalid_max_column_width` from
//! `pad_table`, which this crate's types cannot hold, and
//! `overlapping_changes` from `apply_delimited_changes`.
//!
//! Compiled in with `include_str!` rather than read at run time, so the test
//! binary carries the fixture and a moved or deleted fixture is a build error.

use std::num::NonZeroUsize;

use gfm_pipe_table::*;
use serde_json::{Map, Value, json};

const FIXTURE: &str = include_str!("fixtures/parity.json");

fn s(v: &Value) -> &str {
    v.as_str().expect("a string")
}

fn n(v: &Value) -> usize {
    v.as_u64().expect("a number") as usize
}

fn b(v: &Value) -> bool {
    v.as_bool().expect("a boolean")
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .expect("an array")
        .iter()
        .map(|x| s(x).to_owned())
        .collect()
}

fn grid(v: &Value) -> Vec<Vec<String>> {
    v.as_array()
        .expect("an array")
        .iter()
        .map(strings)
        .collect()
}

fn align(v: &str) -> ColumnAlign {
    match v {
        "none" => ColumnAlign::None,
        "left" => ColumnAlign::Left,
        "center" => ColumnAlign::Center,
        "right" => ColumnAlign::Right,
        other => panic!("unknown alignment {other}"),
    }
}

fn one_char(v: &Value) -> char {
    let mut chars = s(v).chars();
    let (Some(c), None) = (chars.next(), chars.next()) else {
        panic!("a delimiter is one character, not {v}");
    };
    c
}

fn delimiter(v: &Value) -> Delimiter {
    Delimiter::from_char(one_char(v)).expect("one of DELIMITERS")
}

fn span(row: &TableRowSpan) -> Value {
    json!({
        "from": row.from,
        "to": row.to,
        "pipes": row.pipes,
        "cells": row.cells.iter().map(|c| json!({
            "from": c.from,
            "to": c.to,
            "content": [c.content.start, c.content.end],
        })).collect::<Vec<_>>(),
    })
}

fn splice(sp: &LineSplice) -> Value {
    json!({
        "change": sp.change.as_ref().map(|c| json!({"from": c.from, "to": c.to, "insert": c.insert})),
        "anchor": sp.anchor,
        "offset": sp.offset,
    })
}

fn table_cells(cells: &[TableCell]) -> Value {
    cells
        .iter()
        .map(|c| json!({"raw": c.raw, "text": c.text}))
        .collect()
}

fn aligns(a: &[ColumnAlign]) -> Value {
    a.iter().map(|a| a.as_str()).collect()
}

fn record(r: &DelimitedRecord) -> Value {
    json!({
        "fields": r.fields,
        "spans": r.spans.iter().map(|s| json!({"from": s.from, "to": s.to, "quoted": s.quoted})).collect::<Vec<_>>(),
        "line": r.line,
        "from": r.from,
        "to": r.to,
        "end": r.end,
        "issue": r.issue,
    })
}

fn read_json(read: &DelimitedRead) -> Value {
    json!({
        "delimiter": read.delimiter.as_char().to_string(),
        "header": read.header,
        "header_record": read.header_record.as_ref().map(record),
        "rows": read.rows.iter().map(record).collect::<Vec<_>>(),
        "width": read.width,
        "issues": issues(&read.issues),
        "line_ending": read.line_ending.as_str(),
        "bom": read.bom,
    })
}

/// The case's `text` read with its `delimiter` and `header` options.
fn read_case(c: &Value) -> DelimitedRead {
    let mut options = ReadDelimitedOptions::new();
    if let Some(d) = c.get("delimiter") {
        options = options.with_delimiter(delimiter(d));
    }
    if let Some(h) = c.get("header") {
        options = options.with_header(b(h));
    }
    read_delimited(s(&c["text"]), &options)
}

fn change_json(ch: &TextChange) -> Value {
    json!({"from": ch.from, "to": ch.to, "insert": ch.insert})
}

/// Changes to `text`, and the text they make.
fn changes_json(text: &str, changes: &[TextChange]) -> Value {
    json!({
        "changes": changes.iter().map(change_json).collect::<Vec<_>>(),
        "text": apply_delimited_changes(text, changes).expect("changes that do not overlap"),
    })
}

/// One change, or none, and the text it makes.
fn one_change_json(text: &str, ch: Option<TextChange>) -> Value {
    let applied = match &ch {
        Some(ch) => apply_delimited_changes(text, std::slice::from_ref(ch)).expect("one change"),
        None => text.to_owned(),
    };
    json!({"change": ch.as_ref().map(change_json), "text": applied})
}

fn issues(i: &[DelimitedIssue]) -> Value {
    i.iter()
        .map(|i| json!({"line": i.line, "message": i.message}))
        .collect()
}

fn rect(r: &CellRect) -> Value {
    json!({"top": r.top, "left": r.left, "bottom": r.bottom, "right": r.right})
}

fn cell_rect(v: &Value) -> CellRect {
    CellRect {
        top: n(&v["top"]),
        left: n(&v["left"]),
        bottom: n(&v["bottom"]),
        right: n(&v["right"]),
    }
}

/// The `maxColumnWidth` a case gives, or the refusal the TypeScript twin
/// throws for it: here a value that is not a positive integer cannot be
/// built at all.
fn max_column_width(v: &Value) -> Result<Option<NonZeroUsize>, Value> {
    if v.is_null() {
        return Ok(None);
    }
    v.as_u64()
        .and_then(|n| NonZeroUsize::new(n as usize))
        .map(Some)
        .ok_or_else(|| json!({"error": "invalid_max_column_width"}))
}

fn run(section: &str, c: &Value) -> Value {
    match section {
        "split_row" => span(&split_row(s(&c["line"]), n(&c["base"]))),
        "row_from_pipes" => {
            let pipes: Vec<usize> = c["pipes"].as_array().unwrap().iter().map(n).collect();
            span(&row_from_pipes(s(&c["line"]), n(&c["base"]), &pipes))
        }
        "row_pipes" => json!(row_pipes(s(&c["line"]), n(&c["base"]))),
        "is_delimiter_row" => json!(is_delimiter_row(s(&c["line"]))),
        "parse_align" => json!(parse_align(s(&c["spec"])).as_str()),

        "cell_text" => {
            let source = s(&c["source"]);
            let cell = cell_text_from_source(source);
            if source.is_ascii() {
                json!({"text": cell.text, "offsets": cell.offsets})
            } else {
                json!({"text": cell.text})
            }
        }
        "source_offset" => json!(source_offset(
            &cell_text_from_source(s(&c["source"])),
            n(&c["pos"])
        )),
        "text_offset" => json!(text_offset(
            &cell_text_from_source(s(&c["source"])),
            n(&c["offset"])
        )),
        "escape_cell" => json!(escape_cell(s(&c["text"]))),
        "escape_cell_insert" => json!(escape_cell_insert(s(&c["text"]))),
        "escape_code_cell" => json!(escape_code_cell(s(&c["text"]))),
        "ends_with_escape" => json!(ends_with_escape(s(&c["source"]))),
        "literal_pipe_fixes" => {
            let inserted: Vec<_> = c["inserted"]
                .as_array()
                .unwrap()
                .iter()
                .map(|r| n(&r[0])..n(&r[1]))
                .collect();
            literal_pipe_fixes(s(&c["text"]), &inserted)
                .iter()
                .map(|f| json!({"from": f.from, "to": f.to, "insert": f.insert}))
                .collect()
        }

        "row_cell_texts" => json!(row_cell_texts(s(&c["line"]))),
        "row_cell_sources" => json!(row_cell_sources(s(&c["line"]))),
        "read_table" => match read_table(&strings(&c["lines"])) {
            None => Value::Null,
            Some(t) => json!({
                "header": table_cells(&t.header),
                "align": aligns(&t.align),
                "rows": t.rows.iter().map(|r| table_cells(r)).collect::<Vec<_>>(),
            }),
        },
        "render_table" => {
            let input = TableInput {
                header: strings(&c["header"]),
                align: c
                    .get("align")
                    .map(|a| {
                        a.as_array()
                            .expect("an array")
                            .iter()
                            .map(|x| align(s(x)))
                            .collect()
                    })
                    .unwrap_or_default(),
                rows: grid(&c["rows"]),
            };
            let options = match c.get("line_break") {
                Some(line_break) => RenderTableOptions::new().with_line_break(s(line_break)),
                None => RenderTableOptions::new(),
            };
            json!(render_table(&input, &options))
        }
        "table_grid" => match table_grid(&strings(&c["lines"])) {
            None => Value::Null,
            Some(g) => json!({
                "header": g.header,
                "align": aligns(&g.align),
                "rows": g.rows,
                "issues": g.issues.iter().map(|i| json!({"line": i.line, "row": i.row, "message": i.message})).collect::<Vec<_>>(),
            }),
        },
        "pad_table" => match max_column_width(&c["max_column_width"]) {
            Err(refusal) => refusal,
            Ok(max_column_width) => {
                let mut options = PadTableOptions::new();
                options.max_column_width = max_column_width;
                json!(pad_table(s(&c["table"]), &options))
            }
        },
        "display_width" => json!(display_width(s(&c["text"]))),

        "row_line_text" => {
            let line = row_line_text(&strings(&c["cells"]));
            json!({"text": line.text, "offsets": line.offsets})
        }
        "insert_cell_splice" => {
            let line = s(&c["line"]);
            let row = split_row(line, n(&c["base"]));
            splice(&insert_cell_splice(
                line,
                &row,
                n(&c["at"]),
                s(&c["filler"]),
            ))
        }
        "delete_cell_splice" => splice(&delete_cell_splice(
            &split_row(s(&c["line"]), n(&c["base"])),
            n(&c["col"]),
        )),
        "pad_row_splice" => {
            let line = s(&c["line"]);
            let row = split_row(line, n(&c["base"]));
            match pad_row_splice(line, &row, n(&c["width"]), s(&c["filler"])) {
                None => Value::Null,
                Some(p) => json!({"from": p.from, "insert": p.insert, "contents": p.contents}),
            }
        }
        "has_trailing_pipe" => json!(has_trailing_pipe(&split_row(s(&c["line"]), 0))),
        "table_lines" => {
            let spans: Vec<TableRowSpan> = strings(&c["lines"])
                .iter()
                .map(|l| split_row(l, 0))
                .collect();
            let rows: Vec<TableRowSpan> = spans
                .iter()
                .enumerate()
                .filter(|(i, _)| *i != 1)
                .map(|(_, r)| r.clone())
                .collect();
            let delimiter = b(&c["delimiter"]).then(|| &spans[1]);
            // Lines are named by their index: which input span each one is.
            let index = |sp: &TableRowSpan| {
                if delimiter.is_some_and(|d| std::ptr::eq(d, sp)) {
                    return 1;
                }
                let i = rows.iter().position(|r| std::ptr::eq(r, sp)).unwrap();
                if i == 0 { 0 } else { i + 1 }
            };
            table_lines(&rows, delimiter)
                .iter()
                .map(|l| json!({"line": index(l.span), "filler": l.filler}))
                .collect()
        }

        "rectangular" => json!(rectangular(&grid(&c["rows"]))),
        "pad_row" => json!(pad_row(&strings(&c["cells"]), n(&c["width"]))),
        "clipboard_lines" => json!(clipboard_lines(s(&c["text"]))),
        "grid_from_tsv" => json!(grid_from_tsv(s(&c["text"]))),
        "tsv_from_grid" => json!(tsv_from_grid(&grid(&c["grid"]))),
        "to_csv" => json!(to_csv(&grid(&c["rows"]))),
        "grid_from_csv" => json!(grid_from_csv(s(&c["text"]))),
        "grid_from_csv_paste" => json!(grid_from_csv_paste(s(&c["text"]))),
        "html_from_grid" => json!(html_from_grid(
            &grid(&c["shown"]),
            &grid(&c["source"]),
            b(&c["header"])
        )),
        "paste_rect" => {
            let g = grid(&c["grid"]);
            let range = c.get("range").map(cell_rect);
            match paste_rect(&g, n(&c["start"][0]), n(&c["start"][1]), range) {
                None => Value::Null,
                Some(p) => json!({
                    "rect": rect(&p.rect),
                    "values": c["probes"].as_array().unwrap().iter()
                        .map(|pr| p.value(n(&pr[0]), n(&pr[1])))
                        .collect::<Vec<_>>(),
                }),
            }
        }
        "round_trip" => {
            let g = grid(&c["grid"]);
            match s(&c["format"]) {
                "tsv" => json!(grid_from_tsv(&tsv_from_grid(&g))),
                "csv" => json!(grid_from_csv(&to_csv(&g))),
                other => panic!("unknown format {other}"),
            }
        }

        "sniff_delimiter" => json!(sniff_delimiter(s(&c["text"])).as_char().to_string()),
        "delimiter_name" => json!(delimiter(&c["delimiter"]).name()),
        "parse_delimited" => {
            let parsed = parse_delimited(s(&c["text"]), one_char(&c["delimiter"]));
            json!({
                "records": parsed.records.iter().map(record).collect::<Vec<_>>(),
                "issues": issues(&parsed.issues),
                "line_ending": parsed.line_ending.as_str(),
                "bom": parsed.bom,
            })
        }
        "looks_like_header" => {
            let first = if c["first"].is_null() {
                Vec::new()
            } else {
                strings(&c["first"])
            };
            json!(looks_like_header(&first))
        }
        "read_delimited" => read_json(&read_case(c)),

        "quote_delimited_field" => json!(quote_delimited_field(
            s(&c["value"]),
            one_char(&c["delimiter"]),
            c.get("always_quote").is_some_and(b),
        )),
        "delimited_record_text" => json!(delimited_record_text(
            &strings(&c["fields"]),
            one_char(&c["delimiter"])
        )),
        "reread_delimited" => read_json(&reread_delimited(s(&c["next"]), &read_case(c))),
        "set_delimited_field" => {
            let read = read_case(c);
            // `record` counts the header, when there is one, as record 0.
            let records: Vec<&DelimitedRecord> =
                read.header_record.iter().chain(&read.rows).collect();
            let change = set_delimited_field(
                &read,
                records[n(&c["record"])],
                n(&c["column"]),
                s(&c["value"]),
            );
            one_change_json(s(&c["text"]), Some(change))
        }
        "insert_delimited_row" => {
            let change = insert_delimited_row(&read_case(c), n(&c["at"]), &strings(&c["fields"]));
            one_change_json(s(&c["text"]), Some(change))
        }
        "delete_delimited_row" => one_change_json(
            s(&c["text"]),
            delete_delimited_row(&read_case(c), n(&c["index"])),
        ),
        "insert_delimited_column" => {
            let header = c.get("header_text").map_or("", s);
            changes_json(
                s(&c["text"]),
                &insert_delimited_column(&read_case(c), n(&c["at"]), header),
            )
        }
        "delete_delimited_column" => changes_json(
            s(&c["text"]),
            &delete_delimited_column(&read_case(c), n(&c["column"])),
        ),
        "apply_delimited_changes" => {
            let changes: Vec<TextChange> = c["changes"]
                .as_array()
                .expect("an array")
                .iter()
                .map(|ch| TextChange {
                    from: n(&ch["from"]),
                    to: n(&ch["to"]),
                    insert: s(&ch["insert"]).to_owned(),
                })
                .collect();
            match apply_delimited_changes(s(&c["text"]), &changes) {
                Ok(text) => json!(text),
                Err(OverlappingChanges { .. }) => json!({"error": "overlapping_changes"}),
            }
        }
        other => panic!("unknown section {other}: add a runner for it"),
    }
}

/// Every section `run` has an arm for. The fixture's sections and its
/// `_inputs` must be exactly these.
const SECTIONS: &[&str] = &[
    "split_row",
    "row_from_pipes",
    "row_pipes",
    "is_delimiter_row",
    "parse_align",
    "cell_text",
    "source_offset",
    "text_offset",
    "escape_cell",
    "escape_cell_insert",
    "escape_code_cell",
    "ends_with_escape",
    "literal_pipe_fixes",
    "row_cell_texts",
    "row_cell_sources",
    "read_table",
    "table_grid",
    "render_table",
    "pad_table",
    "display_width",
    "row_line_text",
    "insert_cell_splice",
    "delete_cell_splice",
    "pad_row_splice",
    "has_trailing_pipe",
    "table_lines",
    "rectangular",
    "pad_row",
    "clipboard_lines",
    "grid_from_tsv",
    "tsv_from_grid",
    "to_csv",
    "grid_from_csv",
    "grid_from_csv_paste",
    "html_from_grid",
    "paste_rect",
    "round_trip",
    "sniff_delimiter",
    "delimiter_name",
    "parse_delimited",
    "looks_like_header",
    "read_delimited",
    "quote_delimited_field",
    "delimited_record_text",
    "set_delimited_field",
    "insert_delimited_row",
    "delete_delimited_row",
    "insert_delimited_column",
    "delete_delimited_column",
    "reread_delimited",
    "apply_delimited_changes",
];

#[test]
fn every_case_matches() {
    let fixture: Map<String, Value> = serde_json::from_str(FIXTURE).expect("parity.json parses");
    let inputs = fixture["_inputs"]
        .as_object()
        .expect("_inputs is an object");
    let mut names: Vec<&str> = fixture
        .keys()
        .map(String::as_str)
        .filter(|k| !k.starts_with('_'))
        .collect();
    names.sort_unstable();
    let mut known = SECTIONS.to_vec();
    known.sort_unstable();
    assert_eq!(
        names, known,
        "the fixture's sections are not the ones run here"
    );
    let mut listed: Vec<&str> = inputs.keys().map(String::as_str).collect();
    listed.sort_unstable();
    assert_eq!(listed, known, "_inputs does not list exactly the sections");

    let mut failures = Vec::new();
    let mut count = 0;
    for (section, cases) in &fixture {
        if section.starts_with('_') {
            continue;
        }
        let allowed = strings(&inputs[section]);
        for case in cases.as_array().expect("a section is a list of cases") {
            count += 1;
            let keys = case.as_object().expect("a case is an object");
            // Only the section's inputs: a misspelled key would be ignored.
            let unknown: Vec<&String> = keys
                .keys()
                .filter(|k| *k != "name" && *k != "expected" && !allowed.contains(k))
                .collect();
            assert!(
                unknown.is_empty(),
                "{section} / {}: keys {unknown:?} are not in _inputs",
                case["name"]
            );
            let expected = keys
                .get("expected")
                .unwrap_or_else(|| panic!("{section} / {}: no expected", case["name"]));
            let got = run(section, case);
            if &got != expected {
                failures.push(format!(
                    "{section} / {}:\n  expected {expected}\n  got      {got}",
                    case["name"]
                ));
            }
        }
    }
    assert!(count > 300, "the fixture holds {count} cases");
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
