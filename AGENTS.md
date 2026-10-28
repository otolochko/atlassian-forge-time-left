# AGENTS.md

This file provides guidance to coding agents (Claude Code, etc.) when working with code in this repository.

<!-- standards:start -->
## Shared standards

These rules apply to every Forge app we build. The source is `STANDARDS.md` in `../it-operations-forge-template`, and `scripts/sync.sh` copies it here: edit it there, not here. The app-specific sections of this file add to these rules and win when they conflict.

### Workflow

- After cloning, run `npm run setup` once: it installs dependencies and enables the pre-commit hook. `npm run check` must pass before every commit. The hook runs `npm run check:fast`, CI runs `npm run check` on every push.
- Never run `forge deploy`, `forge install`, `forge uninstall`, `forge register`, `forge variables set` or any other environment change yourself: print the exact commands and let the user run them. `forge lint` needs a login, so the user runs it before a deploy.
- `forge deploy` does not build the UI: build first. The user hard refreshes Jira after a deploy.
- Commit or push only when the user asks. User-visible changes go under `## Unreleased` in `CHANGELOG.md`.
- Shared files (see the template README) change in the template first, then `scripts/sync.sh` copies them into each app.

### Privacy and security

- Frontend only by default: no resolvers, no `@forge/api`, no `asApp()`, no Forge storage, KVS or SQL, no triggers, unless this app's own sections say otherwise. If a call fails as the user, do not switch to `asApp()`.
- No external egress (`permissions.external`), no remote CDNs, fonts or scripts, no analytics or telemetry.
- Never log, store or write to a file tokens (for example `mediaJwtToken`), user `emailAddress` or other personal data. No `console` calls in UI code.
- No `delete:*` scopes and no delete calls unless this app's own sections allow them. Ask for the fewest scopes that work.
- `manifest.yml` is gitignored because it holds the app id. The committed copy is `manifest.yml.example` with `REPLACE_ME`: mirror every other manifest change there. Never commit `.env`; `.env.example` lists the variables.

### Dependencies

- Runtime dependencies: React, `react-dom`, `@forge/bridge`, `@atlaskit/tokens` and `fflate`; apps with resolvers add the `@forge/*` packages they need. Dev tooling: Vite, `@vitejs/plugin-react`, ESLint 9 (pinned major), Vitest. Ask before adding anything else. No UI component libraries in new apps.
- Use the Node version from `.nvmrc`.

### Code, docs and UI copy

- English for code, comments, docs and commit messages. Reply to the user in Ukrainian.
- Never use the em dash character anywhere: the check fails on it.
- Sentence case in the UI. The display name lives in one place in code (`src/appInfo.js` in new apps) and in the manifest.
- UI follows `../it-operations-forge-template/DESIGN.md`: read it before UI work and finish with its checklist (section 16). Plain HTML components and `var(--ds-...)` tokens with fallbacks, no hard-coded colors.

### Quality gate

- `npm run check` runs the rules in `scripts/check-rules.mjs`, lint, tests, the build and the bundle size check.
- Never disable a rule, skip a test or raise a limit just to get a green check: fix the cause or tell the user.
<!-- standards:end -->

## What this is

An Atlassian Forge **Custom UI** app (React + Vite) that shows an SLA-like countdown to a Jira date field in the issue view sidebar, plus a per-project settings page. `README.md` has the architecture decisions and the manual test plan. Optional local specifications in `.claude/prompt.md` are git-ignored and are not required to work with the repository.

## Commands

Use **Node 24** (`.nvmrc`) for the Forge CLI and jsdom component tests. With nvm, run `nvm install` and `nvm use` from the repository root before running the commands below.

```bash
npm run setup                                   # once after cloning: npm ci in static/app and enable the pre-commit hook
npm run check                                   # full gate: rules, lint, tests, build, bundle size
npm run check:fast                              # rules and lint (the pre-commit hook)
npm run lint                                    # ESLint for static/app
npm test                                        # vitest run (same as npm --prefix static/app test)
npm --prefix static/app exec vitest run src/lib/clock.test.js   # one file
npm --prefix static/app exec vitest run -t "breached"           # one test by name
npm run build                                   # vite build -> static/app/build
npm run deploy                                  # build, then forge deploy (the user runs it)
```

