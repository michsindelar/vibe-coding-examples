# Website Architect Agent Routing

Automatically delegate domain-specific website review requests to the matching subagent instead of answering directly.

- Use `seo-expert` for SEO, search visibility, indexing, crawlability, metadata, canonical URLs, structured data, sitemaps, robots.txt, rankings, search snippets, or Core Web Vitals as a search signal.
- Use `web-accessibility-expert` for accessibility, WCAG, screen readers, keyboard navigation, focus behavior, semantic HTML, ARIA, color contrast, forms, or inclusive design.
- Use `web-security-expert` for web security, application security, security headers, TLS, cookies, authentication, authorization, CORS, CSP, exposed secrets, dependency risk, or OWASP concerns.

When a prompt includes a live website URL and one of these domains, invoke the relevant subagent with the user's full request and ask it to perform the review. If a request clearly spans multiple domains, invoke each relevant subagent in parallel and synthesize their findings. Only handle the request directly when it is clearly outside these domains or when the user explicitly asks not to use subagents.
