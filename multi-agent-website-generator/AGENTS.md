# AGENTS.md

## Mission

Maintain SiteGen Agent, a TypeScript ESM CLI that generates AI-driven brand identity assets and a static corporate website from a business description.

This file is for AI coding agents. Keep it concise, current, and instruction-heavy.

## Source Map

- `src/main.ts`: CLI entrypoint. Loads `.env`, parses `--clean` and `--auto`, routes to chat or fixed supervisor.
- `src/agents/chatSupervisor.ts`: OpenAI Agents SDK chat supervisor and local tool wiring.
- `src/agents/workflow.ts`: source of truth for chat workflow operations, status, selection, rewinds, history, restore, and deterministic continuation.
- `src/agents/supervisor.ts`: fixed non-interactive workflow supervisor and checkpoint resume path.
- `src/agents/brandNamer.ts`: AI brand name generation.
- `src/agents/colorStrategist.ts`: AI palette generation, palette preview SVG writing, rejected palette cleanup.
- `src/agents/logoArchitect.ts`: AI SVG logo generation and palette/safety validation.
- `src/agents/typographicStylist.ts`: AI typography suggestions and local lockup SVG rendering.
- `src/agents/uxDesigner.ts`: AI website UX and copy plan generation.
- `src/agents/designBriefDesigner.ts`: local `dist/design/design-brief.json` writer.
- `src/agents/frontendEngineer.ts`: AI website bundle generation, WEBSITE.md-backed website specification loading, validation, one repair attempt, output writing, copied brand assets.
- `src/agents/types.ts`: shared domain types.
- `src/utils/`: shared CLI, filesystem, JSON, OpenAI, state, SVG, and chat-state helpers.

## Generated Files

- `dist/brand/`: palette previews, logo SVG options, typography lockup SVGs.
- `dist/design/design-brief.json`: generated design brief.
- `dist/web/`: generated static website.
- `dist/history/`: archived rewind/restore snapshots.
- `dist/sitegen-state.json`: workflow checkpoint state.
- `dist/sitegen-chat.json`: chat transcript state.

Treat `dist/` as generated output. Do not hand-edit it unless running a focused smoke test or inspecting generated results.

## Commands

- `npm install`: install dependencies.
- `npm start`: run the AI supervisor chat in an interactive terminal.
- `node src/main.ts --auto`: run the fixed supervisor from checkpoint state and choose option 1 at selection prompts.
- `npm run dev`: run with Node watch mode.
- `npm run check`: run Node syntax checking on `src/main.ts`.
- `npx tsc --noEmit`: run TypeScript type checking.
- `npm run clean`: remove `dist/`.

Full workflow runs require `OPENAI_API_KEY`. The CLI loads `.env` from the project root.

## Required Validation

Run these after TypeScript changes:

```bash
npm run check
npx tsc --noEmit
```

For generator, validation, or workflow-state changes, also run a focused smoke test when practical. Without `OPENAI_API_KEY`, AI-only stages must fail clearly.

## Coding Rules

- Use TypeScript ESM and explicit `.ts` imports.
- Use 2-space indentation.
- Use `camelCase` for functions and variables.
- Use `PascalCase` for exported types.
- Keep prompts and response validation in the owning agent module.
- Put shared helpers in `src/utils/`, not `src/agents/`.
- Preserve atomic checkpoint writes through `saveWorkflowState`.
- Do not introduce deterministic fallbacks for AI-only stages unless the product spec changes.
- Do not silently skip validation failures; fail clearly with actionable errors.
- Keep generated website CSS BEM-oriented, such as `site-header__nav` and `contact-form__input`.

## Workflow Constraints

- Business descriptions are set through the AI supervisor chat before the fixed workflow can run.
- Existing `dist/sitegen-state.json` resumes automatically; use `npm run clean` before a different project.
- Select palette before logo and typography generation.
- Palette generation must return exactly 3 options, each with exactly 3 valid 6-digit hex colors: primary, accent, ink.
- Palette previews must be written as `dist/brand/palette_*.svg`; rejected previews are deleted after selection.
- Logo generation must return exactly 3 safe standalone SVGs with `viewBox="0 0 320 320"`.
- Logo SVGs may use only the selected primary and accent colors. Do not allow scripts, external resources, embedded images, `foreignObject`, event handlers, non-local URL references, RGB/HSL colors, named colors, or extra hex colors.
- Typography generation must return exactly 3 valid suggestions using approved font stacks, weights 400-900, supported layouts, and only the selected primary or accent color.
- Rejected logo and typography files must be deleted after selection.
- UX plans must include valid copy, navigation, SEO metadata, and section ordering. Add `projects.html` only when real portfolio-style content is appropriate; otherwise use Home capabilities content.
- Design brief generation must write `dist/design/design-brief.json`.
- Frontend generation must be AI-only, validate the complete bundle, perform one repair attempt, clear `dist/web/`, then write the generated site.
- Every generated HTML page must visibly reference both copied assets: `assets/logo.svg` and `assets/brand-lockup.svg`.
- Generated website files must be local-only: no remote fonts, scripts, stylesheets, images, analytics, APIs, `fetch`, `XMLHttpRequest`, `sendBeacon`, or dynamic imports.

## Rewind And Restore Constraints

- Use `workflow.ts` as the source of truth for rewinds, restore, status, and deterministic continuation.
- A rewind must be planned before it is executed.
- Confirmed rewinds archive active state and generated artifacts under `dist/history/` before mutation.
- Restores must archive current state before replacing active artifacts.
- Keep `dist/sitegen-state.json` consistent with selected artifacts that still exist on disk.

## Documentation Protocol

Every new feature must update the Mermaid diagram in `README.md` when it changes command flow, architecture, workflow stages, generated outputs, or major artifact movement.

Every logic change that affects agent behavior, validation, workflow state, file layout, commands, generated output rules, or cleanup behavior must be reflected in this `AGENTS.md`.

If legacy docs such as `GOAL.md`, `PROJECT.md`, or `WEBSITE.md` are removed, keep their durable product and output requirements represented in `README.md` and this file.
