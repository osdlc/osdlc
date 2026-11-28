#![doc = include_str!("../README.md")]
#![forbid(unsafe_code)]

mod error;
mod junit;
mod lcov;
mod lines;
mod model;
mod path;
mod sarif;

pub use error::Error;
pub use lcov::{FileCoverage, LcovReport, Totals, read_lcov};
pub use model::{Fact, Facts, Finding, Format, Level, Options, Report};

/// Reads `input` in `format`, using `options` where the format honours them.
///
/// `options.pattern` and `options.levels` apply to [`Format::Lines`] only;
/// `options.paths_from` applies to every format that yields finding paths.
///
/// # Errors
///
/// Returns the [`Error`] variant of `format` when the input is malformed, or
/// [`Error::Lines`] when the `lines` pattern is unusable.
pub fn read(format: Format, input: &str, options: &Options) -> Result<Report, Error> {
    match format {
        Format::Lines => lines::read_lines(input, options),
        Format::Sarif => sarif::read_sarif(input, options),
        Format::Junit => junit::read_junit(input, options),
        Format::Lcov => read_lcov(input).map(|coverage| coverage.to_report()),
    }
}

/// Like [`read`] for raw bytes, such as a tool's captured stdout.
///
/// # Errors
///
/// Returns [`Error::Utf8`] when `input` is not UTF-8, otherwise as [`read`].
pub fn read_bytes(format: Format, input: &[u8], options: &Options) -> Result<Report, Error> {
    read(format, std::str::from_utf8(input)?, options)
}
