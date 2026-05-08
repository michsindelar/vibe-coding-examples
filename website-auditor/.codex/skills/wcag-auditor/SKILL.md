---
name: wcag-auditor
description: Performs an accessibility audit based on WCAG 2.2 Level AA standards.
when_to_use:
  - When evaluating a website for inclusivity or ADA compliance.
  - When checking screen reader compatibility.
allowed-tools:
  - puppeteer_navigate
  - puppeteer_evaluate
---

# WCAG Auditor Skill

Audits the DOM for accessibility barriers based on the POUR principles (Perceivable, Operable, Understandable, Robust).

## Procedure
1. **Perceivable**:
   - Check all `<img>` tags for `alt` attributes.
   - Use `puppeteer_evaluate` to calculate color contrast ratios for text against background colors.
2. **Operable**:
   - Verify that interactive elements (`button`, `a`, `input`) are focusable.
   - Check for a logical "Skip to Content" link.
3. **Understandable**:
   - Check if the `<html>` tag has a `lang` attribute.
   - Ensure form inputs have associated `<label>` tags.
4. **Robust**:
   - Inspect the use of `aria-*` roles and landmarks (`nav`, `main`, `footer`).

## Output Format
Organize findings by WCAG Category. For every error found, provide the specific CSS selector and a suggested fix (e.g., "Add aria-label to the search button").
