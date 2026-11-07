//! Which `Origin` values a local page legitimately presents.

/// A desktop webview's own origin: `tauri://localhost` (macOS) or
/// `http(s)://tauri.localhost` (Windows, Linux), in any letter case. No page a
/// browser loads from the network can present it.
pub(crate) fn is_webview_origin(origin: &str) -> bool {
    WEBVIEW_ORIGINS
        .iter()
        .any(|o| o.eq_ignore_ascii_case(origin))
}

const WEBVIEW_ORIGINS: [&str; 3] = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
];

/// True for origins a local browser or the Tauri webview presents:
/// `http(s)://localhost`, `127.0.0.1` and `[::1]` (any port), and the
/// `tauri://` and `http(s)://tauri.localhost` webview origins. A lookalike such
/// as `localhost.evil.com` is not local.
pub fn is_local_origin(origin: &str) -> bool {
    let Some((scheme, rest)) = origin.split_once("://") else {
        return false;
    };
    if !matches!(scheme, "http" | "https" | "tauri") {
        return false;
    }
    is_local_authority(rest.split('/').next().unwrap_or(""))
}

/// True when `authority` (a `Host` header value, or the authority of an
/// origin) names this machine: `localhost`, `127.0.0.1`, `[::1]` or
/// `tauri.localhost`, with any port, in any letter case. Userinfo (`@`) is
/// refused, and so is a lookalike such as `localhost.evil.com` or
/// `localhost:3000.evil.com`.
pub fn is_local_authority(authority: &str) -> bool {
    let authority = authority.to_ascii_lowercase();
    // Split off the port. A bracketed IPv6 host may be followed only by
    // nothing or by `:port`.
    let (host, port) = match authority.strip_prefix('[') {
        Some(v6) => match v6.split_once(']') {
            Some((inner, after)) if after.is_empty() || after.starts_with(':') => {
                (inner, after.strip_prefix(':'))
            }
            _ => return false,
        },
        None => match authority.split_once(':') {
            Some((host, port)) => (host, Some(port)),
            None => (authority.as_str(), None),
        },
    };
    // A port, when written, is 1 to 5 digits and nothing else, so
    // `localhost:3000.evil.com` is not local.
    let port_ok =
        port.is_none_or(|p| !p.is_empty() && p.len() <= 5 && p.bytes().all(|b| b.is_ascii_digit()));
    port_ok && matches!(host, "localhost" | "127.0.0.1" | "tauri.localhost" | "::1")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_origins_pass_and_remote_or_lookalike_origins_do_not() {
        for ok in [
            "http://localhost:3000",
            "http://localhost",
            "https://localhost:1420",
            "http://127.0.0.1:16175",
            "http://[::1]:3000",
            "tauri://localhost",
            "http://tauri.localhost",
        ] {
            assert!(is_local_origin(ok), "{ok} should be allowed");
        }
        for bad in [
            "http://localhost.evil.com",
            "http://localhost:3000.evil.com",
            "http://[::1].evil.com",
            "http://127.0.0.1.evil.com",
            "https://example.com",
            "http://192.168.1.5:3000",
            "ftp://localhost",
            "localhost:3000",
            "",
        ] {
            assert!(!is_local_origin(bad), "{bad} must be rejected");
        }
    }

    #[test]
    fn local_authorities_pass_and_userinfo_or_lookalikes_do_not() {
        for ok in [
            "localhost",
            "localhost:1",
            "127.0.0.1:80",
            "[::1]",
            "[::1]:3000",
            "LOCALHOST:3000",
        ] {
            assert!(is_local_authority(ok), "{ok} should be allowed");
        }
        for bad in [
            "localhost.evil.com",
            "localhost:3000.evil.com",
            "127.0.0.1:x.evil.com",
            "localhost:",
            "localhost:123456",
            "[::1].evil.com",
            "[::1]evil.com:80",
            "localhost:x@evil.com",
            "[::2]",
            "[::1",
            "",
        ] {
            assert!(!is_local_authority(bad), "{bad} must be rejected");
        }
    }
}
