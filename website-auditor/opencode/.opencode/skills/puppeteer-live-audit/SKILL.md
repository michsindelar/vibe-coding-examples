---
name: puppeteer-live-audit
description: Use headless Puppeteer to collect rendered-page evidence from a live URL, including DOM metadata, accessibility tree summaries, console errors, network failures, cookies, storage keys, and viewport signals.
compatibility: opencode
metadata:
  workflow: headless-browser-url-audit
  install_scope: project-or-npx
---

## Purpose

Use this skill when a live website audit needs browser-rendered evidence that `curl`, `webfetch`, raw HTML, Lighthouse, Pa11y, or axe output cannot fully provide.

This skill is a second-tier workflow. Run lightweight CLI checks first unless the user specifically asks for rendered browser analysis.

## When To Use

Use Puppeteer when:

- The raw HTML is sparse, shell-like, or clearly client-rendered.
- The site is a single-page app or uses client-side routing.
- Metadata, canonical tags, headings, links, forms, or structured data may be injected after hydration.
- Console errors, page runtime errors, failed requests, third-party resources, browser-visible cookies, storage keys, or rendered accessibility information matter to the audit.
- The agent needs desktop versus mobile viewport evidence.

Do not use Puppeteer for simple header-only checks. Use `curl` for that.

## Safety Rules

- Run headless and read-only.
- Do not submit forms, log in, create accounts, purchase, upload files, delete data, change settings, or trigger state-changing workflows without explicit user approval.
- Do not click destructive controls or navigate beyond clearly related same-site pages unless authorized.
- Do not run active security scans, fuzzing, brute force, exploit attempts, or load tests.
- Redact secrets, session values, authorization tokens, private keys, full cookies, and personal data from reports.
- Treat anything in browser-accessible JavaScript, cookies readable by automation, localStorage, sessionStorage, or page globals as potentially public from a client-side security perspective.

## Preferred Command

Use the project-local script when available:

```bash
node .opencode/skills/puppeteer-live-audit/scripts/puppeteer-audit-url.mjs https://example.com
```

If the project has no local Puppeteer dependency yet, use an npm execution wrapper rather than a global install:

```bash
npx -y -p puppeteer node .opencode/skills/puppeteer-live-audit/scripts/puppeteer-audit-url.mjs https://example.com
```

If the environment already has project dependencies installed, use the local package manager convention for the project.

## Script Evidence

The script returns JSON evidence intended for expert analysis. Use it to inspect:

- Input URL, final URL, status, and viewport.
- Document response headers.
- Page title, language, meta tags, canonical link, alternate links, Open Graph, Twitter/X metadata, headings, links, images, forms, buttons, and JSON-LD.
- Console warnings/errors and uncaught page errors.
- Failed requests and resource counts by origin/type.
- Cookie summaries without full values.
- Local/session storage key names without values.
- Accessibility snapshot summary and top-level tree.
- Basic navigation timing.

Summarize evidence. Do not paste large raw JSON unless the user asks.

## SEO Interpretation

For SEO audits, compare raw/CLI evidence against rendered evidence. Look for:

- Important content missing from raw HTML but present after JavaScript.
- Canonical, robots, title, description, structured data, or links changed after hydration.
- Internal links that only exist after interaction or script execution.
- SPA routes that may be hard for crawlers to discover.
- Render-blocking or failed resources that affect content visibility.

## Security Interpretation

For security audits, keep the review passive. Look for:

- Console leaks, stack traces, source map references, public config objects, or exposed client-side keys.
- Third-party script and resource inventory.
- Failed or mixed-content-like request clues.
- Cookie attributes and browser-visible storage key names.
- Unexpected external origins contacted during initial page load.

Do not treat storage key names alone as proof of exposure. Report evidence and recommend deeper review when needed.

## Accessibility Interpretation

For accessibility audits, use the rendered DOM and accessibility snapshot to look for:

- Missing or weak accessible names.
- Incorrect roles or non-semantic interactive elements.
- Headings, landmarks, form labels, image alternatives, button/link names, and hidden content exposure.
- Dynamic UI that requires manual keyboard and screen reader validation.

Automated and snapshot-based checks cannot prove full WCAG conformance. Clearly separate verified issues from manual checks.

## Failure Handling

If Puppeteer fails because Chromium is missing, sandboxing is blocked, the site blocks automation, the network times out, or npm cannot download packages:

- State the specific limitation.
- Continue with `curl`, `webfetch`, Lighthouse, Pa11y, axe, or raw HTML checks where possible.
- Recommend installing local dependencies or using the MCP/browser workflow only if the added rendered evidence is necessary.