`manifest.yml` is **git-ignored** (it holds the app-specific `app.id`). The tracked template is `manifest.yml.example` (with `REPLACE_ME`); a fresh checkout needs `cp manifest.yml.example manifest.yml` and then `forge register`. **Whenever you change `manifest.yml` (modules, scopes, permissions, resources), make the same change in `manifest.yml.example`.** The example must never contain a real `app.id` or any other app/site-specific identifier.

`forge login` and `forge register` are interactive; the user runs them. Full command list: `.claude/deploy-guide.md`.

## Architecture

- **No backend, by decision.** No `function` modules, resolvers, Forge storage, triggers or external fetches. All Jira access is `requestJira` from `@forge/bridge`, as the current user. If something seems to need a backend, stop and ask.
- **One static resource, two modules.** `manifest.yml` points both `jira:issueContext` (countdown panel) and `jira:projectSettingsPage` at `static/app/build`. `src/main.jsx` routes on `context.moduleKey` (`time-left-panel` / `time-left-settings`).
- **Config = Jira project property** `time-left-config` (`lib/config.js`). It is validated on every read and on write; invalid or missing means "not configured". Jira enforces who can write it (403 shows a friendly message), and the settings page itself is only shown to Jira administrators (`hasGlobalPermission: ADMINISTER` in the manifest), so enabling the app per project is meant to be an admin decision. Default is off everywhere. This is a UI restriction only: project admins can still write the project property via REST, so don't describe it as enforced. The manifest's `entityPropertyEqualTo` display condition reads `enabled` from the same property, so renaming that key or changing `enabled` away from a boolean breaks panel visibility.
- **`lib/clock.js` is the pure core** (no I/O, epoch ms): `parseJiraDate`, `resolveDateField`, `buildStatusTimeline`, `pausedWithin`, `computeClock`. Pauses extend the effective deadline; breached wins over paused; completion stops the clock at `resolutiondate`. UI code (`panel/DeadlinePanel.jsx`) only fetches, calls these, and renders.
- **Panel data flow:** read config → issue (`expand=names`) → changelog only if `pauseStatusIds` is non-empty → compute. It refetches on the `JIRA_ISSUE_CHANGED` bridge event. `useTicker` ticks every 1s when under a day remains, otherwise every 30s, and stops while the tab is hidden.
- **Field type is inferred from the value** (`YYYY-MM-DD` means date-only, end of day in the user's timezone from the context) so the panel doesn't need an extra `/field` call.

## Gotchas

- `@forge/bridge` throws on import outside Jira. Tests that import `jira.js` or `config.js` must `vi.mock('@forge/bridge', ...)` and inject a `transport` argument (see `config.test.js`).
- Jira timestamps look like `+0200` (no colon); always parse with `parseJiraDate`.
- UI uses Atlaskit components (lozenge, button, select, checkbox, toggle, textfield, section-message) plus plain CSS with design tokens (`App.css`). Atlaskit injects `<style>` tags, hence `permissions.content.styles: ['unsafe-inline']` in the manifest. Its bundle also contains a Statsig feature-gate client (via `@atlaskit/platform-feature-flags`); the app never initializes it, and `ProjectSettings.test.jsx` guards that rendering makes no network requests. Keep it that way (no external egress). jsdom tests need the `matchMedia` stub in `src/test-setup.js`.
- Scopes are `read:jira-work` and `manage:jira-project`. Saving the project property (`PUT /project/{id}/properties/{key}`) needs `manage:jira-project`; without it Jira answers 401. Adding a scope needs `forge deploy` and then `forge install --upgrade`.
- Consent for non-owner users only works in the `production` Forge environment.

## App-specific rules

- No backend, by decision (see Architecture): the frontend-only default of the shared standards applies unchanged.
- `config.maxBundleKb` is 1100 in `package.json` because the Atlaskit components bundle about 1.1 MB of JS (the main chunk alone is about 840 kB). It should come down, not go up.
