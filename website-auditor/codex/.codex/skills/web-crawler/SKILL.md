---
name: web-crawler
description: Navigates to a URL, renders JavaScript, and extracts structured page data for SEO and content analysis.
when_to_use:
  - When an agent needs to "see" a live website.
  - When performing a technical SEO audit.
allowed-tools:
  - puppeteer_navigate
  - puppeteer_evaluate
  - puppeteer_screenshot
---

# Web Crawler Skill

This skill allows agents to retrieve a fully rendered version of a webpage.

## Procedure
1. **Navigate**: Use `puppeteer_navigate` with the target URL.
2. **Extract Metadata**: Execute `puppeteer_evaluate` to run a script that collects:
   - `<title>` and `<meta name="description">`.
   - All `<h1>` through `<h6>` tags in order.
   - Canonical link tags and `robots` meta tags.
   - Open Graph (`og:`) and Twitter Card data.
3. **Analyze Links**: Collect all `<a>` tags and identify if they are internal or external.
4. **Visual Check**: Take a screenshot using `puppeteer_screenshot` to verify if the page layout is "mobile-friendly."

## Output Format
Return a JSON-like summary containing the Metadata, Heading Hierarchy, and a list of identified SEO red flags (e.g., multiple H1s).
