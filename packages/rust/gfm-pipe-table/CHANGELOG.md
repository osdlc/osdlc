# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-11-01

In step with `@osdlc/gfm-table` 0.5.0.

### Added

- Edit delimited files without rewriting them. Each `DelimitedRecord` now
  carries `spans` (a `DelimitedFieldSpan` per field: its byte `from` and
  `to`, and whether it was quoted) and its own `from`, `to` and `end`
  offsets. `DelimitedParse` and `DelimitedRead` also carry `line_ending` (a
  `DelimitedLineEnding`) and `bom`, and `DelimitedRead` carries
  `header_record`.
- `set_delimited_field`, `insert_delimited_row`, `delete_delimited_row`,
  `insert_delimited_column` and `delete_delimited_column` return byte
  changes (`TextChange`) that touch only what the edit must. The file keeps
  its delimiter, line endings, byte order mark and the quoting of every
  other field. A changed field is quoted only when its value needs it or it
  was quoted before. Setting a field past the end of a short row fills the
  row out. No edit leaves a line that reads as blank: a record left with one
  empty field is written `""`. `apply_delimited_changes` applies changes,
  refusing overlapping ones with `OverlappingChanges`, and `reread_delimited`
  reads the result with the same delimiter and header decision;
  `quote_delimited_field` and `delimited_record_text` write fields and
  lines. All are experimental.
- Parity fixture sections for the spans and for each new function.

### Changed

- **Breaking:** a line holding only `""` now reads as a record of one empty
  field; before, it was skipped like a blank line. Only an empty line is
  skipped now.
- **Breaking:** `DelimitedRecord`, `DelimitedParse` and `DelimitedRead`
  have new fields, so code that builds or destructures one by hand must add
  them.
- **Breaking:** `PipeFix` is renamed `TextChange`, with no alias;
  `literal_pipe_fixes` returns `Vec<TextChange>`.

## [0.4.0] - 2026-10-27

### Added

- The first release: the Rust twin of `@osdlc/gfm-table` 0.4.0, at the same
  major and minor version. GFM pipe tables as strings and byte offsets, with
  no dependencies: rows (`split_row`, `row_pipes`, `row_from_pipes`,
  `is_delimiter_row`, `parse_align`), whole tables (`read_table`,
  `row_cell_texts`, `row_cell_sources`, `render_table`, `table_grid`),
  padding (`pad_table`, `display_width`), cell text (`cell_text_from_source`,
  `source_offset`, `text_offset`, `escape_cell`, `escape_cell_insert`,
  `escape_code_cell`, `literal_pipe_fixes`, `ends_with_escape`), edits
  (`row_line_text`, `insert_cell_splice`, `delete_cell_splice`,
  `pad_row_splice`, `table_lines`, `has_trailing_pipe`), grids and clipboard
  formats (`grid_from_tsv`, `tsv_from_grid`, `grid_from_csv`,
  `grid_from_csv_paste`, `to_csv`, `html_from_grid`, `CELL_SOURCE_ATTR`,
  `paste_rect`, `rectangular`, `pad_row`, `clipboard_lines`) and delimited
  files (`read_delimited`, `parse_delimited`, `sniff_delimiter`,
  `looks_like_header`).
- `tests/fixtures/parity.json`, the fixture both twins run.
