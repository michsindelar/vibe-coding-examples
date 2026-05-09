#!/usr/bin/env node

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT = 45000;
const DESKTOP_VIEWPORT = { width: 1366, height: 768, isMobile: false };
const MOBILE_VIEWPORT = {
  width: 390,
  height: 844,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
};

function parseArgs(argv) {
  const options = {
    url: null,
    mobile: false,
    timeout: DEFAULT_TIMEOUT,
    includeHtml: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--mobile") {
      options.mobile = true;
      continue;
    }

    if (arg === "--include-html") {
      options.includeHtml = true;
      continue;
    }

    if (arg === "--timeout") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--timeout must be a positive number of milliseconds");
      }
      options.timeout = value;
      index += 1;
      continue;
    }

    if (!options.url) {
      options.url = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!options.url) {
    throw new Error("Usage: node .opencode/skills/puppeteer-live-audit/scripts/puppeteer-audit-url.mjs <url> [--mobile] [--timeout ms] [--include-html]");
  }

  const parsedUrl = new URL(options.url);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }

  options.url = parsedUrl.toString();
  return options;
}

function limitArray(items, limit = 50) {
  return items.slice(0, limit);
}

function sanitizeHeaderMap(headers = {}) {
  const redacted = new Set(["authorization", "cookie", "set-cookie", "proxy-authorization"]);
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, redacted.has(key.toLowerCase()) ? "[redacted]" : value]),
  );
}

function summarizeCookies(cookies) {
  return cookies.map((cookie) => ({
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    session: cookie.session,
    expires: cookie.expires,
  }));
}

function flattenAccessibilitySnapshot(node, depth = 0, result = []) {
  if (!node || result.length >= 80) return result;

  result.push({
    role: node.role,
    name: node.name || "",
    value: node.value || undefined,
    level: node.level || undefined,
    depth,
  });

  for (const child of node.children || []) {
    flattenAccessibilitySnapshot(child, depth + 1, result);
    if (result.length >= 80) break;
  }

  return result;
}

function summarizeRequests(requests) {
  const byOrigin = {};
  const byType = {};

  for (const request of requests) {
    byOrigin[request.origin] = (byOrigin[request.origin] || 0) + 1;
    byType[request.resourceType] = (byType[request.resourceType] || 0) + 1;
  }

  return { byOrigin, byType };
}

