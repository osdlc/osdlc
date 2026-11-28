/// Why input could not be read. A malformed document gives its format's
/// variant, which says where.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The `lines` options are unusable: the pattern is not a regular
    /// expression, or has no `message` group.
    #[error("lines pattern: {message}")]
    Lines {
        /// What is wrong with the pattern.
        message: String,
    },
    /// The SARIF document is not valid JSON of the expected shape.
    #[error("sarif: line {line}, column {column}: {message}")]
    Sarif {
        /// 1-based line of the failure.
        line: usize,
        /// 1-based column of the failure.
        column: usize,
        /// What the JSON reader reported.
        message: String,
    },
    /// The JUnit document is not well-formed XML, or has no element at all.
    #[error("junit: line {line}, column {column}: {message}")]
    Junit {
        /// 1-based line of the failure.
        line: usize,
        /// 1-based column of the failure.
        column: usize,
        /// What the XML reader reported.
        message: String,
    },
    /// A tracefile record is malformed.
    #[error("lcov: line {line}: {message}")]
    Lcov {
        /// 1-based line of the offending record.
        line: usize,
        /// What is wrong with it.
        message: String,
    },
    /// Raw bytes passed to [`read_bytes`](crate::read_bytes) were not UTF-8.
    #[error("input is not UTF-8: {0}")]
    Utf8(#[from] std::str::Utf8Error),
    /// A name that is not one of [`Format`](crate::Format)'s.
    #[error("unknown format `{0}` (expected lines, sarif, junit or lcov)")]
    UnknownFormat(String),
}
