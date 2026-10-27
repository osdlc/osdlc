# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