async function importPuppeteer() {
  try {
    return await import("puppeteer");
  } catch (error) {
    const require = createRequire(import.meta.url);
    const pathEntries = (process.env.PATH || "").split(path.delimiter);
    const searchPaths = [];

    for (const entry of pathEntries) {
      if (!entry.endsWith(`${path.sep}node_modules${path.sep}.bin`)) continue;

      const nodeModules = path.dirname(entry);
      searchPaths.push(nodeModules, path.dirname(nodeModules));
    }

    for (const searchPath of searchPaths) {
      try {
        const resolved = require.resolve("puppeteer", { paths: [searchPath] });
        return await import(pathToFileURL(resolved).href);
      } catch {
        // Try the next npx/local package path.
      }
    }

    throw new Error(
      "Unable to import puppeteer. Run with `npx -y -p puppeteer node .opencode/skills/puppeteer-live-audit/scripts/puppeteer-audit-url.mjs <url>` or run `npm install` first.",
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const puppeteerModule = await importPuppeteer();
  const puppeteer = puppeteerModule.default || puppeteerModule;
  const viewport = options.mobile ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
  const startedAt = new Date().toISOString();

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.setDefaultTimeout(options.timeout);
  await page.setDefaultNavigationTimeout(options.timeout);

  const consoleMessages = [];
  const pageErrors = [];
  const requests = [];
  const failedRequests = [];
  const responses = [];
  let documentResponse = null;

  page.on("console", (message) => {
    const type = message.type();
    if (["error", "warning", "warn"].includes(type)) {
      consoleMessages.push({ type, text: message.text().slice(0, 1000) });
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push({ message: error.message.slice(0, 1000), stack: error.stack?.slice(0, 2000) });
  });

  page.on("request", (request) => {
    const requestUrl = request.url();
    let origin = "invalid-url";
    try {
      origin = new URL(requestUrl).origin;
    } catch {
      // Leave invalid URLs grouped together.
    }

    requests.push({
      url: requestUrl,
      method: request.method(),
      resourceType: request.resourceType(),
      origin,
    });
  });

  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText || "unknown",
    });
  });

  page.on("response", (response) => {
    const request = response.request();
    const item = {
      url: response.url(),
      status: response.status(),
      resourceType: request.resourceType(),
    };

    responses.push(item);

    if (!documentResponse && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentResponse = response;
    }
  });

  try {
    documentResponse = await page.goto(options.url, {
      waitUntil: "networkidle2",
      timeout: options.timeout,
    });

    const rendered = await page.evaluate(() => {
      const attr = (element, name) => element?.getAttribute(name) || "";
      const text = (element) => (element.textContent || "").replace(/\s+/g, " ").trim();
      const selectorAll = (selector) => Array.from(document.querySelectorAll(selector));
      const linkType = (href) => {
        try {
          return new URL(href, document.baseURI).origin === location.origin ? "internal" : "external";
        } catch {
          return "invalid";
        }
      };

      return {
        title: document.title,
        lang: document.documentElement.lang || "",
        meta: selectorAll("meta").map((element) => ({
          name: attr(element, "name"),
          property: attr(element, "property"),
          httpEquiv: attr(element, "http-equiv"),
          content: attr(element, "content").slice(0, 1000),
        })),
        canonical: attr(document.querySelector('link[rel="canonical"]'), "href"),
        alternates: selectorAll('link[rel="alternate"]').map((element) => ({
          href: attr(element, "href"),
          hreflang: attr(element, "hreflang"),
          type: attr(element, "type"),
        })),
        headings: selectorAll("h1,h2,h3,h4,h5,h6").map((element) => ({
          level: Number(element.tagName.slice(1)),
          text: text(element).slice(0, 300),
        })),
        links: selectorAll("a[href]").map((element) => ({
          href: attr(element, "href"),
          text: text(element).slice(0, 300),
          type: linkType(attr(element, "href")),
          ariaLabel: attr(element, "aria-label"),
        })),
        images: selectorAll("img").map((element) => ({
          src: attr(element, "src"),
          alt: attr(element, "alt"),
          width: attr(element, "width"),
          height: attr(element, "height"),
          loading: attr(element, "loading"),
        })),
        forms: selectorAll("form").map((form) => ({
          action: attr(form, "action"),
          method: attr(form, "method") || "get",
          controls: Array.from(form.querySelectorAll("input,select,textarea,button")).map((control) => {
            const id = attr(control, "id");
            const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
            return {
              tag: control.tagName.toLowerCase(),
              type: attr(control, "type"),
              name: attr(control, "name"),
              id,
              ariaLabel: attr(control, "aria-label"),
              label: label ? text(label).slice(0, 300) : "",
              placeholder: attr(control, "placeholder"),
              required: control.hasAttribute("required"),
            };
          }),
        })),
        buttons: selectorAll("button,[role='button']").map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: text(element).slice(0, 300),
          ariaLabel: attr(element, "aria-label"),
          role: attr(element, "role"),
          disabled: element.hasAttribute("disabled") || attr(element, "aria-disabled") === "true",
        })),
        scripts: selectorAll("script[src]").map((element) => {
          const src = attr(element, "src");
          let origin = "invalid-url";
          try {
            origin = new URL(src, document.baseURI).origin;
          } catch {
            // Leave invalid URLs grouped together.
          }
          return { src, origin, async: element.async, defer: element.defer };
        }),
        jsonLd: selectorAll('script[type="application/ld+json"]').map((element) => text(element).slice(0, 5000)),
        storageKeys: {
          localStorage: Object.keys(window.localStorage || {}),
          sessionStorage: Object.keys(window.sessionStorage || {}),
        },
        bodyTextSample: text(document.body).slice(0, 3000),
        htmlLength: document.documentElement.outerHTML.length,
        bodyTextLength: text(document.body).length,
        performance: performance.getEntriesByType("navigation").map((entry) => ({
          type: entry.type,
          domContentLoadedEventEnd: Math.round(entry.domContentLoadedEventEnd),
          loadEventEnd: Math.round(entry.loadEventEnd),
          responseStart: Math.round(entry.responseStart),
          responseEnd: Math.round(entry.responseEnd),
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
          decodedBodySize: entry.decodedBodySize,
        }))[0] || null,
      };
    });

    const accessibilitySnapshot = await page.accessibility.snapshot({ interestingOnly: true });
    const cookies = await page.cookies();
    const html = options.includeHtml ? await page.content() : undefined;
    const finalUrl = page.url();
    const documentHeaders = documentResponse ? sanitizeHeaderMap(documentResponse.headers()) : {};
    const output = {
      inputUrl: options.url,
      finalUrl,
      startedAt,
      completedAt: new Date().toISOString(),
      status: documentResponse?.status() || null,
      ok: documentResponse?.ok() || false,
      viewport,
      documentHeaders,
      rendered: {
        ...rendered,
        meta: limitArray(rendered.meta, 80),
        alternates: limitArray(rendered.alternates, 40),
        headings: limitArray(rendered.headings, 80),
        links: limitArray(rendered.links, 120),
        images: limitArray(rendered.images, 120),
        forms: limitArray(rendered.forms, 20),
        buttons: limitArray(rendered.buttons, 80),
        scripts: limitArray(rendered.scripts, 80),
        jsonLd: limitArray(rendered.jsonLd, 20),
      },
      consoleMessages: limitArray(consoleMessages, 80),
      pageErrors: limitArray(pageErrors, 40),
      failedRequests: limitArray(failedRequests, 80),
      requestSummary: summarizeRequests(requests),
      responseSummary: {
        total: responses.length,
        statuses: responses.reduce((accumulator, response) => {
          accumulator[response.status] = (accumulator[response.status] || 0) + 1;
          return accumulator;
        }, {}),
      },
      cookies: summarizeCookies(cookies),
      accessibility: {
        rootRole: accessibilitySnapshot?.role || null,
        rootName: accessibilitySnapshot?.name || "",
        flattened: flattenAccessibilitySnapshot(accessibilitySnapshot),
      },
      html: html ? html.slice(0, 100000) : undefined,
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
});
