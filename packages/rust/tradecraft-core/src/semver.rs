//! Pure semver-bump logic.
//!
//! `tc-version` is a free string — nothing the core reads enforces semver on
//! it — so a bump is offered only for a version this parses as plain
//! `MAJOR.MINOR.PATCH`. A version that does not parse bumps to nothing:
//! guessing at a shape it does not recognise would write a value the author
//! never asked for.

/// The three semver bumps a version-bump caller can ask for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BumpLevel {
    /// Increase the major version.
    Major,
    /// Increase the minor version.
    Minor,
    /// Increase the patch version.
    Patch,
}

/// `"1.2.3"` -> `Some((1, 2, 3))`, or `None` for anything else: a leading
/// `v`, a pre-release/build suffix, a missing or extra component, or
/// whitespace anywhere but around the whole string.
pub fn parse_semver(s: &str) -> Option<(u64, u64, u64)> {
    let s = s.trim();
    let mut parts = s.split('.');
    let major = parts.next()?;
    let minor = parts.next()?;
    let patch = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    Some((
        parse_component(major)?,
        parse_component(minor)?,
        parse_component(patch)?,
    ))
}

/// One dot-separated component: digits only, no sign, no whitespace.
fn parse_component(s: &str) -> Option<u64> {
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    s.parse::<u64>().ok()
}

/// The next version at one semver level, or `None` when `current` is not
/// plain `MAJOR.MINOR.PATCH` — the one shape this bumps without guessing.
pub fn next_version(current: &str, level: BumpLevel) -> Option<String> {
    let (major, minor, patch) = parse_semver(current)?;
    Some(match level {
        BumpLevel::Patch => format!("{major}.{minor}.{}", patch + 1),
        BumpLevel::Minor => format!("{major}.{}.0", minor + 1),
        BumpLevel::Major => format!("{}.0.0", major + 1),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_versions_parse() {
        assert_eq!(parse_semver("1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_semver("0.0.0"), Some((0, 0, 0)));
        assert_eq!(parse_semver(" 1.2.3 "), Some((1, 2, 3)));
    }

    #[test]
    fn invalid_shapes_do_not_parse() {
        assert_eq!(parse_semver("0.3"), None);
        assert_eq!(parse_semver("1.2.3-beta"), None);
        assert_eq!(parse_semver("v1.2.3"), None);
        assert_eq!(parse_semver("1.2.3.4"), None);
        assert_eq!(parse_semver(""), None);
        assert_eq!(parse_semver("1.2.x"), None);
    }

    #[test]
    fn next_version_bumps_each_level() {
        assert_eq!(
            next_version("1.2.3", BumpLevel::Patch),
            Some("1.2.4".to_string())
        );
        assert_eq!(
            next_version("1.2.3", BumpLevel::Minor),
            Some("1.3.0".to_string())
        );
        assert_eq!(
            next_version("1.2.3", BumpLevel::Major),
            Some("2.0.0".to_string())
        );
        assert_eq!(
            next_version("0.0.9", BumpLevel::Patch),
            Some("0.0.10".to_string())
        );
    }

    #[test]
    fn next_version_refuses_an_unparseable_current_version() {
        assert_eq!(next_version("v1.2.3", BumpLevel::Patch), None);
        assert_eq!(next_version("v1.2.3", BumpLevel::Minor), None);
        assert_eq!(next_version("v1.2.3", BumpLevel::Major), None);
    }
}
