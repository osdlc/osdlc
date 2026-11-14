use std::net::IpAddr;

use serde::Serialize;

/// One address on one network interface.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub struct InterfaceAddr {
    /// The interface name, such as `eth0` or `en0`.
    pub name: String,
    /// One address on it.
    pub ip: IpAddr,
    /// Whether this is a loopback interface.
    pub is_loopback: bool,
}

/// The host's interface addresses, sorted by name then address so the order
/// is stable. An enumeration failure yields an empty list.
pub fn interfaces() -> Vec<InterfaceAddr> {
    let mut out: Vec<InterfaceAddr> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .map(|i| InterfaceAddr {
            name: i.name.clone(),
            ip: i.ip(),
            is_loopback: i.is_loopback(),
        })
        .collect();
    out.sort_by(|a, b| (&a.name, a.ip).cmp(&(&b.name, b.ip)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_a_loopback_address() {
        assert!(
            interfaces()
                .iter()
                .any(|i| i.is_loopback && i.ip.is_loopback())
        );
    }
}
