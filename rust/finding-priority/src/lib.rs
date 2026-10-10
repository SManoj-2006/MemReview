use std::fmt;
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
    Nit,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseSeverityError(String);

impl fmt::Display for ParseSeverityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "unknown severity {:?}; expected critical, high, medium, low, or nit",
            self.0
        )
    }
}

impl std::error::Error for ParseSeverityError {}

impl FromStr for Severity {
    type Err = ParseSeverityError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "critical" => Ok(Self::Critical),
            "high" => Ok(Self::High),
            "medium" => Ok(Self::Medium),
            "low" => Ok(Self::Low),
            "nit" => Ok(Self::Nit),
            _ => Err(ParseSeverityError(value.to_owned())),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    pub id: String,
    pub severity: Severity,
    pub message: String,
}

pub fn prioritize(findings: &mut [Finding]) {
    findings.sort_by_key(|finding| finding.severity);
}

#[cfg(test)]
mod tests {
    use super::{prioritize, Finding, Severity};
    use std::str::FromStr;

    fn finding(id: &str, severity: Severity) -> Finding {
        Finding {
            id: id.to_owned(),
            severity,
            message: format!("{id} finding"),
        }
    }

    #[test]
    fn parses_supported_severities_case_insensitively() {
        assert_eq!(Severity::from_str(" Critical ").unwrap(), Severity::Critical);
        assert_eq!(Severity::from_str("HIGH").unwrap(), Severity::High);
        assert_eq!(Severity::from_str("medium").unwrap(), Severity::Medium);
        assert_eq!(Severity::from_str("low").unwrap(), Severity::Low);
        assert_eq!(Severity::from_str("nit").unwrap(), Severity::Nit);
    }

    #[test]
    fn rejects_unknown_severities() {
        let error = Severity::from_str("urgent").unwrap_err();
        assert!(error.to_string().contains("unknown severity"));
    }

    #[test]
    fn sorts_critical_findings_first_and_preserves_ties() {
        let mut findings = vec![
            finding("nit-1", Severity::Nit),
            finding("high-1", Severity::High),
            finding("critical-1", Severity::Critical),
            finding("high-2", Severity::High),
            finding("low-1", Severity::Low),
            finding("medium-1", Severity::Medium),
        ];

        prioritize(&mut findings);

        let ids: Vec<_> = findings.iter().map(|finding| finding.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "critical-1",
                "high-1",
                "high-2",
                "medium-1",
                "low-1",
                "nit-1",
            ]
        );
    }

    #[test]
    fn prioritizing_empty_findings_is_safe() {
        prioritize(&mut []);
    }
}
