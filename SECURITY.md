# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

Only the latest release on the current major version line receives security updates.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Please report vulnerabilities privately through [GitHub Security Advisories](https://github.com/jayminwest/canopy/security/advisories).

1. Go to the [Security Advisories page](https://github.com/jayminwest/canopy/security/advisories)
2. Click **"New draft security advisory"**
3. Fill in a description of the vulnerability, including steps to reproduce if possible

### Response Timeline

- **Acknowledgment**: Within 48 hours of your report
- **Initial assessment**: Within 7 days
- **Fix or mitigation**: Within 30 days for confirmed vulnerabilities

We will keep you informed of progress throughout the process.

## Scope

Canopy is a CLI tool that reads and writes files on the local filesystem. The following are considered security issues:

- **Command injection** -- Unsanitized input passed to shell execution
- **Path traversal** -- Accessing files outside the intended `.canopy/` directory
- **Arbitrary file access** -- Reading or writing files the user did not intend
- **Symlink attacks** -- Following symlinks to unintended locations
- **Temp file races** -- TOCTOU vulnerabilities in temporary file handling

The following are generally **not** in scope:

- Denial of service via large input files (Canopy is a local tool, not a service)
- Issues that require the attacker to already have local shell access with the same privileges as the user
- Social engineering or phishing

## Security Measures

Canopy already implements several hardening measures:

- Atomic writes via temp file + rename to prevent partial/corrupt files
- Advisory file locking to prevent concurrent write corruption
- JSONL storage with git-native merge strategies

If you believe any of these measures can be bypassed, please report it through the process above.
