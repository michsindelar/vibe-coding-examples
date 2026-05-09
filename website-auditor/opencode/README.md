# Website Auditor OpenCode Agents

An OpenCode project configuration for auditing websites with specialist agents for SEO, web security, and accessibility.

This repository is intended to be used as a public, reusable starter for running focused website reviews in OpenCode. It provides project-scoped subagents, local skills, MCP server configuration, and routing guidance so OpenCode has a consistent audit playbook whenever it is launched from this directory.

The agents in this project were tested using OpenAI's GPT-5.5 model.

## What This Project Does

Website Auditor helps OpenCode inspect and report on websites across three common review areas:

- SEO: metadata, headings, schema, crawlability, canonical URLs, sitemaps, robots directives, links, and search visibility
- Web security: HTTPS, TLS observations, security headers, cookies, CSP, CORS, third-party scripts, exposed client-side data, and common browser security risks
- Accessibility: WCAG-oriented checks for semantic HTML, keyboard access, focus behavior, ARIA, forms, landmarks, language, images, color contrast, and assistive technology risks

The project does not ship an application server or frontend. It is an OpenCode workspace that configures agents, skills, and tools for audit-oriented OpenCode sessions.

## Recommended Usage

Launch OpenCode from the repository root, then ask for a website review. The project instructions automatically route domain-specific requests to the matching expert subagent.

For a broad review:

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

The project defines three read-only subagents in `.opencode/agents/`.

### `seo-expert`

Handles SEO and search visibility work, including:

- Page titles and meta descriptions
- Canonical tags and robots directives
- Heading hierarchy and visible content structure
- Open Graph and Twitter/X metadata
- Schema.org structured data and JSON-LD
- Internal links, crawlable navigation, robots.txt, and sitemaps
- JavaScript SEO and rendered versus raw HTML risks
- Core Web Vitals and performance indicators relevant to search visibility

### `web-security-expert`

Handles passive, non-intrusive website security review, including:

- HTTPS enforcement, redirect behavior, and TLS observations
- Security headers such as CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy
- Cookie attributes such as Secure, HttpOnly, SameSite, Domain, Path, and expiration
- Cache-control risks and verbose error exposure
- Third-party scripts and browser-visible supply-chain exposure
- CORS, CSP, mixed-content clues, source maps, and exposed client-side configuration

### `web-accessibility-expert`

Handles accessibility and inclusive design review, including:

- WCAG 2.2-oriented checks
- Semantic HTML, landmarks, headings, lists, tables, links, and buttons
- Keyboard access, focus order, visible focus, and skip links
- ARIA roles, states, properties, and anti-patterns
- Form labels, descriptions, validation, and error recovery
- Image alternatives and accessible names
- Color contrast, zoom, reflow, target size, and mobile accessibility risks

## Skills

The project includes two local skills in `.opencode/skills/`.

### `live-website-cli-audit`

A CLI-first workflow for evaluating live website URLs with safe, read-only checks. It guides agents through URL normalization, redirects, headers, raw HTML, robots.txt, sitemaps, metadata, structured data, security headers, cookie attributes, and accessibility checks.

The skill prefers built-in tools and temporary `npx` usage rather than global installs. Useful tools include `curl`, `openssl`, `lighthouse`, `pa11y`, and `@axe-core/cli`.

### `puppeteer-live-audit`

A headless-browser workflow for collecting rendered-page evidence when raw HTML or lightweight CLI checks are not enough.

It is useful for JavaScript-rendered sites, client-side routing, hydrated metadata, runtime console errors, failed requests, third-party origins, browser-visible cookies, storage keys, accessibility snapshots, and desktop/mobile viewport checks.

The included script is located at:

```text
.opencode/skills/puppeteer-live-audit/scripts/puppeteer-audit-url.mjs
```

## Project Layout

```text
.
├── README.md
└── .opencode/
    ├── instructions.md
    ├── opencode.jsonc
    ├── agents/
    │   ├── seo-expert.md
    │   ├── web-accessibility-expert.md
    │   └── web-security-expert.md
    └── skills/
        ├── live-website-cli-audit/
        │   └── SKILL.md
        └── puppeteer-live-audit/
            ├── SKILL.md
            └── scripts/
                └── puppeteer-audit-url.mjs
```

## Configuration

`.opencode/opencode.jsonc` loads the shared instructions and configures the Puppeteer MCP server used for browser-based website inspection:

- `instructions`: loads `.opencode/instructions.md`
- `puppeteer`: local MCP server launched with `npx -y @modelcontextprotocol/server-puppeteer`

The shared instructions route website review requests to the right subagent automatically:

- SEO-related requests go to `seo-expert`.
- Accessibility-related requests go to `web-accessibility-expert`.
- Security-related requests go to `web-security-expert`.
- Requests spanning multiple domains should use the relevant agents in parallel and synthesize the findings.

## Requirements

- OpenCode with support for project-scoped agents, skills, and MCP configuration
- Node.js and `npx`, used by optional audit tools and the Puppeteer MCP server
- Network access to the websites being audited

Some audits may be limited by authentication walls, bot protection, blocked network access, missing local browser dependencies, or sites that prevent automated browsing.

## Safety Boundaries

The agents and skills are designed for passive, non-destructive inspection by default.

They should not submit forms, create accounts, log in, purchase, upload files, delete data, change settings, trigger admin actions, run brute-force attempts, fuzz endpoints, execute exploits, perform load tests, or run aggressive scanners unless the user explicitly authorizes that scope.

Reports should redact secrets, tokens, cookies, authorization headers, private keys, and personal data.

## Notes On Audit Limits

- Automated SEO, accessibility, and security tools are incomplete; final findings should be based on evidence and expert interpretation.
- Passive security review is not a substitute for an authorized penetration test.
- Accessibility automation does not prove WCAG conformance; manual keyboard, screen reader, zoom, and real-device testing may still be required.
- SEO audits cannot claim rankings, impressions, clicks, indexing status, crawl frequency, or traffic impact without analytics, Search Console, logs, or equivalent evidence.

## Contributing

Contributions are welcome. Useful improvements include:

- New audit skills
- More precise agent instructions
- Additional MCP tooling
- Sample audit prompts
- Documentation improvements

Keep changes focused and update `.opencode/instructions.md` and this README when agent behavior, skills, configuration, or recommended usage changes.
