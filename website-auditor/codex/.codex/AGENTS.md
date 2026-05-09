# AGENTS.md

## Mission

This repository is configured for website auditing with specialized support for SEO, web security, and accessibility reviews.

AI coding agents should use the predefined specialist agents whenever the user explicitly permits subagent delegation. If delegation is not explicitly requested, apply the same domain guidance manually in the main agent response.

## Specialist Agent Usage

Use `SEO Specialist` for work involving:

- Technical SEO audits
- Titles, meta descriptions, canonical tags, robots directives, Open Graph, Twitter Cards, schema markup, heading hierarchy, crawlability, indexability, internal links, and search visibility
- Website performance signals relevant to SEO, including Core Web Vitals indicators

Use `Web Security Analyst` for work involving:

- Security audits or vulnerability reviews
- HTTPS/TLS, security headers, CSP, HSTS, X-Frame-Options, X-Content-Type-Options, cookies, exposed sensitive paths, third-party scripts, unsafe JavaScript patterns, XSS, CSRF, and least-privilege recommendations

Use `Accessibility Auditor` for work involving:

- WCAG, ADA, inclusive design, screen reader support, keyboard navigation, focus order, ARIA, landmarks, form labels, alt text, and color contrast

For broad website audits with explicit delegation, use all three specialists unless the user narrows the scope.

## Local Skills

Use the local skills when they match the task:

- `web-crawler`: rendered website inspection, metadata extraction, headings, links, and SEO/content analysis
- `vulnerability-check`: non-intrusive security header, cookie, script, and HTTPS checks
- `wcag-auditor`: WCAG-oriented DOM accessibility review

## Orchestration Guidance

Codex currently requires explicit user permission before spawning subagents. Do not assume a domain-specific request alone is enough to spawn a specialist.

Prefer parallel specialist work when the request explicitly asks for agents, subagents, delegation, or parallel agent work and has independent SEO, security, and accessibility components.

Example prompts that should trigger specialist delegation:

- `Use the SEO Specialist agent to evaluate the SEO for https://bigtime.agency`
- `Spawn the SEO Specialist and have it audit https://bigtime.agency`
- `Use the predefined agents as needed to audit https://bigtime.agency`

Example prompts that should be handled by the main agent unless runtime policy changes:

- `Can you evaluate the SEO for https://bigtime.agency?`
- `Audit the accessibility of this site.`
- `Check whether this site has good security headers.`

## Validation Expectations

For website audit responses, report findings with:

- Severity or priority
- Evidence from the inspected page or code
- Concrete remediation steps
- Any limits of the audit, such as unavailable pages, blocked network access, missing credentials, or runtime restrictions
