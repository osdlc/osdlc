//! Read, write, pad and edit a GFM pipe table, then copy it as TSV and CSV.
//!
//! Run with `cargo run -p gfm-pipe-table --example table`.

use gfm_pipe_table::{
    PadTableOptions, RenderTableOptions, TableInput, grid_from_csv, insert_cell_splice, pad_table,
    read_table, render_table, row_cell_texts, split_row, to_csv, tsv_from_grid,
};

fn main() {
    // An escaped pipe stays inside its cell.
    println!("{:?}", row_cell_texts("| a \\| b | c |"));

    // Write a table: every cell is escaped.
    let input = TableInput {
        header: vec!["Name".into(), "Value".into()],
        align: vec![],
        rows: vec![
            vec!["a|b".into(), "1".into()],
            vec!["名前".into(), "22".into()],
        ],
    };
    let markdown = render_table(&input, &RenderTableOptions::default());
    println!("{markdown}\n");

    // Line up its pipes. Wide characters take two columns.
    println!("{}\n", pad_table(&markdown, &PadTableOptions::default()));

    // Read it back, and copy the body as TSV and CSV.
    let lines: Vec<&str> = markdown.lines().collect();
    let table = read_table(&lines).expect("a table");
    let body: Vec<Vec<String>> = table
        .rows
        .iter()
        .map(|row| row.iter().map(|cell| cell.text.clone()).collect())
        .collect();
    println!("{}", tsv_from_grid(&body));
    let csv = to_csv(&body);
    assert_eq!(grid_from_csv(&csv), Some(body));

    // Insert an empty first column into one row, touching only its own bytes.
    let row = "| a | b |";
    let splice = insert_cell_splice(row, &split_row(row, 0), 0, "");
    if let Some(change) = splice.change {
        println!(
            "{}{}{}",
            &row[..change.from],
            change.insert,
            &row[change.to..]
        );
    }
}
