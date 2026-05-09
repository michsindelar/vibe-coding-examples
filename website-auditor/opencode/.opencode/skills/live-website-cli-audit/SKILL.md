---
name: live-website-cli-audit
description: Evaluate a live website URL from the command line using safe, non-destructive checks for SEO, security, accessibility, performance, metadata, headers, and rendered-page signals.
compatibility: opencode
metadata:
  workflow: cli-url-audit
  install_scope: project-or-npx
---

## Purpose

Use this skill when the user asks an agent to evaluate, audit, review, inspect, or diagnose a live website by URL.

This skill is CLI-first. It does not require globally installed tools. Prefer built-in system commands when available, and use `npx -y` for npm-based audit tools when needed.

## Safety Rules

- Treat the target as a real production website unless the user says otherwise.
- Do not submit forms, create accounts, log in, purchase, upload files, delete data, change settings, trigger admin actions, or perform state-changing interactions without explicit user approval.
- Do not run aggressive security scans, fuzzing, brute force attempts, exploit attempts, credential stuffing, load tests, directory brute forcing, or vulnerability scanners unless the user explicitly authorizes that scope.
- Stay within the user-provided URL and clearly related same-site resources unless the user expands scope.
- Prefer read-only HTTP methods and passive observation.
- Respect robots.txt for SEO crawlability analysis, but do not treat robots.txt as an authorization boundary for security testing.
- Redact secrets, tokens, cookies, authorization headers, private keys, and personal data from reports.

## Tooling Strategy

Use this order of operations:

1. Normalize and confirm the URL scope if ambiguous.
2. Use lightweight commands first: `curl`, `openssl`, `node`, and `npm` if available.
3. Use `npx -y` for specialized npm tools when useful: `lighthouse`, `pa11y`, and `@axe-core/cli`.
4. Avoid assuming global installs exist.
5. If a command is unavailable or blocked, report the limitation and continue with available checks.

Recommended commands are examples. Adjust flags to the task and environment.

## Baseline URL Checks

Use `curl` to inspect redirects, headers, protocol behavior, and raw HTML:

```bash
curl -I -L https://example.com
curl -L https://example.com
curl -L https://example.com/robots.txt
curl -L https://example.com/sitemap.xml
```

Look for:

- Final resolved URL and redirect chain.
- HTTP status codes and redirect loops.
- Canonical host behavior, such as `www` versus apex and HTTP to HTTPS.
- Response headers relevant to security, caching, indexing, content type, compression, and framing.
- Raw HTML metadata, links, headings, structured data, and robots directives.
- robots.txt and sitemap availability.

## SEO Checks

For SEO-focused audits, inspect:

- `<title>` uniqueness and quality.
- `<meta name="description">` quality.
- `<meta name="robots">` and `X-Robots-Tag` directives.
- `<link rel="canonical">` correctness.
- Open Graph and Twitter/X card metadata.
- Heading hierarchy, especially the visible and semantic `h1`.
- Internal links and crawlable navigation.
- Structured data in JSON-LD or microdata.
- `robots.txt`, sitemap references, and sitemap URL health.
- JavaScript-rendered content risk by comparing raw HTML with audit-tool output.
- Mobile friendliness and Core Web Vitals signals where Lighthouse is available.

Useful command:

```bash
npx -y lighthouse https://example.com --only-categories=seo,performance,best-practices --output=json --quiet --chrome-flags="--headless --no-sandbox"
```

If Lighthouse cannot run, perform a static `curl` and HTML analysis and note that rendered/browser checks were not completed.

## Security Checks

For security-focused audits, inspect only passive, non-destructive signals unless authorized otherwise:

- HTTPS enforcement and redirect behavior.
- TLS certificate validity and protocol assumptions when `openssl` is available.
- Security headers: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Cross-Origin-*` headers.
- Cookie attributes visible in `Set-Cookie`: `Secure`, `HttpOnly`, `SameSite`, `Domain`, `Path`, and expiration.
- Cache headers on pages that may contain sensitive content.
- Mixed-content clues in HTML.
- Exposed API keys, tokens, source maps, stack traces, verbose errors, or public configuration leaks.
- Third-party scripts and supply-chain exposure.
- CORS clues visible from headers, without probing unauthorized origins.

Useful commands:

```bash
curl -I -L https://example.com
openssl s_client -connect example.com:443 -servername example.com </dev/null
```

Do not run tools such as `nuclei`, `nikto`, `wpscan`, `sqlmap`, ZAP active scan, or directory brute-force tools unless the user explicitly authorizes active security testing.

## Accessibility Checks

For accessibility-focused audits, combine automated checks with manual reasoning from HTML and rendered-page signals:

- Semantic landmarks, headings, lists, forms, tables, links, and buttons.
- Accessible names for interactive controls.
- Labeling and error messaging for forms.
- Keyboard navigation risks visible from markup and patterns.
- Skip links and focus management clues.
- ARIA roles, states, properties, and anti-patterns.
- Image `alt` text quality.
- Color contrast and target-size checks when automated tools are available.
- Mobile viewport and zoom/reflow considerations.

Useful commands:

```bash
npx -y pa11y https://example.com
npx -y @axe-core/cli https://example.com
npx -y lighthouse https://example.com --only-categories=accessibility --output=json --quiet --chrome-flags="--headless --no-sandbox"
```

Automated accessibility tools are incomplete. Report likely manual checks separately, especially keyboard behavior, screen reader announcement quality, focus order, dynamic widgets, modals, menus, and custom controls.

## Optional Node-Based HTML Extraction

If useful and Node.js is available, parse raw HTML with a small one-off script or command. Prefer simple extraction over complex generated code.

Extract:

- Title and meta tags.
- Canonical and alternate links.
- Headings.
- Images without `alt`.
- Links without text.
- Forms without labels.
- Script sources.
- JSON-LD blocks.

If package installation is acceptable for the command, `npx -y` can provide parsing tools. Do not add persistent dependencies unless the user asks.

## Reporting Requirements

Every live URL audit should include:

- Target URL and final resolved URL when checked.
- Tools or commands used.
- Findings grouped by severity.
- Evidence from headers, HTML, audit output, or observed behavior.
- Clear recommendations.
- Verification steps.
- Limitations and checks that could not be completed.

When reporting command output, summarize relevant evidence instead of dumping large raw output. Include exact header names, metadata values, status codes, route URLs, or affected elements when useful.

## Failure Handling

If a website blocks CLI tools, requires JavaScript, rate limits requests, needs authentication, or prevents automated browser checks:

- State the limitation clearly.
- Continue with available evidence.
- Explain what a browser-based or authenticated follow-up would add.
- Ask for explicit authorization before using credentials, active scanning, or state-changing workflows.
