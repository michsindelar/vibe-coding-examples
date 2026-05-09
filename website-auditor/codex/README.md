# Website Auditor Codex Agents

A Codex project configuration for auditing websites with specialist agents for SEO, web security, and accessibility.

This repository is intended to be used as a public, reusable starter for running focused website reviews in Codex. It provides project-scoped custom agents, local skills, MCP server configuration, and `.codex/AGENTS.md` guidance so Codex has a consistent audit playbook whenever it is launched from this directory.

## What This Project Does

Website Auditor helps Codex inspect and report on websites across three common review areas:

- SEO: metadata, headings, schema, crawlability, social metadata, links, and search visibility
- Web security: HTTPS, security headers, cookies, third-party scripts, exposed paths, and common client-side risks
- Accessibility: WCAG-oriented checks for alt text, forms, keyboard navigation, ARIA, landmarks, language, and color contrast

The project does not ship an application server or frontend. It is a Codex workspace that configures agents, skills, and tools for audit-oriented Codex sessions.

## Recommended Usage

Run Codex from the repository root with an explicit delegation instruction:

```bash
codex "Use the SEO Specialist, Web Security Analyst, and Accessibility Auditor agents whenever you need them."
```

That startup prompt gives Codex explicit permission to use the specialist agents during the session. After Codex starts, ask it to audit a site, for example:

```text
Evaluate the SEO, security, and accessibility of https://example.com.
```

For a narrower review, mention the area you care about:

```text
Evaluate the SEO for https://example.com.
```

```text
Check the security headers for https://example.com.
```

```text
Audit the accessibility of https://example.com against WCAG 2.2 AA.
```

## Agents

The project defines three custom agents in `.codex/agents/`.

### SEO Specialist

Handles SEO and search visibility work, including:

- Page titles and meta descriptions
- Canonical tags and robots directives
- Heading hierarchy
- Open Graph and Twitter Card metadata
- Schema markup
- Internal and external links
- Core Web Vitals indicators relevant to SEO

### Web Security Analyst

Handles non-intrusive website security review, including:

- HTTPS and TLS posture
- Security headers such as CSP, HSTS, X-Frame-Options, and X-Content-Type-Options
- Cookie security
- Third-party scripts
- Exposed sensitive paths
- XSS and CSRF mitigation guidance

### Accessibility Auditor

Handles accessibility and inclusive design review, including:

- WCAG 2.2 checks
- Alt text
- Keyboard navigation and focus behavior
- ARIA roles and landmarks
- Form labels
- Document language
- Color contrast

## Skills

The project includes three local skills in `.codex/skills/`.

### `web-crawler`

Renders a website and extracts SEO/content signals such as metadata, headings, links, canonical tags, robots directives, and social metadata.

### `vulnerability-check`

Performs non-intrusive checks for missing or weak security headers, cookie issues, third-party scripts, unsafe JavaScript patterns, and HTTPS usage.

### `wcag-auditor`

Audits DOM-level accessibility signals using WCAG-oriented categories such as perceivable, operable, understandable, and robust.

## Project Layout

```text
.
├── README.md
└── .codex/
    ├── AGENTS.md
    ├── config.toml
    ├── agents/
    │   ├── accessibility.toml
    │   ├── security.toml
    │   └── seo.toml
    └── skills/
        ├── vulnerability-check/
        ├── wcag-auditor/
        └── web-crawler/
```

## Configuration

`.codex/config.toml` enables multi-agent support and configures MCP servers used during website inspection:

- `browser`: Puppeteer MCP server for rendered page inspection
- `fetch`: Fetch MCP server for retrieving page content

The custom agents are project-scoped, so they are available when Codex is launched from this repository.

## Requirements

- Codex CLI
- Node.js and `npx`, used by the configured MCP servers
- Network access to the websites being audited

Some audits may be limited by authentication walls, bot protection, blocked network access, or sites that prevent automated browsing.

## Notes On Agent Triggering

Codex subagents require explicit delegation. The recommended launch command provides that delegation at the start of the session:

```bash
codex "Use the SEO Specialist, Web Security Analyst, and Accessibility Auditor agents whenever you need them."
```

If agents are not spawned, Codex should still apply the same SEO, security, and accessibility guidance in the main response.

## Contributing

Contributions are welcome. Useful improvements include:

- New audit skills
- More precise agent instructions
- Additional MCP tooling
- Sample audit prompts
- Documentation improvements

Keep changes focused and update `.codex/AGENTS.md` and this README when agent behavior, skills, setup, or recommended usage changes.
